// The entries of the suite of conformity (scripts/conformite.mjs) for the module c, as the valid
// and invalid cases a rule of ESLint gives its RuleTester: each a trial, built under the directory
// the suite gives, with what a sound module answers on it.
//
// - A project of two packages, declared c in its architecture: `capteur` (its project `capteur`,
//   a test of the day `tests/test_capteur.c`, a helper, the CMakeLists.txt of tests/, its
//   interface) and `outil` (its project `outil`, no test); the root's interface, and the index of
//   the interfaces they give, up to date. Committed: `projet`; the same with a second commit that
//   changes `capteur`, adds the package `neuf` and removes `outil`: `lot`; the same, the interface
//   of `capteur` then changed, its index late: `enRetard`.
// - A directory without CMakeLists.txt: `vide`.
// - Two results directories of a run: every task and test green (`vert`); `capteur` red with a
//   test failed, `outil` at 75, a task not played (`defaut`).
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

// The CMakeLists.txt of the project <nom>.
const manifeste = nom => `cmake_minimum_required(VERSION 3.16)\nproject(${nom} C)\n`;

const ARCHITECTURE =
  '# Architecture\n\n| Composant | Langage |\n| --- | --- |\n| `capteur` | c |\n| `outil` | c |\n| `neuf` | c |\n';
const INTERFACES = {
  'capteur/docs/INTERFACE.md':
    '# capteur — interface\n\n`capteur` lit les mesures. Une seconde phrase.\n',
  'docs/INTERFACE.md': "# Le projet d'essai\n\nDeux paquets C.\n",
};
/** The index of the interfaces the trial gives (./index-interfaces.mjs). */
export const INDEX = [
  '# Index des interfaces',
  '',
  'Généré depuis les `INTERFACE.md` des paquets C ; ne pas éditer.',
  "Une ligne par composant ; l'interface donne le détail.",
  '',
  '## capteur — interface',
  '',
  '`capteur` lit les mesures. (`capteur/docs/INTERFACE.md`)',
  '',
  "## (racine) — Le projet d'essai",
  '',
  'Deux paquets C. (`docs/INTERFACE.md`)',
  '',
].join('\n');

// The project of the two packages in a new directory under <dans>, committed.
function projet(dans) {
  const racine = mkdtempSync(path.join(dans, 'projet-'));
  const ecrire = ecrireDans(racine);
  ecrire('package.json', JSON.stringify({ name: 'essai', private: true }));
  ecrire('docs/ARCHITECTURE.md', ARCHITECTURE);
  ecrire('README.md', "# Le projet d'essai\n");
  ecrire('.gitignore', '.build-cmake\n');
  ecrire('capteur/CMakeLists.txt', manifeste('capteur'));
  ecrire('capteur/src/capteur.c', 'int capteur(void) { return 1; }\n');
  ecrire('capteur/tests/CMakeLists.txt', 'file(GLOB TESTS CONFIGURE_DEPENDS test_*.c)\n');
  ecrire('capteur/tests/test_capteur.c', 'int main(void) { return 0; }\n');
  ecrire('capteur/tests/aide.h', '#define AIDE 1\n');
  ecrire('outil/CMakeLists.txt', manifeste('outil'));
  ecrire('outil/src/outil.c', 'int outil(void) { return 1; }\n');
  for (const [f, t] of Object.entries(INTERFACES)) {
    ecrire(f, t);
  }
  ecrire('docs/agents/index-des-interfaces.md', INDEX);
  return engager(racine);
}

