// The queue of a project (src/temporal/file/deroule.ts) in flight before the final pass of main
// (`patched('passe-finale-de-main')` false) replays on the code that installs the relaunch: its
// recorded history, without the marker of the patch, still replays, whatever the new code sets at
// its start (the handler of the relaunch, the view). The history is a fixture recorded without the
// marker: an old queue at rest, its reading of the workflows of main done, awaiting an entry.
// Replay only: no server, no process.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Worker } from '@temporalio/worker';
import { describe, it } from 'vitest';
import { idDeLaFile } from '../../src/temporal/file/contrat.js';

const DEROULES = path.resolve(__dirname, '../../dist/temporal/deroules.js');
const HISTOIRE = path.resolve(__dirname, './histoires/file-ancienne-au-repos.json');

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

describe('la file ancienne rejouée sur le code qui porte la relance', () => {
  it('the history of an old queue at rest, recorded without the marker of the final pass, replays', async () => {
    const histoire = temporal.api.history.v1.History.fromObject(
      JSON.parse(readFileSync(HISTOIRE, 'utf8')) as object
    );
    await Worker.runReplayHistory(
      { workflowsPath: DEROULES },
      histoire,
      idDeLaFile('/depot/essai')
    );
  }, 120_000);
});
