// The activities of the queue of a project and of the CI of a commit (./deroule.ts): each plays one
// act of the queue (scripts/faits-du-circuit.mjs over scripts/integration/file.mjs) in a process
// of its own (../acte.ts), so that a replacement of a branch and its install leave the worker
// serving; the acts that write give back their effects, which the workflow plays one by one
// (`jouerUnEffetDeLaFile`).
import { jouer } from '../acte.js';
import type { ActivitesDeLaFile } from './contrat.js';

type Entree<K extends keyof ActivitesDeLaFile> = Parameters<ActivitesDeLaFile[K]>[0];
type Sortie<K extends keyof ActivitesDeLaFile> = Awaited<ReturnType<ActivitesDeLaFile[K]>>;

export async function situerLeLot(e: Entree<'situerLeLot'>): Promise<Sortie<'situerLeLot'>> {
  return jouer('situer', e, e.racine);
}

export async function preparerLaBranche(
  e: Entree<'preparerLaBranche'>
): Promise<Sortie<'preparerLaBranche'>> {
  return jouer('brancher', e, e.racine);
}

export async function avancerMain(e: Entree<'avancerMain'>): Promise<Sortie<'avancerMain'>> {
  return jouer('avancer', e, e.racine);
}

export async function fermerLEntree(e: Entree<'fermerLEntree'>): Promise<Sortie<'fermerLEntree'>> {
  return jouer('fermer', e, e.racine);
}

export async function lireLaCI(e: Entree<'lireLaCI'>): Promise<Sortie<'lireLaCI'>> {
  return jouer('ci', e, e.racine);
}

export async function conclureLaCI(e: Entree<'conclureLaCI'>): Promise<Sortie<'conclureLaCI'>> {
  return jouer('conclure', e, e.racine);
}

export async function jouerUnEffetDeLaFile(e: Entree<'jouerUnEffetDeLaFile'>): Promise<void> {
  await jouer('effet-de-la-file', e, e.racine);
}
