// grillhouse-4nr.2, criteria 5 and 13: the database file of reference, recorded by the pinned
// program and committed beside this test (base-de-reference/temporal.db, its recording
// ./enregistrer-la-base-de-reference.mjs), reads under the current server with its history. At
// the next raise of the pin, the file stays the one of the version before, and the same test
// measures the reading of a true former version (decision of the person in charge, 2026-11-03).
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ATTRIBUTS_DE_RECHERCHE,
  lireLeDeroule,
  ouvrirLeClient,
  type ClientOuvert,
} from '../../src/temporal/client.js';
import { demarrerLeServeur, dossier, portLibre, programmeTemporal } from './essai.js';

const REFERENCE = path.join(__dirname, 'base-de-reference/temporal.db');
const SIECLE = 100 * 365 * 86_400;

const ouverts: ClientOuvert[] = [];
afterEach(async () => {
  for (const c of ouverts.splice(0)) {
    await c.fermer();
  }
});

describe('the database file of reference (criteria 5 and 13)', () => {
  it('reads under the current server: the finished workflow, its result and its history', async () => {
    const base = path.join(dossier('reference'), 'temporal.db');
    copyFileSync(REFERENCE, base);
    const s = await demarrerLeServeur(
      programmeTemporal(),
      base,
      await portLibre(),
      ATTRIBUTS_DE_RECHERCHE
    );
    try {
      const c = ouvrirLeClient({ adresse: s.adresse });
      ouverts.push(c);
      // The namespace keeps a closed workflow for a century: the 24 h of start-dev purged the
      // file's workflow one day after its recording (2026-11-04).
      const n = await c.client.connection.workflowService.describeNamespace({
        namespace: 'default',
      });
      expect(
        Number(n.config?.workflowExecutionRetentionTtl?.seconds),
        'rétention de l’espace default, en secondes'
      ).toBeGreaterThanOrEqual(SIECLE);
      const h = c.client.workflow.getHandle('sonde-reference');
      expect(await h.result()).toMatchObject({ ticket: 'reference', activite: { fait: 2 } });
      const types = (await h.fetchHistory()).events?.map(e => e.eventType) ?? [];
      expect(types[0]).toBe(1); // WORKFLOW_EXECUTION_STARTED
      expect(types).toContain(12); // ACTIVITY_TASK_COMPLETED
      expect(types).toContain(26); // WORKFLOW_EXECUTION_SIGNALED
      expect(types.at(-1)).toBe(2); // WORKFLOW_EXECUTION_COMPLETED
      const l = await lireLeDeroule(c.client, 'sonde-reference');
      expect(l.memo, 'lecture du mémo').toEqual({ ticket: 'reference' });
      expect(l.etape, 'lecture de l’attribut de recherche GrillhouseEtape').toBe('fini');
    } finally {
      await s.tuer();
    }
  }, 120_000);
});
