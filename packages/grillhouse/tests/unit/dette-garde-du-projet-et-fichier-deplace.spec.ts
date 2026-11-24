import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { abaisser, FICHIER, scriptDeLaBase } from '../../scripts/dette.mjs';

// The known debt through the regeneration (scripts/dette.mjs): a guard of the project that main
// already holds is told by its script in HEAD, though the circuit's list of names (the frame's
// guards) never holds it, and the debt of a file the lot moves follows it to its new path. A
// medium test: git alone mounts the trial repository.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dette-projet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dir: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
};

function depot(fichiers: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  for (const [rel, texte] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    writeFileSync(path.join(racine, rel), texte);
  }
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  return racine;
}

const deLaBase = scriptDeLaBase as (racine: string, script: string | undefined) => boolean;

describe('la garde du projet que main détient', () => {
  it('is of the base by its script in HEAD, the circuit’s list of names not holding it', () => {
    const racine = depot({ 'scripts/garde.mjs': '// garde\n' });
    expect(deLaBase(racine, path.join(racine, 'scripts/garde.mjs'))).toBe(true);
  });

  it('is the lot’s when its script is absent from HEAD, outside the project or unknown', () => {
    const racine = depot({ 'LISEZMOI.md': 'x\n' });
    writeFileSync(path.join(racine, 'neuve.mjs'), '// neuve\n');
    expect(deLaBase(racine, path.join(racine, 'neuve.mjs'))).toBe(false);
    expect(deLaBase(racine, path.join(ESSAIS, 'dehors.mjs'))).toBe(false);
    expect(deLaBase(racine, undefined)).toBe(false);
  });
});

describe('la dette d’un fichier que le lot déplace', () => {
  it('follows the file to its new path in the regeneration, before the commit erases the rename', () => {
    const racine = depot({
      [FICHIER]: JSON.stringify({
        'titres-de-tests': { 'old/a.spec.ts': { 'titre-nommant-un-ticket': { count: 3 } } },
      }),
      'old/a.spec.ts': 'it("x", () => {});\nit("y", () => {});\nit("z", () => {});\n',
    });
    mkdirSync(path.join(racine, 'new'));
    renameSync(path.join(racine, 'old/a.spec.ts'), path.join(racine, 'new/a.spec.ts'));
    expect((abaisser as (d: string, n: object[]) => boolean)(racine, [])).toBe(true);
    expect(JSON.parse(readFileSync(path.join(racine, FICHIER), 'utf8'))).toEqual({
      'titres-de-tests': { 'new/a.spec.ts': { 'titre-nommant-un-ticket': { count: 3 } } },
    });
  });
});
