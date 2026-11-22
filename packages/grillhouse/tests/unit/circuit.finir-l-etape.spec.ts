// `finirLEtape` et `commencerLEtape` (scripts/circuit.mjs) : une étape que le circuit mène lui-même
// (la preuve, les contrôles, l'intégration, la file) nomme son début dans l'état pendant qu'elle
// tourne (`mene`), et écrit sa ligne au registre à sa fin, quelle que soit son issue ; une étape
// qu'un agent mène n'en écrit aucune. Des tests petits : les effets sont rassemblés, rien n'est
// écrit ailleurs que dans le dossier d'essai.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { commencerLEtape, finirLEtape } from '../../scripts/circuit.mjs';

interface Effet {
  genre: string;
  ligne?: {
    role: string;
    etape: string;
    ticket: string;
    debut: string;
    fin: string;
    jetons: number;
  };
}
interface Ctx {
  racine: string;
  ticket: string;
  tmp: string;
  rendus: Effet[];
  courant?: { mene: string | null };
  [cle: string]: unknown;
}
type Menee = { etape: string; debut: string } | null;
const commencer = commencerLEtape as (
  ctx: Ctx,
  e: { etape: string; tentative: number; rapport: string | null; finale: boolean }
) => { etat: { etape: string }; menee: Menee };
const finir = finirLEtape as (ctx: Ctx, menee: Menee) => void;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-finir-l-etape-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

function contexte(): Ctx {
  const tmp = mkdtempSync(path.join(ESSAIS, 'ticket-'));
  return {
    racine: '/depot',
    ticket: 'demo-1',
    tmp,
    journal: path.join(tmp, 'journal'),
    etat: path.join(tmp, 'etat.json'),
    fiches: path.join(tmp, 'fiches.jsonl'),
    base: { dossier: tmp },
    rendus: [],
  };
}
const debut = (etape: string) => ({ etape, tentative: 1, rapport: null, finale: false });
const lignes = (ctx: Ctx) => ctx.rendus.filter(e => e.genre === 'registre').map(e => e.ligne!);

describe('la fin d’une étape que le circuit mène lui-même', () => {
  it.each(['preuve', 'controles', 'integration', 'file'])(
    'écrit au registre la ligne de l’étape %s, de son début à sa fin',
    etape => {
      const ctx = contexte();
      const { menee } = commencer(ctx, debut(etape));
      expect(menee).toMatchObject({ etape });
      finir(ctx, menee);
      const [l] = lignes(ctx);
      expect(lignes(ctx)).toHaveLength(1);
      expect(l).toMatchObject({ role: 'circuit', etape, ticket: 'demo-1', jetons: 0 });
      expect(l!.debut).toBe(menee!.debut);
      expect(Date.parse(l!.fin)).toBeGreaterThanOrEqual(Date.parse(l!.debut));
    }
  );

  it('une étape qu’un agent mène n’écrit aucune ligne', () => {
    const ctx = contexte();
    const { menee } = commencer(ctx, debut('code'));
    expect(menee).toBeNull();
    finir(ctx, menee);
    expect(lignes(ctx)).toEqual([]);
  });

  it('sans étape menée, n’écrit rien', () => {
    const ctx = contexte();
    finir(ctx, null);
    expect(ctx.rendus).toEqual([]);
  });
});

describe('le début d’une étape que le circuit mène lui-même', () => {
  it('est nommé dans l’état pendant l’étape, et nul pour une étape d’agent', () => {
    const ctx = contexte();
    const { menee } = commencer(ctx, debut('preuve'));
    expect(ctx.courant?.mene).toBe(menee!.debut);
    commencer(ctx, debut('code'));
    expect(ctx.courant?.mene).toBeNull();
  });
});
