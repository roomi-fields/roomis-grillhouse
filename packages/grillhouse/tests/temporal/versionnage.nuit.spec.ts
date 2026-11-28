// @equipee: un serveur Temporal
// The versioning of the frame's workers (installation.md §2.6, circuit.md §6) on a development
// server of trial (the pinned program TEMPORAL on a free port, a database file of its own): the
// routing is the server's. The workers of two versions are workers of this process, built by the
// worker's module (`optionsDuTravailleur`) on one task queue, their activities simulated by the
// test, each act written with the version of the worker that ran it; a version is made current by
// the frame's one gesture (`rendreCourante`).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Context } from '@temporalio/activity';
import { NativeConnection, Worker } from '@temporalio/worker';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ATTRIBUTS_DE_RECHERCHE,
  ouvrirLeClient,
  rendreCourante,
  type ClientOuvert,
} from '../../src/temporal/client.js';
import { demarrerLeCircuit, finDuCircuit } from '../../src/temporal/circuit/client.js';
import { idDuCircuit, type Activites } from '../../src/temporal/circuit/contrat.js';
import { idDeLaFile, type ActivitesDeLaFile } from '../../src/temporal/file/contrat.js';
import { demarrerLesTickets } from '../../src/temporal/tickets/client.js';
import { idDesTickets, type ActivitesDesTickets } from '../../src/temporal/tickets/contrat.js';
import { optionsDuTravailleur } from '../../src/temporal/travailleur.js';
import {
  PAUSE_D_ESSAI,
  PAQUET,
  attendre,
  demarrerLeServeur,
  demarrerLeTravailleur,
  dossier,
  portLibre,
  programmeTemporal,
} from './essai.js';

const DEROULES = path.join(PAQUET, 'dist/temporal/deroules.js');
const RACINE = '/depot/essai';
const FILE = 'essai-versions';
const ANCIENNE = '1.0.0';
const NEUVE = '2.0.0';
// The behaviours as the server writes them (temporal.api.enums.v1.VersioningBehavior).
const EPINGLE = 1;
const AUTO_UPGRADE = 2;

const arrets: (() => Promise<void>)[] = [];
// The facts still held when a test ends, released first: a worker stops once its acts ended.
const lachers: (() => void)[] = [];
afterEach(async () => {
  for (const lacher of lachers.splice(0)) {
    lacher();
  }
  for (const a of arrets.splice(0)) {
    await a();
  }
});

async function serveur() {
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('versions'), 'temporal.db'),
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const c: ClientOuvert = ouvrirLeClient({ adresse: s.adresse });
  arrets.unshift(() => c.fermer());
  const connexion = await NativeConnection.connect({ address: s.adresse });
  arrets.splice(arrets.length - 1, 0, () => connexion.close());
  return { adresse: s.adresse, client: c.client, connexion };
}

// A worker of this process of the version <version> on the queue <file>, built but not yet
// polling: `lancer` starts it, the end of the test stops it.
async function travailleur(
  connexion: NativeConnection,
  version: string,
  activites: object,
  file = FILE
) {
  const w = await Worker.create({
    ...optionsDuTravailleur(file, version),
    connection: connexion,
    workflowsPath: DEROULES,
    activities: activites,
  });
  let fin: Promise<void> | null = null;
  const lancer = () => {
    fin = w.run();
  };
  arrets.splice(0, 0, async () => {
    if (!fin) {
      lancer();
    }
    w.shutdown();
    await fin;
  });
  return { lancer };
}

type Client = ClientOuvert['client'];
// The behaviour of the workflow <id> and the version that completed its last task.
async function servi(client: Client, id: string) {
  const d = await client.workflow.getHandle(id).describe();
  const v = d.raw.workflowExecutionInfo?.versioningInfo;
  return {
    comportement: Number(v?.behavior ?? 0),
    deploiement: v?.deploymentVersion?.deploymentName,
    version: v?.deploymentVersion?.buildId,
  };
}
const routage = async (client: Client, file: string) =>
  (
    await client.workflowService.describeWorkerDeployment({
      namespace: 'default',
      deploymentName: file,
    })
  ).workerDeploymentInfo?.routingConfig;

