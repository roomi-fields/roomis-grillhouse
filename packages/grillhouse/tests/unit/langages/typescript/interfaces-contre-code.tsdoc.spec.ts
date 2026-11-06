import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { TSDOC, DUREE, doc, nomme, interfacesEssai } from './interfaces-contre-code-essai.js';

// The check of each interface text against its component's code
// (scripts/langages/typescript/interfaces-contre-code.mjs, npm run api) and the index of the interfaces
// (scripts/langages/typescript/index-interfaces.mjs). This file: the TSDoc rubrics of each export and the tags TSDoc
// accepts (grillhouse-3uv.64, critères 1 and 2), judged by `jugerExport` on the elements one call of
// `rapportApi` draws from a declaration entry (grillhouse-44b.10.1, critères 1 and 2).
// The projects of trial and their checks: ./interfaces-contre-code-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { analyse, juge, tout } = interfacesEssai(ESSAIS);

// One entry carries every export the cases of critère 1 judge, each under its own name.
const RUBRIQUES =
  DUREE +
  'export declare function sansDoc(x: number): number;\n' +
  '/**\n * @param x - Le tempo.\n * @returns La durée.\n */\nexport declare function sansResume(x: number): number;\n' +
  '/**\n * Rend la durée.\n * @param x - Le tempo.\n * @returns La durée.\n */\nexport declare function sansParam(x: number, y: number): number;\n' +
  '/**\n * Rend la durée.\n * @param tempo - Le tempo.\n * @returns La durée.\n */\nexport declare function paramMalNomme(x: number): number;\n' +
  '/**\n * Rend la durée.\n * @param x - Le tempo.\n */\nexport declare function sansRetour(x: number): number;\n' +
  'export declare const tempoSansResume: number;\n' +
  'export interface LuSansResume {\n  n: number;\n}\n' +
  'export type TempoSansResume = number;\n' +
  'export declare class HorlogeSansResume {\n  tic(): void;\n}\n' +
  '/**\n * Rend le tempo.\n * @returns Le tempo.\n */\nexport declare function sansArgument(): number;\n' +
  '/**\n * Remet à zéro.\n * @param n - Le compte.\n */\nexport declare function raz(n: number): void;\n' +
  '/** Le tempo par défaut. */\nexport declare const tempoDoc: number;\n' +
  '/** Un objet lu. */\nexport interface LuDoc {\n  n: number;\n}\n' +
  '/** Un tempo. */\nexport type TempoDoc = number;\n';

// Critère 1 : each export carries a TSDoc comment with a summary, one @param per parameter,
// @returns for a function that returns a value, one @faute CODE per fault it returns; the check
// refuses an export a rubric is missing from, naming the export and the rubric.
describe('critère 1 — each export carries its TSDoc rubrics (grillhouse-3uv.64)', () => {
  const refuse = (nom: string, rubrique: RegExp) =>
    nomme(juge(analyse(RUBRIQUES), nom).lignes, nom, rubrique);
  const lignes = (nom: string) => juge(analyse(RUBRIQUES), nom).lignes;

  it('critère 1 : the export that carries every rubric is not refused', () => {
    expect(lignes('duree')).toEqual([]);
  });
  it('critère 1 : a function without any comment is refused, naming it and its summary', () => {
    refuse('sansDoc', /résumé/);
  });
  it('critère 1 : a comment with tags but no summary is refused, naming the summary', () => {
    refuse('sansResume', /résumé/);
  });
  it('critère 1 : a function without the @param of one parameter is refused', () => {
    refuse('sansParam', /@param/);
  });
  it('critère 1 : a misnamed @param leaves the real parameter without its @param', () => {
    refuse('paramMalNomme', /@param/);
  });
  it('critère 1 : a function that returns a value without @returns is refused', () => {
    refuse('sansRetour', /@returns/);
  });
  it('critère 1 : a second export, a constant, without summary is refused by its own name', () => {
    refuse('tempoSansResume', /résumé/);
  });
  it('critère 1 : an exported interface without summary is refused', () => {
    refuse('LuSansResume', /résumé/);
  });
  it('critère 1 : an exported type alias without summary is refused', () => {
    refuse('TempoSansResume', /résumé/);
  });
  it('critère 1 : an exported class without summary is refused', () => {
    refuse('HorlogeSansResume', /résumé/);
  });

  it('critère 1 : a function of no parameter needs no @param', () => {
    expect(lignes('sansArgument')).toEqual([]);
  });
  it('critère 1 : a function that returns void needs no @returns', () => {
    expect(lignes('raz')).toEqual([]);
  });
  it('critère 1 : a documented constant, interface and type need their summary only', () => {
    for (const nom of ['tempoDoc', 'LuDoc', 'TempoDoc']) {
      expect(lignes(nom)).toEqual([]);
    }
  });
});

// Critère 2 : @faute is declared in the frame's TSDoc configuration; an unknown or malformed TSDoc
// tag is refused.
describe('critère 2 — the frame declares @faute, and TSDoc refuses the rest (grillhouse-3uv.64)', () => {
  const MAUVAIS_TAGS =
    DUREE +
    doc('Rend un.', '@bidule rien', '@returns Un.') +
    'export declare function inconnu(): number;\n' +
    doc('Rend deux.', '@fautes DUREE_NEGATIVE', '@returns Deux.') +
    'export declare function fauteMalEcrite(): number;\n' +
    doc('Rend trois.', '@param x Le tempo', '@returns Trois.') +
    'export declare function paramSansTiret(x: number): number;\n';
  const tsdoc = () => analyse(MAUVAIS_TAGS).tsdoc;

  it('critère 2 : the frame carries a TSDoc configuration that declares @faute', () => {
    expect(existsSync(TSDOC), 'tsdoc.json at the root of the frame').toBe(true);
    const config = JSON.parse(readFileSync(TSDOC, 'utf8')) as {
      tagDefinitions?: { tagName: string }[];
    };
    const noms = (config.tagDefinitions ?? []).map(t => t.tagName);
    expect(noms).toContain('@faute');
  });
  it('critère 2 : an export whose @faute is in the catalogue passes without any message', () => {
    expect(tout(analyse(DUREE))).toEqual([]);
  });
  it('critère 2 : an unknown tag is refused', () => {
    nomme(tsdoc(), '@bidule');
  });
  it('critère 2 : a misspelled @faute is an unknown tag and is refused', () => {
    nomme(tsdoc(), '@fautes');
  });
  it('critère 2 : a malformed @param (no hyphen after its name) is refused', () => {
    nomme(tsdoc(), '@param');
  });
});
