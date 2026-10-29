// The module of language typescript: what the core asks of a language (scripts/jointure.d.ts,
// docs/INTERFACE.md), answered by the scripts of this directory — the components of the frame
// (./consommateurs.mjs), the tests by Turborepo and Vitest (./tests.mjs, ./verifier.mjs), the
// guards of structure and their generators. The core loads it by scripts/langages.mjs, and this
// module imports of the core its published entries alone.
//
// - Where it is found: a repository with a tsconfig.json at its root or in a package of the frame
//   (`trouve`), which the update declares typescript; its tools, the optional peers of the package
//   the update installs in such a project (`outils`).
// - The components: the folders `packages/<x>` and `src/<x>` of the frame (`composants` of
//   ./consommateurs.mjs), out of the frame left out; a file's is the component that holds it; the
//   shared test material, the components whose package exports `./test-fixtures` (`matieres`); a
//   component plays tests when its package.json holds the script `test:unit` (`joueDesTests`),
//   which Turborepo runs in it (./tests.mjs).
// - The components touched since a commit: the files git sees changed since it, the working tree
//   and the untracked files included (`git diff --name-only <depuis>`, `git ls-files -o
//   --exclude-standard`), each in its component, and the components that depend on them by their
//   package.json (its `dependencies`, `devDependencies`, `optionalDependencies` and
//   `peerDependencies` that name another component), transitively, as Turborepo's
//   `--filter=...[<depuis>]`; a file out of every component is out of the graph.
// - The elements of a lot (./elements-du-lot.mjs).
// - The commands: `grillhouse tests` (./tests.mjs) tests, `grillhouse verifier` (./verifier.mjs)
//   verifies, and TypeScript's compiler, the project's or else the frame's, types (`tsc
//   --noEmit`); each guard and generator of this directory is a command too, by its name (`grillhouse
//   frontieres`); each one described, `{ script, args }`, never run.
// - The verdict: the summaries of Turborepo and the reports of Vitest of a results directory
//   (./verdict.mjs).
// - The rule of a test file (./regle-des-tests.mjs).
// - The generated files, each its command, the guard that checks it and the names its findings
//   carry: the index of the interfaces, the turbo.json of the packages, the reports of API.
// - The guards of structure, in the order they play.
// - The migrations of a project that replay a guard of this module (./migrations/), which the
//   update plays with the core's (scripts/migrations.mjs), as each plugin of Nx carries its own.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composants as lesComposants, matieres } from './consommateurs.mjs';
import { elementsDuLot } from './elements-du-lot.mjs';
import { A_ELAGUER, lireSarif, RESULTATS } from '../../resultats.mjs';
import { paquets } from '../../paquets.mjs';
import { lecteurs } from './lecteurs.mjs';
import { estUnTest } from './regle-des-tests.mjs';
import { SCRIPT_DES_TESTS } from './script-des-tests.mjs';
import { verdict } from './verdict.mjs';
import * as nomsDeclaresInutilises from './migrations/0.24.4-noms-declares-inutilises.mjs';
import * as lignesMalFormees from './migrations/0.24.6-lignes-mal-formees.mjs';
import * as matiereDansLesTests from './migrations/0.24.7-matiere-dans-les-tests.mjs';
import * as taillesDesTests from './migrations/0.25.0-tailles-des-tests.mjs';

// The scripts of this module, beside this file.
const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const ici = nom => path.join(SCRIPTS, nom);
const generateur = (script, ...args) => [`node ${JSON.stringify(ici(script))}`, ...args].join(' ');
const CHAMPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const composants = racine =>
  lesComposants(racine).map(({ nom, dir, paquet }) => ({ nom, dossier: dir, paquet }));
// The guards and the generators of this directory, each a command by its name.
const OUTILS = [
  'code-mort',
  'consommateurs',
  'consommateurs-arbitres',
  'frontieres',
  'index-interfaces',
  'interfaces-contre-code',
  'resumes',
  'tailles-des-tests',
  'turbo-des-paquets',
];

// The component of <liste> that holds <fichier> (absolute, or from <racine>), null for none.
function composantDans(liste, racine, fichier) {
  const abs = path.resolve(racine, fichier);
  const tenants = liste.filter(c => abs === c.dossier || abs.startsWith(`${c.dossier}${path.sep}`));
  return tenants.sort((a, b) => b.dossier.length - a.dossier.length)[0] ?? null;
}

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

