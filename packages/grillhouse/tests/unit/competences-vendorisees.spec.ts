// @lit mods/grillhouse/** templates/** .claude/settings.json CREDITS.md README.md STRUCTURE.md
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The four skills of the plugin of mattpocock that the frame calls live in the frame's plugin,
// under their own names (`grillhouse:<nom>`), with their attribution; the whole plugin is no
// longer enabled by the template or by Grillhouse.

const DEPOT = path.resolve(__dirname, '../../../..');
const lire = (...p: string[]) => readFileSync(path.join(DEPOT, ...p), 'utf8');

const VOISINS: Record<string, string[]> = {
  grilling: ['SKILL.md'],
  'writing-for-agents': ['SKILL.md', 'SKILL-MECHANICS.md'],
  'codebase-design': ['SKILL.md', 'DEEPENING.md', 'DESIGN-IT-TWICE.md'],
  'domain-modeling': ['SKILL.md', 'ADR-FORMAT.md', 'GLOSSARY-FORMAT.md'],
};

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap(f => {
    if (f === 'node_modules') {
      return [];
    }
    const chemin = path.join(dossier, f);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

describe('the vendored skills of the frame', () => {
  for (const [competence, voisins] of Object.entries(VOISINS)) {
    it(`${competence} has its folder, its neighbouring files and its frontmatter name`, () => {
      for (const f of voisins) {
        expect(existsSync(path.join(DEPOT, 'mods/grillhouse/skills', competence, f)), f).toBe(true);
      }
      const texte = lire('mods/grillhouse/skills', competence, 'SKILL.md');
      expect(texte).toMatch(new RegExp(`^---\\n(?:[^]*?\\n)?name: ${competence}\\n`));
    });
  }

  it('CREDITS.md names the origin, the version 1.3.1 and the MIT licence', () => {
    const texte = lire('CREDITS.md');
    expect(texte).toMatch(/mattpocock/i);
    expect(texte).toContain('1.3.1');
    expect(texte).toMatch(/MIT/);
    for (const competence of Object.keys(VOISINS)) {
      expect(texte).toContain(competence);
    }
  });

  it('no file of the plugin or of the template names the plugin with a colon', () => {
    for (const racine of ['mods/grillhouse', 'templates']) {
      for (const f of fichiers(path.join(DEPOT, racine))) {
        expect(readFileSync(f, 'utf8'), f).not.toContain('mattpocock-skills:');
      }
    }
  });

  it('the template does not name the plugin of mattpocock at all', () => {
    for (const f of fichiers(path.join(DEPOT, 'templates'))) {
      expect(readFileSync(f, 'utf8'), f).not.toContain('mattpocock-skills');
    }
  });

  it('the settings of the template and of the repository no longer enable it', () => {
    for (const f of ['templates/projet/.claude/settings.json', '.claude/settings.json']) {
      const { enabledPlugins } = JSON.parse(lire(f)) as {
        enabledPlugins: Record<string, boolean>;
      };
      expect(Object.keys(enabledPlugins), f).not.toContain(
        'mattpocock-skills@claude-plugins-official'
      );
      expect(Object.keys(enabledPlugins), f).toContain('grillhouse@roomi-fields');
    }
  });

  it('the charter, the grill and the writer name the skills as grillhouse:<nom>', () => {
    const charte = lire('mods/grillhouse/charte.md');
    expect(charte).toContain('grillhouse:grilling');
    expect(charte).toContain('grillhouse:writing-for-agents');
    const grill = lire('mods/grillhouse/skills/grill/SKILL.md');
    for (const n of ['grilling', 'codebase-design', 'domain-modeling', 'writing-for-agents']) {
      expect(grill).toContain(`grillhouse:${n}`);
    }
    expect(lire('mods/grillhouse/skills/redacteur/SKILL.md')).toContain(
      'grillhouse:writing-for-agents'
    );
  });

  it('the grill loads grillhouse:grilling without a fallback for a missing plugin', () => {
    const grill = lire('mods/grillhouse/skills/grill/SKILL.md');
    expect(grill).not.toContain('mattpocock-skills');
    expect(grill).not.toMatch(/s'il n'est pas disponible/);
  });

  it('the documents of the plugins do not present mattpocock-skills as an enabled plugin of the frame', () => {
    for (const f of [
      'README.md',
      'STRUCTURE.md',
      'mods/grillhouse/skills/pitmaster/references/cadre.md',
    ]) {
      expect(lire(f), f).not.toContain('mattpocock-skills');
    }
  });
});
