# Roomi's Grillhouse

**A ready-to-use project for working with Claude Code.** You create a project, open Claude Code
in it, and the session grills you on what the project must be — its goals, the mature products it
should measure itself against, its components and their interfaces. It then writes the project's
charter and reference documents, opens the first tickets, and runs the work through a supervisor
and fresh developer agents, each ticket reviewed before it closes.

The skills speak French.

## 1. What it does

| Moment | What happens |
|---|---|
| `npm run new -- <path>` | Copies the template, initialises git and the ticket store, installs the dependencies, makes the first commit. |
| Every session start | A hook lists the key elements still empty (arbitration criteria, charter fields, architecture, frame, interfaces, lexicon) and the session proposes to grill them, each with its recommendation. It keeps proposing until they are filled. |
| The grill | Round by round: goals, mature references and domain demands, owner, consumers, data representations, axes of change, components, interfaces, architecture, lexicon, first milestone. A structural survey of the code comes first; nothing is decided on the size of the code. |
| Every message | A hook sends any structure question (packages, modules, interfaces, boundaries) back to the grill. |
| Daily work | The supervisor keeps the ticket queue, hands each ticket to a fresh developer agent, and reviews its closure against the frame. |

**What every rule serves.** `METACADRE.md` fixes six intentions, and every rule of the framework
names the one it serves: a mature, professional product; the architecture decides and the code
follows; from the broadest to the most specific; proof before assertion; agents within a frame;
the owner settles what matters. It also fixes how a rule is written: positive, short, in the words
of whoever decided it, naming its intention.

**How decisions are arbitrated.** Every recommendation answers three questions, in order: what
does the mature reference of the domain do (a mature compiler, a professional DAW…); what already
exists and can be reused (standards, off-the-shelf tools, the author's own conventions); what does
the domain demand (e.g. speed for live coding). The project's answers live in its charter.

## 2. How it is built

Three layers, each with one job:

```
┌─ Claude Code layer ────────────────────────────────────────────────────────────┐
│ .claude/settings.json   plugins (mattpocock-skills, rtfm), hooks, permissions  │
│ .mcp.json               the CodeGraph server                                   │
│ .claude/skills/         the brigade (below)                                    │
│ .claude/agents/         the four roles, each under its write locks             │
│ scripts/session-start.sh  hook: what is still empty → propose the grill        │
│ scripts/structure-guard.sh hook: a structure question → the grill              │
├─ Project knowledge ────────────────────────────────────────────────────────────┤
│ METACADRE.md            the six intentions every rule serves, how rules are    │
│                         written (fixed by the framework)                       │
│ CLAUDE.md               the charter: owner, what decides, how we arbitrate,    │
│                         the task flow, the commands                            │
│ docs/ARCHITECTURE.md    how it is built, and why        (written by the grill) │
│ docs/CADRE.md           each component's role and boundary (R1…)               │
│ docs/INTERFACE.md       what crosses each boundary, and the guard that holds it│
│ CONTEXT.md              the domain lexicon                                     │
│ docs/agents/issue-tracker.md   ticket conventions                              │
│ pitmaster/SUIVI.md      the supervisor's follow-up: open questions, last round │
├─ Code tooling ─────────────────────────────────────────────────────────────────┤
│ src/ tests/             TypeScript or JavaScript, Vitest                       │
│ ESLint, Prettier, EditorConfig, tsconfig, GitHub CI and release workflows      │
│ deployment/ ecosystem.config.cjs .env.example   for services only              │
└────────────────────────────────────────────────────────────────────────────────┘
```

**The brigade** — each skill named after its role first:

| Role | Skill | What it does |
|---|---|---|
| Initialisation & architecture | `grill` | Surveys the code, grills the owner, writes the charter and reference documents. |
| Supervisor | `pitmaster` | Keeps the tickets, hands each one to a fresh agent, reviews closures, keeps the frame. |
| Tester (agent) | `testeur` | Writes a ticket's tests from the spec, before the code; writes test files only. |
| Developer (agent) | `developpeur` | Makes those tests pass; touches no test, writes no code before the ticket's Architecture section. |
| Reviewer (agent) | `relecteur` | Reviews the lot adversarially (edge cases, verification gaps, the frame); writes nothing. |
| Integrator (agent) | `integrateur` | Commits the reviewed lots, tests and code together; the only one to commit. |
| Measurement | `mesure` | Measures without fooling itself; proves a guard bites before calling it green. |
| Writer | `redacteur` | Writes human-read documents (architecture on the arc42/C4 model, frame, interface). |
| Release | `release` | Bumps the version, updates the changelog, tags, publishes. |

A change of behaviour runs as: tests ticket (tester) → code ticket (developer) → review → commit.
The locks are hooks in each agent's definition (`scripts/verrous/`), so an agent cannot aim the
code at its own tests.

The full file tree is in [STRUCTURE.md](STRUCTURE.md).

## 3. What it builds on

Grillhouse invents as little as possible; it wires together existing tools.

| Tool | Role here |
|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Skills, hooks, plugins, sub-agents: the runtime of the whole workflow. |
| [Beads](https://github.com/gastownhall/beads) (`bd`) | Git-backed ticket store: the supervisor's queue, handoffs as comments. Installed by `setup` when missing. |
| [mattpocock-skills](https://github.com/anthropics/claude-plugins-official) | The flow skills: `grilling` / `grill-me`, `tdd`, `code-review`, `handoff`, `domain-modeling`, `codebase-design`, `writing-for-agents`. |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) (MIT) | The reviewer's edge-case and verification-gap passes, copied with their licence. |
| [RTFM](https://github.com/roomi-fields/rtfm) | Search index over code and docs (MCP), kept in sync by its own hooks. |
| [CodeGraph](https://github.com/colbymchenry/codegraph) | Code knowledge graph (MCP): a symbol's source and its call paths in one query. Installed and indexed by `setup`. |
| [TypeScript](https://www.typescriptlang.org/) | Type checking; `allowJs` lets a JavaScript project adopt the template and migrate file by file. |
| [Vitest](https://vitest.dev/) + `@vitest/coverage-v8` | Tests and coverage, for `.ts`, `.js` and `.mjs`. |
| [ESLint](https://eslint.org/) + [typescript-eslint](https://typescript-eslint.io/), [Prettier](https://prettier.io/), [EditorConfig](https://editorconfig.org/) | Lint and formatting. |
| [GitHub Actions](https://docs.github.com/actions) | CI (format, lint, typecheck, build, test) and release on tags. |
| [zod](https://zod.dev/), [dotenv](https://github.com/motdotla/dotenv), [tsx](https://tsx.is/), [PM2](https://pm2.keymetrics.io/) | Validated configuration, development runner, daemon (services only). |
| [arc42](https://arc42.org/), [C4](https://c4model.com/), [Mermaid](https://mermaid.js.org/) | The model of the architecture documents. |
| [Conventional Commits](https://www.conventionalcommits.org/), [Keep a Changelog](https://keepachangelog.com/), [SemVer](https://semver.org/) | Commits, changelog, versions. |

## 4. Start

```bash
git clone https://github.com/roomi-fields/roomis-grillhouse
cd roomis-grillhouse
npm run new -- ~/dev/my-project [ticket-prefix]
cd ~/dev/my-project && claude
```

Requirements: Node.js ≥ 18, git, Claude Code. Everything else installs by default: `setup`
installs Beads and CodeGraph and indexes the code, and Claude Code offers to install the plugins the project declares when you first
open it. An existing project adopts Grillhouse by copying the template files into it and running
`bash scripts/setup.sh`. MIT licence.
