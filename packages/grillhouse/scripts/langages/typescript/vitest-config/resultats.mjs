// The JSON report of Vitest in the results directory of a run (`GRILLHOUSE_RESULTATS`,
// scripts/resultats.mjs; scripts/langages/typescript/verdict.mjs reads it): the reporter the base
// configuration adds while the variable is set (./base.mjs). Without it, Vitest writes no report.
//
// - Each run of Vitest writes its report to `<dossier>/vitest/<name>.json`, the name made of the
//   package directory it runs in and its process: two packages, or the same one twice, never write
//   the same file.
// - The variable passes through Turborepo without entering any hash (`globalPassThroughEnv` of the
//   root's turbo.json, which scripts/langages/typescript/turbo-des-paquets.mjs writes and checks).
import path from 'node:path';
import { RESULTATS } from '../../../resultats.mjs';

// The subdirectory of the reports of Vitest in a results directory.
export const VITEST = 'vitest';

// The reporter of the JSON report under <env>'s results directory, as Vitest's `reporters` take
// it; an empty list without the variable.
export function rapportJson(env = process.env, dossier = process.cwd()) {
  const resultats = env[RESULTATS];
  if (!resultats) return [];
  const nom = `${dossier.split(path.sep).filter(Boolean).join('-') || 'racine'}-${process.pid}.json`;
  return [['json', { outputFile: path.join(resultats, VITEST, nom) }]];
}
