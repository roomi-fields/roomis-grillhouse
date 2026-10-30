// Ticket grillhouse-3dr.3.7: the hook of one commit per ticket as git runs it, a node process that
// reads the prefix and the tickets from Beads (a stand-in `bd` on the PATH) and the history of a
// trial repository: its cases moved as they were from packages/grillhouse/tests/unit/un-commit-par-ticket.spec.ts,
// where the hook's verdict, the reading of the history and the answers of Beads are tested by its
// interface, by day.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CADRE } from './cadre.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'un-commit-par-ticket-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.join(CADRE, 'scripts/un-commit-par-ticket.mjs');

// A trial repository whose history holds `messages`, one commit each (`git commit -F`, so a message
// keeps its lines), and a fake `bd` answering the prefix `demo`. `check` runs the hook on a message.
// A message given as a function receives the full shas of the commits before it; `check.shas` holds
// the full sha of each commit, `check.short` its short form as `git log --format=%h` writes it.
// `check.bin` is the folder of the fake `bd`. `check.git` runs git in the repository,
// `check.commit` adds one more commit on the current branch (its extra arguments go to
// `git commit`, or replace it with `git merge` when the first is `merge`).
type Message = string | ((shas: string[]) => string);
function history(messages: Message[]) {
  const repo = mkdtempSync(path.join(ESSAIS, 'commit-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'bd'), '#!/bin/sh\necho demo\n', { mode: 0o755 });
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
  git('init', '-q', '-b', 'main');
  const shas: string[] = [];
  const short: string[] = [];
  const commit = (message: Message, ...extra: string[]) => {
    const file = path.join(ESSAIS, `${path.basename(repo)}-${shas.length}.msg`);
    writeFileSync(file, typeof message === 'function' ? message([...shas]) : message);
    if (extra[0] === 'merge') {
      git('merge', '-q', '--no-ff', '-F', file, ...extra.slice(1));
    } else {
      git('commit', '-q', '--allow-empty', '-F', file, ...extra);
    }
    shas.push(git('rev-parse', 'HEAD').toString().trim());
    short.push(git('log', '-1', '--format=%h').toString().trim());
  };
  messages.forEach(message => commit(message));
  const check = (message: string) => {
    const file = path.join(repo, 'MSG');
    writeFileSync(file, message);
    return spawnSync('node', [SCRIPT, file], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  };
  return Object.assign(check, { shas, short, git, commit, bin });
}

// grillhouse-3uv.81: a commit naming a delivered ticket passes while that ticket is open in Beads
// (reopened after its delivery): it is a correction commit. A closed ticket is finished: the commit
// stays refused, with the same message. The fake `bd` answers `demo` to `config`, and to
// `bd show <id> --json` the JSON Beads 1.2.2 writes: an array of one object carrying its `status`.
function answerState(bin: string, id: string, status: string) {
  const out = JSON.stringify([{ id, title: 't', status }]);
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in config) echo demo; exit 0;; esac\nprintf '%s\\n' '${out}'\n`,
    { mode: 0o755 }
  );
}

describe('a correction commit on a reopened ticket (grillhouse-3uv.81)', () => {
  const check = history(['feat: first delivery (demo-1)']);

  it('criterion 1: a delivered ticket that is open, then in progress, lets its correction through', () => {
    for (const status of ['open', 'in_progress']) {
      answerState(check.bin, 'demo-1', status);
      const r = check('fix: the CI is green again (demo-1)');
      expect(r.status, `${status}: ${r.stderr}`).toBe(0);
    }
  });
  it('criterion 2: a delivered ticket that is closed is refused with the current message', () => {
    answerState(check.bin, 'demo-1', 'closed');
    const r = check('fix: lot 2 (demo-1)');
    expect(r.status).toBe(1);
    expect(r.stderr).toBe(
      `⛔ Le ticket demo-1 a déjà son commit (${check.short[0]}) : un ticket fait une seule livraison. Ce qui reste devient un ticket neuf sous demo-1 (bd create --parent demo-1).\n`
    );
  });
});

// grillhouse-3dr.3.2.2: a word of the title line shaped `<prefix>-…` is a ticket only when Beads
// knows it, as Jira's smart commits and GitHub's « fixes #12 » link a commit to an existing key
// alone. `isKnown(id)` says whether Beads knows the id.
describe('a word shaped like a ticket is a ticket only when Beads knows it (grillhouse-3dr.3.2.2)', () => {
  // A fake `bd` answering the prefix `demo` and, for `show`, the tickets `known` as Beads does (an
  // array of tickets), any other id as Beads does an unknown one (a JSON error, status 1).
  function beadsKnowing(bin: string, known: string[]) {
    const cas = known
      .map(id => `  ${id}) printf '%s\\n' '${JSON.stringify([{ id, status: 'closed' }])}';;`)
      .join('\n');
    writeFileSync(
      path.join(bin, 'bd'),
      [
        '#!/bin/sh',
        'if [ "$1" = config ]; then echo demo; exit 0; fi',
        'case "$2" in',
        cas,
        `  *) printf '%s\\n' '{"error": "no issues found matching the provided IDs"}'; exit 1;;`,
        'esac',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );
  }

  it('criterion 1: the hook takes a package named like a delivered word for no ticket', () => {
    const check = history(['fix(demo-essais): first (demo-1)']);
    beadsKnowing(check.bin, ['demo-1']);
    const r = check('fix(demo-essais): the trials (demo-2)');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toBe('');
  });
  it('criterion 2: the hook still refuses a known closed ticket delivered twice', () => {
    const check = history(['fix(demo-essais): first (demo-1)']);
    beadsKnowing(check.bin, ['demo-1']);
    const r = check('fix(demo-essais): lot 2 (demo-1)');
    expect(r.status).toBe(1);
    expect(r.stderr).toBe(
      `⛔ Le ticket demo-1 a déjà son commit (${check.short[0]}) : un ticket fait une seule livraison. Ce qui reste devient un ticket neuf sous demo-1 (bd create --parent demo-1).\n`
    );
  });
  it('criterion 3: without Beads answering, every word of the form counts, and the hook says so in one line', () => {
    const check = history(['fix(demo-essais): first (demo-1)']);
    writeFileSync(
      path.join(check.bin, 'bd'),
      '#!/bin/sh\nif [ "$1" = config ]; then echo demo; exit 0; fi\necho "Error: no beads database found" >&2\nexit 1\n',
      { mode: 0o755 }
    );
    const r = check('fix(demo-essais): the trials (demo-2)');
    expect(r.status).toBe(1);
    const lines = r.stderr.split('\n').filter(Boolean);
    expect(
      lines.filter(l => /Beads/.test(l) && /injoignable/.test(l)),
      r.stderr
    ).toHaveLength(1);
    expect(r.stderr).toMatch(/Le ticket demo-essais a déjà son commit/);
  });
});
