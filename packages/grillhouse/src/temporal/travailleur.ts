#!/usr/bin/env node
// The frame's worker, which the units of the account start (the worker of the project, the worker
// of the machine, each on its task queue):
//
//   node dist/temporal/travailleur.js --file <file des tâches>
//
// - It registers in the Worker Deployment of its task queue, the version of its package its version
//   (installation.md §2.6): the server gives a pinned workflow to the workers of its version alone,
//   an auto-upgrade one to those of the current version, which `rendreCourante` (./client.ts) makes
//   current. The module builds these options (`optionsDuTravailleur`); importing it starts nothing.
// - It connects to the server of TEMPORAL_ADDRESS (the common client library, ./client.ts), bundles
//   the frame's workflows (./deroules.ts: the sonde, the places of the machine, the circuit of a ticket, the queue of a
//   project and the CI of a commit, the queue of the tickets of a project, the nights of the
//   machine) and serves them
//   with their activities on the task queue <file>. It writes `prêt <file>` on its standard output once it polls.
// - SIGINT and SIGTERM stop it cleanly, as the SDK's runtime has it: its running activities are
//   cancelled, then it exits 0. Killed, the server gives its work to the next worker of the queue.
// - Exit 2 for a malformed call, 1 when it cannot serve (the server unreachable).
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, type WorkerOptions } from '@temporalio/worker';
import { espaceDeNoms, ouvrirLaConnexionDuTravailleur } from './client.js';
import * as activitesDuCircuit from './circuit/activites.js';
import * as activitesDeLaFile from './file/activites.js';
import * as activitesDesPlaces from './places/activites.js';
import * as activitesDesTickets from './tickets/activites.js';
import * as activitesDeLaSonde from './sonde/activites.js';
import { activitesDesNuits } from './nuits/activites.js';

const DEROULES = fileURLToPath(new URL('./deroules.js', import.meta.url));

// The task queue that the arguments <args> name (`--file <file>`), or null.
function fileDesArguments(args: string[]): string | null {
  const i = args.indexOf('--file');
  const file = i >= 0 ? args[i + 1] : undefined;
  return file && !file.startsWith('--') && args.length === 2 ? file : null;
}

/**
 * The options of the frame's worker of the version `version` on the task queue `file`, all but its
 * connection: the frame's workflows with their activities, served under the version `version` of
 * the Worker Deployment `file`.
 */
export function optionsDuTravailleur(
  file: string,
  version: string
): Omit<WorkerOptions, 'connection'> {
  return {
    namespace: espaceDeNoms(),
    taskQueue: file,
    workflowsPath: DEROULES,
    activities: {
      ...activitesDeLaSonde,
      ...activitesDesPlaces,
      ...activitesDuCircuit,
      ...activitesDeLaFile,
      ...activitesDesTickets,
      ...activitesDesNuits,
    },
    // The SDK refuses a versioned worker without a default behaviour. No workflow takes it: each
    // declares its own (`setWorkflowOptions`).
    workerDeploymentOptions: {
      useWorkerVersioning: true,
      version: { deploymentName: file, buildId: version },
      defaultVersioningBehavior: 'PINNED',
    },
    // A heartbeat reaches the server within the second: the last sign of life of a session
    // survives a worker that dies, and a cancellation reaches its activity at once.
    maxHeartbeatThrottleInterval: '1 second',
    defaultHeartbeatThrottleInterval: '1 second',
  };
}

async function principal(args: string[]): Promise<number> {
  const file = fileDesArguments(args);
  if (file === null) {
    process.stderr.write('Usage : travailleur.js --file <file des tâches>\n');
    return 2;
  }
  const options = optionsDuTravailleur(file, await activitesDeLaFile.lireLaVersionDeLOutil());
  const connection = await ouvrirLaConnexionDuTravailleur();
  try {
    const worker = await Worker.create({ ...options, connection });
    const fin = worker.run();
    process.stdout.write(`prêt ${file}\n`);
    await fin;
    return 0;
  } finally {
    await connection.close();
  }
}

// Run as a program, by its path or a link to it; imported, the module starts nothing.
const lance = process.argv[1];
if (lance && import.meta.url === pathToFileURL(realpathSync(lance)).href) {
  principal(process.argv.slice(2)).then(
    code => {
      process.exitCode = code;
    },
    (e: unknown) => {
      process.stderr.write(`travailleur : ${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    }
  );
}
