// grillhouse-3uv.29: one contract for the suites adapter, `integration:suites`: `--tous`, or a
// non-empty list of components' directories. An empty list is no way to say « every suite » (nx
// `affected --all`, turbo `--filter`): a call without argument is refused.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../..');
const ADAPTATEUR = path.join(RACINE, 'scripts/integration/suites-vitest.mjs');
const INTEGRER = path.join(RACINE, 'scripts/integration/integrer.mjs');

// A project with a component src/a, and a stand-in for npx that records its arguments, one call
// per line, and exits with the code written in CODE (0 otherwise).
function projet() {
  const repo = mkdtempSync(path.join(tmpdir(), 'suites-'));
  const bin = mkdtempSync(path.join(tmpdir(), 'bin-'));
  const appels = path.join(bin, 'appels');
  writeFileSync(
    path.join(bin, 'npx'),
    `#!/bin/sh\necho "$*" >> ${appels}\nexit "$(cat ${bin}/CODE 2>/dev/null || echo 0)"\n`,
    { mode: 0o755 }
  );
  mkdirSync(path.join(repo, 'src/a'), { recursive: true });
  writeFileSync(path.join(repo, 'src/a/index.ts'), 'export const a = 1;\n');
  writeFileSync(path.join(repo, 'src/a/a.spec.ts'), 'test\n');
  const lancer = (...args: string[]) =>
    spawnSync('node', [ADAPTATEUR, ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ROUGES: path.join(bin, 'rouges') },
    });
  const lus = () =>
    existsSync(appels) ? readFileSync(appels, 'utf8').trim().split('\n').filter(Boolean) : [];
  return { repo, bin, lancer, appels: lus };
}

describe('critère 6 — the suites adapter: --tous, or a non-empty list of components', () => {
  it('critère 6: --tous runs every suite (vitest run), budget benches excluded', () => {
    const p = projet();
    const r = p.lancer('--tous');
    expect(r.status, r.stderr).toBe(0);
    const appels = p.appels();
    expect(appels).toHaveLength(1);
    expect(appels[0]).toMatch(/^vitest run /);
    expect(appels[0]).not.toMatch(/related/);
    expect(appels[0]).not.toMatch(/--tous/);
    expect(appels[0]).toMatch(/--exclude=\S*budget/);
  });
  it("critère 6: --tous gives back Vitest's exit code", () => {
    const p = projet();
    writeFileSync(path.join(p.bin, 'CODE'), '1');
    expect(p.lancer('--tous').status).toBe(1);
  });
  it('critère 6: a call without argument is refused, with a message, and runs nothing', () => {
    const p = projet();
    const r = p.lancer();
    expect(r.status).not.toBe(0);
    expect(r.stderr.trim()).not.toBe('');
    expect(r.stderr).toMatch(/--tous/);
    expect(p.appels()).toEqual([]);
  });
  it('critère 6: a list of components runs the tests related to their files', () => {
    const p = projet();
    const r = p.lancer('src/a');
    expect(r.status, r.stderr).toBe(0);
    const appels = p.appels();
    expect(appels).toHaveLength(1);
    expect(appels[0]).toMatch(/^vitest related /);
    expect(appels[0]).toMatch(/src\/a\/index\.ts/);
  });
});

describe('critère 8 — --tous given with components is an ambiguous call, refused', () => {
  for (const args of [
    ['--tous', 'src/a'],
    ['src/a', '--tous'],
  ]) {
    it(`critère 8: ${args.join(' ')} is refused, with a message, and runs nothing`, () => {
      const p = projet();
      const r = p.lancer(...args);
      expect(r.status).not.toBe(0);
      expect(r.stderr.trim()).not.toBe('');
      expect(r.stderr).toMatch(/--tous/);
      // A refusal the adapter states, not a crash on « --tous » read as a directory.
      expect(r.stderr).not.toMatch(/ENOENT|^\s+at /m);
      expect(p.appels()).toEqual([]);
    });
  }
});

// The header of a script: its comment lines before the first import.
const entete = (fichier: string) => readFileSync(fichier, 'utf8').split(/^import /m)[0];

describe('critère 7 — every text that describes the contract of integration:suites says --tous', () => {
  it('critère 7: the header of integrer.mjs says --tous, and no longer « none for every suite »', () => {
    const t = entete(INTEGRER);
    expect(t).toMatch(/--tous/);
    expect(t).not.toMatch(/none for every suite/);
  });
  it('critère 7: the header of suites-vitest.mjs says --tous, and no longer « without argument »', () => {
    const t = entete(ADAPTATEUR);
    expect(t).toMatch(/--tous/);
    expect(t).not.toMatch(/without argument, every test/);
  });
  it('critère 7: the line of suites-vitest.mjs in STRUCTURE.md says --tous', () => {
    const lignes = readFileSync(path.join(RACINE, 'STRUCTURE.md'), 'utf8')
      .split('\n')
      .filter(l => /suites-vitest\.mjs/.test(l));
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) {
      expect(l).toMatch(/--tous/);
    }
  });
  it('critère 7: every document of the repository that names integration:suites says --tous', () => {
    const docs: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (['node_modules', 'dist', '.git', 'worktrees', 'coverage'].includes(e.name)) {
          continue;
        }
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          walk(p);
        } else if (e.name.endsWith('.md')) {
          docs.push(p);
        }
      }
    };
    walk(RACINE);
    const nommant = docs.filter(f => /integration:suites/.test(readFileSync(f, 'utf8')));
    for (const f of nommant) {
      expect(readFileSync(f, 'utf8'), path.relative(RACINE, f)).toMatch(/--tous/);
    }
  });
});
