#!/usr/bin/env node
// The frame's files the package reads out of its own directory: the template of a project
// (`templates/`, which `grillhouse init` installs and `grillhouse maj` reads), the meta-frame
// (`METACADRE.md`) and the templates of the agents' instructions (`consigne-agent.md`, in the skill
// of the supervisor, which the frame's plugin carries). In Grillhouse's repository they live at
// their own address, beside the package; the published package carries a copy of them under
// `cadre/`, at the same relative paths, as create-vite carries its templates.
//
//   node scripts/cadre.mjs --empaqueter   copies them under cadre/ (the package's prepack)
//   node scripts/cadre.mjs --nettoyer     removes cadre/ (the package's postpack)
//
// - CADRE is the root these paths are read from: `cadre/` of the package when it is installed (its
//   real path lies under a `node_modules` directory), else Grillhouse's repository, two levels
//   above the package. So the package reads the same files wherever it is installed, and the
//   repository keeps one address for each.
// - VERSION is the `version` of the package's package.json, the one version of the package and its
//   mod.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The package's directory. */
export const PAQUET = path.join(import.meta.dirname, '..');
const COPIE = path.join(PAQUET, 'cadre');
const DEPOT = path.join(PAQUET, '..', '..');

/** The frame's files the package reads, relative to CADRE, which `--empaqueter` copies. */
export const FICHIERS_DU_CADRE = [
  'METACADRE.md',
  'mods/grillhouse/skills/pitmaster/references/consigne-agent.md',
  'templates',
];

/** The root of the frame's files: the package's copy when installed, else the repository. */
export const CADRE = PAQUET.split(path.sep).includes('node_modules') ? COPIE : DEPOT;

/** The version of the package and its mod. */
export const VERSION = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')).version;

// Copies each file of FICHIERS_DU_CADRE from the repository under cadre/, cadre/ emptied first.
function empaqueter() {
  rmSync(COPIE, { recursive: true, force: true });
  for (const f of FICHIERS_DU_CADRE) {
    const source = path.join(DEPOT, f);
    if (!existsSync(source)) throw new Error(`${f} manque au dépôt du cadre (${DEPOT})`);
    cpSync(source, path.join(COPIE, f), { recursive: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [option] = process.argv.slice(2);
  if (option === '--empaqueter') {
    empaqueter();
  } else if (option === '--nettoyer') {
    rmSync(COPIE, { recursive: true, force: true });
  } else {
    process.stderr.write('Usage : node scripts/cadre.mjs --empaqueter | --nettoyer\n');
    process.exitCode = 2;
  }
}
