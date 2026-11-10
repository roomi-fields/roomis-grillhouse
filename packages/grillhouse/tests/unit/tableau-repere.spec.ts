// grillhouse-3uv.96: the day's marker is persistent — read from a file in the project's git common
// dir, next to the board's cache, out of the worktree (unversioned); the board does not reset at
// midnight, and `grillhouse newday` (poserLeRepere) sets it to now.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dossierCommun, lireLeRepere, poserLeRepere } from '../../scripts/tableau.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-repere-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MIDI = Date.parse('2026-11-10T12:00:00Z');
const LENDEMAIN = Date.parse('2026-11-11T09:00:00Z');
// Midnight as the module computes it (local time zone), so the test is independent of the zone.
const minuitDe = (quand: number) => {
  const d = new Date(quand);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// A fresh git repository under ESSAIS.
const depot = () => {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  execFileSync('git', ['-C', r, 'init', '-q']);
  return r;
};

describe('le repère de journée persistant', () => {
  it('sans fichier, le repère se replie sur minuit du jour', () => {
    const r = depot();
    expect(lireLeRepere(dossierCommun(r), MIDI)).toBe(minuitDe(MIDI));
  });

  it('newday pose le repère, que la lecture du lendemain rend encore', () => {
    const r = depot();
    expect(poserLeRepere(r, MIDI)).toBe(MIDI);
    expect(lireLeRepere(dossierCommun(r), LENDEMAIN)).toBe(MIDI);
  });

  it('le repère vit dans le dossier git commun, hors de l’arbre, non versionné', () => {
    const r = depot();
    poserLeRepere(r, MIDI);
    expect(existsSync(path.join(dossierCommun(r)!, 'tableau-repere.json'))).toBe(true);
    const suivis = execFileSync(
      'git',
      ['-C', r, 'status', '--porcelain', '--untracked-files=all'],
      {
        encoding: 'utf8',
      }
    );
    expect(suivis).not.toContain('tableau-repere');
  });

  it('poserLeRepere hors d’un dépôt git est refusé, le dossier commun nommé', () => {
    const horsGit = mkdtempSync(path.join(ESSAIS, 'hors-'));
    expect(() => poserLeRepere(horsGit)).toThrow(/dossier git commun/);
  });
});
