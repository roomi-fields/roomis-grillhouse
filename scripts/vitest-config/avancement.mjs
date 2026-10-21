// The progress of a pass, as Bazel counts its actions « [1 234 / 2 000] »: the variable that names
// the progress directory of a pass, `GRILLHOUSE_AVANCEMENT`, the reporter the base configuration
// adds while it is set (./base.mjs, ./avancement.reporter.mjs), and the writing of a record. The
// reading, the plan and the totals kept are scripts/avancement.mjs.
//
// - Each task of a pass writes its own record to `<dossier>/taches/<nom>.json`: `{ hash, faits,
//   prevus, a }`, the hash of its Turborepo task (`TURBO_HASH`, null out of Turborepo), its files
//   done and planned, and the instant of the writing (ms). Two packages, or the same one twice,
//   never write the same file.
// - A record is written whole or not at all: to a file of its own, renamed over the record.
// - The variable passes through Turborepo without entering any hash (`globalPassThroughEnv` of the
//   root's turbo.json, which scripts/turbo-des-paquets.mjs writes and checks).
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AVANCEMENT = 'GRILLHOUSE_AVANCEMENT';
// The subdirectory of the records in a progress directory.
export const TACHES = 'taches';

// Writes <objet> as JSON to <fichier>, whole or not at all.
export function ecrireAtomique(fichier, objet) {
  mkdirSync(path.dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, JSON.stringify(objet));
  renameSync(provisoire, fichier);
}

// Writes the record <nom> of the progress directory <dossier>: <faits> done of <prevus>, now.
export function ecrireTache(dossier, nom, { hash = null, faits, prevus }) {
  ecrireAtomique(path.join(dossier, TACHES, `${nom}.json`), { hash, faits, prevus, a: Date.now() });
}

// The reporter of progress under <env>'s progress directory, as Vitest's `reporters` take it; an
// empty list without the variable.
export function rapportAvancement(env = process.env) {
  if (!env[AVANCEMENT]) return [];
  return [fileURLToPath(new URL('./avancement.reporter.mjs', import.meta.url))];
}
