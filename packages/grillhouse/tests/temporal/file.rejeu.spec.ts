// The queue of a project (src/temporal/file/deroule.ts) has one path, the final pass of main. The
// recorded history of a queue in flight that carries the marker `core_patch` of
// `passe-finale-de-main` replays on this code without a determinism error, and so does the history
// of a queue that never wrote the marker: it starts by reading the CI of main, as the final pass
// path does, and none of the activities of the former path. The histories are fixtures: a queue at
// rest, awaiting an entry. Replay only: no server, no process.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Worker } from '@temporalio/worker';
import { describe, it } from 'vitest';
import { idDeLaFile } from '../../src/temporal/file/contrat.js';

const DEROULES = path.resolve(__dirname, '../../dist/temporal/deroules.js');
const AVEC_MARQUEUR = path.resolve(__dirname, './histoires/file-au-repos-avec-marqueur.json');
const SANS_MARQUEUR = path.resolve(__dirname, './histoires/file-au-repos-sans-marqueur.json');

// The class of the protobuf message of a history, which reads its plain object back (the format
// of `toObject`, durations and instants as objects, its bytes as base64 text).
interface ProtoDeTemporal {
  temporal: {
    api: {
      history: {
        v1: { History: { fromObject(o: object): Parameters<typeof Worker.runReplayHistory>[1] } };
      };
    };
  };
}
const { temporal } = createRequire(import.meta.url)('@temporalio/proto') as ProtoDeTemporal;

async function rejouer(fichier: string): Promise<void> {
  const histoire = temporal.api.history.v1.History.fromObject(
    JSON.parse(readFileSync(fichier, 'utf8')) as object
  );
  await Worker.runReplayHistory({ workflowsPath: DEROULES }, histoire, idDeLaFile('/depot/essai'));
}

describe('la file en vol rejouée sur le code de la passe finale seule', () => {
  it('the history of a queue in flight that carries the marker of the final pass replays without a determinism error', async () => {
    await rejouer(AVEC_MARQUEUR);
  }, 120_000);

  it('the history of a queue without the marker replays on the final pass path, which reads the CI of main first', async () => {
    await rejouer(SANS_MARQUEUR);
  }, 120_000);
});
