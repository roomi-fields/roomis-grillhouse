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
// project templates and its documents; its history (CHANGELOG.md) and its tests aside.
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
});
