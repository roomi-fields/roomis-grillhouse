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
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import {
  chantier,
  chantierDependances,
  construireParLiens,
  INTEGRER_SCRIPT,
  suitesParLiens,
} from './integration-essai.js';
import { refusLots, refusVerdicts } from '../../scripts/integration/integrer.mjs';

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
  it("passes the chef de chantier's arbitrage, settled by construction (BPScript 320.2.7)", () => {
    expect(
      refusVerdicts(arb, [
        c('## Arbitrage du chef de chantier — critères 1 à 4\nSource : la lettre du critère 2.'),
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

// A repository with a fake Beads and the one test command of the frame: `npm run verifier` plays the guards
// (red while GARDE_ROUGE or RESTE exists), then the tests (suites.mjs: red while ROUGES_FORCES
// exists), one exit code. Each run of the tests appends « [<its arguments>] » to <PRINCIPAL>.args.
const SUITES_MONDE =
  "import fs from 'node:fs';\nfs.appendFileSync(`${process.env.PRINCIPAL}.args`, `[${process.argv.slice(2).join(' ')}]`);\nprocess.exit(fs.existsSync('ROUGES_FORCES') ? 1 : 0);\n";
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
      scripts: { verifier: 'test ! -f GARDE_ROUGE && test ! -f RESTE && node suites.mjs' },
    })
  );
  writeFileSync(path.join(repo, 'suites.mjs'), SUITES_MONDE);
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
  // The runs of the tests so far, each with its arguments.
  const appels = () => (existsSync(`${repo}.args`) ? readFileSync(`${repo}.args`, 'utf8') : '');
  // The commit <ref> names, or '' when it names none.
  const sha = (ref: string) =>
    spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', `${ref}^{commit}`], {
      encoding: 'utf8',
    }).stdout.trim();
  return { repo, run, lancer, etat, poser, bin, appels, sha };
}

// The refusal of the integration once `npm run verifier` is red in its copy: no commit on the ticket's
// branch, which stays where the copy was made, and the main tree as it was.
const REFUS_TESTS = /⛔ Les tests refusent le lot \(sortie ci-dessus\)\./;

