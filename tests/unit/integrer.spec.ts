import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  nouveauxRouges,
  perimetre,
  refusLots,
  refusVerdicts,
} from '../../scripts/integration/integrer.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'integrer-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/integration/integrer.mjs');
const RETIRER = path.resolve(__dirname, '../../scripts/retirer-copie.sh');
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

// A repository at <racine>: its files are named relative to it, as `git apply --numstat` gives
// them. `packages/matiere` exports `./test-fixtures`: the shared test material.
function depotLots() {
  const repo = mkdtempSync(path.join(ESSAIS, 'lots-'));
  const ecrire = (rel: string, contenu: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), contenu);
  };
  ecrire('package.json', JSON.stringify({ name: 'racine', private: true }));
  ecrire(
    'packages/matiere/package.json',
    JSON.stringify({ name: 'matiere', exports: { '.': './i.js', './test-fixtures': './f.js' } })
  );
  ecrire(
    'packages/corpus/package.json',
    JSON.stringify({ name: 'corpus', exports: { './test-fixtures': { import: './f.mjs' } } })
  );
  ecrire('packages/a/package.json', JSON.stringify({ name: 'a', exports: { '.': './i.js' } }));
  ecrire('packages/matiere-bis/package.json', JSON.stringify({ name: 'matiere-bis' }));
  return repo;
}

