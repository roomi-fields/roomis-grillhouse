import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declare } from '../../scripts/interfaces-contre-code.mjs';
import { index } from '../../scripts/index-interfaces.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.resolve(__dirname, '../..');
const SCRIPT = path.join(RACINE, 'scripts/interfaces-contre-code.mjs');
const MODULES = path.join(RACINE, 'node_modules');
const TSDOC = path.join(RACINE, 'tsdoc.json');
const REFERENCE = path.join(
  RACINE,
  '.claude/skills/redacteur/references/documents-d-un-composant.md'
);

const DEBUT = '<!-- généré: début -->';
const FIN = '<!-- généré: fin -->';

const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true } });

// The contract of `duree`, written in TSDoc on the export (grillhouse-3uv.64, Q1-Q2).
const DUREE = [
  '/**',
  ' * Rend la durée d’un objet en battements.',
  ' * @param x - Le tempo de l’objet.',
  ' * @returns La durée, positive.',
  ' * @faute DUREE_NEGATIVE',
  ' */',
  'export declare function duree(x: number): number;',
  '',
].join('\n');

const iface = (avant = '# a\n\nA rend des durées.\n\n', apres = '') =>
  `${avant}${DEBUT}\n${FIN}\n${apres}`;

const FAUTES = '\n## Les fautes\n\n- `DUREE_NEGATIVE` : un tempo négatif.\n';

// A one-package project whose module `a` is built in dist/a, with the given files on top. The
// frame's TSDoc configuration sits at its root, as in a project installed from the frame.
function projet(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(ESSAIS, 'icc-'));
  const base = {
    'package.json': '{"name":"p","types":"dist/index.d.ts"}',
    'tsconfig.json': TSCONFIG,
    'src/a/index.ts':
      "export function duree(x: number): number { if (x < 0) throw new Error('DUREE_NEGATIVE'); return x; }\n",
    'dist/a/index.d.ts': DUREE,
    'src/a/docs/INTERFACE.md': iface(undefined, FAUTES),
  };
  for (const [rel, text] of Object.entries({ ...base, ...files })) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  if (existsSync(TSDOC)) {
    copyFileSync(TSDOC, path.join(dir, 'tsdoc.json'));
  }
  symlinkSync(MODULES, path.join(dir, 'node_modules'));
  const run = (...args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  const lire = (rel = 'src/a/docs/INTERFACE.md') => readFileSync(path.join(dir, rel), 'utf8');
  return { dir, run, lire };
}
const ecrit = (files: Record<string, string>) => {
  const p = projet(files);
  p.run('--ecrire');
  return p;
};
const apres = (files: Record<string, string>, change: Record<string, string> = {}) => {
  const p = ecrit(files);
  for (const [rel, text] of Object.entries(change)) {
    writeFileSync(path.join(p.dir, rel), text);
  }
  return p.run();
};

// The generated part of an interface text: what lies strictly between the two marks.
const generee = (texte: string) => {
  const d = texte.indexOf(DEBUT);
  const f = texte.indexOf(FIN);
  expect(d, 'the start mark').toBeGreaterThanOrEqual(0);
  expect(f, 'the end mark').toBeGreaterThan(d);
  return texte.slice(d + DEBUT.length, f);
};
// The titles in code of one export in a generated part.
const titres = (part: string, nom: string) =>
  part.split('\n').filter(l => new RegExp(`^#{2,4} \`${nom}\``).test(l));
