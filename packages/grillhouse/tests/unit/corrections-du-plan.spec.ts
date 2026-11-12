// Une question du plan qu'un critère oppose à sa propre pièce se résout par la pièce : la fiche de
// l'explorateur répond par une correction, que le circuit accepte si l'extrait figure à la ligne
// citée (scripts/transitions.mjs, scripts/circuit.mjs, scripts/resultats.mjs).
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import { lireFiche, schemaDeFiche } from '../../scripts/resultats.mjs';
import * as transitions from '../../scripts/transitions.mjs';

interface Question {
  question: string;
  vise: string;
  piece: string;
}
interface Correction {
  critere: string;
  texte: string;
  piece: string;
  extrait: string;
}
interface Reponse {
  numero: string;
  reponse: string;
  texte: string;
  correction?: Correction;
}
interface Acceptee extends Correction {
  numero: number;
}
const correctionsDuPlan = (transitions as Record<string, unknown>).correctionsDuPlan as (
  questions: Question[],
  reponses: Reponse[],
  lireLigne: (fichier: string, ligne: number) => string | null
) => { acceptees: Acceptee[]; refusees: number[] };
const ouvertesDuPlan = transitions.ouvertesDuPlan as unknown as (
  plan: { questions: object[] },
  posees: string[],
  reponses: { numero: string }[],
  refusees?: number[]
) => { question: string; piece: string }[];
const decrireLePlan = circuit.decrireLePlan as unknown as (
  description: string,
  criteres: string[],
  questions: object[],
  sorte: object | null,
  noms: undefined,
  corrections: Acceptee[]
) => string;
const lignesDesCorrections = (circuit as Record<string, unknown>).lignesDesCorrections as (
  corrections: Acceptee[]
) => string;

const FICHIER = 'packages/grillhouse/tests/unit/droits.spec.ts';
const LIGNE = "expect(refusReel('git status --short | head -30', relecteur)).toBeNull();";
const PIECE = `${FICHIER}:295`;
const lireLigne = (fichier: string, ligne: number) =>
  fichier === FICHIER && ligne === 295 ? `    ${LIGNE}` : fichier === FICHIER ? 'autre' : null;
const question = (over: Partial<Question> = {}): Question => ({
  question: 'Le critère 3 dit que head est refusé ; le test dit le contraire.',
  vise: 'critère',
  piece: PIECE,
  ...over,
});
const correction = (over: Partial<Correction> = {}): Correction => ({
  critere: '3',
  texte: 'Le tube vers head n’est pas refusé.',
  piece: PIECE,
  extrait: "refusReel('git status --short | head -30', relecteur)).toBeNull()",
  ...over,
});
const reponse = (c?: Correction, numero = '1'): Reponse => ({
  numero,
  reponse: 'CHANGE',
  texte: 'corrigé',
  ...(c ? { correction: c } : {}),
});

describe('une correction de critère que la pièce de la question prouve', () => {
  it('est acceptée quand son extrait figure à la ligne citée et que sa pièce est celle de la question', () => {
    const r = correctionsDuPlan([question()], [reponse(correction())], lireLigne);
    expect(r.refusees).toEqual([]);
    expect(r.acceptees).toEqual([{ numero: 1, ...correction() }]);
  });

  it('vise la bonne question quand plusieurs sont posées', () => {
    const qs = [question({ vise: 'flou', piece: 'ticket, critère 1' }), question()];
    const r = correctionsDuPlan(qs, [reponse(correction(), '2')], lireLigne);
    expect(r.acceptees.map(a => a.numero)).toEqual([2]);
  });

  it('est refusée quand l’extrait ne figure pas à la ligne citée', () => {
    const r = correctionsDuPlan(
      [question()],
      [reponse(correction({ extrait: 'toBeDefined()' }))],
      lireLigne
    );
    expect(r.acceptees).toEqual([]);
    expect(r.refusees).toEqual([1]);
  });

  it('est refusée quand son extrait est vide', () => {
    const r = correctionsDuPlan([question()], [reponse(correction({ extrait: '  ' }))], lireLigne);
    expect(r.refusees).toEqual([1]);
  });

  it('est refusée quand la ligne citée n’existe pas dans la copie', () => {
    const r = correctionsDuPlan([question()], [reponse(correction())], () => null);
    expect(r.refusees).toEqual([1]);
  });

  it('est refusée quand sa pièce n’est pas celle de la question', () => {
    const autre = correction({ piece: `${FICHIER}:296` });
    const r = correctionsDuPlan([question()], [reponse(autre)], lireLigne);
    expect(r.acceptees).toEqual([]);
    expect(r.refusees).toEqual([1]);
  });

  it.each(['flou', 'intention', 'référence', 'règle'])(
    'est refusée pour une question qui vise « %s », qui reste à l’humain',
    vise => {
      const r = correctionsDuPlan([question({ vise })], [reponse(correction())], lireLigne);
      expect(r.acceptees).toEqual([]);
      expect(r.refusees).toEqual([1]);
    }
  );

  it('n’est jamais acceptée pour une pièce « commande et sortie », jamais rejouée', () => {
    const commande = '$ git status --short | head -30\n M a.ts';
    let lu = 0;
    const r = correctionsDuPlan(
      [question({ piece: commande })],
      [reponse(correction({ piece: commande, extrait: 'M a.ts' }))],
      (...a) => {
        lu += 1;
        return lireLigne(...a);
      }
    );
    expect(r.acceptees).toEqual([]);
    expect(r.refusees).toEqual([1]);
    expect(lu).toBe(0);
  });

  it('est refusée pour une pièce du ticket, qui n’est pas un fichier:ligne', () => {
    const p = 'ticket, critère 3';
    const r = correctionsDuPlan(
      [question({ piece: p })],
      [reponse(correction({ piece: p, extrait: 'head' }))],
      lireLigne
    );
    expect(r.refusees).toEqual([1]);
  });

  it('ne touche pas une réponse sans correction', () => {
    const r = correctionsDuPlan([question()], [reponse()], lireLigne);
    expect(r).toEqual({ acceptees: [], refusees: [] });
  });
});

