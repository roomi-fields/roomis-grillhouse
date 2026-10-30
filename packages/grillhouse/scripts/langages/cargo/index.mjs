// The module of language cargo: what the core asks of a language (scripts/jointure.d.ts,
// docs/INTERFACE.md), answered for a workspace of cargo by cargo itself (`cargo metadata`,
// nextest, cargo-deny), as Pants's Rust backend and Bazel's rules_rust read a Cargo workspace.
// The core loads it by scripts/langages.mjs, and this module imports of the core its published
// entries alone.
//
// - Where it is found: a repository with a Cargo.toml at its root, the manifest of its workspace
//   or of its one crate (`trouve`). Its tools are no package of npm (`outils` empty): cargo and
//   its subcommands live on the machine.
// - The components, a file's, the shared test material, the components that play tests, the
//   readers of a crate and the rule of a test file (./composants.mjs).
// - The crates touched since a commit and their dependents (./touches.mjs).
// - The elements of a lot, one per crate (./elements-du-lot.mjs).
// - The commands `tester`, `verifier`, `typer` and `preparer` (./commandes.mjs), each described,
//   `{ script, args }`, never run; the verdict of a run (./verdict.mjs).
// - No generated file, no guard of structure and no migration yet.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { commandes } from './commandes.mjs';
import {
  composantDans,
  composants,
  estUnTest,
  joueDesTests,
  lecteurs,
  matieres,
} from './composants.mjs';
import { elementsDuLot } from './elements-du-lot.mjs';
import { touches } from './touches.mjs';
import { verdict } from './verdict.mjs';

export default {
  nom: 'cargo',
  trouve: racine => existsSync(path.join(racine, 'Cargo.toml')),
  outils: [],
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
  fichiersEngendres: () => [],
  gardes: () => [],
  migrations: [],
};
