#!/usr/bin/env node
// The circuit of one ticket, as a merge request: one author, a series of tests and of code, a CI
// on the whole, a review (grillhouse-3uv.95.6). The plan; one testwriter for the whole ticket, in
// the envelope of every package of its plan, and the proof of the red; one developpeur on the
// whole plan, and its checks; the final pass, then the reviewer, and on its ACCEPTÉ the
// integration, which commits the lot on the ticket's branch and puts that branch in the queue;
// then the queue, which brings it onto main, pushes and reads the CI, and the circuit ends on the
// state of the ticket the queue leaves. No component is a unit of the circuit: every step is one
// for the whole ticket. The supervisor runs it once, in the background, and its end wakes him: at
// 0 the ticket is closed; at 75 he runs `--reprendre` again once the machine is at rest; at any
// other code, a question of the circuit waits for him. As a CI applies its rules (retry,
// regenerate, skip a job without object) without asking anyone and calls a person only for what
// no rule settles (the approval of a review), the circuit makes the mechanical gestures itself,
// with no session (GESTES of scripts/etapes.mjs), and every other stop goes up to the supervisor:
// its state carries the question (`question`: the fact, its piece, file:line or command and
// output, the question, and who must answer it, MONTEES of scripts/etapes.mjs). He answers by a
// command of the circuit, `--reprendre` (with `--contexte`) or `--depuis`, `--etendre <paquet>`,
// or `--arreter`, and carries to the owner what is his (`qui` responsable). So the supervisor is
// woken only by the end of the lot or by a question no rule settles. Witness: BP 320.9, sixteen
// components played one after the other, 118 min of green steps played again, and a finding of
// the reviewer on `exemplar` lost six times.
//
//   npx grillhouse circuit <ticket> [--reprendre] [--contexte <texte>]
//   npx grillhouse circuit <ticket> --depuis <testwriter|developpeur> --contexte <texte>
//   npx grillhouse circuit <ticket> --etendre <paquet>[,<paquet>…] [--contexte <texte>]
//   npx grillhouse circuit <ticket> --arreter [--contexte <motif>]
//
// The run is a daemon (scripts/demon.mjs), as daemon(3) and `setsid --fork` make one: the command
// launches a relay,
// which launches the run in a session of its own and ends at once, so that the run is neither in
// the caller's process group nor under it in the tree of processes, and goes on to its end when
// its caller dies (BP 320.8: the circuit, a background command of the supervisor's session, died
// with it). The caller relays the run's output to its own streams while it lives, and ends on the
// run's exit code; the state names the run (`processus` and its start `depart`), which the board
// reads, and a second run of the ticket while it lives is refused (exit 2), `--arreter` stopping
// it.
//
// The circuit decides on structured results only (scripts/resultats.mjs, the one module of their
// formats), as Bazel's Build Event Protocol and the JUnit reports carry the outcome of a build:
// the sheet that ends each session, the summaries of Turborepo, the JSON reports of Vitest and the
// SARIF of the guards. It reads no comment, no answer and no log to decide (a guard holds it:
// tests/unit/circuit-sans-texte-libre.spec.ts); the handovers at the ticket are for the human and
// for the next session of their author, the log for the human. Each header of the log, a step's or
// a session's, dates it in local time with its offset (ISO 8601), one time for the whole log.
//
// - The plan is read in the ticket's title (`bd show <ticket> --json`), after its last « — »,
//   separated by commas: each one a path (`packages/<nom>`, or `.`), or the name of a package,
//   which becomes its directory (scripts/paquets.mjs), read in the ticket's copy when it exists,
//   else in the main tree. A name that names neither stops the call, exit 2, named.
// - Before the testwriter (a run that starts there), the plan (step 1 of scripts/etapes.mjs), as
//   an RFC: its author writes it after surveying what exists, a review reads it once, the author
//   answers once, and what stays open goes to who decides. One session of the explorateur out of
//   the envelope, on Sonnet, its instruction from the sixth template (the ticket, its title,
//   description and notes, the context), writes the plan in its sheet: its criteria, the packages
//   to touch, and its open questions, each with why it goes up (its motif: the language, the
//   architecture, a gap to the reference, or no answer) and its piece; it surveys the components the ticket
//   reaches by `npx grillhouse composants-affectes <ticket>` (scripts/composants-affectes.mjs),
//   which the circuit plays no more as a step. A package the repository does not hold, one named
//   twice, or a component of the survey of the plan (`releve`, which the circuit plays with no
//   session to check the sheet) that the sheet neither puts in its packages nor sets apart with
//   its reason (`ecartes`, written at the ticket) makes the sheet out of conformity. The circuit
//   writes the plan at the ticket (`bd update --title -d`): the packages end its title, the list the envelope of every later
//   session writes; the criteria already written stay as they are, the owner's decision, and the
//   criteria of the sheet, those the plan adds, follow them, numbered after them (a change or a
//   removal of a criterion written is an open question of the sheet); the open questions a section
//   « Questions ouvertes » after them. Each writing starts again from the description before the
//   plan. Then one session of the questionneur out of the envelope, read-only (no tool of
//   writing, every write of bd refused, scripts/droits.mjs), as Amazon's bar raiser, a cockpit's
//   challenge and response and the devil's advocate of a design review, its instruction from the
//   fifth template (the proposal, the métacadre, the rubrics « Comment on arbitre » and « Ce qui
//   monte au superviseur » of the project's CLAUDE.md, the ticket's description; no list of
//   questions), reads the plan once: its sheet `issue` QUESTIONS (each question with what it aims
//   at), AUCUNE or DÉSACCORD. On its questions, its disagreement as one, the explorateur's session
//   is resumed once, its instruction from the seventh template (the numbered questions): its sheet
//   answers each question, CHANGE (what the plan becomes) or GARDE (why it stays), and carries the
//   plan as it becomes, which the circuit writes at the ticket again. A sheet without a line of
//   `reponses` by question put (`reponsesAuxQuestions` of scripts/resultats.mjs) is refused and
//   asked again once of the same session, the numbers that lack named; only after that resumption
//   does a question without its line stay open. The exchange is written at
//   the ticket (`Circuit · plan : …`, `Circuit · questionnement : …`) and its end kept with the
//   circuit's results (`questionnement`: objet, the questions asked, `questions`, change, issue,
//   ouvertes, the plan's fingerprint). What stays open (the plan's own questions, and each
//   question the explorateur leaves without an answer) stops at « questionnement », the open questions as its piece, a
//   question for the supervisor: he changes the plan (`bd update`) or keeps it, then
//   `--reprendre` lets the plan pass as it is then, from the testwriter. Nothing open, the plan
//   passes (`plan`, its fingerprint: its title and its criteria); a plan that passed, its title
//   and criteria unchanged since, passes with no session, whatever else of its description
//   changed.
// - Each session is a launch of scripts/enveloppe/lancer.sh, a child process the circuit waits
//   for, in its own process group, its errors written to a file: a session outlives the death of
//   its circuit, and the state names its group while it runs. Its plan, the packages it writes (`--paquets`, the envelope's list), is the plan of the
//   ticket, the whole copy in sight, the session at the root (`.`); lancer.sh builds the packages
//   of the plan and what they read before it opens. A session its lock stops on a write out of
//   the plan ends the circuit at « hors-plan », a question for the supervisor, the write as its
//   piece. The instruction is written from the first template of
//   mods/grillhouse/skills/pitmaster/references/consigne-agent.md, each `{{champ}}` filled: the
//   ticket and its subject, its plan, the ticket's description (its criteria) and its notes (a
//   section absent without notes), both read with `bd show` at the session's launch, the report of
//   the step before (the proof, the reds of a check), the findings of the reviewer still open, the
//   last handover of the session's author at the ticket, for a developpeur without one yet the last
//   of the testwriter, else « aucune » (no verdict), the line `CONTEXTE :`: the text of
//   `--contexte`, for each agent of the run, and the references 4.2 regenerates, each with its
//   files (`lesReferences`), so that no session stops on what the circuit writes itself (BP
//   320.8: a developpeur, code and tests green, stopped on a ceiling, the debt and the index).
//   The session's own exit code is the one lancer.sh
//   writes to `.claude/worktrees/<ticket>.fin`; a launch that leaves none stopped before its
//   session.
// - Each session of the explorateur, the questionneur, the testwriter, the developpeur and the
//   reviewer ends on its sheet (« la fiche »): claude runs with `--output-format json --json-schema
//   <the schema of its role>` (scripts/resultats.mjs), and its JSON result carries the sheet in
//   `structured_output`, which the circuit reads (`lireFiche`), each file piece of it checked in
//   the copy (a piece not found refuses the sheet, asked again once like any other lack):
//   lancer.sh writes that result to
//   `.claude/worktrees/<ticket>.resultat.json`, and a session out of the envelope prints it. Each
//   sheet read is kept with the ticket's sheets, `.claude/worktrees/<ticket>.fiches.jsonl` (`{
//   date, role, fiche }`, the lot a review read joined to its sheet, `lot`), beside the circuit's
//   own results: the report of each proof and check, which the reviewer receives, with its outcome
//   (`resultat`), each stop (`arret`), each developpeur session that changed no file of the plan
//   and goes to the checks or stops at « sans-livraison » (`inchange`), each session launched
//   (`lancement`, its role and its session id), each end of a run on a question (`montee`: its
//   code, its stop and the supervisor's session that ran it, `superviseur`, the
//   `CLAUDE_CODE_SESSION_ID` Claude Code gives the run), which the bilan reads; and each
//   of its discoveries (`decouvertes`) filed closed under the ticket (scripts/ticket.sh, label
//   `decouverte`). A session that ends without a sheet that conforms (none, one out of its schema,
//   a code other than 0) is resumed once, the same session, with the third template, which names
//   what lacks; a second one stops the circuit at « sans-fiche ». The handover at the ticket (`bd
//   comments add`) stays, for the human.
// - A fresh session of the testwriter or the developpeur opens under a session id the circuit sets
//   (`lancer.sh --seance <uuid>`, claude's `--session-id`), kept in the state (`reprise`, its
//   author and id). A relaunch of that agent (the testwriter after a failed proof, the developpeur
//   after red checks) resumes that session (`lancer.sh --reprise <id>`, claude's `--resume`, which
//   finds its transcript in the copy's folder of transcripts, which the envelope mounts in writing
//   over the real one) with the fourth template of consigne-agent.md (the ticket, its plan, what
//   changed, the new report, the findings still open), save the last attempt (the testwriter's
//   third session, the developpeur's on the strong model), a fresh and whole session. A resumption
//   that ends with a code other than 0, or without a sheet that conforms, writes so at the ticket
//   and falls back on a fresh and whole session. A resumed session keeps its id, and so its one
//   line in the register, its latest end.
// - A session whose transcripts (`~/.claude/projects/<copy in dashes>/`, as scripts/registre.mjs
//   reads them) and log (its preparation writes there before the session opens) stand still for
//   20 minutes (IMMOBILE_MS; GRILLHOUSE_CIRCUIT_IMMOBILE_MS replaces it, in milliseconds) is
//   stopped: SIGTERM, then SIGKILL, to the launcher's group.
// - Each comment at the ticket carries its author, which bd reads in BEADS_ACTOR (ACTEUR): each
//   session runs with the author of its role (`testwriter`, `developpeur`, `explorateur`,
//   `questionneur`, `relecteur`), which the envelope passes on; the circuit writes its own lines
//   under `circuit` and the reviewer's verdict under `relecteur`, and the queue writes under `file`
//   (scripts/integration/file.mjs), whose last word the circuit names. The rights of every session
//   refuse bd's `--actor`, `-a`/`--author` and the variable itself (AUTEUR_FIXE of
//   scripts/droits.mjs, in the settings of every role's session), so that no agent changes its
//   author.
// - The sheet of the testwriter and of the developpeur carries its status (`statut`): FAIT goes on as
//   below; BESOIN (its `question`) stops the circuit at once at « besoin », the question and the
//   handover as its report, with no session more; so does BLOQUÉ (its `raison`), at
//   « hors-portee », save for a developpeur whose sheet sends the red to the testwriter (`renvoi`,
//   below), which is that sending. Either stop goes up to the supervisor, the sheet's `piece` as
//   its piece. A developpeur's FAIT that names criteria it does not hold out of the plan
//   (`hors_plan`) stops at « hors-portee » too, at 3 Code, as a required check keeps a merge from
//   a change that does not pass it: the question names each criterion and its package, the
//   supervisor answers `--etendre <paquet>`, or amends the criterion and `--reprendre` (BP 320.17:
//   « critère 10 hors plan, non fait » in three handovers fell at the review).
// - A plan that carries no test (sansTests: in a repository of packages, no package with a script
//   `test:vitest` lies in a path of the plan or holds it, as `npm test -- <chemin>` refuses a path
//   out of every package or in a package without that script) skips the testwriter and the proof:
//   the circuit writes `Circuit · testwriter : aucun test …` at the ticket and launches the
//   developpeur, the reason as his report, then his checks.
// - Each command of the proof and of the checks runs with its own results directory
//   (`GRILLHOUSE_RESULTATS`), where Turborepo writes its summary (scripts/tests.mjs,
//   scripts/verifier.mjs), Vitest its JSON report (scripts/vitest-config/resultats.mjs) and each
//   guard its SARIF; its output goes to the log, for the human. Each `npm test` of them carries
//   the mark `GRILLHOUSE_DEPUIS_LE_VERT` (scripts/dernier-vert.mjs): in a package named whole,
//   the tests that play are those Vitest relates to the files changed since the last green of the
//   copy's branch (main's while the copy has none), the files named among them, as `npm run
//   verifier` measures itself; a lot that changes one test plays that test, and those whose graph
//   it reaches.
// - Each automatic pass (each command of the proof and of the checks, the final pass, the
//   integration and the queue) plays under a progress directory of its own
//   (`GRILLHOUSE_AVANCEMENT`, scripts/avancement.mjs), which its state names while it plays
//   (`avancement`: `{ dossier }`, null between two), as Bazel counts its actions: Vitest writes
//   there the files done and planned of each task, the queue the steps of its CI; the board shows
//   them on the ticket's line (scripts/tableau.mjs). Its total is kept at its end under its kind
//   (the step and the command), which the next pass of that kind takes while all its tasks have
//   not started.
// - The proof of the red plays the new tests alone, as test-driven development runs the test it
//   has just written to see it red, not the whole suite: one run per package, `npm test -- --force
//   <files>` in the copy, the test files the testwriter's lot adds or changes (git status of the
//   copy, the testwriter's files as the integration shares them, `estUnTest`), played for real,
//   since a run replayed from Turborepo's cache writes no report; the other tests of the plan play
//   at its checks and at the final pass. With no file of the lot (a reader whose provider changed a
//   type, no new test to write), each package of the plan that has a script `test:vitest` plays
//   whole, `npm test -- <package>`: main is green, so a test HEAD holds that
//   turns red in the copy is a regression of the lot, a red, written `rouge existant : <file> ›
//   <name> — <message>`, and so is a file that does not load while no build of the plan fails (it
//   loaded at HEAD); its greens do not count. A measure on the same tree is not played again, as
//   Turborepo replays a task whose inputs did not move: a testwriter relaunched who changes no file
//   of the copy (an expected green added to his sheet alone) is judged on the results of the proof
//   already played, his sheet read again. A file of the lot that does not load proves nothing; a
//   failed build of a package of the plan (a task `<package>#build` of the summary) is a red, as
//   not compiling is failing, named with its log, and the files it keeps from loading play at the
//   checks, after the developpeur; a failed build of a package out of the plan leaves them broken.
//   A green test passes only when a sheet of the testwriter names it in `verts_attendus`: its file
//   from the root and its full name (or its title), with its reason; one without `test`, for a test
//   file HEAD holds, justifies each green test of that file and excuses no red; on a new file it
//   justifies nothing, and the report says so for that file. A green test HEAD already holds has
//   nothing to prove: the version of HEAD of each file plays in the same run, from a sibling file
//   (`<nom>.circuit-avant.test.<ext>`, removed after it), and a green test whose full name HEAD's
//   version holds, green there too, is set aside, counted; a body changed under the same name is
//   not told apart. The proof passes with a red (of the lot, existing or of a build), even without
//   a file of the lot: a testwriter with no new test to write says so in his handover, the existing
//   reds are enough. It fails with neither a file of the lot nor a red, with a broken file of the
//   lot, or with a green of the lot no expected green justifies. A failed proof relaunches the
//   testwriter with its report, twice at most. The report (reds, justified greens) is written at
//   the ticket. A proof with a red launches the developpeur, and so does a proof without a red
//   when a finding of the reviewer still open names him; else it skips him: the lot is a lot of
//   tests alone.
// - A developpeur is launched on a red, of a proof or of a check, on a finding of the reviewer, or
//   on a plan without tests: a session that changes no file of the plan (`git status --porcelain`
//   of its paths and the content of each file it lists, taken before and after the session; the
//   sheet and the handover do not count) has nothing to deliver, the gesture `rien-a-livrer`, as a
//   CI skips a job without object: the checks judge the lot; green, the run goes on; red, the
//   circuit stops at « sans-livraison », its report sending to the developpeur's handover. A
//   developpeur that `--depuis developpeur` launches on the lot the integration refused (`refus`,
//   the fingerprint of its plan), as a merge queue lets a lot it sends back pass again only with a
//   change, a session that changes nothing does not go to the checks of the copy, which do not see
//   that red: the developpeur is relaunched once with the refusal, then the
//   circuit stops at « sans-livraison », the refusal as its piece (BP 320.37: three times FAIT
//   without a file changed, the checks of the copy green, the integration red on the same lot).
// - A sheet of the developpeur whose `renvoi` names the testwriter says the red that remains lies
//   in the tests of the lot: the gesture `renvoi-au-testwriter`, whether or not the session
//   changed a file: the testwriter, the sending and the handover as his report, with the red
//   output of the last checks when checks ran since his session, as a CI hands back the log of
//   the check that fails, then the proof and the developpeur. The same sending twice in a row on
//   the same red output of the checks (none, or the same), with no green checks between them,
//   stops at « sans-livraison »: a round trip without a new fact; a sending on another red output
//   relaunches the testwriter (BP 320.37: a first sending before any check, a second after checks
//   that named the guard's line). That output is kept in the state (`controlesRouges`), so that a
//   `--reprendre` or a `--depuis` keeps it.
// - The checks after the developpeur judge the plan, as Bazel plays the targets of a change: `npm
//   test -- <package>` for each package of the plan, touched by the lot or not (a package without a
//   script `test:vitest` plays only when the lot touches it), `npm test -- <test files of the lot>`
//   that none of them holds, each test played once, then the guards in the envelope of the plan (`GRILLHOUSE_ENVELOPPE=<plan> npm run
//   grillhouse:gardes`, and `npm run gardes` when the project has it). Each red is read in the
//   results of its command: a failed test of the reports of Vitest, a finding of level error of
//   the guards' SARIF, a failed build or task of the summary; a red check none of them situates is
//   one red of the command. As SARIF 2.1.0 and GitHub code scanning, a warning or a note shows
//   without failing: the report of the checks lists them apart, under their own title, and gives
//   them to no developpeur; a guards' task red without a finding of level error keeps its line of
//   a red task, with its log (BPScript 320.17: 8 warnings on the code of the plan, given as reds,
//   stopped at « sans-livraison » a lot whose one error was the ceiling's, to regenerate). A red a path of the plan holds is the developpeur's; the others (one without a
//   file, the root's or a project's guard without SARIF, in a package out of the plan, or a red of
//   a reference, which its regeneration lifts) wait for the final pass. Green,
//   the checks lead to the final pass.
// - The final pass: `npm run verifier`, what the integration plays, as bors plays on a lot the
//   very check of the merge. Turborepo's cache and the last green hold its cost: a task nothing
//   moved replays from it, and in a package that plays again, the tests Vitest relates to the files
//   changed since the last green of the copy (scripts/dernier-vert.mjs, main's while the copy has
//   none); what the lot reaches plays again, by the dependencies, the inputs of the tasks and
//   `grillhouse.lit` (a reader out of the plan whose tests read a directory the lot changes
//   included). After a review, save on the lot it accepted, the final pass is restricted to what
//   changed since the lot it read and to its dependents, as Turborepo selects them
//   (`laPasseFinale`): the circuit keeps the copy as it stands as a commit on that lot
//   (`garderLeLot`), and plays `npm run verifier -- --filter=...[<lot relu>...<copie>]
//   --filter=//`, the root's tasks (the guards) with them; Turborepo reads a range from its merge
//   base, the lot read, where a single `[<commit>]` would be read against HEAD. The whole final
//   pass green keeps the tree of its lot (`verifie`). A red of a package of the plan goes to the
//   developpeur, three sessions for the final pass, counted apart from those of the checks, the
//   third on the strong model. A red in a package out of the plan, or that no package of the plan
//   holds, stops at « controles », a question for the supervisor: he extends the plan to that
//   package (`--etendre`), or has the lot corrected (`--depuis developpeur`). A developpeur whose
//   reds are all findings to settle (`a-arbitrer`) is not launched: the circuit stops at
//   « controles », each finding as its piece.
// - The regeneration of the references (step 4.2 of scripts/etapes.mjs), as Bazel's genrules,
//   `--update-snapshots`, `rustc --bless` and `cargo insta accept`: a generated file is written
//   again by its command, then the circuit replays only what depends on it. A project declares in
//   its package.json the references it derives from the whole copy, which no envelope shows (a
//   fingerprint of its output, a ceiling of a count), `grillhouse.references`: each `{ nom,
//   commande, fichiers, tests, gardes }`, its name, the shell command that writes it again from the
//   root of the copy, the files it writes (paths, directories or glob patterns, `*` and `**`, from
//   the root, as the inputs of Turborepo), the test files that judge it, as `rustc --bless` ties a
//   test to its expected outputs, `lit`, the files it reads that another reference writes, and the
//   guards of the project that judge it, by the name their SARIF finding carries (its guard or its
//   rule). The frame's references follow in every project (`referencesDuCadre`): the files the
//   frame generates, each judged by a guard of the frame, by the names its findings carry (the
//   index of the interfaces, which reads the interfaces, the turbo.json of the packages, the API
//   reports, which write the generated part of the interfaces), and the known debt of the guards;
//   a reference of the project whose first file is one of theirs replaces it. A final pass with a red of a reference (a failed test of one of
//   their test files, a finding of one of their guards, or a failed test or a finding on a file a
//   reference of the project covers), mixed with other reds or not, or a
//   guard's note of a key of the debt inscribed above what it finds (`a-elaguer`, the pass green
//   or not), sends no developpeur: the gesture `regeneration`, once for that pass. A finding of a
//   guard of a reference of the project on a file of the plan its files do not cover is no output
//   it generates but the code of the lot, the developpeur's, at the checks of the plan as at the
//   final pass, as `--update-snapshots` leaves every failure but the snapshots to its owner; its
//   finding without a file, or on a file the reference covers, stays the regeneration's (BPScript
//   320.10: a word of library written in 030-binder, sent to no developpeur). Checks of the
//   plan green but for reds of references call for it too, before the final pass, as make
//   remakes a generated file before what reads it: the final pass that is due then plays once, on
//   the regenerated tree, and does not regenerate again a reference regenerated on that same tree
//   (BPScript 320.3.9: the ceiling of the words, red at the checks, left to the final pass, which
//   played the same tests again on the same tree for 6.1 min before regenerating). The circuit
//   keeps the copy as a lot, runs the command of each reference concerned on the whole copy (the
//   debt lowered from the notes of the pass, its guards not played again), out of the envelope,
//   under the lock of the machine, its output added to the log, then, as make remakes the targets
//   that depend on an output, the command of each reference that reads a file one has just
//   written, after it (the index after the API reports), keeps the copy again on that lot, then plays the final pass restricted to what the regeneration changed and its
//   dependents (`--filter=...[<avant>...<après>] --filter=//`); each red of the pass before in a
//   package that pass does not play again stands, and a regeneration that changes nothing plays no
//   pass, every red of the pass before standing. What remains goes each to its owner, as any red
//   of the final pass; a ceiling never rises (its command lowers it), so a lot beyond it stays red.
//   That pass green after a whole one keeps its tree as verified. The files regenerated stay in
//   the copy: the lot carries them, without a word of the plan, as a genrule writes its output,
//   and the reviewer reads them with the rest of the lot, the step's report among the circuit's. A
//   file changed that the files of no reference run cover, or a command that fails stops at
//   « references » (23): a command of
//   the project at a code other than 0, one of the frame on a real failure alone (not found, killed
//   by a signal), since its code also judges the reds it leaves (`npm run api` refuses beside
//   them), which the pass that follows judges. The stop leaves the copy restored as it was before
//   the regeneration, a question for the supervisor that carries each deviation (the command and
//   its code, the file), as the comment at the ticket does; the state keeps the references to regenerate and the reds of the
//   pass before (`aRegenerer`), for a regeneration resumed. A command of the project that refuses
//   (no real failure), its only deviation, after a final pass that carries reds of the plan,
//   judges the lot, as a ceiling refuses a lot beyond it: the copy restored, those reds go to the
//   developpeur with the end of its output, within his sessions, then the final pass again.
// - The proof, the checks and the final pass are heavy passes: each holds the lock of the machine
//   (scripts/verrou-de-machine.mjs), shared by every repository of the machine, and waits, the
//   wait written to the log, while another measure holds it; the wait bounded, the pass is at 75,
//   « à repasser ».
// - The report a developpeur receives names his reds first, each on its line (test or finding,
//   file and line, message, the beginning of a failed build's own log), then the count of the
//   others and the path of the log; the report of a stop names every red with its package.
// - A check at 75 (« à repasser ») out of the final pass plays once more, the gesture `rejeu`;
//   verifier plays its tasks at 75 again itself, at rest, and its 75 is the final pass's. A check
//   still at 75 ends the circuit at 75, the gesture `a-repasser`. A red relaunches the developpeur
//   with its report, twice at most, the third session on the strong model (`lancer.sh --modele
//   opus --effort high`): three sessions for the checks, and three for the final pass.
// - After the final pass, green, the reviewer: a session out of the envelope, which sees the whole
//   repository with its index, claude itself (`claude -p --agent relecteur --session-id <uuid>`,
//   CLAUDE_BIN replaces claude) in the ticket's copy, on Opus, under the rights and the
//   context of its role (scripts/droits.mjs: the commands its skill names, its index), its instruction from the second template of
//   consigne-agent.md: the ticket, its plan, the path of the claims file (the ticket's
//   description as `bd show` gives it at the session's launch, written by the circuit in its
//   working folder, which the session may read; the instruction carries no criteria, which the
//   reviewer's skill reads only after its first passes), the files of the lot (the testwriter's by
//   `estUnTest`, then the others), the elements of the lot (scripts/elements-du-lot.mjs: each
//   function, class, type, interface, constant at the top and export the lot adds, changes or
//   removes against the copy's HEAD, its package, its place, whether its package exports it) and
//   the circuit's reports since its last sheet (its proofs and checks). Its errors go to the log
//   under its header line, its line to the register (scripts/registre.mjs --copie), and it is
//   watched as a session in the envelope is. Its sheet is its verdict (`verdict` ACCEPTÉ or RENDU,
//   its `conformite`, one line per element of the lot, conforming or not, with the rule it cites
//   and its piece, its `constats`, each with its piece, `bloquant` with the criterion or rule it
//   holds, or `remarque`, its `question` with its piece, `ecarts`): a sheet without a line for each element is out of
//   conformity (`conformiteDuLot` of scripts/resultats.mjs), and a « non » is a blocking finding
//   for its agent. In a bounded review, each element of the list is marked: to judge again
//   when the difference between the two lots touches it, else taken up with its line of the
//   review before. The circuit writes it at the ticket for the human, under the author
//   `relecteur`, its first word the verdict, each blocking finding under its heading with its
//   agent, then the conformity and the remarks (`texteDuVerdict`).
// - A sheet of the reviewer with a `question` (what goes up to the owner, a real word of the
//   language written in the code) stops the circuit at « besoin », whatever its verdict, before
//   it commits or relaunches anyone, the question and the verdict as its report, a question the
//   owner must answer (`qui` responsable), which the supervisor carries.
// - RENDU: the blocking findings alone send the lot back, a remark reaching only the ticket (a
//   verdict without a blocking finding is ACCEPTÉ, the sheet's schema refusing any other). Each
//   blocking finding names its agent, `role` testwriter or developpeur. A finding stays open, kept
//   in the state (`constats`), across every relaunch, a stop, `--reprendre`, `--depuis` or
//   `--etendre`, until the reviewer judges it lifted (`suivi`) or accepts the lot, as the
//   unresolved threads of a review: every session of its agent receives it. The circuit goes
//   straight to the agent the findings name: the testwriter → preuve → developpeur → controles
//   when one names the testwriter, else the developpeur → controles; then the final pass,
//   restricted to what the fix changes and its dependents, and the reviewer again, on the
//   difference: the lot it read before is kept (`lot` of its sheet's entry), as Gerrit keeps each
//   patch set, and the next review receives the command of the difference between the two lots,
//   the files of the lot that changed since, and the findings still open, each with the
//   developpeur's answer under it, which it judges lifted or not (`suivi`). As the author answers
//   in each thread of a review on GitHub or Gerrit, a sheet FAIT of the developpeur answers each
//   finding open for him, by its title, levé or contesté with its reason, with its piece
//   (`reponses`); a sheet without the answer to one is refused (`reponsesAuxConstats` of
//   scripts/resultats.mjs) and asked again once of the same session, and the answer is kept with
//   its finding in the state until the next review (BP 320.21: the cause of his choice in a
//   handover the circuit does not read, three RENDU, then the stop); the rest of the lot it does not read again (its skill, « La relecture
//   bornée »). A blocking finding without a valid agent, or one that puts its criterion in
//   question (`critere_en_cause`), stops at « relecture-arret »; so does the third RENDU since the
//   ticket's last ACCEPTÉ.
// - ACCEPTÉ: the integration, once the whole final pass has played on the lot accepted (its tree
//   is `verifie`); else that pass first, once, its red going to the developpeur and the lot then
//   to the reviewer again. The circuit builds the lot from the copy: the files the copy changes
//   against its HEAD, the testwriter's (`estUnTest`: test files and the shared test material)
//   in one patch, the others in another, each file against HEAD and a new one against nothing
//   (`git diff --no-index /dev/null`), the copy's index untouched; the message
//   `<type>(<paquets>): <sujet> (<ticket>)`, the type read from the ticket's type (bug fix,
//   chore, docs, else feat), its body written once from the final state: the criteria of the plan,
//   then each deviation the sheets of the developpeur and of the reviewer name (`ecarts`), once by
//   its subject, from the last sheet that carries it, with the trailer Co-Authored-By; and the
//   references that write files in full (`--references`), which the integration regenerates on
//   main of the moment instead of applying their files from the lot. It runs
//   scripts/integration/integrer.mjs from the main tree, its output added to the log: 0 is the
//   commit on agent/<ticket> (which the circuit names from git), the copy removed, the branch in
//   the queue; 75 (« à repasser ») plays it once more (`rejeu`), then stops at « a-repasser »; any
//   other code is its refusal, which stops at « integration ».
// - Then the queue: scripts/integration/file.mjs from the main tree, waited for, its output added
//   to the log (it brings the branch onto main, pushes it and reads the CI of the commit pushed).
//   A queue already running exits 0 at once: the circuit waits while the branch is in the queue
//   and the queue's lock names a live process. Then the state of the ticket: closed, the circuit
//   sorts the discoveries (below), then ends at « integre », exit 0 (the queue's last word at the
//   ticket named with it, a CI it could not read); reopened (out of the queue, or a red CI), it stops at « integration », the queue's
//   last word as its reason; still in the queue, it stops at « a-repasser », the queue's reason.
// - Then the tri of the discoveries (step 5.3, `trier`), as Chromium and Mozilla give each new
//   report a verdict before it is filed: each discovery a sheet filed is kept with the circuit's
//   results (`decouverte`: its id, its subject); without one, no session. Else one session of the
//   explorateur out of the envelope, on Sonnet, in the main tree (the copy is gone), under the
//   rights of its role (reading, the build of a package, no pass), its instruction from the eighth
//   template, its sheet the tri's (`tri` of scripts/resultats.mjs): one line per discovery
//   (`conformiteDuTri`), each with its verdict (traitee, doublon, sans-suite, a-porter,
//   non-confirmee), the piece of a traitee or an a-porter a command played again on main or
//   file:line; a sheet out of conformity is asked again once of the same session. Each verdict is
//   written at its discovery's ticket and set there as a label; an a-porter or a non-confirmee
//   reopens under `a-valider`. A tri without a sheet that conforms leaves the discoveries as they
//   are, said at the ticket; it never stops the circuit nor undoes the integration. Its end is kept
//   with the circuit's results (`tri`), which the bilan counts.
// - The working directory is the ticket's, `.claude/worktrees/<ticket>.travail`: the instructions,
//   results and errors of the sessions, the patches and message of the integration. It lives as
//   long as the ticket, as the workspace of a pipeline: a circuit relaunched takes it up again, no
//   sweep touches it, the queue removes it at the ticket's closure, and scripts/retirer-copie.sh
//   with the copy of a ticket closed without integration. The results and progress of the passes
//   live in the base of the run (scripts/mesure/base-de-passe.mjs), removed at its end.
// - The state is `.claude/worktrees/<ticket>.circuit.json`, written again at each step and at the
//   start and end of each session: `{ etape, tentative, code, raison, rapport, finale, boucles,
//   seance, question, questionnement, processus, depart, paquets, constats, verifie, mene, reprise,
//   refus, journal }`; `processus` the process of the circuit that writes it, `depart` its start (field
//   22 of /proc/<pid>/stat), which together name it, a number alone being reused; `questionnement` the work
//   on the plan under way (`{ objet, role, seance }`: the plan, the explorateur or the
//   questionneur, its session), null otherwise; `etape` is the state's name of a numbered step of
//   the process (scripts/etapes.mjs: testwriter 2, preuve 2.1, developpeur 3, controles 3.1, or 4.1
//   the final pass once `finale`, references 4.2, relecture 4.3, integration 5.1, file 5.2, tri
//   5.3), or
//   integre at the end; `raison` names the stop (« arrete » once the supervisor stopped the
//   circuit); `question` the question of a stop for the supervisor (`{ arret, fait, piece,
//   question, qui }`), null otherwise; `paquets` the plan of the ticket, in its order; `constats`
//   the findings of the reviewer still open, each with its agent; `boucles` the counts of the
//   bounded loops of the step under way, by their key (`tests`, the testwriter's sessions with
//   their proofs; `code`, the developpeur's with their checks; `relecture`, the reviews), null at
//   a step without one; `finale` whether the final pass has begun; `seance` the process group of
//   the session that runs, null between two; `verifie` the tree of the lot the last whole final
//   pass green played, null before; `mene` the start (an ISO date) of the step the circuit leads
//   itself while it runs, null otherwise; `reprise` the session of the testwriter or developpeur
//   its relaunches resume, `{ agent, seance }`, null before any; `refus` the integration's refusal
//   of the lot (`{ rapport, piece, empreinte, lance, relance }`: its output, its piece, the
//   fingerprint of the plan refused, whether `--depuis developpeur` launched the developpeur on it,
//   whether a session so launched left it unchanged once), null before any, once the integration
//   accepts the lot, and on a run from the testwriter.
// - `--reprendre` starts again at the step of the state, its report given to the next session,
//   after any stop, the death of the circuit included. A session the state names
//   that still runs is waited for first, and stopped when it stands still as long as a motionless
//   session. On a stop « integration », it plays the integration (or the queue) again on the same
//   lot, as bors retries: a refusal can come from the load or from main (BP 320.16, 320.16.2). On
//   a stop « questionnement », it lets the plan pass as it is then (the supervisor
//   changed it or kept it), from the testwriter.
// - `--depuis <testwriter|developpeur>` has the lot corrected: it plays the whole ticket from
//   that step, the text of `--contexte` on the line CONTEXTE of each agent of the run (after a stop
//   « integration », from the developpeur, the refusal as his report, the red to lift, as a merge
//   queue sends the lot back to its author with the log of its check; from the testwriter, the
//   refusal dropped), as a retry
//   of GitLab CI plays the jobs after it with the same variables: from the testwriter, his proof,
//   then the developpeur launched by a red of the proof as without `--depuis`; from the
//   developpeur, his checks; then the final pass, the reviewer and the integration. It goes with
//   no `--reprendre`, and names no component: a second name is a second ticket, exit 2.
// - `--etendre <paquet>[,<paquet>…]` (each a path or a package name of the repository) extends the
//   plan: the circuit writes the title (`bd update --title`), each package gained before the first
//   package of the plan that depends on it (its package.json), else at its end, said at the ticket
//   (`Circuit · plan : le superviseur étend le plan à …`); then the step under way resumes as
//   after `--reprendre`, on the plan extended, the question as its context with the text of
//   `--contexte`; a stop « sans-livraison » on the developpeur's sending to the testwriter
//   resumes at the testwriter, the role it names. The plan so extended has passed (`plan`, its
//   fingerprint): neither the explorateur nor the questionneur works on it again. A package the
//   repository does not hold is refused, exit 2.
// - `--arreter` stops the circuit on the supervisor's word, as a pipeline cancelled: a circuit
//   running on the ticket (the state's `processus`, alive) stops, SIGTERM then SIGKILL, and so does
//   the session it led (`seance`); the state keeps its step, its stop « arrete », its question
//   lifted, its motive (`--contexte`) as its report, said at the ticket (`Circuit · arret : le
//   superviseur arrête le circuit : <motif>`), exit 0. Without a state, the call is refused.
// - On a stop other than 0, the circuit applies its gesture when one settles it (`a-repasser`:
//   it ends at 75), the gesture written at the ticket and in the log; every other stop goes up to
//   the supervisor (`monter`): its question (MONTEES of scripts/etapes.mjs, or the agent's own
//   question), its fact (the first line of its motive or its report), its piece (the write out of
//   the plan, the reds with their file and line, the sheet of the agent, or the command and the end
//   of the log) and who must answer it, kept in the state (`question`) and written at the ticket
//   (`Circuit · question : <arrêt> à <étape> — <fait> — au <qui> : <question>`).
// - At each step, a short comment at the ticket: `Circuit · <étape> : <résumé>`. A proof writes
//   there its reds and what refuses it; its whole report, the justified greens with their reasons,
//   goes to `.claude/worktrees/<ticket>.preuve-<n>.md`, which the comment names.
// - The commands of the circuit (the proof, the checks, the integration) are added to the log of
//   the ticket, `.claude/worktrees/<ticket>.log`, next to the sessions, each under its header line.
// - Each step the circuit leads itself, with no agent (the proof, the checks and the final pass,
//   the integration, the queue), writes at its end, whatever its outcome, a line to the register
//   of finished agents (scripts/registre.mjs, `ligneDEtape`): the role `circuit`, the ticket, the
//   step, its start and end, its working time, no tokens. The board counts it, and the step under
//   way (`mene` in the state), in the ticket's working time.
// - At each of its ends (« integre », 75, or a question for the supervisor), the circuit writes the
//   ticket's bilan (scripts/bilan.mjs): its figures by step and by role, measured on the register,
//   its results and its state, kept in `.claude/worktrees/<ticket>.bilan.json` and written at the
//   ticket in one short comment, `Circuit · bilan : …`, compared with the bilan before it in the
//   project.
// - Exit codes: 0 at « integre »; 2 a malformed call; a stop, by its name (ARRETS):
//   10 lancement (lancer.sh stopped before the session), 11 bloqué (a motionless transcript),
//   12 sans-fiche (twice no sheet that conforms), 13 preuve (the third proof fails), 14 controles
//   (the third developpeur of the checks or of the final pass leaves a red check, a red of the
//   final pass out of the plan or that no package of the plan holds, or reds to settle),
//   15 sans-livraison (a developpeur session that changes no file of the plan, its checks red; the
//   first session of a `--reprendre` whose plan already holds changes goes on to the checks; a
//   second developpeur session that `--depuis developpeur` launched on the lot the integration
//   refused and that changes nothing; or
//   the developpeur's same sending to the testwriter twice in a row, on the same red output of the
//   checks, no green checks between them), 16 relecture-arret (a finding without a valid agent, one on a criterion, the third
//   RENDU), 17 integration (the integration script refuses the lot, or the queue reopens the
//   ticket), 19 hors-portee (a testwriter or developpeur whose sheet says BLOQUÉ, without a
//   sending to the testwriter, or a developpeur's FAIT with criteria out of the plan), 20 besoin (a testwriter or developpeur whose sheet says BESOIN, a
//   reviewer whose sheet carries a `question`, or a ticket labelled `arbitrage` whose arbitrage
//   `refusArbitrage` of scripts/integration/integrer.mjs refuses, at the launch or a resumption,
//   before any session), 22 questionnement (questions of the plan left open
//   after the explorateur's answer), 23 references (a regeneration of 4.2 that changes a file
//   no reference writes, or whose command fails), 24 hors-plan (a testwriter or developpeur session its lock
//   stops on a write out of the plan, `<ticket>.hors-plan` that lancer.sh writes), each a question
//   for the supervisor; 75 a-repasser (a check or the integration still at 75 once played again,
//   or the branch still in the queue), the gesture `a-repasser`.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
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
import { DEPUIS_LE_VERT } from './dernier-vert.mjs';
import { elementsDuLot } from './elements-du-lot.mjs';
import { commandesPermises, optionsDuRole } from './droits.mjs';
import { ecrireLaListe, VARIABLE as VARIABLE_ENVELOPPE } from './enveloppe/paquets-du-plan.mjs';
import {
  AGENTS_DU_LOT,
  ARRETS,
  AUTO,
  boucle,
  bouclesDe,
  etapeDuCircuit,
  EXPLORATEUR,
  gesteDe,
  libelle,
  monteeDe,
  nomDuRole,
  QUESTIONNEUR,
  RESPONSABLE,
  SUITE,
} from './etapes.mjs';
import { paquets } from './paquets.mjs';
import { releve } from './composants-affectes.mjs';
import { ecrire as ecrireAuRegistre, ligneDEtape, transcriptionsDeLaCopie } from './registre.mjs';
import { FICHIER as DETTE } from './dette.mjs';
import {
  A_ELAGUER,
  bloquantsDeLaFiche,
  conformiteDuLot,
  conformiteDuTri,
  lireFiche,
  lireSarif,
  regleDeLaLigne,
  reponsesAuxConstats,
  reponsesAuxQuestions,
  RESULTATS,
  schemaDeFiche,
  VERDICTS_DU_TRI,
  VERDICTS_ROUVERTS,
} from './resultats.mjs';
import { AUTEUR_DE_LA_FILE, INTEGRE } from './integration/file.mjs';
import { dossierCommun, lireEntrees } from './integration/file-attente.mjs';
import { couvertPar, refusArbitrage } from './integration/integrer.mjs';
import { AUTEUR_DU_VERDICT } from './integration/verdict.mjs';
import { attendreUnPeu } from './verrou-de-fichier.mjs';
import { AttenteDeLaMachine, avecLaMachine } from './verrou-de-machine.mjs';
import { garderLeTotal, ouvrirAvancement } from './avancement.mjs';
import { AVANCEMENT } from './mesure/avancement.mjs';
import { nomsDesGardes } from './gardes-du-cadre.mjs';
import { langageDe } from './langages.mjs';
import { A_REPASSER } from './mesure/pression.mjs';
import { departDe, leMemeVivant, ouvrirBase, vivant } from './mesure/base-de-passe.mjs';
import { GREFFON } from './cadre.mjs';
import { executerEnDemon } from './demon.mjs';

