// A whole review (the replay of the lot in conflict, or a review before without its base) receives
// the findings still open, as a bounded review does, and judges each lifted or not; an ACCEPTÉ
// closes only findings it judges lifted (grillhouse-527.1.1), as Gerrit carries the unresolved
// comments to each new patch set, whatever the form of the review.
// Witness: the reviewer of grillhouse-527.1 (2026-11-02): a whole review received « aucune : tu
// relis le lot entier » and no finding, and its ACCEPTÉ closed them all unchecked.
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import { suiviDesConstats } from '../../scripts/resultats.mjs';

interface Constat {
  titre: string;
  regle: string;
  role: string;
  corps: string;
  piece?: string;
  reponse?: { etat: string; raison?: string; piece: string };
}
const relectureEntiere = circuit.relectureEntiere as (constats: Constat[]) => string;
const consigne = circuit.consigne as (valeurs: Record<string, unknown>, rang: number) => string;

const OUVERT: Constat = {
  titre: 'packages/a/src/x.ts:12',
  regle: 'critère 2',
  role: 'developpeur',
  corps: 'Le cas zéro rend une valeur fausse.',
  piece: 'packages/a/src/x.ts:12',
  reponse: { etat: 'levé', piece: 'packages/a/src/x.ts:14' },
};
const AU_TESTWRITER: Constat = {
  titre: 'un test du lot ne mord pas',
  regle: 'critère 1',
  role: 'testwriter',
  corps: 'Le test passe sans le code.',
};

describe('a whole review receives the findings still open (critère 1)', () => {
  it('without a finding open, the review reads the whole lot, as before', () => {
    expect(relectureEntiere([])).toBe('aucune : tu relis le lot entier');
  });

  it('each finding open comes with its rule, its recipient, its body, its piece and the answer under it', () => {
    const texte = relectureEntiere([OUVERT, AU_TESTWRITER]);
    expect(texte).toMatch(/tu relis le lot entier/);
    for (const c of [OUVERT, AU_TESTWRITER]) {
      expect(texte).toContain(c.titre);
      expect(texte).toContain(c.corps);
      expect(texte).toContain(`Agent : ${c.role}`);
    }
    expect(texte).toContain('Pièce : packages/a/src/x.ts:12');
    expect(texte).toContain('Réponse du développeur : levé');
    // The reviewer judges each one in `suivi`, as in a bounded review.
    expect(texte).toMatch(/`suivi`/);
  });

  it("the reviewer's instruction carries them under « LA RELECTURE D'AVANT »", () => {
    const texte = consigne({ precedente: relectureEntiere([OUVERT]) }, 1);
    const ligne = texte.indexOf("LA RELECTURE D'AVANT");
    expect(ligne).toBeGreaterThanOrEqual(0);
    expect(texte.indexOf(OUVERT.corps)).toBeGreaterThan(ligne);
  });
});

describe('the reviewer judges each finding open, and an ACCEPTÉ closes only those lifted (critère 2)', () => {
  const titres = [OUVERT.titre, AU_TESTWRITER.titre];
  const leve = (titre: string) => ({ titre, etat: 'levé', preuve: 'la différence' });
  const tenu = (titre: string) => ({ titre, etat: 'non levé', preuve: 'la différence' });

  it('a sheet that judges each finding, by its title numbered or not, conforms', () => {
    expect(
      suiviDesConstats(
        {
          verdict: 'ACCEPTÉ',
          suivi: [leve(`Constat 1 — ${OUVERT.titre}`), leve(AU_TESTWRITER.titre)],
        },
        titres
      )
    ).toBeNull();
    expect(
      suiviDesConstats(
        { verdict: 'RENDU', suivi: [leve(OUVERT.titre), tenu(AU_TESTWRITER.titre)] },
        titres
      )
    ).toBeNull();
    expect(suiviDesConstats({ verdict: 'ACCEPTÉ' }, [])).toBeNull();
  });

  it('a sheet without a line for a finding open is refused, the finding named', () => {
    expect(suiviDesConstats({ verdict: 'RENDU', suivi: [leve(OUVERT.titre)] }, titres)).toBe(
      `suivi : sans ligne pour le constat « ${AU_TESTWRITER.titre} »`
    );
    expect(suiviDesConstats({ verdict: 'ACCEPTÉ' }, titres)).toBe(
      `suivi : sans ligne pour les constats « ${OUVERT.titre} », « ${AU_TESTWRITER.titre} »`
    );
  });

  it('an ACCEPTÉ that holds a finding not lifted is refused, the finding named', () => {
    expect(
      suiviDesConstats(
        { verdict: 'ACCEPTÉ', suivi: [leve(OUVERT.titre), tenu(AU_TESTWRITER.titre)] },
        titres
      )
    ).toBe(`suivi : un ACCEPTÉ tient le constat « ${AU_TESTWRITER.titre} » non levé`);
  });
});
