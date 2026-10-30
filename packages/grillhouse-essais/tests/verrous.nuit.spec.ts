// Ticket grillhouse-3dr.3.7: the write lock and the lock of the commands as Claude Code runs them,
// a node process reading the hook's JSON on its input, its verdict in its exit code and its error
// output, in a project and in a git repository and its copy: its cases moved as they were from
// packages/grillhouse/tests/unit/verrous.spec.ts, where the lock is tested by its interface
// (`refusal`, `refusDeCommande`), by day.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE } from './cadre.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrous-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.join(CADRE, 'scripts/verrous/verrou.mjs');
const COMMANDE = path.join(CADRE, 'scripts/verrous/commande.mjs');
// The project the hook judges: it declares its language (grillhouse-3dr.2.3), outside the system
// temp directory, which the hook command takes for the scratchpad.
const ROOT = racineSousLaMaison('grillhouse-essais-verrous-racine-');
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));
writeFileSync(
  path.join(ROOT, 'package.json'),
  JSON.stringify({ name: 'repo', grillhouse: { langages: ['typescript'] } })
);

// A session whose sub-agent was launched with `prompt`, as Claude Code lays it on disk.
function session(prompt: string) {
  const dir = mkdtempSync(path.join(ESSAIS, 'verrou-'));
  mkdirSync(path.join(dir, 's1', 'subagents'), { recursive: true });
  const first = { type: 'user', message: { role: 'user', content: prompt } };
  writeFileSync(path.join(dir, 's1', 'subagents', 'agent-a1.jsonl'), JSON.stringify(first) + '\n');
  return { transcript_path: path.join(dir, 's1.jsonl'), agent_id: 'a1', cwd: ROOT };
}

function write(file: string, extra: object = {}) {
  return { tool_name: 'Write', tool_input: { file_path: file, content: 'x' }, cwd: ROOT, ...extra };
}

describe('the hook command', () => {
  const run = (role: string, input: object) =>
    spawnSync('node', [SCRIPT, role], { input: JSON.stringify(input), encoding: 'utf8' });

  it('refuses with exit code 2 and its reason on stderr', () => {
    const r = run('testwriter', write(`${ROOT}/src/a.ts`));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/seulement des fichiers de test/);
  });
  it('allows with exit code 0', () => {
    const r = run('testwriter', write(`${ROOT}/tests/a.spec.ts`));
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });
  // grillhouse-3dr.2.3: a project that declares no language is refused, closed, as the lock cannot
  // judge its writes: a hook that throws exits 1, which Claude Code lets pass.
  it('refuses in a project that declares no language, exit code 2, the update named', () => {
    const sans = mkdtempSync(path.join(ROOT, 'sans-langage-'));
    writeFileSync(path.join(sans, 'package.json'), JSON.stringify({ name: 'sans' }));
    const r = run('testwriter', { ...write(`${sans}/tests/a.spec.ts`), cwd: sans });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/grillhouse\.langages.*npx grillhouse maj/);
    expect(r.stderr.trim().split('\n')).toHaveLength(1);
  });
  // The update that writes the declaration stays open there: the write lock judges the tools of
  // writing alone, and the lock of the commands no language.
  it.each(['npx grillhouse maj', 'node_modules/.bin/grillhouse maj'])(
    'lets %s run in a project that declares no language',
    commande => {
      const sans = mkdtempSync(path.join(ROOT, 'sans-langage-'));
      writeFileSync(path.join(sans, 'package.json'), JSON.stringify({ name: 'sans' }));
      const bash = { tool_name: 'Bash', tool_input: { command: commande }, cwd: sans };
      for (const role of ['testwriter', 'developpeur']) {
        const r = run(role, bash);
        expect(r.status, `${role} : ${r.stderr}`).toBe(0);
        const c = spawnSync('node', [COMMANDE], { input: JSON.stringify(bash), encoding: 'utf8' });
        expect(c.status, c.stderr).toBe(0);
      }
    }
  );
});

// grillhouse-2sq: the package of the shared test material, the component whose package.json
// exports `./test-fixtures`, is written by the testwriter alone, every file of it; the rest of the
// code stays refused to the testwriter, and the developpeur's lock does not change. The repositories
// live outside the system temp directory, which the hook command takes for the scratchpad, in a
// trial directory of this run alone.
const ESSAIS_VERROU = racineSousLaMaison('grillhouse-essais-verrou-');
afterAll(() => rmSync(ESSAIS_VERROU, { recursive: true, force: true }));

function depotAvecMatiere() {
  const repo = mkdtempSync(path.join(ESSAIS_VERROU, 'depot-'));
  const ecrire = (rel: string, contenu: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), contenu);
  };
  ecrire(
    'package.json',
    JSON.stringify({ name: 'racine', private: true, grillhouse: { langages: ['typescript'] } })
  );
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

describe('testwriter and the package of the shared test material', () => {
  const repo = depotAvecMatiere();
  const at = (rel: string, tool = 'Write') => ({
    tool_name: tool,
    tool_input: { file_path: path.join(repo, rel), content: 'x' },
    cwd: repo,
  });

  it('the hook command lets the testwriter write the material, and refuses it the rest', () => {
    const run = (rel: string) =>
      spawnSync('node', [SCRIPT, 'testwriter'], {
        input: JSON.stringify(at(rel)),
        encoding: 'utf8',
      });
    expect(run('packages/matiere/fixtures/cas/profond/un.txt').status).toBe(0);
    expect(run('packages/autre/src/a.ts').status).toBe(2);
  });
});

describe('developpeur and the package of the shared test material', () => {
  const repo = depotAvecMatiere();

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
    expect(r.stderr).toMatch(/testwriter/);
    expect(r.stderr).not.toMatch(/introuvable/);
  });
});

// grillhouse-2sq.2, relecture A: the lock reads the root of the repository that holds the written
// file, never the agent's working directory, which follows each `cd` of the session. Ownership
// stays the same from every working directory.
describe('the lock and the working directory of the agent', () => {
  const repo = depotAvecMatiere();
  const from = (cwd: string, file: string, extra: object = {}) => ({
    tool_name: 'Write',
    tool_input: { file_path: file, content: 'x' },
    ...extra,
    cwd,
  });

  it('the hook command reads the root of the file, not the working directory', () => {
    const run = (role: string, cwd: string, rel: string) =>
      spawnSync('node', [SCRIPT, role], {
        input: JSON.stringify(from(path.join(repo, cwd), path.join(repo, rel))),
        encoding: 'utf8',
      });
    expect(run('testwriter', 'packages', 'packages/corpus/cas/x.json').status).toBe(0);
    expect(run('testwriter', 'tests', 'src/a.ts').status).toBe(2);
    const dev = run('developpeur', 'packages/corpus', 'packages/corpus/cas/x.json');
    expect(dev.status).toBe(2);
    expect(dev.stderr).toMatch(/testwriter/);
    expect(dev.stderr).not.toMatch(/introuvable/);
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
  const at = (rel: string, extra: object = {}) => ({
    ...write(path.join(repo, rel), extra),
    cwd: repo,
  });

  it('the hook command lets the developpeur repair it', () => {
    const r = spawnSync('node', [SCRIPT, 'developpeur'], {
      input: JSON.stringify({ ...at('packages/casse/package.json'), ...ready, cwd: repo }),
      encoding: 'utf8',
    });
    expect(r.stderr).not.toMatch(/La matière de test partagée/);
  });
});
