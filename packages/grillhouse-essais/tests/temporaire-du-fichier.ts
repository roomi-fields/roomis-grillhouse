import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// The temporary directory of a test file that launches the launcher of an agent
// (scripts/enveloppe/lancer.sh): the trials of the launcher, the worlds of the submodules
// (./sous-modules-essai.ts) and commandes-en-enveloppe.nuit.spec.ts.

// The variables that name the temporary directory, as os.tmpdir() and mktemp read them.
const TEMPORAIRES = ['TMPDIR', 'TMP', 'TEMP'] as const;

// The temporary directory of the test file that calls it, as Bazel gives each test its
// TEST_TMPDIR: made by mkdtemp in the temporary directory of the run, named in TMPDIR, TMP and TEMP
// of the test process from the call to the end of the file, so that every process the file starts
// inherits it, the launcher among them, which opens there the temporary directory of each ticket
// (scripts/mesure/base-de-passe.mjs, `ouvrirBaseDuTicket`); removed at the end of the file, red or
// green, with all that the file made there, the variables given back. Two files that launch a
// ticket of the same name never share its temporary directory. Called before the file reads
// process.env into the environment of its launches.
export function temporaireDuFichier(): string {
  const avant = TEMPORAIRES.map(v => [v, process.env[v]] as const);
  const dossier = mkdtempSync(path.join(tmpdir(), 'essai-fichier-'));
  for (const v of TEMPORAIRES) {
    process.env[v] = dossier;
  }
  afterAll(() => {
    for (const [v, valeur] of avant) {
      if (valeur === undefined) {
        delete process.env[v];
      } else {
        process.env[v] = valeur;
      }
    }
    rmSync(dossier, { recursive: true, force: true });
  });
  return dossier;
}
