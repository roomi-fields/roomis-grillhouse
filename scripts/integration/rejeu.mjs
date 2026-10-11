// The replay of a lot in a clean copy, shared by the integration (scripts/integration/integrer.mjs,
// a lot on the main of the moment) and the queue (scripts/integration/file.mjs, a branch replaced
// on the main of the moment): the copy made ready, the project's commands, the scope of the suites,
// the suites compared by test name, the guards.
//
// - `ouvrirCopie` makes the copy <copie> ready on <ref>: detached, every untracked file removed, its
//   submodules set (`scripts/sous-modules.sh`, a local modification overwritten; a submodule the
//   project shares, `grillhouse.partage`, is linked to the main repository's instead), its
//   dependencies installed again when `package-lock.json` changes (`npm ci`), then built. An
//   existing copy that does not get ready is removed by `scripts/retirer-copie.sh --jetable` (local
//   work does not hold it, a lock does) and created again, once; a copy that does not get ready the
//   second time refuses, and so does a removal the script refuses, with its reason. Every command
//   of the project plays through `scripts/sous-modules.sh monter`: each submodule the preparation
//   linked is read-only, by the list the pose printed, whatever a command rewrites afterwards. With a
//   link and no possible mount (bwrap absent or refused), the copy refuses before any command runs.
// - `perimetre` is the scope of the suites for a set of files (see below); the project's choice
//   (`grillhouse.integration`: `impactes` by default, `complet`) decides in `portee`.
// - `suites` plays `npm run integration:suites -- --tous|<components>`, which writes the names of
//   its failing tests, one per line, to the file named by ROUGES.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composants as lesComposants, utilise } from '../consommateurs.mjs';

const SOUS_MODULES = fileURLToPath(new URL('../sous-modules.sh', import.meta.url));
export const RETIRER_COPIE = fileURLToPath(new URL('../retirer-copie.sh', import.meta.url));

export const lireJsonSiPresent = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

// The failing tests after the lot that the base did not have and that are not admitted.
export function nouveauxRouges(base, apres, admis = []) {
  const connus = new Set([...base, ...admis]);
  return [...new Set(apres)].filter(n => !connus.has(n));
}

// What the suites replay for a lot. `composants` are the components' directories relative to the
// root; `consommateurs` maps a component's directory to the directories of those that use it.
// - a file outside every component that is not a document: every suite, as such a file (a root
//   script, package.json, the lockfile, tsconfig, the CI, a setting) can change any of them;
// - a document outside every component (`estDocument`) counts for nothing: a lot made only of
//   such documents replays no suite (mode `aucun`, the guards alone);
// - otherwise: the components holding a file of the lot, whatever its nature (code, document,
//   manifest, data), and, transitively, those that depend on them, in order.
const SCRIPTS = /\.(mjs|js|cjs|ts|sh|py)$/;
const REGLAGES = /(\.json|(^|\/)fichiers\.txt)$/;
function estDocument(f) {
  if (f.startsWith('.claude/')) return !SCRIPTS.test(f) && !REGLAGES.test(f);
  return f.endsWith('.md');
}

export function perimetre(fichiers, composants, consommateurs) {
  const touches = new Set();
  for (const f of fichiers) {
    const c = composants.find(d => f.startsWith(`${d}/`));
    if (c) touches.add(c);
    else if (!estDocument(f)) return { mode: 'tous', composants: [] };
  }
  if (touches.size === 0) return { mode: 'aucun', composants: [] };
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

// The copy <copie> ready on <ref>, or `{ refus }`. `tmp` is a folder for the failing-test lists;
// `dire` writes a progress line. Returns the copy's tools: `dansCopie` (git in the copy), `npm`,
// `monter` (the command line of a mounted command), `construire`, `portee`, `suites`, `gardes`.
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
  const npm = (args, env = {}) => {
    const r = spawnSync('bash', monter('npm', ...args), {
      cwd: copie,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    process.stdout.write(r.stdout + r.stderr);
    return r;
  };
  const verrouNpm = path.join(copie, 'package-lock.json');
  if (existsSync(verrouNpm)) {
    const cle = path.join(copie, 'node_modules', '.integration-lock');
    const empreinte = readFileSync(verrouNpm, 'utf8');
    if (!existsSync(cle) || readFileSync(cle, 'utf8') !== empreinte) {
      if (npm(['ci', '--no-audit', '--no-fund', '--silent']).status !== 0) {
        return { refus: "Les dépendances de la copie ne s'installent pas." };
      }
      writeFileSync(cle, empreinte);
    }
  }
  const construire = () => npm(['run', '--silent', '--if-present', 'build']).status === 0;
  if (!construire()) return { refus: `${ref} ne se construit pas.` };
  dire(`✓ copie propre sur ${tete.slice(0, 7)}`);

  // The scope of the suites for <fichiers>: the touched components and those that depend on them.
  const portee = fichiers => {
    const comps = lesComposants(copie);
    const dirDe = new Map(comps.map(c => [c.nom, path.relative(copie, c.dir)]));
    const consommateurs = new Map();
    for (const [fournisseur, parConsommateur] of utilise(copie, comps)) {
      consommateurs.set(
        dirDe.get(fournisseur),
        [...parConsommateur.keys()].map(n => dirDe.get(n))
      );
    }
    // The project chooses at its installation (grill): `complet` replays every suite each time;
    // `impactes`, the default, what `perimetre` computes, every suite once a night.
    const reglage = lireJsonSiPresent(path.join(copie, 'package.json'))?.grillhouse?.integration;
    const champ =
      reglage === 'complet'
        ? { mode: 'tous', composants: [] }
        : perimetre(fichiers, [...dirDe.values()], consommateurs);
    const message =
      champ.mode === 'aucun'
        ? '✓ aucune suite : le lot ne contient que des documents hors de tout composant'
        : champ.mode === 'tous'
          ? reglage === 'complet'
            ? '✓ toutes les suites (réglage « complet »)'
            : '✓ toutes les suites : le lot touche un fichier hors de tout composant'
          : `✓ suites de : ${champ.composants.join(', ')}`;
    return { champ, message };
  };
  // The failing tests of one run of the suites over <champ>, by name; a run that fails without
  // naming a test leaves one name « (les suites sortent en <code> sans test nommé) ».
  const suites = (champ, nom) => {
    const rouges = path.join(tmp, nom);
    writeFileSync(rouges, '');
    const portee = champ.mode === 'tous' ? ['--tous'] : champ.composants;
    const r = npm(['run', '--silent', 'integration:suites', '--', ...portee], { ROUGES: rouges });
    const noms = readFileSync(rouges, 'utf8')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    if (r.status !== 0 && noms.length === 0)
      noms.push(`(les suites sortent en ${r.status} sans test nommé)`);
    return noms;
  };
  const gardes = () => npm(['run', '--silent', '--if-present', 'integration:gardes']);
  return { dansCopie, monter, npm, construire, portee, suites, gardes, tete };
}
