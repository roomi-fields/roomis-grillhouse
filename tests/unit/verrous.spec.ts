import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTestFile, isTesterFile, refusal } from '../../scripts/verrous/verrou.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/verrous/verrou.mjs');
const ROOT = '/repo';
const SCRATCH = '/scratch';

// A session whose sub-agent was launched with `prompt`, as Claude Code lays it on disk.
function session(prompt: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'verrou-'));
  mkdirSync(path.join(dir, 's1', 'subagents'), { recursive: true });
  const first = { type: 'user', message: { role: 'user', content: prompt } };
  writeFileSync(path.join(dir, 's1', 'subagents', 'agent-a1.jsonl'), JSON.stringify(first) + '\n');
  return { transcript_path: path.join(dir, 's1.jsonl'), agent_id: 'a1', cwd: ROOT };
}

// A session launched as its own agent (`claude --agent`): the prompt is the session's first user
// line, after the setting and queue lines Claude Code writes first.
function ownSession(prompt: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'verrou-'));
  const lines = [
    { type: 'agent-setting', agentSetting: 'developpeur' },
    { type: 'queue-operation', operation: 'enqueue', content: prompt },
    { type: 'user', message: { role: 'user', content: prompt } },
  ];
  const transcript = path.join(dir, 's2.jsonl');
  writeFileSync(transcript, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  return { transcript_path: transcript, cwd: ROOT };
}

function write(file: string, extra: object = {}) {
  return { tool_name: 'Write', tool_input: { file_path: file, content: 'x' }, cwd: ROOT, ...extra };
}

const options = (description: string | null) => ({ tmp: SCRATCH, describe: () => description });

describe('isTestFile', () => {
  it.each([
    'tests/unit/a.ts',
    'src/__tests__/a.ts',
    'packages/x/test/a.js',
    'src/a.test.ts',
    'src/a.spec.mjs',
    'src/A.test.tsx',
  ])('%s is a test file', f => expect(isTestFile(f)).toBe(true));

  it.each(['src/a.ts', 'src/testing.ts', 'src/contest/a.ts', 'docs/tests.md'])(
    '%s is not a test file',
    f => expect(isTestFile(f)).toBe(false)
  );
});

describe('testeur', () => {
  it('writes a test file', () => {
    expect(refusal('testeur', write('/repo/tests/a.spec.ts'), options(null))).toBeNull();
  });
  it('writes in the scratchpad', () => {
    expect(refusal('testeur', write('/scratch/s/lot.patch'), options(null))).toBeNull();
  });
  it('does not write code', () => {
    expect(refusal('testeur', write('/repo/src/a.ts'), options(null))).toMatch(
      /seulement des fichiers de test/
    );
  });
  it('does not edit code', () => {
    const edit = { tool_name: 'Edit', tool_input: { file_path: '/repo/src/a.ts' }, cwd: ROOT };
    expect(refusal('testeur', edit, options(null))).toMatch(/seulement des fichiers de test/);
  });
  it('lets other tools through', () => {
    const read = { tool_name: 'Read', tool_input: { file_path: '/repo/src/a.ts' }, cwd: ROOT };
    expect(refusal('testeur', read, options(null))).toBeNull();
  });
});