// The time a session's transcripts may stand still before the circuit stops it.
export const IMMOBILE_MS = 20 * 60 * 1000;
// The exit code of each stop, from the list of the steps and stops.
export { ARRETS };
const CODE_USAGE = 2;
// The start of this process (departDe), which the state writes beside its number: a number alone
// may name another process once reused.
const DEPART = departDe(process.pid);
// The bounded loops, each declared with its step (scripts/etapes.mjs, `boucles`): the testwriter is
// relaunched twice at most after a failed proof (three sessions); the developpeur has three
// sessions, the last on the strong model; the third RENDU of one ticket stops the circuit.
const RELANCES_TESTWRITER = boucle('tests').max - 1;
const SEANCES_DEVELOPPEUR = boucle('code').max;
const RELECTURES = boucle('relecture').max;
// The steps of the circuit's state, read from the list of the steps.
const etatDe = n => SUITE.find(e => e.numero === n).etat;
const [TESTS, PREUVE, CODE, CONTROLES, REFERENCES, RELECTURE, INTEGRATION, EN_FILE, TRI] = [
  '2',
  '2.1',
  '3',
  '3.1',
  '4.2',
  '4.3',
  '5.1',
  '5.2',
  '5.3',
].map(etatDe);
// The variable in which bd reads the author of a comment (`bd --help`: « default: $BEADS_ACTOR,
// git user.name, $USER »), each session's its role; the author of the circuit's own lines.
const ACTEUR = 'BEADS_ACTOR';
const AUTEUR_DU_CIRCUIT = 'circuit';
// The sessions out of the envelope (the reviewer on Opus, the explorateur and the questionneur on
// Sonnet), each in the
// ticket's copy, the main tree once the integration removed it, under the rights and the context
// of its role (scripts/droits.mjs: the commands its skill names, the refusal of a change of its
// author at the ticket), without a prompt: any call its rights do not permit is refused.
const horsDeLEnveloppe = (ctx, role, modele) => [
  '--model',
  modele,
  '--permission-mode',
  'dontAsk',
  ...optionsDuRole(role, {
    racine: ctx.racine,
    copie: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    ticket: ctx.ticket,
  }),
];
const FORT = ['--modele', 'opus', '--effort', 'high'];
const PREFIXE = 'Circuit · ';
const TICKET_SH = path.join(import.meta.dirname, 'ticket.sh');
// The steps the circuit leads itself, with no agent: each one counts in the ticket's working time.
const MENEES = new Set(SUITE.filter(e => e.qui.includes(AUTO) && e.etat).map(e => e.etat));

const ici = import.meta.dirname;
const LANCEUR = path.join(ici, 'enveloppe', 'lancer.sh');
const INTEGRER = path.join(ici, 'integration', 'integrer.mjs');
const FILE = path.join(ici, 'integration', 'file.mjs');
const REGISTRE = path.join(ici, 'registre.mjs');
// A generator of the frame, beside this script, as the command of a reference.
const generateur = (script, ...args) =>
  [`node ${JSON.stringify(path.join(ici, script))}`, ...args].join(' ');
// The references of the circuit that no project declares (4.2), as Bazel's genrules: the files the
// module of the project's language generates (`fichiersEngendres`, scripts/jointure.d.ts), each
// judged by a guard of the frame and written again by its generator, whose
// code the circuit does not read (a real failure aside): what it writes, then the pass that
// follows, judge it; and the known debt of the guards, lowered from the notes of the final pass (`dette.mjs --abaisser`,
// `abaisser`: its command names the file of those notes). Each `{ nom, commande, fichiers, lit,
// gardes }`, `lit` the files of the copy it reads that another reference writes (as the
// prerequisites of a rule of make: the index reads the interfaces, whose generated part the API
// reports write), `gardes` the names the findings its regeneration lifts carry (their guard or
// their rule), `entiers` the files of `fichiers` its command writes in full, which the integration
// does not apply from the lot but regenerates on main of the moment
// (scripts/integration/integrer.mjs), as the module says of each of its own; not the debt, which
// reads the notes of a pass.
const referencesDuCadre = racine => [
  ...langageDe(racine)
    .fichiersEngendres(racine)
    .map(({ verifier, ...reference }) => reference),
  {
    nom: 'la dette des gardes',
    commande: generateur('dette.mjs', '--abaisser', '<notes>'),
    fichiers: [DETTE],
    lit: [],
    gardes: [],
    entiers: [],
    abaisser: true,
  },
];
// The templates of the instructions, in the skill of the supervisor, which the frame's plugin
// carries, read at the plugin's root (scripts/cadre.mjs).
const GABARIT = path.join(GREFFON, 'skills', 'pitmaster', 'references', 'consigne-agent.md');

