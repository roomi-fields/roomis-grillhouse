// grillhouse-3dr.4: the pyramid of the tests (Software Engineering at Google, ch. 11 and 14) and the
// sizes of Bazel (`size = small | medium | large`), in the frame and in Grillhouse. The guard of the
// sizes (scripts/langages/typescript/tailles-des-tests.mjs) classes each test file by a static reading of its text and
// of the test material it imports: small, it imports one module of the repository and starts no
// process; medium, several modules or processes; large, it mounts a trial repository and starts
// something else than git there. A large test of the day is refused, the known debt
// (`grillhouse-dette.json`, scripts/dette.mjs) inscribing those that exist; a night test
// (`*.nuit.test.*`) is never refused. The update inscribes a project's debt once
// (./migration.tailles-des-tests.spec.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { juger, lire as lireDette } from '../../../../scripts/dette.mjs';
import { gardesDuCadre } from '../../../../scripts/gardes-du-cadre.mjs';
import { commandeDe } from '../../../../scripts/sous-commandes.mjs';
import {
  classer,
  GARDE,
  GRAND_DE_JOUR,
  OUTILS_LOURDS,
  tailles,
  testsDuDepot,
  verifier,
} from '../../../../scripts/langages/typescript/tailles-des-tests.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tailles-des-tests-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository of files held in memory: the reader the classification takes, each path absolute
// under /r.
const R = '/r';
const memoire = (fichiers: Record<string, string>) => (f: string) =>
  fichiers[path.relative(R, f)] ?? null;
const tailleDe = (fichiers: Record<string, string>, test: string) =>
  classer(path.join(R, test), memoire(fichiers)).taille;

// The texts of the cases; those that start a process lie in files of their own (tests/formes/
// tailles/), so that the reading of this file sees none of them.
const UN_MODULE = "import { a } from '../src/a.js';\nit('a', () => a());\n";
const DEUX_MODULES =
  "import { a } from '../src/a.js';\nimport { b } from '../src/b.js';\nit('ab', () => a(b()));\n";
const forme = (f: string) =>
  readFileSync(path.join(__dirname, '../../../formes/tailles', f), 'utf8');
const GIT_SEUL = forme('git-seul.txt');
const PROCESSUS = forme('processus.txt');
const GRAND = forme('grand.txt');
const MATIERE_GRANDE = forme('matiere-grande.txt');

