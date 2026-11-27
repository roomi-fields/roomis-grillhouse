// @lit mods/grillhouse/** templates/** .claude/settings.json CREDITS.md README.md STRUCTURE.md
import { createHash } from 'node:crypto';
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

// The systematic-debugging skill of Superpowers (Jesse Vincent, MIT), copied from its tag v7.0.2:
// each file is pinned by the blob id git gives it at that tag. SKILL.md is pinned without its two
// bullets that call skills of other folders, which the frame does not take.
const DEBOGAGE = 'mods/grillhouse/skills/systematic-debugging';
const BLOBS: Record<string, string> = {
  'SKILL.md': '1fd12b4905599c2595508c78e5da18f10838c019',
  'condition-based-waiting-example.ts': '703a06b653160d060bbf46ab5c6e0cd7446bd592',
  'condition-based-waiting.md': '70994f777c586f7d4c43033aac34c7cf0da6688b',
  'defense-in-depth.md': 'e2483354dc2b62478a2624e34ca18bc0efe887b2',
  'find-polluter.sh': '985f5d08ccf8a3f2d40739cfcaf4413bb24bf1cb',
  'root-cause-tracing.md': '0e72e8f9566b7ef85e814633d1feacad9d0c5868',
};

const blob = (chemin: string) => {
  const contenu = readFileSync(chemin);
  return createHash('sha1').update(`blob ${contenu.length}\0`).update(contenu).digest('hex');
};

describe('the debugging skill taken from Superpowers', () => {
  it('holds the six files of the upstream folder, without a sub-folder', () => {
    expect(readdirSync(path.join(DEPOT, DEBOGAGE)).sort()).toEqual(Object.keys(BLOBS).sort());
    for (const f of Object.keys(BLOBS)) {
      expect(statSync(path.join(DEPOT, DEBOGAGE, f)).isFile(), f).toBe(true);
    }
  });

  it('has systematic-debugging as its frontmatter name', () => {
    expect(lire(DEBOGAGE, 'SKILL.md')).toMatch(/^---\n(?:[^]*?\n)?name: systematic-debugging\n/);
  });

  for (const [f, attendu] of Object.entries(BLOBS)) {
    it(`keeps the upstream text of ${f}`, () => {
      expect(blob(path.join(DEPOT, DEBOGAGE, f))).toBe(attendu);
    });
  }

  it('calls no skill under the superpowers: prefix', () => {
    for (const f of fichiers(path.join(DEPOT, DEBOGAGE))) {
      expect(readFileSync(f, 'utf8'), f).not.toContain('superpowers:');
    }
  });

  it('is credited in CREDITS.md with its origin, version, licence, copyright and call name', () => {
    const entrees = lire('CREDITS.md')
      .split(/\n(?=- |## )/)
      .filter(e => e.startsWith('- ') && e.includes('Superpowers'));
    expect(entrees).toHaveLength(1);
    const [entree] = entrees;
    expect(entree).toContain('obra/superpowers');
    expect(entree).toContain('Jesse Vincent');
    expect(entree).toContain('7.0.2');
    expect(entree).toMatch(/\bMIT\b/);
    expect(entree).toContain('Copyright (c) 2025 Jesse Vincent');
    expect(entree).toContain('grillhouse:systematic-debugging');
  });

  it.each(['README.md', 'STRUCTURE.md'])(
    '%s names it with its origin among the vendored skills',
    f => {
      expect(
        lire(f)
          .split('\n')
          .filter(l => l.includes('systematic-debugging') && l.includes('Superpowers'))
      ).not.toEqual([]);
    }
  );
});
