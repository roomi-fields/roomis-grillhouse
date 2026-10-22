// grillhouse-3uv.88: the agent `arbitre` is now the `referent-technique` (« référent technique »),
// the agent `chef-de-chantier` the `regulateur` (« régulateur »), the railway regulator or the
// build sheriff of Chromium, without an alias of the former names. The agent `testeur` is now the
// `testwriter` (Romain, 2026-10-21), under the same rule. The frame's plugin (mods/grillhouse/,
// grillhouse-3uv.84.2) carries the agents and the skills under their new names alone.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
const ANCIENS = ['arbitre', 'chef-de-chantier', 'testeur'];
// The files the frame distributes: its plugin and its package.
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
    ],
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter(f => f && existsSync(path.join(RACINE, f)));

describe('the renamed roles under their new names', () => {
  it('the plugin carries the agents and skills referent-technique, regulateur and testwriter', () => {
    for (const role of ['referent-technique', 'regulateur', 'testwriter']) {
      expect(existsSync(path.join(RACINE, `mods/grillhouse/agents/${role}.md`)), role).toBe(true);
      expect(existsSync(path.join(RACINE, `mods/grillhouse/skills/${role}/SKILL.md`)), role).toBe(
        true
      );
    }
  });

  it('the plugin carries no former agent nor skill', () => {
    for (const ancien of ANCIENS) {
      expect(existsSync(path.join(RACINE, `mods/grillhouse/agents/${ancien}.md`)), ancien).toBe(
        false
      );
      expect(existsSync(path.join(RACINE, `mods/grillhouse/skills/${ancien}`)), ancien).toBe(false);
    }
  });

  it('no file the frame distributes names a former role', () => {
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
      ]
        .filter(m => m.test(t))
        .map(m => `${f} : ${m}`);
    });
    expect(fautes).toEqual([]);
  });
});
