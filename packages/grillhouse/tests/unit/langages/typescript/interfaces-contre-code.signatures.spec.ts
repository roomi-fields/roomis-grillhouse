import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DUREE, doc, nomme, titres, interfacesEssai } from './interfaces-contre-code-essai.js';

// The check of each interface text against its component's code
// (scripts/langages/typescript/interfaces-contre-code.mjs, npm run api) and the index of the interfaces
// (scripts/langages/typescript/index-interfaces.mjs). This file: the signatures, their @returns, their overloads and
// their @param (grillhouse-3uv.64, critères 9 to 12), judged by `jugerExport` and `partieGeneree` on the elements
// one call of `rapportApi` draws from a declaration entry (grillhouse-44b.10.1, critères 1 and 2).
// The projects of trial and their checks: ./interfaces-contre-code-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { analyse, juge, partie } = interfacesEssai(ESSAIS);

// A function of one number parameter returning <type>, its comment without @returns.
const fonction = (nom: string, type: string) =>
  doc('Lit un compte.', '@param n - Le compte.') +
  `export declare function ${nom}(n: number): ${type};\n`;

// One entry per file: every export a case judges, under its own name.
const RETOURS =
  DUREE +
  [
    ['undefined', 'rien'],
    ['never', 'echoue'],
    ['Promise<void>', 'attend'],
    ['Promise<number>', 'compte'],
    ['number | undefined', 'peutEtre'],
    ['boolean', 'estVide'],
  ]
    .map(([type, nom]) => fonction(nom, type))
    .join('');

// Critère 9 : a function whose return type is void, undefined, never or Promise<void> needs no
// @returns; every other function needs one.
describe('critère 9 — @returns follows the return type (grillhouse-3uv.64)', () => {
  it.each([
    ['undefined', 'rien'],
    ['never', 'echoue'],
    ['Promise<void>', 'attend'],
  ])('critère 9 : a function that returns %s needs no @returns', (_type, nom) => {
    expect(juge(analyse(RETOURS), nom).lignes).toEqual([]);
  });
  it.each([
    ['Promise<number>', 'compte'],
    ['number | undefined', 'peutEtre'],
    ['boolean', 'estVide'],
  ])('critère 9 : a function that returns %s without @returns is refused', (_type, nom) => {
    nomme(juge(analyse(RETOURS), nom).lignes, nom, '@returns');
  });
});

// Critère 10 : each signature of an overload carries its comment, is judged on its rubrics and has
// its generated entry.
describe('critère 10 — each overload signature is an export of its own (grillhouse-3uv.64)', () => {
  const premiere = (nom: string, returns = true) =>
    doc(
      'Rend la durée d’un tempo.',
      '@param x - Le tempo.',
      ...(returns ? ['@returns La durée.'] : []),
      '@faute DUREE_NEGATIVE'
    ) + `export declare function ${nom}(x: number): number;\n`;
  const seconde = (nom: string, base = true) =>
    doc(
      'Rend la durée d’un texte lu.',
      '@param s - Le texte.',
      ...(base ? ['@param base - La base.'] : []),
      '@returns La durée.'
    ) + `export declare function ${nom}(s: string, base: number): number;\n`;
  const SURCHARGES =
    DUREE +
    premiere('complete') +
    seconde('complete') +
    premiere('sansCommentaire') +
    'export declare function sansCommentaire(s: string, base: number): number;\n' +
    premiere('sansParamBase') +
    seconde('sansParamBase', false) +
    premiere('sansRetourPremiere', false) +
    seconde('sansRetourPremiere');

  it('critère 10 : two documented signatures pass, and each has its entry', () => {
    const a = analyse(SURCHARGES);
    expect(juge(a, 'complete').lignes).toEqual([]);
    const part = partie(a);
    expect(titres(part, 'complete')).toHaveLength(2);
    expect(part).toContain('Rend la durée d’un tempo.');
    expect(part).toContain('Rend la durée d’un texte lu.');
    expect(part).toContain('La base.');
  });
  it('critère 10 : a second signature without its comment is refused, naming its summary', () => {
    nomme(juge(analyse(SURCHARGES), 'sansCommentaire').lignes, 'sansCommentaire', /résumé/);
  });
  it('critère 10 : a second signature without the @param of its own parameter is refused', () => {
    nomme(juge(analyse(SURCHARGES), 'sansParamBase').lignes, 'sansParamBase', '@param');
  });
  it('critère 10 : the first signature is judged on its own rubrics, not the second one’s', () => {
    const lignes = juge(analyse(SURCHARGES), 'sansRetourPremiere').lignes;
    nomme(lignes, 'sansRetourPremiere', '@returns');
    expect(lignes).toHaveLength(1);
  });
});

