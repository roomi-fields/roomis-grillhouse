// La copie d'essai des références du circuit (scripts/activites.mjs : `lesReferences`,
// `referencesDesRouges`, `regenerer`) : un dépôt git de TypeScript, ses fichiers et ses références
// déclarées (`grillhouse.references`) commités sur main. Chaque appelant donne le dossier d'essai
// qu'il crée et retire.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { copieEssai, type Ctx } from './preuve-essai.js';

export interface Reference {
  nom: string;
  commande: string;
  fichiers: string[];
  tests?: string[];
  lit?: string[];
  gardes?: string[];
}

/** La copie sous <essais>, ses <references> déclarées et ses <fichiers> commités sur main. */
export function depotDeReferences(
  essais: string,
  references: Reference[],
  fichiers: Record<string, string> = {}
): Ctx {
  const ctx = copieEssai(essais);
  const pkg = { name: 'essai', private: true, grillhouse: { references } };
  for (const [f, texte] of Object.entries({
    'package.json': JSON.stringify(pkg),
    ...fichiers,
  })) {
    mkdirSync(path.dirname(path.join(ctx.copie, f)), { recursive: true });
    writeFileSync(path.join(ctx.copie, f), texte);
  }
  for (const a of [
    ['add', '-A'],
    ['commit', '-q', '-m', 'les références'],
  ]) {
    spawnSync('git', ['-C', ctx.copie, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  }
  return ctx;
}
