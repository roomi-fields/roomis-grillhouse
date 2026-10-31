// grillhouse-pkl.7 — the update and the template of a project of Rust: `grillhouse maj` declares
// cargo for a Cargo.toml at the root, writes no tool of npm of another language,
// installs the binaries of the declared language that the machine lacks (`binaires`, by
// `cargo binstall`, as `cargo install --list` reads what is installed), and ignores what the
// language's tools write (`ignorer`: cargo's `target/`, typescript's `.turbo`), in the source files
// the migrations read and in the `.gitignore` it writes. The template of a project of cargo
// (`templates/cargo/`) gives its deny.toml, its nextest configuration, its toolchain and its
// package.json, which the update copies where the project has none. The calls of cargo go to the
// fake cargo (./langages/cargo/faux-cargo.ts), whose journal lists them: no network.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { VERSION } from '../../scripts/cadre.mjs';
import { installerBinaires, LIGNE_DU_CADRE, mettreAJour } from '../../scripts/grillhouse-maj.mjs';
import cargo from '../../scripts/langages/cargo/index.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';
import { sources as lesSources } from '../../scripts/sources.mjs';
import type { Langage } from '../../scripts/jointure.js';
import { BINSTALL } from '../../scripts/langages/cargo/binaires.mjs';
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
  grillhouse?: Record<string, unknown>;
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
// grillhouse-ca7: each project declares its language in its architecture.
const rust = (autres: Record<string, string | object> = {}) =>
  projet({
    'package.json': { name: 'p' },
    'docs/ARCHITECTURE.md': architecture({ p: 'cargo' }),
    'Cargo.toml': '[package]\nname = "p"\nversion = "0.1.0"\n',
    'src/lib.rs': '',
    ...autres,
  });
const ts = (autres: Record<string, string | object> = {}) =>
  projet({
    'package.json': { name: 'p' },
    'docs/ARCHITECTURE.md': architecture(),
    'tsconfig.json': '{}\n',
    ...autres,
  });

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

describe('grillhouse-pkl.7, critère 1 — maj sert cargo, sans outil npm d’un autre langage', () => {
  it('no language declared: the update guesses none from a Cargo.toml, the refusal names the column', () => {
    // grillhouse-ca7: the language is declared at the design, never recognised.
    const racine = projet({ 'package.json': { name: 'p' }, 'Cargo.toml': '[package]\n' });
    expect(() => mettreAJour(racine, DEPOT)).toThrow(/ARCHITECTURE\.md.*« Langage »/);
  });

  it('a project of Rust declared cargo receives no tool of npm of typescript', () => {
    const racine = rust();
    const b = mettreAJour(racine, DEPOT);
    const p = pkgDe(racine);
    expect(p.grillhouse).not.toHaveProperty('langages');
    // grillhouse-ool: the one tool of npm of the module cargo, the reader of a Cargo.toml.
    expect(b.dependances).toEqual(['smol-toml']);
    expect(p.devDependencies?.['smol-toml']).toBe('1.9.1');
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
    const racine = rust();
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
    const racine = rust();
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
    const racine = rust();
    process.env.FAUX_CARGO_CODES = JSON.stringify({ binstall: 1 });
    const r = installerBinaires(racine) as { installes: string[]; lignes: string[] };
    expect(r.installes).toEqual([]);
    expect(r.lignes).toHaveLength(Object.keys(BINAIRES).length);
    for (const [n, v] of Object.entries(BINAIRES)) {
      expect(r.lignes.join('\n')).toContain(`cargo binstall --no-confirm --locked ${n}@${v}`);
    }
  });
});

// grillhouse-qmk (OSC Bridge, 2026-10-31): `npx grillhouse maj` installed sccache only once
// cargo-binstall was there; `cargo install cargo-binstall` had to be typed by hand.
describe('grillhouse-qmk, critère 2 — maj installe cargo-binstall quand il manque', () => {
  const sansBinstall = () => {
    const marque = path.join(mkdtempSync(path.join(ESSAIS, 'binstall-')), 'installe');
    process.env.FAUX_CARGO_SANS_BINSTALL = marque;
    return marque;
  };
  beforeEach(() => {
    delete process.env.FAUX_CARGO_SANS_BINSTALL;
  });
  const INSTALLATION = `install --locked cargo-binstall@${BINSTALL}`;

  it('cargo-binstall absent: cargo installs it once, at its exact version, then every binary by it', () => {
    const racine = rust();
    sansBinstall();
    const r = installerBinaires(racine) as { installes: string[]; lignes: string[] };
    expect(appels().filter(a => a.startsWith('install --locked'))).toEqual([INSTALLATION]);
    const ordre = appels();
    expect(ordre.indexOf(INSTALLATION)).toBeLessThan(
      ordre.findIndex(a => a.startsWith('binstall '))
    );
    expect(installations()).toEqual(
      Object.entries(BINAIRES).map(([n, v]) => `binstall --no-confirm --locked ${n}@${v}`)
    );
    expect(r.lignes).toEqual([]);
  });

  it('cargo-binstall present: cargo installs nothing else', () => {
    const racine = rust();
    installerBinaires(racine);
    expect(appels().filter(a => a.startsWith('install --locked'))).toEqual([]);
  });

  it('cargo-binstall that does not install: its line names the command to type, no binstall run', () => {
    const racine = rust();
    sansBinstall();
    process.env.FAUX_CARGO_CODES = JSON.stringify({ 'install cargo-binstall': 1 });
    const r = installerBinaires(racine) as { installes: string[]; lignes: string[] };
    expect(r.installes).toEqual([]);
    expect(installations()).toEqual([]);
    expect(r.lignes.join('\n')).toContain(`cargo ${INSTALLATION}`);
  });
});

