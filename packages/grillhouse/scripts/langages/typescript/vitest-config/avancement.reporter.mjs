// The reporter of progress of the base configuration, while the variable GRILLHOUSE_AVANCEMENT
// names the progress directory of a pass (scripts/mesure/avancement.mjs): it writes the record of its task
// once Vitest knows the files it plays (their number, the files planned), then at each test file
// done, then at the end of the run, every file done. The name of the record is made of the package
// directory it runs in and its process; it carries the hash of its Turborepo task (TURBO_HASH), by
// which the pass knows it again in Turborepo's cache (scripts/avancement.mjs).
import { fileURLToPath } from 'node:url';
import { AVANCEMENT, ecrireTache } from '../../../services-du-noyau.mjs';

// The reporter of progress under <env>'s progress directory, as Vitest's `reporters` take it; an
// empty list without the variable.
export function rapportAvancement(env = process.env) {
  if (!env[AVANCEMENT]) return [];
  return [fileURLToPath(import.meta.url)];
}

const FINIS = new Set(['pass', 'fail', 'skip', 'todo']);

export default class AvancementReporter {
  constructor() {
    this.dossier = process.env[AVANCEMENT];
    this.nom = `${process.cwd().split('/').filter(Boolean).join('-') || 'racine'}-${process.pid}`;
    this.prevus = 0;
    this.faits = new Set();
  }

  onInit(ctx) {
    this.ctx = ctx;
  }

  ecrire() {
    try {
      ecrireTache(this.dossier, this.nom, {
        hash: process.env.TURBO_HASH ?? null,
        faits: this.faits.size,
        prevus: Math.max(this.prevus, this.faits.size),
      });
    } catch {
      // A directory that does not write leaves the run going, without its progress.
    }
  }

  onPathsCollected(fichiers = []) {
    this.prevus = fichiers.length;
    this.ecrire();
  }

  onTaskUpdate(paquets = []) {
    let change = false;
    for (const [id, resultat] of paquets) {
      const t = this.ctx?.state?.idMap?.get(id);
      if (!t?.filepath || t.file !== t || !FINIS.has(resultat?.state)) continue;
      if (this.faits.has(id)) continue;
      this.faits.add(id);
      change = true;
    }
    if (change) this.ecrire();
  }

  onFinished(fichiers = []) {
    for (const f of fichiers) this.faits.add(f.id);
    this.ecrire();
  }
}
