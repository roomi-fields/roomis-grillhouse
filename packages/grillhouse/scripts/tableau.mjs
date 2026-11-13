#!/usr/bin/env node
// The board of a project, on three levels, measured on Beads, the register of finished agents,
// the transcripts of running ones and the running processes — never on what an agent declares.
// The Grillhouse mod shows its lines; `npm run tableau` prints them.
//
//   npx grillhouse tableau            the board, as JSON (with its lines, 52 columns wide)
//   npx grillhouse tableau --texte    the board, as text
//   npx grillhouse tableau <dossier>… the board of this project and of the projects in <dossier>…,
//                                     one board, each ticket prefixed by its project (`ensemble`)
//
// Each measure writes the status line (the chantier in progress) to `grillhouse-etat.txt` in the
// common git directory, where the status line (`scripts/ligne-etat/`) reads it.
//
// - Global: the work tickets of the project (a ticket without children; a mother is a grouping)
//   by state, the agents' working time and tokens of the day and in all, the alerts. The head's
//   first line counts the signs AGENTS shows (`etatsDAgents`, the one source: « ▶ N · ⏸ N · ⛔ N
//   · N faits », a ticket closed and not integrated counted under its sign, not as done), one line
//   per project on a board of several; the line of the queues counts the tickets blocked
//   by an open ticket; the status line says the same signs in the same words.
// - Agents: the tree of the steps of the process (scripts/etapes.mjs), one block per step and
//   sub-step, with who works there, for the whole project. A ticket stands at a step only by its
//   circuit (below) or by an agent that runs on it, at that agent's step; a ticket in the queue,
//   its circuit not launched, stands at no step.
// - Circuits: one entry per known ticket, open or closed, whose circuit (scripts/circuit.mjs) is
//   launched and not integrated, read from the Temporal server in one call
//   (scripts/circuits-du-serveur.mjs, the memo of its workflow), so that the ticket stands in
//   AGENTS at every instant from the launch of its circuit to its end: it runs while its workflow
//   runs with no question awaited, and stands at the step of its last state, with its attempt,
//   every step one for the whole ticket, a running one with no known state at the step of its
//   stop, else at the plan (1); while the explorateur or the questionneur works on its plan
//   (`questionnement`, of the plan), it stands at the plan (1); waiting for the supervisor
//   (`attendLeSuperviseur`, the one rule the opening and the wait of the questions read too:
//   stopped, « à repasser » included, but by the supervisor's « arrete », or ended without its
//   issue), it stands under the stopped step after a line « ⤷ Question · <qui> », who must answer
//   it, the supervisor or the owner, the supervisor when it names no question; its card opens on
//   that question, or on the stop (its name and code) and the first line of its reason.
// - Readings: a reading of the circuits or of the tickets that fails (the Temporal server silent
//   or at fault, Beads at fault) gives way to the last one that succeeded, kept in the common git
//   directory (`lectureGardee`, `tableau-lu-<quoi>.json`), its age in the alert that names the
//   fault; a project beside the session's says the faults of its own reading.
// - Bilans: the card of a ticket whose circuit kept its bilan (scripts/bilan.mjs,
//   `.claude/worktrees/<ticket>.bilan.json`) opens on its key figures: wall time, share lost,
//   sessions, cost.
// - Chantier: a root epic with work in progress, its tree of mothers, each with its work tickets
//   done over all; the tree shows the open work: a closed ticket, mother included, counts without
//   a line, and a closed mother's open tickets take her place. The other chantiers, one line each.
//   Then the tickets closed today.
// - Lines: the head, AGENTS, CHANTIER, then FAITS AUJOURD'HUI, every line of each list shown; a
//   line folds only lines of another state (the tree's « + 2 prêts ») or the chantiers not in
//   progress.
// - Measures: a finished agent from the register (`scripts/registre.mjs`), a running one from its
//   transcript: a role agent launched in a shell (its envelope's process, which names its copy
//   and its role) while that process runs, a sub-agent or a session whose transcript moved in the
//   last 2 minutes.
//   With an end in the register, it runs only when an incoming message (of the person, another
//   agent, a notification) follows its latest end strictly (a reviewer resumed by a message); the
//   writings of its last turn after that end leave it finished, measured by that latest end.
//   A sub-agent, whatever its role, runs also while its last tool call awaits its answer, its
//   transcript having moved in the last 30 minutes; a session keeps the 2-minute rule alone. The
//   board reads no transcript older than 30 minutes: a shell agent whose transcript is older shows
//   by its process alone.
// - Time: a transcript's working time is the union of its turns, each bounded by the earliest and
//   the latest date of its events, whatever their order in the file, but those a resumption writes
//   before its incoming message (`horsDuTour`); a transcript is read where the
//   board stopped, its reading kept in the cache file. A ticket's working time adds the steps its
//   circuit leads itself, with no agent (the proof, the checks, the final pass, the integration,
//   the queue): the register's lines of the role `circuit`, which no block shows and no role of the
//   flow counts as a passage, and the step under way of a running circuit (`mene` in its state) up
//   to now; they count out of the turns of the ticket's agents, so the ticket's time is the union
//   of both, each instant once, and they spend no tokens.
// - Progress: the line of a ticket whose circuit runs an automatic step gives the progress of
//   its pass, read in the progress directory its state names (scripts/avancement.mjs), in
//   figures, as Bazel's counter of actions: « faits/prévus · <durée> » since the start of the
//   pass, after the counters of its loops, or in their place when room lacks (the subject is cut,
//   never the figures nor the ticket's number); the queue (5.2), the steps of its CI. Past FIGEE
//   without a sign, « figée <durée> · faits/prévus », the time since its last sign, signed ⛔ in
//   the tone of an alert.
// - The lock of the machine (scripts/verrou-de-machine.mjs, read by `lireLaMesure`), as lslocks
//   names who holds a lock and cargo says what its wait waits for. A holder or a wait of a circuit
//   AGENTS shows stands on that circuit's line, one line per ticket, in place of the progress of
//   its pass: « · <sorte> faits/prévus · <durée> » since it took the lock, « · <sorte> figée
//   <durée> · faits/prévus » past FIGEE without a sign, « · verrou <sorte> · <durée> » for a
//   wait, the kind in lower case. Any other stands at the head of AGENTS, with the machine: its
//   holder, whoever it is (a pass out of a ticket, the circuit of a ticket of any project of the
//   machine), « 🔒 <sorte> · <projet> · <qui> · faits/prévus · <durée> », « ⚠ <sorte> figée
//   <durée> · <projet> · <qui> · faits/prévus »; then each pass that waits for the lock or for
//   room under /tmp, the oldest first, « ⏳ <sorte> · <projet> · <qui> · attend · <durée> ». <qui>
//   is its ticket without its prefix (`courtDuTicket`), else the folder of its copy (`copie`,
//   under .claude/worktrees/, or the main tree when the project is not named); <projet> is left
//   out for the project of the board (`ici`). The width cuts the project first, then leaves out
//   « attend », then cuts <qui>, never the kind, the figures nor the time. Such a line is marked
//   `avancement`, which the pane measures again more often.
// - Signs: each sign keeps one sense (the owner's decisions of 2026-11-01 and 2026-11-12). A
//   ticket's line in AGENTS takes one of three, by the tone of its state: ▶ its step works (cyan),
//   a ticket led in direct included; ⏸ it waits, under the step about to be launched, the reason
//   on its right (« attend une place », « verrou », « CI », « disque », « démarre » in grey, the
//   circuit waiting for the machine; « question au superviseur », « question au responsable »,
//   « arrêté » in yellow, the circuit waiting for someone); ⛔ it stopped on a fault or its pass is
//   frozen, to correct (red). The head of AGENTS, the machine's lines: 🔒 the holder of the lock,
//   ⏳ a pass that waits for it or for room, 🌙 the night under way. The alerts: 💤 a ticket
//   claimed with nothing running, 🌙 a red night, ⚠ the alerts without a kind of their own. A
//   sign two columns wide stands as the others, a sign then a space; the width of a line counts
//   its columns (`colonnes`), ⏳ and ⛔ two.
// - Alerts: one alert per open night ticket (🌙, its subject, then its number), per circuit that
//   waits for the supervisor (⏳, how long), a shell agent silent for 10 minutes, a ticket in
//   progress without anything running for 30 minutes (💤), each with its state (`etat`).
// - Tones: each state the board shows has one tone, defined once (`TONS`), which every line and
//   every alert takes, whatever its duration or the line that shows it: red for what asks for a
//   correction (frozen, a fault, a question with no live wait, a ceiling refused), yellow for what
//   waits for someone (the supervisor, the owner), grey for what waits for the machine (a place,
//   the lock, the disk, the CI), cyan for what runs.
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AUTO,
  bouclesDe,
  ETAPES,
  etapeDuCircuit,
  etapeDuRole,
  libelle,
  quiDe,
  roleDeLAgent,
  SUITE,
  SUPERVISEUR,
} from './etapes.mjs';
import { echecDeLOutil } from './aiguillage.mjs';
import { bilansGardes, enBref } from './bilan.mjs';
import { REGISTRE } from './adresse-du-registre.mjs';
import { lireLaMesure } from './avancement.mjs';
import {
  SANS_REPONSE_EN,
  ServeurMuet,
  circuitsDuServeur,
  nuitDuServeur,
} from './circuits-du-serveur.mjs';
import {
  attendDeLAutreProjet,
  enFileSansArchitecture,
  lireLesExternes,
} from './file-des-tickets.mjs';
import { etatDesPlaces } from './places-de-la-machine.mjs';
import { prefixe as prefixeDeLaRacine } from './prefixe-des-tickets.mjs';
import { sigleDuProjet } from './sigle-du-projet.mjs';
import { vivant } from './mesure/base-de-passe.mjs';

const MINUTE = 60_000;
export const SILENCE = 10 * MINUTE;
export const SANS_AGENT = 30 * MINUTE;
const RECENT = 2 * MINUTE;
export const LARGEUR = 52;
// An automatic pass without a sign for this long is frozen: its line says so, in the tone of an
// alert.
export const FIGEE = 5 * MINUTE;
// The room a circuit's line keeps for its subject beside the counters of its
// loops and the progress of its pass: below it, the progress takes the counters' place.
const PLACE_DU_SUJET = 10;
// The role of a register line that a step of a circuit writes (scripts/circuit.mjs): no agent,
// no role of the flow.
export const ROLE_DU_CIRCUIT = 'circuit';
// The role of a register line that the workflow of the nights writes for a night it skips
// (src/temporal/nuits/): no agent, no ticket, no turn; the board counts it nowhere.
export const ROLE_DE_LA_NUIT = 'nuit';
// A sub-agent's role from its meta file: the type it was spawned as; a named agent's `agentType`
// is its name.
export const roleDuMeta = m =>
  roleDeLAgent(m.spawnedAgentType ?? m.customAgentType ?? m.agentType ?? null);
// The states of a ticket, in the order the states' view lists them, with their meaning.
export const ETATS = [
  { cle: 'enCours', nom: 'en cours', sens: 'un agent y travaille' },
  { cle: 'enAttente', nom: 'en attente', sens: 'ton go, prêt à partir' },
  { cle: 'fileDirecte', nom: 'en direct', sens: 'mené hors du circuit, pas encore pris' },
  { cle: 'bloques', nom: 'bloqué', sens: 'ton go, il attend un autre ticket' },
  { cle: 'sansGo', nom: 'sans go', sens: 'validé, il attend ton go' },
  { cle: 'aValider', nom: 'à valider', sens: 'une trouvaille attend ton accord' },
  { cle: 'reportes', nom: 'reporté', sens: 'mis de côté' },
  { cle: 'fermes', nom: 'fait', sens: 'fermé' },
];
// The tone of each state the board shows, defined once: as a dashboard of states (GitHub Checks,
// Alertmanager), the severity belongs to the state, never to its duration nor to the line that
// shows it; the duration stays in the text. Every line and every alert takes its tone here:
// `alerte` (red), what asks for a correction; `attention` (yellow), what waits for someone, an
// answer or a look; `actif` (cyan), what runs; `discret` (grey), what waits for the machine (a
// place, the lock, the disk, the CI), what is done, empty or a measure; `titre`, a heading; none,
// a ticket at rest. The pane turns each tone into its colour (mods/grillhouse `couleur`).
export const TONS = Object.freeze({
  // A ticket's state (ETATS).
  enCours: 'actif',
  enAttente: undefined,
  fileDirecte: undefined,
  bloques: undefined,
  sansGo: 'attention',
  aValider: 'attention',
  reportes: undefined,
  fermes: 'discret',
  // A circuit, a pass, a wait.
  attendUnePlace: 'discret',
  attendLeVerrou: 'discret',
  attendLeDisque: 'discret',
  attendLaCI: 'discret',
  sansEtape: 'discret',
  enDirect: 'actif',
  nuitEnCours: 'actif',
  attendLeSuperviseur: 'attention',
  attendLeResponsable: 'attention',
  arrete: 'attention',
  sansRienQuiTourne: 'attention',
  silencieux: 'attention',
  sansArchitecture: 'attention',
  outilNonInstallable: 'attention',
  machineChargee: 'attention',
  fige: 'alerte',
  sansIssue: 'alerte',
  panne: 'alerte',
  nuitRouge: 'alerte',
  sansAttente: 'alerte',
  plafondRefuse: 'alerte',
  // The layout.
  titre: 'titre',
  vide: 'discret',
  mesure: 'discret',
});
const enTirets = p => p.replace(/[^A-Za-z0-9]/g, '-');

// The origins of an incoming message: the person, another agent, a notification, the supervisor
// resuming a sub-agent.
const ORIGINES = new Set(['human', 'peer', 'task-notification', 'coordinator']);
// The mark the tool writes when the person stops a turn.
const INTERRUPTION = /^\[Request interrupted by user( for tool use)?\]$/;

// An incoming message opens a turn: a message of the person, of another agent, a notification or
// the supervisor's.
// Its origin decides; a message without origin is one unless it is a tool's result, a meta message
// (a system reminder, a loaded skill), the summary written after a compaction or the interruption
// mark.
function entrant(e) {
  if (e.type !== 'user') {
    return false;
  }
  if (e.origin) {
    return ORIGINES.has(e.origin.kind);
  }
  const contenu = e.message?.content;
  if (e.isMeta || e.isCompactSummary) {
    return false;
  }
  if (Array.isArray(contenu)) {
    if (contenu.some(c => c.type === 'tool_result')) {
      return false;
    }
    return !INTERRUPTION.test(contenu.map(c => c.text ?? '').join(''));
  }
  return typeof contenu === 'string' && !INTERRUPTION.test(contenu);
}

// The reading of a transcript is a state that lines are added to, one JSON object per line: it
// holds the tokens, the turns, the start and end, the last incoming message, the ticket, the role,
// the cost (the total a session writes), the usage by model (which the register prices when the
// total lacks, scripts/registre.mjs) and the last tool call, and it is plain JSON, so the board keeps it between two
// measures and reads only what was appended. A turn is bounded by the earliest and the latest date
// of its events, whatever their order in the file, but those a resumption writes (`horsDuTour`);
// the first one holds the events before the first incoming message, each next one opens at an
// incoming message and holds the events up to the next.
const etatNeuf = () => ({
  jetons: 0,
  cache: 0,
  premier: null,
  dernier: null,
  entre: null,
  ticket: null,
  role: null,
  cout: null,
  modeles: {},
  appel: null,
  reponses: [],
  tours: [],
  recu: false,
  vus: [],
  minutes: {},
});

// The union of intervals, ordered by date: no instant is in two of them.
function reunir(intervalles) {
  const out = [];
  for (const [debut, fin] of [...intervalles].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const dernier = out[out.length - 1];
    if (dernier && debut <= dernier[1]) {
      dernier[1] = Math.max(dernier[1], fin);
    } else {
      out.push([debut, fin]);
    }
  }
  return out;
}

