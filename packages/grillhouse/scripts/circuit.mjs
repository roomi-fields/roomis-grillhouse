// The circuit of one ticket, as a merge request: one author, a series of tests and of code, a CI
// on the whole, a review (grillhouse-3uv.95.6). The plan; one testwriter for the whole ticket, in
// the envelope of every package of its plan, and the proof of the red; one developpeur on the
// whole plan, and its checks; the final pass, then the reviewer, and on its ACCEPTÉ the
// integration, which commits the lot on the ticket's branch and puts that branch in the queue;
// then the queue, which brings it onto main, pushes and reads the CI, and the circuit ends on the
// state of the ticket the queue leaves. No component is a unit of the circuit: every step is one
// for the whole ticket. As a CI applies its rules (retry, regenerate, skip a job without object)
// without asking anyone and calls a person only for what no rule settles (the approval of a
// review), the circuit makes the mechanical gestures itself, with no session (GESTES of
// scripts/etapes.mjs), and every other stop goes up to the supervisor: its state carries the
// question (`question`: the fact, its piece, file:line or command and output, the question, and
// who must answer it, MONTEES of scripts/etapes.mjs). He answers by a command of the circuit,
// `--reprendre` (with `--contexte`) or `--depuis`, `--etendre <paquet>`, or `--arreter`, and
// carries to the owner what is his (`qui` responsable). So the supervisor is woken only by a
// question no rule settles. Witness: BP 320.9, sixteen components played one after the other,
// 118 min of green steps played again, and a finding of the reviewer on `exemplar` lost six times.
//
// This module is the code of the circuit's acts: the workflow of a ticket under Temporal
// (src/temporal/circuit/deroule.ts) leads the run, and plays each act in a process of its own
// (scripts/faits-du-circuit.mjs), which calls the functions below (the opening, a step of the plan,
// the preparation of a pass, a fact, a stop, the end). The command `npx grillhouse circuit` is the
// client of that workflow (src/temporal/circuit/commande.ts): it puts a ticket in the queue of the
// tickets of the project, answers a stop, or stops the circuit. A question wakes the supervisor by
// the wait of the questions (`npx grillhouse superviseur --attendre`, scripts/superviseur.mjs),
// which reads the server, and the normal end of a circuit wakes no one: the board shows it.
//
// The decisions of each step (the step that follows, its attempt, its report, its stop) are the
// functions without input nor output of scripts/transitions.mjs (`transition`, `apresLaPreuve`,
// `arretDuTestwriterSaute`, `arretDuGesteMecanique`…), as a workflow of Temporal decides on the
// results of its activities: the circuit reads the facts they ask for (a session, a pass, a reading
// of the copy) and plays the effects they return (grillhouse-4nr.5).
//
// The circuit decides on structured results only (scripts/resultats.mjs, the one module of their
// formats), as Bazel's Build Event Protocol and the JUnit reports carry the outcome of a build:
// the sheet that ends each session, the summaries of Turborepo, the JSON reports of Vitest and the
// SARIF of the guards. It reads no comment, no answer and no log to decide (a guard holds it:
// tests/unit/circuit-sans-texte-libre.spec.ts); the handovers at the ticket are for the human and
// for the next session of their author, the log for the human. Each header of the log, a step's or
// a session's, dates it in local time with its offset (ISO 8601), one time for the whole log.
//
// - The plan is read in the ticket's title, after its last « — », and the ticket holds its
//   « ## Architecture » section, as the launch reads them (scripts/depart-du-ticket.mjs): the launch
//   refuses a ticket that does not, by its name, before any work (`npx grillhouse circuit`), and
//   the opening of each act reads its plan the same way.
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
// - The sheet of the plan names what a component publishes to another (`noms_publies`: the
//   provider, each consumer, its names), which the circuit writes in the description (« ## Noms
//   publiés », after the sort), written again at each plan from the explorateur's last sheet (an
//   empty list erases it, a sheet without the field keeps the section the description holds), as
//   a code owner's approval covers what it reviewed: the guard of the consumers
//   (scripts/langages/typescript/consommateurs-arbitres.mjs) reads that section, and a lot that
//   adds those names to the provider's « Consommateurs » lines passes it with no arbitrage
//   (grillhouse-la3, BPScript 320.14.2.10: a criterion alone named them, the guard refused the
//   lot, and the supervisor wrote the section by hand before a new session).
// - The sheet of the plan says the sort of the ticket (`sorte`, read by `sorteDuPlan` of
//   scripts/resultats.mjs, from the explorateur's last sheet of the plan), which the circuit
//   writes in the description (« ## Sorte », after the criteria) and at the ticket with the plan:
//   mechanical, a gesture without new behaviour, with its reason and the command that makes it;
//   comportement, with its reason, the plan « comportement inchangé » when the lot changes no
//   behaviour; absent or unreadable, comportement, the whole circuit (grillhouse-sos, BPScript
//   320.16: 38 tools moved by mv through the testwriter and the developpeur, 117 comments). As
//   Google's large-scale changes (Rosie, ClangMR) let a tool make the change that a verification
//   and a review judge, with no new test, a mechanical ticket (`cheminMecanique`: no `--depuis`,
//   no testwriter nor developpeur since the plan) skips the testwriter, the proof and the
//   developpeur, the gesture `mecanique`: at 1.1 one session of the explorateur in the envelope
//   of the plan (lancer.sh `--fiche geste`, its sheet the schema `geste`, its instruction the
//   ninth template) plays in the copy the command the plan names; its BLOQUÉ or BESOIN goes up as
//   any agent's, and a copy that then holds no change of the plan stops at « sans-livraison ». A
//   `--reprendre` at 1.1 whose copy already holds a change of the plan (the supervisor played the
//   command himself) plays no session. Then the checks, the final pass, the review and the
//   integration, as for any lot; a red of the checks or of the final pass that no regeneration
//   lifts stops at « controles », and a RENDU at « relecture-arret » (`arretDuGesteMecanique`),
//   a question for the supervisor, who has the lot corrected (`--depuis developpeur`) or stops.
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
//   of the testwriter, else « aucune » (no verdict), the text of `--contexte` at its head, as its
//   task (`tache`), for each agent of the run, and the references 4.2 regenerates, each with its
//   files (`lesReferences`), so that no session stops on what the circuit writes itself (BP
//   320.8: a developpeur, code and tests green, stopped on a ceiling, the debt and the index).
//   The session's own exit code is the one lancer.sh
//   writes to `.claude/worktrees/<ticket>.travail/seances/<id>/fin`, under the session's id
//   (`rangDeLaSeance` of scripts/seances.mjs); a launch that leaves none stopped before its
//   session.
// - Each session of the explorateur, the questionneur, the testwriter, the developpeur and the
//   reviewer ends on its sheet (« la fiche »): claude runs with `--output-format json --json-schema
//   <the schema of its role>` (scripts/resultats.mjs), and its JSON result carries the sheet in
//   `structured_output`, which the circuit reads (`lireFiche`), each file piece of it checked in
//   the copy (a piece not found refuses the sheet, asked again once like any other lack):
//   lancer.sh writes that result to
//   `.claude/worktrees/<ticket>.travail/seances/<id>/resultat.json`, and a session out of the
//   envelope prints it there, its exit code beside. Each
//   sheet read is kept with the ticket's sheets, `.claude/worktrees/<ticket>.fiches.jsonl` (`{
//   date, role, fiche }`, the lot a review read joined to its sheet, `lot`), beside the circuit's
//   own results: the report of each proof and check, which the reviewer receives, with its outcome
//   (`resultat`), each stop (`arret`), each developpeur session that changed no file of the plan
//   and goes to the checks or stops at « sans-livraison » (`inchange`), each session launched
//   (`lancement`, its role and its session id), each end of a run on a question (`montee`: its
//   code, its stop and the supervisor's session that ran it, `superviseur`, the session the
//   entry of the workflow carries, `ctx.superviseur`), which the bilan reads; and each
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
//   (`AUTEUR_DE_LA_FILE` of scripts/integration/file.mjs), whose last word the circuit names. The rights of every session
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
// - A plan that carries no test (sansTests: in a repository of packages, no package that plays
//   tests, as the module of language answers (`joueDesTests`), lies in a path of the plan or holds
//   it, as `npm test -- <chemin>` refuses a path out of every package or in a package without
//   tests) skips the testwriter and the proof:
//   the circuit writes `Circuit · testwriter : aucun test …` at the ticket and launches the
//   developpeur, the reason as his report, then his checks.
// - Each command of the proof and of the checks runs with its own results directory
//   (`GRILLHOUSE_RESULTATS`), where Turborepo writes its summary (scripts/langages/typescript/tests.mjs,
//   scripts/langages/typescript/verifier.mjs), Vitest its JSON report (scripts/langages/typescript/vitest-config/resultats.mjs) and each
//   guard its SARIF; its output goes to the log, for the human. Each `npm test` of them carries
//   the mark `GRILLHOUSE_DEPUIS_LE_VERT` (scripts/dernier-vert.mjs): in a package named whole,
//   the tests that play are those Vitest relates to the files changed since the last green of the
//   copy's branch (main's while the copy has none), the files named among them, as `npm run
//   verifier` measures itself; a lot that changes one test plays that test, and those whose graph
//   it reaches.
// - Each automatic pass (each command of the proof and of the checks, the final pass, the
//   integration and the queue) plays under a progress directory of its own
//   (`GRILLHOUSE_AVANCEMENT`, scripts/avancement.mjs), in its working directory while it plays
//   (`<copie>.travail/avancement-*`), as Bazel counts its actions: Vitest writes
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
//   type, no new test to write), each package of the plan that plays tests (`joueDesTests`) plays
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
//   Only a test that carries the ticket's work turns red first: the sheet of the testwriter names
//   those in `portent_le_travail` (`fichier` from the root, `test` its full name or its title, or
//   none for every test of the file). A green test the sheet names is a defect of the proof, named
//   in the report; a green test it does not name is accepted with no reason, counted and listed
//   under « Verts non nommés ». A green test HEAD already holds has
//   nothing to prove: the version of HEAD of each file plays in the same proof, from a sibling
//   file the module of its language names (`soeurDAvant` of the join, TypeScript: removed after
//   it, a red included; one a killed process left is swept at the circuit's start and before each
//   measure, `balayerLesSoeurs`), or in a tree of its own (`arbreDAvant` of the join, Rust and
//   Python: the copy with that file alone replaced by its version of HEAD, in the temporary
//   directory of the ticket, removed after the run, a red included, so that no test of the lot
//   sees a file more), and a green test whose full name HEAD's version holds, green there too, is
//   set aside, counted; a body changed under the same name is not told apart. A file its tool
//   cannot play twice in a run (cargo: a unit test of `src/`, a target `tests/<dossier>/main.rs`)
//   has neither: the module reads the names of the tests of its HEAD's version without playing
//   them (`testsDeHead` of the join), and each is held for a green HEAD holds, as main stays
//   green. A tree that no longer compiles (cargo: HEAD's version of a target against the lot's
//   `tests/common`) is not a red of the lot: when the build fails with the trees and the lot
//   alone builds, the package plays without them, the names of HEAD's tests of those files read
//   (`testsDeHead`); a build the lot alone breaks stays a red (`jouerAvecLesVersionsDAvant`). The proof passes with a red (of the lot, existing or of a build), even without
//   a file of the lot: a testwriter with no new test to write says so in his handover, the existing
//   reds are enough. Under a plan « comportement changé » it fails without a red, with a broken file
//   of the lot, or with a green the sheet names; under a plan « comportement
//   inchangé », nothing has to turn red and every green passes, so only a broken
//   file fails it (`preuveReussie`). A failed proof relaunches the
//   testwriter with its report, twice at most. The report (reds, justified greens) is written at
//   the ticket. A proof with a red launches the developpeur, and so does a proof without a red
//   when a finding of the reviewer still open names him, or under a plan « comportement inchangé »,
//   whose lot has code to write though nothing turns red; else it skips him (`apresLaPreuve`): the
//   lot is a lot of tests alone, and the checks and the review judge it with no session of the
//   developpeur.
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
// - Before the checks and before the final pass (SUR_LA_POINTE), a resumption included, the copy is
//   prepared on the tip of main by the launcher's own preparation (`avantLaPasse`,
//   scripts/enveloppe/travail-de-la-copie.mjs `preparer`: the guard of its submodules, its
//   advance, the pose of its submodules, their mount, the installation when the lock file is newer
//   than it), as a merge queue plays its checks on the branch set on the tip of main: a copy at the
//   tip or ahead of it is not moved; a copy that moves plays the pass due on its new tree, without
//   the restriction of a regeneration before it; a preparation that fails (an advance in conflict
//   or impossible, a branch gone from main, a lot waiting in the copy's git directory, a submodule
//   or an installation that fails) stops at « lancement », the copy, each file in conflict and the
//   gesture that resumes named, the work left in the copy (OSC Bridge SH-cgi.8.2: a final pass and
//   its resumption red on two reds main had lifted, the copy still on its base of origin).
// - The checks after the developpeur judge the plan, as Bazel plays the targets of a change: `npm
//   test -- <package>` for each package of the plan, touched by the lot or not (a package that plays no
//   tests, `joueDesTests`, plays only when the lot touches it), `npm test -- <test files of the lot>`
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
//   included). The final pass always plays the band of the lot, never the whole repository, as
//   Bazel and Nx `affected` play the reverse-dependency closure of a change
//   (`laPasseFinale`): the circuit keeps the copy as it stands as a commit on the copy's HEAD,
//   the base of the lot, and plays `npm run verifier --
//   --filter=...[<base>...<copie>] --filter=//`, the root's tasks (the guards) with them; the
//   complete one is the night's and the integration's. The final pass green on the band keeps the tree of its lot (`verifie`). A red of a package of the plan goes to the
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
//   rule). The generated files it keeps committed, `grillhouse.engendres` (scripts/engendres.mjs,
//   read from the main tree at the launch, a faulty key the stop « lancement »), follow as
//   references written in full, which the integration regenerates instead of merging them. The
//   frame's references follow in every project (`referencesDuCadre`): the files the
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
//   plan with a red of a reference, mixed with other reds or not, call for it too, before any red
//   goes to the developpeur, as Bazel builds a genrule before the tests that read it: beside
//   other reds, the checks of the plan play again on the regenerated tree, which judges a test
//   that reads the reference (BPScript 320.6.5: a test that reads the hash the turbo.json declare,
//   red beside their guard, went to a developpeur who had nothing to deliver, then could not write
//   them); alone, the final pass that is due plays once, on the regenerated tree. Neither
//   regenerates again a reference regenerated on that same tree (BPScript 320.3.9: the ceiling of
//   the words, red at the checks, left to the final pass, which played the same tests again on
//   the same tree for 6.1 min before regenerating). The circuit
//   keeps the copy as a lot, runs the command of each reference concerned on the whole copy (the
//   debt lowered from the notes of the pass, its guards not played again), out of the envelope,
//   under the lock of the machine, its output added to the log, then, as make remakes the targets
//   that depend on an output, the command of each reference that reads a file one has just
//   written, after it (the index after the API reports), keeps the copy again on that lot, then plays the final pass restricted to what the regeneration changed and its
//   dependents (`--filter=...[<avant>...<après>] --filter=//`); each red of the pass before in a
//   package that pass does not play again stands, and a regeneration that changes nothing plays no
//   pass, every red of the pass before standing. What remains goes each to its owner, as any red
//   of the final pass; a ceiling never rises (its command lowers it), so a lot beyond it stays red.
//   That pass green keeps its tree as verified. The files regenerated stay in
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
//   (no real failure), its only deviation, after a pass (the checks of the plan or the final pass) that carries reds of the plan,
//   judges the lot, as a ceiling refuses a lot beyond it: the copy restored, those reds go to the
//   developpeur with the end of its output, within his sessions, then that pass again.
// - The proof, the checks and the final pass are heavy passes: each holds the lock of the machine
//   (scripts/verrou-de-machine.mjs), shared by every repository of the machine, and waits, the
//   wait written to the log, while another measure holds it; the wait bounded, the pass is at 75,
//   « à repasser ». The pass names itself beside the lock, its ticket and its step's title, and
//   its progress while it holds it, which the board of every project shows.
// - The report a developpeur receives names his reds first, each on its line (test or finding,
//   file and line, message, the beginning of a failed build's own log), then the count of the
//   others and the path of the log; the report of a stop names every red with its package.
// - A check at 75 (« à repasser ») out of the final pass plays once more, the gesture `rejeu`;
//   the 75 of verifier, the final pass's, is final (its wait for the lock of the machine reached
//   its bound). A check still at 75 ends the circuit at 75, the gesture `a-repasser`. A red relaunches the developpeur
//   with its report, twice at most, the third session on the strong model (`lancer.sh --modele
//   opus`; the other sessions name `sonnet`, and none fixes the effort): three sessions for the checks, and three for the final pass.
// - After the final pass, green, the reviewer: a session out of the envelope, which sees the whole
//   repository with its index, claude itself (`claude -p --agent relecteur --session-id <uuid>`,
//   CLAUDE_BIN replaces claude) in the ticket's copy, on Sonnet, under the rights and the
//   context of its role (scripts/droits.mjs: the commands its skill names, its index), its instruction from the second template of
//   consigne-agent.md: the ticket, its plan, the path of the claims file (the ticket's
//   description as `bd show` gives it at the session's launch, written by the circuit in its
//   working folder, which the session may read; the instruction carries no criteria, which the
//   reviewer's skill reads only after its first passes), the files of the lot (the testwriter's by
//   `estUnTest`, then the others), the elements of the lot (scripts/langages/typescript/elements-du-lot.mjs: each
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
//   scripts/resultats.mjs) and asked again once of the same session, except in a run whose
//   supervisor gives the task (`--contexte`), where the findings open at its launch are the
//   session's context and need no answer, a finding a RENDU states within the run still its task
//   (`auLancement`, `constatsDeLaSeance`, BP 320.14.2.3), and the answer is kept with
//   its finding in the state until the next review (BP 320.21: the cause of his choice in a
//   handover the circuit does not read, three RENDU, then the stop); the rest of the lot it does not read again (its skill, « La relecture
//   bornée »). A blocking finding without a valid agent, or one that puts its criterion in
//   question (`critere_en_cause`), stops at « relecture-arret »; so does the third RENDU since the
//   ticket's last ACCEPTÉ, and a RENDU whose finding goes to the testwriter when the plan skips
//   him (`sansTests`), at that verdict, as a CI fails fast on a step it cannot run
//   (`arretDuTestwriterSaute`; OSC Bridge SH-13y.1: three RENDU « Agent : testwriter » on a
//   package whose tests no command of the frame plays, the developpeur relaunched on an empty
//   diff each time); its question, declare the tests of the package or settle the finding.
// - ACCEPTÉ: the integration, once the final pass has played its band on the lot accepted (its tree
//   is `verifie`); else that pass first, once, its red going to the developpeur and the lot then
//   to the reviewer again. The circuit builds the lot from the copy: the files the copy changes
//   against its HEAD, the testwriter's (`estUnTest`: test files and the shared test material)
//   in one patch, the others in another, each file against HEAD and a new one against nothing
//   (`git diff --no-index /dev/null`), the copy's index untouched; the message
//   `<type>(<paquets>): <sujet> (<ticket>)`, the type read from the ticket's type (bug fix,
//   chore, docs, else feat), its body written once from the final state: the criteria of the plan,
//   then each deviation the sheets of the developpeur and of the reviewer name (`ecarts`), once by
//   its subject, from the last sheet that carries it, with the trailer Co-Authored-By; and the
//   frame's references that write files in full (`--references`; the project's generated files,
//   the integration reads itself), which the integration regenerates on
//   main of the moment instead of applying their files from the lot. It runs
//   scripts/integration/integrer.mjs from the main tree, its output added to the log: 0 is the
//   commit on agent/<ticket> (which the circuit names from git), the copy removed, the ticket
//   labelled `en-file`; 75 (« à repasser ») plays it once more (`rejeu`), then stops at
//   « a-repasser »; any other code is its refusal, which stops at « integration ».
// - Then the queue: the workflow of the ticket sends its branch to the queue of the project (the
//   workflow `file:<racine>`, src/temporal/file/deroule.ts, whose gestures are those of
//   scripts/integration/file.mjs) and awaits its issue (it brings the branch onto main, pushes it
//   and reads the CI of the commit pushed). Then the state of the ticket: closed, the circuit
//   sorts the discoveries (below), then ends at « integre », exit 0 (the queue's last word at the
//   ticket named with it, a CI it could not read); reopened (out of the queue, or a red CI), it
//   stops at « integration », the queue's last word as its reason; still in the queue, it stops at
//   « a-repasser », the queue's reason.
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
// - The state, which the workflow of the ticket holds (the effect `etat`, scripts/effets.mjs), is
//   written again at each step and at each stop: `{ etape, tentative, code, raison, rapport,
//   finale, relanceSurLeRefus, boucles, question, questionnement, paquets, constats, verifie, mene,
//   reprise, refus, aRegenerer, controlesRouges, rang, journal }`; `relanceSurLeRefus` whether the
//   developpeur's next session is the one relaunched once on the lot the integration refuses;
//   `questionnement` the work on the plan under way (`{ objet, role, seance }`: the plan, the
//   explorateur or the questionneur, its session), null otherwise; `etape` is the
//   state's name of a numbered step of the process (scripts/etapes.mjs: geste 1.1, testwriter 2,
//   preuve 2.1, developpeur 3, controles 3.1, or 4.1 the final pass once `finale`, references 4.2,
//   relecture 4.3, integration 5.1, file 5.2, tri 5.3), or integre at the end; `raison` names the
//   stop (« arrete » once the supervisor stopped the circuit); `question` the question of a stop for
//   the supervisor (`{ arret, fait, piece, question, qui }`), null otherwise; `paquets` the plan of
//   the ticket, in its order; `constats` the findings of the reviewer still open, each with its
//   agent; `boucles` the counts of the bounded loops of the step under way, by their key (`tests`,
//   the testwriter's sessions with their proofs; `code`, the developpeur's with their checks;
//   `relecture`, the reviews), null at a step without one; `finale` whether the final pass has
//   begun; `verifie` the tree of the lot the last final pass green played, null before;
//   `mene` the start (an ISO date) of the step the circuit leads itself while it runs, null
//   otherwise; `reprise` the session of the testwriter or developpeur its relaunches resume,
//   `{ agent, seance }`, null before any; `refus` the integration's refusal of the lot (`{ rapport,
//   piece, empreinte, lance, relance }`: its output, its piece, the fingerprint of the plan refused,
//   whether `--depuis developpeur` launched the developpeur on it, whether a session so launched
//   left it unchanged once), null before any, once the integration accepts the lot, and on a run
//   from the testwriter; `rang` the rank of the circuit's arrival among the machine's waits for a
//   place.
// - `--reprendre` starts again at the step of the state, its report given to the next session,
//   after any stop. On a stop « integration », it plays the integration (or the queue) again on the same
//   lot, as bors retries: a refusal can come from the load or from main (BP 320.16, 320.16.2). On
//   a stop « questionnement », it lets the plan pass as it is then (the supervisor
//   changed it or kept it), from the testwriter.
// - `--depuis <testwriter|developpeur>` has the lot corrected: it plays the whole ticket from
//   that step, the text of `--contexte` the task at the head of each agent's instruction in the
//   run, the reviewer's line CONTEXTE (after a stop
//   « integration », from the developpeur, the refusal as his report, the red to lift, as a merge
//   queue sends the lot back to its author with the log of its check; from the testwriter, the
//   refusal dropped), as a retry
//   of GitLab CI plays the jobs after it with the same variables: from the testwriter, his proof,
//   then the developpeur launched by a red of the proof as without `--depuis`; from the
//   developpeur, his checks; then the final pass, the reviewer and the integration. It goes with
//   no `--reprendre`, and names no component: a second name is a second ticket, exit 2.
// - `--etendre <paquet>[,<paquet>…]` (each a path or a package name of the repository) extends the
//   plan: the circuit writes the title (`bd update --title`), each package gained before the first
//   package of the plan that reads it, as the module of the language says (`lecteurs` of the
//   join: the imports of a package of TypeScript, its tests' included, the dependencies of a
//   crate, of development included), else at its end,
//   said at the ticket
//   (`Circuit · plan : le superviseur étend le plan à …`); then the step under way resumes as
//   after `--reprendre`, on the plan extended, the question as its context with the text of
//   `--contexte`; a stop « sans-livraison » on the developpeur's sending to the testwriter
//   resumes at the testwriter, the role it names. The plan so extended has passed (`plan`, its
//   fingerprint): neither the explorateur nor the questionneur works on it again. A package the
//   repository does not hold is refused, exit 2.
// - `--arreter` stops the circuit on the supervisor's word, as a pipeline cancelled: the workflow
//   cancels the act under way, its session with it, then the state keeps its step, its stop
//   « arrete », its question lifted, its motive (`--contexte`) as its report, said at the ticket
//   (`Circuit · arret : le superviseur arrête le circuit : <motif>`), and the workflow ends, giving
//   that state back, which an answer reopens from.
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
// - The codes of the stops, by their name (ARRETS), 0 at « integre »:
//   10 lancement (lancer.sh stopped before the session, or the tools of the project,
//   `grillhouse.outils`, refused at the launch or a resumption, before any session, or the copy
//   that does not move forward to the tip of main before the checks or the final pass, its
//   conflicts named), 11 bloqué (a motionless transcript),
//   12 sans-fiche (twice no sheet that conforms), 13 preuve (the third proof fails), 14 controles
//   (the third developpeur of the checks or of the final pass leaves a red check, a red of the
//   final pass out of the plan or that no package of the plan holds, or reds to settle),
//   15 sans-livraison (a developpeur session that changes no file of the plan, its checks red; the
//   first session of a `--reprendre` whose plan already holds changes goes on to the checks; a
//   second developpeur session that `--depuis developpeur` launched on the lot the integration
//   refused and that changes nothing; or
//   the developpeur's same sending to the testwriter twice in a row, on the same red output of the
//   checks, no green checks between them), 16 relecture-arret (a finding without a valid agent, one to the testwriter the plan skips,
//   one on a criterion, the third RENDU), 17 integration (the integration script refuses the lot, or the queue reopens the
//   ticket), 19 hors-portee (a testwriter or developpeur whose sheet says BLOQUÉ, without a
//   sending to the testwriter, or a developpeur's FAIT with criteria out of the plan), 20 besoin (a testwriter or developpeur whose sheet says BESOIN, a
//   reviewer whose sheet carries a `question`, or a ticket labelled `arbitrage` whose arbitrage
//   `refusArbitrage` of scripts/integration/integrer.mjs refuses, at the launch or a resumption,
//   before any session), 22 questionnement (questions of the plan left open
//   after the explorateur's answer), 23 references (a regeneration of 4.2 that changes a file
//   no reference writes, or whose command fails), 24 hors-plan (a testwriter or developpeur session its lock
//   stops on a write out of the plan, `hors-plan` that lancer.sh ranges under the session's id), 25 inattendu
//   (an act that fails, an exception no rule of the circuit settles: its message, its stack and its
//   step in its question, `arretInattendu`), each a question for the supervisor; 75 a-repasser (a check or the integration still at 75 once played again,
//   or the branch still in the queue), the gesture `a-repasser`.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { outilsDe } from './outils-cles.mjs';
import { donneesDe } from './donnees-cles.mjs';
import { engendresDe } from './engendres.mjs';
import { fluxDe } from './flux-des-paquets.mjs';
import {
  AGENTS_DU_LOT,
  ARRETS,
  AUTO,
  bouclesDe,
  etapeDuCircuit,
  EXPLORATEUR,
  libelle,
  monteeDe,
  nomDuRole,
  QUESTIONNEUR,
  SUITE,
} from './etapes.mjs';
import {
  CODE,
  CONTROLES,
  ouvertesDuPlan,
  pasDuPlan,
  questionsPosees,
  rapportDuRefus,
  TESTS,
} from './transitions.mjs';
import {
  arbreDeLaCopie,
  balayerLesSoeurs,
  controles,
  empreinte,
  environnementDeLaPasse,
  horsDeLEnveloppe,
  integrer,
  laPasseFinale,
  leLotAccepte,
  leLotGarde,
  lesReferences,
  livre,
  preuve,
  referencesDesRouges,
  regenerer,
  relire,
  sansTests,
  testsDuLot,
  trier,
} from './activites.mjs';
import {
  ACTEUR,
  Arret,
  AUTEUR_DU_CIRCUIT,
  commenter,
  composantsDe,
  derniereDe,
  entete,
  fichesDe,
  fin,
  geste,
  inscrire,
  lesCommentaires,
  lesFiches,
  leTicket,
  lire,
  nomsDe,
  passations,
  PREFIXE,
  premiereLigne,
  sansCouleurs,
} from './ticket-du-circuit.mjs';
import { emettre } from './effets.mjs';
import { consigne, auLancement, idDeSeance, jusquALaFiche, seance } from './seances.mjs';
import { releve } from './composants-affectes.mjs';
import { ligneDEtape, transcriptionsDeLaCopie } from './registre.mjs';
import {
  bloquantsDeLaFiche,
  cleDuConstat,
  reponsesAuxQuestions,
  sorteDuPlan,
} from './resultats.mjs';
import { preparer } from './enveloppe/travail-de-la-copie.mjs';
import { refusArbitrage } from './integration/integrer.mjs';
import { prendreUnRang } from './places-de-la-machine.mjs';
import { langageDe } from './langages.mjs';
import { leTitre, ticketAuLancement } from './depart-du-ticket.mjs';
import { ouvrirBase } from './mesure/base-de-passe.mjs';
import { GREFFON } from './cadre.mjs';
import { retirerLesCopiesDuDepot } from './copies-finies.mjs';
import { lesReponses } from './reponses-du-circuit.mjs';