describe('an integration', () => {
  it('commits a reviewed lot whose npm run verifier is green, and writes its duration', () => {
    const m = monde(['ACCEPTÉ']);
    const r = m.run();
    expect(r.stdout).toMatch(/✓ commit/);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/✓ tests/);
    expect(r.stdout).toMatch(/^⏱ \d+(\.\d)? s$/m);
    expect(r.stdout).not.toMatch(/budget/);
    const e = m.etat();
    expect(e.log[0]).toBe('feat: a (demo-1)');
    expect(e.status).toBe('');
  });
  it('plays npm run verifier once in the copy, without any argument', () => {
    const m = monde(['ACCEPTÉ']);
    const r = m.run();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(m.appels()).toBe('[]');
  });
  it('refuses a lot without the ACCEPTÉ verdict, touching nothing', () => {
    const m = monde(['RENDU : R1']);
    expect(m.run().status).toBe(1);
    expect(m.etat()).toMatchObject({ log: ['base'], status: '', test: false });
    expect(m.appels()).toBe('');
  });
  it('refuses --admettre as a usage error, touching nothing', () => {
    const m = monde(['ACCEPTÉ']);
    const r = m.run('--admettre', 'tests/a.spec.ts > a');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/^usage: integrer\.mjs/);
    expect(r.stderr).not.toMatch(/admettre/);
    expect(m.appels()).toBe('');
    expect(m.etat()).toMatchObject({ log: ['base'], status: '' });
  });
  it('refuses a lot whose guards are red in npm run verifier: no commit, no branch moved, the tree restored', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('GARDE_ROUGE', '');
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(REFUS_TESTS);
    expect(r.stdout).not.toMatch(/✓ commit/);
    expect(m.etat()).toMatchObject({
      log: ['pose GARDE_ROUGE', 'base'],
      status: '',
      a: 'export const a = 1;\n',
      test: false,
    });
  });
  it('refuses a lot whose tests are red with it: no commit, the branch where the copy was made', () => {
    const m = monde(['ACCEPTÉ']);
    // The tests fail only once the lot's test file exists.
    m.poser(
      'suites.mjs',
      SUITES_MONDE.replace("fs.existsSync('ROUGES_FORCES')", "fs.existsSync('tests/a.spec.ts')")
    );
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(REFUS_TESTS);
    expect(m.sha('agent/demo-1')).toBe(m.sha('main'));
    expect(m.etat()).toMatchObject({ log: ['pose suites.mjs', 'base'], status: '', test: false });
  });
  // A red test is never admitted: one known red already on HEAD refuses the lot too (main stays
  // green; a known red test is put in quarantine in the test itself).
  it('refuses a lot whose tests are already red on HEAD: nothing is compared with a base', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('ROUGES_FORCES', 'vieux > rouge\n');
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(REFUS_TESTS);
    expect(r.stdout).not.toMatch(/base/);
    expect(m.etat().log[0]).toBe('pose ROUGES_FORCES');
  });
  it('writes the output of the red npm run verifier before its refusal', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser(
      'suites.mjs',
      "process.stdout.write('sortie des tests : t > rouge\\n');\nprocess.exit(1);\n"
    );
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout.indexOf('sortie des tests : t > rouge')).toBeGreaterThanOrEqual(0);
    expect(r.stdout.indexOf('sortie des tests')).toBeLessThan(r.stdout.indexOf('⛔'));
  });
  // « À repasser » (75): every failure of the tests depended on a duration under load, and the
  // pass found no rest in its bound (scripts/verifier.mjs). Neither green nor red: nothing is
  // committed, nothing is refused, the lot stays where it is for the same command again.
  it('a npm run verifier à repasser (75) neither commits nor refuses: exit 75, the lot stays', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', "process.stdout.write('⏱ à repasser\\n');\nprocess.exit(75);\n");
    const r = m.run();
    expect(r.status, r.stdout).toBe(75);
    expect(r.stdout).toMatch(/à repasser/);
    expect(r.stdout).not.toMatch(/⛔/);
    expect(r.stdout).not.toMatch(/✓ commit/);
    expect(m.sha('agent/demo-1')).toBe(m.sha('main'));
    expect(m.etat()).toMatchObject({ log: ['pose suites.mjs', 'base'], status: '' });
  });
  it('a npm run verifier at another code than 0 and 75 is a refusal', () => {
    const m = monde(['ACCEPTÉ']);
    m.poser('suites.mjs', 'process.exit(3);\n');
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(REFUS_TESTS);
  });
  it('refuses when a file of the lot is modified in the tree', () => {
    const m = monde(['ACCEPTÉ']);
    writeFileSync(path.join(m.repo, 'src/a/index.ts'), 'export const a = 3;\n');
    const r = m.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/modifiés dans l'arbre/);
    expect(m.etat().a).toBe('export const a = 3;\n');
  });
  it('runs the tests on a clean copy: an untracked file of the main tree does not count', () => {
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
    // The tests commit on main while they run, as a supervisor would.
    m.poser(
      'suites.mjs',
      "import { execSync } from 'node:child_process';\nexecSync(`git -C ${process.env.PRINCIPAL} -c user.name=t -c user.email=t@t commit -q --allow-empty -m bouge`);\n"
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
  it('3uv.54 reprise du RENDU: refuses a code lot that renames a test file into a file outside the testeur', () => {
    const m = monde(['ACCEPTÉ']);
    mkdirSync(path.join(m.repo, 'tests'));
    m.poser('tests/b.spec.ts', 'test\n');
    const patch = lotRenomme(m, 'test-renomme.patch', 'tests/b.spec.ts', 'src/a/b.ts');
    const r = m.lancer(['--code', patch], []);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/lot de code touche des fichiers du testeur/);
    expect(r.stdout).toContain('tests/b.spec.ts');
    expect(m.etat().log[0]).toBe('pose tests/b.spec.ts');
    expect(m.appels()).toBe('');
  });
  // grillhouse-3uv.56 critère 3: git writes a name outside ASCII quoted and escaped in a patch's
  // « rename from » line (core.quotepath, on by default); the integration reads the origin of a
  // rename as the file's own name. The lot is made as an agent makes it, git's defaults kept.
  const lotRenommeParGit = (m: ReturnType<typeof monde>, nom: string, de: string, vers: string) => {
    const git = (...a: string[]) => execFileSync('git', ['-C', m.repo, ...a], { encoding: 'utf8' });
    mkdirSync(path.dirname(path.join(m.repo, vers)), { recursive: true });
    git('mv', de, vers);
    const diff = git('diff', '--cached', '-M');
    expect(diff).toMatch(/^rename from "[^"]*\\[0-7]{3}/m);
    git('reset', '-q', '--hard');
    const patch = path.join(m.bin, nom);
    writeFileSync(patch, diff);
    return patch;
  };
  it('3uv.56 critère 3: refuses a code lot that renames an accented test file, naming its origin as it is', () => {
    const m = monde(['ACCEPTÉ']);
    mkdirSync(path.join(m.repo, 'tests'));
    m.poser('tests/café.spec.ts', 'test\n');
    const patch = lotRenommeParGit(m, 'cafe.patch', 'tests/café.spec.ts', 'src/a/café.ts');
    const r = m.lancer(['--code', patch], []);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stdout).toMatch(/lot de code touche des fichiers du testeur/);
    expect(r.stdout).toContain('tests/café.spec.ts');
    expect(r.stdout).not.toMatch(/\\[0-7]{3}|"tests\//);
  });
  it('3uv.56 critère 3: commits a lot that moves an accented document, its origin read as it is', () => {
    const m = monde(['ACCEPTÉ']);
    mkdirSync(path.join(m.repo, 'src/a/docs'));
    m.poser('src/a/docs/été.md', 'une note\ndu composant\n');
    const patch = lotRenommeParGit(m, 'ete.patch', 'src/a/docs/été.md', 'docs/été.md');
    const r = m.lancer(['--code', patch], []);
    expect(r.status, r.stdout).toBe(0);
    expect(m.etat().log[0]).toBe('feat: a (demo-1)');
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
      // The tests mark their start « < » and their end « > », one second apart.
      m.poser(
        {
          'suites.mjs':
            "import fs from 'node:fs';\n" +
            "const t = process.env.PRINCIPAL + '.trace';\n" +
            "fs.appendFileSync(t, '<');\n" +
            'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);\n' +
            "fs.appendFileSync(t, '>');\n",
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
      // One run of the tests for each integration, never two at once.
      expect(readFileSync(`${m.repo}.trace`, 'utf8')).toBe('<><>');
    },
    LONG
  );
  it(
    'critère 17: an integration killed midway leaves no lock that holds the next one',
    async () => {
      const m = chantier(ESSAIS);
      // The tests mark their start, then take ten seconds.
      m.poser(
        {
          'suites.mjs':
            "import fs from 'node:fs';\n" +
            "fs.writeFileSync(process.env.PRINCIPAL + '.debut', '');\n" +
            'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);\n',
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
      // The next integration's tests are quick again.
      m.poser({ 'suites.mjs': '' }, 'suites rapides');
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
// require_clean_work_tree). The trial build (./integration-essai.ts, `construireParLiens`), which
// `npm run verifier` plays before the guards and the tests as Turborepo does, and the trial suites of
// critère 8 (`suitesParLiens`) hard-link tracked files: the link changes their ctime after the
// copy wrote its index, and `git commit` or `git apply --index` would then take them for modified.
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
    'critère 5: a red build of the lot, in npm run verifier, refreshes the index of its copy before the refusal',
    () => {
      const m = chantier(ESSAIS);
      const builds = construireParLiens(m);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n', CONSTRUCTION_ROUGE: '' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔ Les tests refusent le lot/);
      expect(builds()).toEqual(['lien']);
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
    'critère 8: a lot that deletes a tracked file the tests (not the build) hard-link is committed',
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
    'critère 8: a lot that modifies a tracked file the tests (not the build) hard-link is committed',
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
    'critère 5: red tests of the lot that hard-link tracked files leave the index of the copy up to date before the refusal',
    () => {
      const m = chantier(ESSAIS);
      const liens = suitesParLiens(m);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n', ROUGES_FORCES: 'a > t\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔ Les tests refusent le lot/);
      expect(liens()).toHaveLength(1);
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

// grillhouse-3uv.74: the dependencies of the integration copy follow its lock file of the moment.
// One function of the replay (scripts/integration/rejeu.mjs) compares the lock file with the key
// of node_modules, runs `npm ci` when they differ and writes the key again; it runs at the opening
// and once the lot is applied, before `npm run verifier` (the build, the guards, the tests), which reads
// the dependencies. The trial project's build, guards and tests read the dependencies
// (./integration-essai.ts, `chantierDependances`); npm runs offline.
describe('grillhouse-3uv.74 — the dependencies of the integration copy follow its lock file', () => {
  const D = 180_000;
  it(
    'critère 1: a lot that adds a workspace is committed: its tests find the new package by its name',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket(
        'demo-1',
        m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } })
      );
      const avant = m.lectures().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => l.qui)).toContain('suites');
      for (const l of lues) {
        expect(l.presents.d, l.qui).toBe('1.0.0');
      }
    },
    D
  );
  it(
    'critère 1: a lot that adds a workspace under another name than its directory is installed under its name',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket(
        'demo-1',
        m.fichiers({
          ...m.initial,
          espaces: { ...m.initial.espaces, 'src/outils': '@essai/outils' },
        })
      );
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.lectures().at(-1)!.presents['@essai']).toBeDefined();
    },
    D
  );
  it(
    'critère 3: a lot that changes an external dependency in the lock file is installed before its guards and tests',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', m.fichiers({ ...m.initial, externe: '2.0.0' }));
      const avant = m.lectures().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => l.qui).sort()).toEqual(['gardes', 'suites']);
      expect(lues.map(l => l.presents['ext-lib'])).toEqual(['2.0.0', '2.0.0']);
    },
    D
  );
  it(
    'critère 4: a lot that does not change the lock file does not run npm ci again: the key holds',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      m.poserMarque('integration');
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-2');
      expect(m.marquee('integration')).toBe(true);
    },
    D
  );
  it(
    'critère 5: after a lot that changed the lock file, the next integration installs again and tests with the dependencies of HEAD and its lot',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket(
        'demo-1',
        m.fichiers({ espaces: { ...m.initial.espaces, 'src/d': 'd' }, externe: '2.0.0' })
      );
      m.livrer('demo-1');
      m.poserMarque('integration');
      m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 1;\n' });
      const avant = m.lectures().length;
      m.livrer('demo-2');
      expect(m.marquee('integration')).toBe(false);
      const lues = m.lectures().slice(avant);
      expect(lues.length).toBeGreaterThan(0);
      for (const l of lues) {
        expect(l.presents.d, l.qui).toBeUndefined();
        expect(l.presents['ext-lib'], l.qui).toBe('1.0.0');
      }
    },
    D
  );
  it(
    'critère 5: after a lot whose installation failed, the next integration installs again and tests with the dependencies of HEAD and its lot',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', m.introuvable());
      expect(m.integrer('demo-1').status).toBe(1);
      m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 1;\n' });
      const avant = m.lectures().length;
      const r = m.integrer('demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => l.qui)).toContain('suites');
      for (const l of lues) {
        expect(l.presents, l.qui).toMatchObject({ a: '1.0.0', b: '1.0.0', 'ext-lib': '1.0.0' });
      }
    },
    D
  );
  it(
    "critère 6: an installation that fails after the lot is applied refuses the lot with « Les dépendances de la copie ne s'installent pas. », without running npm run verifier",
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', m.introuvable());
      const avant = m.appelsSuites();
      const r = m.integrer('demo-1');
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
      expect(m.appelsSuites() - avant).toBe(0);
      expect(m.existe('agent/demo-1') && m.sujets('agent/demo-1')[0]).not.toBe(
        'feat: lot (demo-1)'
      );
    },
    D
  );
  it(
    'critère 6: a lot whose lock file disagrees with its package.json is refused the same way, without running npm run verifier',
    () => {
      const m = chantierDependances(ESSAIS);
      // package.json names the workspace src/d, which the lock file (ext-lib 2.0.0) lacks.
      const neuf = m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } });
      const verrou = m.fichiers({ ...m.initial, externe: '2.0.0' });
      m.ticket('demo-1', {
        'package.json': neuf['package.json'],
        'src/d/package.json': neuf['src/d/package.json'],
        'package-lock.json': verrou['package-lock.json'],
      });
      const avant = m.appelsSuites();
      const r = m.integrer('demo-1');
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
      expect(m.appelsSuites() - avant).toBe(0);
    },
    D
  );
  it(
    'critère 9: a build that reads a new package of the lot finds it installed: the installation comes before the build',
    () => {
      const m = chantierDependances(ESSAIS, { construction: true });
      m.ticket(
        'demo-1',
        m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } })
      );
      const avant = m.lectures().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      const lues = m.lectures().slice(avant);
      expect(lues[0].qui).toBe('construction');
      expect(lues.map(l => l.qui)).toContain('suites');
      for (const l of lues) {
        expect(l.presents.d, l.qui).toBe('1.0.0');
      }
    },
    D
  );
  it(
    'critère 10: a lot that removes a workspace is committed: its tests no longer find that package',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', {
        ...m.fichiers({ ...m.initial, espaces: { 'src/a': 'a' } }),
        'src/b/package.json': null,
      });
      const avant = m.lectures().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => l.qui).sort()).toEqual(['gardes', 'suites']);
      for (const l of lues) {
        expect(Object.keys(l.presents).sort(), l.qui).toEqual(['a', 'ext-lib']);
      }
    },
    D
  );
});

