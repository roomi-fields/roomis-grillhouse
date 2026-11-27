// grillhouse-bf5.4 — the CHANGELOG of Grillhouse lives in the folder of its published package,
// `packages/grillhouse/CHANGELOG.md` (changesets and lerna: one CHANGELOG.md per published
// package, carried by its npm archive), so the plan of any lot of the package holds it. A project
// whose root is its package keeps its CHANGELOG.md at the root. No test reads the CHANGELOG
// (grillhouse-an7): these tests read where it is, the readers' paths and the texts' wording.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DEPOT = path.resolve(__dirname, '../../../..');
const JOURNAL = 'packages/grillhouse/CHANGELOG.md';
const lire = (rel: string) => readFileSync(path.join(DEPOT, rel), 'utf8');
const plat = (rel: string) => lire(rel).replace(/\s+/g, ' ');

describe('grillhouse-bf5.4, critère 1 — le CHANGELOG est dans le dossier du paquet', () => {
  it('packages/grillhouse/CHANGELOG.md exists and the root holds no CHANGELOG.md', () => {
    expect(existsSync(path.join(DEPOT, JOURNAL))).toBe(true);
    expect(existsSync(path.join(DEPOT, 'CHANGELOG.md'))).toBe(false);
  });
});

describe('grillhouse-bf5.4, critère 2 — l’archive npm le liste', () => {
  it('npm pack --dry-run lists CHANGELOG.md among the files of the package', () => {
    const r = spawnSync(
      'npm',
      [
        'pack',
        '--dry-run',
        '--json',
        '--ignore-scripts',
        '--workspace',
        '@roomi-fields/grillhouse',
      ],
      { cwd: DEPOT, encoding: 'utf8' }
    );
    expect(r.status, r.stderr).toBe(0);
    const [paquet] = JSON.parse(r.stdout) as { files: { path: string }[] }[];
    expect(paquet.files.map(f => f.path)).toContain('CHANGELOG.md');
  });
});

describe('grillhouse-bf5.4, critère 5 — la relecture juge l’entrée dans le dossier du paquet publié', () => {
  it('the reviewer’s skill judges the entry in the CHANGELOG.md of the published package the lot touches', () => {
    const t = plat('mods/grillhouse/skills/relecteur/SKILL.md');
    expect(t).toMatch(/CHANGELOG\.md du paquet publié/);
    expect(t).toMatch(/dans le dossier de ce paquet/);
  });

  it('the reviewer’s skill keeps the root CHANGELOG.md for a project whose root is its package', () => {
    const t = plat('mods/grillhouse/skills/relecteur/SKILL.md');
    expect(t).toMatch(/dont la racine est son paquet/);
  });
});

describe('grillhouse-bf5.4, critère 6 — les consignes et documents disent la même règle', () => {
  const FRANCAIS = [
    'mods/grillhouse/skills/relecteur/SKILL.md',
    'mods/grillhouse/skills/explorateur/SKILL.md',
    'mods/grillhouse/skills/pitmaster/SKILL.md',
    'packages/grillhouse/docs/architecture/installation.md',
  ];
  const ANGLAIS = ['docs/agents/issue-tracker.md', 'templates/projet/docs/agents/issue-tracker.md'];

  it.each(FRANCAIS)('%s says the CHANGELOG.md is the one of the published package', f => {
    expect(plat(f)).toMatch(/CHANGELOG(\.md)? du paquet publié/);
  });

  it.each(ANGLAIS)('%s says the CHANGELOG.md is the one of the published package', f => {
    expect(plat(f)).toMatch(/CHANGELOG(\.md)? (of|in) the published package/);
  });

  it('CONTRIBUTING.md and STRUCTURE.md name the CHANGELOG.md of the package', () => {
    expect(lire('CONTRIBUTING.md')).toContain('`packages/grillhouse/CHANGELOG.md`');
    expect(lire('STRUCTURE.md')).toMatch(/CHANGELOG\.md\s+# .*published with the package/);
  });

  it('STRUCTURE.md places the CHANGELOG.md in packages/grillhouse, not at the root', () => {
    expect(lire('STRUCTURE.md')).not.toMatch(/^├── CHANGELOG\.md/m);
  });
});

describe('grillhouse-bf5.4, critère 8 — aucun lecteur ne vise le CHANGELOG.md de la racine', () => {
  it('the release script reads and writes the package’s CHANGELOG', () => {
    const t = lire('packages/grillhouse/scripts/sortie.mjs');
    expect(t).toContain('packages/grillhouse/CHANGELOG.md');
    expect(t).not.toMatch(/=\s*'CHANGELOG\.md'/);
  });

  it('the package’s lit list names the package’s CHANGELOG, not the root one', () => {
    const p = JSON.parse(lire('packages/grillhouse/package.json')) as {
      grillhouse: { lit: string[] };
    };
    expect(p.grillhouse.lit).toContain(JOURNAL);
    expect(p.grillhouse.lit).not.toContain('CHANGELOG.md');
  });

  it('the site’s sync reads the package’s CHANGELOG', () => {
    const t = lire('website/scripts/sync-docs.mjs');
    expect(t).toContain('packages/grillhouse/CHANGELOG.md');
    expect(t).not.toMatch(/resolve\(repoRoot, 'CHANGELOG\.md'\)/);
  });

  it('the site’s date and the docs workflow watch the package’s CHANGELOG', () => {
    const config = lire('website/docusaurus.config.ts');
    expect(config).toContain('packages/grillhouse/CHANGELOG.md');
    expect(config).not.toContain("'../CHANGELOG.md'");
    const flux = lire('.github/workflows/deploy-docs.yml');
    expect(flux).toContain('packages/grillhouse/CHANGELOG.md');
    expect(flux).not.toMatch(/- 'CHANGELOG\.md'/);
  });
});
