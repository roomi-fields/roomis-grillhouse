// @lit mods/grillhouse/skills/** templates/projet/**
// The note of resumption replaces the follow-up `pitmaster/SUIVI.md`: the skill of the supervisor
// says how it is held and at which milestones, and neither the skills nor the template of a project
// name the former file.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
const COMPETENCES = path.join(RACINE, 'mods/grillhouse/skills');
const pitmaster = () =>
  readFileSync(path.join(RACINE, 'mods/grillhouse/skills/pitmaster/SKILL.md'), 'utf8').replace(
    /\s+/g,
    ' '
  );

describe('the note of resumption replaces pitmaster/SUIVI.md', () => {
  it('no skill of the frame names SUIVI.md', () => {
    const nomment = readdirSync(COMPETENCES, { recursive: true, encoding: 'utf8' })
      .filter(f => f.endsWith('.md'))
      .filter(f => readFileSync(path.join(COMPETENCES, f), 'utf8').includes('SUIVI'));
    expect(nomment).toEqual([]);
  });

  it('the template of a project no longer places the file', () => {
    expect(existsSync(path.join(RACINE, 'templates/projet/pitmaster/SUIVI.md'))).toBe(false);
  });
});

describe('the skill of the supervisor says how the note of resumption is held', () => {
  it('declares a milestone and adds a question by the command', () => {
    expect(pitmaster()).toContain('npx grillhouse superviseur --jalon');
    expect(pitmaster()).toContain('--question');
  });

  it('names the three milestones: an exit announced, a compaction, the end of the day', () => {
    const texte = pitmaster();
    expect(texte).toMatch(/jalon/i);
    expect(texte).toMatch(/sortie annoncée/i);
    expect(texte).toMatch(/compaction|compactage/i);
    expect(texte).toMatch(/fin de journée/i);
  });

  it('says the note is rewritten from the current one, each open question to the owner copied until decided', () => {
    const texte = pitmaster();
    expect(texte).toMatch(/note courante/i);
    expect(texte).toMatch(/recopi/i);
    expect(texte).toMatch(/tranchée/i);
  });
});
