// Every project declares the servers of the index in its .mcp.json, the one the project commits
// and the sessions of its agents read (scripts/droits.mjs): codegraph, the code knowledge graph,
// and rtfm, the search over code and documents. `grillhouse init` plays this migration on the
// project it creates. Mechanism: installation.md §5.4 (packages/grillhouse/docs/architecture/).
//
// - `version`: null until the release that brings it, which `grillhouse sortie` numbers.
// - `migrer` adds to `mcpServers` each of the two that is missing, creating the file when the
//   project has none; the other entries and keys stay, in their order, with the indentation of the
//   file. A file that holds both is not rewritten. A file that is not a JSON object, or whose
//   `mcpServers` is not one, stays as it is, left to the project.
// - `restes(projet)`: rtfm's entry names the program `rtfm-serve`, which the plugin rtfm ships;
//   one line when the project declares that entry and its settings do not enable the plugin.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.51.0';
export const nom = 'serveurs de l index';

// Each server in the form its tool publishes: codegraph's own, and the .mcp.json of rtfm.
const SERVEURS = {
  codegraph: { type: 'stdio', command: 'codegraph', args: ['serve', '--mcp'], env: {} },
  rtfm: { type: 'stdio', command: 'rtfm-serve', args: [], env: { RTFM_DB: '.rtfm/library.db' } },
};

const estUnObjet = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// The JSON of <fichier>, or undefined when it holds none.
function lireJson(fichier) {
  try {
    return JSON.parse(readFileSync(fichier, 'utf8'));
  } catch {
    return undefined;
  }
}

/** The servers of the index added to the .mcp.json of <projet>; returns what it did. */
export function migrer(projet) {
  const fichier = path.join(projet, '.mcp.json');
  const texte = existsSync(fichier) ? readFileSync(fichier, 'utf8') : null;
  const config = texte === null ? {} : lireJson(fichier);
  const declares = config?.mcpServers ?? {};
  if (!estUnObjet(config) || !estUnObjet(declares)) {
    return [
      {
        aFaire: `.mcp.json : illisible comme configuration de serveurs (un objet JSON, « mcpServers » un objet) ; corrige-le, puis rejoue la montée, qui y ajoute les serveurs de l'index (${Object.keys(SERVEURS).join(', ')})`,
      },
    ];
  }
  const ajoutes = Object.keys(SERVEURS).filter(n => !Object.hasOwn(declares, n));
  if (ajoutes.length === 0) {
    return [];
  }
  config.mcpServers = {
    ...declares,
    ...Object.fromEntries(ajoutes.map(n => [n, SERVEURS[n]])),
  };
  const indent = /^\n?(\s+)"/m.exec(texte ?? '')?.[1] ?? 2;
  const fin = texte === null || texte.endsWith('\n') ? '\n' : '';
  writeFileSync(fichier, `${JSON.stringify(config, null, indent)}${fin}`);
  return [
    `.mcp.json : serveurs de l'index ajoutés (${ajoutes.join(', ')}), que les séances des agents lisent ; commite le fichier`,
  ];
}

/** One line when the rtfm of <projet> waits for a program no enabled plugin ships; none otherwise. */
export function restes(projet) {
  const mcp = lireJson(path.join(projet, '.mcp.json'));
  if (mcp?.mcpServers?.rtfm?.command !== SERVEURS.rtfm.command) {
    return [];
  }
  const greffons =
    lireJson(path.join(projet, '.claude', 'settings.json'))?.enabledPlugins ?? {};
  if (Object.entries(greffons).some(([id, actif]) => id.startsWith('rtfm@') && actif === true)) {
    return [];
  }
  return [
    '.claude/settings.json : le greffon rtfm n’est pas activé, qui porte le programme rtfm-serve que .mcp.json nomme, et tient son index ; active-le (« enabledPlugins » : « rtfm@roomi-fields »: true, comme le gabarit), puis lance npx grillhouse greffons dans l’arbre principal.',
  ];
}
