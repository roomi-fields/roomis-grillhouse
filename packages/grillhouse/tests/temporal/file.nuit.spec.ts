// @poste: un serveur Temporal
// grillhouse-4nr.8, grillhouse-3uv.121: the queue of integration of a project under Temporal, played
// on a development server of trial (the pinned program TEMPORAL on a free port, a database file of
// its own), its activities simulated by the test (a worker of this process).
// The queue of a project (`fileDuProjet`, `file:<racine>`) takes one entry at a time, which the
// workflow of a ticket sends at its step 5.2 and whose issue it awaits: the branch made the
// candidate, kept local, the final pass played on it (`jugerLeCandidat`) before main moves onto it;
// main moved meanwhile, the branch is replaced and judged again. One entry on main at a time; the
// death of the worker between the entry and the closure ends the ticket without reopening it; a
// red final pass reopens the ticket, main unmoved, and its question goes up; `--reprendre` after a
// green pass sends the branch again. The CI of main is read at the queue's start and after each
// entry, never waited for. The CI of the branch is read no more.
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
import { idDeLaFile, type ActivitesDeLaFile } from '../../src/temporal/file/contrat.js';
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

// The final pass of a candidate as a scenario names it: each verdict in its order of call, the last
// one repeated.
type Verdict = 'verte' | 'rouge';

// The acts a test simulates, and what they were asked: the circuit's at its step 5.2 (the ticket
// opens on it, its tri read true), and the queue's; each act of <autres> stands in for the
// simulated one, called with it.
function actes(
  passes: () => Verdict[] = () => ['verte'],
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
    passes: [] as { ticket: string; commit: string }[],
    surveillances: 0,
    arrets: [] as Parameters<Activites['publierLArret']>[0][],
    fins: [] as string[],
    effets: [] as { id: string; cle: string | null; effet: { genre: string } }[],
  };
  const surMain = new Map<string, string>();
  const fermes = new Set<string>();
  const candidats = new Map<string, number>();
  const jugees = new Map<string, number>();
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
    jugerLeCandidat({ ticket, commit }) {
      journal.file.push(`jugerLeCandidat ${ticket}`);
      journal.passes.push({ ticket, commit });
      const n = (jugees.get(ticket) ?? 0) + 1;
      jugees.set(ticket, n);
      const v = passes();
      if (v[Math.min(n, v.length) - 1] === 'rouge') {
        return Promise.resolve({
          issue: { etat: 'rouvert' as const, raison: `passe finale rouge sur ${commit}` },
          effets: [],
        });
      }
      return Promise.resolve({ juge: true as const, effets: [] });
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
    surveillerLaCiDeMain() {
      journal.surveillances += 1;
      return Promise.resolve({ etat: 'verte' as const });
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
    jugees.delete(ticket);
  };
  return { activites: { ...circuit, ...avec }, journal, jugees, oublier };
}

// A server, a worker of this process on <activites>, a client.
async function serveur(activites: object) {
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('file'), 'temporal.db'),
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const connexion = await NativeConnection.connect({ address: s.adresse });
  const travailleur = await Worker.create({
    connection: connexion,
    taskQueue: FILE,
    workflowsPath: DEROULES,
    activities: { ...PAUSE_D_ESSAI, ...activites },
    maxHeartbeatThrottleInterval: '1 second',
    defaultHeartbeatThrottleInterval: '1 second',
  });
  const fin = travailleur.run();
  const c = ouvrirLeClient({ adresse: s.adresse });
  arrets.unshift(async () => {
    await c.fermer();
    travailleur.shutdown();
    await fin;
    await connexion.close();
  });
  const demarrer = (ticket: string) =>
    demarrerLeCircuit(c.client, { racine: RACINE, ticket, ci: CI }, FILE);
  return { client: c.client, demarrer };
}

