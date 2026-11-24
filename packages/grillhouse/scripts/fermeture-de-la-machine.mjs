// The closure of the machine by the supervisor (docs/architecture/machine.md, §5.7):
// the decision of each command on the reservation of the machine in place, and the lines it
// says, what still runs by project and by ticket (sessions: the places of the workflow of the
// machine; passes: their parts), « la machine est vide » when nothing plays, and how long the
// closure has lasted. Pure: the workflow of the places (src/temporal/places/deroule.ts) bundles
// the decisions, so this module imports only a rule that imports nothing. The commands themselves
// are scripts/machine.mjs.
import { duree } from './regles-des-places.mjs';

/**
 * What the command of closure does on the reservation <reservation> of the machine (null without):
 * `'fermer'` when none stands, `'deja-fermee'` under the supervisor's closure.
 * @param {object | null | undefined} reservation
 * @returns {'fermer' | 'deja-fermee'}
 */
export function decisionDeFermeture(reservation) {
  return reservation ? 'deja-fermee' : 'fermer';
}

/**
 * What the command of reopening does on the reservation <reservation>: `'rouvrir'` the supervisor's
 * closure, `'deja-ouverte'` when none stands.
 * @param {object | null | undefined} reservation
 * @returns {'rouvrir' | 'deja-ouverte'}
 */
export function decisionDeReouverture(reservation) {
  return reservation ? 'rouvrir' : 'deja-ouverte';
}

// The folder name of a root of project, « alpha » for « /depots/alpha ».
const nomDuProjet = racine => (racine ? (racine.split('/').filter(Boolean).at(-1) ?? racine) : '?');

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * What still runs, one line by project: its sessions (`prises`, the places of the workflow of the
 * machine) and its passes (`parts` that hold their part; a pass that waits does not run), each with
 * its tickets. Only « la machine est vide » when nothing runs.
 * @param {{ prises: { ticket?: string | null, racine?: string | null }[],
 *   parts: { ticket?: string | null, projet?: string | null, etat?: string }[] }} o
 * @returns {string[]}
 */
export function direCeQuiTourne({ prises, parts }) {
  /** @type {Map<string, { seances: string[], passes: string[] }>} */
  const projets = new Map();
  const de = nom => {
    if (!projets.has(nom)) {
      projets.set(nom, { seances: [], passes: [] });
    }
    return projets.get(nom);
  };
  for (const p of prises) {
    de(nomDuProjet(p.racine)).seances.push(p.ticket ?? 'sans ticket');
  }
  for (const p of parts.filter(x => x.etat !== 'attend')) {
    de(nomDuProjet(p.projet)).passes.push(p.ticket ?? 'sans ticket');
  }
  if (!projets.size) {
    return ['la machine est vide'];
  }
  return [...projets.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([nom, { seances, passes }]) =>
      [
        nom,
        ...(seances.length ? [`${pluriel(seances.length, 'séance')} (${seances.join(', ')})`] : []),
        ...(passes.length ? [`${pluriel(passes.length, 'passe')} (${passes.join(', ')})`] : []),
      ].join(' · ')
    );
}

/**
 * The lines a command says once it has played: its <issue> (`fermee`, `deja-fermee` for the
 * closure; `rouverte`, `deja-ouverte` for the reopening), then, for a closure, what still runs. <reservation> is the one in place after the
 * command (its start gives how long the closure has lasted), <maintenant> the time in ms.
 * @param {{ issue: string, reservation: { depuis: number } | null,
 *   prises: Parameters<typeof direCeQuiTourne>[0]['prises'],
 *   parts: Parameters<typeof direCeQuiTourne>[0]['parts'], maintenant: number }} o
 * @returns {string[]}
 */
export function direLaFermeture({ issue, reservation, prises, parts, maintenant }) {
  const tourne = direCeQuiTourne({ prises, parts });
  switch (issue) {
    case 'fermee':
      return ['machine fermée par le superviseur : aucune place neuve, aucun circuit neuf', ...tourne];
    case 'deja-fermee':
      return [
        `machine déjà fermée par le superviseur, depuis ${reservation ? duree(maintenant - reservation.depuis) : '?'}`,
        ...tourne,
      ];
    case 'rouverte':
      return ['machine rouverte : les circuits reprennent d’eux-mêmes à l’étape suivante'];
    case 'deja-ouverte':
      return ['machine déjà ouverte : rien à faire'];
    default:
      throw new Error(`issue inconnue : ${issue}`);
  }
}
