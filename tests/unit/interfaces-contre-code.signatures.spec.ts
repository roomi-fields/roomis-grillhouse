import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  refusNommant,
  passe,
  generee,
  DUREE,
  doc,
  titres,
  interfacesEssai,
} from './interfaces-contre-code-essai.js';

// The check of each interface text against its component's code
// (scripts/interfaces-contre-code.mjs, npm run api) and the index of the interfaces
// (scripts/index-interfaces.mjs). This file: the signatures, their @returns, their overloads and
// their @param (grillhouse-3uv.64, critères 9 to 12).
// The projects of trial and their checks: ./interfaces-contre-code-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { ecrit, apres } = interfacesEssai(ESSAIS);

// Critère 9 : a function whose return type is void, undefined, never or Promise<void> needs no
// @returns; every other function needs one.
describe('critère 9 — @returns follows the return type (grillhouse-3uv.64)', () => {
  it.each([
    ['undefined', 'rien'],
    ['never', 'echoue'],
    ['Promise<void>', 'attend'],
  ])('critère 9 : a function that returns %s needs no @returns', (type, nom) => {
    passe(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          doc('Agit sur un compte.', '@param n - Le compte.') +
          `export declare function ${nom}(n: number): ${type};\n`,
      })
    );
  });
  it.each([
    ['Promise<number>', 'compte'],
    ['number | undefined', 'peutEtre'],
    ['boolean', 'estVide'],
  ])('critère 9 : a function that returns %s without @returns is refused', (type, nom) => {
    refusNommant(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          doc('Lit un compte.', '@param n - Le compte.') +
          `export declare function ${nom}(n: number): ${type};\n`,
      }),
      nom,
      '@returns'
    );
  });
});

// Critère 10 : each signature of an overload carries its comment, is judged on its rubrics and has
// its generated entry.
describe('critère 10 — each overload signature is an export of its own (grillhouse-3uv.64)', () => {
  const PREMIERE =
    doc(
      'Rend la durée d’un tempo.',
      '@param x - Le tempo.',
      '@returns La durée.',
      '@faute DUREE_NEGATIVE'
    ) + 'export declare function duree(x: number): number;\n';
  const SECONDE =
    doc(
      'Rend la durée d’un texte lu.',
      '@param s - Le texte.',
      '@param base - La base.',
      '@returns La durée.'
    ) + 'export declare function duree(s: string, base: number): number;\n';

  it('critère 10 : two documented signatures pass, and each has its entry', () => {
    const p = ecrit({ 'dist/a/index.d.ts': PREMIERE + SECONDE });
    passe(p.run());
    const part = generee(p.lire());
    expect(titres(part, 'duree')).toHaveLength(2);
    expect(part).toContain('Rend la durée d’un tempo.');
    expect(part).toContain('Rend la durée d’un texte lu.');
    expect(part).toContain('La base.');
  });
  it('critère 10 : a second signature without its comment is refused, naming its summary', () => {
    refusNommant(
      apres({
        'dist/a/index.d.ts':
          PREMIERE + 'export declare function duree(s: string, base: number): number;\n',
      }),
      'duree',
      /résumé/
    );
  });
  it('critère 10 : a second signature without the @param of its own parameter is refused', () => {
    refusNommant(
      apres({ 'dist/a/index.d.ts': PREMIERE + SECONDE.replace(' * @param base - La base.\n', '') }),
      'duree',
      '@param'
    );
  });
  it('critère 10 : the first signature is judged on its own rubrics, not the second one’s', () => {
    refusNommant(
      apres({ 'dist/a/index.d.ts': PREMIERE.replace(' * @returns La durée.\n', '') + SECONDE }),
      'duree',
      '@returns'
    );
  });
});

// Critère 11 : a destructured parameter is documented by an @param at its position, its name free.
describe('critère 11 — a destructured parameter takes an @param of any name (grillhouse-3uv.64)', () => {
  it('critère 11 : a destructured single parameter documented under a free name passes', () => {
    passe(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          doc('Règle un objet.', '@param reglages - Les réglages.', '@returns Le compte.') +
          'export declare function regle({ a, b }: { a: number; b: number }): number;\n',
      })
    );
  });
  it('critère 11 : a destructured second parameter documented under a free name passes', () => {
    passe(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          doc(
            'Règle un objet.',
            '@param x - Le tempo.',
            '@param options - Les options.',
            '@returns Le compte.'
          ) +
          'export declare function regle(x: number, { a }: { a: number }): number;\n',
      })
    );
  });
  it('critère 11 : a destructured parameter without its @param is refused', () => {
    refusNommant(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          doc('Règle un objet.', '@param x - Le tempo.', '@returns Le compte.') +
          'export declare function regle(x: number, { a }: { a: number }): number;\n',
      }),
      'regle',
      '@param'
    );
  });
  it('critère 11 : the @param of a destructured parameter out of its position is refused', () => {
    refusNommant(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          doc(
            'Règle un objet.',
            '@param options - Les options.',
            '@param x - Le tempo.',
            '@returns Le compte.'
          ) +
          'export declare function regle(x: number, { a }: { a: number }): number;\n',
      }),
      'regle',
      '@param'
    );
  });
});

// Critère 12 : an @param that names no parameter is refused, naming the export and that name.
describe('critère 12 — an @param names a parameter (grillhouse-3uv.64)', () => {
  it('critère 12 : an @param beyond the parameters is refused, naming the export and the name', () => {
    refusNommant(
      apres({
        'dist/a/index.d.ts': DUREE.replace(' * @returns', ' * @param zorglub - Rien.\n * @returns'),
      }),
      'duree',
      'zorglub'
    );
  });
  it('critère 12 : an @param on a function of no parameter is refused, naming it', () => {
    refusNommant(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          doc('Rend le tempo.', '@param zorglub - Rien.', '@returns Le tempo.') +
          'export declare function tempo(): number;\n',
      }),
      'tempo',
      'zorglub'
    );
  });
});

// Critères 12 and 1 for a real parameter whose name is the one API Extractor gives a destructuring
// pattern (`input`, `input2`): it is a named parameter, and its @param is judged by name.
describe('critères 12, 1 — a parameter named input is a named parameter (grillhouse-3uv.64)', () => {
  const LIT = (nom: string, param: string) =>
    DUREE +
    doc('Lit une entrée.', `@param ${param} - La source.`, '@returns Le compte.') +
    `export declare function lit(${nom}: number): number;\n`;

  it.each([['input'], ['input2']])(
    'critère 12 : an @param that names no parameter of lit(%s) is refused, naming the export and that name',
    nom => {
      refusNommant(apres({ 'dist/a/index.d.ts': LIT(nom, 'source') }), 'lit', 'source');
    }
  );
  it.each([['input'], ['input2']])(
    'critère 1 : the parameter %s documented under another name lacks its @param, naming it',
    nom => {
      refusNommant(
        apres({ 'dist/a/index.d.ts': LIT(nom, 'source') }),
        'lit',
        '@param',
        new RegExp(`\\b${nom}\\b`)
      );
    }
  );
  it.each([['input'], ['input2']])(
    'critère 1 : the parameter %s documented under its own name passes',
    nom => {
      passe(apres({ 'dist/a/index.d.ts': LIT(nom, nom) }));
    }
  );
});
