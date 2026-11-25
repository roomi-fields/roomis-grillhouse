// The reading of the circuits of a repository (`lireLesCircuits`) asks the server for the runs of
// that root alone, the integrated ones left out unless asked for, and still gives the last run of
// each ticket. The client is a stand-in whose list applies the clauses of a query as the server of
// Temporal does: a comparison, `!=` too, never matches an attribute a workflow does not have.
import type { Client } from '@temporalio/client';
import { describe, expect, it } from 'vitest';
import { lireLesCircuits } from '../../src/temporal/circuit/client.js';
import { idDuCircuit } from '../../src/temporal/circuit/contrat.js';

const RACINE = '/depot/essai';

interface Passe {
  ticket: string;
  racine: string;
  etape: string | null;
  statut: string;
  rang: number;
}

// One run of the circuit of <ticket> at the step <etape> (null: nothing published yet), started
// after the runs written before it.
let rang = 0;
const passe = (ticket: string, etape: string | null, statut = 'COMPLETED', racine = RACINE) => ({
  ticket,
  racine,
  etape,
  statut,
  rang: ++rang,
});

// Whether the clause <clause> of a query holds for the run <p>.
function tient(p: Passe, clause: string): boolean {
  const valeur: Record<string, string | null> = {
    WorkflowType: 'circuitDuTicket',
    WorkflowId: idDuCircuit(p.racine, p.ticket),
    GrillhouseEtape: p.etape,
    GrillhouseTicket: p.etape === null ? null : p.ticket,
  };
  const ou = /^\((.*) OR (.*)\)$/.exec(clause);
  if (ou) {
    return tient(p, ou[1]!) || tient(p, ou[2]!);
  }
  const m = /^(\w+) (=|!=|STARTS_WITH|IN|IS NULL)(?: (.*))?$/.exec(clause);
  if (!m || !(m[1]! in valeur)) {
    throw new Error(`clause inconnue : ${clause}`);
  }
  const [, nom, operateur, reste = ''] = m;
  const lu = valeur[nom!]!;
  if (operateur === 'IS NULL') {
    return lu === null;
  }
  const dits = [...reste.matchAll(/'([^']*)'/g)].map(x => x[1]!);
  if (lu === null) {
    return false;
  }
  if (operateur === 'STARTS_WITH') {
    return lu.startsWith(dits[0]!);
  }
  return operateur === '!=' ? lu !== dits[0] : dits.includes(lu);
}

// The client of a server that holds <passes>; each run its lists give is written in <recus>.
function serveur(passes: Passe[]) {
  const recus: Passe[] = [];
  const client = {
    workflow: {
      list: ({ query }: { query: string }) =>
        (async function* () {
          await Promise.resolve();
          for (const p of passes.filter(p => query.split(' AND ').every(c => tient(p, c)))) {
            recus.push(p);
            yield {
              workflowId: idDuCircuit(p.racine, p.ticket),
              runId: String(p.rang),
              startTime: new Date(p.rang),
              status: { name: p.statut },
              memo: p.etape ? { etape: p.etape } : {},
            };
          }
        })(),
    },
  } as unknown as Client;
  return { client, recus };
}

const passes = {
  neuf: passe('neuf', null, 'RUNNING'),
  enCours: passe('en-cours', 'developpeur', 'RUNNING'),
  ancienArret: passe('arrete', 'arrete'),
  arrete: passe('arrete', 'arrete'),
  integre: passe('integre', 'integre'),
  // Stopped, then started again and integrated: its older run is no longer its circuit.
  avantIntegration: passe('repris', 'arrete'),
  repris: passe('repris', 'integre'),
  // Integrated, then started again: its newer run is its circuit.
  avantRelance: passe('relance', 'integre'),
  relance: passe('relance', 'testwriter', 'RUNNING'),
  ailleurs: passe('ailleurs', 'developpeur', 'RUNNING', `${RACINE}-voisin`),
};
const lus = async (racine: string, options?: { integres: boolean }) => {
  const s = serveur(Object.values(passes));
  const circuits = await lireLesCircuits(s.client, racine, options);
  return { circuits: circuits.map(c => [c.ticket, c.run, c.integre]), recus: s.recus };
};
const ligne = (p: Passe, integre = false) => [p.ticket, String(p.rang), integre];

describe('the reading of the circuits of a repository', () => {
  it('gives the last run of each ticket of the root, an integrated ticket left out with its older runs', async () => {
    expect((await lus(RACINE)).circuits).toEqual(
      [passes.arrete, passes.enCours, passes.neuf, passes.relance].map(p => ligne(p))
    );
  });

  it('gives the integrated tickets too when they are asked for', async () => {
    expect((await lus(RACINE, { integres: true })).circuits).toEqual([
      ligne(passes.arrete),
      ligne(passes.enCours),
      ligne(passes.integre, true),
      ligne(passes.neuf),
      ligne(passes.relance),
      ligne(passes.repris, true),
    ]);
  });

  it('receives from the server no run of another root, and the integrated runs only of a ticket whose other run has ended', async () => {
    const { recus } = await lus(RACINE);
    expect(recus.filter(p => p.racine !== RACINE)).toEqual([]);
    expect(recus.filter(p => p.etape === 'integre')).toEqual([passes.repris]);
    const tout = await lus(RACINE, { integres: true });
    expect(tout.recus.filter(p => p.racine !== RACINE)).toEqual([]);
  });

  it('a root with a quote or a backslash is read too, its query never holding them', async () => {
    for (const racine of ["/depot/l'essai", '/depot/a\\b']) {
      const s = serveur([passe('seul', 'developpeur', 'RUNNING', racine)]);
      expect((await lireLesCircuits(s.client, racine)).map(c => c.ticket)).toEqual(['seul']);
    }
  });
});
