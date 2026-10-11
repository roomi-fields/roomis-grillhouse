#!/usr/bin/env node
// One ticket, one commit: refuses a commit message whose title line names a ticket an earlier
// commit already delivers. A second delivery for the same ticket is the sign of a ticket split into
// lots; its rest becomes new tickets, created under it (`--parent`). Run as the commit-msg hook
// (`.beads/hooks/commit-msg`), with the message file as argument.
//
// - A commit delivers the tickets its title line names; a ticket named only in a body (a
//   reference, a `Refs:` trailer) is not delivered.
//   The title line of a message is its first line that is neither blank nor a comment (a line
//   starting with `#`); in the history it is the first line of the commit message.
// - The tickets are the words `<prefix>-<id>` of the title line, the prefix read from Beads
//   (`bd config get issue_prefix`).
// - The children of one parent enter in one commit: that commit names them all once, and passes.
// - A message that names no ticket passes (the supervisor's commits of the frame).
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

// The refusal for this message, or null. `commitsOf(id)` gives the earlier commits delivering the id.
export function refusal(message, prefix, commitsOf) {
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

// The commits delivering `id`, over every branch: those whose message's first line names it. Git
// keeps the commits whose message quotes the id (`--grep`, bounded like an id) and renders their
// subject (`%s`, the first paragraph with its lines joined by a space); a subject naming the id
// makes a candidate. Git then renders each candidate's message cut two columns past the byte length
// of its subject (`%<(N,trunc)%B`), which keeps its first line whole; that line decides. The output
// grows with the commits quoting the id: by their first paragraphs, and by one byte per line of
// their bodies, since the cut keeps every line break.
function commitsDelivering(id, prefix) {
  const subjects = log(
    '--all',
    '-P',
    `--grep=(?<![\\w.-])${escape(id)}(?![\\w-]|\\.\\w)`,
    '--format=%h %s'
  )
    .split('\n')
    .filter(Boolean)
    .map(l => ({ hash: l.slice(0, l.indexOf(' ')), subject: l.slice(l.indexOf(' ') + 1) }))
    .filter(c => named(c.subject, prefix).includes(id));
  if (subjects.length === 0) {
    return [];
  }
  const width = Math.max(...subjects.map(c => Buffer.byteLength(c.subject))) + 2;
  return log(
    '--no-walk=unsorted',
    `--format=%x1e%h%n%<(${width},trunc)%B`,
    ...subjects.map(c => c.hash)
  )
    .split('\x1e')
    .filter(Boolean)
    .map(entry => entry.split('\n'))
    .filter(([, first = '']) => named(first, prefix).includes(id))
    .map(([hash]) => hash);
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
