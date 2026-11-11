// The rule of the queue of the tickets of a project: the tickets the owner validated (label
// `circuit`) whose dependencies are all closed start by themselves, by Beads priority, as Zuul and
// the merge queues start a change once what it depends on has merged. The queue of the tickets
// under Temporal (src/temporal/tickets/) reads the tickets and applies this rule.
//
// - A ticket starts when it is open, labelled `circuit`, with no circuit already on it, its
//   description holds its section « ## Architecture » (a line that begins so), and every
//   dependency of the type `blocks` is closed: a dependency out of the list read (an unknown
//   ticket) holds it back, a `parent-child` or `related` link does not.
// - A ticket of the queue without its section never starts, as a merge queue admits only a change
//   that passes its checks of entry: `enFileSansArchitecture` names it, for the board and the
//   opening of the supervisor, who writes it.
// - The order is the Beads priority (0 first), then the creation (the oldest first).
// - A circuit alive whose ticket was closed outside it (delivered directly) holds no place: the
//   queue stops it (`fermesHorsCircuit`).
// - A ticket whose dependency is open stays: the board says « attend <ticket> » (scripts/tableau.mjs).
import { spawnSync } from 'node:child_process';
import { ETAPES } from './etapes.mjs';

// Whether the description of <t> holds its section « ## Architecture ».
const aSonArchitecture = t => /^## Architecture\b/m.test(t.description ?? '');

// The tickets of <tous> in the queue: open, labelled `circuit`, those of <enCours> aside.
const enFile = (tous, enCours) =>
  tous.filter(
    t => t.status === 'open' && (t.labels ?? []).includes('circuit') && !enCours.has(t.id)
  );

/**
 * The tickets of <tous> that start now, in the order they start.
 * @param {Array<{ id: string, status: string, priority?: number, labels?: string[],
 *   created_at?: string, description?: string,
 *   dependencies?: Array<{ type: string, depends_on_id: string }> }>} tous
 *   every ticket of the project, the closed ones too
 * @param {{ enCours?: Set<string> }} [o] `enCours`, the tickets whose circuit already runs
 * @returns {typeof tous}
 */
export function ticketsAPartir(tous, { enCours = new Set() } = {}) {
  const fermes = new Set(tous.filter(t => t.status === 'closed').map(t => t.id));
  return enFile(tous, enCours)
    .filter(
      t =>
        aSonArchitecture(t) &&
        (t.dependencies ?? []).every(d => d.type !== 'blocks' || fermes.has(d.depends_on_id))
    )
    .sort(
      (a, b) =>
        (a.priority ?? 2) - (b.priority ?? 2) ||
        Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? '') ||
        a.id.localeCompare(b.id, 'en')
    );
}

// The states of the steps of the integration (5.1, 5.2, 5.3): the circuit's own queue closes the
// ticket at 5.2, then the circuit sorts its discoveries and ends.
const DE_L_INTEGRATION = new Set(
  (ETAPES.find(e => e.numero === '5')?.sous ?? []).map(s => s.etat).concat('integre')
);

/**
 * The tickets of <circuits> (the circuits alive, each its ticket and the step of the state it last
 * wrote, null before its first) closed in <tous> outside their circuit, as Zuul drops from its
 * pipeline a change abandoned or merged: a closed ticket whose circuit stands before its
 * integration. A circuit at its integration closed its ticket itself, and stays.
 * @param {Array<{ id: string, status: string }>} tous every ticket of the project
 * @param {Array<{ ticket: string, etape: string | null }>} circuits
 * @returns {string[]}
 */
export function fermesHorsCircuit(tous, circuits) {
  const fermes = new Set(tous.filter(t => t.status === 'closed').map(t => t.id));
  return circuits
    .filter(c => fermes.has(c.ticket) && !DE_L_INTEGRATION.has(c.etape ?? ''))
    .map(c => c.ticket)
    .sort();
}

/**
 * The tickets of <tous> in the queue that never start for want of their section
 * « ## Architecture », their dependencies open or closed, sorted by id.
 * @param {Parameters<typeof ticketsAPartir>[0]} tous every ticket of the project
 * @param {{ enCours?: Set<string> }} [o] `enCours`, the tickets whose circuit already runs
 * @returns {typeof tous}
 */
export function enFileSansArchitecture(tous, { enCours = new Set() } = {}) {
  return enFile(tous, enCours)
    .filter(t => !aSonArchitecture(t))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
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
