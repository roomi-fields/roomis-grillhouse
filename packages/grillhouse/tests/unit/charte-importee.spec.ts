// grillhouse-3uv.84.8: the common charter arrives whole, imported by the project's CLAUDE.md, as
// Claude Code loads a CLAUDE.md and its imports (`@chemin`) whole; the hook of the session's start
// writes a short state (what the project lacks), under the cap Claude Code puts on a hook's output
// (10,000 characters, docs « Hooks »: beyond it the session receives a preview of 2,000). A project
// imports the charter from the package it installs, Grillhouse from its source.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ELEMENTS_DU_GREFFON } from '../../scripts/cadre.mjs';

const PAQUET = path.resolve(__dirname, '../..');
const DEPOT = path.resolve(PAQUET, '../..');
const CROCHET = path.join(DEPOT, 'mods/grillhouse/hooks/crochet.mjs');
const lire = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');

// The cap Claude Code puts on a hook's plain output, in characters.
const LIMITE_D_UN_CROCHET = 10_000;
const TITRE_DE_LA_CHARTE = "# La charte commune de Roomi's Grillhouse";

describe('critère 1 — the charter of a project imports the common charter', () => {
  it('the template of a project imports it from the package installed, and names the meta-frame there', () => {
    const t = lire('templates/projet/CLAUDE.md');
    expect(t).toMatch(
      /^Les règles du cadre : @node_modules\/@roomi-fields\/grillhouse\/charte\.md$/m
    );
    expect(t).toContain('`node_modules/@roomi-fields/grillhouse/METACADRE.md`');
    expect(t).not.toMatch(/donne à chaque séance/);
  });

  it('the package installed carries the charter and the meta-frame at its root, where the template imports them', () => {
    expect(ELEMENTS_DU_GREFFON).toEqual(expect.arrayContaining(['charte.md', 'METACADRE.md']));
  });

  it('the charter of Grillhouse imports it from its source, and names the meta-frame there', () => {
    const t = lire('CLAUDE.md');
    expect(t).toMatch(/^Les règles du cadre : @mods\/grillhouse\/charte\.md$/m);
    expect(t).toContain('`mods/grillhouse/METACADRE.md`');
    expect(existsSync(path.join(DEPOT, 'mods/grillhouse/charte.md'))).toBe(true);
    expect(existsSync(path.join(DEPOT, 'mods/grillhouse/METACADRE.md'))).toBe(true);
  });
});

describe('critère 2 — the session’s start no longer writes the charter, and holds under the cap', () => {
  it('on this repository, the hook of the session’s start writes no charter, under the cap of a hook', () => {
    // BEADS_ACTOR: a session the circuit launches, which takes no supervisor's lock.
    const r = spawnSync(process.execPath, [CROCHET, 'session-start'], {
      encoding: 'utf8',
      input: '{"hook_event_name":"SessionStart","source":"startup"}',
      env: { ...process.env, CLAUDE_PROJECT_DIR: DEPOT, BEADS_ACTOR: 'essai' },
      timeout: 60_000,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain(TITRE_DE_LA_CHARTE);
    expect(r.stdout.length).toBeLessThan(LIMITE_D_UN_CROCHET);
  });
});
