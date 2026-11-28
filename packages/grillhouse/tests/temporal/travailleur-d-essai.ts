// A worker of the test's own process on a development server of trial (./essai.ts): the workflows
// declare their versioning behaviour, so that the server takes their tasks from a versioned worker
// alone. The worker announces the deployment of its task queue as the frame's worker builds it
// (`optionsDuTravailleur`), and its version is made current there (`rendreCourante`).
import { Worker, type WorkerOptions } from '@temporalio/worker';
import { ouvrirLeClient, rendreCourante } from '../../src/temporal/client.js';
import { optionsDuTravailleur } from '../../src/temporal/travailleur.js';

// The version of the workers of a trial: the same at each start, so that a worker started again
// takes up the workflows pinned to it.
const VERSION = '0.0.0-essai';

/**
 * Builds the worker of the options <options> and runs it on the server at <adresse>; resolves once
 * its version is the current one of the deployment of its task queue. `arreter` stops it, once.
 */
export async function demarrerUnTravailleurDeCeProcessus(
  adresse: string,
  options: WorkerOptions
): Promise<{ arreter: () => Promise<void> }> {
  const file = options.taskQueue;
  const w = await Worker.create({
    ...options,
    workerDeploymentOptions: optionsDuTravailleur(file, VERSION).workerDeploymentOptions,
  });
  const fin = w.run();
  // A worker that fails while the gesture waits is told by `arreter`.
  fin.catch(() => undefined);
  let arrete = false;
  const arreter = async () => {
    if (!arrete) {
      arrete = true;
      w.shutdown();
      await fin;
    }
  };
  const { client, fermer } = ouvrirLeClient({ adresse });
  try {
    await rendreCourante(client, file, VERSION);
  } catch (e) {
    await arreter();
    throw e;
  } finally {
    await fermer();
  }
  return { arreter };
}
