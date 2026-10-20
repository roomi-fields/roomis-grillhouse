# Roomi's Grillhouse — structure

This is a complete project template for TypeScript and JavaScript (Node.js) development with best practices for Git, CI/CD, documentation, testing, and deployment.

## Directory Structure

```
roomis-grillhouse/
├── .claude/                    # Claude Code integrations
│   ├── settings.json              # Permissions, plugins, hooks
│   ├── template                   # Marks the template itself (not copied)
│   ├── grillhouse/charte.md       # The common charter: the frame's rules, the same in every project
│   ├── grillhouse/fichiers.txt    # The frame's files, copied as they are by npm run grillhouse:maj; its « - » lines (the frame's own tests among them): what a project never receives
│   ├── grillhouse/VERSION         # The version of the frame and its mod, one line, which every project receives; mods/grillhouse/.claude-plugin/plugin.json carries the same (tests/unit/version.spec.ts)
│   ├── agents/                    # The roles, each under its locks (scripts/verrous/)
│   │   ├── testeur.md                # Writes a ticket's tests from the spec; writes test files and the shared test material only
│   │   ├── developpeur.md            # Writes the code; no test file, no code before the Architecture section
│   │   ├── relecteur.md              # Reviews the lot adversarially; writes no file
│   │   ├── referent-technique.md     # Settles a design question, or sends it to the owner; writes no file
│   │   ├── regulateur.md             # Settles a stop of a ticket's circuit in its final answer; writes no file
│   │   └── explorateur.md            # Runs an exploration: survey, decisions, proposed tickets; writes no file
│   └── skills/                    # Skills, ready from the first session
│       ├── grill/                 # Initialisation & architecture: the grill → charter, architecture, frame, interfaces
│       │   └── references/           # releve-structurel (the structural survey brief)
│       ├── pitmaster/             # The supervisor: tickets, role agents, closures, the frame
│       │   └── references/           # cadre, tour, erreurs, consigne-agent
│       ├── testeur/               # The tester's skill
│       ├── developpeur/           # The developer's skill
│       ├── relecteur/             # The reviewer's skill
│       │   └── references/           # edge cases, verification gaps (from BMAD-METHOD, MIT)
│       ├── referent-technique/    # The technical referent's skill
│       ├── regulateur/            # The regulator's skill
│       ├── explorateur/           # The explorer's skill
│       ├── mesure/                # Measurement: measures without lying, proves a guard bites
│       ├── redacteur/             # The writer: human-read documents
│       │   └── references/           # documents-d-un-composant
│       └── release/               # Release automation
│           ├── SKILL.md
│           └── scripts/update-version.cjs
│
├── METACADRE.md                # The meta-frame: the framework's six intentions, how rules are written
├── CLAUDE.md                   # The project's charter, filled by the initialisation grill; imports the common one
├── README.md                   # Describes Grillhouse itself (not copied to projects)
├── templates/                  # The models a new project receives in place of Grillhouse's own files, at the same path:
│   ├── README.md                  # its README
│   ├── CHANGELOG.md               # its changelog
│   ├── CONTRIBUTING.md            # its contributing guide
│   ├── CREDITS.md                 # its credits
│   └── pitmaster/SUIVI.md         # its supervisor's follow-up, empty
├── templates/turbo/            # The templates of a project's turbo.json, one per form (sans-paquets.json, paquets.json): grillhouse-maj writes the one of its form when the project has none; in a repository of packages, each package's generated turbo.json (scripts/turbo-des-paquets.mjs) replaces the root's build dependencies with its runtime ones
├── pitmaster/SUIVI.md          # Grillhouse's pitmaster follow-up (open questions, last round; not copied to projects)
├── scripts/
│   ├── new-project.sh             # npm run new -- <dest> [prefix] (template only, not copied)
│   ├── sortie.mjs                 # Grillhouse's release (CONTRIBUTING.md, §5): VERSION and plugin.json raised, CHANGELOG.md dated, then the tag v<version> on the release commit, locally; never pushes (Grillhouse only, not copied)
│   ├── setup.sh                   # npm run setup: git, Beads tickets, the frame's git hooks (crochets.mjs), the frame's plugins (greffons.mjs), dependencies
│   ├── session-start.sh           # SessionStart hook: what is still empty (per package in the frame); the lock of the supervisor (superviseur.mjs)
│   ├── structure-guard.sh         # UserPromptSubmit hook: a structure decision goes to the grill
│   ├── verrous/verrou.mjs         # The role agents' write locks (tests: tests/unit/verrous.spec.ts)
│   ├── verrous/ticket-du-sous-agent.mjs # hook: a role agent launches with « TON TICKET : <id> »
│   ├── enveloppe/                 # The envelope: an agent sees its component, the others' interfaces, the test material, what its tests declare they read
│   │   ├── enveloppe.mjs             # bwrap sandbox for one component (tests: tests/unit/enveloppe*.spec.ts)
│   │   ├── codes.mjs                 # the exit codes of the envelope and its launcher
│   │   ├── composant.mjs             # GRILLHOUSE_ENVELOPPE, the component the envelope names: npm test and npm run api build and write it alone
│   │   └── lancer.sh                 # one ticket → one fresh role session in its envelope, its providers and the traces its tests read produced first, its instruction followed by what its providers publish; each session added to the ticket's log under its header line, its exit code in .claude/worktrees/<ticket>.fin
│   ├── circuit.mjs                # the circuit of one ticket, component by component in the order of its title: testeur, proof of the red (the lot's tests played, a green justified by « vert attendu »), developpeur, checks (what is done up to the component, guards in its envelope; after the last one the final pass, a red sent to the developpeur of the component that owns it), then the reviewer out of the envelope (RENDU: the agent each finding names, « Agent : <rôle> <composant> », plays again, three reviews at most), then on ACCEPTÉ the integration (the lot built from the copy, integrer.mjs), then the queue, and ends on the state of the ticket it leaves; writes each instruction from consigne-agent.md, stops a session whose transcript stands still 20 min, relaunches a session without handover once; state in .claude/worktrees/<ticket>.circuit.json, one comment « Circuit · … » per step, --reprendre, --depuis <testeur|developpeur> <component> for a lot corrected by one component; on a stop other than 0 and 75 it launches the regulator's session itself and applies its decision (RELANCE, or MONTE: the stop « question », the session kept, --reponse resumes it)
│   ├── etapes.mjs                 # the ten numbered steps of a ticket, the automatic ones included: number, title, who works there, per component or once; the circuit, the board and the tests read it
│   ├── dette.mjs                  # the known debt of the guards: grillhouse-dette.json (guard, file, rule → count); a guard passes within the counts, refuses a new finding or a count beyond, reports a count below
│   ├── code-mort.mjs              # grillhouse:gardes: refuses dead code, measured by knip (knip.json); tests and benches count for dependency use only; the frame's scripts (fichiers.txt) are knip entries, judged in Grillhouse
│   ├── consommateurs.mjs          # grillhouse:gardes: refuses an import that the provider's INTERFACE.md does not declare, and two components of the same name
│   │                              #   composants(): the components for every check, minus the packages out of
│   │                              #   the frame listed in docs/agents/hors-cadre.txt, "<package> <reason>"; such a package stays a
│   │                              #   workspace, and Turborepo plays none of its tasks (turbo-des-paquets.mjs)
│   │                              #   parcourir(): the walk of every guard, Vite's temporary files left out, a file gone meanwhile passed over
│   ├── consommateurs-arbitres.mjs # grillhouse:gardes: a Consommateurs line a lot changes enters with a settled arbitrage at its ticket naming the consumer, or named, consumer and names, by the ticket's Architecture
│   ├── crochets.mjs               # the frame's git hooks (commit-msg, pre-push): placed by setup.sh and grillhouse:maj, absent ones named by the session start
│   ├── greffons.mjs               # the frame's plugins (those `.claude/settings.json` enables): installed for the project by setup.sh and grillhouse:maj, absent ones named by the session start
│   ├── gardes-du-cadre.mjs        # npm run grillhouse:gardes: the frame's guards, the one list of them (GARDES_DU_CADRE), each played whatever the verdict of the ones before; each red named, code 1 when one is red
│   ├── frontieres.mjs             # grillhouse:gardes: dependency-cruiser (after the build, which it reads), rules generated in .dependency-cruiser.cjs
│   ├── interfaces-contre-code.mjs # grillhouse:gardes: the TSDoc contract of each export (rubrics, tsdoc.json) and the generated part
│   │                              #   of INTERFACE.md between its two marks; npm run api writes the reports and the parts
│   │                              #   (a package without a « . » export, the shared test material, has no API to check)
│   │                              #   (in an envelope, its component alone: tests/unit/commandes-en-enveloppe.spec.ts)
│   ├── resumes.mjs                # grillhouse:gardes: the first sentence of each published element's summary holds in 80 characters, refused at its INTERFACE.md § element
│   ├── nuit.sh                    # once a night, the full pass played for real (npm run verifier -- --force: Turborepo's build, guards and tests, no log replayed), then the night tests and budget benches, then the project's night script (`grillhouse.nuit`), and pushes the green commit (`grillhouse.poussee.nuit`)
│   │                              #   (*.nuit.test.*, *.nuit.spec.*, *.budget.test.*, *.budget.spec.*); a red opens a ticket;
│   │                              #   « à repasser » (75: benches played once more at rest, then still under load) opens nothing and keeps the last green
│   ├── vitest-config/             # the package @grillhouse/vitest-config (private, `exports` to base.mjs and ./mesure, each typed by its .d.ts): the frame's base Vitest configuration of the day, which every day configuration extends (mergeConfig): night tests and budget benches excluded, the common environment, the one address of git's settings for the suite (automatic maintenance off), the plugin that restricts a run to the tests GRILLHOUSE_TESTS names (cibles.mjs)
│   │                              #   the measure of time at rest: pression.mjs (the CPU pressure, /proc/pressure/cpu some avg10, threshold 25 %, code 75; `attendre`), mesure.setup.mjs (the pressure noted at the start and end of each test),
│   │                              #   duree.reporter.mjs (75, « à repasser », when every failure depends on a duration and one took place under load), mesure.mjs (mesurerAuRepos, the mark of a measure of time; a file that imports it is a time witness, which verifier plays alone),
│   │                              #   machine.setup.mjs (each test file a lock of the heavy measure of its own)
│   │                              #   a package of a project imports it by its name and declares it in its devDependencies; grillhouse-maj makes the directory a workspace; a repository without packages imports base.mjs by its path
│   ├── vitest.nuit.config.mjs     # the Vitest configuration of the night tests, played by nuit.sh; git's settings, its setup file and its duration reporter read from vitest-config/base.mjs
│   ├── sous-modules.sh            # the submodules of a working copy (integration, agent, night) at HEAD, or shared read-only (grillhouse.partage)
│   ├── branche-de-nuit.mjs        # pre-push guard: only the night pushes the branch of grillhouse.poussee.nuit
│   ├── poussee-cles.mjs           # reads the grillhouse.poussee, .nuit and .commit keys of package.json for nuit.sh, the guard and the queue
│   ├── retirer-copie.sh           # removes a working copy, submodules included (local work already entered on main does not hold it) (agent, integration, night)
│   ├── grillhouse-maj.mjs         # npm run grillhouse:maj: the frame brought to the last commit of Grillhouse, its version (.claude/grillhouse/VERSION) named in the report (files, git hooks, the frame's plugins, scripts — test, test:vitest, test:forcer, verifier —, turbo.json written from the template of its form when absent, the frame's devDependencies, Turborepo's among them, packageManager, .turbo/ ignored, then the generated `.dependency-cruiser.cjs`, interfaces index and packages' turbo.json regenerated, a failing generator named; in a repository of packages, scripts/vitest-config made a workspace and @grillhouse/vitest-config declared in the devDependencies of each package of the frame with a test:vitest); the project's copy runs the source's script, whose modules are the source's; --ecarts; any other option refused
│   ├── turbo-des-paquets.mjs      # grillhouse:gardes: refuses a package's turbo.json absent or stale, and a guard task of the root's turbo.json (grillhouse:gardes, gardes) absent or whose dependsOn is not the build of each package of the frame, and a root test:vitest whose env lacks GRILLHOUSE_TESTS (the variable of the targeted runs); --ecrire writes them (a package's extends the root's, its build waits for the build of its runtime dependencies only: dependencies, peerDependencies, optionalDependencies; its test:vitest hashes the paths of data (directories or files) its package.json declares, `grillhouse.lit`, and waits for the traces that write them; each trace it declares, `grillhouse.traces`, is a cached task writing a directory of the package git ignores; the build of the package holding declared data leaves them out; a build with a tsconfig.build.json hashes what it reads, its package.json, its configurations and the directories they include, when its build script runs tsc alone, else every file of its package; beside each input reaching the `.git` of a submodule of .gitmodules, in the root's turbo.json and a package's, its exclusion `!<path>/.git`; the root's guards' dependsOn by jsonc-parser, the rest of the file kept); it refuses a declared path absent or holding code, a trace out of its package, followed or not ignored by git, a trace script and its declaration apart, and in the root's turbo.json a task of one package, a trace task or an input naming a package directory
│   │                              #   a package of docs/agents/hors-cadre.txt has each task of the root excluded ("extends": false), and no dependsOn written names it
│   ├── paquets.mjs                # paquets(): the frame's one list of the packages, the workspaces mapped as npm maps them (a « ! » pattern takes out), each marked out of the frame or not;
│   │                              #   read by grillhouse-maj, turbo-des-paquets and tests; Node alone, as the update runs it from a source that installs no dependency
│   ├── tests.mjs                  # npm test, npm run test:forcer: turbo run test:vitest; each path named from the root plays in the package that holds it (--filter, the path made absolute), a path out of the frame's packages refused;
│   │                              #   a run with paths is one run of the tests with what they depend on, the paths and options in GRILLHOUSE_TESTS (the env of test:vitest: in the hash of the tests alone), the builds and traces replayed from the cache;
│   │                              #   --force puts the moment of the run in the variable (the tests alone played for real); in an envelope, its own package's build and traces (--only), then the tests alone (--only), whose hash sees no neighbour's code
│   ├── verifier.mjs               # npm run verifier, under the lock of the machine: turbo run grillhouse:gardes gardes test:vitest --continue=dependencies-successful --concurrency=<half the cores> --summarize, the time witnesses left out,
│   │                              #   then the witnesses alone (--concurrency=1, one file at a time); the code of each task read in the summary (removed after):
│   │                              #   any code but 0 and 75 is red, named; a task at 75 waits for rest (15 min at most) and plays again (--filter, its dependencies from the cache); the bound reached, 75 « à repasser »
│   ├── verrou-de-machine.mjs      # the lock of the machine for the heavy measure (~/.cache/grillhouse/mesure-lourde.lock), shared by every repository: taken by verifier.mjs and the heavy passes of circuit.mjs
│   ├── superviseur.mjs            # one supervisor per project: the session start takes the lock of the repository; a second session is told who holds it
│   ├── tableau.mjs                # npm run tableau: the board on three levels (project, agents, chantier)
│   ├── ligne-etat/                # the status line: the person's own on the left, the chantier on the right
│   ├── verrou-de-fichier.mjs      # the lock of a file shared between processes (judged by the owner's process or by age); taken by integrer.mjs, file.mjs, registre.mjs, verrou-de-machine.mjs and superviseur.mjs
│   ├── registre.mjs               # hook: one line per finished agent (ticket, role, time, tokens)
│   ├── bilan.mjs                  # the bilan of a ticket, written by the circuit at each end: wall time by category (work kept, relaunch without effect, regulator, wait, automatic steps, replay, between steps), sessions, stops, tokens, cost, against the project's bilan before
│   ├── integration/               # One delivery, in a clean copy: verdicts, lots, npm run verifier green, commit on agent/<ticket>; then the queue brings it onto main
│   │   ├── integrer.mjs              # run by the circuit on ACCEPTÉ: commits the lot on agent/<ticket>, labels the ticket en-file, puts the branch in the queue (tests: tests/unit/integrer*.spec.ts)
│   │   ├── file.mjs                  # the queue: brings the branches onto main one at a time, replaced and replayed when main moved, pushes main, then reads the CI of the commit pushed (gh: a red CI reopens the ticket) (tests: tests/unit/file-integration*.spec.ts)
│   │   ├── rejeu.mjs                 # the replay shared by integrer.mjs and file.mjs: clean copy, dependencies of its lock file, npm run verifier (Turborepo: build, then guards and tests); a 75 keeps the lot waiting
│   │   └── file-attente.mjs          # the queue's entries (a branch and its one ticket each), in git's common directory, and the directory the integration's locks live in
│   ├── index-interfaces.mjs       # npm run interfaces: docs/agents/index-des-interfaces.md from the generated parts, checked by grillhouse:gardes; --publie <composant>: what its providers publish (each provider's line, the names of the elements declared for it, the address of its CADRE.md « Rend »), for the launcher
│   └── un-commit-par-ticket.mjs   # commit-msg hook (placed by crochets.mjs): a closed ticket refuses a second commit, a reopened ticket takes its corrections
│
├── mods/grillhouse/            # The Grillhouse mod (grillhouse@roomi-fields): the /grillhouse pane, the
│                              #   lines of scripts/tableau.mjs; tests: npm run mod:test
├── .github/                    # GitHub integrations
│   ├── workflows/                 # CI/CD workflows
│   │   ├── ci.yml                    # Continuous Integration
│   │   └── release.yml               # Release automation
│   ├── ISSUE_TEMPLATE/            # Issue templates
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── PULL_REQUEST_TEMPLATE.md   # PR template
│   └── FUNDING.yml                # Sponsorship config
│
├── deployment/                 # Deployment resources (services only)
│   ├── README.md                  # Deployment overview
│   ├── docs/                      # Detailed guides
│   │   ├── 01-INSTALL.md
│   │   ├── 02-CONFIGURATION.md
│   │   ├── 03-API.md
│   │   └── 04-TROUBLESHOOTING.md
│   └── scripts/                   # Deployment scripts
│       ├── install.ps1
│       ├── start.ps1
│       ├── stop.ps1
│       └── test.ps1
│
├── docs/                       # Documentation
│   ├── agents/issue-tracker.md    # Beads conventions the skills follow
│   └── (ARCHITECTURE, CADRE, INTERFACE .md — written by the initialisation grill)
│
├── logs/                       # Log files (gitignored)
│   └── .gitkeep
│
├── src/                        # Source code
│   ├── index.ts                   # Main entry point
│   ├── config.ts                  # Configuration management
│   ├── errors.ts                  # Custom error classes
│   ├── services/                  # Business logic services
│   │   └── .gitkeep
│   ├── types/                     # TypeScript type definitions
│   │   └── index.ts
│   └── utils/                     # Utility functions
│       ├── index.ts
│       └── logger.ts
│
├── tests/                      # Test files
│   ├── *.ts                       # The frame's test material (claude-substitut, config-git, machine): Grillhouse only, not copied
│   ├── unit/                      # Unit tests
│   │   ├── config.spec.ts            # the example's tests, copied with src/ to a new project
│   │   ├── errors.spec.ts
│   │   ├── types.spec.ts
│   │   └── …                         # the frame's own tests and their material (*-essai.ts): Grillhouse only, not copied
│   └── integration/               # Integration tests
│       └── .gitkeep
│
├── .editorconfig               # Editor configuration
├── .env.example                # Environment template
├── .eslintrc.cjs               # ESLint configuration
├── .gitignore                  # Git ignore patterns
├── .npmignore                  # npm publish ignore
├── .prettierrc                 # Prettier configuration
├── CHANGELOG.md                # Grillhouse's version history (not copied to projects)
├── CONTRIBUTING.md             # How a change reaches the frame (not copied to projects)
├── CREDITS.md                  # Grillhouse's author and what the frame takes from others (not copied to projects)
├── LICENSE                     # MIT License
├── STRUCTURE.md                # This file
├── ecosystem.config.cjs        # PM2 daemon configuration (services only)
├── package.json                # npm package manifest
├── tsdoc.json                  # TSDoc configuration of the frame (the @faute tag), read for every component
├── turbo.json                  # the repository's own Turborepo tasks (templates/turbo/sans-paquets.json): build (dist/), grillhouse:gardes, gardes (the project's own guards) and test:vitest beside each other after it; npm test runs the tests, npm run verifier the guards and the tests, the cache in the main tree's .turbo/cache
├── tsconfig.json               # TypeScript configuration (allowJs: JS compiles as is)
├── tsconfig.eslint.json        # Lint scope: src/ + tests/
└── vitest.config.ts            # Vitest test configuration of the day: npm test; extends scripts/vitest-config/base.mjs by its path (night tests and budget benches left out, common environment)
```

