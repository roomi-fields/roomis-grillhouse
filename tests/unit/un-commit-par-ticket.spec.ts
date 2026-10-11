import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { refusal, tickets } from '../../scripts/un-commit-par-ticket.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'un-commit-par-ticket-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/un-commit-par-ticket.mjs');

describe('tickets', () => {
  it('finds the ticket ids of a message, once each', () => {
    expect(tickets('feat: x (demo-a1b, demo-a1b.2)\n\nCloses demo-a1b.', 'demo')).toEqual([
      'demo-a1b',
      'demo-a1b.2',
    ]);
  });
  it('takes no word that only starts like an id', () => {
    expect(tickets('fix: a fast-forward in xdemo-1 and demo-', 'demo')).toEqual([]);
  });
});

describe('refusal', () => {
  const history: Record<string, string[]> = { 'demo-1': ['abc1234'] };
  const commitsOf = (id: string) => history[id] ?? [];

  it('refuses a ticket that already has its commit', () => {
    expect(refusal('fix: more of demo-1', 'demo', commitsOf)).toMatch(
      /demo-1 a déjà son commit \(abc1234\).*sous demo-1 \(bd create --parent demo-1\)/
    );
  });
  it('lets the first commit of a ticket through', () => {
    expect(refusal('feat: demo-2', 'demo', commitsOf)).toBeNull();
  });
  it('lets a message without a ticket through', () => {
    expect(refusal('docs: the frame', 'demo', commitsOf)).toBeNull();
  });
});

// A trial repository whose history holds `messages`, one commit each (`git commit -F`, so a message
// keeps its lines), and a fake `bd` answering the prefix `demo`. `check` runs the hook on a message.
function history(messages: string[]) {
  const repo = mkdtempSync(path.join(ESSAIS, 'commit-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'bd'), '#!/bin/sh\necho demo\n', { mode: 0o755 });
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
  git('init', '-q');
  messages.forEach((message, i) => {
    const file = path.join(ESSAIS, `${path.basename(repo)}-${i}.msg`);
    writeFileSync(file, message);
    git('commit', '-q', '--allow-empty', '-F', file);
  });
  return (message: string) => {
    const file = path.join(repo, 'MSG');
    writeFileSync(file, message);
    return spawnSync('node', [SCRIPT, file], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  };
}

describe('the hook on a real history', () => {
  const check = history([
    'feat: first delivery (demo-1)',
    'feat: children of demo-9 (demo-9.1, demo-9.2)',
    'feat: demo-20, then demo-5.1.',
  ]);

  it('refuses a second commit for a ticket', () => {
    const r = check('fix: lot 2 of demo-1');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/une seule livraison/);
  });
  it('does not take demo-10 for demo-1', () => {
    expect(check('feat: demo-10').status).toBe(0);
  });
  it('does not take an earlier demo-20 for demo-2, nor a child for its parent', () => {
    expect(check('feat: demo-2').status).toBe(0);
    expect(check('feat: demo-5').status).toBe(0);
  });
  it('does not take a child for its parent', () => {
    expect(check('feat: demo-1.1').status).toBe(0);
  });
  it('refuses a child already entered with its family', () => {
    expect(check('fix: demo-9.2 again').status).toBe(1);
  });
  it('ignores the comment lines git adds to the message', () => {
    expect(check('feat: demo-3\n# demo-1 is mentioned in a comment').status).toBe(0);
  });
});

// grillhouse-3uv.57: a commit delivers the tickets its title line names; a ticket named in the body
// only is a reference, not a delivery.
describe('the title line names the delivery (grillhouse-3uv.57)', () => {
  const check = history([
    // The witness (1fe333b): the title delivers demo-53, the body refers to demo-51.
    'docs: the site manager pushes where the policy says (demo-53)\n\n' +
      'The push policy is declared once (demo-51).\n',
    // A body that refers to a child, and a reference in a trailer.
    'feat: the parent (demo-30)\n\nIts child demo-31.2 comes later.\n\nRefs: demo-32\n',
    // A ticket in the title and the body.
    'feat: both places (demo-40)\n\nCloses demo-40.\n',
    // A family in the title.
    'feat: children of demo-45 (demo-45.1, demo-45.2)\n\nThe body names demo-46.\n',
    // A first paragraph on two lines: the title is the first line only.
    'feat: two-line head (demo-60)\ndemo-61 sits on the second line\n',
  ]);

  // Criterion 1
  it('criterion 1: a commit whose title line names the ticket is its delivery', () => {
    const r = check('fix: lot 2 (demo-53)');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/demo-53 a déjà son commit/);
  });
  it('criterion 1: a ticket named in the title and the body is delivered', () => {
    expect(check('fix: lot 2 (demo-40)').status).toBe(1);
  });
  it('criterion 1: each child a title line names is delivered', () => {
    expect(check('fix: demo-45.1 again').status).toBe(1);
    expect(check('fix: demo-45.2 again').status).toBe(1);
  });

  // Criterion 2
  it('criterion 2: a ticket only the body of an earlier commit names enters (the 3uv.51 witness)', () => {
    expect(check('feat: the night pushes its green commit (demo-51)').status).toBe(0);
  });
  it('criterion 2: a child only a body names enters', () => {
    expect(check('feat: the child (demo-31.2)').status).toBe(0);
  });
  it('criterion 2: a ticket only a body trailer names enters', () => {
    expect(check('feat: referenced before (demo-32)').status).toBe(0);
  });
  it('criterion 2: a ticket the body of a family commit names enters', () => {
    expect(check('feat: demo-46').status).toBe(0);
  });

  // Criterion 3
  it('criterion 3: a second title naming a delivered ticket stays refused, body or not', () => {
    expect(check('fix: lot 2 (demo-53)\n\nThe rest of the work.\n').status).toBe(1);
  });
  it('criterion 3: a title naming a new and a delivered ticket stays refused', () => {
    const r = check('feat: demo-70 and demo-30');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/demo-30 a déjà son commit/);
  });

  // Criterion 5
  it('criterion 5: a message whose body only names a delivered ticket passes', () => {
    expect(check('feat: the next step (demo-71)\n\nFollows demo-53.\n').status).toBe(0);
  });
  it('criterion 5: a body naming a delivered child, or a trailer naming a delivered ticket, passes', () => {
    expect(check('feat: more (demo-72)\n\nAfter demo-45.1.\n').status).toBe(0);
    expect(check('docs: the frame\n\nRefs: demo-40\n').status).toBe(0);
  });

  // Criterion 6, the checked message
  it('criterion 6: leading blank lines do not hide the title line', () => {
    expect(check('\n\nfix: lot 2 (demo-53)\n').status).toBe(1);
  });
  it('criterion 6: leading whitespace-only lines do not hide the title line', () => {
    expect(check('   \n\t\nfix: lot 2 (demo-53)\n').status).toBe(1);
  });
  it('criterion 6: comment lines before the title line do not hide it', () => {
    expect(check('# Please enter the commit message.\n#\n\nfix: lot 2 (demo-53)\n').status).toBe(1);
  });
  it('criterion 6: a comment before the title naming a delivered ticket is not the title', () => {
    expect(check('# demo-53\nfeat: demo-73\n').status).toBe(0);
  });
  it('criterion 6: past comments and blank lines, the title is the first line, not the rest', () => {
    expect(check('# comment\n\ndocs: the frame\n\nAbout demo-53.\n').status).toBe(0);
  });
  it('criterion 6: a second line without a blank line before it is not the title', () => {
    expect(check('docs: the frame\ndemo-53 on the second line\n').status).toBe(0);
  });
  it('criterion 6: a message of comments and blank lines only passes', () => {
    expect(check('\n# demo-53\n\n').status).toBe(0);
  });

  // Criterion 6, the history
  it('criterion 6: in the history, the title line is the first line of the message', () => {
    expect(check('feat: demo-61').status).toBe(0);
    expect(check('fix: lot 2 (demo-60)').status).toBe(1);
  });
});

