// The reading of the circuits asks the server for pages of PAGE workflows: a page of the server's
// default size (1000), each circuit with its memo, passed the 4 MB a gRPC message of the client
// takes, and the board read « Temporal ne répond pas en 5 s » on pc3 (2026-11-18).
import type { Client } from '@temporalio/client';
import { describe, expect, it } from 'vitest';
import { lireLesCircuits, PAGE } from '../../src/temporal/circuit/client.js';

describe('the reading of the circuits', () => {
  it('asks the server for pages of PAGE workflows, far under the server’s default of 1000', async () => {
    const options: unknown[] = [];
    const client = {
      workflow: {
        list: (o: unknown) => {
          options.push(o);
          return (async function* () {})();
        },
      },
    } as unknown as Client;
    await lireLesCircuits(client, '/depot');
    expect(options).toEqual([expect.objectContaining({ pageSize: PAGE })]);
    expect(PAGE).toBeLessThanOrEqual(100);
  });
});
