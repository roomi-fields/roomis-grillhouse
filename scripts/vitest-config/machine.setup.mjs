// A setup file of the base configuration: the machine of a test file is its own. The file gets a
// lock of the heavy measure of its own (GRILLHOUSE_VERROU_MACHINE, a file of the temporary
// directory named after its process and a token, scripts/verrou-de-machine.mjs), which every
// process it starts inherits: a `npm run verifier` or a circuit that a test plays in a repository
// of trial neither waits for the lock of the machine nor holds it, and no test writes in the
// user's cache. A lock already named in the environment stays.
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.GRILLHOUSE_VERROU_MACHINE ||= path.join(
  tmpdir(),
  `grillhouse-mesure-${process.pid}-${randomUUID()}.lock`
);
