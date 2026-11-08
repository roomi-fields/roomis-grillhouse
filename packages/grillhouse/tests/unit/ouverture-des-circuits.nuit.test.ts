// The opening of a session of supervision as the script plays it (grillhouse-mwz critère 2,
// scripts/superviseur.mjs launched on a repository of trial): only a real launch proves that the
// session start of the supervisor that takes the lock says the wait of the questions to launch,
// and what it reads of the circuits (grillhouse-pq6, grillhouse-4nr.10): here a server that does
// not answer, said; the circuits a server gives are tests/temporal/circuit.nuit.spec.ts's.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SANS_REPONSE_EN } from '../../scripts/circuits-du-serveur.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ouverture-des-circuits-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SUPERVISEUR = path.resolve(__dirname, '../../scripts/superviseur.mjs');
// A server that does not answer: no process listens on port 1.
const SANS_SERVEUR = { ...process.env, BEADS_ACTOR: '', TEMPORAL_ADDRESS: '127.0.0.1:1' };

describe('the opening of a session of supervision, launched', () => {
  it('grillhouse-mwz critère 2 — the session start of the supervisor that takes the lock says it', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    spawnSync('git', ['init', '-q', racine]);
    mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
    const r = spawnSync('node', [SUPERVISEUR, racine], { encoding: 'utf8', env: SANS_SERVEUR });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## L'attente des questions");
    expect(r.stdout).toContain('`npx grillhouse superviseur --attendre`');
    expect(r.stdout).toContain('## Les circuits du dépôt');
    expect(r.stdout).toContain(SANS_REPONSE_EN);
    expect(r.stdout).not.toContain('--rattacher');
  });

  it('grillhouse-mwz critère 2 — a second opening of the same session (compaction, /clear: it already holds the lock) does not say the circuits again', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    spawnSync('git', ['init', '-q', racine]);
    mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
    const ouvrir = () =>
      spawnSync('node', [SUPERVISEUR, racine], { encoding: 'utf8', env: SANS_SERVEUR });
    const premiere = ouvrir();
    expect(premiere.status).toBe(0);
    expect(premiere.stdout).toContain("## L'attente des questions");
    const seconde = ouvrir();
    expect(seconde.status).toBe(0);
    expect(seconde.stdout).not.toContain("## L'attente des questions");
    expect(seconde.stdout).not.toContain('Un autre superviseur');
  });
});
