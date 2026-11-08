// Le bilan d'un ticket compte à part, par étape, la durée rejouée après un rouge et celle relue sans
// rejouer (scripts/bilan.mjs). Données d'essai : jamais le vrai registre.
import { describe, expect, it } from 'vitest';
import { bilan, texteDuBilan } from '../../scripts/bilan.mjs';

const TICKET = 'demo-9';
const S = 1000;
const MIN = 60 * S;
const T0 = Date.parse('2026-11-04T10:00:00Z');
const a = (m: number) => T0 + m * MIN;
const iso = (t: number) => new Date(t).toISOString();

const etape = (nom: string, d: number, f: number) => ({
  projet: '/depot',
  agent: `circuit:${TICKET}:${iso(a(d))}`,
  ticket: TICKET,
  role: 'circuit',
  etape: nom,
  debut: iso(a(d)),
  fin: iso(a(f)),
  travail: a(f) - a(d),
  tours: [[a(d), a(f)]],
  jetons: 0,
  cache: 0,
  cout: null,
});
const controles = (m: number, issue: string, finale: boolean, rouges?: string[]) => ({
  date: iso(a(m)),
  role: 'circuit',
  etape: 'controles',
  resultat: { issue, finale, ...(rouges ? { rouges } : {}) },
});
const arret = (m: number, nom: string, finale: boolean) => ({
  date: iso(a(m) + 1),
  role: 'circuit',
  etape: 'controles',
  arret: nom,
  finale,
});
const relue = (m: number, nom: string, ms: number, finale = false) => ({
  date: iso(a(m)),
  role: 'circuit',
  etape: nom,
  ...(finale ? { finale } : {}),
  relue: { ms },
});

interface Reprise {
  rejoue: { ms: number; parEtape: Record<string, number> };
  relu: { ms: number; parEtape: Record<string, number> };
}
const calculer = (lignes: object[], entrees: object[]) =>
  bilan({ ticket: TICKET, lignes, entrees, etat: null }) as unknown as {
    reprise: Reprise;
  } & Record<string, unknown>;

describe('le temps rejoué après un rouge et le temps relu sans rejouer, à part, par étape', () => {
  // Des contrôles rouges (1 min), la réponse, les mêmes contrôles rejoués (2 min) ; la preuve et la
  // passe finale relues sans se rejouer, leurs durées du dernier vert au ticket.
  const lignes = [etape('controles', 0, 1), etape('controles', 5, 7)];
  const entrees = [
    controles(1, 'rouge', false, ['packages/a : x']),
    arret(1, 'controles', false),
    relue(5, 'preuve', 3 * MIN),
    relue(5, 'controles', 6 * MIN, true),
    controles(7, 'vert', false),
  ];
  const b = calculer(lignes, entrees);

  it('la durée rejouée est celle de l’étape qui rejoue après son rouge, rangée par étape', () => {
    expect(b.reprise.rejoue.parEtape).toEqual({ controles: 2 * MIN });
    expect(b.reprise.rejoue.ms).toBe(2 * MIN);
  });

  it('la durée relue est celle que la relecture a évité de rejouer, rangée par étape', () => {
    expect(b.reprise.relu.parEtape).toEqual({ preuve: 3 * MIN, 'passe-finale': 6 * MIN });
    expect(b.reprise.relu.ms).toBe(9 * MIN);
  });

  it('un ticket sans rouge a un temps rejoué nul, et rien de relu', () => {
    const net = calculer([etape('controles', 0, 2)], [controles(2, 'vert', false)]);
    expect(net.reprise.rejoue).toEqual({ ms: 0, parEtape: {} });
    expect(net.reprise.relu).toEqual({ ms: 0, parEtape: {} });
  });

  it('un premier passage rouge n’est pas rejoué : seul ce qui reprend après lui l’est', () => {
    const seul = calculer(
      [etape('controles', 0, 1)],
      [controles(1, 'rouge', false, ['packages/a : x']), arret(1, 'controles', false)]
    );
    expect(seul.reprise.rejoue.ms).toBe(0);
  });

  it('le texte du bilan dit le temps rejoué et le temps relu', () => {
    const texte = texteDuBilan(b as never, null);
    expect(texte).toMatch(/rejou/i);
    expect(texte).toMatch(/relu/i);
  });
});
