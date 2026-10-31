// The entries of the suite of conformity (scripts/conformite.mjs) for the module python, as the
// valid and invalid cases a rule of ESLint gives its RuleTester: each a trial, built under the
// directory the suite gives, with what a sound module answers on it.
//
// - A project of two packages, declared python in its architecture: `site` (its project
//   `generateur`, a test of the day `pages/test_pages.py`, a night test, a `conftest.py`, its
//   interface) and `outil` (its project `outil`, no test); the root's interface, and the index of
//   the interfaces they give, up to date. Committed: `projet`; the same, a source of `site` then
//   changed and a file out of every package added: `change`, measured from its commit; the same
//   with a second commit that changes `site`, adds the package `neuf` and removes `outil`: `lot`;
//   the same, the interface of `site` then changed, its index late: `enRetard`.
// - A directory without pyproject.toml: `vide`.
// - Two results directories of a run: every task and test green (`vert`); `site` red with a test
//   failed, `outil` at 75, a task not played (`defaut`).
// - `depots`: the repositories, for the tests of the module beside the suite.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ecrireDans = racine => (rel, texte) => {
  mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
  writeFileSync(path.join(racine, rel), texte);
};
const git = (racine, ...args) => execFileSync('git', ['-C', racine, ...args], { stdio: 'pipe' });
const tete = racine =>
  execFileSync('git', ['-C', racine, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// Commits every file of <racine>, a new repository.
function engager(racine) {
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  git(racine, 'config', 'commit.gpgsign', 'false');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'essai');
  return racine;
}

// The pyproject.toml of the project <nom>.
const manifeste = nom =>
  `[project]\nname = "${nom}"\nversion = "0.1.0"\nrequires-python = ">=3.10"\ndependencies = []\n\n[dependency-groups]\ntest = ["pytest>=8"]\n`;

const ARCHITECTURE =
  '# Architecture\n\n| Composant | Langage |\n| --- | --- |\n| `site` | python |\n| `outil` | python |\n| `neuf` | python |\n';
const INTERFACES = {
  'site/docs/INTERFACE.md': '# site — interface\n\n`site` génère les pages. Une seconde phrase.\n',
  'docs/INTERFACE.md': "# Le projet d'essai\n\nDeux paquets Python.\n",
};
/** The index of the interfaces the trial gives (./index-interfaces.mjs). */
export const INDEX = [
  '# Index des interfaces',
  '',
  'Généré depuis les `INTERFACE.md` des paquets Python ; ne pas éditer.',
  "Une ligne par composant ; l'interface donne le détail.",
  '',
  "## (racine) — Le projet d'essai",
  '',
  'Deux paquets Python. (`docs/INTERFACE.md`)',
  '',
  '## site — interface',
  '',
  '`site` génère les pages. (`site/docs/INTERFACE.md`)',
  '',
].join('\n');

// The project of the two packages in a new directory under <dans>, committed.
function projet(dans) {
  const racine = mkdtempSync(path.join(dans, 'projet-'));
  const ecrire = ecrireDans(racine);
  ecrire('package.json', JSON.stringify({ name: 'essai', private: true }));
  ecrire('docs/ARCHITECTURE.md', ARCHITECTURE);
  ecrire('README.md', "# Le projet d'essai\n");
  ecrire('.gitignore', '.venv\n.pytest_cache\n__pycache__\n');
  ecrire('site/pyproject.toml', manifeste('generateur'));
  ecrire('site/uv.lock', 'version = 1\n');
  ecrire('site/pages/generer.py', 'def generer():\n    return 1\n');
  ecrire('site/pages/test_pages.py', 'def test_generer():\n    assert True\n');
  ecrire('site/pages/site_nuit_test.py', 'def test_tout():\n    assert True\n');
  ecrire('site/conftest.py', '');
  ecrire('outil/pyproject.toml', manifeste('outil'));
  ecrire('outil/uv.lock', 'version = 1\n');
  ecrire('outil/outil.py', 'def outil():\n    return 1\n');
  for (const [f, t] of Object.entries(INTERFACES)) {
    ecrire(f, t);
  }
  ecrire('docs/agents/index-des-interfaces.md', INDEX);
  return engager(racine);
}

// A results directory under <dans>: the tasks <taches> (`[paquet, script, code]`), and the JUnit
// report of `site` (`[[fichier, test, echoue]…]`), its folder <dossier>.
function resultats(dans, taches, cas, dossier) {
  const d = mkdtempSync(path.join(dans, 'resultats-'));
  const ecrire = ecrireDans(d);
  ecrire(
    'python/1-1.json',
    `${JSON.stringify({
      taches: taches.map(([paquet, script, code]) => ({
        tache: `${paquet}#${script}`,
        paquet,
        dossier: paquet,
        script,
        tests: script === 'pytest',
        code,
        cache: null,
        journal: null,
      })),
      rapports: { '1-1-site.xml': dossier },
    })}\n`
  );
  const corps = cas
    .map(
      ([fichier, test, echoue]) =>
        `<testcase classname="x" name="${test}" file="${fichier}" line="1">${
          echoue ? '<failure message="assert 1 == 2">assert 1 == 2</failure>' : ''
        }</testcase>`
    )
    .join('');
  ecrire(
    'pytest/1-1-site.xml',
    `<?xml version="1.0"?><testsuites><testsuite name="pytest">${corps}</testsuite></testsuites>`
  );
  return d;
}

export default {
  // The trials under <dans>.
  preparer(dans) {
    const aJour = projet(dans);
    const vide = mkdtempSync(path.join(dans, 'vide-'));
    writeFileSync(path.join(vide, 'README.md'), 'aucun paquet\n');
    const change = projet(dans);
    const depuis = tete(change);
    writeFileSync(path.join(change, 'site/pages/generer.py'), 'def generer():\n    return 2\n');
    writeFileSync(path.join(change, 'notes.txt'), 'hors des paquets\n');
    const lot = projet(dans);
    const avantLeLot = tete(lot);
    const ecrireLot = ecrireDans(lot);
    ecrireLot('site/pages/generer.py', 'def generer():\n    return 3\n');
    ecrireLot('neuf/pyproject.toml', manifeste('neuf'));
    ecrireLot('neuf/neuf.py', 'def neuf():\n    return 1\n');
    rmSync(path.join(lot, 'outil'), { recursive: true, force: true });
    git(lot, 'add', '-A');
    git(lot, 'commit', '-q', '-m', 'lot');
    const enRetard = projet(dans);
    writeFileSync(
      path.join(enRetard, 'site/docs/INTERFACE.md'),
      '# site — interface\n\n`site` génère d’autres pages.\n'
    );
    const site = path.join(aJour, 'site');
    return {
      racine: aJour,
      depots: { projet: aJour, change, depuis, lot, avantLeLot, enRetard, vide },
      composants: {
        valide: vide,
        invalide: aJour,
        attendu: ['outil (outil)', 'site (generateur)'],
      },
      composantDe: {
        valide: [
          { fichier: 'site/pages/generer.py', composant: 'site' },
          { fichier: 'outil/outil.py', composant: 'outil' },
          { fichier: path.join(aJour, 'site/pyproject.toml'), composant: 'site' },
        ],
        invalide: [{ fichier: 'README.md' }, { fichier: 'docs/INTERFACE.md' }],
        attendu: [
          'README.md : hors de tout composant',
          'docs/INTERFACE.md : hors de tout composant',
        ],
      },
      lecteurs: {
        valide: { racine: vide, noms: [] },
        invalide: { racine: aJour, noms: ['generateur', 'absent'] },
        attendu: ['absent : sans fournisseur'],
      },
      touches: {
        valide: { racine: aJour, depuis: 'HEAD' },
        invalide: { racine: change, depuis },
        attendu: ['touché site', 'hors notes.txt'],
      },
      commandes: {
        valide: ['tester', 'verifier', 'typer', 'preparer', 'tests-de-nuit', 'index-interfaces'],
        invalide: ['tester', 'deployer'],
        attendu: ['deployer : absente'],
      },
      verdict: {
        valide: resultats(
          dans,
          [
            ['site', 'compileall', 0],
            ['site', 'pytest', 0],
          ],
          [['pages/test_pages.py', 'test_generer', false]],
          site
        ),
        invalide: resultats(
          dans,
          [
            ['outil', 'compileall', 75],
            ['site', 'pytest', 1],
            ['neuf', 'pytest', null],
          ],
          [
            ['pages/test_pages.py', 'test_generer', false],
            ['pages/test_pages.py', 'test_rendu', true],
          ],
          site
        ),
        attendu: [
          'outil#compileall à repasser',
          'site#pytest rouge (1), tests',
          'test test_pages.py › test_rendu',
        ],
      },
      estUnTest: {
        valide: [
          'site/pages/generer.py',
          'site/pyproject.toml',
          'site/uv.lock',
          'outil/outil.py',
          'README.md',
        ],
        invalide: ['site/pages/test_pages.py', 'site/conftest.py', 'site/tests/donnees.json'],
        attendu: [
          'site/pages/test_pages.py : joue, test',
          'site/conftest.py : test',
          'site/tests/donnees.json : test',
        ],
      },
      fichiersEngendres: {
        valide: aJour,
        invalide: enRetard,
        attendu: ["l'index des interfaces : en retard"],
      },
      gardes: { valide: ['tailles-des-tests', 'index-interfaces'] },
      elementsDuLot: {
        valide: { racine: aJour, avant: 'HEAD', apres: 'HEAD' },
        invalide: { racine: lot, avant: avantLeLot, apres: 'HEAD' },
        attendu: [
          'fichier neuf/neuf.py',
          'fichier neuf/pyproject.toml',
          'fichier outil/outil.py',
          'fichier outil/pyproject.toml',
          'fichier outil/uv.lock',
          'fichier site/pages/generer.py',
          'hors du service neuf/neuf.py',
          'hors du service outil/outil.py',
          'hors du service site/pages/generer.py',
        ],
      },
      // No shared test material in Python (./composants.mjs): the case has no defective entry.
      matieres: { valide: aJour, invalide: aJour, attendu: [] },
      joueDesTests: {
        valide: vide,
        invalide: aJour,
        attendu: ['site (generateur) : joue des tests'],
      },
    };
  },
};