describe('developpeur', () => {
  const ready = session('Tu es un agent.\n\nTON TICKET : demo-12 — un sujet.');
  const withArchitecture = options('## Architecture\n- Modèle mûr : X\n\n## Travail\n1. Y');

  it('writes code when its ticket has its Architecture section', () => {
    expect(refusal('developpeur', write('/repo/src/a.ts', ready), withArchitecture)).toBeNull();
  });
  it('reads its ticket in its own session', () => {
    const own = ownSession('TON TICKET : demo-12 — un sujet.');
    expect(refusal('developpeur', write('/repo/src/a.ts', own), withArchitecture)).toBeNull();
    expect(refusal('developpeur', write('/repo/src/a.ts', own), options('## Travail'))).toMatch(
      /section « ## Architecture »/
    );
  });
  it('does not write a test file', () => {
    expect(refusal('developpeur', write('/repo/tests/a.spec.ts', ready), withArchitecture)).toMatch(
      /appartiennent au testeur/
    );
  });
  it('does not write code while its ticket lacks the Architecture section', () => {
    expect(
      refusal('developpeur', write('/repo/src/a.ts', ready), options('## Travail\n1. Y'))
    ).toMatch(/section « ## Architecture »/);
  });
  it('does not take an Architecture word in the text for the section', () => {
    expect(
      refusal(
        'developpeur',
        write('/repo/src/a.ts', ready),
        options('Voir ## Architecture plus tard')
      )
    ).toMatch(/section « ## Architecture »/);
  });
  it('does not write code when its ticket is unreadable', () => {
    expect(refusal('developpeur', write('/repo/src/a.ts', ready), options(null))).toMatch(
      /illisible/
    );
  });
  it('does not write code without a ticket in its launch prompt', () => {
    const lost = session('Tu es un agent sans ticket.');
    expect(refusal('developpeur', write('/repo/src/a.ts', lost), withArchitecture)).toMatch(
      /introuvable/
    );
  });
  it('writes in the scratchpad without a ticket', () => {
    const lost = session('Tu es un agent sans ticket.');
    expect(refusal('developpeur', write('/scratch/s/lot.patch', lost), options(null))).toBeNull();
  });
});

describe('an unknown role', () => {
  it('writes nothing', () => {
    expect(refusal('cuisinier', write('/repo/src/a.ts'), options(null))).toMatch(/Rôle inconnu/);
  });
});

describe('the hook command', () => {
  const run = (role: string, input: object) =>
    spawnSync('node', [SCRIPT, role], { input: JSON.stringify(input), encoding: 'utf8' });

  it('refuses with exit code 2 and its reason on stderr', () => {
    const r = run('testeur', write('/repo/src/a.ts'));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/seulement des fichiers de test/);
  });
  it('allows with exit code 0', () => {
    const r = run('testeur', write('/repo/tests/a.spec.ts'));
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });
});

// grillhouse-2sq: the package of the shared test material, the component whose package.json
// exports `./test-fixtures`, is written by the testeur alone, every file of it; the rest of the
// code stays refused to the testeur, and the developpeur's lock does not change. The repositories
// live outside the system temp directory, which the hook command takes for the scratchpad.
const ESSAIS_VERROU = path.join(homedir(), '.cache', 'grillhouse-essais-verrou');

function depotAvecMatiere() {
  mkdirSync(ESSAIS_VERROU, { recursive: true });
  const repo = mkdtempSync(path.join(ESSAIS_VERROU, 'depot-'));
  const ecrire = (rel: string, contenu: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), contenu);
  };
  ecrire('package.json', JSON.stringify({ name: 'racine', private: true }));
  ecrire(
    'packages/matiere/package.json',
    JSON.stringify({ name: 'matiere', exports: { '.': './index.js', './test-fixtures': './f.js' } })
  );
  ecrire('packages/matiere/fixtures/cas/profond/un.txt', 'x');
  ecrire('packages/matiere/src/generer.ts', 'x');
  // Another package of the same kind: a conditional export of `./test-fixtures`.
  ecrire(
    'packages/corpus/package.json',
    JSON.stringify({
      name: 'corpus',
      exports: { './test-fixtures': { import: './f.mjs', require: './f.cjs' } },
    })
  );
  ecrire('packages/corpus/scenes/x.bps', 'x');
  // Neighbours that are not the material: other subpaths, a string export, no package.json, and
  // a name that the material's name prefixes.
  ecrire(
    'packages/autre/package.json',
    JSON.stringify({ name: 'autre', exports: { '.': './i.js', './fixtures': './f.js' } })
  );
  ecrire('packages/autre/src/a.ts', 'x');
  ecrire('packages/chaine/package.json', JSON.stringify({ name: 'chaine', exports: './i.js' }));
  ecrire('packages/sans/src/a.ts', 'x');
  ecrire('packages/matiere-bis/package.json', JSON.stringify({ name: 'matiere-bis' }));
  ecrire('src/a.ts', 'x');
  // The repository holds the files it writes: its root is where git finds it.
  spawnSync('git', ['init', '-q'], { cwd: repo });
  return repo;
}

