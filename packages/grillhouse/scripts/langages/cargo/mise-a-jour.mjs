// What the module cargo brings to the update of a project (`grillhouse maj`,
// scripts/grillhouse-maj.mjs), the demand `miseAJour` of the join (scripts/jointure.d.ts), as the
// `init` generator of a plugin of Nx brings its tool to a workspace. The core writes the root
// package.json after, and reports the lines.
//
// - The template: `templates/cargo/` of the frame's files. Its package.json gives the frame's
//   scripts, which run the frame's commands (`grillhouse tests`, `grillhouse verifier`), and no
//   tool of npm.
// - Each other file of the template a project lacks is copied at its path: `deny.toml`, the
//   policy of cargo-deny, which refuses every licence without one (cargo-deny's code 4, the probe
//   of grillhouse-pkl.1); `.config/nextest.toml`, the project's configuration of nextest, which
//   leaves the frame's profile `grillhouse` to the frame (./nextest.toml); `rust-toolchain.toml`,
//   the toolchain and its components clippy and rustfmt, which the guards run. A file the project
//   holds is its own: never written again.
// - The root scripts `test`, `test:forcer` and `verifier` a project lacks become the template's:
//   the agents run `npm test`, the integration and the night `npm run verifier`. A project's own
//   script stays.
// - A Cargo.lock that git does not track is left to the project (`aFaire`, grillhouse-rph): the
//   line of ./commandes.mjs (`verrouNonVersionne`), the gesture named; the core writes it on the
//   error stream and plays no verification, which `--locked` would fail in a copy taken from git.
// - The generator: the index of the interfaces (./index-interfaces.mjs), run where the project
//   holds it, as the module typescript's.
// - The installation of its binaries (./binaires.json): the commands of ./binaires.mjs, which list
//   what cargo installed and install one binary by cargo-binstall, installed first when it lacks;
//   the core runs them.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verrouNonVersionne } from './commandes.mjs';
import { SORTIE } from './index-interfaces.mjs';

const BINAIRES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'binaires.mjs');

const GABARIT = 'templates/cargo';
const SCRIPTS_DES_TESTS = ['test', 'test:forcer', 'verifier'];

// The files under <dossier>, as paths from it.
const fichiers = (dossier, rel = '') =>
  readdirSync(path.join(dossier, rel), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? fichiers(dossier, path.join(rel, e.name)) : [path.join(rel, e.name)]
  );

/** @type {import('../../jointure.js').MiseAJour['appliquer']} */
function appliquer(projet, { p, modele, source }) {
  const gabarit = path.join(source, GABARIT);
  const copies = [];
  if (existsSync(gabarit)) {
    for (const f of fichiers(gabarit).sort()) {
      if (f === 'package.json' || existsSync(path.join(projet, f))) {
        continue;
      }
      mkdirSync(path.dirname(path.join(projet, f)), { recursive: true });
      copyFileSync(path.join(gabarit, f), path.join(projet, f));
      copies.push(f);
    }
  }
  p.scripts ??= {};
  const scripts = [];
  for (const nom of SCRIPTS_DES_TESTS) {
    const script = modele.scripts?.[nom];
    if (typeof script !== 'string' || typeof p.scripts[nom] === 'string') {
      continue;
    }
    p.scripts[nom] = script;
    scripts.push(nom);
  }
  const lignes = [];
  if (copies.length > 0) {
    lignes.push(
      `Gabarit cargo : ${copies.join(', ')} écrits ; ils sont au projet, la mise à jour n'y touche plus.`
    );
  }
  if (scripts.length > 0) {
    lignes.push(
      `Scripts des tests : ${scripts.map(n => `${n} (\`${p.scripts[n]}\`)`).join(', ')} écrits ; les agents lancent \`npm test\`, l'intégration et la nuit \`npm run verifier\`.`
    );
  }
  const verrou = verrouNonVersionne(projet);
  return {
    bilan: {
      gabarit: copies.length > 0 ? copies : null,
      scripts: scripts.length > 0 ? scripts : null,
    },
    lignes,
    aFaire: verrou ? [verrou] : [],
    installer: false,
    sansVerifier: null,
  };
}

/** The share of the module cargo in the update. */
export const miseAJour = {
  gabarit: GABARIT,
  appliquer,
  generateurs: [{ commande: 'index-interfaces', args: [], sortie: SORTIE }],
  installation: {
    liste: { script: BINAIRES, args: ['liste'] },
    installer: (nom, version) => ({ script: BINAIRES, args: ['installer', `${nom}@${version}`] }),
  },
};
