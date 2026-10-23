#!/usr/bin/env node
// The circuit of one ticket: for each component its title names, in order, the provider first, the
// testwriter, the proof of the red, the developpeur and the checks; then the reviewer, and on its
// ACCEPTÉ the integration, which commits the lot on the ticket's branch and puts that branch in the
// queue; then the queue, which brings it onto main, pushes and reads the CI, and the circuit ends
// on the state of the ticket the queue leaves. The supervisor runs it once, in the background, and
// its end wakes him: at 0 the ticket is closed; at 75 he runs `--reprendre` again once the machine
// is at rest; at any other code, a question of the circuit waits for him. As a CI applies its rules
// (retry, regenerate, skip a job without object) without asking anyone and calls a person only for
// what no rule settles (the approval of a review), the circuit makes the mechanical gestures
// itself, with no session (GESTES of scripts/etapes.mjs), and every other stop goes up to the
// supervisor: its state carries the question (`question`: the fact, its piece, file:line or command
// and output, the question, and who must answer it, MONTEES of scripts/etapes.mjs). He answers by a
// command of the circuit, `--reprendre` (with `--contexte`) or `--depuis`, `--etendre <composant>`,
// or `--arreter`, and carries to the owner what is his (`qui` responsable). So the supervisor is
// woken only by the end of the lot or by a question no rule settles.
//
//   npx grillhouse circuit <ticket> [--reprendre] [--contexte <texte>]
//   npx grillhouse circuit <ticket> --depuis <testwriter|developpeur> <composant> --contexte <texte>
//   npx grillhouse circuit <ticket> --etendre <composant>[,<composant>…] [--contexte <texte>]
//   npx grillhouse circuit <ticket> --arreter [--contexte <motif>]
//
// The circuit decides on structured results only (scripts/resultats.mjs, the one module of their
// formats), as Bazel's Build Event Protocol and the JUnit reports carry the outcome of a build:
// the sheet that ends each session, the summaries of Turborepo, the JSON reports of Vitest and the
// SARIF of the guards. It reads no comment, no answer and no log to decide (a guard holds it:
// tests/unit/circuit-sans-texte-libre.spec.ts); the handovers at the ticket are for the human and
// for the next session of their author, the log for the human.
//
// - The components are read in the ticket's title (`bd show <ticket> --json`), after its last
//   « — », separated by commas: each one a path (`packages/<nom>`, or `.`), or the name of a
//   package, which becomes its directory (scripts/paquets.mjs), read in the ticket's copy when it
//   exists, else in the main tree. A component that names neither stops the call, exit 2, named.
// - Before the testwriter of the first component (a run that starts there), the circuit surveys the
//   components (step 1.1 of scripts/etapes.mjs) the ticket's Architecture and criteria reach (scripts/composants-affectes.mjs), as
//   the « affected components » of a design document: a component the survey finds, the title
//   does not name and no admission covers (`composants-affectes.mjs <ticket> --admettre`) stops it
//   at once, before any session, at « composants-manquants », the missing components at the head
//   of its report, a question for the supervisor: he extends the plan (`--etendre`), or admits
//   them out of the title (`--admettre`) and runs `--reprendre`.
// - Then, before any session of the lot, the questioning of the plan (step 1.2 of
//   scripts/etapes.mjs), as Amazon's bar raiser, a cockpit's challenge and response and the
//   devil's advocate of a design review: one session of the questionneur out of the envelope, as the
//   reviewer's, read-only (no tool of writing, every write of bd refused, scripts/droits.mjs), its
//   instruction from the fifth template (the proposal, the métacadre, the rubrics « Comment on
//   arbitre » and « Ce qui monte au superviseur » of the project's CLAUDE.md, the ticket's
//   description and the survey of its components; no list of questions), its sheet `issue`
//   QUESTIONS (each question with what it aims at), AUCUNE or DÉSACCORD. It reads the plan once:
//   its questions are written at the ticket (`Circuit · <composant> · questionnement : …`) and the
//   end kept with the circuit's results (`questionnement`: objet, tours, change, issue, the plan's
//   fingerprint). AUCUNE goes on; a plan whose title and description passed a questioning, or the
//   supervisor's resumption of its stop, passes unquestioned. QUESTIONS or a DÉSACCORD stops at
//   « questionnement », the questions at the head of its report, a question for the supervisor: he
//   changes the plan (`bd update`) or keeps it, then `--reprendre` lets the plan pass as it is then,
//   from the first component.
// - Each session is a launch of scripts/enveloppe/lancer.sh, a child process the circuit waits
//   for, in its own process group, its errors written to a file: a session outlives the death of
//   its circuit (its caller dead, the circuit with it), and the state names its group while it
//   runs. Its plan, the packages it writes (`--paquets`, the envelope's list), is the components
//   of the title, the whole copy in sight; a session its lock stops on a write out of the plan
//   ends the circuit at « hors-plan », a question for the supervisor, the write as its piece. The
//   instruction is written from the first template of
//   mods/grillhouse/skills/pitmaster/references/consigne-agent.md, each `{{champ}}` filled: the ticket and
//   its subject, the component, the ticket's description (its criteria) and its notes (a section
//   absent without notes), both read with `bd show` at the session's launch, the report of the
//   step before (the proof, the reds of a check), the last handover of the session's author
//   (`<rôle> <composant>`) at the ticket, for a developpeur without one yet the last of the
//   testwriter of his component, else « aucune » (no other component's handover, nor a verdict), and
//   the line `CONTEXTE :`: the text of `--contexte`, for each agent of a run without `--depuis`,
//   for each agent of the component it plays again under `--depuis`. The session's own exit code
//   is the one lancer.sh writes to `.claude/worktrees/<ticket>.fin`; a launch that leaves none stopped before its session.
// - Each session of the testwriter, the developpeur, the reviewer and the questionneur ends on its
//   sheet
//   (« la fiche »): claude runs with `--output-format json --json-schema <the schema of its role>`
//   (scripts/resultats.mjs), and its JSON result carries the sheet in `structured_output`, which
//   the circuit reads (`lireFiche`): lancer.sh writes that result to
//   `.claude/worktrees/<ticket>.resultat.json`, and a session out of the envelope prints it. Each
//   sheet read is kept with the ticket's sheets, `.claude/worktrees/<ticket>.fiches.jsonl` (`{
//   date, role, composant, fiche }`, the lot a review read joined to its sheet, `lot`), beside the
//   circuit's own results: the report of each proof and check, which the reviewer receives, with
//   its outcome (`resultat`), each stop (`arret`), each developpeur resumed who changed nothing
//   (`inchange`), each session launched (`lancement`, its role and its session id), each end of a
//   run on a question (`montee`: its code, its stop and who must answer it), which the bilan reads;
//   and each of its discoveries (`decouvertes`) filed closed
//   under the ticket (scripts/ticket.sh, label `decouverte`). A session that ends without a sheet
//   that conforms (none, one out of its schema, a code other than 0) is resumed once, the same
//   session, with the third template, which names what lacks; a second one stops the circuit at
//   « sans-fiche ». The handover at the ticket (`bd comments add`) stays, for the human.
// - A fresh session of the testwriter or the developpeur opens under a session id the circuit sets
//   (`lancer.sh --seance <uuid>`, claude's `--session-id`), kept in the state (`reprise`, its
//   author and id). A relaunch of that agent on its step and component (the testwriter after a failed
//   proof, the developpeur after red checks) resumes that session (`lancer.sh --reprise <id>`,
//   claude's `--resume`, which finds its transcript in the copy's folder of transcripts, which
//   the envelope mounts in writing over the real one) with the fourth template of consigne-agent.md
//   (the ticket, the component, what changed, the new report), save the last attempt (the
//   testwriter's third session, the developpeur's on the strong model), a fresh and whole session. A
//   resumption that ends with a code other than 0, or without a sheet that conforms, writes so at
//   the ticket and falls back on a fresh and whole session. A resumed session keeps its id, and so
//   its one line in the register, its latest end.
// - A session whose transcripts (`~/.claude/projects/<copy in dashes>/`, as scripts/registre.mjs
//   reads them) and log (its preparation writes there before the session opens) stand still for
//   20 minutes (IMMOBILE_MS; GRILLHOUSE_CIRCUIT_IMMOBILE_MS replaces
//   it, in milliseconds) is stopped: SIGTERM, then SIGKILL, to the launcher's group.
// - Each comment at the ticket carries its author, which bd reads in BEADS_ACTOR (ACTEUR): each
//   session runs with the author of its role (`testwriter <composant>`, `developpeur <composant>`,
//   `relecteur`, `questionneur`), which the envelope passes on; the circuit writes its own
//   lines under `circuit` and the reviewer's verdict under `relecteur`, and the queue writes under
//   `file` (scripts/integration/file.mjs), whose last word the circuit names. The rights of every
//   session refuse bd's `--actor`, `-a`/`--author` and the variable itself (AUTEUR_FIXE of
//   scripts/droits.mjs, in the settings of every role's session), so that no agent changes its
//   author.
// - The sheet of the testwriter and of the developpeur carries its status (`statut`): FAIT goes on as
//   below; BESOIN (its `question`) stops the circuit at once at « besoin », the question and the
//   handover as its report, with no session more; so does BLOQUÉ (its `raison`), at
//   « hors-portee », save for a developpeur whose sheet sends the red to a testwriter (`renvoi`,
//   below), which is that sending. Either stop goes up to the supervisor, the sheet as its piece.
// - A component that carries no test (sansTests: in a repository of packages, no package with a
//   script `test:vitest` lies in it or holds it, as `npm test -- <chemin>` refuses a path out of
//   every package or in a package without that script) skips the testwriter and the proof: the
//   circuit writes `Circuit · <composant> · testwriter : aucun test …` at the ticket and launches its
//   developpeur, the reason as his report, then his checks.
// - Each command of the proof and of the checks runs with its own results directory
//   (`GRILLHOUSE_RESULTATS`), where Turborepo writes its summary (scripts/tests.mjs,
//   scripts/verifier.mjs), Vitest its JSON report (scripts/vitest-config/resultats.mjs) and each
//   guard its SARIF; its output goes to the log, for the human. Each `npm test` of them carries
//   the mark `GRILLHOUSE_DEPUIS_LE_VERT` (scripts/dernier-vert.mjs): in a package named whole,
//   the tests that play are those Vitest relates to the files changed since the last green of the
//   copy's branch (main's while the copy has none), the files named among them, as `npm run verifier` measures itself; a lot that
//   changes one test plays that test, and those whose graph it reaches.
// - Each automatic pass (each command of the proof and of the checks, the final pass, the
//   integration and the queue) plays under a progress directory of its own
//   (`GRILLHOUSE_AVANCEMENT`, scripts/avancement.mjs), which its state names while it plays
//   (`avancement`: `{ dossier }`, null between two), as Bazel counts its actions: Vitest writes
//   there the files done and planned of each task, the queue the steps of its CI; the board shows
//   them on the ticket's line (scripts/tableau.mjs). Its total is kept at its end under its kind
//   (the step, the component and the command), which the next pass of that kind takes while all
//   its tasks have not started. The survey of the components names its start in the state while it
//   runs (`releve`).
// - The proof of the red plays the new tests alone, as test-driven development runs the test it
//   has just written to see it red, not the whole suite: one run per package, `npm test -- --force
//   <files>` in the copy, the test files the testwriter's lot adds or changes in the component (git
//   status of the copy, the testwriter's files as the integration shares them, `isTesterFile`),
//   played for real, since a run replayed from Turborepo's cache writes no report; the other
//   tests of the component play at its checks and at the final pass. With no file of the lot in
//   the component (a reader whose provider changed a type, no new test to write), each package of
//   the component that has a script `test:vitest` plays whole, `npm test -- <package>`: main is
//   green, so a test HEAD holds that turns red in the copy is a regression of the lot, a red,
//   written `rouge existant : <file> › <name> — <message>`, and so is a file that does not load
//   while no build of the component fails (it loaded at HEAD); its greens do not count. A measure
//   on the same tree is not played again, as Turborepo replays a task whose inputs did not move: a
//   testwriter relaunched who changes no file of the copy (an expected green added to his sheet
//   alone) is judged on the results of the proof already played, his sheet read again. A file of
//   the lot that does not load proves nothing; a failed build of a package of the component (a
//   task `<package>#build` of the summary) is a red, as not compiling is failing, named with its
//   log, and the files it keeps from loading play at the checks, after the developpeur; a failed
//   build of a package out of the component leaves them broken. A green test passes only when a
//   sheet of the testwriter of the component names it in `verts_attendus`: its file from the root
//   and its full name (or its title), with its reason; one without `test`, for a test file HEAD
//   holds, justifies each green test of that file and excuses no red; on a new file it justifies
//   nothing, and the report says so for that file. A green test HEAD already holds has nothing to
//   prove: the version of HEAD of each file plays in the same run, from a sibling file
//   (`<nom>.circuit-avant.test.<ext>`, removed after it), and a green test whose full name HEAD's
//   version holds, green there too, is set aside, counted; a body changed under the same name is
//   not told apart. The proof passes with a red (of the lot, existing or of a build), even without
//   a file of the lot in the component: a testwriter with no new test to write says so in his
//   handover, the existing reds are enough. It fails with
//   neither a file of the lot nor a red, with a broken file of the lot, or with a green of the lot
//   no expected green justifies. A failed proof relaunches the testwriter with its report, twice at
//   most. The report (reds, justified greens) is written at the ticket. A proof with a red
//   launches the developpeur, and so does a proof without a red when a finding of the reviewer
//   names him; else it skips him: the lot is a lot of tests alone.
// - A developpeur is launched on a red, of a proof or of a check, on a finding of the reviewer, or
//   in a component without tests: a session that changes no file of its component (`git status
//   --porcelain` of its directory and the content of each file it lists, taken before and after
//   the session; the sheet and the handover do not count) has nothing to deliver, the gesture
//   `rien-a-livrer`, as a CI skips a job without object: its component's checks judge its lot; green,
//   the run goes on; red, the circuit stops at « sans-livraison », its report naming the component
//   and sending to the developpeur's handover.
// - A sheet of the developpeur whose `renvoi` names `testwriter <composant>` (a component of the title
//   up to his own) says the red that remains lies in the tests of that component: the gesture
//   `renvoi-au-testwriter`, the circuit plays it as a `--depuis testwriter <composant>`, the sending
//   and the handover as its context, whether or not the session changed a file: that component's testwriter,
//   the sending on his line CONTEXTE, then its steps, the components after it as `--depuis` plays
//   them, the final pass and the reviewer; in a round of `renvois` (a RENDU, a `--depuis`), the
//   renvois of his component and of the components after it stay pending, each played after it with
//   its findings, as a queue of jobs grows and is never replaced. A component out of the title or
//   after his own is no such sending. The same sending twice in a row, with no green checks between them, stops at
//   « sans-livraison ».
// - The checks after the developpeur of a component judge that component, as Bazel plays the
//   targets of a change: `npm test -- <test files of the lot>` that lie in it (and those of the
//   shared test material whose package depends on none of the components after it), `npm test --
//   <package>` for each of its packages, touched by the lot or not (a package without a script
//   `test:vitest` plays only when the lot touches it), then the guards in the envelope of the
//   component (`GRILLHOUSE_ENVELOPPE=<composant> npm run grillhouse:gardes`, and `npm run gardes`
//   when the project has it). Each red is read in the results of its command: a
//   failed test of the reports of Vitest, a finding of the guards' SARIF, a failed build or task of
//   the summary; a red check none of them situates is one red of the command. Each red belongs to
//   the component that holds its file (or its task's package), the deepest; one without a file
//   (the root's, a project's guard without SARIF), or in a package no component of the title
//   holds, belongs to none. Out of the final pass, the reds of the component are its developpeur's;
//   the others wait for the final pass: another component's, a finding of a guard on a file of
//   another package (the SARIF names its file and its package), and a red without a file, the
//   global guards': they play at the final pass alone.
// - After the last component of the run, the final pass: `npm run verifier`, what the
//   integration plays, as bors plays on a lot the very check of the merge. Turborepo's cache
//   and the last green hold its cost: a task nothing moved replays from it, and in a package
//   that plays again, the tests Vitest relates to the files changed since the last green of the
//   copy (scripts/dernier-vert.mjs, main's while the copy has none); what the lot reaches plays again,
//   by the dependencies, the inputs of the tasks and `grillhouse.lit` (a reader out of the title
//   whose tests read a directory the lot changes included). After a review, save on the lot it
//   accepted, the final pass is restricted to what changed since the lot it read and to its
//   dependents, as Turborepo selects them (`laPasseFinale`): the circuit keeps the copy as it
//   stands as a commit on that lot (`garderLeLot`), and plays `npm run verifier --
//   --filter=...[<lot relu>...<copie>] --filter=//`, the root's tasks (the guards) with them;
//   Turborepo reads a range from its merge base, the lot read, where a single `[<commit>]` would
//   be read against HEAD. The whole final pass green keeps the tree of its lot (`verifie`). A red
//   goes to the developpeur of the first component, the provider first, that owns one, the gesture
//   `rouge-d-un-autre-composant` when it is not the component under way. A red in a package no
//   component of the title holds, or that no component owns, stops at « controles », a question for
//   the supervisor: he extends the plan to that component (`--etendre`), or has the lot corrected
//   (`--depuis developpeur <composant>`). A developpeur whose reds are all findings to settle
//   (`a-arbitrer`) is not launched: the circuit stops at « controles », each finding as its piece.
//   From then on every check is the final pass.
// - The regeneration of the references (step 3.1 of scripts/etapes.mjs), as `rustc --bless`,
//   `jest -u` and `cargo insta accept`: a project declares in its package.json the references it
//   derives from the whole copy, which no envelope shows (a fingerprint of its output, a ceiling
//   of a count), `grillhouse.references`: each `{ nom, commande, fichiers, tests, gardes }`, its
//   name, the shell command that writes it again from the root of the copy, the files it writes
//   (paths, directories or glob patterns, `*` and `**`, from the root, as the inputs of
//   Turborepo), the test files that judge it, as `rustc --bless` ties a test to its expected
//   outputs, and the guards of the project that judge it, by the name their SARIF finding carries
//   (its guard or its rule). A final pass whose every red is one of the references declared (a
//   failed test of one of their test files, a finding of one of their guards, whatever file it
//   aims at, or a failed test or a finding on a file they cover) sends no developpeur: the gesture
//   `regeneration`; the circuit keeps the copy as a lot, runs each command on
//   the whole copy, out of the envelope, under the lock of the machine, its output added to the
//   log, keeps the copy again on that lot, then plays the final pass restricted to what the
//   regeneration changed and its dependents (`--filter=...[<avant>...<après>] --filter=//`); that
//   pass green after a whole one keeps its tree as verified. The files regenerated stay in the
//   copy: the lot carries them, and the reviewer reads them with the rest of the lot, the step's
//   report among the circuit's. A reference changed that the ticket's description names neither
//   by its name nor by one of its files, a file changed that the files of no reference cover, a command at
//   a code other than 0, a regeneration that changes nothing, or a pass after it red again on the
//   references, stops at « references » (23), the copy restored as it was before the
//   regeneration, each reference and file named, a question for the supervisor. Without the
//   declaration, the step never runs.
// - The proof, the checks and the final pass are heavy passes: each holds the lock of the machine
//   (scripts/verrou-de-machine.mjs), shared by every repository of the machine, and waits, the
//   wait written to the log, while another measure holds it; the wait bounded, the pass is at 75,
//   « à repasser ».
// - The report a developpeur receives names his own reds first, each on its line (test or
//   finding, file and line, message, the beginning of a failed build's own log), then the count
//   of the others and the path of the log; the report of a stop names every red with its
//   component.
// - A check at 75 (« à repasser ») out of the final pass plays once more, the gesture `rejeu`;
//   verifier plays its tasks at 75 again itself, at rest, and its 75 is the final pass's. A check
//   still at 75 ends the circuit at 75, the gesture `a-repasser`. A red relaunches the
//   developpeur with its report, twice at most, the third session on the strong model
//   (`lancer.sh --modele opus --effort high`): three sessions for a component's checks, and three
//   for the whole final pass whatever the components its reds go to (the last component's
//   sessions counted in it), so that two components sending a red to each other stop at
//   « controles ».
// - After the final pass, green, the reviewer: a session out of the envelope, which sees the whole
//   repository with its index, claude itself (`claude -p --agent relecteur --session-id <uuid>`,
//   CLAUDE_BIN replaces claude) in the ticket's copy, on Opus, under the rights and the
//   context of its role (scripts/droits.mjs: the commands its skill names, its index), its instruction from the second template of
//   consigne-agent.md: the ticket, its components, the path of the claims file (the ticket's
//   description as `bd show` gives it at the session's launch, written by the circuit in its
//   working folder, which the session may read; the instruction carries no criteria, which the
//   reviewer's skill reads only after its first passes), the files of the lot (the testwriter's by
//   `isTesterFile`, then the others) and the circuit's reports since its last sheet (its proofs and
//   checks). Its errors go to the log under its header line, its line to the register
//   (scripts/registre.mjs --copie), and it is watched as a session in the envelope is. Its sheet
//   is its verdict (`verdict` ACCEPTÉ or RENDU, its `constats`, each `bloquant` with the criterion
//   or rule it holds, or `remarque`, its `question`, `ecarts`): the circuit writes it at the ticket
//   for the human, under the author `relecteur`, its first word the verdict, each blocking finding
//   under its heading with its recipient, then the remarks (`texteDuVerdict`).
// - A sheet of the reviewer with a `question` (what goes up to the owner, a real word of the
//   language written in the code) stops the circuit at « besoin », whatever its verdict, before
//   it commits or relaunches anyone, the question and the verdict as its report, a question the
//   owner must answer (`qui` responsable), which the supervisor carries.
// - RENDU: the blocking findings alone send the lot back, a remark reaching only the ticket (a
//   verdict without a blocking finding is ACCEPTÉ, the sheet's schema refusing any other). Each
//   blocking finding names its recipient, `role` testwriter or developpeur and `composant` one of
//   the title (a path or a package name). The circuit plays again the components the findings
//   name, the provider first, and those alone (`suivant`: the final pass before the review
//   carried every other one through): its testwriter → preuve → developpeur → controles when a
//   finding names its testwriter, else its developpeur → controles, the findings for each role as
//   the report of its session (those for the developpeur after the proof's report); then the
//   final pass, restricted to what the fix changes and its dependents, and the reviewer again, on
//   the difference: the lot it read before is kept (`lot` of its sheet's entry), as Gerrit keeps
//   each patch set, and the next review receives the command of the difference between the two
//   lots, the files of the lot that changed since, and the findings before it, which it judges
//   lifted or not (`suivi`); the rest of the lot it does not read again (its skill, « La
//   relecture bornée »).
//   A blocking finding without a valid recipient, or one that puts its criterion in question
//   (`critere_en_cause`), stops at « relecture-arret »; so does the third RENDU since
//   the ticket's last ACCEPTÉ.
// - ACCEPTÉ: the integration, once the whole final pass has played on the lot accepted (its tree
//   is `verifie`); else that pass first, once, its red going to its owner's developpeur and the
//   lot then to the reviewer again. The circuit builds the lot from the copy: the files the copy
//   changes against its HEAD, the testwriter's (`isTesterFile`: test
//   files and the shared test material) in one patch, the others in another, each file against
//   HEAD and a new one against nothing (`git diff --no-index /dev/null`), the copy's index
//   untouched; the message `<type>(<composants>): <sujet> (<ticket>)`, the type read from the
//   ticket's type (bug fix, chore, docs, else feat), its body written once from the final state:
//   the criteria of the plan, then each deviation the sheets of the developpeurs and of the
//   reviewer name (`ecarts`), once by its subject, from the last sheet that carries it, with the
//   trailer Co-Authored-By. It runs
//   scripts/integration/integrer.mjs from the main tree, its output added to the log: 0 is the
//   commit on agent/<ticket> (which the circuit names from git), the copy removed, the branch in
//   the queue; 75 (« à repasser ») plays it once more (`rejeu`), then stops at « a-repasser »; any other
//   code is its refusal, which stops at « integration ».
// - Then the queue: scripts/integration/file.mjs from the main tree, waited for, its output added
//   to the log (it brings the branch onto main, pushes it and reads the CI of the commit pushed).
//   A queue already running exits 0 at once: the circuit waits while the branch is in the queue
//   and the queue's lock names a live process. Then the state of the ticket: closed, the circuit
//   ends at « integre », exit 0 (the queue's last word at the ticket named with it, a CI it could
//   not read); reopened (out of the queue, or a red CI), it stops at « integration », the queue's
//   last word as its reason; still in the queue, it stops at « a-repasser », the queue's reason.
// - The working directory is the ticket's, `.claude/worktrees/<ticket>.travail`: the instructions,
//   results and errors of the sessions, the patches and message of the integration. It lives as
//   long as the ticket, as the workspace of a pipeline: a circuit relaunched takes it up again, no
//   sweep touches it, the queue removes it at the ticket's closure, and scripts/retirer-copie.sh
//   with the copy of a ticket closed without integration. The results and progress of the passes
//   live in the base of the run (scripts/vitest-config/base-de-passe.mjs), removed at its end.
// - The state is `.claude/worktrees/<ticket>.circuit.json`, written again at each step and at the
//   start and end of each session: `{ etape, composant, tentative, code, raison, rapport, dernier,
//   finale, boucles, seance, question, questionnement, processus, composants, renvois, atteints,
//   verifie, mene, reprise, journal }`; `processus` the process of the circuit that writes it;
//   `questionnement` the questioning of the plan under way (`{ objet, tour, seance }`: the plan,
//   its one reading, the questionneur's session), null otherwise; `etape` is the state's name of a
//   numbered step of the process (scripts/etapes.mjs: testwriter 2.1, preuve 2.2, developpeur 2.3,
//   controles 2.4, or 3 the final pass once `finale`, references 3.1, relecture 4, integration 5.1,
//   file 5.2), or integre at the end; `raison` names the stop (« arrete » once the supervisor
//   stopped the circuit); `question` the question of a stop for the supervisor (`{ arret, fait,
//   piece, question, qui }`), null otherwise; `composants` the components of the title, in their
//   order, which the board reads for the rank of `composant`; `boucles` the counts of the bounded
//   loops of the step under way, by their key (`tests`, the testwriter's sessions with their
//   proofs; `code`, the developpeur's with their checks; `relecture`, the reviews), null at a step
//   without one; `dernier` is the last component of the run; `finale` whether the final pass has
//   begun; `seance` the process group of the session that runs, null between two; `renvois` the
//   components a RENDU, `--depuis`, `--etendre` or a gesture plays again, each with its first step
//   and its findings, and under `--depuis` its context (`contexte`), null out of such a round;
//   `atteints` the components the circuit has carried through, each on its own (its proof without a
//   red for its developpeur, its developpeur's delivery, its green checks, every one once the final
//   pass is green), whatever the title gains before it, kept from one run to the next, empty when a
//   run starts over from the first component's testwriter; `verifie` the tree of the lot the last
//   whole final pass green played, null before; `mene` the start (an ISO date) of the step the
//   circuit leads itself while it runs, null otherwise; `reprise` the session of the testwriter or
//   developpeur its relaunches resume, `{ agent, seance }`, null before any.
// - `--reprendre` starts again at the step and component of the state, its report given to the
//   next session, and goes on to its `dernier`; after any stop, the death of the circuit with its
//   caller included. A session the state names that still runs is waited for first, and stopped
//   when it stands still as long as a motionless session. On a stop « questionnement », it lets the
//   plan pass as it is then (the supervisor changed it or kept it), from the first component.
// - `--depuis <testwriter|developpeur> <composant>` (a path or a package name the title names) has
//   the lot corrected by one component: it plays it from that agent, the text of `--contexte` on
//   the line CONTEXTE of each agent of that component, its testwriter then its developpeur, as a
//   retry of GitLab CI plays the jobs after it with the same variables: that component's steps,
//   its developpeur launched by a red of its proof as without `--depuis`; then each component after
//   it that the circuit has not carried through yet (`atteints`), its whole circuit, testwriter,
//   proof, developpeur and checks; one it has carried through plays nothing, the final pass judges
//   it; then the final pass, the reviewer and the integration. It goes with no `--reprendre`.
// - `--etendre <composant>[,<composant>…]` (each a path or a package name of the repository) extends
//   the plan: the circuit writes the title (`bd update --title`), each component gained before the
//   first component of the title that depends on it (its package.json), else at its end, said at
//   the ticket (`Circuit · <composant> · plan : le superviseur étend le plan à …`); then the run
//   resumes as after `--reprendre`, each component gained played from its testwriter, the stopped
//   component from its step (a testwriter's or a developpeur's), its question as their context
//   with the text of `--contexte`; a stop at the final pass plays the components gained, then the
//   final pass. A component the repository does not hold is refused, exit 2.
// - `--arreter` stops the circuit on the supervisor's word, as a pipeline cancelled: a circuit
//   running on the ticket (the state's `processus`, alive) stops, SIGTERM then SIGKILL, and so does
//   the session it led (`seance`); the state keeps its step, its stop « arrete », its question
//   lifted, its motive (`--contexte`) as its report, said at the ticket (`Circuit · <composant> ·
//   arret : le superviseur arrête le circuit : <motif>`), exit 0. Without a state, the call is
//   refused.
// - On a stop other than 0, the circuit applies its gesture when one settles it (`a-repasser`:
//   it ends at 75), the gesture written at the ticket and in the log; every other stop goes up to
//   the supervisor (`monter`): its question (MONTEES of scripts/etapes.mjs, or the agent's own
//   question), its fact (the first line of its motive or its report), its piece (the write out of
//   the plan, the reds with their file and line, the sheet of the agent, or the command and the end
//   of the log) and who must answer it, kept in the state (`question`) and written at the ticket
//   (`Circuit · <composant> · question : <arrêt> à <étape> — <fait> — au <qui> : <question>`).
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
// - At each of its ends (« integre », 75, or a question for the supervisor), the circuit writes the
//   ticket's bilan (scripts/bilan.mjs): its figures, measured on the register, its results and its
//   state, kept in `.claude/worktrees/<ticket>.bilan.json` and written at the ticket
//   in one short comment, `Circuit · <composant> · bilan : …`, compared with the bilan before it in
//   the project.
// - Exit codes: 0 at « integre »; 2 a malformed call; a stop, by its name (ARRETS):
//   10 lancement (lancer.sh stopped before the session), 11 bloqué (a motionless transcript),
//   12 sans-fiche (twice no sheet that conforms), 13 preuve (the third proof fails), 14 controles
//   (the third developpeur of a component's checks or of the final pass leaves a red check, a red
//   of the final pass no component of the title owns, or reds to settle),
//   15 sans-livraison (a developpeur session that changes no file of its component, its checks
//   red; the first session of a `--reprendre` whose component already holds changes goes on to the
//   checks; or the developpeur's same sending to a testwriter twice in a row, no green checks
//   between them),
//   16 relecture-arret (a finding without a valid recipient, one on a criterion, the third RENDU),
//   17 integration (the integration script refuses the lot, or the queue reopens the ticket),
//   19 hors-portee (a testwriter or developpeur whose sheet says BLOQUÉ, without a sending to a
//   testwriter), 20 besoin (a testwriter or developpeur whose sheet says BESOIN, a reviewer whose sheet
//   carries a `question`),
//   21 composants-manquants (a component the survey of the ticket finds and its title misses),
//   22 questionnement (the questionneur's questions on the plan, or its disagreement), 23
//   references (a regeneration of 3.1 the plan does not cover, or that lifts nothing), 24 hors-plan
//   (a testwriter or developpeur session its lock stops on a write out of the plan,
//   `<ticket>.hors-plan` that lancer.sh writes), each a question for the supervisor;
//   75 a-repasser (a check or the integration still at 75 once played again, or the branch still
//   in the queue), the gesture `a-repasser`.
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
import { verifierLeTitre } from './composants-affectes.mjs';
import { optionsDuRole } from './droits.mjs';
import { matieres, NOM_DE_TEST } from './consommateurs.mjs';
import { ecrireLaListe, VARIABLE as VARIABLE_ENVELOPPE } from './enveloppe/paquets-du-plan.mjs';
import {
  ARRETS,
  AUTO,
  boucle,
  bouclesDe,
  etapeDuCircuit,
  gesteDe,
  libelle,
  monteeDe,
  QUESTIONNEUR,
  RESPONSABLE,
  SUITE,
} from './etapes.mjs';
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
import { attendreUnPeu } from './verrou-de-fichier.mjs';
import { AttenteDeLaMachine, avecLaMachine } from './verrou-de-machine.mjs';
import { garderLeTotal, ouvrirAvancement } from './avancement.mjs';
import { AVANCEMENT } from './vitest-config/avancement.mjs';
import { NOMS_DES_GARDES } from './gardes-du-cadre.mjs';
import { isTesterFile } from './verrous/verrou.mjs';
import { A_REPASSER } from './vitest-config/pression.mjs';
import { ouvrirBase, vivant } from './vitest-config/base-de-passe.mjs';
import { GREFFON } from './cadre.mjs';

