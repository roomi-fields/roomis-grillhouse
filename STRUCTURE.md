# Roomi's Grillhouse — structure

This is a complete project template for TypeScript and JavaScript (Node.js) development with best practices for Git, CI/CD, documentation, testing, and deployment.

## Directory Structure

```
roomis-grillhouse/
├── .claude/                    # Claude Code integrations
│   ├── settings.json              # Permissions, plugins, hooks
│   ├── template                   # Marks the template itself (not copied)
│   ├── agents/                    # The roles, each under its locks (scripts/verrous/)
│   │   ├── testeur.md                # Writes a ticket's tests from the spec; writes test files only
│   │   ├── developpeur.md            # Writes the code; no test file, no code before the Architecture section
│   │   ├── relecteur.md              # Reviews the lot adversarially; writes no file
│   │   ├── integrateur.md            # Commits the reviewed lots, the only one to commit; writes no file
│   │   └── arbitre.md                # Settles a design question, or sends it to the owner; writes no file
│   └── skills/                    # Skills, ready from the first session
│       ├── grill/                 # Initialisation & architecture: the grill → charter, architecture, frame, interfaces
│       │   └── references/           # releve-structurel (the structural survey brief)
│       ├── pitmaster/             # The supervisor: tickets, role agents, closures, the frame
│       │   └── references/           # cadre, tour, erreurs, consigne-agent
│       ├── testeur/               # The tester's skill
│       ├── developpeur/           # The developer's skill
│       ├── relecteur/             # The reviewer's skill
│       │   └── references/           # edge cases, verification gaps (from BMAD-METHOD, MIT)
│       ├── integrateur/           # The integrator's skill
│       ├── arbitre/               # The arbiter's skill
│       ├── mesure/                # Measurement: measures without lying, proves a guard bites
│       ├── redacteur/             # The writer: human-read documents
│       │   └── references/           # documents-d-un-composant
│       └── release/               # Release automation
│           ├── SKILL.md
│           └── scripts/update-version.cjs
│
├── METACADRE.md                # The meta-frame: the framework's six intentions, how rules are written
├── CLAUDE.md                   # Charter skeleton, filled by the initialisation grill
├── README.md                   # Describes Grillhouse itself (not copied to projects)
├── templates/README.md         # The README a new project starts from
├── pitmaster/SUIVI.md          # Pitmaster follow-up (open questions, last round)
├── scripts/
│   ├── new-project.sh             # npm run new -- <dest> [prefix] (template only, not copied)
│   ├── setup.sh                   # npm run setup: git, Beads tickets, dependencies
│   ├── session-start.sh           # SessionStart hook: what is still empty (per package; exemptions in
│   │                              #   docs/agents/hors-cadre.txt, "<package> <reason>")
│   ├── structure-guard.sh         # UserPromptSubmit hook: a structure decision goes to the grill
│   ├── verrous/verrou.mjs         # The role agents' write locks (tests: tests/unit/verrous.spec.ts)
│   ├── enveloppe/                 # The envelope: an agent sees its component, and the others' interfaces only
│   │   ├── enveloppe.mjs             # bwrap sandbox for one component (tests: tests/unit/enveloppe.spec.ts)
│   │   └── lancer.sh                 # one ticket → one fresh role session in its envelope
│   └── index-interfaces.mjs       # npm run interfaces: docs/agents/index-des-interfaces.md, checked by pretest
│
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
│   ├── setup.ts                   # Test configuration
│   ├── unit/                      # Unit tests
│   │   ├── config.spec.ts
│   │   ├── errors.spec.ts
│   │   └── types.spec.ts
│   └── integration/               # Integration tests
│       └── .gitkeep
│
├── .editorconfig               # Editor configuration
├── .env.example                # Environment template
├── .eslintrc.cjs               # ESLint configuration
├── .gitignore                  # Git ignore patterns
├── .npmignore                  # npm publish ignore
├── .prettierrc                 # Prettier configuration
├── CHANGELOG.md                # Version history
├── CONTRIBUTING.md             # Contribution guide
├── CREDITS.md                  # Credits and acknowledgments
├── LICENSE                     # MIT License
├── STRUCTURE.md                # This file
├── ecosystem.config.cjs        # PM2 daemon configuration (services only)
├── package.json                # npm package manifest
├── tsconfig.json               # TypeScript configuration (allowJs: JS compiles as is)
├── tsconfig.eslint.json        # Lint scope: src/ + tests/
└── vitest.config.ts            # Vitest test configuration
```

## Quick Start

### 1. Create the project

```bash
npm run new -- ~/dev/my-new-project [ticket-prefix]
```

Copies the template (without its caches and this marker), initialises git and the Beads ticket
store, installs the dependencies, and makes the first commit.

Prerequisites: Node.js and Claude Code. Everything else installs by default: `setup` installs
Beads (`bd`) when missing, and the project settings declare the Claude Code plugins
`mattpocock-skills` (grill, TDD, code review, handoff) and `rtfm` (search index), which Claude
Code offers to install when the project is first opened.

### 2. Open Claude Code in it

The first session sees that the project is not initialised yet (SessionStart hook) and proposes
the **initialisation grill** (skill `grill`). The grill settles, round by round: the project,
its owner, what decides, library or service, the components and their frame, the interfaces, the
architecture, the lexicon, the first chantier. Then it writes `CLAUDE.md`, `docs/ARCHITECTURE.md`,
`docs/CADRE.md`, `docs/INTERFACE.md`, `CONTEXT.md`, the package identity, and opens the first
tickets. Once done, the hook stays silent.

### 3. Work

- A supervision session loads `pitmaster`: it keeps the tickets and hands each one to a fresh
  sub-agent.
- The roles are project agents (`.claude/agents/`): `testeur` writes the tests, `developpeur` the
  code, `relecteur` reviews, `integrateur` commits. Each loads its skill and works under its locks.

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

## License

This template is MIT licensed. See [LICENSE](LICENSE).
