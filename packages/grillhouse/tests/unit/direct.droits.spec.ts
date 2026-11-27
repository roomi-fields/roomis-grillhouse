// Le rôle « direct » : l'agent d'un ticket mené hors du circuit, à lui, ses droits distincts de ceux du
// développeur (qui restent ceux du circuit), sa compétence et son agent.
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { optionsDuRole } from '../../scripts/droits.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'direct-droits-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const reglages = (role: string) => {
  const o = optionsDuRole(role, { racine: DEPOT, copie: DEPOT, ticket: 'demo-1', home: ESSAIS });
  return JSON.parse(o[o.indexOf('--settings') + 1]) as {
    permissions: { allow: string[]; deny: string[] };
  };
};

describe('le rôle direct a des droits à lui', () => {
  it('ne change pas l’auteur de ses commentaires', () => {
    const { deny } = reglages('direct').permissions;
    expect(deny).toEqual(expect.arrayContaining(['Bash(bd *--actor*)', 'Bash(bd *--author*)']));
  });

  it('a son agent et sa compétence dans le greffon du cadre', () => {
    const agent = path.join(DEPOT, 'mods/grillhouse/agents/direct.md');
    expect(existsSync(agent)).toBe(true);
    expect(readFileSync(agent, 'utf8')).toMatch(/^name: direct$/m);
    expect(existsSync(path.join(DEPOT, 'mods/grillhouse/skills/direct/SKILL.md'))).toBe(true);
  });
});