// A stop of the circuit: its name (a key of ARRETS) and its report; for a stop of the checks, its
// reds read in the structured results (`{ paquet, texte, detail }`) and its motive, the report
// without their list; the outcome of the step it stops, when it has one (a proof's, the checks'
// with their reds), which the bilan reads; and what its montée carries beyond the question of its kind (scripts/etapes.mjs,
// MONTEES): its `piece` (file:line, or command and output), its own `question`, and who must
// answer it (`qui`, the owner for the reviewer's question).
class Arret extends Error {
  constructor(
    nom,
    rapport,
    {
      rouges = null,
      motif = null,
      resultat = null,
      piece = null,
      question = null,
      qui = null,
      etape = null,
    } = {}
  ) {
    super(nom);
    this.nom = nom;
    this.rapport = rapport;
    this.rouges = rouges;
    this.motif = motif;
    this.resultat = resultat;
    this.piece = piece;
    this.question = question;
    this.qui = qui;
    // The step the stop stands at, when it is not the step that throws it.
    this.etape = etape;
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
  const o = {
    ticket: null,
    reprendre: false,
    contexte: null,
    depuis: null,
    etendre: null,
    arreter: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reprendre') o.reprendre = true;
    else if (a === '--arreter') o.arreter = true;
    else if (a === '--etendre') {
      const liste = String(argv[i + 1] ?? '')
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      if (!liste.length || argv[i + 1].startsWith('-'))
        throw new Usage('--etendre attend les paquets que le plan gagne.');
      o.etendre = liste;
      i++;
    } else if (a === '--depuis') {
      // The step the run starts from, for the whole ticket: the testwriter's or the developpeur's.
      const etape = argv[i + 1];
      if (!AGENTS_DU_LOT.includes(etape))
        throw new Usage(`--depuis attend une étape du ticket : ${AGENTS_DU_LOT.join(' ou ')}.`);
      o.depuis = etape;
      i++;
    } else if (a === '--contexte') {
      if (i + 1 >= argv.length) throw new Usage('--contexte attend son texte.');
      o.contexte = argv[++i];
    } else if (a.startsWith('-')) throw new Usage(`option inconnue : ${a}`);
    else if (o.ticket) throw new Usage(`un seul ticket : ${o.ticket}, puis ${a}.`);
    else o.ticket = a;
  }
  if (!o.ticket) throw new Usage('le ticket manque.');
  if (o.depuis && o.reprendre) throw new Usage('--depuis et --reprendre ne vont pas ensemble.');
  if (o.etendre && (o.reprendre || o.depuis || o.arreter))
    throw new Usage(
      '--etendre va seule, avec son --contexte : le circuit reprend sur le plan étendu.'
    );
  if (o.arreter && (o.reprendre || o.depuis))
    throw new Usage('--arreter va seule, son motif en --contexte.');
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

// The context of one run: the paths of the ticket, its plan, how the circuit speaks to bd.
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
  // The subject of the title <titre>, « numéro — sujet — composants », and the packages of its
  // plan, its components, each a directory of the repository; or a Usage.
  const duTitre = titre => {
    const parts = String(titre ?? '').split(' — ');
    if (parts.length < 2) throw new Usage(`le titre de ${o.ticket} ne nomme pas ses composants.`);
    return {
      sujet: parts.length > 2 ? parts.slice(1, -1).join(' — ') : parts[0],
      plan: parts
        .at(-1)
        .split(',')
        .map(c => c.trim())
        .filter(Boolean)
        .map(resoudre),
    };
  };
  const { sujet, plan } = duTitre(t?.title);
  // The working directory of the circuit is the ticket's, `<copie>.travail` beside its copy: what
  // the circuit hands its sessions (their instructions, results and errors, the reviewer's
  // statements, the integration's patches and message), which a session out of the envelope reads
  // even when its circuit is killed. As the workspace of a pipeline (Jenkins, GitLab), it lives as
  // long as the ticket: no sweep touches it, a circuit relaunched takes it up again, numbering its
  // files after those it finds, and the queue removes it at the ticket's closure, or the removal of
  // the copy of a ticket closed without integration (scripts/retirer-copie.sh). The results and
  // the progress of the circuit's passes live in the base of its run
  // (scripts/mesure/base-de-passe.mjs), removed at its end, swept when the run is killed.
  const tmp = `${copie}.travail`;
  mkdirSync(tmp, { recursive: true });
  const numero = Math.max(
    0,
    ...readdirSync(tmp).map(n => Number(/-(\d+)(?:\.[a-z]+)?$/.exec(n)?.[1] ?? 0))
  );
  const baseDuRun = ouvrirBase('circuit');
  return {
    ...o,
    racine,
    copie,
    bd,
    bdSous,
    resoudre,
    duTitre,
    type: String(t.issue_type ?? ''),
    sujet,
    // The packages of the plan, the components of the title, which every session writes.
    paquets: plan,
    etat: `${copie}.circuit.json`,
    journal: `${copie}.log`,
    fin: `${copie}.fin`,
    resultat: `${copie}.resultat.json`,
    horsPlan: `${copie}.hors-plan`,
    fiches: `${copie}.fiches.jsonl`,
    transcriptions: transcriptionsDeLaCopie(copie, os.homedir()),
    immobileMs: Number(process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS) || IMMOBILE_MS,
    base: baseDuRun,
    tmp,
    numero,
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

// The ticket's description (its criteria), notes, title and labels as Beads holds them at this
// moment, read at the launch of each session: `{ description, notes, titre, labels }`; a failed
// read throws.
function leTicket(ctx) {
  const r = ctx.bd('show', ctx.ticket, '--json');
  if (r.status !== 0) {
    throw new Error(
      `ticket ${ctx.ticket} illisible : ${r.error?.message ?? r.stderr ?? ''}`.trim()
    );
  }
  const t = JSON.parse(r.stdout || '[]')[0] ?? {};
  return {
    description: String(t.description ?? ''),
    notes: String(t.notes ?? ''),
    titre: String(t.title ?? ''),
    labels: Array.isArray(t.labels) ? t.labels.map(String) : [],
  };
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
// (`<ticket>.fiches.jsonl`, beside the copy): `{ date, role, fiche }` for the sheet of a session,
// `{ date, role: 'circuit', etape, rapport }` for the report of a proof or of checks, which the
// reviewer receives.
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

// The sheets of <role>, in their order.
const fichesDe = (ctx, role) =>
  lesFiches(ctx)
    .filter(e => e.role === role)
    .map(e => e.fiche);

// The step of the circuit's state <etat> in words, « 3 Code » (scripts/etapes.mjs), or its
// `etape` when the list holds none.
const ouDansLeCircuit = etat => {
  const e = etapeDuCircuit(etat);
  return e ? libelle(e) : etat.etape;
};

// One line of the circuit's history at the ticket: `Circuit · <étape> : <texte>`.
function commenter(ctx, etape, texte) {
  const r = ctx.bd('comments', 'add', ctx.ticket, `${PREFIXE}${etape} : ${texte}`);
  if (r.status !== 0) process.stderr.write(`⚠️  commentaire non écrit au ticket : ${r.stderr}\n`);
}

// The report of a proof or of checks: its line at the ticket, and its report kept for the
// reviewer, <rapport> when the comment carries only its summary, beside its outcome <resultat>,
// which the bilan reads (scripts/bilan.mjs): for a proof `{ ok, rouges, justifies, sans, casses,
// anciens, vide }`, for checks `{ issue, finale, rouges }`.
function ecrireRapport(ctx, etape, texte, resultat, rapport = texte) {
  commenter(ctx, etape, texte);
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    etape,
    resultat,
    rapport: `${PREFIXE}${etape} : ${rapport}`,
  });
}

// The state of the run, written whole (`seance` and `question` null and `finale` false unless <etat>
// sets them, `processus`, `paquets`, `constats`, `verifie`, `reprise`, `aRegenerer`, `refus` and
// `controlesRouges` the run's), kept as the run's current state.
function ecrireEtat(ctx, etat) {
  ctx.courant = {
    finale: false,
    seance: null,
    question: null,
    questionnement: null,
    mene: null,
    avancement: null,
    ...etat,
    processus: process.pid,
    depart: DEPART,
    paquets: ctx.paquets,
    constats: ctx.constats ?? [],
    verifie: ctx.verifie ?? null,
    reprise: ctx.reprise ?? null,
    aRegenerer: ctx.aRegenerer ?? null,
    refus: ctx.refus ?? null,
    controlesRouges: ctx.controlesRouges ?? null,
  };
  const provisoire = `${ctx.etat}.${process.pid}`;
  writeFileSync(
    provisoire,
    `${JSON.stringify({ ...ctx.courant, journal: ctx.journal }, null, 2)}\n`
  );
  renameSync(provisoire, ctx.etat);
}

// The register's line of the step <etape> the circuit led itself from <debut> (an ISO date) to
// now; a register it cannot write leaves the circuit going.
function inscrireEtape(ctx, { etape, debut }) {
  try {
    ecrireAuRegistre(
      ligneDEtape({
        projet: ctx.racine,
        ticket: ctx.ticket,
        etape,
        debut,
        fin: new Date().toISOString(),
      })
    );
  } catch (e) {
    process.stderr.write(`⚠️  étape ${etape} non écrite au registre : ${e.message}\n`);
  }
}

// The time <d> in local time with its offset, to the second, as ISO 8601 writes it and as the
// envelope dates the header of a session (`date -Iseconds`): « 2026-10-25T12:42:11+01:00 ».
function heureLocale(d = new Date()) {
  const deux = n => String(n).padStart(2, '0');
  const decalage = -d.getTimezoneOffset();
  const a = Math.abs(decalage);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}${decalage < 0 ? '-' : '+'}${deux(Math.floor(a / 60))}:${deux(a % 60)}`;
}

// The header line of a step or a session in the ticket's log, in local time, as the envelope
// dates a session's.
const entete = (ctx, etape) =>
  appendFileSync(ctx.journal, `=== ${heureLocale()} · circuit · ${etape} ===\n`);

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
// session runs with the author of its role (BEADS_ACTOR). A session in the envelope, on the whole
// ticket (`.` its component, the plan its `--paquets`), opens under the id <ouvre> (lancer.sh
// --seance), or resumes the session <reprend> (lancer.sh --reprise); its result is the file
// lancer.sh writes (`<ticket>.resultat.json`).
// A session <horsEnveloppe> (the explorateur's, the questionneur's, the reviewer's) is claude
// itself, in the ticket's
// copy (the main tree once the copy is gone), under <droits> (`horsDeLEnveloppe`), the
// schema of its role's sheet and the options <session> names (its id, or the session it
// resumes), its instruction on its standard input and its result on its standard output, added
// to the log under its header line, then its line written to the register, as lancer.sh does.
// Its launch is kept with the circuit's results (`lancement`: its role, its session id, and the
// <objet> of a session that is not its role's own work, `tri`), which the bilan reads to count the
// sessions the circuit launched (scripts/bilan.mjs). Its sheet is the schema <fiche>, by default
// its role's.
function lancer(
  ctx,
  role,
  consigne,
  { fort, horsEnveloppe, droits = [], session = [], ouvre, reprend, fiche: sorte, objet } = {}
) {
  rmSync(ctx.fin, { force: true });
  rmSync(ctx.resultat, { force: true });
  rmSync(ctx.horsPlan, { force: true });
  const id = ouvre ?? reprend ?? session[1] ?? null;
  if (id) {
    inscrire(ctx, {
      role: AUTEUR_DU_CIRCUIT,
      lancement: { role, seance: id, ...(objet ? { objet } : {}) },
    });
  }
  const fichier = path.join(ctx.tmp, `consigne-${++ctx.numero}.md`);
  writeFileSync(fichier, consigne);
  // A file, not a pipe: a session whose circuit is dead writes its errors without breaking.
  const erreurs = path.join(ctx.tmp, `erreurs-${ctx.numero}.txt`);
  let commande;
  let fds;
  // The result of a session out of the envelope.
  const reponse = path.join(ctx.tmp, `reponse-${ctx.numero}.json`);
  if (horsEnveloppe) {
    entete(ctx, role);
    fds = [openSync(fichier, 'r'), openSync(reponse, 'w'), openSync(ctx.journal, 'a')];
    const fiche = [
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schemaDeFiche(sorte ?? role)),
    ];
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
        // The plan of the session: the packages of the title, which it writes; its component the
        // whole copy, which it reads.
        '--paquets',
        ecrireLaListe(ctx.paquets),
        ctx.ticket,
        role,
        '.',
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
      env: { ...process.env, [ACTEUR]: role },
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
      let horsPlan = null;
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
        horsPlan = existsSync(ctx.horsPlan) ? lire(ctx.horsPlan).trim() : null;
      }
      resolve({
        code,
        seance,
        bloque,
        horsPlan,
        erreur: erreurDeLancement ?? lire(erreurs),
        sortie,
      });
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

// The template of the instruction at <rang> (0 the testwriter's and the developpeur's, 1 the
// reviewer's, 2 any session's on a sheet absent or out of its schema, 3 the testwriter's and the
// developpeur's on a resumption, 4 the questionneur's on the plan, 5 the explorateur's on the plan,
// 6 the explorateur's on the questions of the plan, 7 the explorateur's on the tri of the
// discoveries), filled with <valeurs>.
function consigne(valeurs, rang = 0) {
  const texte = readFileSync(GABARIT, 'utf8');
  const bloc = [...texte.matchAll(/```text\n([\s\S]*?)\n```/g)][rang];
  if (!bloc) throw new Error(`gabarit sans bloc de consigne n° ${rang + 1} : ${GABARIT}`);
  return `${bloc[1].replace(/\{\{(\w+)\}\}/g, (m, k) => (k in valeurs ? valeurs[k] : m))}\n`;
}

// One session of <role> on the whole ticket: its sheet. A relaunch on its step (<tentative> past
// 1) that is not the last (<derniere>) resumes the agent's session the circuit keeps
// (`ctx.reprise`, its author and id) with the short instruction (the fourth template); its sheet
// refused is asked again once of that same session, as of a fresh one (`jusquALaFiche`), so the
// question it carries goes up (BP 320.3.9); a resumption that ends in error (a code other than 0:
// the session not found) falls back on a fresh and whole session, under a new id, which the
// circuit keeps. A fresh session's instruction (the first
// template) carries the ticket's description and notes as they are at its launch, the packages of
// the plan, and the last handover of its author at the ticket. Every instruction, fresh or resumed,
// carries the findings of the reviewer still open for its role (`ctx.constats`), all of them,
// whatever the relaunch: a proof refused, red checks, a sending, a RENDU, a resumption of the
// supervisor; <change> says what changed on a resumption, when it is not the proof or the checks
// (the integration's refusal of the lot, `refus`); a developpeur's sheet FAIT answers each of his by its title (`reponsesAuxConstats`),
// refused without one, and the circuit keeps each answer with its finding (`avecLesReponses`).
// Throws an Arret for a launch that stops before its session, a motionless session, or
// a session that ends twice without a sheet that conforms.
async function seance(ctx, role, { tentative, rapport, fort, derniere, change }) {
  const nom = nomDuRole(role);
  const reprise = tentative > 1 && !derniere && ctx.reprise?.agent === role ? ctx.reprise : null;
  const constats = texteDesOuverts(ouverts(ctx, role));
  const plan = ctx.paquets.join(', ');
  // A developpeur's sheet answers each finding open for him, kept with its finding.
  const titres = role === 'developpeur' ? ouverts(ctx, role).map(c => c.titre) : [];
  const valider = f => reponsesAuxConstats(f, titres);
  const repondu = fiche => {
    if (fiche && titres.length) ctx.constats = avecLesReponses(ctx.constats, fiche);
    return fiche;
  };
  if (reprise) {
    const courte = {
      role: nom,
      ticket: ctx.ticket,
      sujet: ctx.sujet,
      paquets: plan,
      tentative,
      change:
        change ??
        (role === 'testwriter'
          ? 'la preuve du rouge, jouée après ta séance, refuse ton lot'
          : 'les contrôles, joués après ta séance, sont rouges'),
      rapport: rapport ?? 'aucun',
      constats,
    };
    const fiche = await jusquALaFiche(ctx, role, consigne(courte, 3), {
      fort,
      premiere: 'reprend',
      id: reprise.seance,
      repli: true,
      valider,
    });
    if (fiche) return repondu(fiche);
    commenter(
      ctx,
      role,
      `reprise de la séance ${reprise.seance} finie en erreur : séance neuve et entière.`
    );
  }
  const lots = testsDuLot(ctx);
  const { description, notes } = leTicket(ctx);
  // The last handover of this agent; for a developpeur without one yet, the testwriter's last.
  const passation =
    derniereDe(ctx, role) ?? (role === 'developpeur' ? derniereDe(ctx, 'testwriter') : null);
  const valeurs = {
    role: nom,
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    paquets: plan,
    reprise:
      tentative > 1 || ctx.reprendre || ctx.depuis || fichesDe(ctx, role).length
        ? "oui : une séance d'avant a travaillé ce ticket ; ta copie garde son travail, le rapport ci-dessous dit ce qui reste"
        : 'non',
    lots: lots.length
      ? `${role === 'developpeur' ? 'le lot de tests' : 'tes tests'}, déjà dans la copie : ${lots.join(', ')}`
      : 'aucun',
    contexte: contexteDe(ctx),
    description: description.trim() || 'aucune',
    // The section of the ticket's notes, absent without notes.
    notes: notes.trim()
      ? `\nLES NOTES DU TICKET, l'état qu'un agent d'avant y a écrit :\n\n${notes.trim()}\n`
      : '',
    rapport: rapport ?? 'aucun',
    constats,
    passation: passation?.text ?? 'aucune',
    references: lesReferences(ctx)
      .map(r => `- ${r.nom} : ${r.fichiers.map(f => `\`${f}\``).join(', ')}`)
      .join('\n'),
  };
  return repondu(await jusquALaFiche(ctx, role, consigne(valeurs), { fort, neuve: role, valider }));
}

// The findings <constats>, each finding of the developpeur that his sheet <fiche> answers (by its
// title) with its answer `{ etat, raison, piece }`, as a thread of a review keeps the author's
// reply under its comment.
function avecLesReponses(constats, fiche) {
  const parTitre = new Map((fiche.reponses ?? []).map(r => [r.titre, r]));
  return (constats ?? []).map(c => {
    const r = c.role === 'developpeur' ? parTitre.get(c.titre) : undefined;
    if (!r) return c;
    return {
      ...c,
      reponse: { etat: r.etat, ...(r.raison ? { raison: r.raison } : {}), piece: r.piece },
    };
  });
}

// The line CONTEXTE of a session: the text of `--contexte` of the run, which every session of the
// run receives; « aucun » without it.
const contexteDe = ctx => ctx.contexte || 'aucun';

// The launch <r> of a session of <role>, or the Arret it is: a session its lock stopped on a
// write out of the plan (« hors-plan », the write as its piece), a motionless session
// (« bloqué »), a launch that stops before its session (« lancement »).
function seanceLancee(ctx, role, r) {
  if (r.horsPlan) {
    throw new Arret(
      'hors-plan',
      `Le crochet de la séance du ${nomDuRole(role)} l'arrête sur une écriture hors du plan du ticket (ses paquets : ${ctx.paquets.join(', ')}) :\n\n${r.horsPlan}`,
      { piece: r.horsPlan }
    );
  }
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

// The session of <role> with the instruction <texte>, its sheet read in its result
// (scripts/resultats.mjs): the sheet, kept with the ticket's sheets, its discoveries filed. A
// session that ends without a sheet that conforms (none, one out of its schema, a code other than
// 0) is resumed once, the same session, with the short instruction that names what lacks (the
// third template). The session opens under the id <id> (a new one by default), or resumes it with
// <premiere> « reprend »; with <neuve> (the testwriter or the developpeur), the circuit keeps that
// id for that author (`ctx.reprise`); with <repli> (a resumption), a session that ends in error
// returns null, for a fresh session in its place. Throws an Arret for a launch that stops before its session,
// a motionless session, or twice no sheet that conforms (« sans-fiche »). <avec> joins its fields
// to the sheet's entry (the lot a review read); <valider>(sheet, attempt) names what makes a sheet
// out of conformity beyond its schema at that attempt (an unknown package of a plan, an answer
// without a line for a question put, a discovery without its verdict), or null. <fiche> names its
// sheet's schema when it is not its role's (`tri`), and <objet> its launch (`lancer`).
async function jusquALaFiche(ctx, role, texte, options = {}) {
  const {
    neuve,
    premiere = 'ouvre',
    id = randomUUID(),
    avec = {},
    valider = () => null,
    repli = false,
    ...reste
  } = options;
  if (neuve) ctx.reprise = { agent: neuve, seance: id };
  const ouvrir = mode =>
    reste.horsEnveloppe
      ? { session: [mode === 'ouvre' ? '--session-id' : '--resume', id] }
      : { [mode]: id };
  let lu = null;
  for (let essai = 1; essai <= 2; essai++) {
    const courte = () => consigne({ ticket: ctx.ticket, sujet: ctx.sujet, erreur: lu.erreur }, 2);
    const r = await lancer(ctx, role, essai === 1 ? texte : courte(), {
      ...reste,
      ...ouvrir(essai === 1 ? premiere : 'reprend'),
    });
    seanceLancee(ctx, role, r);
    if (repli && r.seance !== 0) return null;
    lu =
      r.seance === 0
        ? lireSaFiche(ctx, reste.fiche ?? role, r.sortie)
        : { erreur: `la séance finit en erreur (code ${r.seance})` };
    const faute = lu.fiche ? valider(lu.fiche, essai) : null;
    if (faute) lu = { erreur: `fiche non conforme : ${faute}` };
    if (lu.fiche) return garder(ctx, role, lu.fiche, avec);
    if (essai === 1) {
      commenter(ctx, role, `séance finie sans fiche conforme : ${lu.erreur} ; reprise une fois.`);
    }
  }
  throw new Arret(
    'sans-fiche',
    `Deux fois, la séance du ${nomDuRole(role)} finit sans fiche conforme : ${lu.erreur}. Le journal du ticket : ${ctx.journal}`
  );
}

// The sheet of schema <sorte> (a role's, or the tri's) in the output <sortie> of its session
// (`lireFiche`), each file piece of it checked in the ticket's copy, or in the main tree before the
// copy exists and once the integration removed it, and each piece of the ticket in its description.
const lireSaFiche = (ctx, sorte, sortie) =>
  lireFiche(sorte, sortie, {
    copie: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    ticket: leTicket(ctx).description,
  });

// The name of the package <dossier> as a title writes it: its package's name, or its path.
function nomDe(ctx, dossier) {
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  return liste.find(p => p.dossier === dossier)?.pkg.name ?? dossier;
}

// The sheet <fiche> of <role>, kept with the ticket's sheets, <avec> joined to its entry, each of
// its discoveries filed closed under the ticket (scripts/ticket.sh, label `decouverte`), its
// components the packages of the plan, and kept with the circuit's results (`decouverte`: its id
// and its subject), which the tri reads; returns it.
function garder(ctx, role, fiche, avec = {}) {
  inscrire(ctx, { role, fiche, ...avec });
  const composants = ctx.paquets.map(c => nomDe(ctx, c)).join(', ');
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
    const id = r.status === 0 ? r.stdout.trim().split('\n').at(-1) : '';
    if (id) inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, decouverte: { id, sujet: d.sujet } });
    else process.stderr.write(`⚠️  découverte « ${d.sujet} » non consignée : ${r.stderr}\n`);
  }
  return fiche;
}

