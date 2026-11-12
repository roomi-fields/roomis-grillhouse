// From 0.35.0 the four skills of the plugin of mattpocock that the frame calls live in the frame's
// plugin (`grillhouse:grilling`, `grillhouse:writing-for-agents`, `grillhouse:codebase-design`,
// `grillhouse:domain-modeling`), and the template no longer enables the whole plugin
// (grillhouse-8gp).
//
// - A project's .claude/settings.json that enables `mattpocock-skills@claude-plugins-official` in
//   `enabledPlugins` loses that key, whatever its value; the other plugins and keys keep their
//   place. The update cannot tell a project that enabled it for itself from one that took it from
//   the template: it removes it and says so once.
// - A project without .claude/settings.json, without `enabledPlugins` or without that plugin is
//   not written: a second pass changes nothing and returns no line.
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
