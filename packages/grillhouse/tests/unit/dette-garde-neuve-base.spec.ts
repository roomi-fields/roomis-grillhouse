import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { GARDE as GARDE_DE_RUST } from '../../scripts/langages/cargo/tailles-des-tests.mjs';
import { GARDE as GARDE_DE_PYTHON } from '../../scripts/langages/python/tailles-des-tests.mjs';

// The guards of the lot's base that the circuit names to a run (scripts/activites.mjs): each guard
// of main under the name its findings carry, which is not always its script's (the guards of
// Rust and of Python), so that a guard of main never has a note « to inscribe ». A medium test:
// git alone mounts the trial copy.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dette-base-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const gardesDeLaBase = (activites as Record<string, unknown>).gardesDeLaBase as (
  ctx: object
) => string;

function copie(langages: string[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'copie-'));
  const git = (...a: string[]) => spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'essai@example.com');
  git('config', 'user.name', 'essai');
  declarerLesLangages(racine, langages);
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return { racine, git };
}

describe('la liste des gardes de la base que le circuit nomme à une passe', () => {
  it('holds the name a guard of main writes in its findings, the guard of Rust under its own', () => {
    const { racine } = copie(['cargo']);
    const noms = JSON.parse(gardesDeLaBase({ copie: racine })) as string[];
    expect(noms).toContain(GARDE_DE_RUST);
    expect(noms).toContain('clippy');
    expect(noms).toContain('index-interfaces');
    expect(noms).not.toContain('nouvelle-garde');
  });

  it('holds the guard of Python under the name its findings carry', () => {
    const { racine } = copie(['python']);
    const noms = JSON.parse(gardesDeLaBase({ copie: racine })) as string[];
    expect(noms).toContain(GARDE_DE_PYTHON);
    expect(noms).toContain('index-interfaces');
  });

  it('holds the core guards and the guards of TypeScript, each under its script’s name', () => {
    const { racine } = copie(['typescript']);
    const noms = JSON.parse(gardesDeLaBase({ copie: racine })) as string[];
    for (const nom of [
      'langages-des-paquets',
      'migrations-des-gardes',
      'tailles-des-tests',
      'code-mort',
      'lint-des-scripts',
    ]) {
      expect(noms).toContain(nom);
    }
  });

  it('leaves out a guard script the lot adds after the base commit, and holds those the base holds', async () => {
    // The scripts of the frame sit inside the trial copy (a copy of the frame's own scripts): a
    // guard script is then judged against the copy's HEAD. The lint of the scripts is committed
    // after the base, so HEAD does not hold it: it is the lot's, not the base's.
    const { racine, git } = copie(['typescript']);
    const scripts = path.join(racine, 'packages/grillhouse/scripts');
    const SOURCE = path.resolve(__dirname, '../../scripts');
    const LINT = path.join(SOURCE, 'lint-des-scripts.mjs');
    cpSync(SOURCE, scripts, { recursive: true, filter: s => s !== LINT });
    cpSync(
      path.resolve(__dirname, '../../package.json'),
      path.join(racine, 'packages/grillhouse/package.json')
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'scripts du cadre');
    cpSync(LINT, path.join(scripts, 'lint-des-scripts.mjs'));
    // the copied scripts resolve their dependencies from the copy
    symlinkSync(
      path.resolve(__dirname, '../../../../node_modules'),
      path.join(racine, 'node_modules')
    );

    const copieDesScripts = (await import(
      /* @vite-ignore */ pathToFileURL(path.join(scripts, 'activites.mjs')).href
    )) as Record<string, unknown>;
    const noms = JSON.parse(
      (copieDesScripts.gardesDeLaBase as (ctx: object) => string)({ copie: racine })
    ) as string[];

    expect(noms).toContain('tailles-des-tests');
    expect(noms).toContain('code-mort');
    expect(noms).not.toContain('lint-des-scripts');
  });
});