// grillhouse-2sq.2: the lots follow the one rule of ownership of the locks (`isTesterFile`): the
// tests lot holds what the testeur writes, test files and the shared test material; the code
// lot holds none of it.
describe('refusLots', () => {
  const repo = depotLots();

  it('keeps tests to the tests lot and code to the code lot', () => {
    expect(refusLots(['tests/unit/a.spec.ts'], ['src/a/index.ts'], repo)).toBeNull();
    expect(refusLots(['src/a/index.ts'], [], repo)).toMatch(/lot de tests touche du code/);
    expect(refusLots([], ['packages/a/tests/x.ts'], repo)).toMatch(/lot de code touche/);
  });
  it.each([
    ['packages/matiere/fixtures/cas/un.txt'],
    ['packages/matiere/fixtures/cas/profond/deux.json', 'tests/unit/a.spec.ts'],
    ['packages/matiere/package.json', 'packages/matiere/src/generer.ts'],
    ['packages/corpus/scenes/neuve.bps'],
  ])('passes a tests lot that touches the shared test material (%s)', (...tests) => {
    expect(refusLots(tests, ['packages/a/src/x.ts'], repo)).toBeNull();
  });
  it.each([
    'packages/matiere/fixtures/cas/un.txt',
    'packages/matiere/src/generer.ts',
    'packages/matiere/package.json',
    'packages/corpus/scenes/neuve.bps',
  ])('refuses a code lot that touches the shared test material (%s)', f => {
    const r = refusLots(['tests/unit/a.spec.ts'], ['packages/a/src/x.ts', f], repo);
    expect(r).toMatch(/lot de code touche/);
    expect(r).toContain(f);
    expect(r).not.toContain('packages/a/src/x.ts');
  });
  it.each([
    'packages/a/src/x.ts',
    'packages/matiere-bis/src/a.ts',
    'package.json',
    'scripts/a.mjs',
  ])('still refuses a tests lot that touches %s, code outside the material', f => {
    const r = refusLots(['packages/matiere/fixtures/un.txt', f], [], repo);
    expect(r).toMatch(/lot de tests touche du code/);
    expect(r).toContain(f);
    expect(r).not.toContain('packages/matiere/fixtures/un.txt');
  });
  it('a project without the material keeps the test files alone in the tests lot', () => {
    const vide = mkdtempSync(path.join(ESSAIS, 'lots-vide-'));
    expect(refusLots(['packages/matiere/fixtures/un.txt'], [], vide)).toMatch(
      /lot de tests touche du code/
    );
    expect(refusLots([], ['packages/matiere/fixtures/un.txt'], vide)).toBeNull();
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
      mode: 'aucun',
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
  // grillhouse-3uv.54: a lot made only of documents outside every component replays the guards
  // and no suite (paths-ignore of a CI); a document is a *.md outside every component, or a file
  // under .claude/ that is neither a script (.mjs .js .cjs .ts .sh .py) nor a setting (*.json,
  // fichiers.txt).
  const aucun = { mode: 'aucun', composants: [] };
  it('3uv.54 critère 1: replays no suite for a document outside every component, at the root or deep', () => {
    expect(perimetre(['README.md'], comps, graphe)).toEqual(aucun);
    expect(perimetre(['docs/agents/x.md'], comps, graphe)).toEqual(aucun);
    expect(perimetre(['scripts/integration/NOTES.md'], comps, graphe)).toEqual(aucun);
  });
  it('3uv.54 critère 1: replays no suite for a lot made only of several documents outside every component', () => {
    expect(
      perimetre(['CLAUDE.md', 'docs/a.md', '.claude/agents/testeur.md'], comps, graphe)
    ).toEqual(aucun);
  });
  it('3uv.54 critère 1: replays no suite for a document in a project without any component', () => {
    expect(perimetre(['README.md'], [], new Map())).toEqual(aucun);
  });
  it('3uv.54 critère 7: a file under .claude/ that is neither a script nor a setting is a document', () => {
    for (const f of [
      '.claude/skills/testeur/SKILL.md',
      '.claude/template',
      '.claude/skills/relecteur/references/LICENSE-MIT',
      '.claude/skills/x/notes.txt',
      '.claude/grillhouse/charte.md',
    ]) {
      expect(perimetre([f], comps, graphe)).toEqual(aucun);
    }
  });
  it.each(['.mjs', '.js', '.cjs', '.ts', '.sh', '.py'])(
    '3uv.54 critères 2 et 7: a script under .claude/ (%s) replays every suite',
    ext => {
      expect(perimetre([`.claude/hooks/garde${ext}`], comps, graphe)).toEqual(tous);
      expect(perimetre([`.claude/skills/x/scripts/a.md${ext}`], comps, graphe)).toEqual(tous);
    }
  );
  it('3uv.54 critères 2 et 7: a setting under .claude/ (*.json, fichiers.txt) replays every suite', () => {
    for (const f of [
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.claude/skills/x/config.json',
      '.claude/grillhouse/fichiers.txt',
    ]) {
      expect(perimetre([f], comps, graphe)).toEqual(tous);
    }
  });
  it('3uv.54 critère 7: a file outside .claude/ that is not a *.md is not a document', () => {
    for (const f of ['LICENSE', '.gitignore', 'docs/schema.txt', '.claudex/notes.txt']) {
      expect(perimetre([f], comps, graphe)).toEqual(tous);
    }
  });
  it('3uv.54 critère 2: replays every suite when documents outside every component come with another file outside', () => {
    expect(perimetre(['README.md', 'scripts/y.mjs'], comps, graphe)).toEqual(tous);
    expect(perimetre(['scripts/y.mjs', 'docs/a.md'], comps, graphe)).toEqual(tous);
    expect(perimetre(['.claude/agents/a.md', '.claude/settings.json'], comps, graphe)).toEqual(
      tous
    );
    expect(perimetre(['docs/a.md', 'package.json'], comps, graphe)).toEqual(tous);
  });
  it('3uv.54 critères 3 et 5: a document outside every component next to code of a component replays that component and its consumers', () => {
    expect(perimetre(['README.md', 'packages/a/src/x.ts'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['packages/a', 'packages/b', 'packages/c'],
    });
    expect(perimetre(['packages/c/src/x.ts', '.claude/agents/a.md'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['packages/c'],
    });
  });
  it('3uv.54 critère 5: a component document and a root document replay that component and its consumers', () => {
    expect(perimetre(['packages/a/docs/INTERFACE.md', 'README.md'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['packages/a', 'packages/b', 'packages/c'],
    });
    expect(perimetre(['docs/x.md', 'src/d/README.md'], comps, graphe)).toEqual({
      mode: 'composants',
      composants: ['src/d'],
    });
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
  const repo = mkdtempSync(path.join(ESSAIS, 'integrer-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
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
  // The suites run twice, on the base and with the lot: each call is recorded.
  const enregistrer =
    "import fs from 'node:fs';\nfs.appendFileSync(`${process.env.PRINCIPAL}.args`, `[${process.argv.slice(2).join(' ')}]`);\nfs.writeFileSync(process.env.ROUGES, '');\n";
  // A lot that creates <fichiers> (relative path → content), as a code patch, the tree left as it was.
  const lotNeuf = (m: ReturnType<typeof monde>, nom: string, fichiers: Record<string, string>) => {
    let diff = '';
    for (const [f, contenu] of Object.entries(fichiers)) {
      mkdirSync(path.dirname(path.join(m.repo, f)), { recursive: true });
      writeFileSync(path.join(m.repo, f), contenu);
      diff += spawnSync('git', ['-C', m.repo, 'diff', '--no-index', '/dev/null', f], {
        encoding: 'utf8',
      }).stdout;
      rmSync(path.join(m.repo, f));
    }
    const patch = path.join(m.bin, nom);
    writeFileSync(patch, diff);
    return patch;
  };
  it('3uv.54 critère 1: plays the guards and no suite, base or after, for a lot of documents outside every component', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', enregistrer);
    const patch = lotNeuf(m, 'docs.patch', {
      'docs/note.md': 'une note\n',
      '.claude/agents/role.md': 'un rôle\n',
    });
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/✓ gardes/);
    expect(r.stdout).toMatch(/aucune suite/);
    expect(r.stdout).not.toMatch(/toutes les suites/);
    expect(r.stdout).toMatch(/✓ commit/);
    expect(existsSync(`${m.repo}.args`)).toBe(false);
  });
  it('3uv.54 critère 1: still refuses a lot of documents outside every component that the guards refuse', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', enregistrer);
    m.poser('GARDE_ROUGE', '');
    const patch = lotNeuf(m, 'docs.patch', { 'docs/note.md': 'une note\n' });
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/gardes refusent/);
    expect(m.etat().log[0]).toBe('pose GARDE_ROUGE');
  });
  it('3uv.54 critère 2: hands the suites --tous for documents that come with a setting under .claude/', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', enregistrer);
    const patch = lotNeuf(m, 'reglage.patch', {
      'docs/note.md': 'une note\n',
      '.claude/settings.json': '{}\n',
    });
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/toutes les suites/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[--tous][--tous]');
  });
  it('3uv.54 critère 5: hands the suites the component alone for a document outside every component next to it', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', enregistrer);
    const patch = lotNeuf(m, 'mixte.patch', {
      'docs/note.md': 'une note\n',
      'src/a/NOTE.md': 'une note du composant\n',
    });
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/suites de : src\/a/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[src/a][src/a]');
  });
  it('3uv.54 critère 6: hands the suites --tous for a lot of documents when the project chose « complet »', () => {
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
    m.poser('suites.mjs', enregistrer);
    const patch = lotNeuf(m, 'docs.patch', { 'docs/note.md': 'une note\n' });
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/toutes les suites \(réglage « complet »\)/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[--tous][--tous]');
  });
  // A lot that renames <de> into <vers> (git mv, then <contenu> written when given), as a code
  // patch with its rename header, the tree left as it was.
  const lotRenomme = (
    m: ReturnType<typeof monde>,
    nom: string,
    de: string,
    vers: string,
    contenu?: string
  ) => {
    const git = (...a: string[]) => execFileSync('git', ['-C', m.repo, ...a], { encoding: 'utf8' });
    mkdirSync(path.dirname(path.join(m.repo, vers)), { recursive: true });
    git('mv', de, vers);
    if (contenu !== undefined) {
      writeFileSync(path.join(m.repo, vers), contenu);
    }
    git('add', vers);
    const diff = git('diff', '--cached', '-M');
    expect(diff).toContain(`rename from ${de}`);
    git('reset', '-q', '--hard');
    const patch = path.join(m.bin, nom);
    writeFileSync(patch, diff);
    return patch;
  };
  it('3uv.54 critère 2: hands the suites --tous for a script outside every component renamed into a document', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', enregistrer);
    mkdirSync(path.join(m.repo, 'scripts'));
    const corps = Array.from({ length: 10 }, (_, i) => `export const o${i} = ${i};\n`).join('');
    m.poser('scripts/outil.mjs', corps);
    const patch = lotRenomme(
      m,
      'renomme.patch',
      'scripts/outil.mjs',
      'docs-outil.md',
      `${corps}// devenu document\n`
    );
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/toutes les suites/);
    expect(r.stdout).not.toMatch(/aucune suite/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[--tous][--tous]');
  });
  it('3uv.54 critère 5: hands the suites its component for a document of it moved outside every component', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', enregistrer);
    mkdirSync(path.join(m.repo, 'src/a/docs'));
    m.poser('src/a/docs/NOTE.md', 'une note\ndu composant\n');
    const patch = lotRenomme(m, 'deplace.patch', 'src/a/docs/NOTE.md', 'docs/NOTE.md');
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/suites de : src\/a/);
    expect(r.stdout).not.toMatch(/aucune suite/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[src/a][src/a]');
  });
  it('3uv.54 reprise du RENDU: refuses a code lot that renames a test file into a file outside the testeur', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', enregistrer);
    mkdirSync(path.join(m.repo, 'tests'));
    m.poser('tests/b.spec.ts', 'test\n');
    const patch = lotRenomme(m, 'test-renomme.patch', 'tests/b.spec.ts', 'src/a/b.ts');
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/lot de code touche des fichiers du testeur/);
    expect(r.stdout).toContain('tests/b.spec.ts');
    expect(m.etat().log[0]).toBe('pose tests/b.spec.ts');
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
  it('critère 5: hands the suites --tous, never no argument, for code outside every component', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nfs.appendFileSync(`${process.env.PRINCIPAL}.args`, `[${process.argv.slice(2).join(' ')}]`);\nfs.writeFileSync(process.env.ROUGES, '');\n"
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
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[--tous][--tous]');
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
  it('critère 5: hands the suites --tous when the project chose « complet »', () => {
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
      "import fs from 'node:fs';\nfs.appendFileSync(`${process.env.PRINCIPAL}.args`, `[${process.argv.slice(2).join(' ')}]`);\nfs.writeFileSync(process.env.ROUGES, '');\n"
    );
    const r = m.run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/toutes les suites/);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toBe('[--tous][--tous]');
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

// grillhouse-2sq.2, relecture B: an unreadable package.json does not make its component a package
// of the shared test material, and refuses no lot; the lots follow the rest of the rule.
describe('refusLots with an unreadable package.json', () => {
  const repo = depotLots();
  mkdirSync(path.join(repo, 'packages/casse'), { recursive: true });
  writeFileSync(path.join(repo, 'packages/casse/package.json'), '{"name":"casse",');

  it('passes a code lot that repairs it or touches its component', () => {
    expect(refusLots(['tests/unit/a.spec.ts'], ['packages/casse/package.json'], repo)).toBeNull();
    expect(refusLots(['tests/unit/a.spec.ts'], ['packages/casse/src/x.ts'], repo)).toBeNull();
  });
  it('passes a tests lot that touches the material and the tests of the component', () => {
    expect(
      refusLots(
        ['packages/matiere/fixtures/un.txt', 'packages/casse/tests/a.spec.ts'],
        ['packages/a/src/x.ts'],
        repo
      )
    ).toBeNull();
  });
  it('refuses its component in a tests lot as code, not as an unreadable material', () => {
    const r = refusLots(['packages/casse/src/x.ts'], [], repo);
    expect(r).toMatch(/lot de tests touche du code/);
    expect(r).toContain('packages/casse/src/x.ts');
    expect(r).not.toMatch(/illisible/);
  });
  it('still refuses a code lot that touches the material', () => {
    const r = refusLots([], ['packages/casse/src/x.ts', 'packages/corpus/scenes/x.bps'], repo);
    expect(r).toMatch(/lot de code touche/);
    expect(r).toContain('packages/corpus/scenes/x.bps');
    expect(r).not.toContain('packages/casse/src/x.ts');
  });
});

// grillhouse-3uv.58 critère 6: an existing integration copy that does not get ready (its move onto
// HEAD, its cleaning or the setting of its submodules fails) is removed by the frame's script
// (scripts/retirer-copie.sh --jetable, critère 11) and created again, once; the integration
// refuses as today when the new copy does not get ready either, or when the removal is refused,
// its refusal repeating the script's reason (critère 9).
describe('grillhouse-3uv.58 critère 6 — the integration removes and recreates a copy that does not get ready', () => {
  const LONG = 60_000;
  const gitDe = (dir: string, ...a: string[]) =>
    execFileSync(
      'git',
      [
        '-C',
        dir,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        '-c',
        'protocol.file.allow=always',
        ...a,
      ],
      { encoding: 'utf8' }
    );
  // A world whose node_modules is ignored, with an integration copy left by an earlier
  // integration; a mark in its node_modules survives its cleaning, never its removal.
  function existante() {
    const m = monde(['ACCEPTÉ']);
    m.poser('.gitignore', '.claude/worktrees/\nnode_modules\n');
    const copie = path.join(m.repo, '.claude/worktrees/integration');
    const gitdir = path.join(m.repo, '.git/worktrees/integration');
    const marque = path.join(copie, 'node_modules/.marque');
    const creer = () => {
      gitDe(m.repo, 'worktree', 'add', '-q', '--detach', copie, 'HEAD');
      mkdirSync(path.dirname(marque), { recursive: true });
      writeFileSync(marque, 'ancienne copie\n');
    };
    // The copy's move onto HEAD fails: a lock left in its git directory by a stopped git.
    const bloquerPassage = () => writeFileSync(path.join(gitdir, 'index.lock'), '');
    // main references the submodule vendor/natif; `perdre` moves its source away.
    let natif = '';
    const sousModule = () => {
      natif = mkdtempSync(path.join(ESSAIS, 'natif-'));
      gitDe(natif, 'init', '-q');
      writeFileSync(path.join(natif, 'natif.txt'), 'v1\n');
      gitDe(natif, 'add', '.');
      gitDe(natif, 'commit', '-qm', 'v1');
      gitDe(m.repo, 'submodule', 'add', '-q', natif, 'vendor/natif');
      gitDe(m.repo, 'commit', '-qm', 'natif');
    };
    const perdre = () => renameSync(natif, `${natif}-parti`);
    const listees = () => gitDe(m.repo, 'worktree', 'list', '--porcelain');
    const log = () => gitDe(m.repo, 'log', '--format=%s');
    return { ...m, copie, gitdir, marque, creer, bloquerPassage, sousModule, perdre, listees, log };
  }

  it(
    'critère 6: a copy whose move onto HEAD fails is removed, recreated, and the lot is committed',
    () => {
      const m = existante();
      m.creer();
      m.bloquerPassage();
      const r = m.run();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(m.log().split('\n')[0]).toBe('feat: a (demo-1)');
      expect(existsSync(m.marque)).toBe(false);
      expect(m.listees()).toContain(`worktree ${m.copie}\n`);
    },
    LONG
  );
  it(
    'critère 6: a copy whose submodules do not set is removed, recreated, and the lot is committed',
    () => {
      const m = existante();
      m.sousModule();
      m.creer();
      gitDe(m.copie, 'submodule', 'update', '--init', '-q');
      // The submodule's own git directory in the copy holds a stale lock: its checkout fails.
      const gitdirNatif = path.join(m.gitdir, 'modules/vendor/natif');
      expect(existsSync(gitdirNatif)).toBe(true);
      writeFileSync(path.join(gitdirNatif, 'index.lock'), '');
      const r = m.run();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(existsSync(m.marque)).toBe(false);
      expect(readFileSync(path.join(m.copie, 'vendor/natif/natif.txt'), 'utf8')).toBe('v1\n');
    },
    LONG
  );
  it(
    'critère 6: a recreated copy that does not get ready either refuses as today, naming the submodule',
    () => {
      const m = existante();
      m.creer();
      m.bloquerPassage();
      m.sousModule();
      m.perdre();
      const avant = m.log();
      const r = m.run();
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔[^\n]*vendor\/natif/);
      // The old copy was removed before the second try.
      expect(existsSync(m.marque)).toBe(false);
      expect(m.log()).toBe(avant);
    },
    LONG
  );
  // grillhouse-3uv.58 critère 11: the integration passes --jetable for its own copy; local work
  // left in it (a refused lot still applied, a file, a submodule moved) does not hold its removal.
  it(
    'critère 6 et 11: a copy that does not get ready and carries an untracked file is removed, recreated, and the lot is committed',
    () => {
      const m = existante();
      m.creer();
      writeFileSync(path.join(m.copie, 'RESTE'), 'reste\n');
      m.bloquerPassage();
      const r = m.run();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(m.log().split('\n')[0]).toBe('feat: a (demo-1)');
      expect(existsSync(path.join(m.copie, 'RESTE'))).toBe(false);
      expect(existsSync(m.marque)).toBe(false);
    },
    LONG
  );
  it(
    'critère 6 et 11: a copy that does not get ready and carries a modified tracked file (a refused lot still applied) is removed, recreated, and the lot is committed',
    () => {
      const m = existante();
      m.creer();
      writeFileSync(path.join(m.copie, 'src/a/index.ts'), 'export const a = 99;\n');
      m.bloquerPassage();
      const r = m.run();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(m.log().split('\n')[0]).toBe('feat: a (demo-1)');
      expect(existsSync(m.marque)).toBe(false);
    },
    LONG
  );
  it(
    'critère 6 et 11: a copy whose submodule carries local work and does not set is removed, recreated, and the lot is committed',
    () => {
      const m = existante();
      m.sousModule();
      m.creer();
      gitDe(m.copie, 'submodule', 'update', '--init', '-q');
      writeFileSync(path.join(m.copie, 'vendor/natif/natif.txt'), 'travail\n');
      writeFileSync(path.join(m.copie, 'vendor/natif/neuf.txt'), 'neuf\n');
      writeFileSync(path.join(m.gitdir, 'modules/vendor/natif/index.lock'), '');
      const r = m.run();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(existsSync(m.marque)).toBe(false);
      expect(readFileSync(path.join(m.copie, 'vendor/natif/natif.txt'), 'utf8')).toBe('v1\n');
      expect(existsSync(path.join(m.copie, 'vendor/natif/neuf.txt'))).toBe(false);
    },
    LONG
  );
  // grillhouse-3uv.58 critère 9: the refusal repeats the reason the script gives.
  it(
    'critère 6, 9 et 11: a locked copy that does not get ready refuses as today, the script’s reason in the refusal, the copy left in place and locked',
    () => {
      const m = existante();
      m.creer();
      writeFileSync(path.join(m.copie, 'RESTE'), 'reste\n');
      gitDe(m.repo, 'worktree', 'lock', '--reason', 'en cours', m.copie);
      m.bloquerPassage();
      const avant = m.log();
      const r = m.run();
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔/);
      expect(readFileSync(path.join(m.copie, 'RESTE'), 'utf8')).toBe('reste\n');
      expect(existsSync(m.marque)).toBe(true);
      expect(m.listees()).toMatch(new RegExp(`worktree ${m.copie}\n[^]*?locked`));
      expect(m.log()).toBe(avant);
      // The reason the frame's script gives for this copy, as the integration calls it.
      const raison = spawnSync('bash', [RETIRER, '--jetable', m.copie], {
        cwd: m.repo,
        encoding: 'utf8',
      });
      expect(raison.status, raison.stderr).toBe(1);
      expect(raison.stderr.trim()).not.toBe('');
      expect(r.stdout.slice(r.stdout.indexOf('⛔'))).toContain(raison.stderr.trim());
    },
    LONG
  );
});