// Whether the event <e> is written by Claude Code itself when a session resumes (`--resume`),
// before its incoming message and at the time of the resumption: an operation of its queue, or a
// message of no model (« No response requested. »). It bounds no turn: as ccusage cuts a
// transcript, a turn starts at its incoming message.
const horsDuTour = e => e.type === 'queue-operation' || e.message?.model === '<synthetic>';

// Adds the lines of `texte` to the state `etat`, which it returns.
function avancer(etat, texte) {
  const vus = new Set(etat.vus);
  const reponses = new Set(etat.reponses);
  for (const ligne of texte.split('\n')) {
    if (!ligne.trim()) {
      continue;
    }
    let e;
    try {
      e = JSON.parse(ligne);
    } catch {
      continue;
    }
    if (e.type === 'agent-setting') {
      etat.role ??= e.agentSetting ?? null;
    }
    if (e.type === 'cost-state' && typeof e.totalCostUSD === 'number') {
      etat.cout = e.totalCostUSD;
    }
    const t = e.timestamp ? Date.parse(e.timestamp) : NaN;
    if (!Number.isNaN(t)) {
      etat.premier = etat.premier === null ? t : Math.min(etat.premier, t);
      etat.dernier = etat.dernier === null ? t : Math.max(etat.dernier, t);
    }
    if (!Number.isNaN(t) && !horsDuTour(e)) {
      // The first incoming message continues the turn its earlier events opened.
      const recoit = entrant(e);
      const coupe = recoit && etat.recu;
      etat.recu ||= recoit;
      if (recoit) {
        etat.entre = etat.entre === null ? t : Math.max(etat.entre, t);
      }
      if (etat.tours.length === 0 || coupe) {
        etat.tours.push([t, t]);
      } else {
        const tour = etat.tours[etat.tours.length - 1];
        tour[0] = Math.min(tour[0], t);
        tour[1] = Math.max(tour[1], t);
      }
    }
    for (const c of Array.isArray(e.message?.content) ? e.message.content : []) {
      if (c.type === 'tool_use') {
        etat.appel = c.id;
      } else if (c.type === 'tool_result') {
        reponses.add(c.tool_use_id);
      }
    }
    if (etat.ticket === null && e.type === 'user') {
      const contenu = e.message?.content;
      const texteUser =
        typeof contenu === 'string'
          ? contenu
          : Array.isArray(contenu)
            ? contenu.map(c => c.text ?? '').join(' ')
            : '';
      const m = /TON TICKET : ([A-Za-z0-9_-]+-[A-Za-z0-9]+(?:\.[0-9]+)*)/.exec(texteUser);
      etat.ticket = m ? m[1] : '';
    }
    const u = e.message?.usage;
    const id = e.message?.id ?? e.requestId;
    if (!u || (id && vus.has(id))) {
      continue;
    }
    if (id) {
      vus.add(id);
    }
    const n = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    etat.jetons += n;
    // The tokens by minute of their message, which share the supervisor's among the tickets he
    // leads directly (`jetonsDuSuperviseur`); a state kept before them starts its own.
    if (!Number.isNaN(t)) {
      etat.minutes ??= {};
      const minute = Math.floor(t / 60_000);
      etat.minutes[minute] = (etat.minutes[minute] ?? 0) + n;
    }
    etat.cache += u.cache_read_input_tokens ?? 0;
    // The usage of the message's model: a write of the cache by its duration, one without them
    // of five minutes, the default of the API.
    const ecrit = u.cache_creation_input_tokens ?? 0;
    const uneHeure = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const m = (etat.modeles[String(e.message?.model ?? '')] ??= {
      entree: 0,
      sortie: 0,
      lecture: 0,
      ecriture5m: 0,
      ecriture1h: 0,
    });
    m.entree += u.input_tokens ?? 0;
    m.sortie += u.output_tokens ?? 0;
    m.lecture += u.cache_read_input_tokens ?? 0;
    m.ecriture5m += u.cache_creation?.ephemeral_5m_input_tokens ?? ecrit - uneHeure;
    m.ecriture1h += uneHeure;
  }
  etat.vus = [...vus];
  etat.reponses = [...reponses];
  return etat;
}

// The measures of a state: the tokens, the turns and their working time (the union of the turns,
// the waits left out), the start (the oldest date) and the end (the latest), the ticket, the role
// (a session launched with `--agent`), the cost (the total a session writes) and the usage by
// model. `entre` is the
// time of the latest incoming message, or null; `attend` tells whether the last tool call still
// awaits its answer, the call and its answer paired by their identifier.
const mesurer = etat => ({
  jetons: etat.jetons,
  cache: etat.cache,
  travail: reunir(etat.tours).reduce((s, [debut, fin]) => s + (fin - debut), 0),
  tours: etat.tours.map(tour => [...tour]),
  premier: etat.premier,
  dernier: etat.dernier,
  entre: etat.entre,
  attend: etat.appel !== null && !etat.reponses.includes(etat.appel),
  ticket: etat.ticket || null,
  role: etat.role,
  cout: etat.cout,
  modeles: structuredClone(etat.modeles),
  minutes: { ...(etat.minutes ?? {}) },
});

// The measures of the transcript text `texte` held in memory.
export const lireTranscription = texte => mesurer(avancer(etatNeuf(), texte));

// One line per agent, its latest end: the register holds a line at each stop of an agent, each
// the reading of its whole transcript at that stop, so the latest one holds all its sessions.
function parAgent(registre) {
  const derniere = new Map();
  for (const r of registre) {
    const avant = derniere.get(r.agent);
    if (!avant || Date.parse(r.fin) > Date.parse(avant.fin)) {
      derniere.set(r.agent, r);
    }
  }
  return [...derniere.values()];
}

// The intervals of <intervalles> (ordered, apart) out of those of <retires> (ordered, apart).
function sauf(intervalles, retires) {
  const out = [];
  for (const [debut, fin] of intervalles) {
    let d = debut;
    for (const [rd, rf] of retires) {
      if (rf <= d || rd >= fin) {
        continue;
      }
      if (rd > d) {
        out.push([d, rd]);
      }
      d = Math.max(d, rf);
      if (d >= fin) {
        break;
      }
    }
    if (d < fin) {
      out.push([d, fin]);
    }
  }
  return out;
}

// The register's lines of this project, one per agent: its latest end.
export function lireRegistre(texte, racine) {
  const out = [];
  for (const l of texte.split('\n')) {
    try {
      const e = JSON.parse(l);
      if (e.projet === racine) {
        out.push(e);
      }
    } catch {
      // A torn line counts nothing.
    }
  }
  return parAgent(out);
}

// The bytes of `f` from `decalage` to `taille`, cut after their last whole line: a line still being
// written waits for its end, unless it is already whole JSON.
function lireDepuis(f, decalage, taille) {
  const fd = openSync(f, 'r');
  try {
    const tampon = Buffer.alloc(taille - decalage);
    const lus = readSync(fd, tampon, 0, tampon.length, decalage);
    const lu = tampon.subarray(0, lus);
    const fin = lu.lastIndexOf(10) + 1;
    let entier = lu.subarray(0, fin);
    if (fin < lu.length) {
      try {
        JSON.parse(lu.subarray(fin).toString('utf8'));
        entier = lu;
      } catch {
        // The line is not whole yet.
      }
    }
    return { texte: entier.toString('utf8'), lus: entier.length };
  } finally {
    closeSync(fd);
  }
}

// The read unit of a transcript file: a chunk holds whole lines, a line longer than it widens it.
const MORCEAU = 1_048_576;

// Adds the lines of `f` between the bytes `decalage` and `taille` to the state `etat`, chunk by
// chunk so the file is never held whole, and returns the bytes it consumed.
function avancerDepuis(etat, f, decalage, taille) {
  let position = decalage;
  let pas = MORCEAU;
  while (position < taille) {
    const fin = Math.min(taille, position + pas);
    const { texte, lus } = lireDepuis(f, position, fin);
    if (lus === 0) {
      if (fin === taille) {
        break;
      }
      pas *= 2;
      continue;
    }
    avancer(etat, texte);
    position += lus;
    pas = MORCEAU;
  }
  return position - decalage;
}

// The measures of the transcript file `f`, read in chunks. Throws when the file cannot be read.
export function lireFichier(f) {
  const etat = etatNeuf();
  avancerDepuis(etat, f, 0, statSync(f).size);
  return mesurer(etat);
}

// A transcript read where it stopped: `cache` maps a file to its reading state and the byte it
// reached. A transcript only grows; one that became shorter is read again from its start.
const lecteur = cache => f => {
  try {
    const taille = statSync(f).size;
    let { etat, decalage } = cache[f] ?? {};
    if (!etat || taille < decalage) {
      etat = etatNeuf();
      decalage = 0;
    }
    if (taille > decalage) {
      decalage += avancerDepuis(etat, f, decalage, taille);
    }
    cache[f] = { etat, decalage };
    return mesurer(etat);
  } catch {
    return null;
  }
};
const fichiers = (dir, fin) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(n => n.endsWith(fin))
        .map(n => path.join(dir, n))
    : [];

// Whether the last tool call of the transcript `f` awaits its answer, read from the end of the
// file (the last call and its answer sit in its last bytes) so a transcript that waits on nothing
// is never read whole.
const FIN_LUE = 65_536;
function appelEnAttente(f) {
  try {
    const taille = statSync(f).size;
    const debut = Math.max(0, taille - FIN_LUE);
    const { texte } = lireDepuis(f, debut, taille);
    return lireTranscription(
      texte
        .split('\n')
        .slice(debut > 0 ? 1 : 0)
        .join('\n')
    ).attend;
  } catch {
    return false;
  }
}

// Whether the agent whose transcript is `f` runs at `maintenant`: its transcript moved in the last
// 2 minutes; a sub-agent (`sousAgent`) runs also while its last tool call awaits its answer, its
// transcript having moved in the last 30 minutes. The board and the catch-up of the register share
// this definition.
export function tourne(f, maintenant, sousAgent) {
  const age = maintenant - statSync(f).mtimeMs;
  return age < RECENT || (sousAgent && age <= SANS_AGENT && appelEnAttente(f));
}

