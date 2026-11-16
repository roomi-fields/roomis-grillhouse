// A circuit stopped on the supervisor's word leaves the queue of the tickets: its label `circuit`
// is taken off, so that the queue, which starts every open ticket that holds it and whose circuit
// does not run (scripts/file-des-tickets.mjs), does not start it again; the run that opens on his
// answer to that stop puts the label back.
// Witness: SyntHub SH-ae6.6.1 under 0.40.0: `--arreter` after the review ACCEPTÉ wrote its stop
// at 11:15; at 11:16 the queue started the ticket again, which committed its lot and sent it to
// the CI (51edcf4), the supervisor's stop notwithstanding.
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import { ticketsAPartir } from '../../scripts/file-des-tickets.mjs';

type Effet = { genre: string } & Record<string, unknown>;
interface Ctx {
  ticket: string;
  contexte: string | null;
  paquets: string[];
  journal: string;
  rendus: Effet[];
}
const arreter = circuit.arreter as (ctx: Ctx, e: object) => Promise<number>;
const rentrerDansLaFile = circuit.rentrerDansLaFile as (ctx: Ctx, e: object | null) => void;

const ctx = (): Ctx => ({
  ticket: 'demo-1',
  contexte: 'le responsable relit le document avant que le lot entre.',
  paquets: ['packages/a'],
  journal: '/tmp/demo-1.log',
  rendus: [],
});
const etiquettes = (c: Ctx) => c.rendus.filter(e => e.genre === 'etiquettes');

describe('un circuit arrêté sur le mot du superviseur sort de la file des tickets', () => {
  it('the stop takes the label circuit off the ticket, after its state and its comment', async () => {
    const c = ctx();
    expect(await arreter(c, { etape: 'relecture', tentative: 1 })).toBe(0);
    expect(etiquettes(c)).toEqual([
      { genre: 'etiquettes', ticket: 'demo-1', etiquettes: [], retirees: ['circuit'] },
    ]);
    expect(c.rendus.map(e => e.genre).at(-1)).toBe('etiquettes');
  });

  it('the queue does not start a ticket whose label is off, its circuit ended', () => {
    const ticket = {
      id: 'demo-1',
      status: 'open',
      description: '## Architecture\n',
      dependencies: [],
    };
    const dansLaFile = { ...ticket, labels: ['circuit'] };
    expect(ticketsAPartir([dansLaFile]).map(t => t.id)).toEqual(['demo-1']);
    expect(ticketsAPartir([{ ...ticket, labels: [] }])).toEqual([]);
  });

  it('the run that opens on the answer to that stop puts the label back', () => {
    const c = ctx();
    rentrerDansLaFile(c, { etape: 'relecture', raison: 'arrete' });
    expect(etiquettes(c)).toEqual([
      { genre: 'etiquettes', ticket: 'demo-1', etiquettes: ['circuit'] },
    ]);
  });

  it('a run that opens on any other state leaves the labels as they are', () => {
    for (const e of [null, { etape: 'code', raison: 'sans-livraison' }, { etape: 'tests' }]) {
      const c = ctx();
      rentrerDansLaFile(c, e);
      expect(etiquettes(c)).toEqual([]);
    }
  });
});
