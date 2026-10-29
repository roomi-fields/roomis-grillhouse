import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { TSDOC, DUREE, interfacesEssai } from './interfaces-contre-code-essai.js';

// The check of each interface text against its component's code
// (scripts/langages/typescript/interfaces-contre-code.mjs, npm run api) and the index of the interfaces
// (scripts/langages/typescript/index-interfaces.mjs). This file: the TSDoc rubrics of each export and the tags TSDoc
// accepts (grillhouse-3uv.64, critères 1 and 2).
// The projects of trial and their checks: ./interfaces-contre-code-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { apres } = interfacesEssai(ESSAIS);

// Critère 1 : each export carries a TSDoc comment with a summary, one @param per parameter,
// @returns for a function that returns a value, one @faute CODE per fault it returns; the check
// refuses an export a rubric is missing from, naming the export and the rubric.
describe('critère 1 — each export carries its TSDoc rubrics (grillhouse-3uv.64)', () => {
  const refuse = (dts: string, nom: string, rubrique: RegExp) => {
    const r = apres({ 'dist/a/index.d.ts': dts });
    expect(r.status).toBe(1);
    const ligne = r.stderr.split('\n').find(l => l.includes(nom) && rubrique.test(l));
    expect(ligne, `a refusal naming ${nom} and ${rubrique}:\n${r.stderr}`).toBeDefined();
  };

  it('critère 1 : a function without any comment is refused, naming it and its summary', () => {
    refuse('export declare function duree(x: number): number;\n', 'duree', /résumé/);
  });
  it('critère 1 : a comment with tags but no summary is refused, naming the summary', () => {
    refuse(
      '/**\n * @param x - Le tempo.\n * @returns La durée.\n */\nexport declare function duree(x: number): number;\n',
      'duree',
      /résumé/
    );
  });
  it('critère 1 : a function without the @param of one parameter is refused', () => {
    refuse(
      '/**\n * Rend la durée.\n * @param x - Le tempo.\n * @returns La durée.\n */\nexport declare function duree(x: number, y: number): number;\n',
      'duree',
      /@param/
    );
  });
  it('critère 1 : a misnamed @param leaves the real parameter without its @param', () => {
    refuse(
      '/**\n * Rend la durée.\n * @param tempo - Le tempo.\n * @returns La durée.\n */\nexport declare function duree(x: number): number;\n',
      'duree',
      /@param/
    );
  });
  it('critère 1 : a function that returns a value without @returns is refused', () => {
    refuse(
      '/**\n * Rend la durée.\n * @param x - Le tempo.\n */\nexport declare function duree(x: number): number;\n',
      'duree',
      /@returns/
    );
  });
  it('critère 1 : a second export, a constant, without summary is refused by its own name', () => {
    refuse(DUREE + 'export declare const tempo: number;\n', 'tempo', /résumé/);
  });
  it('critère 1 : an exported interface without summary is refused', () => {
    refuse(DUREE + 'export interface Lu {\n  n: number;\n}\n', 'Lu', /résumé/);
  });
  it('critère 1 : an exported type alias without summary is refused', () => {
    refuse(DUREE + 'export type Tempo = number;\n', 'Tempo', /résumé/);
  });
  it('critère 1 : an exported class without summary is refused', () => {
    refuse(DUREE + 'export declare class Horloge {\n  tic(): void;\n}\n', 'Horloge', /résumé/);
  });

  it('critère 1 : a function of no parameter needs no @param', () => {
    const r = apres({
      'dist/a/index.d.ts':
        DUREE +
        '/**\n * Rend le tempo.\n * @returns Le tempo.\n */\nexport declare function tempo(): number;\n',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('critère 1 : a function that returns void needs no @returns', () => {
    const r = apres({
      'dist/a/index.d.ts':
        DUREE +
        '/**\n * Remet à zéro.\n * @param n - Le compte.\n */\nexport declare function raz(n: number): void;\n',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('critère 1 : a documented constant, interface and type need their summary only', () => {
    const r = apres({
      'dist/a/index.d.ts':
        DUREE +
        '/** Le tempo par défaut. */\nexport declare const tempo: number;\n' +
        '/** Un objet lu. */\nexport interface Lu {\n  n: number;\n}\n' +
        '/** Un tempo. */\nexport type Tempo = number;\n',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

// Critère 2 : @faute is declared in the frame's TSDoc configuration; an unknown or malformed TSDoc
// tag is refused.
describe('critère 2 — the frame declares @faute, and TSDoc refuses the rest (grillhouse-3uv.64)', () => {
  it('critère 2 : the frame carries a TSDoc configuration that declares @faute', () => {
    expect(existsSync(TSDOC), 'tsdoc.json at the root of the frame').toBe(true);
    const config = JSON.parse(readFileSync(TSDOC, 'utf8')) as {
      tagDefinitions?: { tagName: string }[];
    };
    const noms = (config.tagDefinitions ?? []).map(t => t.tagName);
    expect(noms).toContain('@faute');
  });
  it('critère 2 : an export whose @faute is in the catalogue passes without any message', () => {
    const r = apres({});
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('critère 2 : an unknown tag is refused', () => {
    const r = apres({
      'dist/a/index.d.ts': DUREE.replace(' * @faute', ' * @bidule rien\n * @faute'),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*@bidule/);
  });
  it('critère 2 : a misspelled @faute is an unknown tag and is refused', () => {
    const r = apres({ 'dist/a/index.d.ts': DUREE.replace('@faute DUREE', '@fautes DUREE') });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*@fautes/);
  });
  it('critère 2 : a malformed @param (no hyphen after its name) is refused', () => {
    const r = apres({
      'dist/a/index.d.ts': DUREE.replace('@param x - Le tempo', '@param x Le tempo'),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*@param/);
  });
});
