// The cache of the root's lint and format check lives under `.cache-outils/`, a clean output of
// the module typescript, so the tools write it inside a session's envelope; the module, the root's
// and the template's package.json and .gitignore say so. Small tests: files read, nothing started.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import typescript from '../../../../scripts/langages/typescript/index.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const lire = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');
const scripts = (f: string) => (JSON.parse(lire(f)) as { scripts: Record<string, string> }).scripts;

const PACKAGES = ['package.json', 'templates/projet/package.json'];

describe('the cache of the lint and the format check of the root and of the template', () => {
  it('the module typescript declares .cache-outils among its clean outputs', () => {
    expect(typescript.sorties.propres).toContain('.cache-outils');
  });

  it('the module typescript keeps .cache-outils out of git', () => {
    expect(typescript.ignorer).toContain('.cache-outils');
  });

  it('the .gitignore of the root and the template’s ignore .cache-outils', () => {
    for (const f of ['.gitignore', 'templates/projet/_gitignore']) {
      expect(
        lire(f)
          .split('\n')
          .map(l => l.trim())
      ).toContain('.cache-outils/');
    }
  });

  for (const f of PACKAGES) {
    it(`${f}: lint and format:check keep their cache under .cache-outils/, eslint and prettier`, () => {
      const s = scripts(f);
      expect(s.lint).toMatch(/--cache-location \.cache-outils\/\S*/);
      expect(s['format:check']).toMatch(/--cache-location \.cache-outils\/\S*/);
      expect(s.lint).toContain('eslint');
      expect(s['format:check']).toContain('prettier');
      expect(s.lint).toContain('--cache ');
      expect(s['format:check']).toContain('--cache ');
    });

    it(`${f}: no script of the cache writes under node_modules/.cache/`, () => {
      const s = scripts(f);
      expect(s.lint).not.toContain('node_modules/.cache');
      expect(s['format:check']).not.toContain('node_modules/.cache');
    });

    it(`${f}: lint and format:check write no source (no --fix, no --write)`, () => {
      const s = scripts(f);
      for (const nom of ['lint', 'format:check']) {
        expect(s[nom]).not.toMatch(/--fix|--write/);
      }
    });

    it(`${f}: the cache path falls under a clean output of the module`, () => {
      const s = scripts(f);
      for (const nom of ['lint', 'format:check']) {
        const chemin = /--cache-location (\S+)/.exec(s[nom])?.[1] ?? '';
        expect(
          typescript.sorties.propres.some(p => chemin === p || chemin.startsWith(`${p}/`))
        ).toBe(true);
      }
    });
  }
});