// grillhouse-3uv.57, criteria 1 to 3 on a long history: the hook reads the commits that name a
// ticket, whatever the size of the other messages. One commit carries a body of more than 1 MB,
// whose lines refer to the delivered ticket.
describe('the hook on a history whose messages pass 1 MB (grillhouse-3uv.57)', () => {
  const body = 'Refers to demo-1 again.\n'.repeat(50_000); // 1.2 MB
  const check = history([
    'feat: first delivery (demo-1)',
    `docs: a long note (demo-80)\n\n${body}`,
  ]);

  it('criteria 1 to 3: a message without a ticket and a new ticket pass, a second delivery stays refused', () => {
    expect(body.length).toBeGreaterThan(1024 * 1024);
    const frame = check('docs: the frame');
    expect(frame.status, frame.stderr.slice(0, 300)).toBe(0);
    expect(check('feat: a new ticket (demo-2)').status).toBe(0);
    const second = check('fix: lot 2 (demo-1)');
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(/demo-1 a déjà son commit/);
    expect(check('fix: lot 2 (demo-80)').status).toBe(1);
  });
});

// grillhouse-3uv.57, criteria 1 to 3 on a history of many commits: the hook reads the deliveries
// of the tickets the checked title names, so its reading does not grow with the number of commits
// that name a ticket. 1200 short commits, each delivering its own ticket, written in one
// `git fast-import`.
describe('the hook on a history of more than 1100 commits naming a ticket (grillhouse-3uv.57)', () => {
  const COMMITS = 1200;
  const repo = mkdtempSync(path.join(ESSAIS, 'many-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'bd'), '#!/bin/sh\necho demo\n', { mode: 0o755 });
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
  const stream = Array.from({ length: COMMITS }, (_, i) => {
    const message = `feat: short title (demo-${i + 1})\n`;
    return (
      `commit refs/heads/main\ncommitter t <t@t> ${1_700_000_000 + i} +0000\n` +
      `data ${Buffer.byteLength(message)}\n${message}\n`
    );
  }).join('');
  execFileSync('git', ['-C', repo, 'fast-import', '--quiet'], { input: stream });
  const check = (message: string) => {
    const file = path.join(repo, 'MSG');
    writeFileSync(file, message);
    return spawnSync('node', [SCRIPT, file], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  };

  it('criteria 1 to 3: a message without a ticket and a new ticket pass, a second delivery stays refused', () => {
    const count = execFileSync('git', ['-C', repo, 'rev-list', '--count', 'main'], {
      encoding: 'utf8',
    });
    expect(Number(count)).toBe(COMMITS);
    const frame = check('docs: the frame');
    expect(frame.status, frame.stderr.slice(0, 300)).toBe(0);
    const fresh = check(`feat: a new ticket (demo-${COMMITS + 1})`);
    expect(fresh.status, fresh.stderr.slice(0, 300)).toBe(0);
    const second = check('fix: lot 2 (demo-700)');
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(/demo-700 a déjà son commit/);
  });
});
