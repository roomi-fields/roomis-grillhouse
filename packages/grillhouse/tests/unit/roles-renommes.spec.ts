// grillhouse-3uv.88: the agent `arbitre` is now the `referent-technique` (« référent technique »),
// the agent `chef-de-chantier` the `regulateur` (« régulateur »), the railway regulator or the
// build sheriff of Chromium, without an alias of the former names. The frame installs neither
// former agent nor skill, and the update of a project removes those it holds. The agent
// `testeur` is now the `testwriter` (Romain, 2026-10-21), under the same rule.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fichiersDuCadre, lireListe } from '../../scripts/grillhouse-maj.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const LISTE = '.claude/grillhouse/fichiers.txt';
const ANCIENS = [
  '.claude/agents/arbitre.md',
  '.claude/agents/chef-de-chantier.md',
  '.claude/skills/arbitre/',
  '.claude/skills/chef-de-chantier/',
  '.claude/agents/testeur.md',
  '.claude/skills/testeur/',
];
const liste = () => lireListe(readFileSync(path.join(RACINE, LISTE), 'utf8'));
const duCadre = () => fichiersDuCadre(RACINE, liste().garder) as string[];

describe('the renamed roles under their new names', () => {
  it('the frame installs the agents and skills referent-technique, regulateur and testwriter', () => {
    expect(duCadre()).toEqual(
      expect.arrayContaining([
        '.claude/agents/referent-technique.md',
        '.claude/agents/regulateur.md',
        '.claude/skills/referent-technique/SKILL.md',
        '.claude/skills/regulateur/SKILL.md',
        '.claude/agents/testwriter.md',
        '.claude/skills/testwriter/SKILL.md',
      ])
    );
  });

  it('the frame installs no former agent nor skill, and the list removes each from a project', () => {
    const anciens = duCadre().filter(f => ANCIENS.some(a => f === a || f.startsWith(a)));
    expect(anciens).toEqual([]);
    expect(liste().retirer).toEqual(expect.arrayContaining(ANCIENS));
  });

  it('no file the frame installs names a former role', () => {
    const fautes = duCadre()
      .filter(f => f !== LISTE)
      .flatMap(f => {
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