// The time a session's transcripts may stand still before the circuit stops it.
export const IMMOBILE_MS = 20 * 60 * 1000;
// The exit code of each stop, from the list of the steps and stops.
export { ARRETS };
const CODE_USAGE = 2;
// The bounded loops, each declared with its step (scripts/etapes.mjs, `boucles`): the testwriter is
// relaunched twice at most after a failed proof (three sessions); the developpeur has three
// sessions, the last on the strong model; the third RENDU of one ticket stops the circuit.
const RELANCES_TESTWRITER = boucle('tests').max - 1;
const SEANCES_DEVELOPPEUR = boucle('code').max;
const RELECTURES = boucle('relecture').max;
// The roles a finding of the reviewer may name: the agents of the steps run for each component.
const DESTINATAIRES = SUITE.filter(e => e.parComposant)
  .flatMap(e => e.qui)
  .filter(q => q !== AUTO);
// The steps of the circuit's state, read from the list of the steps.
const etatDe = n => SUITE.find(e => e.numero === n).etat;
const [TESTS, PREUVE, CODE, CONTROLES, REFERENCES, RELECTURE, INTEGRATION, EN_FILE] = [
  '2.1',
  '2.2',
  '2.3',
  '2.4',
  '3.1',
  '4',
  '5.1',
  '5.2',
].map(etatDe);
// The variable in which bd reads the author of a comment (`bd --help`: « default: $BEADS_ACTOR,
// git user.name, $USER »); the author of the circuit's own lines; the author of a session of
// <role> on <composant>: `testwriter <composant>`, `developpeur <composant>`, else the role alone.
const ACTEUR = 'BEADS_ACTOR';
const AUTEUR_DU_CIRCUIT = 'circuit';
const auteur = (role, composant) => (DESTINATAIRES.includes(role) ? `${role} ${composant}` : role);
// The sessions out of the envelope (the reviewer on Opus, the questionneur on Sonnet), each in the
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
// The templates of the instructions, in the skill of the supervisor, which the frame's plugin
// carries, read at the plugin's root (scripts/cadre.mjs).
const GABARIT = path.join(GREFFON, 'skills', 'pitmaster', 'references', 'consigne-agent.md');

