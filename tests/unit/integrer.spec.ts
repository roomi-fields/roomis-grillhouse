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
  chantier,
  construireParLiens,
  INTEGRER_SCRIPT,
  suitesParLiens,
} from './integration-essai.js';
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
  // grillhouse-3uv.65 critère 17: a root file replays only the suites that declare it read
  // (`grillhouse.lusParLesSuites`, given here to none); a file outside every component that no
  // declaration names, code, setting or CI, replays no suite.
  it('3uv.65 critère 17: replays no suite for a file outside every component that no declaration names, whatever its kind', () => {
    for (const f of [
      'scripts/y.mjs',
      'scripts/verrous/lib/z.mjs',
      'vitest.config.ts',
      'tsconfig.json',
      '.github/workflows/ci.yml',
      '.gitignore',
      'LICENSE',
      'docs/schema.txt',
    ]) {
      expect(perimetre([f], comps, graphe).mode, f).toBe('aucun');
    }
  });
  it('3uv.65 critère 17: a file outside every component that no declaration names adds nothing to the scope of a component next to it', () => {
    expect(perimetre(['packages/c/src/x.ts', 'scripts/y.mjs'], comps, graphe)).toEqual(
      perimetre(['packages/c/src/x.ts'], comps, graphe)
    );
    expect(perimetre(['scripts/y.mjs', 'packages/a/src/x.ts'], comps, graphe)).toEqual(
      perimetre(['packages/a/src/x.ts'], comps, graphe)
    );
  });
  it('3uv.65 critère 17: replays no suite for code in a project without any component, undeclared', () => {
    expect(perimetre(['scripts/y.mjs'], [], new Map()).mode).toBe('aucun');
  });
  it('3uv.65 critère 16 (garde): the lock file of the dependencies replays suites, undeclared', () => {
    expect(perimetre(['package-lock.json'], comps, graphe).mode).not.toBe('aucun');
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
    '3uv.65 critère 17: a script under .claude/ (%s), undeclared, replays no suite',
    ext => {
      expect(perimetre([`.claude/hooks/garde${ext}`], comps, graphe).mode).toBe('aucun');
      expect(perimetre([`.claude/skills/x/scripts/a.md${ext}`], comps, graphe).mode).toBe('aucun');
    }
  );
  it('3uv.65 critère 17: a setting under .claude/ (*.json, fichiers.txt), undeclared, replays no suite', () => {
    for (const f of [
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.claude/skills/x/config.json',
      '.claude/grillhouse/fichiers.txt',
    ]) {
      expect(perimetre([f], comps, graphe).mode, f).toBe('aucun');
    }
  });
  it('3uv.65 critère 17: documents outside every component that come with another undeclared file replay no suite', () => {
    expect(perimetre(['README.md', 'scripts/y.mjs'], comps, graphe).mode).toBe('aucun');
    expect(perimetre(['.claude/agents/a.md', '.claude/settings.json'], comps, graphe).mode).toBe(
      'aucun'
    );
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
  it('3uv.65 critère 17: does not take a sibling sharing a prefix for the component: it lies outside every one, undeclared', () => {
    expect(perimetre(['packages/ab/x.ts'], ['packages/a'], new Map()).mode).toBe('aucun');
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
  git('init', '-q', '-b', 'main');
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
  // The ticket's copy, made as the launcher makes it (branch agent/demo-1 from main's HEAD) at the
  // first integration, the lots applied there as the agents' local work (grillhouse-3uv.63).
  const copie = path.join(repo, '.claude/worktrees/demo-1');
  const preparerCopie = (lots: string[]) => {
    if (existsSync(copie)) {
      return;
    }
    const branche = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', 'agent/demo-1']);
    if (branche.status === 0) {
      git('worktree', 'add', '-q', copie, 'agent/demo-1');
    } else {
      git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
    }
    for (let i = 0; i < lots.length; i += 2) {
      execFileSync('git', ['-C', copie, 'apply', lots[i + 1]]);
    }
  };
  const lancer = (lots: string[], extra: string[]) => {
    preparerCopie(lots);
    return spawnSync(
      'node',
      [SCRIPT, '--ticket', 'demo-1', ...lots, '--message', message, ...extra],
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
          PRINCIPAL: repo,
        },
      }
    );
  };
  const run = (...extra: string[]) => lancer(['--tests', lotTests, '--code', lotCode], extra);
  const branche = () =>
    spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', 'agent/demo-1']).status === 0
      ? 'agent/demo-1'
      : 'HEAD';
  // `log` is the history of the ticket's branch (main's before its first integration), where the integration commits (grillhouse-3uv.63).
  const etat = () => ({
    log: git('log', '--format=%s', branche()).trim().split('\n'),
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
  });
  // grillhouse-3uv.63 critère 11: the refusal « main a bougé » disappears; the lot goes onto its
  // branch, and the queue brings it onto the main of the moment.
  it('3uv.63 critère 11: main moving during the integration refuses nothing, the lot committed on its branch', () => {
    const m = monde(['ACCEPTÉ']);
    // The suites commit on main while they run, as a supervisor would.
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nimport { execSync } from 'node:child_process';\nif (fs.existsSync('tests/a.spec.ts')) execSync(`git -C ${process.env.PRINCIPAL} -c user.name=t -c user.email=t@t commit -q --allow-empty -m bouge`);\nfs.writeFileSync(process.env.ROUGES, '');\n"
    );
    const r = m.run();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/main a bougé/);
    expect(m.etat().log[0]).toBe('feat: a (demo-1)');
    expect(
      execFileSync('git', ['-C', m.repo, 'log', '-1', '--format=%s', 'main'], {
        encoding: 'utf8',
      }).trim()
    ).toBe('bouge');
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
  it('3uv.65 critère 17: plays the guards and no suite for documents that come with a setting under .claude/ no declaration names', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', enregistrer);
    const patch = lotNeuf(m, 'reglage.patch', {
      'docs/note.md': 'une note\n',
      '.claude/settings.json': '{}\n',
    });
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/✓ gardes/);
    expect(r.stdout).not.toMatch(/toutes les suites/);
    expect(existsSync(`${m.repo}.args`)).toBe(false);
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
  it('3uv.65 critère 17: plays no suite for a script outside every component no declaration names, renamed into a document', () => {
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
    expect(r.stdout).not.toMatch(/toutes les suites/);
    expect(existsSync(`${m.repo}.args`)).toBe(false);
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
  // grillhouse-3uv.65: the project declares the root paths its suites read.
  const declarer = (m: ReturnType<typeof monde>, lus: string[]) =>
    m.poser(
      'package.json',
      JSON.stringify({
        grillhouse: { lusParLesSuites: lus },
        scripts: {
          'integration:suites': 'node suites.mjs',
          'integration:gardes': 'test ! -f GARDE_ROUGE && test ! -f RESTE',
        },
      })
    );
  // A code lot that changes the root script scripts/outil.mjs, committed on main beforehand.
  const lotOutil = (m: ReturnType<typeof monde>) => {
    mkdirSync(path.join(m.repo, 'scripts'));
    m.poser('scripts/outil.mjs', 'export const o = 1;\n');
    writeFileSync(path.join(m.repo, 'scripts/outil.mjs'), 'export const o = 2;\n');
    const patch = path.join(m.bin, 'scripts.patch');
    writeFileSync(
      patch,
      spawnSync('git', ['-C', m.repo, 'diff', '--', 'scripts'], { encoding: 'utf8' }).stdout
    );
    spawnSync('git', ['-C', m.repo, 'checkout', '--', 'scripts']);
    return patch;
  };
  it('3uv.65 critère 17: plays no suite for code outside every component no declaration names', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', enregistrer);
    const r = m.lancer(['--code', lotOutil(m)], []);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/toutes les suites/);
    expect(existsSync(`${m.repo}.args`)).toBe(false);
  });
  it('3uv.65 critère 21 (garde): hands the suites a scope, never nothing, on the base and after, for code outside every component the project declares read', () => {
    const m = monde(['ACCEPTÉ']);
    declarer(m, ['scripts']);
    m.poser('suites.mjs', enregistrer);
    const r = m.lancer(['--code', lotOutil(m)], []);
    expect(r.status).toBe(0);
    expect(readFileSync(`${m.repo}.args`, 'utf8')).toMatch(/^\[[^\]]+\]\[[^\]]+\]$/);
  });
  it('3uv.65 critère 8 (garde): refuses a lot outside every component, declared read, that brings a new failure', () => {
    const m = monde(['ACCEPTÉ']);
    declarer(m, ['scripts']);
    // The suites fail once the root script changes: only a replay of the suites that read it sees it.
    m.poser(
      'suites.mjs',
      "import fs from 'node:fs';\nconst r = fs.readFileSync('scripts/outil.mjs', 'utf8').includes('2') ? 'tests/outil.spec.ts > outil\\n' : '';\nfs.writeFileSync(process.env.ROUGES, r);\nprocess.exit(r ? 1 : 0);\n"
    );
    const r = m.lancer(['--code', lotOutil(m)], []);
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
      gitDe(natif, 'init', '-q', '-b', 'main');
      writeFileSync(path.join(natif, 'natif.txt'), 'v1\n');
      gitDe(natif, 'add', '.');
      gitDe(natif, 'commit', '-qm', 'v1');
      gitDe(m.repo, 'submodule', 'add', '-q', natif, 'vendor/natif');
      gitDe(m.repo, 'commit', '-qm', 'natif');
    };
    const perdre = () => renameSync(natif, `${natif}-parti`);
    const listees = () => gitDe(m.repo, 'worktree', 'list', '--porcelain');
    // The ticket's branch, where the integration commits (grillhouse-3uv.63).
    const log = () =>
      gitDe(
        m.repo,
        'log',
        '--format=%s',
        spawnSync('git', ['-C', m.repo, 'rev-parse', '--verify', '-q', 'agent/demo-1']).status === 0
          ? 'agent/demo-1'
          : 'HEAD'
      );
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

// grillhouse-3uv.63: the integration commits the lot on the ticket's branch agent/<ticket>, after
// the controls of today; the ticket's copy is then clean, and the queue brings the branch onto main.
describe('grillhouse-3uv.63 — the integration commits on the ticket branch', () => {
  const LONG = 60_000;
  // The copy is clean once the lot is committed, and the integration removes it at once
  // (critère 15): it is gone from the disk and from git's list of copies, its branch kept.
  const propre = (m: ReturnType<typeof chantier>, id: string) => {
    const copie = m.copieDe(id);
    expect(existsSync(copie)).toBe(false);
    expect(m.git('worktree', 'list', '--porcelain')).not.toContain(`worktree ${copie}\n`);
    expect(m.existe(`refs/heads/agent/${id}`)).toBe(true);
  };

  it(
    'critère 1: the lot is committed on agent/<ticket>, main untouched, and the copy is clean and removed without --jetable',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', {
        'src/a/index.ts': 'export const a = 1;\n',
        'src/a/a.spec.ts': 'test\n',
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')).toEqual(['feat: lot (demo-1)', 'base']);
      expect(m.sujets('main')).toEqual(['base']);
      expect(m.git('show', 'agent/demo-1:src/a/index.ts')).toBe('export const a = 1;\n');
      expect(m.git('show', 'agent/demo-1:src/a/a.spec.ts')).toBe('test\n');
      expect(m.git('status', '--porcelain')).toBe('');
      propre(m, 'demo-1');
    },
    LONG
  );
  it(
    'critère 1: a lot that adds and deletes files leaves its copy clean too',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', {
        'src/b/index.ts': null,
        'src/b/neuf.ts': 'export const n = 1;\n',
        'src/b/profond/x.spec.ts': 'test\n',
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(
        m.git('ls-tree', '-r', '--name-only', 'agent/demo-1', 'src/b').trim().split('\n')
      ).toEqual(['src/b/neuf.ts', 'src/b/profond/x.spec.ts']);
      propre(m, 'demo-1');
    },
    LONG
  );
  it(
    'critère 1: main moved since the copy was made: the lot is still committed on agent/<ticket>, the copy clean',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.poser({ 'src/c/index.ts': 'export const c = 9;\n' }, 'ailleurs');
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      expect(m.git('show', 'agent/demo-1:src/a/index.ts')).toBe('export const a = 1;\n');
      expect(m.sujets('main')).toEqual(['ailleurs', 'base']);
      propre(m, 'demo-1');
    },
    LONG
  );
  it(
    'critère 2: the committed ticket is labelled en-file and stays open',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      expect(m.integrer('demo-1').status).toBe(0);
      const t = m.bd('demo-1');
      expect(t.labels).toContain('en-file');
      expect(t.status).not.toBe('closed');
      expect(m.appels()).not.toMatch(/^close /m);
    },
    LONG
  );
  it(
    'critère 11: two integrations launched together both commit, none refused « une intégration tourne déjà »',
    async () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      const [r1, r2] = await Promise.all([m.integrerEnFond('demo-1'), m.integrerEnFond('demo-2')]);
      expect(r1.status, r1.stdout + r1.stderr).toBe(0);
      expect(r2.status, r2.stdout + r2.stderr).toBe(0);
      expect(r1.stderr + r2.stderr).not.toMatch(/tourne déjà/);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      expect(m.sujets('agent/demo-2')[0]).toBe('feat: lot (demo-2)');
      expect(m.sujets('main')).toEqual(['base']);
    },
    LONG
  );
  // Critère 14: the ticket's copy carries the lot and nothing else; anything else refuses the
  // integration before any commit, naming those files, and touches nothing.
  const refuseAvantCommit = (
    m: ReturnType<typeof chantier>,
    r: { status: number | null; stdout: string; stderr: string },
    noms: string[]
  ) => {
    expect(r.status, r.stdout + r.stderr).toBe(1);
    for (const n of noms) {
      expect(r.stdout + r.stderr).toContain(n);
    }
    expect(m.sujets('agent/demo-1')).toEqual(['base']);
    expect(m.sujets('main')).toEqual(['base']);
    expect(m.bd('demo-1').labels).not.toContain('en-file');
    expect(existsSync(m.copieDe('demo-1'))).toBe(true);
  };
  it(
    'critère 14: an untracked file outside the lot in the copy refuses before any commit, named, and stays',
    () => {
      const m = chantier(ESSAIS);
      const copie = m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      writeFileSync(path.join(copie, 'src/a/brouillon.ts'), 'brouillon\n');
      refuseAvantCommit(m, m.integrer('demo-1'), ['src/a/brouillon.ts']);
      expect(readFileSync(path.join(copie, 'src/a/brouillon.ts'), 'utf8')).toBe('brouillon\n');
    },
    LONG
  );
  it(
    'critère 14: an untracked file deep in a new directory is named by its own path',
    () => {
      const m = chantier(ESSAIS);
      const copie = m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      mkdirSync(path.join(copie, 'src/c/neuf/profond'), { recursive: true });
      writeFileSync(path.join(copie, 'src/c/neuf/profond/x.ts'), 'x\n');
      refuseAvantCommit(m, m.integrer('demo-1'), ['src/c/neuf/profond/x.ts']);
    },
    LONG
  );
  it(
    'critère 14: tracked files modified or deleted outside the lot refuse, each named',
    () => {
      const m = chantier(ESSAIS);
      const copie = m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      writeFileSync(path.join(copie, 'src/b/index.ts'), 'export const b = 99;\n');
      m.gitDans(copie, 'rm', '-q', 'src/c/index.ts');
      refuseAvantCommit(m, m.integrer('demo-1'), ['src/b/index.ts', 'src/c/index.ts']);
      expect(readFileSync(path.join(copie, 'src/b/index.ts'), 'utf8')).toBe(
        'export const b = 99;\n'
      );
    },
    LONG
  );
  it(
    'critère 14: a file of the lot whose content in the copy differs from the lot refuses, named',
    () => {
      const m = chantier(ESSAIS);
      const copie = m.ticket('demo-1', {
        'src/a/index.ts': 'export const a = 1;\n',
        'src/a/a.spec.ts': 'test\n',
      });
      writeFileSync(path.join(copie, 'src/a/a.spec.ts'), 'test retouché\n');
      refuseAvantCommit(m, m.integrer('demo-1'), ['src/a/a.spec.ts']);
    },
    LONG
  );
  it(
    'critère 14: files the project ignores (node_modules) are not work: the lot is committed',
    () => {
      const m = chantier(ESSAIS);
      const copie = m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      mkdirSync(path.join(copie, 'node_modules/x'), { recursive: true });
      writeFileSync(path.join(copie, 'node_modules/x/index.js'), 'x\n');
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
    },
    LONG
  );

  // Critère 22: a copy that carries exactly the lot passes critère 14 even when main changed,
  // since the copy's base, another part of a file of the lot: the copy is compared to its own
  // base plus the lot.
  const lignes = (n: number, change: Record<number, string> = {}) =>
    Array.from({ length: n }, (_, i) => change[i + 1] ?? `ligne ${i + 1}`).join('\n') + '\n';
  it(
    'critère 22: a document of 80 lines, line 5 changed in the copy, line 70 changed on main: the exact lot is committed on agent/<ticket>',
    () => {
      const m = chantier(ESSAIS);
      m.poser({ 'DOC.md': lignes(80) }, 'doc');
      m.ticket('demo-1', { 'DOC.md': lignes(80, { 5: 'ligne 5 du ticket' }) });
      m.poser({ 'DOC.md': lignes(80, { 70: 'ligne 70 de main' }) }, 'un autre ticket');
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout + r.stderr).not.toMatch(/diffèrent/);
      expect(m.sujets('agent/demo-1')).toEqual([
        'feat: lot (demo-1)',
        'un autre ticket',
        'doc',
        'base',
      ]);
      expect(m.git('show', 'agent/demo-1:DOC.md')).toBe(
        lignes(80, { 5: 'ligne 5 du ticket', 70: 'ligne 70 de main' })
      );
      expect(m.sujets('main')).toEqual(['un autre ticket', 'doc', 'base']);
      expect(m.bd('demo-1').labels).toContain('en-file');
      propre(m, 'demo-1');
    },
    LONG
  );
  it(
    'critère 22: a code file and a test file of the lot, each changed elsewhere on main: the exact lot is committed',
    () => {
      const m = chantier(ESSAIS);
      m.poser({ 'src/a/index.ts': lignes(40), 'src/a/a.spec.ts': lignes(40) }, 'a long');
      m.ticket('demo-1', {
        'src/a/index.ts': lignes(40, { 2: 'code du ticket' }),
        'src/a/a.spec.ts': lignes(40, { 38: 'test du ticket' }),
      });
      m.poser(
        {
          'src/a/index.ts': lignes(40, { 35: 'code de main' }),
          'src/a/a.spec.ts': lignes(40, { 3: 'test de main' }),
        },
        'un autre ticket'
      );
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.git('show', 'agent/demo-1:src/a/index.ts')).toBe(
        lignes(40, { 2: 'code du ticket', 35: 'code de main' })
      );
      expect(m.git('show', 'agent/demo-1:src/a/a.spec.ts')).toBe(
        lignes(40, { 3: 'test de main', 38: 'test du ticket' })
      );
      propre(m, 'demo-1');
    },
    LONG
  );
  it(
    'critère 22: main changed another part of a file of the lot, and the copy differs from the lot in that file: still refused, named',
    () => {
      const m = chantier(ESSAIS);
      m.poser({ 'DOC.md': lignes(80) }, 'doc');
      const copie = m.ticket('demo-1', { 'DOC.md': lignes(80, { 5: 'ligne 5 du ticket' }) });
      m.poser({ 'DOC.md': lignes(80, { 70: 'ligne 70 de main' }) }, 'un autre ticket');
      // After its lot was made, the copy changes one more line of the file: not the lot.
      writeFileSync(
        path.join(copie, 'DOC.md'),
        lignes(80, { 5: 'ligne 5 du ticket', 40: 'retouche hors lot' })
      );
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout + r.stderr).toContain('DOC.md');
      expect(m.sujets('agent/demo-1')).toEqual(['doc', 'base']);
      expect(m.bd('demo-1').labels).not.toContain('en-file');
      expect(existsSync(copie)).toBe(true);
    },
    LONG
  );

  // Critère 15: once its commit is made, the integration removes the ticket's copy itself.
  it(
    'critère 15: the integration removes the copy itself once the commit is made, the branch kept',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      propre(m, 'demo-1');
    },
    LONG
  );
  it(
    'critère 15: a locked copy that the script refuses to remove: the refusal is written to the ticket, the branch stays in the queue',
    () => {
      const m = chantier(ESSAIS);
      const copie = m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.git('worktree', 'lock', '--reason', 'en cours', copie);
      m.integrer('demo-1');
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      expect(existsSync(copie)).toBe(true);
      const t = m.bd('demo-1');
      expect(t.labels).toContain('en-file');
      expect(t.status).not.toBe('closed');
      expect(t.comments.map(c => c.text).join('\n')).toMatch(/verrouill/i);
    },
    LONG
  );

  // Critère 17: two integrations launched together: the second waits for the end of the first,
  // then goes through; a lock left by a process that is gone is taken over.
  it(
    'critère 17: two integrations launched together run one after the other, and both commit',
    async () => {
      const m = chantier(ESSAIS);
      // The suites mark their start « < » and their end « > », one second apart.
      m.poser(
        {
          'suites.mjs':
            "import fs from 'node:fs';\n" +
            "const t = process.env.PRINCIPAL + '.trace';\n" +
            "fs.appendFileSync(t, '<');\n" +
            'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);\n' +
            "fs.appendFileSync(t, '>');\n" +
            "fs.writeFileSync(process.env.ROUGES, '');\n",
        },
        'suites lentes'
      );
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      const [r1, r2] = await Promise.all([m.integrerEnFond('demo-1'), m.integrerEnFond('demo-2')]);
      expect(r1.status, r1.stdout + r1.stderr).toBe(0);
      expect(r2.status, r2.stdout + r2.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      expect(m.sujets('agent/demo-2')[0]).toBe('feat: lot (demo-2)');
      // Base and lot for each integration, never two suites at once.
      expect(readFileSync(`${m.repo}.trace`, 'utf8')).toBe('<><><><>');
    },
    LONG
  );
  it(
    'critère 17: an integration killed midway leaves no lock that holds the next one',
    async () => {
      const m = chantier(ESSAIS);
      // The suites mark their start, then take ten seconds.
      m.poser(
        {
          'suites.mjs':
            "import fs from 'node:fs';\n" +
            "fs.writeFileSync(process.env.PRINCIPAL + '.debut', '');\n" +
            'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);\n' +
            "fs.writeFileSync(process.env.ROUGES, '');\n",
        },
        'suites lentes'
      );
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      const premiere = m.integrerProcessus('demo-1');
      const debut = `${m.repo}.debut`;
      for (let i = 0; i < 300 && !existsSync(debut); i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      expect(existsSync(debut)).toBe(true);
      premiere.p.kill('SIGKILL');
      await premiere.fin;
      // The next integration's suites are quick again.
      m.poser(
        { 'suites.mjs': "import fs from 'node:fs';\nfs.writeFileSync(process.env.ROUGES, '');\n" },
        'suites rapides'
      );
      const r = await Promise.race([
        m.integrerEnFond('demo-2'),
        new Promise<null>(r => setTimeout(() => r(null), 45_000)),
      ]);
      expect(r, 'la seconde intégration attend encore').not.toBeNull();
      expect(r!.status, r!.stdout + r!.stderr).toBe(0);
      expect(m.sujets('agent/demo-2')[0]).toBe('feat: lot (demo-2)');
    },
    LONG
  );
  it(
    'critère 17: a lock written by a process that is gone is taken over',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      const parti = spawnSync('true').pid;
      writeFileSync(path.join(m.repo, '.git/integration.lock'), String(parti));
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
    },
    LONG
  );

  // Critère 19: an integration of several tickets: the first ticket named gives its branch and
  // its copy (critères 1, 14, 15); every ticket named is labelled en-file.
  it(
    'critère 19: the first ticket named gives its branch and its copy; each ticket named is labelled en-file and stays open',
    () => {
      const m = chantier(ESSAIS);
      m.ticket(
        'demo-1',
        { 'src/a/index.ts': 'export const a = 1;\n' },
        'feat: lot (demo-1, demo-2)'
      );
      m.inscrire('demo-2');
      const r = m.integrer('demo-1', '--ticket', 'demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')).toEqual(['feat: lot (demo-1, demo-2)', 'base']);
      expect(m.existe('refs/heads/agent/demo-2')).toBe(false);
      expect(m.sujets('main')).toEqual(['base']);
      propre(m, 'demo-1');
      for (const id of ['demo-1', 'demo-2']) {
        expect(m.bd(id).labels, id).toContain('en-file');
        expect(m.bd(id).status, id).not.toBe('closed');
      }
    },
    LONG
  );
  it(
    'critère 19: named in the other order, the other ticket gives its branch and its copy',
    () => {
      const m = chantier(ESSAIS);
      m.inscrire('demo-1');
      m.ticket(
        'demo-2',
        { 'src/b/index.ts': 'export const b = 2;\n' },
        'feat: lot (demo-2, demo-1)'
      );
      const r = m.integrer('demo-2', '--ticket', 'demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-2')[0]).toBe('feat: lot (demo-2, demo-1)');
      expect(m.existe('refs/heads/agent/demo-1')).toBe(false);
      propre(m, 'demo-2');
      expect(m.bd('demo-1').labels).toContain('en-file');
    },
    LONG
  );
  it(
    "critère 19 et 14: the first ticket's copy carrying a file outside the lot refuses, named",
    () => {
      const m = chantier(ESSAIS);
      const copie = m.ticket(
        'demo-1',
        { 'src/a/index.ts': 'export const a = 1;\n' },
        'feat: lot (demo-1, demo-2)'
      );
      m.inscrire('demo-2');
      writeFileSync(path.join(copie, 'src/a/brouillon.ts'), 'brouillon\n');
      refuseAvantCommit(m, m.integrer('demo-1', '--ticket', 'demo-2'), ['src/a/brouillon.ts']);
      expect(m.bd('demo-2').labels).not.toContain('en-file');
    },
    LONG
  );
});

