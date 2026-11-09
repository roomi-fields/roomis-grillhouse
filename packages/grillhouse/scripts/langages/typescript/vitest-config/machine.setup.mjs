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
// That trial machine takes no place of the user's machine (scripts/places-de-la-machine.mjs): only
// the server of trial a test names (GRILLHOUSE_PLACES_D_ESSAI).
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.GRILLHOUSE_VERROU_MACHINE ||= path.join(
  tmpdir(),
  `grillhouse-mesure-${process.pid}-${randomUUID()}.lock`
);
// The machine a test reads is a fixed one (GRILLHOUSE_MESURE_D_ESSAI, scripts/places-de-la-machine.mjs
// `etatDesPlaces`): no test reads the real load or memory of the user's machine.
process.env.GRILLHOUSE_MESURE_D_ESSAI ||= JSON.stringify({
  coeurs: 12,
  charge: 1,
  memoireLibre: 16 * 1024 ** 3,
});
process.env.GRILLHOUSE_TEMPORAIRE_LIBRE ||= '0';
process.env.GRILLHOUSE_COPIE_LIBRE ||= '0';
