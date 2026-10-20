#!/usr/bin/env node
// The circuit of one ticket: for each component its title names, in order, the provider first, the
// testeur, the proof of the red, the developpeur and the checks; then the reviewer, and on its
// ACCEPTÉ the integration, which commits the lot on the ticket's branch and puts that branch in the
// queue; then the queue, which brings it onto main, pushes and reads the CI, and the circuit ends
// on the state of the ticket the queue leaves. The supervisor runs it once, in the background, and
// its end wakes him: at 0 the ticket is closed; at 75 he runs `--reprendre` again once the machine
// is at rest; at « question » (18) the regulator's question goes to him: he answers it
// himself, or carries it to the owner when it is the owner's, then runs `--reponse "<texte>"` with
// the answer; at any other code, the stop is one the regulator could not settle. On a stop other
// than 0 and 75, the circuit launches a session of the regulator itself, as the scheduler of an
// integration (Zuul, bors) calls the judgement at a stop and applies the decision it gets: the
// regulator settles, and its sheet is its decision, which the circuit writes at the ticket and
// applies in the same process. So the supervisor is woken only by the end of the lot, a question
// of the regulator, or a stop the regulator did not settle.
//
//   node scripts/circuit.mjs <ticket> [--reprendre] [--contexte <texte>]
//   node scripts/circuit.mjs <ticket> --depuis <testeur|developpeur> <composant> --contexte <texte>
//   node scripts/circuit.mjs <ticket> --reponse <texte>
//
// The circuit decides on structured results only (scripts/resultats.mjs, the one module of their
// formats), as Bazel's Build Event Protocol and the JUnit reports carry the outcome of a build:
// the sheet that ends each session, the summaries of Turborepo, the JSON reports of Vitest and the
// SARIF of the guards. It reads no comment, no answer and no log to decide (a guard holds it:
// tests/unit/circuit-sans-texte-libre.spec.ts); the handovers at the ticket are for the human and
// for the next session of their author, the log for the human and the regulator.
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
//   its subject, the component, the ticket's description (its criteria) and its notes (a section
//   absent without notes), both read with `bd show` at the session's launch, the report of the
//   step before (the proof, the reds of a check), the last handover of the session's author
//   (`<rôle> <composant>`) at the ticket, for a developpeur without one yet the last of the
//   testeur of his component, else « aucune » (no other component's handover, nor a verdict), and
//   the line `CONTEXTE :` that `--contexte` gives. The session's own exit code is the one lancer.sh writes
//   to `.claude/worktrees/<ticket>.fin`; a launch that leaves none stopped before its session.
// - Each session of the testeur, the developpeur, the reviewer and the regulator ends on its sheet
//   (« la fiche »): claude runs with `--output-format json --json-schema <the schema of its role>`
//   (scripts/resultats.mjs), and its JSON result carries the sheet in `structured_output`, which
//   the circuit reads (`lireFiche`): lancer.sh writes that result to
//   `.claude/worktrees/<ticket>.resultat.json`, and a session out of the envelope prints it. Each
//   sheet read is kept with the ticket's sheets, `.claude/worktrees/<ticket>.fiches.jsonl` (`{
//   date, role, composant, fiche }`, beside the circuit's reports of its proofs and checks, which
//   the reviewer receives), and each of its discoveries (`decouvertes`) filed closed under the
//   ticket (scripts/ticket.sh, label `decouverte`). A session that ends without a sheet that
//   conforms (none, one out of its schema, a code other than 0) is resumed once, the same
//   session, with the fifth template, which names what lacks; a second one stops the circuit at
//   « sans-fiche ». The handover at the ticket (`bd comments add`) stays, for the human.
// - A fresh session of the testeur or the developpeur opens under a session id the circuit sets
//   (`lancer.sh --seance <uuid>`, claude's `--session-id`), kept in the state (`reprise`, its
//   author and id). A relaunch of that agent on its step and component (the testeur after a failed
//   proof, the developpeur after red checks) resumes that session (`lancer.sh --reprise <id>`,
//   claude's `--resume`, which finds its transcript in the copy's folder of transcripts, which
//   the envelope mounts in writing over the real one) with the sixth template of consigne-agent.md
//   (the ticket, the component, what changed, the new report), save the last attempt (the
//   testeur's third session, the developpeur's on the strong model), a fresh and whole session. A
//   resumption that ends with a code other than 0, or without a sheet that conforms, writes so at
//   the ticket and falls back on a fresh and whole session. A resumed session keeps its id, and so
//   its one line in the register, its latest end.
// - A session whose transcripts (`~/.claude/projects/<copy in dashes>/`, as scripts/registre.mjs
//   reads them) and log (its preparation writes there before the session opens) stand still for
//   20 minutes (IMMOBILE_MS; GRILLHOUSE_CIRCUIT_IMMOBILE_MS replaces
//   it, in milliseconds) is stopped: SIGTERM, then SIGKILL, to the launcher's group.
// - Each comment at the ticket carries its author, which bd reads in BEADS_ACTOR (ACTEUR): each
//   session runs with the author of its role (`testeur <composant>`, `developpeur <composant>`,
//   `relecteur`, `regulateur`), which the envelope passes on; the circuit writes its own
//   lines under `circuit` and the reviewer's verdict under `relecteur`, and the queue writes under
//   `file` (scripts/integration/file.mjs), whose last word the circuit names. The rights of every
//   session refuse bd's `--actor`, `-a`/`--author` and the variable itself (AUTEUR_FIXE: the
//   reviewer's and the regulator's lists, and lancer.sh's for a session in the envelope), so that no
//   agent changes its author.
// - The sheet of the testeur and of the developpeur carries its status (`statut`): FAIT goes on as
//   below; BESOIN (its `question`) stops the circuit at once at « besoin », the question and the
//   handover as its report, with no session more; so does BLOQUÉ (its `raison`), at
//   « hors-portee », save for a developpeur whose sheet sends the red to a testeur (`renvoi`,
//   below), which is that sending. The regulator settles either stop, as any other.
// - A component that carries no test (sansTests: in a repository of packages, no package with a
//   script `test:vitest` lies in it or holds it, as `npm test -- <chemin>` refuses a path out of
//   every package or in a package without that script) skips the testeur and the proof: the
//   circuit writes `Circuit · <composant> · testeur : aucun test …` at the ticket and launches its
//   developpeur, the reason as his report, then his checks.
// - Each command of the proof and of the checks runs with its own results directory
//   (`GRILLHOUSE_RESULTATS`), where Turborepo writes its summary (scripts/tests.mjs,
//   scripts/verifier.mjs), Vitest its JSON report (scripts/vitest-config/resultats.mjs) and each
//   guard its SARIF; its output goes to the log, for the human.
// - The proof of the red plays the whole component, as the CI of bors plays the whole suite of
//   the components a change touches: main is green, so a test HEAD holds that turns red in the
//   copy is a regression of the lot. One run per package, `npm test -- <package> <files>` in the
//   copy: each package of the component that has a script `test:vitest`, played whole, and the
//   test files the testeur's lot adds or changes in the component (git status of the copy, the
//   testeur's files as the integration shares them, `isTesterFile`). A test of a file out of the
//   lot that fails is a red, written `rouge existant : <file> › <name> — <message>`, and so is a
//   file out of the lot that does not load while no build of the component fails (it loaded at
//   HEAD); its greens do not count. A file of the lot that does not load proves nothing; a failed
//   build of a package of the component (a task `<package>#build` of the summary) is a red, as
//   not compiling is failing, named with its log, and the files it keeps from loading play at the
//   checks, after the developpeur; a failed build of a package out of the component leaves them
//   broken. A green test passes only when a sheet of the testeur of the component names it in
//   `verts_attendus`: its file from the root and its full name (or its title), with its reason;
//   one without `test`, for a test file HEAD holds, justifies each green test of that file and
//   excuses no red; on a new file it justifies nothing, and the report says so for that file. A
//   green test HEAD already holds has nothing to prove: the version of HEAD of each file plays in
//   the same run, from a sibling file (`<nom>.circuit-avant.test.<ext>`, removed after it), and a
//   green test whose full name HEAD's version holds, green there too, is set aside, counted; a
//   body changed under the same name is not told apart. The proof passes with a red (of the lot,
//   existing or of a build), even without a file of the lot in the component: a testeur with no
//   new test to write says so in his handover, the existing reds are enough. It fails with
//   neither a file of the lot nor a red, with a broken file of the lot, or with a green of the lot
//   no expected green justifies. A failed proof relaunches the testeur with its report, twice at
//   most. The report (reds, justified greens) is written at the ticket. A proof with a red
//   launches the developpeur; one without a red skips him: the lot is a lot of tests alone.
// - A developpeur is launched on a red alone, of a proof or of a check, or in a component without
//   tests: a session that changes no file of its component (`git status --porcelain` of its
//   directory and the content of each file it lists, taken before and after the session; the
//   sheet and the handover do not count) stops the circuit at « sans-livraison », its report
//   naming the component and sending to the developpeur's handover.
// - A sheet of the developpeur whose `renvoi` names `testeur <composant>` (a component of the title
//   up to his own) says the red that remains lies in the tests of that component: the circuit
//   plays it as a `RELANCE --depuis testeur <composant>` of the regulator, the sending and the
//   handover as its context, whether or not the session changed a file: that component's testeur,
//   the sending as his report, then its steps, the components after it as `--depuis` plays them,
//   the final pass and the reviewer. A component out of the title or after his own is no such
//   sending. The same sending twice in a row, with no green checks between them, stops at
//   « sans-livraison ».
// - The checks after the developpeur of a component judge what is done, the components of the run
//   up to it: `npm test -- <test files of the lot>` that lie in those components (and those of the
//   shared test material whose package depends on none of the components after it), `npm test --
//   <package>` for each package of those components, touched by the lot or not (a package without
//   a script `test:vitest` plays only when the lot touches it), then the guards in the
//   envelope of the component (`GRILLHOUSE_ENVELOPPE=<composant> npm run grillhouse:gardes`, and
//   `npm run gardes` when the project has it). Each red is read in the results of its command: a
//   failed test of the reports of Vitest, a finding of the guards' SARIF, a failed build or task of
//   the summary; a red check none of them situates is one red of the command. Each red belongs to
//   the component that holds its file (or its task's package), the deepest; one without a file
//   (the root's, a project's guard without SARIF), or in a package no component of the title
//   holds, belongs to none. Out of the final pass, the reds of the components up to it are its
//   developpeur's; the others wait for the final pass.
// - After the last component of the run, the final pass: `npm run verifier`, what the
//   integration plays, as bors plays on a lot the very check of the merge. Turborepo's cache
//   holds its cost: a task nothing moved replays from it, and what the lot reaches plays again,
//   by the dependencies, the inputs of the tasks and `grillhouse.lit` (a reader out of the title
//   whose tests read a directory the lot changes included). A red goes to the developpeur of the
//   first component, the provider first, that owns one. A red in a package no component of the
//   title holds, or that no component owns, stops at « controles »: the regulator decides, who
//   refers the component's entry in the title upward, or has the lot corrected. A developpeur
//   whose reds are all findings to settle (`a-arbitrer`) is not launched: the circuit stops at
//   « controles ». From then on every check is the final pass.
// - The proof, the checks and the final pass are heavy passes: each holds the lock of the machine
//   (scripts/verrou-de-machine.mjs), shared by every repository of the machine, and waits, the
//   wait written to the log, while another measure holds it.
// - The report a developpeur receives names his own reds first, each on its line (test or
//   finding, file and line, message, the beginning of a failed build's own log), then the count
//   of the others and the path of the log; the report of a stop names every red with its
//   component.
// - A check at 75 (« à repasser ») out of the final pass plays once more; verifier plays its
//   tasks at 75 again itself, at rest, and its 75 is the final pass's. A red relaunches the
//   developpeur with its report, twice at most, the third session on the strong model
//   (`lancer.sh --modele opus --effort high`): three sessions for a component's checks, and three
//   for the whole final pass whatever the components its reds go to (the last component's
//   sessions counted in it), so that two components sending a red to each other stop at
//   « controles ».
// - After the final pass, green, the reviewer: a session out of the envelope, which sees the whole
//   repository with its index, claude itself (`claude -p --agent relecteur --session-id <uuid>`,
//   CLAUDE_BIN replaces claude) in the ticket's copy, on Opus, under the project's permissions
//   and every command its skill runs (RELECTEUR), its instruction from the second template of
//   consigne-agent.md: the ticket, its components, the path of the claims file (the ticket's
//   description as `bd show` gives it at the session's launch, written by the circuit in its
//   working folder, which the session may read; the instruction carries no criteria, which the
//   reviewer's skill reads only after its first passes), the files of the lot (the testeur's by
//   `isTesterFile`, then the others) and the circuit's reports since its last sheet (its proofs and
//   checks). Its errors go to the log under its header line, its line to the register
//   (scripts/registre.mjs --copie), and it is watched as a session in the envelope is. Its sheet
//   is its verdict (`verdict` ACCEPTÉ or RENDU, its `constats`, `remarques`, `ecarts`): the circuit
//   writes it at the ticket for the human, under the author `relecteur`, its first word the
//   verdict, each finding under its heading with its recipient (`texteDuVerdict`).
// - RENDU: each finding names its recipient, `role` testeur or developpeur and `composant` one of
//   the title (a path or a package name). The circuit plays again from the first component a
//   finding names, the provider first: its testeur → preuve → developpeur → controles when a
//   finding names its testeur, else its developpeur → controles, the findings as the report of the
//   session (those for the developpeur after the proof's report). Each component after it plays
//   the steps its findings name, or, as in `--depuis`, its checks alone (the final pass before the
//   review carried every component to green checks), then the final pass and the reviewer again.
//   A RENDU without findings, a finding without a valid recipient, or one that puts its criterion
//   in question (`critere_en_cause`) stops at « relecture-arret »; so does the third RENDU since
//   the ticket's last ACCEPTÉ. The regulator settles.
// - ACCEPTÉ: the integration. The circuit builds the lot from the copy, as the regulator
//   built it: the files the copy changes against its HEAD, the testeur's (`isTesterFile`: test
//   files and the shared test material) in one patch, the others in another, each file against
//   HEAD and a new one against nothing (`git diff --no-index /dev/null`), the copy's index
//   untouched; the message `<type>(<composants>): <sujet> (<ticket>)`, the type read from the
//   ticket's type (bug fix, chore, docs, else feat), its body the deviations the sheets of the
//   developpeurs and of the reviewer name (`ecarts`), with the trailer Co-Authored-By. It runs
//   scripts/integration/integrer.mjs from the main tree, its output added to the log: 0 is the
//   commit on agent/<ticket> (which the circuit names from git), the copy removed, the branch in
//   the queue; 75 (« à repasser ») plays it once more, then stops at « a-repasser »; any other
//   code is its refusal, which stops at « integration ».
// - Then the queue: scripts/integration/file.mjs from the main tree, waited for, its output added
//   to the log (it brings the branch onto main, pushes it and reads the CI of the commit pushed).
//   A queue already running exits 0 at once: the circuit waits while the branch is in the queue
//   and the queue's lock names a live process. Then the state of the ticket: closed, the circuit
//   ends at « integre », exit 0 (the queue's last word at the ticket named with it, a CI it could
//   not read); reopened (out of the queue, or a red CI), it stops at « integration », the queue's
//   last word as its reason; still in the queue, it stops at « a-repasser », the queue's reason.
// - The state is `.claude/worktrees/<ticket>.circuit.json`, written again at each step and at the
//   start and end of each session: `{ etape, composant, tentative, code, raison, rapport, dernier,
//   finale, boucles, seance, regulateur, composants, renvois, atteint, mene, reprise, journal }`;
//   `etape`
//   is the state's name of a numbered step of the process (scripts/etapes.mjs: testeur 3,
//   preuve 4, developpeur 5, controles 6, or 7 the final pass once `finale`, relecture 8,
//   integration 9, file 10), or integre at the end; `raison` names the stop; `composants` the
//   components of the title, in their order, which the board reads for the rank of `composant`;
//   `boucles` the count of the bounded loop of the step under way, by its number (the testeur's
//   or developpeur's session, the review, the pass of the same stop at the regulator), null at a
//   step without one;
//   `dernier` is the last component of the run; `finale` whether the final pass has begun; `seance` the process group of
//   the session that runs, null between two; `regulateur` the regulator's session on the stop
//   (`{ seance, arret, code, rapport }`: its id, the stop it settles, its code and its reason),
//   while it runs and after its question, null otherwise; `renvois` the components a RENDU (or
//   `--depuis`) plays again, each with its first step and its findings, null out of such a round;
//   `atteint` the last component the circuit has carried to green checks (the last of the run
//   once the final pass is green), kept from one run to the next, null before any and when a run
//   starts over from the first component's testeur; `mene` the start (an ISO date) of the step the
//   circuit leads itself while it runs, null otherwise; `reprise` the session of the testeur or
//   developpeur its relaunches resume, `{ agent, seance }`, null before any. `--reprendre` starts again at the step and component of the state, its report given to the
//   next session, and goes on to its `dernier`; after any stop, the death of the circuit with its
//   caller included. A session the state names that still runs is waited for first, and stopped
//   when it stands still as long as a motionless session.
// - `--depuis <testeur|developpeur> <composant>` (a path or a package name the title names) has
//   the lot corrected by one component: it plays it as a RENDU whose one finding names that agent,
//   the text of `--contexte` as its findings: that component's steps; then each component after
//   it, its checks when the circuit has already carried it to green checks (up to `atteint`),
//   else its whole circuit, testeur, proof, developpeur and checks, as one it has not reached yet;
//   the final pass, the reviewer and the integration. It goes with no `--reprendre`.
// - On a stop other than 0 and 75, the regulator: a session out of the envelope, as the
//   reviewer's, claude itself (`claude -p --agent regulateur --session-id <uuid>`) in the
//   ticket's copy (the main tree once the integration removed it), on Sonnet, under the commands
//   its skill runs (droitsDuRegulateur: the reads of bd, a comment, a criterion added to the
//   description, the reads of git, the index, and the reads of the state, the log and the proofs),
//   its instruction from the third template of consigne-agent.md: the ticket, the stop's name and
//   code, its step, component and reason, the paths of the state and the log. The state names its
//   session (`regulateur`) while it runs. Its sheet is its decision (`decision`: « RELANCE
//   --reprendre », « RELANCE --depuis » with the agent in `depuis`, or « MONTE » with its
//   `question`; a `contexte` for a RELANCE). The circuit writes it at the ticket (`Circuit ·
//   <composant> · regulateur : …`). RELANCE runs the circuit again in the same process, as the
//   option it names, the context as `--contexte`; MONTE ends the circuit at « question », the
//   question as its reason, the regulator's session kept in the state. `--reponse <texte>` resumes
//   that session (`claude -p --resume <id>`, the fourth template: the supervisor's answer, which
//   may carry the owner's) and applies the decision it gives the same way; without a session kept
//   after a question, the call is refused. A session without a sheet that conforms is resumed
//   once, as any session; a second one, a `--depuis` whose component the title does not name, or
//   a session that cannot end (a launch that fails, a motionless session), ends the circuit on the
//   stop it settled, the reason joined to its own. The third RELANCE in a row on one stop (its
//   name, step and component) is the last: when that stop comes again, the circuit ends on it, the
//   three decisions in its reason, without a regulator.
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
// - At each of its ends (« integre », or a stop it hands to the supervisor), the circuit writes the
//   ticket's bilan (scripts/bilan.mjs): its figures, measured on the register, its lines at the
//   ticket and its state, kept in `.claude/worktrees/<ticket>.bilan.json` and written at the ticket
//   in one short comment, `Circuit · <composant> · bilan : …`, compared with the bilan before it in
//   the project.
// - Exit codes: 0 at « integre »; 2 a malformed call; a stop, by its name (ARRETS):
//   10 lancement (lancer.sh stopped before the session), 11 bloqué (a motionless transcript),
//   12 sans-fiche (twice no sheet that conforms), 13 preuve (the third proof fails), 14 controles
//   (the third developpeur of a component's checks or of the final pass leaves a red check, a red
//   of the final pass no component of the title owns, or reds to settle),
//   15 sans-livraison (a developpeur session that changes no file of its component; the first
//   session of a `--reprendre` whose component already holds changes goes on to the checks; or
//   the developpeur's same sending to a testeur twice in a row, no green checks between them),
//   16 relecture-arret (a finding without a valid recipient, one on a criterion, the third RENDU),
//   17 integration (the integration script refuses the lot, or the queue reopens the ticket),
//   18 question (the regulator's question for the supervisor, `--reponse` resumes it),
//   19 hors-portee (a testeur or developpeur whose sheet says BLOQUÉ, without a sending to a
//   testeur), 20 besoin (a testeur or developpeur whose sheet says BESOIN),
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
import { stripVTControlCharacters } from 'node:util';
import { ecrireLeBilan } from './bilan.mjs';
import { matieres, NOM_DE_TEST } from './consommateurs.mjs';
import { VARIABLE as VARIABLE_ENVELOPPE } from './enveloppe/composant.mjs';
import { ARBITRAGE, AUTOMATIQUE, ETAPES, etapeDuCircuit, libelle, REGULATEUR } from './etapes.mjs';
import { paquets } from './paquets.mjs';
import { ecrire as ecrireAuRegistre, ligneDEtape, transcriptionsDeLaCopie } from './registre.mjs';
import {
  lireFiche,
  lireRapportsVitest,
  lireResumes,
  lireSarif,
  RESULTATS,
  schemaDeFiche,
} from './resultats.mjs';
import { AUTEUR_DE_LA_FILE } from './integration/file.mjs';
import { dossierCommun, lireEntrees } from './integration/file-attente.mjs';
import { AUTEUR_DU_VERDICT } from './integration/verdict.mjs';
import { attendreUnPeu, vivant } from './verrou-de-fichier.mjs';
import { avecLaMachine } from './verrou-de-machine.mjs';
import { NOMS_DES_GARDES } from './gardes-du-cadre.mjs';
import { isTesterFile } from './verrous/verrou.mjs';
import { A_REPASSER } from './vitest-config/pression.mjs';

