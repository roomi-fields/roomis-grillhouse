import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrer, nom, version } from '../../scripts/migrations/0.23.0-charte-importee.mjs';

// grillhouse-3uv.84.8 critère 1: the charter of a project imports the common charter from the
// package installed (`@node_modules/@roomi-fields/grillhouse/charte.md`), as Claude Code loads a
// CLAUDE.md and its imports whole. A migration brings it to a CLAUDE.md that lacks it: the import of
// the former copy (`@.claude/grillhouse/charte.md`) and the sentence of 0.23.0's template (the
// charter « que le greffon du cadre … donne à chaque séance ») become it; a CLAUDE.md that names
// neither receives it at its end. A CLAUDE.md that imports the charter from elsewhere (Grillhouse,
// from its source) is left. Replayable without effect.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-charte-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const IMPORT = '@node_modules/@roomi-fields/grillhouse/charte.md';
const LIGNE = `Les règles du cadre : ${IMPORT}`;
const projet = (claude?: string) => {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (claude !== undefined) {
    writeFileSync(path.join(p, 'CLAUDE.md'), claude);
  }
  return p;
};
const lire = (p: string) => readFileSync(path.join(p, 'CLAUDE.md'), 'utf8');

const TETE = '# BPScript\n\nUn langage de live coding.\n\n**Responsable** : Romain.\n\n';
const SUITE = '\n## Ce qui décide\n\nLe métacadre, puis la spécification.\n';

describe('migration 0.23.0 — the charter of the project imports the common charter', () => {
  it('is the migration of 0.23.0, « charte importée »', () => {
    expect(version).toBe('0.23.0');
    expect(nom).toBe('charte importée');
  });

  it('the import of the former copy becomes the import of the package installed', () => {
    const p = projet(`${TETE}Les règles du cadre : @.claude/grillhouse/charte.md\n${SUITE}`);
    const lignes = migrer(p);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(/^CLAUDE\.md : /);
    expect(lire(p)).toBe(`${TETE}${LIGNE}\n${SUITE}`);
  });

  it('the sentence of the template that gave the charter by the plugin becomes the import', () => {
    const p = projet(
      `${TETE}Les règles du cadre : la charte commune, que le greffon du cadre (\`grillhouse@roomi-fields\`,\nque porte le paquet \`@roomi-fields/grillhouse\`) donne à chaque séance.\n${SUITE}`
    );
    expect(migrer(p)).toHaveLength(1);
    expect(lire(p)).toBe(`${TETE}${LIGNE}\n${SUITE}`);
  });

  it('a CLAUDE.md that names the charter nowhere receives the import at its end', () => {
    const p = projet(`${TETE}${SUITE}`);
    expect(migrer(p)).toHaveLength(1);
    expect(lire(p)).toBe(`${TETE}${SUITE}\n${LIGNE}\n`);
  });

  it('a second pass changes no byte and reports nothing', () => {
    for (const texte of [
      `${TETE}Les règles du cadre : @.claude/grillhouse/charte.md\n${SUITE}`,
      `${TETE}${SUITE}`,
    ]) {
      const p = projet(texte);
      migrer(p);
      const premier = lire(p);
      expect(migrer(p)).toEqual([]);
      expect(lire(p)).toBe(premier);
    }
  });

  it('a CLAUDE.md that imports the charter from its source, as Grillhouse’s, is left as it is', () => {
    const texte = `${TETE}Les règles du cadre : @mods/grillhouse/charte.md\n${SUITE}`;
    const p = projet(texte);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(texte);
  });

  it('a project without CLAUDE.md is left as it is', () => {
    const p = projet();
    expect(migrer(p)).toEqual([]);
    expect(existsSync(path.join(p, 'CLAUDE.md'))).toBe(false);
  });
});
