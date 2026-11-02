// A setup file of the base configuration: the machine of a test file is its own. The file gets a
// lock of the heavy measure of its own (GRILLHOUSE_VERROU_MACHINE, a file of the temporary
// directory named after its process and a token, scripts/verrou-de-machine.mjs), which every
// process it starts inherits: a `npm run verifier` or a circuit that a test plays in a repository
// of trial neither waits for the lock of the machine nor holds it, and no test writes in the
// user's cache. A lock already named in the environment stays. Its heavy passes want no room in
// the temporary directory (GRILLHOUSE_TEMPORAIRE_LIBRE, 0) nor on the disk of their copy
// (GRILLHOUSE_COPIE_LIBRE, 0): the room of the machine is the pass's that plays the file, which
// waited for it.
//
// The places of the machine (scripts/places-de-la-machine.mjs) of that trial machine are files
// beside its lock (`<lock>.places.json` and its lock); the file's end removes them, so that no
// test writes in the user's cache nor leaves a file in the temporary directory.
import { randomUUID } from 'node:crypto';
import { readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const proprietaire = !process.env.GRILLHOUSE_VERROU_MACHINE;
process.env.GRILLHOUSE_VERROU_MACHINE ||= path.join(
  tmpdir(),
  `grillhouse-mesure-${process.pid}-${randomUUID()}.lock`
);
if (proprietaire) {
  const verrou = process.env.GRILLHOUSE_VERROU_MACHINE;
  afterAll(() => {
    const prefixe = `${path.basename(verrou)}.places.json`;
    for (const nom of readdirSync(path.dirname(verrou)))
      if (nom.startsWith(prefixe)) rmSync(path.join(path.dirname(verrou), nom), { force: true });
  });
}
process.env.GRILLHOUSE_TEMPORAIRE_LIBRE ||= '0';
process.env.GRILLHOUSE_COPIE_LIBRE ||= '0';
