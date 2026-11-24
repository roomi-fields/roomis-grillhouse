// The hooks of Claude Code come from the frame's plugin (mods/grillhouse/hooks/hooks.json), not
// from the project's settings. Mechanism: installation.md §5.4 (packages/grillhouse/docs/architecture/).
//
// - In `.claude/settings.json`, each hook running a former session script under
//   `$CLAUDE_PROJECT_DIR/scripts/` (session-start.sh, structure-guard.sh,
//   verrous/ticket-du-sous-agent.mjs, registre.mjs) goes, then each group, event and `hooks` left
//   empty; a hook of the project's own and the other keys stay, in their order.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.23.0';
export const nom = 'crochets de séance';

// The frame's former session scripts, as the project's settings ran them.
const ANCIENS = [
  'scripts/session-start.sh',
  'scripts/structure-guard.sh',
  'scripts/verrous/ticket-du-sous-agent.mjs',
  'scripts/registre.mjs',
];
const duCadre = crochet =>
  typeof crochet?.command === 'string' &&
  ANCIENS.some(s => crochet.command.includes(`$CLAUDE_PROJECT_DIR/${s}`));

/** Removes the frame's former session hooks from the project's settings; returns what it did. */
export function migrer(projet) {
  const f = path.join(projet, '.claude', 'settings.json');
  if (!existsSync(f)) {
    return [];
  }
  const reglages = JSON.parse(readFileSync(f, 'utf8'));
  if (reglages.hooks === null || typeof reglages.hooks !== 'object') {
    return [];
  }
  const retires = [];
  const hooks = {};
  for (const [evenement, groupes] of Object.entries(reglages.hooks)) {
    if (!Array.isArray(groupes)) {
      hooks[evenement] = groupes;
      continue;
    }
    const restants = groupes
      .map(g => {
        if (!Array.isArray(g?.hooks)) {
          return g;
        }
        const gardes = g.hooks.filter(c => !duCadre(c));
        for (const c of g.hooks) {
          if (duCadre(c)) {
            retires.push(`${evenement} : ${c.command}`);
          }
        }
        return gardes.length > 0 ? { ...g, hooks: gardes } : null;
      })
      .filter(g => g !== null);
    if (restants.length > 0) {
      hooks[evenement] = restants;
    }
  }
  if (retires.length === 0) {
    return [];
  }
  if (Object.keys(hooks).length > 0) {
    reglages.hooks = hooks;
  } else {
    delete reglages.hooks;
  }
  writeFileSync(f, `${JSON.stringify(reglages, null, 2)}\n`);
  return retires.map(r => `.claude/settings.json : crochet retiré, que le greffon porte (${r})`);
}
