import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// What the machine of a run offers the tests, read in one place (grillhouse-3uv.50): a test that
// needs a capacity of the machine creates it or skips with its reason, never fails for its lack.

// The root of trial of a test file outside the temp directory: a fresh directory under ~/.cache,
// named by <prefixe>, in the home <maison> of the session. The parent is created when the home
// lacks it, as on a CI runner.
export function racineSousLaMaison(prefixe: string, maison = homedir()): string {
  const cache = path.join(maison, '.cache');
  mkdirSync(cache, { recursive: true });
  return mkdtempSync(path.join(cache, prefixe));
}

// True when bwrap builds a sandbox on this machine: installed, and allowed its namespaces. A test
// that launches a real envelope runs under it (`it.runIf(canWrap)`, `describe.runIf(canWrap)`).
export const canWrap = spawnSync('bwrap', ['--dev-bind', '/', '/', 'true']).status === 0;

// True when the real bd (Beads) runs on this machine. A test that needs a real tickets base runs
// under it (`it.runIf(hasBd)`); a test that plays bd through a fake one on its PATH needs it not.
export const hasBd = spawnSync('bd', ['--version']).status === 0;
