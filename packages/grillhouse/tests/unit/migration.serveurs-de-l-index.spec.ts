// The migration of the index servers (scripts/migrations/serveurs-de-l-index.mjs): the .mcp.json of a
// project receives the servers of the index, codegraph and rtfm, that it lacks; the agents of the
// project read them (scripts/droits.mjs). Small tests: files under a temporary directory.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { afterAll, describe, expect, it } from 'vitest';
import { optionsDuRole } from '../../scripts/droits.mjs';
import { copierLeGabarit } from '../../scripts/init.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import * as migration from '../../scripts/migrations/serveurs-de-l-index.mjs';

const { migrer, restes } = migration;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-serveurs-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Serveur = { command: string; args?: string[]; env?: Record<string, string> };

function projet(mcp: string | null, greffons?: Record<string, boolean>) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  declarerLeLangage(p);
  if (mcp !== null) {
    writeFileSync(path.join(p, '.mcp.json'), mcp);
  }
  if (greffons) {
    mkdirSync(path.join(p, '.claude'));
    writeFileSync(
      path.join(p, '.claude/settings.json'),
      JSON.stringify({ enabledPlugins: greffons })
    );
  }
  return p;
}
const lire = (p: string) => readFileSync(path.join(p, '.mcp.json'), 'utf8');
const serveurs = (p: string) =>
  (JSON.parse(lire(p)) as { mcpServers: Record<string, Serveur> }).mcpServers;

// The servers a session of <role> receives, in a project whose plugins are installed in <home>.
function serveursDeLaSeance(racine: string, home: string, role = 'developpeur') {
  const args = optionsDuRole(role, { racine, copie: racine, ticket: 'demo-1', home });
  return (
    JSON.parse(args[args.indexOf('--mcp-config') + 1]!) as {
      mcpServers: Record<string, Serveur>;
    }
  ).mcpServers;
}

// A home where the plugin rtfm is installed for the user.
function maisonAvecRtfm() {
  const home = mkdtempSync(path.join(ESSAIS, 'home-'));
  const greffon = path.join(home, '.claude/plugins/cache/roomi-fields/rtfm/9.9.9');
  mkdirSync(path.join(greffon, '.claude-plugin'), { recursive: true });
  writeFileSync(
    path.join(greffon, '.claude-plugin/plugin.json'),
    JSON.stringify({ mcpServers: { rtfm: { command: '${CLAUDE_PLUGIN_ROOT}/bin/rtfm-serve' } } })
  );
  writeFileSync(
    path.join(home, '.claude/plugins/installed_plugins.json'),
    JSON.stringify({ plugins: { 'rtfm@roomi-fields': [{ scope: 'user', installPath: greffon }] } })
  );
  return { home, greffon };
}

describe('migration of the index servers — the .mcp.json of a project has the servers of the index', () => {
  it('is in the list', () => {
    expect(MIGRATIONS).toContain(migration);
  });

  it('creates .mcp.json with codegraph and rtfm in a project that has none', () => {
    const p = projet(null);
    const lignes = migrer(p);
    expect(serveurs(p).codegraph).toMatchObject({ command: 'codegraph', args: ['serve', '--mcp'] });
    expect(serveurs(p).rtfm).toMatchObject({
      command: 'rtfm-serve',
      env: { RTFM_DB: '.rtfm/library.db' },
    });
    expect(lignes.join('\n')).toMatch(/\.mcp\.json.*codegraph.*rtfm/);
  });

  it('adds the missing server only, the other entries kept', () => {
    const autre = { command: 'autre', args: ['x'] };
    const rtfm = { command: '/usr/bin/python3', args: ['-m', 'rtfm.mcp'] };
    const p = projet(JSON.stringify({ mcpServers: { autre, rtfm }, cle: 1 }, null, 4));
    migrer(p);
    expect(serveurs(p).autre).toEqual(autre);
    expect(serveurs(p).rtfm).toEqual(rtfm);
    expect(serveurs(p).codegraph?.command).toBe('codegraph');
    expect((JSON.parse(lire(p)) as { cle: number }).cle).toBe(1);
    expect(lire(p)).toContain('\n    "mcpServers"');
  });

  it('adds mcpServers to a file that declares none', () => {
    const p = projet('{}\n');
    migrer(p);
    expect(Object.keys(serveurs(p))).toEqual(['codegraph', 'rtfm']);
  });

  it('changes no byte of a project that has both, and says nothing; a second pass too', () => {
    const texte = '{"mcpServers":{"rtfm":{"command":"a"},"codegraph":{"command":"b"}}}';
    const p = projet(texte);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(texte);
    const neuf = projet(null);
    migrer(neuf);
    const apres = lire(neuf);
    expect(migrer(neuf)).toEqual([]);
    expect(lire(neuf)).toBe(apres);
  });

  it.each(['{ "mcpServers": ', '[]', '{ "mcpServers": [] }'])(
    'leaves to the project a file it cannot read as a configuration (%s)',
    texte => {
      const p = projet(texte);
      const lignes = migrer(p) as { aFaire: string }[];
      expect(lignes).toHaveLength(1);
      expect(lignes[0]?.aFaire).toContain('.mcp.json');
      expect(lire(p)).toBe(texte);
    }
  );

  it('tells a project that does not enable the plugin rtfm what stays to it', () => {
    const sans = projet(null, {});
    migrer(sans);
    expect(restes(sans).join('\n')).toContain('rtfm@roomi-fields');
    const avec = projet(null, { 'rtfm@roomi-fields': true });
    migrer(avec);
    expect(restes(avec)).toEqual([]);
    const sienne = projet('{"mcpServers":{"rtfm":{"command":"a"}}}');
    migrer(sienne);
    expect(restes(sienne)).toEqual([]);
    expect(existsSync(path.join(sienne, '.claude'))).toBe(false);
  });
});

describe('a project grillhouse init creates', () => {
  it('has both servers of the index, and nothing of rtfm stays to it', () => {
    const p = mkdtempSync(path.join(ESSAIS, 'neuf-'));
    copierLeGabarit(p);
    expect(Object.keys(serveurs(p)).sort()).toEqual(['codegraph', 'rtfm']);
    expect(restes(p)).toEqual([]);
  });
});

describe('a session of an agent of the migrated project', () => {
  it.each(['explorateur', 'testwriter', 'developpeur', 'relecteur'])(
    'gives the %s both servers of the index',
    role => {
      const p = projet(null);
      const home = mkdtempSync(path.join(ESSAIS, 'home-'));
      expect(serveursDeLaSeance(p, home, role)).toEqual({});
      migrer(p);
      expect(Object.keys(serveursDeLaSeance(p, home, role)).sort()).toEqual(['codegraph', 'rtfm']);
    }
  );

  it('runs the program the enabled plugin ships, with the env of the project', () => {
    const p = projet(null, { 'rtfm@roomi-fields': true });
    const { home, greffon } = maisonAvecRtfm();
    migrer(p);
    expect(serveursDeLaSeance(p, home).rtfm).toMatchObject({
      command: `${greffon}/bin/rtfm-serve`,
      env: { RTFM_DB: '.rtfm/library.db' },
    });
  });

  it('keeps a command of the project that is not the program of the plugin', () => {
    const p = projet('{"mcpServers":{"rtfm":{"command":"/opt/rtfm-serve"}}}', {
      'rtfm@roomi-fields': true,
    });
    const { home } = maisonAvecRtfm();
    expect(serveursDeLaSeance(p, home).rtfm).toEqual({ command: '/opt/rtfm-serve' });
  });
});
