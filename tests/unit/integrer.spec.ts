import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  nouveauxRouges,
  paquets,
  refusLots,
  refusVerdicts,
} from '../../scripts/integration/integrer.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/integration/integrer.mjs');
const c = (text: string) => ({ text });

describe('refusVerdicts', () => {
  const t = { id: 'demo-1', labels: [] as string[] };
  it('passes a ticket whose last reviewer verdict is ACCEPTÉ', () => {
    expect(refusVerdicts(t, [c('RENDU : R3'), c('ACCEPTÉ'), c('merci')])).toBeNull();
  });
  it('refuses a ticket without verdict, or given back last', () => {
    expect(refusVerdicts(t, [c('lot livré')])).toMatch(/ACCEPTÉ/);
    expect(refusVerdicts(t, [c('ACCEPTÉ'), c('RENDU : R2')])).toMatch(/ACCEPTÉ/);
  });
  const arb = { id: 'demo-2', labels: ['arbitrage'] };
  it('passes an arbitrage settled, or answered by the responsable', () => {
    expect(
      refusVerdicts(arb, [c('## Arbitrage — x\n### Verdict — tranché\n'), c('ACCEPTÉ')])
    ).toBeNull();
    expect(
      refusVerdicts(arb, [
        c('## Arbitrage — x\n### Verdict — monte au responsable\n'),
        c('## Réponse du responsable — x\nB.'),
        c('ACCEPTÉ'),
      ])
    ).toBeNull();
  });
  it('refuses an arbitrage still open, or missing', () => {
    expect(
      refusVerdicts(arb, [
        c('## Arbitrage — x\n### Verdict — monte au responsable\n'),
        c('ACCEPTÉ'),
      ])
    ).toMatch(/ni tranché ni répondu/);
    expect(refusVerdicts(arb, [c('ACCEPTÉ')])).toMatch(/sans commentaire/);
  });
  it('does not take an answer given before the arbitrage', () => {
    expect(
      refusVerdicts(arb, [
        c('## Réponse du responsable — y'),
        c('## Arbitrage — x\n### Verdict — monte au responsable\n'),
        c('ACCEPTÉ'),
      ])
    ).toMatch(/ni tranché/);
  });
});

describe('refusLots', () => {
  it('keeps tests to the tests lot and code to the code lot', () => {
    expect(refusLots(['tests/unit/a.spec.ts'], ['src/a.ts'])).toBeNull();
    expect(refusLots(['src/a.ts'], [])).toMatch(/lot de tests touche du code/);
    expect(refusLots([], ['packages/a/tests/x.ts'])).toMatch(/lot de code touche des tests/);
  });
});

describe('nouveauxRouges and paquets', () => {
  it('keeps the failures the base did not have and that are not admitted', () => {
    expect(nouveauxRouges(['a', 'b'], ['b', 'c', 'd', 'd'], ['d'])).toEqual(['c']);
  });
  it('names the packages touched', () => {
    expect(paquets(['packages/b/src/x.ts', 'src/a.ts', 'packages/a/x', 'packages/b/y'])).toEqual([
      'packages/a',
      'packages/b',
    ]);
  });
});

