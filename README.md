<!-- grillhouse:start — this block describes the template; `npm run new` removes it -->
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
│ scripts/session-start.sh  hook: what is still empty → propose the grill        │
│ scripts/structure-guard.sh hook: a structure question → the grill              │
├─ Project knowledge ────────────────────────────────────────────────────────────┤
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
| Developer | `grillardin` | Works one ticket: rules cited, test first, review, handoff. |
| Measurement | `thermometre` | Measures without fooling itself; proves a guard bites before calling it green. |
| Writer | `menu` | Writes human-read documents (architecture on the arc42/C4 model, frame, interface). |
| Release | `release` | Bumps the version, updates the changelog, tags, publishes. |

The full file tree is in [STRUCTURE.md](STRUCTURE.md).

## 3. What it builds on

Grillhouse invents as little as possible; it wires together existing tools.

| Tool | Role here |
|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Skills, hooks, plugins, sub-agents: the runtime of the whole workflow. |
| [Beads](https://github.com/gastownhall/beads) (`bd`) | Git-backed ticket store: the supervisor's queue, handoffs as comments. Installed by `setup` when missing. |
| [mattpocock-skills](https://github.com/anthropics/claude-plugins-official) | The flow skills: `grilling` / `grill-me`, `tdd`, `code-review`, `handoff`, `domain-modeling`, `codebase-design`, `writing-for-agents`. |
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

---

*Below: the README every new project starts from.*
<!-- grillhouse:end -->

# Project Name

[![npm version](https://img.shields.io/npm/v/@your-scope/project-name.svg)](https://www.npmjs.com/package/@your-scope/project-name)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@your-scope/project-name.svg)](https://nodejs.org)
[![CI](https://github.com/your-username/project-name/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/project-name/actions/workflows/ci.yml)

A brief description of what this project does and who it's for.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

```bash
# Using npm
npm install @your-scope/project-name

# Using yarn
yarn add @your-scope/project-name

# Using pnpm
pnpm add @your-scope/project-name
```

## Quick Start

```typescript
import { something } from '@your-scope/project-name';

// Example usage
const result = something();
console.log(result);
```

## Usage

### Basic Usage

```typescript
// Basic example
```

### Advanced Usage

```typescript
// Advanced example
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VAR_NAME` | Description | `default` |

### Configuration File

Create a `.config.json` file in your project root:

```json
{
  "option1": "value1",
  "option2": "value2"
}
```

## API Reference

### `functionName(param)`

Description of the function.

**Parameters:**
- `param` (Type): Description

**Returns:**
- `ReturnType`: Description

**Example:**
```typescript
const result = functionName(param);
```

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm, yarn, or pnpm

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/project-name.git
cd project-name

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Run in development mode with watch |
| `npm test` | Run tests |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Dependency 1](link) - Description
- [Dependency 2](link) - Description

## Support

- Create an [Issue](https://github.com/your-username/project-name/issues) for bug reports
- Start a [Discussion](https://github.com/your-username/project-name/discussions) for questions
