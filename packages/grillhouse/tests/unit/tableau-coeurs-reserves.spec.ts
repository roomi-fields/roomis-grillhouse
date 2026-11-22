// Le panneau (scripts/tableau.mjs) dit les cœurs que réserve chaque circuit en phase, directs
// compris, et « attend N cœurs » pour un circuit qui attend ses cœurs ; « attend une place » reste
// celui de la place de circuit.
import { describe, expect, it } from 'vitest';
import { assembler, lignes } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-22T12:00:00Z');
const GO = 1024 ** 3;

interface Ligne {
  texte: string;
  ticket?: string;
  section?: string;
}

const T = (id: string, labels: string[]) => ({
  id,
  title: `${id.slice(id.indexOf('-') + 1)} — Un sujet — packages/x`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-22T09:00:00Z',
  labels,
});
const circuit = (ticket: string) => ({
  ticket,
  etape: 'testwriter',
  tentative: 1,
  finale: false,
  code: null,
  arret: null,
  raison: null,
  question: null,
  qui: null,
  questionnement: null,
  boucles: {},
  mene: null,
  avancement: null,
  vivant: true,
});
const prise = (ticket: string, coeurs: number) => ({
  id: `p-${ticket}`,
  pid: 1,
  projet: 'demo',
  ticket,
  sorte: 'Tests',
  rang: 1,
  coeurs,
  memoire: 4 * GO,
  etat: 'tient',
  depuis: MAINTENANT - 2 * MIN,
});
const machine = {
  budget: { coeurs: 28, memoire: 56 * GO },
  faute: null,
  prises: [prise('demo-1', 3), prise('demo-9', 2)],
  attentes: [
    {
      id: 'p-demo-2',
      pid: 2,
      projet: 'demo',
      ticket: 'demo-2',
      sorte: 'Tests',
      rang: 2,
      coeurs: 3,
      memoire: 4 * GO,
      etat: 'attend',
      depuis: MAINTENANT - 1 * MIN,
      raison: 'cœurs : 3 demandés, 1 libres sur 28',
    },
  ],
};
const plateau = () =>
  assembler({
    tous: [T('demo-1', ['circuit']), T('demo-2', ['circuit']), T('demo-9', ['direct'])],
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits: [circuit('demo-1'), circuit('demo-2')],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 10 * 60 * MIN,
    machine,
    places: null,
  } as unknown as Parameters<typeof assembler>[0]);
const agents = () => (lignes(plateau(), 'depot') as Ligne[]).filter(l => l.section === 'agents');
const tout = () => agents().map(l => l.texte);

describe('le panneau dit les cœurs réservés', () => {
  it('un circuit qui attend ses cœurs dit « attend N cœurs » avec le budget, et non « attend une place »', () => {
    const l = agents().find(x => x.ticket === 'demo-2');
    expect(l?.texte).toMatch(/attend 3 cœurs/);
    expect(l?.texte).toMatch(/28/);
    expect(l?.texte).not.toMatch(/attend une place/);
  });

  it('un circuit en phase montre les cœurs qu’il réserve', () => {
    const l = agents().find(x => x.ticket === 'demo-1');
    expect(l?.texte).toMatch(/3 cœurs/);
  });

  it('un direct en phase montre ses 2 cœurs réservés', () => {
    expect(tout().some(t => /9/.test(t) && /2 cœurs/.test(t))).toBe(true);
  });
});
