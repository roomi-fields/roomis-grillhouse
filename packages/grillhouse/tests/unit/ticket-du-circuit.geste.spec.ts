// `geste` (scripts/ticket-du-circuit.mjs) : un geste du circuit, sans séance, s'écrit avec sa règle au
// ticket (`Circuit · geste : <genre> → <geste> (règle : <règle>)`) et dans le journal du ticket.
// Des tests petits : les effets sont rassemblés, le journal est un fichier d'essai.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gesteDe } from '../../scripts/etapes.mjs';
import { geste } from '../../scripts/ticket-du-circuit.mjs';

interface Ctx {
  ticket: string;
  journal: string;
  rendus: { genre: string; texte?: string; auteur?: string }[];
}
const jouer = geste as (ctx: Ctx, genre: string) => void;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ticket-du-circuit-geste-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const contexte = (): Ctx => ({
  ticket: 'demo-1',
  journal: path.join(mkdtempSync(path.join(ESSAIS, 'ticket-')), 'journal'),
  rendus: [],
});

describe('le geste `regeneration`', () => {
  it('porte sa règle au ticket : un rouge des contrôles ou de la passe finale est celui d’une référence, même mêlé à d’autres', () => {
    const ctx = contexte();
    jouer(ctx, 'regeneration');
    const g = gesteDe('regeneration') as { geste: string; regle: string };
    expect(g.regle).toContain(
      'un rouge des contrôles du plan ou de la passe finale est celui d’une référence, même mêlé à d’autres'
    );
    expect(ctx.rendus).toEqual([
      expect.objectContaining({
        genre: 'commentaire',
        texte: `Circuit · geste : regeneration → ${g.geste} (règle : ${g.regle})`,
      }),
    ]);
  });

  it('s’écrit aussi dans le journal du ticket, avec sa règle', () => {
    const ctx = contexte();
    jouer(ctx, 'regeneration');
    const g = gesteDe('regeneration') as { geste: string; regle: string };
    expect(readFileSync(ctx.journal, 'utf8')).toContain(
      `geste : regeneration → ${g.geste} (règle : ${g.regle})`
    );
  });

  it('nomme la régénération des références, puis la passe qui juge l’arbre régénéré', () => {
    const g = gesteDe('regeneration') as { geste: string };
    expect(g.geste).toContain('à la régénération des références (4.2)');
    expect(g.geste).toContain('la passe finale restreinte à ce qu’elle change');
  });
});
