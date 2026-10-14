import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FICHIER, elaguer, inscrire, juger, trancher } from '../../scripts/dette.mjs';
import { codeMortEssai } from './code-mort-essai.js';

// The known debt of the guards (`scripts/dette.mjs`), on the model of ESLint's bulk suppressions:
// a finding inscribed in `grillhouse-dette.json`, keyed by guard, file and rule with its count,
// passes; a new finding, or a count beyond the inscribed one, refuses; a count found below the
// inscribed one is reported; `GRILLHOUSE_DETTE=inscrire` writes the debt of today,
// `GRILLHOUSE_DETTE=elaguer` lowers it to what is found. Each case runs with its witness, the same
// repository judged without the debt or with another one, so the test proves it can fail.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dette-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPTS = path.resolve(__dirname, '../../scripts');
const MODULES = path.resolve(__dirname, '../../node_modules');
const IFACE_B = 'packages/b/docs/INTERFACE.md';

type Dette = Record<string, Record<string, Record<string, { count: number }>>>;

function repo(files: Record<string, string>, modules = false) {
  const dir = mkdtempSync(path.join(ESSAIS, 'depot-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  if (modules) {
    symlinkSync(MODULES, path.join(dir, 'node_modules'));
  }
  return dir;
}

// One run of the guard <script> in <dir>, in the debt's <mode> (none by default).
function garde(dir: string, script: string, mode?: string, ...args: string[]) {
  const env = { ...process.env };
  delete env.GRILLHOUSE_DETTE;
  if (mode) {
    env.GRILLHOUSE_DETTE = mode;
  }
  const r = spawnSync('node', [path.join(SCRIPTS, script), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env,
  });
  return { status: r.status, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

const ecrireDette = (dir: string, dette: Dette) =>
  writeFileSync(path.join(dir, FICHIER), `${JSON.stringify(dette, null, 2)}\n`);
const lireDette = (dir: string) =>
  JSON.parse(readFileSync(path.join(dir, FICHIER), 'utf8')) as Dette;

// A repository where `a` uses <noms> of `b`, whose interface declares no consumer: one finding of
// the consumers guard per name, all under the key (b's interface, usage-non-declare).
const consommation = (...noms: string[]) =>
  repo({
    'packages/b/package.json': '{"name":"@d/b"}',
    'packages/b/src/index.ts': noms.map(n => `export const ${n} = 1;`).join('\n'),
    [IFACE_B]: '# b\n\nB.\n',
    'packages/a/package.json': '{"name":"@d/a"}',
    'packages/a/src/index.ts': `import { ${noms.join(', ')} } from '@d/b';\n`,
  });
const consommateurs = (count: number): Dette => ({
  consommateurs: { [IFACE_B]: { 'usage-non-declare': { count } } },
});

describe('the judgement of the debt', () => {
  const c = (fichier: string, regle: string, message = `${fichier} ${regle}`) => ({
    fichier,
    regle,
    message,
  });
  it('passes the findings inscribed, refuses the others', () => {
    const constats = [c('a.ts', 'r'), c('b.ts', 'r')];
    expect(juger({}, 'g', constats).refus).toEqual(constats);
    const dette = { g: { 'a.ts': { r: { count: 1 } } } };
    expect(juger(dette, 'g', constats).refus).toEqual([c('b.ts', 'r')]);
    expect(juger(dette, 'autre', constats).refus).toEqual(constats);
  });
  it('refuses every finding of a key beyond its count, naming the key', () => {
    const constats = [c('a.ts', 'r', '1'), c('a.ts', 'r', '2')];
    expect(juger({ g: { 'a.ts': { r: { count: 2 } } } }, 'g', constats).refus).toEqual([]);
    const j = juger({ g: { 'a.ts': { r: { count: 1 } } } }, 'g', constats);
    expect(j.refus).toEqual(constats);
    expect(j.depasses).toEqual([{ fichier: 'a.ts', regle: 'r', trouve: 2, inscrit: 1 }]);
  });
  it('never passes a finding without key', () => {
    const sansCle = { message: 'à régénérer' };
    expect(juger({ g: {} }, 'g', [sansCle]).refus).toEqual([sansCle]);
    expect(inscrire({}, 'g', [sansCle])).toEqual({});
  });
  it('reports a key inscribed above what is found', () => {
    const dette = { g: { 'a.ts': { r: { count: 3 } }, 'b.ts': { r: { count: 1 } } } };
    const j = juger(dette, 'g', [c('a.ts', 'r')]);
    expect(j.refus).toEqual([]);
    expect(j.corriges).toEqual([
      { fichier: 'a.ts', regle: 'r', trouve: 1, inscrit: 3 },
      { fichier: 'b.ts', regle: 'r', trouve: 0, inscrit: 1 },
    ]);
    expect(juger({ g: { 'a.ts': { r: { count: 1 } } } }, 'g', [c('a.ts', 'r')]).corriges).toEqual(
      []
    );
  });
  it('inscribes the findings of a guard, the other guards kept', () => {
    const autre = { h: { 'x.ts': { r: { count: 1 } } } };
    expect(
      inscrire({ ...autre, g: { 'vieux.ts': { r: { count: 9 } } } }, 'g', [
        c('a.ts', 'r'),
        c('a.ts', 'r'),
        c('a.ts', 's'),
      ])
    ).toEqual({ ...autre, g: { 'a.ts': { r: { count: 2 }, s: { count: 1 } } } });
    expect(inscrire({ ...autre, g: {} }, 'g', [])).toEqual(autre);
  });
  it('prunes a count down to what is found, never up, never a new key', () => {
    const dette = { g: { 'a.ts': { r: { count: 3 } }, 'b.ts': { r: { count: 1 } } } };
    expect(elaguer(dette, 'g', [c('a.ts', 'r'), c('c.ts', 'r')])).toEqual({
      g: { 'a.ts': { r: { count: 1 } } },
    });
    expect(
      elaguer({ g: { 'a.ts': { r: { count: 1 } } } }, 'g', [c('a.ts', 'r'), c('a.ts', 'r')])
    ).toEqual({ g: { 'a.ts': { r: { count: 1 } } } });
    expect(elaguer(dette, 'g', [])).toEqual({});
  });
  it('refuses a mode it does not know, or a debt that is not JSON, in plain words', () => {
    const dir = repo({});
    const constat = { fichier: 'a.ts', regle: 'r', message: 'a.ts r' };
    expect(trancher(dir, 'g', [constat], 'tout').refus).toEqual([
      { message: 'GRILLHOUSE_DETTE=tout : les modes sont « inscrire » et « elaguer ».' },
      constat,
    ]);
    expect(trancher(dir, 'g', [], 'inscrire').refus).toEqual([]);
    writeFileSync(path.join(dir, FICHIER), '{ pas du JSON');
    const [illisible] = trancher(dir, 'g', []).refus as { message: string }[];
    expect(illisible.message).toMatch(/grillhouse-dette\.json n'est pas un JSON/);
    const r = garde(consommation('duree'), 'consommateurs.mjs', 'tout');
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toMatch(/⛔ GRILLHOUSE_DETTE=tout/);
    expect(r.sortie).not.toMatch(/\n\s+at /);
  });
});

describe('the debt through a guard (the consumers check)', () => {
  it('a finding inscribed passes; the witness without the debt refuses', () => {
    const dir = consommation('duree');
    expect(garde(dir, 'consommateurs.mjs').status).toBe(1);
    ecrireDette(dir, consommateurs(1));
    const r = garde(dir, 'consommateurs.mjs');
    expect(r.status, r.sortie).toBe(0);
    expect(r.sortie).toMatch(/1 constat\(s\) connu\(s\)/);
  });
  it('a new finding refuses, named; the witness with its key inscribed passes', () => {
    const dir = consommation('duree');
    ecrireDette(dir, {
      consommateurs: { 'packages/autre/docs/INTERFACE.md': { 'usage-non-declare': { count: 1 } } },
    });
    const r = garde(dir, 'consommateurs.mjs');
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toMatch(/⛔ a utilise « duree » de b/);
    ecrireDette(dir, consommateurs(1));
    expect(garde(dir, 'consommateurs.mjs').status).toBe(0);
  });
  it('a count beyond the inscribed one refuses, naming the key; the witness at the count passes', () => {
    const dir = consommation('duree', 'tempo');
    ecrireDette(dir, consommateurs(1));
    const r = garde(dir, 'consommateurs.mjs');
    expect(r.status, r.sortie).toBe(1);
    expect(r.sortie).toMatch(/« duree »/);
    expect(r.sortie).toMatch(/« tempo »/);
    expect(r.sortie).toContain(
      `⛔ consommateurs : ${IFACE_B} · usage-non-declare — 2 constat(s) pour 1 inscrit(s)`
    );
    ecrireDette(dir, consommateurs(2));
    expect(garde(dir, 'consommateurs.mjs').status).toBe(0);
  });
  it('a finding corrected is reported without refusing; the witness at the count reports nothing', () => {
    const dir = consommation('duree');
    ecrireDette(dir, consommateurs(2));
    const r = garde(dir, 'consommateurs.mjs');
    expect(r.status, r.sortie).toBe(0);
    expect(r.sortie).toMatch(/⚠️ .*1 constat\(s\) pour 2 inscrit\(s\).*grillhouse:dette:elaguer/);
    ecrireDette(dir, consommateurs(1));
    expect(garde(dir, 'consommateurs.mjs').sortie).not.toMatch(/elaguer/);
  });
  it('the inscription writes the debt of today, then the guard passes; the witness before refuses', () => {
    const dir = consommation('duree', 'tempo');
    expect(garde(dir, 'consommateurs.mjs').status).toBe(1);
    const r = garde(dir, 'consommateurs.mjs', 'inscrire');
    expect(r.status, r.sortie).toBe(0);
    expect(lireDette(dir)).toEqual(consommateurs(2));
    expect(garde(dir, 'consommateurs.mjs').status).toBe(0);
  });
  it('the inscription keeps the sections of the other guards', () => {
    const dir = consommation('duree');
    const autre = { 'code-mort': { 'src/x.ts': { exports: { count: 4 } } } };
    ecrireDette(dir, autre);
    garde(dir, 'consommateurs.mjs', 'inscrire');
    expect(lireDette(dir)).toEqual({ ...autre, ...consommateurs(1) });
  });
  it('the pruning lowers a corrected count and never raises one', () => {
    const dir = consommation('duree');
    ecrireDette(dir, consommateurs(3));
    const r = garde(dir, 'consommateurs.mjs', 'elaguer');
    expect(r.status, r.sortie).toBe(0);
    expect(lireDette(dir)).toEqual(consommateurs(1));
    const deux = consommation('duree', 'tempo');
    ecrireDette(deux, consommateurs(1));
    expect(garde(deux, 'consommateurs.mjs', 'elaguer').status).toBe(1);
    expect(lireDette(deux)).toEqual(consommateurs(1));
  });
  it('the pruning drops a key the guard no longer finds', () => {
    const dir = repo({ 'packages/b/package.json': '{"name":"@d/b"}' });
    ecrireDette(dir, consommateurs(1));
    expect(garde(dir, 'consommateurs.mjs', 'elaguer').status).toBe(0);
    expect(lireDette(dir)).toEqual({});
    const sans = repo({ 'packages/b/package.json': '{"name":"@d/b"}' });
    expect(garde(sans, 'consommateurs.mjs', 'elaguer').status).toBe(0);
    expect(existsSync(path.join(sans, FICHIER))).toBe(false);
  });
});

const T = 120_000;

describe('the debt through the other guards', () => {
  it(
    'the boundaries: a cycle inscribed passes; the witness without the debt refuses',
    () => {
      const dir = repo(
        {
          'package.json': '{"name":"r"}',
          'src/x.ts': "import { y } from './y';\nexport const x = y;",
          'src/y.ts': "import { x } from './x';\nexport const y = x;",
        },
        true
      );
      garde(dir, 'frontieres.mjs', undefined, '--ecrire');
      const sans = garde(dir, 'frontieres.mjs');
      expect(sans.status, sans.sortie).toBe(1);
      expect(sans.sortie).toMatch(/error pas-de-cycle/);
      expect(garde(dir, 'frontieres.mjs', 'inscrire').status).toBe(0);
      expect(lireDette(dir).frontieres).toEqual({ 'src/x.ts': { 'pas-de-cycle': { count: 1 } } });
      const r = garde(dir, 'frontieres.mjs');
      expect(r.status, r.sortie).toBe(0);
      expect(r.sortie).not.toMatch(/error pas-de-cycle/);
    },
    T
  );
  it(
    'the dead code: an unused export inscribed passes; the witness without the debt refuses',
    () => {
      const files = {
        'package.json': JSON.stringify({ name: 'r', private: true }),
        'knip.json': JSON.stringify({ entry: ['src/index.ts'], project: ['src/**/*.ts'] }),
        'src/index.ts': "import { a } from './a';\nexport const i = a;\n",
        'src/a.ts': 'export const a = 1;\nexport const mort = 2;\n',
      };
      const sans = codeMortEssai(ESSAIS, files);
      expect(sans.status, sans.sortie).toBe(1);
      expect(sans.sortie).toContain('src/a.ts : export sans appelant — mort');
      const avec = codeMortEssai(ESSAIS, {
        ...files,
        [FICHIER]: JSON.stringify({ 'code-mort': { 'src/a.ts': { exports: { count: 1 } } } }),
      });
      expect(avec.status, avec.sortie).toBe(0);
    },
    T
  );
  it(
    'the interface against the code: an export without summary inscribed passes; the witness refuses',
    () => {
      const dir = repo(
        {
          'package.json': '{"name":"p","types":"dist/index.d.ts"}',
          'tsconfig.json': JSON.stringify({
            compilerOptions: { strict: true, skipLibCheck: true },
          }),
          'tsdoc.json': readFileSync(path.resolve(__dirname, '../../tsdoc.json'), 'utf8'),
          'src/a/index.ts': 'export const tempo = 1;\n',
          'dist/a/index.d.ts': 'export declare const tempo: number;\n',
          'src/a/docs/INTERFACE.md': '# a\n\nA.\n',
        },
        true
      );
      garde(dir, 'interfaces-contre-code.mjs', undefined, '--ecrire');
      const sans = garde(dir, 'interfaces-contre-code.mjs');
      expect(sans.status, sans.sortie).toBe(1);
      expect(sans.sortie).toMatch(/`tempo` n'a pas de résumé TSDoc/);
      ecrireDette(dir, {
        'interfaces-contre-code': { 'src/a/docs/INTERFACE.md': { resume: { count: 1 } } },
      });
      const r = garde(dir, 'interfaces-contre-code.mjs');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
});
