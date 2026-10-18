import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { index } from '../../scripts/index-interfaces.mjs';
import {
  refusNommant,
  refus,
  passe,
  generee,
  FIN,
  DEBUT,
  RACINE,
  FAUTES,
  DUREE,
  entree,
  doc,
  interfacesEssai,
} from './interfaces-contre-code-essai.js';

// The check of each interface text against its component's code
// (scripts/interfaces-contre-code.mjs, npm run api) and the index of the interfaces
// (scripts/index-interfaces.mjs). This file: the index read from the generated part, the marks
// the check and the index share, the refusals of TSDoc, the titles and the writer's reference
// (grillhouse-3uv.64, critères 6, 7, 8, 26 and 27).
// The projects of trial and their checks: ./interfaces-contre-code-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { iface, projet, ecrit, apres } = interfacesEssai(ESSAIS);

const REFERENCE = path.join(
  RACINE,
  '.claude/skills/redacteur/references/documents-d-un-composant.md'
);

// Critère 6 : the index of the interfaces is built from the generated part.
describe('critère 6 — the index takes the exports from the generated part (grillhouse-3uv.64)', () => {
  it('critère 6 : each export of the generated part gives an index line with its summary', () => {
    const p = ecrit({
      'dist/a/index.d.ts':
        DUREE +
        '/**\n * Un objet lu depuis la source. Il porte un compte.\n */\nexport interface Lu {\n  n: number;\n}\n',
    });
    const lignes = index(p.dir).split('\n');
    const duree = lignes.find(l => /^\s*- \*\*`duree`/.test(l));
    const lu = lignes.find(l => /^\s*- \*\*`Lu`/.test(l));
    expect(duree, index(p.dir)).toContain('Rend la durée d’un objet en battements.');
    expect(lu, index(p.dir)).toContain('Un objet lu depuis la source.');
  });
});

