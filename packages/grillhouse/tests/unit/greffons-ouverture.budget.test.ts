import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cheminSysteme,
  claudeSubstitut,
  configGit,
} from '@roomi-fields/grillhouse-matiere/test-fixtures';

// grillhouse-3uv.71, critères 5 and 14: the session start holds its budget of 10 s while it reads
// the plugins; a reading that would exceed it is interrupted, and a line says so.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'greffons-ouverture-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const SESSION = path.join(DEPOT, 'packages/grillhouse/scripts/session-start.sh');
const BUDGET_MS = 10_000;

function ouvrir(sommeil: number) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  mkdirSync(path.join(p, '.claude'));
  writeFileSync(
    path.join(p, '.claude/settings.json'),
    JSON.stringify({ enabledPlugins: { 'mattpocock-skills@claude-plugins-official': true } })
  );
  symlinkSync(path.join(DEPOT, 'packages/grillhouse/scripts'), path.join(p, 'scripts'));
  mkdirSync(path.join(p, 'node_modules'));
  const bd = mkdtempSync(path.join(ESSAIS, 'bd-'));
  writeFileSync(path.join(bd, 'bd'), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
  const claude = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), { sommeil });
  const debut = Date.now();
  const r = spawnSync('bash', [SESSION], {
    encoding: 'utf8',
    env: {
      PATH: cheminSysteme(claude.bin, bd),
      HOME: mkdtempSync(path.join(ESSAIS, 'maison-')),
      CLAUDE_PROJECT_DIR: p,
      ...configGit(),
    },
    timeout: 60_000,
  });
  return { r, duree: Date.now() - debut, claude };
}

describe('grillhouse-3uv.71 critère 5 — the session start holds its budget of 10 s', () => {
  it('critère 5: claude answering as fast as measured (1.2 s a call): the session start ends within 10 s', () => {
    const { r, duree, claude } = ouvrir(1.2);
    expect(r.status, r.stderr).toBe(0);
    expect(claude.appels().length, 'the plugins were not read').toBeGreaterThan(0);
    expect(duree).toBeLessThan(BUDGET_MS);
  }, 70_000);
  it('critère 5: claude that never answers: the session start still ends within 10 s', () => {
    const { r, duree } = ouvrir(45);
    expect(r.error, 'la séance a gelé').toBeUndefined();
    expect(r.status, r.stderr).toBe(0);
    expect(duree).toBeLessThan(BUDGET_MS);
  }, 70_000);
  it('critère 14: claude that never answers: a line says the reading of the plugins was interrupted, no plugin is named', () => {
    const { r } = ouvrir(45);
    expect(r.status, r.stderr).toBe(0);
    expect(
      r.stdout.split('\n').some(l => /greffons/.test(l) && /interromp/.test(l)),
      r.stdout
    ).toBe(true);
    expect(r.stdout, r.stdout).not.toContain(
      'le greffon mattpocock-skills@claude-plugins-official'
    );
  }, 70_000);
});
