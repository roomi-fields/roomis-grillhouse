// A setup file of the base configuration: the machine of a test file is its own. The file gets a
// directory of the state of the parts of its own (GRILLHOUSE_PARTS_DE_LA_MACHINE, a directory of
// the temporary directory named after its process and a token, scripts/places-de-la-machine.mjs),
// which every process it starts inherits: a `npm run verifier` or a circuit that a test plays in
// a repository of trial takes its part there, among its own parts alone, and no test writes in the
// user's state. A directory already named in the environment stays. The directory the file named
// is removed at its end, with what a pass left there (the part of a pass a test killed, which
// never gave it back), as the register of the file is (./registre.setup.mjs): the guard of the
// temporary directory of the run finds nothing of it. Its passes want no room in
// the temporary directory (GRILLHOUSE_TEMPORAIRE_LIBRE, 0) nor on the disk of their copy
// (GRILLHOUSE_COPIE_LIBRE, 0): the room of the machine is the pass's that plays the file, which
// waited for it.
//
// That trial machine takes no place of the user's machine (scripts/places-de-la-machine.mjs): only
// the server of trial a test names (GRILLHOUSE_PLACES_D_ESSAI).
// Mechanism: packages/grillhouse/docs/architecture/tests.md, §3.3, §4.2.
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

if (!process.env.GRILLHOUSE_PARTS_DE_LA_MACHINE) {
  const parts = path.join(tmpdir(), `grillhouse-parts-${process.pid}-${randomUUID()}`);
  process.env.GRILLHOUSE_PARTS_DE_LA_MACHINE = parts;
  afterAll(() => rmSync(parts, { recursive: true, force: true }));
}
// The machine a test reads is a fixed one (GRILLHOUSE_MESURE_D_ESSAI, scripts/places-de-la-machine.mjs
// `etatDesPlaces`): no test reads the real load or memory of the user's machine.
process.env.GRILLHOUSE_MESURE_D_ESSAI ||= JSON.stringify({
  coeurs: 12,
  charge: 1,
  memoireLibre: 16 * 1024 ** 3,
  memoireTotale: 32 * 1024 ** 3,
});
process.env.GRILLHOUSE_TEMPORAIRE_LIBRE ||= '0';
process.env.GRILLHOUSE_COPIE_LIBRE ||= '0';
// The cache of a test's Turborepo is local alone: the remote cache of the CI or of the poste
// (scripts/fichier-du-poste.mjs) would serve a repository of trial the tasks another test or run
// wrote there. `TURBO_CACHE` says local alone; `TURBO_TOKEN`, named empty, keeps the file of the
// poste unread (`avecLeFichierDuPoste` leaves an environment that names one of its variables).
for (const nom of ['TURBO_API', 'TURBO_TEAM', 'TURBO_TEAMID', 'TURBO_REMOTE_CACHE_SIGNATURE_KEY']) {
  delete process.env[nom];
}
process.env.TURBO_TOKEN = '';
process.env.TURBO_CACHE = 'local:rw';
