// grillhouse-4nr.7, criteria 1, 2 and 4: the rule the workflow of the machine decides by
// (scripts/regles-des-places.mjs). The admission takes up
// the cases of tests/unit/places-de-la-machine.spec.ts (the load under the cores, 4 GB free); the
// refusal of a taking: the ceiling, the turn of a lower rank, the measure read only when the place
// and the turn pass, the spacing of the starts.
import { describe, expect, it } from 'vitest';
import { admission, refusDeLaPlace } from '../../scripts/regles-des-places.mjs';

const GO = 1024 ** 3;
const base = { coeurs: 12, charge: 1, memoireLibre: 16 * GO };
type Etat = Parameters<typeof refusDeLaPlace>[0];
const vide = (): Etat => ({ prises: [], attentes: [], dernier: 0 });
const prise = (etat: Etat, o: Partial<Parameters<typeof refusDeLaPlace>[1]> = {}) =>
  refusDeLaPlace(etat, {
    id: 'moi',
    rang: 5,
    plafond: 2,
    espacementMs: 0,
    maintenant: 100_000,
    mesurer: () => base,
    ...o,
  });

describe('l’admission à la charge et à la mémoire, les cas des places sur leur fichier', () => {
  it('under the load of the cores, with 4 GB free: admitted', () => {
    expect(admission(base)).toEqual({ ok: true });
  });
  it('a load that reaches the cores refuses, and says « charge »', () => {
    const r = admission({ ...base, charge: 12 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.raison).toContain('charge');
  });
  it('a load just under the cores passes', () => {
    expect(admission({ ...base, charge: 11.9 }).ok).toBe(true);
  });
  it('under 4 GB free refuses, and says « mémoire »', () => {
    const r = admission({ ...base, memoireLibre: 4 * GO - 1 });
    expect(!r.ok && r.raison).toContain('mémoire');
  });
  it('4 GB free exactly pass', () => {
    expect(admission({ ...base, memoireLibre: 4 * GO }).ok).toBe(true);
  });
});

describe('le refus d’une prise', () => {
  it('the ceiling reached refuses, and says « place »', () => {
    const etat = { ...vide(), prises: [{}, {}] };
    expect(prise(etat)).toContain('aucune place libre : 2 prises sur 2');
  });
  it('a wait of a lower rank keeps its turn, between projects', () => {
    const etat = {
      ...vide(),
      attentes: [{ id: 'autre', rang: 3, ticket: 'bp-1', raison: 'charge' }],
    };
    expect(prise(etat)).toContain('place réservée : bp-1');
    expect(prise(etat, { rang: 2 })).toBeNull();
  });
  it('the measure is read only when the place and the turn pass', () => {
    let lue = 0;
    const mesurer = () => {
      lue += 1;
      return base;
    };
    prise({ ...vide(), prises: [{}, {}] }, { mesurer });
    expect(lue).toBe(0);
    prise(vide(), { mesurer });
    expect(lue).toBe(1);
  });
  it('the load of the measure refuses', () => {
    expect(prise(vide(), { mesurer: () => ({ ...base, charge: 20 }) })).toContain('charge');
  });
  it('two starts closer than the spacing refuse, and say « espacement »', () => {
    const etat = { ...vide(), dernier: 95_000 };
    expect(prise(etat, { espacementMs: 10_000 })).toContain('espacement');
    expect(prise(etat, { espacementMs: 5_000 })).toBeNull();
  });
});