// A stop of the circuit: its name (a key of ARRETS) and its report; for a stop of the checks, its
// reds read in the structured results (`{ composant, texte, detail }`) and its motive, the report
// without their list; the outcome of the step it stops, when it has one (a proof's), which the
// bilan reads; and what its montée carries beyond the question of its kind (scripts/etapes.mjs,
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
        throw new Usage('--etendre attend les composants que le plan gagne.');
      o.etendre = liste;
      i++;
    } else if (a === '--depuis') {
      const [etape, composant] = argv.slice(i + 1, i + 3);
      if (!['testwriter', 'developpeur'].includes(etape))
        throw new Usage('--depuis attend testwriter ou developpeur, puis un composant.');
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
  // The subject and the components of the title <titre>, « numéro — sujet — composants », or a
  // Usage.
  const duTitre = titre => {
    const parts = String(titre ?? '').split(' — ');
    if (parts.length < 2) throw new Usage(`le titre de ${o.ticket} ne nomme pas ses composants.`);
    return {
      sujet: parts.length > 2 ? parts.slice(1, -1).join(' — ') : parts[0],
      composants: parts
        .at(-1)
        .split(',')
        .map(c => c.trim())
        .filter(Boolean)
        .map(resoudre),
    };
  };
  const { sujet, composants } = duTitre(t?.title);
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
  // The working directory of the circuit is the ticket's, `<copie>.travail` beside its copy: what
  // the circuit hands its sessions (their instructions, results and errors, the reviewer's
  // statements, the integration's patches and message), which a session out of the envelope reads
  // even when its circuit is killed. As the workspace of a pipeline (Jenkins, GitLab), it lives as
  // long as the ticket: no sweep touches it, a circuit relaunched takes it up again, numbering its
  // files after those it finds, and the queue removes it at the ticket's closure, or the removal of
  // the copy of a ticket closed without integration (scripts/retirer-copie.sh). The results and
  // the progress of the circuit's passes live in the base of its run
  // (scripts/vitest-config/base-de-passe.mjs), removed at its end, swept when the run is killed.
  const tmp = `${copie}.travail`;
  mkdirSync(tmp, { recursive: true });
  const numero = Math.max(
    0,
    ...readdirSync(tmp).map(n => Number(/-(\d+)(?:\.[a-z]+)?$/.exec(n)?.[1] ?? 0))
  );
  const baseDuRun = ouvrirBase('circuit');
  return {
    ...o,
    // The components a relaunch --depuis plays again, each with its step and its context.
    depuis: o.depuis ? [{ ...o.depuis, contexte: o.contexte }] : null,
    racine,
    copie,
    bd,
    bdSous,
    resoudre,
    duTitre,
    type: String(t.issue_type ?? ''),
    sujet,
    composants,
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

// The ticket's description (its criteria), notes and title as Beads holds them at this moment, read
// at the launch of each session: `{ description, notes, titre }`; a failed read throws.
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

// The step of the circuit's state <etat> in words, « 2.3 Code » (scripts/etapes.mjs), or its
// `etape` when the list holds none.
const ouDansLeCircuit = etat => {
  const e = etapeDuCircuit(etat);
  return e ? libelle(e) : etat.etape;
};

// One line of the circuit's history at the ticket.
function commenter(ctx, composant, etape, texte) {
  const r = ctx.bd('comments', 'add', ctx.ticket, `${PREFIXE}${composant} · ${etape} : ${texte}`);
  if (r.status !== 0) process.stderr.write(`⚠️  commentaire non écrit au ticket : ${r.stderr}\n`);
}

// The report of a proof or of checks: its line at the ticket, and its report kept for the
// reviewer, <rapport> when the comment carries only its summary, beside its outcome <resultat>,
// which the bilan reads (scripts/bilan.mjs): for a proof `{ ok, rouges, justifies, sans, casses,
// anciens, vide }`, for checks `{ issue, finale }`.
function ecrireRapport(ctx, composant, etape, texte, resultat, rapport = texte) {
  commenter(ctx, composant, etape, texte);
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    etape,
    composant,
    resultat,
    rapport: `${PREFIXE}${composant} · ${etape} : ${rapport}`,
  });
}