// The discoveries the sheets of the ticket filed, `{ id, sujet }`, in their order.
const decouvertesDuTicket = ctx =>
  lesFiches(ctx)
    .filter(e => e.role === AUTEUR_DU_CIRCUIT && e.decouverte)
    .map(e => e.decouverte);

const lire = f => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// The circuit's reports since the reviewer's last sheet: those of its proofs and checks (the final
// pass among them), as it wrote them at the ticket.
function rapportsDuCircuit(ctx) {
  const tous = lesFiches(ctx);
  const depuis = tous.findLastIndex(e => e.role === 'relecteur') + 1;
  return tous
    .slice(depuis)
    .filter(e => e.role === AUTEUR_DU_CIRCUIT && e.rapport)
    .map(e => e.rapport);
}

// The files of the lot, as the copy holds them against its HEAD: `{ tests, code }`, the
// testwriter's files (`estUnTest`: test files and the shared test material) and the others.
function fichiersDuLot(ctx) {
  const tests = [];
  const code = [];
  for (const { fichier } of changements(ctx)) {
    (duTestwriter(ctx, fichier) ? tests : code).push(fichier);
  }
  return { tests: tests.sort(), code: code.sort() };
}

// The blocking findings of a reviewer's sheet <fiche>, the ones that send the lot back: its
// blocking findings and each element it judges not conforming (scripts/resultats.mjs).
const bloquants = bloquantsDeLaFiche;

// The blocking findings <constats>, each under its heading, the criterion or rule it holds, its
// recipient (or the criterion in question), its body and its piece (an element judged not
// conforming carries it in its body), then the developpeur's answer to it, when he gave one: lines.
const lignesDesConstats = constats =>
  constats.flatMap((c, i) => [
    `### Constat ${i + 1} — ${c.titre}`,
    `Bloquant : ${c.regle}`,
    c.critere_en_cause ? `Critère en cause : ${c.critere_en_cause}` : `Agent : ${c.role ?? '?'}`,
    c.corps,
    ...(c.piece ? [`Pièce : ${c.piece}`] : []),
    ...(c.reponse
      ? [
          `Réponse du développeur : ${c.reponse.etat}${c.reponse.raison ? ` — ${c.reponse.raison}` : ''}`,
          `Pièce de la réponse : ${c.reponse.piece}`,
        ]
      : []),
    '',
  ]);

// The verdict the reviewer's sheet <fiche> carries, as the circuit writes it at the ticket for the
// human, its first word ACCEPTÉ or RENDU: after a bounded review, each finding before it lifted or
// not, with its proof; each blocking finding under its heading, what it holds, its recipient (or
// the criterion in question) and its body (an element judged not conforming among them); then the
// conformity of each element of the lot, its rule and its piece, the remarks (its findings of
// `genre` remarque), the question for the owner and the deviations to name at the commit.
export function texteDuVerdict(fiche) {
  const section = (titre, l) => (l?.length ? [`## ${titre}`, '', ...l.map(x => `- ${x}`), ''] : []);
  const suivi = (fiche.suivi ?? []).map(
    x => `${x.titre} : ${x.etat}${x.preuve ? ` — ${x.preuve}` : ''}`
  );
  return [
    fiche.verdict,
    '',
    ...section("Constats d'avant", suivi),
    ...lignesDesConstats(bloquants(fiche)),
    ...section(
      'Conformité',
      (fiche.conformite ?? []).map(
        l => `${l.element} : ${l.conforme} — ${regleDeLaLigne(l)} — ${l.piece}`
      )
    ),
    ...section(
      'Remarques',
      (fiche.constats ?? [])
        .filter(c => c.genre === 'remarque')
        .map(c => `${c.titre} — ${c.corps} (${c.piece})`)
    ),
    ...section(
      'Question au responsable',
      fiche.question ? [`${fiche.question} (${fiche.piece})`] : []
    ),
    ...section(
      'Écarts à nommer au commit',
      fiche.ecarts?.map(e => `${e.sujet} : ${e.texte}`)
    ),
  ]
    .join('\n')
    .trim();
}

// The review of the lot, the reviewer's session out of the envelope, from the second template:
// `{ verdict, fiche, texte, arbre }`, its sheet, the verdict the circuit writes at the ticket from
// it, under the reviewer's author, and the tree of the lot it read. The lot it reads is kept as a
// patch set (`garderLeLot`), on the lot the review before read, joined to its sheet's entry (`lot:
// { commit, arbre, fichiers }`); after a review sent back, the review reads the difference
// between the two and the findings before it (the bounded review), as Gerrit has the next review
// read the difference between two patch sets: the files of the lot that changed since, the
// command of the difference, the findings still open with their recipients.
async function relire(ctx) {
  const { tests, code } = fichiersDuLot(ctx);
  const rapports = rapportsDuCircuit(ctx);
  const precedents = fichesDe(ctx, 'relecteur').length;
  const avant = relectureDAvant(ctx);
  const lot = garderLeLot(ctx, avant?.lot.commit);
  let lus = { tests, code };
  let precedente = 'aucune : tu relis le lot entier';
  if (avant && lot) {
    const dansLeLot = new Set([...tests, ...code, ...(avant.lot.fichiers ?? [])]);
    const changes = differenceDesLots(ctx, avant.lot.commit, lot.commit).filter(f =>
      dansLeLot.has(f)
    );
    lus = {
      tests: changes.filter(f => duTestwriter(ctx, f)),
      code: changes.filter(f => !duTestwriter(ctx, f)),
    };
    precedente = [
      `la relecture ${precedents}, ${avant.fiche.verdict} : tu relis la différence du lot depuis elle et ses constats, selon ta compétence (« La relecture bornée »).`,
      '',
      `- La différence : \`git diff ${avant.lot.commit} ${lot.commit}\`, dans la copie du ticket ; ses fichiers : ${changes.join(', ') || 'aucun'}.`,
      '- Les constats bloquants qui restent ouverts, chacun avec son destinataire :',
      '',
      ...lignesDesConstats(ctx.constats ?? []),
    ]
      .join('\n')
      .trim();
  }
  const affirmations = path.join(ctx.tmp, 'affirmations.md');
  writeFileSync(affirmations, leTicket(ctx).description);
  const liste = lot
    ? elementsDuLot(ctx.copie, { avant: 'HEAD', apres: lot.commit })
    : { etat: 'impossible', raison: 'le lot n’a pas pu être gardé', elements: [] };
  // A bounded review: the lines of the review before, and the elements the difference touches
  // (every one when it cannot be computed), as a review unticks « viewed » on the files changed
  // since.
  const touches =
    avant && lot && elementsDuLot(ctx.copie, { avant: avant.lot.commit, apres: lot.commit });
  const bornee = touches
    ? {
        touches: touches.etat === 'fait' ? new Set(touches.elements.map(e => e.id)) : null,
        lignes: new Map((avant.fiche.conformite ?? []).map(l => [l.element, l])),
      }
    : null;
  const valeurs = {
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    paquets: ctx.paquets.join(', '),
    reprise: precedents
      ? `oui : ${precedents} relecture(s) d'avant ont rendu le lot, et le lot a repassé le circuit depuis`
      : 'non',
    lots: [
      ...(avant && lot ? ["ce que le lot change depuis la relecture d'avant"] : []),
      `le lot de tests : ${lus.tests.join(', ') || 'aucun fichier'}`,
      `le lot de code : ${lus.code.join(', ') || 'aucun fichier'}`,
    ].join(' ; '),
    precedente,
    affirmations,
    elements: texteDesElements(liste, bornee),
    rapports: rapports.join('\n\n') || 'aucun',
    // The supervisor's context of a resumption, his answer to a question of the reviewer among them.
    contexte: contexteDe(ctx),
  };
  const fiche = await jusquALaFiche(ctx, 'relecteur', consigne(valeurs, 1), {
    horsEnveloppe: true,
    droits: horsDeLEnveloppe(ctx, 'relecteur', 'opus'),
    avec: lot ? { lot: { ...lot, fichiers: [...tests, ...code] } } : {},
    valider: f => conformiteDuLot(f, liste),
  });
  const texte = texteDuVerdict(fiche);
  const r = ctx.bdSous(AUTEUR_DU_VERDICT, 'comments', 'add', ctx.ticket, texte);
  if (r.status !== 0) process.stderr.write(`⚠️  verdict non écrit au ticket : ${r.stderr}\n`);
  return { verdict: fiche.verdict, fiche, texte, arbre: lot?.arbre ?? null };
}

// The elements of the lot <liste> (scripts/elements-du-lot.mjs) as the reviewer's instruction
// lists them: one line each, its id, its kind, its status, its export, its package and its place;
// in a bounded review (<bornee>: `{ touches, lignes }`, the ids the difference touches, null for
// every one, and the lines of the review before by element), each marked to judge again, or to
// take up with its line before; then the changed sources the language service does not read,
// whose elements he surveys himself, one line of conformity each as `<fichier>#<nom>`, and why.
function texteDesElements(liste, bornee = null) {
  if (liste.etat !== 'fait') {
    return `aucun : la liste n'a pas pu être calculée (${liste.raison}) ; tu relèves toi-même chaque élément du lot.`;
  }
  const marque = e => {
    if (!bornee) return '';
    const ligne = bornee.lignes.get(e.id);
    if (bornee.touches && !bornee.touches.has(e.id) && ligne) {
      return ` — reprise, la différence ne le touche pas : ${ligne.conforme} — ${regleDeLaLigne(ligne)} — ${ligne.piece}`;
    }
    return ligne ? ' — à rejuger : la différence le touche' : " — à rejuger : aucune ligne d'avant";
  };
  const lignes = liste.elements.map(
    e =>
      `- \`${e.id}\` : ${e.genre}, ${e.statut}, ${e.exporte ? 'exporté' : 'non exporté'}, paquet ${e.paquet}, ${e.fichier}:${e.ligne}${marque(e)}`
  );
  if (liste.horsDuService.length) {
    const pourquoi = liste.service
      ? `le service de langage n'a pas pu tourner : ${liste.service}`
      : 'aucun tsconfig.json ne les lit';
    lignes.push(
      `- Hors du service de langage (${pourquoi}), tu relèves toi-même leurs éléments, une ligne de conformité chacun, son élément \`<fichier>#<nom>\` : ${liste.horsDuService.join(', ')}.`
    );
  }
  return lignes.join('\n') || 'aucun : le lot ne change aucun élément du code.';
}

// The last review of the ticket and the lot it read: its sheet's entry (`{ fiche, lot: { commit,
// arbre, fichiers } }`), or null before any, without a copy, or when the repository no longer
// holds that lot.
function relectureDAvant(ctx) {
  const e = lesFiches(ctx).findLast(x => x.role === 'relecteur');
  if (!e?.lot?.commit || !existsSync(ctx.copie)) return null;
  const r = spawnSync('git', ['-C', ctx.copie, 'cat-file', '-e', `${e.lot.commit}^{commit}`]);
  return r.status === 0 ? e : null;
}

// The tree of the copy as it stands, the copy's HEAD and index untouched: its index copied to a
// file of the circuit's, every file of the copy added to that one (`git add -A`, the ignored files
// left out), written as a tree. Its id, or null when git fails.
function arbreDeLaCopie(ctx) {
  const index = path.join(ctx.tmp, `index-${++ctx.numero}`);
  const reel = spawnSync(
    'git',
    ['-C', ctx.copie, 'rev-parse', '--path-format=absolute', '--git-path', 'index'],
    { encoding: 'utf8' }
  ).stdout?.trim();
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const git = (...a) => spawnSync('git', ['-C', ctx.copie, ...a], { encoding: 'utf8', env });
  try {
    if (reel && existsSync(reel)) copyFileSync(reel, index);
    else if (git('read-tree', 'HEAD').status !== 0) return null;
    if (git('add', '-A').status !== 0) return null;
    const r = git('write-tree');
    return r.status === 0 ? r.stdout.trim() : null;
  } finally {
    rmSync(index, { force: true });
  }
}

// The lot of the copy kept as a commit on <parent> (the lot kept before, or HEAD), as Gerrit keeps
// each patch set of a change: `{ commit, arbre }`, or null when git fails. Turborepo compares two
// of them (`--filter=...[<avant>...<après>]`, the merge base of the range being the first), and
// the reviewer reads their difference.
function garderLeLot(ctx, parent) {
  const arbre = arbreDeLaCopie(ctx);
  if (!arbre) return null;
  const qui = { name: AUTEUR_DU_CIRCUIT, email: 'circuit@grillhouse.invalid' };
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'commit-tree', arbre, '-p', parent ?? 'HEAD', '-m', `lot de ${ctx.ticket}`],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: qui.name,
        GIT_AUTHOR_EMAIL: qui.email,
        GIT_COMMITTER_NAME: qui.name,
        GIT_COMMITTER_EMAIL: qui.email,
      },
    }
  );
  return r.status === 0 ? { commit: r.stdout.trim(), arbre } : null;
}

// The files that differ between the lots kept <avant> and <apres>, relative to the copy, sorted.
function differenceDesLots(ctx, avant, apres) {
  const r = spawnSync('git', ['-C', ctx.copie, 'diff', '--name-only', '-z', avant, apres], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout.split('\0').filter(Boolean).sort() : [];
}

// The final pass the lot calls for: `{ arbre, restreinte }`, the tree of the copy, and, after a
// review whose lot it no longer is the accepted one, the range Turborepo plays (`{ avant, apres }`:
// the lot that review read and the copy kept on it), null for the whole pass: before any review,
// or on the lot the last review accepted.
function laPasseFinale(ctx) {
  const avant = relectureDAvant(ctx);
  const arbre = arbreDeLaCopie(ctx);
  if (!avant || !arbre) return { arbre, restreinte: null };
  if (avant.fiche.verdict === 'ACCEPTÉ' && avant.lot.arbre === arbre) {
    return { arbre, restreinte: null };
  }
  const apres = garderLeLot(ctx, avant.lot.commit);
  return {
    arbre,
    restreinte: apres ? { avant: avant.lot.commit, apres: apres.commit } : null,
  };
}

// The references of the circuit: those the project declares in the package.json of the copy
// (`grillhouse.references`), each `{ nom, commande, fichiers, tests, lit, gardes }` with a name, a
// command and files, `tests`, `lit` and `gardes` arrays when given, empty when not, `entiers` empty;
// then the frame's (`referencesDuCadre`, `cadre`), each but one whose first file a reference of the
// project covers, which replaces it.
function lesReferences(ctx) {
  const l = lireJson(path.join(existsSync(ctx.copie) ? ctx.copie : ctx.racine, 'package.json'))
    ?.grillhouse?.references;
  const duProjet = (Array.isArray(l) ? l : [])
    .filter(
      r =>
        typeof r?.nom === 'string' &&
        typeof r.commande === 'string' &&
        Array.isArray(r.fichiers) &&
        r.fichiers.length > 0 &&
        (r.tests === undefined || Array.isArray(r.tests)) &&
        (r.lit === undefined || Array.isArray(r.lit)) &&
        (r.gardes === undefined || Array.isArray(r.gardes))
    )
    .map(r => ({
      ...r,
      tests: r.tests ?? [],
      lit: r.lit ?? [],
      gardes: r.gardes ?? [],
      entiers: [],
      cadre: false,
    }));
  const duCadre = referencesDuCadre(existsSync(ctx.copie) ? ctx.copie : ctx.racine)
    .filter(c => !duProjet.some(r => couvertPar(r.fichiers, c.fichiers[0])))
    .map(c => ({ ...c, tests: [], cadre: true }));
  return [...duProjet, ...duCadre];
}

// The references a red of <lieux> is one of (each `{ fichier, gardes, dansLePlan }`, its file, the
// names its finding carries, and whether a path of the plan holds it), however many other reds
// stand beside it, as `--update-snapshots` updates the snapshots that fail and leaves the other
// failures: a finding of one of their `gardes`, a file of their `tests`, or a file their
// `fichiers` cover, the frame's by their `gardes` alone; with <aElaguer> (a guard wrote a key of
// the debt inscribed above what it finds), the reference that covers the debt's file too. A
// finding of a guard of a reference of the project on a file of the plan its `fichiers` do not
// cover is no output it generates, but the code of the lot: the developpeur's (BPScript 320.10,
// a word of library in the code of 030-binder).
function referencesDesRouges(ctx, lieux, aElaguer = false) {
  const sien = (r, { fichier: f, gardes, dansLePlan: plan = false }) =>
    (gardes.some(g => r.gardes.includes(g)) &&
      (r.cadre || !f || !plan || couvertPar(r.fichiers, f))) ||
    (!r.cadre && Boolean(f) && (r.tests.includes(f) || couvertPar(r.fichiers, f)));
  return lesReferences(ctx).filter(
    r => lieux.some(l => sien(r, l)) || (aElaguer && couvertPar(r.fichiers, DETTE))
  );
}

// The regeneration of the references named <noms> (4.2), as make remakes a target and then the
// targets that depend on its outputs: the copy kept as a lot on the one the last review read (or
// HEAD), each command run on the whole copy, in their order; a reference that reads (`lit`) a file
// another one has just written runs after it, once for each reference whose writing calls for it;
// then the copy kept again on that lot. `{ texte, regenerees, fichiers, restreinte }`: the report,
// the names of the references changed, the files changed, and the range of the final pass that
// follows (null when nothing changed: no pass plays again, and the reds stand); with
// <avantLaPasse>, the regeneration the checks of the plan call for, the final pass that is due
// follows, whole or since the last review. A file a reference writes follows from the lot, as
// the output of a genrule, without a word of the plan, and the reviewer reads its difference; a
// file changed that none of the references run declares, or a command that fails (a reference of
// the project at another code than 0, one of the frame on a real failure alone) restores the copy
// as it was and stops at « references », each deviation in its question. With <refusAuLot>, the
// final pass that called for it carries reds of the plan: a command of the project that refuses
// (another code than 0, no real failure), its only deviation, judges the lot, as a ceiling that
// never rises refuses a lot beyond it; the copy restored, `{ refus }` gives the report of each
// refusal with the end of its output, for the developpeur (BPScript 320.10).
function regenerer(ctx, noms, notes = [], avantLaPasse = false, refusAuLot = false) {
  // The notes of the debt, in a file of the run, which the command that lowers it reads.
  const fichierDesNotes = path.join(ctx.base.dossier, 'dette-a-abaisser.json');
  const toutes = lesReferences(ctx).map(r =>
    r.abaisser
      ? { ...r, commande: generateur('dette.mjs', '--abaisser', JSON.stringify(fichierDesNotes)) }
      : r
  );
  const aJouer = toutes.filter(r => noms.includes(r.nom));
  if (aJouer.some(r => r.abaisser)) writeFileSync(fichierDesNotes, `${JSON.stringify(notes)}\n`);
  const avant = garderLeLot(ctx, relectureDAvant(ctx)?.lot.commit);
  if (!avant) {
    throw new Arret(
      'references',
      'Le circuit ne garde pas la copie avant la régénération des références (git échoue).'
    );
  }
  // The command of a reference of the frame is judged by what it writes, then by the pass that
  // follows, never by its code, which also judges the reds it leaves (`npm run api` refuses beside
  // them): a real failure alone counts; a reference of the project, by its code.
  const refs = [];
  const echecs = [];
  // The refusals of the commands of the project, each its line and the end of its output.
  const refus = [];
  const appelees = new Set();
  let arbre = avant.arbre;
  while (aJouer.length) {
    const r = aJouer.shift();
    const x = commandeDeReference(ctx, r.commande);
    if (!refs.includes(r)) refs.push(r);
    if (x.panne || (!r.cadre && x.code !== 0)) {
      const ligne = `- ${r.nom} : \`${r.commande}\` rend le code ${x.code}${x.panne ? ' (une panne)' : ''}.`;
      echecs.push(ligne);
      if (!x.panne) refus.push([ligne, '', fin(x.sortie.trimEnd(), 30)].join('\n'));
    }
    // The references that read a file this command wrote run after it.
    const suivant = arbreDeLaCopie(ctx);
    const ecrits = suivant ? differenceDesLots(ctx, arbre, suivant) : [];
    arbre = suivant ?? arbre;
    for (const s of toutes) {
      const appel = `${r.nom}\0${s.nom}`;
      if (s === r || appelees.has(appel) || !ecrits.some(f => couvertPar(s.lit, f))) continue;
      appelees.add(appel);
      if (!aJouer.includes(s)) aJouer.push(s);
    }
  }
  const apres = garderLeLot(ctx, avant.commit);
  const fichiers = apres ? differenceDesLots(ctx, avant.commit, apres.commit) : [];
  const siens = r => fichiers.filter(f => couvertPar(r.fichiers, f));
  const regenerees = refs.filter(r => siens(r).length);
  const horsDeclaration = fichiers.filter(f => !refs.some(r => couvertPar(r.fichiers, f)));
  const ecarts = [
    ...echecs,
    ...(!apres ? ['- Le circuit ne garde pas la copie après la régénération (git échoue).'] : []),
    ...horsDeclaration.map(f => `- ${f} change, et aucune référence régénérée ne l'écrit.`),
  ];
  if (ecarts.length) {
    restaurer(ctx, avant.commit, fichiers);
    if (refusAuLot && refus.length === ecarts.length) return { refus };
    const difference =
      apres && fichiers.length
        ? [
            `La différence, avant d'être rendue : \`git diff ${avant.commit} ${apres.commit}\`, dans la copie du ticket.`,
          ]
        : [];
    throw new Arret(
      'references',
      [
        `La régénération des références, sur la copie entière, s'arrête ; la copie est rendue telle qu'avant elle. Le superviseur fait corriger la référence ou le lot qui cause l'écart (\`--depuis developpeur\`), ou \`--reprendre\` une fois la cause levée.`,
        '',
        ...ecarts,
        '',
        ...difference,
        `Le journal du ticket : ${ctx.journal}`,
      ].join('\n'),
      {
        piece: [...ecarts, ...difference].join('\n'),
        question: `Les écarts de la régénération :\n${ecarts.join('\n')}`,
      }
    );
  }
  if (!fichiers.length) {
    return {
      texte: `La régénération (${refs.map(r => `${r.nom}, \`${r.commande}\``).join(' ; ')}) ne change aucun fichier : ${avantLaPasse ? 'la passe finale juge le lot tel quel' : 'aucune passe ne rejoue, et les rouges de la passe finale restent, chacun à son propriétaire'}.`,
      regenerees: [],
      fichiers,
      restreinte: null,
    };
  }
  return {
    texte: [
      `Les références régénérées sur la copie entière : ${regenerees.map(r => r.nom).join(', ')} ; le lot porte leurs fichiers, puis la passe finale${avantLaPasse ? '' : " restreinte à ce qu'elles changent"}.`,
      '',
      ...regenerees.map(r => `- ${r.nom} (\`${r.commande}\`) : ${siens(r).join(', ')}`),
      '',
      `La différence : \`git diff ${avant.commit} ${apres.commit}\`, dans la copie du ticket.`,
    ].join('\n'),
    regenerees: regenerees.map(r => r.nom),
    fichiers,
    restreinte: { avant: avant.commit, apres: apres.commit },
  };
}

// One command of a reference, run by the shell at the root of the copy, out of the envelope,
// under the lock of the machine, its output added to the log: `{ code, panne, sortie }`, its exit
// code, whether it failed for real, whatever it judges (the command not found or not executable,
// 126, 127, as the shell says it; killed by a signal, the shell's 128 + its number; or the lock of
// the machine not taken), and what it wrote to the log.
function commandeDeReference(ctx, commande) {
  entete(ctx, 'references');
  appendFileSync(ctx.journal, `$ ${commande}\n`);
  const debut = statSync(ctx.journal).size;
  const sortie = () => readFileSync(ctx.journal).subarray(debut).toString('utf8');
  const fd = openSync(ctx.journal, 'a');
  try {
    const r = avecLaMachine(
      env => spawnSync('sh', ['-c', commande], { cwd: ctx.copie, stdio: ['ignore', fd, fd], env }),
      { racine: ctx.copie, dire: l => appendFileSync(ctx.journal, `${l}\n`) }
    );
    const code = r.status ?? 1;
    return {
      code,
      panne:
        r.signal !== null || r.error !== undefined || code === 126 || code === 127 || code > 128,
      sortie: sortie(),
    };
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) throw e;
    appendFileSync(ctx.journal, `${e.message}\n`);
    return { code: e.code, panne: true, sortie: sortie() };
  } finally {
    closeSync(fd);
  }
}

