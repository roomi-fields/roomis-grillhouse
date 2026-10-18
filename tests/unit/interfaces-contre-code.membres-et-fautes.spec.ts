import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  refusNommant,
  refus,
  passe,
  generee,
  FIN,
  DEBUT,
  TSCONFIG,
  FAUTES,
  DUREE,
  entree,
  doc,
  titres,
  interfacesEssai,
} from './interfaces-contre-code-essai.js';

// The check of each interface text against its component's code
// (scripts/interfaces-contre-code.mjs, npm run api) and the index of the interfaces
// (scripts/index-interfaces.mjs). This file: the members and constants, the @faute repeated,
// malformed or on a member, the root interface, the marks, the components without exports, the
// hand titles, the frame's tsdoc.json and the entries of an interface or a class
// (grillhouse-3uv.64, critères 13 to 24).
// The projects of trial and their checks: ./interfaces-contre-code-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { iface, projet, ecrit, apres } = interfacesEssai(ESSAIS);

// Critère 13 : the rubrics are required of exports only: a class or interface member requires
// none; an exported constant, arrow included, is a variable and requires its summary only.
describe('critère 13 — members and constants (grillhouse-3uv.64)', () => {
  it('critère 13 : undocumented members of an interface and a class pass', () => {
    passe(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          '/** Un objet lu. */\nexport interface Lu {\n  compte: number;\n  lire(x: number): number;\n}\n' +
          '/** Une horloge. */\nexport declare class Horloge {\n  constructor(t: number);\n  readonly tempo: number;\n  tic(n: number): number;\n}\n',
      })
    );
  });
  it('critère 13 : an exported arrow constant with its summary only passes', () => {
    passe(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          '/** Rend vite une durée. */\nexport declare const vite: (x: number) => number;\n',
      })
    );
  });
  it('critère 13 : an exported arrow constant without its summary is refused', () => {
    refusNommant(
      apres({
        'dist/a/index.d.ts': DUREE + 'export declare const vite: (x: number) => number;\n',
      }),
      'vite',
      /résumé/
    );
  });
});

// Critère 14 : two @faute of the same code on one export are not refused.
describe('critère 14 — a repeated @faute (grillhouse-3uv.64)', () => {
  it('critère 14 : two @faute of the same code pass', () => {
    passe(
      apres({
        'dist/a/index.d.ts': DUREE.replace(
          ' * @faute DUREE_NEGATIVE',
          ' * @faute DUREE_NEGATIVE\n * @faute DUREE_NEGATIVE'
        ),
      })
    );
  });
});

// Critère 15 : an @faute without a code, or whose first word is not a code, is refused as
// malformed, naming the export.
describe('critère 15 — a malformed @faute (grillhouse-3uv.64)', () => {
  it.each([
    ['without a code', ' * @faute'],
    ['whose word is not a code', ' * @faute négatif'],
    ['whose first word is not the code', ' * @faute Le code DUREE_NEGATIVE'],
  ])('critère 15 : an @faute %s is refused, naming the export', (_cas, ligne) => {
    refusNommant(
      apres({
        'dist/a/index.d.ts':
          DUREE +
          doc('Rend le tempo.', '@returns Le tempo.').replace(' */', `${ligne}\n */`) +
          'export declare function tempo(): number;\n',
      }),
      'tempo',
      '@faute'
    );
  });
});

// Critère 16 : the root interface docs/INTERFACE.md does not require the marks.
describe('critère 16 — the root interface needs no marks (grillhouse-3uv.64)', () => {
  it('critère 16 : a root interface without marks passes the check', () => {
    passe(
      apres({
        'docs/INTERFACE.md': '# p\n\nLe projet rend des durées.\n\n## Les composants\n\nUn seul.\n',
      })
    );
  });
  it('critère 16 : npm run api leaves a root interface without marks unchanged', () => {
    const racine = '# p\n\nLe projet rend des durées.\n\n## Les composants\n\nUn seul.\n';
    const p = projet({ 'docs/INTERFACE.md': racine });
    const r = p.run('--ecrire');
    expect(r.status, r.stderr).toBe(0);
    expect(p.lire('docs/INTERFACE.md')).toBe(racine);
    expect(generee(p.lire())).toContain('duree');
  });
});