describe('grillhouse-3dr.4 critère 5 — the guard classes each test by its size, from its text', () => {
  it('critère 5: small, it imports its module alone and starts no process', () => {
    expect(tailleDe({ 'tests/a.test.ts': UN_MODULE, 'src/a.ts': '' }, 'tests/a.test.ts')).toBe(
      'petit'
    );
  });

  it('critère 5: medium, it imports several modules', () => {
    expect(
      tailleDe(
        { 'tests/ab.test.ts': DEUX_MODULES, 'src/a.ts': '', 'src/b.ts': '' },
        'tests/ab.test.ts'
      )
    ).toBe('moyen');
  });

  it('critère 5: medium, it starts a local process without a trial repository', () => {
    expect(tailleDe({ 'tests/cli.test.ts': PROCESSUS }, 'tests/cli.test.ts')).toBe('moyen');
  });

  it('critère 5: medium, it mounts a trial repository with git alone, the module run in its process', () => {
    expect(tailleDe({ 'tests/repo.test.ts': GIT_SEUL }, 'tests/repo.test.ts')).toBe('moyen');
  });

  it('critère 5: large, it mounts a trial repository and starts the product or the frame there', () => {
    expect(tailleDe({ 'tests/v.test.ts': GRAND }, 'tests/v.test.ts')).toBe('grand');
  });

  it('critère 5: large through the test material it imports, followed from file to file', () => {
    const fichiers = {
      'tests/c.spec.ts': "import { essai } from './aide.js';\nit('c', () => essai('x'));\n",
      'tests/aide.ts': "export { essai } from './essai.js';\n",
      'tests/essai.ts': MATIERE_GRANDE,
    };
    expect(tailleDe(fichiers, 'tests/c.spec.ts')).toBe('grand');
  });

  it('critère 5: a module of the product the test imports is not read: what it starts is its own', () => {
    const fichiers = {
      'tests/m.test.ts': "import { m } from '../src/m.js';\nit('m', () => m());\n",
      'src/m.ts': MATIERE_GRANDE,
    };
    expect(tailleDe(fichiers, 'tests/m.test.ts')).toBe('petit');
  });

  // grillhouse-3dr.3.4 (the supervisor's addition): a large test does not hide in the shared test
  // material imported by its package's name; a barrel of the material is followed to the modules
  // that declare the names imported.
  const matiere = [{ nom: '@e/matiere', dir: '/r/m', entree: '/r/m/src/index.ts' }];
  const parSonNom = {
    'm/src/index.ts': "export * from './essai.js';\nexport * from './aide.js';\n",
    'm/src/essai.ts': MATIERE_GRANDE,
    'm/src/aide.ts': 'export const aide = 1;\n',
  };
  const tailleAvecMatiere = (fichiers: Record<string, string>, test: string) =>
    classer(path.join(R, test), memoire(fichiers), R, matiere).taille;

  it('critère 5: large through the shared material it imports by the package’s name', () => {
    const fichiers = {
      ...parSonNom,
      'tests/c.spec.ts':
        "import { essai } from '@e/matiere/test-fixtures';\nit('c', () => essai('x'));\n",
    };
    expect(tailleAvecMatiere(fichiers, 'tests/c.spec.ts')).toBe('grand');
  });

  it('critère 5: a name of the material whose module starts nothing does not make it large', () => {
    const fichiers = {
      ...parSonNom,
      'tests/d.spec.ts': "import { aide } from '@e/matiere/test-fixtures';\nit('d', () => aide);\n",
    };
    expect(tailleAvecMatiere(fichiers, 'tests/d.spec.ts')).toBe('petit');
  });

  it('critère 5: in Grillhouse, tests-de-nuit.nuit.spec.ts is large, through its material', () => {
    const t = tailles(DEPOT).find(
      x => x.fichier === 'packages/grillhouse-essais/tests/tests-de-nuit.nuit.spec.ts'
    );
    expect(t?.taille).toBe('grand');
  });

  it('critère 5: a regular expression that runs `.exec(` starts no process', () => {
    const texte = "import { a } from '../src/a.js';\nit('r', () => /x/.exec(a('init')));\n";
    expect(tailleDe({ 'tests/r.test.ts': texte }, 'tests/r.test.ts')).toBe('petit');
  });
});

