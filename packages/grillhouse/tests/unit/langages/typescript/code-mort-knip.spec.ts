import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// grillhouse-3uv.56 critère 18: scripts/langages/typescript/code-mort.mjs reads two internal modules of knip by their
// path (dist/util/workspace.js, dist/schema/configuration.js). When one is missing, the guard
// refuses in plain words, naming knip, without a stack trace.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'code-mort-knip-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../../../scripts/langages/typescript/code-mort.mjs');
const MODULES = path.resolve(__dirname, '../../../../../../node_modules');
const KNIP = path.join(MODULES, 'knip');

// <dst> mirrors the knip package at <src>: each entry a link to its original, except dist,
// dist/util and dist/schema, rebuilt as real directories the same way, dist/index.js copied, and
// <manque> (a path under the package) left out.
function miroir(src: string, dst: string, rel: string, manque: string) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src)) {
    const r = rel ? `${rel}/${e}` : e;
    if (r === manque) {
      continue;
    }
    if (['dist', 'dist/util', 'dist/schema'].includes(r)) {
      miroir(path.join(src, e), path.join(dst, e), r, manque);
    } else if (r === 'dist/index.js') {
      // The entry the guard resolves knip by: a real file, so the guard reads this tree.
      copyFileSync(path.join(src, e), path.join(dst, e));
    } else {
      symlinkSync(path.join(src, e), path.join(dst, e));
    }
  }
}

// A clean repository whose knip is the real one with <manque> (a path under the package) left out;
// none left out with ''.
function essai(manque: string) {
  const dir = mkdtempSync(path.join(ESSAIS, 'essai-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'r', private: true }));
  writeFileSync(
    path.join(dir, 'knip.json'),
    JSON.stringify({ entry: ['src/index.ts'], project: ['src/**/*.ts'] })
  );
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src/index.ts'), 'export const i = 1;\n');
  const nm = path.join(dir, 'node_modules');
  mkdirSync(nm);
  for (const e of readdirSync(MODULES)) {
    if (e !== 'knip') {
      symlinkSync(path.join(MODULES, e), path.join(nm, e));
    }
  }
  miroir(KNIP, path.join(nm, 'knip'), '', manque);
  const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('grillhouse-3uv.56 critère 18 — the dead-code guard refuses plainly a knip it cannot read', () => {
  it('critère 18 (témoin): the same knip, nothing left out, is read: a clean repository passes', () => {
    const r = essai('');
    expect(r.sortie).not.toMatch(/illisible/);
    expect(r.status, r.sortie).toBe(0);
  });
  for (const manque of ['dist/util/workspace.js', 'dist/schema/configuration.js']) {
    it(`critère 18: without ${manque}, the guard refuses (exit 1) in plain words naming knip, no stack trace`, () => {
      const r = essai(manque);
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toMatch(/⛔ CODE MORT — .*knip/);
      expect(r.sortie).not.toMatch(/^\s+at /m);
    });
  }
});
