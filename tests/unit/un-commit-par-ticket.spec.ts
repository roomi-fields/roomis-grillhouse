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

// grillhouse-3uv.57.2: a revert commit carries both marks git writes, the title line `Revert "…"` or
// `Reapply "…"` and the body line `This reverts commit <sha>.`; it delivers nothing, and the commit
// whose sha it names no longer counts. The messages are those git 2.43 writes (`git revert`).
const reverting = (title: string, sha: string) => `${title}\n\nThis reverts commit ${sha}.\n`;

describe('a revert delivers nothing and withdraws the commit it names (grillhouse-3uv.57.2)', () => {
  // Criterion 1
  it('criterion 1: a revert commit passes, even when its title line names a delivered ticket', () => {
    const check = history(['fix: y (demo-1)']);
    const r = check(reverting('Revert "fix: y (demo-1)"', check.shas[0]));
    expect(r.status, r.stderr).toBe(0);
  });
  it('criterion 1: a Revert title line without the body line is a delivery like any other', () => {
    const check = history(['fix: y (demo-1)']);
    expect(check('Revert "fix: y (demo-1)"\n\nUndo it.\n').status).toBe(1);
  });
  it('criterion 1: the body line under a title line that is not a revert is a delivery like any other', () => {
    const check = history(['fix: y (demo-1)']);
    expect(check(reverting('fix: undo y (demo-1)', check.shas[0])).status).toBe(1);
  });

  // Criterion 2
  it('criterion 2: a reverted delivery no longer counts, the ticket delivers again', () => {
    const check = history(['fix: y (demo-1)', ([o]) => reverting('Revert "fix: y (demo-1)"', o)]);
    const r = check('fix: y again (demo-1)');
    expect(r.status, r.stderr).toBe(0);
  });
  it('criterion 2: the sha a revert names decides which delivery it withdraws, not its title line', () => {
    const check = history([
      'fix: y (demo-1)',
      'feat: z (demo-2)',
      ([, z]) => reverting('Revert "fix: y (demo-1)"', z),
    ]);
    const kept = check('fix: y again (demo-1)');
    expect(kept.status).toBe(1);
    expect(kept.stderr).toMatch(new RegExp(`demo-1 a déjà son commit \\(${check.short[0]}\\)`));
    const withdrawn = check('feat: z again (demo-2)');
    expect(withdrawn.status, withdrawn.stderr).toBe(0);
  });
  it('criterion 2: a commit of the history carrying one mark only withdraws nothing', () => {
    const titleOnly = history(['fix: y (demo-1)', 'Revert "fix: y (demo-1)"\n\nUndo it.\n']);
    expect(titleOnly('fix: y again (demo-1)').status).toBe(1);
    const bodyOnly = history(['fix: y (demo-1)', ([o]) => reverting('feat: w (demo-3)', o)]);
    expect(bodyOnly('fix: y again (demo-1)').status).toBe(1);
  });
  // One effective revert naming the sha withdraws the delivery, however many other reverts name it
  // and whatever their place in the history: here the first and the last of three are reapplied.
  it('criterion 2: one effective revert among several of the same commit withdraws it', () => {
    const check = history([
      'fix: y (demo-1)',
      ([o]) => reverting('Revert "fix: y (demo-1)"', o),
      ([o]) => reverting('Revert "fix: y (demo-1)"', o),
      ([o]) => reverting('Revert "fix: y (demo-1)"', o),
      ([, r1]) => reverting('Reapply "fix: y (demo-1)"', r1),
      ([, , , r3]) => reverting('Reapply "fix: y (demo-1)"', r3),
    ]);
    expect(new Set(check.shas.slice(1, 4)).size).toBe(3);
    const r = check('fix: y again (demo-1)');
    expect(r.status, r.stderr).toBe(0);
  });
  // The body mark is the line git writes: « This reverts commit <sha> » quoted inside a line is not it.
  it('criterion 2: « This reverts commit <sha> » inside a line withdraws nothing', () => {
    const quoted = history([
      'fix: y (demo-1)',
      ([o]) => `Revert "chore: x"\n\nThe note says This reverts commit ${o}.\n`,
    ]);
    const kept = quoted('fix: y again (demo-1)');
    expect(kept.status).toBe(1);
    expect(kept.stderr).toMatch(new RegExp(`demo-1 a déjà son commit \\(${quoted.short[0]}\\)`));
    // The quote comes before the body line of a real revert of another commit z: that line decides.
    const before = history([
      'fix: y (demo-1)',
      'chore: z',
      ([o, z]) =>
        `Revert "chore: z"\n\nThe note says This reverts commit ${o}.\nThis reverts commit ${z}.\n`,
    ]);
    const still = before('fix: y again (demo-1)');
    expect(still.status).toBe(1);
    expect(still.stderr).toMatch(new RegExp(`demo-1 a déjà son commit \\(${before.short[0]}\\)`));
  });

  // Criterion 3
  it('criterion 3: the revert of a revert (Reapply) makes the original delivery count again', () => {
    const check = history([
      'fix: y (demo-1)',
      ([o]) => reverting('Revert "fix: y (demo-1)"', o),
      ([, r]) => reverting('Reapply "fix: y (demo-1)"', r),
    ]);
    const second = check('fix: y again (demo-1)');
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(new RegExp(`demo-1 a déjà son commit \\(${check.short[0]}\\)`));
  });
  it('criterion 3: the revert of a revert titled Revert "Revert …" makes the original count again', () => {
    const check = history([
      'fix: y (demo-1)',
      ([o]) => reverting('Revert "fix: y (demo-1)"', o),
      ([, r]) => reverting('Revert "Revert "fix: y (demo-1)""', r),
    ]);
    const second = check('fix: y again (demo-1)');
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(new RegExp(`demo-1 a déjà son commit \\(${check.short[0]}\\)`));
  });

  // Criterion 5
  it('criterion 5: a Reapply commit passes, even when its title line names a delivered ticket', () => {
    const check = history(['fix: y (demo-1)', ([o]) => reverting('Revert "fix: y (demo-1)"', o)]);
    const r = check(reverting('Reapply "fix: y (demo-1)"', check.shas[1]));
    expect(r.status, r.stderr).toBe(0);
  });
  it('criterion 5: a reverted Reapply delivers nothing, the original stays withdrawn (three reverts)', () => {
    const check = history([
      'fix: y (demo-1)',
      ([o]) => reverting('Revert "fix: y (demo-1)"', o),
      ([, r]) => reverting('Reapply "fix: y (demo-1)"', r),
      ([, , a]) => reverting('Revert "Reapply "fix: y (demo-1)""', a),
    ]);
    const r = check('fix: y again (demo-1)');
    expect(r.status, r.stderr).toBe(0);
  });

  // Criterion 6
  it('criterion 6: a revert on another branch withdraws the delivery, the ticket delivers again', () => {
    const check = history(['fix: y (demo-1)']);
    const main = check.git('rev-parse', '--abbrev-ref', 'HEAD').toString().trim();
    check.git('checkout', '-q', '-b', 'other');
    check.commit(([o]) => reverting('Revert "fix: y (demo-1)"', o));
    check.git('checkout', '-q', main);
    const r = check('fix: y again (demo-1)');
    expect(r.status, r.stderr).toBe(0);
  });
  it('criterion 6: a delivery on another branch is withdrawn by its revert on the current one', () => {
    const check = history(['chore: start']);
    const main = check.git('rev-parse', '--abbrev-ref', 'HEAD').toString().trim();
    check.git('checkout', '-q', '-b', 'other');
    check.commit('fix: y (demo-1)');
    check.git('checkout', '-q', main);
    check.commit(([, o]) => reverting('Revert "fix: y (demo-1)"', o));
    const r = check('fix: y again (demo-1)');
    expect(r.status, r.stderr).toBe(0);
  });

  // Criterion 7: the message git 2.43 writes for `git revert -m 1` of a merge X whose first parent
  // is Y; its body line is cut after « reversing ».
  const revertingMerge = (title: string, x: string, y: string) =>
    `${title}\n\nThis reverts commit ${x}, reversing\nchanges made to ${y}.\n`;
  const merged = () => {
    const check = history(['fix: y (demo-2)']);
    const main = check.git('rev-parse', '--abbrev-ref', 'HEAD').toString().trim();
    check.git('checkout', '-q', '-b', 'feature');
    check.commit('chore: work');
    check.git('checkout', '-q', main);
    check.commit('feat: merge (demo-1)', 'merge', 'feature');
    return check;
  };
  it('criterion 7: the revert of a merge passes, even when its title line names a delivered ticket', () => {
    const check = merged();
    const [y, , x] = check.shas;
    const r = check(revertingMerge('Revert "feat: merge (demo-1)"', x, y));
    expect(r.status, r.stderr).toBe(0);
  });
  it('criterion 7: the revert of a merge withdraws the merge X and it alone, its parent Y still counts', () => {
    const check = merged();
    check.commit(([y, , x]) => revertingMerge('Revert "feat: merge (demo-1)"', x, y));
    const withdrawn = check('feat: merge again (demo-1)');
    expect(withdrawn.status, withdrawn.stderr).toBe(0);
    const kept = check('fix: y again (demo-2)');
    expect(kept.status).toBe(1);
    expect(kept.stderr).toMatch(new RegExp(`demo-2 a déjà son commit \\(${check.short[0]}\\)`));
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

// grillhouse-3uv.63 critères 9 et 13: the integration commits a ticket on its branch agent/<ticket>,
// and the queue brings that commit onto main. The rule counts main and the branches of the other
// tickets (refs/heads), never the ticket's own branch, nor a stash (refs/stash).
describe('the rule counts the branches, not the ticket branch nor a stash (grillhouse-3uv.63)', () => {
  // A history on main, then <id>'s branch carrying <message>, main checked out again.
  const avecBranche = (id: string, message: string) => {
    const check = history(['feat: the frame']);
    check.git('checkout', '-q', '-b', `agent/${id}`);
    check.commit(message);
    check.git('checkout', '-q', '-');
    return check;
  };

  it('critère 9: the entry on main of a ticket whose branch carries its commit passes', () => {
    const check = avecBranche('demo-1', 'feat: lot (demo-1)');
    const r = check('feat: lot (demo-1)');
    expect(r.status, r.stderr).toBe(0);
  });
  it('critère 9: the same for a child ticket on its own branch', () => {
    const check = avecBranche('demo-9.2', 'feat: lot (demo-9.2)');
    expect(check('feat: lot (demo-9.2)').status).toBe(0);
  });
  it('critère 9 (gardé): a second delivering commit on main is still refused', () => {
    const check = avecBranche('demo-1', 'feat: lot (demo-1)');
    check.commit('feat: lot (demo-1)');
    const r = check('fix: more (demo-1)');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/demo-1 a déjà son commit/);
  });
  it("critère 9 (gardé): a delivering commit on another ticket's branch is still counted", () => {
    const check = avecBranche('demo-2', 'feat: lot (demo-1)');
    const r = check('feat: lot (demo-1)');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/demo-1 a déjà son commit/);
  });
  it('critère 13: a stash made on the branch of a ticket does not deliver it', () => {
    const check = history(['feat: the frame']);
    check.git('checkout', '-q', '-b', 'agent/demo-1');
    writeFileSync(
      path.join(String(check.git('rev-parse', '--show-toplevel')).trim(), 'travail.txt'),
      'x\n'
    );
    check.git('add', 'travail.txt');
    check.git('stash', 'push', '-q', '-m', 'autostash');
    expect(String(check.git('log', '-1', '--format=%s', 'refs/stash'))).toMatch(
      /^On agent\/demo-1: autostash/
    );
    check.git('checkout', '-q', '-');
    check.git('branch', '-q', '-D', 'agent/demo-1');
    const r = check('feat: lot (demo-1)');
    expect(r.status, r.stderr).toBe(0);
  });
});

// grillhouse-3uv.56 critère 6: a commit of git's stash (refs/stash: a copy's autostash,
// « On agent/<ticket>: autostash », and its index commit) delivers nothing. Witness: the
// integration of 3uv.64, refused by « déjà son commit (842c901, b75a3f1) », the stash left by an
// advance of lancer.sh in conflict (`git merge --ff-only --autostash`).
describe('grillhouse-3uv.56 critère 6 — the autostash of a copy delivers nothing', () => {
  it('critère 6: after an advance in conflict leaves the autostash, the commit of the ticket passes, from the copy and from main', () => {
    const check = history(['feat: the frame']);
    const racine = String(check.git('rev-parse', '--show-toplevel')).trim();
    writeFileSync(path.join(racine, 'a.txt'), 'base\n');
    check.git('add', 'a.txt');
    check.commit('chore: a');
    const copie = `${racine}-copie`;
    check.git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
    writeFileSync(path.join(copie, 'a.txt'), 'travail\n');
    writeFileSync(path.join(racine, 'a.txt'), 'main\n');
    check.git('commit', '-qam', 'feat: other (demo-2)');
    spawnSync('git', ['-C', copie, 'merge', '-q', '--ff-only', '--autostash', 'main'], {
      encoding: 'utf8',
    });
    expect(String(check.git('log', '-1', '--format=%s', 'refs/stash'))).toMatch(
      /^On agent\/demo-1: autostash/
    );
    expect(String(check.git('log', '-1', '--format=%s', 'refs/stash^2'))).toMatch(
      /^index on agent\/demo-1: /
    );
    const message = path.join(copie, 'MSG');
    writeFileSync(message, 'feat: lot (demo-1)\n');
    for (const cwd of [copie, racine]) {
      const r = spawnSync('node', [SCRIPT, message], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${check.bin}:${process.env.PATH}` },
      });
      expect(r.status, `${cwd}: ${r.stderr}`).toBe(0);
    }
  });
});

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
