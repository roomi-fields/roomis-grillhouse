// The lists of the frame read the server by pages of PAGE workflows, and halve the page when the
// client refuses one as too large: a page of the server's default size (1000), each circuit with
// its memo, passed the 4 MB a gRPC message of the client takes (pc3, 2026-11-18), and so did a page
// of 100 three days later, on which the queues of the tickets of two projects failed.
import type { Client } from '@temporalio/client';
import { describe, expect, it } from 'vitest';
import { lireLesCircuits, listerLesDeroules, PAGE } from '../../src/temporal/circuit/client.js';

// A client whose list gives <deroules>, and refuses a page larger than <max> as gRPC does.
function clientBorne(deroules: { workflowId: string }[], max: number) {
  const tailles: number[] = [];
  const client = {
    workflow: {
      list: ({ pageSize }: { pageSize: number }) => {
        tailles.push(pageSize);
        return (async function* () {
          await Promise.resolve();
          if (pageSize > max) {
            yield deroules[0];
            throw Object.assign(new Error('Failed to list workflows'), {
              cause: new Error(
                '8 RESOURCE_EXHAUSTED: Received message larger than max (4197104 vs 4194304)'
              ),
            });
          }
          yield* deroules;
        })();
      },
    },
  } as unknown as Client;
  return { client, tailles };
}
const TROIS = [{ workflowId: 'a' }, { workflowId: 'b' }, { workflowId: 'c' }];

describe('the reading of the circuits', () => {
  it('asks the server for pages of PAGE workflows, far under the server’s default of 1000', async () => {
    const { client, tailles } = clientBorne([], 1000);
    await lireLesCircuits(client, '/depot');
    expect(tailles).toEqual([PAGE]);
    expect(PAGE).toBeLessThanOrEqual(100);
  });

  it('a page the client refuses as too large: the list starts again with pages of half the size, and gives each workflow once', async () => {
    const { client, tailles } = clientBorne(TROIS, Math.floor(PAGE / 4));
    const lus = await listerLesDeroules(client, 'q');
    expect(tailles).toEqual([PAGE, Math.floor(PAGE / 2), Math.floor(PAGE / 4)]);
    expect(lus.map(w => w.workflowId)).toEqual(['a', 'b', 'c']);
  });

  it('a page of one workflow still too large, or any other failure, is the failure of the list', async () => {
    await expect(listerLesDeroules(clientBorne(TROIS, 0).client, 'q')).rejects.toThrow(
      'Failed to list workflows'
    );
    const autre = {
      workflow: {
        list: () =>
          (async function* () {
            await Promise.resolve();
            yield* [];
            throw new Error('14 UNAVAILABLE');
          })(),
      },
    } as unknown as Client;
    await expect(listerLesDeroules(autre, 'q')).rejects.toThrow('14 UNAVAILABLE');
  });
});
