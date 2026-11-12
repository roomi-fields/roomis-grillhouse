// A test file has a register of its own: the base configuration's setup file names one under the
// temporary directory when the launch names none, and the one the launch names stays. Every module
// that reads or writes the register builds its address from the one constant of adresse-du-registre.mjs (registre.mjs re-exports it).
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SETUP = path.resolve(
  __dirname,
  '../../scripts/langages/typescript/vitest-config/registre.setup.mjs'
);
const BILAN = path.resolve(__dirname, '../../scripts/bilan.mjs');
const TABLEAU = path.resolve(__dirname, '../../scripts/tableau.mjs');
const REGISTRE_MJS = path.resolve(__dirname, '../../scripts/registre.mjs');
const ADRESSE_MJS = path.resolve(__dirname, '../../scripts/adresse-du-registre.mjs');
const SCRIPTS = path.resolve(__dirname, '../../scripts');
const SRC = path.resolve(__dirname, '../../src');
const POSTE = path.join(userInfo().homedir, '.claude', 'grillhouse', 'registre.jsonl');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'registre-d-essai-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('the register of a test file', () => {
  let avant: string | undefined;
  beforeEach(() => {
    avant = process.env.GRILLHOUSE_REGISTRE;
    vi.resetModules();
  });
  afterEach(() => {
    if (avant === undefined) {
      delete process.env.GRILLHOUSE_REGISTRE;
    } else {
      process.env.GRILLHOUSE_REGISTRE = avant;
    }
  });

  it('is a file under the temporary directory, never the workstation register, when the launch names none', async () => {
    delete process.env.GRILLHOUSE_REGISTRE;
    await import(SETUP);
    const registre = process.env.GRILLHOUSE_REGISTRE as string;
    expect(registre).toBeTruthy();
    // The directory of the register sits in the temporary directory, as the root of this file does.
    expect(path.dirname(path.dirname(registre))).toBe(path.dirname(ESSAIS));
    expect(path.isAbsolute(registre)).toBe(true);
    expect(registre).not.toBe(POSTE);
  });

  it('keeps the register the launch names', async () => {
    process.env.GRILLHOUSE_REGISTRE = '/un/registre/nomme.jsonl';
    await import(SETUP);
    expect(process.env.GRILLHOUSE_REGISTRE).toBe('/un/registre/nomme.jsonl');
  });

  it('gives two files of tests a register each', async () => {
    delete process.env.GRILLHOUSE_REGISTRE;
    await import(SETUP);
    const premier = process.env.GRILLHOUSE_REGISTRE;
    delete process.env.GRILLHOUSE_REGISTRE;
    vi.resetModules();
    await import(SETUP);
    expect(process.env.GRILLHOUSE_REGISTRE).toBeTruthy();
    expect(process.env.GRILLHOUSE_REGISTRE).not.toBe(premier);
  });

  it('is read first by the register module', async () => {
    process.env.GRILLHOUSE_REGISTRE = path.join(ESSAIS, 'un-registre-lu-d-abord.jsonl');
    const { REGISTRE } = (await import(REGISTRE_MJS)) as { REGISTRE: string };
    expect(REGISTRE).toBe(process.env.GRILLHOUSE_REGISTRE);
  });
});

function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && /\.(m?js|ts)$/.test(e.name) && !/\.d\.m?ts$/.test(e.name))
    .map(e => path.join(e.parentPath, e.name))
    .filter(f => !f.includes(`${path.sep}node_modules${path.sep}`));
}

describe('the address of the register', () => {
  it('is built in adresse-du-registre.mjs only: no other module of scripts/ or src/ builds a path to registre.jsonl', () => {
    const fautifs = [...sources(SCRIPTS), ...sources(SRC)]
      .filter(f => f !== ADRESSE_MJS && existsSync(f))
      .filter(f =>
        /registre\.jsonl/.test(readFileSync(f, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, ''))
      )
      .map(f => path.relative(path.resolve(SCRIPTS, '..'), f));
    expect(fautifs).toEqual([]);
  });

  it.each([
    ['bilan.mjs', BILAN],
    ['tableau.mjs', TABLEAU],
  ])(
    'is imported from adresse-du-registre.mjs by %s, which no longer reads the variable itself',
    (_n, f) => {
      const texte = readFileSync(f, 'utf8');
      expect(texte).toMatch(
        /import\s*\{[^}]*\bREGISTRE\b[^}]*\}\s*from\s*['"]\.\/adresse-du-registre\.mjs['"]/
      );
      expect(texte).not.toMatch(/process\.env\.GRILLHOUSE_REGISTRE/);
    }
  );
});
