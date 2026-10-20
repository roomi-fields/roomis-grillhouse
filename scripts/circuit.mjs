#!/usr/bin/env node
// The circuit of one ticket: for each component its title names, in order, the provider first, the
// testeur, the proof of the red, the developpeur and the checks; then the reviewer, and on its
// ACCEPTÉ the integration, which commits the lot on the ticket's branch and puts that branch in the
// queue; then the queue, which brings it onto main, pushes and reads the CI, and the circuit ends
// on the state of the ticket the queue leaves. The supervisor runs it once, in the background, and
// its end wakes him: at 0 the ticket is closed; at 75 he runs `--reprendre` again once the machine
// is at rest; at « question » (18) the chef de chantier's question goes to him: he answers it
// himself, or carries it to the owner when it is the owner's, then runs `--reponse "<texte>"` with
// the answer; at any other code, the stop is one the chef could not settle. On a stop other than 0 and 75, the circuit launches a session of the chef de
// chantier itself, as the scheduler of an integration (Zuul, bors) calls the judgement at a stop
// and applies the decision it gets: the chef settles, and its final answer is its decision, which
// the circuit writes at the ticket and applies in the same process. So the supervisor is woken
// only by the end of the lot, a question of the chef, or a stop the chef did not settle.
//
//   node scripts/circuit.mjs <ticket> [--reprendre] [--contexte <texte>]
//   node scripts/circuit.mjs <ticket> --depuis <testeur|developpeur> <composant> --contexte <texte>
//   node scripts/circuit.mjs <ticket> --reponse <texte>
//
// - The components are read in the ticket's title (`bd show <ticket> --json`), after its last
//   « — », separated by commas: each one a path (`packages/<nom>`, or `.`), or the name of a
//   package, which becomes its directory (scripts/paquets.mjs), read in the ticket's copy when it
//   exists, else in the main tree. A component that names neither stops the call, exit 2, named.
// - Each session is a launch of scripts/enveloppe/lancer.sh, a child process the circuit waits
//   for, in its own process group, its errors written to a file: a session outlives the death of
//   its circuit (its caller dead, the circuit with it), and the state names its group while it
//   runs. The instruction is written from the first template of
//   .claude/skills/pitmaster/references/consigne-agent.md, each `{{champ}}` filled: the ticket and
//   its subject, the component, the ticket's description (its criteria), the report of the step
//   before (the proof, the output of a red check), the last handover at the ticket, and the line
//   `CONTEXTE :` that `--contexte` gives. The session's own exit code is the one lancer.sh writes
//   to `.claude/worktrees/<ticket>.fin`; a launch that leaves none stopped before its session.
// - A session whose transcripts (`~/.claude/projects/<copy in dashes>/`, as scripts/registre.mjs
//   reads them) and log (its preparation writes there before the session opens) stand still for
//   20 minutes (IMMOBILE_MS; GRILLHOUSE_CIRCUIT_IMMOBILE_MS replaces
//   it, in milliseconds) is stopped: SIGTERM, then SIGKILL, to the launcher's group.
// - Each comment at the ticket carries its author, which bd reads in BEADS_ACTOR (ACTEUR): each
//   session runs with the author of its role (`testeur <composant>`, `developpeur <composant>`,
//   `relecteur`, `chef-de-chantier`), which the envelope passes on; the circuit writes its own
//   lines under `circuit` and the reviewer's verdict under `relecteur`. The rights of every
//   session refuse bd's `--actor`, `-a`/`--author` and the variable itself (AUTEUR_FIXE: the
//   reviewer's and the chef's lists, and lancer.sh's for a session in the envelope), so that no
//   agent changes its author. A verdict is a comment of the author `relecteur` whose first word is
//   ACCEPTÉ or RENDU (`verdictDe` of scripts/integration/integrer.mjs), wherever the circuit and
//   the integration read one.
// - After each session, a new comment of the agent is at the ticket: one that is not the circuit's
//   own (« Circuit · … »). Without it, the session is launched once more, then the circuit stops.
// - A component that carries no test (sansTests: in a repository of packages, no package with a
//   script `test:vitest` lies in it or holds it, as `npm test -- <chemin>` refuses a path out of
//   every package or in a package without that script) skips the testeur and the proof: the
//   circuit writes `Circuit · <composant> · testeur : aucun test …` at the ticket and launches its
//   developpeur, the reason as his report, then his checks.
// - The proof of the red plays the whole component, as the CI of bors plays the whole suite of
//   the components a change touches: main is green, so a test HEAD holds that turns red in the
//   copy is a regression of the lot. One run per package, `npm test -- <package> <files>
//   --reporter=default --reporter=json --outputFile=<f>` in the copy: each package of the
//   component that has a script `test:vitest`, played whole, and the test files the testeur's lot
//   adds or changes in the component (git status of the copy, the testeur's files as the
//   integration shares them, `isTesterFile`). A test of a file out of the lot that fails is a red,
//   written `rouge existant : <file> › <name> — <message>`, and so is a file out of the lot that
//   does not load while no build of the component fails (it loaded at HEAD); its greens do not
//   count. A file of the lot that does not load proves nothing; a failed build of a
//   package of the component (Turborepo's line « Failed: » naming `<package>#build`) is a red, as
//   not compiling is failing, and the files it keeps from loading play at the checks, after the
//   developpeur; a failed build of a package out of the component leaves them broken. A green
//   test passes only when a comment of an agent at the ticket carries the line `vert attendu :
//   <name of the test> — <reason>`. A green test HEAD already holds has nothing to prove: the
//   version of HEAD of each file plays in the same run, from a sibling file
//   (`<nom>.circuit-avant.test.<ext>`, removed after it), and a green test whose full name HEAD's
//   version holds, green there too, is set aside, counted; a body changed under the same name is
//   not told apart. The proof passes with a red (of the lot, existing or of a build), even
//   without a file of the lot in the component: a testeur with no new test to write says so in
//   his handover, the existing reds are enough. It fails with neither a file of the lot nor a red,
//   with a broken file of the lot, or with a green of the lot without its « vert attendu ». A
//   failed proof relaunches the testeur with its report, twice at most. The report (reds,
//   justified greens) is written at the ticket. A proof with a red launches the developpeur; one
//   without a red skips him: the lot is a lot of tests alone.
// - A developpeur is launched on a red alone, of a proof or of a check, or in a component without
//   tests: a session that changes no file of its component (`git status --porcelain` of its
//   directory and the content of each file it lists, taken before and after the session; the
//   handover's text does not count) stops the circuit at « sans-livraison », its report naming the
//   component and sending to the developpeur's handover.
// - A handover of the developpeur that carries a line `Agent : testeur <composant>` (the form of a
//   finding's line, the component one of the title up to his own) says the red that remains lies in
//   the tests of that component: the circuit plays it as a `RELANCE --depuis testeur <composant>`
//   of the chef de chantier, the handover as its context, whether or not the session changed a
//   file: that component's testeur, the handover as his report, then its steps, the components
//   after it as `--depuis` plays them, the final pass and the reviewer. A line to another role, or to a component out of
//   the title or after his own, is no such sending. The same sending twice in a row, with no
//   green checks between them, stops at « sans-livraison ».
// - The checks after the developpeur of a component judge what is done, the components of the run
//   up to it: `npm test -- <test files of the lot>` that lie in those components (and those of the
//   shared test material whose package depends on none of the components after it), `npm test --
//   <package>` for each package of those components, touched by the lot or not (a package without
//   a script `test:vitest` plays only when the lot touches it), then the guards in the
//   envelope of the component (`GRILLHOUSE_ENVELOPPE=<composant> npm run grillhouse:gardes`, and
//   `npm run gardes` when the project has it): a red guard that names only files of the
//   components after it waits for the final pass.
// - After the last component of the run, the final pass: `npm run verifier`, what the
//   integration plays, as bors plays on a lot the very check of the merge. Turborepo's cache
//   holds its cost: a task nothing moved replays from it, and what the lot reaches plays again,
//   by the dependencies, the inputs of the tasks and `grillhouse.lit` (a reader out of the title
//   whose tests read a directory the lot changes included). A red goes to the developpeur of the
//   component that owns it: a package of a failed task (Turborepo's line « Failed: »), else,
//   when no failed task is a package's (the guards, tasks of the root), the first component a
//   path of the failed tasks' lines names (notices ⚠️ and ℹ️ aside), the provider first; its
//   report holds the lines of the failed tasks. A red in a package no component of the title
//   holds, or that no component owns, stops at « controles », the package named: the chef de
//   chantier decides, who refers the component's entry in the title upward, or has the lot
//   corrected. From then on every check is the final pass.
// - A check at 75 (« à repasser ») out of the final pass plays once more; verifier plays its
//   tasks at 75 again itself, at rest, and its 75 is the final pass's. A red relaunches the
//   developpeur with the output, twice at most, the third session on the strong model
//   (`lancer.sh --modele opus --effort high`): three sessions for a component's checks, and three
//   for the whole final pass whatever the components its reds go to (the last component's
//   sessions counted in it), so that two components sending a red to each other stop at
//   « controles ».
// - After the final pass, green, the reviewer: a session out of the envelope, which sees the whole
//   repository with its index, claude itself (`claude -p --agent relecteur`, CLAUDE_BIN replaces
//   claude) in the ticket's copy, on Opus, under the project's permissions and every command its
//   skill runs (RELECTEUR), its instruction from the second template of consigne-agent.md: the
//   ticket, its components, its criteria, the claims file (the ticket's description, written by
//   the circuit in its working folder, which the session may read), the files of the lot (the
//   testeur's by `isTesterFile`, then the others) and the circuit's reports at the ticket since
//   the last verdict (its proofs and checks). Its errors go to the log under its header line, its line to the register
//   (scripts/registre.mjs --copie), and it is watched as a session in the envelope is. Its
//   handover is its verdict, its final answer, whose first word is ACCEPTÉ or RENDU: the circuit
//   adds it to the log and writes it at the ticket, whole, under the author `relecteur`, a comment
//   on several lines with its findings' headings; an answer without one is launched once more, then the circuit stops at
//   « sans-passation ».
// - RENDU: each finding is a block that opens on a heading `Constat` and carries a line
//   `Agent : <rôle> <composant>`, the role testeur or developpeur, the component one of the title
//   (a path or a package name). The circuit plays again from the first component a finding
//   names, the provider first: its testeur → preuve → developpeur → controles when a finding names
//   its testeur, else its developpeur → controles, the findings as the report of the session
//   (those for the developpeur after the proof's report). Each component after it plays the
//   steps its findings name, or, as in `--depuis`, its checks alone (the final pass before the
//   review carried every component to green checks), then the final pass and the reviewer again. A
//   RENDU without findings, a finding without a valid recipient, or one that carries the line
//   `Critère en cause : …` (the criterion itself is in question) stops at « relecture-arret »; so
//   does the third RENDU since the ticket's last ACCEPTÉ. The chef de chantier settles.
// - ACCEPTÉ: the integration. The circuit builds the lot from the copy, as the chef de chantier
//   built it: the files the copy changes against its HEAD, the testeur's (`isTesterFile`: test
//   files and the shared test material) in one patch, the others in another, each file against
//   HEAD and a new one against nothing (`git diff --no-index /dev/null`), the copy's index
//   untouched; the message `<type>(<composants>): <sujet> (<ticket>)`, the type read from the
//   ticket's type (bug fix, chore, docs, else feat), with the trailer Co-Authored-By. It runs
//   scripts/integration/integrer.mjs from the main tree, its output added to the log: 0 is the
//   commit on agent/<ticket>, the copy removed, the branch in the queue; 75 (« à repasser ») plays
//   it once more, then stops at « a-repasser »; any other code is its refusal, which stops at
//   « integration ».
// - Then the queue: scripts/integration/file.mjs from the main tree, waited for, its output added
//   to the log (it brings the branch onto main, pushes it and reads the CI of the commit pushed).
//   A queue already running exits 0 at once: the circuit waits while the branch is in the queue
//   and the queue's lock names a live process. Then the state of the ticket: closed, the circuit
//   ends at « integre », exit 0 (a CI the queue could not read named in its comment); reopened
//   (out of the queue, or a red CI), it stops at « integration », the queue's comment as its
//   reason; still in the queue, it stops at « a-repasser », the queue's reason.
// - The state is `.claude/worktrees/<ticket>.circuit.json`, written again at each step and at the
//   start and end of each session: `{ etape, composant, tentative, code, raison, rapport, dernier,
//   finale, seance, chef, renvois, atteint, mene, journal }`; `etape` is testeur, preuve, developpeur, controles,
//   relecture, integration, file, or integre at the end; `raison` names the stop; `dernier` is the last
//   component of the run; `finale` whether the final pass has begun; `seance` the process group of
//   the session that runs, null between two; `chef` the chef de chantier's session on the stop
//   (`{ seance, arret, code, rapport }`: its id, the stop it settles, its code and its reason),
//   while it runs and after its question, null otherwise; `renvois` the components a RENDU (or
//   `--depuis`) plays again, each with its first step and its findings, null out of such a round;
//   `atteint` the last component the circuit has carried to green checks (the last of the run
//   once the final pass is green), kept from one run to the next, null before any and when a run
//   starts over from the first component's testeur; `mene` the start (an ISO date) of the step the
//   circuit leads itself while it runs, null otherwise. `--reprendre` starts again at the step and component of the state, its report given to the
//   next session, and goes on to its `dernier`; after any stop, the death of the circuit with its
//   caller included. A session the state names that still runs is waited for first, and stopped
//   when it stands still as long as a motionless session.
// - `--depuis <testeur|developpeur> <composant>` (a path or a package name the title names) has
//   the lot corrected by one component: it plays it as a RENDU whose one finding names that agent,
//   the text of `--contexte` as its findings: that component's steps; then each component after
//   it, its checks when the circuit has already carried it to green checks (up to `atteint`),
//   else its whole circuit, testeur, proof, developpeur and checks, as one it has not reached yet;
//   the final pass, the reviewer and the integration. It goes with no `--reprendre`.
// - On a stop other than 0 and 75, the chef de chantier: a session out of the envelope, as the
//   reviewer's, claude itself (`claude -p --agent chef-de-chantier --session-id <uuid>`) in the
//   ticket's copy (the main tree once the integration removed it), on Sonnet, under the commands
//   its skill runs (droitsDuChef: the reads of bd, a comment, a criterion added to the description,
//   a finding filed closed, the reads of git, the index, and the reads of the state, the log and
//   the proofs), its instruction from the third template of consigne-agent.md: the ticket, the
//   stop's name and code, its step, component and reason, the paths of the state and the log. The
//   state names its session (`chef`) while it runs. Its final answer is its decision, from its
//   last line in one of the forms `RELANCE --reprendre`, `RELANCE --depuis <testeur|developpeur>
//   <composant>`, then an optional line `CONTEXTE : <texte>` (the rest of the answer), or
//   `MONTE : <question>`; the reasoning before that line is left out. The
//   circuit writes it at the ticket (`Circuit · <composant> · chef : …`). RELANCE runs the circuit
//   again in the same process, as the option it names, the context as `--contexte`; MONTE ends the
//   circuit at « question », the question as its reason, the chef's session kept in the state.
//   `--reponse <texte>` resumes that session (`claude -p --resume <id>`, the fourth template: the
//   supervisor's answer, which may carry the owner's) and applies the decision it gives the same way; without a session kept after
//   a question, the call is refused. An answer in none of these forms resumes the chef's session
//   once (the fifth template), asking for its decision; a second such answer, or a session that
//   ends in error (a code other than 0, a launch that fails, a motionless session), ends the
//   circuit on the stop it settled, the answer joined to its reason. The third RELANCE in a row on one stop (its
//   name, step and component) is the last: when that stop comes again, the circuit ends on it, the
//   three decisions in its reason, without a chef.
// - At each step, a short comment at the ticket: `Circuit · <composant> · <étape> : <résumé>`.
//   A proof writes there its reds and what refuses it; its whole report, the justified greens with
//   their reasons, goes to `.claude/worktrees/<ticket>.preuve-<n>.md`, which the comment names.
// - The commands of the circuit (the proof, the checks, the integration) are added to the log of the ticket,
//   `.claude/worktrees/<ticket>.log`, next to the sessions, each under its header line.
// - Each step the circuit leads itself, with no agent (the proof, the checks and the final pass,
//   the integration, the queue), writes at its end, whatever its outcome, a line to the register
//   of finished agents (scripts/registre.mjs, `ligneDEtape`): the role `circuit`, the ticket, the
//   step and its component, its start and end, its working time, no tokens. The board counts it,
//   and the step under way (`mene` in the state), in the ticket's working time.
// - Exit codes: 0 at « integre »; 2 a malformed call; a stop, by its name (ARRETS):
//   10 lancement (lancer.sh stopped before the session), 11 bloqué (a motionless transcript),
//   12 sans-passation (twice no handover), 13 preuve (the third proof fails), 14 controles (the
//   third developpeur of a component's checks or of the final pass leaves a red check, or a red
//   of the final pass no component of the title owns),
//   15 sans-livraison (a developpeur session that changes no file of its component; the first
//   session of a `--reprendre` whose component already holds changes goes on to the checks; or
//   the developpeur's same sending to a testeur twice in a row, no green checks between them),
//   16 relecture-arret (a finding without a valid recipient, one on a criterion, the third RENDU),
//   17 integration (the integration script refuses the lot, or the queue reopens the ticket),
//   18 question (the chef de chantier's question for the supervisor, `--reponse` resumes it),
//   75 a-repasser (a check or the integration still at 75 once played again, or the branch still
//   in the queue).
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  appendFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matieres, NOM_DE_TEST } from './consommateurs.mjs';
import { VARIABLE as VARIABLE_ENVELOPPE } from './enveloppe/composant.mjs';
import { paquets } from './paquets.mjs';
import { ecrire as ecrireAuRegistre, ligneDEtape, transcriptionsDeLaCopie } from './registre.mjs';
import { dossierCommun, lireEntrees } from './integration/file-attente.mjs';
import { AUTEUR_DU_VERDICT, VERDICT, verdictDe } from './integration/verdict.mjs';
import { attendreUnPeu, vivant } from './verrou-de-fichier.mjs';
import { isTesterFile } from './verrous/verrou.mjs';
import { A_REPASSER } from './vitest-config/pression.mjs';

