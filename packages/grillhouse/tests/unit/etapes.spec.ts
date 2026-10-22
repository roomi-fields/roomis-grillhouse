// grillhouse-3uv.90: the steps of a ticket are the tree of its circuit, as a pipeline of GitLab CI
// shows its stages and their jobs: 0 to 5, the sub-steps 1.1, 1.2, 2.1–2.4, 5.1 and 5.2, « auto »
// for a step the circuit leads itself. A step carries as many bounded loops as it needs, and the
// arbitrage of a stop stands out of the sequence, under the stopped step. One list
// (scripts/etapes.mjs) holds them; the circuit, the board and the texts read it; no other script
// spells it.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as etapes from '../../scripts/etapes.mjs';
import {
  ARBITRAGE,
  ARRETS,
  AUTO,
  boucle,
  bouclesDe,
  ETAPES,
  etapeDuCircuit,
  etapeDuRole,
  GESTES,
  gesteDe,
  juge,
  libelle,
  nomDuRole,
  quiDe,
  SUITE,
  TABLE_DES_ARRETS,
} from '../../scripts/etapes.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');

interface Etape {
  numero: string | null;
  titre: string;
  qui: string[];
  parComposant?: boolean;
  boucles?: object[];
  sous?: Etape[];
}
const suite = SUITE as Etape[];
const a = (numero: string) => suite.find(e => e.numero === numero)!;

