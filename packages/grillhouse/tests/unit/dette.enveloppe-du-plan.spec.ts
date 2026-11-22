// The known debt in the envelope of a plan (scripts/dette.mjs, `mesureDuPlan`): a run that names
// the packages of a plan (`GRILLHOUSE_ENVELOPPE`, the checks of the plan and the sessions of its
// agents) measures the files of those packages alone, whatever its guard reads: the keys of the
// other files are neither judged corrected, nor noted « à élaguer », nor pruned, as a baseline
// (ESLint's `--prune-suppressions`, Betterer) only comes down by the lot that resorbs it. The
// final pass, out of any envelope, measures the whole repository. Witness: BPScript, 2026-11-20,
// 320.14.2.8.1, whose checks under the envelope of packages/000-forms read six large tests of
// other packages as not large (their shared test material was not built in the copy), and whose
// circuit lowered their debt from the notes, then a final pass red on those six tests.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { abaisser, FICHIER, mesureDuPlan, trancher } from '../../scripts/dette.mjs';
import { VARIABLE } from '../../scripts/enveloppe/paquets-du-plan.mjs';
import { estNoteDeDette, lireSarif, RESULTATS } from '../../scripts/resultats.mjs';
import {
  GARDE as TAILLES,
  GRAND_DE_JOUR,
  verifier,
} from '../../scripts/langages/typescript/tailles-des-tests.mjs';
import { jugerLesTitres } from '../../scripts/langages/typescript/titres-de-tests.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dette-enveloppe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Dette = Record<string, Record<string, Record<string, { count: number }>>>;
type Note = { garde: string; fichier: string; regle: string; trouve: number; genre: string };