const ENTREE = (t: string) => [
  `preparerLaBranche ${t}`,
  `fin preparerLaBranche ${t}`,
  `jugerLeCandidat ${t}`,
  `avancerMain ${t}`,
  `fermerLEntree ${t}`,
];

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
    // Each entry ends (its candidate, its final pass, main, the closure) before the next starts,
    // and nothing else: no push of the branch, no reading of a CI.
    const premier = journal.file[0]!.split(' ')[1]!;
    const second = premier === 'essai-1' ? 'essai-2' : 'essai-1';
    expect(journal.file).toEqual([...ENTREE(premier), ...ENTREE(second)]);
    const d = await s.client.workflow.getHandle(idDeLaFile(RACINE)).describe();
    expect(d.status.name).toBe('RUNNING');
  }, 120_000);

  it('a second entry waits while the final pass of the first runs, and main waits for it', async () => {
    let lacher: () => void = () => {};
    const tenue = new Promise<void>(r => (lacher = r));
    let commencee = false;
    const { activites, journal } = actes(undefined, {
      jugerLeCandidat: async (e, simule) => {
        if (e.ticket === 'essai-1') {
          commencee = true;
          await tenue;
        }
        return simule(e);
      },
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await attendre('la passe finale de essai-1 en cours', () =>
      Promise.resolve(commencee ? true : undefined)
    );
    await s.demarrer('essai-2');
    const vue = await attendre('essai-2 en attente', async () => {
      const v = await lireLaFile(s.client, RACINE);
      return v.attente.includes('essai-2') ? v : undefined;
    });
    expect(vue.enCours).toBe('essai-1');
    await new Promise(r => setTimeout(r, 1000));
    expect(journal.file.filter(l => l.endsWith('essai-2'))).toEqual([]);
    expect(journal.file).not.toContain('avancerMain essai-1');
    lacher();
    expect(await finDuCircuit(s.client, RACINE, 'essai-2')).toEqual({ code: 0, raison: 'integre' });
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

describe('chaque commentaire de la file est une activité, sous une clé que fixe le déroulé', () => {
  it('the closure writes its comment in its own activity', async () => {
    const { activites, journal } = actes();
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(journal.effets.map(e => e.id)).toEqual(['entree:1:fermer:effet:1:commentaire']);
    expect(journal.effets.map(e => e.effet)).toMatchObject([{ texte: 'essai-1 fermé' }]);
  }, 120_000);

  it('two comments of one sort in one act are two activities, two keys', async () => {
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
  it('the attempt played again after main moved closes the ticket, judged once, which never reopens', async () => {
    let morte = false;
    const { activites, journal } = actes(undefined, {
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
    expect(journal.passes).toHaveLength(1);
    expect(journal.arrets).toEqual([]);
  }, 120_000);
});

describe('une passe finale rouge rouvre le ticket et pose la question', () => {
  it('main does not move, the ticket reopens, its question goes up and the queue goes on', async () => {
    const { activites, journal } = actes(() => ['rouge']);
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    const v = await attendre('la question', async () => {
      const x = await lireLeCircuit(s.client, RACINE, 'essai-1');
      return x.attente ? x : undefined;
    });
    expect(v).toMatchObject({ etape: 'file', question: { arret: 'integration' } });
    expect(journal.passes).toEqual([{ ticket: 'essai-1', commit: 'c-essai-1-1' }]);
    expect(journal.file).not.toContain('avancerMain essai-1');
    expect(journal.fins).toEqual([]);
    expect((await lireLaFile(s.client, RACINE)).enCours).toBeNull();
  }, 120_000);

  it('--reprendre after a red pass plays the pass again, green: the lot enters', async () => {
    const { activites, journal } = actes(() => ['rouge', 'verte']);
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await attendre('la question', async () => {
      const x = await lireLeCircuit(s.client, RACINE, 'essai-1');
      return x.attente ? x : undefined;
    });
    await reprendreLeCircuit(s.client, RACINE, 'essai-1', null);
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(journal.passes).toHaveLength(2);
    expect(journal.file.filter(l => l === 'avancerMain essai-1')).toHaveLength(1);
    expect(journal.fins).toEqual(['essai-1']);
  }, 120_000);
});

describe('main bouge pendant la passe finale : la branche est rejouée et jugée de nouveau', () => {
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
    expect(journal.passes.map(p => p.commit)).toEqual(['c-essai-1-1', 'c-essai-1-2']);
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

  it('the final pass fails: main unmoved, the stop « inattendu » goes up, the queue goes on', async () => {
    const { activites, journal } = actes(undefined, {
      jugerLeCandidat: () =>
        Promise.reject(ApplicationFailure.nonRetryable('verifier plante', 'Inattendu')),
    });
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    const v = await attendre('la question', async () => {
      const x = await lireLeCircuit(s.client, RACINE, 'essai-1');
      return x.attente ? x : undefined;
    });
    expect(v).toMatchObject({ question: { arret: 'inattendu' } });
    expect(journal.file).not.toContain('avancerMain essai-1');
    await attendre('la file libre', async () =>
      (await lireLaFile(s.client, RACINE)).enCours === null ? true : undefined
    );
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
    expect(arret?.inattendu?.message).toContain('non poussé');
    await reprendreLeCircuit(s.client, RACINE, 'essai-1', null);
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    // The lot goes through the queue again, which finds it on main, closes and pushes it, without
    // judging it twice.
    expect(fermetures).toBe(2);
    expect(journal.passes).toHaveLength(1);
  }, 120_000);
});

describe('la CI de main se lit sans retenir la file', () => {
  it('is read at the start and after each entry, and a failing reading does not stop the entries', async () => {
    const { activites, journal } = actes(undefined, {
      surveillerLaCiDeMain: () =>
        Promise.reject(ApplicationFailure.nonRetryable('gh plante', 'Inattendu')),
    });
    const s = await serveur(activites);
    await Promise.all([s.demarrer('essai-1'), s.demarrer('essai-2')]);
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    expect(await finDuCircuit(s.client, RACINE, 'essai-2')).toEqual({ code: 0, raison: 'integre' });
    expect(journal.arrets).toEqual([]);
  }, 120_000);

  it('a reading is made at the start of the queue and after each entry', async () => {
    const { activites, journal } = actes();
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    expect(await finDuCircuit(s.client, RACINE, 'essai-1')).toEqual({ code: 0, raison: 'integre' });
    await attendre('les lectures de la CI de main', () =>
      Promise.resolve(journal.surveillances >= 2 ? true : undefined)
    );
  }, 120_000);
});

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

describe('l’histoire de la file se rejoue sur le code courant', () => {
  it('the history of the queue after an entry replays', async () => {
    const { activites } = actes();
    const s = await serveur(activites);
    await s.demarrer('essai-1');
    await finDuCircuit(s.client, RACINE, 'essai-1');
    const histoire = await s.client.workflow.getHandle(idDeLaFile(RACINE)).fetchHistory();
    await Worker.runReplayHistory({ workflowsPath: DEROULES }, histoire, idDeLaFile(RACINE));
  }, 120_000);
});
