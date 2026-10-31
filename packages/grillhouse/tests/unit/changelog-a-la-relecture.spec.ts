// grillhouse-an7 — the changelog is a document the review judges, never an output the suite tests,
// as mature projects review their release notes: a test that reads a document binds itself to its
// layout. Witness: OSC Bridge (2026-10-31), two release commits in a row red, each test of a
// ticket looking for its entry under the open section, which each release moves
// (tests/privacy_policy.rs broke 0.18.0, tests/checksum_lenient.rs:325 broke 0.19.0).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
const lire = (rel: string) => readFileSync(path.join(RACINE, rel), 'utf8').replace(/\s+/g, ' ');

describe('grillhouse-an7 — the changelog is judged at the review, never tested', () => {
  it('critère 1 — the testwriter’s skill says no test reads the changelog, and a criterion that names it is judged at the review', () => {
    const competence = lire('mods/grillhouse/skills/testwriter/SKILL.md');
    expect(competence).toMatch(
      /Aucun test ne lit le CHANGELOG, ni un autre document de suivi des versions/
    );
    expect(competence).toMatch(/un critère qui le nomme se juge à la relecture/);
  });

  it('critère 1 — the testwriter’s agent says it writes no test of the changelog', () => {
    expect(lire('mods/grillhouse/agents/testwriter.md')).toMatch(/aucun test ne lit le CHANGELOG/);
  });

  it('critère 2 — the form of the criteria says « the CHANGELOG says it » without a section title, judged by the reviewer on the lot', () => {
    for (const f of [
      'docs/agents/issue-tracker.md',
      'templates/projet/docs/agents/issue-tracker.md',
    ]) {
      const texte = lire(f);
      expect(texte, f).toMatch(/« the CHANGELOG says it », never tied to a section title/);
      expect(texte, f).toMatch(/the `relecteur` judges the entry on the lot; no test reads it/);
    }
    for (const f of [
      'mods/grillhouse/skills/explorateur/SKILL.md',
      'mods/grillhouse/skills/pitmaster/SKILL.md',
    ]) {
      expect(lire(f), f).toMatch(/« le CHANGELOG le dit », sans le lier à un titre de section/);
    }
  });

  it('critère 2 — the reviewer’s skill judges the changelog’s entry on the lot', () => {
    const relecteur = lire('mods/grillhouse/skills/relecteur/SKILL.md');
    expect(relecteur).toMatch(/L'entrée du CHANGELOG se juge sur le lot/);
  });
});
