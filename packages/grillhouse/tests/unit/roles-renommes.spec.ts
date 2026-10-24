// grillhouse-3uv.88: the agent `arbitre` became the `referent-technique`, the agent
// `chef-de-chantier` the `regulateur`, without an alias of the former names; the agent `testeur` is
// now the `testwriter` (Romain, 2026-10-21), under the same rule. grillhouse-3uv.95.4 (decision 3
// of 3uv.95): the regulator and the technical referent are removed, the circuit making the
// mechanical gestures and a real question going up to the supervisor. The frame's plugin
// (mods/grillhouse/, grillhouse-3uv.84.2) and its package carry none of these names.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
const ANCIENS = ['arbitre', 'chef-de-chantier', 'testeur', 'regulateur', 'referent-technique'];
// The files the frame distributes and the texts that describe it: its plugin, its package, its
// project templates and its documents; its history aside: CHANGELOG.md, its tests (their former
// forms, tests/formes/) and its migrations (scripts/migrations/), which know the former forms.
const duCadre = () =>
  execFileSync(
    'git',
    [
      '-C',
      RACINE,
      'ls-files',
      '--',
      'mods/grillhouse',
      'packages/grillhouse/bin',
      'packages/grillhouse/scripts',
      'packages/grillhouse/docs',
      'templates',
      'docs',
      'README.md',
      'STRUCTURE.md',
      'CLAUDE.md',
      ':(exclude)packages/grillhouse/scripts/migrations',
    ],
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter(f => f && existsSync(path.join(RACINE, f)));

describe('the roles of the frame under their names alone', () => {
  it('the plugin carries the agents and skills of the circuit', () => {
    for (const role of ['explorateur', 'questionneur', 'testwriter', 'developpeur', 'relecteur']) {
      expect(existsSync(path.join(RACINE, `mods/grillhouse/agents/${role}.md`)), role).toBe(true);
      expect(existsSync(path.join(RACINE, `mods/grillhouse/skills/${role}/SKILL.md`)), role).toBe(
        true
      );
    }
  });

  it('the plugin carries no former nor removed agent or skill', () => {
    for (const ancien of ANCIENS) {
      expect(existsSync(path.join(RACINE, `mods/grillhouse/agents/${ancien}.md`)), ancien).toBe(
        false
      );
      expect(existsSync(path.join(RACINE, `mods/grillhouse/skills/${ancien}`)), ancien).toBe(false);
    }
  });

  it('no file the frame distributes names a former or a removed role', () => {
    const fautes = duCadre().flatMap(f => {
      const t = readFileSync(path.join(RACINE, f), 'utf8');
      return [
        /chef-de-chantier/,
        /chefs? de chantier/i,
        /`arbitre`/,
        /\bagent arbitre\b/,
        /\bl'arbitre\b/i,
        /'arbitre'/,
        /\bCHEF\b/,
        /testeur/i,
        /r[eé]gulat(?:eur|rice)/i,
        /referent-technique/i,
        /r[eé]f[eé]rents? techniques?/i,
        /etat-du-circuit/,
      ]
        .filter(m => m.test(t))
        .map(m => `${f} : ${m}`);
    });
    expect(fautes).toEqual([]);
  });

  // grillhouse-3uv.95.11 critère 1: the circuit of 0.24.0 is 1 Plan, 2 Tests and 2.1 Preuve,
  // 3 Code and 3.1 Contrôles, 4 Passe finale et relecture, 5 Intégration, each step once for the
  // whole ticket; the steps of the former tree, its loop by component, its table of the stops and
  // its options are gone, and no text of the frame names them.
  // A word's bounds in Unicode (`\b` holds no bound before « é »).
  const mot = (corps: string, drapeaux = '') =>
    new RegExp(`(?<![\\p{L}\\p{N}])(?:${corps})(?![\\p{L}\\p{N}])`, `u${drapeaux}`);
  const ANCIEN_CIRCUIT = [
    mot('0 Exploration'),
    mot('1 Ouverture'),
    mot('1\\.1 Relev[ée]'),
    mot('1\\.2 Questionnement'),
    mot('2 Composants'),
    mot('2\\.[234] (?:Preuve|Code|Contrôles)'),
    mot('3 Passe finale'),
    mot('4 Relecture'),
    mot("Arbitrage de l['’]arrêt", 'i'),
    mot('tables? des arrêts', 'i'),
    mot('table of the stops', 'i'),
    mot('tour [0-9n]/4'),
    mot('0 to 5'),
    mot('per component or once'),
    mot('(?:séance|étape|boucle)s? par composant', 'i'),
    mot('(?:session|step|loop)s? per component', 'i'),
    /`(?:testwriter|developpeur) <composant>`/,
    /composants-manquants/,
    /--(?:reponse|decision|admettre)\b/,
  ];

  it('the forms of the former circuit are found, accents included, and not inside another word', () => {
    for (const t of [
      'une étape par composant',
      'Une séance par composant.',
      '« Arbitrage de l’arrêt »',
      '0 Exploration ; 1 Ouverture',
    ]) {
      expect(
        ANCIEN_CIRCUIT.some(m => m.test(t)),
        t
      ).toBe(true);
    }
    for (const t of [
      'aucune spécificité par composant',
      'sous-étapes',
      'un relevé des composants',
    ]) {
      expect(
        ANCIEN_CIRCUIT.some(m => m.test(t)),
        t
      ).toBe(false);
    }
  });

  it('no file the frame distributes names a step, a loop or an option of the former circuit', () => {
    const fautes = duCadre().flatMap(f => {
      const t = readFileSync(path.join(RACINE, f), 'utf8');
      return ANCIEN_CIRCUIT.filter(m => m.test(t)).map(m => `${f} : ${m}`);
    });
    expect(fautes).toEqual([]);
  });
});
