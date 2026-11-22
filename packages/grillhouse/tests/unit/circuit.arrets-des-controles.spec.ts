// Les arrêts des contrôles qui montent au superviseur : ce que la table des transitions dit
// (`transition`, scripts/transitions.mjs) pour un rouge de style que la passe finale ne rend à
// personne, et ce que la question gardée (`monter`, scripts/circuit.mjs) porte comme pièce pour
// « sans-livraison » et « controles ». Des tests petits : des fonctions sans entrée ni sortie.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { monter } from '../../scripts/circuit.mjs';
import * as transitions from '../../scripts/transitions.mjs';

interface Decision {
  besoin?: { fait: string };
  arret?: { nom: string; rapport: string };
}
interface Etat {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
}
const transition = transitions.transition as (e: {
  etat: Etat;
  ticket: object;
  memoire?: object;
  faits: Record<string, unknown>;
}) => Decision;
const CONTROLES = (transitions as unknown as Record<string, string>).CONTROLES!;

const TICKET = { id: 'essai-1', paquets: ['packages/forms'], sorte: null, copie: '/copie' };
const VERT = {
  rouge: false,
  aRepasser: false,
  arbitrer: false,
  auDeveloppeur: false,
  texte: 'texte',
  complet: 'complet',
  sansListe: 'sans liste',
  avertissements: '',
  rouges: [],
  resume: 'résumé',
  horsTitre: [],
  lieux: [],
  references: [],
  tous: [],
  notes: [],
};

/** La décision des contrôles <finale> de l'étape, chaque fait demandé donné de <faits>. */
function decider(finale: boolean, controles: object, faits: Record<string, unknown> = {}) {
  const lus: Record<string, unknown> = {};
  const donnes: Record<string, unknown> = {
    controles: { ...VERT, ...controles },
    mecanique: false,
    passeFinale: { arbre: 'T', restreinte: null },
    referencesDesRouges: [],
    ...faits,
  };
  for (let i = 0; i < 50; i++) {
    const d = transition({
      etat: { etape: CONTROLES, tentative: finale ? 0 : 1, rapport: null, finale },
      ticket: TICKET,
      faits: lus,
    });
    if (!d.besoin) {
      return d;
    }
    if (!(d.besoin.fait in donnes)) {
      throw new Error(`fait non donné : ${d.besoin.fait}`);
    }
    lus[d.besoin.fait] = donnes[d.besoin.fait];
  }
  throw new Error('trop de faits');
}

describe('un rouge de style que la passe finale ne rend à aucun paquet du plan', () => {
  const rouge = (k: object) => ({
    rouge: true,
    rouges: [{ paquet: '//', texte: 'tâche //#lint rouge (code 1)' }],
    tous: [{ paquet: '//', texte: 'tâche //#lint rouge (code 1)' }],
    ...k,
  });

  it('arrête à « controles » en disant qu’aucun paquet du plan ne le tient, le plan nommé', () => {
    const d = decider(true, rouge({ auDeveloppeur: false }));
    expect(d.arret?.nom).toBe('controles');
    expect(d.arret?.rapport).toContain('Aucun paquet du plan (packages/forms)');
    expect(d.arret?.rapport).toContain('un rouge de la racine');
  });

  it('arrête à « controles » en nommant la tâche du paquet hors du plan, sans relancer le développeur', () => {
    const d = decider(true, rouge({ auDeveloppeur: false, horsTitre: ['030-binder#lint'] }));
    expect(d.arret?.nom).toBe('controles');
    expect(d.arret?.rapport).toContain('030-binder#lint');
    expect(d.arret?.rapport).toContain('hors du plan du ticket (packages/forms)');
    expect(d.arret?.rapport).toContain("le développeur n'est pas relancé");
    expect(d.arret?.rapport).toContain('--etendre');
    expect(d.arret?.rapport).toContain('--depuis developpeur');
  });

  it('un constat à arbitrer des contrôles du plan n’est tranché par aucun développeur', () => {
    const d = decider(false, rouge({ auDeveloppeur: true, arbitrer: true }));
    expect(d.arret?.nom).toBe('controles');
    expect(d.arret?.rapport).toContain(
      'Les rouges du plan sont des constats à arbitrer : aucun développeur ne les tranche.'
    );
  });
});

interface Effet {
  genre: string;
  texte?: string;
  etat?: { question?: Record<string, string> };
}
const monte = monter as (ctx: object, a: Record<string, unknown>) => number;

/** L'arrêt <a> monté au superviseur : la question gardée à l'état et la ligne du ticket. */
function monteDe(a: Record<string, unknown>) {
  const ctx = {
    rendus: [] as Effet[],
    paquets: ['packages/forms'],
    ticket: 'demo-1',
    journal: '/nonexistent',
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const code = monte(ctx, { etat: { etape: 'code', tentative: 1 }, ...a });
  return {
    code,
    question: ctx.rendus.find(e => e.genre === 'etat')!.etat!.question!,
    commentaire: ctx.rendus.find(e => e.genre === 'commentaire')!.texte!,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('l’arrêt « sans-livraison » monte au superviseur avec sa pièce', () => {
  const rouge = {
    paquet: '000-forms',
    texte:
      'test packages/forms/test/mesure.test.mjs › critère 1 — mesure rend le double — attendu 6',
  };

  it('porte le fichier rouge en pièce, répond au superviseur et nomme --reprendre', () => {
    const { code, question, commentaire } = monteDe({
      code: 15,
      nom: 'sans-livraison',
      rapport: 'Le développeur ne change rien.',
      rouges: [rouge],
    });
    expect(code).toBe(15);
    expect(question).toMatchObject({ arret: 'sans-livraison', qui: 'superviseur' });
    expect(question.piece).toContain('packages/forms/test/mesure.test.mjs');
    expect(question.piece).toContain('000-forms');
    expect(question.question).toContain('--reprendre');
    expect(question.fait).toBe('Le développeur ne change rien.');
    expect(commentaire).toMatch(/^Circuit · question : sans-livraison à /);
  });

  it('garde la pièce que l’arrêt porte, avant les rouges', () => {
    const { question } = monteDe({
      code: 15,
      nom: 'sans-livraison',
      rapport: 'Rien à livrer.',
      piece: 'packages/forms/src/index.mjs:1',
      rouges: [rouge],
    });
    expect(question.piece).toBe('packages/forms/src/index.mjs:1');
  });
});

describe('l’arrêt « controles » d’un constat à arbitrer monte avec son fichier et sa ligne', () => {
  it('porte le fichier et la ligne du constat en pièce, au superviseur', () => {
    const { question, commentaire } = monteDe({
      code: 14,
      nom: 'controles',
      rapport: 'Les rouges du plan sont des constats à arbitrer.',
      rouges: [
        {
          paquet: '000-forms',
          texte:
            'constat consommateurs-arbitres packages/forms/src/index.mjs:1 — la mesure attend un arbitrage. (à arbitrer)',
        },
      ],
    });
    expect(question).toMatchObject({ arret: 'controles', qui: 'superviseur' });
    expect(question.piece).toContain('packages/forms/src/index.mjs:1');
    expect(question.piece).toContain('la mesure attend un arbitrage.');
    expect(question.fait.trim()).not.toBe('');
    expect(commentaire).toMatch(/^Circuit · question : controles à /);
    expect(commentaire).toContain('au superviseur : ');
  });
});
