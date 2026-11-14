// @poste: un serveur Temporal
// Un circuit qui attend une place (en pause rouverte, ou « a-repasser » d'une attente de place)
// repart à neuf quand son histoire approche sa limite, depuis la boucle d'attente elle-même, sans
// perdre son rang, son arrêt ni la vue du panneau. Seul un Temporal monté prouve la reprise à neuf
// (grand, de nuit) : les actes sont simulés par le test, les décisions du circuit sont les siennes.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultPayloadConverter } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  ATTRIBUTS_DE_RECHERCHE,
  lireLeDeroule,
  ouvrirLeClient,
} from '../../src/temporal/client.js';
import {
  arreterLeCircuit,
  demarrerLeCircuit,
  finDuCircuit,
  lireLeCircuit,
  reprendreLeCircuit,
} from '../../src/temporal/circuit/client.js';
import {
  idDuCircuit,
  type Activites,
  type EntreeDuCircuit,
  type EtatDeLEtape,
} from '../../src/temporal/circuit/contrat.js';
import {
  PAQUET,
  attendre,
  demarrerLeServeur,
  dossier,
  portLibre,
  programmeTemporal,
} from './essai.js';

const DEROULES = path.join(PAQUET, 'dist/temporal/deroules.js');
const HISTOIRE = path.join(__dirname, 'histoires/circuit-attente-de-place.json');
const RACINE = '/depot/essai';
const TICKET = 'essai-1';
const FILE = 'essai-attente-de-place';
const RANG = 7;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-attente-de-place-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type ClasseDHistoire = {
  toObject(h: unknown, o: object): unknown;
  fromObject(o: unknown): Parameters<typeof Worker.runReplayHistory>[1];
};
const HistoireDuProto = (h: object) => h.constructor as unknown as ClasseDHistoire;
const ENTIER = { longs: String, enums: String, bytes: String };

const arrets: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const a of arrets.splice(0)) {
    await a();
  }
});

const VERT = {
  rouge: false,
  aRepasser: false,
  arbitrer: false,
  auDeveloppeur: false,
  texte: 't',
  complet: 'c',
  sansListe: 's',
  avertissements: '',
  rouges: [],
  resume: 'r',
  horsTitre: [],
  lieux: [],
  references: [],
  tous: [],
  notes: [],
};
const FAITS: Record<string, unknown> = {
  mecanique: false,
  sansTests: false,
  seance: { statut: 'FAIT' },
  lecture: null,
  preuve: { ok: true, rouges: 1, texte: 'preuve', resume: 'r', resultat: {} },
  empreinteAvant: 'a',
  empreinte: 'b',
  renvoi: null,
  livre: true,
  controles: VERT,
  passeFinale: { arbre: 'x', restreinte: false },
  lotAccepte: false,
  relecture: { verdict: 'ACCEPTÉ', fiche: {}, texte: 'ACCEPTÉ', arbre: 'x' },
  integration: { code: 0, sortie: '', commande: 'integrer' },
  commit: 'abc1234',
  tri: true,
};
const TESTS: EtatDeLEtape = { etape: 'testwriter', tentative: 1, rapport: null, finale: false };

interface Journal {
  ouvertures: Parameters<Activites['ouvrirLeCircuit']>[0][];
  preparees: number;
  arrets: Parameters<Activites['publierLArret']>[0][];
  arretes: Parameters<Activites['arreterLeTicket']>[0][];
  /** Each demand of a place, with what the acts had done when it came. */
  places: { rang: number | null; ouvertures: number; preparees: number }[];
}

