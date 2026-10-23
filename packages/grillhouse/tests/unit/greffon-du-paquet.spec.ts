// grillhouse-3uv.84.7: the frame arrives in one piece. The package npm `@roomi-fields/grillhouse`
// carries its plugin, as a package of ESLint carries its plugin: the published package holds the
// whole plugin (skills, agents, hooks of Claude Code, charter, meta-frame, panel) under
// `cadre/mods/grillhouse/` and, at its root, the marketplace that lists it
// (`.claude-plugin/marketplace.json`), both written by its prepack. A project declares the package's
// directory as a marketplace of its own (`./node_modules/@roomi-fields/grillhouse`) and enables the
// plugin `grillhouse@roomis-grillhouse`, which Claude Code reads in place from that folder. One
// version: the plugin takes the package's. The meta-frame is the plugin's, named by
// `${CLAUDE_PLUGIN_ROOT}/METACADRE.md`, which Claude Code resolves in a plugin's skills and the hook
// of the session's start in the charter it writes.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CHEMIN_DU_MARCHE,
  FICHIERS_DU_CADRE,
  GREFFON_DU_CADRE,
  MARCHE_DU_CADRE,
} from '../../scripts/cadre.mjs';
import { mettreAJour, rapport } from '../../scripts/grillhouse-maj.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';

const PAQUET = path.resolve(__dirname, '../..');
const DEPOT = path.resolve(PAQUET, '../..');
const GREFFON = path.join(DEPOT, 'mods/grillhouse');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'greffon-du-paquet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const lire = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const VERSION = (
  JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;
const ID = 'grillhouse@roomis-grillhouse';
const RACINE_DU_PLUGIN = '${CLAUDE_PLUGIN_ROOT}';

// A repository of the frame of trial: the package (its package.json, bin/, scripts/) beside a copy
// of the frame's files, so that its prepack writes in the trial and never in the repository.
function depotDEssai() {
  const depot = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const paquet = path.join(depot, 'packages/grillhouse');
  for (const f of ['package.json', 'bin', 'scripts']) {
    cpSync(path.join(PAQUET, f), path.join(paquet, f), { recursive: true });
  }
  for (const f of FICHIERS_DU_CADRE) {
    cpSync(path.join(DEPOT, f), path.join(depot, f), { recursive: true });
  }
  return paquet;
}

