// The activities of the queue of a project (./deroule.ts): each plays one
// act of the queue (scripts/faits-du-circuit.mjs over scripts/integration/file.mjs) in a process
// of its own (../acte.ts), so that a replacement of a branch and its install leave the worker
// serving; the acts that write give back their effects, which the workflow plays one by one
// (`jouerUnEffetDeLaFile`).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { jouer } from '../acte.js';
import type { ActivitesDeLaFile } from './contrat.js';

type Entree<K extends keyof ActivitesDeLaFile> = Parameters<ActivitesDeLaFile[K]>[0];
type Sortie<K extends keyof ActivitesDeLaFile> = Awaited<ReturnType<ActivitesDeLaFile[K]>>;

// The package.json of the package that carries this worker: three levels above this module, in
// src/ as in dist/ (the one `temporal installer` reads for the installed version).
const PACKAGE_JSON = new URL('../../../package.json', import.meta.url);

export async function lireLaVersionDeLOutil(): Promise<string> {
  const { version } = JSON.parse(await readFile(PACKAGE_JSON, 'utf8')) as { version?: unknown };
  if (typeof version !== 'string' || !version) {
    throw new Error(`temporal : ${fileURLToPath(PACKAGE_JSON)} ne déclare pas de version.`);
  }
  return version;
}

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

export async function jugerLeCandidat(
  e: Entree<'jugerLeCandidat'>
): Promise<Sortie<'jugerLeCandidat'>> {
  return jouer('juger', e, e.racine);
}

export async function surveillerLaCiDeMain(
  e: Entree<'surveillerLaCiDeMain'>
): Promise<Sortie<'surveillerLaCiDeMain'>> {
  return jouer('surveiller-la-ci-de-main', e, e.racine);
}

export async function jouerUnEffetDeLaFile(e: Entree<'jouerUnEffetDeLaFile'>): Promise<void> {
  await jouer('effet-de-la-file', e, e.racine);
}
