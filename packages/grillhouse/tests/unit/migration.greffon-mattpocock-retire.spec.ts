import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';

// The four skills of the plugin of mattpocock live in the frame's plugin: a project's
// .claude/settings.json no longer enables the whole plugin, and the update removes it once.
// The module is loaded by each test, so that its absence is a red test, not a file that fails to load.
const charger = () => import('../../scripts/migrations/0.35.0-greffon-mattpocock-retire.mjs');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-greffon-mattpocock-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MATT = 'mattpocock-skills@claude-plugins-official';
const REGLAGES = '.claude/settings.json';

function projet(reglages?: string) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(p, 'package.json'), '{"name":"p"}\n');
  if (reglages !== undefined) {
    mkdirSync(path.join(p, '.claude'));
    writeFileSync(path.join(p, REGLAGES), reglages);
  }
  return p;
}
const lire = (p: string) => readFileSync(path.join(p, REGLAGES), 'utf8');
const AUTRES = {
  $schema: 'https://example.test/schema.json',
  permissions: { allow: ['Bash(git *)'], deny: [] },
  enabledPlugins: { [MATT]: true, 'rtfm@roomi-fields': true, 'grillhouse@roomi-fields': true },
  extraKnownMarketplaces: { 'roomi-fields': { source: { source: 'github', repo: 'a/b' } } },
};
const avecMatt = () => JSON.stringify(AUTRES, null, 2) + '\n';

describe('migration — the plugin mattpocock-skills leaves enabledPlugins', () => {
  it('is in the list of the migrations, after the version of the package that precedes it', async () => {
    const { nom, version } = await charger();
    expect(MIGRATIONS.some(m => m.version === version && m.nom === nom)).toBe(true);
    const [maj, min, cor] = version.split('.').map(Number);
    expect(maj * 1e6 + min * 1e3 + cor).toBeGreaterThan(34_001);
  });

  it('removes the plugin and keeps the other plugins and the other keys', async () => {
    const { migrer } = await charger();
    const p = projet(avecMatt());
    const lignes = migrer(p);
    expect(lignes).toHaveLength(1);
    const { enabledPlugins, ...reste } = JSON.parse(lire(p)) as Record<string, unknown>;
    expect(enabledPlugins).toEqual({ 'rtfm@roomi-fields': true, 'grillhouse@roomi-fields': true });
    const { enabledPlugins: _e, ...resteAttendu } = AUTRES;
    expect(reste).toEqual(resteAttendu);
  });

  it('removes the plugin whatever its value, even disabled', async () => {
    const { migrer } = await charger();
    const p = projet(
      JSON.stringify({ enabledPlugins: { [MATT]: false, 'rtfm@roomi-fields': true } })
    );
    expect(migrer(p)).toHaveLength(1);
    const lu = JSON.parse(lire(p)) as { enabledPlugins: unknown };
    expect(lu.enabledPlugins).toEqual({ 'rtfm@roomi-fields': true });
  });

  it('a second pass changes no byte and reports nothing', async () => {
    const { migrer } = await charger();
    const p = projet(avecMatt());
    migrer(p);
    const apres = lire(p);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(apres);
  });

  it('writes nothing for a project without .claude/settings.json', async () => {
    const { migrer } = await charger();
    const p = projet();
    expect(migrer(p)).toEqual([]);
    expect(existsSync(path.join(p, '.claude'))).toBe(false);
  });

  it('writes nothing for settings without enabledPlugins or without the plugin', async () => {
    const { migrer } = await charger();
    for (const texte of [
      '{ "permissions": { "allow": [] } }\n',
      '{"enabledPlugins":{"rtfm@roomi-fields":true}}',
      '{"enabledPlugins":{}}\n',
    ]) {
      const p = projet(texte);
      expect(migrer(p)).toEqual([]);
      expect(lire(p)).toBe(texte);
    }
  });

  it('its line names the plugin removed, how to enable it again by hand, and the four replacements', async () => {
    const { migrer } = await charger();
    const [ligne] = migrer(projet(avecMatt()));
    const texte = typeof ligne === 'string' ? ligne : JSON.stringify(ligne);
    expect(texte).toContain(MATT);
    expect(texte).toMatch(/réactiv/);
    expect(texte).toContain('enabledPlugins');
    for (const nomCompetence of [
      'grillhouse:grilling',
      'grillhouse:writing-for-agents',
      'grillhouse:codebase-design',
      'grillhouse:domain-modeling',
    ]) {
      expect(texte).toContain(nomCompetence);
    }
    expect(texte).not.toContain('mattpocock-skills:');
  });
});
