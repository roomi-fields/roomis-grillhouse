import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The frame's repository in three directories: packages/grillhouse/ (the package npm, its scripts
// and its tests), mods/grillhouse/ (the mod) and templates/projet/ (the template of a project, the
// example application with its tests); the root is the frame's repository, private, whose
// workspaces hold the package, which carries the frame's base configuration of Vitest.

const PAQUET = path.resolve(__dirname, '../..');
const DEPOT = path.resolve(PAQUET, '../..');
const lire = (f: string) =>
  JSON.parse(readFileSync(path.join(DEPOT, f), 'utf8')) as Record<string, unknown>;

describe('the repository in three directories', () => {
  it('holds no script nor test at its root: the package holds them', () => {
    expect(existsSync(path.join(DEPOT, 'scripts'))).toBe(false);
    expect(existsSync(path.join(DEPOT, 'tests'))).toBe(false);
    expect(existsSync(path.join(PAQUET, 'scripts/circuit.mjs'))).toBe(true);
    expect(existsSync(path.join(PAQUET, 'scripts/vitest-config/base.mjs'))).toBe(true);
    expect(existsSync(path.join(PAQUET, 'tests/unit/circuit.spec.ts'))).toBe(true);
  });

  it('is private, its workspaces the packages', () => {
    const p = lire('package.json');
    expect(p.private).toBe(true);
    expect(p.workspaces).toEqual(['packages/*']);
  });

  it('gives the example application, its package.json and its tests to the template', () => {
    expect(existsSync(path.join(DEPOT, 'src'))).toBe(false);
    expect(existsSync(path.join(DEPOT, 'templates/projet/src/index.ts'))).toBe(true);
    expect(lire('templates/projet/package.json').name).toBe('@your-scope/project-name');
    expect(readdirSync(path.join(DEPOT, 'templates/projet/tests/unit')).sort()).toEqual([
      'config.spec.ts',
      'errors.spec.ts',
      'types.spec.ts',
    ]);
  });

  it('plays the frame’s tests in their package, as Turborepo’s task of a package', () => {
    expect(existsSync(path.join(DEPOT, 'vitest.config.ts'))).toBe(false);
    const p = lire('packages/grillhouse/package.json') as { scripts: Record<string, string> };
    expect(p.scripts['test:vitest']).toBe('vitest run');
    expect(existsSync(path.join(PAQUET, 'vitest.config.ts'))).toBe(true);
  });
});