// A sub-agent's meta file (next to its transcript `f`), or {}.
const metaDe = f => {
  try {
    return JSON.parse(readFileSync(f.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
  } catch {
    return {};
  }
};

/**
 * The tokens of the supervisor's sessions of the repository at <racine> by minute (`{ <minute>:
 * <tokens> }`, the minute since the epoch): its main transcripts touched since the day's marker
 * <jour>, read through <cache>; the sub-agents' are counted by their tickets.
 */
export function jetonsDuSuperviseur({ racine, home, jour, cache = {} }) {
  const lire = lecteur(cache);
  const out = {};
  for (const f of fichiers(path.join(home, '.claude', 'projects', enTirets(racine)), '.jsonl')) {
    if (statSync(f).mtimeMs < jour) {
      continue;
    }
    for (const [minute, n] of Object.entries(lire(f)?.minutes ?? {})) {
      out[minute] = (out[minute] ?? 0) + n;
    }
  }
  return out;
}

// The agents running now, each with its measures so far. `ps` is the process list
// (`pid etimes args` per line); `cache` keeps the readings of unchanged transcripts. A role agent
// launched in a shell shows by the envelope lancer.sh starts for it,
// `enveloppe.mjs <racine>/.claude/worktrees/<ticket> <paquets> <rôle> --`: its copy gives the
// ticket, its third argument the role (the prompt goes on the standard input, absent from the line).
export function lireVivant({ racine, home, prefix, maintenant, ps, cache = {} }) {
  const lire = lecteur(cache);
  const vivants = [];
  const limite = maintenant - SANS_AGENT;
  const projets = path.join(home, '.claude', 'projects');
  const copies = path.join(racine, '.claude', 'worktrees').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const motif = new RegExp(
    `enveloppe\\.mjs ${copies}/(${prefix}-[A-Za-z0-9]+(?:\\.[0-9]+)*) \\S+ (\\S+) -- `
  );
  const vus = new Set();
  for (const ligne of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(ligne);
    const e = m && motif.exec(m[3]);
    if (!e || vus.has(e[1])) {
      continue;
    }
    const [, ticket, role] = e;
    vus.add(ticket);
    const copie = path.join(racine, '.claude', 'worktrees', ticket);
    const dernier = fichiers(path.join(projets, enTirets(copie)), '.jsonl')
      .map(f => ({ f, mtime: statSync(f).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0];
    const lu = dernier && dernier.mtime >= limite ? lire(dernier.f) : null;
    vivants.push({
      agent: dernier ? path.basename(dernier.f, '.jsonl') : `pid-${m[1]}`,
      ticket,
      role,
      ligne: true,
      depuis: maintenant - Number(m[2]) * 1000,
      silence: dernier ? maintenant - dernier.mtime : null,
      entre: lu?.entre ?? null,
      jetons: lu?.jetons ?? 0,
      travail: lu?.travail ?? 0,
      tours: lu?.tours ?? [],
    });
  }
  const propre = path.join(projets, enTirets(racine));
  for (const f of fichiers(propre, '.jsonl').filter(g => tourne(g, maintenant, false))) {
    const lu = lire(f);
    if (lu) {
      vivants.push({
        agent: path.basename(f, '.jsonl'),
        ticket: null,
        role: null,
        ligne: false,
        depuis: lu.premier ?? maintenant,
        entre: lu.entre,
        jetons: lu.jetons,
        travail: lu.travail,
        tours: lu.tours,
      });
    }
  }
  const sessions = existsSync(propre)
    ? readdirSync(propre, { withFileTypes: true }).filter(e => e.isDirectory())
    : [];
  for (const s of sessions) {
    const dossier = path.join(propre, s.name, 'subagents');
    for (const f of fichiers(dossier, '.jsonl').filter(g => tourne(g, maintenant, true))) {
      const lu = lire(f);
      if (!lu) {
        continue;
      }
      const meta = metaDe(f);
      vivants.push({
        agent: path.basename(f, '.jsonl').replace(/^agent-/, ''),
        ticket: lu.ticket ?? null,
        role: roleDuMeta(meta),
        ligne: false,
        depuis: lu.premier ?? maintenant,
        entre: lu.entre,
        jetons: lu.jetons,
        travail: lu.travail,
        tours: lu.tours,
      });
    }
  }
  return vivants;
}

/**
 * Whether the circuit <c>, as scripts/circuits-du-serveur.mjs reads it, waits for the supervisor:
 * not running on its own, not integrated, and ended without its issue, on a question, or stopped (any stop but the
 * supervisor's own « arrete », « à repasser » included: the supervisor resumes it once the machine
 * is free). The
 * one rule of the questions that wait for the supervisor (grillhouse-pq6), which the board reads,
 * and `questionsEnAttente` of scripts/superviseur.mjs, the one source of the opening and of the
 * wait of the questions.
 * @param {{ vivant: boolean, integre?: boolean, interrompu: boolean, question: string | null, arret: string | null }} c
 * @returns {boolean}
 */
export const attendLeSuperviseur = c =>
  !c.vivant &&
  !c.integre &&
  Boolean(c.interrompu || c.question || (c.arret && c.arret !== 'arrete'));

/**
 * The key of one stop of the circuit <c>: its ticket, the run of its workflow, the rank of its
 * question in that run and its stop, so that the next stop of a circuit resumed is another one. The
 * one key of the file of the stops gone up (scripts/superviseur.mjs) and of the board's alerts.
 * @param {{ ticket: string, run?: string, numero?: number, arret?: string | null }} c
 * @returns {string}
 */
export const cleDe = c => [c.ticket, c.run, c.numero, c.arret ?? 'interrompu'].join(':');

/** The file of the stops gone up to the supervisor of the repository at <racine>. */
export const remonteesDe = racine =>
  path.join(racine, '.claude', 'worktrees', 'questions-remontees.json');

/**
 * The stops gone up of the repository at <racine>, each with its key, `depuis` (the time of its
 * first going up) and `presentee` (the time of its last presentation), in ms. An older file, a
 * list of keys, reads without error: its stops take the time <maintenant> of the reading. A file
 * that does not read holds none.
 * @param {string} racine
 * @param {number} maintenant
 * @returns {{ cle: string, depuis: number, presentee: number }[]}
 */
export function lireLesRemontees(racine, maintenant) {
  try {
    const lu = JSON.parse(readFileSync(remonteesDe(racine), 'utf8'));
    if (!Array.isArray(lu?.remontees)) {
      return [];
    }
    return lu.remontees.map(r =>
      typeof r === 'string'
        ? { cle: r, depuis: maintenant, presentee: maintenant }
        : {
            cle: String(r.cle),
            depuis: Number.isFinite(r.depuis) ? r.depuis : maintenant,
            presentee: Number.isFinite(r.presentee) ? r.presentee : maintenant,
          }
    );
  } catch {
    return [];
  }
}

/** The lock of the one wait of the questions of the repository at <racine>. */
export const verrouDeLAttente = racine =>
  path.join(racine, '.claude', 'worktrees', 'attente-des-questions.lock');

/**
 * Whether a wait of the questions lives for the repository at <racine>: its lock names a process
 * that lives (the pid is read again; a lock left by a dead process does not count).
 * @param {string} racine
 * @returns {boolean}
 */
export function attenteVivante(racine) {
  try {
    const pid = Number(/^(\d+)/.exec(readFileSync(verrouDeLAttente(racine), 'utf8'))?.[1]);
    return Number.isInteger(pid) && pid > 0 && vivant(pid);
  } catch {
    return false;
  }
}

// The minutes between two presentations of a question not answered, by default.
export const RAPPEL_PAR_DEFAUT = 5;

// A ticket's number, subject and component: its title « number — subject — component » when
// the number ends its id, else its id without the prefix and its whole title.
export function lecture(t, prefix) {
  const brut =
    prefix && t.id.startsWith(`${prefix}-`)
      ? t.id.slice(prefix.length + 1)
      : t.id.slice(t.id.indexOf('-') + 1);
  const parts = (t.title ?? '').split(' — ');
  if (parts.length >= 2 && (brut === parts[0] || brut.endsWith(`.${parts[0]}`))) {
    return parts.length >= 3
      ? {
          numero: parts[0],
          sujet: parts.slice(1, -1).join(' — '),
          composant: parts[parts.length - 1],
        }
      : { numero: parts[0], sujet: parts[1], composant: '' };
  }
  return { numero: brut, sujet: t.title ?? t.id, composant: '' };
}

/**
 * Who holds the lock of the machine, or waits for it, as the board shows it (`lireLaMesure` of
 * scripts/avancement.mjs, its project named as the board names it, `nommerLesProjets`; `copie`,
 * its working tree; `ici`, it is of the board's project).
 * @typedef {{ depot?: string | null, copie?: string | null, ici?: boolean, projet: string,
 *   ticket: string | null, sorte: string, depuis: number | null, quoi?: string,
 *   avancement?: { faits: number, prevus: number, debut?: number, dernier: number } | null }} DuVerrou
 * @typedef {{ detenteur: DuVerrou | null, attentes: DuVerrou[] }} Machine
 */

/**
 * The board, from what was read. Pure: every source comes in, the time included; `machine`, the
 * lock of the machine; `outil`, the failed installation of the published version that leads the
 * repository (scripts/aiguillage.mjs `echecDeLOutil`); `places`, the places of the machine
 * (scripts/places-de-la-machine.mjs `etatDesPlaces`), whose line heads AGENTS; `nuit`, the night
 * under way on the machine (scripts/circuits-du-serveur.mjs `nuitDuServeur`), its line under the
 * places'; `muet`, the Temporal
 * server did not answer the reading of the circuits, which the first alert says; `faute`, any
 * other fault of that reading, said in the first alert as it is; `circuitsLusA`, when the reading
 * failed, the time of the last one that succeeded, whose circuits `circuits` holds and whose age
 * the alert says; `fauteTickets`, the fault of the reading of the tickets, said in an alert, and
 * `ticketsLusA`, the time of the last one that succeeded, whose tickets `tous` holds;
 * `echecPrefixe`, the cause of a ticket prefix that did not read, named in an alert; `voies`, the
 * way of each circuit done (`voiesDesCircuits`), whose sign FAITS AUJOURD'HUI shows.
 * @param {{ tous: any[], prefix?: string, racine?: string | null, registre: any[], vivants: any[],
 *   circuits?: any[],
 *   circuitsLusA?: number | null, fauteTickets?: string | null, ticketsLusA?: number | null,
 *   maintenant: number, jour: number,
 *   machine?: Machine | null, outil?: { version: string, raison: string } | null,
 *   places?: { prises: number, plafond: number, faute?: string | null, charge: number,
 *   coeurs: number, memoireGo: number, memoireTotaleGo: number,
 *   tenues?: { ticket: string | null, racine?: string | null }[], attentes: { ticket: string,
 *   depuis: number, disque?: string | null }[], nuit?: 'attend' | 'en cours' | null } | null,
 *   nuit?: { racine: string, depuis: number | null } | null, muet?: boolean, faute?: string | null,
 *   echecPrefixe?: string | null, voies?: Record<string, 'complet' | 'court'> }} lu
 */
export function assembler({
  tous,
  prefix = '',
  racine = null,
  registre: lignesDuRegistre,
  vivants,
  circuits = [],
  maintenant,
  jour,
  machine = null,
  outil = null,
  places: placesDeLaMachine = null,
  nuit: nuitEnCours = null,
  muet = false,
  faute = null,
  circuitsLusA = null,
  fauteTickets = null,
  ticketsLusA = null,
  echecPrefixe = null,
  remontees = [],
  attenteVivante: attenteQuiVit = true,
  voies = {},
  superviseur = {},
  externes,
}) {
  // A circuit's lines are its steps, no agent's passage.
  const etapesFinies = lignesDuRegistre.filter(r => r.role === ROLE_DU_CIRCUIT);
  const registre = parAgent(
    lignesDuRegistre.filter(r => r.role !== ROLE_DU_CIRCUIT && r.role !== ROLE_DE_LA_NUIT)
  );
  // A living agent runs without an end in the register, or when an incoming message follows its
  // latest end strictly; the writings of its last turn after that end leave it finished. A running
  // agent's transcript holds its sessions already in the register.
  const fins = new Map(registre.map(r => [r.agent, Date.parse(r.fin)]));
  const enCoursMesures = vivants.filter(
    v => !fins.has(v.agent) || (v.entre ?? -Infinity) > fins.get(v.agent)
  );
  const repris = new Set(enCoursMesures.map(v => v.agent));
  const finis = registre.filter(r => !repris.has(r.agent));
  const parId = new Map(tous.map(t => [t.id, t]));
  const lu = new Map(tous.map(t => [t.id, lecture(t, prefix)]));
  const numero = id => lu.get(id)?.numero ?? id;
  const titre = t => lu.get(t.id);
  const ouvert = id => parId.has(id) && parId.get(id).status !== 'closed';
  // Ready: open, every ticket that blocks it closed (Beads' own rule, without a second call).
  const blocages = t =>
    (t.dependencies ?? []).filter(d => d.type === 'blocks' && ouvert(d.depends_on_id));
  // What a ticket waits for from another project, « <project>:<capability> » (the capability not
  // delivered by the provider, or its project not resolved: `externes`, the tickets of each other
  // project by its name in Beads' `external_projects`).
  const attentesExternes = t => attendDeLAutreProjet(t, externes).map(a => a.attend);
  const prets = tous.filter(
    t => t.status === 'open' && blocages(t).length === 0 && attentesExternes(t).length === 0
  );
  const aValider = tous.filter(
    t => t.status !== 'closed' && (t.labels ?? []).includes('a-valider')
  );
  const nuit = tous.filter(t => t.status !== 'closed' && (t.labels ?? []).includes('nuit'));
  const enfants = new Map();
  for (const t of tous) {
    if (t.parent && parId.has(t.parent)) {
      (enfants.get(t.parent) ?? enfants.set(t.parent, []).get(t.parent)).push(t);
    }
  }
  const ordre = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });
  for (const l of enfants.values()) {
    l.sort(ordre);
  }
  // The circuits not integrated of the known tickets, open or closed (the queue closes a ticket
  // before it reads the CI, and its circuit may then wait); a ticket whose circuit runs is in
  // progress.
  const parCircuit = new Map(
    circuits.filter(c => parId.has(c.ticket) && !c.integre).map(c => [c.ticket, c])
  );
  const actifs = new Set([
    ...enCoursMesures.map(v => v.ticket).filter(Boolean),
    ...[...parCircuit.values()].filter(c => c.vivant).map(c => c.ticket),
  ]);
  const travailles = new Set(registre.map(r => r.ticket).filter(Boolean));
  // A ticket is work unless it is an epic or a mother; a ticket an agent holds or has worked stays
  // work, done or not, its discoveries under it notwithstanding.
  const travail = t =>
    t.issue_type !== 'epic' &&
    (!enfants.has(t.id) || t.status === 'in_progress' || actifs.has(t.id) || travailles.has(t.id));
  const pret = new Set(prets.map(t => t.id));
  const avalider = new Set(aValider.map(t => t.id));
  const bloquePar = t => [...blocages(t).map(d => numero(d.depends_on_id)), ...attentesExternes(t)];
  // The owner's go: the label `circuit`, set on his word.
  const circuit = t => (t.labels ?? []).includes('circuit');
  // A ticket's state: in progress (claimed, or its circuit launched and not integrated, its
  // question deferred or its ticket closed before its integration included: AGENTS shows it, and it
  // is done only once integrated), done, deferred,
  // awaiting validation; else, with the owner's go, waiting (ready) or blocked (an open ticket it
  // depends on); without it, awaiting his go.
  const etat = t => {
    if (t.status === 'in_progress' || actifs.has(t.id) || parCircuit.has(t.id)) {
      return 'enCours';
    }
    if (t.status === 'closed') {
      return 'fermes';
    }
    if (t.status === 'deferred') {
      return 'reportes';
    }
    if (avalider.has(t.id)) {
      return 'aValider';
    }
    // A ticket led out of the circuit, not yet claimed: the direct queue.
    if ((t.labels ?? []).includes('direct')) {
      return 'fileDirecte';
    }
    if (!circuit(t)) {
      return 'sansGo';
    }
    return pret.has(t.id) ? 'enAttente' : 'bloques';
  };

  // Global.
  const compteurs = {
    enCours: 0,
    enAttente: 0,
    fileDirecte: 0,
    bloques: 0,
    fermes: 0,
    sansGo: 0,
    aValider: 0,
    reportes: 0,
  };
  // Each state's tickets, one per line in the states' view: the done ones, last closed first.
  const parEtat = Object.fromEntries(Object.keys(compteurs).map(e => [e, []]));
  for (const t of [...tous].sort(ordre)) {
    if (travail(t)) {
      compteurs[etat(t)]++;
      parEtat[etat(t)].push(t);
    }
  }
  parEtat.fermes.sort((a, b) => Date.parse(b.closed_at ?? '') - Date.parse(a.closed_at ?? ''));
  // The states' view lists the tickets of the chantiers in progress only (`garde`, their ids); the
  // counters keep every ticket.
  const etatsDe = garde =>
    ETATS.map(({ cle, nom, sens }) => ({
      cle,
      nom,
      sens,
      tickets: parEtat[cle]
        .filter(t => garde.has(t.id))
        .map(t => ({
          id: t.id,
          numero: numero(t.id),
          sujet: titre(t).sujet,
          bloquePar: bloquePar(t),
        })),
    }));
  const desAgents = [
    ...finis.map(r => ({ ...r, quand: Date.parse(r.fin) })),
    ...enCoursMesures.map(v => ({ ...v, quand: maintenant })),
  ];
  // The steps a circuit leads itself: its register lines, and the step under way of a running
  // circuit up to now. Each ticket's steps count out of its agents' turns, so a ticket's working
  // time is the union of both, each instant once; they spend no tokens.
  const etapes = new Map();
  const etapeDe = (ticket, debut, fin) => {
    if (ticket && Number.isFinite(debut) && Number.isFinite(fin) && fin > debut) {
      (etapes.get(ticket) ?? etapes.set(ticket, []).get(ticket)).push([debut, fin]);
    }
  };
  for (const r of etapesFinies) {
    etapeDe(r.ticket, Date.parse(r.debut), Date.parse(r.fin));
  }
  for (const c of circuits) {
    if (c.vivant && c.mene !== null && c.mene !== undefined) {
      etapeDe(c.ticket, c.mene, maintenant);
    }
  }
  const duCircuit = [...etapes].map(([ticket, l]) => {
    const tours = sauf(
      reunir(l),
      reunir(desAgents.filter(m => m.ticket === ticket).flatMap(m => m.tours ?? []))
    );
    return {
      ticket,
      role: ROLE_DU_CIRCUIT,
      travail: tours.reduce((s, [debut, fin]) => s + (fin - debut), 0),
      jetons: 0,
      tours,
      quand: Math.max(-Infinity, ...tours.map(([, fin]) => fin)),
    };
  });
  const mesures = [...desAgents, ...duCircuit];
  const somme = l => ({
    travail: l.reduce((s, x) => s + (x.travail ?? 0), 0),
    jetons: l.reduce((s, x) => s + (x.jetons ?? 0), 0),
  });
  // A measure with its turns counts in the day the parts since midnight of their union; a register
  // line written without them counts whole in the day it ended.
  const partDuJour = tours =>
    reunir(tours).reduce((s, [debut, fin]) => s + Math.max(0, fin - Math.max(debut, jour)), 0);
  const duJour = mesures
    .filter(m => m.quand >= jour)
    .map(m => (m.tours ? { ...m, travail: partDuJour(m.tours) } : m));
  // The discoveries (label `decouverte`, grillhouse-3uv.96): each counts in one case, the first that
  // applies. « rejetés » and « validés » count only since the day's marker <jour>; « new » and
  // « →check », states that await the owner, do not filter by it.
  const aLabel = (t, ...ls) => ls.some(l => (t.labels ?? []).includes(l));
  const estDecouverte = t => aLabel(t, 'decouverte');
  const VERDICTS_DU_TRI = ['traitee', 'doublon', 'sans-suite', 'a-porter', 'non-confirmee'];
  const caseDeLaDecouverte = t => {
    const ferme = t.status === 'closed';
    if (aLabel(t, 'circuit') && (Date.parse(t.updated_at ?? '') || 0) >= jour) {
      return 'valides';
    }
    if (!ferme && aLabel(t, 'a-valider')) {
      return 'check';
    }
    const rejete =
      aLabel(t, 'traitee', 'doublon', 'sans-suite') ||
      (aLabel(t, 'a-porter', 'non-confirmee') && !aLabel(t, 'circuit'));
    if (ferme && rejete && (Date.parse(t.closed_at ?? '') || 0) >= jour) {
      return 'rejetes';
    }
    if (ferme && !aLabel(t, ...VERDICTS_DU_TRI)) {
      return 'new';
    }
    return null;
  };
  const decouvertes = { new: 0, check: 0, rejetes: 0, valides: 0 };
  for (const t of tous.filter(estDecouverte)) {
    const c = caseDeLaDecouverte(t);
    if (c) {
      decouvertes[c]++;
    }
  }
  const global = { compteurs, jour: somme(duJour), cumul: somme(mesures), decouvertes };

  // Chantiers.
  const sous = t => [t, ...(enfants.get(t.id) ?? []).flatMap(sous)];
  const mesure = ids => somme(mesures.filter(m => ids.has(m.ticket)));
  const noeud = t => {
    const liste = sous(t).filter(travail);
    const faits = liste.filter(x => x.status === 'closed').length;
    // A mother not in progress has her own state; an epic, the state of its tickets.
    const e = travail(t)
      ? etat(t)
      : t.status === 'in_progress' || liste.some(x => etat(x) === 'enCours')
        ? 'enCours'
        : t.issue_type !== 'epic'
          ? etat(t)
          : faits === liste.length
            ? 'fermes'
            : bloquePar(t).length
              ? 'bloques'
              : 'sansGo';
    return {
      id: t.id,
      ...titre(t),
      mere: !travail(t),
      etat: e,
      faits,
      total: liste.length,
      bloquePar: bloquePar(t),
      ...mesure(new Set(sous(t).map(x => x.id))),
      enfants: ouverts(t).map(noeud),
    };
  };
  // The tree holds open tickets only: a closed child leaves it, and a closed mother gives her place
  // to her open descendants, at her level, in her order.
  const ouverts = t =>
    (enfants.get(t.id) ?? []).flatMap(x => (x.status === 'closed' ? ouverts(x) : [x]));
  const racines = tous
    .filter(t => t.issue_type === 'epic' && !t.parent && t.status !== 'closed')
    .sort((a, b) => a.priority - b.priority || ordre(a, b));
  const chantiers = [];
  const autres = [];
  for (const r of racines) {
    const n = noeud(r);
    if (n.etat === 'enCours') {
      chantiers.push(n);
    } else {
      autres.push({ id: n.id, numero: n.numero, sujet: n.sujet, faits: n.faits, total: n.total });
    }
  }
  const duChantier = new Set(
    racines
      .filter(r => chantiers.some(c => c.id === r.id))
      .flatMap(sous)
      .map(t => t.id)
  );
  const etats = etatsDe(duChantier);

  // Agents.
  // One block per step and sub-step, in the order of the steps, with who works there.
  const blocs = SUITE.map(e => ({
    numero: e.numero,
    titre: e.titre,
    roles: e.qui.filter(r => r !== AUTO),
    qui: quiDe(e),
    enCours: [],
  }));
  const bloc = role => {
    const e = etapeDuRole(role);
    return e ? blocs.find(b => b.numero === e.numero) : undefined;
  };
  // One line per ticket: a ticket on which a role agent runs stands at its step.
  for (const v of enCoursMesures) {
    const t = v.ticket && parId.get(v.ticket);
    if (!t || !bloc(v.role)) {
      continue;
    }
    bloc(v.role).enCours.push({
      id: t.id,
      numero: numero(t.id),
      sujet: titre(t).sujet,
      composant: titre(t).composant,
      ligne: v.ligne,
      depuis: v.depuis,
      silence: v.silence ?? null,
      ...mesure(new Set([t.id])),
    });
  }
  const debutJour = jour;
  // The way of a ticket done (grillhouse-592): `direct` when labelled so; else the way its kept
  // results give (`voies`, `voiesDesCircuits`: `court` through 1.1, else `complet`); else
  // `complet` when a circuit led a step of it (the register) or is read for it; else `direct`,
  // closed with no circuit.
  const parUnCircuit = new Set([...etapesFinies.map(r => r.ticket), ...parCircuit.keys()]);
  const voieDe = t =>
    (t.labels ?? []).includes('direct')
      ? 'direct'
      : (voies[t.id] ?? (parUnCircuit.has(t.id) ? 'complet' : 'direct'));
  // A ticket closed with no delivery: a duplicate, superseded (`bd duplicate`, `bd supersede`), or
  // labelled `sans-suite`.
  const sansLivraison = t =>
    (t.dependencies ?? []).some(d => d.type === 'duplicates' || d.type === 'supersedes') ||
    aLabel(t, 'sans-suite');
  // The supervisor leads a direct ticket from its claim to its close (now while it runs): each
  // minute of his tokens is shared among the direct tickets he holds at that minute.
  const tenusEnDirect = tous
    .filter(t => voieDe(t) === 'direct' && Number.isFinite(Date.parse(t.started_at ?? '')))
    .map(t => ({
      id: t.id,
      debut: Math.floor(Date.parse(t.started_at) / 60_000),
      fin: Math.floor((t.closed_at ? Date.parse(t.closed_at) : maintenant) / 60_000),
    }));
  const partDuSuperviseur = new Map();
  for (const [cle, n] of Object.entries(superviseur)) {
    const minute = Number(cle);
    const tenus = tenusEnDirect.filter(x => x.debut <= minute && minute <= x.fin);
    for (const x of tenus) {
      partDuSuperviseur.set(x.id, (partDuSuperviseur.get(x.id) ?? 0) + n / tenus.length);
    }
  }
  const faitsDuJour = tous
    .filter(
      t =>
        travail(t) &&
        !actifs.has(t.id) &&
        !parCircuit.has(t.id) &&
        !estDecouverte(t) &&
        !sansLivraison(t) &&
        t.closed_at &&
        Date.parse(t.closed_at) >= debutJour
    )
    .sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at))
    .map(t => {
      const m = mesure(new Set([t.id]));
      const voie = voieDe(t);
      // A circuit's time is its agents' and steps' working time; a direct ticket's runs from its
      // claim to its close, null without a claim.
      const pris = Date.parse(t.started_at ?? '');
      const dure =
        voie !== 'direct'
          ? m.travail
          : Number.isFinite(pris)
            ? Date.parse(t.closed_at) - pris
            : null;
      const jetons =
        m.jetons + Math.round(voie === 'direct' ? (partDuSuperviseur.get(t.id) ?? 0) : 0);
      return {
        id: t.id,
        numero: numero(t.id),
        sujet: titre(t).sujet,
        voie,
        duree: dure,
        ...m,
        jetons,
      };
    });

  // Alerts, each with its state (`etat`) and the tone of that state (TONS).
  const alertes = [];
  const alerter = (etat, champs) => alertes.push({ etat, ton: TONS[etat], ...champs });
  // The Temporal server does not answer: the board shows the circuits of the last reading that
  // succeeded, whose age the first alert says, or none without one; that alert names the command
  // that tells the state of the service.
  const ageDesCircuits =
    circuitsLusA === null ? '' : ` · circuits lus il y a ${ilYa(maintenant - circuitsLusA)}`;
  if (muet) {
    alerter('panne', { texte: `${SANS_REPONSE_EN} · temporal etat${ageDesCircuits}` });
  } else if (faute) {
    alerter('panne', { texte: `Circuits illisibles : ${faute}${ageDesCircuits}` });
  }
  // Beads did not read: the board shows the tickets of the last reading that succeeded.
  if (fauteTickets) {
    alerter('panne', {
      texte: `Tickets illisibles : ${fauteTickets}${ticketsLusA === null ? '' : ` · tickets lus il y a ${ilYa(maintenant - ticketsLusA)}`}`,
    });
  }
  // The ticket prefix did not read: the project keeps its folder's name, and the alert says why.
  if (echecPrefixe) {
    alerter('panne', { texte: `Préfixe des tickets illisible : ${echecPrefixe}` });
  }
  // A red night says the night it turned red, short enough to stand whole on its line: the local
  // day and month its ticket was opened, the night's date (scripts/nuit.sh), whatever its title names, a
  // commit in older ones.
  for (const t of nuit) {
    const { sujet: titreLu, numero: n } = titre(t);
    const ouvert = Date.parse(t.created_at ?? '');
    const sujet =
      /^La nuit est rouge\b/.test(titreLu) && !Number.isNaN(ouvert)
        ? `Nuit rouge depuis le ${jourEtMois(ouvert)}`
        : titreLu;
    alerter('nuitRouge', {
      signe: '🌙',
      texte: `${sujet} ${n}`,
      sujet,
      numero: n,
      id: t.id,
    });
  }
  // The published version that leads the repository cannot be installed: the orchestration runs on
  // the code of the repository (scripts/aiguillage.mjs).
  if (outil) {
    alerter('outilNonInstallable', {
      signe: '🧰',
      texte: `Outil ${outil.version} non installable : code du dépôt`,
    });
  }
  // A circuit stopped on a question to the supervisor: the tone of that wait, whatever its length,
  // and how long it has waited (from the `depuis` of its stop in the file of the stops gone up);
  // it falls when the circuit leaves the stop. One alert « à corriger » when some wait and no wait
  // lives.
  const depuisDe = new Map(remontees.map(r => [r.cle, r.depuis]));
  const enAttenteDuSuperviseur = [...parCircuit.values()]
    .filter(attendLeSuperviseur)
    .sort((a, b) => ordre({ id: a.ticket }, { id: b.ticket }));
  for (const c of enAttenteDuSuperviseur) {
    const depuis = depuisDe.get(cleDe(c));
    if (depuis === undefined) {
      continue;
    }
    const attendu = Math.max(0, maintenant - depuis);
    alerter('attendLeSuperviseur', {
      signe: '⏳',
      texte: `${numero(c.ticket)} attend le superviseur depuis ${Math.floor(attendu / MINUTE)} min`,
    });
  }
  if (enAttenteDuSuperviseur.length && !attenteQuiVit) {
    alerter('sansAttente', {
      signe: '🔕',
      texte:
        'À corriger : une question au superviseur reste sans réponse, aucune attente ne tourne',
    });
  }
  // The tickets of the queue without their section « ## Architecture », which the queue never
  // starts (scripts/file-des-tickets.mjs): one line names them all, for the supervisor to write it.
  const sansArchitecture = enFileSansArchitecture(tous, { enCours: new Set(parCircuit.keys()) });
  if (sansArchitecture.length) {
    alerter('sansArchitecture', {
      texte: `En file sans architecture : ${sansArchitecture.map(t => numero(t.id)).join(', ')}`,
    });
  }
  for (const b of blocs) {
    for (const x of b.enCours) {
      if (x.ligne && x.silence !== null && x.silence > SILENCE) {
        alerter('silencieux', {
          texte: `${x.numero}, agent ${b.numero} silencieux depuis ${Math.round(x.silence / MINUTE)} min`,
        });
      }
    }
  }
  // A ticket's circuit: from its highest mother still open (an epic is a chantier, not a circuit),
  // that mother and every ticket under it. A circuit lives while an agent runs on one of its
  // tickets: the others wait their turn in the same copy.
  const racineDuCircuit = t => {
    let r = t;
    for (let m = parId.get(r.parent); m && m.issue_type !== 'epic' && m.status !== 'closed';) {
      r = m;
      m = parId.get(r.parent);
    }
    return r;
  };
  const vit = t => actifs.has(t.id) || (enfants.get(t.id) ?? []).some(vit);
  for (const t of tous) {
    if (
      travail(t) &&
      t.status === 'in_progress' &&
      !vit(racineDuCircuit(t)) &&
      t.started_at &&
      maintenant - Date.parse(t.started_at) > SANS_AGENT
    ) {
      alerter('sansRienQuiTourne', {
        signe: '💤',
        texte: `${numero(t.id)} en cours sans rien qui tourne`,
      });
    }
  }
  // Each ticket's own measures: its agents' working time and tokens, running agents included.
  const parTicket = Object.fromEntries(
    [...new Set(mesures.map(m => m.ticket).filter(Boolean))].map(id => [id, mesure(new Set([id]))])
  );
  // The tickets worked out of a circuit: claimed (`in_progress`), no circuit on the server that
  // holds them, a mother of theirs or a ticket under them (a circuit holds its ticket's mothers and
  // children): one that runs or waits for an answer (`attendLeSuperviseur`), never one the
  // supervisor stopped; or labelled `direct` and claimed (led out of the circuit); and no role
  // agent shown at a step. None while the circuits do not read (a silent server, a fault) and no
  // earlier reading is kept, when no ticket can be told out of a circuit.
  const aUneEtape = new Set(blocs.flatMap(b => b.enCours.map(x => x.id)));
  const tenus = new Set(
    [...parCircuit.values()].filter(c => c.vivant || attendLeSuperviseur(c)).map(c => c.ticket)
  );
  const sousUnCircuit = t => tenus.has(t.id) || (enfants.get(t.id) ?? []).some(sousUnCircuit);
  const dansUnCircuit = t => {
    for (let m = parId.get(t.parent); m; m = parId.get(m.parent)) {
      if (tenus.has(m.id)) {
        return true;
      }
    }
    return sousUnCircuit(t);
  };
  const horsCircuit =
    (muet || faute) && circuitsLusA === null
      ? []
      : tous
          .filter(
            t =>
              travail(t) &&
              !aUneEtape.has(t.id) &&
              t.status === 'in_progress' &&
              (!dansUnCircuit(t) || (t.labels ?? []).includes('direct'))
          )
          .sort(ordre)
          .map(t => ({
            id: t.id,
            numero: numero(t.id),
            sujet: titre(t).sujet,
          }));
  // The circuits, in the tickets' order; a ticket worked in direct has its line alone.
  const enDirect = new Set(horsCircuit.map(x => x.id));
  const lesCircuits = [...parCircuit.values()]
    .filter(c => !enDirect.has(c.ticket))
    .sort((a, b) => ordre({ id: a.ticket }, { id: b.ticket }))
    .map(c => ({
      ...c,
      id: c.ticket,
      numero: numero(c.ticket),
      sujet: titre(parId.get(c.ticket)).sujet,
    }));
  return {
    global,
    alertes,
    circuits: lesCircuits,
    horsCircuit,
    chantiers,
    autres,
    agents: blocs,
    maintenant,
    machine,
    places: placesDeLaMachine && {
      ...placesDeLaMachine,
      noms: nommerLesPrises(placesDeLaMachine.tenues ?? [], { racine, prefix }),
    },
    nuit: nuitEnCours,
    faitsDuJour,
    etats,
    parTicket,
  };
}