// The time a session's transcripts may stand still before the circuit stops it.
export const IMMOBILE_MS = 20 * 60 * 1000;
// The exit code of each stop.
export const ARRETS = {
  lancement: 10,
  bloqué: 11,
  'sans-passation': 12,
  preuve: 13,
  controles: 14,
  'sans-livraison': 15,
  'relecture-arret': 16,
  integration: 17,
  question: 18,
  'a-repasser': A_REPASSER,
};
const CODE_USAGE = 2;
// The testeur is relaunched twice at most after a failed proof; the developpeur has three sessions,
// the last on the strong model.
const RELANCES_TESTEUR = 2;
const SEANCES_DEVELOPPEUR = 3;
// The reviews of one ticket: the third RENDU stops the circuit.
const RELECTURES = 3;
// The roles a finding of the reviewer may name.
const DESTINATAIRES = ['testeur', 'developpeur'];
// The variable in which bd reads the author of a comment (`bd --help`: « default: $BEADS_ACTOR,
// git user.name, $USER »); the author of the circuit's own lines; the author of a session of
// <role> on <composant>: `testeur <composant>`, `developpeur <composant>`, else the role alone.
const ACTEUR = 'BEADS_ACTOR';
const AUTEUR_DU_CIRCUIT = 'circuit';
const auteur = (role, composant) => (DESTINATAIRES.includes(role) ? `${role} ${composant}` : role);
// The rules that refuse a session the change of its author at the ticket: bd's options `--actor`
// and `-a`/`--author`, and the variable itself. The reviewer's and the chef's lists end on them,
// and lancer.sh gives them to a session in the envelope.
export const AUTEUR_FIXE = [
  'Bash(bd *--actor*)',
  'Bash(bd *--author*)',
  'Bash(bd * -a*)',
  `Bash(*${ACTEUR}*)`,
];
// The reviewer's session, out of the envelope, on Opus: the project's permissions
// (`.claude/settings.json`), with every command its skill runs (the frame's scripts, the reads of
// git and of the ticket, the comparison of two files, the targeted tests, the guards, the index);
// any other tool call is refused without a prompt, and so is a change of its author (AUTEUR_FIXE).
const RELECTEUR = [
  '--model',
  'opus',
  '--permission-mode',
  'dontAsk',
  '--allowedTools',
  'Bash(node scripts/*)',
  'Bash(bash scripts/*)',
  'Bash(git diff *)',
  'Bash(git log *)',
  'Bash(git show *)',
  'Bash(git status *)',
  'Bash(bd show *)',
  'Bash(bd comments *)',
  'Bash(diff *)',
  'Bash(cmp *)',
  'Bash(sha256sum *)',
  'Bash(npm test *)',
  'Bash(npm run verifier *)',
  'Bash(codegraph *)',
  'mcp__plugin_rtfm_rtfm__rtfm_search',
  'mcp__plugin_rtfm_rtfm__rtfm_expand',
  '--disallowedTools',
  ...AUTEUR_FIXE,
];
// The chef de chantier's session, out of the envelope, on Sonnet: every command its skill runs (the
// reads of the ticket and the search of a precedent, a comment, a criterion added to the
// description, a finding filed closed, the reads of git, the index) and the reads of the ticket's
// state, log and proofs; any other tool call is refused without a prompt, and so is a change of its
// author (AUTEUR_FIXE).
const CHEF = 'chef-de-chantier';
const droitsDuChef = ctx => [
  '--model',
  'sonnet',
  '--permission-mode',
  'dontAsk',
  '--allowedTools',
  'Bash(bd show *)',
  'Bash(bd comments *)',
  'Bash(bd search *)',
  'Bash(bd list *)',
  'Bash(bd update * -d *)',
  'Bash(bash scripts/ticket.sh * decouverte)',
  'Bash(git diff *)',
  'Bash(git log *)',
  'Bash(git show *)',
  'Bash(git status *)',
  'Bash(codegraph *)',
  'mcp__plugin_rtfm_rtfm__rtfm_search',
  'mcp__plugin_rtfm_rtfm__rtfm_expand',
  // An absolute path of the machine opens on `//`.
  `Read(/${ctx.etat})`,
  `Read(/${ctx.journal})`,
  `Read(/${ctx.copie}.preuve-*.md)`,
  '--disallowedTools',
  ...AUTEUR_FIXE,
];
// The third RELANCE in a row on one stop is the last.
const RELANCES_DU_CHEF = 3;
const FORT = ['--modele', 'opus', '--effort', 'high'];
const PREFIXE = 'Circuit · ';
// The steps the circuit leads itself, with no agent: each one counts in the ticket's working time.
const MENEES = new Set(['preuve', 'controles', 'integration', 'file']);

const ici = import.meta.dirname;
const LANCEUR = path.join(ici, 'enveloppe', 'lancer.sh');
const INTEGRER = path.join(ici, 'integration', 'integrer.mjs');
const FILE = path.join(ici, 'integration', 'file.mjs');
const REGISTRE = path.join(ici, 'registre.mjs');
const GABARIT = path.join(
  ici,
  '..',
  '.claude',
  'skills',
  'pitmaster',
  'references',
  'consigne-agent.md'
);

// A stop of the circuit: its name (a key of ARRETS) and its report.
class Arret extends Error {
  constructor(nom, rapport) {
    super(nom);
    this.nom = nom;
    this.rapport = rapport;
  }
}

// A malformed call: its message.
class Usage extends Error {}

