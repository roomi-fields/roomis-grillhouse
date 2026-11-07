// The files the switch to Temporal removes (grillhouse-4nr.12, criterion 1) have no caller left:
// none exists any more, and no file of the repository names it, an import (which the guard of
// dead code also refuses, unresolved), a path a process is launched on, or a document; the
// changelog alone keeps their history. As a tombstone list: a file removed by the switch enters
// it, and leaves it never.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DEPOT = path.resolve(__dirname, '../../../..');

/** The files grillhouse-4nr.12 removes, from the root of the repository. */
const RETIRES = [
  'packages/grillhouse/scripts/demon.mjs',
  'packages/grillhouse/scripts/integration/file-attente.mjs',
  'packages/grillhouse/tests/unit/demon.spec.ts',
  'packages/grillhouse/tests/unit/circuit-detache.spec.ts',
  'packages/grillhouse/tests/unit/circuit.inattendu.nuit.test.ts',
  'packages/grillhouse-essais/tests/circuit.machine.nuit.spec.ts',
];

// The history of the changes, the lock files and the journal of Beads keep the old names.
const HISTOIRE = /(^|\/)CHANGELOG\.md$|-lock\.json$|\.jsonl$/;

// Each file of the repository that git holds or would add (`git ls-files`, the untracked ones
// not ignored included), whatever its extension, but the history and this list.
function textes(): string[] {
  return execFileSync(
    'git',
    ['-C', DEPOT, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
    .split('\0')
    .filter(
      f =>
        f &&
        !HISTOIRE.test(f) &&
        path.join(DEPOT, f) !== __filename &&
        existsSync(path.join(DEPOT, f)) &&
        statSync(path.join(DEPOT, f)).isFile()
    );
}

describe('the files the switch to Temporal removes have no caller left', () => {
  it('none of them exists any more', () => {
    for (const f of RETIRES) {
      expect(() => statSync(path.join(DEPOT, f)), f).toThrow();
    }
  });

  it('no file of the repository names one, by its path or its name', () => {
    const noms = RETIRES.map(f => path.basename(f));
    const lus = textes();
    // The walk reads the repository: its map and the core's scripts among them.
    expect(lus).toEqual(
      expect.arrayContaining(['STRUCTURE.md', 'packages/grillhouse/scripts/circuit.mjs'])
    );
    const appels = lus.flatMap(f => {
      const t = readFileSync(path.join(DEPOT, f), 'utf8');
      return noms.filter(n => t.includes(n)).map(n => `${f} → ${n}`);
    });
    expect(appels).toEqual([]);
  });
});