// grillhouse-3uv.56 critère 12: a lot that changes a manifest (package.json) without changing
// package-lock.json passes through the installation of the replay copy as a changed lock file does:
// the continuous integration (actions/setup-node) runs `npm ci` at every pass, which refuses a
// lock file in disagreement with its manifest.
describe('grillhouse-3uv.56 critère 12 — a changed manifest is installed as a changed lock file', () => {
  const D = 180_000;
  it(
    'critère 12: a lot whose package.json adds a workspace the unchanged lock file lacks is refused',
    () => {
      const m = chantierDependances(ESSAIS);
      const neuf = m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } });
      m.ticket('demo-1', {
        'package.json': neuf['package.json'],
        'src/d/package.json': neuf['src/d/package.json'],
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
    },
    D
  );
  it(
    'critère 12: a lot whose package.json changes the version of an external dependency, the lock file unchanged, is refused',
    () => {
      const m = chantierDependances(ESSAIS);
      const neuf = m.fichiers({ ...m.initial, externe: '2.0.0' });
      m.ticket('demo-1', { 'package.json': neuf['package.json'] });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
    },
    D
  );
  it(
    'critère 12: a lot whose workspace manifest adds an external dependency the unchanged lock file lacks is refused',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', {
        'src/a/package.json': JSON.stringify(
          {
            name: 'a',
            version: '1.0.0',
            dependencies: { 'ext-lib': 'file:../../vendor/ext-lib-2.0.0.tgz' },
          },
          null,
          2
        ),
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
    },
    D
  );
  it(
    'critère 12: a lot whose package.json changes in agreement with the unchanged lock file runs npm ci, and is committed',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      m.poserMarque('integration');
      const pkg = JSON.parse(m.fichiers(m.initial)['package.json']!) as { description?: string };
      pkg.description = 'un essai';
      m.ticket('demo-2', { 'package.json': JSON.stringify(pkg, null, 2) });
      const r = m.integrer('demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-2')[0]).toBe('feat: lot (demo-2)');
      expect(m.marquee('integration')).toBe(false);
    },
    D
  );
  // Arbitrage of the chef (comment « suite au RENDU du relecteur »): the fingerprint reads every
  // package.json git tracks, whatever pattern of the root's `workspaces` declares it. Each form of
  // pattern npm reads: `**` for zero folders or more, a brace list, `?` for one character.
  for (const motifs of [['packages/**/*'], ['packages/{p1,q1}'], ['packages/p?', 'packages/q?']]) {
    it(
      `critère 12: a workspace declared by ${motifs.join(', ')} whose manifest adds an external dependency the unchanged lock file lacks is refused`,
      () => {
        const m = chantierDependances(ESSAIS, {
          espaces: { 'packages/p1': 'p1', 'packages/q1': 'q1' },
          motifs,
        });
        m.ticket('demo-1', {
          'packages/p1/package.json': JSON.stringify(
            {
              name: 'p1',
              version: '1.0.0',
              dependencies: { 'ext-lib': 'file:../../vendor/ext-lib-2.0.0.tgz' },
            },
            null,
            2
          ),
        });
        const r = m.integrer('demo-1');
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
      },
      D
    );
  }
});

