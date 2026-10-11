import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The trial harness of the dead-code guard: the real guard (knip) run in a repository built in
// a fresh directory under <racine>, its modules linked to this repository's node_modules.
const SCRIPT = path.resolve(__dirname, '../../scripts/code-mort.mjs');
const MODULES = path.resolve(__dirname, '../../node_modules');

// Each file is written at its path; a file given as null is left out of the repository.
export function codeMortEssai(racine: string, files: Record<string, string | null>) {
  const dir = mkdtempSync(path.join(racine, 'code-mort-'));
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) {
      continue;
    }
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  symlinkSync(MODULES, path.join(dir, 'node_modules'));
  const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  return { dir, status: r.status, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}
