// The activities of the workflow of a ticket (./deroule.ts): each plays one act of the circuit
// in a process of its own (../acte.ts); each act but `effet` gives back the effects it emitted,
// which the workflow plays one by one (`jouerUnEffet`); and the acts of its pause on a question,
// its copy measured and its place asked again (`ActivitesDeLaPause`).
import { mesurerLaCopie } from '../../../scripts/disque-des-copies.mjs';
import { jouer } from '../acte.js';
import { ouvrirLeClient } from '../client.js';
import { reserverDesCircuits } from '../places/client.js';
import type { Activites, ActivitesDeLaPause } from './contrat.js';

type Entree<K extends keyof Activites> = Parameters<Activites[K]>[0];
const ou = (e: { racine: string }) => e.racine;

type Sortie<K extends keyof Activites> = Awaited<ReturnType<Activites[K]>>;

export async function ouvrirLeCircuit(
  e: Entree<'ouvrirLeCircuit'>
): Promise<Sortie<'ouvrirLeCircuit'>> {
  return jouer<Sortie<'ouvrirLeCircuit'>>('ouvrir', e, ou(e));
}

export async function preparerLaPasse(
  e: Entree<'preparerLaPasse'>
): Promise<Sortie<'preparerLaPasse'>> {
  return jouer<Sortie<'preparerLaPasse'>>('preparer', e, ou(e));
}

export async function lireUnFait(e: Entree<'lireUnFait'>): Promise<Sortie<'lireUnFait'>> {
  return jouer<Sortie<'lireUnFait'>>('fait', e, ou(e));
}

export async function appliquerLesEffets(
  e: Entree<'appliquerLesEffets'>
): Promise<Sortie<'appliquerLesEffets'>> {
  return jouer<Sortie<'appliquerLesEffets'>>('effets', e, ou(e));
}

export async function publierLArret(e: Entree<'publierLArret'>): Promise<Sortie<'publierLArret'>> {
  return jouer<Sortie<'publierLArret'>>('arret', e, ou(e));
}

export async function finirLeTicket(e: Entree<'finirLeTicket'>): Promise<Sortie<'finirLeTicket'>> {
  return jouer<Sortie<'finirLeTicket'>>('fin', e, ou(e));
}

export async function arreterLeTicket(
  e: Entree<'arreterLeTicket'>
): Promise<Sortie<'arreterLeTicket'>> {
  return jouer<Sortie<'arreterLeTicket'>>('arreter', e, ou(e));
}

export async function jouerUnEffet(e: Entree<'jouerUnEffet'>): Promise<void> {
  await jouer('effet', e, ou(e));
}

export function mesurerLaCopieDuTicket(
  e: Parameters<ActivitesDeLaPause['mesurerLaCopieDuTicket']>[0]
): Promise<number | null> {
  return Promise.resolve(mesurerLaCopie(e.racine, e.ticket));
}

// A machine that does not answer gives no place: the circuit asks again at its next turn.
export async function reprendreUnePlace(
  e: Parameters<ActivitesDeLaPause['reprendreUnePlace']>[0]
): Promise<boolean> {
  const c = ouvrirLeClient();
  try {
    const accordes = await reserverDesCircuits(c.client, {
      racine: e.racine,
      reprise: { ticket: e.ticket, rang: e.rang },
    });
    return accordes.includes(e.ticket);
  } catch {
    return false;
  } finally {
    await c.fermer();
  }
}

export async function jouerUnPasDuPlan(
  e: Entree<'jouerUnPasDuPlan'>
): Promise<Sortie<'jouerUnPasDuPlan'>> {
  return jouer<Sortie<'jouerUnPasDuPlan'>>('plan', e, ou(e));
}
