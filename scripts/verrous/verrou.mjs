#!/usr/bin/env node
// The write lock of a role agent: a PreToolUse hook declared in the agent's frontmatter
// (`node scripts/verrous/verrou.mjs <role>`). It reads the hook's JSON on stdin and refuses a
// file write the role does not own, with exit code 2 and its reason on stderr.
//
// - A path under the system temp directory (the session scratchpad) is always writable.
// - testeur writes the files it owns (`isTesterFile`): test files, and every file of a package
//   of the shared test material.
// - The repository root is that of the git repository holding the written file, whatever the
//   agent's working directory; a file outside any repository is read against the working directory.
// - developpeur writes none of the testeur's files, and no other file until its ticket's
//   description holds a "## Architecture" section. The ticket is the "TON TICKET : <id>" line of the agent's
//   launch prompt, read from its transcript.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matieres } from '../consommateurs.mjs';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

export function isTestFile(file) {
  const parts = file.split(/[\\/]/);
  const base = parts[parts.length - 1];
  return (
    parts.slice(0, -1).some(d => d === 'test' || d === 'tests' || d === '__tests__') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(base)
  );
}

// True when <file>, absolute or relative to the repository root <racine>, is written by the
// testeur: a test file, or a file of a package of the shared test material (a component of
// <racine> whose package exports `./test-fixtures`, `matieres` of `scripts/consommateurs.mjs`).
// The one rule of ownership, read by the locks of both roles and by the integration's lots.
export function isTesterFile(file, racine) {
  const abs = path.resolve(racine, file);
  if (isTestFile(path.relative(path.resolve(racine), abs))) {
    return true;
  }
  return matieres(racine).some(m => isInside(abs, m.dir));
}

// True when <file> lies strictly under the directory <dir>.
function isInside(file, dir) {
  const rel = path.relative(path.resolve(dir), file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const isScratch = (file, tmp = tmpdir()) => isInside(file, tmp);

// The root of the git repository (or worktree) that holds the absolute path <file>, read from its
// nearest existing directory; null when no repository holds it.
function racineDe(file) {
  let dir = path.dirname(file);
  while (!existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return null;
  }
}

// The ticket id of the launch prompt. A sub-agent's prompt opens its own transcript, next to the
// session's; an agent launched as its own session (`claude --agent`) has it in the session's.
function ticketOf(input) {
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

function ticketDescription(id, cwd) {
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
  const cwd = input.cwd ?? process.cwd();
  const file = path.resolve(cwd, raw);
  if (isScratch(file, tmp)) {
    return null;
  }
  const racine = racineDe(file) ?? cwd;
  const testeur = isTesterFile(file, racine);

  if (role === 'testeur') {
    return testeur
      ? null
      : `Le testeur écrit seulement des fichiers de test et la matière de test partagée ; ${raw} n'est ni l'un ni l'autre. Le code revient au développeur.`;
  }
  if (role === 'developpeur') {
    if (testeur) {
      return isTestFile(path.relative(path.resolve(racine), file))
        ? `Les tests appartiennent au testeur : ${raw} est un fichier de test. Un test faux se signale au superviseur.`
        : `La matière de test partagée appartient au testeur : ${raw} en fait partie. Un besoin de matière se signale au superviseur.`;
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
