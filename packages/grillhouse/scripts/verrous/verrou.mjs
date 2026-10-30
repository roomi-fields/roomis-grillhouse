#!/usr/bin/env node
// The write lock of a role agent: a PreToolUse hook declared in the settings of its session
// (scripts/droits.mjs: `npx grillhouse verrou <role>`). It reads the hook's JSON on stdin and refuses a
// file write the role does not own, with exit code 2 and its reason on stderr.
//
// - A path under the system temp directory (the session scratchpad) is always writable.
// - testwriter writes the files it owns, those the rule of a test file of the module of the
//   project's language classes (`estUnTest`, scripts/jointure.d.ts, scripts/langages.mjs): its test
//   files, the helpers of its folders of tests, and every file of a package of the shared test
//   material.
// - The repository root is that of the git repository holding the written file, whatever the
//   agent's working directory; a file outside any repository is read against the working directory.
//   A project that declares no language (`grillhouse.langages`) is refused, exit code 2, the
//   update named: the lock cannot judge its writes, and a hook that throws would let them pass.
// - developpeur writes none of the testwriter's files, and no other file until its ticket's
//   description holds a "## Architecture" section. The ticket is the "TON TICKET : <id>" line of the agent's
//   launch prompt, read from its transcript.
// - In an envelope (`GRILLHOUSE_ENVELOPPE`, the packages of the plan, scripts/enveloppe/
//   paquets-du-plan.mjs), a write in the copy out of the packages the plan writes (`ecritsDuPlan`
//   on the components of the module of the language, `paquetsDuLangage`, as the envelope reads them)
//   and out of the shared test material, whose rule is the one above, stops the session, as the
//   visibility of Bazel refuses a target the rule does not open: the hook answers Claude Code's
//   `continue: false`, the tool refused (`permissionDecision: deny`), its reason naming the file's
//   package and the plan, and leaves that reason in the session's working directory
//   (`MARQUE_HORS_PLAN` under TMPDIR), which the launcher hands to the circuit. The mount of the
//   envelope refuses the same write to any tool; the hook says why, and stops.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ecritsDuPlan,
  MARQUE_HORS_PLAN,
  paquetQuiTient,
  paquetsDeLEnveloppe,
  paquetsDuLangage,
} from '../enveloppe/paquets-du-plan.mjs';
import { langageDe } from '../langages.mjs';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

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

// The stop of a write out of the plan of the envelope <env>, `{ paquet, raison }`, or null: a
// write in the repository holding the file, out of the packages the plan writes and out of the
// shared test material.
function horsDuPlan(input, { tmp = tmpdir(), env = process.env } = {}) {
  const plan = paquetsDeLEnveloppe(env);
  if (!plan || !WRITE_TOOLS.has(input.tool_name)) return null;
  const raw = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!raw) return null;
  const file = path.resolve(input.cwd ?? process.cwd(), raw);
  if (isScratch(file, tmp)) return null;
  const copie = racineDe(file);
  if (!copie) return null;
  const liste = paquetsDuLangage(langageDe(copie), copie);
  const ecrits = ecritsDuPlan(plan, liste);
  const rel = path.relative(copie, file);
  if (ecrits.includes('.') || ecrits.some(d => rel.startsWith(`${d}/`))) return null;
  if (langageDe(copie).estUnTest(file, copie)?.matiere) return null;
  const tenant = paquetQuiTient(rel, liste);
  const paquet = tenant === '.' ? 'la racine du dépôt' : tenant;
  return {
    paquet,
    raison: `⛔ hors-plan — ${rel} est dans ${paquet}, hors des paquets du plan (${plan.join(', ')}) : ta séance s'arrête là, et le superviseur étend le plan ou refuse l'écriture.`,
  };
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
      maxBuffer: 256 * 1024 * 1024,
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
  const classe = langageDe(racine).estUnTest(file, racine);
  const testwriter = classe !== null;

  if (role === 'testwriter') {
    return testwriter
      ? null
      : `Le testwriter écrit seulement des fichiers de test et la matière de test partagée ; ${raw} n'est ni l'un ni l'autre. Le code revient au développeur.`;
  }
  if (role === 'developpeur') {
    if (testwriter) {
      return classe.test
        ? `Les tests appartiennent au testwriter : ${raw} est un fichier de test. Un test faux se signale au superviseur.`
        : `La matière de test partagée appartient au testwriter : ${raw} en fait partie. Un besoin de matière se signale au superviseur.`;
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
  // A project the lock cannot judge (no language declared, scripts/langages.mjs) is refused, as a
  // hook that throws exits 1, which Claude Code lets pass.
  let stop = null;
  let reason = null;
  try {
    stop = horsDuPlan(input);
    if (!stop) reason = refusal(process.argv[2], input);
  } catch (e) {
    reason = e.message;
  }
  if (stop) {
    // The mark for the circuit; the stop below is the hook's answer, mark or not.
    try {
      writeFileSync(path.join(tmpdir(), MARQUE_HORS_PLAN), stop.raison);
    } catch {
      // A working directory gone leaves no mark; the session still stops.
    }
    process.stdout.write(
      `${JSON.stringify({
        continue: false,
        stopReason: stop.raison,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: stop.raison,
        },
      })}\n`
    );
  } else if (reason) {
    process.stderr.write(reason + '\n');
    process.exitCode = 2;
  }
}
