// From 0.30.0 the guard of the titles of the tests (scripts/langages/typescript/titres-de-tests.mjs)
// reads the prefix of the tickets from the key `issue-prefix` of `.beads/config.yaml`, committed,
// never from `bd`, which a CI does not have; a project without the key is refused by the guard.
// `bd init` writes that key commented out, and Beads keeps the prefix in its database.
//
// - The migration writes the key `issue-prefix: "<prefix>"` in `.beads/config.yaml` by the one
//   writer of the key (`ecrireLePrefixe` of scripts/prefixe-des-tickets.mjs, which the preparation
//   of a new project calls too), the prefix read once from Beads (`bd config get issue_prefix`,
//   in the project), as the update runs at the poste, where bd is.
// - A file that already holds the key with a value is left, nothing said: a second pass changes
//   nothing.
// - A project without `.beads/` holds no tickets of Beads in this tree: nothing to write. With
//   `.beads/` but without its `config.yaml`, or a prefix Beads does not give, `aFaire` names the
//   key to write.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_BEADS as CONFIG, ecrireLePrefixe, prefixe } from '../../../services-du-noyau.mjs';

export const version = '0.30.0';
export const nom = 'préfixe des tickets';

// The prefix Beads gives in the project at <projet>, null without one.
function prefixeDeBeads(projet) {
  const r = spawnSync('bd', ['config', 'get', 'issue_prefix'], {
    cwd: projet,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const valeur = r.status === 0 ? String(r.stdout ?? '').trim() : '';
  return valeur && !/\s/.test(valeur) ? valeur : null;
}

/** Writes the key `issue-prefix` of the project at <projet> when it lacks it; what it did. */
export function migrer(projet) {
  const f = path.join(projet, CONFIG);
  if (!existsSync(path.dirname(f))) {
    return [];
  }
  if (!existsSync(f)) {
    return [
      {
        aFaire: `${CONFIG} manque : écris-y la clé \`issue-prefix: "<préfixe>"\`, que la garde des titres des tests lit.`,
      },
    ];
  }
  try {
    prefixe(projet);
    return [];
  } catch {
    // The key is missing or empty: it is written below.
  }
  const valeur = prefixeDeBeads(projet);
  if (!valeur) {
    return [
      {
        aFaire: `${CONFIG} : Beads ne donne pas le préfixe des tickets (\`bd config get issue_prefix\`) ; écris la clé \`issue-prefix: "<préfixe>"\`, que la garde des titres des tests lit.`,
      },
    ];
  }
  const ligne = ecrireLePrefixe(projet, valeur);
  return ligne ? [`${CONFIG} : ${ligne}, lu de Beads, que la garde des titres des tests lit`] : [];
}
