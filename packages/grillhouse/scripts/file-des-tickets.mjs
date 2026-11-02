// The queue of the tickets of a project: the tickets the owner validated (label `circuit`) whose
// dependencies are all closed start by themselves, by Beads priority, as Zuul and the merge queues
// start a change once what it depends on has merged. Each project keeps its own queue (its tickets
// `circuit`); the order of arrival between projects is the rank the circuit draws when it is
// launched (scripts/places-de-la-machine.mjs), so a started circuit waits for a place in the line.
// No daemon: the queue plays at the end of a circuit (scripts/circuit.mjs `aLaFin`) and at the
// opening of the supervisor (scripts/superviseur.mjs `circuitsALOuverture`).
//
// - A ticket starts when it is open, labelled `circuit`, with no circuit already on it, and when
//   every dependency of the type `blocks` is closed: a dependency out of the list read (an unknown
//   ticket) holds it back, a `parent-child` or `related` link does not.
// - The order is the Beads priority (0 first), then the creation (the oldest first).
// - A ticket whose dependency is open stays: the board says « attend <ticket> » (scripts/tableau.mjs).
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { lireCircuits } from './tableau.mjs';

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

// Every ticket of the project at <racine>, the closed ones too, as Beads gives them.
function lireLesTickets(racine) {
  try {
    return JSON.parse(
      execFileSync('bd', ['list', '--all', '--limit', '0', '--json'], {
        cwd: racine,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 256 * 1024 * 1024,
      })
    );
  } catch {
    return [];
  }
}

// Launches the circuit of <ticket> in the project at <racine>: it returns at once (the circuit
// runs as a daemon, scripts/demon.mjs) and waits for a place.
function lancerLeCircuit(racine, ticket) {
  spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, 'circuit.mjs'), ticket],
    { cwd: racine, stdio: 'ignore' }
  );
}

/**
 * Launches the tickets of the project at <racine> that start now (`ticketsAPartir`) and returns
 * them, in the order launched. Each circuit then waits for a place of the machine.
 * @param {string} racine the root of the project
 * @param {{ tickets?: Parameters<typeof ticketsAPartir>[0], lancer?: (ticket: string) => unknown,
 *   enCours?: Set<string> }} [o] `tickets`, the tickets read (Beads by default); `lancer`, the launch
 *   of one circuit; `enCours`, the tickets that have a circuit (those of the states of the project
 *   by default)
 * @returns {string[]}
 */
export function lancerLaFile(
  racine,
  {
    tickets = lireLesTickets(racine),
    lancer = ticket => lancerLeCircuit(racine, ticket),
    enCours = new Set(lireCircuits({ racine }).map(c => c.ticket)),
  } = {}
) {
  const partis = ticketsAPartir(tickets, { enCours }).map(t => t.id);
  for (const id of partis) lancer(id);
  return partis;
}