describe('ce qui reste ouvert après les corrections', () => {
  it('une question répondue par une correction acceptée n’est pas ouverte', () => {
    expect(ouvertesDuPlan({ questions: [] }, ['a'], [{ numero: '1' }], [])).toEqual([]);
  });

  it('une question dont la correction est refusée reste ouverte, avec sa pièce', () => {
    const o = ouvertesDuPlan(
      { questions: [] },
      ['a', 'b'],
      [{ numero: '1' }, { numero: '2' }],
      [1]
    );
    expect(o.map(x => x.question)).toEqual(['a']);
    expect(o[0].piece).toMatch(/correction/);
  });

  it('une question sans réponse reste ouverte comme avant', () => {
    const o = ouvertesDuPlan({ questions: [] }, ['a', 'b'], [{ numero: '2' }]);
    expect(o.map(x => x.question)).toEqual(['a']);
  });
});

describe('la description du plan porte le critère corrigé à la place de l’ancien', () => {
  const AVANT = [
    'Besoin.',
    '',
    '## Critères',
    '',
    '1. Premier.',
    '2. Un tube vers head reste refusé.',
    '3. Troisième.',
  ].join('\n');
  const acceptee: Acceptee = { numero: 1, ...correction({ critere: '2' }) };

  it('remplace le texte du critère visé, garde les autres et leur numéro', () => {
    const d = decrireLePlan(AVANT, [], [], null, undefined, [acceptee]);
    expect(d).toContain('2. Le tube vers head n’est pas refusé.');
    expect(d).not.toContain('reste refusé');
    expect(d).toContain('1. Premier.');
    expect(d).toContain('3. Troisième.');
  });

  it('ajoute les critères neufs après le critère corrigé', () => {
    const d = decrireLePlan(AVANT, ['Neuf.'], [], null, undefined, [acceptee]);
    expect(d).toContain('4. Neuf.');
    expect(d).toContain('2. Le tube vers head n’est pas refusé.');
  });

  it('laisse la description telle quand aucune correction n’est donnée', () => {
    const sans = decrireLePlan(AVANT, [], [], null, undefined, []);
    expect(sans).toContain('2. Un tube vers head reste refusé.');
  });

  it('ignore une correction dont le critère n’existe pas', () => {
    const d = decrireLePlan(AVANT, [], [], null, undefined, [
      { numero: 1, ...correction({ critere: '9' }) },
    ]);
    expect(d).toContain('2. Un tube vers head reste refusé.');
    expect(d).not.toContain('n’est pas refusé');
  });
});

describe('le commentaire du questionnement nomme chaque correction', () => {
  it('dit le critère, son texte corrigé, la pièce et l’extrait', () => {
    const t = lignesDesCorrections([
      { numero: 1, ...correction() },
      { numero: 2, ...correction({ critere: '5', texte: 'Autre texte.' }) },
    ]);
    expect(t).toContain('3');
    expect(t).toContain('Le tube vers head n’est pas refusé.');
    expect(t).toContain(PIECE);
    expect(t).toContain('toBeNull()');
    expect(t).toContain('Autre texte.');
    expect(t.split('\n').length).toBeGreaterThanOrEqual(2);
  });
});

describe('la fiche de l’explorateur porte une correction de critère', () => {
  const plan = { criteres: [], paquets: ['000-forms'], questions: [] };
  const sortie = (reponses: object[]) =>
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 'abc',
      result: 'fini',
      structured_output: { ...plan, reponses },
    });

  it('son schéma décrit la correction : critère, texte, pièce, extrait, facultative', () => {
    const s = schemaDeFiche('explorateur') as {
      properties: {
        reponses: {
          items: {
            required: string[];
            properties: { correction: { required: string[]; properties: object } };
          };
        };
      };
    };
    const items = s.properties.reponses.items;
    expect(items.required).toEqual(['numero', 'reponse', 'texte']);
    expect(Object.keys(items.properties.correction.properties).sort()).toEqual([
      'critere',
      'extrait',
      'piece',
      'texte',
    ]);
    expect(items.properties.correction.required.sort()).toEqual([
      'critere',
      'extrait',
      'piece',
      'texte',
    ]);
  });

  it('une réponse avec correction se lit', () => {
    expect(lireFiche('explorateur', sortie([reponse(correction())])).erreur).toBeUndefined();
  });

  it('un critère qui n’est pas un numéro est refusé', () => {
    const e = lireFiche('explorateur', sortie([reponse(correction({ critere: 'trois' }))])).erreur;
    expect(e).toContain('critere');
  });
});