// The time a session's transcripts may stand still before the circuit stops it.
export const IMMOBILE_MS = 20 * 60 * 1000;
// The exit code of each stop, from the list of the steps and stops.
export { ARRETS };
// The steps the circuit leads itself, with no agent: each one counts in the ticket's working time.
const MENEES = new Set(SUITE.filter(e => e.qui.includes(AUTO) && e.etat).map(e => e.etat));

const ici = import.meta.dirname;
const PREPARER = path.join(ici, 'enveloppe', 'travail-de-la-copie.mjs');
// A malformed call: its message.
class Usage extends Error {}

// The stop « inattendu » of the exception <erreur> fallen at the step <etape> of the circuit of
// <ctx>: `{ code, nom, rapport, piece, question }`. As a scheduler writes a job's error as a
// result with its log (Zuul, Buildbot, GitLab CI) and does not die of it, the circuit ends on a
// written stop whose question carries the message, the stack, the step and the command that
// resumes. Only the supervisor resumes, once the cause is lifted.
export function arretInattendu(ctx, erreur, etape) {
  const message = String(erreur?.message ?? erreur);
  const pile = String(erreur?.stack ?? message);
  const reprise = `npx grillhouse circuit ${ctx.ticket} --reprendre`;
  return {
    code: ARRETS.inattendu,
    nom: 'inattendu',
    rapport: message,
    piece: `${message}\n${pile}`,
    question: `Une exception inattendue est tombée à l'étape « ${etape} » : ${message}\n\nPile :\n${pile}\n\nLa commande qui reprend, une fois la cause levée : \`${reprise}\`.`,
  };
}

