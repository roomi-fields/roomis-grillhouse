// @poste: un serveur Temporal
// grillhouse-4nr.2, criteria 2, 3, 4, 6 and 11: the sonde's workflow and activity played on a
// development server of trial, the pinned program (TEMPORAL) started on a free port with a
// database file of its own, the sonde's worker started by its built code as its own process, as
// the units of the account start it. The server killed with SIGKILL keeps the workflow and its
// history; the activity started again after its worker's death resumes from its last sign of
// life; the memo, the search attributes and the list of the workflows read without a living
// worker, each read named when it fails.
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ATTRIBUTS_DE_RECHERCHE,
  lireLeDeroule,
  ouvrirLeClient,
  type ClientOuvert,
} from '../../src/temporal/client.js';
import { FINIR, SONDE, type ResultatDeLaSonde } from '../../src/temporal/sonde/contrat.js';
import {
  attendre,
  demarrerLeServeur,
  demarrerLeTravailleur,
  dossier,
  portLibre,
  programmeTemporal,
} from './essai.js';

const ouverts: ClientOuvert[] = [];
afterEach(async () => {
  for (const c of ouverts.splice(0)) {
    await c.fermer();
  }
});

function client(adresse: string): ClientOuvert {
  const c = ouvrirLeClient({ adresse });
  ouverts.push(c);
  return c;
}

// A server of trial with a database file of its own, in a new trial folder.
async function serveur(base = path.join(dossier('serveur'), 'temporal.db'), port?: number) {
  const p = port ?? (await portLibre());
  return demarrerLeServeur(programmeTemporal(), base, p, ATTRIBUTS_DE_RECHERCHE);
}

// The step of the workflow <id>, read from its search attribute, once it is <etape>.
const etapeVaut = (c: ClientOuvert, id: string, etape: string) =>
  attendre(`l'étape ${etape} de ${id}`, async () => {
    const l = await lireLeDeroule(c.client, id);
    return l.etape === etape ? l : undefined;
  });

describe('the sonde on a development server of trial (criterion 6)', () => {
  it('plays a workflow to its end: its activity runs its process, the result names it', async () => {
    const s = await serveur();
    const t = await demarrerLeTravailleur(s.adresse, 'essai-fin');
    try {
      const c = client(s.adresse);
      const h = await c.client.workflow.start(SONDE, {
        workflowId: 'sonde-fin',
        taskQueue: 'essai-fin',
        args: [{ ticket: 'essai-0', etapes: 2, pauseMs: 50, attendreLeSignal: false }],
      });
      const r = (await h.result()) as ResultatDeLaSonde;
      expect(r.ticket).toBe('essai-0');
      expect(r.activite.fait).toBe(2);
      expect(r.activite.pid).toBeGreaterThan(0);
    } finally {
      await t.tuer();
      await s.tuer();
    }
  }, 120_000);
});

describe('the workflow survives its server killed with SIGKILL (criterion 2)', () => {
  it('goes on after the server restarts on the same database file, its history kept', async () => {
    const base = path.join(dossier('serveur'), 'temporal.db');
    const port = await portLibre();
    const s1 = await serveur(base, port);
    const t1 = await demarrerLeTravailleur(s1.adresse, 'essai-kill');
    const c1 = client(s1.adresse);
    await c1.client.workflow.start(SONDE, {
      workflowId: 'sonde-kill',
      taskQueue: 'essai-kill',
      args: [{ ticket: 'essai-2', etapes: 1, pauseMs: 50, attendreLeSignal: true }],
      memo: { ticket: 'essai-2' },
    });
    await etapeVaut(c1, 'sonde-kill', 'attente');
    await s1.tuer();
    await t1.tuer();

    const s2 = await serveur(base, port);
    const t2 = await demarrerLeTravailleur(s2.adresse, 'essai-kill');
    try {
      const c2 = client(s2.adresse);
      const h = c2.client.workflow.getHandle('sonde-kill');
      await h.signal(FINIR);
      const r = (await h.result()) as ResultatDeLaSonde;
      expect(r.ticket).toBe('essai-2');
      const types = (await h.fetchHistory()).events?.map(e => e.eventType) ?? [];
      // The events before the kill (the start, the activity done) and after it (the signal).
      expect(types[0]).toBe(1); // WORKFLOW_EXECUTION_STARTED
      expect(types).toContain(12); // ACTIVITY_TASK_COMPLETED
      expect(types).toContain(26); // WORKFLOW_EXECUTION_SIGNALED
      expect(types.at(-1)).toBe(2); // WORKFLOW_EXECUTION_COMPLETED
    } finally {
      await t2.tuer();
      await s2.tuer();
    }
  }, 180_000);
});