function repo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(ESSAIS, 'depot-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const ecrireDette = (dir: string, dette: Dette) =>
  writeFileSync(path.join(dir, FICHIER), `${JSON.stringify(dette, null, 2)}\n`);
const lireDette = (dir: string) =>
  JSON.parse(readFileSync(path.join(dir, FICHIER), 'utf8')) as Dette;
// The environment of a run of <dir> whose results go to <nom>, in the envelope of <plan> when given.
const envDe = (dir: string, nom: string, plan?: string[]): Record<string, string> => ({
  [RESULTATS as string]: path.join(dir, nom),
  ...(plan ? { [VARIABLE]: plan.join(path.delimiter) } : {}),
});
// The notes of the debt a run left under <nom>, as the circuit reads them.
const notesDe = (dir: string, nom: string) =>
  (lireSarif(path.join(dir, nom)) as { constats: Note[] }).constats.filter(estNoteDeDette);

const c = (fichier: string, regle: string) => ({ fichier, regle, message: `${fichier} ${regle}` });
const UN_PETIT = "import { a } from '../src/a.js';\nit('a', () => a());\n";

describe('the debt of the sizes of the tests, in the envelope of a plan', () => {
  // Two packages, each with a test the debt inscribes as large and that this copy reads as small.
  const depot = () => {
    const dir = repo({
      'packages/a/package.json': '{"name":"@d/a"}',
      'packages/a/src/a.ts': 'export const a = () => 1;\n',
      'packages/a/test/a.test.ts': UN_PETIT,
      'packages/b/package.json': '{"name":"@d/b"}',
      'packages/b/src/a.ts': 'export const a = () => 1;\n',
      'packages/b/test/b.test.ts': UN_PETIT,
    });
    ecrireDette(dir, {
      [TAILLES]: {
        'packages/a/test/a.test.ts': { [GRAND_DE_JOUR]: { count: 1 } },
        'packages/b/test/b.test.ts': { [GRAND_DE_JOUR]: { count: 1 } },
      },
    });
    return dir;
  };

  it('keeps the debt of the packages the plan does not name, once the notes of the pass lower it', () => {
    const dir = depot();
    trancher(dir, TAILLES, verifier(dir), undefined, envDe(dir, 'r', ['packages/a']));
    const notes = notesDe(dir, 'r');
    expect(notes.map(n => n.fichier)).toEqual(['packages/a/test/a.test.ts']);
    abaisser(dir, notes);
    expect(lireDette(dir)).toEqual({
      [TAILLES]: { 'packages/b/test/b.test.ts': { [GRAND_DE_JOUR]: { count: 1 } } },
    });
  });

  it('lowers the debt of every package from a pass out of any envelope', () => {
    const dir = depot();
    trancher(dir, TAILLES, verifier(dir), undefined, envDe(dir, 'r'));
    const notes = notesDe(dir, 'r');
    expect(notes.map(n => n.fichier).sort()).toEqual([
      'packages/a/test/a.test.ts',
      'packages/b/test/b.test.ts',
    ]);
    abaisser(dir, notes);
    expect(lireDette(dir)).toEqual({});
  });
});

describe('the debt of any guard, in the envelope of a plan', () => {
  const dette = {
    g: {
      'packages/a/x.ts': { r: { count: 3 } },
      'packages/b/y.ts': { r: { count: 76 }, s: { count: 2 } },
      'scripts/z.mjs': { r: { count: 1 } },
    },
  };
  const constats = [c('packages/a/x.ts', 'r')];

  it('measures the files of the packages of the plan alone', () => {
    const mesure = mesureDuPlan('/r', {
      [VARIABLE]: ['packages/a', 'packages/c'].join(path.delimiter),
    });
    expect(mesure('packages/a/x.ts')).toBe(true);
    expect(mesure('packages/a')).toBe(true);
    expect(mesure('packages/c/src/i.ts')).toBe(true);
    expect(mesure('packages/b/y.ts')).toBe(false);
    expect(mesure('packages/ab/y.ts')).toBe(false);
    expect(mesure('scripts/z.mjs')).toBe(false);
  });

  it('measures every file out of an envelope, and under a plan that names the root', () => {
    for (const env of [
      {},
      { [VARIABLE]: '.' },
      { [VARIABLE]: ['packages/a', '.'].join(path.delimiter) },
    ]) {
      const mesure = mesureDuPlan('/r', env);
      expect(mesure('packages/b/y.ts')).toBe(true);
      expect(mesure('scripts/z.mjs')).toBe(true);
    }
  });

  it('notes and reports to prune the keys of the plan alone, though the guard reads the whole repository', () => {
    const dir = repo({});
    ecrireDette(dir, dette);
    const r = trancher(dir, 'g', constats, undefined, envDe(dir, 'r', ['packages/a']));
    expect(r.refus).toEqual([]);
    expect(r.lignes.filter(l => l.includes('elaguer'))).toEqual([
      expect.stringContaining('packages/a/x.ts · r — 1 constat(s) pour 3 inscrit(s)'),
    ]);
    expect(notesDe(dir, 'r')).toEqual([
      expect.objectContaining({ garde: 'g', fichier: 'packages/a/x.ts', regle: 'r', trouve: 1 }),
    ]);
    // Its witness: out of the envelope, the same run notes every key above what it finds.
    trancher(dir, 'g', constats, undefined, envDe(dir, 'temoin'));
    expect(notesDe(dir, 'temoin')).toHaveLength(4);
  });

  it('prunes the keys of the plan alone, the others as they are', () => {
    const dir = repo({});
    ecrireDette(dir, dette);
    trancher(dir, 'g', constats, 'elaguer', envDe(dir, 'r', ['packages/a']));
    expect(lireDette(dir)).toEqual({
      g: { ...dette.g, 'packages/a/x.ts': { r: { count: 1 } } },
    });
  });

  it('inscribes the keys of the plan alone, a key out of the plan kept whole though the guard finds there', () => {
    const dir = repo({});
    ecrireDette(dir, dette);
    const trouves = [...constats, c('packages/b/y.ts', 'r'), c('packages/b/neuf.ts', 'r')];
    trancher(dir, 'g', trouves, 'inscrire', envDe(dir, 'r', ['packages/a']));
    expect(lireDette(dir)).toEqual({
      g: { ...dette.g, 'packages/a/x.ts': { r: { count: 1 } } },
    });
  });

  it('still refuses a new finding out of the plan', () => {
    const dir = repo({});
    ecrireDette(dir, dette);
    const neuf = c('packages/b/neuf.ts', 'r');
    const r = trancher(dir, 'g', [...constats, neuf], undefined, envDe(dir, 'r', ['packages/a']));
    expect(r.refus).toEqual([neuf]);
  });

  it('measures a file both the guard and the plan read: a guard that read a part of the plan says so', () => {
    const dir = repo({});
    ecrireDette(dir, dette);
    const env = envDe(dir, 'r', ['packages/a', 'packages/b']);
    trancher(dir, 'g', constats, undefined, env, (f: string) => !f.startsWith('packages/b/'));
    expect(notesDe(dir, 'r').map(n => n.fichier)).toEqual(['packages/a/x.ts']);
  });
});

describe('the debt of the titles of the tests, in the envelope of a plan', () => {
  const REGLE = 'titre-nommant-un-ticket';
  const dette = {
    'titres-de-tests': {
      'packages/a/test/a.test.ts': { [REGLE]: { count: 2 } },
      'packages/b/test/b.test.ts': { [REGLE]: { count: 2 } },
      'packages/b/test/parti.test.ts': { [REGLE]: { count: 1 } },
    },
  };
  const constats = [c('packages/a/test/a.test.ts', REGLE), c('packages/b/test/b.test.ts', REGLE)];
  const mesure = () => mesureDuPlan('/r', { [VARIABLE]: 'packages/a' });
  const fichiers = (refus: unknown) => (refus as { fichier: string }[]).map(r => r.fichier);

  it('judges a debt left above its count in the packages of the plan alone', () => {
    expect(fichiers(jugerLesTitres(dette, constats, {}, mesure()))).toEqual([
      'packages/a/test/a.test.ts',
    ]);
    // Its witness: the whole repository measured, each debt above its count is judged.
    expect(fichiers(jugerLesTitres(dette, constats, {}))).toEqual([
      'packages/a/test/a.test.ts',
      'packages/b/test/b.test.ts',
      'packages/b/test/parti.test.ts',
    ]);
  });

  it('still refuses a count that rises out of the plan', () => {
    const monte = [...constats, ...[1, 2].map(() => c('packages/b/test/b.test.ts', REGLE))];
    expect(fichiers(jugerLesTitres(dette, monte, {}, mesure()))).toEqual([
      'packages/a/test/a.test.ts',
      'packages/b/test/b.test.ts',
    ]);
  });
});