// The red of the reading of the copy <ctx.copie> right after a session of the testwriter or the
// developpeur: the module of the language (`langageDe`, the common call) no longer reads its
// components (cargo metadata red), so the copy that agent left is a red build handed back to him
// with the tool's output, or null when the copy reads. The place makes the red, not the error: a
// reading that fails anywhere else is the stop « inattendu ».
export function rougeDeLecture(ctx) {
  try {
    composantsDe(ctx.copie);
    return null;
  } catch (e) {
    return {
      rapport: `La copie ne se lit plus : le module de langage ne lit pas ses composants.\n\n${sansCouleurs(e?.message ?? e)}`,
    };
  }
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
export function contexte(o) {
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
  // The ticket, its architecture and its plan, read as the launch reads them
  // (scripts/depart-du-ticket.mjs); the plan of a title written again read by `duTitre`.
  const {
    ticket: t,
    resoudre,
    sujet,
    plan,
  } = ticketAuLancement(racine, o.ticket, {
    arreter: Boolean(o.arreter),
    bd,
    plan: o.paquets ?? null,
  });
  const duTitre = titre => leTitre(o.ticket, titre, resoudre);
  // The working directory of the circuit is the ticket's, `<copie>.travail` beside its copy: what
  // the circuit hands its sessions (their instructions, results and errors, the reviewer's
  // statements, the integration's patches and message), which a session out of the envelope reads
  // even when its circuit is killed. As the workspace of a pipeline (Jenkins, GitLab), it lives as
  // long as the ticket: no sweep touches it, a circuit relaunched takes it up again, each session
  // numbering its files after those it finds (`prochainNumero` of scripts/seances.mjs), and the queue removes it at the ticket's closure, or the removal of
  // the copy of a ticket closed without integration (scripts/retirer-copie.sh). The results and
  // the progress of the circuit's passes live in the base of its run
  // (scripts/mesure/base-de-passe.mjs), removed at its end, swept when the run is killed.
  const tmp = `${copie}.travail`;
  mkdirSync(tmp, { recursive: true });
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
    journal: `${copie}.log`,
    fiches: `${copie}.fiches.jsonl`,
    transcriptions: transcriptionsDeLaCopie(copie, os.homedir()),
    immobileMs: Number(process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS) || IMMOBILE_MS,
    base: baseDuRun,
    tmp,
    ports: null,
  };
}

