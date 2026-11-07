// The budget of the reading of the circuits of a repository on the Temporal server
// (grillhouse-4nr.10, criterion 3, decision Q2): the board, the opening of a session of supervision
// and each step of the wait read them in one call (`lireLesCircuits`, a list of the workflows and
// their memo, no worker living); with forty circuits on the server, as many as several projects
// keep at once, the median of twenty such calls stays under the 50 ms of the criterion (21 ms
// measured at rest on 2026-11-06). A bench of time: the night plays it, at rest.
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lireLesCircuits } from '../../src/temporal/circuit/client.js';
import { idDuCircuit } from '../../src/temporal/circuit/contrat.js';
import { ATTRIBUTS_DE_RECHERCHE, ouvrirLeClient } from '../../src/temporal/client.js';
import { attendre, demarrerLeServeur, dossier, portLibre, programmeTemporal } from './essai.js';

const RACINE = '/depot/budget';
const NOMBRE = 40;
const BUDGET = 50;

const arrets: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const a of arrets) {
    await a();
  }
});

describe('la lecture des circuits tient son budget', () => {
  it(`forty circuits on the server, read in one call within ${BUDGET} ms`, async () => {
    const s = await demarrerLeServeur(
      programmeTemporal(),
      path.join(dossier('budget-lecture'), 'temporal.db'),
      await portLibre(),
      ATTRIBUTS_DE_RECHERCHE
    );
    arrets.push(() => s.tuer());
    const c = ouvrirLeClient({ adresse: s.adresse });
    arrets.unshift(() => c.fermer());
    // The workflows of the circuits, started on a queue no worker serves: each holds the memo a
    // circuit stopped on its question publishes.
    for (let i = 1; i <= NOMBRE; i++) {
      await c.client.workflow.start('circuitDuTicket', {
        taskQueue: 'sans-travailleur',
        workflowId: idDuCircuit(RACINE, `budget-${i}`),
        args: [{ racine: RACINE, ticket: `budget-${i}` }],
        memo: {
          ticket: `budget-${i}`,
          etape: 'controles',
          numero: 1,
          question: { arret: 'controles', question: 'que faire ?', qui: 'superviseur' },
          etat: {
            etape: 'controles',
            tentative: 1,
            finale: false,
            code: 14,
            raison: 'controles',
            rapport: 'rouge',
            questionnement: null,
            boucles: {},
            mene: null,
          },
        },
      });
    }
    await attendre('les circuits visibles', async () =>
      (await lireLesCircuits(c.client, RACINE)).length === NOMBRE ? true : undefined
    );
    // The median of twenty readings, the connection opened by the first.
    const durees: number[] = [];
    for (let i = 0; i < 20; i++) {
      const debut = performance.now();
      expect(await lireLesCircuits(c.client, RACINE)).toHaveLength(NOMBRE);
      durees.push(performance.now() - debut);
    }
    const mediane = durees.sort((a, b) => a - b)[10]!;
    expect(
      mediane,
      `médiane ${mediane.toFixed(1)} ms, de ${durees[0]!.toFixed(1)} à ${durees[19]!.toFixed(1)} ms`
    ).toBeLessThan(BUDGET);
  }, 120_000);
});