// Each act run, the version of the worker that ran it and the workflow that asked it.
type Journal = { version: string; acte: string; deroule: string | undefined }[];

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

// A fact held: the first reading of <fait> by the circuit of <ticket> waits for `lacher`.
function retenue(ticket: string, fait: string) {
  let lacher: () => void = () => {};
  const tenue = new Promise<void>(ok => (lacher = ok));
  let atteinte = false;
  lachers.push(() => lacher());
  return {
    async passer(t: string, f: string) {
      if (t === ticket && f === fait && !atteinte) {
        atteinte = true;
        await tenue;
      }
    },
    attendre: () =>
      attendre(
        `le fait ${fait} de ${ticket}`,
        () => Promise.resolve(atteinte || undefined),
        60_000
      ),
    lacher: () => lacher(),
  };
}

// The activities of the two versions: the same simulated ones, each act written under the version
// of the worker that runs it.
function actes(halte: ReturnType<typeof retenue>) {
  const journal: Journal = [];
  const tickets = { prets: [] as string[] };
  const fermes = new Set<string>();
  const circuit: Activites = {
    ouvrirLeCircuit: o =>
      Promise.resolve({
        ouverture: {
          debut: { etape: 'testwriter', tentative: 1, rapport: null, finale: false },
          memoire: { constats: [] },
          ticket: { id: o.ticket, paquets: ['packages/a'], sorte: null, copie: '/copie' },
        },
        effets: [],
      }),
    preparerLaPasse: ({ etape }) =>
      Promise.resolve({ memoire: {}, etat: etape, menee: null, effets: [] }),
    async lireUnFait({ ticket, fait }) {
      await halte.passer(ticket, fait);
      return { valeur: FAITS[fait], memoire: {}, effets: [] };
    },
    appliquerLesEffets: () => Promise.resolve({ effets: [] }),
    publierLArret: () => Promise.reject(new Error('aucun arrêt dans cet essai')),
    finirLeTicket: () => Promise.resolve({ effets: [] }),
    arreterLeTicket: () => Promise.resolve({ effets: [] }),
    jouerUnEffet: () => Promise.resolve(),
    jouerUnPasDuPlan: () => Promise.reject(new Error('aucun plan dans cet essai')),
  };
  const file: ActivitesDeLaFile = {
    lireLaVersionDeLOutil: () => Promise.resolve('essai'),
    situerLeLot: ({ ticket }) =>
      Promise.resolve({
        statut: fermes.has(ticket) ? 'closed' : 'open',
        raison: fermes.has(ticket) ? 'intégré' : null,
      }),
    preparerLaBranche: ({ ticket }) =>
      Promise.resolve({ candidat: { commit: `c-${ticket}` }, effets: [] }),
    jugerLeCandidat: () => Promise.resolve({ juge: true as const, effets: [] }),
    avancerMain: ({ commit }) => Promise.resolve({ entre: { commit }, effets: [] }),
    fermerLEntree: ({ ticket }) => {
      fermes.add(ticket);
      return Promise.resolve({ poussee: 'main', effets: [] });
    },
    surveillerLaCiDeMain: () => Promise.resolve({ etat: 'verte' as const }),
    jouerUnEffetDeLaFile: () => Promise.resolve(),
  };
  const desTickets: ActivitesDesTickets = {
    ticketsAPartir: ({ enCours }) =>
      Promise.resolve({
        partir: tickets.prets.filter(t => !enCours.includes(t)),
        max: 1,
        faute: null,
      }),
    circuitsVivants: () => Promise.resolve([]),
    fermesHorsCircuit: () => Promise.resolve([]),
    circuitsEnPause: () => Promise.resolve([]),
    circuitsDeLaLimite: () => Promise.resolve({ tenant: [], superviseur: [], lus: [] }),
    placesDeLaMachine: ({ candidats }) => Promise.resolve({ accordes: candidats, faute: null }),
    tracerLaFile: ({ ticket, evenement }) => {
      // A ticket launched is ready no more.
      if (evenement === 'lance') {
        tickets.prets = tickets.prets.filter(t => t !== ticket);
      }
      return Promise.resolve();
    },
  };
  const toutes = { ...PAUSE_D_ESSAI, ...circuit, ...file, ...desTickets };
  const de = (version: string) =>
    Object.fromEntries(
      Object.entries(toutes).map(([acte, f]) => [
        acte,
        (e: never) => {
          const deroule = Context.current().info.workflowExecution?.workflowId;
          journal.push({ version, acte, deroule });
          return (f as (e: never) => unknown)(e);
        },
      ])
    );
  // The versions that ran the acts the workflow <id> asked, the acts <noms> alone when given.
  const versions = (id: string, noms?: string[]) => [
    ...new Set(
      journal.filter(a => a.deroule === id && (!noms || noms.includes(a.acte))).map(a => a.version)
    ),
  ];
  return { de, versions, tickets };
}

