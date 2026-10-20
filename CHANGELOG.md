# Changelog

This file lists the notable changes of Roomi's Grillhouse, the frame itself. A project created by `npm run new` receives its own changelog, `templates/CHANGELOG.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/) in 0.x: a change that obliges a project to act raises the minor, a fix the patch. One version covers the frame and its mod: it lives in `.claude/grillhouse/VERSION`, which every project receives with the frame's update, and `mods/grillhouse/.claude-plugin/plugin.json` carries the same. A version is released per lot delivered to the projects, never per commit: its section is dated here and its commit tagged `v<version>` (`CONTRIBUTING.md`, §5). The `version` of `package.json` (1.0.0) is the one a new project starts from, not a version of the frame.

## [Unreleased]

### Fixed

- **A ticket's whole card shows every row of its text while it scrolls**: the card drew a spare row above its rule only once the engine's window had moved, so each arrow shifted every row by one, a row came and went, and the last row of the text fell out of sight. The spare row is now always drawn, and the text takes one row fewer, so the window shows it whole on either of its rows.

## [0.19.0] - 2026-10-20

### Changed

- **A time budget bench or a night test named in a targeted run plays**: in BPScript si61.8, the threshold of a bench raised, `npm test -- <the bench>` played nothing (« No test files found », code 1), since the day's configuration leaves out every `*.budget.test.*` and `*.nuit.test.*`; the proof of the red of the circuit counted the bench a file that does not load and stopped, and the reviewer, who may not run Vitest himself, judged on the night's measure. As Bazel's target tagged `manual`, out of every pattern and built when named, a bench or a night test whose own file `npm test -- <path>` names now plays in its package, under the duration reporter of the day's configuration: a failure of duration under load gives 75, « à repasser », which the circuit's checks play again as before. A directory or a package named still leaves them out, and `npm test` without a path, `npm run verifier` and the integration do not change. The patterns of the day's exclusions live in `scripts/vitest-config/cibles.mjs`, which the base configuration and the night's include read. The charter, the template's commands and the skills of the testeur and the reviewer say so.

### Fixed

- **A ticket's working time counts the steps its circuit leads itself**: in BPScript si61.8, 47 min passed from the owner's go to the close, and the board showed 8 min for the ticket: it counted only the turns of the agents' sessions, and the steps the circuit leads with no agent, the proof of the red, the checks of each component, the final pass (`npm run verifier`), the integration and the queue, 33 min of the 47, counted nowhere. The circuit now writes each of these steps to the register of finished agents at its end, as a session's line (the role `circuit`, its ticket, step and component, its start and end, no tokens), and names the step under way in its state (`mene`); the board counts them, the step under way up to now, in the working time of the ticket, its line, its card, its chantier and the totals of the day and in all, out of the turns of its agents, so that an instant counts once. A line of the circuit is no passage of a role of the flow and shows in no block; the tokens do not change.
- **A test file changed no longer replays the builds and tests of every package depending on its package**: in BPScript (si61.8), one test file of `030-binder` changed made two `npm run verifier` take 33 min of 47; ~14 of them replayed the tests of its whole descent, `900-driver` on the critical path. The build of each package hashed every file of its package (`$TURBO_DEFAULT$`), while its build compiles `src` only. The generated `turbo.json` of a package with a `tsconfig.build.json` now gives its `build` what it reads: the root's build inputs, its `package.json`, its `tsconfig.build.json` and what it extends in the package, `<dir>/**` per directory it includes (a listed file, its directory: `test/fixtures.ts` of the shared test material keeps `test/**`), and the same for each configuration a `tsc` of its `build` script compiles. A package without a `tsconfig.build.json`, whose `build` script runs another command than `tsc` (`vite build`, `node copier.mjs`), whose reads are unknown, or whose configuration the generator cannot read through, keeps Turborepo's default: it never gives a stale cache. The update of the frame regenerates the `turbo.json` of each package; the project has nothing to do.
- **A submodule no longer keeps the tests out of the cache in every copy**: in BPScript (si61.8), the root `test:vitest` hashed `$TURBO_ROOT$/vendor/bp3-engine/**`, whose `.git`, in a copy, is a file naming that copy: each new copy changed the hash of every test, and the cache never served. Beside each input of the root's `turbo.json` (any task, or a global dependency) and of a package's that can reach the `.git` of a submodule `.gitmodules` declares, the update of the frame now writes its exclusion, `!$TURBO_ROOT$/<path>/.git`, the rest of the root's file kept; `grillhouse:gardes` refuses a root input still lacking it. The project has nothing to do.