// The step of the circuit's state <etat> in words, « 3 Code » (scripts/etapes.mjs), or its
// `etape` when the list holds none.
const ouDansLeCircuit = etat => {
  const e = etapeDuCircuit(etat);
  return e ? libelle(e) : etat.etape;
};

// The report of a proof or of checks: its line at the ticket, and its report kept for the
// reviewer, <rapport> when the comment carries only its summary, beside its outcome <resultat>,
// which the bilan reads (scripts/bilan.mjs): for a proof `{ ok, rouges, justifies (non named greens), sans (named greens), casses,
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

// The state of the run, written whole (`raison`, `boucles` and `question` null, `finale` and
// `relanceSurLeRefus` false unless <etat> sets them, `paquets`, `constats`, `verifie`, `reprise`,
// `aRegenerer`, `refus`, `controlesRouges` and `rang` the run's), kept as the run's current
// state and emitted (the effect `etat`), which the workflow of the ticket holds
// (src/temporal/circuit/deroule.ts).
export function ecrireEtat(ctx, etat) {
  ctx.courant = {
    raison: null,
    finale: false,
    relanceSurLeRefus: false,
    boucles: null,
    question: null,
    questionnement: null,
    mene: null,
    ...etat,
    paquets: ctx.paquets,
    constats: ctx.constats ?? [],
    verifie: ctx.verifie ?? null,
    reprise: ctx.reprise ?? null,
    aRegenerer: ctx.aRegenerer ?? null,
    refus: ctx.refus ?? null,
    controlesRouges: ctx.controlesRouges ?? null,
    rang: ctx.rang ?? null,
  };
  emettre(ctx, { genre: 'etat', etat: { ...ctx.courant, journal: ctx.journal } });
}

// The register's line of the step <etape> the circuit led itself from <debut> (an ISO date) to
// now; a register it cannot write leaves the circuit going (`ecrireLEffet`).
function inscrireEtape(ctx, { etape, debut }) {
  emettre(ctx, {
    genre: 'registre',
    ligne: ligneDEtape({
      projet: ctx.racine,
      ticket: ctx.ticket,
      etape,
      debut,
      fin: new Date().toISOString(),
    }),
  });
}

// The steps whose pass judges the lot, 3.1 and 4.1 (one state, `finale` apart): the copy is
// prepared on the tip of main before each of them.
export const SUR_LA_POINTE = new Set([CONTROLES]);

