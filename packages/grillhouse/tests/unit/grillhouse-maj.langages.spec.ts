// grillhouse-ca7 — the update serves the languages the architecture declares (the column
// « Langage » of the table of the components of docs/ARCHITECTURE.md), and guesses none from the
// files (decision D2 of grillhouse-1zu). Before every other step, it brings the declaration of a
// former version of the frame (`grillhouse.langages` of the package.json) into that column, by the
// migration of 0.27.0, which then removes the key (tests/unit/migration.langages-dans-l-architecture
// .spec.ts). A project that declares no language is refused, named with the column, nothing
// written. It adds the tools of the declared languages alone (the `outils` of each module). No
// import of the project is rewritten. Witness: a trial copied from BPScript (its package.json,
// those of its packages and their tsconfig.json, its turbo.json, its .gitignore, its tsdoc.json and
// its list of the packages out of the frame, tests/cas-reels/bp-3dr.2.3), its architecture
// declaring typescript.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { declarerLesLangages, mettreAJour } from '../../scripts/grillhouse-maj.mjs';
import { langageDe, langagesDeclares } from '../../scripts/langages.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-maj-langages-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const MAJ = path.join(DEPOT, 'packages/grillhouse/scripts/grillhouse-maj.mjs');
const BPSCRIPT = path.join(__dirname, '../cas-reels/bp-3dr.2.3/depot.json');
const OUTILS = (typescript as unknown as { outils: string[] }).outils;

type Pkg = {
  grillhouse?: Record<string, unknown>;
  devDependencies?: Record<string, string>;
};
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const pkgDe = (racine: string, f = 'package.json') => JSON.parse(lire(racine, f)) as Pkg;

// A project of <fichiers> (path → content; an object is written as JSON).
function projet(fichiers: Record<string, string | object>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries(fichiers)) {
    ecrire(racine, f, typeof t === 'string' ? t : `${JSON.stringify(t, null, 2)}\n`);
  }
  return racine;
}

// Every file under <racine>, `.git` left out, with its content.
function etat(racine: string) {
  const out = new Map<string, string>();
  const parcourir = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') {
        continue;
      }
      const f = path.join(d, e.name);
      if (e.isDirectory()) {
        parcourir(f);
      } else {
        out.set(path.relative(racine, f), readFileSync(f, 'utf8'));
      }
    }
  };
  parcourir(racine);
  return out;
}

// The devDependencies each package.json of <apres> gained over <avant>.
function ajoutees(avant: Map<string, string>, apres: Map<string, string>) {
  const noms = new Set<string>();
  for (const [f, texte] of apres) {
    if (path.basename(f) !== 'package.json') {
      continue;
    }
    const a = avant.has(f) ? (JSON.parse(avant.get(f) as string) as Pkg) : {};
    const p = JSON.parse(texte) as Pkg;
    for (const n of Object.keys(p.devDependencies ?? {})) {
      if (!Object.hasOwn(a.devDependencies ?? {}, n)) {
        noms.add(n);
      }
    }
  }
  return [...noms].sort();
}

