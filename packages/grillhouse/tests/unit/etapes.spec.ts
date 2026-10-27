// grillhouse-3uv.90: the steps of a ticket are the tree of its circuit, as a pipeline of GitLab CI
// shows its stages and their jobs: 1 to 5, the sub-steps 2.1, 3.1, 4.1–4.3, 5.1–5.3, « auto »
// for a step the circuit leads itself. A step carries as many bounded loops as it needs. One list
// (scripts/etapes.mjs) holds them, the gestures of the circuit and the questions of its stops
// (grillhouse-3uv.95.4); the circuit, the board and the texts read it; no other script spells it.
// grillhouse-3uv.95.6 (decision 6 of 3uv.95): one testwriter and one developpeur for the whole
// ticket, as a merge request has one author, a series of tests and code, one CI on the whole and
// one review; no step runs for each component.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as etapes from '../../scripts/etapes.mjs';
import {
  AGENTS_DU_LOT,
  ARRETS,
  AUTO,
  boucle,
  bouclesDe,
  ETAPES,
  etapeDuCircuit,
  etapeDuRole,
  GESTES,
  gesteDe,
  libelle,
  MONTEES,
  monteeDe,
  nomDuRole,
  quiDe,
  RESPONSABLE,
  SUITE,
  SUPERVISEUR,
} from '../../scripts/etapes.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');

interface Etape {
  numero: string | null;
  titre: string;
  qui: string[];
  boucles?: object[];
  sous?: Etape[];
}
const suite = SUITE as Etape[];
const a = (numero: string) => suite.find(e => e.numero === numero)!;