describe('testeur and the package of the shared test material', () => {
  const repo = depotAvecMatiere();
  const at = (rel: string, tool = 'Write') => ({
    tool_name: tool,
    tool_input: { file_path: path.join(repo, rel), content: 'x' },
    cwd: repo,
  });

  it.each([
    'packages/matiere/package.json',
    'packages/matiere/fixtures/cas/profond/un.txt',
    'packages/matiere/src/generer.ts',
    'packages/matiere/fixtures/neuf/dossier/neuf.json',
    'packages/corpus/scenes/x.bps',
    'packages/corpus/scenes/neuve.bps',
  ])('writes %s, a file of a package that exports ./test-fixtures', rel => {
    expect(refusal('testeur', at(rel), options(null))).toBeNull();
  });
  it('edits a file of the material', () => {
    const edit = at('packages/matiere/src/generer.ts', 'Edit');
    expect(refusal('testeur', edit, options(null))).toBeNull();
  });
  it('writes a file of the material named relative to its working directory', () => {
    const rel = { ...at('x'), tool_input: { file_path: 'packages/corpus/scenes/x.bps' } };
    expect(refusal('testeur', rel, options(null))).toBeNull();
  });

  it.each([
    'packages/autre/src/a.ts',
    'packages/autre/package.json',
    'packages/chaine/i.js',
    'packages/sans/src/a.ts',
    'packages/matiere-bis/src/a.ts',
    'src/a.ts',
    'package.json',
    'scripts/a.mjs',
  ])('still does not write %s, code outside the material', rel => {
    expect(refusal('testeur', at(rel), options(null))).toMatch(/seulement des fichiers de test/);
  });
  it('does not take a root package.json that exports ./test-fixtures for the material', () => {
    const racine = depotAvecMatiere();
    writeFileSync(
      path.join(racine, 'package.json'),
      JSON.stringify({ name: 'racine', exports: { './test-fixtures': './f.js' } })
    );
    const w = { ...write(path.join(racine, 'src/a.ts')), cwd: racine };
    expect(refusal('testeur', w, options(null))).toMatch(/seulement des fichiers de test/);
  });

  it('the hook command lets the testeur write the material, and refuses it the rest', () => {
    const run = (rel: string) =>
      spawnSync('node', [SCRIPT, 'testeur'], {
        input: JSON.stringify(at(rel)),
        encoding: 'utf8',
      });
    expect(run('packages/matiere/fixtures/cas/profond/un.txt').status).toBe(0);
    expect(run('packages/autre/src/a.ts').status).toBe(2);
  });
});

// grillhouse-2sq.2: one rule of ownership, read by every lock and by the integration. A file is
// written by the testeur when it is a test file or a file of a package of the shared test
// material (`isTesterFile`); the developpeur writes none of them, whatever its ticket.
describe('isTesterFile, the one rule of what the testeur writes', () => {
  const repo = depotAvecMatiere();

  it.each([
    'tests/unit/a.spec.ts',
    'packages/autre/src/a.test.ts',
    'packages/autre/__tests__/x.ts',
    'packages/matiere/package.json',
    'packages/matiere/fixtures/cas/profond/un.txt',
    'packages/matiere/src/generer.ts',
    'packages/matiere/fixtures/neuf/dossier/neuf.json',
    'packages/corpus/scenes/x.bps',
  ])('%s is written by the testeur (relative to the root)', rel => {
    expect(isTesterFile(rel, repo)).toBe(true);
  });
  it('takes an absolute path as well', () => {
    expect(isTesterFile(path.join(repo, 'packages/corpus/scenes/x.bps'), repo)).toBe(true);
    expect(isTesterFile(path.join(repo, 'packages/autre/src/a.ts'), repo)).toBe(false);
  });
  it.each([
    'packages/autre/src/a.ts',
    'packages/autre/package.json',
    'packages/chaine/i.js',
    'packages/sans/src/a.ts',
    'packages/matiere-bis/src/a.ts',
    'src/a.ts',
    'package.json',
    'scripts/a.mjs',
    'README.md',
  ])('%s is not written by the testeur', rel => {
    expect(isTesterFile(rel, repo)).toBe(false);
  });
  it('a project without the material keeps the test files alone', () => {
    const vide = mkdtempSync(path.join(ESSAIS_VERROU, 'vide-'));
    expect(isTesterFile('tests/a.spec.ts', vide)).toBe(true);
    expect(isTesterFile('packages/matiere/fixtures/un.txt', vide)).toBe(false);
  });
});

