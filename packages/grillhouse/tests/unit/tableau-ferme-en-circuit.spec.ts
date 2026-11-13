// A ticket whose circuit is launched and not integrated is in progress on the board, whatever its
// status: the queue closes a ticket before it reads the CI, and reopens it if red; a circuit that
// stopped before its integration waits. Closed with no circuit, or its circuit integrated, it is
// done.
import { describe, expect, it } from 'vitest';
import { assembler } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-03T12:00:00Z');
const JOUR = MAINTENANT - 6 * 60 * MIN;
const FERME_AUJOURDHUI = '2026-11-03T10:00:00Z';

const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — sujet — composant`,
  status: 'closed',
  priority: 2,
  issue_type: 'task',
  labels: ['circuit'],
  closed_at: FERME_AUJOURDHUI,
  ...o,
});

type Ligne = { id: string };
type Plateau = {
  global: { compteurs: Record<string, number> };
  faitsDuJour: Ligne[];
  chantiers: { id: string; etat: string }[];
  autres: Ligne[];
  etats: { cle: string; tickets: Ligne[] }[];
};

const plateau = (tous: object[], circuits: object[]) =>
  assembler({
    tous,
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits,
    maintenant: MAINTENANT,
    jour: JOUR,
  }) as unknown as Plateau;

const MERE = T('demo-m', { issue_type: 'epic', status: 'open', closed_at: undefined });
const FILLE = (o: object = {}) => T('demo-m.1', { parent: 'demo-m', ...o });
const dans = (p: Plateau, cle: string) =>
  p.etats.find(e => e.cle === cle)?.tickets.map(t => t.id) ?? [];

describe('un ticket fermé dont le circuit vit est en cours au panneau', () => {
  it('il est compté en cours et non en fermés', () => {
    const p = plateau([T('demo-a')], [circuitLu('demo-a', { vivant: true })]);
    expect(p.global.compteurs.enCours).toBe(1);
    expect(p.global.compteurs.fermes).toBe(0);
  });

  it('deux tickets fermés à circuit vivant sont tous deux en cours', () => {
    const p = plateau(
      [T('demo-a'), T('demo-b')],
      [circuitLu('demo-a', { vivant: true }), circuitLu('demo-b', { vivant: true })]
    );
    expect(p.global.compteurs.enCours).toBe(2);
    expect(p.global.compteurs.fermes).toBe(0);
  });
});

describe('un ticket fermé sans circuit, ou au circuit intégré, est fait', () => {
  it('sans circuit il est compté fermé et entre aux faits du jour', () => {
    const p = plateau([T('demo-a')], []);
    expect(p.global.compteurs.fermes).toBe(1);
    expect(p.global.compteurs.enCours).toBe(0);
    expect(p.faitsDuJour.map(t => t.id)).toEqual(['demo-a']);
  });

  it('un circuit intégré le laisse fait', () => {
    const p = plateau([T('demo-a')], [circuitLu('demo-a', { etape: 'integre', integre: true })]);
    expect(p.global.compteurs.fermes).toBe(1);
    expect(p.global.compteurs.enCours).toBe(0);
    expect(p.faitsDuJour.map(t => t.id)).toEqual(['demo-a']);
  });

  it.each([
    ['arrêté', { vivant: false, arret: 'manuel' }],
    ['en attente de réponse', { vivant: false, question: 'Que faire ?', qui: 'superviseur' }],
    ['en erreur', { vivant: false, code: 'erreur', raison: 'échec' }],
  ])('un circuit %s pas encore intégré le garde en cours, hors des faits', (_nom, c) => {
    const p = plateau([T('demo-a')], [circuitLu('demo-a', c)]);
    expect(p.global.compteurs.fermes).toBe(0);
    expect(p.global.compteurs.enCours).toBe(1);
    expect(p.faitsDuJour).toEqual([]);
  });

  it("le circuit vivant d'un autre ticket ne change pas son état", () => {
    const p = plateau([T('demo-a'), T('demo-b')], [circuitLu('demo-b', { vivant: true })]);
    expect(p.global.compteurs.fermes).toBe(1);
    expect(p.global.compteurs.enCours).toBe(1);
    expect(p.faitsDuJour.map(t => t.id)).toEqual(['demo-a']);
  });
});

describe('un ticket fermé dont le circuit vit n’entre aux faits du jour qu’à son intégration', () => {
  it('il n’est pas listé tant que son circuit vit', () => {
    const p = plateau([T('demo-a'), T('demo-b')], [circuitLu('demo-a', { vivant: true })]);
    expect(p.faitsDuJour.map(t => t.id)).toEqual(['demo-b']);
  });

  it('il y entre dès que son circuit est intégré', () => {
    const vit = plateau([T('demo-a')], [circuitLu('demo-a', { vivant: true })]);
    const fini = plateau([T('demo-a')], [circuitLu('demo-a', { etape: 'integre', integre: true })]);
    expect(vit.faitsDuJour).toEqual([]);
    expect(fini.faitsDuJour.map(t => t.id)).toEqual(['demo-a']);
  });
});

describe('le panneau classe un ticket fermé à circuit vivant en cours dans ses vues', () => {
  it('la vue des états le range sous en cours, pas sous fermés', () => {
    const tous = [MERE, FILLE()];
    const p = plateau(tous, [circuitLu('demo-m.1', { vivant: true })]);
    expect(dans(p, 'enCours')).toContain('demo-m.1');
    expect(dans(p, 'fermes')).not.toContain('demo-m.1');
  });

  it('une mère dont un ticket fermé a un circuit vivant est un chantier en cours', () => {
    const p = plateau([MERE, FILLE()], [circuitLu('demo-m.1', { vivant: true })]);
    expect(p.chantiers.map(c => [c.id, c.etat])).toEqual([['demo-m', 'enCours']]);
    expect(p.autres).toEqual([]);
  });

  it('un ticket fermé à circuit vivant a son circuit listé', () => {
    const passage = (role: string, h: number) => ({
      projet: '/depot',
      agent: `a-${role}`,
      ticket: 'demo-a',
      role,
      debut: `2026-11-03T0${h}:00:00Z`,
      fin: `2026-11-03T0${h}:30:00Z`,
      travail: 30 * MIN,
      jetons: 10,
    });
    const p = assembler({
      tous: [T('demo-a')],
      prefix: 'demo',
      registre: [passage('testwriter', 6), passage('developpeur', 7), passage('relecteur', 8)],
      vivants: [],
      circuits: [circuitLu('demo-a', { vivant: true })],
      maintenant: MAINTENANT,
      jour: JOUR,
    }) as unknown as {
      circuits: { ticket?: string; id?: string }[];
    };
    expect(p.circuits.map(c => c.ticket ?? c.id)).toContain('demo-a');
  });

  it("la même mère, son circuit intégré, n'est pas un chantier en cours", () => {
    const p = plateau(
      [MERE, FILLE()],
      [circuitLu('demo-m.1', { etape: 'integre', integre: true })]
    );
    expect(p.chantiers).toEqual([]);
    expect(p.autres.map(c => c.id)).toEqual(['demo-m']);
  });
});
