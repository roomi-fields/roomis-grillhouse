import { mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';

// The dependencies of the repository <DEPOT>, linked one by one into <repo>, so that Vitest writes
// its cache in the project of trial: the projects of the night tests (./tests-de-nuit.ts), the
// package of a configuration of trial, a run of the night's configuration alone.
export function lierDependances(repo: string, DEPOT: string) {
  mkdirSync(path.join(repo, 'node_modules'));
  for (const e of readdirSync(path.join(DEPOT, 'node_modules'))) {
    if (e !== '.vite' && e !== '.vitest') {
      symlinkSync(path.join(DEPOT, 'node_modules', e), path.join(repo, 'node_modules', e));
    }
  }
}
