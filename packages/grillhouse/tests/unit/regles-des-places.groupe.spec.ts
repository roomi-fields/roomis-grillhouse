/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// Les places des circuits entre les projets d'un groupe (scripts/regles-des-places.mjs,
// `reserverDesCircuits`). La demande d'un projet porte, par candidat, sa priorité Beads (0 à 4) et
// sa date de création (`priorites: { <ticket>: { priorite, creation } }`), et le groupe du projet
// (`groupe`, l'identité du groupe déclaré, absente hors groupe) ; la place d'un circuit garde sa
// `priorite`, sa `creation` et son `groupe`. La priorité ne se compare qu'entre circuits d'un même
// groupe : ses circuits non accordés se redistribuent leurs propres rangs d'arrivée par priorité,
// ancienneté, puis rang. Un projet hors groupe et l'ordre des groupes restent à l'ordre d'arrivée.
// Un circuit déjà accordé garde sa place.
import { describe, expect, it } from 'vitest';
import { reserverDesCircuits } from '../../scripts/regles-des-places.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Place = { racine: string; ticket: string; rang: number; accordee: boolean; [k: string]: any };
const MAINTENANT = 1_000_000;
const G = 'groupe-sh-ob';
const AUTRE_G = 'groupe-autre';

// Une demande du projet <racine> : ses candidats, chacun sa priorité et sa création.
function demander(
  places: Place[],
  racine: string,
  candidats: Array<[string, number, string?]>,
  o: { groupe?: string; plafond: number; rang: number; vivants?: string[] }
) {
  const priorites = Object.fromEntries(
    candidats.map(([t, p, c]) => [t, { priorite: p, creation: c ?? '2026-11-01T10:00:00Z' }])
  );
  return (reserverDesCircuits as any)(
    places,
    {
      racine,
      candidats: candidats.map(c => c[0]),
      vivants: o.vivants,
      priorites,
      ...(o.groupe === undefined ? {} : { groupe: o.groupe }),
    },
    { rang: o.rang, plafond: o.plafond, maintenant: MAINTENANT }
  ) as { circuits: Place[]; rang: number; accordes: string[] };
}
const de = (circuits: Place[], ticket: string) => circuits.find(c => c.ticket === ticket)!;
const accordes = (circuits: Place[]) =>
  circuits
    .filter(c => c.accordee)
    .map(c => c.ticket)
    .sort();

// Une place tenue par un circuit d'un autre projet : tous les autres attendent derrière elle.
const OCCUPEE: Place = {
  racine: '/z',
  ticket: 'z-1',
  rang: 0,
  accordee: true,
  depuis: MAINTENANT,
  vu: MAINTENANT,
};

// Les trois demandes arrivent dans <ordre> contre une place tenue (plafond 1), chacune au rang
// suivant ; puis la place se libère (plafond 2, une seule libre) : qui passe ?
function arrivees(ordre: Array<'sh' | 'ob' | 'osd'>) {
  const projets = {
    sh: { racine: '/sh', ticket: 'sh-1', priorite: 1, groupe: G },
    ob: { racine: '/ob', ticket: 'ob-1', priorite: 0, groupe: G },
    osd: { racine: '/osd', ticket: 'osd-1', priorite: 0, groupe: undefined },
  };
  let places: Place[] = [OCCUPEE];
  let rang = 0;
  for (const p of ordre) {
    const x = projets[p];
    const r = demander(places, x.racine, [[x.ticket, x.priorite]], {
      groupe: x.groupe,
      plafond: 1,
      rang,
    });
    places = r.circuits;
    rang = r.rang;
  }
  return { places, rang };
}
const liberer = (places: Place[], rang: number, places_libres = 1) =>
  demander(places, '/sh', [['sh-1', 1]], { groupe: G, plafond: 1 + places_libres, rang });

