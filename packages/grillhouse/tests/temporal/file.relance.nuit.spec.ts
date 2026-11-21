// @poste: un serveur Temporal
// The relaunch of the queue of a project (src/temporal/file/deroule.ts), played on a development
// server of trial (the pinned program TEMPORAL on a free port, a database file of its own), its
// activities simulated by the test (a worker of this process). The signal RELANCER makes the queue
// continue as new between two entries: at rest, at once; busy, after the entry under way, whose
// issue the circuit receives, carrying those that wait, none of which the run that got the signal
// judges. The view of the queue says `surLaPasseFinale: true`.
import path from 'node:path';
import { NativeConnection, Worker } from '@temporalio/worker';
import { afterEach, describe, expect, it } from 'vitest';
import { ATTRIBUTS_DE_RECHERCHE, ouvrirLeClient } from '../../src/temporal/client.js';
import { demarrerLeCircuit, finDuCircuit } from '../../src/temporal/circuit/client.js';
import type { Activites, EtatDeLEtape } from '../../src/temporal/circuit/contrat.js';
import { lireLaFile } from '../../src/temporal/file/client.js';
import { idDeLaFile, RELANCER, type ActivitesDeLaFile } from '../../src/temporal/file/contrat.js';
import {
  PAUSE_D_ESSAI,
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
const CI = { rechercheMs: 2_000, attenteMs: 20_000, pasMs: 200 };
const EN_FILE: EtatDeLEtape = { etape: 'file', tentative: 1, rapport: null, finale: false };

const arrets: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const a of arrets.splice(0)) {
    await a();
  }
});

// The acts of the circuit of a ticket at its step 5.2, and those of the queue; <retenir> holds an
// act of the queue of a ticket until it is let go.
function actes(retenir: (ticket: string) => Promise<void> = () => Promise.resolve()) {
  const journal = {
    file: [] as string[],
    runs: new Map<string, string>(),
    passes: [] as string[],
  };
  const surMain = new Map<string, string>();
  const circuit: Activites = {
    ouvrirLeCircuit(o) {
      return Promise.resolve({
        ouverture: {
          debut: EN_FILE,
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
    publierLArret() {
      return Promise.reject(new Error('aucun arrêt attendu'));
    },
    finirLeTicket() {
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
    situerLeLot() {
      return Promise.resolve({ statut: 'open', raison: null });
    },
    async preparerLaBranche({ ticket }) {
      const { Context } = await import('@temporalio/activity');
      journal.runs.set(ticket, Context.current().info.workflowExecution?.runId ?? '');
      journal.file.push(`preparerLaBranche ${ticket}`);
      await retenir(ticket);
      return { candidat: { commit: `c-${ticket}` }, effets: [] };
    },
    jugerLeCandidat({ ticket }) {
      journal.file.push(`jugerLeCandidat ${ticket}`);
      journal.passes.push(ticket);
      return Promise.resolve({ juge: true as const, effets: [] });
    },
    avancerMain({ ticket, commit }) {
      journal.file.push(`avancerMain ${ticket}`);
      surMain.set(ticket, commit);
      return Promise.resolve({ entre: { commit }, effets: [] });
    },
    fermerLEntree({ ticket }) {
      journal.file.push(`fermerLEntree ${ticket}`);
      return Promise.resolve({ poussee: 'main', effets: [] });
    },
    surveillerLaCiDeMain() {
      return Promise.resolve({ etat: 'verte' as const });
    },
    jouerUnEffetDeLaFile() {
      return Promise.resolve();
    },
  };
  return { activites: { ...circuit, ...file }, journal };
}

// A server and a client; <travailleur> starts a worker of this process on <activites>, from the
// workflows <chemin>, and gives back what stops it.
async function serveur() {
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('file'), 'temporal.db'),
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const connexion = await NativeConnection.connect({ address: s.adresse });
  const c = ouvrirLeClient({ adresse: s.adresse });
  arrets.unshift(async () => {
    await c.fermer();
    await connexion.close();
  });
  const travailleur = async (chemin: string, activites: object) => {
    const w = await Worker.create({
      connection: connexion,
      taskQueue: FILE,
      workflowsPath: chemin,
      activities: { ...PAUSE_D_ESSAI, ...activites },
      maxHeartbeatThrottleInterval: '1 second',
      defaultHeartbeatThrottleInterval: '1 second',
    });
    const fin = w.run();
    let arrete = false;
    const arreter = async () => {
      if (!arrete) {
        arrete = true;
        w.shutdown();
        await fin;
      }
    };
    arrets.unshift(arreter);
    return arreter;
  };
  const demarrer = (ticket: string) =>
    demarrerLeCircuit(c.client, { racine: RACINE, ticket, ci: CI }, FILE);
  const runDeLaFile = async () =>
    (await c.client.workflow.getHandle(idDeLaFile(RACINE)).describe()).runId;
  const signaler = () => c.client.workflow.getHandle(idDeLaFile(RACINE)).signal(RELANCER);
  return { client: c.client, travailleur, demarrer, runDeLaFile, signaler };
}

describe('la relance de la file', () => {
  it('an idle queue signalled restarts as a new run at once, and its view says it is on the final pass', async () => {
    const { activites } = actes();
    const s = await serveur();
    await s.travailleur(DEROULES, activites);
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    const avant = await s.runDeLaFile();
    await s.signaler();
    const apres = await attendre('un run neuf de la file', async () => {
      const r = await s.runDeLaFile();
      return r !== avant ? r : undefined;
    });
    expect(apres).not.toBe(avant);
    const vue = await lireLaFile(s.client, RACINE);
    expect(vue).toMatchObject({ enCours: null, attente: [], surLaPasseFinale: true });
  }, 120_000);

  it('a busy queue signalled ends its entry under way, tells its circuit the issue, then restarts with those that wait, judging none before', async () => {
    let lacher: () => void = () => {};
    const tenue = new Promise<void>(r => (lacher = r));
    const { activites, journal } = actes(async ticket => {
      if (ticket === 'essai-1') {
        await tenue;
      }
    });
    const s = await serveur();
    await s.travailleur(DEROULES, activites);
    await s.demarrer('essai-1');
    await attendre('essai-1 en cours', async () => {
      const v = await lireLaFile(s.client, RACINE);
      return v.enCours === 'essai-1' ? v : undefined;
    });
    await s.demarrer('essai-2');
    await attendre('essai-2 en attente', async () => {
      const v = await lireLaFile(s.client, RACINE);
      return v.attente.includes('essai-2') ? v : undefined;
    });
    const avant = await s.runDeLaFile();
    await s.signaler();
    // The signal posed, the entry that waits does not start in the run that got it.
    await new Promise(r => setTimeout(r, 1000));
    expect(journal.file.filter(l => l.endsWith('essai-2'))).toEqual([]);
    lacher();
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(await finDuCircuit(s.client, RACINE, 'essai-2')).toEqual({ code: 0, raison: 'integre' });
    expect(journal.runs.get('essai-1')).toBe(avant);
    expect(journal.runs.get('essai-2')).not.toBe(avant);
    expect(journal.file.indexOf('preparerLaBranche essai-2')).toBeGreaterThan(
      journal.file.indexOf('fermerLEntree essai-1')
    );
  }, 120_000);
});
