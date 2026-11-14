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
// - A ticket labelled `direct` is led out of the circuit, by hand: it never starts, even labelled
//   `circuit` too (a label `bd create --parent` copies from its epic).
// - The order is the Beads priority (0 first), then the creation (the oldest first).
// - A circuit alive whose ticket was closed outside it (delivered directly) holds no place: the
//   queue stops it (`fermesHorsCircuit`).
// - A ticket whose dependency is open stays: the board says « attend <ticket> » (scripts/tableau.mjs).
// - A dependency on another project (`external:<project>:<capability>`, Beads' cross-project
//   dependency) holds the ticket until the provider delivered the capability: a closed ticket of
//   that project labelled `provides:<capability>` (which `bd ship` sets; `export:` alone does
//   not deliver). <externes> gives the tickets of each provider by its name in Beads'
//   `external_projects`; a project it lacks holds the ticket, and `attentesExternes` names the
//   fault (never a silent start).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ETAPES } from './etapes.mjs';

// Whether the description of <t> holds its section « ## Architecture »: the rule the queue and the
// board both read.
export const aSonArchitecture = t => /^## Architecture\b/m.test(t.description ?? '');

// The tickets of <tous> in the queue: open, labelled `circuit` and not `direct`, those of
// <enCours> aside.
const enFile = (tous, enCours) =>
  tous.filter(
    t =>
      t.status === 'open' &&
      (t.labels ?? []).includes('circuit') &&
      !(t.labels ?? []).includes('direct') &&
      !enCours.has(t.id)
  );

// The external dependencies of <t>, each { projet, capacite }.
const dependancesExternes = t =>
  (t.dependencies ?? [])
    .filter(d => d.type === 'blocks' && d.depends_on_id.startsWith('external:'))
    .map(d => {
      const [, projet = '', ...reste] = d.depends_on_id.split(':');
      return { projet, capacite: reste.join(':') };
    });

// Whether the provider <projet> delivered <capacite> in <externes>.
const livree = (externes, projet, capacite) =>
  (externes?.[projet] ?? []).some(
    t => t.status === 'closed' && (t.labels ?? []).includes(`provides:${capacite}`)
  );

/**
 * What each ticket of the queue waits for from another project: one { ticket, attend:
 * '<project>:<capability>', faute } per capability not delivered, `faute` naming the project that
 * `external_projects` does not resolve (a project absent of <externes>), null otherwise.
 * @param {Parameters<typeof ticketsAPartir>[0]} tous every ticket of the project
 * @param {{ enCours?: Set<string>, externes?: Record<string, typeof tous> }} [o]
 * @returns {Array<{ ticket: string, attend: string, faute: string | null }>}
 */
export function attentesExternes(tous, { enCours = new Set(), externes } = {}) {
  return enFile(tous, enCours).flatMap(t =>
    attendDeLAutreProjet(t, externes).map(a => ({ ticket: t.id, ...a }))
  );
}

/**
 * What the ticket <t> waits for from another project in <externes>: one { attend:
 * '<project>:<capability>', faute } per capability not delivered (see `attentesExternes`).
 * @param {{ dependencies?: Array<{ type: string, depends_on_id: string }> }} t
 * @param {Record<string, Array<{ status: string, labels?: string[] }>>} [externes]
 * @returns {Array<{ attend: string, faute: string | null }>}
 */
export function attendDeLAutreProjet(t, externes) {
  return dependancesExternes(t)
    .filter(d => !livree(externes, d.projet, d.capacite))
    .map(d => ({
      attend: `${d.projet}:${d.capacite}`,
      faute:
        externes?.[d.projet] === undefined
          ? `le projet ${d.projet} n'est pas dans external_projects de Beads`
          : null,
    }));
}

/**
 * The tickets of <tous> that start now, in the order they start.
 * @param {Array<{ id: string, status: string, priority?: number, labels?: string[],
 *   created_at?: string, description?: string,
 *   dependencies?: Array<{ type: string, depends_on_id: string }> }>} tous
 *   every ticket of the project, the closed ones too
 * @param {{ enCours?: Set<string>, externes?: Record<string, typeof tous> }} [o] `enCours`, the
 *   tickets whose circuit already runs; `externes`, the tickets of each other project by its name
 * @returns {typeof tous}
 */
export function ticketsAPartir(tous, { enCours = new Set(), externes } = {}) {
  const fermes = new Set(tous.filter(t => t.status === 'closed').map(t => t.id));
  return enFile(tous, enCours)
    .filter(
      t =>
        aSonArchitecture(t) &&
        (t.dependencies ?? []).every(
          d =>
            d.type !== 'blocks' ||
            (d.depends_on_id.startsWith('external:') ? true : fermes.has(d.depends_on_id))
        ) &&
        dependancesExternes(t).every(d => livree(externes, d.projet, d.capacite))
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
 * The tickets of each provider project the tickets <tous> depend on (`external:<project>:…`), by
 * the project's name, read through Beads' `external_projects` of the project at <racine>; a
 * project that the configuration does not set, or whose tickets do not read, is left out (the
 * ticket that waits for it stays held, `attentesExternes` naming the fault).
 * @param {string} racine
 * @param {Parameters<typeof ticketsAPartir>[0]} tous
 * @returns {Record<string, typeof tous>}
 */
export function lireLesExternes(racine, tous) {
  const noms = new Set(tous.flatMap(t => dependancesExternes(t).map(d => d.projet)));
  const externes = {};
  for (const nom of noms) {
    const r = spawnSync('bd', ['config', 'get', `external_projects.${nom}`], {
      cwd: racine,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    const chemin = `${r.stdout ?? ''}`.trim();
    if (r.status !== 0 || chemin === '' || chemin.includes('not set')) {
      continue;
    }
    try {
      externes[nom] = lireLesTickets(cheminDuProjetExterne(racine, chemin));
    } catch {
      // Left out: the project does not resolve.
    }
  }
  return externes;
}

/**
 * The directory of a project of `external_projects` whose path <chemin> the Beads of the project
 * at <racine> sets: an absolute path as it is, a relative one from the root of the main tree of
 * <racine> (the parent of its common directory of git, a copy included), where `grillhouse maj`
 * writes it from (`projetsExternes` of ./groupe-cles.mjs).
 * @param {string} racine
 * @param {string} chemin
 * @returns {string}
 */
export function cheminDuProjetExterne(racine, chemin) {
  if (path.isAbsolute(chemin)) {
    return chemin;
  }
  const r = spawnSync(
    'git',
    ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    {
      encoding: 'utf8',
    }
  );
  const principal = r.status === 0 ? path.dirname(r.stdout.trim()) : path.resolve(racine);
  return path.resolve(principal, chemin);
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