// The acts of a ticket the test simulates: <faits> as they are read (a value, or a function of
// the number of its readings); the demand of a place answered by <place> (its rank of call).
function simuler(faits: Record<string, unknown>, place: (n: number) => Promise<boolean> | boolean) {
  const journal: Journal = { ouvertures: [], preparees: 0, arrets: [], arretes: [], places: [] };
  const lus: Record<string, number> = {};
  const a = {
    ouvrirLeCircuit(o: Parameters<Activites['ouvrirLeCircuit']>[0]) {
      journal.ouvertures.push(o);
      return Promise.resolve({
        ouverture: {
          debut: o.arrete ? ({ ...o.arrete } as EtatDeLEtape) : TESTS,
          memoire: { constats: [], rang: RANG },
          ticket: { id: TICKET, paquets: ['packages/a'], sorte: null, copie: '/copie' },
        },
        effets: [],
      });
    },
    preparerLaPasse({ etape }: { etape: EtatDeLEtape }) {
      journal.preparees += 1;
      return Promise.resolve({ memoire: {}, etat: etape, menee: null, effets: [] });
    },
    lireUnFait({ fait }: { fait: string }) {
      lus[fait] = (lus[fait] ?? 0) + 1;
      const f = fait in faits ? faits[fait] : FAITS[fait];
      const valeur = typeof f === 'function' ? (f as (n: number) => unknown)(lus[fait]) : f;
      return Promise.resolve({ valeur, memoire: {}, effets: [] });
    },
    appliquerLesEffets() {
      return Promise.resolve({ effets: [] });
    },
    publierLArret(e: Parameters<Activites['publierLArret']>[0]) {
      journal.arrets.push(e);
      const nom = String(
        (e.arret.leve as { nom?: string })?.nom ?? (e.arret.inattendu ? 'inattendu' : e.arret.nom)
      );
      return Promise.resolve({
        code: nom === 'a-repasser' ? 75 : 13,
        nom,
        question: e.monter
          ? {
              arret: nom,
              fait: 'le fait',
              piece: 'la pièce',
              question: 'que faire ?',
              qui: 'superviseur',
            }
          : null,
        etat: { ...e.etat, raison: nom },
        effets: [],
      });
    },
    finirLeTicket() {
      return Promise.resolve({ effets: [] });
    },
    arreterLeTicket(e: Parameters<Activites['arreterLeTicket']>[0]) {
      journal.arretes.push(e);
      return Promise.resolve({ effets: [] });
    },
    jouerUnEffet() {
      return Promise.resolve();
    },
    mesurerLaCopieDuTicket: () => Promise.resolve(null),
    reprendreUnePlace(e: { rang: number | null }) {
      journal.places.push({
        rang: e.rang,
        ouvertures: journal.ouvertures.length,
        preparees: journal.preparees,
      });
      return Promise.resolve(place(journal.places.length));
    },
    situerLeLot: () => Promise.resolve({ statut: 'closed', raison: 'fermé' }),
  };
  return { activites: a as unknown as Activites, journal };
}

async function lancer(activites: Activites, entree: Partial<EntreeDuCircuit> = {}) {
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('attente-de-place'), 'temporal.db'),
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const connexion = await NativeConnection.connect({ address: s.adresse });
  const travailleur = await Worker.create({
    connection: connexion,
    taskQueue: FILE,
    workflowsPath: DEROULES,
    activities: activites as unknown as Record<string, (...a: unknown[]) => unknown>,
    maxHeartbeatThrottleInterval: '1 second',
    defaultHeartbeatThrottleInterval: '1 second',
  });
  const fin = travailleur.run();
  arrets.unshift(async () => {
    travailleur.shutdown();
    await fin;
    await connexion.close();
  });
  const c = ouvrirLeClient({ adresse: s.adresse });
  arrets.unshift(() => c.fermer());
  await demarrerLeCircuit(c.client, { racine: RACINE, ticket: TICKET, ...entree }, FILE);
  return c.client;
}
type Client = Awaited<ReturnType<typeof lancer>>;
const id = idDuCircuit(RACINE, TICKET);

// The runs that a Continue-As-New started, each with its input (the `suite` it carries), its memo
// and its events, in the order of their start.
async function reprises(client: Client) {
  const rendues: {
    suite: Record<string, unknown> | undefined;
    memo: Record<string, unknown>;
    events: NonNullable<
      Awaited<ReturnType<ReturnType<Client['workflow']['getHandle']>['fetchHistory']>>['events']
    >;
  }[] = [];
  for await (const w of client.workflow.list({ query: `WorkflowId = '${id}'` })) {
    const h = await client.workflow.getHandle(id, w.runId).fetchHistory();
    const events = h.events ?? [];
    const debut = events[0]?.workflowExecutionStartedEventAttributes;
    if (!debut?.continuedExecutionRunId) {
      continue;
    }
    const entree = defaultPayloadConverter.fromPayload<EntreeDuCircuit>(debut.input!.payloads![0]!);
    const memo = Object.fromEntries(
      Object.entries(debut.memo?.fields ?? {}).map(([k, v]) => [
        k,
        defaultPayloadConverter.fromPayload(v),
      ])
    );
    rendues.push({ suite: entree.suite as Record<string, unknown> | undefined, memo, events });
  }
  return rendues;
}
// The runs that opened on a wait: their `suite` carries no step open.
const sansOuverture = async (client: Client) =>
  (await reprises(client)).filter(r => r.suite && r.suite.ouverture === null);

