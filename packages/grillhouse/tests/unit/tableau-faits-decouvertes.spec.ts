// The tickets done today are the work really done: a finding just recorded, or rejected at its
// sorting, is none; a finding validated and led to its end, by the circuit or direct, is.
import { describe, expect, it } from 'vitest';
import { assembler } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-03T12:00:00Z');
const JOUR = MAINTENANT - 6 * 60 * MIN;

const T = (id: string, labels: string[]) => ({
  id,
  title: `${id.slice(5)} — sujet — composant`,
  status: 'closed',
  priority: 2,
  issue_type: 'task',
  labels,
  closed_at: '2026-11-03T10:00:00Z',
  close_reason: 'intégré : abc1234',
});

const faits = (tous: object[]) =>
  (
    assembler({
      tous,
      prefix: 'demo',
      registre: [],
      vivants: [],
      circuits: [],
      maintenant: MAINTENANT,
      jour: JOUR,
    }) as unknown as { faitsDuJour: { id: string }[] }
  ).faitsDuJour.map(f => f.id);

describe('les faits du jour sont le travail réellement fait', () => {
  it('une découverte consignée ou rejetée n’est pas un fait', () => {
    expect(faits([T('demo-a', ['decouverte']), T('demo-b', ['decouverte', 'sans-suite'])])).toEqual(
      []
    );
  });

  it('une découverte validée et menée par le circuit ou en direct est un fait', () => {
    expect(
      faits([
        T('demo-c', ['decouverte', 'a-porter', 'circuit']),
        T('demo-d', ['decouverte', 'direct']),
      ]).sort()
    ).toEqual(['demo-c', 'demo-d']);
  });
});
