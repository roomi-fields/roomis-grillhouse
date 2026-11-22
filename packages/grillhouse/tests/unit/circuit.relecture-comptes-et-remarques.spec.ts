// What the circuit reads of the reviewer's sheets and verdicts (scripts/circuit.mjs): the RENDU
// counted since the last ACCEPTÉ (`rendusDepuisAccepte`), which a handover that opens on RENDU does
// not enter; and the findings a RENDU sends back (`constatsOuverts`), the blocking ones alone: a
// remark reaches no agent, only the ticket.
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';

interface Constat {
  titre: string;
  role: string;
}
const rendusDepuisAccepte = circuit.rendusDepuisAccepte as (ctx: object) => number;
const constatsOuverts = circuit.constatsOuverts as (
  ctx: { constats: Constat[] | null },
  fiche: object,
  texte: string
) => Constat[];

// A context whose sheets are those kept for its ticket: the effects emitted and not yet played.
const avecLesFiches = (...entrees: object[]) => ({
  fiches: '/nonexistent/fiches.jsonl',
  rendus: entrees.map(entree => ({ genre: 'fiche', entree })),
});
const relecteur = (verdict: string) => ({ role: 'relecteur', fiche: { verdict } });
const developpeur = (texte: string) => ({ role: 'developpeur', fiche: { statut: 'FAIT' }, texte });

describe('les RENDU comptés depuis le dernier ACCEPTÉ', () => {
  it('compte chaque RENDU du relecteur depuis le début, sans ACCEPTÉ', () => {
    expect(rendusDepuisAccepte(avecLesFiches())).toBe(0);
    expect(rendusDepuisAccepte(avecLesFiches(relecteur('RENDU')))).toBe(1);
    expect(rendusDepuisAccepte(avecLesFiches(relecteur('RENDU'), relecteur('RENDU')))).toBe(2);
  });

  it('un ACCEPTÉ remet le compte à zéro : un lot que la file renvoie repart de un', () => {
    expect(
      rendusDepuisAccepte(
        avecLesFiches(relecteur('RENDU'), relecteur('ACCEPTÉ'), relecteur('RENDU'))
      )
    ).toBe(1);
    expect(rendusDepuisAccepte(avecLesFiches(relecteur('RENDU'), relecteur('ACCEPTÉ')))).toBe(0);
  });

  it('la passation d’un agent qui s’ouvre sur RENDU n’est pas une relecture : seules les fiches du relecteur comptent', () => {
    expect(
      rendusDepuisAccepte(
        avecLesFiches(
          developpeur('RENDU 000-forms — code écrit.'),
          relecteur('RENDU'),
          developpeur('RENDU 000-forms — constat traité.')
        )
      )
    ).toBe(1);
  });
});

const bloquant = (titre: string, role = 'developpeur') => ({
  titre,
  genre: 'bloquant',
  regle: 'critère 1',
  role,
  corps: 'corps',
  piece: 'x.mjs:1',
});

describe('un RENDU renvoie ses constats bloquants seuls', () => {
  it('une remarque, avec ou sans agent, n’ouvre aucun constat et n’arrête pas la relecture', () => {
    const fiche = {
      verdict: 'RENDU',
      constats: [
        bloquant('A'),
        { titre: 'R1', genre: 'remarque', role: 'testwriter', corps: 'c', piece: 'x:2' },
        { titre: 'R2', genre: 'remarque', corps: 'c', piece: 'x:3' },
      ],
    };
    expect(constatsOuverts({ constats: null }, fiche, 'V').map(c => c.titre)).toEqual(['A']);
  });

  it('un constat bloquant sans destinataire arrête la relecture, une remarque sans destinataire jamais', () => {
    const sans = { verdict: 'RENDU', constats: [bloquant('A', '')] };
    let arret: { nom?: string; rapport?: string } = {};
    try {
      constatsOuverts({ constats: null }, sans, 'V');
    } catch (e) {
      arret = e as typeof arret;
    }
    expect(arret.nom).toBe('relecture-arret');
    expect(arret.rapport).toContain("n'a pas de destinataire valide : il nomme personne");
    const remarque = {
      verdict: 'RENDU',
      constats: [{ titre: 'R', genre: 'remarque', corps: 'c', piece: 'x:1' }, bloquant('A')],
    };
    expect(() => constatsOuverts({ constats: null }, remarque, 'V')).not.toThrow();
  });
});
