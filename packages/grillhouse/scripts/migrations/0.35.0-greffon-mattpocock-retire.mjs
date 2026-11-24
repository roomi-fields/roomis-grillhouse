// The frame's plugin carries the skills it calls: the plugin `mattpocock-skills` is no longer
// enabled. Mechanism: installation.md §5.4 (packages/grillhouse/docs/architecture/).
//
// - `.claude/settings.json` loses the key `mattpocock-skills@claude-plugins-official` of
//   `enabledPlugins`, whatever its value; the other plugins and keys keep their place. A project
//   that enabled it for itself is not told apart: the key goes and the line says so once.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.35.0';
export const nom = 'greffon mattpocock retiré';

const GREFFON = 'mattpocock-skills@claude-plugins-official';

/** Removes the whole plugin of mattpocock from the plugins a project enables. */
export function migrer(projet) {
  const f = path.join(projet, '.claude', 'settings.json');
  if (!existsSync(f)) {
    return [];
  }
  const texte = readFileSync(f, 'utf8');
  const reglages = JSON.parse(texte);
  const plugins = reglages.enabledPlugins;
  if (!plugins || typeof plugins !== 'object' || !(GREFFON in plugins)) {
    return [];
  }
  delete plugins[GREFFON];
  const fin = texte.endsWith('\n') ? '\n' : '';
  writeFileSync(f, JSON.stringify(reglages, null, 2) + fin);
  return [
    `.claude/settings.json : le greffon ${GREFFON} n'est plus activé (les quatre compétences ` +
      `que le cadre appelle vivent dans son greffon : grillhouse:grilling, ` +
      `grillhouse:writing-for-agents, grillhouse:codebase-design, grillhouse:domain-modeling) ; ` +
      `pour le réactiver à la main, remettre « ${GREFFON} »: true dans enabledPlugins`,
  ];
}
