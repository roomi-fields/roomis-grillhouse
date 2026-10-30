// grillhouse-3dr.2.1, criterion 2 — the core finds the language of a project, as Pants activates
// the backends its configuration names (`backend_packages`): `grillhouse.langages` of the
// project's package.json names it among the frame's closed list. A language the frame lacks is
// named in the refusal; one language is served.
// grillhouse-3dr.2.3 — the declaration is the only reading: a project that declares none, or a
// directory without package.json, is refused, named, with the command that writes it (`grillhouse
// maj`). What the update writes is found in the repository, as each plugin of Nx infers its
// projects from its own files (`createNodes`): typescript, a tsconfig.json at the root or in a
// package of the frame.
// grillhouse-pkl.3 — the list names cargo, found by a Cargo.toml at the root; a project that
// declares two languages is refused, both named, as the frame serves one (Q5 of the ticket).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LANGAGES, langageDe, langagesDeclares, langagesTrouves } from '../../scripts/langages.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'langages-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// A project whose package.json holds <grillhouse> (no key when undefined), and <champs>.
function projet(grillhouse?: object, champs: object = {}) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    racine,
    'package.json',
    JSON.stringify({ name: 'p', private: true, ...champs, ...(grillhouse ? { grillhouse } : {}) })
  );
  return racine;
}

describe('grillhouse-3dr.2.1 — les langages déclarés d’un projet', () => {
  it('the frame’s closed list holds typescript and cargo', () => {
    expect(Object.keys(LANGAGES)).toEqual(['typescript', 'cargo']);
  });

  it('a project that declares typescript is served by the module typescript', () => {
    const racine = projet({ langages: ['typescript'] });
    expect(langagesDeclares(racine)).toEqual(['typescript']);
    expect(langageDe(racine).nom).toBe('typescript');
  });

  it('a language the frame lacks is refused, named', () => {
    const racine = projet({ langages: ['cobol'] });
    expect(() => langageDe(racine)).toThrow(/cobol/);
    expect(() => langageDe(racine)).toThrow(/typescript/);
  });

  it('two languages are refused, both named, no ticket cited', () => {
    const racine = projet({ langages: ['typescript', 'cargo'] });
    expect(() => langageDe(racine)).toThrow(/typescript, cargo/);
    expect(() => langageDe(racine)).toThrow(/un seul langage/);
    expect(() => langageDe(racine)).not.toThrow(/grillhouse-\w+\.\d/);
  });

  it('the module is loaded once per language', () => {
    expect(langageDe(projet({ langages: ['typescript'] }))).toBe(
      langageDe(projet({ langages: ['typescript'] }))
    );
  });
});

describe('grillhouse-3dr.2.3 — la déclaration seule, plus de repli', () => {
  it('a project without declaration is refused, the declaration and grillhouse maj named', () => {
    const racine = projet();
    expect(langagesDeclares(racine)).toEqual([]);
    expect(() => langageDe(racine)).toThrow(/grillhouse\.langages/);
    expect(() => langageDe(racine)).toThrow(/grillhouse maj/);
  });

  it('an empty declaration is none', () => {
    expect(() => langageDe(projet({ langages: [] }))).toThrow(/grillhouse maj/);
  });

  it('a directory without package.json is refused, named', () => {
    const vide = mkdtempSync(path.join(ESSAIS, 'vide-'));
    expect(langagesDeclares(vide)).toEqual([]);
    expect(() => langageDe(vide)).toThrow(/grillhouse\.langages/);
  });

  it('the core holds no default language', async () => {
    expect(await import('../../scripts/langages.mjs')).not.toHaveProperty('PAR_DEFAUT');
  });
});

describe('grillhouse-3dr.2.3 — les langages trouvés dans un dépôt', () => {
  it('a tsconfig.json at the root: typescript', () => {
    const racine = projet();
    ecrire(racine, 'tsconfig.json', '{}\n');
    expect(langagesTrouves(racine)).toEqual(['typescript']);
  });

  it('a tsconfig.json in a package of the workspaces, none at the root: typescript (BPScript)', () => {
    const racine = projet(undefined, { workspaces: ['packages/*'] });
    ecrire(racine, 'packages/a/package.json', JSON.stringify({ name: 'a' }));
    ecrire(racine, 'packages/a/tsconfig.json', '{}\n');
    expect(langagesTrouves(racine)).toEqual(['typescript']);
  });

  it('a tsconfig.json in a package out of the frame only: none', () => {
    const racine = projet(undefined, { workspaces: ['packages/*'] });
    ecrire(racine, 'packages/a/package.json', JSON.stringify({ name: 'a' }));
    ecrire(racine, 'packages/a/tsconfig.json', '{}\n');
    ecrire(racine, 'docs/agents/hors-cadre.txt', 'a vendored\n');
    expect(langagesTrouves(racine)).toEqual([]);
  });

  it('no tsconfig.json, a Cargo.toml at the root: cargo', () => {
    const racine = projet();
    ecrire(racine, 'Cargo.toml', '[workspace]\n');
    ecrire(racine, 'src/index.ts', 'export {};\n');
    expect(langagesTrouves(racine)).toEqual(['cargo']);
  });

  it('a tsconfig.json and a Cargo.toml: both found, which the core then refuses together', () => {
    const racine = projet();
    ecrire(racine, 'tsconfig.json', '{}\n');
    ecrire(racine, 'Cargo.toml', '[workspace]\n');
    expect(langagesTrouves(racine)).toEqual(['typescript', 'cargo']);
  });

  it('what is found is not a declaration: the core still refuses the project', () => {
    const racine = projet();
    ecrire(racine, 'tsconfig.json', '{}\n');
    expect(() => langageDe(racine)).toThrow(/grillhouse maj/);
  });
});