const sansCouleurs = t => t.replace(/\x1b\[[0-9;]*m/g, '');
const premiereLigne = t =>
  sansCouleurs(String(t ?? ''))
    .trim()
    .split('\n')[0]
    .slice(0, 300);
const fin = (t, n) => sansCouleurs(t).split('\n').slice(-n).join('\n');

// The options of the command line, or a Usage.
function lireArguments(argv) {
  const o = { ticket: null, reprendre: false, contexte: null, depuis: null, reponse: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reprendre') o.reprendre = true;
    else if (a === '--reponse') {
      if (i + 1 >= argv.length) throw new Usage('--reponse attend la réponse du superviseur.');
      o.reponse = argv[++i];
    } else if (a === '--depuis') {
      const [etape, composant] = argv.slice(i + 1, i + 3);
      if (!['testeur', 'developpeur'].includes(etape))
        throw new Usage('--depuis attend testeur ou developpeur, puis un composant.');
      if (!composant || composant.startsWith('-'))
        throw new Usage('--depuis attend son composant.');
      o.depuis = { etape, composant };
      i += 2;
    } else if (a === '--contexte') {
      if (i + 1 >= argv.length) throw new Usage('--contexte attend son texte.');
      o.contexte = argv[++i];
    } else if (a.startsWith('-')) throw new Usage(`option inconnue : ${a}`);
    else if (o.ticket) throw new Usage(`un seul ticket : ${o.ticket}, puis ${a}.`);
    else o.ticket = a;
  }
  if (!o.ticket) throw new Usage('le ticket manque.');
  if (o.depuis && o.reprendre) throw new Usage('--depuis et --reprendre ne vont pas ensemble.');
  if (o.reponse !== null && (o.reprendre || o.depuis || o.contexte !== null))
    throw new Usage('--reponse va seule : le chef de chantier rend la décision.');
  return o;
}

// The main tree, from git's common directory: run from a copy, the circuit still finds the others.
function arbrePrincipal() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Usage("le dossier courant n'est pas dans un dépôt git.");
  return path.dirname(r.stdout.trim());
}

// The context of one run: the paths of the ticket, its components, how the circuit speaks to bd.
function contexte(o) {
  const racine = arbrePrincipal();
  const copie = path.join(racine, '.claude', 'worktrees', o.ticket);
  // The comments of a long ticket pass the 1 MiB that a child process returns by default. bd runs
  // under the author <qui>; `bd` under the circuit's.
  const bdSous = (qui, ...a) =>
    spawnSync('bd', a, {
      cwd: racine,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, [ACTEUR]: qui },
    });
  const bd = (...a) => bdSous(AUTEUR_DU_CIRCUIT, ...a);
  const show = bd('show', o.ticket, '--json');
  if (show.status !== 0) throw new Usage(`ticket ${o.ticket} illisible : ${show.stderr}`);
  const t = JSON.parse(show.stdout)[0];
  const parts = String(t?.title ?? '').split(' — ');
  if (parts.length < 2) throw new Usage(`le titre de ${o.ticket} ne nomme pas ses composants.`);
  const base = existsSync(copie) ? copie : racine;
  const liste = paquets(base);
  const resoudre = nom => {
    if (nom === '.') return '.';
    const norme = path.normalize(nom).replace(/\/$/, '');
    if (liste.some(p => p.dossier === norme)) return norme;
    const parNom = liste.find(p => p.pkg.name === nom);
    if (parNom) return parNom.dossier;
    if (!norme.startsWith('..') && existsSync(path.join(base, norme))) return norme;
    throw new Usage(
      `le composant « ${nom} » du titre ne nomme ni un paquet ni un chemin du dépôt.`
    );
  };
  const composants = parts
    .at(-1)
    .split(',')
    .map(c => c.trim())
    .filter(Boolean)
    .map(resoudre);
  if (o.depuis) {
    const c = composants.includes(o.depuis.composant)
      ? o.depuis.composant
      : composants.find(x => {
          try {
            return resoudre(o.depuis.composant) === x;
          } catch {
            return false;
          }
        });
    if (!c) throw new Usage(`--depuis : ${o.depuis.composant} n'est pas un composant du titre.`);
    o.depuis.composant = c;
  }
  return {
    ...o,
    racine,
    copie,
    bd,
    bdSous,
    resoudre,
    type: String(t.issue_type ?? ''),
    sujet: parts.length > 2 ? parts.slice(1, -1).join(' — ') : parts[0],
    description: String(t.description ?? ''),
    composants,
    etat: `${copie}.circuit.json`,
    journal: `${copie}.log`,
    fin: `${copie}.fin`,
    transcriptions: transcriptionsDeLaCopie(copie, os.homedir()),
    immobileMs: Number(process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS) || IMMOBILE_MS,
    tmp: mkdtempSync(path.join(os.tmpdir(), 'circuit-')),
    numero: 0,
    // The chef's RELANCE decisions in a row on one stop.
    relances: [],
  };
}

// Every comment at the ticket, in their order, `{ author, text }` as Beads gives them; a failed
// read throws.
function lesCommentaires(ctx) {
  const r = ctx.bd('comments', ctx.ticket, '--json');
  if (r.status !== 0) {
    throw new Error(
      `commentaires de ${ctx.ticket} illisibles : ${r.error?.message ?? r.stderr ?? ''}`.trim()
    );
  }
  return (JSON.parse(r.stdout || '[]') ?? []).map(c => ({
    author: String(c.author ?? ''),
    text: String(c.text ?? ''),
  }));
}

// The texts of every comment at the ticket, in their order.
const commentaires = ctx => lesCommentaires(ctx).map(c => c.text);

// The comments of the agents at the ticket, `{ author, text }`: every comment but the circuit's
// own.
const passations = ctx => lesCommentaires(ctx).filter(c => !c.text.startsWith(PREFIXE));

// One line of the circuit's history at the ticket.
function commenter(ctx, composant, etape, texte) {
  const r = ctx.bd('comments', 'add', ctx.ticket, `${PREFIXE}${composant} · ${etape} : ${texte}`);
  if (r.status !== 0) process.stderr.write(`⚠️  commentaire non écrit au ticket : ${r.stderr}\n`);
}

// The state of the run, written whole (`seance` and `chef` null and `finale` false unless <etat>
// sets them, `renvois` and `atteint` the run's), kept as the run's current state.
function ecrireEtat(ctx, etat) {
  ctx.courant = {
    finale: false,
    seance: null,
    chef: null,
    mene: null,
    ...etat,
    renvois: ctx.renvois ?? null,
    atteint: ctx.atteint ?? null,
  };
  const provisoire = `${ctx.etat}.${process.pid}`;
  writeFileSync(
    provisoire,
    `${JSON.stringify({ ...ctx.courant, journal: ctx.journal }, null, 2)}\n`
  );
  renameSync(provisoire, ctx.etat);
}

// The register's line of the step <etape> of <composant> the circuit led itself from <debut> (an
// ISO date) to now; a register it cannot write leaves the circuit going.
function inscrireEtape(ctx, { etape, composant, debut }) {
  try {
    ecrireAuRegistre(
      ligneDEtape({
        projet: ctx.racine,
        ticket: ctx.ticket,
        etape,
        composant,
        debut,
        fin: new Date().toISOString(),
      })
    );
  } catch (e) {
    process.stderr.write(`⚠️  étape ${etape} non écrite au registre : ${e.message}\n`);
  }
}

const entete = (ctx, etape, composant) =>
  appendFileSync(
    ctx.journal,
    `=== ${new Date().toISOString()} · circuit · ${etape} · ${composant} ===\n`
  );

// The latest moment a transcript of the copy moved, or 0.
function derniereTrace(dossier) {
  if (!existsSync(dossier)) return 0;
  let m = 0;
  for (const f of readdirSync(dossier, { recursive: true })) {
    if (!String(f).endsWith('.jsonl')) continue;
    try {
      m = Math.max(m, statSync(path.join(dossier, String(f))).mtimeMs);
    } catch {
      // A transcript removed meanwhile does not move.
    }
  }
  return m;
}

const mtime = f => {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return 0;
  }
};

