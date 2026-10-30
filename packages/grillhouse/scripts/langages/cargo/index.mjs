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
// - The generated file, the index of the interfaces (./index-interfaces.mjs), its command and its
//   check; the guards of structure, in the order they play: clippy (./clippy.mjs), the boundaries
//   between crates (./frontieres.mjs), the index of the interfaces up to date. No migration yet.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { enRetard, SORTIE } from './index-interfaces.mjs';
import { touches } from './touches.mjs';
import { verdict } from './verdict.mjs';

// The scripts of this module, beside this file.
const ici = nom => path.join(path.dirname(fileURLToPath(import.meta.url)), nom);

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
  gardes: () => [
    [ici('clippy.mjs')],
    [ici('frontieres.mjs')],
    [ici('index-interfaces.mjs'), '--verifier'],
  ],
  migrations: [],
};