export const k = n =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1).replace('.', ',')} M`
    : n >= 1e3
      ? `${Math.round(n / 1e3)} k`
      : `${n}`;
export const duree = ms => {
  const min = Math.round(ms / MINUTE);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
};

// The local day and month of the instant <t>, « 16/10 ».
const jourEtMois = t => {
  const d = new Date(t);
  const deux = x => String(x).padStart(2, '0');
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}`;
};

// A time since a sign, « 8 s » under a minute, else as `duree`.
const ilYa = ms => (ms < MINUTE ? `${Math.max(0, Math.round(ms / 1000))} s` : duree(ms));

// The witness of the automatic step of the running circuit <c> at <maintenant>: the progress of
// its pass (` · faits/prévus · <durée>`, the figures once a task wrote, the time since the start
// of the pass, as Bazel's counter); past FIGEE without a sign, ` · figée <durée> ·
// faits/prévus`, the time since the last sign, `fige`, which the line's ⛔ signs. Null without a
// progress.
function temoinDe(c, maintenant) {
  let age;
  let ecoule;
  let compte = '';
  if (c.avancement) {
    age = maintenant - c.avancement.dernier;
    ecoule = maintenant - (c.avancement.debut || c.avancement.dernier);
    const { faits, prevus } = c.avancement;
    if (faits || prevus) {
      compte = `${faits}/${prevus}`;
    }
  } else {
    return null;
  }
  const fige = age > FIGEE;
  return {
    fige,
    texte: fige
      ? ` · figée ${ilYa(age)}${compte ? ` · ${compte}` : ''}`
      : ` · ${compte ? `${compte} · ` : ''}${ilYa(ecoule)}`,
  };
}

// A ticket's time and tokens, « 12 min · 310 k »; nothing when both are zero.
// The sign of a ticket done by its way (grillhouse-592): a full circuit, a short one (1.1 Geste
// mécanique), a ticket led directly.
export const SIGNE_DE_LA_VOIE = Object.freeze({ complet: '●', court: '○', direct: '✎' });

