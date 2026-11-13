// `grillhouse binaires` (scripts/binaires.mjs): the binaries of the languages of a project
// installed alone, as a CI runs it after `npm ci`, without any file of the project rewritten. The
// calls of cargo go to the fake cargo (./langages/cargo/faux-cargo.ts), whose journal lists them:
// no network.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { binaires, USAGE } from '../../scripts/binaires.mjs';
import cargo from '../../scripts/langages/cargo/index.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-binaires-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const JOURNAL = path.join(ESSAIS, 'journal');
const BINAIRES = (cargo as unknown as { binaires: Record<string, string> }).binaires;

let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
});
afterAll(() => restaurer());
beforeEach(() => {
  writeFileSync(JOURNAL, '');
  delete process.env.FAUX_CARGO_INSTALLES;
  delete process.env.FAUX_CARGO_CODES;
});
const appels = () => readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean);
const installations = () => appels().filter(a => a.startsWith('binstall '));

// A project of <fichiers> (path → content).
function projet(fichiers: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
    writeFileSync(path.join(racine, f), t);
  }
  return racine;
}
const rust = () =>
  projet({
    'package.json': '{ "name": "p" }\n',
    'docs/ARCHITECTURE.md': architecture({ p: 'cargo' }),
    'Cargo.toml': '[package]\nname = "p"\nversion = "0.1.0"\n',
    'src/lib.rs': '',
  });

// Every file of the project at <racine> and its content.
function contenu(racine: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(racine, { recursive: true, withFileTypes: true })
      .filter(e => e.isFile())
      .map(e => {
        const f = path.join(e.parentPath, e.name);
        return [path.relative(racine, f), readFileSync(f, 'utf8')];
      })
  );
}

const typer = (r: unknown) => r as { code: number; sortie: string; erreur: string };

describe('grillhouse binaires installs the binaries of the project’s languages alone', () => {
  it('installs each binary missing or at another version, and names them', () => {
    const racine = rust();
    // The first binary at its version, the second at another, the others missing.
    const noms = Object.keys(BINAIRES);
    const installes: Record<string, string> = {};
    installes[noms[0]!] = BINAIRES[noms[0]!]!;
    installes[noms[1]!] = '0.0.1';
    process.env.FAUX_CARGO_INSTALLES = JSON.stringify(installes);
    const r = typer(binaires([], racine));
    const attendus = noms.slice(1);
    expect(installations()).toEqual(
      attendus.map(n => `binstall --no-confirm --locked ${n}@${BINAIRES[n]}`)
    );
    expect(r.code).toBe(0);
    expect(r.sortie).toBe(
      `Binaires installés : ${attendus.map(n => `${n}@${BINAIRES[n]}`).join(', ')}.\n`
    );
    expect(r.erreur).toBe('');
  });

  it('writes no file of the project', () => {
    const racine = rust();
    const avant = contenu(racine);
    expect(typer(binaires([], racine)).code).toBe(0);
    expect(contenu(racine)).toEqual(avant);
  });

  it('every binary at its version: nothing installed, « à jour »', () => {
    const racine = rust();
    process.env.FAUX_CARGO_INSTALLES = JSON.stringify(BINAIRES);
    const r = typer(binaires([], racine));
    expect(installations()).toEqual([]);
    expect(r).toEqual({ code: 0, sortie: 'Binaires : à jour.\n', erreur: '' });
  });

  it('a project of typescript has no binary: cargo is never called', () => {
    const racine = projet({
      'package.json': '{ "name": "p" }\n',
      'docs/ARCHITECTURE.md': architecture(),
      'tsconfig.json': '{}\n',
    });
    expect(typer(binaires([], racine))).toEqual({
      code: 0,
      sortie: 'Binaires : à jour.\n',
      erreur: '',
    });
    expect(appels()).toEqual([]);
  });

  it('an install that fails: its line on the error stream, the command to type named, code 1', () => {
    const racine = rust();
    process.env.FAUX_CARGO_CODES = JSON.stringify({ binstall: 1 });
    const r = typer(binaires([], racine));
    expect(r.code).toBe(1);
    expect(r.sortie).toBe('');
    for (const [n, v] of Object.entries(BINAIRES)) {
      expect(r.erreur).toContain(`cargo binstall --no-confirm --locked ${n}@${v}`);
    }
  });

  it('an argument is refused by the usage, nothing installed, code 2', () => {
    const racine = rust();
    expect(typer(binaires(['--help'], racine))).toEqual({ code: 2, sortie: '', erreur: USAGE });
    expect(appels()).toEqual([]);
  });

  it('a project whose language the frame refuses: the refusal, code 2', () => {
    const racine = projet({ 'package.json': '{ "name": "p" }\n' });
    const r = typer(binaires([], racine));
    expect(r.code).toBe(2);
    expect(r.erreur).toMatch(/^⛔ /);
    expect(appels()).toEqual([]);
  });
});