describe('the tree of a ticket, decided by the owner on 2026-10-21 and 2026-10-23', () => {
  it('numbers each step from 1 to 5, its sub-steps under it, with its title and who works there', () => {
    const arbre = (e: Etape): unknown => [
      e.numero,
      e.titre,
      e.qui,
      ...(e.sous ? [e.sous.map(arbre)] : []),
    ];
    expect((ETAPES as Etape[]).map(arbre)).toEqual([
      ['1', 'Plan', ['explorateur', 'questionneur']],
      ['2', 'Tests', ['testwriter'], [['2.1', 'Preuve du rouge', [AUTO]]]],
      ['3', 'Code', ['developpeur'], [['3.1', 'Contrôles', [AUTO]]]],
      [
        '4',
        'Passe finale et relecture',
        [],
        [
          ['4.1', 'Passe finale', [AUTO]],
          ['4.2', 'Régénération des références', [AUTO]],
          ['4.3', 'Relecture', ['relecteur']],
        ],
      ],
      [
        '5',
        'Intégration',
        [],
        [
          ['5.1', 'Commit', [AUTO]],
          ['5.2', 'File : main, poussée, CI', [AUTO]],
          ['5.3', 'Tri des découvertes', ['explorateur']],
        ],
      ],
    ]);
    expect(AUTO).toBe('auto');
  });

  it('the sequence lists every step and sub-step in its order', () => {
    expect(suite.map(e => e.numero)).toEqual([
      '1',
      '2',
      '2.1',
      '3',
      '3.1',
      '4',
      '4.1',
      '4.2',
      '4.3',
      '5',
      '5.1',
      '5.2',
      '5.3',
    ]);
    expect(libelle(a('3'))).toBe('3 Code');
  });

  // grillhouse-3uv.95.4: no regulator and no technical referent; a stop no gesture settles goes up
  // to the supervisor.
  it('no step, nor any arbitrage out of the sequence, holds the removed roles', () => {
    for (const nom of ['ARBITRAGE', 'REGULATEUR', 'TABLE_DES_ARRETS', 'juge']) {
      expect(etapes, nom).not.toHaveProperty(nom);
    }
    expect(suite.flatMap(e => e.qui)).not.toContain('regulateur');
    expect(suite.flatMap(e => e.qui)).not.toContain('referent-technique');
  });

  // grillhouse-3uv.95.5 (decision 4 of 3uv.95): the explorateur writes the plan, the questionneur
  // reads it once, the explorateur answers once; no survey of the circuit, no exploration apart.
  it('the plan is step 1, the explorateur’s and the questionneur’s, with no sub-step, nor the numbering before it', () => {
    expect(a('1')).toMatchObject({
      titre: 'Plan',
      questionnement: 'plan',
      arrets: ['questionnement'],
    });
    expect(a('1').sous).toBeUndefined();
    for (const titre of ['Exploration', 'Ouverture', 'Relevé des composants', 'Questionnement']) {
      expect(suite.map(e => e.titre)).not.toContain(titre);
    }
    expect(suite.map(e => e.titre)).not.toContain('Arbitrage');
    expect(etapes).not.toHaveProperty('AUTOMATIQUE');
    expect(etapes).not.toHaveProperty('QUESTIONNEMENT');
    expect(lire('packages/grillhouse/scripts/etapes.mjs')).not.toMatch(/numero: \d/);
  });

  it('declares each bounded loop with the step that carries it, as many as it needs', () => {
    const porte = suite.filter(e => e.boucles).map(e => [e.numero, e.boucles]);
    expect(porte).toEqual([
      ['2', [{ cle: 'tests', libelle: 'essai', max: 3 }]],
      ['3', [{ cle: 'code', libelle: 'essai', max: 3 }]],
      ['4.3', [{ cle: 'relecture', libelle: 'tour', max: 3 }]],
    ]);
  });

  it('gives a loop by its key, and the loops that run at a step', () => {
    expect(boucle('code')).toEqual({ cle: 'code', libelle: 'essai', max: 3 });
    const cles = (e: unknown) => (bouclesDe(e) as { cle: string }[]).map(b => b.cle);
    expect(cles(a('2'))).toEqual(['tests']);
    expect(cles(a('2.1'))).toEqual(['tests']);
    expect(cles(a('3'))).toEqual(['code']);
    expect(cles(a('3.1'))).toEqual(['code']);
    expect(cles(a('1'))).toEqual([]);
    expect(cles(a('4'))).toEqual([]);
    expect(cles(a('4.1'))).toEqual([]);
    expect(cles(a('4.2'))).toEqual([]);
    expect(cles(a('4.3'))).toEqual(['relecture']);
  });

  it('the circuit reads the maxima of its loops in the list, none spelled again', () => {
    const c = lire('packages/grillhouse/scripts/circuit.mjs');
    expect(c).not.toMatch(
      /(RELANCES_TESTWRITER|SEANCES_DEVELOPPEUR|RELECTURES|RELANCES_DU_REGULATEUR|TOURS) = \d/
    );
    for (const cle of ['tests', 'code', 'relecture']) {
      expect(c, cle).toContain(`boucle('${cle}').max`);
    }
  });

  // grillhouse-3uv.95.6, critère 3: no component is a unit of the circuit any more.
  it('runs every step once for the whole ticket: no step for each component', () => {
    expect(suite.filter(e => 'parComposant' in e).map(e => e.numero)).toEqual([]);
    expect(suite.flatMap(e => e.boucles ?? []).map(b => (b as { cle: string }).cle)).not.toContain(
      'composant'
    );
    expect(lire('packages/grillhouse/scripts/etapes.mjs')).not.toMatch(/parComposant/);
  });

  it('names the agents of the lot, whom a finding of the reviewer may name', () => {
    expect(AGENTS_DU_LOT).toEqual(['testwriter', 'developpeur']);
  });

  it('shows each role by its name in words', () => {
    expect(
      ['explorateur', 'questionneur', 'testwriter', 'developpeur', 'relecteur', AUTO].map(nomDuRole)
    ).toEqual(['explorateur', 'questionneur', 'testwriter', 'développeur', 'relecteur', 'auto']);
  });
});

