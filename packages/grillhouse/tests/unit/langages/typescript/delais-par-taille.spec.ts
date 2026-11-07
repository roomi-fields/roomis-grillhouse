// The delay of each size of test, on the model of Bazel's test-encyclopedia (small 60 s, medium
// 300 s, large 900 s; a test past its delay is killed) and of Vitest's `slowTestThreshold`:
//
// - the three delays are written once, in bornes.mjs (DELAIS_MS), which the base configuration and
//   the night's import;
// - the delay of a day test file is deduced from its size by the classification of the guard of
//   the sizes (`classer`), one address; a file out of the day has the large delay;
// - there is no debt of the delays: no guard `delais-des-tests`, no rule `delai-depasse`.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { commandeDe } from '../../../../scripts/sous-commandes.mjs';
import { gardesDuCadre } from '../../../../scripts/gardes-du-cadre.mjs';
import base from '../../../../scripts/langages/typescript/vitest-config/base.mjs';
import nuit from '../../../../scripts/langages/typescript/vitest.nuit.config.mjs';

type Lire = (f: string) => string | null;
type Options = { lire: Lire; racine: string };
type Bornes = {
  DELAIS_MS: Record<string, number>;
  DELAI_NUIT_MS: number;
  libelleDuDelai(taille: string): string;
};
type Delais = {
  delaisDuFichier(
    f: string,
    o: Options
  ): Record<string, unknown> & { taille: string; delai: number };
  reglagesDuFichier(f: string, o: Options): { testTimeout: number; hookTimeout: number };
};
// The modules under test load at the top; while one is missing, each test that reads it is red by
// itself (the file still loads, so that the proof sees every test).
const bornes =
  (await import('../../../../scripts/langages/typescript/vitest-config/bornes.mjs').catch(
    () => ({})
  )) as unknown as Bornes;
const delais =
  (await import('../../../../scripts/langages/typescript/vitest-config/delais.mjs').catch(
    () => ({})
  )) as unknown as Delais;

const BASE = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/vitest-config/base.mjs'
);
const DELAIS = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/vitest-config/delais.mjs'
);
const SETUP = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/vitest-config/delais.setup.mjs'
);
const REPORTER = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/vitest-config/duree.reporter.mjs'
);
const NUIT_CONF = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/vitest.nuit.config.mjs'
);
const INDEX = path.resolve(__dirname, '../../../../scripts/langages/typescript/index.mjs');
const VERIFIER = path.resolve(__dirname, '../../../../scripts/langages/typescript/verifier.mjs');
const ANCIENNE_GARDE = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/delais-des-tests.mjs'
);
const RACINE_DU_CADRE = path.resolve(__dirname, '../../../../../..');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'delais-par-taille-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const abs = (rel: string) => path.join(ESSAIS, rel);
const UN_MODULE = "import { a } from '../src/a.js';\nit('a', () => a());\n";
const DEUX_MODULES =
  "import { a } from '../src/a.js';\nimport { b } from '../src/b.js';\nit('ab', () => a(b()));\n";
// A repository held in memory, each path relative to <ESSAIS>: the reader the classification takes.
const memoire =
  (fichiers: Record<string, string>): Lire =>
  f =>
    fichiers[path.relative(ESSAIS, f)] ?? null;
const DEPOT = {
  'tests/p.test.ts': UN_MODULE,
  'tests/m.test.ts': DEUX_MODULES,
  'src/a.ts': '',
  'src/b.ts': '',
};
const o = (fichiers: Record<string, string> = DEPOT): Options => ({
  lire: memoire(fichiers),
  racine: ESSAIS,
});
const delaiDe = (f: string, opt: Options = o()) => delais.delaisDuFichier(abs(f), opt);

describe('délais par taille — critères 1 et 7: the delays of Bazel, written once in bornes', () => {
  it('critère 7: DELAIS_MS holds small 60 s, medium 300 s, large 900 s', () => {
    expect(bornes.DELAIS_MS).toEqual({ petit: 60000, moyen: 300000, grand: 900000 });
  });

  it('critère 7: the night delay is the large delay', () => {
    expect(bornes.DELAI_NUIT_MS).toBe(900000);
  });

  it('critère 9: the line of a size reads « petit, 60 s », « moyen, 300 s », « grand, 900 s »', () => {
    expect(bornes.libelleDuDelai('petit')).toBe('petit, 60 s');
    expect(bornes.libelleDuDelai('moyen')).toBe('moyen, 300 s');
    expect(bornes.libelleDuDelai('grand')).toBe('grand, 900 s');
  });

  it('critère 7: no other file writes a delay value', () => {
    const fichiers = [BASE, DELAIS, SETUP, REPORTER, NUIT_CONF];
    for (const f of fichiers) {
      const code = readFileSync(f, 'utf8')
        .split('\n')
        .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      expect(code, f).not.toMatch(/\b(?:60|300|900)(?:_?000)\b/);
    }
  });
});

