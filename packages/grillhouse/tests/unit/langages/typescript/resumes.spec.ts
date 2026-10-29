// `scripts/langages/typescript/resumes.mjs`: the first sentence of the summary of each published element holds in
// 80 characters, as Debian's « synopsis-too-long » and clippy's `too_long_first_doc_paragraph`
// hold it. Witness: the section « Ce que les composants d'avant publient » of an agent's
// instruction and the index of the interfaces carry that sentence for every element.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gardesDuCadre } from '../../../../scripts/gardes-du-cadre.mjs';
import { LONGUEUR_MAX, verifier } from '../../../../scripts/langages/typescript/resumes.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/langages/typescript/resumes.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'resumes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEBUT = '<!-- généré: début -->';
const FIN = '<!-- généré: fin -->';

// A sentence of exactly <n> characters, ending with its period.
const phrase = (n: number) => `${'é'.repeat(n - 1)}.`;

// One generated entry, as `npm run api` writes it: its heading, its summary, its signature.
const entree = (nom: string, resume: string) => [
  '',
  `### \`${nom}\``,
  '',
  resume,
  '',
  '```ts',
  `export declare function ${nom}(): void;`,
  '```',
];

// A repository with the package `a`: its source (each export after its TSDoc comment) and its
// interface (the generated part, one entry per export).
function depot(elements: Record<string, string>, autres: Record<string, string> = {}) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const fichiers: Record<string, string> = {
    'packages/a/package.json': JSON.stringify({ name: '@demo/a', types: 'dist/index.d.ts' }),
    'packages/a/src/index.ts': [
      "export { b } from './b';",
      ...Object.entries(elements).flatMap(([nom, resume]) => [
        '',
        `/** ${resume} */`,
        `export function ${nom}(): void {}`,
      ]),
      '',
    ].join('\n'),
    'packages/a/src/b.ts': '/** Rend b. */\nexport function b(): void {}\n',
    'packages/a/docs/INTERFACE.md': [
      '# a',
      '',
      'Le composant a.',
      '',
      DEBUT,
      ...Object.entries(elements).flatMap(([nom, resume]) => entree(nom, resume)),
      ...entree('b', 'Rend b.'),
      '',
      FIN,
      '',
    ].join('\n'),
    ...autres,
  };
  for (const [rel, texte] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    writeFileSync(path.join(racine, rel), texte);
  }
  return racine;
}

const jouer = (racine: string, env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SCRIPT], {
    cwd: racine,
    encoding: 'utf8',
    env: { ...process.env, GRILLHOUSE_DETTE: '', GRILLHOUSE_ENVELOPPE: '', ...env },
  });

describe('resumes — the first sentence of a summary holds in 80 characters', () => {
  it('one threshold, named: 80', () => {
    expect(LONGUEUR_MAX).toBe(80);
  });

  it('a first sentence of 81 characters is refused at its element, with what to do', () => {
    const racine = depot({ duree: phrase(81) });
    const r = jouer(racine);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('packages/a/docs/INTERFACE.md § `duree`');
    expect(r.stderr).toMatch(/\b81\b/);
    expect(r.stderr).toMatch(/\b80\b/);
    expect(r.stderr).toMatch(/raccourcis la première phrase/i);
    expect(r.stderr).toMatch(/phrases suivantes/);
    expect(r.stderr).toMatch(/commentaire de documentation de l’export/);
    expect(r.stderr).toContain('npm run api');
  });

  it('a first sentence of 80 characters passes, and the guard says nothing', () => {
    const r = jouer(depot({ duree: phrase(80) }));
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('the measure is the first sentence the index keeps: a long sentence after it passes', () => {
    const r = jouer(depot({ duree: `Rend la durée. ${phrase(200)}` }));
    expect(r.status).toBe(0);
  });

  it('a summary without a period is measured whole', () => {
    const r = jouer(depot({ duree: 'é'.repeat(81) }));
    expect(r.status).toBe(1);
  });

  it('the finding is keyed by its interface and its rule, for the debt', () => {
    const racine = depot({ duree: phrase(81), tempo: phrase(90) });
    expect(verifier(racine, {})).toEqual([
      expect.objectContaining({
        fichier: 'packages/a/docs/INTERFACE.md',
        regle: 'resume-trop-long',
      }),
      expect.objectContaining({
        fichier: 'packages/a/docs/INTERFACE.md',
        regle: 'resume-trop-long',
      }),
    ]);
  });

  it('the known debt is inscribed, then passes; a new finding is refused', () => {
    const racine = depot({ duree: phrase(81) });
    expect(jouer(racine, { GRILLHOUSE_DETTE: 'inscrire' }).status).toBe(0);
    const dette = JSON.parse(readFileSync(path.join(racine, 'grillhouse-dette.json'), 'utf8')) as {
      resumes: Record<string, Record<string, { count: number }>>;
    };
    expect(dette.resumes['packages/a/docs/INTERFACE.md']['resume-trop-long'].count).toBe(1);
    expect(jouer(racine).status).toBe(0);
    const neuf = depot({ duree: phrase(81), tempo: phrase(81) });
    writeFileSync(path.join(neuf, 'grillhouse-dette.json'), JSON.stringify(dette));
    expect(jouer(neuf).status).toBe(1);
  });

  it('in the envelope of a component, its neighbours are not judged', () => {
    const racine = depot({ duree: phrase(81) });
    mkdirSync(path.join(racine, 'packages/c'), { recursive: true });
    writeFileSync(path.join(racine, 'packages/c/package.json'), '{"name":"@demo/c"}');
    expect(jouer(racine, { GRILLHOUSE_ENVELOPPE: 'packages/c' }).status).toBe(0);
  });

  it('the frame itself passes the guard', () => {
    expect(jouer(DEPOT).status).toBe(0);
  });

  it('the guard is among the frame’s guards', () => {
    expect(gardesDuCadre(path.resolve(__dirname, '../../../../../..'))).toContainEqual([
      path.resolve(__dirname, '../../../../scripts/langages/typescript/resumes.mjs'),
    ]);
  });
});