// Critère 26 : the index gives each entry of the generated part as an element line of the first
// rank, under its component line — on a part npm run api wrote.
describe('critère 26 — the index on a part written by npm run api (grillhouse-3uv.64)', () => {
  it('critère 26 : each export of a written part gives an index line of the first rank, not indented', () => {
    const p = ecrit({
      'dist/a/index.d.ts':
        DUREE +
        '/** Un objet lu. */\nexport interface Lu {\n  /** Le compte. */\n  n: number;\n}\n' +
        '/** Le tempo par défaut. */\nexport declare const tempo: number;\n',
    });
    passe(p.run());
    const texte = index(p.dir);
    const lignes = texte.split('\n');
    const a = lignes.findIndex(l => /^## a\b/.test(l));
    expect(a, texte).toBeGreaterThanOrEqual(0);
    const fin = lignes.findIndex((l, k) => k > a && l.startsWith('## '));
    const sous = lignes.slice(a + 1, fin < 0 ? undefined : fin);
    for (const [nom, phrase] of [
      ['duree', 'Rend la durée d’un objet en battements.'],
      ['Lu', 'Un objet lu.'],
      ['tempo', 'Le tempo par défaut.'],
    ]) {
      const ligne = sous.find(l => l.includes(`\`${nom}\``));
      expect(ligne, `the line of ${nom}:\n${texte}`).toBeDefined();
      expect(ligne!.startsWith('- **'), `${nom} at the first rank:\n${texte}`).toBe(true);
      expect(ligne).toContain(phrase);
    }
    expect(
      sous.filter(l => /^\s+-/.test(l)),
      texte
    ).toEqual([]);
  });
});

// The marks have one reading (grillhouse-3uv.64, relecture 1, constat 5; charte « une matière, une
// adresse »): the index and the check agree on a mark written in a code block and on a mark alone.
// The check refuses the marks exactly when the index finds no generated part to read.
describe('the marks have one reading, shared by the check and the index (grillhouse-3uv.64)', () => {
  const ELEMENTS = (dir: string) => {
    let texte: string;
    try {
      texte = index(dir);
    } catch {
      return [];
    }
    return texte.split('\n').filter(l => /^\s*- \*\*/.test(l) && !l.includes('**Consommateurs**'));
  };
  // Either the check takes the marks (no refusal naming them) and the index reads the part, or
  // the check refuses them and the index reads none.
  const accord = (p: { dir: string; run: (...a: string[]) => { stderr: string } }) => {
    const r = p.run();
    const refuse = refus(r.stderr).some(l => l.includes('généré'));
    const elements = ELEMENTS(p.dir);
    expect(
      elements.length > 0,
      `the check ${refuse ? 'refuses' : 'takes'} the marks, the index reads ${JSON.stringify(elements)}:\n${r.stderr}`
    ).toBe(!refuse);
  };

  it('a mark written in a code block of the hand part: the check and the index agree', () => {
    const p = ecrit({});
    const texte = p.lire();
    const exemple = `\n\`\`\`md\n${DEBUT}\n${FIN}\n\`\`\`\n\n`;
    const i = texte.indexOf(DEBUT);
    writeFileSync(
      path.join(p.dir, 'src/a/docs/INTERFACE.md'),
      texte.slice(0, i) + exemple + texte.slice(i)
    );
    accord(p);
  });
  it.each([
    ['the start mark alone', `# a\n\nA.\n\n${DEBUT}\n### \`duree\`\n\nRend la durée.\n${FAUTES}`],
    ['the end mark alone', `# a\n\nA.\n\n### \`duree\`\n\nRend la durée.\n${FIN}\n${FAUTES}`],
    [
      'the marks out of order',
      `# a\n\nA.\n\n${FIN}\n${DEBUT}\n### \`duree\`\n\nRend la durée.\n${FAUTES}`,
    ],
    [
      'the marks doubled',
      `# a\n\nA.\n\n${DEBUT}\n### \`duree\`\n\nRend la durée.\n${FIN}\n\n${DEBUT}\n${FIN}\n${FAUTES}`,
    ],
  ])('%s: the check refuses it, and the index reads no generated part', (_cas, texte) => {
    const p = projet({ 'src/a/docs/INTERFACE.md': texte });
    refusNommant(p.run(), 'généré');
    expect(ELEMENTS(p.dir)).toEqual([]);
  });
});

// Critère 27 : the generated signature of a constant keeps its declaration (const), and a TSDoc
// refusal names the file and the line of the comment, as API Extractor's messages do.
describe('critère 27 — const in the signature, file and line in a TSDoc refusal (grillhouse-3uv.64)', () => {
  it.each([
    ['a constant of a type', 'tempo', 'export declare const tempo: number;\n'],
    ['a constant of a literal value', 'TEMPO_DEFAUT', 'export declare const TEMPO_DEFAUT = 9;\n'],
    ['an arrow constant', 'vite', 'export declare const vite: (x: number) => number;\n'],
  ])('critère 27 : the generated signature of %s contains const', (_cas, nom, decl) => {
    const p = ecrit({ 'dist/a/index.d.ts': DUREE + '/** Un tempo. */\n' + decl });
    const e = entree(generee(p.lire()), nom);
    expect(e).toMatch(new RegExp(`\\bconst ${nom}\\b`));
  });
  it('critère 27 : the generated signature of a function keeps function, not const', () => {
    const e = entree(generee(ecrit({}).lire()), 'duree');
    expect(e).toMatch(/\bfunction duree\b/);
    expect(e).not.toMatch(/\bconst duree\b/);
  });
  const ligneDe = (texte: string, motif: string) =>
    texte.split('\n').findIndex(l => l.includes(motif)) + 1;
  it.each([
    ['the first export', DUREE.replace(' * @faute', ' * @bidule rien\n * @faute'), '@bidule'],
    [
      'a later export',
      DUREE +
        doc('Rend le tempo.', '@returns Le tempo.', '@machin rien') +
        'export declare function tempo(): number;\n',
      '@machin',
    ],
  ])(
    'critère 27 : an unknown tag on %s is refused, naming the file and the line of the comment',
    (_cas, dts, tag) => {
      const r = apres({ 'dist/a/index.d.ts': dts });
      const ligne = ligneDe(dts, tag);
      refusNommant(r, tag, 'dist/a/index.d.ts', new RegExp(`index\\.d\\.ts:${ligne}\\b`));
    }
  );
});

// Critère 7 : the former rule « one hand-written title per export » leaves the check and the texts.
describe('critère 7 — no hand-written title per export (grillhouse-3uv.64)', () => {
  it('critère 7 : an interface whose hand part titles no export passes', () => {
    const r = apres({
      'src/a/docs/INTERFACE.md': iface(
        '# a\n\nA rend des durées.\n\n## Vue d’ensemble\n\nTout.\n\n'
      ),
      'src/a/index.ts': 'export function duree(x: number): number { return x; }\n',
      'dist/a/index.d.ts': DUREE.replace(' * @faute DUREE_NEGATIVE\n', ''),
    });
    expect(r.stderr).not.toMatch(/ne décrit pas/);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('critère 7 : the writer’s reference no longer asks a hand-written title per element', () => {
    const texte = readFileSync(REFERENCE, 'utf8');
    expect(texte).not.toMatch(/Un titre par élément fourni/);
    expect(texte).not.toMatch(/Chaque export\s+du composant a son titre/);
  });
});

// Critère 8 : the writer's reference describes the new format.
describe('critère 8 — the writer’s reference describes the new format (grillhouse-3uv.64)', () => {
  const texte = readFileSync(REFERENCE, 'utf8');
  it.each([[DEBUT], [FIN], ['TSDoc'], ['@faute'], ['@param'], ['@returns'], ['npm run api']])(
    'critère 8 : the reference names %s',
    mot => {
      expect(texte).toContain(mot);
    }
  );
});
