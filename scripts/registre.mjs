#!/usr/bin/env node
// The register of finished agents: one JSON line per agent that ends, written by a hook
// (`.claude/settings.json`: SubagentStop for a sub-agent, SessionEnd for a session, a role agent
// launched in a shell included). An agent resumed by a message has one line per stop; the board
// reads an agent's latest line, and the transcripts of running ones. The circuit of a ticket
// (scripts/circuit.mjs) writes a line at the end of each step it leads itself, with no agent
// (`ligneDEtape`: its role `circuit`, its step and component, one turn, no tokens).
//
// - The line: the project (the main tree of the directory the session opened in, which the hook
//   reads in CLAUDE_PROJECT_DIR, else in its input's `cwd`), the agent, its ticket (« TON TICKET : »; a sub-agent
//   whose prompt names none takes that of the regulator that launched it), its role,
//   its start and end, its working time and the turns it sums (start and end in milliseconds, the
//   waits for a message left out), its tokens, its cache reads and its cost when the session wrote
//   one. All of it is read from the agent's transcript; the agent declares nothing.
// - The register is `~/.claude/grillhouse/registre.jsonl` (GRILLHOUSE_REGISTRE replaces it): the
//   envelope of a role agent leaves it writable.
// - A hook never stops the session, and never waits for a transcript: it hands the fields of its
//   input that the line reads to a detached process (`--ecrire`) and ends at once, so a session of several hundred MB closes
//   before Claude Code's hook time limit. The detached process reads the transcript in chunks
//   (`lireFichier` in tableau.mjs), never whole; a transcript it cannot read writes nothing.
// - One stop has one line: the write holds the register's lock (`prendreVerrou`, judged by the
//   lock's age, since a role agent's envelope and the outside do not share process numbers),
//   and skips a line whose agent and end the register already holds. The hook and
//   `--rattraper` write the same way.
// - `node scripts/registre.mjs --copie <copie>` writes the lines of the sessions of an agent's copy
//   the register does not hold yet, whatever their age: the launcher (scripts/enveloppe/lancer.sh)
//   runs it once the envelope has ended, outside it, so a role agent's line no longer rests on its
//   end hook alone.
// - `node scripts/registre.mjs --rattraper` writes the lines of the project's finished agents the
//   register does not hold yet: those that ended before the hook existed, read from their
//   transcripts (the project's sessions and their sub-agents, the agents' copies). A transcript
//   that the board shows running (`tourne` in tableau.mjs: moved in the last 2 minutes, or, for a
//   sub-agent, its last tool call awaiting its answer within 30 minutes) waits for its hook.
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  lireFichier,
  ROLE_DU_CIRCUIT,
  roleDuMeta,
  ticketDuRegulateur,
  tourne,
} from './tableau.mjs';
import { lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';

const REGISTRE =
  process.env.GRILLHOUSE_REGISTRE ??
  path.join(os.homedir(), '.claude', 'grillhouse', 'registre.jsonl');

// The transcript and the role the hook's input names: a sub-agent's sits next to the session's.
export function source(input) {
  if (input.hook_event_name === 'SubagentStop') {
    const transcription =
      input.agent_transcript_path ??
      (input.agent_id && input.transcript_path
        ? path.join(
            input.transcript_path.replace(/\.jsonl$/, ''),
            'subagents',
            `agent-${input.agent_id}.jsonl`
          )
        : null);
    // The meta file names the type the sub-agent was spawned as; the input's `agent_type` is a
    // named agent's name.
    let role = null;
    if (transcription) {
      try {
        role = roleDuMeta(
          JSON.parse(readFileSync(transcription.replace(/\.jsonl$/, '.meta.json'), 'utf8'))
        );
      } catch {
        // A sub-agent without its meta file takes the input's type.
      }
    }
    role ??= input.agent_type ?? null;
    return { transcription, role, agent: input.agent_id ?? null };
  }
  return {
    transcription: input.transcript_path ?? null,
    role: null,
    agent: input.session_id ?? null,
  };
}

// The register's line for this hook input and the reading `t` of its transcript (`lireFichier` or
// `lireTranscription`), or null. `projet` is the main tree of the session.
export function ligne(input, t, projet) {
  const { transcription, role, agent } = source(input);
  if (t.premier === null) {
    return null;
  }
  return {
    projet,
    agent,
    ticket: t.ticket ?? (transcription ? ticketDuRegulateur(transcription) : null),
    role: role ?? t.role,
    debut: new Date(t.premier).toISOString(),
    fin: new Date(t.dernier).toISOString(),
    travail: t.travail,
    tours: t.tours,
    jetons: t.jetons,
    cache: t.cache,
    cout: t.cout,
  };
}

// The register's line of a step the circuit of <ticket> leads itself (scripts/circuit.mjs), from
// <debut> to <fin> (ISO dates): one agent per step, its role `circuit`, one turn, no tokens.
export function ligneDEtape({ projet, ticket, etape, composant, debut, fin }) {
  const [d, f] = [Date.parse(debut), Date.parse(fin)];
  return {
    projet,
    agent: `${ROLE_DU_CIRCUIT}:${ticket}:${debut}`,
    ticket,
    role: ROLE_DU_CIRCUIT,
    etape,
    composant,
    debut,
    fin,
    travail: f - d,
    tours: [[d, f]],
    jetons: 0,
    cache: 0,
    cout: null,
  };
}

// The main tree of a directory: an agent's copy belongs to the repository it was made from.
function arbrePrincipal(dir) {
  try {
    const commun = execFileSync(
      'git',
      ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    ).trim();
    return path.dirname(commun);
  } catch {
    return dir;
  }
}

const enTirets = p => p.replace(/[^A-Za-z0-9]/g, '-');

// The hook inputs of the project's finished agents that `connus` (agent ids) does not hold.
export function aRattraper(racine, home, connus, maintenant = Date.now()) {
  const projets = path.join(home, '.claude', 'projects');
  if (!existsSync(projets)) {
    return [];
  }
  const out = [];
  const fini = (f, sousAgent) => !tourne(f, maintenant, sousAgent);
  const jsonl = d => (existsSync(d) ? readdirSync(d).filter(n => n.endsWith('.jsonl')) : []);
  const propre = path.join(projets, enTirets(racine));
  const copies = `${enTirets(path.join(racine, '.claude', 'worktrees'))}-`;
  for (const d of readdirSync(projets)) {
    const dir = path.join(projets, d);
    if (d !== enTirets(racine) && !d.startsWith(copies)) {
      continue;
    }
    for (const n of jsonl(dir)) {
      const f = path.join(dir, n);
      const session = n.replace(/\.jsonl$/, '');
      if (!connus.has(session) && fini(f, false)) {
        out.push({
          hook_event_name: 'SessionEnd',
          transcript_path: f,
          session_id: session,
          cwd: racine,
        });
      }
      if (dir !== propre) {
        continue;
      }
      const sous = path.join(dir, session, 'subagents');
      for (const m of jsonl(sous)) {
        const agent = m.replace(/^agent-/, '').replace(/\.jsonl$/, '');
        const g = path.join(sous, m);
        if (!connus.has(agent) && fini(g, true)) {
          out.push({
            hook_event_name: 'SubagentStop',
            transcript_path: f,
            agent_id: agent,
            agent_transcript_path: g,
            cwd: racine,
          });
        }
      }
    }
  }
  return out;
}

// How long a register lock may stand before it counts as abandoned: a write holds it for the
// time of one read and one append.
const PERIME = 30_000;

// Appends `l` to the register unless it already holds the line of this agent's end. Returns whether
// it wrote. The check and the append happen under the register's lock.
export function ecrire(l) {
  mkdirSync(path.dirname(REGISTRE), { recursive: true });
  const verrou = `${REGISTRE}.verrou`;
  prendreVerrou(verrou, { attendre: true, perime: PERIME });
  try {
    const deja = existsSync(REGISTRE) ? readFileSync(REGISTRE, 'utf8') : '';
    for (const x of deja.split('\n')) {
      try {
        const e = JSON.parse(x);
        if (e.agent === l.agent && e.fin === l.fin) {
          return false;
        }
      } catch {
        // A torn line holds nothing.
      }
    }
    appendFileSync(REGISTRE, `${JSON.stringify(l)}\n`);
    return true;
  } finally {
    lacherVerrou(verrou);
  }
}

// Reads the transcript of `input` in chunks and writes its line; false when nothing was written.
function ecrireLaLigne(input, projet) {
  const { transcription } = source(input);
  if (!transcription || !existsSync(transcription)) {
    return false;
  }
  const l = ligne(input, lireFichier(transcription), projet);
  return l ? ecrire(l) : false;
}

// The directory where Claude Code keeps the transcripts of the sessions of an agent's copy
// (`copie`), in the home <home>: its path in dashes under `~/.claude/projects`. The circuit
// (scripts/circuit.mjs) watches it.
export const transcriptionsDeLaCopie = (copie, home) =>
  path.join(home, '.claude', 'projects', enTirets(copie));

// The sessions of an agent's copy (`copie`) the register does not hold yet (`connus`), as the end
// hook would hand them: the launcher calls it once the envelope has ended, so every session of
// the copy is finished, however recently its transcript moved.
export function deLaCopie(copie, home, connus) {
  const dir = transcriptionsDeLaCopie(copie, home);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter(n => n.endsWith('.jsonl'))
    .map(n => n.replace(/\.jsonl$/, ''))
    .filter(session => !connus.has(session))
    .map(session => ({
      hook_event_name: 'SessionEnd',
      session_id: session,
      transcript_path: path.join(dir, `${session}.jsonl`),
      cwd: copie,
    }));
}

// The agents the register holds.
function connusDuRegistre() {
  const deja = existsSync(REGISTRE) ? readFileSync(REGISTRE, 'utf8') : '';
  return new Set(
    deja
      .split('\n')
      .map(l => {
        try {
          return JSON.parse(l).agent;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  );
}

// The fields of the hook input that `source` and `ligne` read: the detached process receives these
// only, since an input also carries the agent's last message and an argument is bound to 128 KiB.
const CHAMPS = [
  'hook_event_name',
  'transcript_path',
  'session_id',
  'agent_id',
  'agent_type',
  'agent_transcript_path',
  'cwd',
];

const direct = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (direct && process.argv.includes('--rattraper')) {
  const racine = arbrePrincipal(process.cwd());
  let n = 0;
  for (const input of aRattraper(racine, os.homedir(), connusDuRegistre())) {
    try {
      if (ecrireLaLigne(input, racine)) {
        n++;
      }
    } catch {
      // A transcript it cannot read waits for the next catch-up.
    }
  }
  process.stdout.write(`${n} agent(s) fini(s) ajouté(s) au registre.\n`);
} else if (direct && process.argv[2] === '--copie') {
  const copie = path.resolve(process.argv[3] ?? '.');
  for (const input of deLaCopie(copie, os.homedir(), connusDuRegistre())) {
    try {
      ecrireLaLigne(input, arbrePrincipal(copie));
    } catch {
      // A transcript it cannot read writes nothing.
    }
  }
} else if (direct && process.argv[2] === '--ecrire') {
  try {
    const input = JSON.parse(process.argv[3]);
    ecrireLaLigne(input, arbrePrincipal(input.projet_dir ?? input.cwd ?? process.cwd()));
  } catch {
    // A reading that fails writes nothing.
  }
} else if (direct) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const retenu = Object.fromEntries(CHAMPS.filter(c => input[c] != null).map(c => [c, input[c]]));
    // The directory the session opened in: the last directory of its shell (`cwd`) may lie where
    // git finds no repository, a mount of the envelope, where git stops at the boundary.
    if (process.env.CLAUDE_PROJECT_DIR) retenu.projet_dir = process.env.CLAUDE_PROJECT_DIR;
    spawn(process.execPath, [process.argv[1], '--ecrire', JSON.stringify(retenu)], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {
    // A hook never stops the session.
  }
}
