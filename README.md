<!-- grillhouse:start — this block describes the template; `npm run new` removes it -->
# Roomi's Grillhouse

**A ready-to-use project for working with Claude Code.** Create a project, open Claude Code in
it, and the first session grills you on what the project is — then writes its charter,
architecture, frame and interfaces, and opens the first tickets.

- **Initialisation grill** — round by round: the project, its owner, what decides, the
  components, their interfaces, the architecture, the vocabulary, the first milestone.
- **Supervision by tickets** — a `superviseur` session keeps the ticket queue ([Beads](https://github.com/steveyegge/beads))
  and hands each ticket to a fresh development agent (`developper`), then reviews its closure.
- **Discipline skills** — `mesurer` (measure without fooling yourself, prove a guard bites),
  `rediger` (write reference documents), `release`.
- **Code tooling** — TypeScript or JavaScript, Vitest, ESLint, Prettier, GitHub CI.
- **Everything installs by default** — Beads, and the Claude Code plugins
  [`mattpocock-skills`](https://github.com/anthropics/claude-plugins-official) and
  [`rtfm`](https://github.com/roomi-fields/rtfm), declared in the project settings.

The skills speak French.

```bash
git clone https://github.com/roomi-fields/roomis-grillhouse
cd roomis-grillhouse
npm run new -- ~/dev/my-project [ticket-prefix]
cd ~/dev/my-project && claude
```

Requirements: Node.js ≥ 18, git, Claude Code. Details: [STRUCTURE.md](STRUCTURE.md). MIT licence.

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
