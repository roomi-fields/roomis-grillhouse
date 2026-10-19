# Changelog

This file lists the notable changes of Roomi's Grillhouse, the frame itself. A project created by `npm run new` receives its own changelog, `templates/CHANGELOG.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/) in 0.x: a change that obliges a project to act raises the minor, a fix the patch. One version covers the frame and its mod: it lives in `.claude/grillhouse/VERSION`, which every project receives with the frame's update, and `mods/grillhouse/.claude-plugin/plugin.json` carries the same. A version is released per lot delivered to the projects, never per commit: its section is dated here and its commit tagged `v<version>` (`CONTRIBUTING.md`, §5). The `version` of `package.json` (1.0.0) is the one a new project starts from, not a version of the frame.

## [Unreleased]

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
