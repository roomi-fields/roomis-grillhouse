// The threshold of Beads that keeps the codes of the tickets at three characters
// (`max_collision_prob`, 0.99). Mechanism: installation.md §5.4 (packages/grillhouse/docs/architecture/).
//
// - A Beads with no value gets 0.99, and the update says so once.
// - Another value stays; the update names it with the command that aligns it, as information that
//   never fails the update.
// - A Beads that cannot be reached (no `bd`, no store) is not written; the update says so.
import { spawnSync } from 'node:child_process';

export const version = '0.44.0';
export const nom = 'seuil des codes de tickets';

const CLE = 'max_collision_prob';
const SEUIL = '0.99';

const bd = (projet, args) =>
  spawnSync('bd', args, { cwd: projet, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** Sets `max_collision_prob` to 0.99 in the Beads of a project that has no value. */
export function migrer(projet) {
  const lu = bd(projet, ['config', 'get', CLE]);
  if (lu.error || lu.status !== 0) {
    return [
      `Beads : ${CLE} non posé (Beads n'est pas joignable : pas de bd ou pas de store) ; ` +
        `le cadre pose ${SEUIL} : bd config set ${CLE} ${SEUIL}`,
    ];
  }
  const valeur = (lu.stdout ?? '').trim();
  if (valeur === SEUIL) {
    return [];
  }
  if (valeur !== '' && !valeur.includes('(not set)')) {
    return [
      `Beads : ${CLE} vaut ${valeur}, gardé (le cadre pose ${SEUIL} ; ` +
        `pour l'aligner : bd config set ${CLE} ${SEUIL})`,
    ];
  }
  const pose = bd(projet, ['config', 'set', CLE, SEUIL]);
  if (pose.error || pose.status !== 0) {
    return [
      `Beads : ${CLE} non posé (bd config set a échoué) ; ` +
        `le cadre pose ${SEUIL} : bd config set ${CLE} ${SEUIL}`,
    ];
  }
  return [`Beads : ${CLE} posé à ${SEUIL} (les codes de tickets restent à trois caractères)`];
}