## [0.18.3] - 2026-10-20

### Fixed

- **A red night's alert stands whole on its line**: « La nuit est rouge depuis la nuit du 2026-10-16 » passed the 52 columns of the board, which cut its date. The alert now reads « Nuit rouge depuis le 16/10 ».

## [0.18.2] - 2026-10-20

### Fixed

- **A red night's alert gives the night it turned red, never a commit**: since 0.16, the night names the night in the title of the ticket it opens, but a ticket opened before kept its title, « La nuit est rouge depuis 839dbb0 », and the board's alert showed that commit. The board now writes the alert of a red night from the date its ticket was opened, the night's date, whatever its title names.

## [0.18.1] - 2026-10-19

### Fixed

- **A file that vanishes while a guard walks the repository no longer stops the guard**: `npm run verifier` plays the guards beside the tests, and Vite writes then removes `vitest.config.ts.timestamp-<n>-<hash>.mjs` beside a configuration of Vitest; in BPScript 320.2.4.5.1 the guard of the consumers listed that file, read it once it was gone, and stopped on ENOENT: the final pass was red without a fault, green again at the next one. The guards that walk the repository (the consumers, the faults of the interfaces, the data a package declares) now share one walk, `parcourir` of `scripts/consommateurs.mjs`, which passes over a file or a directory gone before it reaches it, reads a file listed tolerantly, and never lists Vite's temporary files.
- **`--depuis <étape> <composant>` plays in full the components after it that the circuit has not reached yet**: in BPScript 320.2.4.5.1 the proof of the first component stopped; `RELANCE --depuis developpeur spec` then played only the checks of the nine components after it, never worked, and the reviewer sent the lot back: a whole pass lost. The state now keeps `atteint`, the last component the circuit has carried to green checks; a component after the one `--depuis` names plays its checks when the circuit has reached it, else its whole circuit, testeur, proof, developer and checks. The same rule holds for a RENDU of the reviewer and for a developer's sending to a tester.

### Changed

- **A question of the chef de chantier goes up to the supervisor**: on `MONTE`, the circuit wrote « question du chef de chantier au responsable »; both questions of BPScript 320.2.4.5.1 were the supervisor's. The circuit, its header, the README, the skills of the supervisor and of the chef and the chef's instructions now say that the question goes to the supervisor, who answers himself what is his (the frame of the ticket, an arbitrage) and carries to the owner the functional and what the charter keeps for him; `--reponse` gives the chef the supervisor's answer, which may carry the owner's.
- **A changed type migrates at once the shared test material that reads it**: in BPScript 320.2.4.5.1 a type changed in 000-forms broke the shared test material, which only the tester writes, and the developers of the components after it ran on that red for nothing. The tester's skill and first instruction now say that, when the ticket changes a type or a name of its component, the tester migrates in the same session the shared test material that reads it; the tests of the components after it, out of its envelope, go to their own tester.
- **The ticket's Architecture settles the consumers it names**: the guard `scripts/consommateurs-arbitres.mjs` asked a settled « ## Arbitrage » comment for each new line of « ## Consommateurs », even for names the section « ## Architecture » of the ticket, born of the owner's word, already fixed: in BPScript 320.2.4.5.1 two questions went to the supervisor for nothing. A new line now passes too when the ticket's Architecture (its description, `bd show <ticket> --json`, from `## Architecture` to the next heading of its level) names its consumer and each name it declares, word for word, `*` between backquotes.

