// @poste: un serveur Temporal
// grillhouse-4nr.6: the workflow of a ticket played on a development server of trial (the pinned
// program TEMPORAL on a free port, a database file of its own), with the decisions of the
// circuit (scripts/transitions.mjs) as they are, and the activities simulated by the test (the
// mocked activities of Temporal's tests: a worker of this process whose acts give the facts a
// scenario names). Criteria 1 (a ticket from its opening to its end), 2 (a stop waits and
// publishes its question), 3 (the supervisor's answers), 4 (a refusal of a validator writes
// nothing), 5 (a history replays on the current code) and 7 (a « a-repasser » plays again, then
// goes up); the effects a step decided before a fact that fails are written before its stop, and an
// act that fails is the stop « inattendu », its question awaited.
// The step 5.2 finds the lot closed (the queue has its own test, ./file.nuit.spec.ts). Criterion 6 (the
// death of the worker during a session) plays the built worker, its acts a
// program of trial (./acte-d-essai.mjs): the attempt played again waits for the dead attempt's
// group, and carries the same key, which the acts of the circuit play once.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ApplicationFailure } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  ServeurMuet,
  avecLeurAvancement,
  circuitsDuServeur,
} from '../../scripts/circuits-du-serveur.mjs';
import { attendreUneQuestion } from '../../scripts/superviseur.mjs';
import { pasDuPlan } from '../../scripts/transitions.mjs';
import {
  ATTRIBUTS_DE_RECHERCHE,
  lireLeDeroule,
  ouvrirLeClient,
  type ClientOuvert,
} from '../../src/temporal/client.js';
import {
  ReponseRefusee,
  arreterLeCircuit,
  demarrerLeCircuit,
  etendreLeCircuit,
  finDuCircuit,
  lireLeCircuit,
  lireLesCircuits,
  reprendreDepuis,
  reprendreLeCircuit,
} from '../../src/temporal/circuit/client.js';
import {
  idDuCircuit,
  type Activites,
  type EntreeDuCircuit,
  type EtatDeLEtape,
} from '../../src/temporal/circuit/contrat.js';
import type { ActivitesDeLaFile } from '../../src/temporal/file/contrat.js';
import {
  PAUSE_D_ESSAI,
  COMMANDE,
  PAQUET,
  attendre,
  demarrerLeServeur,
  demarrerLeTravailleur,
  dossier,
  portLibre,
  programmeTemporal,
} from './essai.js';

const DEROULES = path.join(PAQUET, 'dist/temporal/deroules.js');
const HISTOIRE = path.join(__dirname, 'histoires/circuit-integre.json');
const RACINE = '/depot/essai';
const TICKET = 'essai-1';
const FILE = 'essai-circuit';
// The root of the trial directories of this file, removed at its end.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-circuit-temporal-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The class of the protobuf message of a history, which writes it as plain JSON and reads it
// back (its generated `toObject` and `fromObject`), its integers and its enums as text.
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

// The facts of a ticket that goes from the testwriter to the tri, green at each step.
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

// The acts a test simulates, and what they were asked: each fact given by <faits> (a value, or a
// function of its parameters and of the number of its readings), each opening by <ouvrir>; an act
// of <autres> stands in for the simulated one, called with it.
function actes(
  faits: Record<string, unknown> = {},
  ouvrir: (o: Parameters<Activites['ouvrirLeCircuit']>[0]) => EtatDeLEtape = () => TESTS,
  autres: {
    [K in keyof Activites]?: (
      e: Parameters<Activites[K]>[0],
      simule: Activites[K]
    ) => ReturnType<Activites[K]>;
  } = {}
) {
  const journal = {
    ouvertures: [] as Parameters<Activites['ouvrirLeCircuit']>[0][],
    faits: [] as string[],
    effets: [] as unknown[][],
    arrets: [] as Parameters<Activites['publierLArret']>[0][],
    fins: [] as Parameters<Activites['finirLeTicket']>[0][],
    arretes: [] as Parameters<Activites['arreterLeTicket']>[0][],
    joues: [] as Parameters<Activites['jouerUnEffet']>[0][],
    plan: [] as { pas: string; id: string }[],
  };
  const lus: Record<string, number> = {};
  const a: Activites = {
    ouvrirLeCircuit(o) {
      journal.ouvertures.push(o);
      return Promise.resolve({
        ouverture: {
          debut: ouvrir(o),
          memoire: { constats: [] },
          ticket: { id: TICKET, paquets: ['packages/a'], sorte: null, copie: '/copie' },
        },
        effets: [],
      });
    },
    preparerLaPasse({ etape }) {
      return Promise.resolve({ memoire: {}, etat: etape, menee: null, effets: [] });
    },
    async lireUnFait({ fait, parametres }) {
      journal.faits.push(fait);
      lus[fait] = (lus[fait] ?? 0) + 1;
      const f = fait in faits ? faits[fait] : FAITS[fait];
      const valeur =
        typeof f === 'function'
          ? await (f as (p: unknown, n: number) => unknown)(parametres, lus[fait])
          : f;
      if (valeur && typeof valeur === 'object' && 'leve' in valeur) {
        return {
          valeur: null,
          memoire: {},
          leve: (valeur as { leve: Record<string, unknown> }).leve,
          effets: [],
        };
      }
      return { valeur, memoire: {}, effets: [] };
    },
    appliquerLesEffets({ effets }) {
      journal.effets.push(effets);
      return Promise.resolve({ effets: [] });
    },
    publierLArret(e) {
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
              fait: `le fait de ${nom}`,
              piece: 'la pièce',
              question: 'que faire ?',
              qui: 'superviseur',
            }
          : null,
        etat: { ...e.etat, raison: nom },
        effets: [],
      });
    },
    finirLeTicket(e) {
      journal.fins.push(e);
      return Promise.resolve({ effets: [] });
    },
    arreterLeTicket(e) {
      journal.arretes.push(e);
      return Promise.resolve({
        effets: [{ genre: 'etat', etat: { ...e.etat, raison: 'arrete', constats: ['ouvert'] } }],
      });
    },
    jouerUnEffet(e) {
      journal.joues.push(e);
      return Promise.resolve();
    },
    // A step of the plan, as scripts/circuit.mjs `unPasDuPlan` plays it: the explorateur's sheet,
    // the questionneur's (its questions from the fact `questions`, none by default), the answer;
    // the conclusion with the last, the opening once it passes.
    async jouerUnPasDuPlan({ pas, plan }) {
      const { Context } = await import('@temporalio/activity');
      journal.plan.push({ pas, id: Context.current().info.activityId });
      const posees = (faits.questions as string[] | undefined) ?? [];
      const etat =
        pas === 'explorateur'
          ? { ...plan.etat, plan: { questions: [] } }
          : pas === 'questionneur'
            ? { ...plan.etat, lu: { issue: posees.length ? 'QUESTIONS' : 'AUCUNE' }, posees }
            : { ...plan.etat, reponse: { reponses: [] } };
      if (pasDuPlan(etat) !== 'conclure') {
        return { plan: { ...plan, etat }, effets: [] };
      }
      return {
        ouverture: {
          debut: plan.debut,
          memoire: plan.memoire,
          ticket: { id: TICKET, paquets: ['packages/a'], sorte: null, copie: '/copie' },
        },
        effets: [],
      };
    },
  };
  const avec = Object.fromEntries(
    Object.entries(a).map(([k, f]) => {
      const autre = autres[k as keyof Activites] as
        ((e: unknown, s: unknown) => unknown) | undefined;
      return [k, autre ? (e: unknown) => autre(e, (f as (e: unknown) => unknown).bind(a)) : f];
    })
  ) as unknown as Activites;
  // The step 5.2: the lot already closed, as the queue leaves it (its own test: ./file.nuit.spec.ts).
  const laFile: Pick<ActivitesDeLaFile, 'situerLeLot'> = {
    situerLeLot() {
      journal.faits.push('file');
      return Promise.resolve({ statut: 'closed', raison: 'fermé' });
    },
  };
  return { activites: { ...avec, ...laFile }, journal };
}

// An act that fails as an act of the circuit does, on <message>.
const echoue = (message: string) =>
  Promise.reject(ApplicationFailure.nonRetryable(message, 'Inattendu'));

// A server, a worker of this process on <activites>, a client: the circuit of the ticket started
// with <entree>.
async function circuit(activites: Activites, entree: Partial<EntreeDuCircuit> = {}) {
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('circuit'), 'temporal.db'),
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const connexion = await NativeConnection.connect({ address: s.adresse });
  let fin: Promise<void> = Promise.resolve();
  let enMarche: Worker | null = null;
  const lancer = async () => {
    enMarche = await Worker.create({
      connection: connexion,
      taskQueue: FILE,
      workflowsPath: DEROULES,
      activities: { ...PAUSE_D_ESSAI, ...activites },
      maxHeartbeatThrottleInterval: '1 second',
      defaultHeartbeatThrottleInterval: '1 second',
    });
    fin = enMarche.run();
  };
  const couper = async () => {
    enMarche?.shutdown();
    enMarche = null;
    await fin;
  };
  await lancer();
  travailleurDuCircuit = { couper, lancer };
  adresseDuCircuit = s.adresse;
  arrets.unshift(async () => {
    await couper();
    await connexion.close();
  });
  const c: ClientOuvert = ouvrirLeClient({ adresse: s.adresse });
  arrets.unshift(() => c.fermer());
  await demarrerLeCircuit(c.client, { racine: RACINE, ticket: TICKET, ...entree }, FILE);
  return c.client;
}
// The worker of the last circuit started, which a test stops and starts again.
let travailleurDuCircuit = { couper: () => Promise.resolve(), lancer: () => Promise.resolve() };
// The address of the server of the last circuit started.
let adresseDuCircuit = '';
const enAttente = (client: Awaited<ReturnType<typeof circuit>>) =>
  attendre('la question du circuit', async () => {
    const v = await lireLeCircuit(client, RACINE, TICKET);
    return v.attente ? v : undefined;
  });