// Critère 17 : npm run api adds the two marks at the end of an INTERFACE.md that has none; a mark
// alone, doubled or out of order is refused by the check and by npm run api, which writes nothing,
// naming the marks.
describe('critère 17 — the marks added, or refused when broken (grillhouse-3uv.64)', () => {
  it('critère 17 : npm run api adds the marks at the end of an interface without them', () => {
    const main = `# a\n\nA rend des durées.\n${FAUTES}`;
    const p = projet({ 'src/a/docs/INTERFACE.md': main });
    const r = p.run('--ecrire');
    expect(r.status, r.stderr).toBe(0);
    const texte = p.lire();
    expect(texte.startsWith(main)).toBe(true);
    expect(texte.indexOf(DEBUT)).toBeGreaterThanOrEqual(main.length);
    expect(texte.slice(texte.indexOf(FIN) + FIN.length).trim()).toBe('');
    expect(entree(generee(texte), 'duree')).toContain('Rend la durée d’un objet en battements.');
    passe(p.run());
  });
  it.each([
    ['the start mark alone', `# a\n\nA.\n\n${DEBUT}\n${FAUTES}`],
    ['the end mark alone', `# a\n\nA.\n\n${FIN}\n${FAUTES}`],
    ['the marks doubled', `# a\n\nA.\n\n${DEBUT}\n${FIN}\n\n${DEBUT}\n${FIN}\n${FAUTES}`],
    ['a start mark doubled', `# a\n\nA.\n\n${DEBUT}\n${DEBUT}\n${FIN}\n${FAUTES}`],
    ['the marks out of order', `# a\n\nA.\n\n${FIN}\n${DEBUT}\n${FAUTES}`],
  ])(
    'critère 17 : %s is refused by the check and by npm run api, which writes nothing',
    (_cas, texte) => {
      const p = projet({ 'src/a/docs/INTERFACE.md': texte });
      refusNommant(p.run(), 'généré');
      refusNommant(p.run('--ecrire'), 'généré');
      expect(p.lire()).toBe(texte);
    }
  );
});

// Critère 18 : a component without exports has an empty generated part, accepted.
describe('critère 18 — a component without exports (grillhouse-3uv.64)', () => {
  it('critère 18 : its generated part is empty and the check passes', () => {
    const p = ecrit({
      'src/a/index.ts': 'export {};\n',
      'dist/a/index.d.ts': 'export {};\n',
      'src/a/docs/INTERFACE.md': iface(),
    });
    passe(p.run());
    expect(generee(p.lire()).trim()).toBe('');
  });
});

// Critère 19 : npm run api writes the generated part even when a rubric is missing, and returns the
// same refusals as the check.
describe('critère 19 — npm run api writes, then refuses as the check (grillhouse-3uv.64)', () => {
  it('critère 19 : an export without its summary still gets its entry, refused by both', () => {
    const p = projet({
      'dist/a/index.d.ts':
        DUREE + doc('@returns Le tempo.') + 'export declare function tempo(): number;\n',
    });
    const ecriture = p.run('--ecrire');
    refusNommant(ecriture, 'tempo', /résumé/);
    const part = generee(p.lire());
    expect(titres(part, 'tempo')).toHaveLength(1);
    expect(entree(part, 'duree')).toContain('Rend la durée d’un objet en battements.');
    const controle = p.run();
    expect(controle.status).toBe(1);
    expect(refus(controle.stderr).sort()).toEqual(refus(ecriture.stderr).sort());
  });
});

// Critère 20 : a title in code in the hand-written part is no longer checked against the exports.
describe('critère 20 — hand titles in code are free (grillhouse-3uv.64)', () => {
  it('critère 20 : a hand title in code naming no export passes', () => {
    passe(
      apres({
        'src/a/docs/INTERFACE.md': iface(
          '# a\n\nA rend des durées.\n\n## `fantome`(x)\n\nUn nom d’exemple.\n\n',
          FAUTES
        ),
      })
    );
  });
});

// Critère 21 : the check reads the frame's TSDoc configuration (tsdoc.json at the root of the
// repository) for every component, a package of a multi-package repository included.
describe('critère 21 — every component reads the frame’s tsdoc.json (grillhouse-3uv.64)', () => {
  const PAQUET = (dts: string) => ({
    'packages/b/package.json': '{"name":"b","types":"dist/index.d.ts"}',
    'packages/b/tsconfig.json': TSCONFIG,
    'packages/b/src/index.ts':
      "export function vide(s: string): number { if (!s) throw new Error('B_VIDE'); return 1; }\n",
    'packages/b/dist/index.d.ts': dts,
    'packages/b/docs/INTERFACE.md': `# b\n\nB.\n\n${DEBUT}\n${FIN}\n\n## Les fautes\n\n- \`B_VIDE\` : un texte vide.\n`,
  });
  const VIDE =
    doc('Rend 1 pour un texte.', '@param s - Le texte.', '@returns Un.', '@faute B_VIDE') +
    'export declare function vide(s: string): number;\n';

  it('critère 21 : a package without its own tsdoc.json accepts @faute', () => {
    passe(apres(PAQUET(VIDE)));
  });
  it('critère 21 : a package without its own tsdoc.json refuses an unknown tag', () => {
    const r = apres(PAQUET(VIDE.replace(' * @faute', ' * @bidule rien\n * @faute')));
    refusNommant(r, '@bidule');
  });
});

