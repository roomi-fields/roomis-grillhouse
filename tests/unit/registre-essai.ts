import { existsSync, readFileSync } from 'node:fs';
import { expect, vi } from 'vitest';

// The trial helpers of the register (grillhouse-3uv.72): the end hook hands back at once and the
// reading of the transcript outlives it, so a test reads the register once its line has come.

// The register's lines, as written.
export const lignes = (registre: string) =>
  existsSync(registre)
    ? readFileSync(registre, 'utf8')
        .split('\n')
        .filter(x => x.trim())
    : [];

// The register once it holds `n` lines, within `timeout` milliseconds.
export const attendre = (registre: string, n: number, timeout = 20_000) =>
  vi.waitFor(
    () => {
      expect(lignes(registre).length).toBeGreaterThanOrEqual(n);
    },
    { timeout, interval: 100 }
  );

// No completion signal leaves a detached reading: a register that must stay as it is gets the time
// such a reading takes on the day's witnesses.
export const repos = () => new Promise(r => setTimeout(r, 3_000));
