// A red that the final pass alone sees (scripts/transitions.mjs, 4.1): it goes to the one
// developpeur of the ticket, who is relaunched up to his last session (the last on the strong model),
// then the circuit stops at « controles »; each red final pass keeps its reds with its outcome,
// its stop included, which the bilan compares with those of the pass before. A red in a package out
// of the plan is not his: the stop names the package, the developpeur is not relaunched.
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

interface Effet {
  genre: string;
  etape?: string;
  resultat?: { issue: string; finale: boolean; rouges: string[] };
}
interface Decision {
  besoin?: { fait: string };
  suivant: { etape: string; tentative: number; rapport: string | null; finale: boolean };
  memoire: Record<string, unknown>;
  effets: Effet[];
  arret?: {
    nom: string;
    rapport: string;
    resultat?: { issue: string; finale: boolean; rouges: string[] } | null;
  };
}
const T = transitions as unknown as Record<string, string> & {
  transition: (e: object) => Decision;
  SEANCES_DEVELOPPEUR: number;
};
const { CODE, CONTROLES } = T;

const TICKET = {
  id: 'essai-1',
  paquets: ['packages/forms', 'packages/binder'],
  sorte: null,
  copie: '/copie',
};
function jouer(entree: object, faits: Record<string, unknown>) {
  const lus: Record<string, unknown> = {};
  for (let i = 0; i < 50; i++) {
    const d = T.transition({ ticket: TICKET, ...entree, faits: lus });
    if (!d.besoin) {
      return d;
    }
    if (!(d.besoin.fait in faits)) {
      throw new Error(`fait non donné : ${d.besoin.fait}`);
    }
    lus[d.besoin.fait] = faits[d.besoin.fait];
  }
  throw new Error('trop de faits');
}
const etat = (tentative: number) => ({
  etape: CONTROLES,
  tentative,
  rapport: null,
  finale: true,
});
const ROUGE = {
  rouge: true,
  aRepasser: false,
  arbitrer: false,
  auDeveloppeur: true,
  texte: 'Contrôles de la passe finale, hors enveloppe : packages/forms/src/index.mjs:1',
  complet: 'complet',
  sansListe: 'sans liste',
  avertissements: '',
  resume: 'passe finale rouge',
  rouges: [{ paquet: 'binder', texte: 'garde rouge sur packages/forms/src/index.mjs' }],
  tous: [{ paquet: 'binder', texte: 'garde rouge sur packages/forms/src/index.mjs' }],
  lieux: [{ fichier: 'packages/forms/src/index.mjs', gardes: [] }],
  horsTitre: [] as string[],
  references: [],
  notes: [],
};
const faits = (controles: object = ROUGE) => ({
  passeFinale: { arbre: 'T', restreinte: null },
  controles,
  referencesDesRouges: [],
  mecanique: false,
  portes: { tests: [], code: ['packages/forms/src/index.mjs'] },
});

describe('la passe finale rouge sur un fichier du plan', () => {
  it('renvoie le rouge au développeur du ticket, la sortie de la passe pour rapport', () => {
    const d = jouer({ etat: etat(0) }, faits());
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 1 });
    expect(d.suivant.rapport).toContain('packages/forms/src/index.mjs:1');
    expect(d.memoire.controlesRouges).toBe(ROUGE.texte);
  });

  it('garde les rouges avec leur issue et dit qu’il s’agit de la passe finale', () => {
    const d = jouer({ etat: etat(0) }, faits());
    const rapport = d.effets.find(e => e.genre === 'rapport');
    expect(rapport?.resultat).toEqual({
      issue: 'rouge',
      finale: true,
      rouges: ['binder : garde rouge sur packages/forms/src/index.mjs'],
    });
  });

  it('à la dernière séance du développeur, arrête à « controles », les rouges et l’issue gardés', () => {
    const d = jouer({ etat: etat(T.SEANCES_DEVELOPPEUR) }, faits());
    expect(d.arret?.nom).toBe('controles');
    expect(d.arret?.resultat).toEqual({
      issue: 'rouge',
      finale: true,
      rouges: ['binder : garde rouge sur packages/forms/src/index.mjs'],
    });
  });

  it('les séances relancées par la passe finale vont jusqu’à la dernière avant l’arrêt', () => {
    const tentatives: number[] = [];
    for (let t = 0; t < T.SEANCES_DEVELOPPEUR; t++) {
      const d = jouer({ etat: etat(t) }, faits());
      expect(d.arret, `tentative ${t}`).toBeUndefined();
      tentatives.push(d.suivant.tentative);
    }
    expect(tentatives).toEqual([1, 2, 3].slice(0, T.SEANCES_DEVELOPPEUR));
  });
});

describe('la passe finale rouge dans un paquet hors du plan', () => {
  it('arrête à « controles » en nommant le paquet, sans relancer le développeur', () => {
    const d = jouer(
      { etat: etat(0) },
      faits({ ...ROUGE, horsTitre: ['000-forms'], auDeveloppeur: false })
    );
    expect(d.arret?.nom).toBe('controles');
    expect(d.arret?.rapport).toContain(
      'La passe finale est rouge dans 000-forms, hors du plan du ticket'
    );
    expect(d.arret?.rapport).toContain("le développeur n'est pas relancé");
    expect(d.arret?.rapport).toContain('--etendre');
  });
});