describe('developpeur and the package of the shared test material', () => {
  const repo = depotAvecMatiere();
  const ready = session('TON TICKET : demo-12 — un sujet.');
  const at = (rel: string) => ({ ...write(path.join(repo, rel), ready), cwd: repo });
  const withArchitecture = options('## Architecture\n- Modèle mûr : X');

  it('keeps its lock: a test file of the material stays the testeur’s', () => {
    expect(
      refusal('developpeur', at('packages/matiere/tests/a.spec.ts'), withArchitecture)
    ).toMatch(/appartiennent au testeur/);
  });
  it.each([
    'packages/matiere/package.json',
    'packages/matiere/fixtures/cas/profond/un.txt',
    'packages/matiere/src/generer.ts',
    'packages/matiere/fixtures/neuf/dossier/neuf.json',
    'packages/corpus/scenes/x.bps',
    'packages/corpus/scenes/neuve.bps',
  ])('does not write %s, the material, even with the Architecture section', rel => {
    const r = refusal('developpeur', at(rel), withArchitecture);
    expect(r).toMatch(/testeur/);
    expect(r).toContain(rel);
  });
  it('does not write the material named relative to its working directory', () => {
    const rel = { ...at('x'), tool_input: { file_path: 'packages/corpus/scenes/x.bps' } };
    expect(refusal('developpeur', rel, withArchitecture)).toMatch(/testeur/);
  });
  it('refuses the material for its owner before asking for the Architecture section', () => {
    const r = refusal('developpeur', at('packages/matiere/src/generer.ts'), options('## Travail'));
    expect(r).toMatch(/testeur/);
    expect(r).not.toMatch(/section « ## Architecture »/);
  });
  it.each([
    'packages/autre/src/a.ts',
    'packages/autre/package.json',
    'packages/matiere-bis/src/a.ts',
    'src/a.ts',
  ])('still writes %s, code outside the material, with the Architecture section', rel => {
    expect(refusal('developpeur', at(rel), withArchitecture)).toBeNull();
  });
  it('the hook command refuses the material to the developpeur, with exit code 2', () => {
    const r = spawnSync('node', [SCRIPT, 'developpeur'], {
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(repo, 'packages/corpus/scenes/x.bps'), content: 'x' },
        cwd: repo,
      }),
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/testeur/);
    expect(r.stderr).not.toMatch(/introuvable/);
  });
});