## Quick Start

### 1. Create the project

```bash
npm run new -- ~/dev/my-new-project [ticket-prefix]
```

Copies the template (without its caches, this marker, nor the frame's own tests and their
material: the « - » lines of `.claude/grillhouse/fichiers.txt`), initialises git and the Beads
ticket store, installs the dependencies, and makes the first commit. The project keeps the example
application (`src/`) and its tests (`tests/unit/config.spec.ts`, `errors.spec.ts`,
`types.spec.ts`), which its `npm test` plays.

Prerequisites: Node.js and Claude Code. Everything else installs by default: `setup` installs
Beads (`bd`) when missing, and installs, for the project, the Claude Code plugins the project
settings enable: `mattpocock-skills` (grill, TDD, code review, handoff), `rtfm` (search index) and
`grillhouse` (the board). `grillhouse:maj` installs them too, and a session start names under
« Manque » each one still missing.

### 2. Open Claude Code in it

The first session sees that the project is not initialised yet (SessionStart hook) and proposes
the **initialisation grill** (skill `grill`). The grill settles, round by round: the project,
its owner, what decides, library or service, the components and their frame, the interfaces, the
architecture, the lexicon, the first chantier. Then it writes `CLAUDE.md`, `docs/ARCHITECTURE.md`,
`docs/CADRE.md`, `docs/INTERFACE.md`, `CONTEXT.md`, the package identity, and opens the first
tickets. Once done, the hook stays silent.

