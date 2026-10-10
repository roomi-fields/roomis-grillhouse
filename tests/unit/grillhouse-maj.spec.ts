import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ecarts,
  fusionnerReglages,
  lireListe,
  mettreAJour,
} from '../../scripts/grillhouse-maj.mjs';

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const json = (racine: string, f: string) => JSON.parse(lire(racine, f)) as Record<string, unknown>;
const crochet = (command: string, matcher?: string) => ({
  ...(matcher ? { matcher } : {}),
  hooks: [{ type: 'command', command }],
});

function source(fichiers: Record<string, string>) {
  const s = mkdtempSync(path.join(tmpdir(), 'cadre-'));
  for (const [f, t] of Object.entries(fichiers)) {
    ecrire(s, f, t);
  }
  return s;
}

describe('the list of the frame', () => {
  it('reads the paths to install and those to remove, without comments', () => {
    expect(lireListe('# x\nMETACADRE.md\nscripts/verrous/\n- tests/unit/a.spec.ts\n')).toEqual({
      garder: ['METACADRE.md', 'scripts/verrous/'],
      retirer: ['tests/unit/a.spec.ts'],
    });
  });
});

describe('the settings of the frame', () => {
  it("adds the frame's hooks and plugins, keeps the project's, removes a dropped frame hook", () => {
    const projet = {
      permissions: { allow: ['Bash(ls)'] },
      hooks: { SessionStart: [crochet('mon-crochet'), crochet('vieux-cadre')] },
      enabledPlugins: { 'a@b': true },
    };
    const cadre = {
      hooks: { PreToolUse: [crochet('verrou', 'Agent|Task')] },
      enabledPlugins: { 'g@h': true },
    };
    const ancien = ['SessionStart\u0000\u0000vieux-cadre'];
    const { reglages, installes } = fusionnerReglages(projet, cadre, ancien) as {
      reglages: object;
      installes: string[];
    };
    expect(reglages).toEqual({
      permissions: { allow: ['Bash(ls)'] },
      hooks: {
        SessionStart: [crochet('mon-crochet')],
        PreToolUse: [crochet('verrou', 'Agent|Task')],
      },
      enabledPlugins: { 'a@b': true, 'g@h': true },
      extraKnownMarketplaces: {},
    });
    expect(installes).toEqual(['PreToolUse\u0000Agent|Task\u0000verrou']);
    expect(fusionnerReglages(reglages, cadre, installes).reglages).toEqual(reglages);
  });
});

describe('the update of a project', () => {
  const v1 = source({
    '.claude/grillhouse/fichiers.txt':
      'METACADRE.md\nscripts/verrous/\n- tests/unit/vieux.spec.ts\n',
    'METACADRE.md': 'meta 1',
    'scripts/verrous/a.mjs': 'a 1',
    'scripts/verrous/b.mjs': 'b 1',
    '.claude/settings.json': JSON.stringify({ hooks: { SessionStart: [crochet('debut')] } }),
  });
  const projet = mkdtempSync(path.join(tmpdir(), 'projet-'));
  ecrire(projet, 'scripts/verrous/mien.mjs', 'à moi');
  ecrire(projet, 'tests/unit/vieux.spec.ts', 'copie ancienne');
  ecrire(projet, 'package.json', JSON.stringify({ name: 'p', scripts: { test: 'vitest' } }));
  const b1 = mettreAJour(projet, v1, 'v1');

  it("copies the frame's files and removes the paths it retires, the project's own files kept", () => {
    expect(b1.copies.sort()).toEqual([
      'METACADRE.md',
      'scripts/verrous/a.mjs',
      'scripts/verrous/b.mjs',
    ]);
    expect(b1.retires).toEqual(['tests/unit/vieux.spec.ts']);
    expect(lire(projet, 'scripts/verrous/mien.mjs')).toBe('à moi');
    const scripts = json(projet, 'package.json').scripts as Record<string, string>;
    expect(scripts.test).toBe('vitest');
    expect(scripts.tableau).toMatch(/tableau\.mjs/);
    expect(scripts['grillhouse:maj']).toMatch(/grillhouse-maj\.mjs/);
    expect(json(projet, '.claude/settings.json').hooks).toEqual({
      SessionStart: [crochet('debut')],
    });
  });
  it('says nothing while the frame files are as installed, and names a drift', () => {
    expect(ecarts(projet)).toEqual({ version: 'v1', modifies: [], absents: [] });
    ecrire(projet, 'METACADRE.md', 'retouché');
    expect(ecarts(projet)?.modifies).toEqual(['METACADRE.md']);
  });
  it('brings a drifted project back, and removes a file the next version drops', () => {
    const v2 = source({
      '.claude/grillhouse/fichiers.txt': 'METACADRE.md\nscripts/verrous/\n',
      'METACADRE.md': 'meta 2',
      'scripts/verrous/a.mjs': 'a 1',
      '.claude/settings.json': JSON.stringify({ hooks: {} }),
    });
    const b2 = mettreAJour(projet, v2, 'v2');
    expect(b2.copies).toEqual(['METACADRE.md']);
    expect(b2.retires).toEqual(['scripts/verrous/b.mjs']);
    expect(existsSync(path.join(projet, 'scripts/verrous/mien.mjs'))).toBe(true);
    expect(json(projet, '.claude/settings.json').hooks).toEqual({});
    expect(ecarts(projet)).toEqual({ version: 'v2', modifies: [], absents: [] });
  });
});