// The files <fichiers> of the copy as the lot kept <commit> holds them, a file it does not hold
// removed; the copy's index untouched.
function restaurer(ctx, commit, fichiers) {
  for (const f of fichiers) {
    const tient = spawnSync('git', ['-C', ctx.copie, 'cat-file', '-e', `${commit}:${f}`]);
    if (tient.status === 0) {
      spawnSync('git', ['-C', ctx.copie, 'restore', `--source=${commit}`, '--worktree', '--', f]);
    } else {
      rmSync(path.join(ctx.copie, f), { force: true });
    }
  }
}

// The stop for the sheet <fiche> of the session <tentative> of <role>, BLOQUÉ (« hors-portee »)
// or BESOIN (« besoin »): its reason or question first, then its handover; the sheet's piece as
// its own, and the agent's question as its own.
function arretDuStatut(ctx, role, tentative, fiche) {
  const passation = derniereDe(ctx, role)?.text ?? 'aucune';
  const qui = `Le ${nomDuRole(role)}`;
  const { piece } = fiche;
  return fiche.statut === 'BESOIN'
    ? new Arret(
        'besoin',
        `${qui} attend une réponse (séance ${tentative}) : ${fiche.question}\n\nSa passation :\n\n${passation}`,
        { piece, question: `${qui} demande : ${fiche.question}` }
      )
    : new Arret(
        'hors-portee',
        `${qui} se déclare bloqué (séance ${tentative}) : ${fiche.raison}\n\nLe circuit ne le relance pas sur ce rouge. Sa passation :\n\n${passation}`,
        { piece }
      );
}

// The stop « hors-portee » for the developpeur's sheet FAIT <fiche> of the session <tentative>
// that does not hold criteria out of the plan (`hors_plan`), as a required check keeps a merge
// from a change that does not pass it: each criterion and its package in the fact and in the
// question, the answers `--etendre <paquet>` or the criterion amended and `--reprendre`; their
// pieces as its piece, the handover after them.
function arretHorsDuPlan(ctx, tentative, fiche) {
  const criteres = fiche.hors_plan.map(h => `critère ${h.critere} (${h.paquet})`).join(', ');
  const paquets = [...new Set(fiche.hors_plan.map(h => h.paquet))].join(',');
  const passation = derniereDe(ctx, 'developpeur')?.text ?? 'aucune';
  return new Arret(
    'hors-portee',
    `Le développeur dit FAIT sans tenir, hors du plan, ${criteres} (séance ${tentative}).\n\nSa passation :\n\n${passation}`,
    {
      piece: fiche.hors_plan.map(h => h.piece).join('\n'),
      question: `Le développeur ne tient pas, hors du plan, ${criteres} : le plan s'étend (\`--etendre ${paquets}\`), ou le critère s'amende au ticket, puis \`--reprendre\`.`,
    }
  );
}

// The sending to the testwriter in the developpeur's sheet <fiche> (its `renvoi`): what the
// testwriter receives, the sending, the developpeur's handover, then the red output of the last
// checks when checks ran since the testwriter's session (`ctx.controlesRouges`); null without a
// sending.
function renvoiDe(ctx, fiche) {
  if (!fiche.renvoi) return null;
  const passation = derniereDe(ctx, 'developpeur')?.text ?? 'aucune';
  const raison = fiche.raison ? ` : ${fiche.raison}` : '';
  const controles = ctx.controlesRouges
    ? `\n\nLa sortie rouge des derniers contrôles :\n\n${ctx.controlesRouges}`
    : '';
  return `Le développeur renvoie le rouge qui reste aux tests du lot${raison}.\n\nSa passation :\n\n${passation}${controles}`;
}

// The findings of the reviewer still open for <role> (`ctx.constats`), in their order.
const ouverts = (ctx, role) => (ctx.constats ?? []).filter(c => c.role === role);

// The findings <constats> as an agent's instruction carries them, each under its heading, with
// what it holds, its body and its piece; « aucun » without one.
const texteDesOuverts = constats =>
  constats.length
    ? constats
        .map(
          (c, i) =>
            `### Constat ${i + 1} — ${c.titre}\nBloquant : ${c.regle}\n${c.corps}${c.piece ? `\nPièce : ${c.piece}` : ''}`
        )
        .join('\n\n')
    : 'aucun';

// The findings still open once the reviewer's sheet RENDU <fiche> is read, as the issues of a
// review stay open until the review that resolves them: each blocking finding of the sheet (a
// remark reaches the ticket, no agent; the sheet's schema gives a RENDU at least one), after each
// finding open before it that the sheet neither marks lifted (`suivi`, by its title) nor states
// again. Each one `{ titre, regle, role, corps, piece }`, its recipient the agent it names, testwriter or
// developpeur, without the developpeur's answer to the review before (`reponse`): his next sheet
// answers it again. Throws an Arret `relecture-arret` for a finding without a valid recipient or one
// that puts a criterion in question.
function constatsOuverts(ctx, fiche, texte) {
  const arret = raison =>
    new Arret('relecture-arret', `${raison}\n\nLe verdict :\n\n${texte}`, { piece: raison });
  const neufs = bloquants(fiche).map(c => {
    if (c.critere_en_cause)
      throw arret(`Le constat « ${c.titre} » met en cause un critère du ticket.`);
    if (!AGENTS_DU_LOT.includes(c.role)) {
      throw arret(
        `Le constat « ${c.titre} » n'a pas de destinataire valide : il nomme ${c.role ? `« ${c.role} »` : 'personne'}, quand le rôle est ${AGENTS_DU_LOT.join(' ou ')}.`
      );
    }
    return { titre: c.titre, regle: c.regle, role: c.role, corps: c.corps, piece: c.piece };
  });
  const leves = new Set((fiche.suivi ?? []).filter(s => s.etat === 'levé').map(s => s.titre));
  const restes = (ctx.constats ?? [])
    .filter(c => !leves.has(c.titre) && !neufs.some(n => n.titre === c.titre))
    .map(c => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'reponse')));
  return [...restes, ...neufs];
}

// The integration of the lot: its two patches, its message and the references that write files in
// full (`--references`, from `lesReferences`, the one list), written from the copy, then
// scripts/integration/integrer.mjs from the main tree, its output added to the log. A run « à
// repasser » (75) plays once more, the gesture `rejeu`. `{ code, sortie, args }`.
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
  const entieres = lesReferences(ctx)
    .filter(r => r.entiers.length)
    .map(({ nom, commande, fichiers, entiers, cadre }) => ({
      nom,
      commande,
      fichiers,
      entiers,
      cadre,
    }));
  if (entieres.length) {
    const f = path.join(ctx.tmp, 'references.json');
    writeFileSync(f, `${JSON.stringify(entieres)}\n`);
    args.push('--references', f);
  }
  let r;
  for (let essai = 1; essai <= 2; essai++) {
    entete(ctx, 'integration');
    appendFileSync(ctx.journal, `$ node ${INTEGRER} ${args.join(' ')}\n`);
    const x = avecAvancement(ctx, 'integration', avancement =>
      spawnSync(process.execPath, [INTEGRER, ...args], {
        cwd: ctx.racine,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, [AVANCEMENT]: avancement },
      })
    );
    r = { code: x.status ?? 1, sortie: `${x.stdout ?? ''}${x.stderr ?? ''}`, args };
    appendFileSync(ctx.journal, r.sortie);
    if (r.code !== A_REPASSER) break;
    if (essai === 1) geste(ctx, 'rejeu');
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
  entete(ctx, 'file');
  appendFileSync(ctx.journal, `$ node ${FILE}\n`);
  const x = avecAvancement(ctx, null, avancement =>
    spawnSync(process.execPath, [FILE], {
      cwd: ctx.racine,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, [AVANCEMENT]: avancement },
    })
  );
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

// The tri of the discoveries of the ticket (step 5.3 of scripts/etapes.mjs), once the queue has
// brought its lot onto main, as Chromium and Mozilla give each new report a verdict before it is
// filed. Without a discovery, no session. Else one session of the explorateur out of the
// envelope, on Sonnet, in the main tree, under the rights of its role (reading, the build of a
// package, no pass), its instruction from the eighth template (the ticket, its commit on main, the
// one the queue names in the reason it closes the ticket with, `commitIntegre`, its discoveries,
// one per line, the commands its rights permit, `commandesPermises`), its sheet the tri's (`tri` of scripts/resultats.mjs): one line per discovery
// (`conformiteDuTri`), asked again once of the same session. Each verdict is written at the ticket
// of its discovery (`Circuit · tri : <verdict> — <texte> (<piece>)`), its label set there; an
// a-porter or a non-confirmee reopens under `a-valider`, the pane's list « à valider »; the others
// stay closed. The line of the tri at the ticket names each writing that failed (the verdict, the
// label, the reopening), with its error, and counts as reopened only what reopened. A tri that ends
// without a sheet that conforms leaves the discoveries as
// they are and says so at the ticket. Either way, its end is kept with the circuit's results
// (`tri`: the discoveries read, whether its sheet conformed, its verdicts by kind), which the bilan
// reads, and the working directory the queue removed at the closure, recreated for the session, is
// removed again.
async function trier(ctx) {
  const decouvertes = decouvertesDuTicket(ctx);
  if (!decouvertes.length) return;
  const ids = decouvertes.map(d => d.id);
  const n = `${decouvertes.length} découverte${decouvertes.length > 1 ? 's' : ''}`;
  // The commit the queue brought onto main for this ticket, not main's last, another ticket's
  // once several circuits run.
  const show = ctx.bd('show', ctx.ticket, '--json');
  const fermeture = show.status === 0 ? (JSON.parse(show.stdout)[0]?.close_reason ?? null) : null;
  const integre = commitIntegre(fermeture);
  const commit = integre
    ? spawnSync('git', ['-C', ctx.racine, 'log', '-1', '--format=%h %s', integre], {
        encoding: 'utf8',
      }).stdout.trim()
    : '';
  mkdirSync(ctx.tmp, { recursive: true });
  let fiche = null;
  let faute = null;
  try {
    fiche = await jusquALaFiche(
      ctx,
      EXPLORATEUR,
      consigne(
        {
          depot: ctx.racine,
          ticket: ctx.ticket,
          sujet: ctx.sujet,
          commit: commit || 'inconnu',
          decouvertes: decouvertes.map(d => `- ${d.id} — ${d.sujet}`).join('\n'),
          commandes: commandesPermises(EXPLORATEUR),
        },
        7
      ),
      {
        horsEnveloppe: true,
        droits: horsDeLEnveloppe(ctx, EXPLORATEUR, 'sonnet'),
        id: randomUUID(),
        fiche: 'tri',
        objet: 'tri',
        valider: f => conformiteDuTri(f, ids),
      }
    );
  } catch (x) {
    if (!(x instanceof Arret)) throw x;
    faute = premiereLigne(x.rapport);
  } finally {
    rmSync(ctx.tmp, { recursive: true, force: true });
  }
  if (!fiche) {
    inscrire(ctx, {
      role: AUTEUR_DU_CIRCUIT,
      etape: TRI,
      tri: { decouvertes: ids.length, conforme: false, verdicts: {} },
    });
    commenter(
      ctx,
      TRI,
      `le tri ne rend pas de fiche conforme (${faute}) : les ${n} restent telles quelles ; l'intégration tient.`
    );
    return;
  }
  // Each writing at a discovery's ticket, by its name; one that fails is named at the ticket.
  const echecs = [];
  const rouvertes = [];
  for (const l of fiche.verdicts) {
    const rouvre = VERDICTS_ROUVERTS.includes(l.verdict);
    const ecritures = [
      [
        'verdict',
        [
          'comments',
          'add',
          l.decouverte,
          `${PREFIXE}${TRI} : ${l.verdict} — ${l.texte.trim()}${l.piece ? ` (${l.piece.trim()})` : ''}${rouvre ? ' ; rouverte sous a-valider, pour le responsable.' : ''}`,
        ],
      ],
      [
        'étiquette',
        [
          'update',
          l.decouverte,
          '--add-label',
          l.verdict,
          ...(rouvre ? ['--add-label', 'a-valider'] : []),
        ],
      ],
      ...(rouvre ? [['réouverture', ['reopen', l.decouverte]]] : []),
    ];
    const ratees = ecritures.flatMap(([quoi, args]) => {
      const r = ctx.bd(...args);
      return r.status === 0 ? [] : [`${quoi} (${premiereLigne(r.stderr) || `code ${r.status}`})`];
    });
    if (ratees.length) echecs.push(`${l.decouverte} : ${ratees.join(', ')}`);
    if (rouvre && !ratees.some(x => x.startsWith('réouverture'))) rouvertes.push(l.decouverte);
  }
  const verdicts = Object.fromEntries(
    VERDICTS_DU_TRI.map(v => [v, fiche.verdicts.filter(l => l.verdict === v).length]).filter(
      ([, k]) => k
    )
  );
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    etape: TRI,
    tri: { decouvertes: ids.length, conforme: true, verdicts },
  });
  commenter(
    ctx,
    TRI,
    `${n} triée${decouvertes.length > 1 ? 's' : ''} — ${Object.entries(verdicts)
      .map(([v, k]) => `${k} ${v}`)
      .join(
        ', '
      )} ; ${rouvertes.length ? `rouvertes sous a-valider : ${rouvertes.join(', ')}` : 'aucune rouverte'}${echecs.length ? ` ; écritures en échec : ${echecs.join(' ; ')}` : ''}.`
  );
}

// The commit the queue names in the reason of a ticket it closes (`intégré : <commit>`,
// scripts/integration/file.mjs), or null for another reason.
export function commitIntegre(raison) {
  const r = String(raison ?? '');
  return r.startsWith(INTEGRE) ? r.slice(INTEGRE.length).trim().split(' ')[0] || null : null;
}

// The type of a conventional commit for the ticket's type in Beads; `feat` for any other.
const TYPES_DE_COMMIT = { bug: 'fix', chore: 'chore', docs: 'docs' };

// The commit message of the lot: `<type>(<paquets>): <sujet> (<ticket>)`, the packages of the
// plan by their name; then the message the sheets of the developpeur and of the reviewer give, in
// their order, written once from the final state (`messageDuLot`).
function messageDeCommit(ctx) {
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  const noms = ctx.paquets
    .filter(c => c !== '.')
    .map(c => liste.find(p => p.dossier === c)?.pkg.name ?? path.basename(c));
  const type = TYPES_DE_COMMIT[ctx.type] ?? 'feat';
  const portee = noms.length ? `(${noms.join(',')})` : '';
  return messageDuLot({
    entete: `${type}${portee}: ${ctx.sujet} (${ctx.ticket})`,
    description: leTicket(ctx).description,
    fiches: lesFiches(ctx)
      .filter(e => e.role === 'developpeur' || e.role === 'relecteur')
      .map(e => e.fiche),
  });
}