/**
 * The way of the circuit each ticket of <tickets> went, read from its kept results in the main tree
 * <racine> (`.claude/worktrees/<ticket>.fiches.jsonl`, which the circuit writes and keeps once the
 * ticket is done): `court` when the launch of a session carries the object `geste` (1.1 Geste
 * mécanique), else `complet`; a ticket without the file has no entry. A line that does not parse
 * counts nothing.
 * @param {string} racine
 * @param {string[]} tickets
 * @returns {Record<string, 'complet' | 'court'>}
 */
export function voiesDesCircuits(racine, tickets) {
  const out = {};
  for (const id of tickets) {
    let texte;
    try {
      texte = readFileSync(path.join(racine, '.claude', 'worktrees', `${id}.fiches.jsonl`), 'utf8');
    } catch {
      continue;
    }
    const geste = texte.split('\n').some(l => {
      try {
        return JSON.parse(l)?.lancement?.objet === 'geste';
      } catch {
        return false;
      }
    });
    out[id] = geste ? 'court' : 'complet';
  }
  return out;
}

const conso = (ms, jetons) =>
  Math.round(ms / MINUTE) === 0 && !jetons ? '' : `${duree(ms)} · ${k(jetons)}`;

// The columns <s> takes in a terminal: a character one, ⏳ and ⛔ two, as the signs out of the
// basic plane (🔒 💤 🌙), which count two code units, take two.
const colonnes = s => s.length + (s.match(/[⏳⛔]/g)?.length ?? 0);
// The start of <s> that holds in <n> columns, a sign out of the basic plane never split.
const debutDe = (s, n) => {
  let out = '';
  for (const c of s) {
    if (colonnes(out + c) > n) {
      break;
    }
    out += c;
  }
  return out;
};
// A line of `largeur` columns: the left part cut to leave the right part whole.
const couper = (gauche, droite, largeur) => {
  if (!droite) {
    return colonnes(gauche) > largeur ? `${debutDe(gauche, largeur - 1)}…` : gauche;
  }
  const place = largeur - colonnes(droite) - 1;
  const g =
    colonnes(gauche) > place
      ? `${debutDe(gauche, Math.max(place - 1, 0))}…`
      : `${gauche}${' '.repeat(place - colonnes(gauche))}`;
  return `${g} ${droite}`;
};
// A line of `largeur` columns whose left part ends with `suite`, kept whole: what comes before it
// is cut to leave it and the right part whole.
const couperAvant = (gauche, suite, droite, largeur) => {
  if (!suite) {
    return couper(gauche, droite, largeur);
  }
  const place = (droite ? largeur - colonnes(droite) - 1 : largeur) - colonnes(suite);
  const g = colonnes(gauche) > place ? `${debutDe(gauche, Math.max(place - 1, 0))}…` : gauche;
  return couper(`${g}${suite}`, droite, largeur);
};
// The sign of the alert <a>: its kind's (`signe`: 🌙 a red night, 💤 a ticket claimed with
// nothing running), ⚠ for the others.
const signeDe = a => a.signe ?? '⚠';
// A ticket's short name on the line of the lock, whatever its project: its id without the
// project's prefix, which the line already names, « bp-mono-vbwf.320.11 » → « vbwf.320.11 »,
// « SH-ae6.5 » → « ae6.5 ».
const courtDuTicket = id => id.slice(id.lastIndexOf('-') + 1);

// Who holds each place of the machine, in the order of the places: the project of the board (the
// root <racine> of its main tree, its ticket prefix <prefix>) by the short number of its ticket,
// another project by « <sigle> <short number> » (its sigle and its prefix read from its own root),
// a place with no ticket « passe »; a place with no root (a state of before) is the board's.
function nommerLesPrises(tenues, { racine, prefix }) {
  return tenues.map(({ ticket, racine: deLaPrise }) => {
    const ici = !deLaPrise || (racine && path.resolve(deLaPrise) === path.resolve(racine));
    let prefixeDuProjet = prefix;
    if (!ici) {
      try {
        prefixeDuProjet = prefixeDeLaRacine(deLaPrise);
      } catch {
        prefixeDuProjet = '';
      }
    }
    const numero = !ticket
      ? 'passe'
      : prefixeDuProjet && ticket.startsWith(`${prefixeDuProjet}-`)
        ? ticket.slice(prefixeDuProjet.length + 1)
        : courtDuTicket(ticket);
    return ici ? numero : `${sigleDuProjet(deLaPrise).sigle ?? path.basename(deLaPrise)} ${numero}`;
  });
}
// The sign of a ticket's line in AGENTS, by the tone of its state: ▶ what runs, ⛔ what asks for a
// correction, ⏸ a wait, for the machine (grey) or for someone (yellow).
const signeDuTon = ton => (ton === TONS.enCours ? '▶' : ton === 'alerte' ? '⛔' : '⏸');
// The step of the circuit <c>, by its state or its stop.
const etapeDuCircuitLu = c => etapeDuCircuit({ ...c, raison: c.arret });
// A circuit that waits for the supervisor (`attendLeSuperviseur`, the one rule): who must answer
// its question, the supervisor when its stop names no one.
const enQuestion = c => (attendLeSuperviseur(c) ? (c.qui ?? SUPERVISEUR) : null);

/**
 * The state of each ticket's line of AGENTS on the board <t>, the one source of its signs, which
 * AGENTS draws and the head and the status line count. Each circuit (`circuits`, by its ticket):
 * its state (`etat`, whose tone TONS gives), the reason of its wait (`raison`), its tone, its sign
 * and its witness (`temoin`: the lock it holds or waits for, « · <sorte> faits/prévus · <durée> »,
 * « · verrou <sorte> · <durée> », else the progress of its automatic pass, `temoinDe`), in this
 * order: frozen; ended without its issue; its question (to the supervisor or to another); stopped;
 * its wait for the disk, a place (« nuit » while the night holds the machine), the lock, the CI of
 * its queue (5.2, the lock not held) or its first state; else it runs. `lignes`: one entry per
 * ticket's line of AGENTS, its id, its project on a board of several and its sign: each circuit,
 * each ticket led in direct (▶) and each agent shown out of a circuit (▶).
 */
export function etatsDAgents(t) {
  const maintenant = t.maintenant ?? Date.now();
  const p = t.places;
  const enCircuit = new Set((t.circuits ?? []).map(c => c.id));
  const duCircuit = x => Boolean(x.ticket && enCircuit.has(x.ticket));
  const verrouDe = new Map();
  const tenu = t.machine?.detenteur;
  if (tenu && duCircuit(tenu)) {
    const a = tenu.avancement;
    const age = a ? maintenant - a.dernier : 0;
    const compte = a && (a.faits || a.prevus) ? `${a.faits}/${a.prevus}` : '';
    const fige = age > FIGEE;
    const sorte = tenu.sorte.toLocaleLowerCase('fr');
    verrouDe.set(tenu.ticket, {
      fige,
      texte: fige
        ? ` · ${sorte} figée ${ilYa(age)}${compte ? ` · ${compte}` : ''}`
        : ` · ${sorte}${compte ? ` ${compte}` : ''} · ${ilYa(maintenant - (tenu.depuis ?? maintenant))}`,
    });
  }
  for (const w of [...(t.machine?.attentes ?? [])].sort((x, y) => x.depuis - y.depuis)) {
    if (duCircuit(w) && !verrouDe.has(w.ticket)) {
      verrouDe.set(w.ticket, {
        fige: false,
        texte: ` · verrou ${w.sorte.toLocaleLowerCase('fr')} · ${ilYa(maintenant - w.depuis)}`,
      });
    }
  }
  const attendLeVerrou = new Set((t.machine?.attentes ?? []).map(w => w.ticket).filter(Boolean));
  const attendUnePlace = new Set((p?.attentes ?? []).map(w => w.ticket).filter(Boolean));
  const attendLeDisque = new Set((p?.attentes ?? []).filter(w => w.disque).map(w => w.ticket));
  const tientLeVerrou = tenu && duCircuit(tenu) ? tenu.ticket : null;
  const etatDuCircuit = (c, temoin) => {
    if (temoin?.fige) {
      return ['fige', ''];
    }
    if (!c.vivant) {
      const qui = enQuestion(c);
      return c.sansIssue
        ? ['sansIssue', 'fini sans son issue']
        : qui === SUPERVISEUR
          ? ['attendLeSuperviseur', `question au ${SUPERVISEUR}`]
          : qui
            ? ['attendLeResponsable', `question au ${qui}`]
            : ['arrete', 'arrêté'];
    }
    const etape = etapeDuCircuitLu(c);
    return attendLeDisque.has(c.id)
      ? ['attendLeDisque', 'disque']
      : attendUnePlace.has(c.id)
        ? ['attendUnePlace', p?.nuit ? 'nuit' : 'attend une place']
        : attendLeVerrou.has(c.id)
          ? ['attendLeVerrou', '']
          : !etape
            ? ['sansEtape', 'démarre']
            : etape.etat === 'file' && tientLeVerrou !== c.id
              ? ['attendLaCI', 'CI']
              : ['enCours', ''];
  };
  const circuits = new Map();
  for (const c of t.circuits ?? []) {
    const etape = etapeDuCircuitLu(c);
    const temoin =
      verrouDe.get(c.id) ??
      (c.vivant && etape?.qui.includes(AUTO) ? temoinDe(c, maintenant) : null);
    const [etat, raison] = etatDuCircuit(c, temoin);
    circuits.set(c.id, { etat, raison, ton: TONS[etat], signe: signeDuTon(TONS[etat]), temoin });
  }
  const ligne = (x, signe) => ({ id: x.id, projet: x.projet, signe });
  return {
    circuits,
    lignes: [
      ...(t.circuits ?? []).map(c => ligne(c, circuits.get(c.id).signe)),
      ...(t.horsCircuit ?? []).map(x => ligne(x, '▶')),
      ...t.agents.flatMap(b => b.enCours.filter(x => !enCircuit.has(x.id)).map(x => ligne(x, '▶'))),
    ],
  };
}

/**
 * The counts of the signs of AGENTS on the board <t> (`etatsDAgents`), of the project <projet> on a
 * board of several, of all its lines otherwise: `enCours` ▶, `enAttente` ⏸, `arretes` ⛔.
 * @param {any} t
 * @param {string} [projet]
 */
export function comptesDAgents(t, projet) {
  const l = etatsDAgents(t).lignes.filter(x => projet === undefined || x.projet === projet);
  const n = s => l.filter(x => x.signe === s).length;
  return { enCours: n('▶'), enAttente: n('⏸'), arretes: n('⛔') };
}

