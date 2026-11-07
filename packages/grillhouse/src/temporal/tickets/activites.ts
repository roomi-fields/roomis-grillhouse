// The activities of the queue of the tickets of a project (./deroule.ts): the tickets that start,
// read from Beads in the main tree of the repository with the setting of its package.json, the
// circuits of the project alive and those not integrated, read from the server. A package.json that does not parse, or a Beads that fails, is a fault named, never a key
// absent nor an empty list.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { reglageDesCircuits } from '../../../scripts/circuits-cles.mjs';
import { lireLesTickets, ticketsAPartir as aPartir } from '../../../scripts/file-des-tickets.mjs';
import { ouvrirLeClient } from '../client.js';
import { lireLesCircuits } from '../circuit/client.js';
import { idDuCircuit } from '../circuit/contrat.js';
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
    partir: aPartir(tickets, { enCours: new Set(e.enCours) }).map(t => t.id),
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

export async function circuitsNonIntegres(e: Entree<'circuitsNonIntegres'>): Promise<string[]> {
  const c = ouvrirLeClient();
  try {
    return (await lireLesCircuits(c.client, e.racine)).map(x => x.ticket).sort();
  } finally {
    await c.fermer();
  }
}
