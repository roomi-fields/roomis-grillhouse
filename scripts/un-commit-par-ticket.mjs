#!/usr/bin/env node
// One ticket, one commit: refuses a commit message that names a ticket an earlier commit already
// names. A second delivery for the same ticket is the sign of a ticket split into lots; its rest
// becomes new tickets, linked by `discovered-from`. Run as the commit-msg hook
// (`.beads/hooks/commit-msg`), with the message file as argument.
//
// - The tickets are the words `<prefix>-<id>` of the message, the prefix read from Beads
//   (`bd config get issue_prefix`).
// - The children of one parent enter in one commit: that commit names them all once, and passes.
// - A message that names no ticket passes (the supervisor's commits of the frame).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The ticket ids a message names, without duplicates.
export function tickets(message, prefix) {
  const re = new RegExp(`(?<![\\w.-])${escape(prefix)}-[a-z0-9]+(?:\\.[0-9]+)*(?![\\w-])`, 'g');
  return [...new Set(message.match(re) ?? [])];
}

// The refusal for this message, or null. `commitsOf(id)` gives the earlier commits naming the id.
export function refusal(message, prefix, commitsOf) {
  for (const id of tickets(message, prefix)) {
    const earlier = commitsOf(id);
    if (earlier.length > 0) {
      return `Le ticket ${id} a déjà son commit (${earlier.join(', ')}) : un ticket fait une seule livraison. Ce qui reste devient un ticket neuf, lié par discovered-from:${id}.`;
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

function commitsNaming(id) {
  const out = execFileSync(
    'git',
    ['log', '--all', '--format=%h', '-P', `--grep=(?<![\\w.-])${escape(id)}(?![\\w-]|\\.\\w)`],
    { encoding: 'utf8' }
  );
  return out.split('\n').filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prefix = prefixe();
  if (!prefix || prefix.includes(' ')) process.exit(0);
  const message = readFileSync(process.argv[2], 'utf8')
    .split('\n')
    .filter(l => !l.startsWith('#'))
    .join('\n');
  const reason = refusal(message, prefix, commitsNaming);
  if (reason) {
    process.stderr.write(`⛔ ${reason}\n`);
    process.exit(1);
  }
}