// The time a session's transcripts may stand still before the circuit stops it.
export const IMMOBILE_MS = 20 * 60 * 1000;
// The exit code of each stop.
export const ARRETS = {
  lancement: 10,
  bloqué: 11,
  'sans-fiche': 12,
  preuve: 13,
  controles: 14,
  'sans-livraison': 15,
  'relecture-arret': 16,
  integration: 17,
  question: 18,
  'hors-portee': 19,
  besoin: 20,
  'a-repasser': A_REPASSER,
};
const CODE_USAGE = 2;
// The bounded loops, each declared with its step (scripts/etapes.mjs, `boucle`): the testeur is
// relaunched twice at most after a failed proof (three sessions); the developpeur has three
// sessions, the last on the strong model; the third RENDU of one ticket stops the circuit; the
// third RELANCE in a row on one stop is the last.
const etapeNumero = n => ETAPES.find(e => e.numero === n);
const RELANCES_TESTEUR = etapeNumero(3).boucle.max - 1;
const SEANCES_DEVELOPPEUR = etapeNumero(5).boucle.max;
const RELECTURES = etapeNumero(8).boucle.max;
const RELANCES_DU_REGULATEUR = etapeNumero(2).boucle.max;
// The roles a finding of the reviewer may name: the agents of the steps run for each component.
const DESTINATAIRES = ETAPES.filter(e => e.parComposant)
  .flatMap(e => e.qui)
  .filter(q => q !== AUTOMATIQUE);
