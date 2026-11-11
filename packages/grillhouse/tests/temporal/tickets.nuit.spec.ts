// @poste: un serveur Temporal
// grillhouse-4nr.9, decision D9: the queue of the tickets of a project under Temporal, played on a
// development server of trial (the pinned program TEMPORAL on a free port, a database file of its
// own). One workflow per project (`ticketsDuProjet`, `tickets:<racine>`), woken every `reveilMs`
// (60 s) and at the end of each of its circuits, starts the circuit of each ticket that starts
// (`ticketsAPartir` of scripts/file-des-tickets.mjs, unchanged: open, labelled `circuit`, its
// dependencies closed, by priority), no more circuits alive at once than the setting of the project
// (`grillhouse.circuits`, 1 when absent). Its reading of the tickets is simulated by the test over
// `ticketsAPartir` itself; the circuits alive and those not integrated are read from the server
// (the real activities).
// The circuits it starts are true workflows of a ticket whose opening stops on a question, so
// that each stays alive until the test stops it (--arreter). Criteria 1 (by priority), 2 (never
// without the label), 3 (the bound, the next one at the end of the previous), 4 (a ticket that has a
// workflow does not start again, and a circuit stopped without its integration holds its ticket
// until the supervisor's word, the server holding it) and 5 (the queue survives a stop
// of the server); the circuits it has just started count while the server's visibility does not
// show them yet; its recorded history replays on the current code
// (./histoires/tickets-du-projet.json).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NativeConnection, Worker } from '@temporalio/worker';
import { afterEach, describe, expect, it } from 'vitest';
import { reglageDesCircuits } from '../../scripts/circuits-cles.mjs';
import { ticketsAPartir } from '../../scripts/file-des-tickets.mjs';
import { ATTRIBUTS_DE_RECHERCHE, ouvrirLeClient } from '../../src/temporal/client.js';
import { arreterLeCircuit, demarrerLeCircuit } from '../../src/temporal/circuit/client.js';
import {
  idDuCircuit,
  type Activites,
  type ArretPublie,
} from '../../src/temporal/circuit/contrat.js';
import {
  circuitsNonIntegres,
  circuitsVivants,
  tracerLaFile,
} from '../../src/temporal/tickets/activites.js';
import { demarrerLesTickets, lireLaFileDesTickets } from '../../src/temporal/tickets/client.js';
import { idDesTickets, type ActivitesDesTickets } from '../../src/temporal/tickets/contrat.js';
import {
  PAQUET,
  attendre,
  demarrerLeServeur,
  dossier,
  portLibre,
  programmeTemporal,
} from './essai.js';

const DEROULES = path.join(PAQUET, 'dist/temporal/deroules.js');
const RACINE = '/depot/essai';
const FILE = 'essai-tickets';

const arrets: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const a of arrets.splice(0)) {
    await a();
  }
});

interface Ticket {
  id: string;
  status: string;
  priority: number;
  labels: string[];
  created_at: string;
  description: string;
}
let n = 0;
const T = (id: string, o: Partial<Ticket> = {}): Ticket => ({
  id,
  status: 'open',
  priority: 2,
  labels: ['circuit'],
  created_at: `2026-11-04T10:00:${String(++n % 60).padStart(2, '0')}Z`,
  description: '## Architecture\n\n- Adresse.',
  ...o,
});

// The circuit of a ticket opens on a question: it stays alive until --arreter.
const QUESTION: ArretPublie = {
  code: 13,
  nom: 'besoin',
  question: { arret: 'besoin', fait: 'f', piece: 'p', question: 'q', qui: 'superviseur' },
  etat: { etape: 'plan', tentative: 1, rapport: null, finale: false, raison: 'besoin' },
};
const circuit: Activites = {
  ouvrirLeCircuit: () => Promise.resolve({ arret: QUESTION, effets: [] }),
  preparerLaPasse: ({ etape }) =>
    Promise.resolve({ memoire: {}, etat: etape, menee: null, effets: [] }),
  lireUnFait: () => Promise.resolve({ valeur: null, memoire: {}, effets: [] }),
  appliquerLesEffets: () => Promise.resolve({ effets: [] }),
  publierLArret: () => Promise.resolve({ ...QUESTION, effets: [] }),
  finirLeTicket: () => Promise.resolve({ effets: [] }),
  arreterLeTicket: () => Promise.resolve({ effets: [] }),
  jouerUnEffet: () => Promise.resolve(),
  jouerUnPasDuPlan: () => Promise.resolve({ arret: QUESTION, effets: [] }),
};

