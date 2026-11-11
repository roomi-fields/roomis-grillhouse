// @poste: un serveur Temporal
// grillhouse-4nr.8: the queue of integration of a project and the following of the CI under
// Temporal, played on a development server of trial (the pinned program TEMPORAL on a free port,
// a database file of its own), its activities simulated by the test (a worker of this process).
// The queue of a project (`fileDuProjet`, `file:<racine>`) takes one entry at a time, which the
// workflow of a ticket sends at its step 5.2 and whose issue it awaits: the branch made the
// candidate and pushed, its CI (`ciDuCommit`, a child workflow, one reading at a time, durable
// timers between them) judged before main moves onto it; main moved meanwhile, the branch is
// replaced and judged again. One entry on main at a time; the death of the worker between the
// entry and the closure ends the ticket without reopening it; a red CI reopens the ticket, main
// unmoved, and its question goes up; `--reprendre` after a green rerun sends the branch again.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ApplicationFailure } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';
import { afterEach, describe, expect, it } from 'vitest';
import { ATTRIBUTS_DE_RECHERCHE, ouvrirLeClient } from '../../src/temporal/client.js';
import {
  demarrerLeCircuit,
  finDuCircuit,
  lireLeCircuit,
  reprendreLeCircuit,
} from '../../src/temporal/circuit/client.js';
import type { Activites, EtatDeLEtape } from '../../src/temporal/circuit/contrat.js';
import { lireLaFile } from '../../src/temporal/file/client.js';
import {
  idDeLaFile,
  type ActivitesDeLaFile,
  type LectureDeLaCI,
} from '../../src/temporal/file/contrat.js';
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
const FILE = 'essai-file';
// The CI of trial: its readings 200 ms apart, its search 2 s, its wait 20 s.
const CI = { rechercheMs: 2_000, attenteMs: 20_000, pasMs: 200 };
const EN_FILE: EtatDeLEtape = { etape: 'file', tentative: 1, rapport: null, finale: false };

const arrets: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const a of arrets.splice(0)) {
    await a();
  }
});

// The CI of a commit as a scenario names it: each reading in its order, the last one repeated.
type Scenario = LectureDeLaCI[];
const VERTE: Scenario = [
  { etat: 'cherche' },
  { etat: 'en-cours', passage: '41' },
  { etat: 'finie', passage: '41', conclusion: 'success' },
];
const ROUGE: Scenario = [{ etat: 'finie', passage: '42', conclusion: 'failure' }];