// grillhouse-2sq.2, relecture A: the lock reads the root of the repository that holds the written
// file, never the agent's working directory, which follows each `cd` of the session. Ownership
// stays the same from every working directory.
describe('the lock and the working directory of the agent', () => {
  const repo = depotAvecMatiere();
  const ready = session('TON TICKET : demo-12 — un sujet.');
  const withArchitecture = options('## Architecture\n- Modèle mûr : X');
  const from = (cwd: string, file: string, extra: object = {}) => ({
    tool_name: 'Write',
    tool_input: { file_path: file, content: 'x' },
    ...extra,
    cwd,
  });

  it.each([
    ['tests', 'tests/fixtures/d.json'],
    ['tests', 'tests/unit/neuf/dossier/a.ts'],
    ['tests/unit', 'tests/unit/a.spec.ts'],
    ['packages', 'packages/corpus/cas/x.json'],
    ['packages/corpus', 'packages/corpus/cas/x.json'],
    ['packages/matiere/fixtures', 'packages/matiere/fixtures/neuf/un.txt'],
    ['src', 'packages/matiere/src/generer.ts'],
  ])('a developpeur working in %s does not write %s', (cwd, rel) => {
    const r = refusal(
      'developpeur',
      from(path.join(repo, cwd), path.join(repo, rel), ready),
      withArchitecture
    );
    expect(r).toMatch(/testeur/);
  });
  it('a developpeur working in the material does not write it by a relative path', () => {
    const r = refusal(
      'developpeur',
      from(path.join(repo, 'packages/corpus'), 'cas/x.json', ready),
      withArchitecture
    );
    expect(r).toMatch(/testeur/);
    const t = refusal(
      'developpeur',
      from(path.join(repo, 'tests'), 'fixtures/d.json', ready),
      withArchitecture
    );
    expect(t).toMatch(/appartiennent au testeur/);
  });
  it.each([
    ['tests', 'tests/fixtures/d.json'],
    ['packages', 'packages/corpus/cas/x.json'],
    ['packages/corpus', 'packages/corpus/cas/x.json'],
    ['src', 'packages/matiere/fixtures/neuf/un.txt'],
  ])('a testeur working in %s writes %s', (cwd, rel) => {
    expect(
      refusal('testeur', from(path.join(repo, cwd), path.join(repo, rel)), options(null))
    ).toBeNull();
  });
  it.each([
    ['tests', 'src/a.ts'],
    ['packages', 'packages/autre/src/a.ts'],
    ['packages/autre', 'packages/autre/src/a.ts'],
  ])('a testeur working in %s still does not write %s', (cwd, rel) => {
    expect(
      refusal('testeur', from(path.join(repo, cwd), path.join(repo, rel)), options(null))
    ).toMatch(/seulement des fichiers de test/);
  });
  it('a developpeur working in tests still writes the code', () => {
    expect(
      refusal(
        'developpeur',
        from(path.join(repo, 'tests'), path.join(repo, 'packages/autre/src/a.ts'), ready),
        withArchitecture
      )
    ).toBeNull();
  });
  it('an agent working outside the repository keeps the ownership of its files', () => {
    const dehors = mkdtempSync(path.join(ESSAIS_VERROU, 'dehors-'));
    const mat = path.join(repo, 'packages/corpus/cas/x.json');
    expect(refusal('developpeur', from(dehors, mat, ready), withArchitecture)).toMatch(/testeur/);
    expect(refusal('testeur', from(dehors, mat), options(null))).toBeNull();
  });
  it('the hook command reads the root of the file, not the working directory', () => {
    const run = (role: string, cwd: string, rel: string) =>
      spawnSync('node', [SCRIPT, role], {
        input: JSON.stringify(from(path.join(repo, cwd), path.join(repo, rel))),
        encoding: 'utf8',
      });
    expect(run('testeur', 'packages', 'packages/corpus/cas/x.json').status).toBe(0);
    expect(run('testeur', 'tests', 'src/a.ts').status).toBe(2);
    const dev = run('developpeur', 'packages/corpus', 'packages/corpus/cas/x.json');
    expect(dev.status).toBe(2);
    expect(dev.stderr).toMatch(/testeur/);
    expect(dev.stderr).not.toMatch(/introuvable/);
  });

  // A sub-agent launched from the main tree works in the main root while it writes in its copy,
  // a git worktree under `.claude/worktrees/`: the copy's root decides.
  describe('a sub-agent launched from the main tree, writing in its copy', () => {
    const principal = depotAvecMatiere();
    const git = (...a: string[]) =>
      spawnSync('git', ['-C', principal, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
        encoding: 'utf8',
      });
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('worktree', 'add', '-q', '.claude/worktrees/copie');
    const copie = path.join(principal, '.claude', 'worktrees', 'copie');

    it('the copy is a worktree of the main repository', () => {
      expect(existsSync(path.join(copie, '.git'))).toBe(true);
      expect(existsSync(path.join(copie, 'packages/corpus/package.json'))).toBe(true);
    });
    it.each([
      'packages/corpus/scenes/x.bps',
      'packages/corpus/scenes/neuve.bps',
      'packages/matiere/fixtures/cas/profond/un.txt',
      'tests/unit/a.spec.ts',
    ])('the testeur writes %s in its copy', rel => {
      expect(refusal('testeur', from(principal, path.join(copie, rel)), options(null))).toBeNull();
    });
    it.each(['packages/autre/src/a.ts', 'src/a.ts', 'package.json'])(
      'the testeur does not write %s in its copy',
      rel => {
        expect(refusal('testeur', from(principal, path.join(copie, rel)), options(null))).toMatch(
          /seulement des fichiers de test/
        );
      }
    );
    it.each([
      'packages/corpus/scenes/x.bps',
      'packages/matiere/src/generer.ts',
      'packages/matiere/package.json',
    ])('the developpeur does not write %s in its copy', rel => {
      const r = refusal(
        'developpeur',
        from(principal, path.join(copie, rel), ready),
        withArchitecture
      );
      expect(r).toMatch(/testeur/);
      expect(r).toContain(rel);
    });
    it.each(['packages/autre/src/a.ts', 'src/a.ts'])(
      'the developpeur writes %s in its copy',
      rel => {
        expect(
          refusal('developpeur', from(principal, path.join(copie, rel), ready), withArchitecture)
        ).toBeNull();
      }
    );
  });
});

