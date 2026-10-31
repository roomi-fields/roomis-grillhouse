#!/usr/bin/env node
// The write lock of a role agent: a PreToolUse hook declared in the settings of its session
// (scripts/droits.mjs: `npx grillhouse verrou <role>`). It reads the hook's JSON on stdin and refuses a
// file write the role does not own, with exit code 2 and its reason on stderr.
//
// - A path under the system temp directory (the session scratchpad) is always writable.
// - testwriter writes the files it owns, those the rule of a test file of the module of the
//   project's language classes (`estUnTest`, scripts/jointure.d.ts, scripts/langages.mjs): its test
//   files, the helpers of its folders of tests, and every file of a package of the shared test
//   material. Of the manifests, it writes what the module declares its (`manifestes`): a write of
//   a component's manifest whose only change from the file on disk lies in the part of its tests
//   (`horsDesTests` empty; the text after an Edit or a MultiEdit is the file's with its
//   replacements), and the lock files of the versions; any other change of a manifest is refused,
//   the path and each part named. A file of code is judged the same way when the module declares
//   a part of it the tests' (cargo: the test module of a file of `src/`).
// - The repository root is that of the git repository holding the written file, whatever the
//   agent's working directory; a file outside any repository is read against the working directory.
//   A project that declares no language (the column « Langage » of its docs/ARCHITECTURE.md) is
//   refused, exit code 2, the column named: the lock cannot judge its writes, and a hook that
//   throws would let them pass.
// - developpeur writes none of the testwriter's files, and no other file until its ticket's
//   description holds a "## Architecture" section (`sansArchitecture`, which the start of the
//   circuit reads too). The ticket is the "TON TICKET : <id>" line of the agent's
//   launch prompt, read from its transcript.
// - In an envelope (`GRILLHOUSE_ENVELOPPE`, the packages of the plan, scripts/enveloppe/
//   paquets-du-plan.mjs), a write in the copy out of the packages the plan writes (`ecritsDuPlan`
//   on the components of the module of the language, `paquetsDuLangage`, as the envelope reads them)
//   and out of the shared test material, whose rule is the one above, and for the testwriter out
//   of the lock files of the versions (`manifestes.verrous`), stops the session, as the
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

// The refusal of the ticket <id> whose <description> holds no "## Architecture" section, or null:
// the one rule the developer's lock and the start of the circuit (scripts/circuit.mjs) read.
export function sansArchitecture(id, description) {
  return /^##\s+Architecture\b/m.test(String(description ?? ''))
    ? null
    : `Le ticket ${id} n'a pas sa section « ## Architecture » : le code attend l'architecture. Rends la question au superviseur.`;
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

// The role that writes the tests, the shared test material and the lock files of the versions.
const TESTWRITER = 'testwriter';

// The stop of a write of <role> out of the plan of the envelope <env>, `{ paquet, raison }`, or
// null: a write in the repository holding the file, out of the packages the plan writes, out of
// the shared test material and, for the testwriter, out of the lock files of the versions.
export function horsDuPlan(input, { tmp = tmpdir(), env = process.env, role = null } = {}) {
  const plan = paquetsDeLEnveloppe(env);
  if (!plan || !WRITE_TOOLS.has(input.tool_name)) return null;
  const raw = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!raw) return null;
  const file = path.resolve(input.cwd ?? process.cwd(), raw);
  if (isScratch(file, tmp)) return null;
  const copie = racineDe(file);
  if (!copie) return null;
  const langage = langageDe(copie);
  const liste = paquetsDuLangage(langage, copie);
  const ecrits = ecritsDuPlan(plan, liste);
  const rel = path.relative(copie, file);
  if (ecrits.includes('.') || ecrits.some(d => rel.startsWith(`${d}/`))) return null;
  if (langage.estUnTest(file, copie)?.matiere) return null;
  if (role === TESTWRITER && langage.manifestes.verrous.includes(rel)) return null;
  const tenant = paquetQuiTient(rel, liste);
  const paquet = tenant === '.' ? 'la racine du dépôt' : tenant;
  return {
    paquet,
    raison: `⛔ hors-plan — ${rel} est dans ${paquet}, hors des paquets du plan (${plan.join(', ')}) : ta séance s'arrête là, et le superviseur étend le plan ou refuse l'écriture.`,
  };
}

// The text of the file at <file>, null when there is none.
const lu = file => (existsSync(file) ? readFileSync(file, 'utf8') : null);

// The text the write <input> leaves at <file>: a Write's content, the file's text with each
// replacement of an Edit or a MultiEdit, as Claude Code applies them; null for another tool.
function texteApres(input, file) {
  const t = input.tool_input ?? {};
  const remplacer = (texte, e) =>
    e.replace_all
      ? texte.split(e.old_string ?? '').join(e.new_string ?? '')
      : texte.replace(e.old_string ?? '', () => e.new_string ?? '');
  if (input.tool_name === 'Write') return t.content ?? '';
  if (input.tool_name === 'Edit') return remplacer(lu(file) ?? '', t);
  if (input.tool_name === 'MultiEdit') return (t.edits ?? []).reduce(remplacer, lu(file) ?? '');
  return null;
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
  const langage = langageDe(racine);
  const classe = langage.estUnTest(file, racine);
  const testwriter = classe !== null;

  if (role === TESTWRITER) {
    if (testwriter || langage.manifestes.verrous.includes(path.relative(racine, file))) return null;
    const apres = texteApres(input, file);
    const hors =
      apres === null ? null : langage.manifestes.horsDesTests(file, racine, lu(file), apres);
    if (hors?.length === 0) return null;
    const regle =
      "Le testwriter écrit seulement des fichiers de test, la matière de test partagée et, d'un manifeste ou d'un fichier de code, la part de ses tests";
    return hors
      ? `${regle} ; ce changement de ${raw} touche aussi ${hors.join(', ')}. Le reste du fichier revient au développeur.`
      : `${regle} ; ${raw} n'est rien de cela. Le code revient au développeur.`;
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
    return sansArchitecture(id, description);
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
    stop = horsDuPlan(input, { role: process.argv[2] });
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
