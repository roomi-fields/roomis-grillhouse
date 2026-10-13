// The replay of a lot in a clean copy, shared by the integration (scripts/integration/integrer.mjs,
// a lot on the main of the moment) and the queue (scripts/integration/file.mjs, a branch replaced
// on the main of the moment): the copy made ready, the project's commands, the scope of the suites,
// the suites compared by test name, the guards.
//
// - `ouvrirCopie` makes the copy <copie> ready on <ref>: detached, every untracked file removed, its
//   submodules set (`scripts/sous-modules.sh`, a local modification overwritten; a submodule the
//   project shares, `grillhouse.partage`, is linked to the main repository's instead), its
//   dependencies made to agree with its lock file and manifests (below). It builds nothing:
//   the build comes after the lots, as soon as a suite or a guard reads the build (main is built only
//   when one of its suites plays), through the one entry point that builds
//   (scripts/integration/constructions.mjs: a build whose fingerprint is in the store is restored,
//   not done again; the base and the lot each read the build of their own content). An existing
//   copy that does not get ready is removed by `scripts/retirer-copie.sh --jetable` (local work
//   does not hold it, a lock does) and created again, once; a copy that does not get ready the
//   second time refuses, and so does a removal the script refuses, with its reason. Every command
//   of the project plays through `scripts/sous-modules.sh monter`: each submodule the preparation
//   linked is read-only, by the list the pose printed, whatever a command rewrites afterwards. With a
//   link and no possible mount (bwrap absent or refused), the copy refuses before any command runs.
// - The dependencies follow the lock file and the manifests of the moment. One function (`accorder`,
//   which `ouvrirCopie` hands out as `installer`) compares the fingerprint of the lock file and of
//   the manifests (every `package.json` git tracks) with the key
//   `node_modules/.integration-lock`, runs `npm ci` when they differ and writes the key again; a
//   failing install gives `DEPENDANCES_REFUSEES`, the one form of that refusal. It runs at the
//   opening, and the consumer calls `installer` once the lot is in the copy, before any suite or
//   guard: a lot that changes the lock file or a manifest is installed as the continuous
//   integration installs it (`npm ci` refuses a lock file in disagreement with its manifest). The
//   suites and the guards run on dependencies in agreement, and none reads the key or installs.
// - `perimetre` is the scope of the suites for a set of files (see below); the project's choice
//   (`grillhouse.integration`: `impactes` by default, `complet`) decides in `portee`.
// - `suites` plays `npm test -- <scope>` (scripts/integration/suites-vitest.mjs: `--tous`, the
//   components' directories, `--racine`, or the test files of the lot that exist in the copy), which
//   writes the names of its failing tests, one per line, to the file named by ROUGES. It builds the
//   project (the entry point) just before, only when a test file of the call plays, that is when one
//   has no trace: the launcher says so (`--a-jouer`, scripts/integration/suites-vitest.mjs), and a
//   launcher that cannot tell leaves the project built; a call whose test files are all kept builds
//   nothing.
// - `gardes` plays `npm run integration:gardes` (scripts/integration/gardes.mjs). The project is
//   built after the lots: by the `suites` of the lot when one plays, otherwise by `gardes` when a
//   control of `grillhouse:gardes` follows its build step (it reads the build). No control is left
//   out.
// - Every command of the project run in the copy (`lancer`: the install, the build, the suites,
//   the guards) leaves the index of its copy up to date, green or red: the consumers that apply a
//   lot with `--index` (the integration, the queue) read an index that matches the files the
//   command touched, and none refreshes for its own account.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composants as lesComposants, NOM_DE_TEST, dependances } from '../consommateurs.mjs';
import { isTestFile } from '../verrous/verrou.mjs';
import { etapesDesGardes } from './gardes.mjs';

const SOUS_MODULES = fileURLToPath(new URL('../sous-modules.sh', import.meta.url));
const CONSTRUCTIONS = fileURLToPath(new URL('./constructions.mjs', import.meta.url));
// The exit code of the launcher's `--a-jouer` when every test file of the call has its trace.
const TOUT_GARDE = 7;
const LANCEUR = fileURLToPath(new URL('./suites-vitest.mjs', import.meta.url));
export const RETIRER_COPIE = fileURLToPath(new URL('../retirer-copie.sh', import.meta.url));

export const lireJsonSiPresent = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

// The failing tests after the lot that the base did not have and that are not admitted.
export function nouveauxRouges(base, apres, admis = []) {
  const connus = new Set([...base, ...admis]);
  return [...new Set(apres)].filter(n => !connus.has(n));
}

