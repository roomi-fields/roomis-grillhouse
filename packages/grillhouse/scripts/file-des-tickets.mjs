// The rule of the queue of the tickets of a project: the tickets the owner validated (label
// `circuit`) whose dependencies are all closed start by themselves, by Beads priority, as Zuul and
// the merge queues start a change once what it depends on has merged. The queue of the tickets
// under Temporal (src/temporal/tickets/) reads the tickets and applies this rule.
//
// - A ticket starts when it is open, labelled `circuit`, with no circuit already on it, and when
//   every dependency of the type `blocks` is closed: a dependency out of the list read (an unknown
//   ticket) holds it back, a `parent-child` or `related` link does not.
// - The order is the Beads priority (0 first), then the creation (the oldest first).
// - A ticket whose dependency is open stays: the board says « attend <ticket> » (scripts/tableau.mjs).
import { spawnSync } from 'node:child_process';

/**
 * The tickets of <tous> that start now, in the order they start.
 * @param {Array<{ id: string, status: string, priority?: number, labels?: string[],
 *   created_at?: string, dependencies?: Array<{ type: string, depends_on_id: string }> }>} tous
 *   every ticket of the project, the closed ones too
 * @param {{ enCours?: Set<string> }} [o] `enCours`, the tickets whose circuit already runs
 * @returns {typeof tous}
 */
export function ticketsAPartir(tous, { enCours = new Set() } = {}) {
  const fermes = new Set(tous.filter(t => t.status === 'closed').map(t => t.id));
  return tous
    .filter(
      t =>
        t.status === 'open' &&
        (t.labels ?? []).includes('circuit') &&
        !enCours.has(t.id) &&
        (t.dependencies ?? []).every(d => d.type !== 'blocks' || fermes.has(d.depends_on_id))
    )
    .sort(
      (a, b) =>
        (a.priority ?? 2) - (b.priority ?? 2) ||
        Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? '') ||
        a.id.localeCompare(b.id, 'en')
    );
}

/**
 * Every ticket of the project at <racine>, the closed ones too, as Beads gives them; a Beads that
 * fails or a list that does not parse throws, its reason named (`bd list`), never an empty list.
 */
export function lireLesTickets(racine) {
  const r = spawnSync('bd', ['list', '--all', '--limit', '0', '--json'], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const raison = `${r.stderr ?? ''}`.trim() || r.error?.message || `code ${r.status}`;
    throw new Error(`les tickets ne se lisent pas (bd list) : ${raison}`);
  }
  try {
    return JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(`les tickets ne se lisent pas (bd list) : ${e.message}`);
  }
}
