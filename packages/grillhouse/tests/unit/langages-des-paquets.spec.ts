// grillhouse-ca7, criteria 1 and 2 — the language of each package is declared at the design, in
// the column « Langage » of the table of the components of docs/ARCHITECTURE.md, as the BUILD
// file of Bazel names the rule of each target; the core reads the languages of the project there,
// and a guard (`grillhouse langages-des-paquets`) refuses, each named with its package: a package
// the architecture does not declare; a package whose manifest does not follow the declared
// language (a package.json for typescript, a Cargo.toml for cargo); an INTERFACE.md whose
// language differs. The tables read are those of the projects of the frame as they stand:
// BPScript's (the phase before the package), SyntHub's (plain names, crates of other repositories
// without language).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gardesDuCadre } from '../../scripts/gardes-du-cadre.mjs';
import { constats, SCRIPT } from '../../scripts/langages-des-paquets.mjs';
import { langageDe, langagesDeclares } from '../../scripts/langages.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'langages-des-paquets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// A project of packages under packages/ (name → files), its docs/ARCHITECTURE.md <architecture>.
function projet(architecture: string | null, paquets: Record<string, Record<string, string>>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', workspaces: ['packages/*'] }));
  if (architecture !== null) {
    ecrire(racine, 'docs/ARCHITECTURE.md', architecture);
  }
  for (const [nom, fichiers] of Object.entries(paquets)) {
    mkdirSync(path.join(racine, 'packages', nom), { recursive: true });
    for (const [f, t] of Object.entries(fichiers)) {
      ecrire(racine, `packages/${nom}/${f}`, t);
    }
  }
  return racine;
}
const pj = (nom: string) => ({ 'package.json': JSON.stringify({ name: `@p/${nom}` }) });
const table = (lignes: string[]) =>
  `# Architecture\n\nLe projet.\n\n| Composant | Rôle | Langage |\n| --- | --- | --- |\n${lignes.join('\n')}\n`;
const messages = (racine: string) => constats(racine).map(c => c.message);

describe('grillhouse-ca7, critère 1 — les langages se lisent dans la colonne « Langage »', () => {
  it('the languages of the project are the set of the column, each once, in the order of the table', () => {
    const racine = projet(
      table([
        '| `a` | le a | typescript |',
        '| `b` | le b | `cargo` |',
        '| `c` | le c | typescript |',
      ]),
      {}
    );
    expect(langagesDeclares(racine)).toEqual(['typescript', 'cargo']);
    expect(langageDe(racine).nom).toBe('typescript+cargo');
  });

  it('a row without language names no package: its language is none', () => {
    const racine = projet(
      table(['| `osd` | un autre dépôt | |', '| `a` | le a | typescript |']),
      {}
    );
    expect(langagesDeclares(racine)).toEqual(['typescript']);
  });

  it('the first table whose header holds « Langage » is the table of the components', () => {
    const racine = projet(
      `# A\n\n| Donnée | Forme |\n| --- | --- |\n| pilote | JSON |\n\n${table(['| `a` | x | cargo |'])}`,
      {}
    );
    expect(langagesDeclares(racine)).toEqual(['cargo']);
  });

  it('no document, no table or no column: no language, and the core refuses, the column named', () => {
    const sans = projet(null, {});
    const sansColonne = projet('# A\n\n| Composant | Rôle |\n| --- | --- |\n| `a` | x |\n', {});
    for (const racine of [sans, sansColonne]) {
      expect(langagesDeclares(racine)).toEqual([]);
      expect(() => langageDe(racine)).toThrow(/docs\/ARCHITECTURE\.md.*« Langage »/);
    }
  });

  it('a document written in English names the column « Language »: it reads the same', () => {
    const racine = projet(
      '# Architecture\n\n| Crate | Responsibility | Language |\n| --- | --- | --- |\n| `a` | the a | cargo |\n',
      {}
    );
    expect(langagesDeclares(racine)).toEqual(['cargo']);
  });

  it('a language the frame lacks is refused, named with the frame’s list', () => {
    const racine = projet(table(['| `a` | x | cobol |']), {});
    expect(() => langageDe(racine)).toThrow(/cobol/);
    expect(() => langageDe(racine)).toThrow(/typescript, cargo/);
  });
});

describe('grillhouse-ca7, critère 2 — la garde des langages des paquets', () => {
  it('every package declared with the language of its manifest: no finding', () => {
    const racine = projet(table(['| `a` | x | typescript |', '| `@p/b` | y | typescript |']), {
      a: pj('a'),
      b: pj('b'),
    });
    expect(constats(racine)).toEqual([]);
  });

  it('a package the architecture does not declare is refused, named', () => {
    const racine = projet(table(['| `a` | x | typescript |']), { a: pj('a'), b: pj('b') });
    expect(messages(racine)).toEqual([expect.stringMatching(/^packages\/b : .*ne déclare pas/)]);
    expect(constats(racine)[0].fichier).toBe('docs/ARCHITECTURE.md');
  });

  it('a folder under packages/ without manifest nor row is no package: no finding', () => {
    const racine = projet(table(['| `a` | x | typescript |']), { a: pj('a'), donnees: {} });
    expect(constats(racine)).toEqual([]);
  });

  it('a package declared typescript without its package.json is refused, named with its manifest', () => {
    const racine = projet(table(['| `a` | x | typescript |']), {
      a: { 'Cargo.toml': '[package]\nname = "a"\n' },
    });
    expect(messages(racine)).toEqual([
      expect.stringMatching(/^packages\/a : déclaré typescript .*package\.json/),
    ]);
  });

  it('a package of typescript declared cargo is refused, both languages named', () => {
    const racine = projet(table(['| `a` | x | cargo |', '| `b` | y | typescript |']), {
      a: pj('a'),
      b: pj('b'),
    });
    expect(messages(racine)).toEqual([
      expect.stringMatching(/^packages\/a : déclaré cargo .*typescript \(package\.json\)/),
    ]);
    expect(constats(racine)[0].ligne).toBe(7);
  });

  it('an INTERFACE.md whose language differs is refused, named; the same language passes', () => {
    const racine = projet(table(['| `a` | x | typescript |', '| `b` | y | typescript |']), {
      a: { ...pj('a'), 'docs/INTERFACE.md': '# a\n\n**Langage** : cargo\n' },
      b: { ...pj('b'), 'docs/INTERFACE.md': '# b\n\n**Langage** : typescript\n' },
    });
    expect(messages(racine)).toEqual([
      expect.stringMatching(/^packages\/a\/docs\/INTERFACE\.md : langage cargo.*typescript/),
    ]);
    expect(constats(racine)[0].fichier).toBe('packages/a/docs/INTERFACE.md');
  });

  it('the root’s INTERFACE.md follows the row that names the root', () => {
    const racine = projet(table(['| `.` | le projet | typescript |']), {});
    ecrire(racine, 'docs/INTERFACE.md', '# p\n\n**Langage** : `cargo`\n');
    expect(messages(racine)).toEqual([
      expect.stringMatching(/^docs\/INTERFACE\.md : langage cargo.*typescript/),
    ]);
  });

  it('BPScript’s table: the phase first, the package second, the documents after', () => {
    const racine = projet(
      [
        '# Architecture',
        '',
        '| étape | paquet | ce qu’il fait | | | | Langage |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| analyse | `a` | lit `b` | [architecture](x) | [interface](y) | [cadre](z) | typescript |',
        '| | `b` | rien | | | | typescript |',
        '',
      ].join('\n'),
      { a: pj('a'), b: pj('b') }
    );
    expect(constats(racine)).toEqual([]);
  });

  it('SyntHub’s table: plain names, the crates of other repositories without language', () => {
    const racine = projet(
      [
        '| Composant | Dépôt | Appelle | Langage |',
        '|---|---|---|---|',
        '| `osd` | OSD | rien | |',
        '| service | SyntHub | `osd`, `a` | typescript |',
        '',
      ].join('\n'),
      { service: pj('service') }
    );
    expect(constats(racine)).toEqual([]);
  });

  it('the command: exit 1, each finding on the error stream after ⛔, its SARIF under its name', () => {
    const racine = projet(table(['| `a` | x | typescript |']), { a: pj('a'), b: pj('b') });
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    const r = spawnSync(process.execPath, [SCRIPT], {
      cwd: racine,
      encoding: 'utf8',
      env: { ...process.env, GRILLHOUSE_RESULTATS: resultats },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔ packages\/b : /);
    const sarif = readdirSync(path.join(resultats, 'sarif'));
    expect(sarif).toEqual([expect.stringMatching(/^langages-des-paquets-/)]);
    expect(readFileSync(path.join(resultats, 'sarif', sarif[0]), 'utf8')).toMatch(/packages\/b/);
  });

  it('the command passes, exit 0, on a project whose packages follow the architecture', () => {
    const racine = projet(table(['| `a` | x | typescript |']), { a: pj('a') });
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: racine, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('the guard is the first of the frame’s guards, whatever the languages', () => {
    const racine = projet(table(['| `a` | x | typescript |']), { a: pj('a') });
    expect(gardesDuCadre(racine)[0]).toEqual([SCRIPT]);
  });
});

// The review of the lot (2026-10-31): the guard looked for the packages with the modules of the
// declared languages alone, so a package of a language the table does not name passed. It looks
// for them with the module of every language of the frame, reading each manifest to refuse a gap,
// guessing nothing (D2): the declaration stays the table.
describe('grillhouse-ca7, critère 2 — la garde voit les paquets de chaque langage du cadre', () => {
  let restaurer = () => {};
  beforeAll(() => {
    restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  });
  afterAll(() => restaurer());

  it('a crate no row names, in a project whose table declares typescript alone, is refused', () => {
    const racine = projet(table(['| `a` | x | typescript |']), { a: pj('a') });
    ecrire(racine, 'Cargo.toml', '[workspace]\nmembers = ["crates/x"]\n');
    ecrire(racine, 'crates/x/Cargo.toml', '[package]\nname = "x"\nversion = "0.1.0"\n');
    ecrire(racine, 'crates/x/src/lib.rs', '');
    expect(messages(racine)).toEqual([
      expect.stringMatching(/^crates\/x : paquet cargo \(son Cargo\.toml\) .*ne déclare pas/),
    ]);
  });

  it('a crate at the root declared typescript is refused, its manifest named', () => {
    const racine = projet(table(['| `osc-bridge` (root) | l’application | typescript |']), {});
    ecrire(
      racine,
      'Cargo.toml',
      '[workspace]\nmembers = ["."]\n\n[package]\nname = "osc-bridge"\nversion = "0.1.0"\n'
    );
    ecrire(racine, 'src/main.rs', 'fn main() {}\n');
    expect(messages(racine)).toEqual([
      expect.stringMatching(/^\. : déclaré typescript .*cargo \(Cargo\.toml\)/),
    ]);
  });

  it('a package of npm whose one row says cargo is refused, the table declaring cargo alone', () => {
    const racine = projet(table(['| `a` | x | cargo |']), { a: pj('a') });
    expect(messages(racine)).toEqual([
      expect.stringMatching(/^packages\/a : déclaré cargo .*typescript \(package\.json\)/),
    ]);
  });

  it('every table that holds the column counts: a table « Les paquets » beside the stages', () => {
    const racine = projet(
      `${table(['| `a` | x | typescript |'])}\n## Les paquets\n\n| Paquet | Langage |\n| --- | --- |\n| \`b\` | cargo |\n`,
      { a: pj('a'), b: pj('b') }
    );
    expect(langagesDeclares(racine)).toEqual(['typescript', 'cargo']);
    expect(messages(racine)).toEqual([
      expect.stringMatching(/^packages\/b : déclaré cargo .*typescript \(package\.json\)/),
    ]);
  });
});