// grillhouse-3uv.56 critère 11: a failed installation comes up in one form, the refusals of the
// replay module: guards that fail in `npm run verifier` while writing the text of an installation refusal
// are red tests, not an installation that fails.
describe('grillhouse-3uv.56 critère 11 — the integration judges npm run verifier by its status', () => {
  it('critère 11: red guards writing the text of an installation refusal refuse the lot as red tests', () => {
    const m = chantier(ESSAIS);
    m.poser(
      {
        'gardes.mjs': `import fs from 'node:fs';\nprocess.stderr.write("Les dépendances de la copie ne s'installent pas.\\n");\nprocess.exit(fs.existsSync('GARDE_ROUGE') ? 1 : 0);\n`,
      },
      'gardes bavardes'
    );
    m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n', GARDE_ROUGE: '' });
    const r = m.integrer('demo-1');
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('⛔ Les tests refusent le lot');
    expect(r.stdout).not.toContain("⛔ Les dépendances de la copie ne s'installent pas.");
  }, 120_000);
});

// grillhouse-3uv.74 critère 7, kept by a reading of the source without its comments: the key of
// node_modules (`.integration-lock`) and `npm ci` live in one function of the replay; neither the
// integration nor the queue reads the key or runs npm ci.
describe('grillhouse-3uv.74 critère 7 — one function compares the lock file and installs', () => {
  const dossier = path.resolve(__dirname, '../../scripts/integration');
  // The string literals of <f> (comments are not literals), each with its innermost function.
  const litteraux = (f: string) => {
    const source = ts.createSourceFile(
      f,
      readFileSync(path.join(dossier, f), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const out: { texte: string; fonction: ts.Node | null }[] = [];
    const visiter = (n: ts.Node) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n)) {
        let p: ts.Node | undefined = n.parent;
        while (p && !ts.isFunctionLike(p)) {
          p = p.parent;
        }
        out.push({ texte: n.text, fonction: p ?? null });
      }
      n.forEachChild(visiter);
    };
    visiter(source);
    return out;
  };
  const CLE = /\.integration-lock/;
  const CI = (t: string) => t === 'ci' || /\bnpm ci\b/.test(t);
  it('critère 7: neither integrer.mjs nor file.mjs reads the key or runs npm ci', () => {
    for (const f of ['integrer.mjs', 'file.mjs']) {
      const l = litteraux(f);
      expect(l.filter(x => CLE.test(x.texte) || CI(x.texte)).map(x => `${f}: ${x.texte}`)).toEqual(
        []
      );
    }
  });
  it('critère 7: in rejeu.mjs, the key and npm ci are named once each, in the same function', () => {
    const l = litteraux('rejeu.mjs');
    const cles = l.filter(x => CLE.test(x.texte));
    const cis = l.filter(x => CI(x.texte));
    expect(cles).toHaveLength(1);
    expect(cis).toHaveLength(1);
    expect(cles[0].fonction).not.toBeNull();
    expect(cis[0].fonction).toBe(cles[0].fonction);
  });
  it('critère 7: no other script of the integration reads the key or runs npm ci', () => {
    const autres = execFileSync('ls', [dossier], { encoding: 'utf8' })
      .split('\n')
      .filter(f => /\.[cm]?js$/.test(f) && f !== 'rejeu.mjs');
    const porteurs = autres.filter(f => litteraux(f).some(x => CLE.test(x.texte) || CI(x.texte)));
    expect(porteurs).toEqual([]);
  });
});