const handle = (client: Awaited<ReturnType<typeof circuit>>) =>
  client.workflow.getHandle(idDuCircuit(RACINE, TICKET));

describe('un ticket d’essai va de son ouverture à sa fin', () => {
  it('opens once, reads each fact of each step, applies the effects, ends integrated', async () => {
    const { activites, journal } = actes();
    const client = await circuit(activites);
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(journal.ouvertures).toHaveLength(1);
    expect(journal.ouvertures[0]).toMatchObject({ reponse: null, arrete: null, racine: RACINE });
    // No supervisor's session in the entry: the acts receive null.
    expect(journal.ouvertures[0]?.superviseur).toBeNull();
    expect(journal.faits).toEqual([
      'mecanique',
      'sansTests',
      'seance',
      'lecture',
      'preuve',
      'empreinteAvant',
      'seance',
      'renvoi',
      'lecture',
      'empreinte',
      'controles',
      'passeFinale',
      'controles',
      'lotAccepte',
      'relecture',
      'integration',
      'commit',
      'file',
      'tri',
    ]);
    expect(journal.effets.flat().length).toBeGreaterThan(0);
    expect(journal.fins).toHaveLength(1);
    // The end of the run is given the plan its workflow holds: the copy is gone by then.
    expect(journal.fins[0]?.paquets).toEqual(['packages/a']);
    expect(journal.arrets).toEqual([]);
    const l = await lireLeDeroule(client, idDuCircuit(RACINE, TICKET));
    expect(l).toMatchObject({ ticket: TICKET, etape: 'integre', memo: { ticket: TICKET } });
  }, 120_000);
});

// grillhouse-4nr.6.1: each act gives back the effects it emitted, and the workflow plays each in
// an activity of its own, whose id it sets (`effet:<rang>:<sorte>`), the key of its writing its
// workflow, its run and that id (../../src/temporal/acte.ts `cleDeLActivite`), the same for each
// attempt of the activity; consecutive states are one.
describe('chaque effet est une activité, sous une clé que fixe le déroulé', () => {
  it('plays each effect an act gave back in its own activity, in order, under a key of its own', async () => {
    const { cleDeLActivite } = await import('../../src/temporal/acte.js');
    const joues: { id: string; cle: string | null; essai: number; genre: string }[] = [];
    const { activites } = actes({}, () => TESTS, {
      preparerLaPasse: async (e, simule) => ({
        ...(await simule(e)),
        effets: [
          { genre: 'etat', n: 1 },
          { genre: 'etat', n: 2 },
          { genre: 'commentaire', texte: `début de ${e.etape.etape}` },
        ],
      }),
      lireUnFait: async (e, simule) => ({
        ...(await simule(e)),
        effets: e.fait === 'seance' ? [{ genre: 'fiche', entree: { role: 'testwriter' } }] : [],
      }),
      // The first writing fails once: its activity is tried again under the same key.
      jouerUnEffet: async e => {
        const { Context } = await import('@temporalio/activity');
        const { info } = Context.current();
        joues.push({
          id: info.activityId,
          cle: cleDeLActivite(info),
          essai: info.attempt,
          genre: e.effet.genre,
        });
        if (joues.length === 1) {
          throw new Error('bd ne répond pas');
        }
      },
    });
    const client = await circuit(activites);
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({
      code: 0,
      raison: 'integre',
    });
    expect(joues[0]).toMatchObject({ essai: 1, genre: 'commentaire' });
    expect(joues[1]).toMatchObject({ essai: 2, id: joues[0]!.id, cle: joues[0]!.cle });
    const reussis = joues.slice(1);
    // The state is no activity: the workflow holds it (grillhouse-4nr.12, decision Q2); the step's
    // start comes before its facts.
    expect(reussis.some(j => j.genre === 'etat')).toBe(false);
    expect(reussis.slice(0, 2).map(j => j.genre)).toEqual(['commentaire', 'fiche']);
    // One id and one key per effect, the id its rank and its sort.
    expect(new Set(reussis.map(j => j.id)).size).toBe(reussis.length);
    expect(new Set(reussis.map(j => j.cle)).size).toBe(reussis.length);
    reussis.forEach((j, i) => expect(j.id).toBe(`effet:${i + 1}:${j.genre}`));
    expect(reussis[0]!.cle).toMatch(
      new RegExp(`^${idDuCircuit(RACINE, TICKET)}:[^:]+:effet:1:commentaire$`)
    );
  }, 120_000);
});

// grillhouse-4nr.6.3, criterion 1: the workflow leads the plan, each of its steps an activity of
// its own (`jouerUnPasDuPlan`), the next decided by `pasDuPlan` of scripts/transitions.mjs.
describe('le déroulé mène le plan, un pas par activité', () => {
  const avecUnPlan = (o: Parameters<Activites['ouvrirLeCircuit']>[0]) =>
    Promise.resolve({
      plan: {
        etat: {
          avant: '',
          plan: null,
          premier: null,
          seance: null,
          lu: null,
          posees: [],
          reponse: null,
        },
        debut: o.arrete ? { ...o.arrete } : TESTS,
        contexte: null,
        memoire: { constats: [] },
      },
      effets: [],
    });

  it('questions put: the explorateur, the questionneur, the answer, each its own activity, then the steps', async () => {
    const { activites, journal } = actes({ questions: ['laquelle ?'] }, () => TESTS, {
      ouvrirLeCircuit: o => avecUnPlan(o),
    });
    const client = await circuit(activites);
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(journal.plan.map(p => p.pas)).toEqual(['explorateur', 'questionneur', 'reponse']);
    expect(new Set(journal.plan.map(p => p.id)).size).toBe(3);
    expect(journal.faits[0]).toBe('mecanique');
  }, 120_000);

  // Renvoi de 676544b, point 3: a plan whose questions stay open stops; its stop, which its last
  // step published with its effects, is awaited, its question published once.
  it('a question left open stops the plan: its stop published once, the workflow waits on it', async () => {
    const question = {
      arret: 'questionnement',
      fait: 'des questions restent ouvertes',
      piece: 'la liste',
      question: 'que décider ?',
      qui: 'superviseur',
    };
    const { activites, journal } = actes({}, () => TESTS, {
      ouvrirLeCircuit: o => avecUnPlan(o),
      jouerUnPasDuPlan: (e, simule) =>
        e.pas !== 'questionneur'
          ? simule(e)
          : Promise.resolve({
              arret: {
                code: 22,
                nom: 'questionnement',
                question,
                etat: { ...TESTS, raison: 'questionnement' },
              },
              effets: [{ genre: 'commentaire', texte: 'questions ouvertes' }],
            }),
    });
    const client = await circuit(activites);
    const v = await enAttente(client);
    expect(v.question).toEqual(question);
    const l = await lireLeDeroule(client, idDuCircuit(RACINE, TICKET));
    expect(l.etape).toBe('question');
    expect(l.memo).toMatchObject({ question: { arret: 'questionnement' } });
    // Published by the plan's last step: no act of the stop writes it again.
    expect(journal.arrets).toEqual([]);
    const commentaires = journal.joues
      .map(j => j.effet as { genre: string; texte?: string })
      .filter(e => e.genre === 'commentaire');
    expect(commentaires.map(e => e.texte)).toEqual(['questions ouvertes']);
  }, 120_000);

  it('no question put: two sessions, the questionneur’s ending the plan', async () => {
    const { activites, journal } = actes({}, () => TESTS, {
      ouvrirLeCircuit: o => avecUnPlan(o),
    });
    const client = await circuit(activites);
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(journal.plan.map(p => p.pas)).toEqual(['explorateur', 'questionneur']);
  }, 120_000);

  // The board reads a circuit at its plan at « 1 Plan » from its opening to its plan passed: during
  // the explorateur's first session, no state written yet; during the questionneur's, the
  // explorateur's session ended on the state the plan writes (the testwriter's); then at 2 once
  // the testwriter starts.
  it('the board reads the step plan from the opening to the plan passed, then the testwriter', async () => {
    const ouverts: Record<string, () => void> = {};
    const etatDuPlan = { ...TESTS, code: null, raison: null, questionnement: null };
    const { activites } = actes({}, () => TESTS, {
      ouvrirLeCircuit: o => avecUnPlan(o),
      jouerUnPasDuPlan: async (e, simule) => {
        await new Promise<void>(r => (ouverts[e.pas] = r));
        const r = await simule(e);
        return { ...r, effets: [{ genre: 'etat', etat: etatDuPlan }] };
      },
      // The first pass, the testwriter's, waits for the test; the others go on.
      preparerLaPasse: async (e, simule) => {
        if (!ouverts.testwriter) {
          await new Promise<void>(r => (ouverts.testwriter = r));
        }
        return simule(e);
      },
    });
    const client = await circuit(activites);
    const lu = async () => (await lireLesCircuits(client, RACINE))[0];
    const pendant = (pas: string) =>
      attendre(`la séance ${pas}`, () => Promise.resolve(ouverts[pas] ? true : undefined));
    await pendant('explorateur');
    expect(await lu()).toMatchObject({ etape: 'plan', questionnement: 'plan', vivant: true });
    ouverts.explorateur?.();
    await pendant('questionneur');
    expect(await lu()).toMatchObject({ etape: 'plan', questionnement: 'plan', vivant: true });
    ouverts.questionneur?.();
    await pendant('testwriter');
    expect(await lu()).toMatchObject({ etape: 'testwriter', questionnement: null });
    ouverts.testwriter?.();
    // The end carries the state written last, the one the plan wrote.
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({
      code: 0,
      raison: 'integre',
      etat: etatDuPlan,
    });
  }, 120_000);
});

