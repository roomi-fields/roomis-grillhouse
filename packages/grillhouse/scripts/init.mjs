#!/usr/bin/env node
// A new project, created from the frame's template of a project, as create-turbo creates one from
// its example. The first Claude session opened in it proposes the initialisation grill.
//
//   npx @roomi-fields/grillhouse init <dossier> [<préfixe des tickets>]
//
// - The directory is created, or must be empty: a directory that holds a file is refused (exit 1)
//   and nothing is written in it.
// - The project receives each file of the template (`templates/projet/` of the frame's files,
//   scripts/cadre.mjs) at its own path; `_gitignore` and `_npmignore` become `.gitignore` and
//   `.npmignore`, the names npm neither publishes nor reads in a package, as create-vite names its
//   templates' files.
// - Its package.json declares the frame's package, `@roomi-fields/grillhouse` at `^<version>` of
//   this package, in its devDependencies.
// - The preparation (scripts/preparation.mjs): git, Beads and its ticket store under the prefix
//   given, else the directory's name, CodeGraph and its index, the frame's git hooks, the frame's
//   plugins its settings declare, then `npm install`.
// - Then what the frame writes in a project, as `grillhouse maj` writes it (scripts/grillhouse-maj.mjs):
//   its turbo.json, the status line of its settings, the version of the frame; and the generated
//   files (the boundaries' configuration, the interfaces index, run by the project's command). A
//   plugin or a generator that fails has its line, and the exit code is non-zero once the project
//   is created.
// - The project ends on one commit, « chore: initial commit from Roomi's Grillhouse ».
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CADRE, VERSION } from './cadre.mjs';
import { mettreAJour, regenerer } from './grillhouse-maj.mjs';
import { preparer } from './preparation.mjs';

/** The frame's package, as a project declares it. */
export const PAQUET_DU_CADRE = '@roomi-fields/grillhouse';
// The template's files whose name the project receives changed.
const RENOMMES = { _gitignore: '.gitignore', _npmignore: '.npmignore' };

// Runs <commande> in <projet>, its output this process's; throws on a failure.
const lancer = (projet, commande, args) =>
  execFileSync(commande, args, { cwd: projet, stdio: 'inherit' });

// Copies the template of a project into <projet>, its files renamed (RENOMMES).
function copierLeGabarit(projet) {
  const gabarit = path.join(CADRE, 'templates', 'projet');
  cpSync(gabarit, projet, { recursive: true });
  const renommer = dossier => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const f = path.join(dossier, e.name);
      if (e.isDirectory()) renommer(f);
      else if (Object.hasOwn(RENOMMES, e.name)) renameSync(f, path.join(dossier, RENOMMES[e.name]));
    }
  };
  renommer(projet);
  const fichier = path.join(projet, 'package.json');
  const p = JSON.parse(readFileSync(fichier, 'utf8'));
  p.devDependencies = Object.fromEntries(
    Object.entries({ ...(p.devDependencies ?? {}), [PAQUET_DU_CADRE]: `^${VERSION}` }).sort(
      ([a], [b]) => a.localeCompare(b, 'en')
    )
  );
  writeFileSync(fichier, `${JSON.stringify(p, null, 2)}\n`);
}

/** Creates the project at <dossier>; returns the lines of failure once it is created. */
export function initialiser(dossier, prefixe) {
  const projet = path.resolve(dossier);
  if (existsSync(projet) && readdirSync(projet).length > 0) {
    throw new Error(
      `${dossier} n'est pas vide : grillhouse init crée un projet neuf. Un projet existant adopte le cadre par npm install -D ${PAQUET_DU_CADRE}, puis npx grillhouse maj.`
    );
  }
  mkdirSync(projet, { recursive: true });
  copierLeGabarit(projet);
  const greffons = preparer(projet, prefixe);
  mettreAJour(projet, CADRE);
  const lignes = [...greffons, ...regenerer(projet, { tous: true })];
  lancer(projet, 'git', ['add', '-A']);
  // The initial commit carries no ticket: the frame's commit-msg hook has nothing to judge.
  lancer(projet, 'git', [
    'commit',
    '-q',
    '--no-verify',
    '-m',
    "chore: initial commit from Roomi's Grillhouse",
  ]);
  return lignes;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [dossier, prefixe, ...reste] = process.argv.slice(2);
  if (!dossier || dossier.startsWith('-') || reste.length > 0) {
    process.stderr.write(
      'Usage : npx @roomi-fields/grillhouse init <dossier> [<préfixe des tickets>]\n'
    );
    process.exitCode = 2;
  } else {
    try {
      const lignes = initialiser(dossier, prefixe);
      for (const l of lignes) process.stderr.write(`${l}\n`);
      process.stdout.write(
        `Projet créé dans ${dossier}. Ouvre Claude Code dans ce dossier : la première séance propose le grill d'initialisation.\n`
      );
      if (lignes.length > 0) process.exitCode = 1;
    } catch (e) {
      process.stderr.write(`⛔ ${e.message}\n`);
      process.exitCode = 1;
    }
  }
}