describe('le geste du cadre rend courante la version d’un travailleur sur sa file', () => {
  it('waits for the server to know the version, routes the next workflow to it, and changes nothing played again', async () => {
    const s = await serveur();
    const w = await travailleur(s.connexion, ANCIENNE, {
      lancerLaSonde: () => Promise.resolve({ pas: 1 }),
    });
    let rendue = false;
    const geste = rendreCourante(s.client, FILE, ANCIENNE).then(() => (rendue = true));
    // A refusal met before the await below stays handled.
    geste.catch(() => undefined);
    // No worker polls yet: the server knows no such version.
    await new Promise(r => setTimeout(r, 2000));
    expect(rendue).toBe(false);
    w.lancer();
    await geste;
    const premier = await routage(s.client, FILE);
    expect(premier?.currentDeploymentVersion).toMatchObject({
      deploymentName: FILE,
      buildId: ANCIENNE,
    });
    const h = await s.client.workflow.start('sonde', {
      workflowId: 'sonde-apres-le-geste',
      taskQueue: FILE,
      args: [{ ticket: 'essai', etapes: 1, pauseMs: 1, attendreLeSignal: false }],
    });
    await h.result();
    expect(await servi(s.client, h.workflowId)).toEqual({
      comportement: AUTO_UPGRADE,
      deploiement: FILE,
      version: ANCIENNE,
    });
    await rendreCourante(s.client, FILE, ANCIENNE);
    expect(await routage(s.client, FILE)).toEqual(premier);
  }, 180_000);

  it('the worker as it is launched announces the version of its package, the sonde served by it', async () => {
    const s = await serveur();
    const { version } = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
      version: string;
    };
    const t = await demarrerLeTravailleur(s.adresse, 'essai-lance');
    arrets.splice(0, 0, () => t.tuer());
    const h = await s.client.workflow.start('sonde', {
      workflowId: 'sonde-du-travailleur-lance',
      taskQueue: 'essai-lance',
      args: [{ ticket: 'essai', etapes: 1, pauseMs: 1, attendreLeSignal: false }],
    });
    await h.result();
    expect(await servi(s.client, h.workflowId)).toEqual({
      comportement: AUTO_UPGRADE,
      deploiement: 'essai-lance',
      version,
    });
  }, 180_000);
});

describe('un circuit en vol finit sur sa version quand une version neuve devient courante', () => {
  it('its acts all come from the old version, its continue-as-new included; a circuit started after runs on the new one', async () => {
    const halte = retenue('essai-1', 'seance');
    const a = actes(halte);
    const s = await serveur();
    const ancien = await travailleur(s.connexion, ANCIENNE, a.de(ANCIENNE));
    const neuf = await travailleur(s.connexion, NEUVE, a.de(NEUVE));
    ancien.lancer();
    await rendreCourante(s.client, FILE, ANCIENNE);
    const premier = idDuCircuit(RACINE, 'essai-1');
    // A history short enough for the circuit to continue as new before its end.
    await demarrerLeCircuit(
      s.client,
      { racine: RACINE, ticket: 'essai-1', limiteDHistoire: 30 },
      FILE
    );
    await halte.attendre();
    const { runId } = await s.client.workflow.getHandle(premier).describe();
    neuf.lancer();
    await rendreCourante(s.client, FILE, NEUVE);
    halte.lacher();
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect((await s.client.workflow.getHandle(premier).describe()).runId).not.toBe(runId);
    // The queue of integration moves on to the new version; the circuit's own acts do not.
    expect(a.versions(premier)).toEqual([ANCIENNE]);
    expect(await servi(s.client, premier)).toEqual({
      comportement: EPINGLE,
      deploiement: FILE,
      version: ANCIENNE,
    });
    await demarrerLeCircuit(s.client, { racine: RACINE, ticket: 'essai-2' }, FILE);
    expect(await finDuCircuit(s.client, RACINE, 'essai-2')).toEqual({ code: 0, raison: 'integre' });
    const second = idDuCircuit(RACINE, 'essai-2');
    expect(a.versions(second)).toEqual([NEUVE]);
    expect(await servi(s.client, second)).toEqual({
      comportement: EPINGLE,
      deploiement: FILE,
      version: NEUVE,
    });
  }, 240_000);
});

