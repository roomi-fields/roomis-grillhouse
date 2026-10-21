// grillhouse-3uv.88: the steps of a ticket are numbered one by one, the automatic ones included,
// as a pipeline of GitLab CI or Zuul numbers and names each of its stages. One list
// (scripts/etapes.mjs) holds them: its number, its title, who works there (a role agent, or
// « automatique »), and whether it runs for each component or once. The circuit, the board and the
// texts read it; no other script spells it.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARRETS,
  AUTOMATIQUE,
  ETAPES,
  etapeDuCircuit,
  etapeDuRole,
  GESTES,
  gesteDe,
  nomDuRole,
  TABLE_DES_ARRETS,
} from '../../scripts/etapes.mjs';

const RACINE = path.resolve(__dirname, '../..');
const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');

describe('the ten steps, decided by the owner on 2026-10-20', () => {
  it('numbers each step from 1 to 10, with its title and who works there', () => {
    expect(ETAPES.map(e => [e.numero, e.titre, e.qui])).toEqual([
      [1, 'Exploration', ['explorateur']],
      [2, 'Arbitrage', ['referent-technique', 'regulateur']],
      [3, 'Tests', ['testeur']],
      [4, 'Preuve du rouge', [AUTOMATIQUE]],
      [5, 'Code', ['developpeur']],
      [6, 'Contrôles', [AUTOMATIQUE]],
      [7, 'Passe finale', [AUTOMATIQUE]],
      [8, 'Relecture', ['relecteur']],
      [9, 'Intégration', [AUTOMATIQUE]],
      [10, 'File : main, poussée, CI', [AUTOMATIQUE]],
    ]);
    expect(AUTOMATIQUE).toBe('automatique');
  });

  it('declares each bounded loop with its step: its label and its maximum', () => {
    expect(ETAPES.filter(e => e.boucle).map(e => [e.numero, e.boucle])).toEqual([
      [2, { libelle: 'arrêt', max: 3 }],
      [3, { libelle: 'essai', max: 3 }],
      [5, { libelle: 'essai', max: 3 }],
      [8, { libelle: 'tour', max: 3 }],
    ]);
  });

  it('the circuit reads the maxima of its loops in the list, none spelled again', () => {
    const c = lire('scripts/circuit.mjs');
    expect(c).not.toMatch(
      /(RELANCES_TESTEUR|SEANCES_DEVELOPPEUR|RELECTURES|RELANCES_DU_REGULATEUR) = \d/
    );
    expect(c).toMatch(/\.boucle\.max/);
  });

  it('runs steps 3 to 6 for each component, the others once', () => {
    expect(ETAPES.filter(e => e.parComposant).map(e => e.numero)).toEqual([3, 4, 5, 6]);
  });

  it('shows each role by its name in words', () => {
    expect(
      [
        'explorateur',
        'referent-technique',
        'regulateur',
        'testeur',
        'developpeur',
        'relecteur',
        AUTOMATIQUE,
      ].map(nomDuRole)
    ).toEqual([
      'explorateur',
      'référent technique',
      'régulateur',
      'testeur',
      'développeur',
      'relecteur',
      'automatique',
    ]);
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
      'a-repasser': 75,
    });
  });

  it('the circuit reads its stops in the list, none spelled again', () => {
    expect(lire('scripts/circuit.mjs')).not.toMatch(/ARRETS = \{/);
  });
});

describe("a circuit's state and a role agent are at one step", () => {
  it("reads each step of the circuit's state, the final pass being the checks once `finale`", () => {
    const numero = (etape: string, finale = false) =>
      etapeDuCircuit({ etape, finale })?.numero ?? null;
    expect(numero('testeur')).toBe(3);
    expect(numero('preuve')).toBe(4);
    expect(numero('developpeur')).toBe(5);
    expect(numero('controles')).toBe(6);
    expect(numero('controles', true)).toBe(7);
    expect(numero('relecture')).toBe(8);
    expect(numero('integration')).toBe(9);
    expect(numero('file')).toBe(10);
    expect(numero('integre')).toBeNull();
  });

  it('a developpeur relaunched by the final pass is at step 5, its checks at step 7', () => {
    expect(etapeDuCircuit({ etape: 'developpeur', finale: true })?.numero).toBe(5);
  });

  it('places each role agent at its step, any other agent nowhere', () => {
    expect(
      [
        'explorateur',
        'referent-technique',
        'regulateur',
        'testeur',
        'developpeur',
        'relecteur',
      ].map(r => etapeDuRole(r)?.numero)
    ).toEqual([1, 2, 2, 3, 5, 8]);
    expect(etapeDuRole('Explore')).toBeNull();
    expect(etapeDuRole(AUTOMATIQUE)).toBeNull();
  });
});

describe('one list, which the circuit, the board and the texts read', () => {
  it('the circuit and the board import it', () => {
    for (const f of ['scripts/circuit.mjs', 'scripts/tableau.mjs']) {
      expect(lire(f), f).toMatch(/from '\.\/etapes\.mjs'/);
    }
  });

  it('no other script nor the mod spells a title of the list', () => {
    const fichiers = [
      ...readdirSync(path.join(RACINE, 'scripts'), { recursive: true, encoding: 'utf8' })
        .filter(f => /\.(mjs|sh)$/.test(f) && f !== 'etapes.mjs')
        .map(f => path.join('scripts', f)),
      'mods/grillhouse/hooks/register.tsx',
    ];
    const titres = ['Preuve du rouge', 'Passe finale', 'File : main, poussée, CI'];
    const copies = fichiers.flatMap(f =>
      titres.filter(t => lire(f).includes(t)).map(t => `${f} : ${t}`)
    );
    expect(copies).toEqual([]);
  });

  it('the common charter cites each step by its number and title', () => {
    const charte = lire('.claude/grillhouse/charte.md').replace(/\s+/g, ' ');
    for (const e of ETAPES) {
      expect(charte, `${e.numero} ${e.titre}`).toContain(`${e.numero} ${e.titre}`);
    }
    expect(charte).not.toMatch(/numéro de son rôle/);
  });
});

// grillhouse-3uv.89 (L4): the written policy of the stops, as the bounded retries of Zuul and of
// GitHub's merge queue are written in their configuration. Witness: BPScript 320.3 (2026-10-20),
// 22 decisions of the regulator, 11 of them a mechanical rule would have taken, 5 relaunches
// identical to the one before, 5 wrong on the substance.
describe('the table of the stops and their gesture, in the list of the steps', () => {
  it('names each kind of stop with its gesture, in the order the circuit tries them', () => {
    expect(TABLE_DES_ARRETS.map(l => [l.genre, l.geste])).toEqual([
      ['meme-arret-sans-fait-nouveau', 'superviseur'],
      ['a-repasser', 'a-repasser'],
      ['a-arbitrer', 'regulateur'],
      ['rouge-d-un-autre-composant', 'developpeur-du-composant'],
      ['renvoi-au-testeur', 'testeur'],
      ['composant-ajoute', 'testeur'],
      ['critere-neuf', 'testeur'],
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

  it('the circuit reads its gestures in the table', () => {
    expect(lire('scripts/circuit.mjs')).toMatch(
      /import \{[^}]*\bgesteDe\b[^}]*\} from '\.\/etapes\.mjs'/
    );
  });
});