// A pause: the testwriter's first session is in need, its second done.
const BESOIN_PUIS_FAIT = (n: number) =>
  n === 1 ? { statut: 'BESOIN', question: 'laquelle ?' } : { statut: 'FAIT' };
const enPause = (client: Client) =>
  attendre('la question du circuit', async () => {
    const v = await lireLeCircuit(client, RACINE, TICKET);
    return v.attente ? v : undefined;
  });

describe('une pause rouverte qui attend sa place repart à neuf avant la limite de son histoire', () => {
  it('continues as new from the wait for a place, the wait carried with no step open', async () => {
    const { activites } = simuler({ seance: BESOIN_PUIS_FAIT }, n => n > 1);
    const client = await lancer(activites, { limiteDHistoire: 12 });
    await enPause(client);
    await reprendreLeCircuit(client, RACINE, TICKET, null);
    await finDuCircuit(client, RACINE, TICKET);
    const r = await sansOuverture(client);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]!.suite).toMatchObject({
      arrete: { etape: 'testwriter' },
      ouvrirSur: { genre: 'reprendre' },
      reprend: true,
      memoire: { rang: RANG },
    });
  }, 240_000);

  it('asks its place again with the rank of before, replaying no step, then reopens from its stop', async () => {
    const { activites, journal } = simuler({ seance: BESOIN_PUIS_FAIT }, n => n > 1);
    const client = await lancer(activites, { limiteDHistoire: 12 });
    await enPause(client);
    await reprendreLeCircuit(client, RACINE, TICKET, null);
    await finDuCircuit(client, RACINE, TICKET);
    expect(journal.places.length).toBeGreaterThanOrEqual(2);
    // The rank sent is the one of before the continuation, at each demand.
    expect(journal.places.map(p => p.rang)).toEqual(journal.places.map(() => RANG));
    // Until the place is held: no opening played again, no step entered.
    for (const p of journal.places) {
      expect(p).toMatchObject({ ouvertures: 1, preparees: 1 });
    }
    expect(journal.ouvertures).toHaveLength(2);
    expect(journal.ouvertures[1]).toMatchObject({
      reponse: { genre: 'reprendre' },
      arrete: { etape: 'testwriter' },
    });
    expect(journal.preparees).toBeGreaterThan(1);
  }, 240_000);

  it('keeps « attend une place » on the board, its memo carried and republished before its first demand', async () => {
    let ouvrir!: () => void;
    const porte = new Promise<void>(r => (ouvrir = r));
    const { activites, journal } = simuler({ seance: BESOIN_PUIS_FAIT }, n =>
      n === 1 ? false : porte.then(() => true)
    );
    const client = await lancer(activites, { limiteDHistoire: 12 });
    await enPause(client);
    await reprendreLeCircuit(client, RACINE, TICKET, null);
    // The board, read all along the wait, until the second demand is held at its gate.
    const vues: { etape: string | undefined; memo: unknown }[] = [];
    await attendre('la seconde demande de place', async () => {
      const l = await lireLeDeroule(client, id);
      if (l.etape === 'attend-une-place') {
        vues.push({ etape: l.etape, memo: (l.memo as { etape?: string })?.etape });
      } else if (journal.places.length === 0) {
        // Before the first demand the circuit is still in its pause.
        return undefined;
      } else {
        vues.push({ etape: l.etape, memo: (l.memo as { etape?: string })?.etape });
      }
      return journal.places.length >= 2 ? true : undefined;
    });
    await new Promise(r => setTimeout(r, 1500));
    const l = await lireLeDeroule(client, id);
    vues.push({ etape: l.etape, memo: (l.memo as { etape?: string })?.etape });
    ouvrir();
    await finDuCircuit(client, RACINE, TICKET);
    expect(vues.every(v => v.etape === 'attend-une-place' && v.memo === 'attend-une-place')).toBe(
      true
    );
    // The new run, before its first demand, publishes the step again with the memo it received.
    const r = await sansOuverture(client);
    expect(r.length).toBeGreaterThanOrEqual(1);
    for (const run of r) {
      expect(run.memo).toMatchObject({ etape: 'attend-une-place' });
      const ev = run.events;
      const premiere = ev.findIndex(e => e.activityTaskScheduledEventAttributes);
      expect(ev[premiere]?.activityTaskScheduledEventAttributes?.activityType?.name).toBe(
        'reprendreUnePlace'
      );
      const avant = ev.slice(0, premiere);
      const republie = avant.some(
        e =>
          defaultPayloadConverter.fromPayload(
            e.workflowPropertiesModifiedEventAttributes?.upsertedMemo?.fields?.etape ??
              ({ metadata: { encoding: 'anVsbA==' } } as never)
          ) === 'attend-une-place'
      );
      expect(republie).toBe(true);
    }
  }, 240_000);
});

