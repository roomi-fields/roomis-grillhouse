// Every call of bd in the frame's scripts gives its output the same room as the calls of git
// (`maxBuffer`, 256 MiB): past the 1 MiB a child process returns by default, the comments of a
// long ticket were cut, and the read failed (bp-mono-vbwf.320.16, about 1.15 MiB of comments).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(import.meta.dirname, '../..');

// The .mjs files under <dossier>, relative to the root.
function scripts(dossier: string): string[] {
  return readdirSync(path.join(RACINE, dossier), { withFileTypes: true }).flatMap(e => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) {
      return e.name === 'node_modules' ? [] : scripts(p);
    }
    return e.name.endsWith('.mjs') ? [p] : [];
  });
}

// Each call `spawnSync('bd', …)` or `execFileSync('bd', …)` of <texte>, up to its closing paren.
function appels(texte: string): string[] {
  return [...texte.matchAll(/\b(?:spawnSync|execFileSync)\(\s*'bd'/g)].map(m => {
    let profondeur = 0;
    for (let i = m.index + m[0].indexOf('('); i < texte.length; i++) {
      if (texte[i] === '(') {
        profondeur++;
      }
      if (texte[i] === ')' && --profondeur === 0) {
        return texte.slice(m.index, i + 1);
      }
    }
    return texte.slice(m.index);
  });
}

describe('the reads of bd', () => {
  it('give every call of bd in scripts/ a maxBuffer of 256 MiB', () => {
    const sansTampon = scripts('scripts').flatMap(f =>
      appels(readFileSync(path.join(RACINE, f), 'utf8'))
        .filter(a => !a.includes('maxBuffer: 256 * 1024 * 1024'))
        .map(a => `${f} : ${a.split('\n')[0]}`)
    );
    expect(
      scripts('scripts').some(f => appels(readFileSync(path.join(RACINE, f), 'utf8')).length)
    ).toBe(true);
    expect(sansTampon).toEqual([]);
  });
});