// grillhouse-4nr.10, criteria 1 and 3: the board and the supervisor read the circuits of a
// repository in one call to the server (`lireLesCircuits`, a `workflow.list`), each in the form
// the board reads (scripts/circuits-du-serveur.mjs), from the memo the workflow publishes: the
// summary of the last state it wrote (`etat`) and its question, numbered (`numero`); the wait of
// the questions ends on a question the workflow publishes, once.
describe('le tableau lit les déroulés en un appel', () => {
  it('a circuit waiting on its question, read in one call: its step, its loops, its question', async () => {
    const { activites } = actes(
      { seance: { statut: 'BESOIN', question: 'laquelle ?' } },
      () => TESTS,
      {
        preparerLaPasse: async (e, simule) => ({
          ...(await simule(e)),
          effets: [
            {
              genre: 'etat',
              etat: {
                etape: 'testwriter',
                tentative: 2,
                finale: false,
                code: null,
                raison: null,
                rapport: 'la première ligne\nla suite',
                questionnement: { objet: 'plan' },
                boucles: { testwriter: 2 },
                mene: '2026-11-06T10:00:00.000Z',
              },
            },
          ],
        }),
      }
    );
    const client = await circuit(activites);
    await enAttente(client);
    const service = client.workflowService;
    const listes = vi.spyOn(service, 'listWorkflowExecutions');
    const descriptions = vi.spyOn(service, 'describeWorkflowExecution');
    const lus = await lireLesCircuits(client, RACINE);
    expect(listes).toHaveBeenCalledTimes(1);
    expect(descriptions).not.toHaveBeenCalled();
    expect(lus).toEqual([
      expect.objectContaining({
        ticket: TICKET,
        etape: 'testwriter',
        tentative: 2,
        finale: false,
        raison: 'la première ligne',
        questionnement: 'plan',
        boucles: { testwriter: 2 },
        mene: Date.parse('2026-11-06T10:00:00.000Z'),
        question: 'que faire ?',
        qui: 'superviseur',
        arret: 'besoin',
        vivant: false,
        interrompu: false,
        numero: 1,
      }),
    ]);
  }, 120_000);

  it('the wait of the questions ends on the question the workflow publishes, and not twice', async () => {
    const { activites } = actes({ seance: { statut: 'BESOIN', question: 'laquelle ?' } });
    const client = await circuit(activites);
    await enAttente(client);
    const racine = mkdtempSync(path.join(ESSAIS, 'attente-'));
    try {
      type Question = {
        ticket: string;
        etape: string;
        question: string;
        qui: string;
        commande: string;
        cle: string;
        representee?: boolean;
      };
      const attendre = async (ms: number): Promise<Question[]> => {
        const fin = new AbortController();
        const minuteur = setTimeout(() => fin.abort(), ms);
        try {
          return await attendreUneQuestion({
            racine,
            fermes: () => new Set(),
            pas: 100,
            signal: fin.signal,
            circuitsDe: async () =>
              avecLeurAvancement(racine, await lireLesCircuits(client, RACINE)),
          });
        } finally {
          clearTimeout(minuteur);
        }
      };
      const q = await attendre(30_000);
      expect(q.map((x: Question) => [x.ticket, x.question])).toEqual([[TICKET, 'que faire ?']]);
      expect(await attendre(500)).toEqual([]);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  }, 120_000);

  it('the reading of the board gives each circuit the page of its workflow on the web UI of its server', async () => {
    const { activites } = actes({ seance: { statut: 'BESOIN', question: 'laquelle ?' } });
    const client = await circuit(activites);
    await enAttente(client);
    vi.stubEnv('TEMPORAL_ADDRESS', adresseDuCircuit);
    vi.stubEnv('TEMPORAL_NAMESPACE', 'default');
    try {
      const lus = await circuitsDuServeur(RACINE);
      const [hote, port] = adresseDuCircuit.split(':');
      expect(lus.map(c => [c.ticket, c.lien])).toEqual([
        [
          TICKET,
          `http://${hote}:${Number(port) + 1000}/namespaces/default/workflows/${encodeURIComponent(`circuit:${RACINE}:${TICKET}`)}`,
        ],
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 120_000);

  it('the reading of the board on a server that does not listen throws ServeurMuet, its address named', async () => {
    const adresse = `127.0.0.1:${await portLibre()}`;
    vi.stubEnv('TEMPORAL_ADDRESS', adresse);
    try {
      const e = await circuitsDuServeur(RACINE).then(
        () => null,
        (x: unknown) => x
      );
      expect(e).toBeInstanceOf(ServeurMuet);
      expect((e as Error).message).toBe(`Temporal ne répond pas en 5 s sur ${adresse}`);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 60_000);

  it('the supervisor’s session of the entry reaches every act of the circuit', async () => {
    const { activites, journal } = actes({ seance: { statut: 'BESOIN', question: 'laquelle ?' } });
    const client = await circuit(activites, { superviseur: 'seance-du-superviseur' });
    await enAttente(client);
    expect(journal.ouvertures.map(o => o.superviseur)).toEqual(['seance-du-superviseur']);
  }, 120_000);

  it('each answer carries the session of the supervisor who gives it: the second stop goes up with it', async () => {
    // A testwriter in need at his first two sessions, then FAIT.
    const { activites, journal } = actes({
      seance: (_p: unknown, n: number) => (n <= 2 ? { statut: 'BESOIN' } : { statut: 'FAIT' }),
    });
    const client = await circuit(activites, { superviseur: 'premiere-seance' });
    await enAttente(client);
    expect(journal.arrets.map(a => a.superviseur)).toEqual(['premiere-seance']);
    await reprendreLeCircuit(client, RACINE, TICKET, null, { superviseur: 'seconde-seance' });
    await attendre('le second arrêt', () =>
      Promise.resolve(journal.arrets.length === 2 ? true : undefined)
    );
    expect(journal.arrets.map(a => a.superviseur)).toEqual(['premiere-seance', 'seconde-seance']);
    await enAttente(client);
    await reprendreDepuis(client, RACINE, TICKET, 'developpeur', null, {
      superviseur: 'troisieme-seance',
    });
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(journal.ouvertures.at(-1)?.superviseur).toBe('troisieme-seance');
  }, 180_000);

  it('a circuit integrated is not read', async () => {
    const { activites } = actes({});
    const client = await circuit(activites);
    await finDuCircuit(client, RACINE, TICKET);
    expect(await lireLesCircuits(client, RACINE)).toEqual([]);
  }, 120_000);

  it('the memo goes to the next run past the length of history (Continue-As-New)', async () => {
    const { activites } = actes({}, () => TESTS, {
      preparerLaPasse: async (e, simule) => ({
        ...(await simule(e)),
        effets: [
          { genre: 'etat', etat: { etape: e.etape.etape, tentative: 1, boucles: { x: 1 } } },
        ],
      }),
    });
    const client = await circuit(activites, { limiteDHistoire: 40 });
    await finDuCircuit(client, RACINE, TICKET);
    const runs: string[] = [];
    for await (const w of client.workflow.list({
      query: `WorkflowId = '${idDuCircuit(RACINE, TICKET)}'`,
    })) {
      runs.push(w.runId);
    }
    expect(runs.length).toBeGreaterThan(1);
    const { defaultPayloadConverter } = await import('@temporalio/common');
    // Each run after the first starts with the memo the run before it published.
    for (const run of runs) {
      const h = await client.workflow.getHandle(idDuCircuit(RACINE, TICKET), run).fetchHistory();
      const debut = h.events?.[0]?.workflowExecutionStartedEventAttributes;
      if (!debut?.continuedExecutionRunId) {
        continue;
      }
      const etat = debut.memo?.fields?.etat;
      expect(etat).toBeDefined();
      expect(defaultPayloadConverter.fromPayload(etat!)).toMatchObject({ boucles: { x: 1 } });
    }
  }, 180_000);
});

describe('un arrêt met le déroulé en attente et publie sa question', () => {
  it('a testwriter in need: its stop goes up, the workflow waits, its question in the memo', async () => {
    const { activites, journal } = actes({ seance: { statut: 'BESOIN', question: 'laquelle ?' } });
    const client = await circuit(activites);
    const v = await enAttente(client);
    expect(v).toMatchObject({ etape: 'testwriter', attente: true });
    expect(v.question).toMatchObject({ arret: 'besoin', question: 'que faire ?' });
    expect(journal.arrets).toHaveLength(1);
    expect(journal.arrets[0]).toMatchObject({ monter: true, etat: { etape: 'testwriter' } });
    const d = await handle(client).describe();
    expect(d.status.name).toBe('RUNNING');
    const l = await lireLeDeroule(client, idDuCircuit(RACINE, TICKET));
    expect(l.etape).toBe('question');
    expect(l.memo).toMatchObject({ question: { arret: 'besoin' } });
  }, 120_000);

  it('the effects a step decided before a fact that fails are written before its stop', async () => {
    const { activites, journal } = actes({
      lecture: () => {
        throw ApplicationFailure.nonRetryable('la copie ne se lit pas', 'Inattendu');
      },
    });
    const client = await circuit(activites);
    await enAttente(client);
    const arret = journal.arrets[0]?.arret as { inattendu?: { message: string } } | undefined;
    expect(arret?.inattendu?.message).toContain('la copie ne se lit pas');
    // « séance 1 finie, sa fiche lue », decided before the reading of the copy.
    const ecrits = journal.effets.flat() as { texte?: string }[];
    expect(ecrits.some(e => e.texte?.includes('séance 1 finie'))).toBe(true);
  }, 120_000);
});

describe('un acte qui échoue est l’arrêt « inattendu », sa réponse attendue', () => {
  // The stop the workflow published, its question awaited.
  const laQuestion = (client: Awaited<ReturnType<typeof circuit>>, arret: string) =>
    attendre('la question « ' + arret + ' »', async () => {
      const v = await lireLeCircuit(client, RACINE, TICKET);
      return v.attente && v.question?.arret === arret ? v : undefined;
    });
  const inattendus = (journal: ReturnType<typeof actes>['journal']) =>
    journal.arrets.map(a => (a.arret.inattendu as { message?: string } | undefined)?.message);

  // A stop at the plan is written at the state the plan writes, the testwriter's with its
  // questioning on the plan (grillhouse-d4n.11, `etatDeReprise`), from which an answer reopens it.
  it.each([
    ['ouvrirLeCircuit', 'testwriter'],
    ['preparerLaPasse', 'developpeur'],
    ['appliquerLesEffets', 'testwriter'],
    ['finirLeTicket', null],
  ] as const)(
    '%s fails: its stop « inattendu » goes up, then --reprendre resumes',
    async (acte, etape) => {
      let echecs = 0;
      const une =
        <E>(quand: (e: E) => boolean) =>
        (e: E, simule: (e: E) => Promise<unknown>) =>
          quand(e) && echecs++ === 0 ? echoue(`${acte} en échec`) : simule(e);
      const autres = {
        ouvrirLeCircuit: une(() => acte === 'ouvrirLeCircuit'),
        preparerLaPasse: une(
          (e: Parameters<Activites['preparerLaPasse']>[0]) =>
            acte === 'preparerLaPasse' && e.etape.etape === 'developpeur'
        ),
        appliquerLesEffets: une(() => acte === 'appliquerLesEffets'),
        finirLeTicket: une(() => acte === 'finirLeTicket'),
      } as Parameters<typeof actes>[2];
      const { activites, journal } = actes(
        {},
        o => (o.arrete && o.arrete.etape !== 'plan' ? { ...o.arrete } : TESTS),
        autres
      );
      const client = await circuit(activites);
      await laQuestion(client, 'inattendu');
      expect(inattendus(journal)).toEqual([`${acte} en échec`]);
      expect(journal.arrets[0]).toMatchObject({ monter: true });
      if (etape) {
        expect(journal.arrets[0]?.etat.etape).toBe(etape);
      }
      if (acte === 'ouvrirLeCircuit') {
        expect(journal.arrets[0]?.etat).toMatchObject({ questionnement: { objet: 'plan' } });
      }
      await reprendreLeCircuit(client, RACINE, TICKET, null);
      expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    },
    120_000
  );

  it('the act of the stop fails: the stop « inattendu » is in the memo alone, and waits', async () => {
    const { activites } = actes({ seance: { statut: 'BESOIN' } }, undefined, {
      publierLArret: () => echoue('le ticket ne s’écrit pas'),
    });
    const client = await circuit(activites);
    const v = await laQuestion(client, 'inattendu');
    expect(v.question?.fait).toContain('le ticket ne s’écrit pas');
    expect(v.etape).toBe('testwriter');
    const l = await lireLeDeroule(client, idDuCircuit(RACINE, TICKET));
    expect(l.memo).toMatchObject({ question: { arret: 'inattendu' } });
  }, 120_000);

  it('the stop on the supervisor’s word fails: its stop « inattendu » goes up', async () => {
    let echecs = 0;
    const { activites, journal } = actes({ seance: { statut: 'BESOIN' } }, undefined, {
      arreterLeTicket: (e, simule) => (echecs++ === 0 ? echoue('bd ne répond pas') : simule(e)),
    });
    const client = await circuit(activites);
    await laQuestion(client, 'besoin');
    await arreterLeCircuit(client, RACINE, TICKET, 'le motif');
    await laQuestion(client, 'inattendu');
    expect(inattendus(journal)).toEqual([undefined, 'bd ne répond pas']);
    await arreterLeCircuit(client, RACINE, TICKET, 'le motif');
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({ code: 0, raison: 'arrete' });
    expect(journal.arretes).toHaveLength(1);
  }, 120_000);
});

describe('les réponses du superviseur reprennent comme circuit.mjs', () => {
  const BESOIN = { statut: 'BESOIN' };
  // A testwriter in need at his first session, then FAIT.
  const unBesoin = () => ({
    seance: (_p: unknown, n: number) => (n === 1 ? BESOIN : { statut: 'FAIT' }),
  });

  it('--reprendre opens on the answer and the stopped state, then goes to the end', async () => {
    const { activites, journal } = actes(unBesoin(), o => (o.arrete ? { ...o.arrete } : TESTS));
    const client = await circuit(activites);
    await enAttente(client);
    await reprendreLeCircuit(client, RACINE, TICKET, 'le contexte');
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(journal.ouvertures[1]).toMatchObject({
      reponse: { genre: 'reprendre', contexte: 'le contexte' },
      arrete: { etape: 'testwriter', raison: 'besoin', question: { arret: 'besoin' } },
    });
  }, 120_000);

  it('--depuis developpeur opens on it; --etendre opens on its packages', async () => {
    const { activites, journal } = actes(unBesoin(), o =>
      o.reponse?.genre === 'depuis'
        ? { etape: 'developpeur', tentative: 1, rapport: null, finale: false }
        : TESTS
    );
    const client = await circuit(activites);
    await enAttente(client);
    expect(await reprendreDepuis(client, RACINE, TICKET, 'developpeur', 'ctx')).toBe(
      'depuis developpeur'
    );
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(journal.ouvertures[1]?.reponse).toEqual({
      genre: 'depuis',
      role: 'developpeur',
      contexte: 'ctx',
    });

    const deux = actes(unBesoin());
    const c2 = await circuit(deux.activites);
    await enAttente(c2);
    await etendreLeCircuit(c2, RACINE, TICKET, ['packages/b'], null);
    expect(await finDuCircuit(c2, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(deux.journal.ouvertures[1]?.reponse).toEqual({
      genre: 'etendre',
      paquets: ['packages/b'],
      contexte: null,
    });
  }, 180_000);

  it('--arreter on a question stops the circuit on the supervisor’s word', async () => {
    const { activites, journal } = actes(unBesoin());
    const client = await circuit(activites);
    await enAttente(client);
    await arreterLeCircuit(client, RACINE, TICKET, 'le motif');
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({ code: 0, raison: 'arrete' });
    expect(journal.arretes).toHaveLength(1);
    expect(journal.arretes[0]).toMatchObject({
      contexte: 'le motif',
      etat: { etape: 'testwriter' },
    });
  }, 120_000);

  // grillhouse-4nr.6.3, criterion 4: a circuit stopped on the supervisor's word has ended its
  // workflow; his answer starts a new one, which opens on it from the stopped state.
  // grillhouse-4nr.12, decision Q2: that state is the one the stopped workflow gave back at its
  // end, no file of the repository.
  it('a circuit stopped by --arreter gives back its state; --reprendre opens a new workflow on it', async () => {
    const { activites, journal } = actes(unBesoin());
    const client = await circuit(activites);
    await enAttente(client);
    await arreterLeCircuit(client, RACINE, TICKET, 'le motif');
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({
      code: 0,
      raison: 'arrete',
      etat: { etape: 'testwriter', raison: 'arrete', constats: ['ouvert'] },
    });
    expect(await reprendreLeCircuit(client, RACINE, TICKET, 'le contexte')).toBe('repris');
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({
      code: 0,
      raison: 'integre',
    });
    expect(journal.ouvertures.at(-1)).toMatchObject({
      reponse: { genre: 'reprendre', contexte: 'le contexte' },
      arrete: { etape: 'testwriter', raison: 'arrete', constats: ['ouvert'] },
    });
  }, 120_000);

  it('a circuit stopped by --arreter resumes on --depuis; an integrated one refuses an answer', async () => {
    const { activites, journal } = actes(unBesoin());
    const client = await circuit(activites);
    await enAttente(client);
    await arreterLeCircuit(client, RACINE, TICKET, null);
    await finDuCircuit(client, RACINE, TICKET);
    expect(await reprendreDepuis(client, RACINE, TICKET, 'developpeur', null)).toBe(
      'depuis developpeur'
    );
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({
      code: 0,
      raison: 'integre',
    });
    expect(journal.ouvertures.at(-1)).toMatchObject({
      reponse: { genre: 'depuis', role: 'developpeur' },
    });
    await expect(reprendreLeCircuit(client, RACINE, TICKET, null)).rejects.toThrow(ReponseRefusee);
    await expect(reprendreLeCircuit(client, RACINE, TICKET, null)).rejects.toThrow(/intégré/);
    // Renvoi de 819bcbd: on a workflow the server holds, ended integrated, the answers follow the
    // circuit's rules: --etendre refused, --depuis a new workflow.
    const etendu = await etendreLeCircuit(client, RACINE, TICKET, ['packages/b'], null).then(
      () => null,
      (x: unknown) => x
    );
    expect(etendu).toBeInstanceOf(ReponseRefusee);
    expect((etendu as Error).message).toMatch(/--etendre : le lot de essai-1 est intégré/);
    const ouvertures = journal.ouvertures.length;
    expect(await reprendreDepuis(client, RACINE, TICKET, 'developpeur', null)).toBe(
      'depuis developpeur'
    );
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(journal.ouvertures).toHaveLength(ouvertures + 1);
    expect(journal.ouvertures.at(-1)).toMatchObject({ reponse: { genre: 'depuis' } });
  }, 120_000);

  // grillhouse-4nr.12, decision Q2: a workflow the server no longer holds (its retention passed)
  // took its state with it; --reprendre and --etendre are refused by their name, before any
  // workflow starts, and --depuis reopens it with no state, on the project's task queue.
  const purge = 'essai-purge';
  it.each(['reprendre', 'etendre'] as const)(
    'a workflow the server does not hold: --%s is refused by its name, nothing started',
    async genre => {
      const { activites, journal } = actes({});
      const client = await circuit(activites);
      await finDuCircuit(client, RACINE, TICKET);
      const ouvertures = journal.ouvertures.length;
      const racine = dossier('depot');
      const r =
        genre === 'reprendre'
          ? reprendreLeCircuit(client, racine, purge, null, { file: FILE })
          : etendreLeCircuit(client, racine, purge, ['packages/b'], null, { file: FILE });
      const refus = await r.then(
        () => null,
        (x: unknown) => x
      );
      expect(refus).toBeInstanceOf(ReponseRefusee);
      expect((refus as Error).message).toMatch(
        /le serveur ne tient plus le circuit de essai-purge .*seul `npx grillhouse circuit essai-purge --depuis <testwriter\|developpeur> --contexte <texte>`/
      );
      await expect(
        client.workflow.getHandle(idDuCircuit(racine, purge)).describe()
      ).rejects.toThrow();
      expect(journal.ouvertures).toHaveLength(ouvertures);
    },
    120_000
  );

  it('a workflow the server does not hold: --depuis reopens it with no state', async () => {
    const { activites, journal } = actes({});
    const client = await circuit(activites);
    await finDuCircuit(client, RACINE, TICKET);
    const racine = dossier('depot');
    await reprendreDepuis(client, racine, purge, 'developpeur', null, { file: FILE });
    expect(await finDuCircuit(client, racine, purge)).toEqual({ code: 0, raison: 'integre' });
    expect(journal.ouvertures.at(-1)).toMatchObject({
      ticket: purge,
      reponse: { genre: 'depuis', role: 'developpeur' },
      arrete: null,
    });
  }, 120_000);

  // Remarque de 676544b: the new workflow keeps the bounds of the entry it follows.
  it('the new workflow of an answer keeps the bounds of the stopped one', async () => {
    const { activites } = actes(unBesoin());
    const ci = { rechercheMs: 1000, attenteMs: 2000, pasMs: 100 };
    const client = await circuit(activites, { repasserMs: 1234, repassesMax: 2, ci });
    await enAttente(client);
    await arreterLeCircuit(client, RACINE, TICKET, null);
    await finDuCircuit(client, RACINE, TICKET);
    await reprendreLeCircuit(client, RACINE, TICKET, null);
    const h = await handle(client).fetchHistory();
    const { defaultPayloadConverter } = await import('@temporalio/common');
    const entree = defaultPayloadConverter.fromPayload(
      h.events![0]!.workflowExecutionStartedEventAttributes!.input!.payloads![0]!
    );
    expect(entree).toMatchObject({ repasserMs: 1234, repassesMax: 2, ci });
    await finDuCircuit(client, RACINE, TICKET);
  }, 120_000);

  // A workflow ended by force reopens on --reprendre from the state of its last memo, and refuses
  // --etendre by its name; two answers at once, one resumes, the other is told so in the words of
  // the domain.
  it('--arreter on an integrated lot is refused, named, and on a ticket without circuit too', async () => {
    const { activites } = actes();
    const client = await circuit(activites);
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({ raison: 'integre' });
    await expect(arreterLeCircuit(client, RACINE, TICKET, null)).rejects.toThrow(
      new ReponseRefusee('--arreter : le lot de essai-1 est intégré.')
    );
    await expect(arreterLeCircuit(client, RACINE, 'sans-circuit', null)).rejects.toThrow(
      new ReponseRefusee('--arreter : aucun circuit ne tourne sur sans-circuit.')
    );
  }, 120_000);

  it('a workflow terminated by force reopens on --reprendre from the state of its last memo', async () => {
    // The stop writes its state, its question with it, as scripts/circuit.mjs `publierLArret` does.
    const { activites, journal } = actes(unBesoin(), o => (o.arrete ? { ...o.arrete } : TESTS), {
      publierLArret: async (e, simule) => {
        const r = await simule(e);
        return { ...r, effets: [{ genre: 'etat', etat: { ...r.etat, question: r.question } }] };
      },
    });
    const client = await circuit(activites);
    await enAttente(client);
    await handle(client).terminate('essai');
    // The opening and the wait propose only what the client accepts: no --etendre, no --arreter.
    const lu = (await lireLesCircuits(client, RACINE)).find(c => c.ticket === TICKET);
    expect(lu?.reponse).toBe(
      'npx grillhouse circuit essai-1 --reprendre` ou `--depuis <testwriter|developpeur> --contexte <texte>'
    );
    // Its question names no command: the answers the client accepts are named once, beside it.
    expect(lu?.question).toBe(
      'Le déroulé du circuit a fini sans son issue (TERMINATED), pendant sa question (besoin).'
    );
    await expect(etendreLeCircuit(client, RACINE, TICKET, ['packages/b'], null)).rejects.toThrow(
      /essai-1 a fini sans son issue \(TERMINATED\) : `npx grillhouse circuit essai-1 --reprendre` ou `--depuis/
    );
    expect(await reprendreLeCircuit(client, RACINE, TICKET, null)).toBe('repris');
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({
      code: 0,
      raison: 'integre',
    });
    expect(journal.ouvertures[1]).toMatchObject({
      reponse: { genre: 'reprendre' },
      arrete: { etape: 'testwriter', raison: 'besoin', question: { arret: 'besoin' } },
    });
  }, 120_000);

  it('a workflow terminated before any state written reopens on --depuis alone', async () => {
    const { activites } = actes(unBesoin());
    const client = await circuit(activites);
    await enAttente(client);
    await handle(client).terminate('essai');
    expect((await lireLesCircuits(client, RACINE)).find(c => c.ticket === TICKET)?.reponse).toBe(
      'npx grillhouse circuit essai-1 --depuis <testwriter|developpeur> --contexte <texte>'
    );
    await expect(reprendreLeCircuit(client, RACINE, TICKET, null)).rejects.toThrow(
      new ReponseRefusee(
        'le déroulé de essai-1 a fini sans son issue (TERMINATED), aucun état écrit : `npx grillhouse circuit essai-1 --depuis <testwriter|developpeur> --contexte <texte>` le rouvre.'
      )
    );
    expect(
      await reprendreDepuis(client, RACINE, TICKET, 'developpeur', 'le contexte')
    ).toBeTruthy();
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({ raison: 'integre' });
  }, 120_000);

  // A circuit killed in the middle of its work, no question awaited, a state written, reads
  // « interrompu » with `--reprendre`, which reopens it from that state.
  it('a workflow terminated in the middle of a step, its state written, reads interrupted and reopens on --reprendre', async () => {
    let enCours: () => void = () => {};
    const commence = new Promise<void>(r => (enCours = r));
    let liberer: (v: unknown) => void = () => {};
    const tenue = new Promise(r => (liberer = r));
    const { activites, journal } = actes(
      {
        // The first session plays until the workflow is killed, then ends unread; the next is done.
        seance: (_p: unknown, n: number) => (n === 1 ? (enCours(), tenue) : { statut: 'FAIT' }),
      },
      o => (o.arrete ? { ...o.arrete } : TESTS),
      {
        // The step's start writes its state, as scripts/circuit.mjs `ecrireEtat` does.
        preparerLaPasse: async (e, simule) => {
          const r = await simule(e);
          return { ...r, effets: [{ genre: 'etat', etat: { ...e.etape, raison: null } }] };
        },
      }
    );
    const client = await circuit(activites);
    await commence;
    await handle(client).terminate('essai');
    liberer({ statut: 'FAIT' });
    // The list of the server follows its visibility, which may lag behind the termination.
    const lu = await attendre('le circuit interrompu', async () => {
      const c = (await lireLesCircuits(client, RACINE)).find(x => x.ticket === TICKET);
      return c?.interrompu ? c : undefined;
    });
    expect(lu).toMatchObject({ interrompu: true, vivant: false });
    expect(lu?.reponse).toBe(
      'npx grillhouse circuit essai-1 --reprendre` ou `--depuis <testwriter|developpeur> --contexte <texte>'
    );
    expect(await reprendreLeCircuit(client, RACINE, TICKET, null)).toBe('repris');
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({
      code: 0,
      raison: 'integre',
    });
    expect(journal.ouvertures[1]).toMatchObject({
      reponse: { genre: 'reprendre' },
      arrete: { etape: TESTS.etape },
    });
  }, 120_000);

  it('two answers at once to a stopped circuit: one resumes it, the other is told it runs or is integrated', async () => {
    const { activites } = actes(unBesoin());
    const client = await circuit(activites);
    await enAttente(client);
    await arreterLeCircuit(client, RACINE, TICKET, null);
    await finDuCircuit(client, RACINE, TICKET);
    const r = await Promise.allSettled([
      reprendreLeCircuit(client, RACINE, TICKET, null),
      reprendreLeCircuit(client, RACINE, TICKET, null),
    ]);
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    const refus = r.find(x => x.status === 'rejected') as PromiseRejectedResult;
    expect(String((refus.reason as Error).message)).toMatch(
      /une autre réponse a déjà repris le circuit de essai-1|le circuit tourne|rien à reprendre : le lot de essai-1 est intégré/
    );
    expect(refus.reason).toBeInstanceOf(ReponseRefusee);
    await finDuCircuit(client, RACINE, TICKET);
  }, 120_000);

  it('--arreter during a session cancels its activity, then stops the circuit', async () => {
    let annulee = false;
    const { activites, journal } = actes({
      seance: async () => {
        const { Context } = await import('@temporalio/activity');
        const c = Context.current();
        for (;;) {
          c.heartbeat();
          if (c.cancellationSignal.aborted) {
            annulee = true;
            throw new Error('annulée');
          }
          await new Promise(r => setTimeout(r, 200));
        }
      },
    });
    const client = await circuit(activites);
    await attendre('la séance', () =>
      Promise.resolve(journal.faits.includes('seance') ? true : undefined)
    );
    await arreterLeCircuit(client, RACINE, TICKET, 'stop');
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({ code: 0, raison: 'arrete' });
    expect(annulee).toBe(true);
    expect(journal.arretes).toHaveLength(1);
    expect(journal.arrets).toEqual([]);
  }, 120_000);

  // grillhouse-4nr.6.2, renvoi de d827494, point 4: the effects of an act are written to their
  // end, then the circuit stops.
  it('--arreter while the effects of an act are written: they are all written, then it stops', async () => {
    let lacher: () => void = () => {};
    const tenue = new Promise<void>(r => (lacher = r));
    const joues: string[] = [];
    const { activites, journal } = actes({}, () => TESTS, {
      preparerLaPasse: async (e, simule) => ({
        ...(await simule(e)),
        effets: [
          { genre: 'commentaire', texte: 'un' },
          { genre: 'commentaire', texte: 'deux' },
        ],
      }),
      jouerUnEffet: async e => {
        if (!joues.length) {
          joues.push('tenu');
          await tenue;
        }
        joues.push(String((e.effet as { texte?: string }).texte));
      },
    });
    const client = await circuit(activites);
    await attendre('le premier effet', () => Promise.resolve(joues.length ? true : undefined));
    await arreterLeCircuit(client, RACINE, TICKET, 'stop');
    lacher();
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({ code: 0, raison: 'arrete' });
    expect(joues).toEqual(['tenu', 'un', 'deux']);
    expect(journal.faits).toEqual([]);
  }, 120_000);

  it('--arreter while the stop is written still stops the circuit', async () => {
    let lacher: () => void = () => {};
    const tenue = new Promise<void>(r => (lacher = r));
    let tenu = false;
    const { activites, journal } = actes(unBesoin(), undefined, {
      publierLArret: async (e, simule) => {
        tenu = true;
        await tenue;
        return simule(e);
      },
    });
    const client = await circuit(activites);
    await attendre('l’arrêt qui s’écrit', () => Promise.resolve(tenu ? true : undefined));
    await arreterLeCircuit(client, RACINE, TICKET, 'le motif');
    lacher();
    const issue = await Promise.race([
      finDuCircuit(client, RACINE, TICKET),
      enAttente(client).then(() => 'en attente de sa réponse'),
    ]);
    expect(issue).toMatchObject({ code: 0, raison: 'arrete' });
    expect(journal.arretes).toMatchObject([
      { contexte: 'le motif', etat: { etape: 'testwriter' } },
    ]);
  }, 120_000);
});

describe('un refus de validateur n’écrit rien dans l’histoire', () => {
  it('--depuis while the circuit runs, and a role out of the lot on a wait, are refused', async () => {
    let lacher: () => void = () => {};
    const tenue = new Promise<void>(r => (lacher = r));
    let tenu = false;
    const { activites } = actes({
      seance: async (_p: unknown, n: number) => {
        if (n === 1) {
          tenu = true;
          await tenue;
        }
        return n === 1 ? { statut: 'BESOIN' } : { statut: 'FAIT' };
      },
    });
    const client = await circuit(activites);
    const h = handle(client);
    // The session runs: the history stands while its activity runs.
    await attendre('la séance', () => Promise.resolve(tenu ? true : undefined));
    const longueur = async () => (await h.fetchHistory()).events?.length ?? 0;
    const avant = await longueur();
    // Renvoi de 819bcbd: the refusal of a validator is a refusal by its name too.
    await expect(reprendreDepuis(client, RACINE, TICKET, 'developpeur')).rejects.toBeInstanceOf(
      ReponseRefusee
    );
    await expect(reprendreLeCircuit(client, RACINE, TICKET, null)).rejects.toThrow(
      /aucune question n’attend de réponse : le circuit tourne/
    );
    expect(await longueur()).toBe(avant);
    lacher();
    await enAttente(client);
    const enQuestion = await longueur();
    const refus = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: unknown) => (e instanceof ReponseRefusee ? e.message : null)
      );
    expect(
      await refus(reprendreDepuis(client, RACINE, TICKET, 'relecteur' as 'developpeur'))
    ).toMatch(/--depuis attend une étape du ticket/);
    expect(await refus(etendreLeCircuit(client, RACINE, TICKET, []))).toMatch(
      /--etendre attend les paquets/
    );
    expect(await longueur()).toBe(enQuestion);
  }, 120_000);

  it('two answers to the same question in one turn: the second is refused', async () => {
    const { activites, journal } = actes(
      {
        seance: (_p: unknown, n: number) => (n === 1 ? { statut: 'BESOIN' } : { statut: 'FAIT' }),
      },
      o =>
        o.reponse?.genre === 'depuis'
          ? { etape: 'developpeur', tentative: 1, rapport: null, finale: false }
          : TESTS
    );
    const client = await circuit(activites);
    await enAttente(client);
    // The worker stopped, both answers reach the workflow in the same activation.
    await travailleurDuCircuit.couper();
    const reponses = [
      reprendreDepuis(client, RACINE, TICKET, 'developpeur'),
      etendreLeCircuit(client, RACINE, TICKET, ['packages/b'], null),
    ];
    await new Promise(r => setTimeout(r, 1000));
    await travailleurDuCircuit.lancer();
    const issues = await Promise.allSettled(reponses);
    expect(issues.map(i => i.status).sort()).toEqual(['fulfilled', 'rejected']);
    const refus = issues.find(i => i.status === 'rejected') as PromiseRejectedResult;
    expect(refus.reason).toBeInstanceOf(ReponseRefusee);
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(journal.ouvertures).toHaveLength(2);
  }, 120_000);

  // The server gives a turn its signals before its updates: --arreter answers the question, and the
  // --reprendre of the same turn finds it answered, refused; the circuit stops.
  it('--reprendre and --arreter in one turn: the stop passes first, the resumption is refused', async () => {
    const { activites, journal } = actes({ seance: { statut: 'BESOIN' } });
    const client = await circuit(activites);
    await enAttente(client);
    await travailleurDuCircuit.couper();
    const reprise = reprendreLeCircuit(client, RACINE, TICKET, null).then(
      v => v,
      () => 'refusée'
    );
    await new Promise(r => setTimeout(r, 500));
    await arreterLeCircuit(client, RACINE, TICKET, 'le motif');
    await new Promise(r => setTimeout(r, 500));
    await travailleurDuCircuit.lancer();
    expect(await finDuCircuit(client, RACINE, TICKET)).toMatchObject({ code: 0, raison: 'arrete' });
    expect(await reprise).toBe('refusée');
    expect(journal.ouvertures).toHaveLength(1);
  }, 120_000);
});

describe('une histoire enregistrée se rejoue sur le code courant', () => {
  it('the history of a ticket integrated replays without a nondeterminism', async () => {
    // Each step gives back its effects, each played in an activity whose id the workflow sets.
    const { activites } = actes({}, () => TESTS, {
      preparerLaPasse: async (e, simule) => ({
        ...(await simule(e)),
        effets: [{ genre: 'etat' }, { genre: 'commentaire' }],
      }),
    });
    const client = await circuit(activites);
    await finDuCircuit(client, RACINE, TICKET);
    const histoire = await handle(client).fetchHistory();
    // Recorded when absent, as a snapshot is, and red: to record it anew, remove the file, play the
    // test, then commit the file it wrote; a play without it never passes.
    if (!existsSync(HISTOIRE)) {
      writeFileSync(
        HISTOIRE,
        `${JSON.stringify(HistoireDuProto(histoire).toObject(histoire, ENTIER), null, 1)}\n`
      );
      expect.fail(`l’histoire enregistrée manquait : ${HISTOIRE} écrite, à commiter.`);
    }
    await Worker.runReplayHistory({ workflowsPath: DEROULES }, histoire);
    // The history recorded and committed (D7): the current code replays it.
    const enregistree = HistoireDuProto(histoire).fromObject(
      JSON.parse(readFileSync(HISTOIRE, 'utf8'))
    );
    await Worker.runReplayHistory({ workflowsPath: DEROULES }, enregistree);
  }, 120_000);
});

// The checks « à repasser » (75 of the verifier: the machine's lock or room not had in time) are the
// stop « a-repasser »; the integration verifies nothing since grillhouse-44b.12.5, so it has none.
const A_REPASSER = { ...VERT, aRepasser: true };

describe('un « a-repasser » se rejoue, 6 fois au plus, puis sa question monte', () => {
  it('plays again after its sleep, six times, then the seventh goes up', async () => {
    const { activites, journal } = actes({ controles: A_REPASSER }, o =>
      o.arrete ? { ...o.arrete } : TESTS
    );
    const client = await circuit(activites, { repasserMs: 300 });
    const v = await enAttente(client).then(async () =>
      attendre(
        'la question',
        async () => {
          const x = await lireLeCircuit(client, RACINE, TICKET);
          return x.question ? x : undefined;
        },
        60_000
      )
    );
    expect(v.question).toMatchObject({ arret: 'a-repasser' });
    expect(journal.arrets.map(a => a.monter)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(journal.ouvertures.slice(1).map(o => o.reponse)).toEqual(
      Array(6).fill({ genre: 'reprendre', contexte: null })
    );
    expect(journal.ouvertures.slice(1).every(o => o.arrete?.etape === 'controles')).toBe(true);
  }, 120_000);

  it('sleeps 10 min by default, as its timer says', async () => {
    const { activites } = actes({ controles: A_REPASSER });
    const client = await circuit(activites);
    const h = handle(client);
    const minuteur = await attendre('le minuteur', async () =>
      (await h.fetchHistory()).events?.find(e => e.timerStartedEventAttributes)
    );
    expect(Number(minuteur.timerStartedEventAttributes?.startToFireTimeout?.seconds)).toBe(600);
  }, 120_000);
});

// Renvoi de 92dead5, point 1: an effect that is said when it is not written stays retryable up to
// the last attempt of its activity, then is said, and the circuit goes on, through src/temporal/
// acte.ts and the circuit's own writer (./acte-en-panne.mjs).
describe('un effet qui avertit profite des reprises de Temporal, par acte.ts', () => {
  async function enPanne(pannes: number, effet = 'commentaire') {
    const d = dossier('panne');
    const trace = path.join(d, 'trace');
    const s = await demarrerLeServeur(
      programmeTemporal(),
      path.join(d, 'temporal.db'),
      await portLibre(),
      ATTRIBUTS_DE_RECHERCHE
    );
    arrets.push(() => s.tuer());
    const avant = { ...process.env };
    Object.assign(process.env, {
      GRILLHOUSE_ACTE_DU_CIRCUIT: path.join(__dirname, 'acte-en-panne.mjs'),
      GRILLHOUSE_TRACE_D_ESSAI: trace,
      GRILLHOUSE_PANNES_D_ESSAI: String(pannes),
      GRILLHOUSE_EFFET_D_ESSAI: effet,
    });
    try {
      const t = await demarrerLeTravailleur(s.adresse, FILE);
      arrets.unshift(() => t.tuer());
      const c = ouvrirLeClient({ adresse: s.adresse });
      arrets.unshift(() => c.fermer());
      await demarrerLeCircuit(c.client, { racine: d, ticket: TICKET }, FILE);
      // The step after the effect, or the question of a stop.
      const question = await attendre(
        'l’étape après l’effet, ou une question',
        async () => {
          if (existsSync(trace) && readFileSync(trace, 'utf8').includes('preparer')) {
            return { arret: null };
          }
          const v = await lireLeCircuit(c.client, d, TICKET);
          return v.attente ? { arret: v.question?.arret ?? null } : undefined;
        },
        90_000
      );
      await arreterLeCircuit(c.client, d, TICKET, null);
      await finDuCircuit(c.client, d, TICKET);
      return { lignes: readFileSync(trace, 'utf8').trim().split('\n'), arret: question.arret };
    } finally {
      for (const k of [
        'GRILLHOUSE_ACTE_DU_CIRCUIT',
        'GRILLHOUSE_TRACE_D_ESSAI',
        'GRILLHOUSE_PANNES_D_ESSAI',
        'GRILLHOUSE_EFFET_D_ESSAI',
      ]) {
        if (avant[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = avant[k];
        }
      }
    }
  }

  it('one passing failure: Temporal tries the effect again, it is written, the circuit goes on', async () => {
    expect(await enPanne(1)).toEqual({
      lignes: ['effet 1 panne', 'effet 2 ecrit', 'preparer'],
      arret: null,
    });
  }, 120_000);

  it('a failure at every attempt: the last one says it, and the circuit goes on', async () => {
    expect(await enPanne(99)).toEqual({
      lignes: ['effet 1 panne', 'effet 2 panne', 'effet 3 panne', 'effet 4 averti', 'preparer'],
      arret: null,
    });
  }, 150_000);

  // Remarque sur 69f0ffa: a real fault stays a failure Temporal does not try again, the stop
  // « inattendu » at once: an effect that stops (the plan not written), an effect unknown.
  it.each(['plan', 'autre'])(
    'an effect %s that fails is played once, its stop « inattendu » up',
    async effet => {
      expect(await enPanne(99, effet)).toEqual({ lignes: ['effet 1 panne'], arret: 'inattendu' });
    },
    120_000
  );
});

describe('un acte arrêté finit son groupe avant d’échouer', () => {
  it('the command an act runs, which ignores SIGTERM, is gone once the stop is written', async () => {
    const d = dossier('groupe');
    const trace = path.join(d, 'trace');
    const s = await demarrerLeServeur(
      programmeTemporal(),
      path.join(d, 'temporal.db'),
      await portLibre(),
      ATTRIBUTS_DE_RECHERCHE
    );
    arrets.push(() => s.tuer());
    const avant = { ...process.env };
    Object.assign(process.env, {
      GRILLHOUSE_ACTE_DU_CIRCUIT: path.join(__dirname, 'acte-qui-dure.mjs'),
      GRILLHOUSE_TRACE_D_ESSAI: trace,
    });
    // The command, when it outlives its act: the test ends it.
    let commande: number | null = null;
    arrets.push(() => {
      if (commande && vit(commande)) {
        process.kill(commande, 'SIGKILL');
      }
      return Promise.resolve();
    });
    try {
      const t = await demarrerLeTravailleur(s.adresse, FILE);
      arrets.unshift(() => t.tuer());
      const c = ouvrirLeClient({ adresse: s.adresse });
      arrets.unshift(() => c.fermer());
      await demarrerLeCircuit(c.client, { racine: d, ticket: TICKET }, FILE);
      commande = await attendre('la commande de l’acte', () =>
        Promise.resolve(
          existsSync(trace) && readFileSync(trace, 'utf8').trim()
            ? Number(readFileSync(trace, 'utf8').trim())
            : undefined
        )
      );
      expect(vit(commande)).toBe(true);
      await arreterLeCircuit(c.client, d, TICKET, 'le motif');
      expect(await finDuCircuit(c.client, d, TICKET)).toMatchObject({ code: 0, raison: 'arrete' });
      expect(vit(commande), `la commande ${commande} de l’acte arrêté vit encore`).toBe(false);
    } finally {
      for (const k of ['GRILLHOUSE_ACTE_DU_CIRCUIT', 'GRILLHOUSE_TRACE_D_ESSAI']) {
        if (avant[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = avant[k];
        }
      }
    }
  }, 120_000);
});

// Whether the process <pid> lives.
function vit(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('la mort du travailleur en séance reprend sans seconde séance vivante', () => {
  it('the attempt played again waits for the group the dead worker left, then launches', async () => {
    const d = dossier('mort');
    const trace = path.join(d, 'trace');
    const s = await demarrerLeServeur(
      programmeTemporal(),
      path.join(d, 'temporal.db'),
      await portLibre(),
      ATTRIBUTS_DE_RECHERCHE
    );
    arrets.push(() => s.tuer());
    const avant = { ...process.env };
    Object.assign(process.env, {
      GRILLHOUSE_ACTE_DU_CIRCUIT: path.join(__dirname, 'acte-d-essai.mjs'),
      GRILLHOUSE_TRACE_D_ESSAI: trace,
    });
    try {
      const premier = await demarrerLeTravailleur(s.adresse, FILE);
      const c = ouvrirLeClient({ adresse: s.adresse });
      arrets.unshift(() => c.fermer());
      await demarrerLeCircuit(c.client, { racine: d, ticket: TICKET }, FILE);
      const libere = path.join(d, 'libere');
      await attendre('la première séance', () =>
        Promise.resolve(
          existsSync(trace) && readFileSync(trace, 'utf8').includes('lance') ? true : undefined
        )
      );
      // Its sign of life reaches the server, then the worker dies.
      await new Promise(r => setTimeout(r, 3000));
      await premier.tuer();
      const second = await demarrerLeTravailleur(s.adresse, FILE);
      arrets.unshift(() => second.tuer());
      const lues = () => readFileSync(trace, 'utf8').trim().split('\n');
      // The attempt played again waits while the first group runs: no second launch.
      await attendre(
        'la seconde tentative',
        () =>
          Promise.resolve(
            lues().filter(x => x.startsWith('tentative')).length >= 2 ? true : undefined
          ),
        200_000
      );
      await new Promise(r => setTimeout(r, 2000));
      expect(lues().filter(x => x.startsWith('lance'))).toHaveLength(1);
      writeFileSync(libere, '');
      const lignes = await attendre(
        'la seconde séance',
        () => {
          const l = readFileSync(trace, 'utf8').trim().split('\n');
          return Promise.resolve(l.filter(x => x.startsWith('lance')).length >= 2 ? l : undefined);
        },
        200_000
      );
      // The second launch comes after the first group's end: never two sessions alive.
      const temps = (genre: string) =>
        lignes.filter(l => l.startsWith(`${genre} `)).map(l => Number(l.split(' ')[1]));
      expect(temps('fin'), lignes.join('\n')).toHaveLength(1);
      expect(temps('lance')[1]).toBeGreaterThanOrEqual(temps('fin')[0]!);
      // Both attempts carry the same key, which the acts of the circuit play once.
      const cles = lignes.filter(l => l.startsWith('tentative ')).map(l => l.split(' ')[1]);
      expect(cles).toHaveLength(2);
      expect(cles[0]).toMatch(/.+:.+:.+/);
      expect(cles[1]).toBe(cles[0]);
    } finally {
      // Red or green, the fake claude's loop ends and each group of a session is killed.
      writeFileSync(path.join(d, 'libere'), '');
      const groupes = existsSync(trace)
        ? readFileSync(trace, 'utf8')
            .split('\n')
            .filter(l => l.startsWith('groupe '))
            .map(l => Number(l.split(' ')[1]))
        : [];
      // Never the group of the test itself.
      const sien = Number(
        execFileSync('ps', ['-o', 'pgid=', String(process.pid)], { encoding: 'utf8' }).trim()
      );
      for (const g of groupes.filter(x => x > 1 && x !== sien)) {
        try {
          process.kill(-g, 'SIGKILL');
        } catch {
          // a group already gone
        }
      }
      for (const k of ['GRILLHOUSE_ACTE_DU_CIRCUIT', 'GRILLHOUSE_TRACE_D_ESSAI']) {
        if (avant[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = avant[k];
        }
      }
    }
  }, 300_000);
});

// grillhouse-4nr.12: `npx grillhouse circuit` is the client of the workflow of a ticket
// (src/temporal/circuit/commande.ts): its call read, and the server asked before anything else;
// then, on this repository, read and never written, a stand-in answering for Beads, what the
// ticket and the repository refuse is refused at the door, code 2, no workflow started. The circuit led to its end
// by the command is a large test: the night plays it, on the bench of packages/grillhouse-essais.
describe('the command `grillhouse circuit` reads its call and asks the server first', () => {
  const commande = (args: string[], adresse: string) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>(resolve => {
      execFile(
        process.execPath,
        [COMMANDE, 'circuit', ...args],
        {
          cwd: dossier('hors-depot'),
          encoding: 'utf8',
          env: { ...process.env, TEMPORAL_ADDRESS: adresse },
        },
        (erreur, stdout, stderr) =>
          resolve({ status: erreur ? Number(erreur.code ?? 1) : 0, stdout, stderr })
      );
    });

  it('a malformed call gives the usage, exit 2', async () => {
    const r = await commande(['--depuis', 'developpeur'], '127.0.0.1:1');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: npx grillhouse circuit <ticket>');
    expect(r.stderr).toContain('le ticket manque');
    const sansContexte = await commande(['t-1', '--depuis', 'developpeur'], '127.0.0.1:1');
    expect(sansContexte.status).toBe(2);
    expect(sansContexte.stderr).toContain('--depuis attend son --contexte');
  });

  it('a server that does not answer is said, exit 1, before the repository is read', async () => {
    const r = await commande(['t-1'], `127.0.0.1:${await portLibre()}`);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Temporal ne répond pas en 2 s sur 127\.0\.0\.1:\d+/);
  });

  it('a ticket Beads cannot show, and a package --etendre names that the repository lacks, are refused at the door, exit 2', async () => {
    const s = await demarrerLeServeur(
      programmeTemporal(),
      path.join(dossier('commande'), 'temporal.db'),
      await portLibre(),
      ATTRIBUTS_DE_RECHERCHE
    );
    arrets.push(() => s.tuer());
    // Beads shows demo-1 alone; any other ticket, it cannot read.
    const faux = dossier('faux-bd');
    const ticket = JSON.stringify([
      { id: 'demo-1', title: '001 — un sujet — .', description: '## Architecture\n\nLe modèle.' },
    ]);
    writeFileSync(path.join(faux, 'demo-1.json'), ticket);
    writeFileSync(
      path.join(faux, 'bd'),
      `#!/bin/sh\nif [ "$1" = show ] && [ "$2" = demo-1 ]; then cat '${path.join(faux, 'demo-1.json')}'; exit 0; fi\necho "no issue found: $2" >&2\nexit 1\n`,
      { mode: 0o755 }
    );
    const dans = (args: string[]) =>
      new Promise<{ status: number | null; stdout: string; stderr: string }>(resolve => {
        execFile(
          process.execPath,
          [COMMANDE, 'circuit', ...args],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              TEMPORAL_ADDRESS: s.adresse,
              PATH: `${faux}:${process.env.PATH}`,
            },
          },
          (erreur, stdout, stderr) =>
            resolve({ status: erreur ? Number(erreur.code ?? 1) : 0, stdout, stderr })
        );
      });
    const illisible = await dans(['demo-9']);
    expect(illisible.status, illisible.stderr).toBe(2);
    expect(illisible.stderr).toContain('ticket demo-9 illisible');
    const absent = await dans(['demo-1', '--etendre', 'packages/absent']);
    expect(absent.status, absent.stderr).toBe(2);
    expect(absent.stderr).toContain(
      '⛔ le composant « packages/absent » du titre ne nomme ni un paquet ni un chemin du dépôt.'
    );
  }, 120_000);
});

// La reprise à l'étape qui porte le rouge : un rouge de passe finale ne rejoue ni les tests, ni la
// preuve, ni le code. Modèle mûr : « Re-run failed jobs » de GitHub Actions.
describe('un rouge de passe finale se reprend sans rejouer les tests, la preuve ni le code', () => {
  const TEST_X = 'packages/a/tests/x.spec.ts';
  const ROUGE = {
    ...VERT,
    rouge: true,
    auDeveloppeur: true,
    rouges: [{ paquet: 'packages/a', texte: 'rouge' }],
    tous: [{ paquet: 'packages/a', texte: 'rouge' }],
  };
  const PORTES = { tests: [TEST_X], code: ['packages/a/src/x.ts'] };

  it('un rouge sans fichier nommé monte ; la réponse reprend à la passe finale, qui seule se rejoue', async () => {
    const { activites, journal } = actes(
      {
        referencesDesRouges: [],
        portes: PORTES,
        controles: (_p: unknown, n: number) => (n === 2 ? ROUGE : VERT),
      },
      o => (o.arrete && o.arrete.etape !== 'plan' ? { ...o.arrete } : TESTS)
    );
    const client = await circuit(activites);
    await enAttente(client);
    const avant = [...journal.faits];
    expect(avant.filter(f => f === 'seance')).toHaveLength(2);
    await reprendreLeCircuit(client, RACINE, TICKET, null);
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    const apres = journal.faits.slice(avant.length);
    for (const rejoue of ['mecanique', 'sansTests', 'seance', 'preuve', 'empreinteAvant']) {
      expect(apres, rejoue).not.toContain(rejoue);
    }
    expect(apres).toContain('controles');
  }, 120_000);

  it('un rouge de garde d’un seul fichier de test : ce fichier seul rejoue sa séance et sa preuve, aucune séance du développeur de plus', async () => {
    const seances: Record<string, unknown>[] = [];
    const preuves: Record<string, unknown>[] = [];
    const controles: Record<string, unknown>[] = [];
    const { activites, journal } = actes({
      referencesDesRouges: [],
      portes: PORTES,
      seance: (p: Record<string, unknown>) => {
        seances.push(p);
        return { statut: 'FAIT' };
      },
      preuve: (p: Record<string, unknown>) => {
        preuves.push(p);
        return FAITS.preuve;
      },
      controles: (p: Record<string, unknown>, n: number) => {
        controles.push(p);
        // Un fichier de test qu'une garde refuse (sa taille) est au testwriter ; un test qui
        // échoue sans garde irait au développeur (scripts/reprise.mjs).
        return n === 2 ? { ...ROUGE, lieux: [{ fichier: TEST_X, gardes: ['tailles'] }] } : VERT;
      },
    });
    const client = await circuit(activites);
    expect(await finDuCircuit(client, RACINE, TICKET)).toEqual({ code: 0, raison: 'integre' });
    expect(seances.map(s => s.role)).toEqual(['testwriter', 'developpeur', 'testwriter']);
    expect(seances[2]).toMatchObject({ fichiers: [TEST_X] });
    expect(preuves).toHaveLength(2);
    expect(preuves[1]).toMatchObject({ fichiers: [TEST_X] });
    expect(controles.slice(2).every(c => (c.fichiers as string[])?.[0] === TEST_X)).toBe(true);
    expect(journal.arrets).toEqual([]);
  }, 120_000);
});
