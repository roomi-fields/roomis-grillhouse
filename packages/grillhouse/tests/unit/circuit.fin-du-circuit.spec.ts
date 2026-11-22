// The end of a run (scripts/circuit.mjs, `aLaFin`): on a stop it hands to the supervisor, the run
// keeps its end with its results (`montee`: the code, the reason, the supervisor's session that ran
// it), which the bilan reads; at each end the bilan is emitted with the step and the reason the run
// ends on; the code the run returns is the one it ends with.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';

interface Effet {
  genre: string;
  entree?: { role: string; montee?: Record<string, unknown> };
  fin?: Record<string, unknown>;
  ticket?: string;
}
const aLaFin = circuit.aLaFin as (ctx: object, code: number) => number;

afterEach(() => vi.restoreAllMocks());

// A run's context, its root an absent directory: the removal of the finished copies fails and says
// so, which a test silences.
const contexte = (plus: object = {}) => ({
  rendus: [] as Effet[],
  ticket: 'demo-1',
  racine: '/nonexistent/depot',
  journal: '/nonexistent/journal',
  courante: undefined,
  courant: { etape: 'integre', raison: null, code: 0 },
  ...plus,
});
const jouer = (ctx: ReturnType<typeof contexte>, code: number) => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return aLaFin(ctx, code);
};
const montees = (ctx: ReturnType<typeof contexte>) =>
  ctx.rendus.filter(e => e.genre === 'fiche' && e.entree?.montee).map(e => e.entree!);
const bilans = (ctx: ReturnType<typeof contexte>) => ctx.rendus.filter(e => e.genre === 'bilan');

describe('la fin d’un circuit', () => {
  it('une fin sur un arrêt monté au superviseur garde le code, la raison et la séance du superviseur', () => {
    const ctx = contexte({
      superviseur: 'seance-du-superviseur',
      courant: { etape: 'code', raison: 'sans-livraison', code: 5 },
    });
    expect(jouer(ctx, 5)).toBe(5);
    expect(montees(ctx)).toEqual([
      expect.objectContaining({
        role: 'circuit',
        montee: { code: 5, raison: 'sans-livraison', superviseur: 'seance-du-superviseur' },
      }),
    ]);
  });

  it('sans séance de superviseur, la fin sur un arrêt n’en nomme aucune', () => {
    const ctx = contexte({ courant: { etape: 'code', raison: 'sans-livraison', code: 5 } });
    jouer(ctx, 5);
    expect(montees(ctx)[0]?.montee).toEqual({ code: 5, raison: 'sans-livraison' });
  });

  it('une fin intégrée ne garde aucune montée', () => {
    const ctx = contexte();
    expect(jouer(ctx, 0)).toBe(0);
    expect(montees(ctx)).toEqual([]);
  });

  it('émet le bilan du ticket avec l’étape, la raison et le code où le circuit finit', () => {
    const ctx = contexte({ courant: { etape: 'code', raison: 'sans-livraison', code: 5 } });
    jouer(ctx, 5);
    expect(bilans(ctx)).toEqual([
      {
        genre: 'bilan',
        ticket: 'demo-1',
        fin: { etape: 'code', raison: 'sans-livraison', code: 5 },
      },
    ]);
  });

  it('la montée est gardée avant le bilan qui la lit', () => {
    const ctx = contexte({ courant: { etape: 'code', raison: 'sans-livraison', code: 5 } });
    jouer(ctx, 5);
    expect(ctx.rendus.map(e => e.genre)).toEqual(['fiche', 'bilan']);
  });

  it('un état sans étape ni raison émet un bilan aux champs nuls', () => {
    const ctx = contexte({ courant: undefined });
    jouer(ctx, 0);
    expect(bilans(ctx)[0]?.fin).toEqual({ etape: null, raison: null, code: null });
  });
});