// A results directory under <dans>: the tasks <taches> (`[paquet, script, code]`), and the JUnit
// report of `capteur` (`[[test, echoue]…]`), its folder <dossier>.
function resultats(dans, taches, cas, dossier) {
  const d = mkdtempSync(path.join(dans, 'resultats-'));
  const ecrire = ecrireDans(d);
  ecrire(
    'c/1-1.json',
    `${JSON.stringify({
      taches: taches.map(([paquet, script, code]) => ({
        tache: `${paquet}#${script}`,
        paquet,
        dossier: paquet,
        script,
        tests: script === 'ctest',
        code,
        cache: null,
        journal: null,
      })),
      rapports: { '1-1-capteur.xml': dossier },
    })}\n`
  );
  const corps = cas
    .map(
      ([test, echoue]) =>
        `<testcase name="${test}" classname="${test}" time="0.001" status="${echoue ? 'fail' : 'run'}">${
          echoue ? '<failure message="Failed"/><system-out>attendu 1, obtenu 2</system-out>' : ''
        }</testcase>`
    )
    .join('');
  ecrire(
    'ctest/1-1-capteur.xml',
    `<?xml version="1.0" encoding="UTF-8"?><testsuite name="(empty)">${corps}</testsuite>`
  );
  return d;
}

export default {
  // The trials under <dans>.
  preparer(dans) {
    const aJour = projet(dans);
    const vide = mkdtempSync(path.join(dans, 'vide-'));
    writeFileSync(path.join(vide, 'README.md'), 'aucun paquet\n');
    const lot = projet(dans);
    const avantLeLot = tete(lot);
    const ecrireLot = ecrireDans(lot);
    ecrireLot('capteur/src/capteur.c', 'int capteur(void) { return 3; }\n');
    ecrireLot('neuf/CMakeLists.txt', manifeste('neuf'));
    ecrireLot('neuf/src/neuf.c', 'int neuf(void) { return 1; }\n');
    rmSync(path.join(lot, 'outil'), { recursive: true, force: true });
    git(lot, 'add', '-A');
    git(lot, 'commit', '-q', '-m', 'lot');
    const enRetard = projet(dans);
    writeFileSync(
      path.join(enRetard, 'capteur/docs/INTERFACE.md'),
      '# capteur — interface\n\n`capteur` lit d’autres mesures.\n'
    );
    const capteur = path.join(aJour, 'capteur');
    return {
      racine: aJour,
      depots: { projet: aJour, lot, avantLeLot, enRetard, vide },
      composants: {
        valide: vide,
        invalide: aJour,
        attendu: ['capteur (capteur)', 'outil (outil)'],
      },
      composantDe: {
        valide: [
          { fichier: 'capteur/src/capteur.c', composant: 'capteur' },
          { fichier: 'outil/src/outil.c', composant: 'outil' },
          { fichier: path.join(aJour, 'capteur/CMakeLists.txt'), composant: 'capteur' },
        ],
        invalide: [{ fichier: 'README.md' }, { fichier: 'docs/INTERFACE.md' }],
        attendu: [
          'README.md : hors de tout composant',
          'docs/INTERFACE.md : hors de tout composant',
        ],
      },
      lecteurs: {
        valide: { racine: vide, noms: [] },
        invalide: { racine: aJour, noms: ['capteur', 'absent'] },
        attendu: ['absent : sans fournisseur'],
      },
      commandes: {
        valide: ['tester', 'verifier', 'typer', 'construire', 'index-interfaces'],
        invalide: ['tester', 'deployer'],
        attendu: ['deployer : absente'],
      },
      verdict: {
        valide: resultats(
          dans,
          [
            ['capteur', 'compile', 0],
            ['capteur', 'ctest', 0],
          ],
          [['test_capteur', false]],
          capteur
        ),
        invalide: resultats(
          dans,
          [
            ['outil', 'compile', 75],
            ['capteur', 'ctest', 1],
            ['neuf', 'ctest', null],
          ],
          [
            ['test_capteur', false],
            ['test_rendu', true],
          ],
          capteur
        ),
        attendu: [
          'outil#compile à repasser',
          'capteur#ctest rouge (1), tests',
          'test test_rendu.c › test_rendu',
        ],
      },
      estUnTest: {
        valide: [
          'capteur/src/capteur.c',
          'capteur/CMakeLists.txt',
          'outil/src/outil.c',
          'README.md',
        ],
        invalide: [
          'capteur/tests/test_capteur.c',
          'capteur/tests/aide.h',
          'capteur/tests/CMakeLists.txt',
        ],
        attendu: [
          'capteur/tests/test_capteur.c : joue, test',
          'capteur/tests/aide.h : test',
          'capteur/tests/CMakeLists.txt : test',
        ],
      },
      fichiersEngendres: {
        valide: aJour,
        invalide: enRetard,
        attendu: ["l'index des interfaces : en retard"],
      },
      gardes: { valide: ['index-interfaces'] },
      elementsDuLot: {
        valide: { racine: aJour, avant: 'HEAD', apres: 'HEAD' },
        invalide: { racine: lot, avant: avantLeLot, apres: 'HEAD' },
        attendu: [
          'fichier capteur/src/capteur.c',
          'fichier neuf/CMakeLists.txt',
          'fichier neuf/src/neuf.c',
          'fichier outil/CMakeLists.txt',
          'fichier outil/src/outil.c',
          'hors du service capteur/src/capteur.c',
          'hors du service neuf/src/neuf.c',
          'hors du service outil/src/outil.c',
        ],
      },
      // No shared test material in C (./composants.mjs): the case has no defective entry.
      matieres: { valide: aJour, invalide: aJour, attendu: [] },
      joueDesTests: {
        valide: vide,
        invalide: aJour,
        attendu: ['capteur (capteur) : joue des tests'],
      },
    };
  },
};