// One launch of a session: `{ code, seance, bloque, erreur, reponse }`, `seance` the session's
// exit code (from lancer.sh's end file for a session in the envelope), null when the launch
// stopped before it. Every session runs with the author of <role> on <composant> (BEADS_ACTOR).
// A session <horsEnveloppe> (the reviewer's, the chef de chantier's) is claude
// itself, in the ticket's copy (the main tree once the copy is gone), under <droits> (the
// reviewer's by default) and the options <session> names, its instruction on its standard input
// and its final answer (`reponse`) added to the log under its header line and given to
// <surReponse>, then its line written to the register, as lancer.sh does.
function lancer(
  ctx,
  role,
  composant,
  consigne,
  { fort, horsEnveloppe, droits = RELECTEUR, session = [], surReponse } = {}
) {
  rmSync(ctx.fin, { force: true });
  const fichier = path.join(ctx.tmp, `consigne-${++ctx.numero}.md`);
  writeFileSync(fichier, consigne);
  // A file, not a pipe: a session whose circuit is dead writes its errors without breaking.
  const erreurs = path.join(ctx.tmp, `erreurs-${ctx.numero}.txt`);
  let commande;
  let fds;
  // The final answer of a session out of the envelope: the reviewer's verdict, the chef's decision.
  const reponse = path.join(ctx.tmp, `reponse-${ctx.numero}.txt`);
  if (horsEnveloppe) {
    entete(ctx, role, composant);
    fds = [openSync(fichier, 'r'), openSync(reponse, 'w'), openSync(ctx.journal, 'a')];
    commande = {
      cmd: process.env.CLAUDE_BIN || 'claude',
      args: ['-p', '--agent', role, ...droits, '--add-dir', ctx.tmp, ...session],
      cwd: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    };
  } else {
    fds = ['ignore', 'ignore', openSync(erreurs, 'w')];
    commande = {
      cmd: 'bash',
      args: [LANCEUR, ...(fort ? FORT : []), ctx.ticket, role, composant, fichier],
      cwd: ctx.racine,
    };
  }
  return new Promise(resolve => {
    // The session writes at the ticket under the author of its role.
    const enfant = spawn(commande.cmd, commande.args, {
      cwd: commande.cwd,
      detached: true,
      stdio: fds,
      env: { ...process.env, [ACTEUR]: auteur(role, composant) },
    });
    for (const fd of new Set(fds.filter(f => typeof f === 'number'))) closeSync(fd);
    let erreurDeLancement = null;
    ecrireEtat(ctx, { ...ctx.courant, seance: enfant.pid ?? null });
    let bloque = false;
    let fini = false;
    const veille = surveiller(ctx, enfant.pid, () => (bloque = true));
    // A command that does not start (claude absent) ends with its error, whether or not its
    // `close` follows.
    enfant.on('error', e => {
      erreurDeLancement = e.message;
      if (!enfant.pid) enfant.emit('close', null);
    });
    enfant.on('close', code => {
      if (fini) return;
      fini = true;
      clearInterval(veille);
      // What remains of the group goes with its launcher.
      if (bloque) signalerGroupe(enfant.pid, 'SIGKILL');
      ecrireEtat(ctx, { ...ctx.courant, seance: null });
      let seance;
      let texte = '';
      if (horsEnveloppe) {
        seance = erreurDeLancement === null ? code : null;
        texte = lire(reponse).trim();
        appendFileSync(ctx.journal, `${texte}\n`);
        surReponse?.(texte);
        spawnSync(process.execPath, [REGISTRE, '--copie', ctx.copie], {
          cwd: ctx.racine,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
      } else {
        seance = existsSync(ctx.fin) ? Number(readFileSync(ctx.fin, 'utf8').trim()) : null;
      }
      resolve({ code, seance, bloque, erreur: erreurDeLancement ?? lire(erreurs), reponse: texte });
    });
  });
}

// <signal> to the process group <groupe>; false when the group is gone (or not the circuit's).
function signalerGroupe(groupe, signal) {
  try {
    process.kill(-groupe, signal);
    return true;
  } catch {
    return false;
  }
}

// The watch of the session whose launcher leads the group <groupe>: its transcripts and the log
// standing still for the delay, SIGTERM, then SIGKILL, to the group, and <bloque> called. Its
// interval, which the caller clears.
function surveiller(ctx, groupe, bloque) {
  let bouge = Date.now();
  let arrete = false;
  const pas = Math.max(100, Math.min(30_000, Math.floor(ctx.immobileMs / 4)));
  return setInterval(() => {
    bouge = Math.max(bouge, derniereTrace(ctx.transcriptions), mtime(ctx.journal));
    if (!arrete && Date.now() - bouge >= ctx.immobileMs) {
      arrete = true;
      bloque();
      signalerGroupe(groupe, 'SIGTERM');
      setTimeout(() => signalerGroupe(groupe, 'SIGKILL'), 5_000).unref();
    }
  }, pas);
}

// The wait for the session of group <groupe> that a dead circuit left running, under the same
// watch as a session: a resumption starts once it has ended, so that two sessions never write
// together in the copy.
async function attendreLaSeance(ctx, groupe) {
  if (!groupe || !signalerGroupe(groupe, 0)) return;
  process.stderr.write(
    `… la séance du groupe ${groupe}, laissée par l'arrêt d'avant, tourne encore : le circuit attend sa fin.\n`
  );
  const veille = surveiller(ctx, groupe, () => {});
  while (signalerGroupe(groupe, 0)) await new Promise(r => setTimeout(r, 500));
  clearInterval(veille);
}

// The template of the instruction at <rang> (0 the testeur's and the developpeur's, 1 the
// reviewer's, 2 the chef de chantier's on a stop, 3 the chef's on the supervisor's answer), filled with
// <valeurs>.
function consigne(valeurs, rang = 0) {
  const texte = readFileSync(GABARIT, 'utf8');
  const bloc = [...texte.matchAll(/```text\n([\s\S]*?)\n```/g)][rang];
  if (!bloc) throw new Error(`gabarit sans bloc de consigne n° ${rang + 1} : ${GABARIT}`);
  return `${bloc[1].replace(/\{\{(\w+)\}\}/g, (m, k) => (k in valeurs ? valeurs[k] : m))}\n`;
}

// One session of <role> on <composant>, launched again once when it leaves no handover: the new
// comments of the agents, `{ author, text }`. Throws an Arret for a launch that stops before its
// session, a motionless session, or twice no handover.
async function seance(ctx, role, composant, { tentative, rapport, fort }) {
  const avant = passations(ctx);
  const lots = role === 'developpeur' ? testsDuLot(ctx) : testsDuComposant(ctx, composant);
  const valeurs = {
    role: role === 'developpeur' ? 'développeur' : role,
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    composant,
    reprise:
      tentative > 1 || ctx.reprendre || ctx.depuis || ctx.renvois
        ? "oui : une séance d'avant a travaillé ce composant ; ta copie garde son travail, le rapport ci-dessous dit ce qui reste"
        : 'non',
    lots: lots.length
      ? `${role === 'developpeur' ? 'le lot de tests' : 'tes tests'}, déjà dans la copie : ${lots.join(', ')}`
      : 'aucun',
    contexte: (!ctx.depuis && ctx.contexte) || 'aucun',
    description: ctx.description.trim() || 'aucune',
    rapport: rapport ?? 'aucun',
    passation: avant.at(-1)?.text ?? 'aucune',
  };
  return await jusquALaPassation(ctx, role, composant, consigne(valeurs), { fort });
}

// The session of <role> on <composant> with the instruction <texte>, launched again once when it
// leaves no comment <attendu> accepts (any comment of an agent, by default): the new comments of
// the agents, `{ author, text }`. Throws an Arret for a launch that stops before its session, a motionless session,
// or twice no such comment.
async function jusquALaPassation(ctx, role, composant, texte, options = {}) {
  const attendu = options.attendu ?? (() => true);
  const quoi = options.quoi ?? 'passation';
  for (let essai = 1; essai <= 2; essai++) {
    const avant = passations(ctx);
    const r = await lancer(ctx, role, composant, texte, options);
    if (r.bloque) {
      const minutes = Math.round(ctx.immobileMs / 60_000);
      throw new Arret(
        'bloqué',
        `La transcription de la séance du ${role} n'a pas bougé en ${minutes ? `${minutes} min` : `${ctx.immobileMs} ms`} : la séance est arrêtée. Les dernières lignes du journal :\n\n${fin(lire(ctx.journal), 40)}`
      );
    }
    if (r.seance === null) {
      throw new Arret(
        'lancement',
        `Le lanceur s'arrête avant la séance du ${role} (code ${r.code}).\n${r.erreur.trim()}\n\n${fin(lire(ctx.journal), 20)}`
      );
    }
    const neufs = passations(ctx).slice(avant.length);
    if (neufs.some(attendu)) return neufs;
    if (essai === 1) {
      commenter(ctx, composant, role, `séance finie sans ${quoi} au ticket ; relancée une fois.`);
      texte = `${texte}\nRELANCE : ta séance d'avant a fini sans ${quoi} au ticket. Ta ${quoi} s'écrit par \`bd comments add ${ctx.ticket}\` avant la fin de ta séance.\n`;
    }
  }
  throw new Arret(
    'sans-passation',
    `Deux séances du ${role} ont fini sans ${quoi} au ticket.\n\n${fin(lire(ctx.journal), 20)}`
  );
}

const lire = f => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// The circuit's reports at the ticket since the reviewer's last verdict: the comments of its proofs
// and checks (the final pass among them).
function rapportsDuCircuit(ctx) {
  const tous = lesCommentaires(ctx);
  const depuis = tous.findLastIndex(c => verdictDe(c)) + 1;
  const etape = new RegExp(`^${PREFIXE}\\S+ · (preuve|controles) :`);
  return tous
    .slice(depuis)
    .map(c => c.text)
    .filter(t => etape.test(t));
}

// The files of the lot, as the copy holds them against its HEAD: `{ tests, code }`, the
// testeur's files (`isTesterFile`: test files and the shared test material) and the others.
function fichiersDuLot(ctx) {
  const tests = [];
  const code = [];
  for (const { fichier } of changements(ctx)) {
    (isTesterFile(fichier, ctx.copie) ? tests : code).push(fichier);
  }
  return { tests: tests.sort(), code: code.sort() };
}

// The review of the lot, the reviewer's session out of the envelope, from the second template:
// `{ verdict, texte }`, the reviewer's last verdict among its new comments.
async function relire(ctx, composant) {
  const { tests, code } = fichiersDuLot(ctx);
  const rapports = rapportsDuCircuit(ctx);
  const precedents = passations(ctx).filter(c => verdictDe(c));
  const affirmations = path.join(ctx.tmp, 'affirmations.md');
  writeFileSync(affirmations, ctx.description);
  const valeurs = {
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    composants: ctx.composants.join(', '),
    reprise: precedents.length
      ? `oui : ${precedents.length} relecture(s) d'avant ont rendu le lot, leurs verdicts sont au ticket, et le lot a repassé le circuit depuis`
      : 'non',
    lots: [
      `le lot de tests : ${tests.join(', ') || 'aucun fichier'}`,
      `le lot de code : ${code.join(', ') || 'aucun fichier'}`,
    ].join(' ; '),
    description: ctx.description.trim() || 'aucune',
    affirmations,
    rapports: rapports.join('\n\n') || 'aucun',
  };
  const neufs = await jusquALaPassation(ctx, 'relecteur', composant, consigne(valeurs, 1), {
    horsEnveloppe: true,
    // The verdict, whole, at the ticket under the reviewer's author: a comment on several lines
    // with its findings' headings.
    surReponse: texte => {
      if (!VERDICT.test(texte)) return;
      const r = ctx.bdSous(AUTEUR_DU_VERDICT, 'comments', 'add', ctx.ticket, texte);
      if (r.status !== 0) process.stderr.write(`⚠️  verdict non écrit au ticket : ${r.stderr}\n`);
    },
    attendu: c => verdictDe(c) !== null,
    quoi: 'verdict',
  });
  const dernier = neufs.filter(c => verdictDe(c)).at(-1);
  return { verdict: verdictDe(dernier), texte: dernier.text };
}

// The findings of the verdict RENDU <texte>, each a block that opens on a heading `Constat`
// (`### Constat 1 — <adresse>`) and ends at the next heading: `{ titre, texte, role, composant,
// critere }`, `role` and `composant` read from its line `Agent : <rôle> <composant>` (null
// without one), `critere` true when it carries the line `Critère en cause : …`.
export function constats(texte) {
  const blocs = [];
  let courant = null;
  for (const ligne of String(texte).split('\n')) {
    if (/^\s*#{1,6}\s*Constat\b/i.test(ligne)) {
      courant = { titre: ligne.replace(/^\s*#+\s*/, '').trim(), lignes: [ligne] };
      blocs.push(courant);
    } else if (/^\s*#{1,6}\s/.test(ligne)) {
      courant = null;
    } else if (courant) {
      courant.lignes.push(ligne);
    }
  }
  return blocs.map(({ titre, lignes }) => {
    const corps = lignes.join('\n').trim();
    return {
      titre,
      texte: corps,
      ...ligneAgent(corps),
      critere: /^\s*(?:[-*]\s*)?\**Critère en cause\**\s*:/im.test(corps),
    };
  });
}

// The first line `Agent : <rôle> <composant>` of <texte>, a finding of the reviewer or a handover of
// the developpeur: `{ role, composant }`, both null without one.
function ligneAgent(texte) {
  const agent = /^\s*(?:[-*]\s*)?\**Agent\**\s*:\s*\**\s*(\S+)\s+`?([^\s`*]+)/im.exec(texte);
  return {
    role: agent ? agent[1] : null,
    // The punctuation that ends the line, never the root `.` itself.
    composant: agent ? agent[2].replace(/(?<=.)[,.;]+$/, '') : null,
  };
}

// The sending to a testeur in the new handovers <neufs> of the developpeur of the component at
// <index>: `{ index, texte }`, the component its last line `Agent : testeur <composant>` names, one
// of the title up to <index>, and that handover; null without such a line.
function renvoiAuTesteur(ctx, neufs, index) {
  for (const c of [...neufs].reverse()) {
    const { role, composant } = ligneAgent(c.text);
    if (role !== 'testeur' || !composant) continue;
    let i = -1;
    try {
      i = ctx.composants.indexOf(ctx.resoudre(composant));
    } catch {
      i = -1;
    }
    return i >= 0 && i <= index ? { index: i, texte: c.text } : null;
  }
  return null;
}

// The agents a verdict RENDU sends the lot back to: Map index of component → `{ etape,
// testeur, developpeur }`, `etape` the first step that component plays again (testeur when a
// finding names its testeur), `testeur` and `developpeur` the findings for each, or null. Throws
// an Arret `relecture-arret` for a verdict without findings, a finding without a valid recipient
// (a role other than testeur or developpeur, a component the title does not name) or one that
// puts a criterion in question.
function renvoisDuVerdict(ctx, texte) {
  const liste = constats(texte);
  const arret = raison =>
    new Arret(
      'relecture-arret',
      `${raison} La décision revient au chef de chantier.\n\nLe verdict :\n\n${texte}`
    );
  if (liste.length === 0) {
    throw arret(
      'Le verdict RENDU ne porte aucun constat (`### Constat …`, avec sa ligne `Agent : <rôle> <composant>`).'
    );
  }
  const renvois = new Map();
  for (const c of liste) {
    if (c.critere) throw arret(`Le constat « ${c.titre} » met en cause un critère du ticket.`);
    let index = -1;
    if (c.composant) {
      try {
        index = ctx.composants.indexOf(ctx.resoudre(c.composant));
      } catch {
        index = -1;
      }
    }
    if (!DESTINATAIRES.includes(c.role) || index < 0) {
      throw arret(
        `Le constat « ${c.titre} » n'a pas de destinataire valide : sa ligne \`Agent : <rôle> <composant>\` nomme ${c.role ? `« ${c.role} ${c.composant} »` : 'personne'}, quand le rôle est testeur ou developpeur et le composant l'un du titre (${ctx.composants.join(', ')}).`
      );
    }
    const r = renvois.get(index) ?? { etape: 'developpeur', testeur: [], developpeur: [] };
    r[c.role].push(c.texte);
    if (c.role === 'testeur') r.etape = 'testeur';
    renvois.set(index, r);
  }
  const joindre = l => (l.length ? l.join('\n\n') : null);
  return new Map(
    [...renvois].map(([i, r]) => [
      i,
      { etape: r.etape, testeur: joindre(r.testeur), developpeur: joindre(r.developpeur) },
    ])
  );
}

// The integration of the lot: its two patches and its message, written from the copy, then
// scripts/integration/integrer.mjs from the main tree, its output added to the log. A run « à
// repasser » (75) plays once more. `{ code, sortie }`.
function integrer(ctx) {
  const { tests, code } = fichiersDuLot(ctx);
  const dansCopie = (...a) =>
    spawnSync('git', ['-C', ctx.copie, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  // Each file against HEAD, a new one against nothing: the index of the copy is not written.
  const patch = fichiers =>
    fichiers
      .map(f =>
        dansCopie('cat-file', '-e', `HEAD:${f}`).status === 0
          ? dansCopie('diff', '--binary', 'HEAD', '--', f).stdout
          : dansCopie('diff', '--no-index', '--binary', '/dev/null', f).stdout
      )
      .join('');
  const args = ['--ticket', ctx.ticket];
  for (const [option, fichiers] of [
    ['--tests', tests],
    ['--code', code],
  ]) {
    if (!fichiers.length) continue;
    const f = path.join(ctx.tmp, `${option.slice(2)}.patch`);
    writeFileSync(f, patch(fichiers));
    args.push(option, f);
  }
  const message = path.join(ctx.tmp, 'message');
  writeFileSync(message, messageDeCommit(ctx));
  args.push('--message', message);
  let r;
  for (let essai = 1; essai <= 2; essai++) {
    entete(ctx, 'integration', ctx.composants.join(', '));
    appendFileSync(ctx.journal, `$ node ${INTEGRER} ${args.join(' ')}\n`);
    const x = spawnSync(process.execPath, [INTEGRER, ...args], {
      cwd: ctx.racine,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    r = { code: x.status ?? 1, sortie: `${x.stdout ?? ''}${x.stderr ?? ''}` };
    appendFileSync(ctx.journal, r.sortie);
    if (r.code !== A_REPASSER) break;
  }
  return r;
}

// The queue (scripts/integration/file.mjs), launched from the main tree and waited for, its output
// added to the log; then the state it leaves to the ticket: `{ etat, raison }`, `etat` ferme (the
// ticket closed, its branch on main and its CI read), en-file (the branch still in the queue, the
// queue's reason) or rouvert (out of the queue, or a red CI, the queue's last comment). A queue
// already running exits 0 at once: it takes the branch, and the state is read at its end too.
function file(ctx) {
  entete(ctx, 'file', ctx.composants.join(', '));
  appendFileSync(ctx.journal, `$ node ${FILE}\n`);
  const x = spawnSync(process.execPath, [FILE], {
    cwd: ctx.racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  appendFileSync(ctx.journal, `${x.stdout ?? ''}${x.stderr ?? ''}`);
  const branche = `agent/${ctx.ticket}`;
  // Another queue that runs takes the branch: the circuit waits for its end.
  while (lireEntrees(ctx.racine).some(e => e.branche === branche) && fileEnCours(ctx)) {
    attendreUnPeu(5_000);
  }
  const show = ctx.bd('show', ctx.ticket, '--json');
  const t = show.status === 0 ? (JSON.parse(show.stdout)[0] ?? {}) : {};
  const derniers = commentaires(ctx);
  const derniere = motif => derniers.findLast(c => motif.test(c)) ?? 'aucun commentaire de la file';
  if (lireEntrees(ctx.racine).some(e => e.branche === branche)) {
    return { etat: 'en-file', raison: derniere(/^## La file garde la branche/) };
  }
  if (t.status === 'closed') {
    // The CI the queue could not read is the queue's last word at the ticket.
    const dernier = derniers.at(-1) ?? '';
    const ci = /^## CI non lue/.test(dernier)
      ? ` ; ${premiereLigne(dernier.split('\n').slice(2).join(' '))}`
      : '';
    return { etat: 'ferme', raison: `${t.close_reason || 'ticket fermé'}${ci}` };
  }
  return { etat: 'rouvert', raison: derniere(/^## (Sortie de la file|CI rouge)/) };
}

// True while a queue holds its lock (`.git/file-integration.lock`), its process alive.
function fileEnCours(ctx) {
  const verrou = path.join(dossierCommun(ctx.racine), 'file-integration.lock');
  const pid = Number.parseInt(lire(verrou), 10);
  return Number.isInteger(pid) && vivant(pid);
}

// The type of a conventional commit for the ticket's type in Beads; `feat` for any other.
const TYPES_DE_COMMIT = { bug: 'fix', chore: 'chore', docs: 'docs' };

// The commit message of the lot: `<type>(<composants>): <sujet> (<ticket>)`, the components by
// their package name, then the trailer.
function messageDeCommit(ctx) {
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  const noms = ctx.composants
    .filter(c => c !== '.')
    .map(c => liste.find(p => p.dossier === c)?.pkg.name ?? path.basename(c));
  const type = TYPES_DE_COMMIT[ctx.type] ?? 'feat';
  const portee = noms.length ? `(${noms.join(',')})` : '';
  return `${type}${portee}: ${ctx.sujet} (${ctx.ticket})\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n`;
}

// The files the copy changes against its HEAD: [{ fichier, supprime }], relative to the copy.
function changements(ctx) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '-z', '--untracked-files=all'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) return [];
  const entrees = r.stdout.split('\0');
  const out = [];
  for (let i = 0; i < entrees.length; i++) {
    const e = entrees[i];
    if (e.length < 4) continue;
    const xy = e.slice(0, 2);
    out.push({ fichier: e.slice(3), supprime: xy.includes('D') });
    // A rename or a copy names its source next.
    if (/[RC]/.test(xy)) i++;
  }
  return out;
}

// The test files of the lot that the testeur writes, present in the copy.
function testsDuLot(ctx) {
  return changements(ctx)
    .filter(c => !c.supprime)
    .map(c => c.fichier)
    .filter(f => NOM_DE_TEST.test(path.basename(f)) && isTesterFile(f, ctx.copie))
    .sort();
}

// The test files of the lot written in <composant> or in the shared test material: the testeur's
// lot of this component.
function testsDuComposant(ctx, composant) {
  const dossiers = [
    path.join(ctx.copie, composant),
    ...(existsSync(ctx.copie) ? matieres(ctx.copie).map(m => m.dir) : []),
  ];
  return testsDuLot(ctx).filter(f => {
    const abs = path.join(ctx.copie, f);
    return dossiers.some(d => {
      const rel = path.relative(d, abs);
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
  });
}

// The package directory of the copy that holds <fichier>, or « . ».
function paquetDe(liste, fichier) {
  const p = liste.find(({ dossier }) => `${fichier}`.startsWith(`${dossier}${path.sep}`));
  return p ? p.dossier : '.';
}

// One npm command in the copy, under <env> added to the circuit's environment, added to the log:
// `{ code, sortie }`.
function npm(ctx, etape, composant, args, env = {}) {
  entete(ctx, etape, composant);
  const prefixe = Object.entries(env).map(([k, v]) => `${k}=${v} `);
  appendFileSync(ctx.journal, `$ ${prefixe.join('')}npm ${args.join(' ')}\n`);
  const r = spawnSync('npm', args, {
    cwd: ctx.copie,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 256 * 1024 * 1024,
  });
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  appendFileSync(ctx.journal, sortie);
  return { code: r.status ?? 1, sortie };
}

// The justification of the green test <noms> (its title and its full name) in the comments of
// the agents: the reason of its line `vert attendu : <nom> — <raison>`, or null.
function justification(lignes, noms) {
  for (const l of lignes) {
    const m = /^\s*(?:[-*]\s*)?vert attendu\s*:\s*(.*)$/i.exec(l);
    if (!m) continue;
    for (const nom of noms) {
      if (nom && m[1].startsWith(`${nom} —`)) return m[1].slice(nom.length).replace(/^\s*—\s*/, '');
    }
  }
  return null;
}

// HEAD's version of each file of <fichiers> that HEAD holds, written beside it in the copy under
// the name `<nom>.circuit-avant.<test|spec>.<ext>`, which the same run plays: Map file → sibling,
// both relative to the copy. The caller removes the siblings.
function versionsDAvant(ctx, fichiers) {
  const out = new Map();
  for (const f of fichiers) {
    const r = spawnSync('git', ['-C', ctx.copie, 'show', `HEAD:${f}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) continue;
    const soeur = f.replace(/\.(test|spec)(\.[cm]?[jt]sx?)$/, '.circuit-avant.$1$2');
    if (soeur === f) continue;
    writeFileSync(path.join(ctx.copie, soeur), r.stdout);
    out.set(f, soeur);
  }
  return out;
}

// The proof of the red on <composant>: `{ ok, rouges, texte, resume }`, `texte` without the list
// of the justified greens, which only the whole report, written to its file, holds.
function preuve(ctx, composant) {
  const fichiers = testsDuComposant(ctx, composant);
  const lignes = passations(ctx).flatMap(c => c.text.split('\n'));
  const rouges = [];
  const justifies = [];
  const injustifies = [];
  const casses = [];
  const liste = paquets(ctx.copie).filter(p => !p.hors);
  const index = ctx.composants.indexOf(composant);
  // Each package of the component plays whole, beside the files of the lot.
  const entiers = paquetsDesComposants(ctx, liste, i => i === index);
  const groupes = new Map(entiers.map(d => [d, []]));
  for (const f of fichiers) {
    const p = paquetDe(liste, f);
    groupes.set(p, [...(groupes.get(p) ?? []), f]);
  }
  let anciens = 0;
  const reportes = [];
  for (const [dossier, groupe] of groupes) {
    const entier = entiers.includes(dossier);
    const rapport = path.join(ctx.tmp, `preuve-${++ctx.numero}.json`);
    const avant = versionsDAvant(ctx, groupe);
    let r;
    try {
      r = npm(ctx, 'preuve', composant, [
        'test',
        '--',
        ...(entier ? [dossier] : []),
        ...groupe,
        ...avant.values(),
        '--reporter=default',
        '--reporter=json',
        `--outputFile=${rapport}`,
      ]);
    } finally {
      for (const soeur of avant.values()) rmSync(path.join(ctx.copie, soeur), { force: true });
    }
    let resultats = [];
    try {
      resultats = JSON.parse(readFileSync(rapport, 'utf8')).testResults ?? [];
    } catch {
      // No report: no file of the group played.
    }
    // The builds of the component's packages that failed: each one a red, not compiling is failing.
    const constructions = constructionsEchouees(ctx, liste, r.sortie, index);
    for (const { nom, erreur } of constructions) {
      if (reportes.includes(nom)) continue;
      rouges.push(`construction de ${nom} — ${erreur}`);
      reportes.push(nom);
    }
    // The files out of the lot, which HEAD holds green: a red of theirs is a regression of the lot.
    if (entier) {
      const duLot = new Set(groupe.map(f => path.join(ctx.copie, f)));
      for (const res of resultats) {
        if (duLot.has(res.name) || /\.circuit-avant\.(test|spec)\./.test(res.name)) continue;
        const f = path.relative(ctx.copie, res.name);
        const assertions = res.assertionResults ?? [];
        if (assertions.length === 0 && res.status === 'failed' && !constructions.length) {
          rouges.push(
            `rouge existant : ${f} — ne se charge pas : ${premiereLigne(res.message || res.status)}`
          );
        }
        for (const a of assertions.filter(x => x.status === 'failed')) {
          rouges.push(
            `rouge existant : ${f} › ${a.fullName || a.title} — ${premiereLigne(a.failureMessages?.[0])}`
          );
        }
      }
    }
    for (const f of groupe) {
      const res = resultats.find(t => t.name === path.join(ctx.copie, f));
      const assertions = res?.assertionResults ?? [];
      // The green tests of HEAD's version of the file, by their full name.
      const deHead = new Set(
        (
          resultats.find(t => avant.has(f) && t.name === path.join(ctx.copie, avant.get(f)))
            ?.assertionResults ?? []
        )
          .filter(a => a.status === 'passed')
          .map(a => a.fullName || a.title)
      );
      if (constructions.length && (!res || assertions.length === 0)) {
        // It cannot load before the build: it plays at the checks.
      } else if (!res) {
        casses.push(
          `${f} — ne se charge pas : non joué (code ${r.code}) ; ${premiereLigne(fin(r.sortie, 5))}`
        );
      } else if (assertions.length === 0) {
        casses.push(`${f} — ne se charge pas : ${premiereLigne(res.message || res.status)}`);
      }
      for (const a of assertions) {
        const nom = a.fullName || a.title;
        if (a.status === 'failed') {
          rouges.push(`${f} › ${nom} — ${premiereLigne(a.failureMessages?.[0])}`);
        } else if (a.status === 'passed' && deHead.has(nom)) {
          anciens++;
        } else if (a.status === 'passed') {
          const raison = justification(lignes, [a.title, a.fullName]);
          if (raison) justifies.push(`${f} › ${nom} — ${raison}`);
          else injustifies.push(`${f} › ${nom}`);
        }
      }
    }
  }
  const section = (titre, l) =>
    l.length ? [`${titre} (${l.length}) :`, ...l.map(x => `- ${x}`), ''] : [];
  const ok =
    (fichiers.length > 0 || rouges.length > 0) &&
    casses.length === 0 &&
    injustifies.length === 0 &&
    rouges.length + justifies.length + anciens > 0;
  const resume = `${rouges.length} rouge(s), ${justifies.length} vert(s) justifié(s), ${injustifies.length} vert(s) sans « vert attendu », ${casses.length} fichier(s) qui ne se charge(nt) pas, ${anciens} test(s) vert(s) que HEAD tient déjà, laissé(s) de côté`;
  const ecrit = (...sections) =>
    [
      `Preuve du rouge sur ${composant} : ${resume}.`,
      ...[...new Set(reportes)].map(
        nom => `Les tests de ${nom} se jouent aux contrôles, après le développeur.`
      ),
      '',
      ...(fichiers.length || rouges.length
        ? []
        : [`Aucun fichier de test du lot dans ${composant} : rien ne prouve le rouge.`, '']),
      ...section('Rouges', rouges),
      ...sections,
      ...section(
        'Verts sans « vert attendu » (un test vert avant le code passe seulement avec la ligne `vert attendu : <nom du test> — <raison>` dans la passation)',
        injustifies
      ),
      ...section('Fichiers qui ne prouvent rien', casses),
    ]
      .join('\n')
      .trim();
  let n = 1;
  while (existsSync(`${ctx.copie}.preuve-${n}.md`)) n++;
  const complet = `${ctx.copie}.preuve-${n}.md`;
  writeFileSync(complet, `${ecrit(...section('Verts justifiés', justifies))}\n`);
  const texte = ecrit(
    `Le rapport entier, avec les verts justifiés et leurs raisons : ${complet}`,
    ''
  );
  return { ok, rouges: rouges.length, texte, resume };
}

// The builds that failed in <sortie> (Turborepo's line « Failed: », task `<package>#build`) of a
// package of the component at <index>: `{ nom, erreur }`, `erreur` the first line of the build's
// output (`<package>:build:`) that holds `error`, else the end of the output.
function constructionsEchouees(ctx, liste, sortie, index) {
  const texte = sansCouleurs(sortie);
  const noms = new Set();
  for (const m of texte.matchAll(/^\s*Failed:\s+(.+)$/gm)) {
    for (const tache of m[1].split(/[,\s]+/).filter(Boolean)) {
      const [nom, script] = tache.split('#');
      const p = liste.find(x => x.pkg.name === nom);
      if (script === 'build' && p && proprietaire(ctx, p.dossier) === index) noms.add(nom);
    }
  }
  return [...noms].map(nom => {
    const prefixe = `${nom}:build:`;
    const ligne = texte
      .split('\n')
      .map(l => l.trim())
      .find(l => l.startsWith(prefixe) && l.includes('error'));
    return {
      nom,
      erreur: ligne ? premiereLigne(ligne.slice(prefixe.length)) : premiereLigne(fin(sortie, 5)),
    };
  });
}

// The checks after the developpeur of the component at <index>: what is done, or, when <finale>,
// `npm run verifier`, what the integration plays. `{ rouge, aRepasser, texte, resume,
// proprietaire, horsTitre }`, `proprietaire` the index of the component that owns the red, -1 for
// none; `horsTitre` the packages out of the title whose task is red.
function controles(ctx, index, finale) {
  const composant = ctx.composants[index];
  const liste = paquets(ctx.copie).filter(p => !p.hors);
  const commandes = finale
    ? [{ args: ['run', 'verifier'] }]
    : commandesDuComposant(ctx, index, liste);
  const resultats = commandes.map(({ args, env }) => {
    let r = npm(ctx, 'controles', composant, args, env);
    // verifier plays a task at 75 again itself, at rest: its 75 is final.
    if (r.code === A_REPASSER && !finale) r = npm(ctx, 'controles', composant, args, env);
    return { args, env, ...r, ...proprietaires(ctx, liste, r.sortie) };
  });
  const echecs = resultats.filter(r => r.code !== 0 && r.code !== A_REPASSER);
  // Out of the final pass, a red that names only components after <index> waits for it.
  const attend = r =>
    !finale && r.proprietaires.length > 0 && r.proprietaires.every(i => i > index);
  const rouges = echecs.filter(r => !attend(r));
  const reportes = echecs.filter(attend);
  const aRepasser = resultats.filter(r => r.code === A_REPASSER);
  const ligne = r =>
    `${Object.entries(r.env ?? {})
      .map(([k, v]) => `${k}=${v} `)
      .join('')}npm ${r.args.join(' ')}`;
  const nommer = r => `${ligne(r)} (code ${r.code})`;
  const resume = rouges.length
    ? `rouge : ${rouges.map(nommer).join(' ; ')}`
    : aRepasser.length
      ? `à repasser : ${aRepasser.map(nommer).join(' ; ')}`
      : `verts : ${resultats
          .filter(r => !reportes.includes(r))
          .map(ligne)
          .join(' ; ')}${
          reportes.length
            ? ` ; laissés à la passe finale, rouges dans un composant d'après : ${reportes.map(nommer).join(' ; ')}`
            : ''
        }`;
  // Where the checks played: the final pass out of the envelope, on the whole copy; a
  // component's checks, its tests and packages, its guards in its envelope.
  const ou = finale
    ? `Contrôles de la passe finale, hors enveloppe, sur la copie entière (après ${composant})`
    : `Contrôles du composant ${composant}, ses tests et ses paquets, ses gardes dans son enveloppe`;
  const texte = [
    `${ou} : ${resume}.`,
    ...[...rouges, ...aRepasser].map(r => `\n$ ${ligne(r)}\n${extrait(r)}`),
  ].join('\n');
  // The owner of the red: the first component, provider first, that a red names; -1 for none.
  const nommes = rouges.flatMap(r => r.proprietaires);
  const proprio = rouges.length && nommes.length ? Math.min(...nommes) : -1;
  return {
    rouge: rouges.length > 0,
    aRepasser: aRepasser.length > 0,
    texte,
    resume,
    proprietaire: proprio,
    horsTitre: [...new Set(rouges.flatMap(r => r.horsTitre))].sort(),
  };
}

// The checks of the components of the run up to <index>, out of the final pass: `npm test --
// <test files of the lot>` that lie in them (or in the shared test material that reads only
// them), `npm test -- <package>` for each of their packages and each of theirs the lot touches,
// then the guards in the envelope of the component.
function commandesDuComposant(ctx, index, liste) {
  const lot = changements(ctx);
  const touches = liste.length
    ? [...new Set(lot.map(c => paquetDe(liste, c.fichier)).filter(d => d !== '.'))].sort()
    : ['.'];
  const fait = chemin => {
    const i = proprietaire(ctx, chemin);
    return i >= 0 && i <= index;
  };
  const tests = testsDuLot(ctx).filter(f => fait(f) || matiereFaite(ctx, liste, f, index));
  const scripts = lireJson(path.join(ctx.copie, 'package.json'))?.scripts ?? {};
  const enveloppe = { [VARIABLE_ENVELOPPE]: ctx.composants[index] };
  return [
    ...(tests.length ? [{ args: ['test', '--', ...tests] }] : []),
    ...[...new Set([...touches.filter(fait), ...paquetsDesComposants(ctx, liste, i => i <= index)])]
      .sort()
      .map(d => ({ args: d === '.' ? ['test'] : ['test', '--', d] })),
    ...['grillhouse:gardes', 'gardes']
      .filter(s => s in scripts)
      .map(s => ({ args: ['run', s], env: enveloppe })),
  ];
}

// The lines of <texte> that Turborepo writes for the tasks <taches> (`<package>#<task>`): each
// begins with `<package>:<task>: `, a task of the root (`//#<task>`) with `<task>: ` or
// `//:<task>: `.
function lignesDesTaches(texte, taches) {
  const prefixes = taches.flatMap(t => {
    const [nom, script] = t.split('#');
    return nom === '//' ? [`${script}: `, `//:${script}: `] : [`${nom}:${script}: `];
  });
  return texte.split('\n').filter(l => prefixes.some(p => l.trimStart().startsWith(p)));
}

// The output of the red check <r> for its report: the lines of its failed tasks, the last 60,
// then the end of the output; else the last 60 lines of the output.
function extrait(r) {
  const lignes = lignesDesTaches(sansCouleurs(r.sortie), r.taches);
  return lignes.length
    ? [...lignes.slice(-60), '…', fin(r.sortie, 12)].join('\n')
    : fin(r.sortie, 60);
}

// The directories of the packages of <liste> that play tests (a script `test:vitest`) and whose
// component, by its index, <garde> keeps; sorted.
function paquetsDesComposants(ctx, liste, garde) {
  return liste
    .filter(p => p.pkg.scripts?.['test:vitest'])
    .filter(p => {
      const i = proprietaire(ctx, p.dossier);
      return i >= 0 && garde(i);
    })
    .map(p => p.dossier)
    .sort();
}

// Whether the component at <index> carries no test: in a repository of packages, no package of the
// frame with a script `test:vitest` lies in it or holds it, as `npm test -- <chemin>`
// (scripts/tests.mjs) refuses a path out of every package or in a package without that script. A
// repository without packages plays its tests at its root: each component has them.
function sansTests(ctx, index) {
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine).filter(p => !p.hors);
  if (liste.length === 0) return false;
  const c = ctx.composants[index];
  const touche = d => c === '.' || d === c || d.startsWith(`${c}/`) || c.startsWith(`${d}/`);
  return !liste.some(p => typeof p.pkg.scripts?.['test:vitest'] === 'string' && touche(p.dossier));
}

// Whether the copy holds a change of <composant> against its HEAD.
function livre(ctx, composant) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '--untracked-files=all', '--', composant],
    { encoding: 'utf8' }
  );
  return String(r.stdout ?? '').trim() !== '';
}

// The fingerprint of the files of <composant> in the copy: `git status --porcelain` of its
// directory and the content of each file it lists.
function empreinte(ctx, composant) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '-z', '--untracked-files=all', '--', composant],
    { encoding: 'utf8' }
  );
  const statut = String(r.stdout ?? '');
  const h = createHash('sha256').update(statut);
  for (const e of statut.split('\0')) {
    if (e.length < 4) continue;
    const f = path.join(ctx.copie, e.slice(3));
    try {
      if (statSync(f).isFile()) h.update(e).update(readFileSync(f));
    } catch {
      // A file removed: its line in the status is its trace.
    }
  }
  return h.digest('hex');
}

// The index of the component of the run that holds <chemin> (relative to the copy), the deepest
// one, `.` holding every path; -1 for none.
function proprietaire(ctx, chemin) {
  let trouve = -1;
  let profondeur = -1;
  ctx.composants.forEach((c, i) => {
    const dedans = c === '.' || chemin === c || chemin.startsWith(`${c}/`);
    const p = c === '.' ? 0 : c.split('/').length;
    if (dedans && p > profondeur) {
      trouve = i;
      profondeur = p;
    }
  });
  return trouve;
}

// True when <fichier> lies in a package of the shared test material that depends on no component
// after <index>: a test it holds then reads only what is done.
function matiereFaite(ctx, liste, fichier, index) {
  const m = matieres(ctx.copie)
    .map(x => path.relative(ctx.copie, x.dir))
    .find(d => fichier.startsWith(`${d}/`));
  if (!m) return false;
  const pkg =
    liste.find(p => p.dossier === m)?.pkg ??
    lireJson(path.join(ctx.copie, m, 'package.json')) ??
    {};
  const noms = Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  });
  return noms.every(n => {
    const p = liste.find(x => x.pkg.name === n);
    return !p || proprietaire(ctx, p.dossier) <= index;
  });
}

// What a red output names. `proprietaires`: the components that own it, as indexes, sorted: the
// packages of its failed tasks (Turborepo's line « Failed: »), else, when no failed task is a
// package's (none named, or a task of the root such as the guards), the components that hold a
// path its lines name, the lines of a notice (⚠️, ℹ️) aside. `horsTitre`: the packages of its
// failed tasks that no component of the title holds. `taches`: its failed tasks.
function proprietaires(ctx, liste, sortie) {
  const texte = sansCouleurs(sortie);
  const out = new Set();
  const horsTitre = new Set();
  const taches = new Set();
  let deRacine = false;
  for (const m of texte.matchAll(/^\s*Failed:\s+(.+)$/gm)) {
    for (const tache of m[1].split(/[,\s]+/).filter(Boolean)) {
      taches.add(tache);
      const p = liste.find(x => x.pkg.name === tache.split('#')[0]);
      const i = p ? proprietaire(ctx, p.dossier) : -1;
      if (i >= 0) out.add(i);
      else if (p) horsTitre.add(p.pkg.name);
      else deRacine = true;
    }
  }
  if (out.size === 0 && (deRacine || taches.size === 0)) {
    // The lines of the failed tasks when Turborepo names them: those of the green ones aside.
    const lignes = taches.size ? lignesDesTaches(texte, [...taches]) : texte.split('\n');
    for (const l of lignes) {
      if (l.includes('⚠️') || l.includes('ℹ️')) continue;
      for (const [chemin] of l.matchAll(/\/?[\w@.-]+(?:\/[\w@.-]+)+/g)) {
        const rel = path.isAbsolute(chemin) ? path.relative(ctx.copie, chemin) : chemin;
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
        const i = proprietaire(ctx, rel);
        if (i >= 0) out.add(i);
      }
    }
  }
  return {
    proprietaires: [...out].sort((a, b) => a - b),
    horsTitre: [...horsTitre].sort(),
    taches: [...taches],
  };
}

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// Where a component of a round of the reviewer's findings (or of `--depuis`) starts: the step and
// the report its finding names; else its checks when the circuit has carried it to green checks
// (`atteint`), or null, its whole circuit from its testeur, when it has not reached it yet. Null
// out of a round.
function entreeDuRenvoi(ctx, index) {
  if (!ctx.renvois) return null;
  const r = ctx.renvois[ctx.composants[index]];
  if (r) return { etape: r.etape, tentative: 1, rapport: r[r.etape] };
  if (index > ctx.composants.indexOf(ctx.atteint)) return null;
  return { etape: 'controles', tentative: 0, rapport: null };
}

// The component at <index>, whose checks are green, kept as `atteint` when it lies after it.
function atteindre(ctx, index) {
  if (index > ctx.composants.indexOf(ctx.atteint)) ctx.atteint = ctx.composants[index];
}

// The circuit from <debut> (where `depart` starts it) to the entry of the lot in the queue.
async function derouler(ctx, debut) {
  let { index, etape, tentative, rapport, dernier, finale } = debut;
  // The step a `--reprendre` starts at, the first of the loop.
  let reprise = Boolean(ctx.reprendre);
  for (;;) {
    const composant = ctx.composants[index];
    const reprend = reprise;
    reprise = false;
    const etat = {
      etape,
      composant,
      tentative,
      code: null,
      raison: null,
      rapport,
      dernier: ctx.composants[dernier],
      finale,
    };
    // A step the circuit leads itself names its start in the state while it runs, and writes its
    // line to the register at its end, whatever its outcome.
    const menee = MENEES.has(etape) ? { etape, composant, debut: new Date().toISOString() } : null;
    ecrireEtat(ctx, { ...etat, mene: menee?.debut ?? null });
    try {
      if (etape === 'testeur' && sansTests(ctx, index)) {
        commenter(
          ctx,
          composant,
          'testeur',
          'aucun test dans ce composant (aucun paquet avec un script test:vitest ne le tient) : ni testeur ni preuve, son développeur directement.'
        );
        rapport = [
          `Le composant ${composant} ne porte aucun test (aucun paquet avec un script test:vitest ne le tient) : le circuit le lance sans testeur ni preuve. Tu écris sa part du ticket d'après ses critères ; les contrôles suivent ta séance.`,
          rapport,
        ]
          .filter(Boolean)
          .join('\n\n');
        etape = 'developpeur';
        tentative = 1;
      } else if (etape === 'testeur') {
        await seance(ctx, 'testeur', composant, { tentative, rapport });
        commenter(ctx, composant, 'testeur', `séance ${tentative} finie, passation au ticket.`);
        etape = 'preuve';
      } else if (etape === 'preuve') {
        const p = preuve(ctx, composant);
        rapport = p.texte;
        if (p.ok) {
          const suite = p.rouges
            ? 'au développeur'
            : 'aucun rouge : un lot de tests seul, aux contrôles';
          commenter(ctx, composant, 'preuve', `${p.resume} ; ${suite}.\n\n${p.texte}`);
          etape = p.rouges ? 'developpeur' : 'controles';
          tentative = p.rouges ? 1 : 0;
          // The reviewer's findings for this developpeur follow the proof.
          const pourLui = ctx.renvois?.[composant]?.developpeur;
          if (p.rouges && pourLui)
            rapport = `${rapport}\n\nLES CONSTATS DU RELECTEUR :\n\n${pourLui}`;
        } else if (tentative <= RELANCES_TESTEUR) {
          commenter(
            ctx,
            composant,
            'preuve',
            `${p.resume} ; testeur relancé (séance ${tentative + 1}).\n\n${p.texte}`
          );
          etape = 'testeur';
          tentative++;
        } else {
          throw new Arret('preuve', p.texte);
        }
      } else if (etape === 'developpeur') {
        const fort = tentative >= SEANCES_DEVELOPPEUR;
        const avant = empreinte(ctx, composant);
        const neufs = await seance(ctx, 'developpeur', composant, { tentative, rapport, fort });
        const renvoi = renvoiAuTesteur(ctx, neufs, index);
        if (renvoi) {
          // The red that remains lies in the tests of that component: its testeur, as a chef's
          // `RELANCE --depuis testeur <composant>`, the handover as its context.
          const cible = ctx.composants[renvoi.index];
          if (ctx.renvoiAuTesteur === cible) {
            throw new Arret(
              'sans-livraison',
              `La passation de la séance ${tentative} du développeur de ${composant} renvoie une deuxième fois de suite à \`testeur ${cible}\`, sans contrôles verts depuis le premier renvoi : le testeur n'a pas levé ce rouge. Sa passation :\n\n${renvoi.texte}`
            );
          }
          ctx.renvoiAuTesteur = cible;
          commenter(
            ctx,
            composant,
            'developpeur',
            `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie ; sa passation renvoie le rouge à \`testeur ${cible}\` : le circuit rejoue ${cible} depuis son testeur, puis les composants d'après.`
          );
          ctx.reprendre = false;
          ctx.depuis = { etape: 'testeur', composant: cible };
          ctx.contexte = renvoi.texte;
          ({ index, etape, tentative, rapport, dernier, finale } = depart(ctx, null));
          continue;
        }
        if (empreinte(ctx, composant) === avant && reprend && livre(ctx, composant)) {
          // A resumed developpeur that finds its lot delivered: the checks judge it.
          commenter(
            ctx,
            composant,
            'developpeur',
            `séance ${tentative} reprise sans changement, le composant garde la livraison d'avant : aux contrôles.`
          );
        } else if (empreinte(ctx, composant) === avant) {
          throw new Arret(
            'sans-livraison',
            `La séance ${tentative} du développeur de ${composant} ne change aucun fichier de ${composant} : un développeur n'est lancé que sur un rouge, et ce rouge reste. Sa passation au ticket dit pourquoi :\n\n${passations(ctx).at(-1)?.text ?? 'aucune'}`
          );
        }
        commenter(
          ctx,
          composant,
          'developpeur',
          `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie, passation au ticket.`
        );
        etape = 'controles';
      } else if (etape === 'controles') {
        const passeFinale = finale || index === dernier;
        const k = controles(ctx, index, passeFinale);
        rapport = k.texte;
        // The developpeur a red goes to: this component's, or in the final pass the owner's.
        const vers = k.rouge && passeFinale ? k.proprietaire : index;
        // One count of sessions for the component's checks, and one for the whole final pass,
        // whichever component its red goes to.
        const suivante = tentative + 1;
        if (k.rouge && passeFinale && k.horsTitre.length) {
          throw new Arret(
            'controles',
            `La passe finale est rouge dans ${k.horsTitre.join(', ')}, hors des composants du ticket (${ctx.composants.join(', ')}) : aucun de leurs développeurs n'est relancé. La décision revient au chef de chantier : faire ajouter ce composant au titre du ticket par le superviseur (\`MONTE\`), le rouge allant ensuite à son développeur ; ou faire corriger le lot par le composant qui le cause (\`RELANCE --depuis developpeur <composant>\`, le rouge en \`CONTEXTE\`).\n\n${k.texte}`
          );
        } else if (k.rouge && vers < 0) {
          throw new Arret(
            'controles',
            `Aucun composant du ticket (${ctx.composants.join(', ')}) ne possède ce rouge de la passe finale : la décision revient au chef de chantier.\n\n${k.texte}`
          );
        } else if (k.rouge && suivante <= SEANCES_DEVELOPPEUR) {
          const qui = vers === index ? '' : ` de ${ctx.composants[vers]}`;
          commenter(
            ctx,
            composant,
            'controles',
            `${k.resume} ; développeur${qui} relancé (séance ${suivante}).`
          );
          etape = 'developpeur';
          tentative = suivante;
          index = vers;
          finale = passeFinale;
        } else if (k.rouge) {
          throw new Arret('controles', k.texte);
        } else if (k.aRepasser) {
          throw new Arret('a-repasser', k.texte);
        } else {
          commenter(ctx, composant, 'controles', `${k.resume}.`);
          // Green checks: a sending of the developpeur to a testeur may come again.
          ctx.renvoiAuTesteur = null;
          // Green checks carry this component, or at the final pass every one, to their end.
          atteindre(ctx, passeFinale ? dernier : index);
          if (!passeFinale) {
            index++;
            ({ etape, tentative, rapport } = entreeDuRenvoi(ctx, index) ?? {
              etape: 'testeur',
              tentative: 1,
              rapport: null,
            });
          } else {
            etape = 'relecture';
          }
        }
      } else if (etape === 'relecture') {
        const v = await relire(ctx, composant);
        if (v.verdict === 'ACCEPTÉ') {
          commenter(ctx, composant, 'relecture', 'ACCEPTÉ ; le lot va à l’intégration.');
          etape = 'integration';
        } else {
          // The reviews since the last ACCEPTÉ: a lot the queue sent back starts a new count.
          const verdicts = passations(ctx).filter(c => verdictDe(c));
          const depuis = verdicts.findLastIndex(c => verdictDe(c) === 'ACCEPTÉ') + 1;
          const rendus = verdicts.length - depuis;
          if (rendus >= RELECTURES) {
            throw new Arret(
              'relecture-arret',
              `${rendus} relectures ont rendu le lot : le circuit s'arrête à la troisième. La décision revient au chef de chantier.\n\nLe dernier verdict :\n\n${v.texte}`
            );
          }
          const renvois = renvoisDuVerdict(ctx, v.texte);
          ctx.renvois = Object.fromEntries([...renvois].map(([i, r]) => [ctx.composants[i], r]));
          index = Math.min(...renvois.keys());
          ({ etape, tentative, rapport } = entreeDuRenvoi(ctx, index));
          dernier = ctx.composants.length - 1;
          finale = false;
          const qui = [...renvois]
            .sort(([a], [b]) => a - b)
            .map(([i, r]) => `${r.etape} ${ctx.composants[i]}`)
            .join(', ');
          commenter(
            ctx,
            composant,
            'relecture',
            `RENDU (relecture ${rendus}) ; le circuit relance ${qui}, puis les composants d'après, la passe finale et le relecteur.`
          );
        }
      } else if (etape === 'integration') {
        const r = integrer(ctx);
        if (r.code === A_REPASSER) throw new Arret('a-repasser', fin(r.sortie, 40));
        if (r.code !== 0) {
          throw new Arret(
            'integration',
            `Le script d'intégration refuse le lot (code ${r.code}) : la décision revient au chef de chantier.\n\n${fin(r.sortie, 60)}`
          );
        }
        const commit = /✓ commit (\w+) sur (\S+)/.exec(r.sortie);
        commenter(
          ctx,
          composant,
          'integration',
          `${commit ? `commit ${commit[1]} sur ${commit[2]}` : 'lot commité'} ; la branche est en file.`
        );
        etape = 'file';
      } else if (etape === 'file') {
        const f = file(ctx);
        if (f.etat === 'ferme') {
          ecrireEtat(ctx, { ...etat, etape: 'integre', code: 0 });
          commenter(ctx, composant, 'file', `${f.raison}.`);
          return { code: 0 };
        }
        if (f.etat === 'en-file') throw new Arret('a-repasser', f.raison);
        throw new Arret(
          'integration',
          `La file rouvre le ticket : la décision revient au chef de chantier.\n\n${f.raison}`
        );
      } else {
        throw new Usage(`étape inconnue dans l'état : ${etape}`);
      }
    } catch (e) {
      if (!(e instanceof Arret)) throw e;
      const code = ARRETS[e.nom];
      ecrireEtat(ctx, { ...etat, code, raison: e.nom, rapport: e.rapport });
      commenter(
        ctx,
        composant,
        etape,
        `arrêt ${e.nom} — ${premiereLigne(e.rapport)} — journal ${ctx.journal}`
      );
      process.stderr.write(
        `⛔ Circuit de ${ctx.ticket} arrêté : ${e.nom}, à l'étape ${etape} de ${composant}.\n`
      );
      return { code, nom: e.nom, rapport: e.rapport, etat };
    } finally {
      if (menee) inscrireEtape(ctx, menee);
    }
  }
}

// The head of a decision, a line in one of its forms.
const TETE_DE_DECISION =
  /^(?:MONTE\s*:.*|RELANCE\s+--reprendre|RELANCE\s+--depuis\s+(?:testeur|developpeur)\s+\S+)$/;

// The decision in the chef de chantier's final answer <texte>, from its last line in one of its
// forms, the reasoning before it left out: `{ ligne, reprendre: true, contexte }` or
// `{ ligne, depuis: { etape, composant }, contexte }` for a RELANCE, `contexte` the text after
// `CONTEXTE :` (the rest of the answer) or null; `{ ligne, question }` for a MONTE. Null for an
// answer with no such line, a RELANCE followed by anything but its CONTEXTE, or a `--depuis`
// whose component the title does not name.
function lireDecision(ctx, texte) {
  // A line the chef sets in code or in bold reads as the line itself.
  const nue = l => l.trim().replace(/^[`*]+|[`*]+$/g, '');
  const toutes = String(texte ?? '')
    .trim()
    .split('\n');
  const debut = toutes.findLastIndex(l => TETE_DE_DECISION.test(nue(l)));
  if (debut < 0) return null;
  const lignes = toutes.slice(debut);
  const tete = nue(lignes[0]);
  const monte = /^MONTE\s*:\s*([\s\S]*)$/.exec(tete);
  if (monte) {
    const question = [monte[1], ...lignes.slice(1)].join('\n').trim();
    return question ? { ligne: `MONTE : ${question}`, question } : null;
  }
  const reste = lignes
    .slice(1)
    .join('\n')
    .trim()
    .replace(/^[`*]+/, '');
  const c = /^CONTEXTE\s*:[`*]*\s*([\s\S]*)$/.exec(reste);
  if (reste && !c) return null;
  const contexte = c?.[1].trim() || null;
  const avec = l => (contexte ? `${l}\nCONTEXTE : ${contexte}` : l);
  if (/^RELANCE\s+--reprendre$/.test(tete)) {
    return { ligne: avec('RELANCE --reprendre'), reprendre: true, contexte };
  }
  const d = /^RELANCE\s+--depuis\s+(testeur|developpeur)\s+(\S+)$/.exec(tete);
  if (!d) return null;
  let composant;
  try {
    composant = ctx.resoudre(d[2]);
  } catch {
    return null;
  }
  if (!ctx.composants.includes(composant)) return null;
  return {
    ligne: avec(`RELANCE --depuis ${d[1]} ${composant}`),
    depuis: { etape: d[1], composant },
    contexte,
  };
}

// Whether the stops <a> and <b> are the same: their name, step and component.
const memeArret = (a, b) =>
  Boolean(a && b) &&
  a.nom === b.nom &&
  a.etat.etape === b.etat.etape &&
  a.etat.composant === b.etat.composant;

// The stop <a> (`{ code, nom, rapport, etat }`, `etat` the state of the step it stopped) settled
// by a session of the chef de chantier: a fresh one, or, with <reponse> (the supervisor's answer to its
// question), its session `a.seance` resumed. `{ code }` when the circuit ends: on « question », or
// on the stop itself for an answer in no form of decision or a session in error; `{ depart }`
// for a RELANCE, where the run starts again.
async function trancher(ctx, a, reponse = null) {
  const seance = reponse === null ? randomUUID() : a.seance;
  const garde = { seance, arret: a.nom, code: a.code, rapport: a.rapport };
  const { composant } = a.etat;
  const arret = { ...a.etat, code: a.code, raison: a.nom, rapport: a.rapport };
  ecrireEtat(ctx, { ...arret, chef: garde });
  const valeurs = {
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    arret: a.nom,
    code: a.code,
    etape: a.etat.etape,
    composant,
    raison: String(a.rapport ?? '').trim() || 'aucune',
    etat: ctx.etat,
    journal: ctx.journal,
    reponse,
  };
  const chef = (rang, session) =>
    lancer(ctx, CHEF, composant, consigne(valeurs, rang), {
      horsEnveloppe: true,
      droits: droitsDuChef(ctx),
      session,
    });
  let r = await chef(
    reponse === null ? 2 : 3,
    reponse === null ? ['--session-id', seance] : ['--resume', seance]
  );
  let d = !r.bloque && r.seance === 0 ? lireDecision(ctx, r.reponse) : null;
  // An answer in no form of decision: its session resumed once, asked for its decision.
  if (!d && !r.bloque && r.seance === 0) {
    r = await chef(4, ['--resume', seance]);
    d = !r.bloque && r.seance === 0 ? lireDecision(ctx, r.reponse) : null;
  }
  if (!d) {
    const pourquoi = r.bloque
      ? `sa séance, immobile ${Math.round(ctx.immobileMs / 60_000)} min, est arrêtée`
      : r.seance === null
        ? `sa séance ne démarre pas (code ${r.code}) : ${r.erreur.trim()}`
        : r.seance !== 0
          ? `sa séance finit en erreur (code ${r.seance})`
          : 'sa réponse ne suit aucune forme de décision, deux fois';
    ecrireEtat(ctx, {
      ...arret,
      rapport: `${String(a.rapport ?? '').trim()}\n\nLE CHEF DE CHANTIER ne rend pas de décision : ${pourquoi}. Sa réponse :\n\n${r.reponse || 'aucune'}`,
    });
    process.stderr.write(
      `⛔ Circuit de ${ctx.ticket} arrêté : ${a.nom} ; le chef de chantier ne rend pas de décision (${pourquoi}).\n`
    );
    return { code: a.code };
  }
  commenter(ctx, composant, 'chef', d.ligne);
  if (d.question) {
    ctx.relances = [];
    ecrireEtat(ctx, {
      ...arret,
      code: ARRETS.question,
      raison: 'question',
      rapport: d.question,
      chef: garde,
    });
    process.stderr.write(
      `⛔ Circuit de ${ctx.ticket} arrêté : question du chef de chantier au superviseur, qui y répond ou la porte au responsable ; la réponse se passe par \`node scripts/circuit.mjs ${ctx.ticket} --reponse "<texte>"\`.\n`
    );
    return { code: ARRETS.question };
  }
  ctx.relances = memeArret(ctx.relances[0], a)
    ? [...ctx.relances, { ...a, decision: d.ligne }]
    : [{ ...a, decision: d.ligne }];
  ctx.reprendre = Boolean(d.reprendre);
  ctx.depuis = d.depuis ?? null;
  ctx.contexte = d.contexte;
  return { depart: depart(ctx, { ...arret, renvois: ctx.renvois }) };
}

// The run from <suite> on: each stop other than 0 and 75 settled by the chef de chantier, whose
// RELANCE runs the circuit again, until the circuit ends; its exit code. The stop that follows the
// third RELANCE in a row on it ends the circuit without a chef.
async function conduire(ctx, suite) {
  for (;;) {
    if (suite.code !== undefined) return suite.code;
    const a = await derouler(ctx, suite.depart);
    if (a.code === 0 || a.code === A_REPASSER) return a.code;
    if (ctx.relances.length >= RELANCES_DU_CHEF && memeArret(ctx.relances[0], a)) {
      const decisions = ctx.relances.map((x, i) => `${i + 1}. ${x.decision}`).join('\n\n');
      ecrireEtat(ctx, {
        ...a.etat,
        code: a.code,
        raison: a.nom,
        rapport: `${String(a.rapport ?? '').trim()}\n\nLE CHEF DE CHANTIER a rendu ${ctx.relances.length} décisions RELANCE d'affilée sur cet arrêt : le circuit s'arrête au lieu d'une ${ctx.relances.length + 1}e relance. Ses décisions :\n\n${decisions}`,
      });
      commenter(
        ctx,
        a.etat.composant,
        'chef',
        `${ctx.relances.length} RELANCE d'affilée sur l'arrêt ${a.nom} : le circuit s'arrête.`
      );
      return a.code;
    }
    suite = await trancher(ctx, a);
  }
}

// Where the run starts: the first component's testeur, or the step and component of the state
// <e> (null without one).
function depart(ctx, e) {
  const fin = ctx.composants.length - 1;
  if (ctx.depuis) {
    const { etape, composant } = ctx.depuis;
    ctx.renvois = { [composant]: { etape, [etape]: ctx.contexte } };
    return {
      index: ctx.composants.indexOf(composant),
      etape,
      tentative: 1,
      rapport: ctx.contexte,
      dernier: fin,
      finale: false,
    };
  }
  if (!ctx.reprendre) {
    // The run starts over: no component is reached yet.
    ctx.atteint = null;
    return { index: 0, etape: 'testeur', tentative: 1, rapport: null, dernier: fin, finale: false };
  }
  if (!e) throw new Usage(`rien à reprendre : ${ctx.etat} n'existe pas.`);
  if (e.etape === 'integre')
    throw new Usage(`rien à reprendre : le lot de ${ctx.ticket} est intégré.`);
  const index = ctx.composants.indexOf(e.composant);
  if (index < 0)
    throw new Usage(`le composant de l'état, ${e.composant}, n'est plus dans le titre.`);
  const dernier = ctx.composants.indexOf(e.dernier);
  ctx.renvois = e.renvois ?? null;
  return {
    index,
    etape: e.etape,
    tentative: e.etape === 'controles' ? 0 : 1,
    rapport: e.rapport,
    dernier: dernier < 0 ? fin : dernier,
    finale: e.finale === true,
  };
}

export async function main(argv) {
  let ctx = null;
  try {
    ctx = contexte(lireArguments(argv));
    mkdirSync(path.dirname(ctx.copie), { recursive: true });
    const e = existsSync(ctx.etat) ? JSON.parse(readFileSync(ctx.etat, 'utf8')) : null;
    if (ctx.reponse !== null && (e?.raison !== 'question' || !e?.chef?.seance)) {
      throw new Usage(
        `--reponse : aucune séance du chef gardée dans ${ctx.etat} ; elle suit un arrêt « question ».`
      );
    }
    // The components the runs before carried to green checks.
    ctx.atteint = e?.atteint ?? null;
    const d = ctx.reponse === null ? depart(ctx, e) : null;
    // A session a dead circuit left running ends before this run launches its own.
    await attendreLaSeance(ctx, e?.seance);
    if (ctx.reponse === null) return await conduire(ctx, { depart: d });
    // The supervisor's answer goes to the chef's session kept on the stop it settles.
    ctx.renvois = e.renvois ?? null;
    const arret = {
      code: e.chef.code,
      nom: e.chef.arret,
      rapport: e.chef.rapport,
      seance: e.chef.seance,
      etat: {
        etape: e.etape,
        composant: e.composant,
        tentative: e.tentative,
        code: null,
        raison: null,
        rapport: e.chef.rapport,
        dernier: e.dernier,
        finale: e.finale === true,
      },
    };
    return await conduire(ctx, await trancher(ctx, arret, ctx.reponse));
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    process.stderr.write(
      `usage: circuit.mjs <ticket> [--reprendre] [--depuis <testeur|developpeur> <composant>] [--contexte <texte>] | --reponse <texte>\n⛔ ${e.message}\n`
    );
    return CODE_USAGE;
  } finally {
    if (ctx) rmSync(ctx.tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