// What the circuit does before the step <etape>, whose regeneration before it is <regeneration>
// (`ctx.regeneration`), as a merge queue plays its checks on the branch set on the tip of main: at a
// step of SUR_LA_POINTE, the copy prepared by the launcher's own preparation
// (scripts/enveloppe/travail-de-la-copie.mjs, `preparer`: the guard of its submodules, its advance
// to the main tree's HEAD, the pose of its submodules, their mount, the installation when the lock
// file is newer), its output in the ticket's log, with <env>. `{ avancee, regeneration }`: whether
// the copy's HEAD moved (a copy at the tip, or ahead of it, is not moved), and the regeneration the
// pass keeps, none once the copy moved, its tree new; at any other step, the regeneration as it is,
// the copy untouched. Or `{ arret }`, the stop « lancement » (its name, report, piece and
// question), the copy and its work as the preparation leaves them, each file in conflict named.
export function avantLaPasse(
  ctx,
  etape,
  regeneration,
  env = environnementDeLaPasse(ctx, process.env)
) {
  if (!SUR_LA_POINTE.has(etape)) return { avancee: false, regeneration };
  const tete = dossier =>
    spawnSync('git', ['-C', dossier, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const cible = tete(ctx.racine);
  const avant = tete(ctx.copie);
  let r;
  if (cible.status === 0 && avant.status === 0) {
    entete(ctx, 'preparation');
    appendFileSync(
      ctx.journal,
      `$ node ${PREPARER} preparer ${ctx.copie} ${cible.stdout.trim()}\n`
    );
    const fd = openSync(ctx.journal, 'a');
    try {
      r = preparer(ctx.copie, cible.stdout.trim(), { env, sortie: fd });
    } finally {
      closeSync(fd);
    }
  } else {
    r = { ok: false, message: `⛔ ${String(cible.stderr || avant.stderr).trim()}` };
  }
  if (r.ok) {
    const avancee = tete(ctx.copie).stdout.trim() !== avant.stdout.trim();
    return { avancee, regeneration: avancee ? null : regeneration };
  }
  return {
    arret: {
      nom: 'lancement',
      rapport: `La copie ${ctx.copie} ne se prépare pas sur la pointe de main avant la passe qui juge le lot.\n\n${r.message}`,
      piece: `$ node ${PREPARER} preparer ${ctx.copie} ${cible.stdout.trim()}\n${r.message}`,
      question: `La copie ${ctx.copie} se remet en état à la main, comme la préparation le dit (chaque fichier en conflit résolu puis \`git add\`, le lot en attente repris, la branche ramenée sur main, ou le sous-module et l'installation réparés), sans perdre son travail ; puis \`npx grillhouse circuit ${ctx.ticket} --reprendre\`, qui prépare la copie et rejoue la passe.`,
    },
  };
}

// The tools of the project whose main tree is <racine>, read at the launch of a run:
// `{ outils }`, or `{ arret }`, the stop « lancement » that goes up to the supervisor before any
// session (its code, name, report, piece and question), the faults of the key named.
export function outilsAuLancement(racine) {
  try {
    return { outils: outilsDe(racine) };
  } catch (err) {
    const rapport = `La clé grillhouse.outils du package.json est refusée :\n${err.message}`;
    return {
      arret: {
        code: ARRETS.lancement,
        nom: 'lancement',
        rapport,
        piece: `$ npm pkg get grillhouse.outils\n${rapport}`,
        question: `${rapport}\nLa clé se corrige au package.json du projet, puis \`--reprendre\`.`,
      },
    };
  }
}

// The data of the project whose main tree is <racine> (`grillhouse.donnees`), read at the launch
// of a run: `{ donnees }`, or `{ arret }`, the stop « lancement » that goes up to the supervisor
// before any session, the faults of the key named.
export function donneesAuLancement(racine) {
  try {
    return { donnees: donneesDe(racine) };
  } catch (err) {
    const rapport = `La clé grillhouse.donnees du package.json est refusée :\n${err.message}`;
    return {
      arret: {
        code: ARRETS.lancement,
        nom: 'lancement',
        rapport,
        piece: `$ npm pkg get grillhouse.donnees\n${rapport}`,
        question: `${rapport}\nLa clé se corrige au package.json du consommateur, puis \`--reprendre\`.`,
      },
    };
  }
}

// The generated files the project declares (`grillhouse.engendres`, scripts/engendres.mjs), read
// at the launch of a run from its main tree: `{ engendres }`, or `{ arret }`, the stop « lancement »
// that goes up to the supervisor before any session, the faults of the key named.
export function engendresAuLancement(racine) {
  try {
    return { engendres: engendresDe(racine) };
  } catch (err) {
    const rapport = `La clé grillhouse.engendres du package.json est refusée :\n${err.message}`;
    return {
      arret: {
        code: ARRETS.lancement,
        nom: 'lancement',
        rapport,
        piece: `$ npm pkg get grillhouse.engendres\n${rapport}`,
        question: `${rapport}\nLa clé se corrige au package.json du projet, puis \`--reprendre\`.`,
      },
    };
  }
}

// The flows of the CI the project declares (`grillhouse.flux`, scripts/flux-des-paquets.mjs), read
// at the launch of a run from its main tree: `{ flux }`, or `{ arret }`, the stop « lancement »
// that goes up to the supervisor before any session, the faults of the key named.
export function fluxAuLancement(racine) {
  try {
    return { flux: fluxDe(racine) };
  } catch (err) {
    const rapport = `La clé grillhouse.flux du package.json est refusée :\n${err.message}`;
    return {
      arret: {
        code: ARRETS.lancement,
        nom: 'lancement',
        rapport,
        piece: `$ npm pkg get grillhouse.flux\n${rapport}`,
        question: `${rapport}\nLa clé se corrige au package.json du projet, puis \`--reprendre\`.`,
      },
    };
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

// The findings still open once the reviewer's sheet RENDU <fiche> is read, as the issues of a
// review stay open until the review that resolves them: each blocking finding of the sheet (a
// remark reaches the ticket, no agent; the sheet's schema gives a RENDU at least one), after each
// finding open before it that the sheet neither marks lifted (`suivi`, by its title) nor states
// again, which keeps its mark `enContexte` (`auLancement`), a finding the sheet states coming
// without it. Each one `{ titre, regle, role, corps, piece }`, its recipient the agent it names, testwriter or
// developpeur, without the developpeur's answer to the review before (`reponse`): his next sheet
// answers it again. Throws an Arret `relecture-arret` for a finding without a valid recipient or one
// that puts a criterion in question.
export function constatsOuverts(ctx, fiche, texte) {
  const arret = raison =>
    new Arret('relecture-arret', `${raison}\n\nLe verdict :\n\n${texte}`, { piece: raison });
  const neufs = bloquantsDeLaFiche(fiche).map(c => {
    if (c.critere_en_cause)
      throw arret(`Le constat « ${c.titre} » met en cause un critère du ticket.`);
    if (!AGENTS_DU_LOT.includes(c.role)) {
      throw arret(
        `Le constat « ${c.titre} » n'a pas de destinataire valide : il nomme ${c.role ? `« ${c.role} »` : 'personne'}, quand le rôle est ${AGENTS_DU_LOT.join(' ou ')}.`
      );
    }
    return { titre: c.titre, regle: c.regle, role: c.role, corps: c.corps, piece: c.piece };
  });
  const leves = new Set(
    (fiche.suivi ?? []).filter(s => s.etat === 'levé').map(s => cleDuConstat(s.titre))
  );
  const restes = (ctx.constats ?? [])
    .filter(c => !leves.has(c.titre) && !neufs.some(n => n.titre === c.titre))
    .map(c => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'reponse')));
  return [...restes, ...neufs];
}

// The sheet of the plan that says its field <champ> (`sorte`, `noms_publies`) among the
// explorateur's sheets of the plan <plans>, in their order (`{ fiche, reponse }` entries): the last
// one, or, when it is his answer to the questionneur (`reponse`) and says none, the plan it
// answers, so that the field survives the answer; null without a sheet of the plan.
export function ficheDuPlan(plans, champ) {
  const derniere = plans.at(-1);
  if (!derniere) return null;
  if (derniere.reponse && !(champ in derniere.fiche) && plans.length > 1) {
    return plans.at(-2).fiche;
  }
  return derniere.fiche;
}

// The sort of the ticket its plan says (`sorteDuPlan` of scripts/resultats.mjs): the sheet of the
// plan that says it (`ficheDuPlan`), comportement without one (grillhouse-sos).
const sorteDuTicket = ctx =>
  sorteDuPlan(
    ficheDuPlan(
      lesFiches(ctx).filter(e => e.role === EXPLORATEUR && Array.isArray(e.fiche?.criteres)),
      'sorte'
    )
  );

// Whether a testwriter or a developpeur has worked the lot since the last sheet of the plan.
function lotTravaille(ctx) {
  const tous = lesFiches(ctx);
  const plan = tous.findLastIndex(e => e.role === EXPLORATEUR && Array.isArray(e.fiche?.criteres));
  return tous.slice(plan + 1).some(e => AGENTS_DU_LOT.includes(e.role));
}

// Whether the ticket of <ctx> goes the mechanical path, as Google's large-scale changes (Rosie,
// ClangMR) let a tool make the change that a verification and a review judge: its plan says it
// mechanical (`ctx.sorte`), no `--depuis` sends its lot to an agent, and no testwriter nor
// developpeur has worked it since the plan (grillhouse-sos).
export const cheminMecanique = ctx =>
  ctx.sorte?.genre === 'mécanique' && !ctx.depuis && !lotTravaille(ctx);

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
// step once for the whole ticket, its plan the packages of the title. Its decisions are those of
// scripts/transitions.mjs: at each step the circuit reads the facts it asks for (`lireLeFait`) and
// interprets the decision (`appliquer`), its memory changed, its effects played, then its stop,
// its end, or the step that follows.
// The start of the step <debut> of the run of <ctx>: its state, its loops counted, written; a step
// the circuit leads itself names its start in the state while it runs (`menee`), and writes its
// line to the register at its end (`finirLEtape`), whatever its outcome. `{ etat, menee }`.
export function commencerLEtape(ctx, { etape, tentative, rapport, finale }) {
  const etat = {
    etape,
    tentative,
    code: null,
    raison: null,
    rapport,
    finale,
    boucles: boucles(ctx, etape, tentative, finale),
  };
  const menee = MENEES.has(etape) ? { etape, debut: new Date().toISOString() } : null;
  ecrireEtat(ctx, { ...etat, mene: menee?.debut ?? null });
  return { etat, menee };
}

// The end of a step of the run of <ctx> the circuit led itself (<menee>, null for another): its
// line to the register.
export function finirLEtape(ctx, menee) {
  if (menee) inscrireEtape(ctx, menee);
}

// The stop <erreur> of the run of <ctx> at the step <etat>, written: any exception but an Arret is
// the stop « inattendu », at the step it fell. Its state, its result kept for the bilan, its line
// at the ticket and on the error output: the stop as `monter` takes it,
// `{ code, nom, rapport, rouges, motif, piece, question, qui, etat }`.
export function publierLArret(ctx, erreur, etat) {
  let e = erreur;
  if (!(e instanceof Arret)) {
    const a = arretInattendu(ctx, e, etat.etape);
    e = new Arret(a.nom, a.rapport, { piece: a.piece, question: a.question });
  }
  const code = ARRETS[e.nom];
  const lieu = e.etape ?? etat.etape;
  const arrete = { ...etat, etape: lieu };
  ecrireEtat(ctx, { ...arrete, code, raison: e.nom, rapport: e.rapport });
  // The stop kept with the circuit's results, which the bilan counts.
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    etape: lieu,
    arret: e.nom,
    ...(lieu === CONTROLES && etat.finale ? { finale: true } : {}),
    ...(e.resultat ? { resultat: e.resultat } : {}),
  });
  const ou = ouDansLeCircuit({ etape: lieu, finale: etat.finale && lieu === CONTROLES });
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
}