// The acts a test simulates, and what they were asked: the circuit's at its step 5.2 (the ticket
// opens on it, its tri read true), and the queue's; each act of <autres> stands in for the
// simulated one, called with it.
function actes(
  ci: () => Scenario = () => VERTE,
  autres: Partial<{
    [K in keyof ActivitesDeLaFile]: (
      e: Parameters<ActivitesDeLaFile[K]>[0],
      simule: ActivitesDeLaFile[K]
    ) => ReturnType<ActivitesDeLaFile[K]>;
  }> = {}
) {
  const journal = {
    // Each act of the queue, `<acte> <ticket>`, in its order; `fin <acte> <ticket>` at its end.
    file: [] as string[],
    lectures: [] as { ticket: string; sha: string; passage: string | null }[],
    conclusions: [] as Parameters<ActivitesDeLaFile['conclureLaCI']>[0][],
    arrets: [] as Parameters<Activites['publierLArret']>[0][],
    fins: [] as string[],
    effets: [] as { id: string; cle: string | null; effet: { genre: string } }[],
  };
  // The lot of each ticket on main once the queue made it enter, the tickets closed, and the
  // candidates of each ticket so far.
  const surMain = new Map<string, string>();
  const fermes = new Set<string>();
  const candidats = new Map<string, number>();
  const lus = new Map<string, number>();
  const circuit: Activites = {
    ouvrirLeCircuit(o) {
      return Promise.resolve({
        ouverture: {
          debut: o.arrete ? { ...EN_FILE, tentative: o.arrete.tentative } : EN_FILE,
          memoire: { constats: [] },
          ticket: { id: o.ticket, paquets: ['packages/a'], sorte: null, copie: '/copie' },
        },
        effets: [],
      });
    },
    preparerLaPasse({ etape }) {
      return Promise.resolve({ memoire: {}, etat: etape, menee: null, effets: [] });
    },
    lireUnFait({ fait }) {
      return Promise.resolve({ valeur: fait === 'tri' ? true : null, memoire: {}, effets: [] });
    },
    appliquerLesEffets() {
      return Promise.resolve({ effets: [] });
    },
    publierLArret(e) {
      journal.arrets.push(e);
      const nom = String((e.arret.leve as { nom?: string })?.nom ?? e.arret.nom ?? 'inattendu');
      return Promise.resolve({
        code: 13,
        nom,
        question: {
          arret: nom,
          fait: `le fait de ${nom}`,
          piece: 'la pièce',
          question: 'que faire ?',
          qui: 'superviseur',
        },
        etat: { ...e.etat, raison: nom },
        effets: [],
      });
    },
    finirLeTicket({ ticket }) {
      journal.fins.push(ticket);
      return Promise.resolve({ effets: [] });
    },
    arreterLeTicket() {
      return Promise.resolve({ effets: [] });
    },
    jouerUnEffet() {
      return Promise.resolve();
    },
    jouerUnPasDuPlan() {
      return Promise.reject(new Error('aucun plan dans la file'));
    },
  };
  const file: ActivitesDeLaFile = {
    situerLeLot({ ticket }) {
      return Promise.resolve({
        statut: fermes.has(ticket) ? 'closed' : 'open',
        raison: fermes.has(ticket) ? `intégré : ${surMain.get(ticket)}` : null,
      });
    },
    async preparerLaBranche({ ticket }) {
      journal.file.push(`preparerLaBranche ${ticket}`);
      await new Promise(r => setTimeout(r, 300));
      journal.file.push(`fin preparerLaBranche ${ticket}`);
      const deja = surMain.get(ticket);
      if (deja) {
        return { entre: { commit: deja }, effets: [] };
      }
      const n = (candidats.get(ticket) ?? 0) + 1;
      candidats.set(ticket, n);
      return { candidat: { commit: `c-${ticket}-${n}` }, effets: [] };
    },
    avancerMain({ ticket, commit }) {
      journal.file.push(`avancerMain ${ticket}`);
      surMain.set(ticket, commit);
      return Promise.resolve({ entre: { commit }, effets: [] });
    },
    fermerLEntree({ ticket }) {
      journal.file.push(`fermerLEntree ${ticket}`);
      fermes.add(ticket);
      return Promise.resolve({
        poussee: 'main',
        effets: [{ genre: 'commentaire', ticket, texte: `${ticket} fermé` }],
      });
    },
    lireLaCI({ ticket, sha, passage }) {
      journal.lectures.push({ ticket, sha, passage });
      const n = (lus.get(ticket) ?? 0) + 1;
      lus.set(ticket, n);
      const s = ci();
      return Promise.resolve(s[Math.min(n, s.length) - 1]!);
    },
    conclureLaCI(e) {
      journal.conclusions.push(e);
      const effets = [{ genre: 'commentaire', ticket: e.ticket, texte: `CI ${e.verdict}` }];
      if (e.verdict === 'rouge') {
        return Promise.resolve({
          issue: { etat: 'rouvert', raison: `CI rouge (passage ${e.passage})` },
          effets,
        });
      }
      if (e.verdict === 'non-lue') {
        return Promise.resolve({ issue: { etat: 'en-file', raison: `CI non lue` }, effets });
      }
      return Promise.resolve({ avancer: true, effets });
    },
    // Each effect an act gave back, its activity id and its key.
    async jouerUnEffetDeLaFile({ effet }) {
      const { Context } = await import('@temporalio/activity');
      const { info } = Context.current();
      const { cleDeLActivite } = await import('../../src/temporal/acte.js');
      journal.effets.push({ id: info.activityId, cle: cleDeLActivite(info), effet });
    },
  };
  const avec = Object.fromEntries(
    Object.entries(file).map(([k, f]) => {
      const autre = autres[k as keyof ActivitesDeLaFile] as
        ((e: unknown, s: unknown) => unknown) | undefined;
      return [k, autre ? (e: unknown) => autre(e, (f as (e: unknown) => unknown).bind(file)) : f];
    })
  ) as unknown as ActivitesDeLaFile;
  // What the stand-ins hold of <ticket> forgotten, as for a ticket reopened whose lot enters again.
  const oublier = (ticket: string) => {
    surMain.delete(ticket);
    fermes.delete(ticket);
    candidats.delete(ticket);
    lus.delete(ticket);
  };
  return { activites: { ...circuit, ...avec }, journal, lus, oublier };
}