## [0.18.0] - 2026-10-19

### Fixed

- **A verdict is the reviewer's comment, never an agent's handover that opens on RENDU**: the circuit and the integration took for a verdict any comment whose first word was ACCEPTÉ or RENDU; in BPScript 320.2.4.5.1 a developer's handovers began with « RENDU 000-forms … », the circuit counted four reviews instead of two and stopped at « relecture-arret ». Each comment at the ticket now carries its author: the circuit launches each session with `BEADS_ACTOR` naming its role (`testeur <composant>`, `developpeur <composant>`, `relecteur`, `chef-de-chantier`), which the envelope passes on, writes its own lines as `circuit` and the reviewer's verdict as `relecteur`; a verdict is a comment of the author `relecteur` whose first word is ACCEPTÉ or RENDU, in the circuit, the integration and the board. The rights of every session refuse bd's `--actor`, `-a`/`--author` and the variable `BEADS_ACTOR`, so that no agent changes its author. A project installs this version between two tickets: the verdicts of a ticket in progress were written without the author `relecteur`.

### Changed

- **A red the developer leaves in a component's tests goes straight to its tester**: a change of type broke the existing tests of a component; the developer, who writes no test, was relaunched up to three times on that red, then the circuit stopped at « sans-livraison » and the chef de chantier relaunched the tester. The developer's handover may now carry the line `Agent : testeur <composant>`, a component of the title already played or its own: the circuit plays that component again from its tester, the handover as its report, then the components after it, as a chef's `RELANCE --depuis testeur <composant>`, without relaunching the developer nor stopping. The same sending twice in a row without green checks between them stops at « sans-livraison », for the chef.
- **A test the tester adapts carries its « vert attendu » from its first session**: nine tester sessions only added the lines « vert attendu » for existing tests rewritten to a changed type, green by nature on the present code. The tester's skill and instruction now say that such a test carries its line `vert attendu : <test> — <raison>` in the first handover.
- **A component without tests goes straight to its developer**: a component of documentation alone saw three tester sessions without a test, then a stop at « preuve » and a chef. A component no package with a script `test:vitest` lies in or holds (the rule by which `npm test -- <chemin>` refuses a path) now skips the tester and the proof: the circuit writes `Circuit · <composant> · testeur : aucun test …` at the ticket and launches its developer, then its checks.

## [0.17.4] - 2026-10-19

### Fixed

- **A circuit's line on the board shows its ticket's working time and tokens again**: since 0.16.5, a ticket in a circuit stands on one line, which showed only where the circuit is, or its stop; the time and tokens its agents spent, which its line under the running role carried before, were gone. The line now shows them after its step or its stop, as every other ticket's line does.

## [0.17.3] - 2026-10-19

### Changed

- **An answer of the chef de chantier in no form of decision is asked again once**: the circuit ended on its stop and woke the supervisor, who then did the chef's work. It now resumes the chef's session once, with its whole context, asking for its decision in one of its forms; only a second answer in no form ends the circuit on its stop. A session in error is not asked again.

## [0.17.2] - 2026-10-19

### Fixed

- **The chef de chantier's decision may follow its reasoning**: the circuit read the decision from the first line of the chef's answer only, and a chef that wrote its reasoning first, then `RELANCE --reprendre` and its `CONTEXTE`, ended the circuit on its stop, « sa réponse ne suit aucune forme de décision ». The circuit now reads the last line in a form of decision, with the `CONTEXTE` line after it, the reasoning before it left out; the chef's skill and instruction say the decision ends the answer.

## [0.17.1] - 2026-10-19

### Changed

