#!/usr/bin/env node
// The write lock of a role agent: a PreToolUse hook declared in the agent's frontmatter
// (`node scripts/verrous/verrou.mjs <role>`). It reads the hook's JSON on stdin and refuses a
// file write the role does not own, with exit code 2 and its reason on stderr.
//
// - A path under the system temp directory (the session scratchpad) is always writable.
// - testeur writes test files only.
// - developpeur writes no test file, and no other file until its ticket's description holds
//   a "## Architecture" section. The ticket is the "TON TICKET : <id>" line of the agent's
//   launch prompt, read from its transcript.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

export function isTestFile(file) {
  const parts = file.split(/[\\/]/);
  const base = parts[parts.length - 1];
  return (
    parts.slice(0, -1).some(d => d === 'test' || d === 'tests' || d === '__tests__') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(base)
  );
}

export function isScratch(file, tmp = tmpdir()) {
  const rel = path.relative(path.resolve(tmp), file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// The ticket id of the launch prompt. A sub-agent's prompt opens its own transcript, next to the
// session's; an agent launched as its own session (`claude --agent`) has it in the session's.
export function ticketOf(input) {
  if (!input.transcript_path) {
    return null;
  }
  const transcript = input.agent_id
    ? path.join(
        input.transcript_path.replace(/\.jsonl$/, ''),
        'subagents',
        `agent-${input.agent_id}.jsonl`
      )
    : input.transcript_path;
  let first;
  try {
    first = readFileSync(transcript, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l))
      .find(e => e.type === 'user');
  } catch {
    return null;
  }
  const content = first?.message?.content;
  const text = Array.isArray(content) ? content.map(c => c.text ?? '').join('\n') : content;
  const m = /TON TICKET\s*:\s*([A-Za-z0-9_.-]+)/.exec(text ?? '');
  return m ? m[1] : null;
}

export function ticketDescription(id, cwd) {
  try {
    const out = execFileSync('bd', ['show', id, '--json'], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return JSON.parse(out)[0]?.description ?? null;
  } catch {
    return null;
  }
}

// The refusal reason for this hook input, or null when the write is allowed.
export function refusal(role, input, { tmp = tmpdir(), describe = ticketDescription } = {}) {
  if (!WRITE_TOOLS.has(input.tool_name)) {
    return null;
  }
  const raw = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!raw) {
    return null;
  }
  const file = path.resolve(input.cwd ?? process.cwd(), raw);
  if (isScratch(file, tmp)) {
    return null;
  }
  const test = isTestFile(file);

  if (role === 'testeur') {
    return test
      ? null
      : `Le testeur écrit seulement des fichiers de test ; ${raw} n'en est pas un. Le code revient au développeur.`;
  }
  if (role === 'developpeur') {
    if (test) {
      return `Les tests appartiennent au testeur : ${raw} est un fichier de test. Un test faux se signale au superviseur.`;
    }
    const id = ticketOf(input);
    if (!id) {
      return 'Ton ticket est introuvable : ton message de lancement porte « TON TICKET : <id> ».';
    }
    const description = describe(id, input.cwd);
    if (description === null) {
      return `Le ticket ${id} est illisible par bd.`;
    }
    if (!/^##\s+Architecture\b/m.test(description)) {
      return `Le ticket ${id} n'a pas sa section « ## Architecture » : le code attend l'architecture. Rends la question au superviseur.`;
    }
    return null;
  }
  return `Rôle inconnu du verrou : ${role}.`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const reason = refusal(process.argv[2], input);
  if (reason) {
    process.stderr.write(reason + '\n');
    process.exit(2);
  }
}