describe('critère 1 — the published package carries the whole plugin and the marketplace that lists it', () => {
  const paquet = depotDEssai();
  // npm pack, its lifecycle played (the prepack writes, the postpack removes), in the trial.
  const r = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: paquet,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const chemins =
    r.status === 0
      ? (JSON.parse(r.stdout) as { files: { path: string }[] }[])[0]!.files.map(f => f.path)
      : [];

  it('npm pack holds the marketplace, and the plugin’s skills, agents, hooks, charter, meta-frame and panel', () => {
    expect(r.status, r.stderr).toBe(0);
    for (const f of [
      '.claude-plugin/marketplace.json',
      'cadre/mods/grillhouse/.claude-plugin/plugin.json',
      'cadre/mods/grillhouse/charte.md',
      'cadre/mods/grillhouse/METACADRE.md',
      'cadre/mods/grillhouse/hooks/hooks.json',
      'cadre/mods/grillhouse/hooks/crochet.mjs',
      'cadre/mods/grillhouse/hooks/register.tsx',
      'cadre/mods/grillhouse/types/index.d.ts',
      'cadre/mods/grillhouse/skills/pitmaster/SKILL.md',
      'cadre/mods/grillhouse/skills/pitmaster/references/consigne-agent.md',
      'cadre/mods/grillhouse/agents/testwriter.md',
      'cadre/templates/projet/package.json',
    ]) {
      expect(chemins, f).toContain(f);
    }
    const competences = readdirSync(path.join(GREFFON, 'skills'));
    for (const c of competences) {
      expect(chemins, c).toContain(`cadre/mods/grillhouse/skills/${c}/SKILL.md`);
    }
    for (const a of readdirSync(path.join(GREFFON, 'agents'))) {
      expect(chemins, a).toContain(`cadre/mods/grillhouse/agents/${a}`);
    }
  });

  it('npm pack holds no test of the plugin, and the postpack leaves the trial as it was', () => {
    expect(chemins.filter(c => c.startsWith('cadre/mods/grillhouse/tests/'))).toEqual([]);
    expect(existsSync(path.join(paquet, 'cadre'))).toBe(false);
    expect(existsSync(path.join(paquet, '.claude-plugin'))).toBe(false);
  });

  it('the package publishes its marketplace beside bin/, scripts/ and cadre/', () => {
    const pkg = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
      files: string[];
    };
    expect([...pkg.files].sort()).toEqual(['.claude-plugin', 'bin', 'cadre', 'scripts']);
  });

  it('the marketplace lists the plugin grillhouse by its relative path under cadre/, the plugin carries the package’s version', () => {
    const p = depotDEssai();
    const e = spawnSync(process.execPath, [path.join(p, 'scripts/cadre.mjs'), '--empaqueter'], {
      encoding: 'utf8',
    });
    expect(e.status, e.stderr).toBe(0);
    const marche = JSON.parse(
      readFileSync(path.join(p, '.claude-plugin/marketplace.json'), 'utf8')
    ) as {
      name: string;
      owner: { name: string };
      plugins: { name: string; source: string }[];
    };
    expect(marche.name).toBe('roomis-grillhouse');
    expect(marche.owner.name).toBeTruthy();
    expect(marche.plugins).toHaveLength(1);
    expect(marche.plugins[0]).toMatchObject({
      name: 'grillhouse',
      source: './cadre/mods/grillhouse',
    });
    const manifeste = JSON.parse(
      readFileSync(path.join(p, 'cadre/mods/grillhouse/.claude-plugin/plugin.json'), 'utf8')
    ) as Record<string, unknown>;
    const source = JSON.parse(lire('mods/grillhouse/.claude-plugin/plugin.json')) as Record<
      string,
      unknown
    >;
    expect(manifeste).toEqual({ ...source, version: VERSION });
    expect(readFileSync(path.join(p, 'cadre/mods/grillhouse/charte.md'), 'utf8')).toBe(
      lire('mods/grillhouse/charte.md')
    );
    const n = spawnSync(process.execPath, [path.join(p, 'scripts/cadre.mjs'), '--nettoyer'], {
      encoding: 'utf8',
    });
    expect(n.status, n.stderr).toBe(0);
    expect(existsSync(path.join(p, 'cadre'))).toBe(false);
    expect(existsSync(path.join(p, '.claude-plugin'))).toBe(false);
  });

  it('the names the frame declares are those of the marketplace: roomis-grillhouse, grillhouse, the package’s directory', () => {
    expect(MARCHE_DU_CADRE).toBe('roomis-grillhouse');
    expect(GREFFON_DU_CADRE).toBe(ID);
    expect(CHEMIN_DU_MARCHE).toBe('./node_modules/@roomi-fields/grillhouse');
  });
});

describe('critère 2 — init and the update declare the package’s marketplace and enable its plugin', () => {
  const DECLARATION = {
    'roomis-grillhouse': {
      source: { source: 'directory', path: './node_modules/@roomi-fields/grillhouse' },
    },
  };

  it('the template of a project, which grillhouse init installs, declares the marketplace of the package and enables its plugin; no plugin of the frame comes from GitHub', () => {
    const r = JSON.parse(lire('templates/projet/.claude/settings.json')) as {
      enabledPlugins: Record<string, boolean>;
      extraKnownMarketplaces: Record<string, unknown>;
    };
    expect(r.enabledPlugins[ID]).toBe(true);
    expect(r.enabledPlugins).not.toHaveProperty('grillhouse@roomi-fields');
    expect(r.extraKnownMarketplaces).toMatchObject(DECLARATION);
  });

  it('the update writes the declaration and the plugin in the project’s settings, its other keys kept in their order', () => {
    const p = mkdtempSync(path.join(ESSAIS, 'maj-'));
    ecrire(p, 'package.json', `${JSON.stringify({ name: 'p' })}\n`);
    ecrire(
      p,
      '.claude/settings.json',
      `${JSON.stringify({
        model: 'opus',
        enabledPlugins: { 'rtfm@roomi-fields': true },
        extraKnownMarketplaces: {
          'roomi-fields': { source: { source: 'github', repo: 'roomi-fields/claude-plugins' } },
        },
      })}\n`
    );
    const b = mettreAJour(p, DEPOT);
    const r = JSON.parse(readFileSync(path.join(p, '.claude/settings.json'), 'utf8')) as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(r).slice(0, 3)).toEqual([
      'model',
      'enabledPlugins',
      'extraKnownMarketplaces',
    ]);
    expect(r.enabledPlugins).toEqual({ 'rtfm@roomi-fields': true, [ID]: true });
    expect(r.extraKnownMarketplaces).toEqual({
      'roomi-fields': { source: { source: 'github', repo: 'roomi-fields/claude-plugins' } },
      ...DECLARATION,
    });
    expect(rapport(b)).toContain(ID);
  });

  it('a second update changes no byte and reports no declaration', () => {
    const p = mkdtempSync(path.join(ESSAIS, 'maj-'));
    ecrire(p, 'package.json', `${JSON.stringify({ name: 'p' })}\n`);
    ecrire(p, '.claude/settings.json', '{}\n');
    mettreAJour(p, DEPOT);
    const premier = readFileSync(path.join(p, '.claude/settings.json'), 'utf8');
    const b = mettreAJour(p, DEPOT);
    expect(readFileSync(path.join(p, '.claude/settings.json'), 'utf8')).toBe(premier);
    expect(rapport(b)).not.toContain(ID);
  });

  it('the migration that takes the plugin off GitHub is one of the package', () => {
    expect(MIGRATIONS.map(m => m.nom)).toContain('greffon du paquet');
  });
});

