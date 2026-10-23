// grillhouse-3uv.84.7: the frame arrives in one piece. The package npm `@roomi-fields/grillhouse`
// is the frame's plugin, as a package of ESLint carries its plugin: its root holds the plugin's
// manifest and the whole plugin (skills, agents, hooks of Claude Code, charter, meta-frame, panel),
// written by its prepack, since a source npm of a marketplace has no subdirectory. The plugin stays
// published under roomi-fields: the marketplace roomi-fields/claude-plugins names the package, and
// what is a project's own (its charter, its settings, its version of the package) lives in the
// project, never in what is published; the marketplace of a project's own goes, by a migration.
// One version: the plugin's manifest receives the package's when it is packed. The meta-frame is
// the plugin's, named in a skill by `${CLAUDE_PLUGIN_ROOT}/METACADRE.md`, which Claude Code
// resolves in a plugin's skills, and in the charter as the file beside it; the package publishes
// its architecture (`docs/`), which the charter names at its path in a project
// (grillhouse-3uv.84.8).
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
import { ELEMENTS_DU_GREFFON, FICHIERS_DU_CADRE, PROPRES_DU_PAQUET } from '../../scripts/cadre.mjs';
import {
  GREFFON_DU_CADRE,
  MARCHE_DU_CADRE,
  mettreAJour,
  rapport,
} from '../../scripts/grillhouse-maj.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import { ENTREE_DU_MARCHE } from '../../scripts/sortie.mjs';

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
const RACINE_DU_PLUGIN = '${CLAUDE_PLUGIN_ROOT}';
const ROOMI = { source: { source: 'github', repo: 'roomi-fields/claude-plugins' } };

// A repository of the frame of trial: the package (its package.json, bin/, scripts/) beside a copy
// of the plugin and the template, so that its prepack writes in the trial and never in the
// repository.
function depotDEssai() {
  const depot = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const paquet = path.join(depot, 'packages/grillhouse');
  for (const f of ['package.json', 'bin', 'docs', 'scripts']) {
    cpSync(path.join(PAQUET, f), path.join(paquet, f), { recursive: true });
  }
  for (const f of [...FICHIERS_DU_CADRE, 'mods/grillhouse']) {
    cpSync(path.join(DEPOT, f), path.join(depot, f), { recursive: true });
  }
  return paquet;
}

// Whether the command claude answers on this machine.
const avecClaude = spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0;