// grillhouse-3uv.73: every command of the project in the copy of the replay passes through
// `lancer` (scripts/integration/rejeu.mjs), which leaves the index of the copy up to date after it,
// green or red, as git's own scripts refresh before they judge (`git update-index -q --refresh`,
// require_clean_work_tree). The trial build (./integration-essai.ts, `construireParLiens`) and the
// trial suites of critère 8 (`suitesParLiens`) hard-link tracked files: the link changes their
// ctime after the copy wrote its index, and `git apply --index` then takes them for modified.
describe('grillhouse-3uv.73 — every command of the project leaves the index of its copy up to date', () => {
  const LONG_73 = 120_000;
  const COPIE = (repo: string) => path.join(repo, '.claude/worktrees/integration');
  // The files of the integration copy whose stat no longer matches its index, without refreshing it.
  const perimes = (repo: string) =>
    execFileSync('git', ['-C', COPIE(repo), 'diff-files', '--name-only'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  const fichiersDe = (m: ReturnType<typeof chantier>, ref: string) =>
    m.git('ls-tree', '-r', '--name-only', ref).trim().split('\n');
  // The integration of <id> under the C locale: git's own words are read in English.
  const integrerC = (m: ReturnType<typeof chantier>, id: string) =>
    spawnSync('node', [INTEGRER_SCRIPT, ...m.argsIntegrer(id)], {
      cwd: m.repo,
      encoding: 'utf8',
      env: { ...m.env, LC_ALL: 'C', LANG: 'C' },
    });

  it(
    'critère 1: a lot that deletes a tracked file the build of the base hard-linked is committed',
    () => {
      const m = chantier(ESSAIS);
      const builds = construireParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': null });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(builds()).toContain('lien');
      expect(fichiersDe(m, 'agent/demo-1')).not.toContain('src/a/donnees.txt');
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
    },
    LONG_73
  );
  it(
    'critère 1: a lot that deletes a hard-linked file of the shared test material (the tests lot) and a hard-linked file of code is committed',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', { 'src/a/tests/fixture.txt': null, 'src/a/donnees.txt': null });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const restants = fichiersDe(m, 'agent/demo-1');
      expect(restants).not.toContain('src/a/tests/fixture.txt');
      expect(restants).not.toContain('src/a/donnees.txt');
    },
    LONG_73
  );
  it(
    'critère 2: a lot that modifies a tracked file the build of the base hard-linked is committed',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': 'un\nDEUX\ntrois\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.git('show', 'agent/demo-1:src/a/donnees.txt')).toBe('un\nDEUX\ntrois\n');
    },
    LONG_73
  );
  it(
    'critère 2: a lot that modifies a hard-linked file of the tests lot and one of the code lot is committed',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', {
        'src/a/tests/fixture.txt': 'f1\nF2\n',
        'src/a/donnees.txt': 'UN\ndeux\ntrois\n',
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.git('show', 'agent/demo-1:src/a/tests/fixture.txt')).toBe('f1\nF2\n');
      expect(m.git('show', 'agent/demo-1:src/a/donnees.txt')).toBe('UN\ndeux\ntrois\n');
    },
    LONG_73
  );
  it(
    'critère 5: a red build of the base refreshes the index of its copy before the refusal',
    () => {
      const m = chantier(ESSAIS);
      const builds = construireParLiens(m);
      m.poser({ CONSTRUCTION_ROUGE: '' }, 'construction rouge');
      m.ticket('demo-1', { 'src/a/donnees.txt': 'un\nDEUX\ntrois\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/La base ne se mesure pas/);
      expect(builds()).toContain('lien');
      expect(perimes(m.repo)).toEqual([]);
    },
    LONG_73
  );
  it(
    'critère 5: a red build of the lot refreshes the index of its copy before the refusal',
    () => {
      const m = chantier(ESSAIS);
      const builds = construireParLiens(m);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n', CONSTRUCTION_ROUGE: '' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/Rouges nouveaux/);
      expect(builds().filter(b => b === 'lien')).toHaveLength(2);
      expect(perimes(m.repo)).toEqual([]);
    },
    LONG_73
  );
  it(
    'critère 6: a lot that does not apply on HEAD to a hard-linked file is refused with the message of a lot that does not apply, git naming the conflict',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': 'un\nDEUX\ntrois\n' });
      m.poser({ 'src/a/donnees.txt': 'un\nAUTRE\ntrois\n' }, 'main bouge');
      const branche = m.sha('agent/demo-1');
      const r = integrerC(m, 'demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔ Le lot \S+code\.patch ne s'applique pas :\n/);
      expect(r.stdout).toMatch(/conflict/i);
      expect(r.stdout).not.toMatch(/does not match index/);
      expect(r.stdout).toMatch(/Le lot retourne à son agent/);
      expect(m.sha('agent/demo-1')).toBe(branche);
    },
    LONG_73
  );
  it(
    'critère 6: a lot that does not apply on HEAD to a file the build did not link is refused with the same message',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.poser({ 'src/a/index.ts': 'export const a = 2;\n' }, 'main bouge');
      const r = integrerC(m, 'demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔ Le lot \S+code\.patch ne s'applique pas :\n/);
      expect(r.stdout).toMatch(/conflict/i);
    },
    LONG_73
  );
  it(
    'critère 8: a lot that deletes a tracked file a suite of the base (not the build) hard-linked is committed',
    () => {
      const m = chantier(ESSAIS);
      const liens = suitesParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': null });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(liens()).toContain('lien');
      expect(fichiersDe(m, 'agent/demo-1')).not.toContain('src/a/donnees.txt');
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
    },
    LONG_73
  );
  it(
    'critère 8: a lot that modifies a tracked file a suite of the base (not the build) hard-linked is committed',
    () => {
      const m = chantier(ESSAIS);
      const liens = suitesParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': 'un\nDEUX\ntrois\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(liens()).toContain('lien');
      expect(m.git('show', 'agent/demo-1:src/a/donnees.txt')).toBe('un\nDEUX\ntrois\n');
    },
    LONG_73
  );
  it(
    'critère 8: a lot that deletes a hard-linked file of the tests lot and modifies a hard-linked file of code is committed',
    () => {
      const m = chantier(ESSAIS);
      suitesParLiens(m);
      m.ticket('demo-1', {
        'src/a/tests/fixture.txt': null,
        'src/a/donnees.txt': 'UN\ndeux\ntrois\n',
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(fichiersDe(m, 'agent/demo-1')).not.toContain('src/a/tests/fixture.txt');
      expect(m.git('show', 'agent/demo-1:src/a/donnees.txt')).toBe('UN\ndeux\ntrois\n');
    },
    LONG_73
  );
  it(
    'critère 5: red suites of the lot that hard-link tracked files leave the index of the copy up to date before the refusal',
    () => {
      const m = chantier(ESSAIS);
      const liens = suitesParLiens(m);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n', ROUGES_FORCES: 'a > t\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/Rouges nouveaux/);
      expect(liens()).toHaveLength(2);
      expect(perimes(m.repo)).toEqual([]);
    },
    LONG_73
  );
  it('critère 4: the refresh lives in `lancer` of rejeu.mjs, after the command, and nowhere else in scripts/integration/', () => {
    const dossier = path.resolve(__dirname, '../../scripts/integration');
    // The code of a script, its comments removed: the texts may name the refresh (critère 7).
    const code = (f: string) =>
      readFileSync(path.join(dossier, f), 'utf8')
        .replace(/\/\*[^]*?\*\//g, '')
        .split('\n')
        .map(l => l.replace(/(^|\s)\/\/.*$/, ''));
    const RAFRAICHIT = /update-index|['"`]--refresh['"`]/;
    const porteurs = execFileSync('ls', [dossier], { encoding: 'utf8' })
      .split('\n')
      .filter(f => /\.[cm]?js$/.test(f))
      .filter(f => code(f).some(l => RAFRAICHIT.test(l)));
    expect(porteurs).toEqual(['rejeu.mjs']);
    const lignes = code('rejeu.mjs');
    const debut = lignes.findIndex(l => /\b(const|let|function)\s+lancer\b/.test(l));
    expect(debut).toBeGreaterThanOrEqual(0);
    const retrait = /^\s*/.exec(lignes[debut])![0].length;
    let fin = debut + 1;
    while (
      fin < lignes.length &&
      (lignes[fin].trim() === '' ||
        /^\s*/.exec(lignes[fin])![0].length > retrait ||
        /^\s*[)}\]]/.test(lignes[fin]))
    ) {
      fin++;
    }
    const corps = lignes.slice(debut, fin);
    const dans = corps.filter(l => RAFRAICHIT.test(l));
    const partout = lignes.filter(l => RAFRAICHIT.test(l));
    expect(dans.length).toBeGreaterThan(0);
    expect(partout).toEqual(dans);
    // After the command: the refresh follows the call that runs it.
    const commande = corps.findIndex(l => /\bspawnSync\s*\(/.test(l));
    expect(commande).toBeGreaterThanOrEqual(0);
    expect(corps.findIndex(l => RAFRAICHIT.test(l))).toBeGreaterThan(commande);
  });
});
