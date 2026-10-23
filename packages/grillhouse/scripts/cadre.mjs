#!/usr/bin/env node
// The frame's files the package carries: the template of a project (`templates/`, which
// `grillhouse init` installs and `grillhouse maj` reads) and the frame's plugin (`mods/grillhouse/`:
// its skills, agents, hooks of Claude Code, panel, common charter and meta-frame, `METACADRE.md`,
// which the circuit also reads, as the agents' instructions, `consigne-agent.md`). In Grillhouse's
// repository they live at their own address, beside the package; the published package carries a
// copy of them under `cadre/`, at the same relative paths, as create-vite carries its templates:
// the package carries its plugin, as a package of ESLint carries its plugin, and the frame arrives
// in one piece.
//
//   node scripts/cadre.mjs --empaqueter   copies them under cadre/ (the package's prepack)
//   node scripts/cadre.mjs --nettoyer     removes cadre/ (the package's postpack)
//
// - CADRE is the root these paths are read from: `cadre/` of the package when it is installed (its
//   real path lies under a `node_modules` directory), else Grillhouse's repository, two levels
//   above the package. So the package reads the same files wherever it is installed, and the
//   repository keeps one address for each.
// - The copy of the plugin leaves out its tests (`mods/grillhouse/tests/`), and its manifest
//   (`.claude-plugin/plugin.json`) receives VERSION: the plugin takes the package's version, its
//   manifest in the repository carries none.
// - CHEMIN_DU_GREFFON is the plugin's directory in a project that installed the package, relative
//   to its root: the marketplace of the project lists it (`grillhouse maj`), and Claude Code reads
//   the plugin in place from that folder.
// - VERSION is the `version` of the package's package.json, the one version of the package and its
//   plugin.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The package's directory. */
export const PAQUET = path.join(import.meta.dirname, '..');
const COPIE = path.join(PAQUET, 'cadre');
const DEPOT = path.join(PAQUET, '..', '..');
const GREFFON = 'mods/grillhouse';

/** The frame's files the package reads, relative to CADRE, which `--empaqueter` copies. */
export const FICHIERS_DU_CADRE = [GREFFON, 'templates'];

/** The plugin's name, and its directory in a project that installed the package. */
export const NOM_DU_GREFFON = 'grillhouse';
export const CHEMIN_DU_GREFFON = `./node_modules/@roomi-fields/grillhouse/cadre/${GREFFON}`;

/** The root of the frame's files: the package's copy when installed, else the repository. */
export const CADRE = PAQUET.split(path.sep).includes('node_modules') ? COPIE : DEPOT;

/** The version of the package and its mod. */
export const VERSION = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')).version;

const json = v => `${JSON.stringify(v, null, 2)}\n`;

// Copies each file of FICHIERS_DU_CADRE from the repository under cadre/, cadre/ emptied first, the
// plugin's tests left out and its manifest at VERSION.
function empaqueter() {
  nettoyer();
  const tests = path.join(DEPOT, GREFFON, 'tests');
  for (const f of FICHIERS_DU_CADRE) {
    const source = path.join(DEPOT, f);
    if (!existsSync(source)) throw new Error(`${f} manque au dépôt du cadre (${DEPOT})`);
    cpSync(source, path.join(COPIE, f), {
      recursive: true,
      filter: s => s !== tests && !s.startsWith(`${tests}${path.sep}`),
    });
  }
  const manifeste = path.join(COPIE, GREFFON, '.claude-plugin', 'plugin.json');
  const greffon = JSON.parse(readFileSync(manifeste, 'utf8'));
  writeFileSync(manifeste, json({ ...greffon, version: VERSION }));
}

// Removes cadre/.
function nettoyer() {
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