// The board's lines, `largeur` columns wide, each with its tone (titre, alerte, attention, actif,
// discret, or none), its section (`section`: agents, chantier or faits, in that order) and, for a
// ticket's line, its id (`ticket`), which the pane makes selectable; an epic's line is marked
// `chantier`. The head belongs to agents, the first section; a blank line belongs to the section
// of the title after it. A chantier's « sans go » and « reporté » groups, its « à valider » group
// past SEUIL_REPLI tickets, and the other chantiers beside one in progress fold to their title and
// count: the folded title carries its group's key (`groupe`), and `groupes` receives, under that
// key, the group's lines whole, which the pane opens on its own. The pane and the text show the
// same lines.
export const SEUIL_REPLI = 10;
export function lignes(t, nom, largeur = LARGEUR, groupes = {}) {
  const out = [];
  let section = 'agents';
  // Each line laid down takes the current section.
  const marquer = l => ({ ...l, section });
  const poser = (...l) => out.push(...l.map(marquer));
  const cadre = couper;
  const L = (texte, ton, ticket) => poser(ticket ? { texte, ton, ticket } : { texte, ton });
  // A board of several projects (`projets`, scripts/tableau.mjs `ensemble`): each line of a ticket,
  // a chantier or an alert carries its project's label, « [SH] »; one project's board, none.
  const plusieurs = Array.isArray(t.projets);
  const duProjet = x => (plusieurs ? `[${x.projet}] ` : '');
  // The labels' column of the head and of AGENTS, « [OB]  », « [OSD] ».
  const large = Math.max(0, ...(t.projets ?? []).map(p => p.etiquette.length + 3));
  const colonneDe = etiquette => `[${etiquette}]`.padEnd(large);
  L(nom.toUpperCase(), TONS.titre);
  // The state of each ticket's line of AGENTS, which AGENTS draws and the head counts.
  const etats = etatsDAgents(t);
  // The first line of the head, the signs of AGENTS counted (`comptesDAgents`) as AGENTS signs its
  // lines, then the tickets done: « ▶ N · ⏸ N · ⛔ N · N faits ».
  const ligneDesSignes = (a, fermes) =>
    `▶ ${a.enCours} · ⏸ ${a.enAttente} · ⛔ ${a.arretes} · ${fermes} faits`;
  // The line of the queues: the circuit's, the direct one, then the tickets blocked by an open
  // ticket; where it does not hold, its label « file : » gives way.
  const ligneDeLaFile = (c, place) =>
    [
      `⏭ file : ${c.enAttente} en circuit · ${c.fileDirecte ?? 0} en direct · ${c.bloques ?? 0} bloqués`,
      `⏭ ${c.enAttente} en circuit · ${c.fileDirecte ?? 0} en direct · ${c.bloques ?? 0} bloqués`,
    ].find((x, i, l) => colonnes(x) <= place || i === l.length - 1);
  if (plusieurs) {
    // The three lines of states of each project, as one project's board says them: the first
    // under its label, the two others aligned below it; or the fault that keeps its board out.
    const retrait = ' '.repeat(large);
    for (const p of t.projets) {
      if (p.erreur) {
        L(cadre(`${colonneDe(p.etiquette)}⚠ ${p.erreur}`, '', largeur), TONS.panne);
        continue;
      }
      const c = p.compteurs;
      const place = largeur - colonnes(retrait);
      L(
        cadre(
          `${colonneDe(p.etiquette)}${ligneDesSignes(comptesDAgents(t, p.etiquette), c.fermes)}`,
          '',
          largeur
        )
      );
      L(cadre(`${retrait}${ligneDeLaFile(c, place)}`, '', largeur));
      L(
        cadre(
          `${retrait}${c.sansGo ?? 0} sans go · ${c.aValider ?? 0} à valider · ${c.reportes ?? 0} reportés`,
          '',
          largeur
        ),
        c.sansGo ? TONS.sansGo : c.aValider ? TONS.aValider : TONS.reportes
      );
    }
    // The discoveries of the day, summed across the projects (grillhouse-3uv.96, criterion 14).
    const d96 = t.decouvertes ?? { new: 0, check: 0, rejetes: 0, valides: 0 };
    L(
      cadre(
        `🔍 ${d96.new} new · ${d96.check} →check · ${d96.rejetes} rejetés · ${d96.valides} validés`,
        '',
        largeur
      ),
      TONS.mesure
    );
  } else {
    const g = t.global;
    const c = g.compteurs;
    // Three lines of states: the signs of AGENTS and the tickets done, the queues (the circuit's,
    // the direct one, the blocked), then those that wait for the owner.
    L(cadre(ligneDesSignes(comptesDAgents(t), c.fermes), '', largeur));
    L(cadre(ligneDeLaFile(c, largeur), '', largeur));
    L(
      cadre(`${c.sansGo} sans go · ${c.aValider} à valider · ${c.reportes} reportés`, '', largeur),
      c.sansGo ? TONS.sansGo : c.aValider ? TONS.aValider : TONS.reportes
    );
    // The discoveries of the day, one count per case (grillhouse-3uv.96): always shown, at 0 when
    // nothing counts, like the other head lines.
    const d = g.decouvertes ?? { new: 0, check: 0, rejetes: 0, valides: 0 };
    L(
      cadre(
        `🔍 ${d.new} new · ${d.check} →check · ${d.rejetes} rejetés · ${d.valides} validés`,
        '',
        largeur
      ),
      TONS.mesure
    );
    L(
      cadre(
        `jour ${duree(g.jour.travail)} · ${k(g.jour.jetons)} · cumul ${duree(g.cumul.travail)} · ${k(g.cumul.jetons)}`,
        '',
        largeur
      ),
      TONS.mesure
    );
  }
  // An alert of several projects' board names its ticket by its whole id.
  for (const a of t.alertes) {
    const droite = plusieurs ? (a.id ?? a.numero) : a.numero;
    L(
      droite
        ? cadre(`${signeDe(a)} ${duProjet(a)}${a.sujet}`, droite, largeur)
        : cadre(`${signeDe(a)} ${duProjet(a)}${a.texte}`, '', largeur),
      a.ton
    );
  }

  L('', undefined);
  L('AGENTS  ▶ en cours · en attente', TONS.titre);
  // The lock of the machine (scripts/avancement.mjs `lireLaMesure`): a holder or a wait of a
  // circuit shown stands on its line (`verrouDe`); any other at the head: its holder, whoever it
  // is, « 🔒 <sorte> · <projet> · <qui> · faits/prévus · <durée> », the time since it took the
  // lock, the figures when it has them; past FIGEE without a sign of its progress « ⚠ <sorte>
  // figée <durée> · <projet> · <qui> · faits/prévus », in the tone of an alert. Then each wait,
  // the oldest first, « ⏳ <sorte> · <projet> · <qui> · attend · <durée> ».
  const maintenant = t.maintenant ?? Date.now();
  // The places of the machine (scripts/places-de-la-machine.mjs), the first line of AGENTS:
  // « Places 3/3 · charge 11,2/12 · mémoire 9/30 Go », the places taken of the ceiling, the load
  // over one minute of the cores, the free memory of the total; a value of the ceiling the poste names and the
  // server refused, in place of the load and the memory, by its name.
  const p = t.places;
  if (p) {
    const nb = n => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
    // Who holds each place stands between the count and the load: the most names that keep the
    // line within the width, the others counted « +n ».
    const noms = p.noms ?? [];
    const suite = p.faute
      ? `plafond refusé : ${p.faute}`
      : `charge ${nb(p.charge)}/${p.coeurs} · mémoire ${p.memoireGo}/${p.memoireTotaleGo} Go`;
    const ligne = k =>
      `Places ${p.prises}/${p.plafond} · ${
        noms.length
          ? `${[noms.slice(0, k).join(', '), ...(k < noms.length ? [`+${noms.length - k}`] : [])]
              .filter(Boolean)
              .join(' ')} · `
          : ''
      }${suite}`;
    let k = noms.length;
    while (k > 0 && colonnes(ligne(k)) > largeur) {
      k--;
    }
    poser({
      texte: cadre(ligne(k), '', largeur),
      ton: p.faute ? TONS.plafondRefuse : p.charge >= p.coeurs ? TONS.machineChargee : TONS.mesure,
    });
    // A ticket that waits for the disk of its project's copies: what holds it, the ticket named.
    for (const w of (p.attentes ?? []).filter(x => x.disque)) {
      poser({
        texte: cadre(`⏳ ${courtDuTicket(w.ticket)} · ${w.disque}`, '', largeur),
        ton: TONS.attendLeDisque,
        ticket: w.ticket,
      });
    }
    // The night reserving the machine (`nuit` of the places: `attend`, `en cours`, none outside
    // the night): the stages under way finish, then the nights play.
    if (p.nuit) {
      poser({
        texte: cadre(
          p.nuit === 'attend' ? 'nuit : attend la fin des étapes en cours' : 'nuit en cours',
          '',
          largeur
        ),
        ton: p.nuit === 'attend' ? TONS.attendLeDisque : TONS.nuitEnCours,
      });
    }
  }
  // The night under way on the machine, under the places: « 🌙 nuit · <projet> · depuis <durée> »,
  // its project by its folder's name, the time since it started when the server gives it.
  if (t.nuit) {
    const depuis =
      typeof t.nuit.depuis === 'number' ? ` · depuis ${duree(maintenant - t.nuit.depuis)}` : '';
    poser({
      texte: couperAvant(`🌙 nuit · ${path.basename(t.nuit.racine)}`, depuis, '', largeur),
      ton: TONS.nuitEnCours,
    });
  }
  const enCircuit = new Set((t.circuits ?? []).map(c => c.id));
  const duCircuit = x => Boolean(x.ticket && enCircuit.has(x.ticket));
  // The project of a holder or a wait, none for the board's project on one project's board.
  const projetDe = x => (x.ici && !plusieurs ? null : x.projet);
  // What names a holder or a wait: its ticket, else the folder of its copy, the main tree's only
  // when the project is not named (it would say the project twice).
  const quiDuVerrou = x =>
    x.ticket
      ? courtDuTicket(x.ticket)
      : x.copie && (x.copie !== x.depot || !projetDe(x))
        ? path.basename(x.copie)
        : null;
  // A line of the lock « <tete> · <projet> · <qui><fin> », <fin> the first of <fins> that holds
  // (« · attend · <durée> », else « · <durée> »: ⏳ already says the wait); the project is cut
  // first, then left out, then <qui> is cut, never <tete> nor <fin>.
  const ligneDuVerrou = (tete, x, ...fins) => {
    const qui = quiDuVerrou(x);
    const avecQui = `${tete}${qui ? ` · ${qui}` : ''}`;
    const fin = fins.find(f => colonnes(`${avecQui}${f}`) <= largeur) ?? fins[fins.length - 1];
    const projet = projetDe(x);
    const place = largeur - colonnes(`${avecQui}${fin}`) - 3;
    if (projet && place >= 2) {
      const p = colonnes(projet) > place ? `${debutDe(projet, place - 1)}…` : projet;
      return `${tete} · ${p}${qui ? ` · ${qui}` : ''}${fin}`;
    }
    return couperAvant(avecQui, fin, '', largeur);
  };
  // The lock of each circuit shown stands on its line (`etatsDAgents`); any other, here.
  const tenu = t.machine?.detenteur;
  if (tenu && !duCircuit(tenu)) {
    const a = tenu.avancement;
    const age = a ? maintenant - a.dernier : 0;
    const compte = a && (a.faits || a.prevus) ? `${a.faits}/${a.prevus}` : '';
    const fige = age > FIGEE;
    const depuis = ilYa(maintenant - (tenu.depuis ?? maintenant));
    poser({
      texte: fige
        ? ligneDuVerrou(`⚠ ${tenu.sorte} figée ${ilYa(age)}`, tenu, compte ? ` · ${compte}` : '')
        : ligneDuVerrou(`🔒 ${tenu.sorte}`, tenu, ` · ${compte ? `${compte} · ` : ''}${depuis}`),
      ton: fige ? TONS.fige : TONS.enCours,
      avancement: true,
    });
  }
  for (const w of [...(t.machine?.attentes ?? [])].sort((x, y) => x.depuis - y.depuis)) {
    if (duCircuit(w)) {
      continue;
    }
    poser({
      texte: ligneDuVerrou(
        `⏳ ${w.sorte}`,
        w,
        ` · attend · ${ilYa(maintenant - w.depuis)}`,
        ` · ${ilYa(maintenant - w.depuis)}`
      ),
      ton: TONS.attendLeVerrou,
      avancement: true,
    });
  }
  // The tickets that wait for a place of a circuit, not started, whose line in their chantier says
  // « attend une place ».
  const attendUnePlace = new Set((p?.attentes ?? []).map(w => w.ticket).filter(Boolean));
  // The tickets that wait for the disk of their project's copies.
  const attendLeDisque = new Set((p?.attentes ?? []).filter(w => w.disque).map(w => w.ticket));
  // The tree of the steps (scripts/etapes.mjs), in its order, as a pipeline of GitLab CI shows its
  // stages and folds the jobs of a stage that has nothing: a step with sub-steps is folded
  // (« ▸ 2 · Composants ») while none of them holds a ticket, unfolded (« ▾ ») once one does, all
  // its sub-steps then shown, indented, the empty ones in the discreet tone; a step without
  // sub-steps stands on one line « number · title · who », discreet when empty, a title with its
  // tickets under it. A circuit launched and not integrated stands on one line from its launch to
  // its end, and nowhere else in AGENTS: at the step that works, or, while it waits, at the step
  // about to be launched: the step of its state; the work on the plan at its step; a running
  // circuit with no known step at the step of its stop, else at the plan (1); waiting for the
  // supervisor (`attendLeSuperviseur`), under its step after a line « ⤷ Question · <qui> », who
  // must answer it, the supervisor or the owner, which unfolds the step, its counters those of its
  // step; a stopped circuit at no step of the list stands under that line after the steps. A
  // circuit's line gives its subject (`texte`), then the counters of the bounded loops of its step
  // from their second pass (`boucles` of the step, scripts/etapes.mjs, their counts in the state's
  // `boucles`), whole, the reason of its wait; then its ticket's working time and tokens. Its card
  // opens on its question, or says where it stopped and why. The tickets' numbers line up in one
  // column.
  // The block of the step <e>, an empty one when the board holds none.
  const vides = new Map();
  const blocDe = e =>
    t.agents.find(b => b.numero === e.numero) ??
    vides.get(e.numero) ??
    vides
      .set(e.numero, {
        numero: e.numero,
        titre: e.titre,
        qui: quiDe(e),
        enCours: [],
      })
      .get(e.numero);
  // The block of the circuits at no step of the list, after the steps.
  const ailleurs = { numero: null, titre: '', qui: '', enCours: [] };
  const etapeDe = etapeDuCircuitLu;
  // The block of the circuit <c>: the step of its state, else, while it stopped, the block after
  // the steps, else, running with no known step (it starts or resumes), the plan (1).
  const blocDuCircuit = c => {
    const e = etapeDe(c);
    return e ? blocDe(e) : !c.vivant ? ailleurs : blocDe(ETAPES[0]);
  };
  const montres = t.agents.flatMap(b => b.enCours.filter(x => !enCircuit.has(x.id)));
  // A ticket's number, or on several projects' board its whole id, in one column.
  const nomme = x => String(plusieurs ? x.id : x.numero);
  const colonne = Math.max(
    0,
    ...[...(t.circuits ?? []), ...(t.horsCircuit ?? []), ...montres].map(x => nomme(x).length)
  );
  // A ticket's line in AGENTS: « <signe> <numéro>  <sujet> … <droite> »; on several projects'
  // board « <[projet]> <id>  <sujet> … <signe> <droite> », the owner's maquette (grillhouse-erp.1).
  const teteDe = (signe, x) =>
    plusieurs
      ? `${colonneDe(x.projet)}${nomme(x).padEnd(colonne)}  `
      : `${signe} ${nomme(x).padEnd(colonne)}  `;
  const droiteDe = (signe, droite) =>
    plusieurs ? `${signe}${droite ? ` ${droite}` : ''}` : droite;
  // A ticket's line of `largeur` columns: its head <tete> (its sign and number, or its project and
  // id) whole, then its subject, cut to leave <suite> and the right part <droite> whole; without
  // room for the subject, <suite> is cut, never the head.
  const ligneDuTicket = (tete, sujet, suite, droite) => {
    const place = largeur - colonnes(tete) - colonnes(suite) - (droite ? colonnes(droite) + 1 : 0);
    if (place < 2) {
      return couper(`${tete}${suite}`, droite, largeur);
    }
    const s = colonnes(sujet) > place ? `${debutDe(sujet, place - 1)}…` : sujet;
    return couper(`${tete}${s}${suite}`, droite, largeur);
  };
  const ligneDuCircuit = c => {
    const etape = etapeDe(c);
    // Its state, its sign, its reason and its witness, as the head counts them.
    const { ton, signe, raison, temoin } = etats.circuits.get(c.id);
    const droite = droiteDe(
      signe,
      conso(t.parTicket?.[c.id]?.travail ?? 0, t.parTicket?.[c.id]?.jetons ?? 0)
    );
    const boucles = (etape ? bouclesDe(etape) : [])
      .filter(b => b.max && c.boucles?.[b.cle] >= 2)
      .map(b => ` · ${b.libelle} ${c.boucles[b.cle]}/${b.max}`)
      .join('');
    const tete = teteDe(signe, c);
    const pourquoi = raison ? ` · ${raison}` : '';
    // The progress after the counters of the loops while the subject keeps its room beside them,
    // in their place otherwise; the reason of its wait last.
    const reste = avec =>
      largeur - (droite ? colonnes(droite) + 1 : 0) - colonnes(tete) - colonnes(avec);
    const suite = `${
      !temoin
        ? boucles
        : reste(`${boucles}${temoin.texte}${pourquoi}`) >= Math.min(PLACE_DU_SUJET, c.sujet.length)
          ? `${boucles}${temoin.texte}`
          : temoin.texte
    }${pourquoi}`;
    poser({
      texte: ligneDuTicket(tete, c.sujet, suite, droite),
      ton,
      ticket: c.id,
      ...(temoin ? { avancement: true } : {}),
    });
  };
  const contenu = b => {
    const tous = (t.circuits ?? []).filter(c => blocDuCircuit(c) === b);
    const circuits = tous.filter(c => !enQuestion(c));
    // The circuits on a question, by who must answer it, the supervisor first.
    const enQuestions = [SUPERVISEUR, ...new Set(tous.map(enQuestion).filter(Boolean))]
      .filter((qui, i, l) => l.indexOf(qui) === i)
      .map(qui => [qui, tous.filter(c => enQuestion(c) === qui)])
      .filter(([, l]) => l.length);
    const enCours = b.enCours.filter(x => !enCircuit.has(x.id));
    return {
      circuits,
      enQuestions,
      enCours,
      vide: !tous.length && !enCours.length,
    };
  };
  const contenus = new Map([...SUITE.map(blocDe), ailleurs].map(b => [b, contenu(b)]));
  // The tickets of the block <b>: its circuits without a question, its agents, then
  // for each one who must answer, the line « ⤷ Question · <qui> », indented by <retrait>, and its
  // circuits.
  const tickets = (b, retrait) => {
    const { circuits, enQuestions, enCours } = contenus.get(b);
    for (const c of circuits) {
      ligneDuCircuit(c);
    }
    for (const x of enCours) {
      L(
        ligneDuTicket(teteDe('▶', x), x.sujet, '', droiteDe('▶', conso(x.travail, x.jetons))),
        TONS.enCours,
        x.id
      );
    }
    for (const [qui, l] of enQuestions) {
      L(cadre(`${retrait}⤷ Question · ${qui}`, '', largeur), TONS.titre);
      for (const c of l) {
        ligneDuCircuit(c);
      }
    }
  };
  const ligneDEtape = (b, retrait, plein = !contenus.get(b).vide) =>
    L(
      cadre(`${retrait}${b.numero} · ${b.titre}${b.qui ? ` · ${b.qui}` : ''}`, '', largeur),
      plein ? TONS.titre : TONS.vide
    );
  // The tickets worked out of a circuit, once each, before the steps, from their claim to their
  // close: « ▶ <numéro>  <sujet> · en direct ».
  for (const x of t.horsCircuit ?? []) {
    poser({
      texte: ligneDuTicket(teteDe('▶', x), x.sujet, ' · en direct', droiteDe('▶', '')),
      ton: TONS.enDirect,
      ticket: x.id,
    });
  }
  for (const e of ETAPES) {
    const b = blocDe(e);
    const lesSous = e.sous ?? [];
    if (!lesSous.length) {
      // Its number stands under those of the steps a fold mark opens.
      ligneDEtape(b, '  ');
      tickets(b, '  ');
      continue;
    }
    const sous = lesSous.map(blocDe);
    const ouverte = [b, ...sous].some(x => !contenus.get(x).vide);
    ligneDEtape(b, ouverte ? '▾ ' : '▸ ', ouverte);
    if (!ouverte) {
      continue;
    }
    tickets(b, '  ');
    for (const x of sous) {
      ligneDEtape(x, '  ');
      tickets(x, '  ');
    }
  }
  // A stopped circuit at no step of the list, after the steps.
  if (!contenus.get(ailleurs).vide) {
    tickets(ailleurs, '');
  }

  section = 'chantier';
  // The tickets the agents' blocks show: the chantier's tree does not show them a second time.
  const dansAgents = new Set([
    ...(t.circuits ?? []).map(c => c.id),
    ...(t.horsCircuit ?? []).map(x => x.id),
    ...t.agents.flatMap(b => b.enCours.map(x => x.id)),
  ]);
  for (const ch of t.chantiers) {
    L('', undefined);
    poser({
      texte: cadre(`CHANTIER ${duProjet(ch)}${ch.numero} — ${ch.sujet}`, '', largeur),
      ton: TONS.titre,
      ticket: ch.id,
      chantier: true,
    });
    L(
      cadre(
        `  ${ch.faits}/${ch.total} faits · ${duree(ch.travail)} · ${k(ch.jetons)} jetons`,
        '',
        largeur
      ),
      TONS.mesure
    );
    const arbre = [];
    const marque = n =>
      n.etat === 'enCours'
        ? '▶'
        : n.etat === 'bloques' && n.bloquePar.length
          ? `attend ${n.bloquePar.join(', ')}`
          : n.etat === 'aValider'
            ? '? à valider'
            : n.etat === 'sansGo'
              ? 'sans go'
              : n.etat === 'enAttente'
                ? 'en attente'
                : n.etat === 'reportes'
                  ? 'reporté'
                  : n.etat === 'fermes'
                    ? '✓'
                    : '';
    // Every open ticket of the chantier has its line under the title of its state, the states in
    // their order, the tickets in their numbers' order. A ticket an agent block shows stands there
    // alone; its children keep their lines.
    // The state of a ticket's line, whose tone TONS gives: a ticket in the queue that waits for the
    // disk or a place, else its state.
    const etatDuNoeud = n =>
      !n.mere && n.etat === 'enAttente' && attendLeDisque.has(n.id)
        ? 'attendLeDisque'
        : !n.mere && n.etat === 'enAttente' && attendUnePlace.has(n.id)
          ? 'attendUnePlace'
          : n.etat;
    const ligneDe = n => {
      const conso = n.jetons ? ` · ${k(n.jetons)}` : '';
      const etat = etatDuNoeud(n);
      const droite = n.mere
        ? `${n.faits}/${n.total}${conso}${n.etat === 'bloques' ? ` ${marque(n)}` : ''}`
        : n.etat === 'enCours'
          ? `${duree(n.travail)}${conso}`
          : n.etat === 'bloques'
            ? marque(n)
            : etat === 'attendLeDisque'
              ? 'attend le disque'
              : etat === 'attendUnePlace'
                ? 'attend une place'
                : '';
      return {
        texte: cadre(`   ${duProjet(n)}${n.numero}  ${n.sujet}`, droite, largeur),
        ton: TONS[etat],
        ticket: n.id,
      };
    };
    const parEtat = new Map(ETATS.map(e => [e.cle, []]));
    const parcourir = noeuds => {
      for (const n of noeuds) {
        if (n.mere || !dansAgents.has(n.id)) {
          parEtat.get(n.etat)?.push(n);
        }
        parcourir(n.enfants);
      }
    };
    parcourir(ch.enfants);
    for (const e of ETATS) {
      const liste = parEtat.get(e.cle);
      if (!liste.length) {
        continue;
      }
      const titreDuGroupe = {
        texte: cadre(`  ${e.nom}`, `${liste.length}`, largeur),
        ton: TONS.titre,
      };
      const replie =
        e.cle === 'sansGo' ||
        e.cle === 'reportes' ||
        (e.cle === 'aValider' && liste.length > SEUIL_REPLI);
      if (replie) {
        const cle = `${ch.id}/${e.cle}`;
        groupes[cle] = [titreDuGroupe, ...liste.map(ligneDe)].map(marquer);
        arbre.push({
          texte: cadre(`  ${e.nom} ›`, `${liste.length}`, largeur),
          ton: TONS.titre,
          groupe: cle,
        });
        continue;
      }
      arbre.push(titreDuGroupe);
      arbre.push(...liste.map(ligneDe));
    }
    poser(...arbre);
  }
  // The epics not in progress, under their title (« AUTRES CHANTIERS » beside one in progress,
  // « CHANTIERS » alone), each on its line, selectable, and a chantier (`chantier`) the pane can
  // switch.
  if (t.autres.length) {
    L('', undefined);
    const autres = t.autres.map(a => ({
      texte: cadre(`${duProjet(a)}${a.numero}  ${a.sujet}`, `${a.faits}/${a.total}`, largeur),
      ticket: a.id,
      chantier: true,
    }));
    if (t.chantiers.length) {
      groupes.autres = [
        { texte: cadre('AUTRES CHANTIERS', `${t.autres.length}`, largeur), ton: TONS.titre },
        ...autres,
      ].map(marquer);
      poser({
        texte: cadre('AUTRES CHANTIERS ›', `${t.autres.length}`, largeur),
        ton: TONS.titre,
        groupe: 'autres',
      });
    } else {
      L(cadre('CHANTIERS', `${t.autres.length}`, largeur), TONS.titre);
      poser(...autres);
    }
  }

  if (t.faitsDuJour.length) {
    section = 'faits';
    L('', undefined);
    // The title carries the day's total: tickets, working time and tokens of the facts below.
    const n = t.faitsDuJour.length;
    const temps = t.faitsDuJour.reduce((s, x) => s + x.travail, 0);
    const jetons = t.faitsDuJour.reduce((s, x) => s + x.jetons, 0);
    L(
      cadre(
        "FAITS AUJOURD'HUI",
        `${n} ticket${n > 1 ? 's' : ''} · ${duree(temps)} · ${k(jetons)}`,
        largeur
      ),
      TONS.titre
    );
    // Each line: the sign of its way, then « <durée> · <jetons> », « — » for a direct ticket never
    // claimed.
    const fait = x => ({
      texte: cadre(
        `${SIGNE_DE_LA_VOIE[x.voie] ?? SIGNE_DE_LA_VOIE.direct} ${duProjet(x)}${x.numero}  ${x.sujet}`,
        `${x.duree === null || x.duree === undefined ? '—' : duree(x.duree)} · ${k(x.jetons)}`,
        largeur
      ),
      ton: TONS.fermes,
      ticket: x.id,
    });
    poser(...t.faitsDuJour.map(fait));
  }
  return out;
}