// The commit message of a lot, written once from its final state, as a change merged on Gerrit
// carries the one description of its last patch set: <entete>, the title of the ticket; the
// section of the criteria of the plan <description> (its heading begins with « Critères »), what
// the lot changes; a paragraph per deviation the sheets <fiches> carry (`ecarts`), each subject
// once, in the order it first appears, with the value of the last sheet that carries it (a
// subject known again whatever its case and spacing); then the trailer.
export function messageDuLot({ entete, description, fiches }) {
  const criteres = [];
  let dedans = false;
  for (const ligne of String(description ?? '').split('\n')) {
    const m = /^##\s+(.*)$/.exec(ligne);
    if (m) {
      dedans = /^Critères\b/.test(m[1].trim());
    } else if (dedans) {
      criteres.push(ligne);
    }
  }
  const cle = sujet => sujet.toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
  const ecarts = new Map();
  for (const e of fiches.flatMap(f => f.ecarts ?? [])) {
    const sujet = ecarts.get(cle(e.sujet))?.sujet ?? e.sujet.trim();
    ecarts.set(cle(e.sujet), { sujet, texte: e.texte.trim() });
  }
  return [
    entete,
    criteres.join('\n').trim(),
    ...[...ecarts.values()].map(e => `${e.sujet} : ${e.texte}`),
    'Co-Authored-By: Claude <noreply@anthropic.com>',
  ]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n');
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

// Whether the testwriter writes <fichier> of the copy: the rule of a test file of the module of its
// language (`estUnTest`, scripts/jointure.d.ts).
const duTestwriter = (ctx, fichier) => langageDe(ctx.copie).estUnTest(fichier, ctx.copie) !== null;

// The test files of the lot that the testwriter writes, present in the copy: in the packages of
// the plan and in the shared test material.
function testsDuLot(ctx) {
  return changements(ctx)
    .filter(c => !c.supprime)
    .map(c => c.fichier)
    .filter(f => langageDe(ctx.copie).estUnTest(f, ctx.copie)?.joue)
    .sort();
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
// `npm run verifier` it runs. A wait that stops (its bound, 75; a lock held by an ancestor, 1) is
// the command's code, its message in the log. Once it holds the lock, the pass plays under a
// progress directory of its own (`avancement`), of the kind `genreDeLaPasse` names.
function npm(ctx, etape, args, env = {}) {
  entete(ctx, etape);
  const dossier = mkdtempSync(path.join(ctx.base.dossier, 'resultats-'));
  const prefixe = Object.entries(env).map(([k, v]) => `${k}=${v} `);
  appendFileSync(ctx.journal, `$ ${prefixe.join('')}npm ${args.join(' ')}\n`);
  const fd = openSync(ctx.journal, 'a');
  try {
    const r = avecLaMachine(
      envMachine =>
        avecAvancement(ctx, genreDeLaPasse(ctx, etape, args), avancement =>
          spawnSync('npm', args, {
            cwd: ctx.copie,
            stdio: ['ignore', fd, fd],
            env: {
              ...envMachine,
              ...env,
              [RESULTATS]: dossier,
              [AVANCEMENT]: avancement,
              ...(args[0] === 'test' ? { [DEPUIS_LE_VERT]: '1' } : {}),
            },
          })
        ),
      { racine: ctx.copie, dire: l => appendFileSync(ctx.journal, `${l}\n`) }
    );
    return { code: r.status ?? 1, dossier };
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) throw e;
    appendFileSync(ctx.journal, `${e.message}\n`);
    return { code: e.code, dossier };
  } finally {
    closeSync(fd);
  }
}

// The kind of an automatic pass, by which its total is kept from one pass to the next
// (scripts/avancement.mjs): its step (the checks once final, the final pass) and its command
// without the test files and the filters, which move from one lot to the next.
function genreDeLaPasse(ctx, etape, args) {
  const commande = args.filter(
    a => !langageDe(ctx.copie).estUnTest(a, ctx.copie)?.joue && !a.startsWith('--filter=')
  );
  return etape === 'controles' && args[1] === 'verifier'
    ? ['passe finale', ...commande].join(' ')
    : [etape, ...commande].join(' ');
}

// Runs <passe> under a progress directory of the kind <genre> (null: none kept), named in the
// state while it plays (`avancement`), as the board reads it; then keeps its total, takes it out
// of the state and removes it. Returns what <passe> returns.
function avecAvancement(ctx, genre, passe) {
  const avancement = ouvrirAvancement({ racine: ctx.copie, genre, dans: ctx.base.dossier });
  if (ctx.courant) ecrireEtat(ctx, { ...ctx.courant, avancement: { dossier: avancement } });
  try {
    return passe(avancement);
  } finally {
    garderLeTotal(avancement, ctx.copie);
    if (ctx.courant) ecrireEtat(ctx, { ...ctx.courant, avancement: null });
    rmSync(avancement, { recursive: true, force: true });
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

// The measure of the proof of the red: one run per package, `npm test -- --force <files>` of the
// lot that lie in it, HEAD's version of each beside it, or, with no file of the lot, `npm test --
// <package>` for each package of the plan, played whole. Each run `{ groupe, entier, avant, code,
// resultats, constructions }`. A measure on the same tree (the copy's fingerprint, `empreinte`) is
// not played again, as Turborepo replays a task whose inputs did not move: the last one is kept
// in `ctx.mesureDeLaPreuve`.
function mesureDeLaPreuve(ctx, liste, fichiers) {
  const cle = empreinte(ctx, ['.']);
  if (ctx.mesureDeLaPreuve?.cle === cle) return ctx.mesureDeLaPreuve.runs;
  const entiers = fichiers.length ? [] : paquetsDuPlan(ctx, liste);
  const groupes = new Map(entiers.map(d => [d, []]));
  for (const f of fichiers) {
    const p = paquetDe(liste, f);
    groupes.set(p, [...(groupes.get(p) ?? []), f]);
  }
  const runs = [];
  for (const [dossier, groupe] of groupes) {
    const entier = entiers.includes(dossier);
    const avant = versionsDAvant(ctx, groupe);
    let r;
    try {
      // The files of the lot play for real (`--force`): a run replayed from Turborepo's cache, the
      // checks' same command on the same inputs, writes no report of Vitest.
      r = npm(ctx, 'preuve', [
        'test',
        '--',
        ...(entier ? [dossier] : ['--force']),
        ...groupe,
        ...avant.values(),
      ]);
    } finally {
      for (const soeur of avant.values()) rmSync(path.join(ctx.copie, soeur), { force: true });
    }
    runs.push({
      groupe,
      entier,
      avant,
      code: r.code,
      resultats: langageDe(ctx.copie).verdict(r.dossier).rapports,
      // The builds of the plan's packages that failed: each one a red, not compiling is failing.
      constructions: constructionsEchouees(ctx, liste, r.dossier),
    });
  }
  ctx.mesureDeLaPreuve = { cle, runs };
  return runs;
}

// The full name of a test <nom> with each separator between a group and what it holds, « > » or
// « › » between blanks, read as the blank that Vitest's full name puts there.
const sansSeparateur = nom =>
  String(nom ?? '')
    .replace(/\s+[>›]\s+/g, ' ')
    .trim();

// The proof of the red, on every test of the lot: `{ ok, rouges, texte, resume }`, `texte` without
// the list of the justified greens, which only the whole report, written to its file, holds. A
// green test passes by the expected greens of the testwriter's sheets (`verts_attendus`), read at
// each proof, a sheet without them justifying none; a test's full name is read whatever the
// separator between its group and its title, a blank, or « > » as Vitest prints it, or « › » as
// Jest and the report of the proof print it (`sansSeparateur`); the measure plays again only when
// the copy changed (`mesureDeLaPreuve`).
function preuve(ctx) {
  const fichiers = testsDuLot(ctx);
  const verts = fichesDe(ctx, 'testwriter').flatMap(f => f.verts_attendus ?? []);
  const raisonDuTest = (f, a) =>
    verts.find(
      v =>
        v.fichier === f &&
        v.test &&
        [a.nom, a.titre].some(n => sansSeparateur(v.test) === sansSeparateur(n))
    )?.raison ?? null;
  const duFichier = f => verts.find(v => v.fichier === f && !v.test) ?? null;
  const rouges = [];
  // The reds of the files of the lot, apart from the existing ones and the builds.
  let rougesDuLot = 0;
  const justifies = [];
  const injustifies = [];
  const casses = [];
  const neufs = [];
  const liste = paquets(ctx.copie).filter(p => !p.hors);
  let anciens = 0;
  const reportes = [];
  const mesure = mesureDeLaPreuve(ctx, liste, fichiers);
  for (const { groupe, entier, avant, code, resultats, constructions } of mesure) {
    for (const { nom, erreur } of constructions) {
      if (reportes.includes(nom)) continue;
      rouges.push(`construction de ${nom} — ${erreur}`);
      reportes.push(nom);
    }
    // The files of a package played whole, out of the lot, which HEAD holds green: a red of theirs
    // is a regression of the lot.
    if (entier) {
      for (const res of resultats) {
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
          `${f} — ne se charge pas : non joué (code ${code}) ; le journal du ticket : ${ctx.journal}`
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
          rougesDuLot++;
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
      `${SUITE.find(e => e.etat === PREUVE).titre} : ${resume}.`,
      ...[...new Set(reportes)].map(
        nom => `Les tests de ${nom} se jouent aux contrôles, après le développeur.`
      ),
      '',
      ...(fichiers.length || rouges.length
        ? []
        : ['Aucun fichier de test du lot dans le plan : rien ne prouve le rouge.', '']),
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
  return {
    ok,
    rouges: rouges.length,
    texte,
    resume,
    resultat: {
      ok,
      rouges: rouges.length,
      justifies: justifies.length,
      sans: injustifies.length,
      casses: casses.length,
      anciens,
      vide: rougesDuLot + justifies.length + injustifies.length + casses.length === 0,
    },
  };
}

// The builds that failed in the run whose results are under <dossier> (the summary of Turborepo,
// task `<package>#build`) of a package of the plan: `{ nom, erreur }`, `erreur` its log file and
// the beginning of its own output.
function constructionsEchouees(ctx, liste, dossier) {
  return langageDe(ctx.copie)
    .verdict(dossier)
    .taches.filter(t => t.script === 'build' && t.code !== null && t.code !== 0)
    .flatMap(t => {
      const p = liste.find(x => x.pkg.name === t.paquet);
      if (!p || !dansLePlan(ctx, p.dossier)) return [];
      const j = journalDeTache(ctx, t);
      return [{ nom: t.paquet, erreur: `son journal : ${j.chemin}\n\n${j.debut}\n` }];
    });
}

// Where <chemin> (from the root of the copy) lies: `{ dansLePlan, paquet, horsTitre }`, whether
// a path of the plan holds it, the name of the package of <liste> that holds it, and that name
// again when the plan does not hold it.
function situer(ctx, liste, chemin) {
  const dedans = Boolean(chemin) && dansLePlan(ctx, chemin);
  const p = chemin ? liste.find(x => chemin.startsWith(`${x.dossier}/`)) : null;
  const paquet = p ? p.pkg.name : null;
  return { dansLePlan: dedans, paquet, horsTitre: dedans ? null : paquet };
}

// The reds of the check <c> (`{ args, env, code, dossier }`), read in its results: each failed
// test of the reports of Vitest, each finding of the guards' SARIF, each failed build, and each
// failed task none of those situates; a red check with none of them is one red of the command.
// Each red `{ texte, fichier, gardes, detail, dansLePlan, paquet, horsTitre, arbitrer, joue }`: the
// line that names it (test or finding, file, message), its file (null for a red of a task), the
// names its finding carries (its guard and its rule), the beginning of its task's log for a build,
// whether a path of the plan holds it (none for a red without a file), the package that holds it
// and that package again when it is out of the plan, whether it is a finding to settle
// (`a-arbitrer`), and the package whose task gave it, as Turborepo names it (« // » for the
// root's guards; null for a red of the command).
// As SARIF 2.1.0 and GitHub code scanning, a finding of level error fails, a warning or a note
// shows without failing: `{ rouges, avertissements }`, `avertissements` the lines of the findings
// of another level, which the report lists apart. A guards' task red without a finding of level
// error keeps its line of a red task, with its log.
function rougesDe(ctx, liste, c) {
  const lus = lireSarif(c.dossier).constats.filter(k => k.genre !== A_ELAGUER);
  const vert = c.code === 0 || c.code === A_REPASSER;
  const gardesDuCadre = nomsDesGardes(ctx.copie);
  const duCadre = k => gardesDuCadre.includes(k.garde);
  const rouge = k => k.niveau === 'error';
  const ligneDe = k => {
    const ou = k.fichier ? ` ${k.fichier}${k.ligne ? `:${k.ligne}` : ''}` : '';
    return `${k.garde}${ou} — ${k.message}${k.genre === 'a-arbitrer' ? ' (à arbitrer)' : ''}`;
  };
  const avertissements = lus.filter(k => !rouge(k)).map(k => `${k.niveau} ${ligneDe(k)}`);
  if (vert) return { rouges: [], avertissements };
  const out = [];
  const testes = new Set();
  for (const res of langageDe(ctx.copie).verdict(c.dossier).rapports) {
    const f = path.relative(ctx.copie, res.fichier);
    const lieu = situer(ctx, liste, f);
    if (res.tests.length === 0 && res.etat === 'failed') {
      out.push({
        texte: `test ${f} — ne se charge pas : ${premiereLigne(res.message)}`,
        fichier: f,
        ...lieu,
        joue: lieu.paquet,
      });
      testes.add(paquetDe(liste, f));
    }
    for (const a of res.tests.filter(x => x.etat === 'failed')) {
      out.push({
        texte: `test ${f} › ${a.nom} — ${premiereLigne(a.message)}`,
        fichier: f,
        ...lieu,
        joue: lieu.paquet,
      });
      testes.add(paquetDe(liste, f));
    }
  }
  // A key of the debt to lower (`a-elaguer`, scripts/dette.mjs) is a note, not a red.
  const constats = lus.filter(rouge);
  for (const k of constats) {
    out.push({
      texte: `constat ${ligneDe(k)}`,
      fichier: k.fichier ?? null,
      gardes: [k.garde, k.regle].filter(Boolean),
      ...situer(ctx, liste, k.fichier),
      arbitrer: k.genre === 'a-arbitrer',
      joue: '//',
    });
  }
  // The guards of the project wrote findings when one comes from a guard out of the frame's.
  const duProjet = constats.some(k => !duCadre(k));
  for (const t of langageDe(ctx.copie).verdict(c.dossier).taches) {
    if (t.code === null || t.code === 0 || t.code === A_REPASSER) continue;
    if (t.script === 'test:vitest' && testes.has(t.dossier)) continue;
    if (t.script === 'grillhouse:gardes' && constats.length) continue;
    if (t.script === 'gardes' && duProjet) continue;
    const p = liste.find(x => x.pkg.name === t.paquet);
    const lieu = p
      ? situer(ctx, liste, `${p.dossier}/`)
      : { dansLePlan: false, paquet: null, horsTitre: null };
    const j = journalDeTache(ctx, t);
    out.push({
      texte:
        t.script === 'build'
          ? `construction de ${t.paquet} — son journal : ${j.chemin}`
          : `tâche ${t.tache} rouge (code ${t.code}) — son journal : ${j.chemin}`,
      detail: t.script === 'build' ? j.debut : '',
      ...lieu,
      joue: t.paquet,
    });
  }
  if (out.length === 0) {
    out.push({
      texte: `${ligneDeCommande(c)} rouge (code ${c.code}), sans résultat qui situe son rouge — le journal du ticket : ${ctx.journal}`,
      dansLePlan: false,
      paquet: null,
      horsTitre: null,
    });
  }
  return { rouges: out, avertissements };
}

const ligneDeCommande = c =>
  `${Object.entries(c.env ?? {})
    .map(([k, v]) => `${k}=${v} `)
    .join('')}npm ${c.args.join(' ')}`;

// The checks after the developpeur: those of the plan (3.1), or, when <finale>, `npm run
// verifier`, what the integration plays (4.1), restricted by <restreinte> (`{ avant, apres }`, two
// lots kept) to the packages that changed from one to the other and their dependents, with the
// root's tasks, the guards (`--filter=...[<avant>...<apres>] --filter=//`). After a regeneration,
// <reportes> (`{ rouges, rejouee }`) carries the reds of the final pass before it: each one in a
// package the pass restricted to the regeneration does not play again stands, as a CI keeps the
// verdict of a job it does not run again; when the regeneration changes nothing (`rejouee`
// false), no command plays, and they all stand. `{ rouge, aRepasser, arbitrer, auDeveloppeur,
// texte, complet, resume, horsTitre, lieux, tous, notes, avertissements }`: `texte` the report for
// the developpeur, his reds first; `complet` every red, for a stop, and the warnings;
// `avertissements` the section of the warnings and notes of the guards, which are no reds, for the
// report of the checks (empty without one); `auDeveloppeur` whether a red lies
// in a package of the plan; `horsTitre` the packages out of the plan that hold a red; `arbitrer`
// when every red of the plan is a finding to settle; `lieux` the place of each red, `{ fichier,
// gardes, dansLePlan }`, its file (null for a red without one), the names its finding carries
// (none for a test or a task), and whether a path of the plan holds it; `references`, out of the final pass, the references whose reds the checks saw,
// which their regeneration lifts before the final pass; `tous` every red as it was read; `notes`,
// at the final pass, each key of the debt a guard wrote inscribed above what it finds, `{ garde,
// fichier, regle, trouve }`.
function controles(ctx, finale, restreinte = null, reportes = null) {
  const liste = paquets(ctx.copie).filter(p => !p.hors);
  const filtres = restreinte
    ? ['--', `--filter=...[${restreinte.avant}...${restreinte.apres}]`, '--filter=//']
    : [];
  const commandes =
    reportes && !reportes.rejouee
      ? []
      : finale
        ? [{ args: ['run', 'verifier', ...filtres] }]
        : commandesDuPlan(ctx, liste);
  const resultats = commandes.map(({ args, env }) => {
    let r = npm(ctx, 'controles', args, env);
    // verifier plays a task at 75 again itself, at rest: its 75 is final; a command of the checks
    // plays once more, the gesture `rejeu`.
    if (r.code === A_REPASSER && !finale) {
      geste(ctx, 'rejeu');
      r = npm(ctx, 'controles', args, env);
    }
    const c = { args, env, ...r };
    return { ...c, ...rougesDe(ctx, liste, c) };
  });
  // The packages the commands played (the root's tasks under « // »), whose reds are read again.
  const joues = new Set(
    resultats.flatMap(r =>
      langageDe(ctx.copie)
        .verdict(r.dossier)
        .taches.map(t => t.paquet)
    )
  );
  const tous = [
    ...resultats.flatMap(r => r.rouges),
    ...(reportes?.rouges ?? []).filter(
      r => !reportes.rejouee || (Boolean(r.joue) && !joues.has(r.joue))
    ),
  ];
  // Out of the final pass, the reds of the plan are the developpeur's; a red of a reference goes to
  // its regeneration (4.2), before the final pass; the others (the root, a red no file situates, a
  // package out of the plan) wait for the final pass.
  const lieu = r => ({
    fichier: r.fichier ?? null,
    gardes: r.gardes ?? [],
    dansLePlan: Boolean(r.dansLePlan),
  });
  const deReference = r => referencesDesRouges(ctx, [lieu(r)]).length > 0;
  const siens = r => finale || (r.dansLePlan && !deReference(r));
  const rouges = tous.filter(siens);
  const references = finale
    ? []
    : referencesDesRouges(ctx, tous.filter(r => !siens(r) && deReference(r)).map(lieu));
  const laisses = tous.filter(r => !siens(r) && (finale || !deReference(r)));
  const aRepasser = resultats.filter(r => r.code === A_REPASSER);
  const nommer = r => `${ligneDeCommande(r)} (code ${r.code})`;
  const enEchec = resultats.filter(r => r.code !== 0 && r.code !== A_REPASSER);
  const a = rouges.filter(r => r.dansLePlan);
  const autres = rouges.filter(r => !r.dansLePlan);
  const resume = rouges.length
    ? `rouge : ${rouges.length} rouge(s) — ${
        commandes.length
          ? enEchec.map(nommer).join(' ; ')
          : "ceux de la passe finale d'avant, que la régénération ne change pas"
      }`
    : aRepasser.length
      ? `à repasser : ${aRepasser.map(nommer).join(' ; ')}`
      : `verts : ${commandes.length ? resultats.map(ligneDeCommande).join(' ; ') : "la passe finale d'avant"}${
          laisses.length
            ? ` ; laissés à la passe finale, ${laisses.length} rouge(s) hors du plan`
            : ''
        }${
          references.length
            ? ` ; des rouges sont ceux de références, à leur régénération avant la passe finale (${references.map(r => r.nom).join(', ')})`
            : ''
        }`;
  // Where the checks played: the final pass out of the envelope, on the whole copy or restricted
  // to what changed since the last review; the checks of the plan, its tests and packages, its
  // guards in its envelope.
  const ou = !finale
    ? 'Contrôles du plan, ses tests et ses paquets, ses gardes dans son enveloppe'
    : restreinte
      ? "Contrôles de la passe finale, hors enveloppe, restreinte à ce que le lot change depuis la relecture d'avant et à ses dépendants"
      : 'Contrôles de la passe finale, hors enveloppe, sur la copie entière';
  const ligne = r => [`- ${r.texte}`, ...(r.detail ? ['', r.detail, ''] : [])];
  const nomDuPaquet = r => r.paquet ?? 'hors des paquets';
  const journal = `Le journal du ticket, pour le détail des commandes : ${ctx.journal}`;
  // The warnings and notes of the guards, apart from the reds: shown, given to no one to correct.
  const signales = resultats.flatMap(r => r.avertissements);
  const avertissements = signales.length
    ? [
        `Les avertissements (${signales.length}), qui ne sont pas des rouges :`,
        ...signales.map(l => `- ${l}`),
        '',
      ]
    : [];
  const texte = [
    `${ou} : ${resume}.`,
    '',
    ...(a.length ? [`Tes rouges (${a.length}) :`, ...a.flatMap(ligne), ''] : []),
    ...(aRepasser.length && !rouges.length
      ? [`À repasser (${aRepasser.length}) : ${aRepasser.map(nommer).join(' ; ')}`, '']
      : []),
    ...(autres.length
      ? [`Les autres rouges (${autres.length}), hors du plan, montent au superviseur.`, '']
      : []),
    ...(laisses.length && !finale
      ? [`Laissés à la passe finale (${laisses.length}) :`, ...laisses.map(r => `- ${r.texte}`), '']
      : []),
    journal,
  ].join('\n');
  const sansListe = [`${ou} : ${resume}.`, '', journal].join('\n');
  const complet = [
    `${ou} : ${resume}.`,
    '',
    ...(rouges.length
      ? [
          `Les rouges (${rouges.length}) :`,
          ...rouges.flatMap(r => ligne({ ...r, texte: `${nomDuPaquet(r)} : ${r.texte}` })),
          '',
        ]
      : []),
    ...avertissements,
    journal,
  ].join('\n');
  return {
    rouge: rouges.length > 0,
    aRepasser: aRepasser.length > 0,
    arbitrer: a.length > 0 && a.every(r => r.arbitrer),
    auDeveloppeur: a.length > 0,
    texte,
    complet,
    sansListe,
    avertissements: avertissements.length ? `\n\n${avertissements.join('\n').trimEnd()}` : '',
    // The reds of the stop, each with where it lies: the plan's, or at the final pass all of them;
    // never those left to the final pass.
    rouges: rouges.map(r => ({ paquet: nomDuPaquet(r), texte: r.texte, detail: r.detail })),
    resume,
    horsTitre: [...new Set(rouges.map(r => r.horsTitre).filter(Boolean))].sort(),
    lieux: rouges.map(lieu),
    references,
    tous,
    notes: finale
      ? resultats.flatMap(r =>
          lireSarif(r.dossier)
            .constats.filter(k => k.genre === A_ELAGUER)
            .map(({ garde, fichier, regle, trouve }) => ({ garde, fichier, regle, trouve }))
        )
      : [],
  };
}

// The checks of the plan, out of the final pass: `npm test -- <package>` for each package of the
// plan and each the lot touches in it, `npm test -- <test files of the lot>` that none of them
// holds (the shared test material's out of the plan), each test played once, then the guards in
// the envelope of the plan, whose findings on its files alone count.
function commandesDuPlan(ctx, liste) {
  const lot = changements(ctx);
  const touches = liste.length
    ? [...new Set(lot.map(c => paquetDe(liste, c.fichier)).filter(d => d !== '.'))].sort()
    : ['.'];
  const entiers = [
    ...new Set([...touches.filter(d => dansLePlan(ctx, d)), ...paquetsDuPlan(ctx, liste)]),
  ].sort();
  const tests = testsDuLot(ctx).filter(f => !entiers.some(d => d === '.' || f.startsWith(`${d}/`)));
  const scripts = lireJson(path.join(ctx.copie, 'package.json'))?.scripts ?? {};
  const enveloppe = { [VARIABLE_ENVELOPPE]: ecrireLaListe(ctx.paquets) };
  return [
    ...(tests.length ? [{ args: ['test', '--', ...tests] }] : []),
    ...entiers.map(d => ({ args: d === '.' ? ['test'] : ['test', '--', d] })),
    ...['grillhouse:gardes', 'gardes']
      .filter(s => s in scripts)
      .map(s => ({ args: ['run', s], env: enveloppe })),
  ];
}

// The directories of the packages of <liste> that play tests (a script `test:vitest`) and that the
// plan holds; sorted.
function paquetsDuPlan(ctx, liste) {
  return liste
    .filter(p => p.pkg.scripts?.['test:vitest'] && dansLePlan(ctx, p.dossier))
    .map(p => p.dossier)
    .sort();
}

// Whether the plan carries no test: in a repository of packages, no package of the frame with a
// script `test:vitest` lies in a path of the plan or holds it, as `npm test -- <chemin>`
// (scripts/tests.mjs) refuses a path out of every package or in a package without that script. A
// repository without packages plays its tests at its root: each plan has them.
function sansTests(ctx) {
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine).filter(p => !p.hors);
  if (liste.length === 0) return false;
  const touche = (c, d) => c === '.' || d === c || d.startsWith(`${c}/`) || c.startsWith(`${d}/`);
  return !liste.some(
    p =>
      typeof p.pkg.scripts?.['test:vitest'] === 'string' &&
      ctx.paquets.some(c => touche(c, p.dossier))
  );
}

// Whether the copy holds a change of the plan against its HEAD.
function livre(ctx) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '--untracked-files=all', '--', ...ctx.paquets],
    { encoding: 'utf8' }
  );
  return String(r.stdout ?? '').trim() !== '';
}

// The fingerprint of the files of <chemins> in the copy (the plan by default): `git status
// --porcelain` of them and the content of each file it lists.
function empreinte(ctx, chemins = ctx.paquets) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '-z', '--untracked-files=all', '--', ...chemins],
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

// Whether a path of the plan holds <chemin> (relative to the copy), `.` holding every path.
function dansLePlan(ctx, chemin) {
  return ctx.paquets.some(c => c === '.' || chemin === c || chemin.startsWith(`${c}/`));
}

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The RENDU verdicts since the ticket's last ACCEPTÉ: a lot the queue sent back starts a new count.
function rendusDepuisAccepte(ctx) {
  const verdicts = fichesDe(ctx, 'relecteur').map(f => f.verdict);
  return verdicts.length - (verdicts.lastIndexOf('ACCEPTÉ') + 1);
}

// The counts of the bounded loops that run at the step <etape> under way, by their key
// (scripts/etapes.mjs, `boucles`): the session of the testwriter at its tests and its proof, of the
// developpeur at its code and its checks, the review; null at a step without one.
function boucles(ctx, etape, tentative, finale) {
  const compte = {
    tests: () => tentative,
    code: () => tentative,
    relecture: () => rendusDepuisAccepte(ctx) + 1,
  };
  const e = etapeDuCircuit({ etape, finale });
  const l = e ? bouclesDe(e).filter(b => compte[b.cle]) : [];
  return l.length ? Object.fromEntries(l.map(b => [b.cle, compte[b.cle]()])) : null;
}

// The circuit from <debut> (where `depart` starts it) to the entry of the lot in the queue: each
// step once for the whole ticket, its plan the packages of the title.
async function derouler(ctx, debut) {
  let { etape, tentative, rapport, finale } = debut;
  // The step a `--reprendre` starts at, the first of the loop.
  let reprise = Boolean(ctx.reprendre);
  // A developpeur relaunched on the integration's refusal of the lot he left unchanged.
  let relanceSurLeRefus = false;
  for (;;) {
    const reprend = reprise;
    reprise = false;
    const etat = {
      etape,
      tentative,
      code: null,
      raison: null,
      rapport,
      finale,
      boucles: boucles(ctx, etape, tentative, finale),
    };
    // A step the circuit leads itself names its start in the state while it runs, and writes its
    // line to the register at its end, whatever its outcome.
    const menee = MENEES.has(etape) ? { etape, debut: new Date().toISOString() } : null;
    ecrireEtat(ctx, { ...etat, mene: menee?.debut ?? null });
    try {
      if (etape === TESTS && sansTests(ctx)) {
        commenter(
          ctx,
          'testwriter',
          'aucun test dans le plan (aucun paquet avec un script test:vitest ne le tient) : ni testwriter ni preuve, le développeur directement.'
        );
        rapport = [
          `Le plan (${ctx.paquets.join(', ')}) ne porte aucun test (aucun paquet avec un script test:vitest ne le tient) : le circuit te lance sans testwriter ni preuve. Tu écris le ticket d'après ses critères ; les contrôles suivent ta séance.`,
          rapport,
        ]
          .filter(Boolean)
          .join('\n\n');
        etape = CODE;
        tentative = 1;
      } else if (etape === TESTS) {
        const fiche = await seance(ctx, 'testwriter', {
          tentative,
          rapport,
          derniere: tentative > RELANCES_TESTWRITER,
        });
        // A testwriter who declares himself blocked or in need of an answer goes up to the supervisor.
        if (fiche.statut !== 'FAIT') throw arretDuStatut(ctx, 'testwriter', tentative, fiche);
        // No checks have run since this session.
        ctx.controlesRouges = null;
        commenter(ctx, 'testwriter', `séance ${tentative} finie, sa fiche lue.`);
        etape = PREUVE;
      } else if (etape === PREUVE) {
        const p = preuve(ctx);
        rapport = p.texte;
        if (p.ok) {
          // A finding of the reviewer still open for the developpeur launches him, red or not.
          const pourLui = ouverts(ctx, 'developpeur').length > 0;
          const auDeveloppeur = p.rouges > 0 || pourLui;
          const suite = p.rouges
            ? 'au développeur'
            : pourLui
              ? 'aucun rouge ; au développeur, que nomme un constat du relecteur'
              : 'aucun rouge : un lot de tests seul, aux contrôles';
          ecrireRapport(ctx, 'preuve', `${p.resume} ; ${suite}.\n\n${p.texte}`, p.resultat);
          etape = auDeveloppeur ? CODE : CONTROLES;
          tentative = auDeveloppeur ? 1 : 0;
        } else if (tentative <= RELANCES_TESTWRITER) {
          ecrireRapport(
            ctx,
            'preuve',
            `${p.resume} ; testwriter relancé (séance ${tentative + 1}).\n\n${p.texte}`,
            p.resultat
          );
          etape = TESTS;
          tentative++;
        } else {
          throw new Arret('preuve', p.texte, { resultat: p.resultat });
        }
      } else if (etape === CODE) {
        const fort = tentative >= SEANCES_DEVELOPPEUR;
        const avant = empreinte(ctx);
        const fiche = await seance(ctx, 'developpeur', {
          tentative,
          rapport,
          fort,
          derniere: fort,
          change: relanceSurLeRefus ? CHANGE_DU_REFUS : undefined,
        });
        relanceSurLeRefus = false;
        // A question goes up to the supervisor; a red out of reach, to the testwriter its sheet sends
        // it to, else up to the supervisor.
        if (fiche.statut === 'BESOIN') {
          throw arretDuStatut(ctx, 'developpeur', tentative, fiche);
        }
        const renvoi = renvoiDe(ctx, fiche);
        if (renvoi) {
          // The red that remains lies in the tests of the lot: the gesture `renvoi-au-testwriter`,
          // the testwriter, the sending and the handover as its report, then the proof and the
          // developpeur. `renvoiAuTestwriter` keeps the red output of the checks the sending before
          // carried ('' for none), null after green checks: the same output twice in a row is a
          // round trip without a new fact.
          const sortie = ctx.controlesRouges ?? '';
          if (ctx.renvoiAuTestwriter === sortie) {
            if (empreinte(ctx) === avant) {
              inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: CODE, inchange: true });
            }
            throw new Arret(
              'sans-livraison',
              `La fiche de la séance ${tentative} du développeur renvoie une deuxième fois de suite au testwriter, sur la même sortie rouge des contrôles que le premier renvoi (aucune, ou la même), sans contrôles verts entre eux : le testwriter n'a pas levé ce rouge.\n\n${renvoi}`
            );
          }
          ctx.renvoiAuTestwriter = sortie;
          commenter(
            ctx,
            'developpeur',
            `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie ; sa fiche renvoie le rouge au testwriter : le circuit relance le testwriter, puis la preuve et le développeur.`
          );
          geste(ctx, 'renvoi-au-testwriter');
          etape = TESTS;
          tentative = 1;
          rapport = renvoi;
          finale = false;
          continue;
        }
        if (fiche.statut === 'BLOQUÉ') {
          throw arretDuStatut(ctx, 'developpeur', tentative, fiche);
        }
        if (fiche.hors_plan?.length) throw arretHorsDuPlan(ctx, tentative, fiche);
        const inchangee = empreinte(ctx) === avant;
        if (inchangee && ctx.refus?.lance && ctx.refus.empreinte === avant) {
          // The lot the integration refused, unchanged: as a merge queue lets a lot pass again only
          // with a change, neither the gesture `rien-a-livrer` nor the checks of the copy, which
          // the refusal does not see; the developpeur relaunched once with the refusal, then the
          // stop goes up.
          inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: CODE, inchange: true });
          if (ctx.refus.relance) {
            throw new Arret(
              'sans-livraison',
              `La séance ${tentative} du développeur ne change aucun fichier du plan (${ctx.paquets.join(', ')}), une seconde fois sur le lot que l'intégration refuse.\n\n${ctx.refus.rapport}`,
              { piece: ctx.refus.piece }
            );
          }
          ctx.refus = { ...ctx.refus, relance: true };
          commenter(
            ctx,
            'developpeur',
            `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie sans changement, sur le lot que l'intégration refuse : le circuit le relance une fois, le refus comme rapport.`
          );
          tentative++;
          rapport = rapportDuRefus(ctx.refus);
          relanceSurLeRefus = true;
          continue;
        }
        if (inchangee && reprend && livre(ctx)) {
          // A resumed developpeur that finds the lot delivered: the checks judge it.
          commenter(
            ctx,
            'developpeur',
            `séance ${tentative} reprise sans changement, le plan garde la livraison d'avant : aux contrôles.`
          );
          inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: CODE, inchange: true });
        } else if (inchangee) {
          // Nothing to deliver: the gesture `rien-a-livrer`, the checks judge the lot; red, the
          // stop goes up.
          geste(ctx, 'rien-a-livrer');
          inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: CODE, inchange: true });
          ctx.rienALivrer = `La séance ${tentative} du développeur ne change aucun fichier du plan (${ctx.paquets.join(', ')}), et les contrôles restent rouges. Sa passation au ticket dit pourquoi :\n\n${passations(ctx).at(-1)?.text ?? 'aucune'}`;
        }
        commenter(
          ctx,
          'developpeur',
          `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie, sa fiche lue.`
        );
        etape = CONTROLES;
      } else if (etape === CONTROLES) {
        const passeFinale = finale;
        // The final pass: after a regeneration of the references, restricted to what it changed,
        // the reds of the pass before it carried (none plays when it changed nothing); else whole,
        // or restricted to what changed since the last review.
        const regeneration = passeFinale ? (ctx.regeneration ?? null) : null;
        ctx.regeneration = null;
        const passe = !passeFinale
          ? { arbre: null, restreinte: null }
          : regeneration
            ? { arbre: arbreDeLaCopie(ctx), restreinte: regeneration.restreinte }
            : laPasseFinale(ctx);
        const k = controles(ctx, passeFinale, passe.restreinte, regeneration?.reportes ?? null);
        // The output of these checks, red, which a sending to the testwriter carries.
        ctx.controlesRouges = k.rouge ? k.texte : null;
        // The outcome the bilan reads (scripts/bilan.mjs): with the reds, each its place and its
        // text, by which it knows two checks that measured the same thing.
        const resultat = issue => ({
          issue,
          finale: passeFinale,
          rouges: k.rouges.map(r => `${r.paquet} : ${r.texte}`),
        });
        rapport = k.texte;
        // A developpeur who had nothing to deliver before these checks.
        const rien = ctx.rienALivrer ?? null;
        ctx.rienALivrer = null;
        // A stop of the checks: <phrase>, then the report, its reds also kept apart, as its piece;
        // the stop kept at the checks keeps their outcome.
        const arreter = (nom, phrase, lieu = null) => {
          const avant = phrase ? `${phrase}\n\n` : '';
          throw new Arret(nom, `${avant}${k.complet}`, {
            rouges: k.rouges,
            motif: `${avant}${k.sansListe}`,
            etape: lieu,
            resultat: lieu ? null : resultat(nom === 'a-repasser' ? 'a-repasser' : 'rouge'),
          });
        };
        const suivante = tentative + 1;
        // A final pass with a red of a reference, mixed with others or not, or a debt the lot
        // lowers: their regeneration, once for this pass, but for a reference the checks had
        // regenerated on this same tree, whose inputs have not changed since; the reds that remain
        // then go each to its owner.
        const dejaRegenerees =
          ctx.regenereSur && ctx.regenereSur.arbre === passe.arbre ? ctx.regenereSur.noms : [];
        const aRegenerer =
          passeFinale && !regeneration && (k.rouge || k.notes.length > 0)
            ? referencesDesRouges(ctx, k.lieux, k.notes.length > 0).filter(
                r => !dejaRegenerees.includes(r.nom)
              )
            : [];
        if (aRegenerer.length) {
          const noms = aRegenerer.map(r => r.nom);
          geste(ctx, 'regeneration');
          ecrireRapport(
            ctx,
            'controles',
            `${k.resume} ; ${k.rouge ? 'des rouges sont ceux de références' : 'la dette des gardes baisse'} (${noms.join(', ')}) : à leur régénération.`,
            resultat(k.rouge ? 'rouge' : 'vert'),
            `${k.texte}${k.avertissements}`
          );
          // The report of the reds of the plan, which go to the developpeur when a command of the
          // project refuses the lot.
          ctx.aRegenerer = {
            noms,
            rouges: k.tous,
            notes: k.notes,
            entiere: !passe.restreinte,
            auDeveloppeur: k.auDeveloppeur && !k.arbitrer ? k.texte : null,
          };
          etape = REFERENCES;
          finale = true;
        } else if (k.rouge && passeFinale && k.horsTitre.length) {
          arreter(
            'controles',
            `La passe finale est rouge dans ${k.horsTitre.join(', ')}, hors du plan du ticket (${ctx.paquets.join(', ')}) : le développeur n'est pas relancé. Le superviseur étend le plan à ce paquet (\`--etendre\`), le rouge allant ensuite au développeur, ou fait corriger le lot (\`--depuis developpeur\`, le rouge en \`--contexte\`).`
          );
        } else if (k.rouge && !k.auDeveloppeur) {
          arreter(
            'controles',
            `Aucun paquet du plan (${ctx.paquets.join(', ')}) ne tient ce rouge de la passe finale (un rouge de la racine, ou que rien ne situe).`
          );
        } else if (k.rouge && k.arbitrer) {
          arreter(
            'controles',
            'Les rouges du plan sont des constats à arbitrer : aucun développeur ne les tranche.'
          );
        } else if (k.rouge && rien) {
          // The stop stands at the developpeur's step, which a resumption plays again.
          arreter('sans-livraison', rien, CODE);
        } else if (k.rouge && suivante <= SEANCES_DEVELOPPEUR) {
          ecrireRapport(
            ctx,
            'controles',
            `${k.resume} ; développeur relancé (séance ${suivante}).`,
            resultat('rouge'),
            `${k.texte}${k.avertissements}`
          );
          etape = CODE;
          tentative = suivante;
        } else if (k.rouge) {
          arreter('controles', null);
        } else if (k.aRepasser) {
          arreter('a-repasser', null);
        } else if (!passeFinale && k.references.length) {
          // The checks green but for reds of references: their regeneration, then the final pass,
          // which plays once, on the regenerated tree, as make remakes a generated file before
          // what reads it.
          geste(ctx, 'regeneration');
          ecrireRapport(
            ctx,
            'controles',
            `${k.resume}.`,
            resultat('vert'),
            `${k.resume}.${k.avertissements}`
          );
          ctx.renvoiAuTestwriter = null;
          ctx.aRegenerer = {
            noms: k.references.map(r => r.nom),
            notes: [],
            avantLaPasse: true,
          };
          etape = REFERENCES;
          tentative = 0;
          finale = true;
        } else {
          ecrireRapport(
            ctx,
            'controles',
            `${k.resume}.`,
            resultat('vert'),
            `${k.resume}.${k.avertissements}`
          );
          // Green checks: a sending of the developpeur to the testwriter may come again.
          ctx.renvoiAuTestwriter = null;
          if (!passeFinale) {
            // The checks green: the final pass, its sessions counted apart.
            etape = CONTROLES;
            tentative = 0;
            finale = true;
          } else {
            // The whole pass green on this lot; the lot the last review accepted goes to the
            // integration, any other to the review.
            // A pass after a regeneration counts as whole after a whole one: restricted to what
            // the regeneration changed, or not played when it changed nothing.
            if (passe.arbre && (regeneration ? regeneration.entiere : !passe.restreinte)) {
              ctx.verifie = passe.arbre;
            }
            const r = relectureDAvant(ctx);
            const accepte =
              r?.fiche.verdict === 'ACCEPTÉ' && passe.arbre && r.lot.arbre === passe.arbre;
            etape = accepte ? INTEGRATION : RELECTURE;
          }
        }
      } else if (etape === REFERENCES) {
        // The references to regenerate and the reds of the pass before, kept in the state from
        // the final pass that called for them, so that a regeneration resumed knows them.
        const a = ctx.aRegenerer;
        if (!a) {
          throw new Arret(
            'references',
            "L'état du circuit ne garde pas les références à régénérer : la passe finale les redonne (`--depuis developpeur`)."
          );
        }
        // A command of the project that refuses beside reds of the plan, within the developpeur's
        // sessions: the copy restored, those reds go to him with its output, the final pass after.
        const suivante = tentative + 1;
        const auLot = Boolean(a.auDeveloppeur) && suivante <= SEANCES_DEVELOPPEUR;
        const g = regenerer(ctx, a.noms, a.notes, Boolean(a.avantLaPasse), auLot);
        if (g.refus) {
          const texte = [
            `La régénération des références refuse le lot ; la copie est rendue telle qu'avant elle, et les rouges du plan vont au développeur (séance ${suivante}).`,
            '',
            ...g.refus,
          ].join('\n');
          ecrireRapport(ctx, 'references', texte, { regenerees: [], fichiers: [] });
          rapport = `${texte}\n\n${a.auDeveloppeur}`;
          ctx.aRegenerer = null;
          etape = CODE;
          tentative = suivante;
          finale = true;
          continue;
        }
        ecrireRapport(ctx, 'references', g.texte, {
          regenerees: g.regenerees,
          fichiers: g.fichiers,
        });
        // After the checks, the final pass that is due, on the regenerated tree, which does not
        // regenerate again the references just regenerated on it; after a final pass, the pass
        // restricted to what the regeneration changed, with the reds of the pass before.
        ctx.regenereSur = a.avantLaPasse ? { arbre: arbreDeLaCopie(ctx), noms: a.noms } : null;
        ctx.regeneration = a.avantLaPasse
          ? null
          : {
              restreinte: g.restreinte,
              entiere: a.entiere,
              reportes: { rouges: a.rouges, rejouee: g.fichiers.length > 0 },
            };
        ctx.aRegenerer = null;
        etape = CONTROLES;
        finale = true;
      } else if (etape === RELECTURE) {
        const v = await relire(ctx);
        // A question for the owner: nothing is committed nor relaunched before his answer.
        if (v.fiche.question) {
          throw new Arret(
            'besoin',
            `Le relecteur attend une réponse : ${v.fiche.question}\n\nLe verdict :\n\n${v.texte}`,
            {
              piece: v.fiche.piece,
              question: `Le relecteur demande : ${v.fiche.question}`,
              qui: RESPONSABLE,
            }
          );
        }
        if (v.verdict === 'ACCEPTÉ') {
          // The review that accepts the lot closes every finding.
          ctx.constats = [];
        }
        if (v.verdict === 'ACCEPTÉ' && (!v.arbre || ctx.verifie === v.arbre)) {
          commenter(ctx, 'relecture', 'ACCEPTÉ ; le lot va à l’intégration.');
          etape = INTEGRATION;
        } else if (v.verdict === 'ACCEPTÉ') {
          // The whole final pass has not played on the lot accepted: it plays once, then the
          // integration.
          commenter(
            ctx,
            'relecture',
            'ACCEPTÉ ; la passe finale entière, qui n’a pas joué sur ce lot, puis l’intégration.'
          );
          etape = CONTROLES;
          tentative = 0;
          finale = true;
        } else {
          // The reviews since the last ACCEPTÉ: a lot the queue sent back starts a new count.
          const rendus = rendusDepuisAccepte(ctx);
          if (rendus >= RELECTURES) {
            throw new Arret(
              'relecture-arret',
              `${rendus} relectures ont rendu le lot : le circuit s'arrête à la troisième.\n\nLe dernier verdict :\n\n${v.texte}`
            );
          }
          ctx.constats = constatsOuverts(ctx, v.fiche, v.texte);
          const auTestwriter = ouverts(ctx, 'testwriter').length > 0;
          etape = auTestwriter ? TESTS : CODE;
          tentative = 1;
          rapport = null;
          finale = false;
          commenter(
            ctx,
            'relecture',
            `RENDU (relecture ${rendus}) ; le circuit relance ${auTestwriter ? 'le testwriter' : 'le développeur'}, ses ${ctx.constats.length} constat(s) ouvert(s) dans la consigne de chaque séance, puis la passe finale restreinte à ce que le correctif change et à ses dépendants, et le relecteur sur la différence.`
          );
        }
      } else if (etape === INTEGRATION) {
        const r = integrer(ctx);
        if (r.code === A_REPASSER) throw new Arret('a-repasser', fin(r.sortie, 40));
        if (r.code !== 0) {
          throw refuser(
            ctx,
            `Le script d'intégration refuse le lot (code ${r.code}).\n\n${fin(r.sortie, 60)}`,
            `$ node ${INTEGRER} ${r.args.join(' ')}\n${fin(r.sortie, 30)}`
          );
        }
        ctx.refus = null;
        const branche = `agent/${ctx.ticket}`;
        const commit = spawnSync('git', ['-C', ctx.racine, 'rev-parse', '--short', branche], {
          encoding: 'utf8',
        }).stdout.trim();
        commenter(
          ctx,
          'integration',
          `${commit ? `commit ${commit} sur ${branche}` : 'lot commité'} ; la branche est en file.`
        );
        etape = EN_FILE;
      } else if (etape === EN_FILE) {
        const f = file(ctx);
        if (f.etat === 'ferme') {
          commenter(ctx, 'file', `${f.raison}.`);
          etape = TRI;
          continue;
        }
        if (f.etat === 'en-file') throw new Arret('a-repasser', f.raison);
        throw refuser(ctx, `La file rouvre le ticket.\n\n${f.raison}`, f.raison);
      } else if (etape === TRI) {
        // The lot is on main: the tri of its discoveries, which neither stops nor undoes it.
        await trier(ctx);
        ecrireEtat(ctx, { ...etat, etape: 'integre', code: 0 });
        return { code: 0 };
      } else {
        throw new Usage(`étape inconnue dans l'état : ${etape}`);
      }
    } catch (e) {
      if (!(e instanceof Arret)) throw e;
      const code = ARRETS[e.nom];
      const lieu = e.etape ?? etape;
      const arrete = { ...etat, etape: lieu };
      ecrireEtat(ctx, { ...arrete, code, raison: e.nom, rapport: e.rapport });
      // The stop kept with the circuit's results, which the bilan counts.
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        etape: lieu,
        arret: e.nom,
        ...(lieu === CONTROLES && finale ? { finale: true } : {}),
        ...(e.resultat ? { resultat: e.resultat } : {}),
      });
      const ou = ouDansLeCircuit({ etape: lieu, finale: finale && lieu === CONTROLES });
      commenter(
        ctx,
        lieu,
        `arrêt ${e.nom} à ${ou} — ${premiereLigne(e.rapport)} — journal ${ctx.journal}`
      );
      process.stderr.write(`⛔ Circuit de ${ctx.ticket} arrêté : ${e.nom}, à ${ou}.\n`);
      return {
        code,
        nom: e.nom,
        rapport: e.rapport,
        rouges: e.rouges,
        motif: e.motif,
        piece: e.piece,
        question: e.question,
        qui: e.qui,
        etat: arrete,
      };
    } finally {
      if (menee) inscrireEtape(ctx, menee);
    }
  }
}

