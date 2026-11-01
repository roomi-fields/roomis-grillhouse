// The opening of a session of supervision as the script plays it (grillhouse-mwz critère 2,
// scripts/superviseur.mjs launched on a repository of trial): only a real launch proves that the
// session start of the supervisor that takes the lock says the wait of the questions to launch and the circuits it finds (grillhouse-pq6).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { rendreVivant } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ouverture-des-circuits-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SUPERVISEUR = path.resolve(__dirname, '../../scripts/superviseur.mjs');

describe('the opening of a session of supervision, launched', () => {
  it('grillhouse-mwz critère 2 — the session start of the supervisor that takes the lock says it', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    spawnSync('git', ['init', '-q', racine]);
    const dossier = path.join(racine, '.claude', 'worktrees');
    mkdirSync(dossier, { recursive: true });
    for (const [ticket, etape] of [
      ['demo-1', 'controles'],
      ['demo-2', 'preuve'],
    ]) {
      writeFileSync(
        path.join(dossier, `${ticket}.circuit.json`),
        JSON.stringify({ etape, tentative: 1, code: null, raison: null })
      );
    }
    rendreVivant(racine, 'demo-1');
    const r = spawnSync('node', [SUPERVISEUR, racine], {
      encoding: 'utf8',
      env: { ...process.env, BEADS_ACTOR: '' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## L'attente des questions");
    expect(r.stdout).toContain('`npx grillhouse superviseur --attendre`');
    expect(r.stdout).toContain('## Les circuits du dépôt');
    expect(r.stdout).toContain('- demo-1 tourne, à 3.1 Contrôles.');
    expect(r.stdout).not.toContain('--rattacher');
    expect(r.stdout).toContain('`npx grillhouse circuit demo-2 --reprendre`');
  });

  it('grillhouse-mwz critère 2 — a second opening of the same session (compaction, /clear: it already holds the lock) does not say the circuits again', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    spawnSync('git', ['init', '-q', racine]);
    const dossier = path.join(racine, '.claude', 'worktrees');
    mkdirSync(dossier, { recursive: true });
    writeFileSync(
      path.join(dossier, 'demo-2.circuit.json'),
      JSON.stringify({ etape: 'preuve', tentative: 1, code: null, raison: null })
    );
    const ouvrir = () =>
      spawnSync('node', [SUPERVISEUR, racine], {
        encoding: 'utf8',
        env: { ...process.env, BEADS_ACTOR: '' },
      });
    const premiere = ouvrir();
    expect(premiere.status).toBe(0);
    expect(premiere.stdout).toContain("## L'attente des questions");
    const seconde = ouvrir();
    expect(seconde.status).toBe(0);
    expect(seconde.stdout).not.toContain("## L'attente des questions");
    expect(seconde.stdout).not.toContain('Un autre superviseur');
  });
});
