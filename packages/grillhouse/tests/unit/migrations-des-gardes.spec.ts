// The guard of the migrations of the guards (scripts/migrations-des-gardes.mjs): a guard with a
// debt (a script that calls `trancher(` of scripts/dette.mjs) arrives with the migration that
// inscribes the existing debt of the projects, as the codemods of `nx migrate` or the baselines of
// ESLint and Betterer; the guard refuses one that no played migration covers. It reads the texts
// and loads no module.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { gardesDuCadre } from '../../scripts/gardes-du-cadre.mjs';

// The guard is loaded when a test calls it, so that its absence reds each test, not the file.
const SCRIPT = path.resolve(__dirname, '../../scripts/migrations-des-gardes.mjs');
type Constat = { fichier: string; regle: string; message: string };
type Garde = {
  verifier: (racine: string, scripts?: string) => Constat[];
  rapport: (
    racine: string,
    env?: Record<string, string>,
    scripts?: string
  ) => { lignes: string[]; code: number };
};
const garde_ = () => createRequire(__filename)(SCRIPT) as Garde;
const verifier = (racine: string, scripts?: string) => garde_().verifier(racine, scripts);
const rapport = (racine: string, env?: Record<string, string>, scripts?: string) =>
  garde_().rapport(racine, env, scripts);
const GARDE = 'migrations-des-gardes';
const REGLE = 'garde-sans-migration';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migrations-des-gardes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository of trial: its frame's scripts under `cadre/scripts`, each file of <fichiers> written
// from `cadre/scripts` (its directories made). Returns the root and the scripts directory.
function depot(fichiers: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const scripts = path.join(racine, 'cadre', 'scripts');
  mkdirSync(scripts, { recursive: true });
  for (const [nom, texte] of Object.entries(fichiers)) {
    const f = path.join(scripts, nom);
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, texte);
  }
  return { racine, scripts };
}

const garde = (nom: string) =>
  `import { trancher } from '../../dette.mjs';\nexport const GARDE = '${nom}';\nexport const x = trancher(process.cwd(), GARDE, []);\n`;
const gardeLitterale = (nom: string) =>
  `import { trancher } from './dette.mjs';\ntrancher(process.cwd(), '${nom}', []);\n`;
const migration = (chemin: string, nom: string) =>
  `import { trancher } from '${chemin.startsWith('.') ? '../../../dette.mjs' : chemin}';\nimport { verifier } from '${chemin}';\ntrancher(process.cwd(), '${nom}', verifier(process.cwd()), 'inscrire');\n`;

const fichiers = (r: { racine: string; scripts: string }) =>
  verifier(r.racine, r.scripts).map((c: { fichier: string }) => c.fichier);

describe('a guard with a debt without migration is refused', () => {
  it('a core guard whose name is the literal second argument, no migration: one finding naming its script', () => {
    const r = depot({ 'ma-garde.mjs': gardeLitterale('ma-garde') });
    const constats = verifier(r.racine, r.scripts);
    expect(constats).toHaveLength(1);
    expect(constats[0].fichier).toBe('cadre/scripts/ma-garde.mjs');
    expect(constats[0].regle).toBe(REGLE);
    expect(constats[0].message).toContain('cadre/scripts/ma-garde.mjs');
  });
  it('a language guard whose name is the constant GARDE: refused too', () => {
    const r = depot({ 'langages/typescript/une.mjs': garde('une') });
    expect(fichiers(r)).toEqual(['cadre/scripts/langages/typescript/une.mjs']);
  });
  it('the finding tells to write the migration on the model of the one of the heavy tools', () => {
    const r = depot({ 'ma-garde.mjs': gardeLitterale('ma-garde') });
    const { message } = verifier(r.racine, r.scripts)[0];
    expect(message).toContain('0.30.0-tailles-des-outils-lourds.mjs');
    expect(message).toContain("trancher(projet, GARDE, constats, 'inscrire')");
  });
  it('each guard without migration gives its own finding', () => {
    const r = depot({
      'a.mjs': gardeLitterale('a'),
      'langages/cargo/b.mjs': garde('b'),
      'langages/python/c.mjs': gardeLitterale('c'),
    });
    expect(fichiers(r).sort()).toEqual([
      'cadre/scripts/a.mjs',
      'cadre/scripts/langages/cargo/b.mjs',
      'cadre/scripts/langages/python/c.mjs',
    ]);
  });
  it('a migration that is not imported by any index is not played: the guard stays refused', () => {
    const r = depot({
      'a.mjs': gardeLitterale('a'),
      'migrations/0.1.0-a.mjs': migration('../a.mjs', 'a'),
      'migrations.mjs': '// plays nothing\n',
    });
    expect(fichiers(r)).toEqual(['cadre/scripts/a.mjs']);
  });
  it('a migration that inscribes another name does not cover the guard', () => {
    const r = depot({
      'a.mjs': gardeLitterale('a'),
      'migrations/0.1.0-a.mjs': migration('../a.mjs', 'autre'),
      'migrations.mjs': "import * as m from './migrations/0.1.0-a.mjs';\n",
    });
    expect(fichiers(r)).toEqual(['cadre/scripts/a.mjs']);
  });
  it('a migration that imports another script of the guard does not cover it', () => {
    const r = depot({
      'a.mjs': gardeLitterale('a'),
      'b.mjs': 'export const verifier = () => [];\n',
      'migrations/0.1.0-a.mjs': migration('../b.mjs', 'a'),
      'migrations.mjs': "import * as m from './migrations/0.1.0-a.mjs';\n",
    });
    expect(fichiers(r)).toEqual(['cadre/scripts/a.mjs']);
  });
});