// The entry of one export in a generated part: from its title in code to the next title of the
// same or a higher level (a member may have its own sub-title inside the entry).
const entree = (part: string, nom: string) => {
  const lignes = part.split('\n');
  const i = lignes.findIndex(l => new RegExp(`^#{2,4} \`${nom}\``).test(l));
  expect(i, `the title of ${nom}`).toBeGreaterThanOrEqual(0);
  const niveau = /^#+/.exec(lignes[i])![0].length;
  const j = lignes.findIndex((l, k) => k > i && new RegExp(`^#{1,${niveau}} `).test(l));
  return lignes.slice(i, j < 0 ? undefined : j).join('\n');
};
// The refusal lines (⛔) of a run.
const refus = (stderr: string) => stderr.split('\n').filter(l => l.startsWith('⛔'));
// Asserts a refusal line that contains every one of <motifs>.
const refusNommant = (
  r: { status: number | null; stderr: string },
  ...motifs: (string | RegExp)[]
) => {
  expect(r.status, r.stderr).toBe(1);
  const ligne = refus(r.stderr).find(l =>
    motifs.every(m => (typeof m === 'string' ? l.includes(m) : m.test(l)))
  );
  expect(ligne, `a refusal naming ${motifs.join(', ')}:\n${r.stderr}`).toBeDefined();
};
const passe = (r: { status: number | null; stderr: string }) => {
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
};
// A TSDoc comment of the given lines.
const doc = (...lignes: string[]) => ['/**', ...lignes.map(l => ` * ${l}`), ' */', ''].join('\n');

describe('declare', () => {
  it('reads the fault codes of « ## Les fautes », not those of code blocks elsewhere', () => {
    const d = declare(
      '# a\n\n## Consommateurs\n\n```md\nAUTRE_CODE\n```\n\n## Les fautes\n\n```text\nPARSE_EXPECTED PARSE_LEFTOVER\n```\n'
    );
    expect([...d.fautes!]).toEqual(['PARSE_EXPECTED', 'PARSE_LEFTOVER']);
  });
  it('has no fault list without the section', () => {
    expect(declare('# a\n').fautes).toBeNull();
  });
});

