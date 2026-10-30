// grillhouse-pkl.7 — the update and the template of a project of Rust: `grillhouse maj` declares
// cargo for a Cargo.toml at the root, writes no tool of npm of another language,
// installs the binaries of the declared language that the machine lacks (`binaires`, by
// `cargo binstall`, as `cargo install --list` reads what is installed), and ignores what the
// language's tools write (`ignorer`: cargo's `target/`, typescript's `.turbo`), in the source files
// the migrations read and in the `.gitignore` it writes. The template of a project of cargo
// (`templates/cargo/`) gives its deny.toml, its nextest configuration, its toolchain and its
// package.json, which the update copies where the project has none. The calls of cargo go to the
// fake cargo (./langages/cargo/faux-cargo.ts), whose journal lists them: no network.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installerBinaires, mettreAJour } from '../../scripts/grillhouse-maj.mjs';
import { langagesTrouves } from '../../scripts/langages.mjs';
import cargo from '../../scripts/langages/cargo/index.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';
import { sources as lesSources } from '../../scripts/sources.mjs';
import type { Langage } from '../../scripts/jointure.js';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-maj-cargo-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const GABARIT = path.join(DEPOT, 'templates/cargo');
const JOURNAL = path.join(ESSAIS, 'journal');
const CARGO = cargo as unknown as Langage;
const BINAIRES = (cargo as unknown as { binaires: Record<string, string> }).binaires;
const OUTILS_TS = (typescript as unknown as { outils: string[] }).outils;
const sources = lesSources as (racine: string) => string[];

let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
});
afterAll(() => restaurer());
beforeEach(() => {
  writeFileSync(JOURNAL, '');
  delete process.env.FAUX_CARGO_INSTALLES;
  delete process.env.FAUX_CARGO_CODES;
});
const appels = () => readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean);
const installations = () => appels().filter(a => a.startsWith('binstall '));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
type Pkg = {
  grillhouse?: { langages?: string[] };
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const pkgDe = (racine: string) => JSON.parse(lire(racine, 'package.json')) as Pkg;

// A project of <fichiers> (path → content; an object is written as JSON).
function projet(fichiers: Record<string, string | object>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries(fichiers)) {
    ecrire(racine, f, typeof t === 'string' ? t : `${JSON.stringify(t, null, 2)}\n`);
  }
  return racine;
}
const rust = (autres: Record<string, string | object> = {}) =>
  projet({
    'package.json': { name: 'p' },
    'Cargo.toml': '[package]\nname = "p"\nversion = "0.1.0"\n',
    'src/lib.rs': '',
    ...autres,
  });
const ts = (autres: Record<string, string | object> = {}) =>
  projet({ 'package.json': { name: 'p' }, 'tsconfig.json': '{}\n', ...autres });

// The tables of the TOML text <texte>, each its keys and their values as written: the subset the
// templates write (tables, strings, booleans, arrays of strings over several lines).
function toml(texte: string): Record<string, Record<string, unknown>> {
  const tables: Record<string, Record<string, unknown>> = { '': {} };
  let table = '';
  let cle: string | null = null;
  let tampon = '';
  for (const brute of texte.split('\n')) {
    const l = brute.replace(/(^|\s)#.*$/, '').trim();
    if (cle !== null) {
      tampon += ` ${l}`;
      if (l.endsWith(']')) {
        tables[table][cle] = JSON.parse(tampon.replace(/,\s*\]$/, ']')) as unknown;
        cle = null;
      }
      continue;
    }
    if (!l) {
      continue;
    }
    const t = /^\[([\w.-]+)\]$/.exec(l);
    if (t) {
      table = t[1];
      tables[table] ??= {};
      continue;
    }
    const kv = /^([\w.-]+)\s*=\s*(.+)$/.exec(l);
    if (!kv) {
      throw new Error(`ligne TOML illisible : ${brute}`);
    }
    if (kv[2].startsWith('[') && !kv[2].endsWith(']')) {
      cle = kv[1];
      tampon = kv[2];
      continue;
    }
    tables[table][kv[1]] = JSON.parse(kv[2].replace(/,\s*\]$/, ']')) as unknown;
  }
  return tables;
}

