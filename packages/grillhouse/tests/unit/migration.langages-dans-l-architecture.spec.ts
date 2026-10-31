// grillhouse-ca7, criterion 3 — `grillhouse.langages` of the package.json disappears: from 0.27.0
// the architecture is the one source of the languages (decision D8 of grillhouse-1zu). The
// migration writes the declaration in the column « Langage » of the table of the components of
// docs/ARCHITECTURE.md when it lacks, then removes the key, without compatibility. The tables are
// those of the projects of the frame as they stand: absent (Grillhouse), the phase before the
// package (BPScript), plain names and crates of other repositories (SyntHub).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { constats } from '../../scripts/langages-des-paquets.mjs';
import { langagesDeclares } from '../../scripts/langages.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import * as migration from '../../scripts/migrations/0.27.0-langages-dans-l-architecture.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-langages-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const pkg = (racine: string) =>
  JSON.parse(lire(racine, 'package.json')) as { grillhouse?: Record<string, unknown> };

// A project of TypeScript whose package.json declares <langages>, its packages <paquets> under
// packages/, its docs/ARCHITECTURE.md <architecture> (none when null).
function projet(langages: unknown, paquets: string[], architecture: string | null) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    racine,
    'package.json',
    `${JSON.stringify(
      { name: 'p', workspaces: ['packages/*'], grillhouse: { langages, version: '0.26.0' } },
      null,
      2
    )}\n`
  );
  for (const p of paquets) {
    ecrire(racine, `packages/${p}/package.json`, `{"name":"@p/${p}"}\n`);
  }
  if (architecture !== null) {
    ecrire(racine, 'docs/ARCHITECTURE.md', architecture);
  }
  return racine;
}

const BPSCRIPT = [
  '# Architecture',
  '',
  '| étape | paquet | ce qu’il fait | | | |',
  '| --- | --- | --- | --- | --- | --- |',
  '| analyse | `010-parser` | analyse le texte | [architecture](a) | [interface](i) | [cadre](c) |',
  '| | `030-binder` | lie chaque nom, que `040-checker` lit | [architecture](a) | [interface](i) | [cadre](c) |',
  '',
  'La suite.',
  '',
].join('\n');

const SYNTHHUB = [
  '# Architecture',
  '',
  '| Composant | Dépôt | Responsabilité | Appelle |',
  '|---|---|---|---|',
  '| `osd` | OSD | lire un pilote | rien |',
  '| service | SyntHub | un module par domaine | `osd`, `formats` |',
  '| site | SyntHub | pages | `synth-core` |',
  '',
  '| Donnée | Forme |',
  '|---|---|',
  '| pilote | JSON |',
  '',
].join('\n');

