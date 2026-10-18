import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  FAUTES,
  DUREE,
  entree,
  interfacesEssai,
} from './interfaces-contre-code-essai.js';

// The check of each interface text against its component's code
// (scripts/interfaces-contre-code.mjs, npm run api) and the index of the interfaces
// (scripts/index-interfaces.mjs). This file: the catalogue of the faults, and the generated part
// that npm run api writes and the check compares (grillhouse-3uv.64, critères 3 to 5).
// The projects of trial and their checks: ./interfaces-contre-code-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { iface, projet, ecrit, apres } = interfacesEssai(ESSAIS);

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
