// The start of the workflow of the machine (src/temporal/places/client.ts, `demarrerLesPlaces`):
// the server writes the history of a start before it finds that the workflow runs, and that history
// stays orphan in its database. So a start is asked only when no workflow of the machine runs. The
// client is a double that keeps what is asked of it: a test small, without a server.
import { WorkflowNotFoundError, type Client } from '@temporalio/client';
import { describe, expect, it } from 'vitest';
import { demarrerLesPlaces } from '../../src/temporal/places/client.js';
import { ID_DES_PLACES } from '../../src/temporal/places/contrat.js';

// A client whose server describes the workflow of the machine as `etat`: a status, no workflow of
// that id, or a failure of the call. `departs` keeps the starts asked.
function client(etat: string | Error) {
  const departs: { workflowId: string; workflowIdConflictPolicy?: string }[] = [];
  const double = {
    workflow: {
      getHandle: (id: string) => ({
        describe: () =>
          etat instanceof Error
            ? Promise.reject(etat)
            : Promise.resolve({ workflowId: id, status: { name: etat } }),
      }),
      start: (_type: string, o: (typeof departs)[number]) => {
        departs.push(o);
        return Promise.resolve();
      },
    },
  };
  return { client: double as unknown as Client, departs };
}
const demarrer = (c: Client) => demarrerLesPlaces(c, { espacementMs: 0, veilleMs: 1_000 });
// The start asked once, which leaves a workflow another caller has started meanwhile.
const UN_DEPART = [
  expect.objectContaining({
    workflowId: ID_DES_PLACES,
    workflowIdConflictPolicy: 'USE_EXISTING',
  }),
];

describe('the start of the workflow of the machine', () => {
  it('asks no start while the workflow runs', async () => {
    const { client: c, departs } = client('RUNNING');
    await demarrer(c);
    expect(departs).toEqual([]);
  });

  it('starts the workflow when the server has none of its id', async () => {
    const { client: c, departs } = client(
      new WorkflowNotFoundError('not found', ID_DES_PLACES, undefined)
    );
    await demarrer(c);
    expect(departs).toEqual(UN_DEPART);
  });

  it('starts the workflow again once its run is closed', async () => {
    const { client: c, departs } = client('TERMINATED');
    await demarrer(c);
    expect(departs).toEqual(UN_DEPART);
  });

  it('throws a failure of the reading, without a start', async () => {
    const panne = new Error('14 UNAVAILABLE');
    const { client: c, departs } = client(panne);
    await expect(demarrer(c)).rejects.toBe(panne);
    expect(departs).toEqual([]);
  });
});