describe('les files passent à la version neuve, les circuits qu’elles lient gardent la leur', () => {
  it('the queue of integration started by an old circuit is served by the new version after its first task', async () => {
    const halte = retenue('essai-1', 'commit');
    const a = actes(halte);
    const s = await serveur();
    const ancien = await travailleur(s.connexion, ANCIENNE, a.de(ANCIENNE));
    const neuf = await travailleur(s.connexion, NEUVE, a.de(NEUVE));
    ancien.lancer();
    await rendreCourante(s.client, FILE, ANCIENNE);
    await demarrerLeCircuit(s.client, { racine: RACINE, ticket: 'essai-1' }, FILE);
    await halte.attendre();
    neuf.lancer();
    await rendreCourante(s.client, FILE, NEUVE);
    halte.lacher();
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    const circuit = idDuCircuit(RACINE, 'essai-1');
    expect(a.versions(circuit)).toEqual([ANCIENNE]);
    expect(await servi(s.client, circuit)).toMatchObject({
      comportement: EPINGLE,
      version: ANCIENNE,
    });
    const file = idDeLaFile(RACINE);
    // The acts of the entry come after the first task of the queue.
    expect(a.versions(file, ['jugerLeCandidat', 'avancerMain', 'fermerLEntree'])).toEqual([NEUVE]);
    expect(await servi(s.client, file)).toEqual({
      comportement: AUTO_UPGRADE,
      deploiement: FILE,
      version: NEUVE,
    });
  }, 240_000);

  it('the queue of the tickets moves to the new version, the circuit it starts then pinned to it', async () => {
    const a = actes(retenue('', ''));
    const s = await serveur();
    const ancien = await travailleur(s.connexion, ANCIENNE, a.de(ANCIENNE));
    const neuf = await travailleur(s.connexion, NEUVE, a.de(NEUVE));
    ancien.lancer();
    await rendreCourante(s.client, FILE, ANCIENNE);
    await demarrerLesTickets(s.client, { racine: RACINE, reveilMs: 500 }, FILE);
    const tickets = idDesTickets(RACINE);
    await attendre('la file des tickets servie par l’ancienne version', async () =>
      (await servi(s.client, tickets)).version === ANCIENNE ? true : undefined
    );
    neuf.lancer();
    await rendreCourante(s.client, FILE, NEUVE);
    await attendre(
      'la file des tickets servie par la version neuve',
      async () => ((await servi(s.client, tickets)).version === NEUVE ? true : undefined),
      60_000
    );
    expect(await servi(s.client, tickets)).toMatchObject({ comportement: AUTO_UPGRADE });
    a.tickets.prets = ['essai-2'];
    const circuit = idDuCircuit(RACINE, 'essai-2');
    await attendre(
      'la fin du circuit que la file démarre',
      async () => {
        const d = await s.client.workflow.getHandle(circuit).describe();
        return d.status.name === 'COMPLETED' ? true : undefined;
      },
      120_000
    );
    expect(a.versions(circuit)).toEqual([NEUVE]);
    expect(await servi(s.client, circuit)).toEqual({
      comportement: EPINGLE,
      deploiement: FILE,
      version: NEUVE,
    });
  }, 240_000);
});
