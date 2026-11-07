#!/usr/bin/env node
// The frame's worker, which the units of the account start (the worker of the project, the worker
// of the machine, each on its task queue):
//
//   node dist/temporal/travailleur.js --file <file des tâches>
//
// - It connects to the server of TEMPORAL_ADDRESS (the common client library, ./client.ts), bundles
//   the frame's workflows (./deroules.ts: the sonde, the places of the machine, the circuit of a ticket, the queue of a
//   project and the CI of a commit, the queue of the tickets of a project) and serves them
//   with their activities on the task queue <file>. It writes `prêt <file>` on its standard output once it polls.
// - SIGINT and SIGTERM stop it cleanly, as the SDK's runtime has it: its running activities are
//   cancelled, then it exits 0. Killed, the server gives its work to the next worker of the queue.
// - Exit 2 for a malformed call, 1 when it cannot serve (the server unreachable).
import { fileURLToPath } from 'node:url';
import { Worker } from '@temporalio/worker';
import { espaceDeNoms, ouvrirLaConnexionDuTravailleur } from './client.js';
import * as activitesDuCircuit from './circuit/activites.js';
import * as activitesDeLaFile from './file/activites.js';
import * as activitesDesPlaces from './places/activites.js';
import * as activitesDesTickets from './tickets/activites.js';
import * as activitesDeLaSonde from './sonde/activites.js';

const DEROULES = fileURLToPath(new URL('./deroules.js', import.meta.url));

// The task queue that the arguments <args> name (`--file <file>`), or null.
function fileDesArguments(args: string[]): string | null {
  const i = args.indexOf('--file');
  const file = i >= 0 ? args[i + 1] : undefined;
  return file && !file.startsWith('--') && args.length === 2 ? file : null;
}

async function principal(args: string[]): Promise<number> {
  const file = fileDesArguments(args);
  if (file === null) {
    process.stderr.write('Usage : travailleur.js --file <file des tâches>\n');
    return 2;
  }
  const connection = await ouvrirLaConnexionDuTravailleur();
  try {
    const worker = await Worker.create({
      connection,
      namespace: espaceDeNoms(),
      taskQueue: file,
      workflowsPath: DEROULES,
      activities: {
        ...activitesDeLaSonde,
        ...activitesDesPlaces,
        ...activitesDuCircuit,
        ...activitesDeLaFile,
        ...activitesDesTickets,
      },
      // A heartbeat reaches the server within the second: the last sign of life of a session
      // survives a worker that dies, and a cancellation reaches its activity at once.
      maxHeartbeatThrottleInterval: '1 second',
      defaultHeartbeatThrottleInterval: '1 second',
    });
    const fin = worker.run();
    process.stdout.write(`prêt ${file}\n`);
    await fin;
    return 0;
  } finally {
    await connection.close();
  }
}

principal(process.argv.slice(2)).then(
  code => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`travailleur : ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
);