describe('grillhouse-pkl.7, critère 1 — maj déclare cargo, sans outil npm d’un autre langage', () => {
  it('cargo is found by a Cargo.toml at the root, not in a directory under it', () => {
    expect(cargo.trouve(rust())).toBe(true);
    const dessous = projet({ 'package.json': { name: 'p' }, 'moteur/Cargo.toml': '[package]\n' });
    expect(cargo.trouve(dessous)).toBe(false);
    expect(langagesTrouves(dessous)).toEqual([]);
  });

  it('no language found: the refusal names the sign of each language', () => {
    const racine = projet({ 'package.json': { name: 'p' } });
    expect(() => mettreAJour(racine, DEPOT)).toThrow(/cargo : un Cargo\.toml à la racine\)/);
    expect(() => mettreAJour(racine, DEPOT)).toThrow(/typescript : un tsconfig\.json/);
  });

  it('a project of Rust is declared cargo and receives no tool of npm of typescript', () => {
    const racine = rust();
    const b = mettreAJour(racine, DEPOT);
    const p = pkgDe(racine);
    expect(p.grillhouse?.langages).toEqual(['cargo']);
    expect(b.dependances).toEqual([]);
    for (const o of OUTILS_TS) {
      expect(p.devDependencies?.[o], o).toBeUndefined();
    }
    expect(readdirSync(racine)).not.toContain('turbo.json');
    expect(Object.values(p.scripts ?? {}).join('\n')).not.toMatch(/turbo|vitest/);
  });

  it('a project of typescript receives no binary of cargo: cargo is never called', () => {
    const racine = ts();
    mettreAJour(racine, DEPOT);
    expect(installerBinaires(racine)).toEqual({ installes: [], lignes: [] });
    expect(appels()).toEqual([]);
  });
});