describe('the check', () => {
  it('passes an interface whose generated part is what npm run api writes', () => {
    const r = apres({});
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('refuses an API changed without its report', () => {
    const r = apres({}, { 'dist/a/index.d.ts': DUREE.replace('x: number)', 'x: string)') });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/l'API a changé sans son rapport/);
  });
  it('refuses a listed fault the code does not raise, and a raised fault not listed', () => {
    const r = apres({
      'src/a/docs/INTERFACE.md': iface(
        undefined,
        '\n## Les fautes\n\n```text\nDUREE_NEGATIVE DUREE_ABSENTE\n```\n'
      ),
      'src/a/index.ts':
        "export function duree(x: number): number { if (x < 0) throw new Error('DUREE_NEGATIVE'); if (x > 9) throw new Error('DUREE_TROP_LONGUE'); return x; }\n",
      'src/a/index.spec.ts': "const t = 'DUREE_DE_TEST';\n",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/DUREE_ABSENTE est listée, mais le code ne la produit pas/);
    expect(r.stderr).toMatch(/le code produit DUREE_TROP_LONGUE/);
    expect(r.stderr).not.toMatch(/DUREE_DE_TEST/);
  });
  it('reports a component without interface, without refusing', () => {
    const r = apres({ 'src/b/index.ts': 'export const b = 1;\n' });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/src\/b n'a pas d'interface/);
  });
  it('refuses a component whose build is missing', () => {
    const q = projet({ 'package.json': '{"name":"p","types":"build/index.d.ts"}' });
    expect(q.run().stderr).toMatch(/construis d'abord/);
  });
  it("takes a package's main entry only, not its test material", () => {
    const p = ecrit({
      'packages/b/package.json': JSON.stringify({
        name: 'b',
        exports: {
          '.': { types: './dist/index.d.ts' },
          './test-fixtures': { types: './dist/fixtures.d.ts' },
        },
      }),
      'packages/b/tsconfig.json': TSCONFIG,
      'packages/b/dist/index.d.ts': '/** Un nombre. */\nexport declare const b: number;\n',
      'packages/b/dist/fixtures.d.ts': 'export declare const cas: number;\n',
      'packages/b/docs/INTERFACE.md': `# b\n\nB.\n\n${DEBUT}\n${FIN}\n`,
    });
    const r = p.run();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(generee(p.lire('packages/b/docs/INTERFACE.md'))).not.toMatch(/\bcas\b/);
  });
  // A package that exports only subpaths (the shared test material) has no public API: API
  // Extractor reads one entry point, and this package has none.
  const MATIERE = {
    'packages/corpus/package.json': JSON.stringify({
      name: 'corpus',
      exports: { './test-fixtures': { types: './dist/fixtures.d.ts' } },
    }),
    'packages/corpus/tsconfig.json': TSCONFIG,
    'packages/corpus/src/fixtures.ts': 'export const cas = 1;\n',
    'packages/corpus/docs/INTERFACE.md': '# corpus\n\nLa matière de test partagée.\n',
  };
  it('passes a package without a « . » entry, unbuilt, and writes it no report nor part', () => {
    const p = ecrit(MATIERE);
    passe(p.run());
    expect(p.lire('packages/corpus/docs/INTERFACE.md')).toBe(
      MATIERE['packages/corpus/docs/INTERFACE.md']
    );
    expect(existsSync(path.join(p.dir, 'packages/corpus/docs/INTERFACE.api.md'))).toBe(false);
  });
  it('refuses a package with a « . » entry whose build is missing', () => {
    const p = ecrit({
      ...MATIERE,
      'packages/corpus/package.json': JSON.stringify({
        name: 'corpus',
        exports: {
          '.': { types: './dist/index.d.ts' },
          './test-fixtures': { types: './dist/fixtures.d.ts' },
        },
      }),
    });
    refusNommant(p.run(), 'packages/corpus', /construis d'abord/);
  });
});

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

// Critère 3 : an @faute CODE whose code is not in the component's « ## Les fautes » catalogue is
// refused.
describe('critère 3 — an @faute names a fault of the catalogue (grillhouse-3uv.64)', () => {
  it('critère 3 : an @faute code absent from the catalogue is refused, naming the code', () => {
    const r = apres({
      'dist/a/index.d.ts': DUREE.replace(
        ' * @faute DUREE_NEGATIVE',
        ' * @faute DUREE_NEGATIVE\n * @faute DUREE_INCONNUE'
      ),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*DUREE_INCONNUE/);
  });
  it('critère 3 : an @faute on a component without a « ## Les fautes » catalogue is refused', () => {
    const r = apres({
      'src/a/docs/INTERFACE.md': iface(),
      'src/a/index.ts': 'export function duree(x: number): number { return x; }\n',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*DUREE_NEGATIVE/);
  });
  it('critère 3 : a second export whose @faute is in the catalogue passes', () => {
    const r = apres({
      'dist/a/index.d.ts':
        DUREE +
        '/**\n * Rend le tempo.\n * @param s - Le texte.\n * @returns Le tempo.\n * @faute DUREE_NEGATIVE\n */\nexport declare function tempo(s: string): number;\n',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

// Critères 3, 19 and 22 when « ## Les fautes » precedes the marks, as npm run api places them at
// the end of a text that has none: the catalogue is the hand-written section, never the codes the
// generated part recopies (Q3).
describe('critères 3, 19, 22 — the catalogue is read outside the generated part (grillhouse-3uv.64)', () => {
  const AUTRE = {
    'src/a/index.ts':
      "export function duree(x: number): number { if (x < 0) throw new Error('DUREE_NEGATIVE'); if (x > 9) throw new Error('DUREE_AUTRE'); return x; }\n",
    'dist/a/index.d.ts': DUREE.replace(
      ' * @faute DUREE_NEGATIVE',
      ' * @faute DUREE_NEGATIVE\n * @faute DUREE_AUTRE'
    ),
  };
  it.each([
    ['without marks (npm run api adds them after the catalogue)', `# a\n\nA.\n${FAUTES}`],
    ['with its marks after the catalogue', `# a\n\nA.\n${FAUTES}\n${DEBUT}\n${FIN}\n`],
  ])(
    'critère 3 : an @faute out of the catalogue, the interface %s, is refused by npm run api and by the next check',
    (_cas, texte) => {
      const p = projet({ ...AUTRE, 'src/a/docs/INTERFACE.md': texte });
      const ecriture = p.run('--ecrire');
      refusNommant(ecriture, '@faute', 'DUREE_AUTRE');
      expect(generee(p.lire())).toContain('DUREE_AUTRE');
      const controle = p.run();
      refusNommant(controle, '@faute', 'DUREE_AUTRE');
      refusNommant(controle, /Les fautes/, 'DUREE_AUTRE');
      // Critère 19: npm run api returns the same refusals as the check.
      expect(refus(controle.stderr).sort()).toEqual(refus(ecriture.stderr).sort());
    }
  );
  it('critère 22 : an exported constant in capitals, recopied in the generated part, stays out of the catalogue', () => {
    const p = ecrit({
      'src/a/docs/INTERFACE.md': `# a\n\nA.\n${FAUTES}`,
      'dist/a/index.d.ts':
        DUREE + '/** La durée maximale. */\nexport declare const DUREE_MAX = 9;\n',
    });
    expect(entree(generee(p.lire()), 'DUREE_MAX')).toContain('La durée maximale.');
    const r = p.run();
    expect(refus(r.stderr).filter(l => l.includes('DUREE_MAX'))).toEqual([]);
    passe(r);
  });
});

// Critère 4 : npm run api writes, between the two marks of docs/INTERFACE.md, one entry per export
// (title by its name in code, signature, summary, parameters, return, faults), drawn from the TSDoc
// comments; the hand-written part is never touched.
describe('critère 4 — npm run api writes the generated part (grillhouse-3uv.64)', () => {
  const DEUX =
    DUREE + '/**\n * Un objet lu depuis la source.\n */\nexport interface Lu {\n  n: number;\n}\n';

  it('critère 4 : the entry of a function gives its title, signature, summary, parameter, return and fault', () => {
    const p = ecrit({});
    const e = entree(generee(p.lire()), 'duree');
    expect(e).toMatch(/x: number/);
    expect(e).toContain('Rend la durée d’un objet en battements.');
    expect(e).toMatch(/\bx\b[\s\S]*Le tempo de l’objet\./);
    expect(e).toContain('La durée, positive.');
    expect(e).toContain('DUREE_NEGATIVE');
  });
  it('critère 4 : each export has its entry, an interface as well as a function', () => {
    const p = ecrit({ 'dist/a/index.d.ts': DEUX });
    const part = generee(p.lire());
    expect(entree(part, 'Lu')).toContain('Un objet lu depuis la source.');
    expect(entree(part, 'duree')).toContain('Rend la durée d’un objet en battements.');
    expect(entree(part, 'duree')).not.toContain('Un objet lu depuis la source.');
  });
  it('critère 4 : the entries follow the TSDoc comments when they change', () => {
    const p = ecrit({});
    writeFileSync(
      path.join(p.dir, 'dist/a/index.d.ts'),
      DUREE.replace('Rend la durée d’un objet en battements.', 'Calcule une durée.')
    );
    p.run('--ecrire');
    const e = entree(generee(p.lire()), 'duree');
    expect(e).toContain('Calcule une durée.');
    expect(e).not.toContain('Rend la durée d’un objet en battements.');
  });
  it('critère 4 : the hand-written parts before and after the marks are kept byte for byte', () => {
    const avant =
      '# a — l’interface\n\nA rend des durées. Il ne lit rien.\n\n## Vue d’ensemble\n\n```ts\n## `faux`\n```\n\n| x | y |\n\n';
    const apresMarques = `${FAUTES}\n## Consommateurs\n\n- \`b\` : duree\n`;
    const p = ecrit({ 'src/a/docs/INTERFACE.md': iface(avant, apresMarques) });
    const texte = p.lire();
    expect(entree(generee(texte), 'duree')).toContain('Rend la durée d’un objet en battements.');
    expect(texte.startsWith(avant + DEBUT)).toBe(true);
    expect(texte.endsWith(FIN + '\n' + apresMarques)).toBe(true);
  });
  it('critère 4 : a part written from stale content is replaced whole, the hand part untouched', () => {
    const avant = '# a\n\nA.\n\n';
    const p = ecrit({
      'src/a/docs/INTERFACE.md': `${avant}${DEBUT}\n## \`vieux\`\n\nUn export disparu.\n${FIN}\n${FAUTES}`,
    });
    const texte = p.lire();
    expect(generee(texte)).not.toMatch(/vieux|disparu/);
    expect(texte.startsWith(avant + DEBUT)).toBe(true);
    expect(texte.endsWith(FIN + '\n' + FAUTES)).toBe(true);
  });
  it('critère 4 : writing twice gives the same text', () => {
    const p = ecrit({ 'dist/a/index.d.ts': DEUX });
    const premier = p.lire();
    expect(entree(generee(premier), 'Lu')).toContain('Un objet lu depuis la source.');
    p.run('--ecrire');
    expect(p.lire()).toBe(premier);
  });
});

// Critère 5 : the check refuses a generated part that differs from what npm run api would write,
// and an INTERFACE.md without the two marks, naming the command that rewrites it.
describe('critère 5 — the check refuses a stale generated part (grillhouse-3uv.64)', () => {
  it('critère 5 : a generated part edited by hand is refused, naming npm run api', () => {
    const p = ecrit({});
    const texte = p.lire();
    const part = generee(texte);
    writeFileSync(
      path.join(p.dir, 'src/a/docs/INTERFACE.md'),
      texte.replace(part, part.replace('Rend la durée', 'Donne la durée'))
    );
    const r = p.run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*npm run api/);
  });
  it('critère 5 : a TSDoc comment changed without npm run api is refused', () => {
    const r = apres(
      {},
      { 'dist/a/index.d.ts': DUREE.replace('La durée, positive.', 'La durée, jamais négative.') }
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*npm run api/);
  });
  it('critère 5 : a new export without npm run api is refused', () => {
    const r = apres(
      {},
      {
        'dist/a/index.d.ts':
          DUREE + '/** Le tempo par défaut. */\nexport declare const tempo: number;\n',
      }
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*npm run api/);
  });
  it('critère 5 : an INTERFACE.md without the two marks is refused, naming npm run api', () => {
    const r = projet({ 'src/a/docs/INTERFACE.md': `# a\n\nA.\n${FAUTES}` }).run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*npm run api/);
  });
});

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

// grillhouse-3uv.60: the check names the command that writes a report — npm run api, after the
// build — when the report is missing (critère 2) and when the API changed without it (critère 6).
// Each project below is otherwise up to date (TSDoc, generated parts written by npm run api), so
// the report is the only thing it lacks.
const PACKAGE_B = {
  'packages/b/package.json': JSON.stringify({ name: 'b', types: './dist/index.d.ts' }),
  'packages/b/tsconfig.json': TSCONFIG,
  'packages/b/dist/index.d.ts': '/** Un nombre. */\nexport declare const b: number;\n',
  'packages/b/docs/INTERFACE.md': `# b\n\nB.\n\n${DEBUT}\n${FIN}\n`,
};
const RAPPORT_A = 'src/a/docs/INTERFACE.api.md';
const RAPPORT_B = 'packages/b/docs/INTERFACE.api.md';
const NOMME_API = /npm run api/;
const NOMME_CONSTRUCTION = /constru/i;
// `duree` with another parameter type: a changed API.
const DUREE_CHANGEE = DUREE.replace('x: number)', 'x: string)');
// `duree` and a second export, `tempo`.
const DUREE_ET_TEMPO = DUREE + '/** Un tempo. */\nexport declare const tempo: number;\n';
// The refusals of a run as one text.
const refusTexte = (stderr: string) => refus(stderr).join('\n');
const pose = (p: { dir: string }, files: Record<string, string>) => {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(p.dir, rel)), { recursive: true });
    writeFileSync(path.join(p.dir, rel), text);
  }
};
// A project written by npm run api, then the report of module a removed.
const sansRapport = (files: Record<string, string> = {}) => {
  const p = ecrit(files);
  rmSync(path.join(p.dir, RAPPORT_A));
  return p;
};
// A project whose module a has its report, with package b written by npm run api, then the report
// of b removed.
const avecPaquetSansRapport = (b: Record<string, string> = {}) => {
  const p = ecrit({});
  pose(p, { ...PACKAGE_B, ...b });
  p.run('--ecrire');
  rmSync(path.join(p.dir, RAPPORT_B));
  return p;
};
// A project whose code changed and whose interfaces npm run api rewrote, the report of module a
// put back to the one of the former code: the API changed without its report.
const sansSonRapport = (files: Record<string, string>, change: Record<string, string>) => {
  const p = ecrit(files);
  const ancien = p.lire(RAPPORT_A);
  pose(p, change);
  p.run('--ecrire');
  writeFileSync(path.join(p.dir, RAPPORT_A), ancien);
  return p;
};
// Module a's API changed without its report, and package b without its report.
const deuxRapportsPerimes = () => {
  const p = ecrit({});
  const ancien = p.lire(RAPPORT_A);
  pose(p, { ...PACKAGE_B, 'dist/a/index.d.ts': DUREE_CHANGEE });
  p.run('--ecrire');
  writeFileSync(path.join(p.dir, RAPPORT_A), ancien);
  rmSync(path.join(p.dir, RAPPORT_B));
  return p;
};

describe('grillhouse-3uv.60 critère 2 — a missing report names npm run api, after the build', () => {
  it('critère 2: a built module with its interface and no report is refused as a missing report', () => {
    const r = sansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr)).toMatch(/src\/a/);
    expect(refusTexte(r.stderr)).toMatch(/INTERFACE\.api\.md/);
    expect(refusTexte(r.stderr)).toMatch(/manque/);
    expect(refusTexte(r.stderr)).not.toMatch(/a changé/);
  });
  it('critère 2: the refusal of a missing report names npm run api and the build', () => {
    const r = sansRapport().run();
    expect(refusTexte(r.stderr)).toMatch(NOMME_API);
    expect(refusTexte(r.stderr)).toMatch(NOMME_CONSTRUCTION);
  });
  it('critère 2: a built package with its interface and no report is refused the same way', () => {
    const r = avecPaquetSansRapport().run();
    expect(r.status).toBe(1);
    const lignes = refus(r.stderr).filter(l => l.includes('packages/b'));
    expect(lignes.join('\n')).toMatch(/manque/);
    expect(lignes.join('\n')).toMatch(NOMME_API);
    expect(lignes.join('\n')).not.toMatch(/a changé/);
    expect(refusTexte(r.stderr)).not.toMatch(/src\/a/);
  });
  it('critère 2: --ecrire writes the missing report, and the check then passes', () => {
    const p = projet({});
    expect(p.run('--ecrire').status).toBe(0);
    expect(existsSync(path.join(p.dir, RAPPORT_A))).toBe(true);
    const r = p.run();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('grillhouse-3uv.60 critère 6 — an API changed without its report names npm run api', () => {
  it('critère 6: the refusal of a changed API names npm run api', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_CHANGEE }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr)).toMatch(/l'API a changé sans son rapport/);
    expect(refusTexte(r.stderr)).toMatch(NOMME_API);
    expect(refusTexte(r.stderr)).not.toMatch(/manque/);
  });
  it('critère 6: an export added without its report names npm run api too', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_ET_TEMPO }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr)).toMatch(/a changé/);
    expect(refusTexte(r.stderr)).toMatch(NOMME_API);
  });
});

// grillhouse-3uv.60 critère 10: npm run api replaces the former command in the check's messages.
const ANCIENNE_COMMANDE = /--ecrire|interfaces-contre-code\.mjs/;

describe('grillhouse-3uv.60 critère 10 — the messages no longer name the former command', () => {
  it('critère 10: the refusal of a missing report names neither --ecrire nor the script', () => {
    const r = sansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'a refusal is written').toMatch(/src\/a/);
    expect(r.stderr).not.toMatch(ANCIENNE_COMMANDE);
  });
  it('critère 10: the refusal of a changed API names neither --ecrire nor the script', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_CHANGEE }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'a refusal is written').toMatch(/src\/a/);
    expect(r.stderr).not.toMatch(ANCIENNE_COMMANDE);
  });
  it('critère 10: the refusal of a package missing its report names neither --ecrire nor the script', () => {
    const r = avecPaquetSansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'a refusal is written').toMatch(/packages\/b/);
    expect(r.stderr).not.toMatch(ANCIENNE_COMMANDE);
  });
  it('critère 10: each refusal of a run with several reports out of date names npm run api, never the former command', () => {
    const r = deuxRapportsPerimes().run();
    const lignes = refus(r.stderr).filter(l => /manque|a changé/.test(l));
    expect(lignes.length, 'two refusals, one per component').toBe(2);
    for (const l of lignes) {
      expect(l).toMatch(NOMME_API);
      expect(l).not.toMatch(ANCIENNE_COMMANDE);
    }
  });
});

