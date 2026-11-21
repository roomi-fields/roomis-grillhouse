// The queue of a project as the executions recorded before the final pass of main ran it: its
// reading of the workflows of main once at its start, then at rest, awaiting an entry. The marker of
// the patch `passe-finale-de-main` is never written, so the code that replays it reads the patch
// false. Bundled by the trial worker of tests/temporal/file.relance.nuit.spec.ts, which plays the
// transition of a queue in flight through a version change.
import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

export async function fileDuProjet(entree) {
  const actes = proxyActivities({
    startToCloseTimeout: '2 hours',
    heartbeatTimeout: '90 seconds',
    retry: { initialInterval: '1 second', maximumAttempts: 4 },
  });
  setHandler(defineSignal('entrer'), () => {});
  setHandler(defineQuery('etatDeLaFile'), () => ({ enCours: null, attente: [] }));
  await actes.relireLesFluxDeMain({
    racine: entree.racine,
    maintenant: Date.now(),
    ci: entree.ci,
  });
  await condition(() => false);
}