// Critère 11 : a destructured parameter is documented by an @param at its position, its name free.
describe('critère 11 — a destructured parameter takes an @param of any name (grillhouse-3uv.64)', () => {
  const DESTRUCTURES =
    DUREE +
    doc('Règle un objet.', '@param reglages - Les réglages.', '@returns Le compte.') +
    'export declare function reglePremier({ a, b }: { a: number; b: number }): number;\n' +
    doc(
      'Règle un objet.',
      '@param x - Le tempo.',
      '@param options - Les options.',
      '@returns Le compte.'
    ) +
    'export declare function regleSecond(x: number, { a }: { a: number }): number;\n' +
    doc('Règle un objet.', '@param x - Le tempo.', '@returns Le compte.') +
    'export declare function regleSansParam(x: number, { a }: { a: number }): number;\n' +
    doc(
      'Règle un objet.',
      '@param options - Les options.',
      '@param x - Le tempo.',
      '@returns Le compte.'
    ) +
    'export declare function regleHorsPosition(x: number, { a }: { a: number }): number;\n';

  it('critère 11 : a destructured single parameter documented under a free name passes', () => {
    expect(juge(analyse(DESTRUCTURES), 'reglePremier').lignes).toEqual([]);
  });
  it('critère 11 : a destructured second parameter documented under a free name passes', () => {
    expect(juge(analyse(DESTRUCTURES), 'regleSecond').lignes).toEqual([]);
  });
  it('critère 11 : a destructured parameter without its @param is refused', () => {
    nomme(juge(analyse(DESTRUCTURES), 'regleSansParam').lignes, 'regleSansParam', '@param');
  });
  it('critère 11 : the @param of a destructured parameter out of its position is refused', () => {
    nomme(juge(analyse(DESTRUCTURES), 'regleHorsPosition').lignes, 'regleHorsPosition', '@param');
  });
});

// Critère 12 : an @param that names no parameter is refused, naming the export and that name.
describe('critère 12 — an @param names a parameter (grillhouse-3uv.64)', () => {
  const ORPHELINS =
    DUREE.replace(' * @returns', ' * @param zorglub - Rien.\n * @returns').replace(
      'function duree',
      'function dureeOrpheline'
    ) +
    doc('Rend le tempo.', '@param zorglub - Rien.', '@returns Le tempo.') +
    'export declare function tempoOrphelin(): number;\n';

  it('critère 12 : an @param beyond the parameters is refused, naming the export and the name', () => {
    nomme(juge(analyse(ORPHELINS), 'dureeOrpheline').lignes, 'dureeOrpheline', 'zorglub');
  });
  it('critère 12 : an @param on a function of no parameter is refused, naming it', () => {
    nomme(juge(analyse(ORPHELINS), 'tempoOrphelin').lignes, 'tempoOrphelin', 'zorglub');
  });
});

// Critères 12 and 1 for a real parameter whose name is the one API Extractor gives a destructuring
// pattern (`input`, `input2`): it is a named parameter, and its @param is judged by name.
describe('critères 12, 1 — a parameter named input is a named parameter (grillhouse-3uv.64)', () => {
  const lit = (fn: string, nom: string, param: string) =>
    doc('Lit une entrée.', `@param ${param} - La source.`, '@returns Le compte.') +
    `export declare function ${fn}(${nom}: number): number;\n`;
  const INPUTS =
    DUREE +
    ['input', 'input2']
      .map(nom => lit(`litAutre_${nom}`, nom, 'source') + lit(`litPropre_${nom}`, nom, nom))
      .join('');

  it.each([['input'], ['input2']])(
    'critère 12 : an @param that names no parameter of lit(%s) is refused, naming the export and that name',
    nom => {
      nomme(juge(analyse(INPUTS), `litAutre_${nom}`).lignes, `litAutre_${nom}`, 'source');
    }
  );
  it.each([['input'], ['input2']])(
    'critère 1 : the parameter %s documented under another name lacks its @param, naming it',
    nom => {
      nomme(
        juge(analyse(INPUTS), `litAutre_${nom}`).lignes,
        `litAutre_${nom}`,
        '@param',
        new RegExp(`\\b${nom}\\b`)
      );
    }
  );
  it.each([['input'], ['input2']])(
    'critère 1 : the parameter %s documented under its own name passes',
    nom => {
      expect(juge(analyse(INPUTS), `litPropre_${nom}`).lignes).toEqual([]);
    }
  );
});
