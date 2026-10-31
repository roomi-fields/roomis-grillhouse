// grillhouse-3dr.2.1, criterion 2 — the core finds the languages of a project, as Pants activates
// the backends its configuration names (`backend_packages`), among the frame's closed list. A
// language the frame lacks is named in the refusal.
// grillhouse-ca7 — the declaration is the column « Langage » of the table of the components of
// docs/ARCHITECTURE.md, the only reading: a project that declares none is refused, named, with the
// column to write; nothing is guessed from the files (decision D2 of grillhouse-1zu: « pas besoin
// de reconnaissance technique »). The guard and the forms of the table:
// tests/unit/langages-des-paquets.spec.ts.
// grillhouse-pkl.3 — the list names cargo.
// grillhouse-akd — a project that declares two languages is served by both modules, composed
// (tests/unit/plusieurs-langages.spec.ts).
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { LANGAGES, langageDe, langagesDeclares } from '../../scripts/langages.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'langages-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// A project whose architecture declares <langages> (no document when undefined).
function projet(langages?: string[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
  if (langages) {
    ecrire(racine, 'docs/ARCHITECTURE.md', architecture(langages));
  }
  return racine;
}

describe('grillhouse-3dr.2.1 — les langages déclarés d’un projet', () => {
  it('the frame’s closed list holds typescript and cargo', () => {
    expect(Object.keys(LANGAGES)).toEqual(['typescript', 'cargo']);
  });

  it('a project whose architecture declares typescript is served by the module typescript', () => {
    const racine = projet(['typescript']);
    expect(langagesDeclares(racine)).toEqual(['typescript']);
    expect(langageDe(racine).nom).toBe('typescript');
  });

  it('a language the frame lacks is refused, named', () => {
    const racine = projet(['cobol']);
    expect(() => langageDe(racine)).toThrow(/cobol/);
    expect(() => langageDe(racine)).toThrow(/typescript/);
  });

  it('two languages are served together, their modules composed (grillhouse-akd)', () => {
    const racine = projet(['typescript', 'cargo']);
    expect(langageDe(racine).nom).toBe('typescript+cargo');
  });

  it('the module is loaded once per language', () => {
    expect(langageDe(projet(['typescript']))).toBe(langageDe(projet(['typescript'])));
  });
});

describe('grillhouse-ca7 — la déclaration seule, rien ne se devine', () => {
  it('a project without declaration is refused, the column and the document named', () => {
    const racine = projet();
    expect(langagesDeclares(racine)).toEqual([]);
    expect(() => langageDe(racine)).toThrow(/docs\/ARCHITECTURE\.md/);
    expect(() => langageDe(racine)).toThrow(/« Langage »/);
  });

  it('a key grillhouse.langages of the package.json is no declaration', () => {
    const racine = projet();
    ecrire(racine, 'package.json', JSON.stringify({ grillhouse: { langages: ['typescript'] } }));
    expect(langagesDeclares(racine)).toEqual([]);
  });

  it('what the files show is no declaration: a tsconfig.json, a Cargo.toml', () => {
    const racine = projet();
    ecrire(racine, 'tsconfig.json', '{}\n');
    ecrire(racine, 'Cargo.toml', '[workspace]\n');
    expect(() => langageDe(racine)).toThrow(/« Langage »/);
  });

  it('the core holds no default language, and recognises none', async () => {
    const m = await import('../../scripts/langages.mjs');
    expect(m).not.toHaveProperty('PAR_DEFAUT');
    expect(m).not.toHaveProperty('langagesTrouves');
  });

  it('grillhouse.langages is named by the migration that removes it alone: code, templates, texts', () => {
    const DEPOT = path.resolve(__dirname, '../../../..');
    const MIGRATION =
      'packages/grillhouse/scripts/migrations/0.27.0-langages-dans-l-architecture.mjs';
    const nommes = (rel: string): string[] => {
      const abs = path.join(DEPOT, rel);
      if (statSync(abs).isDirectory()) {
        return readdirSync(abs)
          .filter(n => n !== 'node_modules')
          .flatMap(n => nommes(`${rel}/${n}`));
      }
      return readFileSync(abs, 'utf8').includes('grillhouse.langages') ? [rel] : [];
    };
    const dossiers = ['packages/grillhouse/scripts', 'packages/grillhouse/docs', 'mods/grillhouse'];
    expect([...dossiers, 'templates'].flatMap(nommes).filter(f => f !== MIGRATION)).toEqual([]);
  });

  it('the template and the grill carry the column « Langage » (criterion 4)', () => {
    const DEPOT = path.resolve(__dirname, '../../../..');
    expect(langagesDeclares(path.join(DEPOT, 'templates/projet'))).toEqual(['typescript']);
    const grill = readFileSync(path.join(DEPOT, 'mods/grillhouse/skills/grill/SKILL.md'), 'utf8');
    const branche8 = grill.slice(grill.indexOf('8. **Les composants**'), grill.indexOf('9. **'));
    expect(branche8).toContain('colonne « Langage »');
  });

  it('no module of language recognises its code: each names its manifest', () => {
    for (const nom of Object.keys(LANGAGES)) {
      const m = langageDe(projet([nom])) as unknown as Record<string, unknown>;
      expect(m, nom).not.toHaveProperty('trouve');
      expect(m, nom).not.toHaveProperty('signe');
    }
    expect((langageDe(projet(['typescript'])) as { manifeste?: string }).manifeste).toBe(
      'package.json'
    );
    expect((langageDe(projet(['cargo'])) as { manifeste?: string }).manifeste).toBe('Cargo.toml');
  });
});
