# Changelog

This file lists the notable changes of Roomi's Grillhouse, the frame itself. A project created by `npm run new` receives its own changelog, `templates/CHANGELOG.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The frame has no tagged release yet: every change sits under « Unreleased ». The `version` of `package.json` (1.0.0) is the one a new project starts from, not a release of the frame. The Grillhouse mod (`mods/grillhouse`) carries its own version, 0.15.0, in `mods/grillhouse/.claude-plugin/plugin.json`.

## [Unreleased]

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

### Changed

- **The tests run under Turborepo**: the home-made cache of suites and builds and its launcher are gone.
- **A realisation ticket names its components**, provider first, and the circuit launches one agent per component.

### Removed

- **The integrator role**: the circuit launches the reviewer and integrates the lot.