// What the circuit keeps between steps, which the decisions read and change (scripts/transitions.mjs).
export const MEMOIRE = [
  'controlesRouges',
  'renvoiAuTestwriter',
  'refus',
  'rienALivrer',
  'regeneration',
  'regenereSur',
  'aRegenerer',
  'verifie',
  'constats',
];

// The fact <fait> of the circuit of <ctx>, with its <parametres>, the facts <faits> of the step
// read before it: a session, a pass, a reading of the copy or of the ticket.
export async function lireLeFait(ctx, fait, parametres, faits) {
  switch (fait) {
    case 'mecanique':
      return cheminMecanique(ctx);
    case 'sansTests':
      return sansTests(ctx);
    case 'livreAvant':
    case 'livre':
      return livre(ctx);
    case 'seanceDuGeste': {
      const { description } = leTicket(ctx);
      return jusquALaFiche(
        ctx,
        EXPLORATEUR,
        consigne(
          {
            depot: ctx.racine,
            ticket: ctx.ticket,
            sujet: ctx.sujet,
            paquets: ctx.paquets.join(', '),
            raison: ctx.sorte.raison,
            commande: ctx.sorte.commande,
            description: description.trim() || 'aucune',
          },
          8
        ),
        {
          signeDeVie: ctx.ports?.signeDeVie,
          id: idDeSeance(ctx, 'geste'),
          evenement: 'geste',
          fiche: 'geste',
          objet: 'geste',
        }
      );
    }
    case 'seance': {
      const { role, ...options } = parametres;
      // The session reads the findings and the session to resume the circuit keeps, and gives back
      // what the circuit keeps of them.
      const { fiche, constats } = await seance(ctx, role, {
        ...options,
        constats: ctx.constats ?? [],
        reprise: ctx.reprise ?? null,
        retenir: reprise => {
          ctx.reprise = reprise;
        },
        signeDeVie: ctx.ports?.signeDeVie,
        seanceId: idDeSeance(ctx, `neuve:${role}`),
        lectures: { lots: () => testsDuLot(ctx), references: () => lesReferences(ctx) },
      });
      ctx.constats = constats;
      return fiche;
    }
    case 'lecture':
      return rougeDeLecture(ctx);
    case 'preuve': {
      // The measure of the last proof, kept in the working directory of the ticket, which the next
      // proof on the same tree judges again without playing it: each act plays in a process of its
      // own, and a measure is too large for the memory of the workflow.
      const fichier = path.join(ctx.tmp, 'mesure-de-la-preuve.json');
      const derniere = existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')) : null;
      const { mesure, ...p } = preuve(ctx, { mesure: derniere });
      if (mesure) {
        writeFileSync(fichier, JSON.stringify(mesure));
      } else {
        rmSync(fichier, { force: true });
      }
      return p;
    }
    case 'empreinteAvant':
    case 'empreinte':
      return empreinte(ctx);
    case 'renvoi':
      return renvoiDe(ctx, faits.seance);
    case 'passation':
      return passations(ctx).at(-1)?.text ?? null;
    case 'arbreAvant':
    case 'arbreApres':
      return arbreDeLaCopie(ctx);
    case 'passeFinale':
      return laPasseFinale(ctx);
    case 'controles':
      return controles(ctx, parametres.finale, parametres.restreinte, parametres.reportes);
    case 'referencesDesRouges':
      return referencesDesRouges(ctx, parametres.lieux, parametres.aElaguer);
    case 'lotAccepte':
      return leLotAccepte(ctx, parametres.arbre);
    case 'regeneration':
      // The copy kept before it, which the regeneration restores first.
      return regenerer(ctx, { ...parametres, avant: leLotGarde(ctx).lot });
    case 'relecture':
      return relire(ctx, { constats: ctx.constats ?? [] });
    case 'rendus':
      return rendusDepuisAccepte(ctx);
    case 'constats':
      try {
        return { constats: constatsOuverts(ctx, faits.relecture.fiche, faits.relecture.texte) };
      } catch (e) {
        if (!(e instanceof Arret)) throw e;
        return { arret: { nom: e.nom, rapport: e.rapport, piece: e.piece } };
      }
    case 'integration': {
      const r = integrer(ctx);
      return {
        code: r.code,
        sortie: sansCouleurs(r.sortie),
        commande: r.commande,
      };
    }
    case 'commit':
      return spawnSync('git', ['-C', ctx.racine, 'rev-parse', '--short', `agent/${ctx.ticket}`], {
        encoding: 'utf8',
      }).stdout.trim();
    case 'tri':
      await trier(ctx);
      return true;
    default:
      throw new Error(`fait inconnu des décisions du circuit : ${fait}`);
  }
}

// The effect <e> of a decision of the circuit of <ctx>: a line at the ticket, a gesture, a report,
// a result kept.
export function appliquer(ctx, e) {
  if (e.genre === 'commenter') commenter(ctx, e.etape, e.texte);
  else if (e.genre === 'geste') geste(ctx, e.nom);
  else if (e.genre === 'rapport') ecrireRapport(ctx, e.etape, e.texte, e.resultat, e.rapport);
  else if (e.genre === 'inscrire') inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, ...e.entree });
  else throw new Error(`effet inconnu des décisions du circuit : ${e.genre}`);
}

// The Arret of the stop <a> a decision of the circuit of <ctx> returns: an agent's sheet that is
// not FAIT (`statut`) or that does not hold criteria out of the plan (`horsDuPlan`), with its
// handover; else its name, its report and its options.
export function arretDe(ctx, a) {
  if (a.statut) return arretDuStatut(ctx, a.statut.role, a.statut.tentative, a.statut.fiche);
  if (a.horsDuPlan) return arretHorsDuPlan(ctx, a.horsDuPlan.tentative, a.horsDuPlan.fiche);
  const { nom, rapport, ...options } = a;
  return new Arret(nom, rapport, options);
}

// The stop <a> (`{ code, nom, rapport, motif, rouges, piece, question, qui, etat }`, `etat` the
// state of the step it stopped) gone up to the supervisor, as a CI calls a person only for what no
// rule settles: its question (`{ arret, fait, piece, question, qui }`: the fact, the first line of
// its motive or its report; its piece, the one it carries, else its reds with their file and line,
// else the end of the log; the question of its kind, scripts/etapes.mjs MONTEES, after the agent's
// own; who must answer it) kept in the state, written at the ticket and on the error output. Its
// exit code.
export function monter(ctx, a) {
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
  process.stderr.write(laQuestion(ctx.ticket, { arret: a.nom, qui, ou, question }));
  return a.code;
}

// The line that says the question <question> of the circuit of <ticket> stopped at <ou> on
// <arret>, to <qui>, with the answers its running workflow accepts (`lesReponses`).
const laQuestion = (ticket, { arret, qui, ou, question }) =>
  `⛔ Circuit de ${ticket} : question au ${qui} (${arret}, à ${ou}) : ${String(question ?? '').trim()}\n\nLa réponse : \`${lesReponses(ticket, 'RUNNING', true)}\`.\n`;

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
  if (!e) throw new Usage(`rien à reprendre : le circuit de ${ctx.ticket} n'a aucun état d'arrêt.`);
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
// (`montee`: its code, its stop and the supervisor's session that ran it, `superviseur`, the one
// the entry of the workflow carries, `ctx.superviseur`, when Claude Code named it to the command), from which the bilan measures the wait to the run that answers it, the
// owner's when he writes in that session meanwhile, then the ticket's bilan at the ticket
// (scripts/bilan.mjs); a bilan it cannot write leaves the code as it is. Then the removal of the
// finished copies of the repository (scripts/copies-finies.mjs), as a CI cleans its workspaces at
// the end of each pipeline, not only the night's: its lines added to the log and written on the
// error stream, each kept copy with the place it holds; it never changes the code.
// The next rank of arrival of the machine, null when its state does not write (the circuit then
// draws one at its first wait for a place).
function tirerLeRang() {
  try {
    return prendreUnRang();
  } catch {
    return null;
  }
}