describe('critère 3 — one version: the plugin takes the package’s', () => {
  it('the plugin’s manifest in the repository carries no version of its own', () => {
    const m = JSON.parse(lire('mods/grillhouse/.claude-plugin/plugin.json')) as object;
    expect(m).not.toHaveProperty('version');
  });

  it('the release, its workflow and its guide no longer name the plugin’s manifest', () => {
    for (const f of [
      'packages/grillhouse/scripts/sortie.mjs',
      '.github/workflows/release.yml',
      'CONTRIBUTING.md',
    ]) {
      expect(lire(f), f).not.toMatch(/plugin\.json/);
    }
  });
});

describe('critère 4 — the meta-frame is the plugin’s, named by a path that resolves in a new project', () => {
  it('METACADRE.md lives in the plugin, nowhere else in the repository', () => {
    expect(existsSync(path.join(GREFFON, 'METACADRE.md'))).toBe(true);
    expect(existsSync(path.join(DEPOT, 'METACADRE.md'))).toBe(false);
    expect(FICHIERS_DU_CADRE).not.toContain('METACADRE.md');
  });

  it('the charter and each skill that names the meta-frame name it at the plugin’s root', () => {
    const textes = [
      'mods/grillhouse/charte.md',
      ...readdirSync(path.join(GREFFON, 'skills')).map(c => `mods/grillhouse/skills/${c}/SKILL.md`),
    ];
    const nommants = textes.filter(f => lire(f).includes('METACADRE.md'));
    expect(nommants).toContain('mods/grillhouse/charte.md');
    for (const f of nommants) {
      const nus = [...lire(f).matchAll(/(\S*)METACADRE\.md/g)].filter(
        m => !m[1]!.endsWith(`${RACINE_DU_PLUGIN}/`)
      );
      expect(
        nus.map(m => m[0]),
        f
      ).toEqual([]);
    }
  });

  it('the hook of the session’s start writes the charter with the plugin’s root resolved, to a meta-frame that exists', () => {
    const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
    for (const sous of ['session-start', 'subagent-start']) {
      const r = spawnSync(process.execPath, [path.join(GREFFON, 'hooks/crochet.mjs'), sous], {
        encoding: 'utf8',
        input: '{}',
        env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: p },
      });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout, sous).not.toContain(RACINE_DU_PLUGIN);
      const texte =
        sous === 'subagent-start'
          ? (JSON.parse(r.stdout) as { hookSpecificOutput: { additionalContext: string } })
              .hookSpecificOutput.additionalContext
          : r.stdout;
      const chemin = /`([^`]*METACADRE\.md)`/.exec(texte)?.[1];
      expect(chemin, sous).toBe(path.join(GREFFON, 'METACADRE.md'));
      expect(existsSync(chemin!), sous).toBe(true);
    }
  });

  it('the circuit reads the meta-frame in the plugin under CADRE', () => {
    expect(readFileSync(path.join(PAQUET, 'scripts/circuit.mjs'), 'utf8')).toMatch(
      /const METACADRE = path\.join\(CADRE, 'mods', 'grillhouse', 'METACADRE\.md'\);/
    );
  });
});
