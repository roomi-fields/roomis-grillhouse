# Roomi's Grillhouse

**An elephant–goldfish framework for building with Claude Code agents.** You create a project, open Claude Code in it, and the session grills you on what the project must be — its goals, the mature products it should measure itself against, its components and their interfaces. It then writes the project's charter and reference documents, opens the first tickets, and runs the work through a supervisor and fresh developer agents, each ticket reviewed before it closes.

The skills speak French.

## The elephant and the goldfish

Grillhouse implements the **Elephant–Goldfish Model**: an agent that holds the context writes, agents that hold none review, and a human settles the trade-offs. Dave Rensin [describes the model](https://medium.com/@drensin/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), and Google open-sourced its own plugin for it, [EGM](https://github.com/google/elephant-goldfish-model). Grillhouse was built on the same principle independently, and applies it to every ticket, from its design to its merge.

| Elephant–Goldfish | Grillhouse |
| --- | --- |
| The elephant holds the context and drafts | The supervisor, and the explorer, which writes the plan of a ticket |
| Goldfish: fresh, read-only reviewers | The questioner (the plan), the reviewer (the lot), each a fresh sub-agent |
| The human approves the design before code | The grill; the owner validates architecture, frame and interfaces |
| Design before implementation | A decision is taken and written in the ticket before any code |
| Not for a small, clear fix | A gesture without new behaviour leaves the circuit of code |
| A drift report between documents and code | Guards hold interfaces and languages against the code at every pass |

Grillhouse carries the model past the design. A fresh agent, the testwriter, writes the tests from the specification before any code. The developer works under write locks, and only on the packages of the plan. The reviewer returns one conformity line per element that the lot adds, changes or removes.

Two practices of EGM are not in Grillhouse yet:

- a design review by several fresh lenses, before the owner validates the design;
- a drift report on the architecture's prose.

Both are planned.

## 1. What it does

| Moment | What happens |
| --- | --- |
| `npx @roomi-fields/grillhouse init <path> [prefix]` | Creates a project from the template of a project, `templates/projet/` (as create-turbo creates one from its example): the example application and its tests, its configurations, its charter and its settings; declares `@roomi-fields/grillhouse` in its devDependencies; prepares git, Beads, CodeGraph, the plugins its settings declare and the git hooks; ends on one commit. A directory that is not empty is refused. |
| Every session start | A hook lists the key elements still empty (arbitration criteria, charter fields, architecture, frame, interfaces, lexicon) and the session proposes to grill them, each with its recommendation. It keeps proposing until they are filled. |
| The grill | Round by round: goals, mature references and domain demands, owner, consumers, data representations, axes of change, components, interfaces, architecture, lexicon, first milestone. A structural survey of the code comes first; nothing is decided on the size of the code. |
| `npm run grillhouse:maj` | Brings the project to the version of `@roomi-fields/grillhouse` it installed (`npm install -D @roomi-fields/grillhouse@<version>` first), as `npx @turbo/codemod migrate` does: the migrations newer than the version the project recorded, then what the frame writes in a project; its report names the version and what stays to the project. |
| `npm run grillhouse:dette:inscrire` | Records the controls' findings of today in `grillhouse-dette.json`, the project's known debt (the bulk suppressions of ESLint): a control then refuses only a new finding or a count beyond. |
| `npm run grillhouse:dette:elaguer` | Lowers the counts of `grillhouse-dette.json` to what the controls find; a count never rises. |
| Every message | A hook sends any structure question (packages, modules, interfaces, boundaries) back to the grill. |
| Daily work | The supervisor keeps the ticket queue, hands each ticket to the circuit, and reviews its closure against the frame. |

The creation and the update of a project: [installation.md](packages/grillhouse/docs/architecture/installation.md), §5.1–5.2; the guards and their debt: [tests.md](packages/grillhouse/docs/architecture/tests.md), §5.5.

**What every rule serves.** `METACADRE.md` (in the frame's plugin, `mods/grillhouse/`) fixes six intentions, and every rule of the framework names the one it serves: a mature, professional product; the architecture decides and the code follows; from the broadest to the most specific; proof before assertion; agents within a frame; the owner settles what matters. It also fixes how a rule is written: positive, short, in the words of whoever decided it, naming its intention.

**How decisions are arbitrated.** Every recommendation answers three questions, in order: what does the mature reference of the domain do (a mature compiler, a professional DAW…); what already exists and can be reused (standards, off-the-shelf tools, the author's own conventions); what does the domain demand (e.g. speed for live coding). The project's answers live in its charter.

## 2. How it is built

Three layers, each with one job:

```
┌─ Claude Code layer
│ .claude/settings.json        plugins (grillhouse, rtfm), permissions
│ .mcp.json                    the CodeGraph server
│ plugin grillhouse            the brigade (below), its role agents under
│                              their write locks, the hooks, the common charter
├─ Project knowledge
│ METACADRE.md (plugin)        the six intentions every rule serves, and how
│                              rules are written (fixed by the framework)
│ charte.md (plugin)           the common charter: the task flow and the
│                              frame's rules, the same in every project
│ CLAUDE.md                    the project's charter: owner, what decides, how
│                              we arbitrate, the commands; imports the common one
│ docs/ARCHITECTURE.md         how it is built, and why (written by the grill)
│ docs/CADRE.md                each component's role and boundary
│ docs/INTERFACE.md            what crosses each boundary, and its guard
│ CONTEXT.md                   the domain lexicon
│ docs/agents/issue-tracker.md ticket conventions
│ .git/grillhouse-reprise.md   the supervisor's note of resumption, never committed
├─ Code tooling
│ packages/grillhouse/         the frame's command, `grillhouse <sous-commande>`,
│                              its scripts and its tests (an npm package)
│ templates/projet/            a new project's src/ tests/: TypeScript or JavaScript
│                              ESLint, Prettier, EditorConfig, tsconfig, GitHub CI and release workflows
│ templates/projet/deployment/, ecosystem.config.cjs, .env.example: services
└──
```

The architecture of Grillhouse is [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); each of its mechanisms has its document under [packages/grillhouse/docs/architecture/](packages/grillhouse/docs/architecture/) (§10 lists them).

**The brigade** — each skill named after its role first:

| Role | Skill | What it does |
| --- | --- | --- |
| Initialisation & architecture | `grill`        | Surveys the code, grills the owner, writes the charter and reference documents.                                                       |
| Supervisor                    | `pitmaster`    | Keeps the tickets, hands each one to a fresh agent, reviews closures, keeps the frame.                                                |
| Testwriter (agent)            | `testwriter`   | Writes a ticket's tests from the spec, before the code; writes test files and the shared test material only.                          |
| Developer (agent)             | `developpeur`  | Makes those tests pass; touches no test nor the shared test material, writes no code before the ticket's Architecture section.        |
| Reviewer (agent)              | `relecteur`    | Reviews the lot adversarially (edge cases, verification gaps, the frame); writes nothing.                                             |
| Questioner (agent)            | `questionneur` | Questions a proposal it did not write (a ticket's plan, the supervisor's), led by the frame, no set list; decides and writes nothing. |
| Explorer (agent)              | `explorateur`  | Writes a ticket's plan at step 1 and answers the questioner once; runs an exploration ticket. Writes no code.                         |
| Direct (agent) | `direct` | Writes the tests and the code of a ticket labelled `direct` together, in a copy of its own; a reviewer judges its lot. |
| Measurement                   | `mesure`       | Measures without fooling itself; proves a guard bites before calling it green.                                                        |
| Writer                        | `redacteur`    | Writes human-read documents (architecture on the arc42/C4 model, frame, interface).                                                   |
| Architect                     | `architecte`   | Keeps the design: instructs a tension with the architecture for the owner, surveys it, brings a document into conformity.             |

**The circuit.** A change of behaviour is one ticket that passes from role to role in its copy: the plan (the explorer writes it, the questioner reads it once), the tests (testwriter), the code (developer), the final pass and the review, then the queue brings it onto main, which closes it. The supervisor launches the ticket's circuit once. The circuit makes the mechanical gestures itself, and ends every other stop on a question for the supervisor, with its piece; he answers by a command of the circuit, and carries to the owner what is his. Each session ends on its sheet, the structured output of its role, and the circuit decides on the sheets and on the tools' reports, never on free text. Each agent runs as a fresh session inside the **envelope** of its plan, a bubblewrap sandbox: it reads the whole copy and writes only the packages its ticket's plan names. The steps, the stops and their answers: [circuit.md](packages/grillhouse/docs/architecture/circuit.md); the envelope, the rights and the locks: [machine.md](packages/grillhouse/docs/architecture/machine.md); the entry on main, the CI and the night: [entree.md](packages/grillhouse/docs/architecture/entree.md).

**The board.** The `grillhouse` plugin, carried by the package `@roomi-fields/grillhouse` and enabled in each project's settings, shows in the `/grillhouse` pane, measured and never declared, three levels: the project (its tickets by state, the agents' time and tokens, the alerts), the agents (the tree of the steps, each ticket at its step, a ticket stopped on a question under its question), and the chantier in progress. `/grillhouse ajouter <chemin>` and `/grillhouse retirer <chemin>` add or remove a project shown beside the session's. Without the plugin, `npm run tableau` prints the same lines; the status line keeps the person's own on the left and shows the chantier in progress on the right. The pane docks beside the transcript in Claude Code's fullscreen layout (`/tui fullscreen`, from 110 columns); the wheel scrolls it only while Claude Code captures the mouse, so `CLAUDE_CODE_DISABLE_MOUSE` stays unset (`CLAUDE_CODE_DISABLE_MOUSE_CLICKS` keeps the wheel). The board, the hooks and the status line: [greffon.md](packages/grillhouse/docs/architecture/greffon.md).

The full file tree is in [STRUCTURE.md](STRUCTURE.md).

## 3. What it builds on

Grillhouse invents as little as possible; it wires together existing tools.

| Tool | Role here |
| --- | --- |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Skills, hooks, plugins, sub-agents: the runtime of the whole workflow. |
| [bubblewrap](https://github.com/containers/bubblewrap) (`bwrap`) | The envelope of each role agent: the whole copy readable, only the packages of its plan writable. Linux only. |
| [Beads](https://github.com/gastownhall/beads) (`bd`) | Git-backed ticket store: the supervisor's queue, handoffs as comments. Installed by `init` when missing. |
| [Matt Pocock's skills](https://github.com/mattpocock/skills) (MIT) | The origin of four skills vendored in the frame's plugin: `grillhouse:grilling`, `grillhouse:domain-modeling`, `grillhouse:codebase-design`, `grillhouse:writing-for-agents`. |
| [Superpowers](https://github.com/obra/superpowers) (MIT) | The origin of the skill `grillhouse:systematic-debugging` vendored in the frame's plugin: the cause of a red test or a defect is found before any fix. |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) (MIT) | The reviewer's edge-case and verification-gap passes, copied with their licence. |
| [RTFM](https://github.com/roomi-fields/rtfm) | Search index over code and docs (MCP), kept in sync by its own hooks. |
| [CodeGraph](https://github.com/colbymchenry/codegraph) | Code knowledge graph (MCP): a symbol's source and its call paths in one query. Installed and indexed by `init`. |
| [TypeScript](https://www.typescriptlang.org/) | Type checking; `allowJs` lets a JavaScript project adopt the template and migrate file by file. |
| [Vitest](https://vitest.dev/) + `@vitest/coverage-v8` | Tests and coverage, for `.ts`, `.js` and `.mjs`; the version the frame requires is `^2.0.0`. |
| [Turborepo](https://turborepo.com/) | The tasks of `npm test` and `npm run verifier`, each replayed from its shared cache ([tests.md](packages/grillhouse/docs/architecture/tests.md), §5.1). |
| [jsonc-parser](https://github.com/microsoft/node-jsonc-parser) | Reads the root’s `turbo.json` (or `turbo.jsonc`) and writes the `dependsOn` of its guard tasks in it, its comments and layout kept. |
| [yaml](https://eemeli.org/yaml/) | Reads and rewrites a project's GitHub workflows where a migration changes them, their comments and layout kept. |
| [ESLint](https://eslint.org/) + [typescript-eslint](https://typescript-eslint.io/), [Prettier](https://prettier.io/), [EditorConfig](https://editorconfig.org/) | Lint and formatting. |
| [GitHub Actions](https://docs.github.com/actions) | CI (format, lint, typecheck, build, test) and release on tags. |
| [zod](https://zod.dev/), [dotenv](https://github.com/motdotla/dotenv), [tsx](https://tsx.is/), [PM2](https://pm2.keymetrics.io/) | Validated configuration, development runner, daemon (services only). |
| [arc42](https://arc42.org/), [C4](https://c4model.com/), [Mermaid](https://mermaid.js.org/) | The model of the architecture documents. |
| [Conventional Commits](https://www.conventionalcommits.org/), [Keep a Changelog](https://keepachangelog.com/), [SemVer](https://semver.org/) | Commits, changelog, versions. |

## 4. Start

```bash
git clone https://github.com/roomi-fields/roomis-grillhouse
cd roomis-grillhouse
npx @roomi-fields/grillhouse init ~/dev/my-project [ticket-prefix]
cd ~/dev/my-project && claude
```

Requirements: Linux with Bubblewrap (`bwrap`, the envelope each role agent runs in: `sudo apt install bubblewrap`), Node.js ≥ 22, git, Claude Code; a session start names Bubblewrap under « Manque » while it is absent. Everything else installs by default: `init` installs Beads and CodeGraph and indexes the code, places the git hooks, and installs the plugins `.claude/settings.json` declares, for the project; a session start names under « Manque » each piece still missing. An existing project adopts Grillhouse by copying the template files into it and running `npm install -D @roomi-fields/grillhouse`, then `npx grillhouse maj` ([installation.md](packages/grillhouse/docs/architecture/installation.md), §5.1). MIT licence.
