import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrer, nom, version } from '../../scripts/migrations/0.25.0-script-des-tests.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';

// grillhouse-pkl.2, criterion 4: the script of the tests is named `test:unit` for every language
// (decision 4 of the epic grillhouse-pkl, Romain's word of 2026-10-29). The update rewrites a
// project's `test:vitest` (BPScript's packages among them) into `test:unit`, in each package.json
// and in each turbo.json, without alias: the former name never stays beside the new one.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-script-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const ANCIEN = 'test:vitest';
const TURBO = json({
  tasks: {
    build: { dependsOn: ['^build'] },
    [ANCIEN]: { dependsOn: ['build', '^build'], env: ['GRILLHOUSE_TESTS'] },
  },
});

// A project of two packages of the frame and one out of it, as BPScript's: the root declares
// no test script, each package its own.
function projet(scripts: Record<string, string> = { [ANCIEN]: 'vitest run' }) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  const ecrire = (rel: string, texte: string) => {
    mkdirSync(path.dirname(path.join(p, rel)), { recursive: true });
    writeFileSync(path.join(p, rel), texte);
  };
  ecrire('package.json', json({ name: 'p', workspaces: ['packages/*'], scripts: { test: 'x' } }));
  ecrire('turbo.json', TURBO);
  for (const d of ['a', 'b', 'h']) {
    ecrire(
      `packages/${d}/package.json`,
      json({ name: `@p/${d}`, scripts: { build: 'tsc', ...scripts, lint: 'eslint .' } })
    );
  }
  ecrire('packages/a/turbo.json', json({ extends: ['//'], tasks: { [ANCIEN]: { inputs: [] } } }));
  ecrire('docs/agents/hors-cadre.txt', 'h hors du cadre\n');
  return p;
}
const lire = (p: string, rel: string) => readFileSync(path.join(p, rel), 'utf8');
const scripts = (p: string, d: string) =>
  (JSON.parse(lire(p, `packages/${d}/package.json`)) as { scripts: Record<string, string> })
    .scripts;

describe('migration 0.25.0 — the script of the tests is test:unit', () => {
  it('is the migration of 0.25.0, « nom du script des tests », in the list', () => {
    expect(version).toBe('0.25.0');
    expect(nom).toBe('nom du script des tests');
    expect(MIGRATIONS.some(m => m.version === version && m.nom === nom)).toBe(true);
  });

  it('rewrites test:vitest into test:unit in each package of the frame and each turbo.json, at its place', () => {
    const p = projet();
    const lignes = migrer(p);
    expect(lignes).toEqual([
      'packages/a/package.json : le script test:vitest devient test:unit',
      'packages/b/package.json : le script test:vitest devient test:unit',
      'turbo.json : la tâche test:vitest devient test:unit',
      'packages/a/turbo.json : la tâche test:vitest devient test:unit',
    ]);
    for (const d of ['a', 'b']) {
      expect(Object.keys(scripts(p, d))).toEqual(['build', 'test:unit', 'lint']);
      expect(scripts(p, d)['test:unit']).toBe('vitest run');
    }
    expect(lire(p, 'turbo.json')).toBe(TURBO.replace(ANCIEN, 'test:unit'));
    expect(lire(p, 'packages/a/turbo.json')).not.toContain(ANCIEN);
    // A package out of the frame is the project's own.
    expect(scripts(p, 'h')).toHaveProperty(ANCIEN);
  });

  it('a package that holds both, the same command, keeps test:unit alone; two commands are left to the project', () => {
    const p = projet({ [ANCIEN]: 'vitest run', 'test:unit': 'vitest run' });
    migrer(p);
    expect(scripts(p, 'a')).not.toHaveProperty(ANCIEN);
    expect(scripts(p, 'a')['test:unit']).toBe('vitest run');
    const q = projet({ [ANCIEN]: 'vitest run', 'test:unit': 'node autre.mjs' });
    const sortie: unknown = migrer(q);
    const aFaire = (sortie as (string | { aFaire: string })[]).flatMap(l =>
      typeof l === 'string' ? [] : [l.aFaire]
    );
    expect(
      aFaire.some(l => l.startsWith('packages/a/package.json : test:vitest et test:unit'))
    ).toBe(true);
    expect(scripts(q, 'a')).toEqual({
      build: 'tsc',
      [ANCIEN]: 'vitest run',
      'test:unit': 'node autre.mjs',
      lint: 'eslint .',
    });
  });

  it('a second pass changes no byte and reports nothing', () => {
    const p = projet();
    migrer(p);
    const avant = [
      'package.json',
      'turbo.json',
      'packages/a/package.json',
      'packages/a/turbo.json',
    ];
    const premier = avant.map(f => lire(p, f));
    expect(migrer(p)).toEqual([]);
    expect(avant.map(f => lire(p, f))).toEqual(premier);
  });
});