### 3. Work

- A supervision session loads `pitmaster`: it keeps the tickets and launches the circuit of each
  one.
- The roles are project agents (`.claude/agents/`): `testeur` writes the tests, `developpeur` the
  code, `relecteur` reviews; the circuit of the ticket (`scripts/circuit.mjs`), which the
  supervisor launches, launches them and commits, and on a stop launches `regulateur`,
  which settles it in its final answer. Each loads its skill
  and works under its locks.

### An existing project

Copy the template files into it, keep its code, run `bash scripts/setup.sh`, open Claude Code: the
`grill` grill describes the existing construction from the code and asks only what the code
does not settle.

## JavaScript Projects

The template accepts `.js`/`.mjs` alongside `.ts`, so a JavaScript project can adopt it
as is and migrate to TypeScript file by file:

- `tsconfig.json` sets `allowJs` (JS compiles to `dist/` with the TS) and `checkJs: false`
  (no type errors on untyped JS; enable it to start typing through JSDoc).
- ESLint applies the shared rules to every file; the TypeScript parser and type-aware rules
  apply to `.ts` only.
- Vitest, Prettier and coverage match `.ts`, `.js` and `.mjs`.
- Tests are written with Vitest (`describe`/`it`/`expect`, or `node:assert` inside `it`).
- A library consumed straight from `src/` needs no build: drop the `build` script and the
  CI skips it (`npm run build --if-present`).