describe('délais par taille — critères 1 et 2: a day test has the delay of its size', () => {
  it('critère 1: a small file has 60 s', () => {
    const d = delaiDe('tests/p.test.ts');
    expect(d.taille).toBe('petit');
    expect(d.delai).toBe(60000);
  });

  it('critère 1: a medium file has 300 s', () => {
    const d = delaiDe('tests/m.test.ts');
    expect(d.taille).toBe('moyen');
    expect(d.delai).toBe(300000);
  });

  it('critère 7: a day file has no ceiling beyond the delay of its size', () => {
    expect(delaiDe('tests/p.test.ts')).not.toHaveProperty('plafond');
    expect(delaiDe('tests/m.test.ts')).not.toHaveProperty('plafond');
    const r = delais.reglagesDuFichier(abs('tests/p.test.ts'), o());
    expect(r).toEqual({ testTimeout: 60000, hookTimeout: 60000 });
  });

  it('critère 1: Vitest kills a test and a hook at the delay of the file’s size', () => {
    expect(delais.reglagesDuFichier(abs('tests/m.test.ts'), o())).toEqual({
      testTimeout: 300000,
      hookTimeout: 300000,
    });
  });

  it('critère 2: the size is read by the classification, not named: a file whose text changes size changes delay', () => {
    const petit = delaiDe('tests/t.test.ts', o({ 'tests/t.test.ts': UN_MODULE, 'src/a.ts': '' }));
    const moyen = delaiDe(
      'tests/t.test.ts',
      o({ 'tests/t.test.ts': DEUX_MODULES, 'src/a.ts': '', 'src/b.ts': '' })
    );
    expect([petit.delai, moyen.delai]).toEqual([60000, 300000]);
  });

  it('critère 2: the module of the delays reads the size from the guard of the sizes', () => {
    expect(readFileSync(DELAIS, 'utf8')).toMatch(/tailles-des-tests\.mjs/);
  });

  it('critère 2: the base configuration copies no rule of the classification', () => {
    expect(readFileSync(BASE, 'utf8')).not.toMatch(/git init|OUTILS_LOURDS|mkdtemp\(|worktree add/);
  });

  it('critère 1: the base configuration applies the delay of the file by a setup file', () => {
    const setup = base.test.setupFiles.find((f: string) => f.endsWith('delais.setup.mjs'));
    expect(setup).toBeTruthy();
    expect(() => readFileSync(setup as string, 'utf8')).not.toThrow();
  });
});

describe('délais par taille — critère 8: a file out of the day has the large delay', () => {
  it('critère 8: a night file, whatever its text reads, has 900 s', () => {
    const d = delaiDe('tests/x.nuit.test.ts', o({ 'tests/x.nuit.test.ts': UN_MODULE }));
    expect(d.taille).toBe('grand');
    expect(d.delai).toBe(900000);
    expect(
      delais.reglagesDuFichier(
        abs('tests/x.nuit.test.ts'),
        o({ 'tests/x.nuit.test.ts': UN_MODULE })
      )
    ).toEqual({ testTimeout: 900000, hookTimeout: 900000 });
  });

  it('critère 8: a time budget bench, named by its file, has 900 s', () => {
    const d = delaiDe('tests/b.budget.test.ts', o({ 'tests/b.budget.test.ts': UN_MODULE }));
    expect(d.taille).toBe('grand');
    expect(d.delai).toBe(900000);
  });

  it('critère 8: a time witness, that imports mesurerAuRepos, has 900 s though it reads small', () => {
    const texte =
      "import { mesurerAuRepos } from '@roomi-fields/grillhouse/vitest-config/mesure';\n" +
      "it('a', ctx => mesurerAuRepos(ctx, () => {}));\n";
    writeFileSync(abs('temoin.test.ts'), texte);
    const d = delaiDe('temoin.test.ts', { lire: f => readFileSync(f, 'utf8'), racine: ESSAIS });
    expect(d.taille).toBe('grand');
    expect(d.delai).toBe(900000);
  });

  it('critère 8: a day file keeps the delay classer gives it', () => {
    expect(delaiDe('tests/p.test.ts').delai).toBe(60000);
  });
});

describe('délais par taille — critères 3, 4 et 11: the configurations', () => {
  it('critère 11: slowTestThreshold is 300 ms, written in the base configuration', () => {
    expect(base.test.slowTestThreshold).toBe(300);
  });

  it('critère 11: slowTestThreshold does not follow the delays of the sizes', () => {
    const texte = readFileSync(BASE, 'utf8');
    expect(texte).toMatch(/slowTestThreshold:\s*300\b/);
    expect(texte).not.toMatch(/slowTestThreshold:[^\n]*DELAIS_MS/);
  });

  it('critère 4: the night configuration sets the test and hook delays to 900 s', () => {
    expect(nuit.test.testTimeout).toBe(900000);
    expect(nuit.test.hookTimeout).toBe(900000);
  });

  it('critère 7: the base and night configurations import the delays from bornes', () => {
    expect(readFileSync(NUIT_CONF, 'utf8')).toMatch(/from '\.\/vitest-config\/bornes\.mjs'/);
  });
});

describe('délais par taille — critères 6 et 10: no debt of the delays', () => {
  it('critère 10: the guard of the delays is not in the frame’s guards', () => {
    const noms = gardesDuCadre(RACINE_DU_CADRE).map(([f]) => path.basename(f));
    expect(noms).not.toContain('delais-des-tests.mjs');
  });

  it('critère 10: delais-des-tests is no command of the frame', () => {
    expect(commandeDe('delais-des-tests', RACINE_DU_CADRE)).toBeNull();
  });

  it('critère 10: the typescript module declares and keeps no script of the guard', () => {
    expect(readFileSync(INDEX, 'utf8')).not.toMatch(/delais-des-tests/);
    expect(() => readFileSync(ANCIENNE_GARDE)).toThrow();
  });

  it('critère 10: the verification pass plays no guard of the delays', () => {
    expect(readFileSync(VERIFIER, 'utf8')).not.toMatch(/delais-des-tests/);
  });

  it('critère 6: no rule delai-depasse, no ceiling of an inscribed file in the delays module', () => {
    const texte = readFileSync(DELAIS, 'utf8');
    expect(texte).not.toMatch(/delai-depasse|DELAI_DEPASSE|plafond|dette/i);
  });
});
