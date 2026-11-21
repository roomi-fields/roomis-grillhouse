// The act `surveiller-la-ci-de-main` of the queue (scripts/faits-du-circuit.mjs) starts the CI of main
// before it reads it, and gives `declencherLaCiDeMain` the <apresEntree> it is given: with no pass
// known on main, a start goes out after an entry of the queue only, never at the sole reading of
// its start. gh is a stand-in on the PATH that keeps each call in a log; the project is a
// repository of trial.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { jouerLActe } from '../../scripts/faits-du-circuit.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'acte-ci-de-main-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
});

// A project whose main has one commit, and a gh that answers `[]` to every reading and keeps its
// arguments in `<journal>`; <refuse> makes `workflow run` fail.
function essai(refuse = false) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      cwd: racine,
      encoding: 'utf8',
    });
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'un');
  mkdirSync(path.join(racine, '.beads'));
  writeFileSync(path.join(racine, '.beads/config.yaml'), 'issue-prefix: "demo"\n');
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const journal = path.join(bin, 'gh.log');
  writeFileSync(journal, '');
  const gh = path.join(bin, 'gh');
  writeFileSync(
    gh,
    `#!/bin/sh\necho "$*" >> '${journal}'\ncase "$1 $2" in\n  "workflow run") ${refuse ? 'echo "HTTP 403" >&2; exit 1' : 'exit 0'} ;;\n  *) echo '[]' ;;\nesac\n`
  );
  chmodSync(gh, 0o755);
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
  const appels = () => readFileSync(journal, 'utf8').split('\n').filter(Boolean);
  return { racine, appels };
}
const surveiller = (racine: string, apresEntree?: boolean) =>
  jouerLActe('surveiller-la-ci-de-main', { racine, apresEntree }) as Promise<{ etat: string }>;

describe('l’acte qui surveille la CI de main', () => {
  it('starts the CI with `gh workflow run` when it is given an entry and no pass is known', async () => {
    const { racine, appels } = essai();
    await surveiller(racine, true);
    expect(appels().some(a => a.startsWith('workflow run'))).toBe(true);
  });

  it('starts nothing at a reading that follows no entry, with no pass known', async () => {
    const { racine, appels } = essai();
    await surveiller(racine, false);
    await surveiller(racine);
    expect(appels().some(a => a.startsWith('workflow run'))).toBe(false);
  });

  it('goes on to read the CI when GitHub refuses the start', async () => {
    const { racine, appels } = essai(true);
    const r = await surveiller(racine, true);
    expect(r).toHaveProperty('etat');
    expect(appels().some(a => a.startsWith('run list --branch main'))).toBe(true);
  });
});