describe('critère 1 — the published package is the plugin', () => {
  const paquet = depotDEssai();
  const destination = mkdtempSync(path.join(ESSAIS, 'paquet-'));
  // npm pack, its lifecycle played (the prepack writes, the postpack removes), in the trial.
  const r = spawnSync('npm', ['pack', '--json', '--pack-destination', destination], {
    cwd: paquet,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const rapportDuPaquet =
    r.status === 0
      ? (JSON.parse(r.stdout) as { filename: string; files: { path: string }[] }[])[0]!
      : { filename: '', files: [] };
  const chemins = rapportDuPaquet.files.map(f => f.path);
  // The package unpacked, as npm installs it.
  const deballe = mkdtempSync(path.join(ESSAIS, 'deballe-'));
  if (r.status === 0) {
    spawnSync('tar', ['-xzf', path.join(destination, rapportDuPaquet.filename), '-C', deballe]);
  }
  const racine = path.join(deballe, 'package');

  it('npm pack holds at its root the plugin’s manifest, skills, agents, hooks, charter, meta-frame and panel', () => {
    expect(r.status, r.stderr).toBe(0);
    for (const f of [
      '.claude-plugin/plugin.json',
      'charte.md',
      'METACADRE.md',
      'hooks/hooks.json',
      'hooks/crochet.mjs',
      'hooks/register.tsx',
      'types/index.d.ts',
      'skills/pitmaster/SKILL.md',
      'skills/pitmaster/references/consigne-agent.md',
      'agents/testwriter.md',
      'cadre/templates/projet/package.json',
      'bin/grillhouse.mjs',
      'docs/ARCHITECTURE.md',
    ]) {
      expect(chemins, f).toContain(f);
    }
    for (const c of readdirSync(path.join(GREFFON, 'skills'))) {
      expect(chemins, c).toContain(`skills/${c}/SKILL.md`);
    }
    for (const a of readdirSync(path.join(GREFFON, 'agents'))) {
      expect(chemins, a).toContain(`agents/${a}`);
    }
  });

  it('npm pack holds no test of the plugin nor its configuration of TypeScript, and the postpack leaves the trial as it was', () => {
    expect(chemins.filter(c => c.startsWith('tests/') || c === 'tsconfig.json')).toEqual([]);
    expect(chemins.filter(c => c.startsWith('cadre/mods/'))).toEqual([]);
    expect(readdirSync(paquet).sort()).toEqual(['bin', 'docs', 'package.json', 'scripts']);
  });

  it('the package publishes its own entries and each entry of the plugin, none of the same name', () => {
    const pkg = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
      files: string[];
    };
    expect([...pkg.files].sort()).toEqual([...PROPRES_DU_PAQUET, ...ELEMENTS_DU_GREFFON].sort());
    expect(ELEMENTS_DU_GREFFON.filter(e => PROPRES_DU_PAQUET.includes(e))).toEqual([]);
  });

  it('the unpacked package carries the plugin’s manifest at the package’s version, and the plugin’s files as they are', () => {
    const manifeste = JSON.parse(
      readFileSync(path.join(racine, '.claude-plugin/plugin.json'), 'utf8')
    ) as Record<string, unknown>;
    const source = JSON.parse(lire('mods/grillhouse/.claude-plugin/plugin.json')) as Record<
      string,
      unknown
    >;
    expect(manifeste).toEqual({ ...source, version: VERSION });
    for (const f of ['charte.md', 'METACADRE.md', 'hooks/hooks.json']) {
      expect(readFileSync(path.join(racine, f), 'utf8'), f).toBe(lire(`mods/grillhouse/${f}`));
    }
  });

  // grillhouse-3uv.84.8 critère 3: a new project imports the charter from the package it installs
  // (node_modules/@roomi-fields/grillhouse/, the unpacked package); each path the charter gives
  // resolves there, and in this repository, with no hook to substitute it.
  it('grillhouse-3uv.84.8 critère 3 — the meta-frame beside the charter, and each path of the package the charter names, resolve in the package installed and in the repository', () => {
    const charte = readFileSync(path.join(racine, 'charte.md'), 'utf8');
    expect(charte).not.toContain(RACINE_DU_PLUGIN);
    expect(charte.replace(/\s+/g, ' ')).toContain('`METACADRE.md`, à côté de cette charte');
    expect(existsSync(path.join(racine, 'METACADRE.md'))).toBe(true);
    expect(existsSync(path.join(GREFFON, 'METACADRE.md'))).toBe(true);
    const chemins = [...charte.matchAll(/`node_modules\/@roomi-fields\/grillhouse\/([^`]+)`/g)].map(
      m => m[1]!
    );
    expect(chemins).toContain('docs/ARCHITECTURE.md');
    for (const c of chemins) {
      expect(existsSync(path.join(racine, c)), c).toBe(true);
      expect(existsSync(path.join(PAQUET, c)), c).toBe(true);
    }
  });

  it.runIf(avecClaude)('claude plugin validate passes on the unpacked package', () => {
    const config = mkdtempSync(path.join(ESSAIS, 'config-claude-'));
    const v = spawnSync('claude', ['plugin', 'validate', racine], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, CLAUDE_CONFIG_DIR: config },
    });
    expect(v.status, `${v.stdout}\n${v.stderr}`).toBe(0);
    expect(v.stdout).toContain('Validation passed');
  });
});

describe('critère 2 — init and the update declare roomi-fields and enable grillhouse@roomi-fields', () => {
  // A project at <dossier>, its settings.
  function projet(dossier: string, reglages: Record<string, unknown> = {}) {
    const p = path.join(mkdtempSync(path.join(ESSAIS, 'parent-')), dossier);
    ecrire(p, 'package.json', `${JSON.stringify({ name: '@your-scope/project-name' })}\n`);
    ecrire(p, '.claude/settings.json', `${JSON.stringify(reglages)}\n`);
    return p;
  }
  const json = (p: string, f: string) =>
    JSON.parse(readFileSync(path.join(p, f), 'utf8')) as Record<string, Record<string, unknown>>;

  it('the frame’s plugin is grillhouse@roomi-fields, from the GitHub marketplace roomi-fields/claude-plugins', () => {
    expect(MARCHE_DU_CADRE).toBe('roomi-fields');
    expect(GREFFON_DU_CADRE).toBe('grillhouse@roomi-fields');
  });

  it('the template of a project declares roomi-fields and enables grillhouse@roomi-fields', () => {
    const r = JSON.parse(lire('templates/projet/.claude/settings.json')) as {
      enabledPlugins: Record<string, boolean>;
      extraKnownMarketplaces: Record<string, unknown>;
    };
    expect(r.enabledPlugins['grillhouse@roomi-fields']).toBe(true);
    expect(r.extraKnownMarketplaces['roomi-fields']).toEqual(ROOMI);
    expect(Object.keys(r.extraKnownMarketplaces)).toEqual(['roomi-fields']);
  });

  it('the update declares roomi-fields and enables grillhouse@roomi-fields, after the keys the settings hold; it writes no marketplace in the project', () => {
    const p = projet('BPScript', { model: 'opus', enabledPlugins: { 'rtfm@roomi-fields': true } });
    const b = mettreAJour(p, DEPOT);
    expect(existsSync(path.join(p, '.claude-plugin'))).toBe(false);
    const r = json(p, '.claude/settings.json');
    expect(Object.keys(r)).toEqual([
      'model',
      'enabledPlugins',
      'statusLine',
      'extraKnownMarketplaces',
    ]);
    expect(r.enabledPlugins).toEqual({
      'rtfm@roomi-fields': true,
      'grillhouse@roomi-fields': true,
    });
    expect(r.extraKnownMarketplaces).toEqual({ 'roomi-fields': ROOMI });
    expect(rapport(b)).toContain('grillhouse@roomi-fields');
  });

  it('a second update changes no byte and reports no declaration', () => {
    const p = projet('p');
    mettreAJour(p, DEPOT);
    const reglages = readFileSync(path.join(p, '.claude/settings.json'), 'utf8');
    const b = mettreAJour(p, DEPOT);
    expect(readFileSync(path.join(p, '.claude/settings.json'), 'utf8')).toBe(reglages);
    expect(rapport(b)).not.toContain('grillhouse@');
  });

  it('the migration that takes off the marketplace of the project is one of the package, and nothing writes one', () => {
    expect(MIGRATIONS.map(m => m.nom)).toContain('place de marché du projet');
    for (const f of ['scripts/grillhouse-maj.mjs', 'scripts/init.mjs', 'scripts/preparation.mjs']) {
      expect(readFileSync(path.join(PAQUET, f), 'utf8'), f).not.toMatch(
        /marketplace\.json|grillhouse-<projet>/
      );
    }
  });
});

describe('critère 3 — one version: the plugin takes the package’s', () => {
  it('the plugin’s manifest in the repository carries no version of its own', () => {
    const m = JSON.parse(lire('mods/grillhouse/.claude-plugin/plugin.json')) as object;
    expect(m).not.toHaveProperty('version');
  });

  it('the release, its workflow and its guide do not write the plugin’s manifest', () => {
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
    expect(ELEMENTS_DU_GREFFON).toContain('METACADRE.md');
  });

  it('each skill that names the meta-frame names it at the plugin’s root; the charter names it beside itself', () => {
    const competences = readdirSync(path.join(GREFFON, 'skills')).map(
      c => `mods/grillhouse/skills/${c}/SKILL.md`
    );
    const nommants = competences.filter(f => lire(f).includes('METACADRE.md'));
    expect(nommants.length).toBeGreaterThan(0);
    for (const f of nommants) {
      const nus = [...lire(f).matchAll(/(\S*)METACADRE\.md/g)].filter(
        m => !m[1]!.endsWith(`${RACINE_DU_PLUGIN}/`)
      );
      expect(
        nus.map(m => m[0]),
        f
      ).toEqual([]);
    }
    const charte = lire('mods/grillhouse/charte.md');
    expect(charte).not.toContain(RACINE_DU_PLUGIN);
    expect([...charte.matchAll(/(\S*)METACADRE\.md/g)].map(m => m[0])).toEqual(['(`METACADRE.md']);
  });

  it('grillhouse-3uv.84.8 critère 3 — the hook of the session’s start substitutes nothing: it reads neither the charter nor the plugin’s root', () => {
    const source = lire('mods/grillhouse/hooks/crochet.mjs');
    expect(source).not.toMatch(/charte\.md|replaceAll\(/);
  });
});

describe('critère 5 — the entry of the marketplace roomi-fields names the package npm', () => {
  it('the expected entry is the plugin grillhouse from the package @roomi-fields/grillhouse, without a subdirectory', () => {
    expect(ENTREE_DU_MARCHE).toEqual({
      name: 'grillhouse',
      source: { source: 'npm', package: '@roomi-fields/grillhouse' },
    });
  });

  it('the guide of a release names the gesture that sets it, once the package is published', () => {
    const guide = lire('CONTRIBUTING.md');
    expect(guide).toContain('roomi-fields/claude-plugins');
    expect(guide).toContain('"source": "npm"');
    expect(guide).toContain('npx grillhouse sortie --entree-du-marche');
  });
});