describe('grillhouse-pkl.7, critère 2 — maj installe les binaires qui manquent, par cargo binstall', () => {
  it('the binaries of the module cargo are its binaires.json, each at an exact version', () => {
    const fichier = JSON.parse(
      readFileSync(
        path.join(DEPOT, 'packages/grillhouse/scripts/langages/cargo/binaires.json'),
        'utf8'
      )
    ) as Record<string, string>;
    expect(BINAIRES).toEqual(fichier);
    expect(Object.keys(BINAIRES)).toEqual(expect.arrayContaining(['cargo-deny', 'cargo-nextest']));
    for (const v of Object.values(BINAIRES)) {
      expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect((typescript as unknown as { binaires: object }).binaires).toEqual({});
  });

  it('one call of cargo binstall per binary missing, none for a binary up to date', () => {
    const racine = rust({ 'package.json': { name: 'p', grillhouse: { langages: ['cargo'] } } });
    // The first binary installed at its version, the others missing.
    const manquants = Object.keys(BINAIRES).slice(1);
    process.env.FAUX_CARGO_INSTALLES = JSON.stringify(
      Object.fromEntries(Object.entries(BINAIRES).slice(0, 1))
    );
    const r = installerBinaires(racine) as { installes: string[]; lignes: string[] };
    expect(installations()).toEqual(
      manquants.map(n => `binstall --no-confirm --locked ${n}@${BINAIRES[n]}`)
    );
    expect(r.installes).toEqual(manquants.map(n => `${n}@${BINAIRES[n]}`));
    expect(r.lignes).toEqual([]);
  });

  it('a binary at another version is installed at the module’s; all up to date, no install', () => {
    const racine = rust({ 'package.json': { name: 'p', grillhouse: { langages: ['cargo'] } } });
    const [ancien] = Object.keys(BINAIRES);
    process.env.FAUX_CARGO_INSTALLES = JSON.stringify({ ...BINAIRES, [ancien]: '0.0.1' });
    installerBinaires(racine);
    expect(installations()).toEqual([
      `binstall --no-confirm --locked ${ancien}@${BINAIRES[ancien]}`,
    ]);
    writeFileSync(JOURNAL, '');
    process.env.FAUX_CARGO_INSTALLES = JSON.stringify(BINAIRES);
    expect(installerBinaires(racine)).toEqual({ installes: [], lignes: [] });
    expect(installations()).toEqual([]);
  });

  it('an install that fails has its line, the command to type named', () => {
    const racine = rust({ 'package.json': { name: 'p', grillhouse: { langages: ['cargo'] } } });
    process.env.FAUX_CARGO_CODES = JSON.stringify({ binstall: 1 });
    const r = installerBinaires(racine) as { installes: string[]; lignes: string[] };
    expect(r.installes).toEqual([]);
    expect(r.lignes).toHaveLength(Object.keys(BINAIRES).length);
    for (const [n, v] of Object.entries(BINAIRES)) {
      expect(r.lignes.join('\n')).toContain(`cargo binstall --no-confirm --locked ${n}@${v}`);
    }
  });
});

describe('grillhouse-pkl.7 — les générateurs du module cargo', () => {
  it('the index of the interfaces it engenders is a generator of its share of the update', () => {
    const m = (
      cargo as unknown as {
        miseAJour: { generateurs: { commande: string; args: string[]; sortie: string | null }[] };
      }
    ).miseAJour;
    expect(m.generateurs).toEqual([
      { commande: 'index-interfaces', args: [], sortie: 'docs/agents/index-des-interfaces.md' },
    ]);
    const engendres = (
      cargo as unknown as { fichiersEngendres: () => { fichiers: string[] }[] }
    ).fichiersEngendres();
    expect(engendres.flatMap(e => e.fichiers)).toContain(m.generateurs[0].sortie);
    expect(Object.keys(CARGO.commandes(''))).toContain('index-interfaces');
  });
});

describe('grillhouse-pkl.7, critère 3 — le gabarit d’un projet cargo', () => {
  it('holds deny.toml, .config/nextest.toml, rust-toolchain.toml and a package.json', () => {
    const fichiers = (d: string, rel = ''): string[] =>
      readdirSync(path.join(d, rel), { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? fichiers(d, path.join(rel, e.name)) : [path.join(rel, e.name)]
      );
    expect(fichiers(GABARIT).sort()).toEqual(
      ['.config/nextest.toml', 'deny.toml', 'package.json', 'rust-toolchain.toml'].sort()
    );
  });

  it('deny.toml reads as TOML, its section licenses allows licenses (none allowed is cargo-deny’s code 4)', () => {
    const t = toml(lire(GABARIT, 'deny.toml'));
    const permises = t.licenses?.allow as string[] | undefined;
    expect(Array.isArray(permises)).toBe(true);
    expect(permises?.length).toBeGreaterThan(0);
    for (const l of ['MIT', 'Apache-2.0']) {
      expect(permises).toContain(l);
    }
    for (const s of ['advisories', 'bans', 'sources']) {
      expect(t, s).toHaveProperty(s);
    }
  });

  it('the JUnit report lands where the verdict reads it: the frame’s profile, which the project’s nextest.toml leaves to it', () => {
    // The frame's profile, a tool's configuration under the project's (./commandes.mjs reads
    // `<target>/nextest/grillhouse/junit.xml`, then copies it where ./verdict.mjs reads it).
    const cadre = toml(lire(DEPOT, 'packages/grillhouse/scripts/langages/cargo/nextest.toml'));
    expect(cadre['profile.grillhouse.junit']).toEqual({ path: 'junit.xml' });
    const commandes = lire(DEPOT, 'packages/grillhouse/scripts/langages/cargo/commandes.mjs');
    expect(commandes).toContain("const PROFIL = 'grillhouse';");
    expect(commandes).toContain("path.join(m.target_directory, 'nextest', PROFIL, 'junit.xml')");
    // The project's configuration overrides a tool's: it defines no profile of the frame.
    const projet = toml(lire(GABARIT, '.config/nextest.toml'));
    expect(Object.keys(projet).filter(k => k.startsWith('profile.grillhouse'))).toEqual([]);
  });

  it('rust-toolchain.toml gives clippy and rustfmt, which the guards run', () => {
    const t = toml(lire(GABARIT, 'rust-toolchain.toml'));
    expect(t.toolchain?.components).toEqual(expect.arrayContaining(['clippy', 'rustfmt']));
  });

  it('its package.json runs the frame’s commands, no tool of another language', () => {
    const p = JSON.parse(lire(GABARIT, 'package.json')) as Pkg;
    expect(p.scripts?.test).toBe('grillhouse tests');
    expect(p.scripts?.verifier).toBe('grillhouse verifier');
    expect(p.scripts?.['grillhouse:gardes']).toBe('grillhouse gardes-du-cadre');
    expect(JSON.stringify(p)).not.toMatch(/turbo|vitest|tsc\b/);
    expect(p.devDependencies ?? {}).toEqual({});
  });

  it('the update copies the template’s files a project lacks, keeps its own, and writes its test scripts', () => {
    const racine = rust({ 'deny.toml': '# le mien\n' });
    mettreAJour(racine, DEPOT);
    expect(lire(racine, 'deny.toml')).toBe('# le mien\n');
    for (const f of ['.config/nextest.toml', 'rust-toolchain.toml']) {
      expect(lire(racine, f), f).toBe(lire(GABARIT, f));
    }
    const s = pkgDe(racine).scripts ?? {};
    expect(s.test).toBe('grillhouse tests');
    expect(s.verifier).toBe('grillhouse verifier');
    expect(s['grillhouse:gardes']).toBe('grillhouse gardes-du-cadre');
  });
});

describe('grillhouse-pkl.7, critère 4 — ce que les outils du langage écrivent est ignoré', () => {
  it('each module names what its tools write: cargo target, typescript .turbo', () => {
    expect((cargo as unknown as { ignorer: string[] }).ignorer).toEqual(['target']);
    expect((typescript as unknown as { ignorer: string[] }).ignorer).toEqual(['.turbo']);
  });

  it('the source files of a project of Rust leave target/ out; of typescript, .turbo', () => {
    const r = rust({
      'package.json': { name: 'p', grillhouse: { langages: ['cargo'] } },
      'target/debug/build.mjs': '',
      'scripts/a.mjs': '',
    });
    expect(sources(r)).toEqual(['scripts/a.mjs']);
    const t = ts({
      'package.json': { name: 'p', grillhouse: { langages: ['typescript'] } },
      '.turbo/cache.mjs': '',
      'target/a.mjs': '',
      'src/a.ts': '',
    });
    expect(sources(t).sort()).toEqual(['src/a.ts', 'target/a.mjs']);
  });

  it('the .gitignore the update writes ignores target/ for a project of Rust, .turbo/ for typescript', () => {
    const r = rust();
    mettreAJour(r, DEPOT);
    expect(lire(r, '.gitignore').split('\n')).toContain('target/');
    expect(lire(r, '.gitignore')).not.toMatch(/turbo/);
    const t = ts();
    mettreAJour(t, DEPOT);
    expect(lire(t, '.gitignore').split('\n')).toContain('.turbo/');
    expect(lire(t, '.gitignore')).not.toMatch(/target/);
  });

  it('a .gitignore that already ignores target (/target) stays as it is', () => {
    const r = rust({ '.gitignore': '/target\n' });
    mettreAJour(r, DEPOT);
    expect(lire(r, '.gitignore')).toBe('/target\n');
  });
});
