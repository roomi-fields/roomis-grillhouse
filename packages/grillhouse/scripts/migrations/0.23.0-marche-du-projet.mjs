// The frame's plugin comes from the marketplace roomi-fields, which names the package npm, and
// nothing of a project is published: the marketplace of the project's own, which an earlier update
// wrote, goes (`grillhouse maj` then declares roomi-fields and enables `grillhouse@roomi-fields`).
//
// - The project's `.claude-plugin/marketplace.json` goes when it is the frame's: its name begins
//   with `grillhouse-` and each plugin it lists is `grillhouse`, from the project's package
//   (`./node_modules/@roomi-fields/grillhouse/…`); `.claude-plugin/` left empty goes.
// - In `.claude/settings.json` and `.claude/settings.local.json` (where the add of a marketplace of
//   a directory wrote it), each marketplace whose name begins with `grillhouse-` and that is the
//   project's root (a directory, `./` or `.`) leaves `extraKnownMarketplaces`, and its plugin,
//   `grillhouse@<name>`, leaves `enabledPlugins`. A key left empty goes; the other keys stay, in
//   their order.
// - A project without them is not written.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.23.0';
export const nom = 'place de marché du projet';

const PREFIXE = 'grillhouse-';
const SOURCE_DU_PAQUET = './node_modules/@roomi-fields/grillhouse';
const REGLAGES = ['.claude/settings.json', '.claude/settings.local.json'];

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// Whether the manifest <m> is the frame's marketplace of a project.
const duCadre = m =>
  typeof m?.name === 'string' &&
  m.name.startsWith(PREFIXE) &&
  Array.isArray(m.plugins) &&
  m.plugins.length > 0 &&
  m.plugins.every(
    p =>
      p?.name === 'grillhouse' &&
      typeof p.source === 'string' &&
      p.source.startsWith(`${SOURCE_DU_PAQUET}/`)
  );

// Whether the entry <e> of `extraKnownMarketplaces`, named <n>, is the project's own marketplace.
const declareDuCadre = (n, e) =>
  n.startsWith(PREFIXE) && e?.source?.source === 'directory' && ['./', '.'].includes(e.source.path);

// Takes the project's marketplace off the settings file <rel> of the project at <projet>.
function retirerDesReglages(projet, rel) {
  const f = path.join(projet, rel);
  if (!existsSync(f)) return [];
  const reglages = JSON.parse(readFileSync(f, 'utf8'));
  const marches = reglages.extraKnownMarketplaces;
  if (!marches || typeof marches !== 'object') return [];
  const noms = Object.keys(marches).filter(n => declareDuCadre(n, marches[n]));
  if (noms.length === 0) return [];
  for (const n of noms) {
    delete marches[n];
    delete reglages.enabledPlugins?.[`grillhouse@${n}`];
  }
  if (Object.keys(marches).length === 0) delete reglages.extraKnownMarketplaces;
  if (reglages.enabledPlugins && Object.keys(reglages.enabledPlugins).length === 0) {
    delete reglages.enabledPlugins;
  }
  writeFileSync(f, `${JSON.stringify(reglages, null, 2)}\n`);
  return noms.map(n => `${rel} : place de marché du projet retirée (${n}, grillhouse@${n})`);
}

/** Takes the marketplace of the project's own off the project; returns what it did. */
export function migrer(projet) {
  const lignes = [];
  const dossier = path.join(projet, '.claude-plugin');
  const manifeste = path.join(dossier, 'marketplace.json');
  if (existsSync(manifeste) && duCadre(lireJson(manifeste))) {
    rmSync(manifeste);
    if (readdirSync(dossier).length === 0) rmSync(dossier, { recursive: true });
    lignes.push('.claude-plugin/marketplace.json : place de marché du projet retirée');
  }
  for (const rel of REGLAGES) lignes.push(...retirerDesReglages(projet, rel));
  return lignes;
}
