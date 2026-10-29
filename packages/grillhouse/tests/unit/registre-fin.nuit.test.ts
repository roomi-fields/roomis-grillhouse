import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, rmSync, utimesSync, writeSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { attendre, lignes } from './registre-essai.js';

// Ticket grillhouse-3uv.72, critère 2: a transcript of several hundred MB is written to the
// register without being held whole in memory. The witness weighs 250 MB; the hook and the
// catch-up run with a JavaScript heap of 64 MB (NODE_OPTIONS, which the work they start inherits),
// where the text of the witness does not fit as one string, nor its lines as one array. Producing
// and reading it is too long for the day, so the night plays it. On disk, never in /tmp's memory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-registre-nuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/registre.mjs');
const TAS = '--max-old-space-size=64';
const MO = 250;
const T0 = Date.parse('2026-10-10T06:00:00Z');
const l = (o: object) => JSON.stringify(o);

const RACINE = path.join(ESSAIS, 'depot');
const PROJET = path.join(ESSAIS, '.claude/projects', RACINE.replace(/[^A-Za-z0-9]/g, '-'));
const TEMOIN = path.join(PROJET, 'longue.jsonl');
let n = 0;

// The witness: the ticket's prompt, then assistant events of about 4 KB each, one millisecond
// apart, each a message of its own (1 + 1 tokens), until it weighs 250 MB.
beforeAll(() => {
  mkdirSync(RACINE, { recursive: true });
  mkdirSync(PROJET, { recursive: true });
  const fd = openSync(TEMOIN, 'w');
  const pad = 'é'.repeat(2_000);
  let total = 0;
  writeSync(
    fd,
    `${l({ type: 'user', timestamp: new Date(T0).toISOString(), message: { content: 'TON TICKET : demo-9.1 — x' } })}\n`
  );
  while (total < MO * 1_000_000) {
    let bloc = '';
    for (let i = 0; i < 1_000; i++, n++) {
      bloc += `${l({
        type: 'assistant',
        timestamp: new Date(T0 + n).toISOString(),
        message: {
          id: `m${n}`,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'text', text: pad }],
        },
      })}\n`;
    }
    writeSync(fd, bloc);
    total += Buffer.byteLength(bloc);
  }
  closeSync(fd);
  // Older than the two minutes of a running transcript: the catch-up takes it.
  const ancien = new Date(Date.now() - 10 * 60_000);
  utimesSync(TEMOIN, ancien, ancien);
}, 120_000);

// The line of the witness: one turn from its first event to its last.
const attendue = (agent: string) => ({
  projet: RACINE,
  agent,
  ticket: 'demo-9.1',
  role: null,
  debut: new Date(T0).toISOString(),
  fin: new Date(T0 + n - 1).toISOString(),
  travail: n - 1,
  tours: [[T0, T0 + n - 1]],
  jetons: 2 * n,
  cache: 0,
  cout: null,
});

// The first line of the register, read.
const lue = (registre: string): unknown => JSON.parse(lignes(registre)[0] ?? 'null');

const env = (registre: string) => ({
  ...process.env,
  HOME: ESSAIS,
  GRILLHOUSE_REGISTRE: registre,
  NODE_OPTIONS: TAS,
});

describe('3uv.72 critère 2 — a transcript of 250 MB, never held whole', () => {
  it('critère 2: the end hook writes its line with a heap of 64 MB', async () => {
    const registre = path.join(ESSAIS, 'registre-crochet.jsonl');
    const r = spawnSync('node', [SCRIPT], {
      input: l({
        hook_event_name: 'SessionEnd',
        transcript_path: TEMOIN,
        session_id: 'longue',
        cwd: RACINE,
      }),
      env: env(registre),
      timeout: 60_000,
    });
    expect(r.status).toBe(0);
    await attendre(registre, 1, 120_000);
    expect(lignes(registre)).toHaveLength(1);
    expect(lue(registre)).toEqual(attendue('longue'));
  }, 200_000);

  it('critère 2: the catch-up writes its line with a heap of 64 MB', async () => {
    const registre = path.join(ESSAIS, 'registre-rattrapage.jsonl');
    const r = spawnSync('node', [SCRIPT, '--rattraper'], {
      cwd: RACINE,
      env: env(registre),
      timeout: 120_000,
    });
    expect(r.status).toBe(0);
    await attendre(registre, 1, 120_000);
    expect(lignes(registre)).toHaveLength(1);
    expect(lue(registre)).toEqual(attendue('longue'));
  }, 260_000);
});
