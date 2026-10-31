import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chantier } from './integration-essai.js';

// grillhouse-8o9 — the generated files a project declares (`grillhouse.engendres` of its
// package.json, scripts/engendres.mjs) are written again at the integration, not merged: the
// integration (scripts/integration/integrer.mjs) and the queue (scripts/integration/file.mjs) take
// main's version, then play the declared command on the lot applied, and what it writes enters the
// commit, as npm install writes package-lock.json again after a merge. Witness: OSC Bridge,
// 2026-10-31, four conflicts in one day on docs/SUPPORTED_DEVICES.md, docs/devices.json (synthhub)
// and schemas/SHA256SUMS (open-synth-descriptors), each settled by hand.
// The trial harness: ./integration-essai.ts.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'integrer-engendres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 90_000;

// The command of the trial: a script that lists the folder src.
const LISTE = `import fs from 'node:fs';
fs.writeFileSync('docs/liste.txt', fs.readdirSync('src').sort().join('\\n') + '\\n');
`;
const liste = (...dossiers: string[]) => `${dossiers.join('\n')}\n`;

// The trial project, its generated file declared with <commande>, on main.
function projet(commande = 'node liste.mjs') {
  const m = chantier(ESSAIS, {
    grillhouse: {
      engendres: {
        'la liste des sources': { commande, fichiers: ['docs/liste.txt'], lit: ['src/**'] },
      },
    },
  });
  m.poser({ 'liste.mjs': LISTE, 'docs/liste.txt': liste('a', 'b', 'c') }, 'la liste');
  return m;
}

// Two tickets made side by side from the same main, each adding a source and its list.
function deuxTickets(m: ReturnType<typeof projet>) {
  m.ticket('demo-1', {
    'src/d/index.ts': 'export const d = 0;\n',
    'docs/liste.txt': liste('a', 'b', 'c', 'd'),
  });
  m.ticket('demo-2', {
    'src/e/index.ts': 'export const e = 0;\n',
    'docs/liste.txt': liste('a', 'b', 'c', 'e'),
  });
}

describe('grillhouse-8o9 — the declared generated files are written again at the integration', () => {
  it(
    'critère 2 — two lots that each add a source in parallel both enter, the final list holding both',
    () => {
      const m = projet();
      deuxTickets(m);
      m.livrer('demo-1');
      expect(m.file().status).toBe(0);
      const r = m.integrer('demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain('la liste des sources');
      expect(m.file().status).toBe(0);
      expect(m.git('show', 'main:docs/liste.txt')).toBe(liste('a', 'b', 'c', 'd', 'e'));
      expect(m.git('show', 'main:src/d/index.ts')).toBe('export const d = 0;\n');
      expect(m.git('show', 'main:src/e/index.ts')).toBe('export const e = 0;\n');
      expect(m.bd('demo-2').status).toBe('closed');
    },
    LONG
  );

  it(
    'critère 2 — the queue that replaces a branch on a main that moved writes the list again instead of a conflict',
    () => {
      const m = projet();
      deuxTickets(m);
      // Both integrated before the queue runs: demo-2 is built on a main without demo-1.
      m.livrer('demo-1');
      m.livrer('demo-2');
      expect(m.file().status).toBe(0);
      expect(m.bd('demo-1').status).toBe('closed');
      expect(m.bd('demo-2').status, JSON.stringify(m.bd('demo-2').comments)).toBe('closed');
      expect(m.git('show', 'main:docs/liste.txt')).toBe(liste('a', 'b', 'c', 'd', 'e'));
      expect(m.sujets('main').slice(0, 2)).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)']);
    },
    LONG
  );

  it(
    'critère 2 — a lot that touches only what the file reads writes it again on the lot applied',
    () => {
      const m = projet();
      m.ticket('demo-1', { 'src/d/index.ts': 'export const d = 0;\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.git('show', 'agent/demo-1:docs/liste.txt')).toBe(liste('a', 'b', 'c', 'd'));
    },
    LONG
  );

  it(
    'critère 3 — a command that fails stops the integration, the command and its output named',
    () => {
      const commande = 'echo "la source d est illisible" >&2; exit 3';
      const m = projet(commande);
      m.ticket('demo-1', {
        'src/d/index.ts': 'export const d = 0;\n',
        'docs/liste.txt': liste('a', 'b', 'c', 'd'),
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain(commande);
      expect(r.stdout).toContain('la source d est illisible');
      expect(r.stdout).toContain('la liste des sources');
      expect(m.bd('demo-1').labels).not.toContain('en-file');
      expect(m.suites()).toBe('');
    },
    LONG
  );

  it(
    'critère 1 — a faulty key refuses the integration by its name, before any work',
    () => {
      const m = chantier(ESSAIS, {
        grillhouse: { engendres: { 'sans commande': { fichiers: ['docs/liste.txt'] } } },
      });
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain('grillhouse.engendres.sans commande');
      expect(r.stdout).not.toContain('✓ verdicts');
      expect(m.suites()).toBe('');
    },
    LONG
  );
});
