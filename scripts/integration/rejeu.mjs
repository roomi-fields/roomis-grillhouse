// The replay of a lot in a clean copy, shared by the integration (scripts/integration/integrer.mjs,
// a lot on the main of the moment) and the queue (scripts/integration/file.mjs, a branch replaced
// on the main of the moment): the copy made ready, the project's commands, its tests.
//
// - `ouvrirCopie` makes the copy <copie> ready on <ref>: detached, every untracked file removed, its
//   submodules set (`scripts/sous-modules.sh`, a local modification overwritten; a submodule the
//   project shares, `grillhouse.partage`, is linked to the main repository's instead), its
//   dependencies made to agree with its lock file and manifests (below). It builds nothing: the
//   tests build. An existing copy that does not get ready is removed by
//   `scripts/retirer-copie.sh --jetable` (local work does not hold it, a lock does) and created
//   again, once; a copy that does not get ready the second time refuses, and so does a removal the
//   script refuses, with its reason. Every command of the project plays through
//   `scripts/sous-modules.sh monter`: each submodule the preparation linked is read-only, by the
//   list the pose printed, whatever a command rewrites afterwards. With a link and no possible
//   mount (bwrap absent or refused), the copy refuses before any command runs.
// - The dependencies follow the lock file and the manifests of the moment. One function (`accorder`,
//   which `ouvrirCopie` hands out as `installer`) compares the fingerprint of the lock file and of
//   the manifests (every `package.json` git tracks) with the key
//   `node_modules/.integration-lock`, runs `npm ci` when they differ and writes the key again; a
//   failing install gives `DEPENDANCES_REFUSEES`, the one form of that refusal. It runs at the
//   opening, and the consumer calls `installer` once the lot is in the copy, before the tests: a
//   lot that changes the lock file or a manifest is installed as the continuous integration
//   installs it (`npm ci` refuses a lock file in disagreement with its manifest). The tests run on
//   dependencies in agreement, and they neither read the key nor install.
// - `tester` plays `npm run verifier` in the copy: Turborepo builds the project, then plays its
//   guards and its tests beside each other (`turbo.json`), each task kept in the cache of the main
//   tree (`.turbo/cache`, shared by every copy), so a task whose inputs an earlier run already
//   played replays its log. It gives the command's result, green (status 0) or red, its output
//   written as it comes.
// - Every command of the project run in the copy (`lancer`: the install, the tests) leaves the
//   index of its copy up to date, green or red: the consumers that apply a lot with `--index` (the
//   integration, the queue) read an index that matches the files the command touched, and none
//   refreshes for its own account.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOUS_MODULES = fileURLToPath(new URL('../sous-modules.sh', import.meta.url));
export const RETIRER_COPIE = fileURLToPath(new URL('../retirer-copie.sh', import.meta.url));

const VERROU = 'package-lock.json';
const DEPENDANCES_REFUSEES = "Les dépendances de la copie ne s'installent pas.";
// The most output a command of the project may write: a whole run of the tests, logs included.
const SORTIE_MAX = 256 * 1024 * 1024;

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

// The copy <copie> ready on <ref>, or `{ refus }`. `dire` writes a progress line. Returns the
// copy's tools: `dansCopie` (git in the copy), `monter` (the command line of a mounted command),
// `installer`, `tester`, and `tete`, the commit the copy was made ready on.
export function ouvrirCopie({ racine, copie, ref, dire }) {
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
  const lancer = (commande, args) => {
    const r = spawnSync('bash', monter(commande, ...args), {
      cwd: copie,
      encoding: 'utf8',
      maxBuffer: SORTIE_MAX,
    });
    process.stdout.write(r.stdout + r.stderr);
    // After every command, green or red, `git update-index -q --refresh` re-reads the stat data of
    // the files it touched (a hard link changes an inode date), as git does before it judges a
    // tree. A refresh that fails changes nothing to the result, which is the command's.
    dansCopie('update-index', '-q', '--refresh');
    return r;
  };
  const npm = args => lancer('npm', args);
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

  // The checks of the copy: Turborepo builds, then plays the guards and the tests.
  const tester = () => npm(['run', 'verifier']);
  return { dansCopie, monter, installer: accorder, tester, tete };
}
