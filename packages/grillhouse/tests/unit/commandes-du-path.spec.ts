// The one search of a command in the PATH (scripts/commandes-du-path.mjs), as `command -v` finds
// it: the first folder of PATH that holds an executable file of its name.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { trouverDansLePath } from '../../scripts/commandes-du-path.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'commandes-du-path-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('the search of a command in the PATH', () => {
  it('finds it in the first folder of PATH that holds it, executable', () => {
    writeFileSync(path.join(ESSAIS, 'outil'), '#!/bin/sh\n', { mode: 0o755 });
    writeFileSync(path.join(ESSAIS, 'texte'), '', { mode: 0o644 });
    expect(trouverDansLePath('outil', { PATH: `/absent:${ESSAIS}` })).toBe(
      path.join(ESSAIS, 'outil')
    );
    expect(trouverDansLePath('texte', { PATH: ESSAIS })).toBeNull();
    expect(trouverDansLePath('outil', {})).toBeNull();
  });
});
