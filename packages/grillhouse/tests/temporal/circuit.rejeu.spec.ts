// The workflow of a ticket (src/temporal/circuit/deroule.ts) reads, under its marker
// `attribution-avant-sans-livraison`, the fact « portes » before the stop « sans-livraison » of red
// checks after a developpeur who had nothing to deliver. The recorded history of a circuit in
// flight stopped there before the marker (the facts « controles » and « mecanique », then the
// stop) replays on this code without a determinism error, the former order kept; and so does the
// history of a circuit that carries the marker and read « portes » first. The histories are
// fixtures: a circuit awaiting the supervisor's answer. Replay only: no server, no process.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Worker } from '@temporalio/worker';
import { describe, expect, it } from 'vitest';
import { idDuCircuit } from '../../src/temporal/circuit/contrat.js';

const DEROULES = path.resolve(__dirname, '../../dist/temporal/deroules.js');
const SANS_MARQUEUR = path.resolve(
  __dirname,
  './histoires/circuit-sans-livraison-sans-marqueur.json'
);
const AVEC_MARQUEUR = path.resolve(
  __dirname,
  './histoires/circuit-sans-livraison-avec-marqueur.json'
);
const MARQUEUR = 'attribution-avant-sans-livraison';

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

interface Evenement {
  markerRecordedEventAttributes?: {
    details?: { 'patch-data'?: { payloads?: { data?: string }[] } };
  };
  activityTaskScheduledEventAttributes?: {
    activityType?: { name?: string };
    input?: { payloads?: { data?: string }[] };
  };
}
const lire = (fichier: string) =>
  JSON.parse(readFileSync(fichier, 'utf8')) as { events: Evenement[] };
const texte = (data: string | undefined) => Buffer.from(data ?? '', 'base64').toString('utf8');

// The markers the history of <fichier> carries, by their name.
const marqueurs = (fichier: string) =>
  lire(fichier).events.flatMap(e =>
    (e.markerRecordedEventAttributes?.details?.['patch-data']?.payloads ?? []).map(
      p => (JSON.parse(texte(p.data)) as { id: string }).id
    )
  );

// The facts the history of <fichier> read, in their order.
const faits = (fichier: string) =>
  lire(fichier).events.flatMap(e => {
    const a = e.activityTaskScheduledEventAttributes;
    return a?.activityType?.name === 'lireUnFait'
      ? [(JSON.parse(texte(a.input?.payloads?.[0]?.data)) as { fait: string }).fait]
      : [];
  });

async function rejouer(fichier: string): Promise<void> {
  const histoire = temporal.api.history.v1.History.fromObject(lire(fichier));
  await Worker.runReplayHistory(
    { workflowsPath: DEROULES },
    histoire,
    idDuCircuit('/depot/essai', 'essai-1')
  );
}

describe('un circuit en vol arrêté « sans-livraison » rejoué sur le code qui attribue le rouge avant l’arrêt', () => {
  it('the history recorded before the marker, which never read « portes », replays without a determinism error', async () => {
    expect(marqueurs(SANS_MARQUEUR)).not.toContain(MARQUEUR);
    expect(faits(SANS_MARQUEUR).slice(-2)).toEqual(['controles', 'mecanique']);
    await rejouer(SANS_MARQUEUR);
  }, 120_000);

  it('the history that carries the marker, which read « portes » before the stop, replays without a determinism error', async () => {
    expect(marqueurs(AVEC_MARQUEUR)).toContain(MARQUEUR);
    expect(faits(AVEC_MARQUEUR).slice(-3)).toEqual(['controles', 'mecanique', 'portes']);
    await rejouer(AVEC_MARQUEUR);
  }, 120_000);
});