// grillhouse-qmk (OSC Bridge, 2026-10-31): `npx grillhouse maj` left a project at 0.25.5 whose
// package.json held ^0.25.5. The update brings the project to the version installed, by design;
// npm reads ^0.25.5 as >=0.25.5 <0.26.0 (node-semver, « caret ranges »: a 0.x range admits no next
// minor), so `npm install` never reaches 0.26.0. The report says the command to type first.
describe('grillhouse-qmk, critère 3 — maj dit la commande qui monte la version', () => {
  it('the first line of the report names the version installed and the command that installs another', () => {
    expect(LIGNE_DU_CADRE).toContain(`Cadre ${VERSION}, la version installée`);
    expect(LIGNE_DU_CADRE).toContain('`npm install -D @roomi-fields/grillhouse@<version>`');
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

  it('grillhouse-is4 — deny.toml leaves the project’s unpublished crates out of the licence check', () => {
    const t = toml(lire(GABARIT, 'deny.toml'));
    expect(t['licenses.private']?.ignore).toBe(true);
  });

  it('grillhouse-0wy — deny.toml allows CDLA-Permissive-2.0, the licence of webpki-roots', () => {
    expect(toml(lire(GABARIT, 'deny.toml')).licenses?.allow).toContain('CDLA-Permissive-2.0');
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
    // The version of each tool of npm of the module cargo, which the update installs (grillhouse-ool).
    expect(p.devDependencies ?? {}).toEqual({ 'smol-toml': '1.9.1' });
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

// grillhouse-rph: OSC Bridge ignored its Cargo.lock; the verification of the module cargo plays
// `--locked`, and failed in the integration's copy alone. The share of the module cargo leaves the
// line to the project (`aFaire`), which the update writes on the error stream before any tool of
// the language, its code 1, and plays no verification.
describe('grillhouse-rph, critère 1 — maj signale un Cargo.lock non versionné', () => {
  const LIGNE = '⛔ Cargo.lock non versionné : git add Cargo.lock';
  const git = (racine: string, ...args: string[]) =>
    spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  // A project of Rust in git, its Cargo.lock on disk, committed or ignored by .gitignore.
  const engage = (suivi: boolean) => {
    const racine = rust({
      'Cargo.lock': '# This file is automatically @generated by Cargo.\nversion = 4\n',
      '.gitignore': suivi ? '/target\n' : '/target\nCargo.lock\n',
    });
    git(racine, 'init', '-q', '-b', 'main');
    git(racine, 'add', '-A');
    git(racine, '-c', 'user.email=e@example.com', '-c', 'user.name=e', 'commit', '-q', '-m', 'p');
    return racine;
  };
  const appliquer = (racine: string) =>
    (
      CARGO.miseAJour.appliquer(racine, {
        p: { name: 'p' },
        modele: {},
        source: DEPOT,
        version: '0.0.0',
      }) as { aFaire: string[] }
    ).aFaire;
  type Bilan = { duLangage: { aFaire: string[] } };

  it('the share of the module cargo leaves the line to the project; a Cargo.lock tracked, none', () => {
    expect(appliquer(engage(false))).toEqual([LIGNE]);
    expect(appliquer(engage(true))).toEqual([]);
  });

  it('the update carries the share’s line in its bilan, without running cargo', () => {
    expect((mettreAJour(engage(false), DEPOT) as Bilan).duLangage.aFaire).toEqual([LIGNE]);
    expect((mettreAJour(engage(true), DEPOT) as Bilan).duLangage.aFaire).toEqual([]);
    expect(appels()).toEqual([]);
  });
});

describe('grillhouse-pkl.7, critère 4 — ce que les outils du langage écrivent est ignoré', () => {
  it('each module names what its tools write: cargo target, typescript .turbo', () => {
    expect((cargo as unknown as { ignorer: string[] }).ignorer).toEqual(['target']);
    expect((typescript as unknown as { ignorer: string[] }).ignorer).toEqual(['.turbo']);
  });

  it('the source files of a project of Rust leave target/ out; of typescript, .turbo', () => {
    const r = rust({
      'target/debug/build.mjs': '',
      'scripts/a.mjs': '',
    });
    expect(sources(r)).toEqual(['scripts/a.mjs']);
    const t = ts({
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

describe('grillhouse-akd, critère 4 — la mise à jour d’un projet de deux langages prend l’union', () => {
  // A project of Rust at its root and of TypeScript in a package of its workspaces.
  const deux = () =>
    rust({
      'package.json': { name: 'p', workspaces: ['site'] },
      'docs/ARCHITECTURE.md': architecture({ site: 'typescript', p: 'cargo' }),
      'site/package.json': { name: 'site' },
      'site/tsconfig.json': '{}\n',
    });

  it('both declared, the tools of npm of each module added, both directories ignored', () => {
    const racine = deux();
    const b = mettreAJour(racine, DEPOT);
    const p = pkgDe(racine);
    expect(b.dependances).toEqual(expect.arrayContaining(['smol-toml', ...OUTILS_TS]));
    expect(p.devDependencies?.['smol-toml']).toBe('1.9.1');
    for (const o of OUTILS_TS) {
      expect(p.devDependencies?.[o], o).toBeDefined();
    }
    const ignores = lire(racine, '.gitignore').split('\n');
    expect(ignores).toContain('target/');
    expect(ignores).toContain('.turbo/');
  });

  it('the binaries of cargo are installed for the project of two languages', () => {
    const racine = deux();
    mettreAJour(racine, DEPOT);
    writeFileSync(JOURNAL, '');
    const r = installerBinaires(racine) as { installes: string[]; lignes: string[] };
    expect(r.installes).toEqual(Object.entries(BINAIRES).map(([n, v]) => `${n}@${v}`));
    expect(r.lignes).toEqual([]);
  });
});
