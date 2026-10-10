import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  nouveauxRouges,
  perimetre,
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
    expect(refusLots(['tests/unit/a.spec.ts'], ['src/a/index.ts'])).toBeNull();
    expect(refusLots(['src/a/index.ts'], [])).toMatch(/lot de tests touche du code/);
    expect(refusLots([], ['packages/a/tests/x.ts'])).toMatch(/lot de code touche des tests/);
  });
});

describe('nouveauxRouges', () => {
  it('keeps the failures the base did not have and that are not admitted', () => {
    expect(nouveauxRouges(['a', 'b'], ['b', 'c', 'd', 'd'], ['d'])).toEqual(['c']);
  });
});

describe('perimetre', () => {
  const comps = ['packages/a', 'packages/b', 'packages/c', 'src/d'];
  // b uses a, c uses b: a change in a replays a, b and c.
  const graphe = new Map([
    ['packages/a', ['packages/b']],
    ['packages/b', ['packages/c']],
  ]);
  it('replays the touched components and, transitively, those that depend on them', () => {
    expect(perimetre(['packages/a/src/x.ts'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['packages/a', 'packages/b', 'packages/c'],
    });
  });
  it('replays a leaf alone', () => {
    expect(perimetre(['packages/c/src/x.ts', 'packages/c/test/x.spec.ts'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['packages/c'],
    });
  });
  // grillhouse-3uv.22.1: every file of a component touches that component, whatever its kind
  // (Nx affected, Bazel), so it replays the component and those that depend on it.
  it('replays a component and its consumers for its package manifest', () => {
    expect(perimetre(['packages/a/package.json'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['packages/a', 'packages/b', 'packages/c'],
    });
  });
  it('replays a component and its consumers for a document deep inside it', () => {
    expect(perimetre(['packages/a/docs/INTERFACE.md'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['packages/a', 'packages/b', 'packages/c'],
    });
  });
  it('replays a leaf alone for a file of it that is not code, whatever its kind', () => {
    for (const f of ['packages/c/README.md', 'packages/c/LICENSE', 'packages/c/data/t.json']) {
      expect(perimetre([f], comps, graphe)).toEqual({
        mode: 'composants',
        composants: ['packages/c'],
      });
    }
    expect(perimetre(['src/d/assets/logo.svg'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['src/d'],
    });
  });
  it('replays every component a lot of documents touches, and their consumers', () => {
    expect(
      perimetre(['packages/a/docs/INTERFACE.md', 'packages/b/README.md'], comps, graphe)
    ).toEqual({ mode: 'composants', composants: ['packages/a', 'packages/b', 'packages/c'] });
  });
  it('counts a non-code file of a component alongside code of another one', () => {
    expect(perimetre(['packages/c/src/x.ts', 'packages/a/package.json'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['packages/a', 'packages/b', 'packages/c'],
    });
    expect(perimetre(['src/d/README.md', 'packages/c/src/x.ts'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['packages/c', 'src/d'],
    });
  });
  it('never replays nothing for a lot touching a component', () => {
    for (const f of ['packages/b/CADRE.md', 'packages/b/.gitignore', 'src/d/tsconfig.json']) {
      expect(perimetre([f], comps, graphe).mode).not.toBe('aucun');
    }
  });
  it('does not take a sibling sharing a prefix for the component, for a document either', () => {
    expect(perimetre(['packages/ab/README.md'], ['packages/a'], new Map())).toEqual({
      mode: 'tous',
      composants: [],
    });
  });
  // grillhouse-3uv.22: a file outside every declared component touches everything (Bazel, Nx
  // affected), so a lot touching one replays every suite.
  const tous = { mode: 'tous', composants: [] };
  it('replays every suite for code outside every component (a root folder)', () => {
    expect(perimetre(['scripts/y.mjs'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite for code outside every component, deep or at the root', () => {
    expect(perimetre(['scripts/verrous/lib/z.mjs'], comps, graphe)).toEqual(tous);
    expect(perimetre(['vitest.config.ts'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite for a test file outside every component', () => {
    expect(perimetre(['tests/unit/z.spec.ts'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite when a lot mixes a component and a file outside every component', () => {
    expect(perimetre(['packages/c/src/x.ts', 'scripts/y.mjs'], comps, graphe)).toEqual(tous);
    expect(perimetre(['scripts/y.mjs', 'packages/a/src/x.ts'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite for code in a project without any component', () => {
    expect(perimetre(['scripts/y.mjs'], [], new Map())).toEqual(tous);
  });
  // The validated line names a FILE outside every component, with no exception: a document, a
  // manifest, a lock, a compiler setting or the CI touch everything as code does (Nx global inputs).
  it('replays every suite for a document outside every component, at the root or deep', () => {
    expect(perimetre(['README.md'], comps, graphe)).toEqual(tous);
    expect(perimetre(['docs/agents/x.md'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite when a lot mixes a component document and a root document', () => {
    expect(perimetre(['packages/a/docs/INTERFACE.md', 'README.md'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite for the package manifest outside every component', () => {
    expect(perimetre(['package.json'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite for the dependency lock outside every component', () => {
    expect(perimetre(['package-lock.json'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite for a compiler setting outside every component', () => {
    expect(perimetre(['tsconfig.json'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite for the CI outside every component', () => {
    expect(perimetre(['.github/workflows/ci.yml'], comps, graphe)).toEqual(tous);
  });
  it('replays every suite for any file outside every component, whatever its kind', () => {
    expect(perimetre(['.gitignore'], comps, graphe)).toEqual(tous);
    expect(perimetre(['LICENSE'], comps, graphe)).toEqual(tous);
  });
  it('does not take a sibling sharing a prefix for the component: it lies outside every one', () => {
    expect(perimetre(['packages/ab/x.ts'], ['packages/a'], new Map())).toEqual(tous);
  });
});

// A repository with a fake Beads, suites that fail the tests named in ROUGES_FORCES, and guards
// that refuse while GARDE_ROUGE exists.
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
        'integration:gardes': 'test ! -f GARDE_ROUGE && test ! -f RESTE',
      },
    })
  );
  writeFileSync(
    path.join(repo, 'suites.mjs'),
    "import fs from 'node:fs';\nconst r = fs.existsSync('ROUGES_FORCES') ? fs.readFileSync('ROUGES_FORCES', 'utf8') : '';\nfs.writeFileSync(process.env.ROUGES, r);\nprocess.exit(r ? 1 : 0);\n"
  );
  mkdirSync(path.join(repo, 'src/a'), { recursive: true });
  writeFileSync(path.join(repo, 'src/a/index.ts'), 'export const a = 1;\n');
  writeFileSync(path.join(repo, '.gitignore'), '.claude/worktrees/\n');
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  // The lot: a test file and a code change, as two patches.
  mkdirSync(path.join(repo, 'tests'));
  writeFileSync(path.join(repo, 'tests/a.spec.ts'), 'test\n');
  git('add', '-N', 'tests/a.spec.ts');
  const lotTests = path.join(bin, 'tests.patch');
  writeFileSync(lotTests, git('diff', '--', 'tests'));
  writeFileSync(path.join(repo, 'src/a/index.ts'), 'export const a = 2;\n');
  const lotCode = path.join(bin, 'code.patch');
  writeFileSync(lotCode, git('diff', '--', 'src'));
  git('reset', '-q', '--hard');
  execFileSync('rm', ['-f', path.join(repo, 'tests/a.spec.ts')]);
  const message = path.join(bin, 'msg');
  writeFileSync(message, 'feat: a (demo-1)\n');
  const lancer = (lots: string[], extra: string[]) =>
    spawnSync('node', [SCRIPT, '--ticket', 'demo-1', ...lots, '--message', message, ...extra], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
        PRINCIPAL: repo,
      },
    });
  const run = (...extra: string[]) => lancer(['--tests', lotTests, '--code', lotCode], extra);
  const etat = () => ({
    log: git('log', '--format=%s').trim().split('\n'),
    status: git('status', '--porcelain'),
    a: readFileSync(path.join(repo, 'src/a/index.ts'), 'utf8'),
    test: existsSync(path.join(repo, 'tests/a.spec.ts')),
  });
  // Commits a file in the main tree, as another delivery would.
  const poser = (f: string, contenu: string) => {
    writeFileSync(path.join(repo, f), contenu);
    git('add', f);
    git('commit', '-qm', `pose ${f}`);
  };
  return { repo, run, lancer, etat, poser, bin };
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
    m.poser('GARDE_ROUGE', '');
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/gardes refusent/);
    expect(m.etat()).toMatchObject({
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
    m.poser('ROUGES_FORCES', 'vieux > rouge\n');
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
    writeFileSync(path.join(m.repo, 'src/a/index.ts'), 'export const a = 3;\n');
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/modifiés dans l'arbre/);
    expect(m.etat().a).toBe('export const a = 3;\n');
  });
  it('runs the suites on a clean copy: an untracked file of the main tree does not count', () => {
    const m = monde(['ACCEPTÉ']);
    writeFileSync(path.join(m.repo, 'ROUGES_FORCES'), 'local > rouge\n');
    writeFileSync(path.join(m.repo, 'GARDE_ROUGE'), '');
    expect(m.run().status).toBe(0);
  });
  it('cleans the integration copy of what an earlier integration left there', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('GARDE_ROUGE', '');
    expect(m.run().status).toBe(1);
    execFileSync('git', ['-C', m.repo, 'rm', '-q', 'GARDE_ROUGE']);
    execFileSync('git', [
      '-C',
      m.repo,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-qm',
      'garde',
    ]);
    writeFileSync(path.join(m.repo, '.claude/worktrees/integration/RESTE'), '');
    expect(m.run().status).toBe(0);
  });
  it("leaves the supervisor's own modified files in place", () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('NOTES', 'v1\n');
    writeFileSync(path.join(m.repo, 'NOTES'), 'v2 du superviseur\n');
    expect(m.run().status).toBe(0);
    expect(readFileSync(path.join(m.repo, 'NOTES'), 'utf8')).toBe('v2 du superviseur\n');
    expect(m.etat()).toMatchObject({ a: 'export const a = 2;\n', test: true });
  });
  it('refuses when main moved during the integration', () => {
    const m = monde(['ACCEPTÉ']);
    // The suites commit on main while they run, as a supervisor would.
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nimport { execSync } from 'node:child_process';\nif (fs.existsSync('tests/a.spec.ts')) execSync(`git -C ${process.env.PRINCIPAL} -c user.name=t -c user.email=t@t commit -q --allow-empty -m bouge`);\nfs.writeFileSync(process.env.ROUGES, '');\n"
    );
    const r = m.run();
    expect(r.stdout).toMatch(/main a bougé/);
    expect(r.status).toBe(1);
    expect(m.etat().log[0]).toBe('bouge');
  });
  it('hands the suites its component for a file of it that is not code', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nfs.writeFileSync(`${process.env.PRINCIPAL}.args`, `[${process.argv.slice(2).join(' ')}]`);\nfs.writeFileSync(process.env.ROUGES, '');\n"
    );
    writeFileSync(path.join(m.repo, 'src/a/NOTE.md'), 'une note\n');
    const patch = path.join(m.bin, 'docs.patch');
    const diff = spawnSync(
      'git',
      ['-C', m.repo, 'diff', '--no-index', '/dev/null', 'src/a/NOTE.md'],
      {
        encoding: 'utf8',
      }
    ).stdout;
    writeFileSync(patch, diff);
    rmSync(path.join(m.repo, 'src/a/NOTE.md'));
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/suites de : src\/a/);
    expect(r.stdout).not.toMatch(/aucun code de composant/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[src/a]');
  });
  it('refuses a non-code file of a component that brings a new failure', () => {
    const m = monde(['ACCEPTÉ']);
    // The suites fail once the component's data changes: only a replay of src/a sees it.
    m.poser('src/a/donnees.json', '{"v":1}\n');
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nconst r = process.argv.includes('src/a') && fs.readFileSync('src/a/donnees.json', 'utf8').includes('2') ? 'src/a/a.spec.ts > donnees\\n' : '';\nfs.writeFileSync(process.env.ROUGES, r);\nprocess.exit(r ? 1 : 0);\n"
    );
    writeFileSync(path.join(m.repo, 'src/a/donnees.json'), '{"v":2}\n');
    const patch = path.join(m.bin, 'donnees.patch');
    writeFileSync(
      patch,
      spawnSync('git', ['-C', m.repo, 'diff', '--', 'src/a'], { encoding: 'utf8' }).stdout
    );
    spawnSync('git', ['-C', m.repo, 'checkout', '--', 'src/a']);
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Rouges nouveaux :\n {2}✗ src\/a\/a\.spec\.ts > donnees/);
    expect(m.etat().log[0]).toBe('pose suites.mjs');
  });
  it('hands the suites no component, so every suite, for a document outside every component', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nfs.writeFileSync(`${process.env.PRINCIPAL}.args`, `[${process.argv.slice(2).join(' ')}]`);\nfs.writeFileSync(process.env.ROUGES, '');\n"
    );
    mkdirSync(path.join(m.repo, 'docs'));
    writeFileSync(path.join(m.repo, 'docs/note.md'), 'une note\n');
    const patch = path.join(m.bin, 'docs.patch');
    writeFileSync(
      patch,
      spawnSync('git', ['-C', m.repo, 'diff', '--no-index', '/dev/null', 'docs/note.md'], {
        encoding: 'utf8',
      }).stdout
    );
    rmSync(path.join(m.repo, 'docs'), { recursive: true });
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/toutes les suites/);
    expect(r.stdout).not.toMatch(/aucun code de composant/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[]');
  });
  it('hands the suites the touched component and those that use it, nothing else', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nfs.writeFileSync(`${process.env.PRINCIPAL}.args`, process.argv.slice(2).join(' '));\nfs.writeFileSync(process.env.ROUGES, '');\n"
    );
    mkdirSync(path.join(m.repo, 'src/feuille'));
    mkdirSync(path.join(m.repo, 'src/haut'));
    mkdirSync(path.join(m.repo, 'src/seul'));
    m.poser('src/feuille/index.ts', 'export const f = 1;\n');
    m.poser('src/haut/index.ts', "import { f } from '../feuille';\nexport const h = f;\n");
    m.poser('src/seul/index.ts', 'export const s = 1;\n');
    writeFileSync(path.join(m.repo, 'src/feuille/index.ts'), 'export const f = 2;\n');
    const patch = path.join(m.bin, 'feuille.patch');
    writeFileSync(
      patch,
      spawnSync('git', ['-C', m.repo, 'diff', '--', 'src/feuille'], { encoding: 'utf8' }).stdout
    );
    spawnSync('git', ['-C', m.repo, 'checkout', '--', 'src/feuille']);
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('src/feuille src/haut');
  });
  it('hands the suites no component, so every suite, for a lot touching code outside every component', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nfs.writeFileSync(`${process.env.PRINCIPAL}.args`, `[${process.argv.slice(2).join(' ')}]`);\nfs.writeFileSync(process.env.ROUGES, '');\n"
    );
    mkdirSync(path.join(m.repo, 'scripts'));
    m.poser('scripts/outil.mjs', 'export const o = 1;\n');
    writeFileSync(path.join(m.repo, 'scripts/outil.mjs'), 'export const o = 2;\n');
    const patch = path.join(m.bin, 'scripts.patch');
    writeFileSync(
      patch,
      spawnSync('git', ['-C', m.repo, 'diff', '--', 'scripts'], { encoding: 'utf8' }).stdout
    );
    spawnSync('git', ['-C', m.repo, 'checkout', '--', 'scripts']);
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/toutes les suites/);
    expect(r.stdout).not.toMatch(/aucun code de composant/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[]');
  });
  it('refuses a lot outside every component that brings a new failure', () => {
    const m = monde(['ACCEPTÉ']);
    // The suites fail once the root script changes: only a replay of every suite sees it.
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nconst r = fs.readFileSync('scripts/outil.mjs', 'utf8').includes('2') ? 'tests/outil.spec.ts > outil\\n' : '';\nfs.writeFileSync(process.env.ROUGES, r);\nprocess.exit(r ? 1 : 0);\n"
    );
    mkdirSync(path.join(m.repo, 'scripts'));
    m.poser('scripts/outil.mjs', 'export const o = 1;\n');
    writeFileSync(path.join(m.repo, 'scripts/outil.mjs'), 'export const o = 2;\n');
    const patch = path.join(m.bin, 'scripts.patch');
    writeFileSync(
      patch,
      spawnSync('git', ['-C', m.repo, 'diff', '--', 'scripts'], { encoding: 'utf8' }).stdout
    );
    spawnSync('git', ['-C', m.repo, 'checkout', '--', 'scripts']);
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Rouges nouveaux :\n {2}✗ tests\/outil\.spec\.ts > outil/);
    expect(m.etat().log[0]).toBe('pose scripts/outil.mjs');
  });
  it('replays every suite when the project chose « complet »', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser(
      'package.json',
      JSON.stringify({
        grillhouse: { integration: 'complet' },
        scripts: {
          'integration:suites': 'node suites.mjs',
          'integration:gardes': 'test ! -f GARDE_ROUGE && test ! -f RESTE',
        },
      })
    );
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nfs.writeFileSync(`${process.env.PRINCIPAL}.args`, `[${process.argv.slice(2).join(' ')}]`);\nfs.writeFileSync(process.env.ROUGES, '');\n"
    );
    const r = m.run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/toutes les suites/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[]');
  });
  it('tells the pre-commit hook that the guards have just run', () => {
    const m = monde(['ACCEPTÉ']);
    const crochets = path.join(m.repo, '.git', 'hooks');
    writeFileSync(
      path.join(crochets, 'pre-commit'),
      `#!/bin/sh\necho "\${GRILLHOUSE_INTEGRATION:-absent}" > ${m.repo}.precommit\n`,
      { mode: 0o755 }
    );
    expect(m.run().status).toBe(0);
    expect(readFileSync(`${m.repo}.precommit`, 'utf8').trim()).toBe('1');
  });
  it('waits for another integration that runs', () => {
    const m = monde(['ACCEPTÉ']);
    writeFileSync(path.join(m.repo, '.git/integration.lock'), String(process.pid));
    expect(m.run().status).toBe(2);
  });
});