// What the tests replay for a lot. `composants` are the components' directories relative to the
// root; `consommateurs` maps a component's directory to the directories of those that depend on it
// (`dependances` of scripts/consommateurs.mjs: production consumptions and links of shared test material);
// `lus` are the root paths the project declares read by its suites (`grillhouse.lusParLesSuites`,
// files or folders). The lock file of the dependencies is always read.
// - a file the lot touches that the project declares read, or the lock file: every suite (mode
//   `tous`), as it can change any of them;
// - a lot made only of test files: these files alone (mode `tests`; the replay hands each copy those
//   that exist there);
// - otherwise the components holding a file of the lot, whatever its nature (code, document,
//   manifest, data), and, transitively, those that depend on them, in order (mode `composants`);
// - otherwise a file of a test folder outside every component (a helper, test material): the root
//   suite (mode `racine`);
// - a file outside every component that nothing declares read replays nothing: with no other file,
//   no suite (mode `aucun`, the guards alone).
const VERROU = 'package-lock.json';
const DEPENDANCES_REFUSEES = "Les dépendances de la copie ne s'installent pas.";
const nu = p => p.replace(/^\.\//, '').replace(/\/+$/, '');

export function perimetre(fichiers, composants, consommateurs, lus = []) {
  const declares = lus.map(nu);
  const lu = f => f === VERROU || declares.some(d => f === d || f.startsWith(`${d}/`));
  if (fichiers.some(lu)) return { mode: 'tous', composants: [] };
  if (fichiers.length > 0 && fichiers.every(f => NOM_DE_TEST.test(f))) {
    return { mode: 'tests', composants: [], tests: [...fichiers] };
  }
  const touches = new Set();
  for (const f of fichiers) {
    const c = composants.find(d => f.startsWith(`${d}/`));
    if (c) touches.add(c);
  }
  if (touches.size === 0) {
    const racine = fichiers.some(f => isTestFile(f));
    return { mode: racine ? 'racine' : 'aucun', composants: [] };
  }
  const file = [...touches];
  while (file.length) {
    for (const d of consommateurs.get(file.pop()) ?? []) {
      if (!touches.has(d)) {
        touches.add(d);
        file.push(d);
      }
    }
  }
  return { mode: 'composants', composants: [...touches].sort() };
}

// The fingerprint of what `npm ci` reads in <copie>: the lock file at <verrou> and every
// `package.json` git tracks (the root's and each workspace's, whatever pattern declares it: a
// manifest too many costs one more `npm ci`, a manifest missed lets a disagreement pass).
// `dansCopie` is git in the copy.
function empreinteDesDependances(copie, verrou, dansCopie) {
  const suivis = dansCopie('ls-files', '-z', '--', ':(glob)**/package.json')
    .stdout.split('\0')
    .filter(Boolean)
    .sort();
  const h = createHash('sha256').update(readFileSync(verrou));
  for (const f of suivis) h.update(`\0${f}\0`).update(readFileSync(path.join(copie, f)));
  return h.digest('hex');
}

// The copy <copie> ready on <ref>, or `{ refus }`. `tmp` is a folder for the failing-test lists;
// `dire` writes a progress line. Returns the copy's tools: `dansCopie` (git in the copy), `npm`,
// `monter` (the command line of a mounted command), `installer`, `portee`, `suites`, `gardes`.
export function ouvrirCopie({ racine, copie, ref, tmp, dire }) {
  const git = (...args) => spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  const dansCopie = (...args) => spawnSync('git', ['-C', copie, ...args], { encoding: 'utf8' });
  const tete = git('rev-parse', ref).stdout.trim();
  let partages = '';
  const preparer = () => {
    const prete = existsSync(copie)
      ? dansCopie('checkout', '-q', '--detach', '--force', tete).status === 0 &&
        dansCopie('clean', '-q', '-f', '-d', '-x', '-e', 'node_modules').status === 0
      : git('worktree', 'add', '-q', '--detach', copie, tete).status === 0;
    if (!prete) return `La copie ${copie} ne se prépare pas.`;
    const poses = spawnSync('bash', [SOUS_MODULES, 'pose', copie], { encoding: 'utf8' });
    if (poses.status !== 0) return `La copie ne pose pas ses sous-modules : ${poses.stderr.trim()}`;
    partages = poses.stdout;
    return null;
  };
  const existait = existsSync(copie);
  let refus = preparer();
  if (refus && existait) {
    const retrait = spawnSync('bash', [RETIRER_COPIE, '--jetable', copie], {
      cwd: racine,
      encoding: 'utf8',
    });
    if (retrait.status !== 0) {
      return { refus: `${refus}\nLa copie ne se retire pas : ${retrait.stderr.trim()}` };
    }
    refus = preparer();
  }
  if (refus) return { refus };
  const monter = (...commande) => [
    SOUS_MODULES,
    'monter',
    copie,
    '--partages',
    partages,
    ...commande,
  ];
  const montage = spawnSync('bash', monter('true'), { encoding: 'utf8' });
  if (montage.status !== 0) return { refus: montage.stderr.trim() };
  const lancer = (commande, args, env = {}) => {
    const r = spawnSync('bash', monter(commande, ...args), {
      cwd: copie,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    process.stdout.write(r.stdout + r.stderr);
    // After every command, green or red, `git update-index -q --refresh` re-reads the stat data of
    // the files it touched (a hard link changes an inode date), as git does before it judges a
    // tree. A refresh that fails changes nothing to the result, which is the command's.
    dansCopie('update-index', '-q', '--refresh');
    return r;
  };
  const npm = (args, env = {}) => lancer('npm', args, env);
  // The one point that makes the dependencies agree with the lock file and the manifests of the
  // moment: the key of node_modules is compared with their fingerprint, `npm ci` runs when they
  // differ, the key is written again. Null when they agree, else the refusal.
  const accorder = () => {
    const verrouNpm = path.join(copie, VERROU);
    if (!existsSync(verrouNpm)) return null;
    const cle = path.join(copie, 'node_modules', '.integration-lock');
    const empreinte = empreinteDesDependances(copie, verrouNpm, dansCopie);
    if (existsSync(cle) && readFileSync(cle, 'utf8') === empreinte) return null;
    if (npm(['ci', '--no-audit', '--no-fund', '--silent']).status !== 0)
      return DEPENDANCES_REFUSEES;
    writeFileSync(cle, empreinte);
    return null;
  };
  const refusOuverture = accorder();
  if (refusOuverture) return { refus: refusOuverture };
  dire(`✓ copie propre sur ${tete.slice(0, 7)}`);

  // The scope of the suites for <fichiers>: the touched components and those that depend on them.
  const portee = fichiers => {
    const comps = lesComposants(copie);
    const dirDe = new Map(comps.map(c => [c.nom, path.relative(copie, c.dir)]));
    const consommateurs = new Map();
    for (const [consommateur, fournisseurs] of dependances(copie)) {
      for (const fournisseur of fournisseurs) {
        const dir = dirDe.get(fournisseur);
        consommateurs.set(dir, [...(consommateurs.get(dir) ?? []), dirDe.get(consommateur)]);
      }
    }
    // The project chooses at its installation (grill): `complet` replays every suite each time;
    // `impactes`, the default, what `perimetre` computes, every suite once a night.
    const grillhouse = lireJsonSiPresent(path.join(copie, 'package.json'))?.grillhouse;
    const reglage = grillhouse?.integration;
    const lus = Array.isArray(grillhouse?.lusParLesSuites) ? grillhouse.lusParLesSuites : [];
    const champ =
      reglage === 'complet'
        ? { mode: 'tous', composants: [] }
        : perimetre(fichiers, [...dirDe.values()], consommateurs, lus);
    const message = {
      aucun: '✓ aucune suite : le lot ne touche aucun fichier que les suites lisent',
      tous:
        reglage === 'complet'
          ? '✓ toutes les suites (réglage « complet »)'
          : '✓ toutes les suites : le lot touche un chemin que les suites lisent',
      tests: `✓ ces tests seuls : ${(champ.tests ?? []).join(', ')}`,
      racine: '✓ la suite de la racine : le lot touche ses aides de test',
      composants: `✓ suites de : ${champ.composants.join(', ')}`,
    }[champ.mode];
    return { champ, message };
  };
  // The failing tests of one run of the tests over <champ>, by name; a run that fails without
  // naming a test leaves one name « (les suites sortent en <code> sans test nommé) ». The project
  // is built first when a test file of the run plays; `construit` says the lot was built (not the
  // base).
  let construit = false;
  const construire = () => lancer('node', [CONSTRUCTIONS]).status === 0;
  const suites = (champ, nom) => {
    const rouges = path.join(tmp, nom);
    writeFileSync(rouges, '');
    const tests =
      champ.mode === 'tests' ? champ.tests.filter(f => existsSync(path.join(copie, f))) : [];
    if (champ.mode === 'tests' && tests.length === 0) return [];
    const portee =
      champ.mode === 'tous'
        ? ['--tous']
        : champ.mode === 'racine'
          ? ['--racine']
          : champ.mode === 'tests'
            ? tests
            : champ.composants;
    const sonde = spawnSync('node', [LANCEUR, '--a-jouer', ...portee], {
      cwd: copie,
      stdio: 'ignore',
    });
    const jouera = sonde.status !== TOUT_GARDE;
    if (jouera && !construire()) {
      return ['(les suites sortent en 1 sans test nommé : la construction échoue)'];
    }
    if (nom !== 'base') construit = jouera;
    const r = npm(['test', '--ignore-scripts', '--silent', '--', ...portee], { ROUGES: rouges });
    const noms = readFileSync(rouges, 'utf8')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    if (r.status !== 0 && noms.length === 0)
      noms.push(`(les suites sortent en ${r.status} sans test nommé)`);
    return noms;
  };
  // The guards. A control that follows the build step of `grillhouse:gardes` reads the build: the
  // project is built first unless the suites of the lot did.
  const gardes = () => {
    const scripts = lireJsonSiPresent(path.join(copie, 'package.json'))?.scripts;
    const lisent = etapesDesGardes(scripts)?.lisentLaConstruction ?? [];
    if (scripts?.['integration:gardes'] && lisent.length > 0 && !construit) {
      if (!construire()) return { status: 1, stdout: '', stderr: 'La construction échoue.\n' };
      construit = true;
    }
    return npm(['run', '--silent', '--if-present', 'integration:gardes']);
  };
  return { dansCopie, monter, npm, installer: accorder, portee, suites, gardes, tete };
}
