import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrer, nom, version } from '../../scripts/migrations/0.24.12-tri-des-decouvertes.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';

// grillhouse-0yu.5: a project's `docs/agents/issue-tracker.md` is its own since 0.23.0, and keeps
// the former rule « it reopens on the owner's word »; the tri of the discoveries replaces it. The
// migration replaces each sentence of the former rule, when present, by the template's new one,
// and touches nothing else. Replayable without effect.

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-tri-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const FICHIER = 'docs/agents/issue-tracker.md';
const ANCIEN = readFileSync(path.join(__dirname, '../formes/issue-tracker-0.23.md'), 'utf8');
const MODELE = readFileSync(path.join(DEPOT, 'templates/projet', FICHIER), 'utf8');
const projet = (texte?: string) => {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (texte !== undefined) {
    mkdirSync(path.join(p, 'docs/agents'), { recursive: true });
    writeFileSync(path.join(p, FICHIER), texte);
  }
  return p;
};
const lire = (p: string) => readFileSync(path.join(p, FICHIER), 'utf8');
// The lines of the file that carry the rule of the discoveries.
const regle = (t: string) =>
  t
    .split('\n')
    .filter(l => /reopens on the owner's word|tri of the discoveries|`decouverte` \(/.test(l));

describe('migration 0.24.12 — the rule of the tri of the discoveries in the project’s issue-tracker.md', () => {
  it('is the migration of 0.24.12, « tri des découvertes », in the list', () => {
    expect(version).toBe('0.24.12');
    expect(nom).toBe('tri des découvertes');
    expect(MIGRATIONS.some(m => m.version === version && m.nom === nom)).toBe(true);
  });

  it('replaces the two sentences of the former rule by the template’s, and nothing else', () => {
    const p = projet(ANCIEN);
    const lignes = migrer(p);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(/^docs\/agents\/issue-tracker\.md : /);
    const neuf = lire(p);
    expect(neuf).not.toContain("reopens on the owner's word");
    expect(neuf).not.toContain('The supervisor brings to the owner the discoveries');
    // The two sentences of the rule read as the template writes them.
    const entre = (t: string, debut: string, fin: string) =>
      t.slice(t.indexOf(debut), t.indexOf(fin, t.indexOf(debut)) + fin.length);
    for (const [debut, fin] of [
      ["Once the ticket's lot is on main", 'its handoff names it.'],
      ['`decouverte` (a discovery recorded closed', '(the verdict of the tri of a discovery),'],
    ]) {
      const phrase = entre(MODELE, debut, fin);
      expect(phrase.length, debut).toBeGreaterThan(debut.length + fin.length);
      expect(neuf).toContain(phrase);
    }
    // Only the two lines of the rule change; every other line stays as it was.
    const avant = ANCIEN.split('\n');
    const apres = neuf.split('\n');
    expect(apres).toHaveLength(avant.length);
    const changees = avant.flatMap((l, i) => (l === apres[i] ? [] : [l]));
    expect(changees).toEqual(regle(ANCIEN));
    expect(changees).toHaveLength(2);
  });

  it('a file the project rewrote, or without the former rule, is not written; nor a project without it', () => {
    const propre = '# Les tickets\n\nUne découverte se rouvre quand le responsable le dit.\n';
    const p = projet(propre);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(propre);
    expect(migrer(projet())).toEqual([]);
  });

  it('a second pass changes no byte and reports nothing', () => {
    const p = projet(ANCIEN);
    migrer(p);
    const premier = lire(p);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(premier);
    const q = projet(MODELE);
    expect(migrer(q)).toEqual([]);
    expect(lire(q)).toBe(MODELE);
  });
});