Migrating to TypeScript: rename a file `.js` → `.ts`, add types, keep the `.js` import
specifiers (Node16 resolution), run `npm run typecheck`.

### Service vs Library

`deployment/`, `ecosystem.config.cjs`, `logs/`, `.env.example` and the `daemon:*` scripts
serve long-running services. A library leaves them out.

## Features

### Configuration

- TypeScript with strict mode
- ESLint + Prettier for code quality
- EditorConfig for consistent formatting
- Environment variables with Zod validation

### CI/CD

- GitHub Actions for CI (lint, test, build)
- Automated releases on git tags
- Multi-Node.js version testing

### Documentation

- README with badges
- CHANGELOG following Keep a Changelog
- CONTRIBUTING guide
- API documentation template

### Testing

- Vitest for unit and integration tests (TS and JS)
- Coverage reporting
- Test setup file

### Deployment

- PM2 daemon support
- PowerShell deployment scripts
- Troubleshooting guide

### Claude Code

- Pre-configured permissions and a SessionStart hook
- Initialisation grill on the first session
- Workflow skills: supervision, development, measurement, writing, release
- Beads ticket store, set up by `npm run setup`

## Customization Guide

### Adding Dependencies

```bash
# Runtime dependency
npm install package-name

# Dev dependency
npm install -D package-name
```

### Adding npm Scripts

Edit `package.json`:

```json
{
  "scripts": {
    "custom": "your-command"
  }
}
```

### Adding GitHub Actions

Create `.github/workflows/your-workflow.yml`

### Adding Claude Skills

1. Create `.claude/skills/skill-name/SKILL.md`
2. Add YAML frontmatter with name and description
3. Write skill instructions in Markdown

### Adding Test Files

Place tests in:

- `tests/unit/` for unit tests
- `tests/integration/` for integration tests

Use the `.spec.ts` (or `.spec.js`) suffix.

## Maintenance

### Updating Dependencies

```bash
# Check outdated
npm outdated

# Update all
npm update

# Update specific
npm install package@latest
```

### Version Release

Use the release skill or:

```bash
npm version patch  # or minor, major
git push origin main --tags
```

Grillhouse itself releases with `scripts/sortie.mjs`, which no project receives: one version for the frame and its mod, in `.claude/grillhouse/VERSION` (`CONTRIBUTING.md`, §5).

## License

This template is MIT licensed. See [LICENSE](LICENSE).
