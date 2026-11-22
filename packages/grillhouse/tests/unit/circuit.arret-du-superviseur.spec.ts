// Le circuit arrêté sur le mot du superviseur (`--arreter`, `arreter` de scripts/circuit.mjs) : son
// état garde l'étape et dit l'arrêt « arrete », la question levée, son motif gardé et dit au ticket ;
// son code de sortie est 0. Un test petit : la fonction est appelée sur un contexte d'essai.
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';

type Effet = { genre: string } & Record<string, unknown>;
interface Ctx {
  ticket: string;
  contexte: string | null;
  paquets: string[];
  journal: string;
  rendus: Effet[];
}
const arreter = circuit.arreter as (ctx: Ctx, e: object) => Promise<number>;

const ctx = (contexte: string | null): Ctx => ({
  ticket: 'demo-1',
  contexte,
  paquets: ['packages/forms'],
  journal: '/tmp/demo-1.log',
  rendus: [],
});
const etatEcrit = (c: Ctx) =>
  c.rendus.find(e => e.genre === 'etat')!.etat as Record<string, unknown>;
const commentaires = (c: Ctx) =>
  c.rendus.filter(e => e.genre === 'commentaire').map(e => String(e.texte));

describe('un circuit arrêté sur le mot du superviseur', () => {
  it('garde son étape, dit l’arrêt « arrete » sans code d’échec, la question levée, le motif en rapport', async () => {
    const c = ctx('Le ticket change de plan.');
    const code = await arreter(c, {
      etape: 'testwriter',
      tentative: 1,
      question: { arret: 'hors-plan' },
      rapport: 'ancien rapport',
    });
    expect(code).toBe(0);
    expect(etatEcrit(c)).toMatchObject({
      etape: 'testwriter',
      tentative: 1,
      raison: 'arrete',
      code: null,
      question: null,
      rapport: 'Le superviseur arrête le circuit : Le ticket change de plan.',
    });
  });

  it('dit son motif au ticket', async () => {
    const c = ctx('Le ticket change de plan.');
    await arreter(c, { etape: 'testwriter', tentative: 1 });
    expect(commentaires(c)).toContain(
      'Circuit · arret : le superviseur arrête le circuit : Le ticket change de plan.'
    );
  });

  it('sans motif, garde le rapport de l’arrêt d’avant et le dit au ticket sans motif', async () => {
    const c = ctx(null);
    await arreter(c, { etape: 'developpeur', tentative: 2, rapport: 'le rapport d’avant' });
    expect(etatEcrit(c)).toMatchObject({
      etape: 'developpeur',
      raison: 'arrete',
      rapport: 'le rapport d’avant',
    });
    expect(commentaires(c)).toContain('Circuit · arret : le superviseur arrête le circuit.');
  });

  it('garde la finale des contrôles où il s’arrête', async () => {
    const c = ctx('Pour relire.');
    await arreter(c, { etape: 'controles', tentative: 0, finale: true });
    expect(etatEcrit(c)).toMatchObject({ etape: 'controles', finale: true });
  });
});
