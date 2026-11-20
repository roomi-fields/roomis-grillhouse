// The binaries of the module c: uv at the version of the module python's binaires.json (one
// source), clang-format and clang-tidy at their pinned versions, installed by `uv tool install
// <nom>==<version>`, listed by `uv tool list`; `grillhouse binaires` installs what lacks and says
// « à jour » on the second pass; the envelope reads the installed tools. Against the fake uv
// (./faux-outils-c.ts): no network.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { binaires } from '../../../../scripts/binaires.mjs';
import type { Langage } from '../../../../scripts/jointure.js';
import { moduleC } from './module-c.js';
import { installerFauxOutilsC } from './faux-outils-c.js';

const c: Langage = moduleC;
const BINAIRES_PYTHON = path.resolve(
  __dirname,
  '../../../../scripts/langages/python/binaires.json'
);
const BINAIRES_C = path.resolve(__dirname, '../../../../scripts/langages/c/binaires.json');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'binaires-c-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const JOURNAL = path.join(ESSAIS, 'journal');

const ENV = ['PATH', 'FAUX_OUTILS_C_JOURNAL', 'FAUX_UV_TOOLS', 'FAUX_UV_CODES', 'FAUX_UV_VERSION'];
const avant: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const n of ENV) {
    avant[n] = process.env[n];
  }
  process.env.PATH = `${installerFauxOutilsC(ESSAIS)}${path.delimiter}${process.env.PATH ?? ''}`;
  process.env.FAUX_OUTILS_C_JOURNAL = JOURNAL;
});
afterAll(() => {
  for (const n of ENV) {
    if (avant[n] === undefined) {
      delete process.env[n];
    } else {
      process.env[n] = avant[n];
    }
  }
});
beforeEach(() => {
  writeFileSync(JOURNAL, '');
  delete process.env.FAUX_UV_TOOLS;
  delete process.env.FAUX_UV_CODES;
  delete process.env.FAUX_UV_VERSION;
});

const appels = () =>
  readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as { outil: string; args: string[] })
    .filter(a => !a.args.includes('--version'))
    .map(a => `${a.outil} ${a.args.join(' ')}`);

// A project whose package `osd-embed` is declared c.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { 'osd-embed': 'c' });
  mkdirSync(path.join(racine, 'osd-embed'));
  writeFileSync(
    path.join(racine, 'osd-embed/CMakeLists.txt'),
    'cmake_minimum_required(VERSION 3.16)\nproject(osd-embed C)\n'
  );
  return racine;
}

describe('les binaires du module c', () => {
  it('uv is read from the binaires.json of the module python, the clang tools are pinned', () => {
    const python = JSON.parse(readFileSync(BINAIRES_PYTHON, 'utf8')) as Record<string, string>;
    const propres = JSON.parse(readFileSync(BINAIRES_C, 'utf8')) as Record<string, string>;
    expect(c.binaires.uv).toBe(python.uv);
    expect(c.binaires['clang-format']).toBe('21.1.8');
    expect(c.binaires['clang-tidy']).toBe('21.1.6');
    // One source for uv: the module's own file does not repeat it.
    expect(propres).not.toHaveProperty('uv');
  });

  it('uv comes first, so that it is installed before the tools that need it in the same pass', () => {
    expect(Object.keys(c.binaires).slice(0, 3)).toEqual(['uv', 'clang-format', 'clang-tidy']);
  });

  it('the installation describes `liste` and `installer` by the commands of the module', () => {
    const installation = c.miseAJour.installation!;
    expect(installation.liste.script).toMatch(/langages\/c\/binaires\.mjs$/);
    expect(installation.installer('clang-format', '21.1.8').script).toMatch(
      /langages\/c\/binaires\.mjs$/
    );
    expect(installation.installer('clang-format', '21.1.8').args).toContain('clang-format@21.1.8');
  });

  it('the envelope reads uv, the two clang tools and the tools of uv', () => {
    expect(c.sorties.lues).toEqual(
      expect.arrayContaining([
        '~/.local/bin/uv',
        '~/.local/bin/clang-format',
        '~/.local/bin/clang-tidy',
        '~/.local/share/uv/tools/',
      ])
    );
  });
});

describe('grillhouse binaires dans un projet c', () => {
  it('installs the two clang tools by `uv tool install <nom>==<version>`, listed by `uv tool list`', () => {
    const r = binaires([], projet());
    expect(appels()).toEqual([
      'uv tool list',
      'uv tool install clang-format==21.1.8',
      'uv tool install clang-tidy==21.1.6',
    ]);
    expect(r).toEqual({
      code: 0,
      sortie: 'Binaires installés : clang-format@21.1.8, clang-tidy@21.1.6.\n',
      erreur: '',
    });
  });

  it('says « à jour » on the second pass: nothing installed', () => {
    process.env.FAUX_UV_TOOLS = JSON.stringify({
      'clang-format': '21.1.8',
      'clang-tidy': '21.1.6',
    });
    const r = binaires([], projet());
    expect(r).toEqual({ code: 0, sortie: 'Binaires : à jour.\n', erreur: '' });
    expect(appels().filter(a => a.startsWith('uv tool install'))).toEqual([]);
    expect(appels()).toContain('uv tool list');
  });

  it('installs only the tool at another version, at the pinned one', () => {
    process.env.FAUX_UV_TOOLS = JSON.stringify({
      'clang-format': '21.1.8',
      'clang-tidy': '20.1.0',
    });
    const r = binaires([], projet());
    expect(appels().filter(a => a.startsWith('uv tool install'))).toEqual([
      'uv tool install clang-tidy==21.1.6',
    ]);
    expect(r.sortie).toBe('Binaires installés : clang-tidy@21.1.6.\n');
  });

  it('an install that fails: the command to type named on the error stream, code 1', () => {
    process.env.FAUX_UV_CODES = JSON.stringify({ 'tool install': 1 });
    const r = binaires([], projet());
    expect(r.code).toBe(1);
    expect(r.erreur).toContain('clang-format@21.1.8');
    expect(r.erreur).toContain('clang-tidy@21.1.6');
  });
});