// The states' view, `largeur` columns wide: each state, its meaning, then the tickets of the
// chantiers in progress one per line, each with its agents' time and tokens (a blocked one, what
// it waits for), selectable as the board's are; section `etats`.
export function lignesEtats(t, largeur = LARGEUR) {
  const out = [];
  for (const e of t.etats) {
    if (out.length) {
      out.push({ texte: '', section: 'etats' });
    }
    out.push({
      texte: couper(`${e.nom.toUpperCase()} — ${e.sens}`, `${e.tickets.length}`, largeur),
      ton: TONS.titre,
      section: 'etats',
    });
    if (!e.tickets.length) {
      out.push({ texte: '  —', ton: TONS.vide, section: 'etats' });
    }
    for (const x of e.tickets) {
      out.push({
        texte: couper(
          `  ${x.projet ? `[${x.projet}] ` : ''}${x.numero}  ${x.sujet}`,
          e.cle === 'bloques' && x.bloquePar.length
            ? `attend ${x.bloquePar.join(', ')}`
            : conso(t.parTicket[x.id]?.travail ?? 0, t.parTicket[x.id]?.jetons ?? 0),
          largeur
        ),
        ton: TONS[e.cle],
        ticket: x.id,
        section: 'etats',
      });
    }
  }
  return out;
}

// Where the stopped circuit <c> is: its step by number and title, its attempt, and its stop, with
// its code when it has one.
const ouEnEst = c => {
  const e = etapeDuCircuit({ ...c, raison: c.arret });
  const ou = [e ? libelle(e) : c.etape, c.tentative ?? null]
    .filter(x => x !== null && x !== undefined)
    .join(' ');
  const arret = `arrêt ${c.arret ?? '?'}${c.code === null ? '' : ` (${c.code})`}`;
  return `${ou}, ${arret}`;
};

// The card of each ticket a line names: its number, whole title, component, state, its agents'
// working time and tokens (`mesures`: ticket → { travail, jetons }) and the start of its
// description (`resume`), after the key figures of its bilan when the circuit kept one (`bilans`:
// ticket → its bilan, scripts/bilan.mjs). The pane reads the whole description from Beads when the
// card fills it.
export function fiches(
  tous,
  lignesDuTableau,
  prefix = '',
  mesures = {},
  circuits = [],
  bilans = {}
) {
  const arretes = new Map(circuits.filter(c => !c.vivant).map(c => [c.ticket, c]));
  const liens = new Map(circuits.filter(c => c.lien).map(c => [c.ticket, c.lien]));
  const ids = new Set(lignesDuTableau.map(l => l.ticket).filter(Boolean));
  const out = {};
  for (const t of tous) {
    if (!ids.has(t.id)) {
      continue;
    }
    const resume = (t.description ?? '')
      .split('\n')
      .map(x => x.trim())
      .filter(x => x && !x.startsWith('#'))
      .join(' ');
    // A stopped circuit's card opens on its question and who must answer it, or on where it
    // stopped and why; a circuit whose workflow ended without its issue, on the answers the client
    // accepts (`reponse`), named once.
    const a = arretes.get(t.id);
    const reprise = a?.sansIssue && a.reponse ? ` \`${a.reponse}\` le reprend.` : '';
    const tete = a?.question
      ? `Question · ${a.qui ?? SUPERVISEUR} : ${a.question.replace(/\s+/g, ' ')}${reprise} `
      : a
        ? `Circuit arrêté en ${ouEnEst(a)} : ${a.raison ?? 'le circuit ne tourne plus'} `
        : '';
    const chiffres = bilans[t.id] ? `${enBref(bilans[t.id])} ` : '';
    const texte = `${tete}${chiffres}${resume}`;
    // The card of a ticket with a circuit ends on the page of its workflow on the web UI of the
    // server, whole, after the text.
    const lien = liens.has(t.id) ? `\nTemporal : ${liens.get(t.id)}` : '';
    out[t.id] = {
      numero: lecture(t, prefix).numero,
      titre: lecture(t, prefix).sujet,
      composant: lecture(t, prefix).composant,
      statut: t.status,
      travail: mesures[t.id]?.travail ?? 0,
      jetons: mesures[t.id]?.jetons ?? 0,
      resume: `${texte.length > 400 ? `${texte.slice(0, 399)}…` : texte}${lien}`,
    };
  }
  return out;
}

// Of the tickets the lines name, the one that moved last: a running agent's ticket at its last
// activity, any other at its last update; null when none.
export function dernierBouge(tous, lignesDuTableau, vivants = [], maintenant = Date.now()) {
  const ids = new Set(lignesDuTableau.map(l => l.ticket).filter(Boolean));
  const actif = new Map();
  for (const v of vivants) {
    if (v.ticket) {
      const quand = maintenant - (v.silence ?? 0);
      actif.set(v.ticket, Math.max(actif.get(v.ticket) ?? 0, quand));
    }
  }
  let dernier = null;
  let plusTard = -Infinity;
  for (const t of tous) {
    if (!ids.has(t.id)) {
      continue;
    }
    const quand = Math.max(
      actif.get(t.id) ?? -Infinity,
      Date.parse(t.updated_at ?? t.closed_at ?? t.created_at ?? '') || -Infinity
    );
    if (quand > plusTard) {
      plusTard = quand;
      dernier = t.id;
    }
  }
  return dernier;
}

// The status line: the chantier in progress; first the alerts, counted by their signs as the board
// shows them (🌙, 💤, ⚠), then the holder of the lock of the machine, « 🔒 <sorte> · <projet> »,
// and the count of its waits, « ⏳ <n> »; then the signs of AGENTS counted as the head counts them
// (`comptesDAgents`), « ▶ N · ⏸ N · ⛔ N ». The alerts of the other projects of a board of several
// (<voisins>, their boards) count beside the session's, as a multi-root status bar counts the problems
// of every root; the counters and the chantier stay the session's.
export function ligneEtat(t, voisins = []) {
  const signes = [t, ...voisins].flatMap(b => b.alertes ?? []).map(signeDe);
  const tenu = t.machine?.detenteur;
  const attentes = t.machine?.attentes?.length ?? 0;
  const alerte = [
    ...[...new Set(signes)].map(s => `${s} ${signes.filter(x => x === s).length}`),
    ...(tenu ? [`🔒 ${tenu.sorte} · ${tenu.projet}`] : []),
    ...(attentes ? [`⏳ ${attentes}`] : []),
  ]
    .map(x => `${x} · `)
    .join('');
  const ch = t.chantiers[0];
  const c = t.global.compteurs;
  const a = comptesDAgents(t);
  const dAgents = `▶ ${a.enCours} · ⏸ ${a.enAttente} · ⛔ ${a.arretes}`;
  if (!ch) {
    return `${alerte}Grillhouse : ${dAgents} · ⏭ ${c.enAttente} · ✎ ${c.fileDirecte} · ${c.fermes} faits`;
  }
  return `${alerte}${ch.numero} ${ch.faits}/${ch.total} · ${dAgents} · ${k(t.global.jour.jetons)} aujourd'hui`;
}

// The answer of Beads to <args> in the repository at <racine>, as JSON (`liste`), or the first line
// of its fault (`faute`), its error output first.
const bdJson = (racine, ...args) => {
  try {
    return {
      liste: JSON.parse(
        execFileSync('bd', [...args, '--json'], {
          cwd: racine,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 256 * 1024 * 1024,
        })
      ),
      faute: null,
    };
  } catch (e) {
    const message = String(e?.stderr ?? '').trim() || String(e?.message ?? e);
    return { liste: [], faute: message.split('\n')[0] };
  }
};

// The file of the last reading that succeeded of <quoi> (`circuits`, `tickets`), beside the
// status line in the common dir <commun>; null without a common dir.
const fichierDeLaLecture = (commun, quoi) => commun && path.join(commun, `tableau-lu-${quoi}.json`);

/**
 * The reading of <quoi> (`circuits`, `tickets`) of the project whose common dir is <commun>, kept
 * when it succeeded, as a dashboard keeps showing its last data with their age: a reading that
 * succeeded (<liste>, not null) is written with its time <maintenant> and comes back as it is,
 * `lu` null; a reading that failed (<liste> null) comes back as the last one kept, `lu` its time,
 * or empty, `lu` null, without one. A place that cannot be written or read keeps none.
 * @param {string | null} commun
 * @param {'circuits' | 'tickets'} quoi
 * @param {any[] | null} liste
 * @param {number} maintenant
 * @returns {{ liste: any[], lu: number | null }}
 */
export function lectureGardee(commun, quoi, liste, maintenant) {
  const fichier = fichierDeLaLecture(commun, quoi);
  if (liste) {
    try {
      if (fichier) {
        // Written beside, then renamed: a reader never sees a file half written.
        writeFileSync(`${fichier}.${process.pid}`, JSON.stringify({ lu: maintenant, liste }));
        renameSync(`${fichier}.${process.pid}`, fichier);
      }
    } catch {
      // A read-only place keeps the board working, without the reading kept.
    }
    return { liste, lu: null };
  }
  try {
    const garde = JSON.parse(readFileSync(fichier, 'utf8'));
    if (Array.isArray(garde.liste) && typeof garde.lu === 'number') {
      return { liste: garde.liste, lu: garde.lu };
    }
  } catch {
    // No reading kept.
  }
  return { liste: [], lu: null };
}

