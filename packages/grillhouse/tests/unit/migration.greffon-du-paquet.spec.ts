import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrer, version } from '../../scripts/migrations/0.23.0-greffon-du-paquet.mjs';

// grillhouse-3uv.84.7 critère 2: the frame's plugin comes from the package; a migration takes off
// a project's settings the plugin the GitHub marketplace roomi-fields provided
// (`grillhouse@roomi-fields`), and that marketplace once no plugin the project enables comes from
// it (rtfm@roomi-fields, which the common charter asks of every project, keeps it). Replayable
// without effect.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-greffon-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ROOMI = { source: { source: 'github', repo: 'roomi-fields/claude-plugins' } };

function projet(reglages: Record<string, unknown> | null) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (reglages) {
    mkdirSync(path.join(p, '.claude'));
    writeFileSync(path.join(p, '.claude/settings.json'), `${JSON.stringify(reglages, null, 2)}\n`);
  }
  return p;
}
const lire = (p: string) => readFileSync(path.join(p, '.claude/settings.json'), 'utf8');

describe('migration 0.23.0 — the frame’s plugin leaves the GitHub marketplace', () => {
  it('is the migration of 0.23.0', () => {
    expect(version).toBe('0.23.0');
  });

  it('removes grillhouse@roomi-fields; the marketplace roomi-fields stays while rtfm@roomi-fields is enabled; the other keys keep their order', () => {
    const p = projet({
      model: 'opus',
      enabledPlugins: {
        'mattpocock-skills@claude-plugins-official': true,
        'rtfm@roomi-fields': true,
        'grillhouse@roomi-fields': true,
      },
      extraKnownMarketplaces: { 'roomi-fields': ROOMI },
      enabledMcpjsonServers: ['codegraph'],
    });
    const lignes = migrer(p);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain('grillhouse@roomi-fields');
    expect(JSON.parse(lire(p))).toEqual({
      model: 'opus',
      enabledPlugins: {
        'mattpocock-skills@claude-plugins-official': true,
        'rtfm@roomi-fields': true,
      },
      extraKnownMarketplaces: { 'roomi-fields': ROOMI },
      enabledMcpjsonServers: ['codegraph'],
    });
  });

  it('removes the marketplace roomi-fields when no plugin the project enables comes from it, and the keys left empty', () => {
    const p = projet({
      enabledPlugins: { 'grillhouse@roomi-fields': true, 'rtfm@roomi-fields': false },
      extraKnownMarketplaces: { 'roomi-fields': ROOMI },
      model: 'opus',
    });
    const lignes = migrer(p);
    expect(lignes).toHaveLength(2);
    expect(lignes.some(l => l.includes('roomi-fields/claude-plugins'))).toBe(true);
    expect(JSON.parse(lire(p))).toEqual({
      enabledPlugins: { 'rtfm@roomi-fields': false },
      model: 'opus',
    });
  });

  it('a second pass changes no byte and reports nothing', () => {
    const p = projet({
      enabledPlugins: { 'grillhouse@roomi-fields': true, 'rtfm@roomi-fields': true },
      extraKnownMarketplaces: { 'roomi-fields': ROOMI },
    });
    migrer(p);
    const premier = lire(p);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(premier);
  });

  it('settings without the plugin of GitHub are not written; a project without settings is left without', () => {
    const texte = '{"enabledPlugins":{"grillhouse@roomis-grillhouse":true}}';
    const p = projet(null);
    mkdirSync(path.join(p, '.claude'));
    writeFileSync(path.join(p, '.claude/settings.json'), texte);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(texte);
    const q = projet(null);
    expect(migrer(q)).toEqual([]);
    expect(existsSync(path.join(q, '.claude/settings.json'))).toBe(false);
  });
});