describe('grillhouse-ca7 — la mise à jour sert les langages de l’architecture', () => {
  it('a project declared in its architecture is served by its language, its package.json without key', () => {
    const racine = projet({
      'package.json': { name: 'p' },
      'docs/ARCHITECTURE.md': architecture(),
      'tsconfig.json': '{}\n',
    });
    mettreAJour(racine, DEPOT);
    expect(pkgDe(racine).grillhouse).not.toHaveProperty('langages');
    expect(langageDe(racine).nom).toBe('typescript');
  });

  it('the declaration of a former version goes into the architecture first, the key removed', () => {
    const racine = projet({
      'package.json': { name: 'p', grillhouse: { langages: ['typescript'], version: '0.26.0' } },
      'tsconfig.json': '{}\n',
    });
    const r = declarerLesLangages(racine) as { version: string; lignes: string[] } | null;
    expect(r?.version).toBe('0.27.0');
    expect(r?.lignes).toEqual([expect.stringMatching(/« Langage »/)]);
    expect(pkgDe(racine).grillhouse).toEqual({ version: '0.26.0' });
    expect(langagesDeclares(racine)).toEqual(['typescript']);
    expect(declarerLesLangages(racine)).toBeNull();
  });

  it('no declaration: the update is refused, the column named, nothing written, whatever the files show', () => {
    const racine = projet({ 'package.json': { name: 'p' }, 'tsconfig.json': '{}\n' });
    const avant = etat(racine);
    expect(() => mettreAJour(racine, DEPOT)).toThrow(/ARCHITECTURE\.md.*« Langage »/);
    expect(() => declarerLesLangages(racine)).toThrow(/« Langage »/);
    expect(etat(racine)).toEqual(avant);
  });

  it('a former declaration of a language the frame lacks is refused, named, nothing written', () => {
    const racine = projet({ 'package.json': { name: 'p', grillhouse: { langages: ['cobol'] } } });
    const avant = etat(racine);
    expect(() => declarerLesLangages(racine)).toThrow(/cobol/);
    expect(etat(racine)).toEqual(avant);
  });

  it('the command refuses a project without declaration, its code 1, the refusal on the error stream', () => {
    const racine = projet({ 'package.json': { name: 'p' } });
    const avant = etat(racine);
    const r = spawnSync(process.execPath, [MAJ], { cwd: racine, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*« Langage »/);
    expect(etat(racine)).toEqual(avant);
  });

  it('the command refuses a directory without package.json, named', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'vide-'));
    const r = spawnSync(process.execPath, [MAJ], { cwd: racine, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/⛔.*package\.json/);
    expect(readdirSync(racine)).toEqual([]);
  });

  it('the template of a project, which init copies, declares typescript in its architecture', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'gabarit-'));
    cpSync(path.join(DEPOT, 'templates/projet'), racine, { recursive: true });
    expect(langagesDeclares(racine)).toEqual(['typescript']);
    expect(pkgDe(racine).grillhouse).toBeUndefined();
    mettreAJour(racine, DEPOT);
    expect(pkgDe(racine).grillhouse).not.toHaveProperty('langages');
  });
});

describe('grillhouse-3dr.2.3 — les outils des langages déclarés, seuls', () => {
  it('the tools of the module typescript are optional peers of the package, each at a version of the template', () => {
    const paquet = JSON.parse(lire(DEPOT, 'packages/grillhouse/package.json')) as {
      peerDependenciesMeta: Record<string, { optional?: boolean }>;
    };
    const gabarit = pkgDe(DEPOT, 'templates/projet/package.json');
    expect(OUTILS.length).toBeGreaterThan(0);
    for (const o of OUTILS) {
      expect(paquet.peerDependenciesMeta[o]?.optional, o).toBe(true);
      expect(gabarit.devDependencies?.[o], o).toBeTypeOf('string');
    }
  });

  it('a project of typescript receives the tools of its module, and none other', () => {
    const racine = projet({
      'package.json': { name: 'p' },
      'docs/ARCHITECTURE.md': architecture(),
      'tsconfig.json': '{}\n',
    });
    const b = mettreAJour(racine, DEPOT);
    expect(Object.keys(pkgDe(racine).devDependencies ?? {}).sort()).toEqual([...OUTILS].sort());
    expect([...b.dependances].sort()).toEqual([...OUTILS].sort());
  });
});

describe('grillhouse-3dr.2.3 — un projet d’essai copié de BPScript', () => {
  const bpscript = () =>
    projet({
      ...(JSON.parse(readFileSync(BPSCRIPT, 'utf8')) as Record<string, string>),
      'docs/ARCHITECTURE.md': architecture(),
    });

  it('the trial holds no tsconfig.json at its root', () => {
    expect(readdirSync(bpscript())).not.toContain('tsconfig.json');
  });

  it('the update adds no tool of another language, and rewrites nothing on a second pass', () => {
    const racine = bpscript();
    const avant = etat(racine);
    mettreAJour(racine, DEPOT);
    const premiere = etat(racine);
    for (const n of ajoutees(avant, premiere)) {
      expect(OUTILS, n).toContain(n);
    }
    mettreAJour(racine, DEPOT);
    expect(etat(racine)).toEqual(premiere);
  });

  it('no import is rewritten: only package.json files and the frame’s own files change', () => {
    const racine = bpscript();
    const avant = etat(racine);
    mettreAJour(racine, DEPOT);
    const changes = [...etat(racine)]
      .filter(([f, t]) => avant.get(f) !== t)
      .map(([f]) => f)
      .filter(f => path.basename(f) !== 'package.json' && f !== '.gitattributes');
    expect(changes).toEqual([]);
  });
});
