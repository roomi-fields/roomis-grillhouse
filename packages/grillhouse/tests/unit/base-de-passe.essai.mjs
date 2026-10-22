// The test file of a trial project of ./base-de-passe.spec.ts (grillhouse-3uv.93), the code of a
// project's test as it stands: it writes its environment to the file SONDE names, makes a trial
// directory under its temporary directory and never removes it, as BPScript's tests make theirs
// (packages/990-corpus/test/traces.test.ts:22, packages/995-tools/test/depot-jouet.ts:123), then
// waits ATTENDRE ms when it is set, and fails when ROUGE is set.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it } from 'vitest';

it('un essai qui laisse son dossier', async () => {
  writeFileSync(process.env.SONDE, JSON.stringify(process.env));
  mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), 'trace-'));
  if (process.env.ATTENDRE) {
    await new Promise(fin => setTimeout(fin, Number(process.env.ATTENDRE)));
  }
  if (process.env.ROUGE) {
    throw new Error('rouge du jouet');
  }
}, 30_000);