// A trial repository whose test files are <fichiers>, committed or not as git lists them.
function depot(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  spawnSync('git', ['init', '-q', r]);
  writeFileSync(path.join(r, '.gitignore'), 'node_modules/\n');
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

describe('grillhouse-3dr.4 critère 3 — the guard refuses a large test of the day', () => {
  it('critère 3: a large test of the day is a finding, keyed by its file and the rule', () => {
    const r = depot({ 'tests/v.test.ts': GRAND, 'tests/a.test.ts': UN_MODULE, 'src/a.ts': '' });
    const constats = verifier(r) as { fichier: string; regle: string; message: string }[];
    expect(constats.map(c => [c.fichier, c.regle])).toEqual([['tests/v.test.ts', GRAND_DE_JOUR]]);
    expect(constats[0]?.message).toMatch(/nuit\.test/);
  });

  it('critère 3: a large night test, or a time budget bench, is no finding', () => {
    const r = depot({ 'tests/v.nuit.test.ts': GRAND, 'tests/w.budget.test.ts': GRAND });
    expect(verifier(r)).toEqual([]);
  });

  it('critère 3: the test files are those git lists, the ignored ones (node_modules) left out', () => {
    const r = depot({ 'node_modules/x/v.test.ts': GRAND, 'tests/a.test.ts': UN_MODULE });
    expect(testsDuDepot(r)).toEqual(['tests/a.test.ts']);
  });

  it('critère 3: the debt inscribed passes, and a new large test of the day is refused', () => {
    const r = depot({ 'tests/v.test.ts': GRAND });
    const dette = { [GARDE]: { 'tests/v.test.ts': { [GRAND_DE_JOUR]: { count: 1 } } } };
    expect(juger(dette, GARDE, verifier(r)).refus).toEqual([]);
    writeFileSync(path.join(r, 'tests/neuf.test.ts'), GRAND);
    const { refus } = juger(dette, GARDE, verifier(r)) as { refus: { fichier: string }[] };
    expect(refus.map(c => c.fichier)).toEqual(['tests/neuf.test.ts']);
  });
});

describe('grillhouse-3dr.4 critères 3 et 4 — a guard of the frame, in Grillhouse as in each project', () => {
  it('critère 4: the guard is in the one list of the frame’s guards, which every project plays', () => {
    const racine = path.resolve(__dirname, '../../../../../..');
    // The module typescript's script, by its whole path (a module python has one of the same name).
    const script = path.resolve(
      __dirname,
      '../../../../scripts/langages/typescript/tailles-des-tests.mjs'
    );
    expect(gardesDuCadre(racine).map(([f]) => f)).toContain(script);
    expect(commandeDe('tailles-des-tests', racine)?.script).toBe(script);
  });

  // grillhouse-44b.10.4: the rule widened, the large tests of the day Grillhouse holds are
  // inscribed in its debt (regenerated by the circuit), and none is refused.
  it('critère 4: every large test of the day of Grillhouse is inscribed in its debt, none refused', () => {
    const dette = lireDette(DEPOT) as Record<string, unknown>;
    expect(juger(dette, GARDE, verifier(DEPOT)).refus).toEqual([]);
  });
});

// grillhouse-44b.10.4: a test that mounts a temporary directory and starts a heavy tool of the
// product there (Bazel's test-encyclopedia: a test that runs the product in a trial project is
// large). The cases lie in files of their own (tests/formes/tailles/).
const outil = (f: string) => forme(f);

describe('grillhouse-44b.10.4 critère 1 — a heavy tool started in a trial project is large', () => {
  it('critère 1: the list of the five tools is a named constant of the module', () => {
    expect([...OUTILS_LOURDS].sort()).toEqual(
      ['api-extractor', 'depcruise', 'knip', 'turbo', 'vitest'].sort()
    );
  });

  it('critère 1: large, a literal tool name in the arguments, with `cwd` on a temporary directory, no git init', () => {
    expect(tailleDe({ 'tests/o.test.ts': outil('outil-npx.txt') }, 'tests/o.test.ts')).toBe(
      'grand'
    );
  });

  it('critère 1: large, a literal path to the tool’s binary', () => {
    expect(tailleDe({ 'tests/o.test.ts': outil('outil-binaire.txt') }, 'tests/o.test.ts')).toBe(
      'grand'
    );
  });

  it('critère 1: large, the option `--prefix` carries the trial directory', () => {
    expect(tailleDe({ 'tests/o.test.ts': outil('outil-prefix.txt') }, 'tests/o.test.ts')).toBe(
      'grand'
    );
  });

  it('critère 1: large, the option `-C` carries the trial directory', () => {
    expect(tailleDe({ 'tests/o.test.ts': outil('outil-moins-c.txt') }, 'tests/o.test.ts')).toBe(
      'grand'
    );
  });

  it('critère 1: large through the shared test material it imports, followed as for the trial repository', () => {
    const fichiers = {
      'tests/c.spec.ts': "import { jouerKnip } from './aide.js';\nit('c', () => jouerKnip());\n",
      'tests/aide.ts': outil('matiere-outil.txt'),
    };
    expect(tailleDe(fichiers, 'tests/c.spec.ts')).toBe('grand');
  });

  it('critère 1: a module of the product the test imports is not read for the tool', () => {
    const fichiers = {
      'tests/m.test.ts': "import { m } from '../src/m.js';\nit('m', () => m());\n",
      'src/m.ts': outil('matiere-outil.txt'),
    };
    expect(tailleDe(fichiers, 'tests/m.test.ts')).toBe('petit');
  });
});

describe('grillhouse-44b.10.4 critère 2 — what stays medium or small', () => {
  it('critère 2: medium, the tool runs without `cwd` (on the repository)', () => {
    expect(tailleDe({ 'tests/o.test.ts': outil('outil-sans-cwd.txt') }, 'tests/o.test.ts')).toBe(
      'moyen'
    );
  });

  it('critère 2: medium, `cwd` without a temporary directory', () => {
    expect(
      tailleDe({ 'tests/o.test.ts': outil('outil-cwd-sans-tmp.txt') }, 'tests/o.test.ts')
    ).toBe('moyen');
  });

  it('critère 2: medium, only git runs in the trial directory', () => {
    expect(tailleDe({ 'tests/o.test.ts': outil('git-seul-cwd.txt') }, 'tests/o.test.ts')).toBe(
      'moyen'
    );
  });

  it('critère 2: a tool named by a variable escapes the reading (medium)', () => {
    expect(
      tailleDe({ 'tests/o.test.ts': outil('outil-par-variable.txt') }, 'tests/o.test.ts')
    ).toBe('moyen');
  });

  it('critère 2: a tool run by an npm script (`npm run verifier`) escapes the reading (medium)', () => {
    expect(tailleDe({ 'tests/o.test.ts': outil('outil-script-npm.txt') }, 'tests/o.test.ts')).toBe(
      'moyen'
    );
  });

  it('critère 2: the header of the guard says what escapes the reading', () => {
    const entete = texte(
      'packages/grillhouse/scripts/langages/typescript/tailles-des-tests.mjs'
    ).split('import ')[0];
    expect(entete).toMatch(/npm run verifier/);
    expect(entete).toMatch(/variable/);
  });
});

describe('a test that starts a Temporal server is large: it belongs to the night', () => {
  const SERVEUR = forme('test-du-serveur-temporal.txt');
  const MATIERE_SERVEUR = forme('matiere-serveur-temporal.txt');
  const MATIERE_LOCALE = forme('matiere-processus-local.txt');

  it('large, the test material it imports starts a Temporal development server', () => {
    const fichiers = { 'tests/t/serveur.spec.ts': SERVEUR, 'tests/t/aide.ts': MATIERE_SERVEUR };
    expect(tailleDe(fichiers, 'tests/t/serveur.spec.ts')).toBe('grand');
  });

  it('a day test that starts a Temporal server is a finding, a night one is none', () => {
    const r = depot({
      'tests/t/aide.ts': MATIERE_SERVEUR,
      'tests/t/jour.spec.ts': SERVEUR,
      'tests/t/nuit.nuit.spec.ts': SERVEUR,
    });
    const constats = verifier(r) as { fichier: string; regle: string }[];
    expect(constats.map(c => [c.fichier, c.regle])).toEqual([
      ['tests/t/jour.spec.ts', GRAND_DE_JOUR],
    ]);
  });

  it('a test whose material starts a local process but no server stays medium', () => {
    const fichiers = {
      'tests/t/local.spec.ts': SERVEUR.replace('demarrerLeServeur', 'lancerLaCommande'),
      'tests/t/aide.ts': MATIERE_LOCALE,
    };
    expect(tailleDe(fichiers, 'tests/t/local.spec.ts')).toBe('moyen');
  });

  it('in Grillhouse, the Temporal tests that start a server are night tests and the others stay of the day', () => {
    const dossier = 'packages/grillhouse/tests/temporal/';
    const toutes = tailles(DEPOT) as { fichier: string; taille: string; nuit: boolean }[];
    const delaDossier = toutes.filter(
      t => t.fichier.startsWith(dossier) && /\.spec\.ts$/.test(t.fichier)
    );
    const grands = delaDossier.filter(t => t.taille === 'grand');
    expect(grands.length).toBeGreaterThan(0);
    expect(grands.filter(t => !t.nuit).map(t => t.fichier)).toEqual([]);
    const nuit = delaDossier.filter(t => t.nuit);
    expect(nuit.filter(t => t.taille !== 'grand').map(t => t.fichier)).toEqual([]);
    expect(delaDossier.filter(t => !t.nuit).length).toBeGreaterThan(0);
  });
});

describe('grillhouse-44b.10.4 critère 3 — a night test or a bench is never a finding', () => {
  it('critère 3: a night test or a time bench with the pattern is large but no finding', () => {
    const r = depot({
      'tests/o.nuit.test.ts': outil('outil-npx.txt'),
      'tests/p.budget.test.ts': outil('outil-binaire.txt'),
    });
    expect(tailles(r).map(t => [t.fichier as string, t.taille, t.nuit])).toEqual([
      ['tests/o.nuit.test.ts', 'grand', true],
      ['tests/p.budget.test.ts', 'grand', true],
    ]);
    expect(verifier(r)).toEqual([]);
  });
});

describe('grillhouse-44b.10.4 critère 4 — the finding of the widened rule', () => {
  it('critère 4: a day test with the pattern is a finding of the same form, its message naming the widened rule', () => {
    const r = depot({ 'tests/o.test.ts': outil('outil-npx.txt'), 'tests/g.test.ts': GIT_SEUL });
    const constats = verifier(r) as { fichier: string; regle: string; message: string }[];
    expect(constats.map(c => [c.fichier, c.regle])).toEqual([['tests/o.test.ts', GRAND_DE_JOUR]]);
    expect(constats[0]?.message).toMatch(/projet d'essai/);
    expect(constats[0]?.message).toMatch(/produit ou le cadre/);
    expect(constats[0]?.message).toMatch(/nuit\.test/);
  });

  it('critère 4: the debt inscribed passes, and a new such test is refused', () => {
    const r = depot({ 'tests/o.test.ts': outil('outil-npx.txt') });
    const dette = { [GARDE]: { 'tests/o.test.ts': { [GRAND_DE_JOUR]: { count: 1 } } } };
    expect(juger(dette, GARDE, verifier(r)).refus).toEqual([]);
    writeFileSync(path.join(r, 'tests/neuf.test.ts'), outil('outil-moins-c.txt'));
    const { refus } = juger(dette, GARDE, verifier(r)) as { refus: { fichier: string }[] };
    expect(refus.map(c => c.fichier)).toEqual(['tests/neuf.test.ts']);
  });
});

describe('grillhouse-44b.10.4 critère 5 — the rule in the guard’s header and the package’s frame', () => {
  it('critère 5: the header of the guard says the rule', () => {
    const entete = texte(
      'packages/grillhouse/scripts/langages/typescript/tailles-des-tests.mjs'
    ).split('import ')[0];
    expect(entete).toMatch(/OUTILS_LOURDS/);
    expect(entete).toMatch(/api-extractor/);
  });

  it('critère 5: the CADRE of the package says the rule', () => {
    expect(texte('packages/grillhouse/docs/CADRE.md')).toMatch(/api-extractor/);
  });
});

// The texts of the frame that carry the rule, read as their reader reads them.
const texte = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');

describe('grillhouse-3dr.4 critères 1 et 2 — the rule in the charter and the skills', () => {
  it('critère 1: the common charter writes the three sizes, and the large test is a night test', () => {
    const charte = texte('mods/grillhouse/charte.md');
    const regle = charte.slice(charte.indexOf('**La taille d'));
    expect(regle).toMatch(/petit/);
    expect(regle).toMatch(/moyen/);
    expect(regle).toMatch(/grand[^.]*\*\.nuit\.test\.\*/);
  });

  it('critère 2: the testwriter chooses the smallest size that proves the criterion', () => {
    expect(texte('mods/grillhouse/skills/testwriter/SKILL.md')).toMatch(
      /\*\*La plus petite taille qui prouve\*\*/
    );
  });

  it('critère 2: the reviewer sends back a large test where a small one suffices', () => {
    expect(texte('mods/grillhouse/skills/relecteur/SKILL.md')).toMatch(
      /grand là où un petit suffit/
    );
  });
});
