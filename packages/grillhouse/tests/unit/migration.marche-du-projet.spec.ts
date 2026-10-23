import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrer, nom, version } from '../../scripts/migrations/0.23.0-marche-du-projet.mjs';

// grillhouse-3uv.84.7 critère 2: the frame's plugin comes from the marketplace roomi-fields, which
// names the package npm; nothing of a project is published. A migration takes off a project the
// marketplace of its own an earlier update wrote: its `.claude-plugin/marketplace.json`
// (`grillhouse-<projet>`, listing the plugin of the project's package), its declaration at the
// project's root (`./`) and its plugin, `grillhouse@grillhouse-<projet>`, in `.claude/settings.json`
// and in `.claude/settings.local.json` (where the add of a marketplace of a directory wrote it).
// Replayable without effect.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-marche-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ROOMI = { source: { source: 'github', repo: 'roomi-fields/claude-plugins' } };
const MARCHE = 'grillhouse-bpscript';
const DU_PROJET = { source: { source: 'directory', path: './' } };
const MANIFESTE = {
  name: MARCHE,
  owner: { name: "Roomi's Grillhouse" },
  plugins: [
    {
      name: 'grillhouse',
      source: './node_modules/@roomi-fields/grillhouse/cadre/mods/grillhouse',
    },
  ],
};

const ecrire = (p: string, f: string, v: unknown) => {
  mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
  writeFileSync(path.join(p, f), typeof v === 'string' ? v : `${JSON.stringify(v, null, 2)}\n`);
};
const lire = (p: string, f: string) => readFileSync(path.join(p, f), 'utf8');
const projet = () => mkdtempSync(path.join(ESSAIS, 'projet-'));

describe('migration 0.23.0 — the marketplace of the project leaves', () => {
  it('is the migration of 0.23.0, « place de marché du projet »', () => {
    expect(version).toBe('0.23.0');
    expect(nom).toBe('place de marché du projet');
  });

  it('removes the project’s marketplace, its declaration and its plugin; the other keys keep their order', () => {
    const p = projet();
    ecrire(p, '.claude-plugin/marketplace.json', MANIFESTE);
    ecrire(p, '.claude/settings.json', {
      model: 'opus',
      enabledPlugins: {
        'rtfm@roomi-fields': true,
        [`grillhouse@${MARCHE}`]: true,
      },
      extraKnownMarketplaces: { 'roomi-fields': ROOMI, [MARCHE]: DU_PROJET },
      enabledMcpjsonServers: ['codegraph'],
    });
    const lignes = migrer(p);
    expect(lignes.some(l => l.includes('.claude-plugin/marketplace.json'))).toBe(true);
    expect(lignes.some(l => l.includes(`grillhouse@${MARCHE}`))).toBe(true);
    expect(existsSync(path.join(p, '.claude-plugin'))).toBe(false);
    expect(JSON.parse(lire(p, '.claude/settings.json'))).toEqual({
      model: 'opus',
      enabledPlugins: { 'rtfm@roomi-fields': true },
      extraKnownMarketplaces: { 'roomi-fields': ROOMI },
      enabledMcpjsonServers: ['codegraph'],
    });
  });

  it('removes the declaration the add wrote in the local settings, and the keys left empty', () => {
    const p = projet();
    ecrire(p, '.claude/settings.local.json', {
      extraKnownMarketplaces: { [MARCHE]: DU_PROJET },
      permissions: { allow: ['Bash(ls)'] },
    });
    expect(migrer(p)).toHaveLength(1);
    expect(JSON.parse(lire(p, '.claude/settings.local.json'))).toEqual({
      permissions: { allow: ['Bash(ls)'] },
    });
  });

  it('a second pass changes no byte and reports nothing', () => {
    const p = projet();
    ecrire(p, '.claude-plugin/marketplace.json', MANIFESTE);
    ecrire(p, '.claude/settings.json', {
      enabledPlugins: { [`grillhouse@${MARCHE}`]: true },
      extraKnownMarketplaces: { [MARCHE]: DU_PROJET },
    });
    migrer(p);
    const premier = lire(p, '.claude/settings.json');
    expect(migrer(p)).toEqual([]);
    expect(lire(p, '.claude/settings.json')).toBe(premier);
  });

  it('a marketplace of the project’s own that is not the frame’s stays, as the settings without it', () => {
    const p = projet();
    const autre = { name: 'outils-maison', plugins: [{ name: 'x', source: './plugins/x' }] };
    ecrire(p, '.claude-plugin/marketplace.json', autre);
    const texte = `${JSON.stringify({
      enabledPlugins: { 'x@outils-maison': true, 'grillhouse@roomi-fields': true },
      extraKnownMarketplaces: { 'outils-maison': DU_PROJET, 'roomi-fields': ROOMI },
    })}\n`;
    ecrire(p, '.claude/settings.json', texte);
    expect(migrer(p)).toEqual([]);
    expect(lire(p, '.claude/settings.json')).toBe(texte);
    expect(JSON.parse(lire(p, '.claude-plugin/marketplace.json'))).toEqual(autre);
  });

  it('a project without settings nor marketplace is left as it is', () => {
    const p = projet();
    expect(migrer(p)).toEqual([]);
    expect(existsSync(path.join(p, '.claude'))).toBe(false);
  });
});