describe('the activity sends its signs of life and resumes after its worker died (criterion 3)', () => {
  it('a second attempt starts from the last sign of life the server kept', async () => {
    const s = await serveur();
    const t1 = await demarrerLeTravailleur(s.adresse, 'essai-vie');
    let t2: Awaited<ReturnType<typeof demarrerLeTravailleur>> | undefined;
    try {
      const c = client(s.adresse);
      const h = await c.client.workflow.start(SONDE, {
        workflowId: 'sonde-vie',
        taskQueue: 'essai-vie',
        args: [{ ticket: 'essai-3', etapes: 40, pauseMs: 250, attendreLeSignal: false }],
      });
      // The server holds a sign of life of the running activity: what its process has done.
      const fait = await attendre('un signe de vie de l’activité', async () => {
        const d = await lireLeDeroule(c.client, 'sonde-vie');
        return (d.signeDeVie?.fait ?? 0) >= 2 ? d.signeDeVie!.fait : undefined;
      });
      await t1.tuer();
      t2 = await demarrerLeTravailleur(s.adresse, 'essai-vie');
      const r = (await h.result()) as ResultatDeLaSonde;
      expect(r.activite.tentative).toBeGreaterThanOrEqual(2);
      expect(r.activite.depuis).toBeGreaterThanOrEqual(fait);
      expect(r.activite.fait).toBe(40);
    } finally {
      await t2?.tuer();
      await t1.tuer();
      await s.tuer();
    }
  }, 180_000);
});

describe('the reads without a living worker (criteria 4 and 11)', () => {
  it('the memo, the search attributes and the list of the workflows answer, each read named', async () => {
    const s = await serveur();
    const t = await demarrerLeTravailleur(s.adresse, 'essai-lecture');
    try {
      const c = client(s.adresse);
      await c.client.workflow.start(SONDE, {
        workflowId: 'sonde-lecture',
        taskQueue: 'essai-lecture',
        args: [{ ticket: 'essai-1', etapes: 1, pauseMs: 50, attendreLeSignal: true }],
        memo: { ticket: 'essai-1' },
      });
      await etapeVaut(c, 'sonde-lecture', 'attente');
      await t.tuer();

      const l = await lireLeDeroule(c.client, 'sonde-lecture');
      expect(l.memo, 'lecture du mémo').toEqual({ ticket: 'essai-1' });
      expect(l.ticket, 'lecture de l’attribut de recherche GrillhouseTicket').toBe('essai-1');
      expect(l.etape, 'lecture de l’attribut de recherche GrillhouseEtape').toBe('attente');
      const liste = await attendre('workflow list', async () => {
        const ids: string[] = [];
        for await (const w of c.client.workflow.list({ query: "GrillhouseEtape = 'attente'" })) {
          ids.push(w.workflowId);
        }
        return ids.includes('sonde-lecture') ? ids : undefined;
      }).catch(() => [] as string[]);
      expect(liste, 'lecture de workflow list par l’attribut GrillhouseEtape').toContain(
        'sonde-lecture'
      );
    } finally {
      await t.tuer();
      await s.tuer();
    }
  }, 120_000);
});