// What changed for a developpeur relaunched on the integration's refusal of the lot he left as it was.
const CHANGE_DU_REFUS =
  'l’intégration refuse ton lot, et ta séance n’a changé aucun fichier du plan : son refus, dans le rapport ci-dessous, est le rouge à lever';

// The stop « integration » of the motive <rapport> and the piece <piece>, the refusal of the lot
// kept in the state (`refus`: `{ rapport, piece, empreinte, lance, relance }`, the fingerprint of
// the plan refused, whether a --depuis developpeur launched the developpeur on it, and whether a
// session so launched already left it unchanged once), which --depuis developpeur gives the
// developpeur.
function refuser(ctx, rapport, piece) {
  ctx.refus = { rapport, piece, empreinte: empreinte(ctx), lance: false, relance: false };
  return new Arret('integration', rapport, { piece });
}

// The developpeur's report on the integration's refusal <refus>: the red to lift, which the checks
// of the copy, green, do not see.
const rapportDuRefus = refus =>
  `L’intégration refuse ce lot : son refus, ci-dessous, est le rouge à lever ; les contrôles de ta copie, verts, ne le voient pas, et le lot ne repasse à l’intégration qu’avec un changement.\n\n${refus.rapport}`;

// The gesture <genre> of the circuit (scripts/etapes.mjs, GESTES), with no session: its line at
// the ticket and in the log, with its rule.
function geste(ctx, genre) {
  const g = gesteDe(genre);
  const texte = `${genre} → ${g.geste} (règle : ${g.regle})`;
  commenter(ctx, 'geste', texte);
  entete(ctx, 'geste');
  appendFileSync(ctx.journal, `geste : ${texte}\n`);
}

// The stop <a> (`{ code, nom, rapport, motif, rouges, piece, question, qui, etat }`, `etat` the
// state of the step it stopped) gone up to the supervisor, as a CI calls a person only for what no
// rule settles: its question (`{ arret, fait, piece, question, qui }`: the fact, the first line of
// its motive or its report; its piece, the one it carries, else its reds with their file and line,
// else the end of the log; the question of its kind, scripts/etapes.mjs MONTEES, after the agent's
// own; who must answer it) kept in the state, written at the ticket and on the error output. Its
// exit code.
function monter(ctx, a) {
  const m = monteeDe(a.nom);
  const fait = premiereLigne(a.motif ?? a.rapport) || a.nom;
  const rouges = (a.rouges ?? [])
    .map(r => [`- ${r.paquet} : ${r.texte}`, ...(r.detail ? ['', r.detail] : [])].join('\n'))
    .join('\n');
  const piece =
    String(a.piece ?? '').trim() ||
    rouges ||
    `Le journal du ticket, ${ctx.journal} :\n${fin(lire(ctx.journal), 20)}`;
  const question = a.question ? `${a.question}\n\n${m.question}` : m.question;
  const qui = a.qui ?? m.qui;
  ecrireEtat(ctx, {
    ...a.etat,
    code: a.code,
    raison: a.nom,
    rapport: a.rapport,
    question: { arret: a.nom, fait, piece, question, qui },
  });
  const ou = ouDansLeCircuit({ ...a.etat, raison: a.nom });
  commenter(ctx, 'question', `${a.nom} à ${ou} — ${fait} — au ${qui} : ${question}`);
  process.stderr.write(
    `⛔ Circuit de ${ctx.ticket} : question au ${qui} (${a.nom}, à ${ou}), dans ${ctx.etat} ; la réponse : \`npx grillhouse circuit ${ctx.ticket} --reprendre\`, \`--depuis <testwriter|developpeur>\`, \`--etendre <paquet>\` ou \`--arreter\`.\n`
  );
  return a.code;
}

// The run from <d> (where `depart` starts it) to its end: 0 at « integre »; a stop the gesture
// `a-repasser` settles ends at 75, said at the ticket; every other stop goes up to the supervisor
// (monter). Its exit code.
async function conduire(ctx, d) {
  const a = await derouler(ctx, d);
  if (a.code === 0) return 0;
  if (a.nom === 'a-repasser') {
    geste(ctx, 'a-repasser');
    return a.code;
  }
  return monter(ctx, a);
}

// Where the run starts: after a stop « integration », on --depuis developpeur, the developpeur,
// the refusal (`refus`) as his report, the session so launched marked (`lance`), as a merge queue
// sends the lot back to its author with the log of its check; else the step a --depuis names (the
// testwriter's, which makes the lot again, the refusal dropped, or the developpeur's), the step of
// the state <e> (null without one) on --reprendre, the integration or the queue played again on
// the same lot after their stop, as bors retries, else the testwriter, the run starting over.
function depart(ctx, e) {
  if (ctx.depuis === 'developpeur' && e?.raison === 'integration' && ctx.refus) {
    ctx.refus = { ...ctx.refus, lance: true, relance: false };
    return { etape: CODE, tentative: 1, rapport: rapportDuRefus(ctx.refus), finale: false };
  }
  if (ctx.depuis === 'testwriter') ctx.refus = null;
  if (ctx.depuis) {
    return {
      etape: ctx.depuis === 'testwriter' ? TESTS : CODE,
      tentative: 1,
      rapport: null,
      finale: false,
    };
  }
  if (!ctx.reprendre) {
    // The run starts over: no lot verified, no finding of a review open, no refusal, no checks played.
    ctx.verifie = null;
    ctx.constats = [];
    ctx.refus = null;
    ctx.controlesRouges = null;
    return { etape: TESTS, tentative: 1, rapport: null, finale: false };
  }
  if (!e) throw new Usage(`rien à reprendre : ${ctx.etat} n'existe pas.`);
  if (e.etape === 'integre')
    throw new Usage(`rien à reprendre : le lot de ${ctx.ticket} est intégré.`);
  return {
    etape: e.etape,
    tentative: e.etape === CONTROLES ? 0 : 1,
    rapport: e.rapport,
    finale: e.finale === true,
  };
}

// The end of the run, its exit code <code>: an end on a stop kept with the circuit's results
// (`montee`: its code, its stop and the supervisor's session that ran it, `superviseur`, when
// Claude Code names it), from which the bilan measures the wait to the run that answers it, the
// owner's when he writes in that session meanwhile, then the ticket's bilan at the ticket
// (scripts/bilan.mjs); a bilan it cannot write leaves the code as it is.
function aLaFin(ctx, code) {
  try {
    if (code !== 0) {
      const superviseur = process.env.CLAUDE_CODE_SESSION_ID;
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        montee: {
          code,
          raison: ctx.courant?.raison ?? null,
          ...(superviseur ? { superviseur } : {}),
        },
      });
    }
    const texte = ecrireLeBilan(ctx.racine, ctx.ticket);
    commenter(ctx, 'bilan', texte);
  } catch (e) {
    process.stderr.write(`⚠️  bilan non écrit au ticket : ${e.message}\n`);
  }
  return code;
}

// The questions <questions> of a questionneur's sheet, one per line, each with what it aims at.
const lignesDesQuestions = questions =>
  (questions ?? []).map((q, i) => `${i + 1}. (${q.vise}) ${q.question}`).join('\n');

