import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { refusal, tickets } from '../../scripts/un-commit-par-ticket.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/un-commit-par-ticket.mjs');

describe('tickets', () => {
  it('finds the ticket ids of a message, once each', () => {
    expect(tickets('feat: x (demo-a1b, demo-a1b.2)\n\nCloses demo-a1b.', 'demo')).toEqual([
      'demo-a1b',
      'demo-a1b.2',
    ]);
  });
  it('takes no word that only starts like an id', () => {
    expect(tickets('fix: a fast-forward in xdemo-1 and demo-', 'demo')).toEqual([]);
  });
});

describe('refusal', () => {
  const history: Record<string, string[]> = { 'demo-1': ['abc1234'] };
  const commitsOf = (id: string) => history[id] ?? [];

  it('refuses a ticket that already has its commit', () => {
    expect(refusal('fix: more of demo-1', 'demo', commitsOf)).toMatch(
      /demo-1 a déjà son commit \(abc1234\).*sous demo-1 \(bd create --parent demo-1\)/
    );
  });
  it('lets the first commit of a ticket through', () => {
    expect(refusal('feat: demo-2', 'demo', commitsOf)).toBeNull();
  });
  it('lets a message without a ticket through', () => {
    expect(refusal('docs: the frame', 'demo', commitsOf)).toBeNull();
  });
});

describe('the hook on a real history', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'commit-'));
  const bin = mkdtempSync(path.join(tmpdir(), 'bin-'));
  writeFileSync(path.join(bin, 'bd'), '#!/bin/sh\necho demo\n', { mode: 0o755 });
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'feat: first delivery (demo-1)');
  git('commit', '-q', '--allow-empty', '-m', 'feat: children of demo-9 (demo-9.1, demo-9.2)');
  git('commit', '-q', '--allow-empty', '-m', 'feat: demo-20, then demo-5.1.');

  const check = (message: string) => {
    const file = path.join(repo, 'MSG');
    writeFileSync(file, message);
    return spawnSync('node', [SCRIPT, file], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  };

  it('refuses a second commit for a ticket', () => {
    const r = check('fix: lot 2 of demo-1');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/une seule livraison/);
  });
  it('does not take demo-10 for demo-1', () => {
    expect(check('feat: demo-10').status).toBe(0);
  });
  it('does not take an earlier demo-20 for demo-2, nor a child for its parent', () => {
    expect(check('feat: demo-2').status).toBe(0);
    expect(check('feat: demo-5').status).toBe(0);
  });
  it('does not take a child for its parent', () => {
    expect(check('feat: demo-1.1').status).toBe(0);
  });
  it('refuses a child already entered with its family', () => {
    expect(check('fix: demo-9.2 again').status).toBe(1);
  });
  it('ignores the comment lines git adds to the message', () => {
    expect(check('feat: demo-3\n# demo-1 is mentioned in a comment').status).toBe(0);
  });
});