- **The chef de chantier's CONTEXTE speaks to the one agent it relaunches**: a chef relaunched the developer of one package with a context that also planned the work of the next package, which that developer cannot write. The chef's skill now says that the context carries only what the relaunched agent does in its component; work for another component goes to the ticket, in the chef's arbitration, where that component's agent reads it.

## [0.17.0] - 2026-10-19

### Changed

- **The circuit settles its own stops with a chef de chantier session**: on a stop other than 0 and 75, the supervisor launched a chef de chantier subagent, which relaunched the circuit in the background and stayed parked until its end; each relaunch woke the supervisor with a notice that the chef waited on its own work. The circuit now launches the chef itself, as it launches the reviewer: the chef's final answer is its decision (`RELANCE --reprendre`, `RELANCE --depuis <testeur|developpeur> <composant>` with an optional `CONTEXTE :` line, or `MONTE : <question>`), which the circuit writes at the ticket and applies in the same process. A question ends the circuit on the new stop `question` (18), the chef's session kept; `circuit.mjs <ticket> --reponse "<texte>"` resumes that session with the owner's answer. An unreadable decision, or a chef session in error, ends on the original stop; the stop that comes back after three RELANCE in a row ends the circuit. The supervisor launches the circuit once and is woken only by the end of the lot, a question, or a stop the chef did not settle; the board shows the circuit in block 0 while the chef decides, and the question at the head of its card. A project updates its supervisor's habits: no chef subagent any more, `--reponse` after the owner's answer.

## [0.16.5] - 2026-10-18

### Changed