describe('a guard that a played migration covers passes', () => {
  it('a core migration imported by scripts/migrations.mjs covers a core guard', () => {
    const r = depot({
      'a.mjs': gardeLitterale('a'),
      'migrations/0.1.0-a.mjs': migration('../a.mjs', 'a'),
      'migrations.mjs': "import * as m from './migrations/0.1.0-a.mjs';\n",
    });
    expect(fichiers(r)).toEqual([]);
  });
  it('a migration of a language imported by the index of the language covers a guard of the language', () => {
    const r = depot({
      'langages/cargo/b.mjs': garde('b'),
      'langages/cargo/migrations/0.2.0-b.mjs': migration('../b.mjs', 'b'),
      'langages/cargo/index.mjs': "import * as m from './migrations/0.2.0-b.mjs';\n",
    });
    expect(fichiers(r)).toEqual([]);
  });
  it('a migration of a language covers a guard written with a constant name, and one with a literal name', () => {
    const r = depot({
      'langages/python/c.mjs': gardeLitterale('c'),
      'langages/python/d.mjs': garde('d'),
      'langages/python/migrations/0.2.0-c.mjs': migration('../c.mjs', 'c'),
      'langages/python/migrations/0.2.0-d.mjs': migration('../d.mjs', 'd'),
      'langages/python/index.mjs':
        "import * as c from './migrations/0.2.0-c.mjs';\nimport * as d from './migrations/0.2.0-d.mjs';\n",
    });
    expect(fichiers(r)).toEqual([]);
  });
  it('a guard with no call to trancher is not a guard with a debt', () => {
    const r = depot({
      'simple.mjs': 'export const verifier = () => [];\n// trancher is not called here\n',
    });
    expect(fichiers(r)).toEqual([]);
  });
  it('the definition of trancher and the migrations themselves are not guards', () => {
    const r = depot({
      'dette.mjs': 'export function trancher(racine, garde, constats) { return garde; }\n',
      'migrations/0.1.0-x.mjs': "trancher(projet, 'x', [], 'inscrire');\n",
      'migrations.mjs': '\n',
    });
    expect(fichiers(r)).toEqual([]);
  });
});