// The tickets of the project as Beads gives them (<tickets>, which a test changes) and its
// setting (<circuits>, the key `grillhouse.circuits` of its package.json, absent when undefined).
// The circuits not integrated are read from the server (the real activity).
function projet(tickets: Ticket[], circuits?: unknown) {
  const etat = { tickets };
  const paquet = circuits === undefined ? {} : { grillhouse: { circuits } };
  const lecture: Pick<ActivitesDesTickets, 'ticketsAPartir'> = {
    ticketsAPartir: ({ enCours }) =>
      Promise.resolve({
        partir: ticketsAPartir(etat.tickets, { enCours: new Set(enCours) }).map(t => t.id),
        ...reglageDesCircuits(paquet),
      }),
  };
  return { etat, lecture };
}

// A server on the database <db> and the port <port>, a worker of this process, a client.
async function serveur(activites: object, db = path.join(dossier('tickets'), 'temporal.db')) {
  const port = await portLibre();
  const lancerLeServeur = () =>
    demarrerLeServeur(programmeTemporal(), db, port, ATTRIBUTS_DE_RECHERCHE);
  let s = await lancerLeServeur();
  arrets.push(() => s.tuer());
  const avant = process.env.TEMPORAL_ADDRESS;
  process.env.TEMPORAL_ADDRESS = s.adresse;
  arrets.push(() => {
    if (avant === undefined) {
      delete process.env.TEMPORAL_ADDRESS;
    } else {
      process.env.TEMPORAL_ADDRESS = avant;
    }
    return Promise.resolve();
  });
  const connexion = await NativeConnection.connect({ address: s.adresse });
  const travailleur = await Worker.create({
    connection: connexion,
    taskQueue: FILE,
    workflowsPath: DEROULES,
    activities: { ...circuit, circuitsVivants, circuitsNonIntegres, tracerLaFile, ...activites },
  });
  const fin = travailleur.run();
  arrets.unshift(async () => {
    travailleur.shutdown();
    await fin;
    await connexion.close();
  });
  const c = ouvrirLeClient({ adresse: s.adresse });
  arrets.unshift(() => c.fermer());
  // The server stopped, then started again on the same database and port.
  const redemarrer = async () => {
    await s.tuer();
    s = await lancerLeServeur();
  };
  return { client: c.client, redemarrer };
}

type LeClient = Awaited<ReturnType<typeof serveur>>['client'];
// The tickets whose circuit runs, as the queue of the tickets of <racine> reads them.
const vivants = async (client: LeClient, racine = RACINE) =>
  (await lireLaFileDesTickets(client, racine)).vivants.slice().sort();
const enAttente = (client: LeClient, attendus: string[], delai?: number, racine = RACINE) =>
  attendre(
    `les circuits ${attendus.join(', ')}`,
    async () => {
      const v = await vivants(client, racine);
      return JSON.stringify(v) === JSON.stringify([...attendus].sort()) ? v : undefined;
    },
    delai
  );
// The runs of the circuit of <ticket> in the project at <racine>.
const lances = async (client: LeClient, ticket: string, racine = RACINE) => {
  let runs = 0;
  for await (const _ of client.workflow.list({
    query: `WorkflowId = '${idDuCircuit(racine, ticket)}'`,
  })) {
    runs += 1;
  }
  return runs;
};

describe('un ticket circuit aux dépendances fermées démarre par priorité', () => {
  it('one at a time, by priority, the next one woken by the end of the previous', async () => {
    const p = projet(
      [T('d-1', { priority: 2 }), T('d-2', { priority: 0 }), T('d-3', { priority: 1 })],
      1
    );
    const s = await serveur(p.lecture);
    // Woken every 10 min: only the end of a circuit wakes it within the test.
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 600_000 }, FILE);
    await enAttente(s.client, ['d-2']);
    p.etat.tickets = p.etat.tickets.map(t => (t.id === 'd-2' ? { ...t, status: 'closed' } : t));
    await arreterLeCircuit(s.client, RACINE, 'd-2', null);
    await enAttente(s.client, ['d-3']);
    p.etat.tickets = p.etat.tickets.map(t => (t.id === 'd-3' ? { ...t, status: 'closed' } : t));
    await arreterLeCircuit(s.client, RACINE, 'd-3', null);
    await enAttente(s.client, ['d-1']);
  }, 120_000);
});

describe('un ticket sans l’étiquette circuit ne démarre jamais', () => {
  it('only the ticket labelled circuit starts, the other never', async () => {
    const p = projet([T('d-1', { labels: [] }), T('d-2')], 2);
    const s = await serveur(p.lecture);
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 200 }, FILE);
    await enAttente(s.client, ['d-2']);
    await new Promise(r => setTimeout(r, 1500));
    expect(await vivants(s.client)).toEqual(['d-2']);
    expect(await lances(s.client, 'd-1')).toBe(0);
  }, 120_000);
});

