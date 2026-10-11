#!/usr/bin/env node
// One ticket, one commit: refuses a commit message whose title line names a ticket an earlier
// commit already delivers. A second delivery for the same ticket is the sign of a ticket split into
// lots; its rest becomes new tickets, created under it (`--parent`). Run as the commit-msg hook
// (placed by `scripts/crochets.mjs`), with the message file as argument.
//
// - A commit delivers the tickets its title line names; a ticket named only in a body (a
//   reference, a `Refs:` trailer) is not delivered.
//   The title line of a message is its first line that is neither blank nor a comment (a line
//   starting with `#`); in the history it is the first line of the commit message.
// - The tickets are the words `<prefix>-<id>` of the title line, the prefix read from Beads
//   (`bd config get issue_prefix`).
// - The children of one parent enter in one commit: that commit names them all once, and passes.
// - A message that names no ticket passes (the supervisor's commits of the frame).
// - A reverting commit delivers nothing and passes: it carries both marks git writes, a title line
//   starting `Revert "` or `Reapply "` and a body line `This reverts commit <sha>` (the sha is the one
//   after `reverts commit`, not the one after `changes made to`). It withdraws the commit it names:
//   a delivery counts when no effective reverting commit, on any branch, names it, and a reverting
//   commit is effective when no effective reverting commit names it (a chain reads one link at a
//   time: a revert of a revert, which git writes `Reapply "…"`, makes the first delivery count again).
// - The commits counted are those of the branches (`refs/heads`) alone: no stash, no remote-tracking
//   reference, no tag. The branch `agent/<ticket>` of the ticket itself does not count for that
//   ticket: the integration commits there before the queue brings the commit onto main, which
//   then holds the one delivery; the branch of another ticket counts.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The title line of a message: its first line neither blank nor a comment, or ''.
function title(message) {
  return message.split('\n').find(l => l.trim() !== '' && !l.startsWith('#')) ?? '';
}

// The ticket ids a line names, without duplicates.
function named(line, prefix) {
  const re = new RegExp(`(?<![\\w.-])${escape(prefix)}-[a-z0-9]+(?:\\.[0-9]+)*(?![\\w-])`, 'g');
  return [...new Set(line.match(re) ?? [])];
}

// The ticket ids the title line of a message names, without duplicates.
export function tickets(message, prefix) {
  return named(title(message), prefix);
}

const REVERT_TITLE = /^(?:Revert|Reapply) "/;
const REVERTS_LINE = /^This reverts commit ([0-9a-f]{40})\b/m;

// The full sha a reverting message names, or null when the message is not a reverting commit (it
// lacks the title mark or the body mark).
function revertedBy(message) {
  if (!REVERT_TITLE.test(title(message))) {
    return null;
  }
  return REVERTS_LINE.exec(message)?.[1] ?? null;
}

// The refusal for this message, or null. `commitsOf(id)` gives the earlier commits delivering the id.
// A reverting message delivers nothing and passes.
export function refusal(message, prefix, commitsOf) {
  if (revertedBy(message) !== null) {
    return null;
  }
  for (const id of tickets(message, prefix)) {
    const earlier = commitsOf(id);
    if (earlier.length > 0) {
      return `Le ticket ${id} a déjà son commit (${earlier.join(', ')}) : un ticket fait une seule livraison. Ce qui reste devient un ticket neuf sous ${id} (bd create --parent ${id}).`;
    }
  }
  return null;
}

function prefixe() {
  try {
    return execFileSync('bd', ['config', 'get', 'issue_prefix'], {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return '';
  }
}

// `git log` with these arguments, its output as text.
function log(...args) {
  return execFileSync('git', ['log', ...args], { encoding: 'utf8' });
}

// The reverting commits of the history, over the branches, as a map from a commit's full sha to the
// full sha it reverts. Git keeps the commits whose message holds a `This reverts commit` line and a
// `Revert "` or `Reapply "` line; the output grows with those commits alone.
function revertingCommits() {
  const out = log(
    '--branches',
    '--all-match',
    '-P',
    '--grep=^This reverts commit [0-9a-f]{40}',
    '--grep=^(?:Revert|Reapply) "',
    '--format=%x1e%H%n%B'
  );
  const map = new Map();
  for (const entry of out.split('\x1e').filter(Boolean)) {
    const [hash, ...message] = entry.split('\n');
    const target = revertedBy(message.join('\n'));
    if (target !== null) {
      map.set(hash, target);
    }
  }
  return map;
}

// The commits among `candidates` (`{ full, short }`) that no effective reverting commit names, and
// that are not reverting commits themselves. A reverting commit is effective when no effective
// reverting commit names it.
function withoutWithdrawn(candidates) {
  const reverts = revertingCommits();
  const namedBy = new Map();
  for (const [hash, target] of reverts) {
    namedBy.set(target, [...(namedBy.get(target) ?? []), hash]);
  }
  const memo = new Map();
  const withdrawn = target => (namedBy.get(target) ?? []).some(effective);
  const effective = hash => {
    if (!memo.has(hash)) {
      memo.set(hash, !withdrawn(hash));
    }
    return memo.get(hash);
  };
  return candidates.filter(c => !reverts.has(c.full) && !withdrawn(c.full));
}

// The commits delivering `id`, over every branch but its own `agent/<id>`: those whose message's first line names it, less
// the reverting commits and the deliveries they withdraw (`withoutWithdrawn`). Git
// keeps the commits whose message quotes the id (`--grep`, bounded like an id) and renders their
// subject (`%s`, the first paragraph with its lines joined by a space); a subject naming the id
// makes a candidate. Git then renders each candidate's message cut two columns past the byte length
// of its subject (`%<(N,trunc)%B`), which keeps its first line whole; that line decides. The output
// grows with the commits quoting the id: by their first paragraphs, and by one byte per line of
// their bodies, since the cut keeps every line break.
function commitsDelivering(id, prefix) {
  const subjects = log(
    `--exclude=agent/${id}`,
    '--branches',
    '-P',
    `--grep=(?<![\\w.-])${escape(id)}(?![\\w-]|\\.\\w)`,
    '--format=%H %h %s'
  )
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const [full, short, ...subject] = l.split(' ');
      return { hash: short, full, subject: subject.join(' ') };
    })
    .filter(c => named(c.subject, prefix).includes(id));
  if (subjects.length === 0) {
    return [];
  }
  const width = Math.max(...subjects.map(c => Buffer.byteLength(c.subject))) + 2;
  const delivering = log(
    '--no-walk=unsorted',
    `--format=%x1e%h%n%<(${width},trunc)%B`,
    ...subjects.map(c => c.hash)
  )
    .split('\x1e')
    .filter(Boolean)
    .map(entry => entry.split('\n'))
    .filter(([, first = '']) => named(first, prefix).includes(id))
    .map(([hash]) => hash);
  return withoutWithdrawn(
    delivering.map(short => ({ short, full: subjects.find(c => c.hash === short).full }))
  ).map(c => c.short);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prefix = prefixe();
  if (!prefix || prefix.includes(' ')) {
    process.exit(0);
  }
  const message = readFileSync(process.argv[2], 'utf8');
  const reason = refusal(message, prefix, id => commitsDelivering(id, prefix));
  if (reason) {
    process.stderr.write(`⛔ ${reason}\n`);
    process.exit(1);
  }
}