describe('the tree of a ticket, decided by the owner on 2026-10-21', () => {
  it('numbers each step from 0 to 5, its sub-steps under it, with its title and who works there', () => {
    const arbre = (e: Etape): unknown => [
      e.numero,
      e.titre,
      e.qui,
      ...(e.sous ? [e.sous.map(arbre)] : []),
    ];
    expect((ETAPES as Etape[]).map(arbre)).toEqual([
      ['0', 'Exploration', ['explorateur']],
      [
        '1',
        'Ouverture',
        [],
        [
          ['1.1', 'Relevé des composants', [AUTO]],
          ['1.2', 'Questionnement', ['questionneur', 'referent-technique']],
        ],
      ],
      [
        '2',
        'Composants',
        [],
        [
          ['2.1', 'Tests', ['testwriter']],
          ['2.2', 'Preuve du rouge', [AUTO]],
          ['2.3', 'Code', ['developpeur']],
          ['2.4', 'Contrôles', [AUTO]],
        ],
      ],
      ['3', 'Passe finale', [AUTO], [['3.1', 'Régénération des références', [AUTO]]]],
      ['4', 'Relecture', ['relecteur']],
      [
        '5',
        'Intégration',
        [],
        [
          ['5.1', 'Commit', [AUTO]],
          ['5.2', 'File : main, poussée, CI', [AUTO]],
        ],
      ],
    ]);
    expect(AUTO).toBe('auto');
  });

  it('the sequence lists every step and sub-step in its order', () => {
    expect(suite.map(e => e.numero)).toEqual([
      '0',
      '1',
      '1.1',
      '1.2',
      '2',
      '2.1',
      '2.2',
      '2.3',
      '2.4',
      '3',
      '3.1',
      '4',
      '5',
      '5.1',
      '5.2',
    ]);
    expect(libelle(a('2.3'))).toBe('2.3 Code');
  });

  it('the arbitrage of a stop stands out of the sequence, the regulator with the questionneur', () => {
    expect(ARBITRAGE).toMatchObject({
      numero: null,
      titre: "Arbitrage de l'arrêt",
      qui: ['regulateur', 'questionneur'],
    });
    expect(suite).not.toContain(ARBITRAGE);
  });

  it('the questioning numbers no step of its own any more, nor the numbering before it', () => {
    // Its one step is 1.2, a sub-step of the opening (Romain, 2026-10-21: « Questionnement »).
    expect(suite.filter(e => e.titre === 'Questionnement').map(e => e.numero)).toEqual(['1.2']);
    expect(suite.map(e => e.titre)).not.toContain('Arbitrage');
    expect(etapes).not.toHaveProperty('AUTOMATIQUE');
    expect(etapes).not.toHaveProperty('QUESTIONNEMENT');
    expect(lire('packages/grillhouse/scripts/etapes.mjs')).not.toMatch(/numero: \d/);
  });

  it('declares each bounded loop with the step that carries it, as many as it needs', () => {
    const porte = [...suite, ARBITRAGE as Etape]
      .filter(e => e.boucles)
      .map(e => [e.numero, e.boucles]);
    expect(porte).toEqual([
      ['1.2', [{ cle: 'questionnement', libelle: 'tour', max: 4 }]],
      [
        '2',
        [
          { cle: 'composant', libelle: 'composant', max: null },
          { cle: 'tests', libelle: 'essai', max: 3, sur: ['2.1', '2.2'] },
          { cle: 'code', libelle: 'essai', max: 3, sur: ['2.3', '2.4'] },
        ],
      ],
      ['4', [{ cle: 'relecture', libelle: 'tour', max: 3 }]],
      [
        null,
        [
          { cle: 'arret', libelle: 'arrêt', max: 3 },
          { cle: 'questionnement', libelle: 'tour', max: 4 },
        ],
      ],
    ]);
  });

  it('gives a loop by its key, and the loops that run at a step', () => {
    expect(boucle('code')).toEqual({ cle: 'code', libelle: 'essai', max: 3, sur: ['2.3', '2.4'] });
    const cles = (e: unknown) => (bouclesDe(e) as { cle: string }[]).map(b => b.cle);
    expect(cles(a('2.1'))).toEqual(['composant', 'tests']);
    expect(cles(a('2.2'))).toEqual(['composant', 'tests']);
    expect(cles(a('2.3'))).toEqual(['composant', 'code']);
    expect(cles(a('2.4'))).toEqual(['composant', 'code']);
    expect(cles(a('2'))).toEqual(['composant']);
    expect(cles(a('1.2'))).toEqual(['questionnement']);
    expect(cles(a('4'))).toEqual(['relecture']);
    expect(cles(a('3'))).toEqual([]);
    expect(cles(a('3.1'))).toEqual([]);
    expect(cles(ARBITRAGE)).toEqual(['arret', 'questionnement']);
  });

  it('the circuit reads the maxima of its loops in the list, none spelled again', () => {
    const c = lire('packages/grillhouse/scripts/circuit.mjs');
    expect(c).not.toMatch(
      /(RELANCES_TESTWRITER|SEANCES_DEVELOPPEUR|RELECTURES|RELANCES_DU_REGULATEUR|TOURS) = \d/
    );
    for (const cle of ['tests', 'code', 'relecture', 'arret', 'questionnement']) {
      expect(c, cle).toContain(`boucle('${cle}').max`);
    }
  });

  it('runs step 2 and its sub-steps for each component, the others once', () => {
    expect(suite.filter(e => e.parComposant).map(e => e.numero)).toEqual([
      '2',
      '2.1',
      '2.2',
      '2.3',
      '2.4',
    ]);
  });

  it('shows each role by its name in words', () => {
    expect(
      [
        'explorateur',
        'referent-technique',
        'regulateur',
        'questionneur',
        'testwriter',
        'developpeur',
        'relecteur',
        AUTO,
      ].map(nomDuRole)
    ).toEqual([
      'explorateur',
      'référent technique',
      'régulateur',
      'questionneur',
      'testwriter',
      'développeur',
      'relecteur',
      'auto',
    ]);
  });
});

// Romain, 2026-10-21: the line of 1.2 on the board holds in 52 columns, « questionneur ⇄
// référent », the role keeping its whole name everywhere else.
describe('who works at a step, in words', () => {
  it('joins the names of its roles, a step that declares its short form showing that', () => {
    expect(quiDe(a('2.3'))).toBe('développeur');
    expect(quiDe(a('1.1'))).toBe('auto');
    expect(quiDe(a('1'))).toBe('');
    expect(quiDe(ARBITRAGE)).toBe('régulateur ⇄ questionneur');
    expect(quiDe(a('1.2'))).toBe('questionneur ⇄ référent');
  });

  it('the short form of 1.2 abbreviates no role: the role keeps its whole name', () => {
    expect(a('1.2').qui).toEqual(['questionneur', 'referent-technique']);
    expect(nomDuRole('referent-technique')).toBe('référent technique');
  });
});