// grillhouse-2sq.2, relecture B: an unreadable package.json does not make its component a package
// of the shared test material, and blocks no write; the rest of the ownership holds.
function depotCasse() {
  const repo = depotAvecMatiere();
  mkdirSync(path.join(repo, 'packages/casse/src'), { recursive: true });
  writeFileSync(path.join(repo, 'packages/casse/package.json'), '{"name":"casse",');
  writeFileSync(path.join(repo, 'packages/casse/src/a.ts'), 'x');
  return repo;
}

describe('an unreadable package.json', () => {
  const repo = depotCasse();
  const ready = session('TON TICKET : demo-12 — un sujet.');
  const withArchitecture = options('## Architecture\n- Modèle mûr : X');
  const at = (rel: string, extra: object = {}) => ({
    ...write(path.join(repo, rel), extra),
    cwd: repo,
  });

  it('does not make its component the material, and does not throw', () => {
    expect(isTesterFile('packages/casse/src/a.ts', repo)).toBe(false);
    expect(isTesterFile('packages/casse/package.json', repo)).toBe(false);
  });
  it('leaves the rest of the rule whole', () => {
    expect(isTesterFile('packages/casse/tests/a.ts', repo)).toBe(true);
    expect(isTesterFile('packages/corpus/scenes/x.bps', repo)).toBe(true);
    expect(isTesterFile('packages/matiere/src/generer.ts', repo)).toBe(true);
    expect(isTesterFile('src/a.ts', repo)).toBe(false);
  });
  it.each(['packages/casse/package.json', 'packages/casse/src/a.ts', 'src/a.ts'])(
    'lets the developpeur write %s, code of the component and around it',
    rel => {
      expect(refusal('developpeur', at(rel, ready), withArchitecture)).toBeNull();
    }
  );
  it('keeps the material and the tests refused to the developpeur', () => {
    expect(
      refusal('developpeur', at('packages/corpus/scenes/x.bps', ready), withArchitecture)
    ).toMatch(/La matière de test partagée appartient au testeur/);
    expect(
      refusal('developpeur', at('packages/casse/tests/a.spec.ts', ready), withArchitecture)
    ).toMatch(/appartiennent au testeur/);
  });
  it('lets the testeur write the material and the tests', () => {
    expect(refusal('testeur', at('packages/matiere/fixtures/neuf.txt'), options(null))).toBeNull();
    expect(refusal('testeur', at('packages/casse/tests/a.spec.ts'), options(null))).toBeNull();
  });
  it('refuses the testeur the code of its component as code, not as an unreadable material', () => {
    const r = refusal('testeur', at('packages/casse/src/a.ts'), options(null));
    expect(r).toMatch(/seulement des fichiers de test/);
    expect(r).not.toMatch(/illisible/);
  });
  it('the hook command lets the developpeur repair it', () => {
    const r = spawnSync('node', [SCRIPT, 'developpeur'], {
      input: JSON.stringify({ ...at('packages/casse/package.json'), ...ready, cwd: repo }),
      encoding: 'utf8',
    });
    expect(r.stderr).not.toMatch(/La matière de test partagée/);
  });
});
