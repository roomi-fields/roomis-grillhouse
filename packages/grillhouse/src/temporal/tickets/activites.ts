// The activities of the queue of the tickets of a project (./deroule.ts): the tickets that start,
// read from Beads in the main tree of the repository with the setting of its package.json, the
// circuits of the project alive and those not integrated, read from the server, those alive whose
// ticket was closed outside them, and the places of the machine its tickets may start on. A
// package.json that does not parse, or a Beads that fails, is a fault named, never a key absent nor
// an empty list.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { maxDuProjet, reglageDesCircuits } from '../../../scripts/circuits-cles.mjs';
import {
  fermesHorsCircuit as lesFermes,
  lireLesExternes,
  lireLesTickets,
  ticketsAPartir as aPartir,
} from '../../../scripts/file-des-tickets.mjs';
import { lireGroupe } from '../../../scripts/groupe-cles.mjs';
import { ecrireLaTrace, traceDeLaFile } from '../../../scripts/journal-des-etats.mjs';
import { ouvrirLeClient } from '../client.js';
import { disqueDesCopies } from '../../../scripts/disque-des-copies.mjs';
import { reserverDesCircuits } from '../places/client.js';
import { lireLesCircuits } from '../circuit/client.js';
import { EN_ATTENTE_DE_PLACE, idDuCircuit } from '../circuit/contrat.js';
import type { ActivitesDesTickets } from './contrat.js';

type Entree<K extends keyof ActivitesDesTickets> = Parameters<ActivitesDesTickets[K]>[0];
type Sortie<K extends keyof ActivitesDesTickets> = Awaited<ReturnType<ActivitesDesTickets[K]>>;

// The package.json of the project at <racine>: absent, null; one that does not parse throws.
function lePaquet(racine: string): unknown {
  let texte: string;
  try {
    texte = readFileSync(path.join(racine, 'package.json'), 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(texte);
  } catch (e) {
    throw new Error(`package.json ne se lit pas : ${(e as Error).message}`);
  }
}

export function ticketsAPartir(e: Entree<'ticketsAPartir'>): Promise<Sortie<'ticketsAPartir'>> {
  const faute = (message: string) => Promise.resolve({ partir: [], max: null, faute: message });
  let paquet: unknown;
  try {
    paquet = lePaquet(e.racine);
  } catch (x) {
    return faute((x as Error).message);
  }
  const reglage = reglageDesCircuits(paquet);
  if (reglage.faute) {
    return faute(reglage.faute);
  }
  let tickets;
  try {
    tickets = lireLesTickets(e.racine);
  } catch (x) {
    return faute((x as Error).message);
  }
  return Promise.resolve({
    partir: aPartir(tickets, {
      enCours: new Set(e.enCours),
      externes: lireLesExternes(e.racine, tickets),
    }).map(t => t.id),
    max: reglage.max,
    faute: null,
  });
}

export async function circuitsVivants(e: Entree<'circuitsVivants'>): Promise<string[]> {
  const prefixe = idDuCircuit(e.racine, '');
  const c = ouvrirLeClient();
  try {
    const vivants: string[] = [];
    for await (const w of c.client.workflow.list({
      query: `WorkflowType = 'circuitDuTicket' AND ExecutionStatus = 'Running'`,
    })) {
      if (w.workflowId.startsWith(prefixe)) {
        vivants.push(w.workflowId.slice(prefixe.length));
      }
    }
    return vivants.sort();
  } finally {
    await c.fermer();
  }
}

export async function fermesHorsCircuit(
  e: Entree<'fermesHorsCircuit'>
): Promise<Sortie<'fermesHorsCircuit'>> {
  if (!e.vivants.length) {
    return [];
  }
  let tickets;
  try {
    tickets = lireLesTickets(e.racine);
  } catch {
    return [];
  }
  const vivants = new Set(e.vivants);
  const c = ouvrirLeClient();
  try {
    const lus = (await lireLesCircuits(c.client, e.racine)).filter(x => vivants.has(x.ticket));
    return lesFermes(tickets, lus);
  } finally {
    await c.fermer();
  }
}

export async function circuitsEnPause(e: Entree<'circuitsEnPause'>): Promise<string[]> {
  const prefixe = idDuCircuit(e.racine, '');
  const c = ouvrirLeClient();
  try {
    const enPause: string[] = [];
    for await (const w of c.client.workflow.list({
      query: `WorkflowType = 'circuitDuTicket' AND ExecutionStatus = 'Running'`,
    })) {
      const memo = (w.memo ?? {}) as { question?: unknown; etape?: string };
      if (
        w.workflowId.startsWith(prefixe) &&
        (memo.question || memo.etape === EN_ATTENTE_DE_PLACE)
      ) {
        enPause.push(w.workflowId.slice(prefixe.length));
      }
    }
    return enPause.sort();
  } finally {
    await c.fermer();
  }
}

// The group of the project and the priority and creation of each candidate, which order its tickets
// that wait for a place among the projects of its group; none out of a group, or when the
// package.json or Beads do not read (the order of arrival then decides).
function ordreDuGroupe(e: { racine: string; candidats: string[] }) {
  try {
    const { groupe } = lireGroupe(lePaquet(e.racine), e.racine);
    if (!groupe) {
      return {};
    }
    const lus = new Map(lireLesTickets(e.racine).map(t => [t.id, t]));
    const priorites = Object.fromEntries(
      e.candidats.flatMap(id => {
        const t = lus.get(id);
        return t ? [[id, { priorite: t.priority ?? 2, creation: t.created_at ?? '' }]] : [];
      })
    );
    return { groupe: groupe.id, priorites };
  } catch {
    return {};
  }
}

export async function placesDeLaMachine(
  e: Entree<'placesDeLaMachine'>
): Promise<Sortie<'placesDeLaMachine'>> {
  const c = ouvrirLeClient();
  try {
    let disque: string | null = null;
    if (e.candidats.length) {
      try {
        disque = disqueDesCopies(e.racine).raison;
      } catch {
        disque = null;
      }
    }
    return {
      accordes: await reserverDesCircuits(c.client, {
        ...e,
        disque,
        ...ordreDuGroupe(e),
        max: maxDuProjet(e.racine),
      }),
      faute: null,
    };
  } catch (x) {
    return {
      accordes: [],
      faute: `les places de la machine ne se lisent pas : ${(x as Error).message}`,
    };
  } finally {
    await c.fermer();
  }
}

export function tracerLaFile(e: Entree<'tracerLaFile'>): Promise<void> {
  ecrireLaTrace(e.racine, traceDeLaFile({ ticket: e.ticket, evenement: e.evenement }));
  return Promise.resolve();
}

export async function circuitsNonIntegres(e: Entree<'circuitsNonIntegres'>): Promise<string[]> {
  const c = ouvrirLeClient();
  try {
    return (await lireLesCircuits(c.client, e.racine)).map(x => x.ticket).sort();
  } finally {
    await c.fermer();
  }
}