// Critère 22 : the check refuses a code of the « ## Les fautes » catalogue that no @faute of the
// component names, and the refusal names the code.
describe('critère 22 — each catalogue code is named by an @faute (grillhouse-3uv.64)', () => {
  const DEUX_FAUTES = {
    'src/a/index.ts':
      "export function duree(x: number): number { if (x < 0) throw new Error('DUREE_NEGATIVE'); if (x > 9) throw new Error('DUREE_TROP_LONGUE'); return x; }\n" +
      'export function tempo(): number { return 1; }\n',
    'src/a/docs/INTERFACE.md': iface(
      undefined,
      '\n## Les fautes\n\n- `DUREE_NEGATIVE` : un tempo négatif.\n- `DUREE_TROP_LONGUE` : un tempo trop long.\n'
    ),
  };

  it('critère 22 : a catalogue code no @faute names is refused, naming that code only', () => {
    const r = apres(DEUX_FAUTES);
    refusNommant(r, 'DUREE_TROP_LONGUE');
    expect(refus(r.stderr).filter(l => l.includes('DUREE_NEGATIVE'))).toEqual([]);
  });
  it('critère 22 : a catalogue code named by another export’s @faute passes', () => {
    passe(
      apres({
        ...DEUX_FAUTES,
        'dist/a/index.d.ts':
          DUREE +
          doc('Rend le tempo.', '@returns Le tempo.', '@faute DUREE_TROP_LONGUE') +
          'export declare function tempo(): number;\n',
      })
    );
  });
});

// Critère 24 : an @faute written on a class or interface member counts for critères 3 and 22: out of
// the catalogue, it is refused; it names a code of the catalogue.
describe('critère 24 — an @faute on a member (grillhouse-3uv.64)', () => {
  const SANS_FAUTE = DUREE.replace(' * @faute DUREE_NEGATIVE\n', '');
  const membre = (indent: string, ...fautes: string[]) =>
    [`${indent}/**`, `${indent} * Lit un objet.`, `${indent} * @param x - Le tempo.`]
      .concat(
        [`${indent} * @returns Le compte.`],
        fautes.map(f => `${indent} * @faute ${f}`)
      )
      .concat([`${indent} */`, `${indent}lire(x: number): number;`])
      .join('\n');
  const CLASSE = (...fautes: string[]) =>
    `/** Un lecteur. */\nexport declare class Lecteur {\n${membre('  ', ...fautes)}\n}\n`;
  const INTERFACE = (...fautes: string[]) =>
    `/** Un lecteur. */\nexport interface Lecteur {\n${membre('  ', ...fautes)}\n}\n`;

  it.each([
    ['a class method', CLASSE],
    ['an interface member', INTERFACE],
  ])(
    'critère 24 : an @faute out of the catalogue on %s is refused, naming the code',
    (_cas, fait) => {
      refusNommant(
        apres({ 'dist/a/index.d.ts': DUREE + fait('DUREE_NEGATIVE', 'HORS_CATALOGUE') }),
        '@faute',
        'HORS_CATALOGUE'
      );
    }
  );
  it.each([
    ['a class method', CLASSE],
    ['an interface member', INTERFACE],
  ])(
    'critère 24 : a catalogue fault named only by %s is not refused under critère 22',
    (_cas, fait) => {
      const r = apres({ 'dist/a/index.d.ts': SANS_FAUTE + fait('DUREE_NEGATIVE') });
      expect(refus(r.stderr).filter(l => l.includes('DUREE_NEGATIVE'))).toEqual([]);
      passe(r);
    }
  );
});

// Critère 23 : the generated entry of an interface or a class lists its members, with their summary
// when they have one; a member without summary stays accepted.
describe('critère 23 — the entry of an interface or a class lists its members (grillhouse-3uv.64)', () => {
  it('critère 23 : an interface entry lists each member, with its summary when it has one', () => {
    const p = ecrit({
      'dist/a/index.d.ts':
        DUREE +
        '/** Un objet lu. */\nexport interface Lu {\n  /** Le nombre de battements lus. */\n  compte: number;\n  nomPropre: string;\n}\n',
    });
    passe(p.run());
    const e = entree(generee(p.lire()), 'Lu');
    expect(e).toMatch(/\bcompte\b/);
    expect(e).toContain('Le nombre de battements lus.');
    expect(e).toMatch(/\bnomPropre\b/);
  });
  it('critère 23 : a class entry lists its methods and properties, with their summaries', () => {
    const p = ecrit({
      'dist/a/index.d.ts':
        DUREE +
        '/** Une horloge. */\nexport declare class Horloge {\n  /** Fait avancer d’un battement. */\n  tic(): void;\n  /** Le tempo courant. */\n  readonly tempoCourant: number;\n  arreter(): void;\n}\n',
    });
    passe(p.run());
    const e = entree(generee(p.lire()), 'Horloge');
    expect(e).toMatch(/\btic\b/);
    expect(e).toContain('Fait avancer d’un battement.');
    expect(e).toMatch(/\btempoCourant\b/);
    expect(e).toContain('Le tempo courant.');
    expect(e).toMatch(/\barreter\b/);
  });
  it('critère 23 : the members of one export stay out of another export’s entry', () => {
    const p = ecrit({
      'dist/a/index.d.ts':
        DUREE +
        '/** Un objet lu. */\nexport interface Lu {\n  /** Le nombre de battements lus. */\n  compte: number;\n}\n',
    });
    expect(entree(generee(p.lire()), 'duree')).not.toContain('Le nombre de battements lus.');
  });
});
