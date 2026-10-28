import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chantier } from './integration-essai.js';

// grillhouse-kgx.2 — the integration regenerates the references on main of the moment
// (scripts/integration/integrer.mjs), as a genrule of Bazel writes its output again on the merged
// tree and package-lock.json is written again by npm install after a merge: a file a reference
// writes in full is no part of the lot it applies, and its reference, received from the circuit
// (`--references`), writes it again in the integration copy before the verification.
// Witness: BPScript bp-mono-vbwf.320.30, refused twice at 5.1, code 17: the only conflict was on
// docs/agents/index-des-interfaces.md, which 320.26 had regenerated on main in the meantime; the
// six other files of the lot applied.
// The trial harness: ./integration-essai.ts.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'integrer-references-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 60_000;

// The generator of the trial: one line, the three sources joined, so that two tickets that each
// change a source change the same line of its output.
const GENERATEUR = `import fs from 'node:fs';
const l = ['a', 'b', 'c'].map(c => fs.readFileSync('src/' + c + '/index.ts', 'utf8').trim());
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/index.md', l.join(' | ') + '\\n');
`;
const index = (a: number, b: number, c: number) =>
  `export const a = ${a}; | export const b = ${b}; | export const c = ${c};\n`;
// The suites of the trial, which keep what the verification reads of the generated file.
const SUITES_QUI_LISENT = `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.vu', fs.readFileSync('docs/index.md', 'utf8'));
process.exit(0);
`;
const NOM = "l'index de l'essai";

// The trial project with its generated file on main, and the references the circuit hands over.
function projet(commande = 'node gen.mjs') {
  const m = chantier(ESSAIS);
  m.poser(
    { 'gen.mjs': GENERATEUR, 'docs/index.md': index(0, 0, 0), 'suites.mjs': SUITES_QUI_LISENT },
    'le générateur'
  );
  const references = path.join(m.bin, 'references.json');
  writeFileSync(
    references,
    JSON.stringify([
      { nom: NOM, commande, fichiers: ['docs/index.md'], entiers: ['docs/index.md'], cadre: false },
    ])
  );
  const vu = () => {
    try {
      return readFileSync(`${m.repo}.vu`, 'utf8');
    } catch {
      return '';
    }
  };
  return { m, references, vu };
}

describe('grillhouse-kgx.2 — the integration regenerates the references on main of the moment', () => {
  it(
    'critère 1 et 2 — a lot whose only conflict is on a file a reference writes in full is integrated, the file regenerated on main of the moment before the verification, and committed',
    () => {
      const { m, references, vu } = projet();
      m.ticket('demo-1', {
        'src/a/index.ts': 'export const a = 1;\n',
        'docs/index.md': index(1, 0, 0),
      });
      // Another ticket regenerated the same line on main in the meantime.
      m.poser(
        { 'src/c/index.ts': 'export const c = 9;\n', 'docs/index.md': index(0, 0, 9) },
        'un autre ticket'
      );
      const r = m.integrer('demo-1', '--references', references);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain(NOM);
      expect(m.git('show', 'agent/demo-1:docs/index.md')).toBe(index(1, 0, 9));
      expect(m.git('show', 'agent/demo-1:src/a/index.ts')).toBe('export const a = 1;\n');
      // The verification read the regenerated file.
      expect(vu()).toBe(index(1, 0, 9));
      expect(m.sujets('main')).toEqual(['un autre ticket', 'le générateur', 'base']);
    },
    LONG
  );

  it(
    'critère 1 — the file a reference writes in full is not taken from the lot: what the reference writes enters the commit',
    () => {
      const { m, references } = projet();
      m.ticket('demo-1', {
        'src/a/index.ts': 'export const a = 1;\n',
        'docs/index.md': 'écrit à la main\n',
      });
      const r = m.integrer('demo-1', '--references', references);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.git('show', 'agent/demo-1:docs/index.md')).toBe(index(1, 0, 0));
    },
    LONG
  );

  it(
    'critère 3 — a conflict on any other file refuses the lot, as before',
    () => {
      const { m, references, vu } = projet();
      m.ticket('demo-1', {
        'src/a/index.ts': 'export const a = 1;\n',
        'docs/index.md': index(1, 0, 0),
      });
      m.poser(
        { 'src/a/index.ts': 'export const a = 7;\n', 'docs/index.md': index(7, 0, 0) },
        'un autre ticket'
      );
      const r = m.integrer('demo-1', '--references', references);
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/ne s'applique pas/);
      expect(r.stdout).toContain('src/a/index.ts');
      expect(m.sujets('agent/demo-1')).toEqual(['le générateur', 'base']);
      expect(m.bd('demo-1').labels).not.toContain('en-file');
      expect(vu()).toBe('');
    },
    LONG
  );

  it(
    'a command of a reference that fails refuses the lot, naming the reference, before the verification',
    () => {
      const { m, references, vu } = projet('node -e "process.exit(3)"');
      m.ticket('demo-1', {
        'src/a/index.ts': 'export const a = 1;\n',
        'docs/index.md': index(1, 0, 0),
      });
      const r = m.integrer('demo-1', '--references', references);
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain(NOM);
      expect(m.sujets('agent/demo-1')).toEqual(['le générateur', 'base']);
      expect(vu()).toBe('');
    },
    LONG
  );
});