export function aLaFin(ctx, code) {
  try {
    if (code !== 0) {
      const superviseur = ctx.superviseur ?? null;
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        montee: {
          code,
          raison: ctx.courant?.raison ?? null,
          ...(superviseur ? { superviseur } : {}),
        },
      });
    }
    // The bilan is computed when it is written, once the effects before it are; one not written
    // is said, and the circuit ends (`ecrireLEffet`).
    emettre(ctx, {
      genre: 'bilan',
      ticket: ctx.ticket,
      fin: {
        etape: ctx.courant?.etape ?? null,
        raison: ctx.courant?.raison ?? null,
        code: ctx.courant?.code ?? null,
      },
    });
  } catch (e) {
    process.stderr.write(`⚠️  bilan non écrit au ticket : ${e.message}\n`);
  }
  try {
    const lignes = retirerLesCopiesDuDepot(ctx.racine);
    if (lignes.length) {
      appendFileSync(ctx.journal, `${lignes.join('\n')}\n`);
      process.stderr.write(`${lignes.join('\n')}\n`);
    }
  } catch (e) {
    process.stderr.write(`⚠️  copies finies non retirées : ${e.message}\n`);
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
// The heading of the section of the sort of the ticket in a plan's description (grillhouse-sos).
const SORTE = '## Sorte';
// The heading of the section of the names the plan publishes in its description, the one that
// scripts/langages/typescript/consommateurs-arbitres.mjs reads (grillhouse-la3).
const NOMS_PUBLIES = '## Noms publiés';

// The names <noms> a plan publishes (`noms_publies`), one line each, as the guard of the consumers
// reads them: the provider, the consumer and each name between backquotes.
const lignesDesNoms = noms =>
  noms
    .map(
      n =>
        `- \`${n.fournisseur}\` publie à \`${n.consommateur}\` : ${n.noms.map(x => `\`${x}\``).join(', ')}`
    )
    .join('\n');

// The sort <sorte> (`sorteDuPlan`) in words: its kind, then its reason.
const texteDeLaSorte = sorte =>
  sorte.raison
    ? `${sorte.genre}${sorte.inchange ? ' inchangé' : ''} — ${sorte.raison}`
    : `${sorte.genre} — la fiche ne dit pas sa sorte lisiblement : le circuit entier`;

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
// <criteres> in its section of criteria (a section « ## Critères » at its end without one), the sort
// of the ticket <sorte> in its section after it, its reason and the command of a mechanical ticket
// (absent when the sheet says none), the names the plan publishes <noms> in their section after it
// (an empty list erases the section; a sheet without them, <noms> undefined, keeps the section the
// description holds, a supervisor's by hand included), and its open questions <questions> in their
// section after them, absent without one; the rest of it as it was. The criteria already written
// stay as they are, the decision of the owner: each criterion the plan adds follows them, numbered
// after them. Written again from the description before the plan, the description holds the
// criteria, the sort and the names of the explorateur's last sheet alone.
export function decrireLePlan(description, criteres, questions, sorte = null, noms = undefined) {
  const gardees = sectionsDe(description).filter(
    s =>
      s.tete !== QUESTIONS_OUVERTES &&
      s.tete !== SORTE &&
      (noms === undefined || s.tete !== NOMS_PUBLIES)
  );
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
  const apres = [
    ...(sorte
      ? [
          {
            tete: SORTE,
            lignes: [
              '',
              texteDeLaSorte(sorte),
              ...(sorte.commande ? ['', `Commande : \`${sorte.commande}\``] : []),
              '',
            ],
          },
        ]
      : []),
    ...(noms?.length ? [{ tete: NOMS_PUBLIES, lignes: ['', lignesDesNoms(noms), ''] }] : []),
    ...(questions.length
      ? [{ tete: QUESTIONS_OUVERTES, lignes: ['', lignesOuvertes(questions), ''] }]
      : []),
  ];
  gardees.splice(i + 1, 0, ...apres);
  return gardees
    .flatMap(s => (s.tete ? [s.tete, ...s.lignes] : s.lignes))
    .join('\n')
    .trim();
}

// The plan written at the ticket by the circuit: the packages <plan> (each a directory of the
// copy, `ctx.resoudre`) in its title, after its last « — », as a title names its components, and
// the description <description> when given, by one effect `plan` when either changes; the packages
// become the run's plan (`ctx.paquets`), the list the envelope of every later session writes. The
// title.
function ecrireLePlan(ctx, plan, description = null) {
  const t = leTicket(ctx);
  const parts = t.titre.split(' — ');
  const titre = [...parts.slice(0, -1), nomsDe(ctx, plan).join(', ')].join(' — ');
  const change = {
    titre: titre === t.titre ? null : titre,
    description: description === null || description === t.description ? null : description,
  };
  if (change.titre !== null || change.description !== null) {
    emettre(ctx, { genre: 'plan', ...change });
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

// The sort the sheet of the plan <fiche> writes in the description: the one it says, read
// (`sorteDuPlan`), or none when the sheet says none.
const sorteEcrite = fiche => ('sorte' in fiche ? sorteDuPlan(fiche) : null);

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
// passed, its title and criteria unchanged since (`empreinteDuPlan`), passes. The workflow of a
// ticket plays each step of the plan in an activity of its own (grillhouse-4nr.6.3): one of
// `PAS_DU_PLAN` (`unPasDuPlan`), the one that follows decided by `pasDuPlan` of
// scripts/transitions.mjs, on the state of the plan (`{ avant, plan, premier, seance, lu, posees,
// reponse }`), which `planAuDebut` starts.

/** The state of the plan of <ctx> before its first session: the description it starts from. */
export const planAuDebut = ctx => ({
  avant: leTicket(ctx).description,
  plan: null,
  premier: null,
  seance: null,
  lu: null,
  posees: [],
  reponse: null,
});

// The state of the run while the plan is written: the step of the testwriter, its first attempt.
const etatDuPlan = () => ({
  etape: TESTS,
  tentative: 1,
  code: null,
  raison: null,
  rapport: null,
});

// The session of <role> on the plan of <ctx>, its work named in the state while it runs: its
// sheet, and the session it ran (`seance`), which the answer resumes.
async function sessionDuPlan(ctx, role, texte, options) {
  ecrireEtat(ctx, {
    ...etatDuPlan(),
    questionnement: { objet: 'plan', role, seance: options.id },
  });
  let seance = options.id;
  const fiche = await jusquALaFiche(ctx, role, texte, {
    signeDeVie: ctx.ports?.signeDeVie,
    horsEnveloppe: true,
    surLaSeance: id => {
      seance = id;
    },
    ...options,
  });
  ecrireEtat(ctx, etatDuPlan());
  return { fiche, seance };
}

// The explorateur's options on the plan of <ctx> whose description before it is <avant>.
const optionsDeLExplorateur = (ctx, avant) => ({
  droits: horsDeLEnveloppe(ctx, EXPLORATEUR, 'sonnet'),
  valider: f => fautesDesPaquets(ctx, f, decrireLePlan(avant, f.criteres, f.questions)),
});

/**
 * The step <pas> of the plan of <ctx> on its state <e> (`pasDuPlan`): `{ plan }` the state that
 * follows, `{ passe: true }` the plan passed, or `{ code }` the exit code of the question it goes
 * up with. After a session, the conclusion plays at once when it follows (`conclure`), so that the
 * plan is three sessions at most, the last ending it.
 */
export async function unPasDuPlan(ctx, pas, e) {
  try {
    const r = await PAS_DU_PLAN[pas](ctx, e);
    if (pas !== 'conclure' && r.plan && pasDuPlan(r.plan) === 'conclure') {
      return await PAS_DU_PLAN.conclure(ctx, r.plan);
    }
    return r;
  } catch (x) {
    // A session of the plan that cannot end goes up, before any testwriter.
    if (!(x instanceof Arret)) throw x;
    return {
      code: monter(ctx, {
        code: ARRETS[x.nom],
        nom: x.nom,
        rapport: x.rapport,
        piece: x.piece,
        etat: etatDuPlan(),
      }),
    };
  }
}

// The steps of the plan, each on <ctx> and the state of the plan <e>.
const PAS_DU_PLAN = {
  // The explorateur writes the plan, which the circuit writes at the ticket.
  async explorateur(ctx, e) {
    const t = leTicket(ctx);
    const { fiche: plan, seance } = await sessionDuPlan(
      ctx,
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
      { ...optionsDeLExplorateur(ctx, e.avant), id: idDeSeance(ctx, 'plan'), evenement: 'plan' }
    );
    ecrireLePlan(
      ctx,
      plan.paquets.map(ctx.resoudre),
      decrireLePlan(e.avant, plan.criteres, plan.questions, sorteEcrite(plan), plan.noms_publies)
    );
    const ouvertes = plan.questions.length ? `\n${lignesOuvertes(plan.questions)}` : 'aucune';
    commenter(
      ctx,
      'plan',
      `l'explorateur écrit le plan — paquets : ${plan.paquets.join(', ')}${ecartsDe(plan)} ; sorte : ${texteDeLaSorte(sorteDuPlan(plan))} ; ${plan.criteres.length} critère(s) ajouté(s) ; questions ouvertes : ${ouvertes}`
    );
    return { plan: { ...e, plan, premier: plan, seance } };
  },
  // The questionneur reads the plan once; its questions, or its disagreement as one.
  async questionneur(ctx, e) {
    const ecrit = leTicket(ctx);
    const { fiche: lu } = await sessionDuPlan(
      ctx,
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
      {
        droits: horsDeLEnveloppe(ctx, QUESTIONNEUR, 'sonnet'),
        id: idDeSeance(ctx, 'questionnement'),
        evenement: 'questionnement',
      }
    );
    commenter(
      ctx,
      'questionnement',
      lu.issue === 'AUCUNE'
        ? 'le plan — aucune question du questionneur.'
        : lu.issue === 'DÉSACCORD'
          ? `le plan — Le désaccord du questionneur : ${lu.desaccord}`
          : `le plan — Les questions du questionneur :\n${lignesDesQuestions(lu.questions)}`
    );
    return { plan: { ...e, lu, posees: questionsPosees(lu) } };
  },
  // The explorateur's session, resumed, answers the questions put once.
  async reponse(ctx, e) {
    const explorateur = optionsDeLExplorateur(ctx, e.avant);
    const { fiche: plan } = await sessionDuPlan(
      ctx,
      EXPLORATEUR,
      consigne(
        {
          ticket: ctx.ticket,
          sujet: ctx.sujet,
          questions: e.posees.map((q, i) => `${i + 1}. ${q}`).join('\n'),
        },
        6
      ),
      {
        ...explorateur,
        id: e.seance,
        premiere: 'reprend',
        evenement: 'reponse',
        // The answer, apart from the plan it answers (`ficheDuPlan`).
        avec: { reponse: true },
        // A line of `reponses` by question put, asked again once; after it, a question without
        // its line stays open.
        valider: (f, essai) =>
          explorateur.valider(f) ?? (essai === 1 ? reponsesAuxQuestions(f, e.posees.length) : null),
      }
    );
    const lignes = (plan.reponses ?? [])
      .map(r => `${r.numero}. ${r.reponse} — ${r.texte}`)
      .join('\n');
    commenter(
      ctx,
      'questionnement',
      `la réponse de l'explorateur${ecartsDe(plan)} :\n${lignes || 'aucune'}`
    );
    return { plan: { ...e, plan, reponse: plan } };
  },
  // What stays open: the plan passes, or its question goes up.
  async conclure(ctx, e) {
    const { plan, premier, lu, posees } = e;
    const reponses = e.reponse?.reponses ?? [];
    const ouvertes = ouvertesDuPlan(plan, posees, reponses);
    if (posees.length) {
      const plans = [{ fiche: premier }, { fiche: plan, reponse: true }];
      ecrireLePlan(
        ctx,
        plan.paquets.map(ctx.resoudre),
        decrireLePlan(
          e.avant,
          plan.criteres,
          ouvertes,
          sorteEcrite(ficheDuPlan(plans, 'sorte')),
          ficheDuPlan(plans, 'noms_publies').noms_publies
        )
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
      commenter(ctx, 'questionnement', 'le plan passe : aucune question ouverte.');
      inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, plan: { empreinte } });
      return { passe: true };
    }
    const liste = lignesOuvertes(ouvertes);
    inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: TESTS, arret: 'questionnement' });
    return {
      code: monter(ctx, {
        code: ARRETS.questionnement,
        nom: 'questionnement',
        rapport: `Des questions du plan restent ouvertes après la réponse de l'explorateur.\n\n${liste}\n\nL'échange est au ticket (\`Circuit · … · questionnement\`).`,
        piece: liste,
        etat: etatDuPlan(),
      }),
    };
  },
};

