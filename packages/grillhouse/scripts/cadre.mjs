#!/usr/bin/env node
// The frame's files the package carries: the template of a project (`templates/`, which
// `grillhouse init` installs and `grillhouse maj` reads) and the frame's plugin (`mods/grillhouse/`:
// its skills, agents, hooks of Claude Code, panel, common charter and meta-frame, `METACADRE.md`,
// which the circuit also reads, as the agents' instructions, `consigne-agent.md`). In Grillhouse's
// repository they live at their own address, beside the package; the published package carries a
// copy of them under `cadre/`, at the same relative paths, as create-vite carries its templates,
// and the marketplace of Claude Code that lists the plugin, as a package of ESLint carries its
// plugin: the frame arrives in one piece.
//
//   node scripts/cadre.mjs --empaqueter   copies them under cadre/ and writes the marketplace (the package's prepack)
//   node scripts/cadre.mjs --nettoyer     removes cadre/ and the marketplace (the package's postpack)
//
// - CADRE is the root these paths are read from: `cadre/` of the package when it is installed (its
//   real path lies under a `node_modules` directory), else Grillhouse's repository, two levels
//   above the package. So the package reads the same files wherever it is installed, and the
//   repository keeps one address for each.
// - The copy of the plugin leaves out its tests (`mods/grillhouse/tests/`), and its manifest
//   (`.claude-plugin/plugin.json`) receives VERSION: the plugin takes the package's version, its
//   manifest in the repository carries none.
// - The marketplace is the package's `.claude-plugin/marketplace.json`, MARCHE_DU_CADRE, listing the
//   plugin `grillhouse` by its relative path, `./cadre/mods/grillhouse`. A project declares the
//   package's directory, CHEMIN_DU_MARCHE, as a marketplace of a directory and enables
//   GREFFON_DU_CADRE (`grillhouse maj`); Claude Code reads the plugin in place from that folder.
// - VERSION is the `version` of the package's package.json, the one version of the package and its
//   plugin.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The package's directory. */
export const PAQUET = path.join(import.meta.dirname, '..');
const COPIE = path.join(PAQUET, 'cadre');
const MARCHE = path.join(PAQUET, '.claude-plugin');
const DEPOT = path.join(PAQUET, '..', '..');
const GREFFON = 'mods/grillhouse';

/** The frame's files the package reads, relative to CADRE, which `--empaqueter` copies. */
export const FICHIERS_DU_CADRE = [GREFFON, 'templates'];

/** The marketplace of the package, its plugin, and the directory a project declares for it. */
export const MARCHE_DU_CADRE = 'roomis-grillhouse';
export const GREFFON_DU_CADRE = `grillhouse@${MARCHE_DU_CADRE}`;
export const CHEMIN_DU_MARCHE = './node_modules/@roomi-fields/grillhouse';

/** The root of the frame's files: the package's copy when installed, else the repository. */
export const CADRE = PAQUET.split(path.sep).includes('node_modules') ? COPIE : DEPOT;

/** The version of the package and its mod. */
export const VERSION = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')).version;

const json = v => `${JSON.stringify(v, null, 2)}\n`;

// Copies each file of FICHIERS_DU_CADRE from the repository under cadre/, cadre/ emptied first, the
// plugin's tests left out and its manifest at VERSION; then writes the marketplace.
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
  mkdirSync(MARCHE, { recursive: true });
  writeFileSync(
    path.join(MARCHE, 'marketplace.json'),
    json({
      name: MARCHE_DU_CADRE,
      description: "Roomi's Grillhouse: the frame's plugin, carried by its package npm",
      owner: greffon.author,
      plugins: [
        { name: greffon.name, source: `./cadre/${GREFFON}`, description: greffon.description },
      ],
    })
  );
}

// Removes cadre/ and the marketplace.
function nettoyer() {
  rmSync(COPIE, { recursive: true, force: true });
  rmSync(MARCHE, { recursive: true, force: true });
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
