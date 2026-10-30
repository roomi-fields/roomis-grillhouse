// The journal of the tickets replays no test of the frame: each command of bd rewrites
// `.beads/interactions.jsonl`, and a pass measured against the last green plays every test of a
// package when a change lies on a path its tests declare they read (`grillhouse.lit`, rule 5 of
// scripts/langages/typescript/vitest-config/changements.mjs), which its turbo.json also hashes for its `test:unit`.
// The package declares under `.beads` the files its tests read, one by one: each file git follows
// there but the journals (`*.jsonl`) and the README, which ./git-des-tests.spec.ts reads to look
// for a setting of git's maintenance, the hooks included; its launcher stays declared whole,
// and its scripts are not declared: each test names the scripts it launches by their path
// (grillhouse-3dr.3.4, scripts/langages/typescript/vitest-config/lances.mjs).
//
// Witness: the frame (2026-10-28), « ↳ packages/grillhouse : tous ses tests, un chemin que ses
// tests déclarent lire (grillhouse.lit) (.beads/interactions.jsonl) » on every pass of main: its
// 3 200 tests (about 22 minutes) after any command of bd.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { restreindre } from '../../scripts/langages/typescript/vitest-config/changements.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const PAQUET = path.join(DEPOT, 'packages/grillhouse');
// The files of .beads the tests read: those git follows, but the journals and the README.
const LUS = [
  '.beads/.gitignore',
  '.beads/config.yaml',
  '.beads/hooks/commit-msg',
  '.beads/hooks/post-checkout',
  '.beads/hooks/post-merge',
  '.beads/hooks/pre-commit',
  '.beads/hooks/pre-push',
  '.beads/hooks/prepare-commit-msg',
  '.beads/metadata.json',
];

// The line the selection of a pass of the package says for the one change <fichier>.
function ligne(fichier: string) {
  const dit: string[] = [];
  restreindre({}, PAQUET, { racine: DEPOT, fichiers: [fichier], supprimes: [] }, [], (l: string) =>
    dit.push(l)
  );
  return dit.join('\n');
}

describe('grillhouse-3dr.1 — the journal of the tickets replays no test', () => {
  it('critère 1 : a change of .beads/interactions.jsonl plays only the tests Vitest relates to it', () => {
    expect(ligne('.beads/interactions.jsonl')).toContain('les tests que Vitest relie');
  });

  it('critère 1 : a change of a hook of bd plays every test, git-des-tests.spec.ts among them, which reads it', () => {
    expect(ligne('.beads/hooks/pre-commit')).toContain('tous ses tests');
    expect(ligne('.beads/config.yaml')).toContain('tous ses tests');
  });

  it('grillhouse-3dr.3.4 : a change of a script of the package plays the tests that import or launch it', () => {
    const dit = ligne('packages/grillhouse/scripts/sortie.mjs');
    expect(dit).toContain('les tests que Vitest relie');
    expect(dit).toMatch(/\d+ test\(s\) qui en lisent un par son chemin/);
  });

  it('critère 1 : the turbo.json of the package hashes of .beads the files a test reads, no journal', () => {
    const turbo = JSON.parse(
      readFileSync(path.join(PAQUET, 'turbo.json'), 'utf8').replace(/^\/\/.*$/gm, '')
    ) as { tasks: Record<string, { inputs?: string[] }> };
    const beads = (turbo.tasks['test:unit']?.inputs ?? []).filter(e =>
      e.startsWith('$TURBO_ROOT$/.beads')
    );
    expect(beads).toEqual(LUS.map(f => `$TURBO_ROOT$/${f}/**`));
    expect(beads.some(e => e.endsWith('.jsonl/**'))).toBe(false);
  });
});
