// The module of language python: what the core asks of a language (scripts/jointure.d.ts,
// docs/INTERFACE.md), answered for the packages of Python by uv and pytest, as Pants's Python
// backend reads a pyproject.toml. The core loads it by scripts/langages.mjs, and this module
// imports of the core its published entries alone.
//
// - The manifest of its package, which the guard of the languages asks of a package the
//   architecture declares python (`manifeste`): a pyproject.toml (PEP 621), its group `test` of
//   `[dependency-groups]` (PEP 735) and its uv.lock. Its one tool of npm is smol-toml, the reader
//   of a pyproject.toml (`outils`); uv lives on the machine, installed by the update at its exact
//   version (`binaires`, ./binaires.json). What uv, pytest and Python write in a project: `.venv`,
//   `.pytest_cache`, `__pycache__` (`ignorer`).
// - Where they write, which the envelope opens to a session (`sorties`): in writing, `.venv` and
//   `.pytest_cache` at the root, where the commands make uv and pytest write for each package
//   (./commandes.mjs), and uv's cache, `~/.cache/uv`; proper to the session, the
//   tree of the bytecode at the root, `__pycache__` (PYTHONPYCACHEPREFIX, ./commandes.mjs); read,
//   the Pythons uv installs, `~/.local/share/uv/python`. The version of Python is uv's choice, from
//   `requires-python` and `.python-version`. The rules that refuse a role that writes pytest run
//   directly (`droits`).
// - The packages, a file's, the test files, what the testwriter writes, of the manifests too, the
//   readers, the entries of the index of the interfaces (./composants.mjs); the packages touched
//   since a commit and the elements of a lot (./lot.mjs).
// - The commands `tester`, `verifier`, `typer`, `preparer` and `tests-de-nuit` (./commandes.mjs),
//   each described, never run, and the verdict of a run (./verdict.mjs); the guard of the sizes of
//   the tests (./tailles-des-tests.mjs) and the index of the interfaces up to date, each a command
//   by its name too. The generated file, the index of the interfaces (./index-interfaces.mjs), its
//   command and its check, which the core's takes the place of in a project of several languages.
//   No migration yet.
// - Its share of the update (./mise-a-jour.mjs): the template `templates/python/`, its test
//   scripts, the generator of the index and the installation of uv.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandes, GARDES, PYCACHE } from './commandes.mjs';
import {
  composantDans,
  composants,
  entreesDeLIndex,
  estUnTest,
  joueDesTests,
  lecteurs,
  manifestes,
} from './composants.mjs';
import { enRetard, SORTIE } from './index-interfaces.mjs';
import { elementsDuLot, touches } from './lot.mjs';
import { miseAJour } from './mise-a-jour.mjs';
import { verdict } from './verdict.mjs';

const ici = nom => path.join(path.dirname(fileURLToPath(import.meta.url)), nom);

export default {
  nom: 'python',
  manifeste: 'pyproject.toml',
  outils: ['smol-toml'],
  binaires: JSON.parse(readFileSync(ici('binaires.json'), 'utf8')),
  ignorer: ['.venv', '.pytest_cache', PYCACHE],
  sorties: {
    ecrites: ['.venv/', '.pytest_cache/', '~/.cache/uv/'],
    propres: [PYCACHE],
    lues: ['~/.local/share/uv/python/'],
  },
  // pytest run directly, by itself, by Python or by uv: `npm test` and `npm run verifier` play it.
  droits: [
    'Bash(pytest*)',
    'Bash(python -m pytest*)',
    'Bash(python3 -m pytest*)',
    'Bash(uv run*pytest*)',
  ],
  composants,
  composantDe: (racine, fichier) => composantDans(composants(racine), racine, fichier),
  matieres: () => [],
  joueDesTests,
  lecteurs,
  touches,
  elementsDuLot,
  commandes,
  verdict,
  estUnTest,
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
  migrations: [],
  miseAJour,
};