- **A circuit's ticket stands on one line of the board, in its role's block**: it was drawn under « circuits » on its line, a second line for its step, a third for a stop's reason, and again under the role that ran in it. It now stands once, in the block of its step's role (the testeur's for the tests and their proof, the developer's for the code and the checks, the reviewer's for the review and the integration) with its step, attempt and component, or, stopped, in the site manager's with its stop and code; the reason of a stop opens its card.

## [0.16.4] - 2026-10-18

### Fixed

- **A finding addressed to the root component reaches it**: the line `Agent : developpeur .` lost its `.` with the punctuation that ends the line, and the circuit stopped at « relecture-arret » on a finding with no recipient. The root `.` is now kept.

## [0.16.3] - 2026-10-18

### Fixed

- **A resumed developpeur whose lot is delivered goes on to the checks**: after a stop at the developpeur's step, `--reprendre` launched it again, and a session that found its lot complete changed nothing and stopped the circuit at « sans-livraison ». The first session of a resumption, on a component that already holds changes, now goes on to the checks, which judge the lot.
- **Every read of bd has room for a long ticket**: the circuit's reads were fixed in 0.16.1, but the guard of the arbitrated consumers, the queue, the integration, the write locks, the one-commit-per-ticket hook and the board still read bd within the 1 MiB a child process returns by default; past it, the guard of the arbitrated consumers failed in the final pass. Every call of bd now gives its output 256 MiB, and a test refuses one that does not.

## [0.16.2] - 2026-10-18

### Fixed

- **`/grillhouse` answers at once on a large project**: the command waited for the board's measure, some seconds on a large project, twice when a refresh was running; past the 10 s a hook is given, Claude Code skipped it and printed « no command.run hook answered it ». The command now opens the pane and answers, and the board is measured behind it.

## [0.16.1] - 2026-10-18

### Fixed

- **The circuit reads the comments of a long ticket**: past 1 MiB, the read of the ticket's comments failed in silence, and the circuit saw no handover after a session that wrote one (« sans-passation »); it now reads up to 256 MiB, and a failed read stops the circuit with bd's message.
- **The proof's comment at the ticket stays short**: it holds the reds and what refuses the proof; the justified greens and their reasons, which made a comment of about 100 KB on a lot of 300 tests, go to the whole report, `.claude/worktrees/<ticket>.preuve-<n>.md`, which the comment names. The developpeur's instruction receives the same short text.

## [0.16.0] - 2026-10-18

### Added

- **The meta-frame and the common charter**: `METACADRE.md` states the six intentions every rule serves and how a rule is written; `.claude/grillhouse/charte.md` holds the rules shared by every project, which each project's `CLAUDE.md` imports.
- **The grill**: the `grill` skill initialises a project (structural survey, owner's decisions, charter, architecture, frame, interfaces, lexicon) and settles every structure decision; a hook sends a structure question to it.
- **The roles**: the supervisor (`pitmaster`), the site manager (role 0), the explorer, the arbiter, the tester, the developer and the reviewer, each a project agent under its write locks (`scripts/verrous/`).
- **The tickets**: Beads holds the tickets; each ticket is created under its mother, carries numbered acceptance criteria and one delivery, and a hook refuses a second commit for a closed ticket.
- **The envelope**: a role agent works in a bubblewrap envelope that shows its component and only the published parts of the others (`scripts/enveloppe/`).
- **The controls**: the boundaries of the code (dependency-cruiser), the written interface against the code (API Extractor, TSDoc), the declared consumers of each interface, dead code (knip), out-of-frame packages, all played by `npm run grillhouse:gardes`.
- **The known debt**: a project records the findings of the controls in `grillhouse-dette.json`; a control then refuses only a new finding.
- **Turborepo**: `npm test` and `npm run verifier` run the build, the controls and the tests through Turborepo and its cache; each package's `turbo.json` is generated, and a package declares the data its tests read and the traces it writes.
- **The verification**: `npm run verifier` plays every control and every test, names each red, and replays at rest a time verdict taken under load (« à repasser »).
- **The integration queue**: the integration commits a lot on its ticket's branch, and a queue brings the branch to main and reads the CI of the commit it pushes (`scripts/integration/`).
- **The circuit**: one command (`scripts/circuit.mjs`) leads each component of a ticket from the tester to the developer, then the reviewer, then the integration; a fresh site manager settles each stop.
- **The night**: `scripts/nuit.sh` plays every suite, the night tests and the time benches, and pushes its green commit to the night branch; a red night opens a ticket that names it.
- **The frame's update**: `npm run grillhouse:maj` brings a project's frame files (`.claude/grillhouse/fichiers.txt`) to Grillhouse's last version, with its hooks, scripts, plugins and generated files.
- **The board and the pane**: `npm run tableau` measures the project's state (chantiers, agents, tickets, working time); the Grillhouse mod shows it in a pane beside the transcript, and the status line shows the chantier in progress.
- **Shared submodules**: a working copy reads a submodule of the main repository, read-only (`grillhouse.partage`).
- **The version of the frame**: one version for the frame and its mod, in `.claude/grillhouse/VERSION`, which each project receives, so it knows the version it has; the mod's `plugin.json` carries the same, and a test refuses a gap. The report of `npm run grillhouse:maj` names it (« Cadre 0.16.0 (commit …) »). Grillhouse's release (`scripts/sortie.mjs`, Grillhouse's own) raises it, dates this changelog and tags the release commit locally.

### Changed

- **The tests run under Turborepo**: the home-made cache of suites and builds and its launcher are gone.
- **A realisation ticket names its components**, provider first, and the circuit launches one agent per component.

### Removed

- **The integrator role**: the circuit launches the reviewer and integrates the lot.

### Fixed

- **The package.json of the shared test material is the tester's**: the tester's skill gave every `package.json` to the developer, whom the lock refuses in that package; it now says what the lock does, the material's package whole to the tester, another package's `package.json` to the developer.
- **The report of the checks names where they played**: the final pass reads « hors enveloppe, sur la copie entière », a component's checks name their component and their scope, so a developer no longer takes a real red for an envelope's.
- **The site manager runs the circuit as it is**: its skill prescribes the command alone, without redirection or chained `echo`, so the task ends on the circuit's own code.
