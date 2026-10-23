#!/usr/bin/env node
// The frame's files the package carries: the frame's plugin (`mods/grillhouse/`: its skills,
// agents, hooks of Claude Code, panel, common charter and meta-frame, `METACADRE.md`, which the
// circuit also reads, as the agents' instructions, `consigne-agent.md`) and the template of a
// project (`templates/`, which `grillhouse init` installs and `grillhouse maj` reads). In
// Grillhouse's repository they live at their own address, beside the package. The published
// package is the plugin, as a package of ESLint carries its plugin: its root holds the plugin's
// files, so the marketplace names the package by a source npm, which has no subdirectory; and
// it carries a copy of the template under `cadre/`, as create-vite carries its templates. The
// frame arrives in one piece.
//
//   node scripts/cadre.mjs --empaqueter   copies them into the package (the package's prepack)
//   node scripts/cadre.mjs --nettoyer     removes the copies (the package's postpack)
//
// - GREFFON is the plugin's root these scripts read: the package's own when it is installed (its
//   real path lies under a `node_modules` directory), else `mods/grillhouse/` of Grillhouse's
//   repository, two levels above the package. CADRE is the root the template is read from:
//   `cadre/` of the installed package, else the repository. So the package reads the same files
//   wherever it is installed, and the repository keeps one address for each.
// - The copy of the plugin, ELEMENTS_DU_GREFFON, is each entry of `mods/grillhouse/` but its tests
//   (`tests/`) and its configuration of TypeScript (`tsconfig.json`), at the package's root,
//   beside the package's own entries, PROPRES_DU_PAQUET; an entry of the plugin of the same name
//   stops the copy. Its manifest (`.claude-plugin/plugin.json`)
//   receives VERSION: the plugin takes the package's version, its manifest in the repository
//   carries none.
// - VERSION is the `version` of the package's package.json, the one version of the package and its
//   plugin.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The package's directory. */
export const PAQUET = path.join(import.meta.dirname, '..');
const COPIE = path.join(PAQUET, 'cadre');
const DEPOT = path.join(PAQUET, '..', '..');
const SOURCE_DU_GREFFON = path.join(DEPOT, 'mods', 'grillhouse');
const INSTALLE = PAQUET.split(path.sep).includes('node_modules');

/** The frame's files the package reads under CADRE, which `--empaqueter` copies under cadre/. */
export const FICHIERS_DU_CADRE = ['templates'];

/** The entries the package publishes of its own. */
export const PROPRES_DU_PAQUET = ['bin', 'cadre', 'scripts'];

/** The entries of the plugin's source the package leaves out. */
export const HORS_DU_GREFFON = ['tests', 'tsconfig.json'];

/** The entries of the plugin, which `--empaqueter` copies at the package's root. */
export const ELEMENTS_DU_GREFFON = existsSync(SOURCE_DU_GREFFON)
  ? readdirSync(SOURCE_DU_GREFFON)
      .filter(e => !HORS_DU_GREFFON.includes(e))
      .sort()
  : [];

/** The root of the frame's files: the package's copy when installed, else the repository. */
export const CADRE = INSTALLE ? COPIE : DEPOT;

/** The root of the frame's plugin: the package itself when installed, else its source. */
export const GREFFON = INSTALLE ? PAQUET : SOURCE_DU_GREFFON;

/** The version of the package and its mod. */
export const VERSION = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')).version;

const json = v => `${JSON.stringify(v, null, 2)}\n`;

// Copies the plugin at the package's root, its manifest at VERSION, and each file of
// FICHIERS_DU_CADRE under cadre/; the former copies removed first.
function empaqueter() {
  if (!existsSync(SOURCE_DU_GREFFON)) {
    throw new Error(`mods/grillhouse manque au dépôt du cadre (${DEPOT})`);
  }
  const doublon = ELEMENTS_DU_GREFFON.find(e => PROPRES_DU_PAQUET.includes(e));
  if (doublon) {
    throw new Error(`${doublon} du greffon porte le nom d'une entrée du paquet (${PAQUET})`);
  }
  nettoyer();
  for (const e of ELEMENTS_DU_GREFFON) {
    cpSync(path.join(SOURCE_DU_GREFFON, e), path.join(PAQUET, e), { recursive: true });
  }
  const manifeste = path.join(PAQUET, '.claude-plugin', 'plugin.json');
  writeFileSync(
    manifeste,
    json({ ...JSON.parse(readFileSync(manifeste, 'utf8')), version: VERSION })
  );
  for (const f of FICHIERS_DU_CADRE) {
    const source = path.join(DEPOT, f);
    if (!existsSync(source)) throw new Error(`${f} manque au dépôt du cadre (${DEPOT})`);
    cpSync(source, path.join(COPIE, f), { recursive: true });
  }
}

// Removes the copies of the plugin and cadre/.
function nettoyer() {
  for (const e of ELEMENTS_DU_GREFFON)
    rmSync(path.join(PAQUET, e), { recursive: true, force: true });
  rmSync(COPIE, { recursive: true, force: true });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [option] = process.argv.slice(2);
  if (option === '--empaqueter') {
    empaqueter();
  } else if (option === '--nettoyer') {
    nettoyer();
  } else {
    process.stderr.write('Usage : node scripts/cadre.mjs --empaqueter | --nettoyer\n');
    process.exitCode = 2;
  }
}