describe('entre les projets d’un groupe, les circuits en attente partent par priorité', () => {
  it('une priorité plus haute (P0) passe devant une plus basse (P1) arrivée avant, du même groupe', () => {
    let places: Place[] = [OCCUPEE];
    let r = demander(places, '/sh', [['sh-1', 1]], { groupe: G, plafond: 1, rang: 0 });
    r = demander(r.circuits, '/ob', [['ob-1', 0]], { groupe: G, plafond: 1, rang: r.rang });
    places = r.circuits;
    expect(accordes(places)).toEqual(['z-1']);
    // Une place se libère : osc-bridge, P0, part avant SyntHub, P1, arrivé le premier.
    const suite = demander(places, '/ob', [['ob-1', 0]], { groupe: G, plafond: 2, rang: r.rang });
    expect(accordes(suite.circuits)).toEqual(['ob-1', 'z-1']);
    expect(suite.accordes).toEqual(['ob-1']);
  });

  it('les rangs d’arrivée des circuits en attente du groupe se redistribuent par priorité', () => {
    const { places } = arrivees(['sh', 'ob']);
    // La passe des demandes suivantes redistribue : sh-1 avait le rang 1, ob-1 le rang 2.
    const r = demander(places, '/ob', [['ob-1', 0]], { groupe: G, plafond: 1, rang: 2 });
    expect(de(r.circuits, 'ob-1').rang).toBe(1);
    expect(de(r.circuits, 'sh-1').rang).toBe(2);
  });

  it('à priorité égale, le plus ancien passe devant, même arrivé après', () => {
    let r = demander([OCCUPEE], '/sh', [['sh-1', 1, '2026-11-02T10:00:00Z']], {
      groupe: G,
      plafond: 1,
      rang: 0,
    });
    r = demander(r.circuits, '/ob', [['ob-1', 1, '2026-10-20T10:00:00Z']], {
      groupe: G,
      plafond: 2,
      rang: r.rang,
    });
    expect(accordes(r.circuits)).toEqual(['ob-1', 'z-1']);
  });

  it('à priorité et ancienneté égales, le rang d’arrivée tranche', () => {
    let r = demander([OCCUPEE], '/sh', [['sh-1', 1]], { groupe: G, plafond: 1, rang: 0 });
    r = demander(r.circuits, '/ob', [['ob-1', 1]], { groupe: G, plafond: 2, rang: r.rang });
    expect(accordes(r.circuits)).toEqual(['sh-1', 'z-1']);
  });

  it('la priorité se lit de P0 à P4 : P4 passe après P3, P2 après P1', () => {
    let r = demander([OCCUPEE], '/sh', [['sh-4', 4]], { groupe: G, plafond: 1, rang: 0 });
    r = demander(r.circuits, '/ob', [['ob-3', 3]], { groupe: G, plafond: 1, rang: r.rang });
    r = demander(
      r.circuits,
      '/sh',
      [
        ['sh-4', 4],
        ['sh-2', 2],
      ],
      {
        groupe: G,
        plafond: 2,
        rang: r.rang,
      }
    );
    expect(accordes(r.circuits)).toEqual(['sh-2', 'z-1']);
  });

  it('plusieurs candidats d’un même projet se classent aussi par priorité', () => {
    const r = demander(
      [OCCUPEE],
      '/sh',
      [
        ['sh-1', 3],
        ['sh-2', 0],
        ['sh-3', 2],
      ],
      { groupe: G, plafond: 2, rang: 0 }
    );
    expect(accordes(r.circuits)).toEqual(['sh-2', 'z-1']);
    expect(r.accordes).toEqual(['sh-2']);
  });
});

describe('hors du groupe, l’ordre d’arrivée reste', () => {
  it('trois tickets, une place : osc-bridge (P0) part avant SyntHub (P1) du même groupe', () => {
    const { places, rang } = arrivees(['sh', 'ob', 'osd']);
    const r = liberer(places, rang);
    expect(accordes(r.circuits)).toEqual(['ob-1', 'z-1']);
  });

  it('OSD (P0, hors groupe) arrivé après garde son rang derrière les deux du groupe', () => {
    const { places, rang } = arrivees(['sh', 'ob', 'osd']);
    const r = liberer(places, rang);
    expect(de(r.circuits, 'osd-1').accordee).toBe(false);
    expect(de(r.circuits, 'osd-1').rang).toBeGreaterThan(de(r.circuits, 'sh-1').rang);
    expect(de(r.circuits, 'osd-1').rang).toBeGreaterThan(de(r.circuits, 'ob-1').rang);
    // Deux places libres : les deux du groupe, avant OSD.
    const deux = liberer(places, rang, 2);
    expect(accordes(deux.circuits)).toEqual(['ob-1', 'sh-1', 'z-1']);
  });

  it('OSD (P0, hors groupe) arrivé le premier part le premier, malgré sa priorité contre P1', () => {
    const { places, rang } = arrivees(['osd', 'sh', 'ob']);
    expect(de(places, 'osd-1').rang).toBeLessThan(de(places, 'sh-1').rang);
    const r = liberer(places, rang);
    expect(accordes(r.circuits)).toEqual(['osd-1', 'z-1']);
    const deux = liberer(places, rang, 2);
    expect(accordes(deux.circuits)).toEqual(['ob-1', 'osd-1', 'z-1']);
  });

  it('un projet hors groupe n’est jamais doublé par la priorité d’un autre : P4 arrivé avant P0', () => {
    let r = demander([OCCUPEE], '/osd', [['osd-1', 4]], { plafond: 1, rang: 0 });
    r = demander(r.circuits, '/sh', [['sh-1', 0]], { groupe: G, plafond: 2, rang: r.rang });
    expect(accordes(r.circuits)).toEqual(['osd-1', 'z-1']);
  });

  it('deux groupes différents ne se comparent pas : l’ordre d’arrivée tranche entre eux', () => {
    let r = demander([OCCUPEE], '/sh', [['sh-1', 3]], { groupe: G, plafond: 1, rang: 0 });
    r = demander(r.circuits, '/x', [['x-1', 0]], { groupe: AUTRE_G, plafond: 2, rang: r.rang });
    expect(accordes(r.circuits)).toEqual(['sh-1', 'z-1']);
    expect(de(r.circuits, 'sh-1').rang).toBeLessThan(de(r.circuits, 'x-1').rang);
  });
});