// grillhouse-3uv.60 critère 11: when the check refuses a missing or changed report, it does not
// relay API Extractor's warning on that same report (« Please copy the file /tmp/… or perform a
// local build ») — its refusal alone says what to do.
const AVERTISSEMENT_DU_RAPPORT =
  /API report file is missing|changed the API signature|Please copy the file|perform a local build/;
// An absolute path to a report file (API Extractor's temporary report, or the report it asks to
// copy it to): the run names its reports relatively, by docs/INTERFACE.api.md.
const CHEMIN_DE_RAPPORT = /(?:^|[\s"'(])\/[^\s"']*INTERFACE\.api\.md/m;
// The signals of a run (⚠️ lines).
const signaux = (stderr: string) =>
  stderr
    .split('\n')
    .filter(l => l.startsWith('⚠️'))
    .join('\n');

describe("grillhouse-3uv.60 critère 11 — a refused report comes without API Extractor's warning on it", () => {
  it('critère 11: a module missing its report is refused, without the warning on that report', () => {
    const r = sansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/src\/a.*INTERFACE\.api\.md/);
    expect(signaux(r.stderr)).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: the run names no temporary report file', () => {
    const r = sansRapport().run();
    expect(r.status).toBe(1);
    expect(r.stderr).not.toMatch(CHEMIN_DE_RAPPORT);
  });
  it('critère 11: a package missing its report is refused, without the warning on that report', () => {
    const r = avecPaquetSansRapport().run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/packages\/b/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: an API changed without its report is refused, without the warning on that report', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_CHANGEE }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/a changé/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: an export added without its report is refused, without the warning on that report', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_ET_TEMPO }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/a changé/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it('critère 11: a run with one report missing and another changed relays neither warning', () => {
    const r = deuxRapportsPerimes().run();
    expect(r.status).toBe(1);
    const lignes = refus(r.stderr).filter(l => /INTERFACE\.api\.md/.test(l));
    expect(lignes.length, 'two refusals, one per component').toBe(2);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
  it("critère 11: the check's other signals stay, next to a refused report", () => {
    const r = sansRapport({ 'src/b/index.ts': 'export const b = 1;\n' }).run();
    expect(r.status).toBe(1);
    expect(refusTexte(r.stderr), 'the refusal is written').toMatch(/src\/a.*INTERFACE\.api\.md/);
    expect(signaux(r.stderr)).toMatch(/src\/b n'a pas d'interface/);
    expect(r.stderr).not.toMatch(AVERTISSEMENT_DU_RAPPORT);
  });
});

// grillhouse-3uv.60 critère 12: when the report is missing or changed, the interface is judged
// against the built API, never against the report in the repository. Its tests of the former
// rule (an element described that the code does not export, an export the interface does not
// describe) left with that rule (grillhouse-3uv.64, critère 7).
describe('grillhouse-3uv.60 critère 12 — the interface is judged against the built API', () => {
  it('critère 12: a module without its report, its generated part up to date, gets the missing-report refusal only', () => {
    const r = sansRapport({ 'dist/a/index.d.ts': DUREE_ET_TEMPO }).run();
    const lignes = refus(r.stderr);
    expect(lignes.length, r.stderr).toBe(1);
    expect(lignes[0]).toMatch(/manque/);
  });
  it('critère 12: an export added to the code and the generated part without its report gets the changed-API refusal only', () => {
    const r = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_ET_TEMPO }).run();
    const lignes = refus(r.stderr);
    expect(lignes.length, r.stderr).toBe(1);
    expect(lignes[0]).toMatch(/a changé/);
    expect(lignes[0]).not.toMatch(/\btempo\b/);
  });
  it('critère 12: the comparison to the built API leaves the report in the repository untouched', () => {
    const p = sansRapport();
    p.run();
    expect(existsSync(path.join(p.dir, RAPPORT_A))).toBe(false);
  });
  it('critère 12: a changed API leaves the former report in the repository untouched', () => {
    const p = sansSonRapport({}, { 'dist/a/index.d.ts': DUREE_CHANGEE });
    const ancien = p.lire(RAPPORT_A);
    p.run();
    expect(p.lire(RAPPORT_A)).toBe(ancien);
  });
});