// The steps of the circuit's state, read from the list of the steps.
const [TESTS, PREUVE, CODE, CONTROLES, RELECTURE, INTEGRATION, EN_FILE] = [
  3, 4, 5, 6, 8, 9, 10,
].map(n => etapeNumero(n).etat);
// The variable in which bd reads the author of a comment (`bd --help`: « default: $BEADS_ACTOR,
// git user.name, $USER »); the author of the circuit's own lines; the author of a session of
// <role> on <composant>: `testeur <composant>`, `developpeur <composant>`, else the role alone.
const ACTEUR = 'BEADS_ACTOR';
const AUTEUR_DU_CIRCUIT = 'circuit';
const auteur = (role, composant) => (DESTINATAIRES.includes(role) ? `${role} ${composant}` : role);
// The rules that refuse a session the change of its author at the ticket: bd's options `--actor`
// and `-a`/`--author`, and the variable itself. The reviewer's and the regulator's lists end on them,
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
// The regulator's session, out of the envelope, on Sonnet: every command its skill runs (the
// reads of the ticket and the search of a precedent, a comment, a criterion added to the
// description, the reads of git, the index) and the reads of the ticket's state, log and proofs
// (its discoveries go in its sheet, which the circuit files); any other tool call is refused
// without a prompt, and so is a change of its author (AUTEUR_FIXE).
const droitsDuRegulateur = ctx => [
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
const FORT = ['--modele', 'opus', '--effort', 'high'];
const PREFIXE = 'Circuit · ';
const TICKET_SH = path.join(import.meta.dirname, 'ticket.sh');
// The steps the circuit leads itself, with no agent: each one counts in the ticket's working time.
const MENEES = new Set(ETAPES.filter(e => e.qui.includes(AUTOMATIQUE)).map(e => e.etat));

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

const sansCouleurs = t => stripVTControlCharacters(String(t ?? ''));
const premiereLigne = t => sansCouleurs(t).trim().split('\n')[0].slice(0, 300);
const fin = (t, n) => sansCouleurs(t).split('\n').slice(-n).join('\n');
const enUneLigne = t =>
  sansCouleurs(t)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 300);

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
    throw new Usage('--reponse va seule : le régulateur rend la décision.');
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
    const norme = path.normalize(nom).endsWith('/')
      ? path.normalize(nom).slice(0, -1)
      : path.normalize(nom);
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
    composants,
    etat: `${copie}.circuit.json`,
    journal: `${copie}.log`,
    fin: `${copie}.fin`,
    resultat: `${copie}.resultat.json`,
    fiches: `${copie}.fiches.jsonl`,
    transcriptions: transcriptionsDeLaCopie(copie, os.homedir()),
    immobileMs: Number(process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS) || IMMOBILE_MS,
    tmp: mkdtempSync(path.join(os.tmpdir(), 'circuit-')),
    numero: 0,
    // The regulator's RELANCE decisions in a row on one stop.
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

// The ticket's description (its criteria) and notes as Beads holds them at this moment, read at
// the launch of each session: `{ description, notes }`; a failed read throws.
function leTicket(ctx) {
  const r = ctx.bd('show', ctx.ticket, '--json');
  if (r.status !== 0) {
    throw new Error(
      `ticket ${ctx.ticket} illisible : ${r.error?.message ?? r.stderr ?? ''}`.trim()
    );
  }
  const t = JSON.parse(r.stdout || '[]')[0] ?? {};
  return { description: String(t.description ?? ''), notes: String(t.notes ?? '') };
}

// The comments of the agents at the ticket, `{ author, text }`: every comment but the circuit's
// own. The circuit reads none of them: it hands an agent's last one to the next session of its
// author, and names it in a stop.
const passations = ctx => lesCommentaires(ctx).filter(c => c.author !== AUTEUR_DU_CIRCUIT);

// The last handover at the ticket of the author <qui>, or null.
const derniereDe = (ctx, qui) =>
  passations(ctx)
    .filter(c => c.author === qui)
    .at(-1) ?? null;

// The sheets of the ticket's sessions and the circuit's reports, in their order
// (`<ticket>.fiches.jsonl`, beside the copy): `{ date, role, composant, fiche }` for the sheet of
// a session, `{ date, role: 'circuit', etape, composant, rapport }` for the report of a proof or of
// checks, which the reviewer receives.
function lesFiches(ctx) {
  return lire(ctx.fiches)
    .split('\n')
    .filter(Boolean)
    .flatMap(l => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
}
const inscrire = (ctx, entree) =>
  appendFileSync(ctx.fiches, `${JSON.stringify({ date: new Date().toISOString(), ...entree })}\n`);

// The sheets of <role> on <composant> (every component when null), in their order.
const fichesDe = (ctx, role, composant = null) =>
  lesFiches(ctx)
    .filter(e => e.role === role && (composant === null || e.composant === composant))
    .map(e => e.fiche);

// One line of the circuit's history at the ticket.
function commenter(ctx, composant, etape, texte) {
  const r = ctx.bd('comments', 'add', ctx.ticket, `${PREFIXE}${composant} · ${etape} : ${texte}`);
  if (r.status !== 0) process.stderr.write(`⚠️  commentaire non écrit au ticket : ${r.stderr}\n`);
}

// The report of a proof or of checks: its line at the ticket, and its report kept for the
// reviewer, <rapport> when the comment carries only its summary.
function ecrireRapport(ctx, composant, etape, texte, rapport = texte) {
  commenter(ctx, composant, etape, texte);
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    etape,
    composant,
    rapport: `${PREFIXE}${composant} · ${etape} : ${rapport}`,
  });
}

