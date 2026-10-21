#!/usr/bin/env node
// The circuit of one ticket: for each component its title names, in order, the provider first, the
// testwriter, the proof of the red, the developpeur and the checks; then the reviewer, and on its
// ACCEPTÉ the integration, which commits the lot on the ticket's branch and puts that branch in the
// queue; then the queue, which brings it onto main, pushes and reads the CI, and the circuit ends
// on the state of the ticket the queue leaves. The supervisor runs it once, in the background, and
// its end wakes him: at 0 the ticket is closed; at 75 he runs `--reprendre` again once the machine
// is at rest; at « question » (18) the regulator's question goes to him: he answers it
// himself, or carries it to the owner when it is the owner's, then runs `--reponse "<texte>"` with
// the answer; at « composants-manquants » (21) he adds the components to the title or answers
// why they stay out; at « questionnement » (22) he changes the plan or keeps it, and answers; at
// any other code, the stop is one the regulator could not settle, or one the
// table of the stops hands to him. On a stop other than 0 and 21, the circuit reads first the
// table of the stops (scripts/etapes.mjs, TABLE_DES_ARRETS), its written policy, as Zuul and
// GitHub's merge queue write their bounded retries: a gesture the table names, it applies itself;
// for what the table does not settle, the circuit launches a session of the regulator itself, as
// the scheduler of an integration (Zuul, bors) calls the judgement at a stop and applies the
// decision it gets: the regulator settles, and its sheet is its decision, which the circuit checks
// on the state, writes at the ticket and applies in the same process. So the supervisor is woken
// only by the end of the lot, a question of the regulator, or a stop neither the table nor the
// regulator settled.
//
//   node scripts/circuit.mjs <ticket> [--reprendre] [--contexte <texte>]
//   node scripts/circuit.mjs <ticket> --depuis <testwriter|developpeur> <composant> --contexte <texte>
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
// - Before the testwriter of the first component (a run that starts there), the circuit surveys the
//   components (step 1.1 of scripts/etapes.mjs) the ticket's Architecture and criteria reach (scripts/composants-affectes.mjs), as
//   the « affected components » of a design document: a component the survey finds, the title
//   does not name and no admission covers (`composants-affectes.mjs <ticket> --admettre`) stops it
//   at once, before any session and without a regulator, at
//   « composants-manquants », the missing components at the head of its report. The supervisor
//   adds it to the title, the provider first, and runs the circuit again; or he answers why it
//   stays out, `--reponse <texte>`, which the circuit writes at the ticket and keeps beside the
//   copy (`.claude/worktrees/<ticket>.composants.json`): the components answered for pass from then
//   on, and the run starts from the first component.
// - Then, before any session of the lot, the questioning of the plan (step 1.2 of
//   scripts/etapes.mjs), as Amazon's bar raiser, a cockpit's challenge and response and the
//   devil's advocate of a design review: a session of the questionneur out of the envelope, as the
//   regulator's, read-only (no tool of writing, every write of bd refused, scripts/droits.mjs), its
//   instruction from the eighth template (the proposal, the métacadre, the rubrics « Comment on
//   arbitre » and « Ce qui monte au superviseur » of the project's CLAUDE.md, the ticket's
//   description and the survey of its components; no list of questions), its sheet `issue`
//   QUESTIONS (each question with what it aims at), AUCUNE or DÉSACCORD. On QUESTIONS the technical
//   referent answers for the plan (`--agent referent-technique`, a fresh session, the eleventh
//   template, then resumed with the tenth), its sheet `reponses` (CHANGE and what the plan becomes,
//   or GARDE and why) and the `titre` or `description` the plan becomes, which the circuit writes
//   to the ticket (`bd update --title`, `-d`; a title whose components the repository does not
//   hold stays); the questionneur's session is resumed with the answers (the ninth template); four
//   rounds at most (the loop `questionnement` of 1.2, `questionnement` in the state while it runs). Every question
//   and answer is written at the ticket (`Circuit · <composant> · questionnement : …`) and the end
//   kept with the circuit's results (`questionnement`: objet, tours, change, issue, the plan's
//   fingerprint). AUCUNE goes on, the survey played again on a plan changed; a plan whose title
//   and description passed a questioning, or the supervisor's answer, passes unquestioned. A
//   DÉSACCORD, or a fourth round still questioned, stops at « questionnement », what remains at the
//   head of its report; `--reponse <texte>` writes the answer at the ticket and lets the plan pass,
//   from the first component.
// - Each session is a launch of scripts/enveloppe/lancer.sh, a child process the circuit waits
//   for, in its own process group, its errors written to a file: a session outlives the death of
//   its circuit (its caller dead, the circuit with it), and the state names its group while it
//   runs. The instruction is written from the first template of
//   .claude/skills/pitmaster/references/consigne-agent.md, each `{{champ}}` filled: the ticket and
//   its subject, the component, the ticket's description (its criteria) and its notes (a section
//   absent without notes), both read with `bd show` at the session's launch, the report of the
//   step before (the proof, the reds of a check), the last handover of the session's author
//   (`<rôle> <composant>`) at the ticket, for a developpeur without one yet the last of the
//   testwriter of his component, else « aucune » (no other component's handover, nor a verdict), and
//   the line `CONTEXTE :` that `--contexte` gives. The session's own exit code is the one lancer.sh writes
//   to `.claude/worktrees/<ticket>.fin`; a launch that leaves none stopped before its session.
// - Each session of the testwriter, the developpeur, the reviewer, the regulator, the questionneur and
//   the technical referent ends on its sheet
//   (« la fiche »): claude runs with `--output-format json --json-schema <the schema of its role>`
//   (scripts/resultats.mjs), and its JSON result carries the sheet in `structured_output`, which
//   the circuit reads (`lireFiche`): lancer.sh writes that result to
//   `.claude/worktrees/<ticket>.resultat.json`, and a session out of the envelope prints it. Each
//   sheet read is kept with the ticket's sheets, `.claude/worktrees/<ticket>.fiches.jsonl` (`{
//   date, role, composant, fiche }`, the lot a review read joined to its sheet, `lot`), beside the
//   circuit's own results: the report of each proof and check, which the reviewer receives, with
//   its outcome (`resultat`), each stop (`arret`), each developpeur resumed who changed nothing
//   (`inchange`), which the bilan reads; and each of its discoveries (`decouvertes`) filed closed
//   under the ticket (scripts/ticket.sh, label `decouverte`). A session that ends without a sheet
//   that conforms (none, one out of its schema, a code other than 0) is resumed once, the same
//   session, with the fifth template, which names what lacks; a second one stops the circuit at
//   « sans-fiche ». The handover at the ticket (`bd comments add`) stays, for the human.
// - A fresh session of the testwriter or the developpeur opens under a session id the circuit sets
//   (`lancer.sh --seance <uuid>`, claude's `--session-id`), kept in the state (`reprise`, its
//   author and id). A relaunch of that agent on its step and component (the testwriter after a failed
//   proof, the developpeur after red checks) resumes that session (`lancer.sh --reprise <id>`,
//   claude's `--resume`, which finds its transcript in the copy's folder of transcripts, which
//   the envelope mounts in writing over the real one) with the sixth template of consigne-agent.md
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
//   `relecteur`, `regulateur`), which the envelope passes on; the circuit writes its own
//   lines under `circuit` and the reviewer's verdict under `relecteur`, and the queue writes under
//   `file` (scripts/integration/file.mjs), whose last word the circuit names. The rights of every
//   session refuse bd's `--actor`, `-a`/`--author` and the variable itself (AUTEUR_FIXE of
//   scripts/droits.mjs, in the settings of every role's session), so that no agent changes its
//   author.
// - The sheet of the testwriter and of the developpeur carries its status (`statut`): FAIT goes on as
//   below; BESOIN (its `question`) stops the circuit at once at « besoin », the question and the
//   handover as its report, with no session more; so does BLOQUÉ (its `raison`), at
//   « hors-portee », save for a developpeur whose sheet sends the red to a testwriter (`renvoi`,
//   below), which is that sending. The regulator settles either stop, as any other.
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
//   repository, the files named among them, as `npm run verifier` measures itself; a lot that
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
// - The proof of the red plays the whole component, as the CI of bors plays the whole suite of
//   the components a change touches: main is green, so a test HEAD holds that turns red in the
//   copy is a regression of the lot. One run per package, `npm test -- <package> <files>` in the
//   copy: each package of the component that has a script `test:vitest`, played whole, and the
//   test files the testwriter's lot adds or changes in the component (git status of the copy, the
//   testwriter's files as the integration shares them, `isTesterFile`). A test of a file out of the
//   lot that fails is a red, written `rouge existant : <file> › <name> — <message>`, and so is a
//   file out of the lot that does not load while no build of the component fails (it loaded at
//   HEAD); its greens do not count. A file of the lot that does not load proves nothing; a failed
//   build of a package of the component (a task `<package>#build` of the summary) is a red, as
//   not compiling is failing, named with its log, and the files it keeps from loading play at the
//   checks, after the developpeur; a failed build of a package out of the component leaves them
//   broken. A green test passes only when a sheet of the testwriter of the component names it in
//   `verts_attendus`: its file from the root and its full name (or its title), with its reason;
//   one without `test`, for a test file HEAD holds, justifies each green test of that file and
//   excuses no red; on a new file it justifies nothing, and the report says so for that file. A
//   green test HEAD already holds has nothing to prove: the version of HEAD of each file plays in
//   the same run, from a sibling file (`<nom>.circuit-avant.test.<ext>`, removed after it), and a
//   green test whose full name HEAD's version holds, green there too, is set aside, counted; a
//   body changed under the same name is not told apart. The proof passes with a red (of the lot,
//   existing or of a build), even without a file of the lot in the component: a testwriter with no
//   new test to write says so in his handover, the existing reds are enough. It fails with
//   neither a file of the lot nor a red, with a broken file of the lot, or with a green of the lot
//   no expected green justifies. A failed proof relaunches the testwriter with its report, twice at
//   most. The report (reds, justified greens) is written at the ticket. A proof with a red
//   launches the developpeur, and so does a proof without a red when a finding of the reviewer
//   names him; else it skips him: the lot is a lot of tests alone.
// - A developpeur is launched on a red, of a proof or of a check, on a finding of the reviewer, or
//   in a component without tests: a session that changes no file of its component (`git status
//   --porcelain` of its directory and the content of each file it lists, taken before and after
//   the session; the sheet and the handover do not count) stops the circuit at « sans-livraison »,
//   its report naming the component and sending to the developpeur's handover.
// - A sheet of the developpeur whose `renvoi` names `testwriter <composant>` (a component of the title
//   up to his own) says the red that remains lies in the tests of that component: the circuit
//   plays it as a `RELANCE --depuis testwriter <composant>` of the regulator, the sending and the
//   handover as its context, whether or not the session changed a file: that component's testwriter,
//   the sending as his report, then its steps, the components after it as `--depuis` plays them,
//   the final pass and the reviewer. A component out of the title or after his own is no such
//   sending. The same sending twice in a row, with no green checks between them, stops at
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
//   that plays again, the tests Vitest relates to the files changed since the last green
//   (scripts/dernier-vert.mjs); what the lot reaches plays again,
//   by the dependencies, the inputs of the tasks and `grillhouse.lit` (a reader out of the title
//   whose tests read a directory the lot changes included). After a review, save on the lot it
//   accepted, the final pass is restricted to what changed since the lot it read and to its
//   dependents, as Turborepo selects them (`laPasseFinale`): the circuit keeps the copy as it
//   stands as a commit on that lot (`garderLeLot`), and plays `npm run verifier --
//   --filter=...[<lot relu>...<copie>] --filter=//`, the root's tasks (the guards) with them;
//   Turborepo reads a range from its merge base, the lot read, where a single `[<commit>]` would
//   be read against HEAD. The whole final pass green keeps the tree of its lot (`verifie`). A red
//   goes to the developpeur of the first component, the provider first, that owns one. A red in a
//   package no component of the title holds, or that no component owns, stops at « controles »:
//   the regulator decides, who refers the component's entry in the title upward, or has the lot
//   corrected. A developpeur
//   whose reds are all findings to settle (`a-arbitrer`) is not launched: the circuit stops at
//   « controles ». From then on every check is the final pass.
// - The proof, the checks and the final pass are heavy passes: each holds the lock of the machine
//   (scripts/verrou-de-machine.mjs), shared by every repository of the machine, and waits, the
//   wait written to the log, while another measure holds it; the wait bounded, the pass is at 75,
//   « à repasser ».
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
//   CLAUDE_BIN replaces claude) in the ticket's copy, on Opus, under the rights and the
//   context of its role (scripts/droits.mjs: the commands its skill names, its index), its instruction from the second template of
//   consigne-agent.md: the ticket, its components, the path of the claims file (the ticket's
//   description as `bd show` gives it at the session's launch, written by the circuit in its
//   working folder, which the session may read; the instruction carries no criteria, which the
//   reviewer's skill reads only after its first passes), the files of the lot (the testwriter's by
//   `isTesterFile`, then the others) and the circuit's reports since its last sheet (its proofs and
//   checks). Its errors go to the log under its header line, its line to the register
//   (scripts/registre.mjs --copie), and it is watched as a session in the envelope is. Its sheet
//   is its verdict (`verdict` ACCEPTÉ or RENDU, its `constats`, `remarques`, `question`, `ecarts`):
//   the circuit writes it at the ticket for the human, under the author `relecteur`, its first
//   word the verdict, each finding under its heading with its recipient (`texteDuVerdict`).
// - A sheet of the reviewer with a `question` (what goes up to the owner, a real word of the
//   language written in the code) stops the circuit at « besoin », whatever its verdict, before
//   it commits or relaunches anyone, the question and the verdict as its report.
// - RENDU: each finding names its recipient, `role` testwriter or developpeur and `composant` one of
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
//   A RENDU without findings, a finding without a valid recipient, or one that puts its criterion
//   in question (`critere_en_cause`) stops at « relecture-arret »; so does the third RENDU since
//   the ticket's last ACCEPTÉ. The regulator settles.
// - ACCEPTÉ: the integration, once the whole final pass has played on the lot accepted (its tree
//   is `verifie`); else that pass first, once, its red going to its owner's developpeur and the
//   lot then to the reviewer again. The circuit builds the lot from the copy, as the regulator
//   built it: the files the copy changes against its HEAD, the testwriter's (`isTesterFile`: test
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
//   finale, boucles, seance, regulateur, questionnement, composants, renvois, atteints, verifie,
//   mene, reprise, journal }`; `questionnement` the questioning under way (`{ objet, tour, seance
//   }`: the plan or a decision, its round, the questionneur's session), null otherwise;
//   `etape`
//   is the state's name of a numbered step of the process (scripts/etapes.mjs: testwriter 2.1,
//   preuve 2.2, developpeur 2.3, controles 2.4, or 3 the final pass once `finale`, relecture 4,
//   integration 5.1, file 5.2), or integre at the end; `raison` names the stop; `composants` the
//   components of the title, in their order, which the board reads for the rank of `composant`;
//   `boucles` the counts of the bounded loops of the step under way, by their key (`tests`, the
//   testwriter's sessions with their proofs; `code`, the developpeur's with their checks;
//   `relecture`, the reviews; `arret`, the pass of the same stop at the arbitrage;
//   `questionnement`, the round of a questioning), null at a step without one;
//   `dernier` is the last component of the run; `finale` whether the final pass has begun; `seance` the process group of
//   the session that runs, null between two; `regulateur` the regulator's session on the stop
//   (`{ seance, arret, code, rapport, faits, ticket, signature }`: its id, the stop it settles,
//   its code and its reason, the stop's facts, the fingerprints of the description and of the
//   stop), while it runs and after its question, null otherwise; `renvois` the components a
//   RENDU, `--depuis` or a gesture of the table plays again, each with its first step and its
//   findings, null out of such a round;
//   `atteints` the components the circuit has carried through, each on its own (its proof without a
//   red for its developpeur, its developpeur's delivery, its green checks, every one once the final
//   pass is green), whatever the title gains before it, kept from one run to the next, empty when a
//   run starts over from the first component's testwriter; `verifie` the tree of the lot the last
//   whole final pass green played, null before; `mene` the start (an ISO date) of the step the
//   circuit leads itself while it runs, null otherwise; `reprise` the session of the testwriter or
//   developpeur its relaunches resume, `{ agent, seance }`, null before any. `--reprendre` starts again at the step and component of the state, its report given to the
//   next session, and goes on to its `dernier`; after any stop, the death of the circuit with its
//   caller included. A session the state names that still runs is waited for first, and stopped
//   when it stands still as long as a motionless session.
// - `--depuis <testwriter|developpeur> <composant>` (a path or a package name the title names) has
//   the lot corrected by one component: it plays it as a RENDU whose one finding names that agent,
//   the text of `--contexte` as its findings: that component's steps; then each component after
//   it that the circuit has not carried through yet (`atteints`), its whole circuit, testwriter,
//   proof, developpeur and checks; one it has carried through plays nothing, the final pass judges
//   it; then the final pass, the reviewer and the integration. It goes with no `--reprendre`.
// - On a stop other than 0 and 21, the table of the stops, tried line by line in its order (`genre`, its
//   gesture, the case of BPScript 320.3 it settles): the same stop (its name, step and component)
//   come back after a RELANCE on the same fingerprint (the files the copy changes against its HEAD
//   and the ticket's description, taken at each stop) ends the circuit on it, for the supervisor,
//   its decisions in its reason; « à repasser » ends at 75; reds to settle go to the regulator;
//   a red of another component waits for its checks, or at the final pass goes to its developpeur
//   (above); a developpeur's sending plays its testwriter (above);
//   on `--reponse`, a component the title gained since the question plays from its testwriter, the
//   answer as its report, with no regulator resumed. Each gesture the circuit applies itself is
//   written at the ticket, `Circuit · <composant> · arbitrage : <genre> → <geste>`, and counts as a
//   RELANCE on its stop.
// - On a stop the table does not settle, the regulator: a session out of the envelope, as the
//   reviewer's, claude itself (`claude -p --agent regulateur --session-id <uuid>`) in the
//   ticket's copy (the main tree once the integration removed it), on Sonnet, under the rights
//   and the context of its role (scripts/droits.mjs: the commands its skill names, the reads of
//   bd, a comment, a criterion added to the description, and the reads of the state, the log and
//   the proofs, the log searched in pieces),
//   its instruction from the third template of consigne-agent.md: the ticket, the stop's name and
//   code, its step, component and reason, the paths of the state and the log. The state names its
//   session (`regulateur`) while it runs. Its sheet is its decision (`decision`: « RELANCE
//   --reprendre », « RELANCE --depuis » with the agent in `depuis`, or « MONTE » with its
//   `question`; a `contexte` for a RELANCE; its `faits`, the facts of the state it rests on). A
//   fresh session's decision is questioned first, as the plan is, the regulator answering in its
//   own session, resumed with the tenth template (its `reponses`, and the decision it ends on,
//   changed or kept, the one the circuit checks and applies); a DÉSACCORD, or a fourth round still
//   questioned, makes of the exchange the regulator's question, the stop « question », its session
//   kept; a decision on the supervisor's answer is not questioned. The
//   circuit checks it on the state before it applies it, an admission control (refusDe): a
//   component out of the title, a step the state does not hold, a developpeur whose testwriter has not
//   run, a decision other than a RELANCE from a testwriter after the ticket's description changed (a
//   criterion added: the table's `critere-neuf`), a fact the state proves false (au-titre,
//   hors-titre, rouge-de, sans-changement, sous-charge), or the same RELANCE as the one before on
//   the same stop with no fact the one before did not have, is refused: written at the ticket
//   (`Circuit · <composant> · regulateur : décision refusée — <raison>`), the same session resumed
//   once with the reason (the seventh template); a second refusal ends the circuit on the stop,
//   both reasons joined to its own. The circuit writes a decision admitted at the ticket
//   (`Circuit · <composant> · regulateur : …`). RELANCE runs the circuit again in the same process, as the
//   option it names, the context as `--contexte`; MONTE ends the circuit at « question », the
//   question as its reason, the regulator's session kept in the state. `--reponse <texte>` resumes
//   that session (`claude -p --resume <id>`, the fourth template: the supervisor's answer, which
//   may carry the owner's) and applies the decision it gives the same way; without a session kept
//   after a question, nor a stop « composants-manquants » or « questionnement » it answers, the
//   call is refused. A session without a sheet that conforms is resumed
//   once, as any session; a second one, or
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
//   the developpeur's same sending to a testwriter twice in a row, no green checks between them),
//   16 relecture-arret (a finding without a valid recipient, one on a criterion, the third RENDU),
//   17 integration (the integration script refuses the lot, or the queue reopens the ticket),
//   18 question (the regulator's question for the supervisor, `--reponse` resumes it),
//   19 hors-portee (a testwriter or developpeur whose sheet says BLOQUÉ, without a sending to a
//   testwriter), 20 besoin (a testwriter or developpeur whose sheet says BESOIN, a reviewer whose sheet
//   carries a `question`),
//   21 composants-manquants (a component the survey of the ticket finds and its title misses),
//   22 questionnement (the questioning of the plan ends on a disagreement, or its fourth round is
//   still questioned),
//   75 a-repasser (a check or the integration still at 75 once played again, or the branch still
//   in the queue).
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
import { repondre, verifierLeTitre } from './composants-affectes.mjs';
import { optionsDuRole } from './droits.mjs';
import { matieres, NOM_DE_TEST } from './consommateurs.mjs';
import { VARIABLE as VARIABLE_ENVELOPPE } from './enveloppe/composant.mjs';
import {
  ARRETS,
  AUTO,
  boucle,
  bouclesDe,
  etapeDuCircuit,
  gesteDe,
  libelle,
  nomDuRole as enMots,
  QUESTIONNEUR,
  REGULATEUR,
  SUITE,
  TABLE_DES_ARRETS,
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
import { attendreUnPeu, vivant } from './verrou-de-fichier.mjs';
import { AttenteDeLaMachine, avecLaMachine } from './verrou-de-machine.mjs';
import { garderLeTotal, ouvrirAvancement } from './avancement.mjs';
import { AVANCEMENT } from './vitest-config/avancement.mjs';
import { NOMS_DES_GARDES } from './gardes-du-cadre.mjs';
import { isTesterFile } from './verrous/verrou.mjs';
import { A_REPASSER } from './vitest-config/pression.mjs';

// The time a session's transcripts may stand still before the circuit stops it.
export const IMMOBILE_MS = 20 * 60 * 1000;
// The exit code of each stop, from the list of the steps and stops.
export { ARRETS };
const CODE_USAGE = 2;
// The bounded loops, each declared with its step (scripts/etapes.mjs, `boucles`): the testwriter is
// relaunched twice at most after a failed proof (three sessions); the developpeur has three
// sessions, the last on the strong model; the third RENDU of one ticket stops the circuit; the
// third RELANCE in a row on one stop is the last; the fourth round of questioning still questioned
// goes up to the supervisor.
const RELANCES_TESTWRITER = boucle('tests').max - 1;
const SEANCES_DEVELOPPEUR = boucle('code').max;
const RELECTURES = boucle('relecture').max;
const RELANCES_DU_REGULATEUR = boucle('arret').max;
const TOURS = boucle('questionnement').max;
// The author who answers for a ticket's plan to the questionneur.
const REFERENT = 'referent-technique';
// The roles a finding of the reviewer may name: the agents of the steps run for each component.
const DESTINATAIRES = SUITE.filter(e => e.parComposant)
  .flatMap(e => e.qui)
  .filter(q => q !== AUTO);
// The steps of the circuit's state, read from the list of the steps.
const etatDe = n => SUITE.find(e => e.numero === n).etat;
const [TESTS, PREUVE, CODE, CONTROLES, RELECTURE, INTEGRATION, EN_FILE] = [
  '2.1',
  '2.2',
  '2.3',
  '2.4',
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
// The sessions out of the envelope (the reviewer on Opus, the regulator on Sonnet), each in the
// ticket's copy, the main tree once the integration removed it, under the rights and the context
// of its role (scripts/droits.mjs: the commands its skill names, the regulator's reads of the
// ticket's state, log and proofs, the refusal of a change of its author at the ticket), without a
// prompt: any call its rights do not permit is refused.
const horsDeLEnveloppe = (ctx, role, modele) => [
  '--model',
  modele,
  '--permission-mode',
  'dontAsk',
  ...optionsDuRole(role, {
    racine: ctx.racine,
    copie: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    ticket: ctx.ticket,
    etat: ctx.etat,
    journal: ctx.journal,
    preuves: `${ctx.copie}.preuve-*.md`,
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
const GABARIT = path.join(
  ici,
  '..',
  '.claude',
  'skills',
  'pitmaster',
  'references',
  'consigne-agent.md'
);

// A stop of the circuit: its name (a key of ARRETS) and its report; for a stop of the checks, its
// reds read in the structured results (`{ composant, texte, detail }`) and its motive, the report
// without their list, which the regulator receives apart; the outcome of the step it stops, when
// it has one (a proof's), which the bilan reads; and the facts the table of the stops and the
// admission of the regulator's decision read (`faits`: `{ genre, composant, rouges,
// aRepasser }`, its kind in the table, the component its gesture plays, the components or
// packages that own its reds, whether a command of it was at 75).
class Arret extends Error {
  constructor(nom, rapport, { rouges = null, motif = null, resultat = null, faits = {} } = {}) {
    super(nom);
    this.nom = nom;
    this.rapport = rapport;
    this.rouges = rouges;
    this.motif = motif;
    this.resultat = resultat;
    this.faits = faits;
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

// The state of the run, written whole (`seance` and `regulateur` null and `finale` false unless <etat>
// sets them, `renvois`, `atteints`, `verifie` and `reprise` the run's), kept as the run's current
// state.
function ecrireEtat(ctx, etat) {
  ctx.courant = {
    finale: false,
    seance: null,
    regulateur: null,
    questionnement: null,
    mene: null,
    avancement: null,
    releve: null,
    ...etat,
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
// A session <horsEnveloppe> (the reviewer's, the regulator's) is claude itself, in the ticket's
// copy (the main tree once the copy is gone), under <droits> (`horsDeLEnveloppe`), the
// schema of its role's sheet and the options <session> names (its id, or the session it
// resumes), its instruction on its standard input and its result on its standard output, added
// to the log under its header line, then its line written to the register, as lancer.sh does.
function lancer(
  ctx,
  role,
  composant,
  consigne,
  { fort, horsEnveloppe, droits = [], session = [], ouvre, reprend } = {}
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

// The template of the instruction at <rang> (0 the testwriter's and the developpeur's, 1 the
// reviewer's, 2 the regulator's on a stop, 3 the regulator's on the supervisor's answer, 4 any
// session's on a sheet absent or out of its schema, 5 the testwriter's and the developpeur's on a
// resumption, 6 the regulator's on a decision the circuit refuses), filled with <valeurs>.
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
// `decouverte`), its component the session's, or the ticket's for the reviewer and the regulator;
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

// The findings <constats> of a reviewer's sheet, each under its heading, its recipient (or the
// criterion in question) and its body: lines.
const lignesDesConstats = constats =>
  (constats ?? []).flatMap((c, i) => [
    `### Constat ${i + 1} — ${c.titre}`,
    c.critere_en_cause
      ? `Critère en cause : ${c.critere_en_cause}`
      : `Agent : ${c.role ?? '?'} ${c.composant ?? '?'}`,
    c.corps,
    '',
  ]);

// The verdict the reviewer's sheet <fiche> carries, as the circuit writes it at the ticket for the
// human, its first word ACCEPTÉ or RENDU: after a bounded review, each finding before it lifted or
// not, with its proof; each finding under its heading, its recipient (or the criterion in
// question) and its body; then the remarks, the question for the owner and the deviations to
// name at the commit.
export function texteDuVerdict(fiche) {
  const section = (titre, l) => (l?.length ? [`## ${titre}`, '', ...l.map(x => `- ${x}`), ''] : []);
  const suivi = (fiche.suivi ?? []).map(
    x => `${x.titre} : ${x.etat}${x.preuve ? ` — ${x.preuve}` : ''}`
  );
  return [
    fiche.verdict,
    '',
    ...section("Constats d'avant", suivi),
    ...lignesDesConstats(fiche.constats),
    ...section('Remarques', fiche.remarques),
    ...section('Question au responsable', fiche.question ? [fiche.question] : []),
    ...section('Écarts à nommer au commit', fiche.ecarts),
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
      '- Ses constats, chacun avec son destinataire :',
      '',
      ...lignesDesConstats(avant.fiche.constats),
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
    // The regulator's context of a relaunch, the answer to a question of the reviewer among them.
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

// The agents the reviewer's sheet RENDU <fiche> sends the lot back to: Map index of component →
// `{ etape, testwriter, developpeur }`, `etape` the first step that component plays again (testwriter
// when a finding names its testwriter), `testwriter` and `developpeur` the findings for each, or null.
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
    const x = avecAvancement(ctx, 'integration', avancement =>
      spawnSync(process.execPath, [INTEGRER, ...args], {
        cwd: ctx.racine,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, [AVANCEMENT]: avancement },
      })
    );
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
  const dossier = mkdtempSync(path.join(ctx.tmp, 'resultats-'));
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
      { dire: l => appendFileSync(ctx.journal, `${l}\n`) }
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
  const avancement = ouvrirAvancement({ racine: ctx.copie, genre, dans: ctx.tmp });
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

// The proof of the red on <composant>: `{ ok, rouges, texte, resume }`, `texte` without the list
// of the justified greens, which only the whole report, written to its file, holds. A green test
// passes by the expected greens of the sheets of the testwriter of <composant> (`verts_attendus`).
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

// The checks after the developpeur of the component at <index>: its own, or, when <finale>, `npm
// run verifier`, what the integration plays, restricted by <restreinte> (`{ avant, apres }`, two
// lots kept) to the packages that changed from one to the other and their dependents, with the
// root's tasks, the guards (`--filter=...[<avant>...<apres>] --filter=//`). `{ rouge, aRepasser,
// arbitrer, texte, complet, resume, proprietaire, horsTitre, faits }`: `texte` the report for the
// developpeur the red goes to, its own reds first; `complet` every red, for a stop; `proprietaire`
// the index of the component that owns the red, -1 for none; `horsTitre` the packages out of the
// title that hold a red; `arbitrer` when every red of that developpeur is a finding to settle; `faits` the facts of
// a stop on these checks.
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
    // verifier plays a task at 75 again itself, at rest: its 75 is final.
    if (r.code === A_REPASSER && !finale) r = npm(ctx, 'controles', composant, args, env);
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
    faits: {
      rouges: [...new Set(rouges.map(nomDuProprio))].sort(),
      aRepasser: aRepasser.length > 0,
    },
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
  const enveloppe = { [VARIABLE_ENVELOPPE]: ctx.composants[index] };
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
        // A testwriter who declares himself blocked or in need of an answer goes to the regulator.
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
          // The reds of a proof are its component's.
          ctx.rougesDuDeveloppeur = { rouges: [composant] };
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
        // A question goes to the regulator; a red out of reach, to the testwriter its sheet sends it
        // to, else to the regulator.
        if (fiche.statut === 'BESOIN') {
          throw arretDuStatut(ctx, 'developpeur', composant, tentative, fiche);
        }
        const renvoi = renvoiAuTestwriter(ctx, fiche, index);
        if (renvoi) {
          // The red that remains lies in the tests of that component: the gesture of the table of
          // the stops, its testwriter, as a regulator's `RELANCE --depuis testwriter <composant>`, the
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
          const d = decisionDuGeste(
            ctx,
            gesteDe('renvoi-au-testwriter'),
            renvoi.index,
            renvoi.texte
          );
          ctx.reprendre = false;
          ctx.depuis = d.depuis;
          ctx.contexte = d.contexte;
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
          inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: CODE, composant, inchange: true });
        } else if (empreinte(ctx, composant) === avant) {
          throw new Arret(
            'sans-livraison',
            `La séance ${tentative} du développeur de ${composant} ne change aucun fichier de ${composant} : un développeur n'est lancé que sur un rouge ou un constat du relecteur, et il reste. Sa passation au ticket dit pourquoi :\n\n${passations(ctx).at(-1)?.text ?? 'aucune'}`
          );
        }
        atteindre(ctx, composant);
        commenter(
          ctx,
          composant,
          'developpeur',
          `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie, sa fiche lue.`
        );
        etape = CONTROLES;
      } else if (etape === CONTROLES) {
        const passeFinale = enFinale;
        // The final pass: whole, or restricted to what changed since the last review.
        const passe = passeFinale ? laPasseFinale(ctx) : { arbre: null, restreinte: null };
        const k = controles(ctx, index, passeFinale, passe.restreinte);
        const resultat = issue => ({ issue, finale: passeFinale });
        rapport = k.texte;
        // A stop of the checks: <phrase>, then the report, its reds also kept apart.
        const arreter = (nom, phrase, faits) => {
          const avant = phrase ? `${phrase}\n\n` : '';
          throw new Arret(nom, `${avant}${k.complet}`, {
            rouges: k.rouges,
            motif: `${avant}${k.sansListe}`,
            faits,
          });
        };
        // The developpeur a red goes to: this component's, or in the final pass the owner's (the
        // table of the stops, scripts/etapes.mjs: rouge-d-un-autre-composant).
        const vers = k.rouge && passeFinale ? k.proprietaire : index;
        // One count of sessions for the component's checks, and one for the whole final pass,
        // whichever component its red goes to.
        const suivante = tentative + 1;
        if (k.rouge && passeFinale && k.horsTitre.length) {
          arreter(
            'controles',
            `La passe finale est rouge dans ${k.horsTitre.join(', ')}, hors des composants du ticket (${ctx.composants.join(', ')}) : aucun de leurs développeurs n'est relancé. La décision revient au régulateur : faire ajouter ce composant au titre du ticket par le superviseur (\`MONTE\`), le rouge allant ensuite à son développeur ; ou faire corriger le lot par le composant qui le cause (\`RELANCE --depuis developpeur <composant>\`, le rouge en \`contexte\`).`,
            k.faits
          );
        } else if (k.rouge && vers < 0) {
          arreter(
            'controles',
            `Aucun composant du ticket (${ctx.composants.join(', ')}) ne possède ce rouge de la passe finale (un rouge de la racine, ou que rien ne situe) : la décision revient au régulateur.`,
            k.faits
          );
        } else if (k.rouge && k.arbitrer) {
          arreter(
            'controles',
            `Les rouges de ${ctx.composants[vers]} sont des constats à arbitrer : aucun développeur ne les tranche, la décision revient au régulateur.`,
            { ...k.faits, genre: 'a-arbitrer' }
          );
        } else if (k.rouge && suivante <= SEANCES_DEVELOPPEUR) {
          const qui = vers === index ? '' : ` de ${ctx.composants[vers]}`;
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
          ctx.rougesDuDeveloppeur = k.faits;
        } else if (k.rouge) {
          arreter('controles', null, k.faits);
        } else if (k.aRepasser) {
          arreter('a-repasser', null, k.faits);
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
            if (!passe.restreinte && passe.arbre) ctx.verifie = passe.arbre;
            const r = relectureDAvant(ctx);
            const accepte =
              r?.fiche.verdict === 'ACCEPTÉ' && passe.arbre && r.lot.arbre === passe.arbre;
            etape = accepte ? INTEGRATION : RELECTURE;
          }
        }
      } else if (etape === RELECTURE) {
        const v = await relire(ctx, composant);
        // A question for the owner: nothing is committed nor relaunched before his answer.
        if (v.fiche.question) {
          throw new Arret(
            'besoin',
            `Le relecteur attend une réponse : ${v.fiche.question}\n\nLa décision revient au régulateur. Le verdict :\n\n${v.texte}`
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
              `${rendus} relectures ont rendu le lot : le circuit s'arrête à la troisième. La décision revient au régulateur.\n\nLe dernier verdict :\n\n${v.texte}`
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
      // A stop of a developpeur's session rests on the reds it was launched on.
      const faits = etape === CODE ? { ...ctx.rougesDuDeveloppeur, ...e.faits } : e.faits;
      ecrireEtat(ctx, { ...etat, code, raison: e.nom, rapport: e.rapport });
      // The stop kept with the circuit's results, which the bilan counts.
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        etape,
        composant,
        arret: e.nom,
        ...(etape === CONTROLES && (finale || index === dernier) ? { finale: true } : {}),
        ...(e.resultat ? { resultat: e.resultat } : {}),
      });
      const ou = ouDansLeCircuit({
        etape,
        finale: finale || (etape === CONTROLES && index === dernier),
      });
      commenter(
        ctx,
        composant,
        etape,
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
        faits,
        etat,
      };
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

// Whether the testwriter of the component at <i> has written its tests, as the state <etat> of a stop
// says: a component before the one it stopped at, that one past its testwriter's step, every one at
// the final pass, one the circuit has carried through (`atteints`), or one without tests.
function testwriterPasse(ctx, etat, i) {
  const ici = ctx.composants.indexOf(etat.composant);
  return (
    etat.finale === true ||
    i < ici ||
    (i === ici && etat.etape !== TESTS) ||
    ctx.atteints.includes(ctx.composants[i]) ||
    sansTests(ctx, i)
  );
}

// The fingerprint of the ticket's description, read now.
const empreinteDuTicket = ctx =>
  createHash('sha256').update(leTicket(ctx).description).digest('hex');

// The fingerprint of what the stop <a> rests on, taken once: the copy (each file it changes
// against its HEAD) and the ticket's description. The same stop come back on the same fingerprint
// brings no new fact.
function signatureDe(ctx, a) {
  a.signature ??= createHash('sha256')
    .update(existsSync(ctx.copie) ? empreinte(ctx, '.') : '')
    .update(empreinteDuTicket(ctx))
    .digest('hex');
  return a.signature;
}

// How the circuit reads each kind of stop of the table (scripts/etapes.mjs) on the stop <a>; a
// kind it reads elsewhere (a developpeur's sending, the title on an answer, the description on a
// decision) has none here.
const LECTURES = {
  'meme-arret-sans-fait-nouveau': (ctx, a) => {
    const avant = ctx.relances.at(-1);
    return memeArret(avant, a) && avant.signature === signatureDe(ctx, a);
  },
  'a-repasser': (ctx, a) => a.nom === 'a-repasser',
  'a-arbitrer': (ctx, a) => a.faits?.genre === 'a-arbitrer',
};

// The first line of the table of the stops that settles the stop <a>, in the table's order, or
// null: the regulator decides.
const ligneDeLArret = (ctx, a) => TABLE_DES_ARRETS.find(l => LECTURES[l.genre]?.(ctx, a)) ?? null;

// The decision the line <ligne> of the table, of gesture `testwriter`, gives for the component at
// <i>, <contexte> its context: a RELANCE --depuis testwriter, as a regulator's (decisionDe), `ligne`
// as the circuit writes it. The components after it that the circuit has carried through
// (`atteints`) play nothing, the final pass judges them.
function decisionDuGeste(ctx, ligne, i, contexte) {
  const composant = ctx.composants[i];
  const etape = ligne.geste === 'testwriter' ? TESTS : null;
  return {
    ligne: `RELANCE --depuis ${etape} ${composant}`,
    depuis: { etape, composant },
    contexte,
  };
}

// Why the fact <f> of a regulator's sheet is false on the stop <a> and the state, or null when it
// is true.
function faitFaux(ctx, a, f) {
  const i = f.composant ? indexDe(ctx, f.composant) : -1;
  const chemin = i >= 0 ? ctx.composants[i] : f.composant;
  const titre = ctx.composants.join(', ');
  const rouges = a.faits?.rouges ?? [];
  const verifier = {
    'au-titre': () => [i >= 0, `le titre ne le nomme pas (${titre})`],
    'hors-titre': () => [i < 0, `le titre le nomme (${titre})`],
    'rouge-de': () => [
      rouges.includes(chemin),
      `les rouges de l'arrêt sont à ${rouges.join(', ') || 'aucun composant'}`,
    ],
    'sans-changement': () => [
      i >= 0 && !livre(ctx, chemin),
      i >= 0 ? `la copie change ${chemin}` : `${f.composant} n'est pas un composant du titre`,
    ],
    'sous-charge': () => [
      a.faits?.aRepasser === true,
      "aucune commande de l'arrêt n'est à repasser : son rouge ne dépend pas d'une durée sous charge",
    ],
  };
  const [vrai, pourquoi] = verifier[f.sujet]();
  return vrai
    ? null
    : `le fait « ${f.sujet}${f.composant ? ` ${f.composant}` : ''} » est faux : ${pourquoi}`;
}

// Why the circuit refuses the decision <d> of the regulator's sheet <fiche> on the stop <a>,
// checked on the state before it is applied (an admission control), or null when it admits it: a
// component out of the title, a step the state does not hold, a developpeur before his testwriter, a
// criterion added and no testwriter first (the table's `critere-neuf`), a fact of its sheet the state
// proves false, the same RELANCE as the one before on the same stop with no new fact.
function refusDe(ctx, a, fiche, d) {
  if (!d) {
    return `sa décision nomme ${fiche.depuis?.composant}, qui n'est pas un composant du titre (${ctx.composants.join(', ')})`;
  }
  const faux = (fiche.faits ?? []).map(f => faitFaux(ctx, a, f)).find(Boolean);
  if (faux) return faux;
  if (d.question) return null;
  if (d.reprendre && !etapeDuCircuit(a.etat)) {
    return `RELANCE --reprendre reprend l'état à l'étape ${a.etat.etape}, qui n'est pas une étape du circuit : la décision nomme son agent (RELANCE --depuis)`;
  }
  const { composant } = d.depuis ?? {};
  if (
    d.depuis?.etape === CODE &&
    !testwriterPasse(ctx, a.etat, ctx.composants.indexOf(composant))
  ) {
    return `RELANCE --depuis developpeur ${composant} lance le développeur de ${composant} avant son testwriter, dont les tests ne sont pas écrits : un composant commence par son testwriter (RELANCE --depuis testwriter ${composant})`;
  }
  const testwriter = d.depuis?.etape === TESTS || (d.reprendre && a.etat.etape === TESTS);
  if (a.ticket && !testwriter && a.ticket !== empreinteDuTicket(ctx)) {
    return `la description du ticket a changé pendant l'arbitrage : un critère neuf part au testwriter avant le développeur (table des arrêts, ${gesteDe('critere-neuf').genre}), par RELANCE --depuis testwriter <composant>`;
  }
  const avant = ctx.relances.at(-1);
  const connu = f => (avant?.faits ?? []).some(g => JSON.stringify(g) === JSON.stringify(f));
  if (memeArret(avant, a) && avant.decision === d.ligne && (fiche.faits ?? []).every(connu)) {
    return `la même RELANCE que la précédente sur cet arrêt (${d.ligne.split('\n')[0]}), sans fait nouveau : elle a laissé l'arrêt tel qu'il était`;
  }
  return null;
}

// The decision <d> on the stop <a> applied: kept among the RELANCE in a row on that stop, with the
// facts <faits> of its sheet and the stop's fingerprint, then the run that starts again, from the
// state <etat> of the stop for a RELANCE --reprendre.
function appliquer(ctx, a, d, etat, faits = []) {
  const entree = { ...a, decision: d.ligne, faits, signature: signatureDe(ctx, a) };
  ctx.relances = memeArret(ctx.relances[0], a) ? [...ctx.relances, entree] : [entree];
  ctx.reprendre = Boolean(d.reprendre);
  ctx.depuis = d.depuis ?? null;
  ctx.contexte = d.contexte;
  return { depart: depart(ctx, { ...etat, renvois: ctx.renvois }) };
}

// The stop <a> (`{ code, nom, rapport, faits, etat }`, `etat` the state of the step it stopped)
// settled by a session of the regulator: a fresh one, or, with <reponse> (the supervisor's answer
// to its question), its session `a.seance` resumed. A fresh session's decision is questioned first
// (questionnerLaDecision): the regulator answers in its session, and the decision it gives at the
// end is the one checked; a questioning that does not converge ends on « question », its
// question for the supervisor. Its decision is checked on the state before it
// is applied (refusDe); a decision refused asks the same session again once, the reason given, and
// a second refusal ends the circuit on the stop. `{ code }` when the circuit ends: on « question »,
// or on the stop itself for an answer in no form of decision, a decision refused twice or a session
// in error; `{ depart }` for a RELANCE, where the run starts again.
async function trancher(ctx, a, reponse = null) {
  const seance = reponse === null ? randomUUID() : a.seance;
  const garde = {
    seance,
    arret: a.nom,
    code: a.code,
    rapport: a.rapport,
    faits: a.faits ?? {},
    ticket: a.ticket ?? null,
    signature: a.signature ?? null,
  };
  const { composant } = a.etat;
  // The same stop come back after a RELANCE counts its pass at the arbitrage.
  const passe = memeArret(ctx.relances[0], a) ? ctx.relances.length + 1 : 1;
  const arret = {
    ...a.etat,
    code: a.code,
    raison: a.nom,
    rapport: a.rapport,
    boucles: { arret: passe },
  };
  ecrireEtat(ctx, { ...arret, regulateur: garde });
  const valeurs = {
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    arret: a.nom,
    code: a.code,
    // The step by its number and title, « 2.3 Code ».
    etape: ouDansLeCircuit(a.etat),
    composant,
    raison: String(a.motif ?? a.rapport ?? '').trim() || 'aucune',
    // The reds of the stop, read in the structured results, each with its component.
    rouges: a.rouges?.length
      ? a.rouges
          .map(r =>
            [`- ${r.composant} : ${r.texte}`, ...(r.detail ? ['', r.detail, ''] : [])].join('\n')
          )
          .join('\n')
      : 'aucun',
    etat: ctx.etat,
    journal: ctx.journal,
    reponse,
  };
  const options = {
    horsEnveloppe: true,
    droits: horsDeLEnveloppe(ctx, REGULATEUR, 'sonnet'),
    id: seance,
  };
  // Its sheet, read as any session's: one that is absent or out of its schema resumes the session
  // once, asking for it; twice none, or a session that cannot end, leaves no decision.
  let d = null;
  let fiche = null;
  let pourquoi = null;
  const refus = [];
  try {
    fiche = await jusquALaFiche(
      ctx,
      REGULATEUR,
      composant,
      consigne(valeurs, reponse === null ? 2 : 3),
      { ...options, premiere: reponse === null ? 'ouvre' : 'reprend' }
    );
    // Its decision questioned before the admission control, save on the supervisor's answer.
    const q =
      reponse === null
        ? await questionnerLaDecision(ctx, a, fiche, {
            options,
            etat: { ...arret, regulateur: garde },
            valeurs,
          })
        : { fiche, question: null };
    fiche = q.fiche;
    // A questioning that does not converge goes up to the supervisor, as the regulator's question.
    if (q.question) d = { ligne: `MONTE : ${q.question}`, question: q.question };
    while (!d && !pourquoi) {
      d = decisionDe(ctx, fiche);
      const r = refusDe(ctx, a, fiche, d);
      if (!r) break;
      d = null;
      refus.push(r);
      commenter(ctx, composant, REGULATEUR, `décision refusée — ${r}`);
      if (refus.length > 1) {
        pourquoi = `sa décision, vérifiée sur l'état, est refusée deux fois : ${refus.join(' ; ')}`;
        break;
      }
      fiche = await jusquALaFiche(
        ctx,
        REGULATEUR,
        composant,
        consigne({ ticket: ctx.ticket, sujet: ctx.sujet, refus: r }, 6),
        { ...options, premiere: 'reprend' }
      );
    }
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
  return appliquer(ctx, a, d, arret, fiche.faits ?? []);
}

// The stop <a> ended for the supervisor by the line <ligne> of the table: the same stop come back
// with no new fact. Its exit code.
function rendreAuSuperviseur(ctx, a, ligne) {
  const decisions = ctx.relances.map((x, i) => `${i + 1}. ${x.decision}`).join('\n\n');
  ecrireEtat(ctx, {
    ...a.etat,
    code: a.code,
    raison: a.nom,
    rapport: `${String(a.rapport ?? '').trim()}\n\nLE MÊME ARRÊT revient sans fait nouveau, la copie et la description du ticket telles qu'à la décision d'avant : le circuit s'arrête, pour le superviseur (table des arrêts, ${ligne.genre}). Les décisions sur cet arrêt :\n\n${decisions}`,
  });
  commenter(
    ctx,
    a.etat.composant,
    'arbitrage',
    `${ligne.genre} → le superviseur : l'arrêt ${a.nom} revient sans fait nouveau.`
  );
  return a.code;
}

// The run from <suite> on: each stop other than 0 read in the table of the stops (scripts/
// etapes.mjs), whose gesture the circuit applies itself, or settled by the regulator, whose
// RELANCE runs the circuit again, until the circuit ends; its exit code. The stop that follows the
// third RELANCE in a row on it ends the circuit without a regulator.
async function conduire(ctx, suite) {
  for (;;) {
    if (suite.code !== undefined) return suite.code;
    const a = await derouler(ctx, suite.depart);
    if (a.code === 0) return a.code;
    // The description and the copy as the stop finds them: a decision is checked against the
    // first, and the stop that comes back against both.
    a.ticket = empreinteDuTicket(ctx);
    signatureDe(ctx, a);
    const ligne = ligneDeLArret(ctx, a);
    if (ligne?.geste === 'a-repasser') return a.code;
    if (ligne?.geste === 'superviseur') return rendreAuSuperviseur(ctx, a, ligne);
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

// Where the run starts: the first component's testwriter, or the step and component of the state
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

// The questions <questions> of a questionneur's sheet, one per line, each with what it aims at.
const lignesDesQuestions = questions =>
  (questions ?? []).map((q, i) => `${i + 1}. (${q.vise}) ${q.question}`).join('\n');

// The answers <reponses> of an author's sheet, one per line: CHANGE and what the proposal
// becomes, or GARDE and why.
const lignesDesReponses = reponses =>
  (reponses ?? []).length
    ? reponses.map((r, i) => `${i + 1}. ${r.choix} — ${r.question} — ${r.texte}`).join('\n')
    : 'aucune réponse dans sa fiche';

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

const METACADRE = path.join(ici, '..', 'METACADRE.md');

// The questioning of a proposal by the questionneur, in rounds with its author, never side by
// side: the questionneur asks (its sheet, `questions`), the author answers by resuming its own
// session (<q>.repondre: its answers, whether its proposal changed and what it becomes), the
// questionneur reads the answer by resuming its own, TOURS rounds at most. <q>: `{ objet, nom,
// composant, etat, auteur, proposition, description, releve, empreinte, repondre }`, <objet> plan
// or decision, <nom> the proposal in words, <etat> the state the questioning runs in, which it
// names (`questionnement`, its round in `boucles`) while it runs and leaves as it was at its end.
// Each question and each answer is written at the ticket, and the end is kept with the circuit's
// results (`questionnement`, which the bilan counts, with what <empreinte> gives). `{ issue,
// tours, change, reste }`: AUCUNE, a sheet without question; DÉSACCORD, the questionneur's; MONTE,
// the last round still questioned; <reste> what remains for the supervisor. Throws the Arret of a
// session that cannot end.
async function questionner(ctx, q) {
  const seance = randomUUID();
  const options = {
    horsEnveloppe: true,
    droits: horsDeLEnveloppe(ctx, QUESTIONNEUR, 'sonnet'),
    id: seance,
  };
  const dire = texte => commenter(ctx, q.composant, 'questionnement', texte);
  let change = false;
  let reponses = null;
  let proposition = q.proposition;
  const fin = (issue, tours, reste = null) => {
    ecrireEtat(ctx, q.etat);
    inscrire(ctx, {
      role: AUTEUR_DU_CIRCUIT,
      composant: q.composant,
      questionnement: { objet: q.objet, tours, change, issue, ...(q.empreinte?.() ?? {}) },
    });
    return { issue, tours, change, reste };
  };
  for (let tour = 1; ; tour++) {
    ecrireEtat(ctx, {
      ...q.etat,
      questionnement: { objet: q.objet, tour, seance },
      boucles: { ...q.etat.boucles, questionnement: tour },
    });
    const ou = `${q.nom}, tour ${tour}/${TOURS}`;
    const texte =
      tour === 1
        ? consigne(
            {
              depot: ctx.racine,
              ticket: ctx.ticket,
              sujet: ctx.sujet,
              objet: q.nom,
              auteur: enMots(q.auteur),
              proposition,
              max: TOURS,
              metacadre: lire(METACADRE).trim(),
              arbitrer: rubrique(ctx, 'Comment on arbitre'),
              monte: rubrique(ctx, 'Ce qui monte au superviseur'),
              description: q.description.trim() || 'aucune',
              releve: q.releve || 'aucun',
            },
            7
          )
        : consigne(
            {
              ticket: ctx.ticket,
              sujet: ctx.sujet,
              tour,
              max: TOURS,
              auteur: enMots(q.auteur),
              reponses,
              proposition,
            },
            8
          );
    const fiche = await jusquALaFiche(ctx, QUESTIONNEUR, q.composant, texte, {
      ...options,
      premiere: tour === 1 ? 'ouvre' : 'reprend',
    });
    if (fiche.issue === 'AUCUNE') {
      dire(
        `${ou} — aucune question au tour ${tour}/${TOURS} ; ${change ? 'la proposition a changé' : 'la proposition reste telle quelle'}.`
      );
      return fin('AUCUNE', tour);
    }
    if (fiche.issue === 'DÉSACCORD') {
      dire(`${ou} — désaccord du questionneur : ${fiche.desaccord}`);
      return fin('DÉSACCORD', tour, `Le désaccord du questionneur : ${fiche.desaccord}`);
    }
    const questions = lignesDesQuestions(fiche.questions);
    dire(`${ou} — les questions du questionneur :\n${questions}`);
    if (tour >= TOURS) {
      return fin(
        'MONTE',
        tour,
        `Les questions du questionneur au tour ${tour}/${TOURS}, sans réponse :\n${questions}`
      );
    }
    const r = await q.repondre(fiche.questions, tour);
    reponses = lignesDesReponses(r.reponses);
    dire(`${ou} — les réponses du ${enMots(q.auteur)} :\n${reponses}`);
    change ||= r.change;
    proposition = r.change ? r.proposition : 'inchangée depuis le tour d’avant';
  }
}

// The fingerprint of a plan, its title and its description.
const empreinteDuPlan = ({ titre, description }) =>
  createHash('sha256').update(`${titre}\n${description}`).digest('hex');

// Whether the plan of fingerprint <empreinte> has passed its questioning: a questioning that
// ended without question on it, or the supervisor's answer to its stop.
const planPasse = (ctx, empreinte) =>
  lesFiches(ctx).some(
    e =>
      e.role === AUTEUR_DU_CIRCUIT &&
      ((e.questionnement?.objet === 'plan' &&
        e.questionnement.issue === 'AUCUNE' &&
        e.questionnement.empreinte === empreinte) ||
        e.plan?.empreinte === empreinte)
  );

// The plan as the technical referent's sheet <fiche> changes it, written to the ticket by the
// circuit (`bd update --title`, `-d`), never by the session: the changes made, in words. A title
// whose components the repository does not hold stays as it was, said at the ticket.
function changerLePlan(ctx, fiche, composant) {
  const avant = leTicket(ctx);
  const faits = [];
  const ecrire = (option, valeur, quoi) => {
    const r = ctx.bd('update', ctx.ticket, option, valeur);
    if (r.status === 0) faits.push(quoi);
    else commenter(ctx, composant, 'questionnement', `${quoi} non écrit : ${r.stderr}`);
    return r.status === 0;
  };
  const titre = fiche.titre?.trim();
  if (titre && titre !== avant.titre.trim()) {
    try {
      const lu = ctx.duTitre(titre);
      if (ecrire('--title', titre, `le titre : « ${titre} »`)) Object.assign(ctx, lu);
    } catch (e) {
      if (!(e instanceof Usage)) throw e;
      commenter(
        ctx,
        composant,
        'questionnement',
        `titre neuf refusé, le titre reste : ${e.message}`
      );
    }
  }
  const description = fiche.description?.trim();
  if (description && description !== avant.description.trim()) {
    ecrire('-d', fiche.description, 'la description');
  }
  return faits;
}

// The plan of the ticket questioned before the testwriter of the first component, after the survey
// of its components (<releve>): the technical referent answers for it, a fresh session that
// defends the plan with the index and the mature references, resumed from its second answer; its
// changes are written to the ticket by the circuit. A plan that has passed its questioning, its
// title and description unchanged since, passes. Null when the run goes on; else the exit code of
// the stop it ends on: « questionnement », for the supervisor, or « composants-manquants » when
// the plan changed and the survey of its new text finds a component its title misses.
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
  const auteurDuPlan = randomUUID();
  let r;
  try {
    r = await questionner(ctx, {
      objet: 'plan',
      nom: 'le plan',
      composant,
      etat,
      auteur: REFERENT,
      proposition: `le plan du ticket : son titre, « ${t.titre} », sa description (LE TICKET, ci-dessous) et les composants qu'elle touche (LE RELEVÉ DES COMPOSANTS).`,
      description: t.description,
      releve,
      empreinte: () => ({ empreinte: empreinteDuPlan(leTicket(ctx)) }),
      repondre: async (questions, tour) => {
        const maintenant = leTicket(ctx);
        const texte =
          tour === 1
            ? consigne(
                {
                  depot: ctx.racine,
                  ticket: ctx.ticket,
                  sujet: ctx.sujet,
                  titre: maintenant.titre,
                  description: maintenant.description.trim() || 'aucune',
                  releve: releve || 'aucun',
                  tour,
                  max: TOURS,
                  questions: lignesDesQuestions(questions),
                },
                10
              )
            : consigne(
                {
                  ticket: ctx.ticket,
                  sujet: ctx.sujet,
                  tour,
                  max: TOURS,
                  questions: lignesDesQuestions(questions),
                  forme:
                    'chaque réponse dans `reponses` ; quand une réponse CHANGE le plan, le titre ou la description qu’il devient, entiers, dans `titre` ou `description`',
                },
                9
              );
        const f = await jusquALaFiche(ctx, REFERENT, composant, texte, {
          horsEnveloppe: true,
          droits: horsDeLEnveloppe(ctx, REFERENT, 'sonnet'),
          id: auteurDuPlan,
          premiere: tour === 1 ? 'ouvre' : 'reprend',
        });
        const faits = changerLePlan(ctx, f, composant);
        const neuf = leTicket(ctx);
        return {
          reponses: f.reponses,
          change: faits.length > 0,
          proposition: `le plan change (${faits.join(', ')}) ; son titre : « ${neuf.titre} » ; sa description :\n\n${neuf.description.trim()}`,
        };
      },
    });
  } catch (x) {
    // A session of the questioning that cannot end stops the circuit on its stop, before any
    // testwriter.
    if (!(x instanceof Arret)) throw x;
    ecrireEtat(ctx, { ...etat, code: ARRETS[x.nom], raison: x.nom, rapport: x.rapport });
    const ou = ouDansLeCircuit({ ...etat, questionnement: 'plan' });
    commenter(
      ctx,
      composant,
      'questionnement',
      `arrêt ${x.nom} à ${ou} — ${premiereLigne(x.rapport)}`
    );
    process.stderr.write(`⛔ Circuit de ${ctx.ticket} arrêté : ${x.nom}, à ${ou}.\n`);
    return ARRETS[x.nom];
  }
  if (r.issue === 'AUCUNE') {
    // A plan changed: its new text surveyed again, before any session.
    return r.change ? composantsManquants(ctx) : null;
  }
  const code = ARRETS.questionnement;
  const rapport = [
    `Le questionnement du plan ${r.issue === 'DÉSACCORD' ? 'finit sur un désaccord' : `reste questionné au tour ${TOURS}/${TOURS}`} : la décision revient au superviseur.`,
    '',
    r.reste,
    '',
    `L'échange entier est au ticket (\`Circuit · … · questionnement\`). Le superviseur change le plan (\`bd update ${ctx.ticket} …\`) ou le garde, puis répond : \`node scripts/circuit.mjs ${ctx.ticket} --reponse "<texte>"\`, qui fait passer le plan.`,
  ].join('\n');
  ecrireEtat(ctx, {
    ...etat,
    code,
    raison: 'questionnement',
    rapport,
    boucles: { questionnement: r.tours },
  });
  inscrire(ctx, { role: AUTEUR_DU_CIRCUIT, etape: TESTS, composant, arret: 'questionnement' });
  const ou = ouDansLeCircuit({ ...etat, raison: 'questionnement' });
  commenter(
    ctx,
    composant,
    'questionnement',
    `arrêt questionnement à ${ou} — ${premiereLigne(rapport)}`
  );
  process.stderr.write(
    `⛔ Circuit de ${ctx.ticket} arrêté : questionnement, à ${ou}.\n${rapport}\n`
  );
  return code;
}

// The decision of the regulator's sheet <fiche> as the circuit writes it, or its own words when it
// names a component out of the title.
const ligneDeLaDecision = (ctx, fiche) =>
  decisionDe(ctx, fiche)?.ligne ??
  `${fiche.decision} ${fiche.depuis?.role ?? ''} ${fiche.depuis?.composant ?? ''}`.trim();

// The decision of the regulator's sheet <fiche> on the stop <a>, as the questionneur reads it: the
// decision, its facts, then the stop it settles (<valeurs>: its step, component, reason and reds,
// as the regulator received them).
const laDecision = (ctx, a, fiche, valeurs) =>
  [
    `la décision du régulateur sur l'arrêt ${a.nom} (code ${a.code}), à l'étape ${valeurs.etape} du composant ${valeurs.composant} :`,
    '',
    ligneDeLaDecision(ctx, fiche),
    ...((fiche.faits ?? []).length
      ? [
          '',
          `Ses faits : ${fiche.faits.map(f => `${f.sujet}${f.composant ? ` ${f.composant}` : ''}`).join(', ')}.`,
        ]
      : []),
    '',
    `LA RAISON DE L'ARRÊT, écrite par le circuit :\n\n${valeurs.raison}`,
    '',
    `LES ROUGES DE L'ARRÊT :\n\n${valeurs.rouges}`,
  ].join('\n');

// The decision of the regulator's sheet <premiere> on the stop <a> questioned before the admission
// control: the regulator answers in its own session, resumed (<options>), and may change its
// decision; <etat> the state of the arbitrage, <valeurs> the regulator's instruction. `{ fiche,
// question }`: the sheet of its last answer, and the question for the supervisor when the
// questioning ends on a disagreement or on its last round still questioned, else null.
async function questionnerLaDecision(ctx, a, premiere, { options, etat, valeurs }) {
  let fiche = premiere;
  const r = await questionner(ctx, {
    objet: 'decision',
    nom: 'la décision du régulateur',
    composant: valeurs.composant,
    etat,
    auteur: REGULATEUR,
    proposition: laDecision(ctx, a, fiche, valeurs),
    description: leTicket(ctx).description,
    releve: null,
    repondre: async (questions, tour) => {
      const avant = ligneDeLaDecision(ctx, fiche);
      fiche = await jusquALaFiche(
        ctx,
        REGULATEUR,
        valeurs.composant,
        consigne(
          {
            ticket: ctx.ticket,
            sujet: ctx.sujet,
            tour,
            max: TOURS,
            questions: lignesDesQuestions(questions),
            forme:
              'chaque réponse dans `reponses`, et ta décision, changée ou gardée, sous l’une des formes de ta consigne, ses `faits` vrais sur l’état',
          },
          9
        ),
        { ...options, premiere: 'reprend' }
      );
      const apres = ligneDeLaDecision(ctx, fiche);
      return {
        reponses: fiche.reponses,
        change: apres !== avant,
        proposition: laDecision(ctx, a, fiche, valeurs),
      };
    },
  });
  if (r.issue === 'AUCUNE') return { fiche, question: null };
  return {
    fiche,
    question: `Le questionnement de la décision du régulateur ${r.issue === 'DÉSACCORD' ? 'finit sur un désaccord' : `reste questionné au tour ${TOURS}/${TOURS}`} : la décision revient au superviseur.\n\nSa décision : ${ligneDeLaDecision(ctx, fiche)}\n\n${r.reste}\n\nL'échange entier est au ticket (\`Circuit · … · questionnement\`).`,
  };
}

// The components the survey of the ticket finds and its title does not name
// (scripts/composants-affectes.mjs), before the testwriter of the first component: none, null; else
// the stop « composants-manquants », its code, before any session and without a regulator. The
// survey's text is kept for the questioning of the plan (`ctx.releve`).
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
  const [composant] = ctx.composants;
  const code = ARRETS['composants-manquants'];
  ecrireEtat(ctx, {
    etape: TESTS,
    composant,
    tentative: 1,
    code,
    raison: 'composants-manquants',
    rapport,
    dernier: ctx.composants.at(-1),
  });
  const ou = ouDansLeCircuit({ etape: TESTS, raison: 'composants-manquants' });
  commenter(
    ctx,
    composant,
    'composants',
    `arrêt composants-manquants à ${ou} — ${premiereLigne(rapport)}`
  );
  process.stderr.write(
    `⛔ Circuit de ${ctx.ticket} arrêté : composants-manquants, à ${ou}.\n${rapport}\n`
  );
  return code;
}

export async function main(argv) {
  let ctx = null;
  try {
    ctx = contexte(lireArguments(argv));
    mkdirSync(path.dirname(ctx.copie), { recursive: true });
    const e = existsSync(ctx.etat) ? JSON.parse(readFileSync(ctx.etat, 'utf8')) : null;
    // The supervisor's answer to the questioning of the plan lets the plan pass, from the start.
    if (ctx.reponse !== null && e?.raison === 'questionnement') {
      commenter(
        ctx,
        ctx.composants[0],
        'questionnement',
        `le plan, réponse du superviseur : ${ctx.reponse}`
      );
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        composant: ctx.composants[0],
        plan: { empreinte: empreinteDuPlan(leTicket(ctx)) },
      });
      ctx.reponse = null;
    }
    // The supervisor's answer to the components the title misses lets them pass, from the start.
    if (ctx.reponse !== null && e?.raison === 'composants-manquants') {
      const hors = repondre(`${ctx.copie}.composants.json`, ctx.reponse);
      const texte = `${hors.join(', ')} hors du titre, réponse du superviseur : ${ctx.reponse}`;
      commenter(ctx, ctx.composants[0], 'composants', texte);
      ctx.reponse = null;
    }
    if (ctx.reponse !== null && (e?.raison !== 'question' || !e?.regulateur?.seance)) {
      throw new Usage(
        `--reponse : aucune séance du régulateur gardée dans ${ctx.etat} ; elle suit un arrêt « question ».`
      );
    }
    // The components the runs before carried through, the lot the whole final pass verified, and
    // the session a relaunch resumes.
    ctx.atteints = [...(e?.atteints ?? [])];
    ctx.verifie = e?.verifie ?? null;
    ctx.reprise = e?.reprise ?? null;
    let d = ctx.reponse === null ? depart(ctx, e) : null;
    // A session a dead circuit left running ends before this run launches its own.
    await attendreLaSeance(ctx, e?.seance);
    if (ctx.reponse === null) {
      // From the first testwriter: the survey of the components, then the questioning of the plan,
      // which may change the title, and so where the run starts.
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
      return aLaFin(ctx, await conduire(ctx, { depart: d }));
    }
    // The supervisor's answer goes to the regulator's session kept on the stop it settles.
    ctx.renvois = e.renvois ?? null;
    const arret = {
      code: e.regulateur.code,
      nom: e.regulateur.arret,
      rapport: e.regulateur.rapport,
      faits: e.regulateur.faits ?? {},
      ticket: e.regulateur.ticket ?? null,
      signature: e.regulateur.signature ?? undefined,
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
    // A component the title gained since the question: the gesture of the table, its testwriter, the
    // answer as its report, with no regulator resumed.
    const ajoute = ctx.composants.find(c => !(e.composants ?? ctx.composants).includes(c));
    if (ajoute) {
      const ligne = gesteDe('composant-ajoute');
      const i = ctx.composants.indexOf(ajoute);
      const decision = decisionDuGeste(ctx, ligne, i, ctx.reponse);
      commenter(
        ctx,
        e.composant,
        'arbitrage',
        `${ligne.genre} → ${decision.ligne} (table des arrêts, sans régulateur).`
      );
      return aLaFin(ctx, await conduire(ctx, appliquer(ctx, arret, decision, arret.etat)));
    }
    return aLaFin(ctx, await conduire(ctx, await trancher(ctx, arret, ctx.reponse)));
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    process.stderr.write(
      `usage: circuit.mjs <ticket> [--reprendre] [--depuis <testwriter|developpeur> <composant>] [--contexte <texte>] | --reponse <texte>\n⛔ ${e.message}\n`
    );
    return CODE_USAGE;
  } finally {
    if (ctx) rmSync(ctx.tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
