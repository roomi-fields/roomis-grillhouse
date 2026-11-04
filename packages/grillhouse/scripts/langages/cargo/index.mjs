// The module of language cargo: what the core asks of a language (scripts/jointure.d.ts,
// docs/INTERFACE.md), answered for a workspace of cargo by cargo itself (`cargo metadata`,
// nextest, cargo-deny), as Pants's Rust backend and Bazel's rules_rust read a Cargo workspace.
// The core loads it by scripts/langages.mjs, and this module imports of the core its published
// entries alone.
//
// - The manifest of its package, which the guard of the languages asks of a package the
//   architecture declares cargo (`manifeste`): a Cargo.toml. Its one tool of npm is what its scripts import, smol-toml, the
//   reader of a Cargo.toml (`outils`, an optional peer of the package, which the update adds to a
//   project of cargo alone): cargo and its subcommands live on the machine, and the update
//   installs the binaries the module runs, nextest, cargo-deny and sccache, at their versions
//   (`binaires`, ./binaires.json). What cargo writes in a project: `target` (`ignorer`).
// - Where cargo writes, which the envelope opens to a session (`sorties`), and the rules that
//   refuse a role that writes the test runner run directly (`droits`).
// - The components, a file's, the shared test material, the components that play tests, the
//   readers of a crate, the rule of a test file and what the testwriter writes of the manifests
//   (./composants.mjs).
// - The crates touched since a commit and their dependents (./touches.mjs).
// - The elements of a lot, one per crate (./elements-du-lot.mjs).
// - The commands `tester`, `verifier`, `typer`, `preparer` and `tests-de-nuit` (./commandes.mjs),
//   each described, `{ script, args }`, never run, `preparer` played by the integration before the
//   verification, `tests-de-nuit` by the night (the test targets `tests/*_nuit.rs`, then the time
//   budget benches `tests/*_budget.rs`, which the day leaves out);
//   the verdict of a run (./verdict.mjs). The tool of a test's temporary directory, the crate
//   `tempfile`, and its guard: `tester` and `verifier` play under a base of their pass, named in
//   TMPDIR, TMP and TEMP, and fail naming what the tests left there (./commandes.mjs).
// - The generated file, the index of the interfaces (./index-interfaces.mjs), its command and its
//   check; the guards of structure, in the order they play: the sizes of the tests
//   (./tailles-des-tests.mjs), clippy (./clippy.mjs), the boundaries between crates
//   (./frontieres.mjs), the index of the interfaces up to date, each a command by its name too
//   (./commandes.mjs), which the line of a red guard names; the entries of the index of each
//   interface (`entreesDeLIndex`), which the core assembles in a project of several languages.
// - Its migrations (./migrations/): 0.28.4, the large tests of the day a project holds inscribed
//   in its debt when the guard of the sizes arrives.
// - Its share of the update (./mise-a-jour.mjs, `miseAJour`): the template of a project of cargo
//   (`templates/cargo/`) and its test scripts.
// - The skeleton of a new crate (./squelette.mjs, `squelette`), which `grillhouse paquet` writes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandes, fichierHorsDuJour, GARDES } from './commandes.mjs';
import {
  composantDans,
  composants,
  estUnTest,
  arbreDAvant,
  envDArbre,
  testsDeHead,
  joueDesTests,
  lecteurs,
  liensDuManifeste,
  manifestes,
  matieres,
  nomDuManifeste,
} from './composants.mjs';
import { elementsDuLot } from './elements-du-lot.mjs';
import { enRetard, entreesDeLIndex, SORTIE } from './index-interfaces.mjs';
import { miseAJour } from './mise-a-jour.mjs';
import * as taillesDesTests from './migrations/0.28.4-tailles-des-tests.mjs';
import { squelette } from './squelette.mjs';
import { CACHE, CIBLES } from './sccache.mjs';
import { touches } from './touches.mjs';
import { verdict } from './verdict.mjs';

// The scripts of this module, beside this file.
const ici = nom => path.join(path.dirname(fileURLToPath(import.meta.url)), nom);

export default {
  nom: 'cargo',
  manifeste: 'Cargo.toml',
  nomDuManifeste,
  liensDuManifeste,
  // The reader of TOML by which the lock judges a Cargo.toml (./composants.mjs, `manifestes`).
  outils: ['smol-toml'],
  // The binaries the module runs, each at an exact version: nextest and cargo-deny at the ones the
  // probe of grillhouse-pkl.1 measured; sccache, the cache of compilation common to the copies
  // (./sccache.mjs), at the last release of mozilla/sccache, v0.19.0 (2026-10-24).
  binaires: JSON.parse(readFileSync(ici('binaires.json'), 'utf8')),
  // What cargo writes in a project: its target directory.
  ignorer: ['target'],
  // Where cargo writes, in writing: the target directory of the workspace; in its home, the
  // registry's index and sources, the git dependencies, cargo-deny's advisories, and the files of
  // its locks and of the SQLite cache of its packages (`.package-cache`, `.package-cache-mutate`,
  // `.global-cache`), files without a trailing `/`; the cache of sccache, common to the copies
  // (./sccache.mjs), where a server of sccache the session starts writes; the targets of the
  // workspaces rooted in the temporary directory, `~/.cache/grillhouse/cargo/` (./sccache.mjs). What it reads, read-only: its home, `~/.cargo`
  // (its binaries, its `env`, which the shells source, and its configuration stay unwritten), and
  // rustup's toolchains, `~/.rustup`. Measured on 2026-10-30: `cargo fetch --locked` of
  // osc-bridge in bwrap with these mounts alone, green, the cache of its packages written.
  sorties: {
    ecrites: [
      'target/',
      '~/.cargo/registry/',
      '~/.cargo/git/',
      '~/.cargo/advisory-dbs/',
      '~/.cargo/.package-cache',
      '~/.cargo/.package-cache-mutate',
      '~/.cargo/.global-cache',
      CACHE,
      CIBLES,
    ],
    propres: [],
    lues: ['~/.cargo/', '~/.rustup/'],
  },
  // The test runner run directly, cargo's or nextest: `npm test` and `npm run verifier` play it.
  droits: [
    'Bash(cargo test*)',
    'Bash(cargo t)',
    'Bash(cargo t *)',
    'Bash(cargo nextest*)',
    'Bash(cargo-nextest*)',
  ],
  composants,
  composantDe: (racine, fichier) => composantDans(composants(racine), racine, fichier),
  matieres,
  joueDesTests,
  lecteurs,
  touches,
  elementsDuLot,
  commandes,
  verdict,
  estUnTest,
  horsDuJour: fichierHorsDuJour,
  arbreDAvant,
  envDArbre,
  testsDeHead,
  manifestes,
  fichiersEngendres: () => [
    {
      nom: "l'index des interfaces",
      commande: `node ${JSON.stringify(ici('index-interfaces.mjs'))}`,
      fichiers: [SORTIE],
      lit: ['docs/INTERFACE.md', '**/docs/INTERFACE.md'],
      gardes: ['index-interfaces'],
      entiers: [SORTIE],
      verifier: enRetard,
    },
  ],
  entreesDeLIndex,
  gardes: () => GARDES.map(({ script, args }) => [script, ...args]),
  migrations: [taillesDesTests],
  miseAJour,
  squelette,
};