// The open questions <questions> of a plan (`{ question, motif, piece }`), one per line, each with
// why it goes up, when the explorateur wrote it, and its piece.
const lignesOuvertes = questions =>
  questions
    .map((q, i) => `${i + 1}. ${q.motif ? `(${q.motif}) ` : ''}${q.question} (${q.piece})`)
    .join('\n');

// The rubric « ## <titre> » of the project's charter (CLAUDE.md of the main tree), up to the next
// `##` heading, or what stands in its place.
function rubrique(ctx, titre) {
  const lignes = lire(path.join(ctx.racine, 'CLAUDE.md')).split('\n');
  const i = lignes.findIndex(l => l.trim() === `## ${titre}`);
  if (i < 0) return 'absente de la charte du projet (CLAUDE.md)';
  const fin = lignes.findIndex((l, j) => j > i && l.startsWith('## '));
  return (
    lignes
      .slice(i + 1, fin < 0 ? undefined : fin)
      .join('\n')
      .trim() || 'vide'
  );
}

// The meta-frame, the frame's plugin's, read at the plugin's root (scripts/cadre.mjs).
const METACADRE = path.join(GREFFON, 'METACADRE.md');

// The fingerprint of a plan, its title and its section of criteria, each line without its blank
// lines: the rest of the description (an answer of the supervisor, the open questions, its notes)
// is not the plan, as a CI replays a job only when its inputs move.
const empreinteDuPlan = ({ titre, description }) => {
  const criteres = sectionsDe(description)
    .filter(deCriteres)
    .flatMap(s => [s.tete, ...s.lignes])
    .map(l => l.trim())
    .filter(Boolean);
  return createHash('sha256')
    .update([titre, ...criteres].join('\n'))
    .digest('hex');
};

// Whether the plan of fingerprint <empreinte> has passed: a plan whose questioning left no
// question open, or the supervisor's resumption of its stop.
const planPasse = (ctx, empreinte) =>
  lesFiches(ctx).some(e => e.role === AUTEUR_DU_CIRCUIT && e.plan?.empreinte === empreinte);

// The heading of the section of the open questions in a plan's description.
const QUESTIONS_OUVERTES = '## Questions ouvertes';

// The sections of the description <description>: the text before its first `##` heading, then
// each heading with its lines.
function sectionsDe(description) {
  const sections = [{ tete: null, lignes: [] }];
  for (const l of description.trimEnd().split('\n')) {
    if (l.startsWith('## ')) sections.push({ tete: l, lignes: [] });
    else sections.at(-1).lignes.push(l);
  }
  return sections;
}

// Whether <section> is the section of criteria: a `##` heading that begins with « Critères », as
// scripts/composants-affectes.mjs reads it.
const deCriteres = section => Boolean(section.tete?.startsWith('## Critères'));

// The text of the numbered line <ligne> (« 2. Le critère. »), or null for any other line.
function numerotee(ligne) {
  const i = ligne.indexOf('. ');
  const numero = i > 0 ? ligne.slice(0, i).trim() : '';
  return numero && [...numero].every(c => c >= '0' && c <= '9') ? ligne.slice(i + 2).trim() : null;
}

// The ticket's description <description> as it was before the plan, with the criteria the plan adds
// <criteres> in its section of criteria (a section « ## Critères » at its end without one) and its
// open questions <questions> in their section after it, absent without one; the rest of it as it
// was. The criteria already written stay as they are, the decision of the owner: each criterion the
// plan adds follows them, numbered after them. Written again from the description before the plan,
// the description holds the criteria of the explorateur's last sheet alone.
function decrireLePlan(description, criteres, questions) {
  const gardees = sectionsDe(description).filter(s => s.tete !== QUESTIONS_OUVERTES);
  let i = gardees.findIndex(deCriteres);
  if (i < 0) {
    gardees.at(-1).lignes.push('');
    gardees.push({ tete: '## Critères', lignes: [] });
    i = gardees.length - 1;
  }
  const ecrits = gardees[i].lignes.map(numerotee).filter(c => c !== null);
  const ajouts = criteres.map(c => c.trim());
  const avant = [...gardees[i].lignes];
  while (avant.length && avant.at(-1).trim() === '') avant.pop();
  const liste = ajouts.map((c, n) => `${ecrits.length + n + 1}. ${c}`);
  gardees[i] = {
    tete: gardees[i].tete,
    lignes: [...(avant.length ? avant : ['']), ...liste, ''],
  };
  if (questions.length) {
    gardees.splice(i + 1, 0, {
      tete: QUESTIONS_OUVERTES,
      lignes: ['', lignesOuvertes(questions), ''],
    });
  }
  return gardees
    .flatMap(s => (s.tete ? [s.tete, ...s.lignes] : s.lignes))
    .join('\n')
    .trim();
}

// The plan written at the ticket by the circuit: the packages <plan> (each a directory of the
// copy, `ctx.resoudre`) in its title, after its last « — », as a title names its components, and
// the description <description> when given, by one call of bd when either changes; the packages
// become the run's plan (`ctx.paquets`), the list the envelope of every later session writes. The
// title.
function ecrireLePlan(ctx, plan, description = null) {
  const t = leTicket(ctx);
  const parts = t.titre.split(' — ');
  const titre = [...parts.slice(0, -1), plan.map(c => nomDe(ctx, c)).join(', ')].join(' — ');
  const options = [
    ...(titre === t.titre ? [] : ['--title', titre]),
    ...(description === null || description === t.description ? [] : ['-d', description]),
  ];
  if (options.length) {
    const r = ctx.bd('update', ctx.ticket, ...options);
    if (r.status !== 0) throw new Error(`plan de ${ctx.ticket} non écrit : ${r.stderr}`);
  }
  ctx.paquets = plan;
  return titre;
}

// What makes the packages of the sheet <fiche> of the explorateur out of conformity, or null: a
// package that names neither a package nor a path of the repository, one package named twice
// (by its name and by its path), or a component of the survey of the plan's description
// <description> (scripts/composants-affectes.mjs, `releve`, played by the circuit with no
// session, as it checks the packages) that the sheet neither puts in its packages nor sets apart
// with its reason (`ecartes`). A session that writes one is resumed once (`jusquALaFiche`).
function fautesDesPaquets(ctx, fiche, description) {
  const dossier = p => {
    try {
      return ctx.resoudre(p);
    } catch {
      return null;
    }
  };
  const dossiers = fiche.paquets.map(dossier);
  const inconnus = fiche.paquets.filter((p, i) => dossiers[i] === null);
  if (inconnus.length) {
    return `paquets : ${inconnus.join(', ')} ne nomme ni un paquet ni un chemin du dépôt`;
  }
  const doubles = fiche.paquets.filter((p, i) => dossiers.indexOf(dossiers[i]) !== i);
  if (doubles.length) {
    return `paquets : ${doubles.join(', ')} nomme un paquet déjà nommé dans le plan`;
  }
  const tenus = [...dossiers, ...(fiche.ecartes ?? []).map(e => dossier(e.composant))];
  const couvre = (d, c) => d === '.' || c === d || c.startsWith(`${d}/`);
  const racine = existsSync(ctx.copie) ? ctx.copie : ctx.racine;
  const absents = releve(racine, description).composants.filter(c => {
    const d = dossier(c);
    return d !== null && !tenus.some(t => t !== null && couvre(t, d));
  });
  return absents.length
    ? `paquets : ${absents.join(', ')}, que le relevé nomme, n'est ni dans les paquets ni dans les écartés (ecartes, avec sa raison)`
    : null;
}

// The components the sheet <fiche> of the explorateur sets apart, each with its reason, as the
// circuit writes them at the ticket; empty without one.
const ecartsDe = fiche =>
  (fiche.ecartes ?? []).length
    ? ` ; écartés : ${fiche.ecartes.map(e => `${e.composant} (${e.raison})`).join(' ; ')}`
    : '';

// The plan of the ticket (step 1 of scripts/etapes.mjs) before its testwriter, as an RFC: its
// author writes it after surveying what exists, a review reads it once,
// the author answers once, and what stays open goes to who decides. One session of the
// explorateur, out of the envelope, writes the plan in its sheet (its criteria, the packages to
// touch, its open questions), which the circuit writes at the ticket (`ecrireLePlan`); one session
// of the questionneur reads it once; on its questions (its disagreement as one), the explorateur's
// session, resumed, answers once, CHANGE or GARDE by question, its sheet the plan as it becomes; a
// sheet without a line by question put is asked again once of that session, and a question it
// still leaves without an answer stays open with its own. Each session's work is named in
// the state while it runs (`questionnement`); the exchange is written at the ticket and its end
// kept with the circuit's results (`questionnement`, which the bilan counts). A plan that has
// passed, its title and criteria unchanged since (`empreinteDuPlan`), passes. Null when nothing
// stays open (the plan passes, kept as `plan`); else the exit code of the question it goes up with,
// « questionnement », the open questions as its piece, or the stop of a session that cannot end.
async function lePlan(ctx) {
  if (planPasse(ctx, empreinteDuPlan(leTicket(ctx)))) return null;
  const etat = () => ({
    etape: TESTS,
    tentative: 1,
    code: null,
    raison: null,
    rapport: null,
  });
  const dire = (etape, texte) => commenter(ctx, etape, texte);
  // The session of <role> on the plan, its work named in the state while it runs: its sheet.
  const session = async (role, texte, options) => {
    ecrireEtat(ctx, { ...etat(), questionnement: { objet: 'plan', role, seance: options.id } });
    const fiche = await jusquALaFiche(ctx, role, texte, {
      horsEnveloppe: true,
      ...options,
    });
    ecrireEtat(ctx, etat());
    return fiche;
  };
  // The description before the plan, from which each sheet's plan is written.
  const avant = leTicket(ctx).description;
  const explorateur = {
    droits: horsDeLEnveloppe(ctx, EXPLORATEUR, 'sonnet'),
    id: randomUUID(),
    valider: f => fautesDesPaquets(ctx, f, decrireLePlan(avant, f.criteres, f.questions)),
  };
  try {
    const t = leTicket(ctx);
    let plan = await session(
      EXPLORATEUR,
      consigne(
        {
          depot: ctx.racine,
          ticket: ctx.ticket,
          sujet: ctx.sujet,
          titre: t.titre,
          description: t.description.trim() || 'aucune',
          notes: t.notes.trim() || 'aucune',
          contexte: ctx.contexte || 'aucun',
        },
        5
      ),
      explorateur
    );
    ecrireLePlan(
      ctx,
      plan.paquets.map(ctx.resoudre),
      decrireLePlan(t.description, plan.criteres, plan.questions)
    );
    const ouvertesDuPlan = plan.questions.length ? `\n${lignesOuvertes(plan.questions)}` : 'aucune';
    dire(
      'plan',
      `l'explorateur écrit le plan — paquets : ${plan.paquets.join(', ')}${ecartsDe(plan)} ; ${plan.criteres.length} critère(s) ajouté(s) ; questions ouvertes : ${ouvertesDuPlan}`
    );
    const ecrit = leTicket(ctx);
    const lu = await session(
      QUESTIONNEUR,
      consigne(
        {
          depot: ctx.racine,
          ticket: ctx.ticket,
          sujet: ctx.sujet,
          objet: 'le plan',
          proposition: `le plan du ticket, que l'explorateur a écrit : son titre, « ${ecrit.titre} », dont les composants sont les paquets à toucher, et sa description (LE TICKET, ci-dessous), ses critères et ses questions ouvertes.`,
          metacadre: lire(METACADRE).trim(),
          arbitrer: rubrique(ctx, 'Comment on arbitre'),
          monte: rubrique(ctx, 'Ce qui monte au superviseur'),
          description: ecrit.description.trim() || 'aucune',
        },
        4
      ),
      { droits: horsDeLEnveloppe(ctx, QUESTIONNEUR, 'sonnet'), id: randomUUID() }
    );
    // The questions the explorateur answers: the questionneur's, or its disagreement as one.
    const posees =
      lu.issue === 'AUCUNE'
        ? []
        : lu.issue === 'DÉSACCORD'
          ? [lu.desaccord]
          : lu.questions.map(q => q.question);
    dire(
      'questionnement',
      lu.issue === 'AUCUNE'
        ? 'le plan — aucune question du questionneur.'
        : lu.issue === 'DÉSACCORD'
          ? `le plan — Le désaccord du questionneur : ${lu.desaccord}`
          : `le plan — Les questions du questionneur :\n${lignesDesQuestions(lu.questions)}`
    );
    let reponses = [];
    if (posees.length) {
      plan = await session(
        EXPLORATEUR,
        consigne(
          {
            ticket: ctx.ticket,
            sujet: ctx.sujet,
            questions: posees.map((q, i) => `${i + 1}. ${q}`).join('\n'),
          },
          6
        ),
        {
          ...explorateur,
          premiere: 'reprend',
          // A line of `reponses` by question put, asked again once; after it, a question without
          // its line stays open.
          valider: (f, essai) =>
            explorateur.valider(f) ?? (essai === 1 ? reponsesAuxQuestions(f, posees.length) : null),
        }
      );
      reponses = plan.reponses ?? [];
      const lignes = reponses.map(r => `${r.numero}. ${r.reponse} — ${r.texte}`).join('\n');
      dire(
        'questionnement',
        `la réponse de l'explorateur${ecartsDe(plan)} :\n${lignes || 'aucune'}`
      );
    }
    // What stays open: the plan's own questions, then each question left without an answer.
    const ouvertes = [
      ...plan.questions,
      ...posees
        .filter((q, i) => !reponses.some(r => Number(r.numero) === i + 1))
        .map(question => ({ question, piece: 'question du questionneur, sans réponse' })),
    ];
    if (posees.length) {
      ecrireLePlan(
        ctx,
        plan.paquets.map(ctx.resoudre),
        decrireLePlan(t.description, plan.criteres, ouvertes)
      );
    }
    const empreinte = empreinteDuPlan(leTicket(ctx));
    inscrire(ctx, {
      role: AUTEUR_DU_CIRCUIT,
      questionnement: {
        objet: 'plan',
        questions: posees.length,
        change: reponses.some(r => r.reponse === 'CHANGE'),
        issue: lu.issue,
        ouvertes: ouvertes.length,
        empreinte,
      },
    });
    if (!ouvertes.length) {
      dire('questionnement', 'le plan passe : aucune question ouverte.');
      inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, plan: { empreinte } });
      return null;
    }
    const liste = lignesOuvertes(ouvertes);
    inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: TESTS, arret: 'questionnement' });
    return monter(ctx, {
      code: ARRETS.questionnement,
      nom: 'questionnement',
      rapport: `Des questions du plan restent ouvertes après la réponse de l'explorateur.\n\n${liste}\n\nL'échange est au ticket (\`Circuit · … · questionnement\`).`,
      piece: liste,
      etat: etat(),
    });
  } catch (x) {
    // A session of the plan that cannot end goes up, before any testwriter.
    if (!(x instanceof Arret)) throw x;
    return monter(ctx, {
      code: ARRETS[x.nom],
      nom: x.nom,
      rapport: x.rapport,
      piece: x.piece,
      etat: etat(),
    });
  }
}

// The process <cible> (a process group as -<groupe>) stopped, as a cancelled job of GitLab CI:
// SIGTERM, then SIGKILL when it still lives after ARRET_MS; true once it is gone.
const ARRET_MS = 10_000;
async function terminer(cible) {
  const vit = () => {
    try {
      process.kill(cible, 0);
      return true;
    } catch (x) {
      return x.code === 'EPERM';
    }
  };
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (!vit()) return true;
    try {
      process.kill(cible, signal);
    } catch {
      return true;
    }
    const limite = Date.now() + ARRET_MS;
    while (vit() && Date.now() < limite) await new Promise(r => setTimeout(r, 200));
  }
  return !vit();
}

// The circuit running on the ticket, the process its state <e> names (`processus`), stopped on
// the supervisor's word, as GitLab CI cancels a pipeline, said at the ticket; then the session it
// led (`seance`, its process group), which outlives it. The state as the stopped circuit leaves
// it, its session gone.
async function arreterLeCircuit(ctx, e) {
  const pid = e.processus;
  if (pid !== process.pid && leMemeVivant(pid, e.depart)) {
    commenter(
      ctx,
      'arret',
      `le circuit en cours (processus ${pid}) s'arrête, sa séance avec lui, sur le mot du superviseur.`
    );
    if (!(await terminer(pid))) {
      throw new Error(`le circuit en cours (processus ${pid}) ne s'arrête pas.`);
    }
  }
  const lu = existsSync(ctx.etat) ? JSON.parse(readFileSync(ctx.etat, 'utf8')) : e;
  if (lu.seance && signalerGroupe(lu.seance, 0)) await terminer(-lu.seance);
  return { ...lu, seance: null };
}

// The circuit stopped on the supervisor's word (`--arreter`): a circuit running on the ticket
// stops first, its session with it; the state keeps its step, its stop « arrete », its question
// lifted, said at the ticket. Its exit code, 0.
async function arreter(ctx, e) {
  if (!e) throw new Usage(`--arreter : ${ctx.etat} n'existe pas, aucun circuit à arrêter.`);
  if (e.etape === 'integre') throw new Usage(`--arreter : le lot de ${ctx.ticket} est intégré.`);
  const lu = await arreterLeCircuit(ctx, e);
  ctx.constats = [...(lu.constats ?? [])];
  ctx.verifie = lu.verifie ?? null;
  ctx.reprise = lu.reprise ?? null;
  ctx.refus = lu.refus ?? null;
  ecrireEtat(ctx, {
    etape: lu.etape,
    tentative: lu.tentative,
    code: null,
    raison: 'arrete',
    rapport: ctx.contexte
      ? `Le superviseur arrête le circuit : ${ctx.contexte}`
      : (lu.rapport ?? null),
    finale: lu.finale === true,
  });
  const pourquoi = ctx.contexte ? ` : ${ctx.contexte}` : '.';
  commenter(ctx, 'arret', `le superviseur arrête le circuit${pourquoi}`);
  return 0;
}

// The plan extended by the supervisor to the packages of `--etendre` (each a path or a package
// name of the repository, else a Usage): each one enters the title before the first package of
// the plan whose package.json depends on it, else at its end, written by bd and said at the
// ticket. With the state <e>, the run then resumes the step under way, as `--reprendre` does, the
// question of the stop and the text of `--contexte` as the context of its sessions; a stop
// « sans-livraison » whose developpeur's last sheet sends the red to the testwriter (`renvoi`,
// twice in a row) resumes at the step of the role it names, the testwriter's, as a retry plays the
// job that failed. Without a state, it starts on the plan extended. The state the run resumes
// from.
function etendre(ctx, e) {
  const gagnes = [...new Set(ctx.etendre.map(ctx.resoudre))].filter(c => !ctx.paquets.includes(c));
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  const pkg = c => liste.find(p => p.dossier === c)?.pkg ?? null;
  const lit = (lecteur, fournisseur) => {
    const nom = pkg(fournisseur)?.name;
    const p = pkg(lecteur);
    return Boolean(
      nom && p && [p.dependencies, p.devDependencies, p.peerDependencies].some(d => d && nom in d)
    );
  };
  const plan = [...ctx.paquets];
  for (const c of gagnes) {
    const i = plan.findIndex(x => lit(x, c));
    plan.splice(i < 0 ? plan.length : i, 0, c);
  }
  const titre = ecrireLePlan(ctx, plan);
  // The plan the supervisor extends has passed: it is written, questioned no more.
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    plan: { empreinte: empreinteDuPlan(leTicket(ctx)) },
  });
  commenter(
    ctx,
    'plan',
    `le superviseur étend le plan à ${ctx.etendre.join(', ')} : ${titre.split(' — ').at(-1)}.`
  );
  if (!e) return e;
  ctx.contexte =
    [e.question ? `${e.question.fait}\n\n${e.question.piece}` : null, ctx.contexte]
      .filter(Boolean)
      .join('\n\n') || null;
  ctx.reprendre = true;
  const renvoi =
    e.etape === CODE && e.raison === 'sans-livraison'
      ? fichesDe(ctx, 'developpeur').at(-1)?.renvoi
      : null;
  return renvoi?.role === 'testwriter' ? { ...e, etape: TESTS } : e;
}

export async function main(argv) {
  let ctx = null;
  try {
    ctx = contexte(lireArguments(argv));
    mkdirSync(path.dirname(ctx.copie), { recursive: true });
    let e = existsSync(ctx.etat) ? JSON.parse(readFileSync(ctx.etat, 'utf8')) : null;
    // The findings of the reviewer still open, the lot the whole final pass verified, the session a
    // relaunch resumes, the references a regeneration has to run, the integration's refusal of
    // the lot, and the red output of the last checks, kept from one run to the next.
    ctx.constats = [...(e?.constats ?? [])];
    ctx.verifie = e?.verifie ?? null;
    ctx.reprise = e?.reprise ?? null;
    ctx.aRegenerer = e?.aRegenerer ?? null;
    ctx.refus = e?.refus ?? null;
    ctx.controlesRouges = e?.controlesRouges ?? null;
    // The supervisor's answers to a question: stop the circuit, or extend its plan and resume.
    if (ctx.arreter) return await arreter(ctx, e);
    // A circuit that outlives its caller is still the ticket's: no second run beside it.
    if (e && e.processus !== process.pid && leMemeVivant(e.processus, e.depart)) {
      throw new Usage(
        `un circuit tourne déjà sur ${ctx.ticket} (processus ${e.processus}) : il mène le ticket à sa fin, \`--arreter\` l'arrête.`
      );
    }
    if (ctx.etendre) {
      if (e?.etape === 'integre')
        throw new Usage(`--etendre : le lot de ${ctx.ticket} est intégré.`);
      e = etendre(ctx, e);
    }
    // The supervisor's resumption of the questioning lets the plan pass as it is now.
    if (ctx.reprendre && e?.raison === 'questionnement') {
      commenter(
        ctx,
        'questionnement',
        'le plan passe tel qu’il est, sur la reprise du superviseur.'
      );
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        plan: { empreinte: empreinteDuPlan(leTicket(ctx)) },
      });
    }
    const d = depart(ctx, e);
    // A session a dead circuit left running ends before this run launches its own.
    await attendreLaSeance(ctx, e?.seance);
    // A ticket labelled arbitrage starts and resumes only on the arbitrage its integration will
    // ask for: the integration's rule, before any session.
    const arbitrage = refusArbitrage({ id: ctx.ticket, ...leTicket(ctx) }, lesCommentaires(ctx));
    if (arbitrage) {
      return aLaFin(
        ctx,
        monter(ctx, {
          code: ARRETS.besoin,
          nom: 'besoin',
          rapport: arbitrage,
          piece: `$ bd show ${ctx.ticket} --json ; bd comments ${ctx.ticket} --json\n${arbitrage}`,
          question: `${arbitrage} L'arbitrage s'écrit au ticket (« ## Arbitrage — … », tranché ou répondu par le responsable), puis \`--reprendre\`.`,
          // From the testwriter, the plan comes first: the stop is at « 1 Plan ».
          etat: d.etape === TESTS ? { ...d, questionnement: { objet: 'plan' } } : d,
        })
      );
    }
    // From the testwriter: the plan, which the explorateur writes and the questionneur reads once.
    if (d.etape === TESTS) {
      const arret = await lePlan(ctx);
      if (arret !== null) return aLaFin(ctx, arret);
    }
    return aLaFin(ctx, await conduire(ctx, d));
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    process.stderr.write(
      `usage: npx grillhouse circuit <ticket> [--reprendre | --depuis <testwriter|developpeur>] [--contexte <texte>] | --etendre <paquet>[,<paquet>…] [--contexte <texte>] | --arreter [--contexte <motif>]\n⛔ ${e.message}\n`
    );
    return CODE_USAGE;
  } finally {
    ctx?.base.fermer();
  }
}

// The entry: the run as a daemon (scripts/demon.mjs), apart from its caller.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await executerEnDemon(import.meta.filename, process.argv.slice(2), main);
}