describe('un circuit déjà accordé garde sa place', () => {
  it('une priorité plus haute arrivée ensuite ne la reprend pas', () => {
    let r = demander([], '/sh', [['sh-1', 1]], { groupe: G, plafond: 1, rang: 0 });
    expect(accordes(r.circuits)).toEqual(['sh-1']);
    r = demander(r.circuits, '/ob', [['ob-1', 0]], { groupe: G, plafond: 1, rang: r.rang });
    expect(accordes(r.circuits)).toEqual(['sh-1']);
    expect(de(r.circuits, 'sh-1').rang).toBeLessThan(de(r.circuits, 'ob-1').rang);
  });

  it('elle passe devant les seuls circuits en attente du même groupe', () => {
    // sh-2 (P2) attend, puis ob-1 (P0) arrive ; sh-1 (P1) tient déjà une place sur deux.
    let r = demander([], '/sh', [['sh-1', 1]], { groupe: G, plafond: 2, rang: 0 });
    r = demander(
      r.circuits,
      '/sh',
      [
        ['sh-1', 1],
        ['sh-2', 2],
      ],
      {
        groupe: G,
        plafond: 2,
        rang: r.rang,
        vivants: undefined,
      }
    );
    expect(accordes(r.circuits)).toEqual(['sh-1', 'sh-2']);
    // La même histoire, une place de moins : sh-1 tient, sh-2 attend, ob-1 (P0) passe devant sh-2.
    let s = demander([], '/sh', [['sh-1', 1]], { groupe: G, plafond: 1, rang: 0 });
    s = demander(
      s.circuits,
      '/sh',
      [
        ['sh-1', 1],
        ['sh-2', 2],
      ],
      {
        groupe: G,
        plafond: 1,
        rang: s.rang,
      }
    );
    s = demander(s.circuits, '/ob', [['ob-1', 0]], { groupe: G, plafond: 1, rang: s.rang });
    expect(accordes(s.circuits)).toEqual(['sh-1']);
    expect(de(s.circuits, 'ob-1').rang).toBeLessThan(de(s.circuits, 'sh-2').rang);
    const libre = demander(s.circuits, '/ob', [['ob-1', 0]], {
      groupe: G,
      plafond: 2,
      rang: s.rang,
    });
    expect(accordes(libre.circuits)).toEqual(['ob-1', 'sh-1']);
  });
});

describe('sans priorité ni groupe, l’ordre d’arrivée seul décide', () => {
  it('une demande à l’ancienne (candidats seuls) garde l’ordre d’arrivée de chaque projet', () => {
    let r = (reserverDesCircuits as any)(
      [OCCUPEE],
      { racine: '/sh', candidats: ['sh-1'] },
      { rang: 0, plafond: 1, maintenant: MAINTENANT }
    );
    r = (reserverDesCircuits as any)(
      r.circuits,
      { racine: '/ob', candidats: ['ob-1'] },
      { rang: r.rang, plafond: 2, maintenant: MAINTENANT }
    );
    expect(accordes(r.circuits)).toEqual(['sh-1', 'z-1']);
  });
});
