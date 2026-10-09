import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const NUIT = path.resolve(__dirname, '../../scripts/nuit.sh');

// A repository whose tests fail while ROUGE is committed, with a fake Beads that records its calls
// and answers `list` with the open tickets written in OUVERTS.
function monde() {
  const repo = mkdtempSync(path.join(tmpdir(), 'nuit-'));
  const bin = mkdtempSync(path.join(tmpdir(), 'bin-'));
  const appels = path.join(bin, 'appels');
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\necho "$@" >> ${appels}\n[ "$1" = list ] && cat ${bin}/OUVERTS 2>/dev/null || echo '[]'\n`,
    { mode: 0o755 }
  );
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  mkdirSync(path.join(repo, 'scripts'));
  execFileSync('cp', [NUIT, path.join(repo, 'scripts/nuit.sh')]);
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ scripts: { test: 'node t.mjs' } })
  );
  writeFileSync(
    path.join(repo, 't.mjs'),
    "import fs from 'node:fs';\nif (fs.existsSync('ROUGE')) { console.log('✗ un test rouge'); process.exit(1); }\nconsole.log('tout vert');\n"
  );
  writeFileSync(path.join(repo, '.gitignore'), '.claude/worktrees/\n');
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'base');
  const nuit = () =>
    spawnSync('bash', [path.join(repo, 'scripts/nuit.sh')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  const commun = path.join(repo, '.git', 'nuit');
  const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  return { repo, bin, git, nuit, commun, appels: () => lire(appels), lire };
}

describe('the night', () => {
  it('marks a green HEAD as the last green, and opens nothing', () => {
    const m = monde();
    expect(m.nuit().status).toBe(0);
    expect(m.lire(path.join(m.commun, 'dernier-vert')).trim()).toBe(
      m.git('rev-parse', 'HEAD').trim()
    );
    expect(m.appels()).toBe('');
  });
  it('opens a ticket on red, with the commits since the last green', () => {
    const m = monde();
    m.nuit();
    const vert = m.git('rev-parse', '--short=7', 'HEAD').trim();
    writeFileSync(path.join(m.repo, 'ROUGE'), '');
    m.git('add', 'ROUGE');
    m.git('commit', '-qm', 'casse');
    const rouge = m.git('rev-parse', '--short=7', 'HEAD').trim();
    expect(m.nuit().status).toBe(1);
    const appels = m.appels();
    expect(appels).toMatch(/^create La nuit est rouge depuis/m);
    expect(appels).toMatch(/-l nuit/);
    expect(appels).toContain(`${vert}..${rouge}`);
    expect(appels).toMatch(/un test rouge/);
  });
  it('comments the open night ticket instead of opening another', () => {
    const m = monde();
    writeFileSync(path.join(m.repo, 'ROUGE'), '');
    m.git('add', 'ROUGE');
    m.git('commit', '-qm', 'casse');
    writeFileSync(path.join(m.bin, 'OUVERTS'), '[{"id":"demo-9"}]');
    expect(m.nuit().status).toBe(1);
    expect(m.appels()).toMatch(/^comments add demo-9 La nuit du/m);
    expect(m.appels()).not.toMatch(/^create/m);
  });
  it('plays the commit, not the local files of the main tree', () => {
    const m = monde();
    writeFileSync(path.join(m.repo, 'ROUGE'), '');
    expect(m.nuit().status).toBe(0);
  });
  it('waits while an integration runs', () => {
    const m = monde();
    writeFileSync(path.join(m.repo, '.git', 'integration.lock'), String(process.pid));
    expect(m.nuit().status).toBe(2);
  });
});