describe('une attente de place d’un « a-repasser » repart à neuf et rouvre aussitôt', () => {
  // Its checks wait for a place of the machine for their first readings, then are green.
  const ATTEND_PUIS_VERT = (n: number) => ({ ...VERT, aRepasser: n <= 8, attente: n <= 8 });

  it('continues as new from the wait, its stop and its answer carried, and reopens at once', async () => {
    const { activites, journal } = simuler({ controles: ATTEND_PUIS_VERT }, () => true);
    const client = await lancer(activites, { limiteDHistoire: 30 });
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({ raison: 'integre' });
    const r = await sansOuverture(client);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]!.suite).toMatchObject({
      arrete: { etape: 'controles' },
      ouvrirSur: { genre: 'reprendre' },
      memoire: { rang: RANG },
    });
    // No demand of a place of a pause: the wait of a « a-repasser » reopens from its stop.
    expect(journal.places).toEqual([]);
    expect(journal.ouvertures.every(o => !o.arrete || o.arrete.etape === 'controles')).toBe(true);
    // The step is entered anew only by the opening that follows the continuation.
    const apres = journal.ouvertures.at(-1)!;
    expect(apres).toMatchObject({
      reponse: { genre: 'reprendre' },
      arrete: { etape: 'controles' },
    });
  }, 240_000);
});

describe('aucun signal ne se perd dans une attente de place', () => {
  it('ARRETER during the wait for a place stops the circuit and reopens nothing', async () => {
    const { activites, journal } = simuler({ seance: BESOIN_PUIS_FAIT }, () => false);
    const client = await lancer(activites, { limiteDHistoire: 12 });
    await enPause(client);
    await reprendreLeCircuit(client, RACINE, TICKET, null);
    await attendre('la première demande de place', () =>
      Promise.resolve(journal.places.length >= 1 ? true : undefined)
    );
    await arreterLeCircuit(client, RACINE, TICKET, 'stop');
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({ code: 0, raison: 'arrete' });
    expect(journal.arretes).toHaveLength(1);
    expect(journal.ouvertures).toHaveLength(1);
  }, 240_000);
});

describe('une histoire enregistrée d’une attente de place se rejoue sur le code courant', () => {
  it('the history of a pause that waits for its place replays without a nondeterminism', async () => {
    // Without a limit: no continuation, the wait played as the deployed runs recorded it.
    const { activites } = simuler({ seance: BESOIN_PUIS_FAIT }, n => n > 1);
    const client = await lancer(activites);
    await enPause(client);
    await reprendreLeCircuit(client, RACINE, TICKET, null);
    await finDuCircuit(client, RACINE, TICKET);
    const histoire = await client.workflow.getHandle(id).fetchHistory();
    if (!existsSync(HISTOIRE)) {
      writeFileSync(
        HISTOIRE,
        `${JSON.stringify(HistoireDuProto(histoire).toObject(histoire, ENTIER), null, 1)}\n`
      );
      expect.fail(`l’histoire enregistrée manquait : ${HISTOIRE} écrite, à commiter.`);
    }
    await Worker.runReplayHistory({ workflowsPath: DEROULES }, histoire);
    // The history recorded before the continuation from the wait: the old path, no marker.
    const enregistree = HistoireDuProto(histoire).fromObject(
      JSON.parse(readFileSync(HISTOIRE, 'utf8'))
    );
    await Worker.runReplayHistory({ workflowsPath: DEROULES }, enregistree);
  }, 240_000);
});
