// The cache of Vite, where Vitest writes the results of a run, lives under `.cache-outils/vite`, a
// clean output of the module typescript: a copy's `node_modules` is a link to the main tree, so a
// clean output under it would stay read-only in the envelope. Small tests: the module and the two
// configurations read, nothing started.
import { describe, expect, it } from 'vitest';
import typescript from '../../../../scripts/langages/typescript/index.mjs';
import base from '../../../../scripts/langages/typescript/vitest-config/base.mjs';
import nuit from '../../../../scripts/langages/typescript/vitest.nuit.config.mjs';

const cacheDe = (config: unknown) => (config as { cacheDir?: string }).cacheDir;

describe('the cache of Vite of the typescript module', () => {
  it('the base configuration of the day puts the cache of Vite under .cache-outils/vite', () => {
    expect(cacheDe(base)).toBe('.cache-outils/vite');
  });

  it('the configuration of the night puts the cache of Vite under .cache-outils/vite', () => {
    expect(cacheDe(nuit)).toBe('.cache-outils/vite');
  });

  it('the cache of Vite is no longer a clean output under node_modules', () => {
    expect(typescript.sorties.propres).not.toContain('node_modules/.vite');
    expect(typescript.sorties.propres.some((s: string) => s.startsWith('node_modules'))).toBe(
      false
    );
  });

  it('the clean outputs of the module are .turbo and .cache-outils', () => {
    expect([...typescript.sorties.propres].sort()).toEqual(['.cache-outils', '.turbo']);
  });

  it('the cache of Vite falls under a clean output of the module', () => {
    const propres: string[] = typescript.sorties.propres;
    const cache = cacheDe(base) ?? '';
    expect(propres.some(s => cache === s || cache.startsWith(`${s}/`))).toBe(true);
  });

  it('the module ignores .cache-outils as a whole, with no pattern more for the cache of Vite', () => {
    expect(typescript.ignorer).toContain('.cache-outils');
    expect([...typescript.ignorer].sort()).toEqual(['.cache-outils', '.turbo', '.vitest-reports']);
  });
});
