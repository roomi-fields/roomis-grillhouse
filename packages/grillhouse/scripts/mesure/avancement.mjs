// The progress of a pass, as Bazel counts its actions « [1 234 / 2 000] »: the variable that names
// the progress directory of a pass, `GRILLHOUSE_AVANCEMENT`, and the writing of a record, which
// the reporter of the module of the language writes while it is set (for typescript,
// scripts/langages/typescript/vitest-config/avancement.reporter.mjs) and the queue for the steps of its CI. The
// reading, the plan and the totals kept are scripts/avancement.mjs.
//
// - Each task of a pass writes its own record to `<dossier>/taches/<nom>.json`: `{ hash, faits,
//   prevus, a }`, the hash of its task in the cache of its runner (null without one), its files
//   done and planned, and the instant of the writing (ms). Two packages, or the same one twice,
//   never write the same file.
// - A record is written whole or not at all: to a file of its own, renamed over the record.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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