// The state of the run, written whole (`seance` and `regulateur` null and `finale` false unless <etat>
// sets them, `renvois`, `atteint` and `reprise` the run's), kept as the run's current state.
function ecrireEtat(ctx, etat) {
  ctx.courant = {
    finale: false,
    seance: null,
    regulateur: null,
    mene: null,
    ...etat,
    composants: ctx.composants,
    renvois: ctx.renvois ?? null,
    atteint: ctx.atteint ?? null,
    reprise: ctx.reprise ?? null,
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

// One launch of a session: `{ code, seance, bloque, erreur, sortie }`, `seance` the session's
// exit code (from lancer.sh's end file for a session in the envelope), null when the launch
// stopped before it, `sortie` claude's JSON result, its sheet in `structured_output`. Every
// session runs with the author of <role> on <composant> (BEADS_ACTOR). A session in the envelope
// opens under the id <ouvre> (lancer.sh --seance), or resumes the session <reprend> (lancer.sh
// --reprise); its result is the file lancer.sh writes (`<ticket>.resultat.json`).
// A session <horsEnveloppe> (the reviewer's, the regulator's) is claude itself, in the ticket's
// copy (the main tree once the copy is gone), under <droits> (the reviewer's by default), the
// schema of its role's sheet and the options <session> names (its id, or the session it
// resumes), its instruction on its standard input and its result on its standard output, added
// to the log under its header line, then its line written to the register, as lancer.sh does.
function lancer(
  ctx,
  role,
  composant,
  consigne,
  { fort, horsEnveloppe, droits = RELECTEUR, session = [], ouvre, reprend } = {}
) {
  rmSync(ctx.fin, { force: true });
  rmSync(ctx.resultat, { force: true });
  const fichier = path.join(ctx.tmp, `consigne-${++ctx.numero}.md`);
  writeFileSync(fichier, consigne);
  // A file, not a pipe: a session whose circuit is dead writes its errors without breaking.
  const erreurs = path.join(ctx.tmp, `erreurs-${ctx.numero}.txt`);
  let commande;
  let fds;
  // The result of a session out of the envelope.
  const reponse = path.join(ctx.tmp, `reponse-${ctx.numero}.json`);
  if (horsEnveloppe) {
    entete(ctx, role, composant);
    fds = [openSync(fichier, 'r'), openSync(reponse, 'w'), openSync(ctx.journal, 'a')];
    const fiche = ['--output-format', 'json', '--json-schema', JSON.stringify(schemaDeFiche(role))];
    commande = {
      cmd: process.env.CLAUDE_BIN || 'claude',
      args: ['-p', '--agent', role, ...fiche, ...droits, '--add-dir', ctx.tmp, ...session],
      cwd: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    };
  } else {
    fds = ['ignore', 'ignore', openSync(erreurs, 'w')];
    commande = {
      cmd: 'bash',
      args: [
        LANCEUR,
        ...(fort ? FORT : []),
        ...(ouvre ? ['--seance', ouvre] : []),
        ...(reprend ? ['--reprise', reprend] : []),
        ctx.ticket,
        role,
        composant,
        fichier,
      ],
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
      let sortie;
      if (horsEnveloppe) {
        seance = erreurDeLancement === null ? code : null;
        sortie = lire(reponse).trim();
        appendFileSync(ctx.journal, `${sortie}\n`);
        spawnSync(process.execPath, [REGISTRE, '--copie', ctx.copie], {
          cwd: ctx.racine,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
      } else {
        seance = existsSync(ctx.fin) ? Number(readFileSync(ctx.fin, 'utf8').trim()) : null;
        sortie = lire(ctx.resultat).trim();
      }
      resolve({ code, seance, bloque, erreur: erreurDeLancement ?? lire(erreurs), sortie });
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
// reviewer's, 2 the regulator's on a stop, 3 the regulator's on the supervisor's answer, 4 any
// session's on a sheet absent or out of its schema, 5 the testeur's and the developpeur's on a
// resumption), filled with <valeurs>.
function consigne(valeurs, rang = 0) {
  const texte = readFileSync(GABARIT, 'utf8');
  const bloc = [...texte.matchAll(/```text\n([\s\S]*?)\n```/g)][rang];
  if (!bloc) throw new Error(`gabarit sans bloc de consigne n° ${rang + 1} : ${GABARIT}`);
  return `${bloc[1].replace(/\{\{(\w+)\}\}/g, (m, k) => (k in valeurs ? valeurs[k] : m))}\n`;
}

const nomDuRole = role => (role === 'developpeur' ? 'développeur' : role);

// One session of <role> on <composant>: its sheet. A relaunch on its step (<tentative> past 1)
// that is not the last (<derniere>) resumes the agent's session the circuit keeps (`ctx.reprise`,
// its author and id) with the short instruction (the sixth template); a resumption that fails (a
// code other than 0, or no sheet that conforms) falls back on a fresh and whole session, under a
// new id, which the circuit keeps. A fresh session's instruction (the first template) carries the
// ticket's description and notes as they are at its launch, and the last handover of its author
// at the ticket. Throws an Arret for a launch that stops before its session, a motionless
// session, or a session that ends twice without a sheet that conforms.
async function seance(ctx, role, composant, { tentative, rapport, fort, derniere }) {
  const agent = auteur(role, composant);
  const nom = nomDuRole(role);
  const reprise = tentative > 1 && !derniere && ctx.reprise?.agent === agent ? ctx.reprise : null;
  if (reprise) {
    const courte = {
      role: nom,
      ticket: ctx.ticket,
      sujet: ctx.sujet,
      composant,
      tentative,
      change:
        role === 'testeur'
          ? 'la preuve du rouge, jouée après ta séance, refuse ton lot'
          : 'les contrôles, joués après ta séance, sont rouges',
      rapport: rapport ?? 'aucun',
    };
    const r = await lancer(ctx, role, composant, consigne(courte, 5), {
      fort,
      reprend: reprise.seance,
    });
    seanceLancee(ctx, role, r);
    const lu = r.seance === 0 ? lireFiche(role, r.sortie) : { erreur: `code ${r.seance}` };
    if (lu.fiche) return garder(ctx, role, composant, lu.fiche);
    commenter(
      ctx,
      composant,
      role,
      `reprise de la séance ${reprise.seance} sans fiche conforme (${lu.erreur}) : séance neuve et entière.`
    );
  }
  const lots = role === 'developpeur' ? testsDuLot(ctx) : testsDuComposant(ctx, composant);
  const { description, notes } = leTicket(ctx);
  // The last handover of this agent on its component; for a developpeur without one yet, the last
  // of the testeur of his component.
  const passation =
    derniereDe(ctx, agent) ??
    (role === 'developpeur' ? derniereDe(ctx, auteur('testeur', composant)) : null);
  const valeurs = {
    role: nom,
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
    description: description.trim() || 'aucune',
    // The section of the ticket's notes, absent without notes.
    notes: notes.trim()
      ? `\nLES NOTES DU TICKET, l'état qu'un agent d'avant y a écrit :\n\n${notes.trim()}\n`
      : '',
    rapport: rapport ?? 'aucun',
    passation: passation?.text ?? 'aucune',
  };
  return await jusquALaFiche(ctx, role, composant, consigne(valeurs), { fort, neuve: agent });
}

// The launch <r> of a session of <role>, or the Arret it is: a motionless session (« bloqué »),
// a launch that stops before its session (« lancement »).
function seanceLancee(ctx, role, r) {
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
}

// The session of <role> on <composant> with the instruction <texte>, its sheet read in its result
// (scripts/resultats.mjs): the sheet, kept with the ticket's sheets, its discoveries filed. A
// session that ends without a sheet that conforms (none, one out of its schema, a code other than
// 0) is resumed once, the same session, with the short instruction that names what lacks (the
// fifth template). The session opens under the id <id> (a new one by default), or resumes it with
// <premiere> « reprend » (the regulator on the supervisor's answer); with <neuve> (the author of a
// testeur or a developpeur), the circuit keeps that id for that author (`ctx.reprise`). Throws an
// Arret for a launch that stops before its session, a motionless session, or twice no sheet
// that conforms (« sans-fiche »).
async function jusquALaFiche(ctx, role, composant, texte, options = {}) {
  const { neuve, premiere = 'ouvre', id = randomUUID(), ...reste } = options;
  if (neuve) ctx.reprise = { agent: neuve, seance: id };
  const ouvrir = mode =>
    reste.horsEnveloppe
      ? { session: [mode === 'ouvre' ? '--session-id' : '--resume', id] }
      : { [mode]: id };
  let lu = null;
  for (let essai = 1; essai <= 2; essai++) {
    const courte = () => consigne({ ticket: ctx.ticket, sujet: ctx.sujet, erreur: lu.erreur }, 4);
    const r = await lancer(ctx, role, composant, essai === 1 ? texte : courte(), {
      ...reste,
      ...ouvrir(essai === 1 ? premiere : 'reprend'),
    });
    seanceLancee(ctx, role, r);
    lu =
      r.seance === 0
        ? lireFiche(role, r.sortie)
        : { erreur: `la séance finit en erreur (code ${r.seance})` };
    if (lu.fiche) return garder(ctx, role, composant, lu.fiche);
    if (essai === 1) {
      commenter(
        ctx,
        composant,
        role,
        `séance finie sans fiche conforme : ${lu.erreur} ; reprise une fois.`
      );
    }
  }
  throw new Arret(
    'sans-fiche',
    `Deux fois, la séance du ${nomDuRole(role)} sur ${composant} finit sans fiche conforme : ${lu.erreur}. Le journal du ticket : ${ctx.journal}`
  );
}

// The name of <composant> as a title writes it: its package's name, or its path.
function nomDe(ctx, composant) {
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  return liste.find(p => p.dossier === composant)?.pkg.name ?? composant;
}

// The sheet <fiche> of <role> on <composant>, kept with the ticket's sheets, each of its
// discoveries filed closed under the ticket (scripts/ticket.sh, label `decouverte`), its component
// the session's, or the ticket's for the reviewer and the regulator; returns it.
function garder(ctx, role, composant, fiche) {
  inscrire(ctx, { role, composant, fiche });
  const composants = DESTINATAIRES.includes(role)
    ? nomDe(ctx, composant)
    : ctx.composants.map(c => nomDe(ctx, c)).join(', ');
  for (const d of fiche.decouvertes ?? []) {
    const r = spawnSync(
      'bash',
      [TICKET_SH, ctx.ticket, d.sujet, composants, d.corps, 'decouverte'],
      {
        cwd: ctx.racine,
        encoding: 'utf8',
        env: { ...process.env, [ACTEUR]: AUTEUR_DU_CIRCUIT },
      }
    );
    if (r.status !== 0) {
      process.stderr.write(`⚠️  découverte « ${d.sujet} » non consignée : ${r.stderr}\n`);
    }
  }
  return fiche;
}

const lire = f => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// The circuit's reports since the reviewer's last sheet: those of its proofs and checks (the final
// pass among them), as it wrote them at the ticket.
function rapportsDuCircuit(ctx) {
  const tous = lesFiches(ctx);
  const depuis = tous.findLastIndex(e => e.role === 'relecteur') + 1;
  return tous
    .slice(depuis)
    .filter(e => e.role === AUTEUR_DU_CIRCUIT)
    .map(e => e.rapport);
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

// The verdict the reviewer's sheet <fiche> carries, as the circuit writes it at the ticket for the
// human, its first word ACCEPTÉ or RENDU: each finding under its heading, its recipient (or the
// criterion in question) and its body, then the remarks and the deviations to name at the commit.
export function texteDuVerdict(fiche) {
  const section = (titre, l) => (l?.length ? [`## ${titre}`, '', ...l.map(x => `- ${x}`), ''] : []);
  return [
    fiche.verdict,
    '',
    ...(fiche.constats ?? []).flatMap((c, i) => [
      `### Constat ${i + 1} — ${c.titre}`,
      c.critere_en_cause
        ? `Critère en cause : ${c.critere_en_cause}`
        : `Agent : ${c.role ?? '?'} ${c.composant ?? '?'}`,
      c.corps,
      '',
    ]),
    ...section('Remarques', fiche.remarques),
    ...section('Écarts à nommer au commit', fiche.ecarts),
  ]
    .join('\n')
    .trim();
}

// The review of the lot, the reviewer's session out of the envelope, from the second template:
// `{ verdict, fiche, texte }`, its sheet and the verdict the circuit writes at the ticket from it,
// under the reviewer's author.
async function relire(ctx, composant) {
  const { tests, code } = fichiersDuLot(ctx);
  const rapports = rapportsDuCircuit(ctx);
  const precedents = fichesDe(ctx, 'relecteur').length;
  const affirmations = path.join(ctx.tmp, 'affirmations.md');
  writeFileSync(affirmations, leTicket(ctx).description);
  const valeurs = {
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    composants: ctx.composants.join(', '),
    reprise: precedents
      ? `oui : ${precedents} relecture(s) d'avant ont rendu le lot, leurs verdicts sont au ticket, et le lot a repassé le circuit depuis`
      : 'non',
    lots: [
      `le lot de tests : ${tests.join(', ') || 'aucun fichier'}`,
      `le lot de code : ${code.join(', ') || 'aucun fichier'}`,
    ].join(' ; '),
    affirmations,
    rapports: rapports.join('\n\n') || 'aucun',
  };
  const fiche = await jusquALaFiche(ctx, 'relecteur', composant, consigne(valeurs, 1), {
    horsEnveloppe: true,
  });
  const texte = texteDuVerdict(fiche);
  const r = ctx.bdSous(AUTEUR_DU_VERDICT, 'comments', 'add', ctx.ticket, texte);
  if (r.status !== 0) process.stderr.write(`⚠️  verdict non écrit au ticket : ${r.stderr}\n`);
  return { verdict: fiche.verdict, fiche, texte };
}

// The stop for the sheet <fiche> of the session <tentative> of <role> on <composant>, BLOQUÉ
// (« hors-portee ») or BESOIN (« besoin »): its reason or question first, then its handover.
function arretDuStatut(ctx, role, composant, tentative, fiche) {
  const passation = derniereDe(ctx, auteur(role, composant))?.text ?? 'aucune';
  const qui = `Le ${nomDuRole(role)} de ${composant}`;
  return fiche.statut === 'BESOIN'
    ? new Arret(
        'besoin',
        `${qui} attend une réponse (séance ${tentative}) : ${fiche.question}\n\nLa décision revient au régulateur. Sa passation :\n\n${passation}`
      )
    : new Arret(
        'hors-portee',
        `${qui} se déclare bloqué (séance ${tentative}) : ${fiche.raison}\n\nLe circuit ne le relance pas sur ce rouge : la décision revient au régulateur. Sa passation :\n\n${passation}`
      );
}

// The index in the title of the component <nom> (a path or a package name), or -1.
function indexDe(ctx, nom) {
  try {
    return ctx.composants.indexOf(ctx.resoudre(nom));
  } catch {
    return -1;
  }
}

// The sending to a testeur in the sheet <fiche> of the developpeur of the component at <index>:
// `{ index, texte }`, the component its `renvoi` names, one of the title up to <index>, and what
// that testeur receives (the sending, then the developpeur's handover); null without a sending,
// or for a component out of the title or after his own.
function renvoiAuTesteur(ctx, fiche, index) {
  if (!fiche.renvoi) return null;
  const i = indexDe(ctx, fiche.renvoi.composant);
  if (i < 0 || i > index) return null;
  const composant = ctx.composants[index];
  const passation = derniereDe(ctx, auteur('developpeur', composant))?.text ?? 'aucune';
  const raison = fiche.raison ? ` : ${fiche.raison}` : '';
  return {
    index: i,
    texte: `Le développeur de ${composant} renvoie le rouge qui reste aux tests de ${ctx.composants[i]}${raison}.\n\nSa passation :\n\n${passation}`,
  };
}

// The agents the reviewer's sheet RENDU <fiche> sends the lot back to: Map index of component →
// `{ etape, testeur, developpeur }`, `etape` the first step that component plays again (testeur
// when a finding names its testeur), `testeur` and `developpeur` the findings for each, or null.
// Throws an Arret `relecture-arret` for a verdict without findings, a finding without a valid
// recipient (a component the title does not name) or one that puts a criterion in question.
function renvoisDuVerdict(ctx, fiche, texte) {
  const liste = fiche.constats ?? [];
  const arret = raison =>
    new Arret(
      'relecture-arret',
      `${raison} La décision revient au régulateur.\n\nLe verdict :\n\n${texte}`
    );
  if (liste.length === 0) throw arret('Le verdict RENDU ne porte aucun constat.');
  const renvois = new Map();
  for (const [n, c] of liste.entries()) {
    if (c.critere_en_cause)
      throw arret(`Le constat « ${c.titre} » met en cause un critère du ticket.`);
    const index = c.composant ? indexDe(ctx, c.composant) : -1;
    if (!DESTINATAIRES.includes(c.role) || index < 0) {
      throw arret(
        `Le constat « ${c.titre} » n'a pas de destinataire valide : il nomme ${c.role ? `« ${c.role} ${c.composant ?? ''} »` : 'personne'}, quand le rôle est testeur ou developpeur et le composant l'un du titre (${ctx.composants.join(', ')}).`
      );
    }
    const r = renvois.get(index) ?? { etape: 'developpeur', testeur: [], developpeur: [] };
    r[c.role].push(`### Constat ${n + 1} — ${c.titre}\n${c.corps}`);
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
  const motsDeLaFile = () => passations(ctx).filter(c => c.author === AUTEUR_DE_LA_FILE);
  const avant = motsDeLaFile().length;
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
  // The queue's last word at the ticket, under its author, since this queue began.
  const mot = motsDeLaFile().slice(avant).at(-1)?.text ?? null;
  const raison = mot ?? 'aucun commentaire de la file';
  if (lireEntrees(ctx.racine).some(e => e.branche === branche)) return { etat: 'en-file', raison };
  if (t.status === 'closed') {
    // A CI the queue could not read is its last word at a ticket it closes.
    const motif = t.close_reason || 'ticket fermé';
    return { etat: 'ferme', raison: mot ? `${motif} ; ${enUneLigne(mot)}` : motif };
  }
  return { etat: 'rouvert', raison };
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
// their package name; then the deviations the sheets of the developpeurs and of the reviewer name
// (`ecarts`), each once; then the trailer.
function messageDeCommit(ctx) {
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  const noms = ctx.composants
    .filter(c => c !== '.')
    .map(c => liste.find(p => p.dossier === c)?.pkg.name ?? path.basename(c));
  const type = TYPES_DE_COMMIT[ctx.type] ?? 'feat';
  const portee = noms.length ? `(${noms.join(',')})` : '';
  const ecarts = [
    ...new Set(
      [...fichesDe(ctx, 'developpeur'), ...fichesDe(ctx, 'relecteur')].flatMap(f => f.ecarts ?? [])
    ),
  ];
  const corps = ecarts.length ? `${ecarts.map(e => `- ${e}`).join('\n')}\n\n` : '';
  return `${type}${portee}: ${ctx.sujet} (${ctx.ticket})\n\n${corps}Co-Authored-By: Claude <noreply@anthropic.com>\n`;
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
    if (xy.includes('R') || xy.includes('C')) i++;
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

// One npm command in the copy, under <env> added to the circuit's environment, its results written
// to a directory of its own (RESULTATS, scripts/resultats.mjs: the summaries of Turborepo, the
// JSON reports of Vitest, the SARIF of the guards), its output added to the log for the human:
// `{ code, dossier }`. The circuit reads its results, never its output. It is a heavy pass (the
// proof, the checks, the final pass): it holds the lock of the machine
// (scripts/verrou-de-machine.mjs), its wait written to the log, and passes it to the
// `npm run verifier` it runs.
function npm(ctx, etape, composant, args, env = {}) {
  entete(ctx, etape, composant);
  const dossier = mkdtempSync(path.join(ctx.tmp, 'resultats-'));
  const prefixe = Object.entries(env).map(([k, v]) => `${k}=${v} `);
  appendFileSync(ctx.journal, `$ ${prefixe.join('')}npm ${args.join(' ')}\n`);
  const fd = openSync(ctx.journal, 'a');
  try {
    const r = avecLaMachine(
      envMachine =>
        spawnSync('npm', args, {
          cwd: ctx.copie,
          stdio: ['ignore', fd, fd],
          env: { ...envMachine, ...env, [RESULTATS]: dossier },
        }),
      { dire: l => appendFileSync(ctx.journal, `${l}\n`) }
    );
    return { code: r.status ?? 1, dossier };
  } finally {
    closeSync(fd);
  }
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

// The log of the task <t> of a summary of Turborepo, its file from the root of the copy: its path,
// and its first lines, the task's own output.
function journalDeTache(ctx, t) {
  if (!t.journal) return { chemin: null, debut: '' };
  const chemin = path.join(ctx.copie, t.journal);
  return { chemin, debut: sansCouleurs(lire(chemin)).trim().split('\n').slice(0, 80).join('\n') };
}

// The proof of the red on <composant>: `{ ok, rouges, texte, resume }`, `texte` without the list
// of the justified greens, which only the whole report, written to its file, holds. A green test
// passes by the expected greens of the sheets of the testeur of <composant> (`verts_attendus`).
function preuve(ctx, composant) {
  const fichiers = testsDuComposant(ctx, composant);
  const verts = fichesDe(ctx, 'testeur', composant).flatMap(f => f.verts_attendus ?? []);
  const raisonDuTest = (f, a) =>
    verts.find(v => v.fichier === f && v.test && (v.test === a.nom || v.test === a.titre))
      ?.raison ?? null;
  const duFichier = f => verts.find(v => v.fichier === f && !v.test) ?? null;
  const rouges = [];
  const justifies = [];
  const injustifies = [];
  const casses = [];
  const neufs = [];
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
    const avant = versionsDAvant(ctx, groupe);
    let r;
    try {
      r = npm(ctx, 'preuve', composant, [
        'test',
        '--',
        ...(entier ? [dossier] : []),
        ...groupe,
        ...avant.values(),
      ]);
    } finally {
      for (const soeur of avant.values()) rmSync(path.join(ctx.copie, soeur), { force: true });
    }
    const resultats = lireRapportsVitest(r.dossier);
    // The builds of the component's packages that failed: each one a red, not compiling is failing.
    const constructions = constructionsEchouees(ctx, liste, r.dossier, index);
    for (const { nom, erreur } of constructions) {
      if (reportes.includes(nom)) continue;
      rouges.push(`construction de ${nom} — ${erreur}`);
      reportes.push(nom);
    }
    // The files out of the lot, which HEAD holds green: a red of theirs is a regression of the lot.
    if (entier) {
      const duLot = new Set(groupe.map(f => path.join(ctx.copie, f)));
      for (const res of resultats) {
        if (duLot.has(res.fichier) || res.fichier.includes('.circuit-avant.')) continue;
        const f = path.relative(ctx.copie, res.fichier);
        if (res.tests.length === 0 && res.etat === 'failed' && !constructions.length) {
          rouges.push(
            `rouge existant : ${f} — ne se charge pas : ${premiereLigne(res.message || res.etat)}`
          );
        }
        for (const a of res.tests.filter(x => x.etat === 'failed')) {
          rouges.push(`rouge existant : ${f} › ${a.nom} — ${premiereLigne(a.message)}`);
        }
      }
    }
    for (const f of groupe) {
      const res = resultats.find(t => t.fichier === path.join(ctx.copie, f));
      const tests = res?.tests ?? [];
      // The green tests of HEAD's version of the file, by their full name.
      const deHead = new Set(
        (
          resultats.find(t => avant.has(f) && t.fichier === path.join(ctx.copie, avant.get(f)))
            ?.tests ?? []
        )
          .filter(a => a.etat === 'passed')
          .map(a => a.nom)
      );
      if (constructions.length && (!res || tests.length === 0)) {
        // It cannot load before the build: it plays at the checks.
      } else if (!res) {
        casses.push(
          `${f} — ne se charge pas : non joué (code ${r.code}) ; le journal du ticket : ${ctx.journal}`
        );
      } else if (tests.length === 0) {
        casses.push(`${f} — ne se charge pas : ${premiereLigne(res.message || res.etat)}`);
      }
      // The expected green of the whole file justifies its greens only for a file HEAD holds.
      const duF = duFichier(f);
      if (duF && !avant.has(f)) {
        neufs.push(
          `${f} — fichier neuf, que HEAD ne tient pas : son vert attendu sans test ne justifie aucun de ses verts`
        );
      }
      for (const a of tests) {
        if (a.etat === 'failed') {
          rouges.push(`${f} › ${a.nom} — ${premiereLigne(a.message)}`);
        } else if (a.etat === 'passed' && deHead.has(a.nom)) {
          anciens++;
        } else if (a.etat === 'passed') {
          const raison = raisonDuTest(f, a);
          if (raison) {
            justifies.push(`${f} › ${a.nom} — ${raison}`);
          } else if (duF && avant.has(f)) {
            justifies.push(`${f} › ${a.nom} — ${duF.raison} (par le vert attendu du fichier)`);
          } else {
            injustifies.push(`${f} › ${a.nom}`);
          }
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
  const resume = `${rouges.length} rouge(s), ${justifies.length} vert(s) justifié(s), ${injustifies.length} vert(s) sans vert attendu, ${casses.length} fichier(s) qui ne se charge(nt) pas, ${anciens} test(s) vert(s) que HEAD tient déjà, laissé(s) de côté`;
  const ecrit = (...sections) =>
    [
      `${etapeNumero(4).titre} sur ${composant} : ${resume}.`,
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
        'Verts sans vert attendu (un test vert avant le code passe seulement quand ta fiche le nomme dans `verts_attendus` : `fichier` depuis la racine, `test` son nom complet tel que ce rapport l’écrit après « › », et `raison` ; tous les verts d’un fichier de tests que HEAD tient passent par `fichier` et `raison` seuls)',
        injustifies
      ),
      ...section(
        'Verts attendus sans test qui ne justifient rien (ils valent seulement pour un fichier de tests que HEAD tient)',
        neufs
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

// The builds that failed in the run whose results are under <dossier> (the summary of Turborepo,
// task `<package>#build`) of a package of the component at <index>: `{ nom, erreur }`, `erreur`
// its log file and the beginning of its own output.
function constructionsEchouees(ctx, liste, dossier, index) {
  return lireResumes(dossier)
    .filter(t => t.script === 'build' && t.code !== null && t.code !== 0)
    .flatMap(t => {
      const p = liste.find(x => x.pkg.name === t.paquet);
      if (!p || proprietaire(ctx, p.dossier) !== index) return [];
      const j = journalDeTache(ctx, t);
      return [{ nom: t.paquet, erreur: `son journal : ${j.chemin}\n\n${j.debut}\n` }];
    });
}

// The component of the run that owns <chemin> (from the root of the copy): `{ proprietaire,
// horsTitre }`, the index of that component or -1, and the name of the package of <liste> that
// holds the path when no component of the title does.
function situer(ctx, liste, chemin) {
  const i = chemin ? proprietaire(ctx, chemin) : -1;
  const p = i < 0 && chemin ? liste.find(x => chemin.startsWith(`${x.dossier}/`)) : null;
  return { proprietaire: i, horsTitre: p ? p.pkg.name : null };
}

// The reds of the check <c> (`{ args, env, code, dossier }`), read in its results: each failed
// test of the reports of Vitest, each finding of the guards' SARIF, each failed build, and each
// failed task none of those situates; a red check with none of them is one red of the command.
// Each red `{ texte, detail, proprietaire, horsTitre, arbitrer }`: the line that names it (test
// or finding, file, message), the beginning of its task's log for a build, the index of the
// component that owns it (-1 for none: the root, or a red without a file), the package out of the
// title that holds it, and whether it is a finding to settle (`a-arbitrer`).
function rougesDe(ctx, liste, c) {
  if (c.code === 0 || c.code === A_REPASSER) return [];
  const out = [];
  const testes = new Set();
  for (const res of lireRapportsVitest(c.dossier)) {
    const f = path.relative(ctx.copie, res.fichier);
    const lieu = situer(ctx, liste, f);
    if (res.tests.length === 0 && res.etat === 'failed') {
      out.push({ texte: `test ${f} — ne se charge pas : ${premiereLigne(res.message)}`, ...lieu });
      testes.add(paquetDe(liste, f));
    }
    for (const a of res.tests.filter(x => x.etat === 'failed')) {
      out.push({ texte: `test ${f} › ${a.nom} — ${premiereLigne(a.message)}`, ...lieu });
      testes.add(paquetDe(liste, f));
    }
  }
  const { constats } = lireSarif(c.dossier);
  for (const k of constats) {
    const ou = k.fichier ? ` ${k.fichier}${k.ligne ? `:${k.ligne}` : ''}` : '';
    out.push({
      texte: `constat ${k.garde}${ou} — ${k.message}${k.genre === 'a-arbitrer' ? ' (à arbitrer)' : ''}`,
      ...situer(ctx, liste, k.fichier),
      arbitrer: k.genre === 'a-arbitrer',
    });
  }
  // The guards of the project wrote findings when one comes from a guard out of the frame's.
  const duProjet = constats.some(k => !NOMS_DES_GARDES.includes(k.garde));
  for (const t of lireResumes(c.dossier)) {
    if (t.code === null || t.code === 0 || t.code === A_REPASSER) continue;
    if (t.script === 'test:vitest' && testes.has(t.dossier)) continue;
    if (t.script === 'grillhouse:gardes' && constats.length) continue;
    if (t.script === 'gardes' && duProjet) continue;
    const p = liste.find(x => x.pkg.name === t.paquet);
    const lieu = p ? situer(ctx, liste, `${p.dossier}/`) : { proprietaire: -1, horsTitre: null };
    if (p && lieu.proprietaire < 0) lieu.horsTitre = p.pkg.name;
    const j = journalDeTache(ctx, t);
    out.push({
      texte:
        t.script === 'build'
          ? `construction de ${t.paquet} — son journal : ${j.chemin}`
          : `tâche ${t.tache} rouge (code ${t.code}) — son journal : ${j.chemin}`,
      detail: t.script === 'build' ? j.debut : '',
      ...lieu,
    });
  }
  if (out.length === 0) {
    out.push({
      texte: `${ligneDeCommande(c)} rouge (code ${c.code}), sans résultat qui situe son rouge — le journal du ticket : ${ctx.journal}`,
      proprietaire: -1,
      horsTitre: null,
    });
  }
  return out;
}

const ligneDeCommande = c =>
  `${Object.entries(c.env ?? {})
    .map(([k, v]) => `${k}=${v} `)
    .join('')}npm ${c.args.join(' ')}`;

// The checks after the developpeur of the component at <index>: what is done, or, when <finale>,
// `npm run verifier`, what the integration plays. `{ rouge, aRepasser, arbitrer, texte, complet,
// resume, proprietaire, horsTitre }`: `texte` the report for the developpeur the red goes to, its
// own reds first; `complet` every red, for a stop; `proprietaire` the index of the component that
// owns the red, -1 for none; `horsTitre` the packages out of the title that hold a red; `arbitrer`
// when every red of that developpeur is a finding to settle.
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
    const c = { args, env, ...r };
    return { ...c, rouges: rougesDe(ctx, liste, c) };
  });
  const tous = resultats.flatMap(r => r.rouges);
  // Out of the final pass, the reds of the components up to <index> are this one's; the others (a
  // component after it, the root, a red no file situates, a package out of the title) wait for it.
  const siens = r => finale || (r.proprietaire >= 0 && r.proprietaire <= index);
  const rouges = tous.filter(siens);
  const laisses = tous.filter(r => !siens(r));
  const aRepasser = resultats.filter(r => r.code === A_REPASSER);
  const nommer = r => `${ligneDeCommande(r)} (code ${r.code})`;
  const enEchec = resultats.filter(r => r.code !== 0 && r.code !== A_REPASSER);
  // The owner of the red: in the final pass the first component, provider first, that owns one;
  // out of it, this one.
  const nommes = rouges.map(r => r.proprietaire).filter(i => i >= 0);
  const proprio = !rouges.length ? -1 : finale ? (nommes.length ? Math.min(...nommes) : -1) : index;
  const a = finale ? rouges.filter(r => r.proprietaire === proprio && proprio >= 0) : rouges;
  const autres = rouges.filter(r => !a.includes(r));
  const resume = rouges.length
    ? `rouge : ${rouges.length} rouge(s) — ${enEchec.map(nommer).join(' ; ')}`
    : aRepasser.length
      ? `à repasser : ${aRepasser.map(nommer).join(' ; ')}`
      : `verts : ${resultats.map(ligneDeCommande).join(' ; ')}${
          laisses.length
            ? ` ; laissés à la passe finale, ${laisses.length} rouge(s) hors de ${composant} et des composants d'avant`
            : ''
        }`;
  // Where the checks played: the final pass out of the envelope, on the whole copy; a
  // component's checks, its tests and packages, its guards in its envelope.
  const ou = finale
    ? `Contrôles de la passe finale, hors enveloppe, sur la copie entière (après ${composant})`
    : `Contrôles du composant ${composant}, ses tests et ses paquets, ses gardes dans son enveloppe`;
  const ligne = r => [`- ${r.texte}`, ...(r.detail ? ['', r.detail, ''] : [])];
  const nomDuProprio = r =>
    r.proprietaire >= 0 ? ctx.composants[r.proprietaire] : (r.horsTitre ?? 'hors des composants');
  const journal = `Le journal du ticket, pour le détail des commandes : ${ctx.journal}`;
  const texte = [
    `${ou} : ${resume}.`,
    '',
    ...(a.length ? [`Tes rouges (${a.length}) :`, ...a.flatMap(ligne), ''] : []),
    ...(aRepasser.length && !rouges.length
      ? [`À repasser (${aRepasser.length}) : ${aRepasser.map(nommer).join(' ; ')}`, '']
      : []),
    ...(autres.length
      ? [`Les autres rouges (${autres.length}) vont aux agents de leurs composants.`, '']
      : []),
    ...(laisses.length && !finale
      ? [`Laissés à la passe finale (${laisses.length}) :`, ...laisses.map(r => `- ${r.texte}`), '']
      : []),
    journal,
  ].join('\n');
  const complet = [
    `${ou} : ${resume}.`,
    '',
    ...(rouges.length
      ? [
          `Les rouges (${rouges.length}) :`,
          ...rouges.flatMap(r => ligne({ ...r, texte: `${nomDuProprio(r)} : ${r.texte}` })),
          '',
        ]
      : []),
    journal,
  ].join('\n');
  return {
    rouge: rouges.length > 0,
    aRepasser: aRepasser.length > 0,
    arbitrer: a.length > 0 && a.every(r => r.arbitrer),
    texte,
    complet,
    resume,
    proprietaire: proprio,
    horsTitre: [...new Set(rouges.map(r => r.horsTitre).filter(Boolean))].sort(),
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
  return { etape: CONTROLES, tentative: 0, rapport: null };
}

// The component at <index>, whose checks are green, kept as `atteint` when it lies after it.
function atteindre(ctx, index) {
  if (index > ctx.composants.indexOf(ctx.atteint)) ctx.atteint = ctx.composants[index];
}

// The RENDU verdicts since the ticket's last ACCEPTÉ: a lot the queue sent back starts a new count.
function rendusDepuisAccepte(ctx) {
  const verdicts = fichesDe(ctx, 'relecteur').map(f => f.verdict);
  return verdicts.length - (verdicts.lastIndexOf('ACCEPTÉ') + 1);
}

// The count of the bounded loop of the step <etape> under way, by its number
// (scripts/etapes.mjs, `boucle`): the session of the testeur or of the developpeur, the review;
// null at a step without a loop.
function boucles(ctx, etape, tentative) {
  const numero = etapeDuCircuit({ etape })?.numero;
  if (etape === TESTS || etape === CODE) return { [numero]: tentative };
  if (etape === RELECTURE) return { [numero]: rendusDepuisAccepte(ctx) + 1 };
  return null;
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
      boucles: boucles(ctx, etape, tentative),
    };
    // A step the circuit leads itself names its start in the state while it runs, and writes its
    // line to the register at its end, whatever its outcome.
    const menee = MENEES.has(etape) ? { etape, composant, debut: new Date().toISOString() } : null;
    ecrireEtat(ctx, { ...etat, mene: menee?.debut ?? null });
    try {
      if (etape === TESTS && sansTests(ctx, index)) {
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
        etape = CODE;
        tentative = 1;
      } else if (etape === TESTS) {
        const fiche = await seance(ctx, 'testeur', composant, {
          tentative,
          rapport,
          derniere: tentative > RELANCES_TESTEUR,
        });
        // A testeur who declares himself blocked or in need of an answer goes to the regulator.
        if (fiche.statut !== 'FAIT')
          throw arretDuStatut(ctx, 'testeur', composant, tentative, fiche);
        commenter(ctx, composant, 'testeur', `séance ${tentative} finie, sa fiche lue.`);
        etape = PREUVE;
      } else if (etape === PREUVE) {
        const p = preuve(ctx, composant);
        rapport = p.texte;
        if (p.ok) {
          const suite = p.rouges
            ? 'au développeur'
            : 'aucun rouge : un lot de tests seul, aux contrôles';
          ecrireRapport(ctx, composant, 'preuve', `${p.resume} ; ${suite}.\n\n${p.texte}`);
          etape = p.rouges ? 'developpeur' : 'controles';
          tentative = p.rouges ? 1 : 0;
          // The reviewer's findings for this developpeur follow the proof.
          const pourLui = ctx.renvois?.[composant]?.developpeur;
          if (p.rouges && pourLui)
            rapport = `${rapport}\n\nLES CONSTATS DU RELECTEUR :\n\n${pourLui}`;
        } else if (tentative <= RELANCES_TESTEUR) {
          ecrireRapport(
            ctx,
            composant,
            'preuve',
            `${p.resume} ; testeur relancé (séance ${tentative + 1}).\n\n${p.texte}`
          );
          etape = TESTS;
          tentative++;
        } else {
          throw new Arret('preuve', p.texte);
        }
      } else if (etape === CODE) {
        const fort = tentative >= SEANCES_DEVELOPPEUR;
        const avant = empreinte(ctx, composant);
        const fiche = await seance(ctx, 'developpeur', composant, {
          tentative,
          rapport,
          fort,
          derniere: fort,
        });
        // A question goes to the regulator; a red out of reach, to the testeur its sheet sends it
        // to, else to the regulator.
        if (fiche.statut === 'BESOIN') {
          throw arretDuStatut(ctx, 'developpeur', composant, tentative, fiche);
        }
        const renvoi = renvoiAuTesteur(ctx, fiche, index);
        if (renvoi) {
          // The red that remains lies in the tests of that component: its testeur, as a regulator's
          // `RELANCE --depuis testeur <composant>`, the handover as its context.
          const cible = ctx.composants[renvoi.index];
          if (ctx.renvoiAuTesteur === cible) {
            throw new Arret(
              'sans-livraison',
              `La fiche de la séance ${tentative} du développeur de ${composant} renvoie une deuxième fois de suite à \`testeur ${cible}\`, sans contrôles verts depuis le premier renvoi : le testeur n'a pas levé ce rouge.\n\n${renvoi.texte}`
            );
          }
          ctx.renvoiAuTesteur = cible;
          commenter(
            ctx,
            composant,
            'developpeur',
            `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie ; sa fiche renvoie le rouge à \`testeur ${cible}\` : le circuit rejoue ${cible} depuis son testeur, puis les composants d'après.`
          );
          ctx.reprendre = false;
          ctx.depuis = { etape: TESTS, composant: cible };
          ctx.contexte = renvoi.texte;
          ({ index, etape, tentative, rapport, dernier, finale } = depart(ctx, null));
          continue;
        }
        if (fiche.statut === 'BLOQUÉ') {
          throw arretDuStatut(ctx, 'developpeur', composant, tentative, fiche);
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
          `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie, sa fiche lue.`
        );
        etape = CONTROLES;
      } else if (etape === CONTROLES) {
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
            `La passe finale est rouge dans ${k.horsTitre.join(', ')}, hors des composants du ticket (${ctx.composants.join(', ')}) : aucun de leurs développeurs n'est relancé. La décision revient au régulateur : faire ajouter ce composant au titre du ticket par le superviseur (\`MONTE\`), le rouge allant ensuite à son développeur ; ou faire corriger le lot par le composant qui le cause (\`RELANCE --depuis developpeur <composant>\`, le rouge en \`contexte\`).\n\n${k.complet}`
          );
        } else if (k.rouge && vers < 0) {
          throw new Arret(
            'controles',
            `Aucun composant du ticket (${ctx.composants.join(', ')}) ne possède ce rouge de la passe finale (un rouge de la racine, ou que rien ne situe) : la décision revient au régulateur.\n\n${k.complet}`
          );
        } else if (k.rouge && k.arbitrer) {
          throw new Arret(
            'controles',
            `Les rouges de ${ctx.composants[vers]} sont des constats à arbitrer : aucun développeur ne les tranche, la décision revient au régulateur.\n\n${k.complet}`
          );
        } else if (k.rouge && suivante <= SEANCES_DEVELOPPEUR) {
          const qui = vers === index ? '' : ` de ${ctx.composants[vers]}`;
          ecrireRapport(
            ctx,
            composant,
            'controles',
            `${k.resume} ; développeur${qui} relancé (séance ${suivante}).`,
            k.texte
          );
          etape = CODE;
          tentative = suivante;
          index = vers;
          finale = passeFinale;
        } else if (k.rouge) {
          throw new Arret('controles', k.complet);
        } else if (k.aRepasser) {
          throw new Arret('a-repasser', k.complet);
        } else {
          ecrireRapport(ctx, composant, 'controles', `${k.resume}.`);
          // Green checks: a sending of the developpeur to a testeur may come again.
          ctx.renvoiAuTesteur = null;
          // Green checks carry this component, or at the final pass every one, to their end.
          atteindre(ctx, passeFinale ? dernier : index);
          if (!passeFinale) {
            index++;
            ({ etape, tentative, rapport } = entreeDuRenvoi(ctx, index) ?? {
              etape: TESTS,
              tentative: 1,
              rapport: null,
            });
          } else {
            etape = RELECTURE;
          }
        }
      } else if (etape === RELECTURE) {
        const v = await relire(ctx, composant);
        if (v.verdict === 'ACCEPTÉ') {
          commenter(ctx, composant, 'relecture', 'ACCEPTÉ ; le lot va à l’intégration.');
          etape = INTEGRATION;
        } else {
          // The reviews since the last ACCEPTÉ: a lot the queue sent back starts a new count.
          const rendus = rendusDepuisAccepte(ctx);
          if (rendus >= RELECTURES) {
            throw new Arret(
              'relecture-arret',
              `${rendus} relectures ont rendu le lot : le circuit s'arrête à la troisième. La décision revient au régulateur.\n\nLe dernier verdict :\n\n${v.texte}`
            );
          }
          const renvois = renvoisDuVerdict(ctx, v.fiche, v.texte);
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
      } else if (etape === INTEGRATION) {
        const r = integrer(ctx);
        if (r.code === A_REPASSER) throw new Arret('a-repasser', fin(r.sortie, 40));
        if (r.code !== 0) {
          throw new Arret(
            'integration',
            `Le script d'intégration refuse le lot (code ${r.code}) : la décision revient au régulateur.\n\n${fin(r.sortie, 60)}`
          );
        }
        const branche = `agent/${ctx.ticket}`;
        const commit = spawnSync('git', ['-C', ctx.racine, 'rev-parse', '--short', branche], {
          encoding: 'utf8',
        }).stdout.trim();
        commenter(
          ctx,
          composant,
          'integration',
          `${commit ? `commit ${commit} sur ${branche}` : 'lot commité'} ; la branche est en file.`
        );
        etape = EN_FILE;
      } else if (etape === EN_FILE) {
        const f = file(ctx);
        if (f.etat === 'ferme') {
          ecrireEtat(ctx, { ...etat, etape: 'integre', code: 0 });
          commenter(ctx, composant, 'file', `${f.raison}.`);
          return { code: 0 };
        }
        if (f.etat === 'en-file') throw new Arret('a-repasser', f.raison);
        throw new Arret(
          'integration',
          `La file rouvre le ticket : la décision revient au régulateur.\n\n${f.raison}`
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

// The decision of the regulator's sheet <fiche>: `{ ligne, reprendre: true, contexte }` or
// `{ ligne, depuis: { etape, composant }, contexte }` for a RELANCE, `contexte` its context or
// null; `{ ligne, question }` for a MONTE; `ligne` the decision as the circuit writes it at the
// ticket. Null for a `--depuis` whose component the title does not name.
function decisionDe(ctx, fiche) {
  if (fiche.decision === 'MONTE') {
    return { ligne: `MONTE : ${fiche.question}`, question: fiche.question };
  }
  const contexte = fiche.contexte?.trim() || null;
  const avec = l => (contexte ? `${l}\nCONTEXTE : ${contexte}` : l);
  if (fiche.decision === 'RELANCE --reprendre') {
    return { ligne: avec('RELANCE --reprendre'), reprendre: true, contexte };
  }
  const i = indexDe(ctx, fiche.depuis.composant);
  if (i < 0) return null;
  const composant = ctx.composants[i];
  return {
    ligne: avec(`RELANCE --depuis ${fiche.depuis.role} ${composant}`),
    depuis: { etape: fiche.depuis.role, composant },
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
// by a session of the regulator: a fresh one, or, with <reponse> (the supervisor's answer to its
// question), its session `a.seance` resumed. `{ code }` when the circuit ends: on « question », or
// on the stop itself for an answer in no form of decision or a session in error; `{ depart }`
// for a RELANCE, where the run starts again.
async function trancher(ctx, a, reponse = null) {
  const seance = reponse === null ? randomUUID() : a.seance;
  const garde = { seance, arret: a.nom, code: a.code, rapport: a.rapport };
  const { composant } = a.etat;
  // The same stop come back after a RELANCE counts its pass at the arbitrage.
  const passe = memeArret(ctx.relances[0], a) ? ctx.relances.length + 1 : 1;
  const arret = {
    ...a.etat,
    code: a.code,
    raison: a.nom,
    rapport: a.rapport,
    boucles: { [ARBITRAGE.numero]: passe },
  };
  ecrireEtat(ctx, { ...arret, regulateur: garde });
  const valeurs = {
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    arret: a.nom,
    code: a.code,
    // The step by its number and title, « 5 Code ».
    etape: etapeDuCircuit(a.etat) ? libelle(etapeDuCircuit(a.etat)) : a.etat.etape,
    composant,
    raison: String(a.rapport ?? '').trim() || 'aucune',
    etat: ctx.etat,
    journal: ctx.journal,
    reponse,
  };
  // Its sheet, read as any session's: one that is absent or out of its schema resumes the session
  // once, asking for it; twice none, or a session that cannot end, leaves no decision.
  let d = null;
  let pourquoi = null;
  try {
    const fiche = await jusquALaFiche(
      ctx,
      REGULATEUR,
      composant,
      consigne(valeurs, reponse === null ? 2 : 3),
      {
        horsEnveloppe: true,
        droits: droitsDuRegulateur(ctx),
        id: seance,
        premiere: reponse === null ? 'ouvre' : 'reprend',
      }
    );
    d = decisionDe(ctx, fiche);
    if (!d) pourquoi = `sa décision nomme un composant hors du titre (${fiche.depuis?.composant})`;
  } catch (e) {
    if (!(e instanceof Arret)) throw e;
    pourquoi = e.rapport;
  }
  if (!d) {
    ecrireEtat(ctx, {
      ...arret,
      rapport: `${String(a.rapport ?? '').trim()}\n\nLE RÉGULATEUR ne rend pas de décision : ${pourquoi}`,
    });
    process.stderr.write(
      `⛔ Circuit de ${ctx.ticket} arrêté : ${a.nom}  ; le régulateur ne rend pas de décision.\n`
    );
    return { code: a.code };
  }
  commenter(ctx, composant, REGULATEUR, d.ligne);
  if (d.question) {
    ctx.relances = [];
    ecrireEtat(ctx, {
      ...arret,
      code: ARRETS.question,
      raison: 'question',
      rapport: d.question,
      regulateur: garde,
    });
    process.stderr.write(
      `⛔ Circuit de ${ctx.ticket} arrêté : question du régulateur au superviseur, qui y répond ou la porte au responsable ; la réponse se passe par \`node scripts/circuit.mjs ${ctx.ticket} --reponse "<texte>"\`.\n`
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

// The run from <suite> on: each stop other than 0 and 75 settled by the regulator, whose
// RELANCE runs the circuit again, until the circuit ends; its exit code. The stop that follows the
// third RELANCE in a row on it ends the circuit without a regulator.
async function conduire(ctx, suite) {
  for (;;) {
    if (suite.code !== undefined) return suite.code;
    const a = await derouler(ctx, suite.depart);
    if (a.code === 0 || a.code === A_REPASSER) return a.code;
    if (ctx.relances.length >= RELANCES_DU_REGULATEUR && memeArret(ctx.relances[0], a)) {
      const decisions = ctx.relances.map((x, i) => `${i + 1}. ${x.decision}`).join('\n\n');
      ecrireEtat(ctx, {
        ...a.etat,
        code: a.code,
        raison: a.nom,
        rapport: `${String(a.rapport ?? '').trim()}\n\nLE RÉGULATEUR a rendu ${ctx.relances.length} décisions RELANCE d'affilée sur cet arrêt : le circuit s'arrête au lieu d'une ${ctx.relances.length + 1}e relance. Ses décisions :\n\n${decisions}`,
      });
      commenter(
        ctx,
        a.etat.composant,
        REGULATEUR,
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
    return { index: 0, etape: TESTS, tentative: 1, rapport: null, dernier: fin, finale: false };
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
    tentative: e.etape === CONTROLES ? 0 : 1,
    rapport: e.rapport,
    dernier: dernier < 0 ? fin : dernier,
    finale: e.finale === true,
  };
}

// The end of the run, its exit code <code>: the ticket's bilan at the ticket (scripts/bilan.mjs);
// a bilan it cannot write leaves the code as it is.
function aLaFin(ctx, code) {
  try {
    const texte = ecrireLeBilan(ctx.racine, ctx.ticket);
    commenter(ctx, ctx.courant?.composant ?? ctx.composants.at(-1), 'bilan', texte);
  } catch (e) {
    process.stderr.write(`⚠️  bilan non écrit au ticket : ${e.message}\n`);
  }
  return code;
}

export async function main(argv) {
  let ctx = null;
  try {
    ctx = contexte(lireArguments(argv));
    mkdirSync(path.dirname(ctx.copie), { recursive: true });
    const e = existsSync(ctx.etat) ? JSON.parse(readFileSync(ctx.etat, 'utf8')) : null;
    if (ctx.reponse !== null && (e?.raison !== 'question' || !e?.regulateur?.seance)) {
      throw new Usage(
        `--reponse : aucune séance du régulateur gardée dans ${ctx.etat} ; elle suit un arrêt « question ».`
      );
    }
    // The components the runs before carried to green checks, and the session a relaunch resumes.
    ctx.atteint = e?.atteint ?? null;
    ctx.reprise = e?.reprise ?? null;
    const d = ctx.reponse === null ? depart(ctx, e) : null;
    // A session a dead circuit left running ends before this run launches its own.
    await attendreLaSeance(ctx, e?.seance);
    if (ctx.reponse === null) return aLaFin(ctx, await conduire(ctx, { depart: d }));
    // The supervisor's answer goes to the regulator's session kept on the stop it settles.
    ctx.renvois = e.renvois ?? null;
    const arret = {
      code: e.regulateur.code,
      nom: e.regulateur.arret,
      rapport: e.regulateur.rapport,
      seance: e.regulateur.seance,
      etat: {
        etape: e.etape,
        composant: e.composant,
        tentative: e.tentative,
        code: null,
        raison: null,
        rapport: e.regulateur.rapport,
        dernier: e.dernier,
        finale: e.finale === true,
      },
    };
    return aLaFin(ctx, await conduire(ctx, await trancher(ctx, arret, ctx.reponse)));
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
