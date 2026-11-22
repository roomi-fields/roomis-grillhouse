// The review of the lot (scripts/activites.mjs, `relire`): the reviewer receives the claims file,
// which holds the ticket's criteria, and not the criteria themselves; the verdict is written at
// the ticket by the circuit from its sheet, under the reviewer's author. A test of size medium:
// the copy is a trial git worktree, claude a stand-in that keeps the instruction it receives
// (./seance-d-essai.ts).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { DESCRIPTION, monde, type Monde } from './seance-d-essai.js';

const relire = activites.relire as unknown as (
  ctx: object,
  options: { constats: object[] }
) => Promise<{ verdict: string; texte: string }>;

const ecrire = (dossier: string, rel: string, texte: string) => {
  mkdirSync(path.dirname(path.join(dossier, rel)), { recursive: true });
  writeFileSync(path.join(dossier, rel), texte);
};
// A lot in the copy: a test and the code that makes it pass.
function unLot(m: Monde) {
  ecrire(m.ctx.copie, 'packages/forms/test/mesure.test.mjs', 'it("x", () => {});\n');
  ecrire(m.ctx.copie, 'packages/forms/src/index.mjs', 'export const mesure = x => 2 * x;\n');
}

describe('la relecture du lot', () => {
  it('donne au relecteur le fichier d’affirmations, qui porte les critères du ticket, et non les critères eux-mêmes', async () => {
    const m = monde({ copie: true });
    unLot(m);
    m.fiche({ verdict: 'ACCEPTÉ' });
    await m.jouer(() => relire(m.ctx, { constats: [] }));
    const consigne = m.prompt(1);
    expect(consigne).not.toContain('1. `mesure` rend le double de sa valeur.');
    expect(consigne).not.toContain("## Critères d'acceptation");
    const fichier = /LE FICHIER D'AFFIRMATIONS, [^:\n]*: (\S+affirmations\.md)\n/.exec(
      consigne
    )?.[1];
    expect(fichier).toBeTruthy();
    expect(readFileSync(fichier ?? '', 'utf8')).toBe(DESCRIPTION);
  });

  it('écrit le verdict au ticket depuis la fiche du relecteur, sous l’auteur du relecteur, remarques comprises', async () => {
    const m = monde({ copie: true });
    unLot(m);
    m.fiche({
      verdict: 'ACCEPTÉ',
      constats: [
        {
          titre: 'Le nom de la mesure',
          genre: 'remarque',
          corps: 'le nom de la mesure pourrait dire le double',
          piece: 'packages/forms/src/index.mjs:1',
        },
      ],
    });
    const r = await m.jouer(() => relire(m.ctx, { constats: [] }));
    expect(r.verdict).toBe('ACCEPTÉ');
    const [ecrit] = m.ctx.rendus.filter(e => e.genre === 'commentaire');
    expect(ecrit).toMatchObject({ ticket: 'demo-1', auteur: 'relecteur' });
    expect(String(ecrit.texte)).toMatch(/^ACCEPTÉ\n/);
    expect(String(ecrit.texte)).toContain(
      '## Remarques\n\n- Le nom de la mesure — le nom de la mesure pourrait dire le double (packages/forms/src/index.mjs:1)'
    );
    expect(r.texte).toBe(String(ecrit.texte));
  });
});