describe('pas plus de circuits vivants que le réglage du projet', () => {
  it('two at most: the third starts once one of them ends', async () => {
    const p = projet([T('d-1'), T('d-2'), T('d-3')], 2);
    const s = await serveur(p.lecture);
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 200 }, FILE);
    const deux = await enAttente(s.client, ['d-1', 'd-2']);
    await new Promise(r => setTimeout(r, 1500));
    expect(await vivants(s.client)).toEqual(deux);
    expect(await lances(s.client, 'd-3')).toBe(0);
    p.etat.tickets = p.etat.tickets.map(t => (t.id === 'd-1' ? { ...t, status: 'closed' } : t));
    await arreterLeCircuit(s.client, RACINE, 'd-1', null);
    await enAttente(s.client, ['d-2', 'd-3']);
  }, 120_000);

  it('without a setting, one circuit runs at a time', async () => {
    const p = projet([T('d-1'), T('d-2'), T('d-3')]);
    const s = await serveur(p.lecture);
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 200 }, FILE);
    await enAttente(s.client, ['d-1']);
    await new Promise(r => setTimeout(r, 1500));
    expect(await vivants(s.client)).toEqual(['d-1']);
  }, 120_000);

  it('a faulty setting starts nothing, the queue says it by its name', async () => {
    const p = projet([T('d-1')], 0);
    const s = await serveur(p.lecture);
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 200 }, FILE);
    const v = await attendre('la faute du réglage', async () => {
      const x = await lireLaFileDesTickets(s.client, RACINE);
      return x.faute ? x : undefined;
    });
    expect(v.faute).toMatch(/grillhouse\.circuits vaut 0/);
    await new Promise(r => setTimeout(r, 1000));
    expect(await lances(s.client, 'd-1')).toBe(0);
  }, 120_000);
});

describe('un ticket qui a déjà un déroulé ne repart pas', () => {
  it('a circuit started by hand counts among the alive ones, and is not started again', async () => {
    const p = projet([T('d-1', { priority: 0 }), T('d-2', { priority: 1 })], 1);
    const s = await serveur(p.lecture);
    await demarrerLeCircuit(s.client, { racine: RACINE, ticket: 'd-2' }, FILE);
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 200 }, FILE);
    await enAttente(s.client, ['d-2']);
    await new Promise(r => setTimeout(r, 1500));
    // d-1 comes first by priority, but the bound is held by d-2's circuit.
    expect(await vivants(s.client)).toEqual(['d-2']);
    expect(await lances(s.client, 'd-1')).toBe(0);
    expect(await lances(s.client, 'd-2')).toBe(1);
  }, 120_000);
});

describe('la file survit à un arrêt du serveur', () => {
  it('the server stopped and started again: a ticket ready after it starts', async () => {
    const p = projet([T('d-1')], 1);
    const s = await serveur(p.lecture);
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 500 }, FILE);
    await enAttente(s.client, ['d-1']);
    await s.redemarrer();
    p.etat.tickets = [{ ...p.etat.tickets[0]!, status: 'closed' }, T('d-2')];
    await arreterLeCircuit(s.client, RACINE, 'd-1', null);
    // The worker polls the restarted server again after a backoff, longer under load: a guard of
    // 90 s, for a wait of a few seconds at rest.
    await enAttente(s.client, ['d-2'], 90_000);
    const d = await s.client.workflow.getHandle(idDesTickets(RACINE)).describe();
    expect(d.status.name).toBe('RUNNING');
  }, 180_000);
});

describe('un circuit arrêté sans intégration tient son ticket', () => {
  it('a circuit stopped by the supervisor, its ticket still open: it does not start again, the next ticket does', async () => {
    const racine = RACINE;
    const p = projet([T('d-1', { priority: 0 }), T('d-2', { priority: 1 })], 1);
    // The stop on the supervisor's word gives back the state it writes (scripts/circuit.mjs
    // `arreter`), which the workflow publishes in its memo: the server holds the circuit closed,
    // not integrated (`circuitsNonIntegres`, the real activity).
    const s = await serveur({
      ...p.lecture,
      arreterLeTicket: ({ etat }: { etat: object }) =>
        Promise.resolve({
          effets: [{ genre: 'etat', etat: { ...etat, code: null, raison: 'arrete' } }],
        }),
    });
    await demarrerLesTickets(s.client, { racine, reveilMs: 200 }, FILE);
    await enAttente(s.client, ['d-1'], undefined, racine);
    await arreterLeCircuit(s.client, racine, 'd-1', null);
    await enAttente(s.client, ['d-2'], undefined, racine);
    await new Promise(r => setTimeout(r, 1500));
    expect(await lances(s.client, 'd-1', racine)).toBe(1);
  }, 120_000);
});