// A repository with a fake Beads and suites that fail the tests named in ROUGES_FORCES.
function monde(commentaires: string[]) {
  const repo = mkdtempSync(path.join(tmpdir(), 'integrer-'));
  const bin = mkdtempSync(path.join(tmpdir(), 'bin-'));
  const comments = JSON.stringify(commentaires.map(text => ({ text })));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in show) echo '[{"id":"demo-1","labels":[]}]';; comments) cat <<'J'\n${comments}\nJ\n;; esac\n`,
    { mode: 0o755 }
  );
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({
      scripts: {
        'integration:suites': 'node suites.mjs',
        'integration:gardes': 'test ! -f GARDE_ROUGE',
      },
    })
  );
  writeFileSync(
    path.join(repo, 'suites.mjs'),
    "import fs from 'node:fs';\nconst r = fs.existsSync('ROUGES_FORCES') ? fs.readFileSync('ROUGES_FORCES', 'utf8') : '';\nfs.writeFileSync(process.env.ROUGES, r);\nprocess.exit(r ? 1 : 0);\n"
  );
  mkdirSync(path.join(repo, 'src'));
  writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(path.join(repo, '.gitignore'), 'ROUGES_FORCES\nGARDE_ROUGE\n');
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  // The lot: a test file and a code change, as two patches.
  mkdirSync(path.join(repo, 'tests'));
  writeFileSync(path.join(repo, 'tests/a.spec.ts'), 'test\n');
  git('add', '-N', 'tests/a.spec.ts');
  const lotTests = path.join(bin, 'tests.patch');
  writeFileSync(lotTests, git('diff', '--', 'tests'));
  writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 2;\n');
  const lotCode = path.join(bin, 'code.patch');
  writeFileSync(lotCode, git('diff', '--', 'src'));
  git('reset', '-q', '--hard');
  execFileSync('rm', ['-f', path.join(repo, 'tests/a.spec.ts')]);
  const message = path.join(bin, 'msg');
  writeFileSync(message, 'feat: a (demo-1)\n');
  const run = (...extra: string[]) =>
    spawnSync(
      'node',
      [
        SCRIPT,
        '--ticket',
        'demo-1',
        '--tests',
        lotTests,
        '--code',
        lotCode,
        '--message',
        message,
        ...extra,
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@t',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@t',
        },
      }
    );
  const etat = () => ({
    log: git('log', '--format=%s').trim().split('\n'),
    status: git('status', '--porcelain'),
    a: readFileSync(path.join(repo, 'src/a.ts'), 'utf8'),
    test: existsSync(path.join(repo, 'tests/a.spec.ts')),
  });
  return { repo, run, etat };
}

describe('an integration', () => {
  it('commits a reviewed lot whose suites stay green', () => {
    const m = monde(['ACCEPTÉ']);
    const r = m.run();
    expect(r.stdout).toMatch(/✓ commit/);
    expect(r.status).toBe(0);
    const e = m.etat();
    expect(e.log[0]).toBe('feat: a (demo-1)');
    expect(e.status).toBe('');
  });
  it('refuses a lot without the ACCEPTÉ verdict, touching nothing', () => {
    const m = monde(['RENDU : R1']);
    expect(m.run().status).toBe(1);
    expect(m.etat()).toMatchObject({ log: ['base'], status: '', test: false });
  });
  it('refuses a lot whose guards refuse, and restores its files', () => {
    const m = monde(['ACCEPTÉ']);
    writeFileSync(path.join(m.repo, 'GARDE_ROUGE'), '');
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/gardes refusent/);
    expect(m.etat()).toMatchObject({
      log: ['base'],
      status: '',
      a: 'export const a = 1;\n',
      test: false,
    });
  });
  it('refuses a failure the base did not have, and admits one the integrateur names', () => {
    const m = monde(['ACCEPTÉ']);
    // The suites fail only once the lot's test file exists.
    writeFileSync(
      path.join(m.repo, 'suites.mjs'),
      "import fs from 'node:fs';\nconst r = fs.existsSync('tests/a.spec.ts') ? 'tests/a.spec.ts > a\\n' : '';\nfs.writeFileSync(process.env.ROUGES, r);\nprocess.exit(r ? 1 : 0);\n"
    );
    execFileSync('git', [
      '-C',
      m.repo,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-qam',
      'suites',
    ]);
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Rouges nouveaux :\n {2}✗ tests\/a\.spec\.ts > a/);
    expect(m.etat()).toMatchObject({ status: '', test: false });
    const r2 = m.run('--admettre', 'tests/a.spec.ts > a');
    expect(r2.status).toBe(0);
    expect(r2.stdout).toMatch(/admis par l'intégrateur : tests\/a\.spec\.ts > a/);
  });
  it('keeps a failure the base already had', () => {
    const m = monde(['ACCEPTÉ']);
    writeFileSync(path.join(m.repo, 'ROUGES_FORCES'), 'vieux > rouge\n');
    expect(m.run().status).toBe(0);
  });
  it('refuses suites that fail without naming a test, on the base or with the lot', () => {
    const m = monde(['ACCEPTÉ']);
    writeFileSync(path.join(m.repo, 'suites.mjs'), 'process.exit(3);\n');
    execFileSync('git', [
      '-C',
      m.repo,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-qam',
      'suites',
    ]);
    expect(m.run().stdout).toMatch(/La base ne se mesure pas/);
    writeFileSync(
      path.join(m.repo, 'suites.mjs'),
      "import fs from 'node:fs';\nprocess.exit(fs.existsSync('tests/a.spec.ts') ? 3 : 0);\n"
    );
    execFileSync('git', [
      '-C',
      m.repo,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-qam',
      'suites',
    ]);
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Rouges nouveaux :\n {2}✗ \(les suites sortent en 3/);
  });
  it('refuses when a file of the lot is modified in the tree', () => {
    const m = monde(['ACCEPTÉ']);
    writeFileSync(path.join(m.repo, 'src/a.ts'), 'export const a = 3;\n');
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/modifiés dans l'arbre/);
    expect(m.etat().a).toBe('export const a = 3;\n');
  });
  it('waits for another integration that runs', () => {
    const m = monde(['ACCEPTÉ']);
    writeFileSync(path.join(m.repo, '.git/integration.lock'), String(process.pid));
    expect(m.run().status).toBe(2);
  });
});
