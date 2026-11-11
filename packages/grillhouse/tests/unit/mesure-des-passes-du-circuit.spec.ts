// The checks (3.1) and the final pass (4.1) of a circuit measure their tests against the base of
// the lot, the copy's HEAD, that main reached green by the CI of a ticket's branch: they play the
// tests related to the lot, and the complete pass goes to that CI and to the night, as Google's
// presubmit plays the tests a change affects and leaves the rest to after the submit. A project
// whose CI does not run on a ticket's branch keeps its passes measured against the last green.
// Witness: grillhouse-4nr.21, measured against main's last green of 8204be8, 38 files changed for
// a lot of 10, `.github/workflows/ci.yml` among them: 7 passes of the 4 235 tests of
// packages/grillhouse.
// Each case plays the real git in a repository of trial.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'mesure-des-passes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const mesureDesPasses = activites.mesureDesPasses as (ctx: object) => Record<string, string>;

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

// A CI that runs on a push to main alone, or to the ticket's branches too.
const CI_DE_MAIN = 'on:\n  push:\n    branches: [main]\njobs: {}\n';
const CI_DES_BRANCHES = "on:\n  push:\n    branches: [main, 'agent/**']\njobs: {}\n";

// A repository whose CI is <ci> (none when null), its copy of the ticket demo-1 with a lot.
function depot(ci: string | null) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  writeFileSync(path.join(racine, 'a.txt'), 'a\n');
  writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
  if (ci !== null) {
    mkdirSync(path.join(racine, '.github', 'workflows'), { recursive: true });
    writeFileSync(path.join(racine, '.github', 'workflows', 'ci.yml'), ci);
  }
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  writeFileSync(path.join(copie, 'a.txt'), 'le lot\n');
  return { ctx: { racine, copie, ticket: 'demo-1' }, base: git(copie, 'rev-parse', 'HEAD') };
}

describe('the measure of the passes of a circuit', () => {
  it('in a project whose CI runs on the ticket branches, is the base of the lot', () => {
    const { ctx, base } = depot(CI_DES_BRANCHES);
    expect(mesureDesPasses(ctx)).toEqual({ GRILLHOUSE_BASE_DU_LOT: base });
  });

  it('in a project whose CI runs on main alone, is the last green', () => {
    const { ctx } = depot(CI_DE_MAIN);
    expect(mesureDesPasses(ctx)).toEqual({});
  });

  it('in a project without a CI, is the last green', () => {
    const { ctx } = depot(null);
    expect(mesureDesPasses(ctx)).toEqual({});
  });
});