describe('the guard of the frame', () => {
  it('its script is one of grillhouse:gardes', () => {
    expect(gardesDuCadre(DEPOT).map((g: string[]) => g[0])).toContain(SCRIPT);
  });
  it('refuses a guard without migration with its name, and passes when the debt holds it', () => {
    const r = depot({ 'ma-garde.mjs': gardeLitterale('ma-garde') });
    const refus = rapport(r.racine, {}, r.scripts);
    expect(refus.code).toBe(1);
    expect(refus.lignes.join('\n')).toContain('cadre/scripts/ma-garde.mjs');
    writeFileSync(
      path.join(r.racine, 'grillhouse-dette.json'),
      JSON.stringify({
        [GARDE]: { 'cadre/scripts/ma-garde.mjs': { [REGLE]: { count: 1 } } },
      })
    );
    expect(rapport(r.racine, {}, r.scripts).code).toBe(0);
  });
  it('inscribes the guards without migration as debt, one entry each at count 1, and refuses a new one', () => {
    const r = depot({ 'a.mjs': gardeLitterale('a') });
    expect(rapport(r.racine, { GRILLHOUSE_DETTE: 'inscrire' }, r.scripts).code).toBe(0);
    const dette = JSON.parse(
      readFileSync(path.join(r.racine, 'grillhouse-dette.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(dette[GARDE]).toEqual({ 'cadre/scripts/a.mjs': { [REGLE]: { count: 1 } } });
    writeFileSync(path.join(r.scripts, 'b.mjs'), gardeLitterale('b'));
    const neuf = rapport(r.racine, {}, r.scripts);
    expect(neuf.code).toBe(1);
    expect(neuf.lignes.join('\n')).toContain('cadre/scripts/b.mjs');
  });
  it('a project whose frame scripts are installed under node_modules passes with no debt', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    const scripts = path.join(racine, 'node_modules', '@roomi-fields', 'grillhouse', 'scripts');
    mkdirSync(path.join(scripts, 'langages', 'typescript'), { recursive: true });
    writeFileSync(path.join(scripts, 'a.mjs'), gardeLitterale('a'));
    writeFileSync(path.join(scripts, 'langages', 'typescript', 'b.mjs'), garde('b'));
    expect(rapport(racine, {}, scripts).code).toBe(0);
  });
  it('a project whose frame scripts live outside its root passes with no debt', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    const hors = mkdtempSync(path.join(ESSAIS, 'cadre-'));
    writeFileSync(path.join(hors, 'a.mjs'), gardeLitterale('a'));
    expect(rapport(racine, {}, hors).code).toBe(0);
  });
  it('a repository whose frame scripts are another tree’s keeps its debt as written when pruned', () => {
    const r = depot({ 'a.mjs': gardeLitterale('a') });
    rapport(r.racine, { GRILLHOUSE_DETTE: 'inscrire' }, r.scripts);
    const fichier = path.join(r.racine, 'grillhouse-dette.json');
    const avant = readFileSync(fichier, 'utf8');
    const ailleurs = mkdtempSync(path.join(ESSAIS, 'copie-'));
    writeFileSync(path.join(ailleurs, 'grillhouse-dette.json'), avant);
    expect(rapport(ailleurs, { GRILLHOUSE_DETTE: 'elaguer' }, r.scripts).code).toBe(0);
    expect(readFileSync(path.join(ailleurs, 'grillhouse-dette.json'), 'utf8')).toBe(avant);
  });
  it('prunes the entry of a guard that receives its migration', () => {
    const r = depot({ 'a.mjs': gardeLitterale('a') });
    rapport(r.racine, { GRILLHOUSE_DETTE: 'inscrire' }, r.scripts);
    mkdirSync(path.join(r.scripts, 'migrations'));
    writeFileSync(path.join(r.scripts, 'migrations', '0.1.0-a.mjs'), migration('../a.mjs', 'a'));
    writeFileSync(
      path.join(r.scripts, 'migrations.mjs'),
      "import * as m from './migrations/0.1.0-a.mjs';\n"
    );
    expect(rapport(r.racine, { GRILLHOUSE_DETTE: 'elaguer' }, r.scripts).code).toBe(0);
    const dette = JSON.parse(
      readFileSync(path.join(r.racine, 'grillhouse-dette.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(dette[GARDE] ?? {}).toEqual({});
  });
});

describe('the frame’s own scripts', () => {
  it('the migrations of the titles, of the sizes of the tests and of the heavy tools cover their guards', () => {
    const f = verifier(DEPOT).map((c: { fichier: string }) => c.fichier);
    expect(f).not.toContain('packages/grillhouse/scripts/langages/typescript/titres-de-tests.mjs');
    expect(f).not.toContain(
      'packages/grillhouse/scripts/langages/typescript/tailles-des-tests.mjs'
    );
    for (const c of verifier(DEPOT)) {
      expect(c.regle).toBe(REGLE);
      expect(c.fichier).toMatch(/^packages\/grillhouse\/scripts\/.+\.mjs$/);
    }
  });
});
