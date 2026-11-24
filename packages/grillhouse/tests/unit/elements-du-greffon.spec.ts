// The copy of the plugin leaves out what git ignores under the plugin's source (a cache a tool
// wrote there), as `npm pack` leaves out what .gitignore names.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { elementsDuGreffon } from '../../scripts/cadre.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'greffon-ignore-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('elementsDuGreffon', () => {
  it('leaves out an entry that git ignores and the entries the package never copies', () => {
    const depot = ESSAIS;
    spawnSync('git', ['init', '-q'], { cwd: depot });
    writeFileSync(path.join(depot, '.gitignore'), '.cache-outils/\n');
    const source = path.join(depot, 'mods', 'grillhouse');
    mkdirSync(path.join(source, '.cache-outils'), { recursive: true });
    writeFileSync(path.join(source, '.cache-outils', 'x'), 'x');
    mkdirSync(path.join(source, 'skills'), { recursive: true });
    writeFileSync(path.join(source, 'charte.md'), '# charte\n');
    mkdirSync(path.join(source, 'tests'), { recursive: true });
    expect(elementsDuGreffon(source)).toEqual(['charte.md', 'skills']);
  });
});
