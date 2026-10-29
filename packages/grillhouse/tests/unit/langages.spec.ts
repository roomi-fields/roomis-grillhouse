// grillhouse-3dr.2.1, criterion 2 — the core finds the language of a project, as Pants activates
// the backends its configuration names (`backend_packages`): `grillhouse.langages` of the
// project's package.json names it among the frame's closed list, and a project that declares none
// is read as `["typescript"]` until grillhouse-3dr.2.3 writes the declaration. A language the
// frame lacks is named in the refusal; one language is served (several: grillhouse-pkl.3).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LANGAGES, langageDe, langagesDeclares } from '../../scripts/langages.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'langages-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project whose package.json holds <grillhouse> (no key when undefined).
function projet(grillhouse?: object) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  mkdirSync(racine, { recursive: true });
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify({ name: 'p', private: true, ...(grillhouse ? { grillhouse } : {}) })
  );
  return racine;
}

describe('grillhouse-3dr.2.1 — les langages déclarés d’un projet', () => {
  it('the frame’s closed list holds typescript', () => {
    expect(Object.keys(LANGAGES)).toEqual(['typescript']);
  });

  it('a project that declares typescript is served by the module typescript', () => {
    const racine = projet({ langages: ['typescript'] });
    expect(langagesDeclares(racine)).toEqual(['typescript']);
    expect(langageDe(racine).nom).toBe('typescript');
  });

  it('a project without declaration is read as typescript', () => {
    const racine = projet();
    expect(langagesDeclares(racine)).toEqual(['typescript']);
    expect(langageDe(racine).nom).toBe('typescript');
  });

  it('a directory without package.json is read as typescript', () => {
    expect(langageDe(mkdtempSync(path.join(ESSAIS, 'vide-'))).nom).toBe('typescript');
  });

  it('a language the frame lacks is refused, named', () => {
    const racine = projet({ langages: ['cobol'] });
    expect(() => langageDe(racine)).toThrow(/cobol/);
    expect(() => langageDe(racine)).toThrow(/typescript/);
  });

  it('two languages are refused: one is served, the merge is grillhouse-pkl.3', () => {
    const racine = projet({ langages: ['typescript', 'typescript'] });
    expect(() => langageDe(racine)).toThrow(/pkl\.3/);
  });

  it('the module is loaded once per language', () => {
    expect(langageDe(projet())).toBe(langageDe(projet({ langages: ['typescript'] })));
  });
});
