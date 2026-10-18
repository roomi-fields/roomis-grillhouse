# Credits

This file names the author of Roomi's Grillhouse and the work the frame takes from others. A project created by `npm run new` receives its own credits, `templates/CREDITS.md`.

## 1. Author

**roomi-fields** (Roomi), who holds the copyright of the frame under the MIT licence (`LICENSE`) and publishes it at [roomi-fields/roomis-grillhouse](https://github.com/roomi-fields/roomis-grillhouse).

## 2. Material reproduced in the repository

- **BMAD-METHOD** ([bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD), MIT, © 2025 BMad Code, LLC): the reviewer's passes `edge-case-hunter.md`, `deletion-check.md`, `claims-check.md` and `verification-gap.md` come from its `skills/bmad-build/`. `.claude/skills/relecteur/references/SOURCE.md` names the commit and the one change; `LICENSE-MIT`, beside it, reproduces the licence.

## 3. Tools and plugins the frame uses

Each tool below is called by a file of the repository, named on its line. The role each one plays is described in the README, §3.

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)**: skills, agents, hooks and plugins (`.claude/`).
- **[mattpocock-skills](https://github.com/anthropics/claude-plugins-official)**: the flow skills the charter calls, `grilling` and `writing-for-agents` among them (`.claude/settings.json`, `.claude/grillhouse/charte.md`).
- **[RTFM](https://github.com/roomi-fields/rtfm)**: the search index over code and documents (`.claude/settings.json`).
- **[CodeGraph](https://github.com/colbymchenry/codegraph)**: the code knowledge graph (`.mcp.json`, `scripts/setup.sh`).
- **[Beads](https://github.com/gastownhall/beads)** (`bd`): the ticket store (`scripts/setup.sh`, `docs/agents/issue-tracker.md`).
- **[bubblewrap](https://github.com/containers/bubblewrap)** (`bwrap`): the envelope of each role agent (`scripts/enveloppe/enveloppe.mjs`).
- **[Turborepo](https://turborepo.com/)**: the tasks of `npm test` and `npm run verifier` (`turbo.json`, `templates/turbo/`).
- **[Vitest](https://vitest.dev/)** and `@vitest/coverage-v8`: the tests (`vitest.config.ts`, `scripts/vitest-config/`).
- **[API Extractor](https://api-extractor.com/)** and **[TSDoc](https://tsdoc.org/)**: the API report checked against each written interface (`scripts/interfaces-contre-code.mjs`, `tsdoc.json`).
- **[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)**: the boundaries of the code (`scripts/frontieres.mjs`).
- **[knip](https://knip.dev/)**: dead code and unused dependencies (`scripts/code-mort.mjs`).
- **[jsonc-parser](https://github.com/microsoft/node-jsonc-parser)**: reads and writes the root's `turbo.json` with its comments (`scripts/grillhouse-maj.mjs`).
- **[TypeScript](https://www.typescriptlang.org/)**, **[ESLint](https://eslint.org/)** with **[typescript-eslint](https://typescript-eslint.io/)**, **[Prettier](https://prettier.io/)**: type checking, lint and formatting (`package.json`).

## 4. Models the documents follow

- **[arc42](https://arc42.org/)** and **[C4](https://c4model.com/)**: the model of a component's documents (`.claude/skills/redacteur/references/documents-d-un-composant.md`).
- **[Conventional Commits](https://www.conventionalcommits.org/)**, **[Keep a Changelog](https://keepachangelog.com/)**, **[Semantic Versioning](https://semver.org/)**: commits, changelog, versions (`.claude/grillhouse/charte.md`, `.claude/skills/release/`).
