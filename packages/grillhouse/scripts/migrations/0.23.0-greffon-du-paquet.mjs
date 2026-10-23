// The frame's plugin comes from the package npm, read by the marketplace of its directory
// (scripts/cadre.mjs, which `grillhouse maj` declares): the project's settings no longer take it
// from the GitHub marketplace roomi-fields.
//
// - In the project's `.claude/settings.json`, the plugin that marketplace provided,
//   `grillhouse@roomi-fields`, leaves `enabledPlugins`; then the marketplace `roomi-fields` of
//   GitHub (`roomi-fields/claude-plugins`) leaves `extraKnownMarketplaces` once no plugin the
//   project enables comes from it: `rtfm@roomi-fields`, which the common charter asks of every
//   project, keeps it. A key left empty goes; the other keys stay, in their order.
// - A project without settings, or whose settings hold neither, is not written.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.23.0';
export const nom = 'greffon du paquet';

const ANCIEN_GREFFON = 'grillhouse@roomi-fields';
const MARCHE = 'roomi-fields';
const DEPOT_DU_MARCHE = 'roomi-fields/claude-plugins';

/** Takes the frame's plugin of GitHub off the project's settings; returns what it did. */
export function migrer(projet) {
  const f = path.join(projet, '.claude', 'settings.json');
  if (!existsSync(f)) return [];
  const reglages = JSON.parse(readFileSync(f, 'utf8'));
  const lignes = [];
  const greffons = reglages.enabledPlugins;
  if (greffons && typeof greffons === 'object' && Object.hasOwn(greffons, ANCIEN_GREFFON)) {
    delete greffons[ANCIEN_GREFFON];
    if (Object.keys(greffons).length === 0) delete reglages.enabledPlugins;
    lignes.push(`.claude/settings.json : greffon retiré, que le paquet porte (${ANCIEN_GREFFON})`);
  }
  const marches = reglages.extraKnownMarketplaces;
  const source = marches?.[MARCHE]?.source;
  const encoreLu = Object.entries(reglages.enabledPlugins ?? {}).some(
    ([id, actif]) => actif === true && id.endsWith(`@${MARCHE}`)
  );
  if (source?.source === 'github' && source.repo === DEPOT_DU_MARCHE && !encoreLu) {
    delete marches[MARCHE];
    if (Object.keys(marches).length === 0) delete reglages.extraKnownMarketplaces;
    lignes.push(
      `.claude/settings.json : place de marché retirée, plus aucun greffon n'en vient (${MARCHE}, ${DEPOT_DU_MARCHE})`
    );
  }
  if (lignes.length === 0) return [];
  writeFileSync(f, `${JSON.stringify(reglages, null, 2)}\n`);
  return lignes;
}