describe('the stops of the circuit, each with its exit code', () => {
  // grillhouse-3uv.89, L6: the components the survey finds and the title misses stop the circuit
  // before any session (scripts/composants-affectes.mjs).
  it('lists every stop by its name and code, the components missing from the title among them', () => {
    expect(ARRETS).toEqual({
      lancement: 10,
      bloqué: 11,
      'sans-fiche': 12,
      preuve: 13,
      controles: 14,
      'sans-livraison': 15,
      'relecture-arret': 16,
      integration: 17,
      question: 18,
      'hors-portee': 19,
      besoin: 20,
      'composants-manquants': 21,
      questionnement: 22,
      references: 23,
      'a-repasser': 75,
    });
  });

  it('the circuit reads its stops in the list, none spelled again', () => {
    expect(lire('packages/grillhouse/scripts/circuit.mjs')).not.toMatch(/ARRETS = \{/);
  });
});

describe("a circuit's state and a role agent are at one step", () => {
  const numero = (o: object) => etapeDuCircuit(o)?.numero ?? null;

  it("reads each step of the circuit's state, the final pass being the checks once `finale`", () => {
    expect(numero({ etape: 'testwriter' })).toBe('2.1');
    expect(numero({ etape: 'preuve' })).toBe('2.2');
    expect(numero({ etape: 'developpeur' })).toBe('2.3');
    expect(numero({ etape: 'controles' })).toBe('2.4');
    expect(numero({ etape: 'controles', finale: true })).toBe('3');
    expect(numero({ etape: 'relecture' })).toBe('4');
    expect(numero({ etape: 'integration' })).toBe('5.1');
    expect(numero({ etape: 'file' })).toBe('5.2');
    expect(numero({ etape: 'integre' })).toBeNull();
  });

  // grillhouse-3uv.92.1: the regeneration of the project's references, after the final pass.
  it('the regeneration of the references at 3.1, its stop with it', () => {
    expect(numero({ etape: 'references', finale: true })).toBe('3.1');
    expect(numero({ etape: 'references', raison: 'references', finale: true })).toBe('3.1');
  });

  it('the opening: the stop of the survey at 1.1, the questioning of the plan and its stop at 1.2', () => {
    expect(numero({ etape: 'testwriter', raison: 'composants-manquants' })).toBe('1.1');
    expect(numero({ etape: 'testwriter', questionnement: { objet: 'plan', tour: 2 } })).toBe('1.2');
    expect(numero({ etape: 'testwriter', raison: 'questionnement' })).toBe('1.2');
  });

  it('the questioning of a decision of the regulator stays at the stopped step', () => {
    expect(
      numero({ etape: 'controles', raison: 'controles', questionnement: { objet: 'decision' } })
    ).toBe('2.4');
  });

  it('a developpeur relaunched by the final pass is at 2.3, its checks at 3', () => {
    expect(numero({ etape: 'developpeur', finale: true })).toBe('2.3');
  });

  it('places each role agent at its step, the regulator at the arbitrage, any other agent nowhere', () => {
    expect(
      [
        'explorateur',
        'referent-technique',
        'questionneur',
        'testwriter',
        'developpeur',
        'relecteur',
      ].map(r => etapeDuRole(r)?.numero)
    ).toEqual(['0', '1.2', '1.2', '2.1', '2.3', '4']);
    expect(etapeDuRole('regulateur')).toBe(ARBITRAGE);
    expect(etapeDuRole('Explore')).toBeNull();
    expect(etapeDuRole(AUTO)).toBeNull();
  });

  it('the roles that judge a plan or a stop deliver nothing to the lot', () => {
    expect(
      ['questionneur', 'referent-technique', 'regulateur', 'testwriter', 'developpeur'].map(juge)
    ).toEqual([true, true, true, false, false]);
  });
});

describe('one list, which the circuit, the board and the texts read', () => {
  it('the circuit and the board import it', () => {
    for (const f of [
      'packages/grillhouse/scripts/circuit.mjs',
      'packages/grillhouse/scripts/tableau.mjs',
    ]) {
      expect(lire(f), f).toMatch(/from '\.\/etapes\.mjs'/);
    }
  });

  it('no other script nor the mod spells a title of the list', () => {
    const fichiers = [
      ...readdirSync(path.join(RACINE, 'packages/grillhouse/scripts'), {
        recursive: true,
        encoding: 'utf8',
      })
        .filter(f => /\.(mjs|sh)$/.test(f) && f !== 'etapes.mjs')
        .map(f => path.join('packages/grillhouse/scripts', f)),
      'mods/grillhouse/hooks/register.tsx',
    ];
    const titres = [
      'Relevé des composants',
      'Questionnement',
      'Preuve du rouge',
      'Passe finale',
      'Régénération des références',
      'File : main, poussée, CI',
      "Arbitrage de l'arrêt",
    ];
    const copies = fichiers.flatMap(f =>
      titres.filter(t => lire(f).includes(t)).map(t => `${f} : ${t}`)
    );
    expect(copies).toEqual([]);
  });

  it('the common charter cites each step by its number and title, and the arbitrage', () => {
    const charte = lire('.claude/grillhouse/charte.md').replace(/\s+/g, ' ');
    for (const e of suite) {
      expect(charte, `${e.numero} ${e.titre}`).toContain(`${e.numero} ${e.titre}`);
    }
    expect(charte).toContain(ARBITRAGE.titre);
    expect(charte).not.toMatch(/2\.1 Questionnement|10 File|dix étapes/);
  });
});

// grillhouse-3uv.89 (L4): the written policy of the stops, as the bounded retries of Zuul and of
// GitHub's merge queue are written in their configuration. Witness: BPScript 320.3 (2026-10-20),
// 22 decisions of the regulator, 11 of them a mechanical rule would have taken, 5 relaunches
// identical to the one before, 5 wrong on the substance.
describe('the table of the stops and their gesture, in the list of the steps', () => {
  it('names each kind of stop with its gesture, in the order the circuit tries them', () => {
    expect(TABLE_DES_ARRETS.map(l => [l.genre, l.geste])).toEqual([
      ['composants-manquants', 'superviseur'],
      ['questionnement', 'superviseur'],
      ['meme-arret-sans-fait-nouveau', 'superviseur'],
      ['a-repasser', 'a-repasser'],
      ['a-arbitrer', 'regulateur'],
      ['rouge-d-un-autre-composant', 'developpeur-du-composant'],
      ['renvoi-au-testwriter', 'testwriter'],
      ['composant-ajoute', 'testwriter'],
      ['critere-neuf', 'testwriter'],
    ]);
  });

  it('each line carries a gesture of the vocabulary and the case of BPScript 320.3 it settles', () => {
    for (const l of TABLE_DES_ARRETS) {
      expect(GESTES, l.genre).toContain(l.geste);
      // A stop (A1–A19) or a decision (D1–D22) of the analysis of 320.3.
      expect(l.cas, l.genre).toMatch(/\b[AD]\d{1,2}\b/);
    }
    expect(new Set(TABLE_DES_ARRETS.map(l => l.genre)).size).toBe(TABLE_DES_ARRETS.length);
  });

  it('gives the line of a kind of stop, and none for a kind it does not hold', () => {
    expect(gesteDe('a-arbitrer')?.geste).toBe('regulateur');
    expect(gesteDe('relecture-arret')).toBeNull();
  });

  // Romain, 2026-10-21: the stops of the opening go to the supervisor with no regulator, which
  // the board reads in the table, never in a list of its own.
  it('the stops of the opening, at 1.1 and 1.2, go to the supervisor', () => {
    const ouverture = ['1.1', '1.2'].flatMap(n => (a(n) as { arrets?: string[] }).arrets ?? []);
    expect(ouverture).toEqual(['composants-manquants', 'questionnement']);
    for (const arret of ouverture) {
      expect(ARRETS, arret).toHaveProperty([arret]);
      expect(gesteDe(arret)?.geste, arret).toBe('superviseur');
    }
  });

  it('the circuit reads its gestures in the table', () => {
    expect(lire('packages/grillhouse/scripts/circuit.mjs')).toMatch(
      /import \{[^}]*\bgesteDe\b[^}]*\} from '\.\/etapes\.mjs'/
    );
  });
});

// grillhouse-3uv.92.1 (BPScript 320.4, n° 9, 45 min): the references a project derives from the
// whole copy (a fingerprint of its output, a ceiling of words) were regenerated by no step; as
// `rustc --bless` and `jest -u`, a step the circuit leads itself regenerates them after the final
// pass, and stands in the tree only for a project that declares them.
describe('the regeneration of the references, a step of a project that declares them', () => {
  it('3.1 runs once, after the final pass, the circuit leading it, under its state « references »', () => {
    expect(a('3.1')).toMatchObject({
      titre: 'Régénération des références',
      qui: [AUTO],
      etat: 'references',
      declaration: 'references',
      arrets: ['references'],
    });
    expect(a('3.1').parComposant).toBeUndefined();
    expect(gesteDe('references')).toBeNull();
  });

  it('only 3.1 depends on a declaration of the project', () => {
    expect(
      suite.filter(e => (e as { declaration?: string }).declaration).map(e => e.numero)
    ).toEqual(['3.1']);
  });
});
