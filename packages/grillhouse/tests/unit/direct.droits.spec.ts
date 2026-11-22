// Le rôle « direct » : l'agent d'un ticket mené hors du circuit, à lui, ses droits distincts de ceux du
// développeur (qui restent ceux du circuit), son verrou, sa compétence et son agent.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { optionsDuRole, ROLES } from '../../scripts/droits.mjs';
import { horsDuPlan, refusal } from '../../scripts/verrous/verrou.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'direct-droits-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const SCRATCH = '/scratch';

// Un dépôt de deux paquets, a et b, sous git (le verrou lit la racine du dépôt).
function depot() {
  const repo = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const ecrire = (rel: string, contenu: unknown) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), `${JSON.stringify(contenu, null, 2)}\n`);
  };
  ecrire('package.json', { name: 'racine', private: true, workspaces: ['packages/*'] });
  declarerLesLangages(repo);
  ecrire('packages/a/package.json', { name: 'a', version: '1.0.0' });
  ecrire('packages/b/package.json', { name: 'b', version: '1.0.0' });
  spawnSync('git', ['init', '-q'], { cwd: repo });
  return repo;
}

const options = (role: string) =>
  optionsDuRole(role, { racine: DEPOT, copie: DEPOT, ticket: 'demo-1', home: ESSAIS });
const reglages = (role: string) => {
  const o = options(role);
  return JSON.parse(o[o.indexOf('--settings') + 1]) as {
    permissions: { allow: string[]; deny: string[] };
    hooks?: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] };
  };
};
const outils = (role: string) => {
  const o = options(role);
  return o[o.indexOf('--tools') + 1].split(',');
};

describe('le rôle direct a des droits à lui', () => {
  it('écrit des fichiers par Edit et Write, sous un verrou de rôle « direct »', () => {
    expect(ROLES).toHaveProperty('direct');
    expect(outils('direct')).toEqual(expect.arrayContaining(['Edit', 'Write', 'Read', 'Bash']));
    const verrou = reglages('direct').hooks?.PreToolUse.find(h => /Write/.test(h.matcher));
    expect(verrou?.hooks[0].command).toMatch(/verrou direct$/);
  });

  it('joue npm test et ne change pas l’auteur de ses commentaires', () => {
    const { allow, deny } = reglages('direct').permissions;
    expect(allow).toContain('Bash(npm test *)');
    expect(deny).toEqual(expect.arrayContaining(['Bash(bd *--actor*)', 'Bash(bd *--author*)']));
  });

  it('les droits du développeur du circuit ne changent pas : le rôle direct est un autre rôle', () => {
    expect(ROLES.developpeur.ecrit).toBe(true);
    expect(Object.keys(ROLES)).toEqual(expect.arrayContaining(['developpeur', 'direct']));
    expect(reglages('developpeur').hooks?.PreToolUse[0].hooks[0].command).toMatch(
      /verrou developpeur$/
    );
  });

  it('a son agent et sa compétence dans le greffon du cadre', () => {
    const agent = path.join(DEPOT, 'mods/grillhouse/agents/direct.md');
    expect(existsSync(agent)).toBe(true);
    expect(readFileSync(agent, 'utf8')).toMatch(/^name: direct$/m);
    expect(existsSync(path.join(DEPOT, 'mods/grillhouse/skills/direct/SKILL.md'))).toBe(true);
  });
});

describe('le verrou du rôle direct : il écrit tests et code ensemble', () => {
  const repo = depot();
  const ecriture = (rel: string) => ({
    tool_name: 'Write',
    tool_input: { file_path: path.join(repo, rel), content: 'x' },
    cwd: repo,
  });
  const opts = { tmp: SCRATCH, describe: () => null };

  it('accepte un fichier de test et un fichier de code, sans section « Architecture » au ticket', () => {
    expect(refusal('direct', ecriture('packages/a/tests/x.spec.ts'), opts)).toBeNull();
    expect(refusal('direct', ecriture('packages/a/src/x.ts'), opts)).toBeNull();
  });

  it('le développeur du circuit reste refusé sur un fichier de test', () => {
    expect(refusal('developpeur', ecriture('packages/a/tests/x.spec.ts'), opts)).toMatch(
      /appartiennent au testwriter/
    );
  });

  it('arrête l’écriture hors des paquets de son plan, en nommant le paquet', () => {
    const env = { GRILLHOUSE_ENVELOPPE: 'packages/a' };
    const stop = horsDuPlan(ecriture('packages/b/src/y.ts'), {
      tmp: SCRATCH,
      env,
      role: 'direct',
    });
    expect(stop?.paquet).toBe('packages/b');
    expect(
      horsDuPlan(ecriture('packages/a/src/y.ts'), { tmp: SCRATCH, env, role: 'direct' })
    ).toBeNull();
  });
});
