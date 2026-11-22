// The findings carried from one RENDU of the reviewer to the next (scripts/circuit.mjs,
// `constatsOuverts`), as the threads of a review: a thread the next review marks lifted closes, one
// it judges not lifted stays open without being stated again and keeps its piece, a new one opens,
// each going to the agent it names. The run's memory holds them across `--depuis` and `--reprendre`
// (`depart` writes no key `constats` for them), so a relaunch still carries each one to its agent.
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import * as seances from '../../scripts/seances.mjs';

interface Constat {
  titre: string;
  regle: string;
  role: string;
  corps: string;
  piece?: string;
  reponse?: unknown;
}
const constatsOuverts = circuit.constatsOuverts as (
  ctx: { constats: Constat[] | null },
  fiche: object,
  texte: string
) => Constat[];
const constatsDeLaSeance = seances.constatsDeLaSeance as (
  contexte: string | null,
  constats: Constat[],
  role: string
) => { constats: string };

const constat = (lettre: string, role = 'developpeur') => ({
  titre: `packages/forms/src/index.mjs — constat ${lettre}`,
  genre: 'bloquant',
  piece: 'packages/forms/src/index.mjs:1',
  regle: 'critère 1',
  role,
  corps: `Le corps du constat ${lettre}.`,
});
const rendu = (constats: object[], suivi: object[] = []) => ({ verdict: 'RENDU', constats, suivi });
const leve = (titre: string) => ({ titre, etat: 'levé', preuve: 'la différence du lot.' });
const nonLeve = (titre: string) => ({ titre, etat: 'non levé', preuve: 'il reste.' });
const titres = (cs: Constat[]) => cs.map(c => c.titre);

describe('les constats du relecteur d’un RENDU au suivant', () => {
  it('un premier RENDU ouvre ses constats bloquants, chacun avec son destinataire et sa pièce', () => {
    const ouverts = constatsOuverts(
      { constats: null },
      rendu([constat('A'), constat('B', 'testwriter')]),
      'V'
    );
    expect(ouverts).toEqual([
      {
        titre: constat('A').titre,
        regle: 'critère 1',
        role: 'developpeur',
        corps: 'Le corps du constat A.',
        piece: 'packages/forms/src/index.mjs:1',
      },
      {
        titre: constat('B').titre,
        regle: 'critère 1',
        role: 'testwriter',
        corps: 'Le corps du constat B.',
        piece: 'packages/forms/src/index.mjs:1',
      },
    ]);
  });

  it('le RENDU suivant ferme le constat levé, garde sans le redire celui qui n’est pas levé, ouvre le neuf', () => {
    const premier = constatsOuverts({ constats: [] }, rendu([constat('A'), constat('B')]), 'V1');
    const second = constatsOuverts(
      { constats: premier },
      rendu([constat('C')], [leve(constat('A').titre), nonLeve(constat('B').titre)]),
      'V2'
    );
    expect(titres(second)).toEqual([constat('B').titre, constat('C').titre]);
    expect(second.map(c => c.piece)).toEqual([constat('B').piece, constat('C').piece]);
  });

  it('un constat redit par le RENDU n’est pas compté deux fois', () => {
    const premier = constatsOuverts({ constats: [] }, rendu([constat('A')]), 'V1');
    const second = constatsOuverts({ constats: premier }, rendu([constat('A')]), 'V2');
    expect(titres(second)).toEqual([constat('A').titre]);
  });

  it('la réponse du développeur au tour d’avant ne suit pas : sa prochaine fiche y répond de nouveau', () => {
    const avec = [{ ...constat('A'), reponse: { etat: 'levé', piece: 'p' } }];
    const ouverts = constatsOuverts({ constats: avec }, rendu([constat('B')]), 'V');
    expect(ouverts.find(c => c.titre === constat('A').titre)).not.toHaveProperty('reponse');
  });

  it('chaque agent reçoit les constats de son rôle, ni ceux de l’autre', () => {
    const ouverts = constatsOuverts(
      { constats: [] },
      rendu([constat('A', 'testwriter'), constat('B', 'developpeur')]),
      'V'
    );
    const pourLeTestwriter = constatsDeLaSeance(null, ouverts, 'testwriter').constats;
    const pourLeDeveloppeur = constatsDeLaSeance(null, ouverts, 'developpeur').constats;
    expect(pourLeTestwriter).toContain('Le corps du constat A.');
    expect(pourLeTestwriter).not.toContain('Le corps du constat B.');
    expect(pourLeDeveloppeur).toContain('Le corps du constat B.');
    expect(pourLeDeveloppeur).not.toContain('Le corps du constat A.');
    expect(pourLeDeveloppeur).toContain('Pièce : packages/forms/src/index.mjs:1');
  });

  // The stop a finding makes: `{ nom, rapport }`, the verdict after the reason in its report.
  const arret = (c: object) => {
    try {
      constatsOuverts({ constats: [] }, rendu([c]), 'LE VERDICT');
    } catch (e) {
      return e as { nom: string; rapport: string };
    }
    throw new Error('aucun arrêt');
  };

  it('un constat sans destinataire valide arrête la relecture, le verdict dans son rapport', () => {
    const a = arret({ ...constat('A'), role: 'relecteur' });
    expect(a.nom).toBe('relecture-arret');
    expect(a.rapport).toContain("n'a pas de destinataire valide : il nomme « relecteur »");
    expect(a.rapport).toContain('Le verdict :\n\nLE VERDICT');
  });

  it('un constat qui met un critère en cause arrête la relecture', () => {
    const a = arret({ ...constat('A'), critere_en_cause: true });
    expect(a.nom).toBe('relecture-arret');
    expect(a.rapport).toContain('met en cause un critère du ticket');
  });
});