describe('la file tient sa borne quand la visibilité du serveur retarde', () => {
  // The server's visibility shows no circuit yet: only the circuits the queue started count.
  const invisibles = { circuitsVivants: () => Promise.resolve([]) };

  it('one place, nothing visible: the circuit just started holds it, a ticket of a higher priority waits', async () => {
    const p = projet([T('d-1', { priority: 1 }), T('d-2', { priority: 2 })], 1);
    const s = await serveur({ ...p.lecture, ...invisibles });
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 200 }, FILE);
    await attendre('le circuit de d-1', async () =>
      (await lances(s.client, 'd-1')) > 0 ? true : undefined
    );
    // d-2 now comes first: only the circuit the queue started holds the place.
    p.etat.tickets = p.etat.tickets.map(t => (t.id === 'd-2' ? { ...t, priority: 0 } : t));
    await new Promise(r => setTimeout(r, 2000));
    expect(await lances(s.client, 'd-2')).toBe(0);
  }, 120_000);

  it('a circuit started by hand, not visible yet: it is not started again, and the queue runs on', async () => {
    const p = projet([T('d-2')], 1);
    const s = await serveur({ ...p.lecture, ...invisibles });
    await demarrerLeCircuit(s.client, { racine: RACINE, ticket: 'd-2' }, FILE);
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 200 }, FILE);
    await new Promise(r => setTimeout(r, 2000));
    expect(await lances(s.client, 'd-2')).toBe(1);
    const d = await s.client.workflow.getHandle(idDesTickets(RACINE)).describe();
    expect(d.status.name).toBe('RUNNING');
  }, 120_000);
});

// The class of the protobuf message of a history, which writes it as plain JSON and reads it
// back, its integers and its enums as text (as ./file.nuit.spec.ts records the queue's).
type ClasseDHistoire = {
  toObject(h: unknown, o: object): unknown;
  fromObject(o: unknown): Parameters<typeof Worker.runReplayHistory>[1];
};
const HistoireDuProto = (h: object) => h.constructor as unknown as ClasseDHistoire;
const ENTIER = { longs: String, enums: String, bytes: String };

describe('l’histoire de la file des tickets se rejoue sur le code courant', () => {
  it('the history of the queue of the tickets after two circuits replays', async () => {
    const p = projet([T('d-1', { priority: 1 }), T('d-2', { priority: 0 })], 1);
    const s = await serveur(p.lecture);
    // Woken every 10 min: only the end of a circuit wakes it, so that its history is the same
    // from one run to the next.
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 600_000 }, FILE);
    await enAttente(s.client, ['d-2']);
    p.etat.tickets = p.etat.tickets.map(t => (t.id === 'd-2' ? { ...t, status: 'closed' } : t));
    await arreterLeCircuit(s.client, RACINE, 'd-2', null);
    await enAttente(s.client, ['d-1']);
    const id = idDesTickets(RACINE);
    const histoire = await s.client.workflow.getHandle(id).fetchHistory();
    const fichier = path.join(__dirname, 'histoires', 'tickets-du-projet.json');
    // Recorded when absent, and red: to record it anew, remove the file, play the test, then
    // commit the file it wrote.
    if (!existsSync(fichier)) {
      writeFileSync(
        fichier,
        `${JSON.stringify(HistoireDuProto(histoire).toObject(histoire, ENTIER), null, 1)}\n`
      );
      expect.fail(`histoire enregistrée manquante, écrite, à commiter : ${fichier}`);
    }
    // The id of the workflow, from which the id of each child derives.
    await Worker.runReplayHistory({ workflowsPath: DEROULES }, histoire, id);
    const enregistree = HistoireDuProto(histoire).fromObject(
      JSON.parse(readFileSync(fichier, 'utf8'))
    );
    await Worker.runReplayHistory({ workflowsPath: DEROULES }, enregistree, id);
  }, 120_000);
});

describe('la séance du superviseur va de la commande à chaque circuit', () => {
  it('the session the queue receives with a ticket reaches the acts of the circuit it starts', async () => {
    const p = projet([T('d-1')], 1);
    const vus: (string | null)[] = [];
    const s = await serveur({
      ...p.lecture,
      ouvrirLeCircuit: (e: { superviseur?: string | null }) => {
        vus.push(e.superviseur ?? null);
        return Promise.resolve({ arret: QUESTION, effets: [] });
      },
    });
    await demarrerLesTickets(
      s.client,
      { racine: RACINE, reveilMs: 600_000 },
      FILE,
      'seance-du-superviseur'
    );
    await enAttente(s.client, ['d-1']);
    await attendre("l'ouverture de d-1", () => Promise.resolve(vus.length ? vus : undefined));
    expect(vus).toEqual(['seance-du-superviseur']);
  }, 120_000);
});
