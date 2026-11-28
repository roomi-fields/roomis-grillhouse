// Le tableau d'un projet dont la limite de circuits (`grillhouse.circuits`, donnée à `assembler`
// par `limite`) est tenue nomme, sous AGENTS, chaque circuit en attente du superviseur qui la
// tient ; un projet sous sa limite, ou un circuit en attente du responsable, n'est pas nommé.
import { describe, expect, it } from 'vitest';
import { assembler, lignes } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-02T17:25:00Z');
interface Ligne {
  texte: string;
  section?: string;
}
const T = (id: string) => ({
  id,
  title: `${id.slice(id.lastIndexOf('-') + 1)} — Sujet — packages/x`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-02T17:00:00Z',
  labels: ['circuit'],
});
const circuit = (ticket: string, o: object = {}) => ({
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
  ...o,
});
const enQuestion = (ticket: string, qui: string | null) =>
  circuit(ticket, { vivant: false, arret: 'question', question: 'Que faire ?', qui });

const limites = (tous: object[], circuits: object[], limite: number) => {
  const p = assembler({
    tous,
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 12 * 60 * MIN,
    machine: null,
    places: null,
    limite,
  } as unknown as Parameters<typeof assembler>[0]);
  return (lignes(p, 'depot') as Ligne[])
    .filter(l => l.section === 'agents' && /limite/i.test(l.texte))
    .map(l => l.texte)
    .join('\n');
};

describe('le tableau d’un projet à sa limite de circuits', () => {
  const tous = [T('demo-11'), T('demo-12'), T('demo-13')];

  it('nomme chaque circuit en attente du superviseur qui tient la limite', () => {
    const t = limites(tous, [enQuestion('demo-11', 'superviseur'), enQuestion('demo-12', null)], 2);
    expect(t).toMatch(/superviseur/);
    expect(t).toMatch(/\b11\b/);
    expect(t).toMatch(/\b12\b/);
  });

  it('ne nomme pas un circuit en attente du responsable', () => {
    const t = limites(
      tous,
      [enQuestion('demo-11', 'superviseur'), enQuestion('demo-12', 'responsable')],
      1
    );
    expect(t).toMatch(/\b11\b/);
    expect(t).not.toMatch(/\b12\b/);
  });

  it('ne nomme rien pour un projet sous sa limite', () => {
    expect(limites(tous, [enQuestion('demo-11', 'superviseur')], 2)).toBe('');
  });

  it('ne nomme pas un circuit qui travaille', () => {
    const t = limites(tous, [enQuestion('demo-11', 'superviseur'), circuit('demo-13')], 2);
    expect(t).toMatch(/\b11\b/);
    expect(t).not.toMatch(/\b13\b/);
  });
});

// Le report à une heure : `defer_until` en heure murale locale, le « Z » de Beads non voulu.
describe('la ligne « limite » et le report d’une question', () => {
  const reporte = { ...T('demo-11'), status: 'deferred', defer_until: '2026-11-02T14:00:00Z' };
  const a = (h: number, m: number, ticket: object = reporte) => {
    const p = assembler({
      tous: [ticket],
      prefix: 'demo',
      registre: [],
      vivants: [],
      circuits: [enQuestion('demo-11', 'superviseur')],
      maintenant: new Date(2026, 10, 2, h, m).getTime(),
      jour: new Date(2026, 10, 2, 0, 0).getTime(),
      machine: null,
      places: null,
      limite: 1,
    } as unknown as Parameters<typeof assembler>[0]);
    return (lignes(p, 'depot') as Ligne[])
      .filter(l => l.section === 'agents' && /^limite/i.test(l.texte))
      .map(l => l.texte)
      .join('\n');
  };

  it('ne compte pas un circuit au superviseur reporté avant son heure', () => {
    expect(a(13, 59)).toBe('');
  });

  it('compte et nomme ce circuit une fois l’heure passée, son ticket resté différé', () => {
    expect(a(14, 1)).toMatch(/^Limite 1\/1 .*superviseur : 11\b/);
  });

  it('ne compte jamais un ticket différé sans heure', () => {
    expect(a(14, 1, { ...T('demo-11'), status: 'deferred' })).toBe('');
  });
});
