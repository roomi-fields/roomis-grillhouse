// The CI calls `npm run verifier` alone. Mechanism: installation.md §5.4
// (packages/grillhouse/docs/architecture/).
//
// - A `.github/workflows/ci.yml` identical, spaces normalized, to the former template is replaced
//   by the new one.
// - One that differs stays, and `aFaire` names the steps to remove from its test job:
//   `format:check`, `lint`, `typecheck` and `build`.
// - One that already calls the verification alone, or no CI, is left.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CADRE } from '../cadre.mjs';

export const version = '0.30.0';
export const nom = 'ci appelle la vérification';

const CI = '.github/workflows/ci.yml';
const GABARIT = path.join(CADRE, 'templates', 'projet');

// The template of 0.29.0, the version before this one.
const D_AVANT = `name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [22.x, 24.x]

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v5
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check formatting
        run: npm run format:check

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Build
        run: npm run build --if-present

      - name: Guards and tests
        run: npm run verifier

  build:
    runs-on: ubuntu-latest
    needs: test

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build --if-present

      - name: Check package
        run: npm pack --dry-run
`;

// The versions before of the template (each one's text, to compare with the project's).
const ANCIENNES = [D_AVANT];

// A text with its blanks normalized: line ends, trailing spaces, runs of blanks.
const normaliser = t =>
  t
    .split(/\r?\n/)
    .map(l => l.trim().replace(/[ \t]+/g, ' '))
    .filter(l => l !== '')
    .join('\n');

/** Replaces the CI of the project by the template's when it is a former one; returns what it did. */
export function migrer(projet) {
  const f = path.join(projet, CI);
  if (!existsSync(f)) {
    return [];
  }
  const actuel = normaliser(readFileSync(f, 'utf8'));
  const neuf = readFileSync(path.join(GABARIT, CI), 'utf8');
  if (actuel === normaliser(neuf)) {
    return [];
  }
  if (ANCIENNES.some(a => normaliser(a) === actuel)) {
    writeFileSync(f, neuf);
    return [`${CI} : remplacé par celui du gabarit, qui n'appelle que \`npm run verifier\``];
  }
  if (!/^\s*run:\s*npm run (format:check|lint|typecheck|build)\b/m.test(readFileSync(f, 'utf8'))) {
    return [];
  }
  return [
    {
      aFaire: `${CI} : \`npm run verifier\` joue la mise en forme, le lint, le typage et la construction ; retirer du job de test les étapes \`format:check\`, \`lint\`, \`typecheck\` et \`build\`, et ne garder après l'installation que \`npm run verifier\`.`,
    },
  ];
}
