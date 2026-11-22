// The supervisor turns a ticket to the short circuit at the stop of the proof of the red, as at
// the stop of the testwriter: `--mecanique [<commande>]` on the same plan, to 1.1 with a command,
// to the developpeur without one. A lot whose tests cannot turn red has no behaviour to prove, and
// the supervisor says so by his command, which the circuit follows; it reads no free text.
// Witness: SyntHub SH-cgi.17 under 0.45.1: the proof refused three times a lot without a red, and
// no answer turned its sort; two sessions of the testwriter lost.
import { describe, expect, it } from 'vitest';
import * as reponses from '../../scripts/reponses-du-circuit.mjs';
import * as transitions from '../../scripts/transitions.mjs';
import { MONTEES, REPONSES } from '../../scripts/etapes.mjs';

interface Sorte {
  genre: string;
  raison: string | null;
  comportement?: string;
  commande?: string;
}
const reponse = reponses.reponseMecanique as (o: {
  etat: { etape: string; raison: string | null } | null;
  sorte: Sorte;
  commande: string | null;
  contexte: string | null;
}) => { refus?: string; sorte?: Sorte; suivant?: { etape: string } };
const E = transitions as unknown as Record<string, string>;
const COMPORTEMENT: Sorte = { genre: 'comportement', raison: 'plan', comportement: 'changé' };
const A_LA_PREUVE = { etape: E.PREUVE, raison: 'preuve' };

describe('--mecanique répond à l’arrêt de la preuve du rouge, comme à celui du testwriter', () => {
  it('avec une commande : la sorte devient mécanique, reprise à 1.1', () => {
    const r = reponse({
      etat: A_LA_PREUVE,
      sorte: COMPORTEMENT,
      commande: 'git mv a b',
      contexte: 'un renommage',
    });
    expect(r.refus).toBeUndefined();
    expect(r.sorte).toEqual({ genre: 'mécanique', raison: 'un renommage', commande: 'git mv a b' });
    expect(r.suivant).toMatchObject({ etape: E.GESTE });
  });

  it('sans commande : la sorte devient « inchangé », reprise au développeur, sans testwriter ni preuve', () => {
    const r = reponse({
      etat: A_LA_PREUVE,
      sorte: COMPORTEMENT,
      commande: null,
      contexte: 'le lot ne change aucun comportement',
    });
    expect(r.refus).toBeUndefined();
    expect(r.sorte).toEqual({
      genre: 'comportement',
      raison: 'le lot ne change aucun comportement',
      comportement: 'inchangé',
    });
    expect(r.suivant).toMatchObject({ etape: E.CODE });
  });

  it('garde ses refus : sans raison, ou sur un ticket déjà mécanique', () => {
    expect(
      reponse({ etat: A_LA_PREUVE, sorte: COMPORTEMENT, commande: null, contexte: ' ' }).refus
    ).toBeTruthy();
    expect(
      reponse({
        etat: A_LA_PREUVE,
        sorte: { genre: 'mécanique', raison: 'r', commande: 'mv a b' },
        commande: 'mv a b',
        contexte: 'r',
      }).refus
    ).toBeTruthy();
  });

  it('reste refusée aux autres arrêts, et son refus nomme les arrêts qu’elle admet', () => {
    for (const etat of [
      { etape: E.PREUVE, raison: 'lancement' },
      { etape: E.CODE, raison: 'controles' },
      { etape: E.CONTROLES, raison: 'controles' },
      { etape: E.RELECTURE, raison: 'relecture-arret' },
      null,
    ]) {
      const r = reponse({ etat, sorte: COMPORTEMENT, commande: null, contexte: 'r' });
      expect(r.refus, JSON.stringify(etat)).toMatch(/testwriter/);
      expect(r.refus, JSON.stringify(etat)).toMatch(/preuve/);
    }
  });

  it('la question de l’arrêt « preuve » propose --mecanique, et la liste des réponses dit où elle est admise', () => {
    expect(MONTEES.preuve.question).toMatch(/aucun comportement/);
    expect(MONTEES.preuve.question).toContain('--mecanique');
    expect(REPONSES).toMatch(/--mecanique[^;]*preuve/);
  });
});
