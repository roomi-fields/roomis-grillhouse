// A setup file of the base configuration: a test file's results are its own, as Bazel gives each
// test its own outputs directory (TEST_UNDECLARED_OUTPUTS_DIR). While the run names its results
// directory (`GRILLHOUSE_RESULTATS`, scripts/resultats.mjs), the file names for every process it starts
// a directory of its own, `<dossier>/essais/<process>-<token>/`, which no reader of the run reads
// (scripts/resultats.mjs and scripts/langages/typescript/verdict.mjs read `vitest/`, `sarif/` and
// `turbo/`): a Vitest, a `npm run verifier`
// or a circuit that a test plays in a repository of trial writes its results there, and its reds
// never count in the pass that plays it. The reporters of the run, set up in its main process,
// keep the run's own directory. Without the variable, nothing changes.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { RESULTATS } from '../../../resultats.mjs';

if (process.env[RESULTATS]) {
  process.env[RESULTATS] = path.join(
    process.env[RESULTATS],
    'essais',
    `${process.pid}-${randomUUID()}`
  );
}