const lignesDeGit = (racine, args) => {
  const r = spawnSync('git', ['-C', racine, ...args, '-z'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`⛔ git ${args.join(' ')} : ${r.stderr.trim()}`);
  return r.stdout.split('\0').filter(Boolean);
};

// The components touched in <racine> since the commit <depuis>, their dependents, and the files
// out of every component.
function touches(racine, { depuis }) {
  const liste = composants(racine);
  const fichiers = new Set([
    ...lignesDeGit(racine, ['diff', '--name-only', '--no-renames', depuis]),
    ...lignesDeGit(racine, ['ls-files', '-o', '--exclude-standard']),
  ]);
  const touches = new Set();
  const horsGraphe = [];
  for (const f of fichiers) {
    const c = composantDans(liste, racine, f);
    if (c) touches.add(c);
    else horsGraphe.push(f);
  }
  // The components that read each one, by the packages their package.json names.
  const parPaquet = new Map(liste.filter(c => c.paquet).map(c => [c.paquet, c]));
  const lecteursDe = new Map(liste.map(c => [c, new Set()]));
  for (const c of liste) {
    const pkg = lireJson(path.join(c.dossier, 'package.json')) ?? {};
    for (const nom of new Set(CHAMPS.flatMap(ch => Object.keys(pkg[ch] ?? {})))) {
      const lu = parPaquet.get(nom);
      if (lu && lu !== c) lecteursDe.get(lu).add(c);
    }
  }
  const dependants = new Set();
  const suivre = c => {
    for (const l of lecteursDe.get(c)) {
      if (touches.has(l) || dependants.has(l)) continue;
      dependants.add(l);
      suivre(l);
    }
  };
  for (const c of touches) suivre(c);
  const parNom = (a, b) => a.nom.localeCompare(b.nom);
  return {
    touches: [...touches].sort(parNom),
    dependants: [...dependants].sort(parNom),
    horsGraphe: horsGraphe.sort(),
  };
}

// TypeScript's compiler, the project's at <racine>, else the frame's.
function compilateur(racine) {
  for (const depuis of [path.join(racine, 'package.json'), import.meta.url]) {
    try {
      return createRequire(depuis).resolve('typescript/bin/tsc');
    } catch {
      // The next one.
    }
  }
  return null;
}

// The findings the guard <script> <args> writes on the repository <racine>, the notes of the debt
// left out; a red guard that wrote none gives one, without location.
function constatsDe(racine, script, args) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'grillhouse-engendre-'));
  try {
    const r = spawnSync(process.execPath, [script, ...args], {
      cwd: racine,
      env: { ...process.env, [RESULTATS]: dossier },
      encoding: 'utf8',
    });
    const constats = lireSarif(dossier).constats.filter(k => k.genre !== A_ELAGUER);
    if (r.status !== 0 && constats.length === 0) {
      return [{ message: `${path.basename(script)} rouge (code ${r.status ?? r.signal}).` }];
    }
    return r.status === 0 ? [] : constats;
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const engendre = (o, script, args) => ({
  ...o,
  verifier: racine => constatsDe(racine, ici(script), args),
});

// Whether the repository at <racine> holds TypeScript: a tsconfig.json at its root or in one of its
// packages of the frame, as @nx/js infers a project from its tsconfig.
const trouve = racine =>
  existsSync(path.join(racine, 'tsconfig.json')) ||
  paquets(racine).some(
    ({ dossier, hors }) => !hors && existsSync(path.join(racine, dossier, 'tsconfig.json'))
  );

export default {
  nom: 'typescript',
  trouve,
  // The tools a project of TypeScript installs, optional peers of the package: what this module
  // runs as commands (Turborepo, knip, dependency-cruiser) and what its scripts import (API
  // Extractor, its model, TSDoc's configuration, jsonc-parser); the project's own TypeScript and
  // Vitest left out, which it writes its code and its tests with.
  outils: [
    '@microsoft/api-extractor',
    '@microsoft/api-extractor-model',
    '@microsoft/tsdoc-config',
    'dependency-cruiser',
    'jsonc-parser',
    'knip',
    'turbo',
  ],
  composants,
  composantDe: (racine, fichier) => composantDans(composants(racine), racine, fichier),
  matieres: racine =>
    matieres(racine).map(({ nom, dir, paquet }) => ({ nom, dossier: dir, paquet })),
  joueDesTests: (_racine, composant) =>
    typeof lireJson(path.join(composant.dossier, 'package.json'))?.scripts?.[SCRIPT_DES_TESTS] ===
    'string',
  lecteurs,
  touches,
  elementsDuLot,
  commandes: racine => ({
    tester: { script: ici('tests.mjs'), args: [] },
    verifier: { script: ici('verifier.mjs'), args: [] },
    typer: { script: compilateur(racine), args: ['--noEmit'] },
    ...Object.fromEntries(OUTILS.map(n => [n, { script: ici(`${n}.mjs`), args: [] }])),
  }),
  verdict,
  estUnTest,
  fichiersEngendres: () => [
    engendre(
      {
        nom: "l'index des interfaces",
        commande: generateur('index-interfaces.mjs'),
        fichiers: ['docs/agents/index-des-interfaces.md'],
        lit: ['docs/INTERFACE.md', '**/docs/INTERFACE.md'],
        gardes: ['index-interfaces'],
        entiers: ['docs/agents/index-des-interfaces.md'],
      },
      'index-interfaces.mjs',
      ['--verifier']
    ),
    engendre(
      {
        nom: 'les turbo.json des paquets',
        commande: generateur('turbo-des-paquets.mjs', '--ecrire'),
        fichiers: ['turbo.json', 'turbo.jsonc', '**/turbo.json'],
        lit: [],
        gardes: ['turbo-des-paquets'],
        entiers: ['*/**/turbo.json'],
      },
      'turbo-des-paquets.mjs',
      []
    ),
    engendre(
      {
        nom: "les rapports d'API",
        commande: generateur('interfaces-contre-code.mjs', '--ecrire'),
        fichiers: [
          'docs/INTERFACE.api.md',
          'docs/INTERFACE.md',
          '**/docs/INTERFACE.api.md',
          '**/docs/INTERFACE.md',
        ],
        lit: [],
        gardes: ['rapport-api', 'partie-generee'],
        entiers: [],
      },
      'interfaces-contre-code.mjs',
      []
    ),
  ],
  gardes: () => [
    [ici('turbo-des-paquets.mjs')],
    [ici('index-interfaces.mjs'), '--verifier'],
    [ici('consommateurs.mjs')],
    [ici('consommateurs-arbitres.mjs')],
    [ici('frontieres.mjs')],
    [ici('interfaces-contre-code.mjs')],
    [ici('code-mort.mjs')],
    [ici('tailles-des-tests.mjs')],
    [ici('resumes.mjs')],
  ],
  migrations: [nomsDeclaresInutilises, lignesMalFormees, matiereDansLesTests, taillesDesTests],
};
