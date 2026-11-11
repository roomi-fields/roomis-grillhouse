// The session's start under « Manque » names a worker of Temporal stale after a rise of
// grillhouse.outil, with the one command that re-points it, as it does for the plugins; silent
// without an installation of Temporal on the account, and in an agent's copy. A large test: it
// launches the framework's script on a trial project, so the night plays it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cheminSysteme, configGit } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { describe, expect, it } from 'vitest';
import { dossier, PAQUET, projet } from './outil-essai.js';

const SESSION = path.join(PAQUET, 'scripts/session-start.sh');
const COMMANDE = 'npx grillhouse temporal installer';

// A home whose applied state holds the sums of units laid down for another version.
function maisonInstallee(): string {
  const maison = dossier('maison');
  const f = path.join(maison, '.local/state/grillhouse/temporal/unites-appliquees.json');
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ 'grillhouse-temporal.service': 'a'.repeat(64) }));
  return maison;
}

// A `bd` that lists no ticket, so that the session's start writes nothing under the trial home.
function bdVide(): string {
  const d = dossier('bd');
  writeFileSync(path.join(d, 'bd'), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
  return d;
}

// The session's start in the project <p>, the home <maison>.
const ouverture = (p: string, maison: string) =>
  spawnSync('bash', [SESSION], {
    cwd: p,
    encoding: 'utf8',
    input: '{"hook_event_name":"SessionStart","source":"startup"}',
    env: {
      ...process.env,
      PATH: cheminSysteme(bdVide()),
      CLAUDE_PROJECT_DIR: p,
      HOME: maison,
      BEADS_ACTOR: 'essai',
    },
    timeout: 60_000,
  });

const manque = (stdout: string) => stdout.split('\n').find(l => l.startsWith('Manque :')) ?? '';

describe('the session’s start and the worker of Temporal stale after a rise of the tool', () => {
  it('names the stale worker under « Manque », with the command alone', () => {
    const r = ouverture(projet({ outil: '5.0.0' }), maisonInstallee());
    const m = manque(r.stdout);
    expect(m).toContain('le travailleur');
    expect(m).toContain(`\`${COMMANDE}\``);
  });

  it('asks no question: the item is the command alone', () => {
    const r = ouverture(projet({ outil: '5.0.0' }), maisonInstallee());
    const dit =
      manque(r.stdout)
        .split(/[;,] /)
        .find(x => x.includes('travailleur')) ?? '';
    expect(dit).toContain(COMMANDE);
    expect(dit).not.toMatch(/\?|souhait|veux|voulez/i);
  });

  it('names it too when the project names no published version: the worker of the repository', () => {
    const r = ouverture(projet(), maisonInstallee());
    expect(manque(r.stdout)).toContain(`\`${COMMANDE}\``);
  });

  it('says nothing of the worker without an installation of Temporal on the account', () => {
    const r = ouverture(projet({ outil: '5.0.0' }), dossier('maison'));
    expect(r.stdout).not.toContain(COMMANDE);
  });

  it('is not read in an agent’s copy', () => {
    const depot = dossier('depot');
    const git = (...a: string[]) =>
      spawnSync('git', ['-C', depot, ...a], {
        encoding: 'utf8',
        env: { ...process.env, ...configGit() },
      });
    git('init', '-q', '-b', 'main');
    writeFileSync(
      path.join(depot, 'package.json'),
      JSON.stringify({ name: 'essai', grillhouse: { outil: '5.0.0' } })
    );
    git('add', 'package.json');
    git('commit', '-q', '-m', 'essai');
    const copie = path.join(depot, '.claude/worktrees/ticket');
    expect(git('worktree', 'add', '-q', '-b', 'agent/ticket', copie).status).toBe(0);
    const r = ouverture(copie, maisonInstallee());
    expect(r.stdout).not.toContain(COMMANDE);
  });
});