describe('grillhouse-ca7, critère 3 — la migration écrit la colonne « Langage », puis retire la clé', () => {
  it('is a migration of the core of 0.27.0', () => {
    expect(migration.version).toBe('0.27.0');
    expect(MIGRATIONS).toContain(migration);
  });

  it('no docs/ARCHITECTURE.md (Grillhouse): the document is written with the table, one row per package', () => {
    const racine = projet(['typescript'], ['a', 'b'], null);
    expect(migration.migrer(racine)).toEqual([expect.stringMatching(/docs\/ARCHITECTURE\.md/)]);
    expect(pkg(racine).grillhouse).toEqual({ version: '0.26.0' });
    expect(lire(racine, 'docs/ARCHITECTURE.md')).toMatch(
      /## Les paquets\n\n.*\n\n\| Paquet \| Langage \|\n\| --- \| --- \|\n\| `a` \| typescript \|\n\| `b` \| typescript \|\n/
    );
    expect(langagesDeclares(racine)).toEqual(['typescript']);
    expect(constats(racine)).toEqual([]);
  });

  it('a document without table of the components: the table is added at its end, its text kept', () => {
    const racine = projet(['typescript'], ['a'], '# Architecture\n\nLe projet.\n');
    migration.migrer(racine);
    const texte = lire(racine, 'docs/ARCHITECTURE.md');
    expect(texte.startsWith('# Architecture\n\nLe projet.\n')).toBe(true);
    expect(texte).toMatch(/\| `a` \| typescript \|/);
    expect(constats(racine)).toEqual([]);
  });

  it('BPScript’s table of the stages: the column added to each row, a package it does not name in a section « Les paquets »', () => {
    const racine = projet(['typescript'], ['010-parser', '030-binder', '000-forms'], BPSCRIPT);
    migration.migrer(racine);
    const lignes = lire(racine, 'docs/ARCHITECTURE.md').split('\n');
    expect(lignes[2]).toBe('| étape | paquet | ce qu’il fait | | | | Langage |');
    expect(lignes[3]).toBe('| --- | --- | --- | --- | --- | --- | --- |');
    expect(lignes[4]).toMatch(/^\| analyse \| `010-parser` \|.*\[cadre\]\(c\) \| typescript \|$/);
    expect(lignes[5]).toMatch(/^\| \| `030-binder` \|.*\| typescript \|$/);
    expect(lignes.slice(6)).toEqual([
      '',
      'La suite.',
      '',
      '## Les paquets',
      '',
      'Les paquets qu’aucun tableau ne nomme, et leur langage (colonne « Langage »).',
      '',
      '| Paquet | Langage |',
      '| --- | --- |',
      '| `000-forms` | typescript |',
      '',
    ]);
    expect(constats(racine)).toEqual([]);
  });

  it('SyntHub’s table: the rows of other repositories keep an empty cell, the second table untouched', () => {
    const racine = projet(['typescript'], ['service'], SYNTHHUB);
    migration.migrer(racine);
    const lignes = lire(racine, 'docs/ARCHITECTURE.md').split('\n');
    expect(lignes.slice(2, 7)).toEqual([
      '| Composant | Dépôt | Responsabilité | Appelle | Langage |',
      '|---|---|---|---|---|',
      '| `osd` | OSD | lire un pilote | rien | |',
      '| service | SyntHub | un module par domaine | `osd`, `formats` | typescript |',
      '| site | SyntHub | pages | `synth-core` | |',
    ]);
    expect(lignes.slice(8)).toEqual(['| Donnée | Forme |', '|---|---|', '| pilote | JSON |', '']);
    expect(langagesDeclares(racine)).toEqual(['typescript']);
    expect(constats(racine)).toEqual([]);
  });

  it('a project without package: one row naming the root per language of the key', () => {
    const racine = projet(['typescript'], [], null);
    migration.migrer(racine);
    expect(lire(racine, 'docs/ARCHITECTURE.md')).toMatch(/\| `\.` \| typescript \|/);
    expect(langagesDeclares(racine)).toEqual(['typescript']);
  });

  it('a column already written: the key alone is removed, the document untouched', () => {
    const texte = '# A\n\n| Composant | Langage |\n| --- | --- |\n| `a` | typescript |\n';
    const racine = projet(['typescript'], ['a'], texte);
    expect(migration.migrer(racine)).toEqual([expect.stringMatching(/grillhouse\.langages/)]);
    expect(lire(racine, 'docs/ARCHITECTURE.md')).toBe(texte);
    expect(pkg(racine).grillhouse).toEqual({ version: '0.26.0' });
  });

  it('a second pass changes no byte and returns no line', () => {
    const racine = projet(['typescript'], ['010-parser', '030-binder'], BPSCRIPT);
    migration.migrer(racine);
    const avant = [lire(racine, 'docs/ARCHITECTURE.md'), lire(racine, 'package.json')];
    expect(migration.migrer(racine)).toEqual([]);
    expect([lire(racine, 'docs/ARCHITECTURE.md'), lire(racine, 'package.json')]).toEqual(avant);
  });

  it('says whether a project holds a former declaration to report, which the session start names', () => {
    expect(migration.aReporter(projet(['typescript'], [], null))).toBe(true);
    expect(migration.aReporter(projet(undefined, [], null))).toBe(false);
  });

  it('a project without the key: nothing written, no line', () => {
    const racine = projet(undefined, ['a'], null);
    const avant = lire(racine, 'package.json');
    expect(migration.migrer(racine)).toEqual([]);
    expect(lire(racine, 'package.json')).toBe(avant);
  });

  it('a language of the key the frame lacks: left to the project, nothing written', () => {
    const racine = projet(['cobol'], ['a'], null);
    const avant = lire(racine, 'package.json');
    const aFaire: unknown = expect.stringMatching(/cobol/);
    expect(migration.migrer(racine)).toEqual([{ aFaire }]);
    expect(lire(racine, 'package.json')).toBe(avant);
  });
});