describe('who works at a step, in words', () => {
  it('joins the names of its roles', () => {
    expect(quiDe(a('3'))).toBe('développeur');
    expect(quiDe(a('1'))).toBe('explorateur ⇄ questionneur');
    expect(quiDe(a('4'))).toBe('');
    expect(quiDe(a('2.1'))).toBe('auto');
  });
});

describe('the stops of the circuit, each with its exit code', () => {
  // grillhouse-3uv.95.5: the survey the circuit played again (« composants-manquants », 21) is
  // gone; the explorateur surveys the components when it writes the plan.
  it('lists every stop by its name and code', () => {
    expect(ARRETS).toEqual({
      lancement: 10,
      bloqué: 11,
      'sans-fiche': 12,
      preuve: 13,
      controles: 14,
      'sans-livraison': 15,
      'relecture-arret': 16,
      integration: 17,
      'hors-portee': 19,
      besoin: 20,
      questionnement: 22,
      references: 23,
      'hors-plan': 24,
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
    expect(numero({ etape: 'testwriter' })).toBe('2');
    expect(numero({ etape: 'preuve' })).toBe('2.1');
    expect(numero({ etape: 'developpeur' })).toBe('3');
    expect(numero({ etape: 'controles' })).toBe('3.1');
    expect(numero({ etape: 'controles', finale: true })).toBe('4.1');
    expect(numero({ etape: 'relecture' })).toBe('4.3');
    expect(numero({ etape: 'integration' })).toBe('5.1');
    expect(numero({ etape: 'file' })).toBe('5.2');
    // grillhouse-0yu.5: the tri of the discoveries, after the queue, the explorateur's.
    expect(numero({ etape: 'tri' })).toBe('5.3');
    expect(etapeDuRole('explorateur')?.numero).toBe('1');
    expect(numero({ etape: 'integre' })).toBeNull();
  });

  // grillhouse-3uv.92.1: the regeneration of the project's references, after the final pass.
  it('the regeneration of the references at 4.2, its stop with it', () => {
    expect(numero({ etape: 'references', finale: true })).toBe('4.2');
    expect(numero({ etape: 'references', raison: 'references', finale: true })).toBe('4.2');
  });

  it('the plan: the work on it and its stop at 1', () => {
    expect(
      numero({ etape: 'testwriter', questionnement: { objet: 'plan', role: 'explorateur' } })
    ).toBe('1');
    expect(
      numero({ etape: 'testwriter', questionnement: { objet: 'plan', role: 'questionneur' } })
    ).toBe('1');
    expect(numero({ etape: 'testwriter', raison: 'questionnement' })).toBe('1');
    expect(numero({ etape: 'testwriter', releve: new Date().toISOString() })).toBe('2');
  });

  it('a developpeur relaunched by the final pass is at 3, its checks at 4.1', () => {
    expect(numero({ etape: 'developpeur', finale: true })).toBe('3');
  });

  it('places each role agent at its step, any other agent nowhere', () => {
    expect(
      ['explorateur', 'questionneur', 'testwriter', 'developpeur', 'relecteur'].map(
        r => etapeDuRole(r)?.numero
      )
    ).toEqual(['1', '1', '2', '3', '4.3']);
    expect(etapeDuRole('regulateur')).toBeNull();
    expect(etapeDuRole('Explore')).toBeNull();
    expect(etapeDuRole(AUTO)).toBeNull();
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
      'Preuve du rouge',
      'Passe finale',
      'Régénération des références',
      'File : main, poussée, CI',
    ];
    const copies = fichiers.flatMap(f =>
      titres.filter(t => lire(f).includes(t)).map(t => `${f} : ${t}`)
    );
    expect(copies).toEqual([]);
  });

  // grillhouse-3uv.84.8: the circuit of a ticket lives in the supervisor's skill; the charter names
  // the list.
  it('the supervisor’s skill cites each step by its number and title; the charter names the list', () => {
    expect(lire('mods/grillhouse/charte.md')).toContain('(`etapes.mjs`, la seule liste)');
    const charte = lire('mods/grillhouse/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    for (const e of suite) {
      expect(charte, `${e.numero} ${e.titre}`).toContain(`${e.numero} ${e.titre}`);
    }
    expect(charte).not.toMatch(/2\.1 Questionnement|10 File|dix étapes/);
  });
});

// grillhouse-3uv.95.4 (decision 3 of 3uv.95): as a CI applies its rules without asking and calls a
// person only for what no rule settles, the circuit makes its mechanical gestures itself, and every
// other stop goes up to the supervisor with its fact, its piece and its question. Witness: BP 320.9,
// 45 sessions of the regulator, 22 of the referent, 14 montées that were mechanical gestures.
describe('the gestures of the circuit and the questions of its stops, in the list of the steps', () => {
  it('names each gesture the circuit makes itself, with its rule and the case it settles', () => {
    expect(GESTES.map(g => g.genre)).toEqual([
      'a-repasser',
      'rejeu',
      'renvoi-au-testwriter',
      'regeneration',
      'rien-a-livrer',
    ]);
    for (const g of GESTES) {
      expect(g.geste.trim(), g.genre).not.toBe('');
      expect(g.regle.trim(), g.genre).not.toBe('');
      expect(g.cas, g.genre).toMatch(/\b[AB]\d{1,2}\b|\bBP 320\.9\b/);
    }
    expect(gesteDe('rien-a-livrer')?.genre).toBe('rien-a-livrer');
    expect(gesteDe('controles')).toBeNull();
  });

  it('every stop but « a-repasser » carries its question for the supervisor, with the commands that answer it', () => {
    expect(Object.keys(MONTEES).sort()).toEqual(
      Object.keys(ARRETS)
        .filter(n => n !== 'a-repasser')
        .sort()
    );
    for (const [arret, m] of Object.entries(MONTEES)) {
      expect(m.qui, arret).toBe(SUPERVISEUR);
      for (const commande of ['--reprendre', '--etendre', '--arreter']) {
        expect(m.question, arret).toContain(commande);
      }
    }
    expect(monteeDe('a-repasser')).toBeNull();
    expect(monteeDe('hors-plan')?.question).toContain('--etendre');
    // grillhouse-3uv.95.6: `--depuis` names a step for the whole ticket, `--etendre` a package.
    for (const m of Object.values(MONTEES)) {
      expect(m.question).toContain('`--depuis <testwriter|developpeur>`');
      expect(m.question).toContain('`--etendre <paquet>`');
      expect(m.question).not.toMatch(/composant/);
    }
    expect([SUPERVISEUR, RESPONSABLE]).toEqual(['superviseur', 'responsable']);
  });

  it('the circuit reads its gestures and its questions in the list', () => {
    expect(lire('packages/grillhouse/scripts/circuit.mjs')).toMatch(
      /import \{[^}]*\bgesteDe\b[^}]*\bmonteeDe\b[^}]*\} from '\.\/etapes\.mjs'/
    );
  });
});

// grillhouse-3uv.92.1 (BPScript 320.4, n° 9, 45 min): the references a project derives from the
// whole copy (a fingerprint of its output, a ceiling of words) were regenerated by no step; as
// `rustc --bless` and `jest -u`, a step the circuit leads itself regenerates them after the final
// pass. grillhouse-3uv.95.8: the frame's generated files and its known debt are references of the
// circuit in every project, so 4.2 stands in the tree of every project.
describe('the regeneration of the references, a step of every project', () => {
  it('4.2 runs once, after the final pass, the circuit leading it, under its state « references »', () => {
    expect(a('4.2')).toMatchObject({
      titre: 'Régénération des références',
      qui: [AUTO],
      etat: 'references',
      arrets: ['references'],
    });
    expect(gesteDe('regeneration')).not.toBeNull();
  });

  it('no step depends on a declaration of the project', () => {
    expect(suite.filter(e => 'declaration' in e).map(e => e.numero)).toEqual([]);
  });
});