// A server, a worker of this process on <activites>, a client; the worker can be cut and started
// again (`couper`, `lancer`).
async function serveur(activites: object) {
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('file'), 'temporal.db'),
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
      activities: activites,
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
  const c = ouvrirLeClient({ adresse: s.adresse });
  arrets.unshift(async () => {
    await c.fermer();
    await couper();
    await connexion.close();
  });
  const demarrer = (ticket: string) =>
    demarrerLeCircuit(c.client, { racine: RACINE, ticket, ci: CI }, FILE);
  return { client: c.client, couper, lancer, demarrer };
}

describe('une seule entrée sur main à la fois par projet', () => {
  it('two tickets at 5.2 at once: one queue for the project, their entries one after the other', async () => {
    const { activites, journal } = actes();
    const s = await serveur(activites);
    await Promise.all([s.demarrer('essai-1'), s.demarrer('essai-2')]);
    const vue = await attendre('la seconde entrée qui attend', async () => {
      const v = await lireLaFile(s.client, RACINE);
      return v.enCours && v.attente.length === 1 ? v : undefined;
    });
    expect([vue.enCours, ...vue.attente].sort()).toEqual(['essai-1', 'essai-2']);
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(await finDuCircuit(s.client, RACINE, 'essai-2')).toEqual({ code: 0, raison: 'integre' });
    // Each entry ends (its candidate, its CI, main, the closure) before the next one starts.
    const premier = journal.file[0]!.split(' ')[1]!;
    const second = premier === 'essai-1' ? 'essai-2' : 'essai-1';
    expect(journal.file).toEqual([
      `preparerLaBranche ${premier}`,
      `fin preparerLaBranche ${premier}`,
      `avancerMain ${premier}`,
      `fermerLEntree ${premier}`,
      `preparerLaBranche ${second}`,
      `fin preparerLaBranche ${second}`,
      `avancerMain ${second}`,
      `fermerLEntree ${second}`,
    ]);
    const d = await s.client.workflow.getHandle(idDeLaFile(RACINE)).describe();
    expect(d.status.name).toBe('RUNNING');
  }, 120_000);

  it('a second entry waits while the CI of the first is not concluded, and main waits for it', async () => {
    let lacher: () => void = () => {};
    const tenue = new Promise<void>(r => (lacher = r));
    let conclue = false;
    let tenues = 0;
    const { activites, journal } = actes(undefined, {
      // The CI of essai-1 runs until the test lets it end.
      lireLaCI: async (e, simule) => {
        if (e.ticket === 'essai-1') {
          await Promise.race([tenue, new Promise(r => setTimeout(r, 100))]);
          if (!conclue) {
            tenues += 1;
            return { etat: 'en-cours', passage: '41' };
          }
        }
        return simule(e);
      },
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await attendre('la CI de essai-1 en cours', () =>
      Promise.resolve(tenues >= 2 ? true : undefined)
    );
    await s.demarrer('essai-2');
    const vue = await attendre('essai-2 en attente', async () => {
      const v = await lireLaFile(s.client, RACINE);
      return v.attente.includes('essai-2') ? v : undefined;
    });
    expect(vue.enCours).toBe('essai-1');
    await new Promise(r => setTimeout(r, 1500));
    // Neither main moves onto essai-1 nor essai-2 is prepared while the CI of essai-1 runs.
    expect(journal.file.filter(l => l.endsWith('essai-2'))).toEqual([]);
    expect(journal.file).not.toContain('avancerMain essai-1');
    conclue = true;
    lacher();
    expect(await finDuCircuit(s.client, RACINE, 'essai-2')).toEqual({ code: 0, raison: 'integre' });
    const fin1 = journal.conclusions.findIndex(c => c.ticket === 'essai-1');
    expect(fin1).toBe(0);
    expect(journal.file.indexOf('preparerLaBranche essai-2')).toBeGreaterThan(
      journal.file.indexOf('fermerLEntree essai-1')
    );
  }, 120_000);

  it('the same ticket sent twice to the queue holds one entry', async () => {
    let lacher: () => void = () => {};
    const tenue = new Promise<void>(r => (lacher = r));
    const { activites, journal } = actes(undefined, {
      preparerLaBranche: async (e, simule) => {
        if (e.ticket === 'essai-1') {
          await tenue;
        }
        return simule(e);
      },
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await attendre('l’entrée en cours', async () => {
      const v = await lireLaFile(s.client, RACINE);
      return v.enCours === 'essai-1' ? v : undefined;
    });
    await s.demarrer('essai-1');
    expect((await lireLaFile(s.client, RACINE)).attente).toEqual([]);
    lacher();
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(journal.file.filter(l => l === 'preparerLaBranche essai-1')).toHaveLength(1);
  }, 120_000);
});

// grillhouse-4nr.8 (the closure along the model of grillhouse-4nr.6.1): each comment an act of the
// queue gives back is written in an activity of its own, whose id the workflow sets, its key its
// workflow, its run and that id.
describe('chaque commentaire de la file est une activité, sous une clé que fixe le déroulé', () => {
  it('the closure and the conclusion of the CI write each comment in its own activity', async () => {
    const { activites, journal } = actes();
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(journal.effets.map(e => e.id)).toEqual([
      'entree:1:1:conclure:effet:1:commentaire',
      'entree:1:fermer:effet:1:commentaire',
    ]);
    expect(journal.effets.map(e => e.effet)).toMatchObject([
      { texte: 'CI verte' },
      { texte: 'essai-1 fermé' },
    ]);
    expect(new Set(journal.effets.map(e => e.cle)).size).toBe(2);
  }, 120_000);

  // Suite de 554b508: two comments of one sort in one act are two activities, two keys.
  it('two comments of one sort in one act: two activities, two keys', async () => {
    const { activites, journal } = actes(undefined, {
      fermerLEntree: async (e, simule) => ({
        ...(await simule(e)),
        effets: [
          { genre: 'commentaire', ticket: e.ticket, texte: 'un' },
          { genre: 'commentaire', ticket: e.ticket, texte: 'deux' },
        ],
      }),
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    const fermeture = journal.effets.filter(e => e.id.startsWith('entree:1:fermer:'));
    expect(fermeture.map(e => e.id)).toEqual([
      'entree:1:fermer:effet:1:commentaire',
      'entree:1:fermer:effet:2:commentaire',
    ]);
    expect(new Set(fermeture.map(e => e.cle)).size).toBe(2);
  }, 120_000);

  // Suite de 554b508: the run is in the key. The same ticket enters again in another run of the
  // queue, its count of entries started over: the same activity id, another key.
  it('the same ticket entering in two runs of the queue: the same activity id, two keys', async () => {
    const { activites, journal, oublier } = actes();
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    await s.client.workflow.getHandle(idDeLaFile(RACINE)).terminate('un run neuf');
    oublier('essai-1');
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    const fermetures = journal.effets.filter(e => e.id === 'entree:1:fermer:effet:1:commentaire');
    expect(fermetures).toHaveLength(2);
    expect(fermetures[0]!.cle).not.toBe(fermetures[1]!.cle);
  }, 120_000);
});

describe('la mort du travailleur entre l’entrée et la fermeture finit le ticket', () => {
  it('the attempt played again after main moved closes the ticket, which never reopens', async () => {
    let morte = false;
    const { activites, journal } = actes(undefined, {
      // Main moves onto the candidate, then the worker dies before the attempt ends: the attempt
      // played again finds main on it (scripts/integration/file.mjs gives it as entered).
      avancerMain: async (e, simule) => {
        const r = await simule(e);
        if (!morte) {
          morte = true;
          throw ApplicationFailure.retryable('le travailleur meurt', 'Mort');
        }
        return r;
      },
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(morte).toBe(true);
    expect(journal.file.filter(l => l === 'fermerLEntree essai-1')).toHaveLength(1);
    expect(journal.conclusions.map(c => c.verdict)).toEqual(['verte']);
    expect(journal.arrets).toEqual([]);
  }, 120_000);
});

describe('la CI se suit par minuteurs durables', () => {
  it('each reading is one activity, a durable timer between two readings', async () => {
    const { activites, journal } = actes();
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(journal.lectures.map(l => l.passage)).toEqual([null, null, '41']);
    const enfants: string[] = [];
    for await (const w of s.client.workflow.list({ query: `WorkflowType = 'ciDuCommit'` })) {
      enfants.push(w.workflowId);
    }
    expect(enfants).toHaveLength(1);
    const h = s.client.workflow.getHandle(enfants[0]!);
    const evenements = (await h.fetchHistory()).events ?? [];
    const minuteurs = evenements.filter(e => e.timerStartedEventAttributes);
    expect(minuteurs).toHaveLength(2);
    expect(Number(minuteurs[0]!.timerStartedEventAttributes!.startToFireTimeout!.nanos)).toBe(
      200_000_000
    );
    expect(journal.conclusions).toMatchObject([
      { ticket: 'essai-1', verdict: 'verte', passage: '41' },
    ]);
  }, 120_000);

  it('the worker dies during the wait: the next one goes on with the same run', async () => {
    let n = 0;
    const longue: Scenario = [
      { etat: 'cherche' },
      ...Array<LectureDeLaCI>(8).fill({ etat: 'en-cours', passage: '41' }),
      { etat: 'finie', passage: '41', conclusion: 'success' },
    ];
    const { activites, journal } = actes(() => longue, {
      lireLaCI: (e, simule) => {
        n += 1;
        return simule(e);
      },
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await attendre('la CI en cours', () => Promise.resolve(n >= 3 ? true : undefined));
    await s.couper();
    await new Promise(r => setTimeout(r, 1000));
    await s.lancer();
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    // The search is not done again: one reading without a run, then the run followed to its end.
    expect(journal.lectures.filter(l => l.passage === null)).toHaveLength(2);
    expect(journal.lectures.at(-1)?.passage).toBe('41');
    expect(journal.conclusions).toMatchObject([{ verdict: 'verte' }]);
  }, 120_000);

  it('no run past the search, or a run not ended past the wait: the CI is not read, main unmoved', async () => {
    const sans = actes(() => [{ etat: 'cherche' }]);
    const s = await serveur(sans.activites);
    await s.demarrer('essai-1');
    await attendre('la conclusion', () =>
      Promise.resolve(sans.journal.conclusions.length ? true : undefined)
    );
    expect(sans.journal.conclusions).toMatchObject([{ verdict: 'non-lue' }]);
    expect(sans.journal.conclusions[0]?.raison).toMatch(/aucun passage/);
    expect(sans.journal.file).not.toContain('avancerMain essai-1');

    const longue = actes(() => [{ etat: 'en-cours', passage: '43' }]);
    const s2 = await serveur(longue.activites);
    await demarrerLeCircuit(
      s2.client,
      { racine: RACINE, ticket: 'essai-2', ci: { ...CI, attenteMs: 1_000 } },
      FILE
    );
    await attendre('la conclusion', () =>
      Promise.resolve(longue.journal.conclusions.length ? true : undefined)
    );
    expect(longue.journal.conclusions).toMatchObject([{ verdict: 'non-lue', passage: '43' }]);
    expect(longue.journal.file).not.toContain('avancerMain essai-2');
  }, 120_000);
});

describe('une CI rouge rouvre le ticket et pose la question', () => {
  it('the queue concludes red, main does not move, the ticket reopens, its question goes up and waits', async () => {
    const { activites, journal } = actes(() => ROUGE);
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    const v = await attendre('la question', async () => {
      const x = await lireLeCircuit(s.client, RACINE, 'essai-1');
      return x.attente ? x : undefined;
    });
    expect(v).toMatchObject({ etape: 'file', question: { arret: 'integration' } });
    expect(journal.conclusions).toMatchObject([
      { ticket: 'essai-1', verdict: 'rouge', passage: '42', sha: 'c-essai-1-1' },
    ]);
    // Main does not move onto a candidate its CI judged red.
    expect(journal.file).not.toContain('avancerMain essai-1');
    expect(journal.fins).toEqual([]);
    // The queue goes on: it does not wait for the ticket's answer.
    expect((await lireLaFile(s.client, RACINE)).enCours).toBeNull();
  }, 120_000);
});

describe('main bouge pendant la CI : la branche est rejouée et jugée de nouveau', () => {
  it('main moved after the green: the branch is replaced, its new candidate judged, then it enters', async () => {
    let bouges = 0;
    const { activites, journal } = actes(undefined, {
      avancerMain: (e, simule) =>
        ++bouges === 1 ? Promise.resolve({ bouge: true as const, effets: [] }) : simule(e),
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(journal.file.filter(l => l === 'preparerLaBranche essai-1')).toHaveLength(2);
    expect(journal.conclusions.map(c => c.sha)).toEqual(['c-essai-1-1', 'c-essai-1-2']);
    expect(new Set(journal.lectures.map(l => l.sha))).toEqual(
      new Set(['c-essai-1-1', 'c-essai-1-2'])
    );
  }, 120_000);
});

describe('--reprendre après un rejeu vert renvoie la branche, jugée au dernier essai', () => {
  it('the CI of the branch red, then green at its last attempt: --reprendre enters it', async () => {
    let ci: Scenario = ROUGE;
    const { activites, journal, lus } = actes(() => ci);
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await attendre('la question', async () => {
      const x = await lireLeCircuit(s.client, RACINE, 'essai-1');
      return x.attente ? x : undefined;
    });
    // The supervisor reran the failed jobs, green (`gh run rerun 42 --failed`).
    ci = [{ etat: 'finie', passage: '42', conclusion: 'success' }];
    lus.clear();
    await reprendreLeCircuit(s.client, RACINE, 'essai-1', null);
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(journal.conclusions).toMatchObject([
      { verdict: 'rouge', passage: '42' },
      { verdict: 'verte', passage: '42' },
    ]);
    expect(journal.file.filter(l => l === 'avancerMain essai-1')).toHaveLength(1);
    expect(journal.fins).toEqual(['essai-1']);
  }, 120_000);
});

describe('un acte de la file qui échoue', () => {
  it('fails at the entry of essai-1: its stop « inattendu » goes up, essai-2 behind it enters', async () => {
    const { activites, journal } = actes(undefined, {
      preparerLaBranche: (e, simule) =>
        e.ticket === 'essai-1'
          ? Promise.reject(ApplicationFailure.nonRetryable('bd show illisible', 'Inattendu'))
          : simule(e),
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await s.demarrer('essai-2');
    const v = await attendre('la question de essai-1', async () => {
      const x = await lireLeCircuit(s.client, RACINE, 'essai-1');
      return x.attente ? x : undefined;
    });
    expect(v).toMatchObject({ etape: 'file', question: { arret: 'inattendu' } });
    const arret = journal.arrets.find(a => a.ticket === 'essai-1')?.arret as
      { inattendu?: { message: string } } | undefined;
    expect(arret?.inattendu?.message).toContain('bd show illisible');
    expect(await finDuCircuit(s.client, RACINE, 'essai-2')).toEqual({ code: 0, raison: 'integre' });
    const d = await s.client.workflow.getHandle(idDeLaFile(RACINE)).describe();
    expect(d.status.name).toBe('RUNNING');
  }, 120_000);

  it('the closure fails once main moved: the stop says main holds the lot unpushed; --reprendre closes and pushes it', async () => {
    let fermetures = 0;
    const { activites, journal } = actes(undefined, {
      fermerLEntree: (e, simule) =>
        ++fermetures === 1
          ? Promise.reject(ApplicationFailure.nonRetryable('bd close plante', 'Inattendu'))
          : simule(e),
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await attendre('la question de essai-1', async () => {
      const x = await lireLeCircuit(s.client, RACINE, 'essai-1');
      return x.attente ? x : undefined;
    });
    const arret = journal.arrets.find(a => a.ticket === 'essai-1')?.arret as
      { inattendu?: { message: string } } | undefined;
    expect(arret?.inattendu?.message).toContain('bd close plante');
    expect(arret?.inattendu?.message).toContain('main local');
    expect(arret?.inattendu?.message).toContain('en c-essai');
    expect(arret?.inattendu?.message).toContain('non poussé');
    await reprendreLeCircuit(s.client, RACINE, 'essai-1', null);
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    // The lot goes through the queue again, which finds it on main, closes and pushes it, without
    // judging it twice.
    expect(fermetures).toBe(2);
    expect(journal.conclusions).toMatchObject([{ verdict: 'verte' }]);
  }, 120_000);

  it('the CI of the candidate fails to be read: concluded not read, main unmoved, the queue goes on', async () => {
    const { activites, journal } = actes(undefined, {
      lireLaCI: () => Promise.reject(ApplicationFailure.nonRetryable('gh plante', 'Inattendu')),
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await attendre('la conclusion', () =>
      Promise.resolve(journal.conclusions.length ? true : undefined)
    );
    expect(journal.conclusions[0]).toMatchObject({
      ticket: 'essai-1',
      sha: 'c-essai-1-1',
      verdict: 'non-lue',
    });
    expect(journal.conclusions[0]!.raison).toContain('gh plante');
    expect(journal.file).not.toContain('avancerMain essai-1');
    expect(journal.arrets).toEqual([]);
    await attendre('la file libre', async () =>
      (await lireLaFile(s.client, RACINE)).enCours === null ? true : undefined
    );
  }, 120_000);
});

// The class of the protobuf message of a history, which writes it as plain JSON and reads it
// back, its integers and its enums as text (as ./circuit.nuit.spec.ts records the circuit's).
type ClasseDHistoire = {
  toObject(h: unknown, o: object): unknown;
  fromObject(o: unknown): Parameters<typeof Worker.runReplayHistory>[1];
};
const HistoireDuProto = (h: object) => h.constructor as unknown as ClasseDHistoire;
const ENTIER = { longs: String, enums: String, bytes: String };

// The queue of circuit.mjs said a lot closed on main by the reason of its closure, then the queue's
// last word at the ticket: a push refused does not hide that the lot is on main.
describe('un lot fermé sur main que la file ne pousse pas', () => {
  it('the circuit says « intégré » first, then why the push is refused', async () => {
    const { activites } = actes(undefined, {
      fermerLEntree: async (e, simule) => ({
        ...(await simule(e)),
        poussee: null,
        raison: 'La poussée vers origin/main est refusée : fatal: aucun distant',
      }),
    });
    const lignes: { genre: string; etape?: string; texte?: string }[] = [];
    const s = await serveur({
      ...activites,
      appliquerLesEffets(e: { effets: typeof lignes }) {
        lignes.push(...e.effets);
        return Promise.resolve({ effets: [] });
      },
    });
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(lignes.filter(l => l.genre === 'commenter' && l.etape === 'file')).toEqual([
      {
        genre: 'commenter',
        etape: 'file',
        texte:
          'intégré : c-essai ; La poussée vers origin/main est refusée : fatal: aucun distant.',
      },
    ]);
  }, 120_000);
});

describe('les histoires de la file et de la CI se rejouent sur le code courant', () => {
  it('the history of the queue after an entry, and of the CI of its commit, replay', async () => {
    const { activites } = actes();
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await finDuCircuit(s.client, RACINE, 'essai-1');
    const enfants: string[] = [];
    for await (const w of s.client.workflow.list({ query: `WorkflowType = 'ciDuCommit'` })) {
      enfants.push(w.workflowId);
    }
    // Each history with the id of its workflow, from which the id of a child derives.
    const histoires = {
      'file-du-projet.json': [
        idDeLaFile(RACINE),
        await s.client.workflow.getHandle(idDeLaFile(RACINE)).fetchHistory(),
      ],
      'ci-du-commit.json': [
        enfants[0]!,
        await s.client.workflow.getHandle(enfants[0]!).fetchHistory(),
      ],
    } as const;
    const manquantes: string[] = [];
    for (const [nom, [id, histoire]] of Object.entries(histoires)) {
      const fichier = path.join(__dirname, 'histoires', nom);
      // Recorded when absent, and red: to record it anew, remove the file, play the test, then
      // commit the file it wrote.
      if (!existsSync(fichier)) {
        writeFileSync(
          fichier,
          `${JSON.stringify(HistoireDuProto(histoire).toObject(histoire, ENTIER), null, 1)}\n`
        );
        manquantes.push(fichier);
        continue;
      }
      await Worker.runReplayHistory({ workflowsPath: DEROULES }, histoire, id);
      const enregistree = HistoireDuProto(histoire).fromObject(
        JSON.parse(readFileSync(fichier, 'utf8'))
      );
      await Worker.runReplayHistory({ workflowsPath: DEROULES }, enregistree, id);
    }
    expect(manquantes, 'histoires enregistrées manquantes, écrites, à commiter').toEqual([]);
  }, 120_000);
});