// The state of the run, written whole (`seance` and `question` null and `finale` false unless <etat>
// sets them, `processus`, `renvois`, `atteints`, `verifie` and `reprise` the run's), kept as the
// run's current state.
function ecrireEtat(ctx, etat) {
  ctx.courant = {
    finale: false,
    seance: null,
    question: null,
    questionnement: null,
    mene: null,
    avancement: null,
    releve: null,
    ...etat,
    processus: process.pid,
    composants: ctx.composants,
    renvois: ctx.renvois ?? null,
    atteints: ctx.atteints ?? [],
    verifie: ctx.verifie ?? null,
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
// A session <horsEnveloppe> (the reviewer's, the questionneur's) is claude itself, in the ticket's
// copy (the main tree once the copy is gone), under <droits> (`horsDeLEnveloppe`), the
// schema of its role's sheet and the options <session> names (its id, or the session it
// resumes), its instruction on its standard input and its result on its standard output, added
// to the log under its header line, then its line written to the register, as lancer.sh does.
// Its launch is kept with the circuit's results (`lancement`: its role and its session id), which
// the bilan reads to count the sessions the circuit launched (scripts/bilan.mjs).
function lancer(
  ctx,
  role,
  composant,
  consigne,
  { fort, horsEnveloppe, droits = [], session = [], ouvre, reprend } = {}
) {
  rmSync(ctx.fin, { force: true });
  rmSync(ctx.resultat, { force: true });
  rmSync(ctx.horsPlan, { force: true });
  const id = ouvre ?? reprend ?? session[1] ?? null;
  if (id) {
    inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, composant, lancement: { role, seance: id } });
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
        // The plan of the session: the components of the title, which it writes.
        '--paquets',
        ecrireLaListe(ctx.composants),
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
// developpeur's on a resumption, 4 the questionneur's on the plan), filled with <valeurs>.
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
        role === 'testwriter'
          ? 'la preuve du rouge, jouée après ta séance, refuse ton lot'
          : 'les contrôles, joués après ta séance, sont rouges',
      rapport: rapport ?? 'aucun',
    };
    const r = await lancer(ctx, role, composant, consigne(courte, 3), {
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
  // of the testwriter of his component.
  const passation =
    derniereDe(ctx, agent) ??
    (role === 'developpeur' ? derniereDe(ctx, auteur('testwriter', composant)) : null);
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
    contexte: contexteDe(ctx, composant),
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

// The line CONTEXTE of a session on <composant>: the context of the relaunch --depuis that plays
// it again (`renvois`, kept in the state), with the context of a run without --depuis, which every
// agent receives; « aucun » without either.
function contexteDe(ctx, composant) {
  const textes = [ctx.renvois?.[composant]?.contexte, !ctx.depuis && ctx.contexte];
  return [...new Set(textes.filter(Boolean))].join('\n\n') || 'aucun';
}

// The launch <r> of a session of <role>, or the Arret it is: a session its lock stopped on a
// write out of the plan (« hors-plan », the write as its piece), a motionless session
// (« bloqué »), a launch that stops before its session (« lancement »).
function seanceLancee(ctx, role, r) {
  if (r.horsPlan) {
    throw new Arret(
      'hors-plan',
      `Le crochet de la séance du ${nomDuRole(role)} l'arrête sur une écriture hors du plan du ticket (ses composants du titre : ${ctx.composants.join(', ')}) :\n\n${r.horsPlan}`,
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

// The session of <role> on <composant> with the instruction <texte>, its sheet read in its result
// (scripts/resultats.mjs): the sheet, kept with the ticket's sheets, its discoveries filed. A
// session that ends without a sheet that conforms (none, one out of its schema, a code other than
// 0) is resumed once, the same session, with the short instruction that names what lacks (the
// third template). The session opens under the id <id> (a new one by default), or resumes it with
// <premiere> « reprend »; with <neuve> (the author of a
// testwriter or a developpeur), the circuit keeps that id for that author (`ctx.reprise`). Throws an
// Arret for a launch that stops before its session, a motionless session, or twice no sheet
// that conforms (« sans-fiche »). <avec> joins its fields to the sheet's entry (the lot a review
// read).
async function jusquALaFiche(ctx, role, composant, texte, options = {}) {
  const { neuve, premiere = 'ouvre', id = randomUUID(), avec = {}, ...reste } = options;
  if (neuve) ctx.reprise = { agent: neuve, seance: id };
  const ouvrir = mode =>
    reste.horsEnveloppe
      ? { session: [mode === 'ouvre' ? '--session-id' : '--resume', id] }
      : { [mode]: id };
  let lu = null;
  for (let essai = 1; essai <= 2; essai++) {
    const courte = () => consigne({ ticket: ctx.ticket, sujet: ctx.sujet, erreur: lu.erreur }, 2);
    const r = await lancer(ctx, role, composant, essai === 1 ? texte : courte(), {
      ...reste,
      ...ouvrir(essai === 1 ? premiere : 'reprend'),
    });
    seanceLancee(ctx, role, r);
    lu =
      r.seance === 0
        ? lireFiche(role, r.sortie)
        : { erreur: `la séance finit en erreur (code ${r.seance})` };
    if (lu.fiche) return garder(ctx, role, composant, lu.fiche, avec);
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

// The sheet <fiche> of <role> on <composant>, kept with the ticket's sheets, <avec> joined to its
// entry, each of its discoveries filed closed under the ticket (scripts/ticket.sh, label
// `decouverte`), its component the session's, or the ticket's for the reviewer and the questionneur;
// returns it.
function garder(ctx, role, composant, fiche, avec = {}) {
  inscrire(ctx, { role, composant, fiche, ...avec });
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
    .filter(e => e.role === AUTEUR_DU_CIRCUIT && e.rapport)
    .map(e => e.rapport);
}

// The files of the lot, as the copy holds them against its HEAD: `{ tests, code }`, the
// testwriter's files (`isTesterFile`: test files and the shared test material) and the others.
function fichiersDuLot(ctx) {
  const tests = [];
  const code = [];
  for (const { fichier } of changements(ctx)) {
    (isTesterFile(fichier, ctx.copie) ? tests : code).push(fichier);
  }
  return { tests: tests.sort(), code: code.sort() };
}

// The blocking findings of a reviewer's sheet <fiche>, the ones that send the lot back.
const bloquants = fiche => (fiche.constats ?? []).filter(c => c.genre === 'bloquant');

// The blocking findings of a reviewer's sheet <fiche>, each under its heading, the criterion or
// rule it holds, its recipient (or the criterion in question) and its body: lines.
const lignesDesConstats = fiche =>
  bloquants(fiche).flatMap((c, i) => [
    `### Constat ${i + 1} — ${c.titre}`,
    `Bloquant : ${c.regle}`,
    c.critere_en_cause
      ? `Critère en cause : ${c.critere_en_cause}`
      : `Agent : ${c.role ?? '?'} ${c.composant ?? '?'}`,
    c.corps,
    '',
  ]);

// The verdict the reviewer's sheet <fiche> carries, as the circuit writes it at the ticket for the
// human, its first word ACCEPTÉ or RENDU: after a bounded review, each finding before it lifted or
// not, with its proof; each blocking finding under its heading, what it holds, its recipient (or
// the criterion in question) and its body; then the remarks (its findings of `genre` remarque),
// the question for the owner and the deviations to name at the commit.
export function texteDuVerdict(fiche) {
  const section = (titre, l) => (l?.length ? [`## ${titre}`, '', ...l.map(x => `- ${x}`), ''] : []);
  const suivi = (fiche.suivi ?? []).map(
    x => `${x.titre} : ${x.etat}${x.preuve ? ` — ${x.preuve}` : ''}`
  );
  return [
    fiche.verdict,
    '',
    ...section("Constats d'avant", suivi),
    ...lignesDesConstats(fiche),
    ...section(
      'Remarques',
      (fiche.constats ?? []).filter(c => c.genre === 'remarque').map(c => `${c.titre} — ${c.corps}`)
    ),
    ...section('Question au responsable', fiche.question ? [fiche.question] : []),
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
// command of the difference, the findings with their recipients.
async function relire(ctx, composant) {
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
      tests: changes.filter(f => isTesterFile(f, ctx.copie)),
      code: changes.filter(f => !isTesterFile(f, ctx.copie)),
    };
    precedente = [
      `la relecture ${precedents}, ${avant.fiche.verdict} : tu relis la différence du lot depuis elle et ses constats, selon ta compétence (« La relecture bornée »).`,
      '',
      `- La différence : \`git diff ${avant.lot.commit} ${lot.commit}\`, dans la copie du ticket ; ses fichiers : ${changes.join(', ') || 'aucun'}.`,
      '- Ses constats bloquants, chacun avec son destinataire :',
      '',
      ...lignesDesConstats(avant.fiche),
    ]
      .join('\n')
      .trim();
  }
  const affirmations = path.join(ctx.tmp, 'affirmations.md');
  writeFileSync(affirmations, leTicket(ctx).description);
  const valeurs = {
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    composants: ctx.composants.join(', '),
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
    rapports: rapports.join('\n\n') || 'aucun',
    // The supervisor's context of a resumption, his answer to a question of the reviewer among them.
    contexte: (!ctx.depuis && ctx.contexte) || 'aucun',
  };
  const fiche = await jusquALaFiche(ctx, 'relecteur', composant, consigne(valeurs, 1), {
    horsEnveloppe: true,
    droits: horsDeLEnveloppe(ctx, 'relecteur', 'opus'),
    avec: lot ? { lot: { ...lot, fichiers: [...tests, ...code] } } : {},
  });
  const texte = texteDuVerdict(fiche);
  const r = ctx.bdSous(AUTEUR_DU_VERDICT, 'comments', 'add', ctx.ticket, texte);
  if (r.status !== 0) process.stderr.write(`⚠️  verdict non écrit au ticket : ${r.stderr}\n`);
  return { verdict: fiche.verdict, fiche, texte, arbre: lot?.arbre ?? null };
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

// The references the project declares in the package.json of the copy (`grillhouse.references`):
// each `{ nom, commande, fichiers, tests, gardes }` with a name, a command and files, `tests` and
// `gardes` arrays when given, empty when not; none without them.
function lesReferences(ctx) {
  const l = lireJson(path.join(ctx.copie, 'package.json'))?.grillhouse?.references;
  return (Array.isArray(l) ? l : [])
    .filter(
      r =>
        typeof r?.nom === 'string' &&
        typeof r.commande === 'string' &&
        Array.isArray(r.fichiers) &&
        r.fichiers.length > 0 &&
        (r.tests === undefined || Array.isArray(r.tests)) &&
        (r.gardes === undefined || Array.isArray(r.gardes))
    )
    .map(r => ({ ...r, tests: r.tests ?? [], gardes: r.gardes ?? [] }));
}

// Whether one of <motifs> covers the file <fichier>, both from the root of the copy, as the
// inputs of Turborepo read them: a path names that file, a directory every file under it, a glob
// pattern (`*`, `**`) the files it matches (`path.matchesGlob` of Node).
export function couvertPar(motifs, fichier) {
  return motifs.some(m => {
    const dossier = m.replace(/\/+$/, '');
    return fichier === dossier || fichier.startsWith(`${dossier}/`) || path.matchesGlob(fichier, m);
  });
}

// The references the project declares, when every red of a final pass, by its place of <lieux>
// (`{ fichier, gardes }`, the names its finding carries), is one of theirs: a finding of one of
// their `gardes`, a file of their `tests`, or a file their `fichiers` cover; none otherwise.
function referencesDesRouges(ctx, lieux) {
  const refs = lesReferences(ctx);
  const leur = ({ fichier: f, gardes }) =>
    refs.some(
      r =>
        gardes.some(g => r.gardes.includes(g)) ||
        (f && (r.tests.includes(f) || couvertPar(r.fichiers, f)))
    );
  return refs.length && lieux.length && lieux.every(leur) ? refs : [];
}

// The regeneration of the references the project declares (3.1): the copy kept as a lot on the
// one the last review read (or HEAD), each command run on the whole copy, the copy kept again on
// that lot. `{ texte, regenerees, fichiers, restreinte }`: the report, the names of the
// references changed, the files changed, and the range of the final pass that follows. A
// reference changed that the ticket's description does not name (its name or one of its files),
// a file changed that no reference declares, a command at another code than 0 or a regeneration
// that changes nothing restores the copy as it was and stops at « references ».
function regenerer(ctx, composant) {
  const refs = lesReferences(ctx);
  const avant = garderLeLot(ctx, relectureDAvant(ctx)?.lot.commit);
  if (!avant) {
    throw new Arret(
      'references',
      'Le circuit ne garde pas la copie avant la régénération des références (git échoue).'
    );
  }
  const echecs = refs
    .map(r => ({ r, code: commandeDeReference(ctx, composant, r.commande) }))
    .filter(x => x.code !== 0)
    .map(x => `- ${x.r.nom} : \`${x.r.commande}\` rend le code ${x.code}.`);
  const apres = garderLeLot(ctx, avant.commit);
  const fichiers = apres ? differenceDesLots(ctx, avant.commit, apres.commit) : [];
  const description = leTicket(ctx).description;
  const siens = r => fichiers.filter(f => couvertPar(r.fichiers, f));
  const regenerees = refs.filter(r => siens(r).length);
  const nommee = r => [r.nom, ...r.fichiers].some(x => description.includes(x));
  const horsDeclaration = fichiers.filter(f => !refs.some(r => couvertPar(r.fichiers, f)));
  const ecarts = [
    ...echecs,
    ...(!apres ? ['- Le circuit ne garde pas la copie après la régénération (git échoue).'] : []),
    ...(apres && !fichiers.length
      ? [
          `- La régénération (${refs.map(r => `\`${r.commande}\``).join(', ')}) ne change aucun fichier : les rouges de la passe finale restent.`,
        ]
      : []),
    ...regenerees
      .filter(r => !nommee(r))
      .map(
        r =>
          `- ${r.nom} change (${siens(r).join(', ')}), et le plan du ticket ne nomme pas ce changement (ni « ${r.nom} » ni ses fichiers).`
      ),
    ...horsDeclaration.map(f => `- ${f} change, et aucune référence déclarée ne l'écrit.`),
  ];
  if (ecarts.length) {
    restaurer(ctx, avant.commit, fichiers);
    throw new Arret(
      'references',
      [
        `La régénération des références, sur la copie entière, s'arrête ; la copie est rendue telle qu'avant elle. Le superviseur fait nommer le changement au plan du ticket, puis \`--reprendre\`, ou fait corriger le lot qui le cause (\`--depuis developpeur <composant>\`).`,
        '',
        ...ecarts,
        '',
        ...(apres && fichiers.length
          ? [
              `La différence, avant d'être rendue : \`git diff ${avant.commit} ${apres.commit}\`, dans la copie du ticket.`,
            ]
          : []),
        `Le journal du ticket : ${ctx.journal}`,
      ].join('\n')
    );
  }
  return {
    texte: [
      `Les références régénérées sur la copie entière : ${regenerees.map(r => r.nom).join(', ')} ; le lot porte leurs fichiers, puis la passe finale restreinte à ce qu'elles changent.`,
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
// under the lock of the machine, its output added to the log: its exit code.
function commandeDeReference(ctx, composant, commande) {
  entete(ctx, 'references', composant);
  appendFileSync(ctx.journal, `$ ${commande}\n`);
  const fd = openSync(ctx.journal, 'a');
  try {
    const r = avecLaMachine(
      env => spawnSync('sh', ['-c', commande], { cwd: ctx.copie, stdio: ['ignore', fd, fd], env }),
      { racine: ctx.copie, dire: l => appendFileSync(ctx.journal, `${l}\n`) }
    );
    return r.status ?? 1;
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) throw e;
    appendFileSync(ctx.journal, `${e.message}\n`);
    return e.code;
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

// The stop for the sheet <fiche> of the session <tentative> of <role> on <composant>, BLOQUÉ
// (« hors-portee ») or BESOIN (« besoin »): its reason or question first, then its handover; the
// sheet as its piece, and the agent's question as its own.
function arretDuStatut(ctx, role, composant, tentative, fiche) {
  const passation = derniereDe(ctx, auteur(role, composant))?.text ?? 'aucune';
  const qui = `Le ${nomDuRole(role)} de ${composant}`;
  const piece = `La fiche du ${nomDuRole(role)} de ${composant}, séance ${tentative} : ${fiche.statut} — ${fiche.statut === 'BESOIN' ? fiche.question : fiche.raison}`;
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

// The index in the title of the component <nom> (a path or a package name), or -1.
function indexDe(ctx, nom) {
  try {
    return ctx.composants.indexOf(ctx.resoudre(nom));
  } catch {
    return -1;
  }
}

// The sending to a testwriter in the sheet <fiche> of the developpeur of the component at <index>:
// `{ index, texte }`, the component its `renvoi` names, one of the title up to <index>, and what
// that testwriter receives (the sending, then the developpeur's handover); null without a sending,
// or for a component out of the title or after his own.
function renvoiAuTestwriter(ctx, fiche, index) {
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

// The agents the reviewer's sheet RENDU <fiche> sends the lot back to, by its blocking findings
// alone (a remark reaches the ticket, no agent; the sheet's schema gives a RENDU at least one):
// Map index of component → `{ etape, testwriter, developpeur }`, `etape` the first step that
// component plays again (testwriter when a finding names its testwriter), `testwriter` and
// `developpeur` the findings for each, or null. Throws an Arret `relecture-arret` for a finding
// without a valid recipient (a component the title does not name) or one that puts a criterion in
// question.
function renvoisDuVerdict(ctx, fiche, texte) {
  const liste = bloquants(fiche);
  const arret = raison =>
    new Arret('relecture-arret', `${raison}\n\nLe verdict :\n\n${texte}`, { piece: raison });
  const renvois = new Map();
  for (const [n, c] of liste.entries()) {
    if (c.critere_en_cause)
      throw arret(`Le constat « ${c.titre} » met en cause un critère du ticket.`);
    const index = c.composant ? indexDe(ctx, c.composant) : -1;
    if (!DESTINATAIRES.includes(c.role) || index < 0) {
      throw arret(
        `Le constat « ${c.titre} » n'a pas de destinataire valide : il nomme ${c.role ? `« ${c.role} ${c.composant ?? ''} »` : 'personne'}, quand le rôle est testwriter ou developpeur et le composant l'un du titre (${ctx.composants.join(', ')}).`
      );
    }
    const r = renvois.get(index) ?? { etape: 'developpeur', testwriter: [], developpeur: [] };
    r[c.role].push(`### Constat ${n + 1} — ${c.titre}\n${c.corps}`);
    if (c.role === 'testwriter') r.etape = 'testwriter';
    renvois.set(index, r);
  }
  const joindre = l => (l.length ? l.join('\n\n') : null);
  return new Map(
    [...renvois].map(([i, r]) => [
      i,
      { etape: r.etape, testwriter: joindre(r.testwriter), developpeur: joindre(r.developpeur) },
    ])
  );
}

// The integration of the lot: its two patches and its message, written from the copy, then
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
  let r;
  for (let essai = 1; essai <= 2; essai++) {
    entete(ctx, 'integration', ctx.composants.join(', '));
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
    if (essai === 1) geste(ctx, ctx.composants.at(-1), 'rejeu');
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

// The type of a conventional commit for the ticket's type in Beads; `feat` for any other.
const TYPES_DE_COMMIT = { bug: 'fix', chore: 'chore', docs: 'docs' };

// The commit message of the lot: `<type>(<composants>): <sujet> (<ticket>)`, the components by
// their package name; then the message the sheets of the developpeurs and of the reviewer give,
// in their order, written once from the final state (`messageDuLot`).
function messageDeCommit(ctx) {
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  const noms = ctx.composants
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

// The test files of the lot that the testwriter writes, present in the copy.
function testsDuLot(ctx) {
  return changements(ctx)
    .filter(c => !c.supprime)
    .map(c => c.fichier)
    .filter(f => NOM_DE_TEST.test(path.basename(f)) && isTesterFile(f, ctx.copie))
    .sort();
}

// The test files of the lot written in <composant> or in the shared test material: the testwriter's
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
// `npm run verifier` it runs. A wait that stops (its bound, 75; a lock held by an ancestor, 1) is
// the command's code, its message in the log. Once it holds the lock, the pass plays under a
// progress directory of its own (`avancement`), of the kind `genreDeLaPasse` names.
function npm(ctx, etape, composant, args, env = {}) {
  entete(ctx, etape, composant);
  const dossier = mkdtempSync(path.join(ctx.base.dossier, 'resultats-'));
  const prefixe = Object.entries(env).map(([k, v]) => `${k}=${v} `);
  appendFileSync(ctx.journal, `$ ${prefixe.join('')}npm ${args.join(' ')}\n`);
  const fd = openSync(ctx.journal, 'a');
  try {
    const r = avecLaMachine(
      envMachine =>
        avecAvancement(ctx, genreDeLaPasse(etape, composant, args), avancement =>
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
// (scripts/avancement.mjs): its step (the checks once final, the final pass), its component, and
// its command without the test files and the filters, which move from one lot to the next.
function genreDeLaPasse(etape, composant, args) {
  const commande = args.filter(
    a => !NOM_DE_TEST.test(path.basename(a)) && !a.startsWith('--filter=')
  );
  return etape === 'controles' && args[1] === 'verifier'
    ? ['passe finale', ...commande].join(' ')
    : [etape, composant, ...commande].join(' ');
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

// The measure of the proof of the red on <composant>: one run per package, `npm test -- --force
// <files>` of the lot that lie in it, HEAD's version of each beside it, or, with no file of the lot in the
// component, `npm test -- <package>` for each of its packages, played whole. Each run `{ groupe,
// entier, avant, code, resultats, constructions }`. A measure on the same tree (the copy's
// fingerprint, `empreinte`) is not played again, as Turborepo replays a task whose inputs did not
// move: the last one is kept in `ctx.mesureDeLaPreuve`.
function mesureDeLaPreuve(ctx, composant, liste, fichiers) {
  const cle = `${composant}\0${empreinte(ctx, '.')}`;
  if (ctx.mesureDeLaPreuve?.cle === cle) return ctx.mesureDeLaPreuve.runs;
  const index = ctx.composants.indexOf(composant);
  const entiers = fichiers.length ? [] : paquetsDesComposants(ctx, liste, i => i === index);
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
      r = npm(ctx, 'preuve', composant, [
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
      resultats: lireRapportsVitest(r.dossier),
      // The builds of the component's packages that failed: each one a red, not compiling is
      // failing.
      constructions: constructionsEchouees(ctx, liste, r.dossier, index),
    });
  }
  ctx.mesureDeLaPreuve = { cle, runs };
  return runs;
}

// The proof of the red on <composant>: `{ ok, rouges, texte, resume }`, `texte` without the list
// of the justified greens, which only the whole report, written to its file, holds. A green test
// passes by the expected greens of the sheets of the testwriter of <composant> (`verts_attendus`),
// read at each proof; the measure plays again only when the copy changed (`mesureDeLaPreuve`).
function preuve(ctx, composant) {
  const fichiers = testsDuComposant(ctx, composant);
  const verts = fichesDe(ctx, 'testwriter', composant).flatMap(f => f.verts_attendus ?? []);
  const raisonDuTest = (f, a) =>
    verts.find(v => v.fichier === f && v.test && (v.test === a.nom || v.test === a.titre))
      ?.raison ?? null;
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
  const mesure = mesureDeLaPreuve(ctx, composant, liste, fichiers);
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
      `${SUITE.find(e => e.etat === PREUVE).titre} sur ${composant} : ${resume}.`,
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
// Each red `{ texte, fichier, gardes, detail, proprietaire, horsTitre, arbitrer }`: the line that
// names it (test or finding, file, message), its file (null for a red of a task), the names its
// finding carries (its guard and its rule), the beginning of its
// task's log for a build, the index of the
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
      out.push({
        texte: `test ${f} — ne se charge pas : ${premiereLigne(res.message)}`,
        fichier: f,
        ...lieu,
      });
      testes.add(paquetDe(liste, f));
    }
    for (const a of res.tests.filter(x => x.etat === 'failed')) {
      out.push({
        texte: `test ${f} › ${a.nom} — ${premiereLigne(a.message)}`,
        fichier: f,
        ...lieu,
      });
      testes.add(paquetDe(liste, f));
    }
  }
  const { constats } = lireSarif(c.dossier);
  for (const k of constats) {
    const ou = k.fichier ? ` ${k.fichier}${k.ligne ? `:${k.ligne}` : ''}` : '';
    out.push({
      texte: `constat ${k.garde}${ou} — ${k.message}${k.genre === 'a-arbitrer' ? ' (à arbitrer)' : ''}`,
      fichier: k.fichier ?? null,
      gardes: [k.garde, k.regle].filter(Boolean),
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

// The checks after the developpeur of the component at <index>: its own, or, when <finale>, `npm
// run verifier`, what the integration plays, restricted by <restreinte> (`{ avant, apres }`, two
// lots kept) to the packages that changed from one to the other and their dependents, with the
// root's tasks, the guards (`--filter=...[<avant>...<apres>] --filter=//`). `{ rouge, aRepasser,
// arbitrer, texte, complet, resume, proprietaire, horsTitre, lieux }`: `texte` the report for the
// developpeur the red goes to, its own reds first; `complet` every red, for a stop; `proprietaire`
// the index of the component that owns the red, -1 for none; `horsTitre` the packages out of the
// title that hold a red; `arbitrer` when every red of that developpeur is a finding to settle;
// `lieux` the place of each red, `{ fichier, gardes }`, its file (null for a red without one) and
// the names its finding carries (none for a test or a task).
function controles(ctx, index, finale, restreinte = null) {
  const composant = ctx.composants[index];
  const liste = paquets(ctx.copie).filter(p => !p.hors);
  const filtres = restreinte
    ? ['--', `--filter=...[${restreinte.avant}...${restreinte.apres}]`, '--filter=//']
    : [];
  const commandes = finale
    ? [{ args: ['run', 'verifier', ...filtres] }]
    : commandesDuComposant(ctx, index, liste);
  const resultats = commandes.map(({ args, env }) => {
    let r = npm(ctx, 'controles', composant, args, env);
    // verifier plays a task at 75 again itself, at rest: its 75 is final; a command of a
    // component's checks plays once more, the gesture `rejeu`.
    if (r.code === A_REPASSER && !finale) {
      geste(ctx, composant, 'rejeu');
      r = npm(ctx, 'controles', composant, args, env);
    }
    const c = { args, env, ...r };
    return { ...c, rouges: rougesDe(ctx, liste, c) };
  });
  const tous = resultats.flatMap(r => r.rouges);
  // Out of the final pass, the reds of this component are its own; the others (another component,
  // the root, a red no file situates, a finding of a guard on a file of another package, a package
  // out of the title) wait for it.
  const siens = r => finale || r.proprietaire === index;
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
            ? ` ; laissés à la passe finale, ${laisses.length} rouge(s) hors de ${composant}`
            : ''
        }`;
  // Where the checks played: the final pass out of the envelope, on the whole copy or restricted
  // to what changed since the last review; a component's checks, its tests and packages, its
  // guards in its envelope.
  const ou = !finale
    ? `Contrôles du composant ${composant}, ses tests et ses paquets, ses gardes dans son enveloppe`
    : restreinte
      ? `Contrôles de la passe finale, hors enveloppe, restreinte à ce que le lot change depuis la relecture d'avant et à ses dépendants (après ${composant})`
      : `Contrôles de la passe finale, hors enveloppe, sur la copie entière (après ${composant})`;
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
  const sansListe = [`${ou} : ${resume}.`, '', journal].join('\n');
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
    sansListe,
    // The reds of the stop, each with its component: this component's and those before it, or at
    // the final pass all of them; never those left to the final pass.
    rouges: rouges.map(r => ({ composant: nomDuProprio(r), texte: r.texte, detail: r.detail })),
    resume,
    proprietaire: proprio,
    horsTitre: [...new Set(rouges.map(r => r.horsTitre).filter(Boolean))].sort(),
    lieux: rouges.map(r => ({ fichier: r.fichier ?? null, gardes: r.gardes ?? [] })),
  };
}

// The checks of the component at <index>, out of the final pass: `npm test -- <test files of the
// lot>` that lie in it (or in the shared test material that reads only the components up to it),
// `npm test -- <package>` for each of its packages and each of its the lot touches, then the
// guards in the envelope of the component, whose findings on its own files alone count.
function commandesDuComposant(ctx, index, liste) {
  const lot = changements(ctx);
  const touches = liste.length
    ? [...new Set(lot.map(c => paquetDe(liste, c.fichier)).filter(d => d !== '.'))].sort()
    : ['.'];
  const sien = chemin => proprietaire(ctx, chemin) === index;
  const tests = testsDuLot(ctx).filter(f => sien(f) || matiereFaite(ctx, liste, f, index));
  const scripts = lireJson(path.join(ctx.copie, 'package.json'))?.scripts ?? {};
  const enveloppe = { [VARIABLE_ENVELOPPE]: ecrireLaListe([ctx.composants[index]]) };
  return [
    ...(tests.length ? [{ args: ['test', '--', ...tests] }] : []),
    ...[
      ...new Set([...touches.filter(sien), ...paquetsDesComposants(ctx, liste, i => i === index)]),
    ]
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

// Where the run goes on from the component at <index> to <dernier>: `{ index, etape, tentative,
// rapport, finale }`. Out of a round, that component's testwriter. In a round of the reviewer's
// findings (or of `--depuis`), the first component from <index> on that the round names, at the
// step and with the findings it names, or that the circuit has not reached yet (`atteints`), from
// its testwriter; a component it has reached and the round does not name plays nothing, as Bazel
// plays only the targets a change affects: the final pass judges it. Past them, the final pass.
function suivant(ctx, index, dernier) {
  for (let i = index; i <= dernier; i++) {
    const c = ctx.composants[i];
    const r = ctx.renvois?.[c];
    if (r) return { index: i, etape: r.etape, tentative: 1, rapport: r[r.etape], finale: false };
    if (!ctx.renvois || !ctx.atteints.includes(c)) {
      return { index: i, etape: TESTS, tentative: 1, rapport: null, finale: false };
    }
  }
  return { index: dernier, etape: CONTROLES, tentative: 0, rapport: null, finale: true };
}

// The component <composant>, whose work the circuit has carried through (its proof without a red
// for its developpeur, its developpeur's delivery, its green checks, the final pass green), kept
// among `atteints`: a component, each on its own, whatever the title gains before it.
function atteindre(ctx, composant) {
  if (!ctx.atteints.includes(composant)) ctx.atteints.push(composant);
}

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

// The circuit from <debut> (where `depart` starts it) to the entry of the lot in the queue.
async function derouler(ctx, debut) {
  let { index, etape, tentative, rapport, dernier, finale } = debut;
  // The step a `--reprendre` starts at, the first of the loop.
  let reprise = Boolean(ctx.reprendre);
  for (;;) {
    const composant = ctx.composants[index];
    const reprend = reprise;
    reprise = false;
    // The checks of the last component are the final pass: the state says so from its start.
    const enFinale = finale || (etape === CONTROLES && index === dernier);
    const etat = {
      etape,
      composant,
      tentative,
      code: null,
      raison: null,
      rapport,
      dernier: ctx.composants[dernier],
      finale: enFinale,
      boucles: boucles(ctx, etape, tentative, enFinale),
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
          'testwriter',
          'aucun test dans ce composant (aucun paquet avec un script test:vitest ne le tient) : ni testwriter ni preuve, son développeur directement.'
        );
        rapport = [
          `Le composant ${composant} ne porte aucun test (aucun paquet avec un script test:vitest ne le tient) : le circuit le lance sans testwriter ni preuve. Tu écris sa part du ticket d'après ses critères ; les contrôles suivent ta séance.`,
          rapport,
        ]
          .filter(Boolean)
          .join('\n\n');
        etape = CODE;
        tentative = 1;
      } else if (etape === TESTS) {
        const fiche = await seance(ctx, 'testwriter', composant, {
          tentative,
          rapport,
          derniere: tentative > RELANCES_TESTWRITER,
        });
        // A testwriter who declares himself blocked or in need of an answer goes up to the supervisor.
        if (fiche.statut !== 'FAIT')
          throw arretDuStatut(ctx, 'testwriter', composant, tentative, fiche);
        commenter(ctx, composant, 'testwriter', `séance ${tentative} finie, sa fiche lue.`);
        etape = PREUVE;
      } else if (etape === PREUVE) {
        const p = preuve(ctx, composant);
        rapport = p.texte;
        if (p.ok) {
          // The reviewer's findings for this developpeur follow the proof: a finding launches him,
          // red or not.
          const pourLui = ctx.renvois?.[composant]?.developpeur;
          const auDeveloppeur = p.rouges > 0 || Boolean(pourLui);
          const suite = p.rouges
            ? 'au développeur'
            : pourLui
              ? 'aucun rouge ; au développeur, que nomme un constat du relecteur'
              : 'aucun rouge : un lot de tests seul, aux contrôles';
          ecrireRapport(
            ctx,
            composant,
            'preuve',
            `${p.resume} ; ${suite}.\n\n${p.texte}`,
            p.resultat
          );
          etape = auDeveloppeur ? CODE : CONTROLES;
          tentative = auDeveloppeur ? 1 : 0;
          if (pourLui) rapport = `${rapport}\n\nLES CONSTATS DU RELECTEUR :\n\n${pourLui}`;
          if (!auDeveloppeur) atteindre(ctx, composant);
        } else if (tentative <= RELANCES_TESTWRITER) {
          ecrireRapport(
            ctx,
            composant,
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
        const avant = empreinte(ctx, composant);
        const fiche = await seance(ctx, 'developpeur', composant, {
          tentative,
          rapport,
          fort,
          derniere: fort,
        });
        // A question goes up to the supervisor; a red out of reach, to the testwriter its sheet sends
        // it to, else up to the supervisor.
        if (fiche.statut === 'BESOIN') {
          throw arretDuStatut(ctx, 'developpeur', composant, tentative, fiche);
        }
        const renvoi = renvoiAuTestwriter(ctx, fiche, index);
        if (renvoi) {
          // The red that remains lies in the tests of that component: the gesture
          // `renvoi-au-testwriter`, its testwriter, as a `--depuis testwriter <composant>`, the
          // handover as its context.
          const cible = ctx.composants[renvoi.index];
          if (ctx.renvoiAuTestwriter === cible) {
            throw new Arret(
              'sans-livraison',
              `La fiche de la séance ${tentative} du développeur de ${composant} renvoie une deuxième fois de suite à \`testwriter ${cible}\`, sans contrôles verts depuis le premier renvoi : le testwriter n'a pas levé ce rouge.\n\n${renvoi.texte}`
            );
          }
          ctx.renvoiAuTestwriter = cible;
          commenter(
            ctx,
            composant,
            'developpeur',
            `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie ; sa fiche renvoie le rouge à \`testwriter ${cible}\` : le circuit rejoue ${cible} depuis son testwriter, puis les composants d'après.`
          );
          geste(ctx, composant, 'renvoi-au-testwriter');
          ctx.reprendre = false;
          ctx.depuis = [{ etape: TESTS, composant: cible, contexte: renvoi.texte }];
          ctx.contexte = null;
          ({ index, etape, tentative, rapport, dernier, finale } = depart(ctx, null, index));
          continue;
        }
        if (fiche.statut === 'BLOQUÉ') {
          throw arretDuStatut(ctx, 'developpeur', composant, tentative, fiche);
        }
        const inchangee = empreinte(ctx, composant) === avant;
        if (inchangee && reprend && livre(ctx, composant)) {
          // A resumed developpeur that finds its lot delivered: the checks judge it.
          commenter(
            ctx,
            composant,
            'developpeur',
            `séance ${tentative} reprise sans changement, le composant garde la livraison d'avant : aux contrôles.`
          );
          inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: CODE, composant, inchange: true });
        } else if (inchangee) {
          // Nothing to deliver: the gesture `rien-a-livrer`, the component's checks judge its lot;
          // red, the stop goes up.
          geste(ctx, composant, 'rien-a-livrer');
          inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: CODE, composant, inchange: true });
          ctx.rienALivrer = `La séance ${tentative} du développeur de ${composant} ne change aucun fichier de ${composant}, et ses contrôles restent rouges. Sa passation au ticket dit pourquoi :\n\n${passations(ctx).at(-1)?.text ?? 'aucune'}`;
        }
        if (!ctx.rienALivrer) atteindre(ctx, composant);
        commenter(
          ctx,
          composant,
          'developpeur',
          `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie, sa fiche lue.`
        );
        etape = CONTROLES;
      } else if (etape === CONTROLES) {
        const passeFinale = enFinale;
        // The final pass: after a regeneration of the references, restricted to what it changed;
        // else whole, or restricted to what changed since the last review.
        const regeneration = passeFinale ? (ctx.regeneration ?? null) : null;
        ctx.regeneration = null;
        const passe = !passeFinale
          ? { arbre: null, restreinte: null }
          : regeneration
            ? { arbre: arbreDeLaCopie(ctx), restreinte: regeneration.restreinte }
            : laPasseFinale(ctx);
        const k = controles(ctx, index, passeFinale, passe.restreinte);
        const resultat = issue => ({ issue, finale: passeFinale });
        rapport = k.texte;
        // A developpeur who had nothing to deliver before these checks.
        const rien = ctx.rienALivrer ?? null;
        ctx.rienALivrer = null;
        // A stop of the checks: <phrase>, then the report, its reds also kept apart, as its piece.
        const arreter = (nom, phrase, lieu = null) => {
          const avant = phrase ? `${phrase}\n\n` : '';
          throw new Arret(nom, `${avant}${k.complet}`, {
            rouges: k.rouges,
            motif: `${avant}${k.sansListe}`,
            etape: lieu,
          });
        };
        // The developpeur a red goes to: this component's, or in the final pass the owner's (the
        // gesture rouge-d-un-autre-composant, scripts/etapes.mjs).
        const vers = k.rouge && passeFinale ? k.proprietaire : index;
        // One count of sessions for the component's checks, and one for the whole final pass,
        // whichever component its red goes to.
        const suivante = tentative + 1;
        // A final pass red on the references the project declares alone: their regeneration.
        const aRegenerer = k.rouge && passeFinale ? referencesDesRouges(ctx, k.lieux) : [];
        const noms = aRegenerer.map(r => r.nom).join(', ');
        if (aRegenerer.length && regeneration) {
          arreter(
            'references',
            `La passe finale, après la régénération des références (${noms}), reste rouge sur elles : la régénération ne lève pas leurs rouges.`
          );
        } else if (aRegenerer.length) {
          geste(ctx, composant, 'regeneration');
          ecrireRapport(
            ctx,
            composant,
            'controles',
            `${k.resume} ; ses rouges sont ceux des références que le projet déclare (${noms}) : à leur régénération.`,
            resultat('rouge'),
            k.texte
          );
          ctx.entiere = !passe.restreinte;
          etape = REFERENCES;
          tentative = 0;
          finale = true;
        } else if (k.rouge && passeFinale && k.horsTitre.length) {
          arreter(
            'controles',
            `La passe finale est rouge dans ${k.horsTitre.join(', ')}, hors des composants du ticket (${ctx.composants.join(', ')}) : aucun de leurs développeurs n'est relancé. Le superviseur étend le plan à ce composant (\`--etendre\`), le rouge allant ensuite à son développeur, ou fait corriger le lot par le composant qui le cause (\`--depuis developpeur <composant>\`, le rouge en \`--contexte\`).`
          );
        } else if (k.rouge && vers < 0) {
          arreter(
            'controles',
            `Aucun composant du ticket (${ctx.composants.join(', ')}) ne possède ce rouge de la passe finale (un rouge de la racine, ou que rien ne situe).`
          );
        } else if (k.rouge && k.arbitrer) {
          arreter(
            'controles',
            `Les rouges de ${ctx.composants[vers]} sont des constats à arbitrer : aucun développeur ne les tranche.`
          );
        } else if (k.rouge && rien && vers === index) {
          // The stop stands at the developpeur's step, which a resumption plays again.
          arreter('sans-livraison', rien, CODE);
        } else if (k.rouge && suivante <= SEANCES_DEVELOPPEUR) {
          const qui = vers === index ? '' : ` de ${ctx.composants[vers]}`;
          if (vers !== index) geste(ctx, ctx.composants[vers], 'rouge-d-un-autre-composant');
          ecrireRapport(
            ctx,
            composant,
            'controles',
            `${k.resume} ; développeur${qui} relancé (séance ${suivante}).`,
            resultat('rouge'),
            k.texte
          );
          etape = CODE;
          tentative = suivante;
          index = vers;
          finale = passeFinale;
        } else if (k.rouge) {
          arreter('controles', null);
        } else if (k.aRepasser) {
          arreter('a-repasser', null);
        } else {
          ecrireRapport(ctx, composant, 'controles', `${k.resume}.`, resultat('vert'));
          // Green checks: a sending of the developpeur to a testwriter may come again.
          ctx.renvoiAuTestwriter = null;
          // Green checks carry this component, or at the final pass every one, to their end.
          for (const c of passeFinale ? ctx.composants : [composant]) atteindre(ctx, c);
          if (!passeFinale) {
            ({ index, etape, tentative, rapport, finale } = suivant(ctx, index + 1, dernier));
          } else {
            // The whole pass green on this lot; the lot the last review accepted goes to the
            // integration, any other to the review.
            // A pass restricted to a regeneration after a whole one counts as whole.
            if (passe.arbre && (!passe.restreinte || regeneration?.entiere)) {
              ctx.verifie = passe.arbre;
            }
            const r = relectureDAvant(ctx);
            const accepte =
              r?.fiche.verdict === 'ACCEPTÉ' && passe.arbre && r.lot.arbre === passe.arbre;
            etape = accepte ? INTEGRATION : RELECTURE;
          }
        }
      } else if (etape === REFERENCES) {
        const g = regenerer(ctx, composant);
        ecrireRapport(ctx, composant, 'references', g.texte, {
          regenerees: g.regenerees,
          fichiers: g.fichiers,
        });
        ctx.regeneration = { restreinte: g.restreinte, entiere: ctx.entiere === true };
        ctx.entiere = false;
        etape = CONTROLES;
        tentative = 0;
        finale = true;
      } else if (etape === RELECTURE) {
        const v = await relire(ctx, composant);
        // A question for the owner: nothing is committed nor relaunched before his answer.
        if (v.fiche.question) {
          throw new Arret(
            'besoin',
            `Le relecteur attend une réponse : ${v.fiche.question}\n\nLe verdict :\n\n${v.texte}`,
            {
              piece: `La fiche du relecteur : question — ${v.fiche.question}`,
              question: `Le relecteur demande : ${v.fiche.question}`,
              qui: RESPONSABLE,
            }
          );
        }
        if (v.verdict === 'ACCEPTÉ' && (!v.arbre || ctx.verifie === v.arbre)) {
          commenter(ctx, composant, 'relecture', 'ACCEPTÉ ; le lot va à l’intégration.');
          etape = INTEGRATION;
        } else if (v.verdict === 'ACCEPTÉ') {
          // The whole final pass has not played on the lot accepted: it plays once, then the
          // integration.
          commenter(
            ctx,
            composant,
            'relecture',
            'ACCEPTÉ ; la passe finale entière, qui n’a pas joué sur ce lot, puis l’intégration.'
          );
          index = dernier;
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
          const renvois = renvoisDuVerdict(ctx, v.fiche, v.texte);
          ctx.renvois = Object.fromEntries([...renvois].map(([i, r]) => [ctx.composants[i], r]));
          dernier = ctx.composants.length - 1;
          ({ index, etape, tentative, rapport, finale } = suivant(ctx, 0, dernier));
          const qui = [...renvois]
            .sort(([a], [b]) => a - b)
            .map(([i, r]) => `${r.etape} ${ctx.composants[i]}`)
            .join(', ');
          commenter(
            ctx,
            composant,
            'relecture',
            `RENDU (relecture ${rendus}) ; le circuit relance ${qui}, puis la passe finale restreinte à ce que le correctif change et à ses dépendants, et le relecteur sur la différence.`
          );
        }
      } else if (etape === INTEGRATION) {
        const r = integrer(ctx);
        if (r.code === A_REPASSER) throw new Arret('a-repasser', fin(r.sortie, 40));
        if (r.code !== 0) {
          throw new Arret(
            'integration',
            `Le script d'intégration refuse le lot (code ${r.code}).\n\n${fin(r.sortie, 60)}`,
            { piece: `$ node ${INTEGRER} ${r.args.join(' ')}\n${fin(r.sortie, 30)}` }
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
        throw new Arret('integration', `La file rouvre le ticket.\n\n${f.raison}`, {
          piece: f.raison,
        });
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
        composant,
        arret: e.nom,
        ...(lieu === CONTROLES && (finale || index === dernier) ? { finale: true } : {}),
        ...(e.resultat ? { resultat: e.resultat } : {}),
      });
      const ou = ouDansLeCircuit({
        etape: lieu,
        finale: finale || (lieu === CONTROLES && index === dernier),
      });
      commenter(
        ctx,
        composant,
        lieu,
        `arrêt ${e.nom} à ${ou} — ${premiereLigne(e.rapport)} — journal ${ctx.journal}`
      );
      process.stderr.write(
        `⛔ Circuit de ${ctx.ticket} arrêté : ${e.nom}, à ${ou} de ${composant}.\n`
      );
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

// The gesture <genre> of the circuit (scripts/etapes.mjs, GESTES) made on <composant>, with no
// session: its line at the ticket and in the log, with its rule.
function geste(ctx, composant, genre) {
  const g = gesteDe(genre);
  const texte = `${genre} → ${g.geste} (règle : ${g.regle})`;
  commenter(ctx, composant, 'geste', texte);
  entete(ctx, 'geste', composant);
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
    .map(r => [`- ${r.composant} : ${r.texte}`, ...(r.detail ? ['', r.detail] : [])].join('\n'))
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
  commenter(
    ctx,
    a.etat.composant,
    'question',
    `${a.nom} à ${ou} — ${fait} — au ${qui} : ${question}`
  );
  process.stderr.write(
    `⛔ Circuit de ${ctx.ticket} : question au ${qui} (${a.nom}, à ${ou}), dans ${ctx.etat} ; la réponse : \`npx grillhouse circuit ${ctx.ticket} --reprendre\`, \`--depuis …\`, \`--etendre <composant>\` ou \`--arreter\`.\n`
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
    geste(ctx, a.etat.composant, 'a-repasser');
    return a.code;
  }
  return monter(ctx, a);
}

// Where the run starts: the first component's testwriter, the first component of a --depuis in the
// order of the title, at its step, or the step and component of the state <e> (null without one).
// With <enCours>, the index of the component whose run sends it there, the renvois of that component
// and of the components after it stay pending, as a queue of jobs grows and is never replaced: each
// plays after it, its findings kept.
function depart(ctx, e, enCours = null) {
  const fin = ctx.composants.length - 1;
  if (ctx.depuis) {
    const attente = Object.fromEntries(
      Object.entries(enCours === null ? {} : (ctx.renvois ?? {})).filter(
        ([c]) => ctx.composants.indexOf(c) >= enCours
      )
    );
    ctx.renvois = {
      ...attente,
      ...Object.fromEntries(
        ctx.depuis.map(({ etape, composant, contexte }) => [
          composant,
          {
            developpeur: null,
            ...attente[composant],
            etape,
            testwriter: null,
            contexte: contexte ?? null,
          },
        ])
      ),
    };
    const [{ etape, composant }] = [...ctx.depuis].sort(
      (a, b) => ctx.composants.indexOf(a.composant) - ctx.composants.indexOf(b.composant)
    );
    return {
      index: ctx.composants.indexOf(composant),
      etape,
      tentative: 1,
      rapport: null,
      dernier: fin,
      finale: false,
    };
  }
  if (!ctx.reprendre) {
    // The run starts over: no component is reached yet, no lot verified.
    ctx.atteints = [];
    ctx.verifie = null;
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

// The end of the run, its exit code <code>: an end on a stop kept with the circuit's results
// (`montee`: its code, its stop and who must answer its question, null at 75), from which the
// bilan measures the wait to the run that answers it, then the ticket's bilan at the ticket
// (scripts/bilan.mjs); a bilan it cannot write leaves the code as it is.
function aLaFin(ctx, code) {
  try {
    if (code !== 0) {
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        composant: ctx.courant?.composant ?? ctx.composants.at(-1),
        montee: {
          code,
          raison: ctx.courant?.raison ?? null,
          qui: ctx.courant?.question?.qui ?? null,
        },
      });
    }
    const texte = ecrireLeBilan(ctx.racine, ctx.ticket);
    commenter(ctx, ctx.courant?.composant ?? ctx.composants.at(-1), 'bilan', texte);
  } catch (e) {
    process.stderr.write(`⚠️  bilan non écrit au ticket : ${e.message}\n`);
  }
  return code;
}

// The questions <questions> of a questionneur's sheet, one per line, each with what it aims at.
const lignesDesQuestions = questions =>
  (questions ?? []).map((q, i) => `${i + 1}. (${q.vise}) ${q.question}`).join('\n');

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

// The fingerprint of a plan, its title and its description.
const empreinteDuPlan = ({ titre, description }) =>
  createHash('sha256').update(`${titre}\n${description}`).digest('hex');

// Whether the plan of fingerprint <empreinte> has passed its questioning: a questioning that
// ended without question on it, or the supervisor's resumption of its stop.
const planPasse = (ctx, empreinte) =>
  lesFiches(ctx).some(
    e =>
      e.role === AUTEUR_DU_CIRCUIT &&
      ((e.questionnement?.objet === 'plan' &&
        e.questionnement.issue === 'AUCUNE' &&
        e.questionnement.empreinte === empreinte) ||
        e.plan?.empreinte === empreinte)
  );

// The plan of the ticket questioned once before the testwriter of the first component, after the
// survey of its components (<releve>): one session of the questionneur, out of the envelope, its
// sheet `issue` AUCUNE, QUESTIONS or DÉSACCORD, never side by side with an author. Its questions
// are written at the ticket and its end kept with the circuit's results (`questionnement`, which
// the bilan counts). A plan that has passed its questioning, its title and description unchanged
// since, passes. Null when the run goes on; else the exit code of the question it goes up with,
// « questionnement », the questions or the disagreement as its piece, or the stop of a session
// that cannot end.
async function questionnerLePlan(ctx, releve) {
  const t = leTicket(ctx);
  if (planPasse(ctx, empreinteDuPlan(t))) return null;
  const [composant] = ctx.composants;
  const etat = {
    etape: TESTS,
    composant,
    tentative: 1,
    code: null,
    raison: null,
    rapport: null,
    dernier: ctx.composants.at(-1),
  };
  const seance = randomUUID();
  const dire = texte => commenter(ctx, composant, 'questionnement', texte);
  ecrireEtat(ctx, { ...etat, questionnement: { objet: 'plan', tour: 1, seance } });
  let fiche;
  try {
    fiche = await jusquALaFiche(
      ctx,
      QUESTIONNEUR,
      composant,
      consigne(
        {
          depot: ctx.racine,
          ticket: ctx.ticket,
          sujet: ctx.sujet,
          objet: 'le plan',
          proposition: `le plan du ticket : son titre, « ${t.titre} », sa description (LE TICKET, ci-dessous) et les composants qu'elle touche (LE RELEVÉ DES COMPOSANTS).`,
          metacadre: lire(METACADRE).trim(),
          arbitrer: rubrique(ctx, 'Comment on arbitre'),
          monte: rubrique(ctx, 'Ce qui monte au superviseur'),
          description: t.description.trim() || 'aucune',
          releve: releve || 'aucun',
        },
        4
      ),
      { horsEnveloppe: true, droits: horsDeLEnveloppe(ctx, QUESTIONNEUR, 'sonnet'), id: seance }
    );
  } catch (x) {
    // A session of the questioning that cannot end goes up, before any testwriter.
    if (!(x instanceof Arret)) throw x;
    return monter(ctx, {
      code: ARRETS[x.nom],
      nom: x.nom,
      rapport: x.rapport,
      piece: x.piece,
      etat,
    });
  }
  const reste =
    fiche.issue === 'AUCUNE'
      ? null
      : fiche.issue === 'DÉSACCORD'
        ? `Le désaccord du questionneur : ${fiche.desaccord}`
        : `Les questions du questionneur :\n${lignesDesQuestions(fiche.questions)}`;
  dire(reste ? `le plan — ${reste}` : 'le plan — aucune question ; il reste tel quel.');
  ecrireEtat(ctx, etat);
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    composant,
    questionnement: {
      objet: 'plan',
      tours: 1,
      change: false,
      issue: fiche.issue,
      empreinte: empreinteDuPlan(leTicket(ctx)),
    },
  });
  if (!reste) return null;
  inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: TESTS, composant, arret: 'questionnement' });
  return monter(ctx, {
    code: ARRETS.questionnement,
    nom: 'questionnement',
    rapport: `Le questionneur ${fiche.issue === 'DÉSACCORD' ? 'est en désaccord avec le plan' : 'questionne le plan'}.\n\n${reste}\n\nL'échange est au ticket (\`Circuit · … · questionnement\`).`,
    piece: reste,
    etat,
  });
}

// The components the survey of the ticket finds and its title does not name
// (scripts/composants-affectes.mjs), before the testwriter of the first component: none, null; else
// the question « composants-manquants », its code, before any session, the survey's report as its
// piece. The survey's text is kept for the questioning of the plan (`ctx.releve`).
function composantsManquants(ctx) {
  const { rapport, releve } = verifierLeTitre({
    racine: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    ticket: ctx.ticket,
    description: leTicket(ctx).description,
    titre: ctx.composants,
    fichier: `${ctx.copie}.composants.json`,
  });
  ctx.releve = releve;
  if (!rapport) return null;
  return monter(ctx, {
    code: ARRETS['composants-manquants'],
    nom: 'composants-manquants',
    rapport,
    piece: rapport,
    etat: {
      etape: TESTS,
      composant: ctx.composants[0],
      tentative: 1,
      code: null,
      raison: null,
      rapport: null,
      dernier: ctx.composants.at(-1),
    },
  });
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
  if (Number.isInteger(pid) && pid !== process.pid && vivant(pid)) {
    commenter(
      ctx,
      e.composant ?? ctx.composants[0],
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
  ctx.atteints = [...(lu.atteints ?? [])];
  ctx.verifie = lu.verifie ?? null;
  ctx.reprise = lu.reprise ?? null;
  ctx.renvois = lu.renvois ?? null;
  ecrireEtat(ctx, {
    etape: lu.etape,
    composant: lu.composant,
    tentative: lu.tentative,
    code: null,
    raison: 'arrete',
    rapport: ctx.contexte
      ? `Le superviseur arrête le circuit : ${ctx.contexte}`
      : (lu.rapport ?? null),
    dernier: lu.dernier,
    finale: lu.finale === true,
  });
  const pourquoi = ctx.contexte ? ` : ${ctx.contexte}` : '.';
  commenter(
    ctx,
    lu.composant ?? ctx.composants[0],
    'arret',
    `le superviseur arrête le circuit${pourquoi}`
  );
  return 0;
}

// The plan extended by the supervisor to the components of `--etendre` (each a path or a package
// name of the repository, else a Usage): each one enters the title before the first component of
// the title whose package.json depends on it, else at its end, written by bd and said at the
// ticket. With the state <e>, the run then resumes as `--reprendre` does, each component gained
// played from its testwriter and the stopped component from its step (a testwriter's or a
// developpeur's), their context the question of the stop and the text of `--contexte`
// (`ctx.depuis`); without one, it starts on the plan extended.
function etendre(ctx, e) {
  const gagnes = [...new Set(ctx.etendre.map(ctx.resoudre))].filter(
    c => !ctx.composants.includes(c)
  );
  const liste = paquets(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  const pkg = c => liste.find(p => p.dossier === c)?.pkg ?? null;
  const lit = (lecteur, fournisseur) => {
    const nom = pkg(fournisseur)?.name;
    const p = pkg(lecteur);
    return Boolean(
      nom && p && [p.dependencies, p.devDependencies, p.peerDependencies].some(d => d && nom in d)
    );
  };
  const composants = [...ctx.composants];
  for (const c of gagnes) {
    const i = composants.findIndex(x => lit(x, c));
    composants.splice(i < 0 ? composants.length : i, 0, c);
  }
  const parts = leTicket(ctx).titre.split(' — ');
  const titre = [...parts.slice(0, -1), composants.map(c => nomDe(ctx, c)).join(', ')].join(' — ');
  const r = ctx.bd('update', ctx.ticket, '--title', titre);
  if (r.status !== 0) throw new Error(`titre de ${ctx.ticket} non écrit : ${r.stderr}`);
  ctx.composants = composants;
  commenter(
    ctx,
    e?.composant ?? composants[0],
    'plan',
    `le superviseur étend le plan à ${ctx.etendre.join(', ')} : ${titre.split(' — ').at(-1)}.`
  );
  if (!e) return;
  const contexte =
    [e.question ? `${e.question.fait}\n\n${e.question.piece}` : null, ctx.contexte]
      .filter(Boolean)
      .join('\n\n') || null;
  const arrete =
    [TESTS, CODE].includes(e.etape) &&
    e.finale !== true &&
    composants.includes(e.composant) &&
    !gagnes.includes(e.composant)
      ? [{ etape: e.etape, composant: e.composant, contexte }]
      : [];
  const depuis = [...gagnes.map(c => ({ etape: TESTS, composant: c, contexte })), ...arrete];
  ctx.contexte = null;
  if (depuis.length) ctx.depuis = depuis;
  else ctx.reprendre = true;
}

export async function main(argv) {
  let ctx = null;
  try {
    ctx = contexte(lireArguments(argv));
    mkdirSync(path.dirname(ctx.copie), { recursive: true });
    const e = existsSync(ctx.etat) ? JSON.parse(readFileSync(ctx.etat, 'utf8')) : null;
    // The supervisor's answers to a question: stop the circuit, or extend its plan and resume.
    if (ctx.arreter) return await arreter(ctx, e);
    if (ctx.etendre) {
      if (e?.etape === 'integre')
        throw new Usage(`--etendre : le lot de ${ctx.ticket} est intégré.`);
      etendre(ctx, e);
    }
    // The supervisor's resumption of the questioning lets the plan pass as it is now.
    if (ctx.reprendre && e?.raison === 'questionnement') {
      commenter(
        ctx,
        ctx.composants[0],
        'questionnement',
        'le plan passe tel qu’il est, sur la reprise du superviseur.'
      );
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        composant: ctx.composants[0],
        plan: { empreinte: empreinteDuPlan(leTicket(ctx)) },
      });
    }
    // The components the runs before carried through, the lot the whole final pass verified, and
    // the session a relaunch resumes.
    ctx.atteints = [...(e?.atteints ?? [])];
    ctx.verifie = e?.verifie ?? null;
    ctx.reprise = e?.reprise ?? null;
    let d = depart(ctx, e);
    // A session a dead circuit left running ends before this run launches its own.
    await attendreLaSeance(ctx, e?.seance);
    // From the first testwriter: the survey of the components, then the questioning of the plan.
    if (d.index === 0 && d.etape === TESTS) {
      // The survey names its start in the state while it runs (`releve`), which the board reads.
      ecrireEtat(ctx, {
        etape: TESTS,
        composant: ctx.composants[0],
        tentative: 1,
        code: null,
        raison: null,
        rapport: null,
        dernier: ctx.composants.at(-1),
        releve: new Date().toISOString(),
      });
      const manque = composantsManquants(ctx);
      if (manque === null) ecrireEtat(ctx, { ...ctx.courant, releve: null });
      const arret = manque ?? (await questionnerLePlan(ctx, ctx.releve));
      if (arret !== null) return aLaFin(ctx, arret);
      d = depart(ctx, e);
    }
    return aLaFin(ctx, await conduire(ctx, d));
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    process.stderr.write(
      `usage: npx grillhouse circuit <ticket> [--reprendre] [--depuis <testwriter|developpeur> <composant>] [--contexte <texte>] | --etendre <composant>[,<composant>…] [--contexte <texte>] | --arreter [--contexte <motif>]\n⛔ ${e.message}\n`
    );
    return CODE_USAGE;
  } finally {
    ctx?.base.fermer();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