// The folder git keeps a repository's shared files in (its common dir), absolute; null when
// <racine> is no git repository. The board's cache and the day's marker live there.
export function dossierCommun(racine) {
  try {
    return execFileSync(
      'git',
      ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8' }
    ).trim();
  } catch {
    return null;
  }
}

// The file of the day's marker (grillhouse-3uv.96), beside the board's cache; null without a common
// dir. Unversioned, out of the worktree: the board does not reset at midnight.
const fichierDuRepere = commun => commun && path.join(commun, 'tableau-repere.json');

// The day's marker of the project whose common dir is <commun>: the number its file holds. Without
// one (no file, or no number), the first reading sets it to midnight of <maintenant> and keeps it,
// so that only `grillhouse newday` moves it; a place that cannot be written gives midnight still.
export function lireLeRepere(commun, maintenant) {
  try {
    const { repere } = JSON.parse(readFileSync(fichierDuRepere(commun), 'utf8'));
    if (typeof repere === 'number') {
      return repere;
    }
  } catch {
    // No marker yet: set below.
  }
  const minuit = new Date(maintenant);
  minuit.setHours(0, 0, 0, 0);
  try {
    if (commun) {
      writeFileSync(fichierDuRepere(commun), `${JSON.stringify({ repere: minuit.getTime() })}\n`);
    }
  } catch {
    // A read-only place keeps the board working: midnight, unkept.
  }
  return minuit.getTime();
}

// Sets the day's marker of the project at <racine> to <quand> (now by default), purging FAITS
// AUJOURD'HUI and the « rejetés » and « validés » cases up to it (grillhouse-3uv.96, /newday).
export function poserLeRepere(racine, quand = Date.now()) {
  const commun = dossierCommun(racine);
  if (!commun) {
    throw new Error('newday : le dossier git commun du projet est introuvable.');
  }
  writeFileSync(fichierDuRepere(commun), `${JSON.stringify({ repere: quand })}\n`);
  return quand;
}

// What the board reads of the repository at <racine>, its circuits <circuits> read: its tickets,
// its prefix, its running agents and its assembled board (`t`), with the folder git keeps its
// shared files in (`commun`).
function lire(
  racine,
  {
    home,
    maintenant,
    circuits,
    muet = false,
    faute = null,
    machine = null,
    places = null,
    nuit = null,
  }
) {
  // The prefix is read once, with no delay of its own; a read that fails leaves it empty (the
  // project is labelled by its folder) and its cause is named in an alert (`echecPrefixe`).
  let prefix = '';
  let echecPrefixe = null;
  try {
    prefix = execFileSync('bd', ['config', 'get', 'issue_prefix'], {
      cwd: racine,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    }).trim();
  } catch (e) {
    prefix = '';
    const message = String(e?.stderr ?? '').trim() || String(e?.message ?? e);
    const ligne = message.split('\n')[0];
    echecPrefixe =
      e?.status === null || e?.status === undefined
        ? `${e?.code ?? 'échec'} ${ligne}`.trim()
        : `code ${e.status} ${ligne}`.trim();
  }
  let ps = '';
  try {
    ps = execFileSync('ps', ['-eo', 'pid=,etimes=,args='], { encoding: 'utf8' });
  } catch {
    ps = '';
  }
  const registre = existsSync(REGISTRE) ? lireRegistre(readFileSync(REGISTRE, 'utf8'), racine) : [];
  const commun = dossierCommun(racine);
  // The tickets and the circuits, each the last reading that succeeded when this one failed.
  const lesTickets = bdJson(racine, 'list', '--all', '--limit', '0');
  const tickets = lectureGardee(
    commun,
    'tickets',
    lesTickets.faute ? null : lesTickets.liste,
    maintenant
  );
  const tous = tickets.liste;
  const lesCircuitsLus = lectureGardee(
    commun,
    'circuits',
    muet || faute ? null : circuits,
    maintenant
  );
  const fichierCache = commun && path.join(commun, 'tableau-cache.json');
  let cache = {};
  try {
    cache = JSON.parse(readFileSync(fichierCache, 'utf8'));
  } catch {
    cache = {};
  }
  const vivants = lireVivant({
    racine,
    home,
    prefix: prefix || '[A-Za-z0-9_]+',
    maintenant,
    ps,
    cache,
  });
  const jourLu = lireLeRepere(commun, maintenant);
  const superviseur = jetonsDuSuperviseur({ racine, home, jour: jourLu, cache });
  try {
    if (fichierCache) {
      writeFileSync(
        fichierCache,
        JSON.stringify(Object.fromEntries(Object.entries(cache).filter(([f]) => existsSync(f))))
      );
    }
  } catch {
    // A read-only place keeps the board working, without its cache.
  }
  const jour = jourLu;
  // The kept results of the circuits of the tickets done since the day's marker, in the main tree.
  const voies = voiesDesCircuits(
    commun ? path.dirname(commun) : racine,
    tous.filter(x => x.closed_at && Date.parse(x.closed_at) >= jour).map(x => x.id)
  );
  const t = assembler({
    tous,
    prefix,
    racine: commun ? path.dirname(commun) : racine,
    registre,
    vivants,
    circuits: lesCircuitsLus.liste,
    maintenant,
    jour,
    voies,
    machine,
    places,
    nuit,
    muet,
    faute,
    circuitsLusA: lesCircuitsLus.lu,
    fauteTickets: lesTickets.faute,
    ticketsLusA: tickets.lu,
    echecPrefixe,
    outil: echecDeLOutil(racine),
    remontees: lireLesRemontees(racine, maintenant),
    attenteVivante: attenteVivante(racine),
    superviseur,
    externes: lireLesExternes(racine, tous),
  });
  return { t, prefix, tous, vivants, commun };
}

// The places of the machine as the board shows them (`etatDesPlaces`), null when they do not read
// (a faulty GRILLHOUSE_PLACES, a server of the places that does not answer): the board then shows
// no line of places.
function lireLesPlaces() {
  try {
    return etatDesPlaces();
  } catch {
    return null;
  }
}

// The boards of several projects as one (grillhouse-erp.1), as the multi-root explorer of VS Code
// keeps one view and files each root under its name: <lus> holds each project's label
// (`etiquette`, its ticket prefix) and its board (`t`) or the fault that keeps it out (`erreur`),
// the session's project first. Each ticket, alert and chantier is marked with its project's label
// (`projet`), the agents' blocks hold every project's tickets at their step, and `projets` gives
// each project's counters or fault, which the head shows one line each.
export function ensemble(lus) {
  const lisibles = lus.filter(l => l.t);
  const [premier] = lisibles;
  const marquer = projet => x => ({ ...x, projet });
  const noeud = projet => n => ({ ...n, projet, enfants: n.enfants.map(noeud(projet)) });
  const tous = cle => lisibles.flatMap(l => (l.t[cle] ?? []).map(marquer(l.etiquette)));
  return {
    projets: lus.map(l =>
      l.t
        ? { etiquette: l.etiquette, compteurs: l.t.global.compteurs }
        : { etiquette: l.etiquette, erreur: l.erreur }
    ),
    alertes: tous('alertes'),
    circuits: tous('circuits'),
    horsCircuit: tous('horsCircuit'),
    chantiers: lisibles.flatMap(l => l.t.chantiers.map(noeud(l.etiquette))),
    autres: tous('autres'),
    agents: premier.t.agents.map(b => {
      const de = cle =>
        lisibles.flatMap(l =>
          (l.t.agents.find(x => x.numero === b.numero)?.[cle] ?? []).map(marquer(l.etiquette))
        );
      return { ...b, enCours: de('enCours') };
    }),
    maintenant: premier.t.maintenant,
    machine: premier.t.machine,
    places: premier.t.places,
    nuit: premier.t.nuit,
    faitsDuJour: tous('faitsDuJour'),
    decouvertes: lisibles.reduce(
      (s, l) => {
        const d = l.t.global.decouvertes ?? {};
        return {
          new: s.new + (d.new ?? 0),
          check: s.check + (d.check ?? 0),
          rejetes: s.rejetes + (d.rejetes ?? 0),
          valides: s.valides + (d.valides ?? 0),
        };
      },
      { new: 0, check: 0, rejetes: 0, valides: 0 }
    ),
    etats: premier.t.etats.map(e => ({
      ...e,
      tickets: lisibles.flatMap(l =>
        (l.t.etats.find(x => x.cle === e.cle)?.tickets ?? []).map(marquer(l.etiquette))
      ),
    })),
    parTicket: Object.assign({}, ...lisibles.map(l => l.t.parTicket)),
  };
}

// A project beside the session's, read in its folder <dossier>: its board, the faults of its
// reading of the circuits in its alerts, or the fault that keeps it out, on one line.
async function lireUnAutre(dossier, { circuitsDe, ...o }) {
  try {
    if (!existsSync(dossier)) {
      throw new Error('dossier introuvable');
    }
    return {
      dossier,
      ...lire(dossier, { ...o, ...(await lesCircuits(circuitsDe, dossier)) }),
    };
  } catch (e) {
    return { dossier, erreur: String(e.message ?? e).split('\n')[0] };
  }
}

// The circuits of the repository at <racine> by the reader <circuitsDe>; none when the reading
// fails, which `lire` replaces by the last reading kept: the server stayed silent (`muet`,
// `ServeurMuet`), or another fault, a client not built among them, by the first line of its
// message (`faute`).
async function lesCircuits(circuitsDe, racine) {
  try {
    return { circuits: await circuitsDe(racine), muet: false, faute: null };
  } catch (e) {
    const muet = e instanceof ServeurMuet;
    return { circuits: [], muet, faute: muet ? null : String(e?.message ?? e).split('\n')[0] };
  }
}

/**
 * The lock of the machine <machine> with each project named as the board names it: <noms> gives
 * the name of each project of the board by the root of its main tree (`depot`); a project out of
 * the board keeps its folder's name. A holder or a wait of the repository whose main tree is <ici>
 * is marked `ici`, the board's project.
 * @param {Machine | null} machine
 * @param {Map<string, string>} noms
 * @param {string | null} [ici]
 * @returns {Machine | null}
 */
export function nommerLesProjets(machine, noms, ici = null) {
  if (!machine) {
    return machine;
  }
  const nommer = x => ({
    ...x,
    projet: (x.depot && noms.get(x.depot)) || x.projet,
    ici: Boolean(ici && x.depot === ici),
  });
  return {
    detenteur: machine.detenteur && nommer(machine.detenteur),
    attentes: machine.attentes.map(nommer),
  };
}

// The board of the repository at <racine>; with <projets>, the folders of other projects, the
// board of them all (`ensemble`), named « <dépôt> + <projet> + … », with the folder of each
// ticket's project (`dossiers`), where the pane runs Beads for it. The status line is the
// session's project's alone. Each project's circuits are read by <circuitsDe> (one call to the
// Temporal server, scripts/circuits-du-serveur.mjs, by default), and the night under way on the
// machine by <nuitDe> (`nuitDuServeur` by default); a night that does not read shows none.
/**
 * @param {string} racine
 * @param {{ home?: string, maintenant?: number, projets?: string[],
 *   circuitsDe?: (racine: string) => Promise<object[]>,
 *   nuitDe?: () => Promise<{ racine: string, depuis: number | null } | null> }} [o]
 */
export async function tableau(
  racine,
  {
    home = os.homedir(),
    maintenant = Date.now(),
    projets = [],
    circuitsDe = circuitsDuServeur,
    nuitDe = () => nuitDuServeur(),
  } = {}
) {
  const [nuit, { circuits, muet, faute }, ...autres] = await Promise.all([
    Promise.resolve()
      .then(nuitDe)
      .catch(() => null),
    lesCircuits(circuitsDe, racine),
    ...projets.map(d => lireUnAutre(d, { home, maintenant, circuitsDe })),
  ]);
  const ici = {
    dossier: racine,
    ...lire(racine, {
      home,
      maintenant,
      circuits,
      muet,
      faute,
      machine: lireLaMesure(process.env),
      places: lireLesPlaces(),
      nuit,
    }),
  };
  const lus = [ici, ...autres];
  // A project is labelled by its sigle (scripts/sigle-du-projet.mjs: the key `grillhouse.sigle`, else
  // its ticket prefix), as the line of the places names it; a project with neither keeps its
  // folder's name. A faulty key is said in an alert, the prefix staying the sigle; two projects of
  // the board with one sigle are said, both named.
  const sigles = new Map(lus.map(l => [l, sigleDuProjet(l.dossier)]));
  const etiquette = l => sigles.get(l).sigle || l.prefix || path.basename(l.dossier);
  const alerteDeSigle = (l, texte) =>
    (l.t ?? ici.t).alertes.push({ etat: 'panne', ton: TONS.panne, texte });
  for (const l of lus) {
    const { faute } = sigles.get(l);
    if (faute) {
      alerteDeSigle(l, `Sigle illisible : ${faute}`);
    }
  }
  const memeSigle = new Map();
  for (const l of lus) {
    memeSigle.set(etiquette(l), [...(memeSigle.get(etiquette(l)) ?? []), l]);
  }
  for (const [sigle, deux] of memeSigle) {
    if (deux.length > 1) {
      alerteDeSigle(
        ici,
        `Sigle « ${sigle} » porté par ${deux.map(l => path.basename(l.dossier)).join(' et ')}`
      );
    }
  }
  // The lock of the machine names each project of the board as the board does: the session's by
  // its folder, another by its label; the root of its main tree, its common git directory's parent.
  ici.t.machine = nommerLesProjets(
    ici.t.machine,
    new Map(
      lus
        .filter(l => l.commun)
        .map(l => [path.dirname(l.commun), l === ici ? path.basename(racine) : etiquette(l)])
    ),
    ici.commun ? path.dirname(ici.commun) : null
  );
  const etat = ligneEtat(ici.t, autres.map(l => l.t).filter(Boolean));
  try {
    if (ici.commun) {
      writeFileSync(path.join(ici.commun, 'grillhouse-etat.txt'), `${etat}\n`);
    }
  } catch {
    // A read-only place keeps the board working, without its status line.
  }
  const t = projets.length
    ? ensemble(lus.map(l => ({ etiquette: etiquette(l), t: l.t, erreur: l.erreur })))
    : ici.t;
  // The project is named by its repository's folder, as a shell prompt names it.
  const nom = [path.basename(racine), ...lus.slice(1).map(etiquette)].join(' + ');
  const groupes = {};
  const l = lignes(t, nom, LARGEUR, groupes);
  const vue = lignesEtats(t);
  const toutes = [...l, ...vue, ...Object.values(groupes).flat()];
  const lisibles = lus.filter(x => x.t);
  const parProjet = lisibles.map(x => ({
    dossier: x.dossier,
    fiches: fiches(x.tous, toutes, x.prefix, x.t.parTicket, x.t.circuits, bilansGardes(x.dossier)),
  }));
  return {
    ...t,
    lignes: l,
    vueEtats: vue,
    groupes,
    fiches: Object.assign({}, ...parProjet.map(x => x.fiches)),
    dernier: dernierBouge(
      lisibles.flatMap(x => x.tous),
      l,
      lisibles.flatMap(x => x.vivants),
      maintenant
    ),
    etat,
    ...(projets.length
      ? {
          dossiers: Object.fromEntries(
            parProjet.flatMap(x => Object.keys(x.fiches).map(id => [id, x.dossier]))
          ),
        }
      : {}),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // The arguments other than --texte are the folders of the other projects.
  const projets = process.argv
    .slice(2)
    .filter(a => a !== '--texte')
    .map(d => path.resolve(d));
  void tableau(process.cwd(), { projets }).then(t =>
    process.stdout.write(
      process.argv.includes('--texte')
        ? `${t.lignes.map(l => l.texte).join('\n')}\n`
        : JSON.stringify(t)
    )
  );
}