// The circuit stopped on the supervisor's word (`--arreter`) at its state <e>, which the workflow
// holds, its session ended with the act the workflow cancelled: the state keeps its step, its stop
// « arrete », its question lifted, said at the ticket. Its exit code, 0.
export async function arreter(ctx, e) {
  const lu = e;
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

// The plan <paquets> of the repository at <base>, each a directory relative to it, extended by
// <gagnes>: each one enters before the first package of the plan that reads it, as the module of
// the language reads its components (`lecteurs` of the join, its `lit` and its `parLesTests`: the
// imports of a package of TypeScript, its tests' included, the dependencies of a crate of cargo,
// of development included), else at its end, as Pants asks the order of the targets of its
// backends.
export function ordonnerLePlan(base, paquets, gagnes) {
  const langage = langageDe(base);
  const composants = langage.composants(base);
  const { lit, parLesTests } = langage.lecteurs(base, {
    composants,
    noms: [],
    texte: '',
    nommes: [],
  });
  const de = d => composants.find(c => (path.relative(base, c.dossier) || '.') === d);
  const litLe = (lecteur, fournisseur) => {
    const l = de(lecteur);
    const f = de(fournisseur);
    return Boolean(l && f && (lit.get(l)?.has(f) || parLesTests.get(l)?.has(f)));
  };
  const plan = [...paquets];
  for (const c of gagnes) {
    const i = plan.findIndex(x => litLe(x, c));
    plan.splice(i < 0 ? plan.length : i, 0, c);
  }
  return plan;
}

// The plan extended by the supervisor to the packages of `--etendre` (each a path or a package
// name of the repository, else a Usage): each one enters the title in the order of
// `ordonnerLePlan`, written by bd and said at the ticket. With the state <e>, the run then resumes
// the step under way, as `--reprendre` does, the question of the stop and the text of
// `--contexte` as the context of its sessions; a stop « sans-livraison » whose developpeur's last
// sheet sends the red to the testwriter (`renvoi`, twice in a row) resumes at the step of the role
// it names, the testwriter's, as a retry plays the job that failed. Without a state, it starts on
// the plan extended. The state the run resumes from.
function etendre(ctx, e) {
  const gagnes = [...new Set(ctx.etendre.map(ctx.resoudre))].filter(c => !ctx.paquets.includes(c));
  const base = existsSync(ctx.copie) ? ctx.copie : ctx.racine;
  const plan = ordonnerLePlan(base, ctx.paquets, gagnes);
  const titre = ecrireLePlan(ctx, plan);
  // The plan the supervisor extends has passed: it is written, questioned no more.
  inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, plan: { empreinte: empreinteDuPlan(leTicket(ctx)) } });
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

// The opening of <ctx> on <e> before its plan: `{ debut }`, or `{ code }`, a stop gone up.
async function avantLePlan(ctx, e) {
  if (ctx.etendre) {
    if (e?.etape === 'integre') throw new Usage(`--etendre : le lot de ${ctx.ticket} est intégré.`);
    e = etendre(ctx, e);
  }
  // The findings open at the launch of a run with the supervisor's context (`--contexte`, or the
  // question `--etendre` gives it) are its sessions' context; without one, their task.
  ctx.constats = auLancement(ctx.contexte, ctx.constats);
  // The rank of the circuit's arrival among the machine's waits for a place: drawn at its
  // launch, kept by its state from one session to the next and across a resumption, so that a
  // circuit well advanced is not passed by a ticket that arrived after it.
  ctx.rang = e?.rang ?? tirerLeRang();
  // The supervisor's resumption of the questioning lets the plan pass as it is now.
  if (ctx.reprendre && e?.raison === 'questionnement') {
    commenter(ctx, 'questionnement', 'le plan passe tel qu’il est, sur la reprise du superviseur.');
    inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, plan: { empreinte: empreinteDuPlan(leTicket(ctx)) } });
  }
  const d = depart(ctx, e);
  // A ticket labelled arbitrage starts and resumes only on the arbitrage its integration will
  // ask for: the integration's rule, before any session.
  const arbitrage = refusArbitrage({ id: ctx.ticket, ...leTicket(ctx) }, lesCommentaires(ctx));
  if (arbitrage) {
    return {
      code: monter(ctx, {
        code: ARRETS.besoin,
        nom: 'besoin',
        rapport: arbitrage,
        piece: `$ bd show ${ctx.ticket} --json ; bd comments ${ctx.ticket} --json\n${arbitrage}`,
        question: `${arbitrage} L'arbitrage s'écrit au ticket (« ## Arbitrage — … », tranché ou répondu par le responsable), puis \`--reprendre\`.`,
        // From the testwriter, the plan comes first: the stop is at « 1 Plan ».
        etat: d.etape === TESTS ? { ...d, questionnement: { objet: 'plan' } } : d,
      }),
    };
  }
  // The tools of the project, which every pass of the circuit plays with: a faulty key stops the
  // run before any session, by its name.
  const lancement = outilsAuLancement(ctx.racine);
  if (lancement.arret) return { code: monter(ctx, { ...lancement.arret, etat: d }) };
  ctx.outils = lancement.outils;
  const donnees = donneesAuLancement(ctx.racine);
  if (donnees.arret) return { code: monter(ctx, { ...donnees.arret, etat: d }) };
  ctx.donnees = donnees.donnees;
  // The generated files the project declares: references of the circuit, which 4.2 regenerates
  // only when a red of a pass lies in their files (`referencesDesRouges`); the integration
  // regenerates them whenever the lot touches their files or what they read.
  const engendres = engendresAuLancement(ctx.racine);
  if (engendres.arret) return { code: monter(ctx, { ...engendres.arret, etat: d }) };
  ctx.engendres = engendres.engendres;
  // The flows of the CI, refused at the launch when their key is faulty: the reviewer's instruction
  // reads those the lot touches (`consigneDesFlux`).
  const flux = fluxAuLancement(ctx.racine);
  if (flux.arret) return { code: monter(ctx, { ...flux.arret, etat: d }) };
  return { debut: d };
}

/**
 * The opening of a run of <ctx> on its state <e> up to its plan (`ouvrir` without its plan), as
 * the workflow of a ticket plays the plan's steps itself: `{ code }`, a stop gone up; or
 * `{ debut, plan }`, the step it starts at and the state of the plan still to write
 * (`planAuDebut`), null when none is.
 */
export async function ouvrirJusquAuPlan(ctx, e) {
  const o = await avantLePlan(ctx, e);
  if ('code' in o) return o;
  const aEcrire = o.debut.etape === TESTS && !planPasse(ctx, empreinteDuPlan(leTicket(ctx)));
  return { debut: o.debut, plan: aEcrire ? planAuDebut(ctx) : null };
}

/** The end of the opening of <ctx> at the step <d>: the sort of the ticket, the siblings swept. `{ debut }`. */
export function finirLOuverture(ctx, d) {
  // The sort of the ticket its plan says, which the run reads at each step.
  ctx.sorte = sorteDuTicket(ctx);
  // A sibling of HEAD's version a killed circuit left in the copy never enters the lot.
  if (existsSync(ctx.copie)) balayerLesSoeurs(ctx);
  return { debut: d };
}
