// The search of the components leaves out what git ignores: a folder a project's .gitignore
// excludes (a local clone of another repository) holds no component, in the modules that find
// their components on the disk (c, python, typescript), and the guard of the languages judges
// the tree git follows. A manifest git tracks, or does not ignore, is found as before, and a
// project without git is read from its disk alone.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { constats } from '../../scripts/langages-des-paquets.mjs';
import { langage } from '../../scripts/langages.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ignores-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

const git = (racine: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
};

const CMAKE = (nom: string) => `cmake_minimum_required(VERSION 3.16)\nproject(${nom} C)\n`;
const PYPROJECT = (nom: string) => `[project]\nname = "${nom}"\nversion = "0.1.0"\n`;
const PACKAGE = (nom: string) => JSON.stringify({ name: nom, private: true });

// A project of the three languages: one package each, and a clone under `clones/` and
// `packages/clone` that holds a manifest of each; with <depot>, a git repository whose
// .gitignore excludes both.
function projet({ depot }: { depot: boolean }) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', PACKAGE('essai'));
  ecrire(racine, 'osd-embed/CMakeLists.txt', CMAKE('osd-embed'));
  ecrire(racine, 'outil/pyproject.toml', PYPROJECT('outil'));
  ecrire(racine, 'packages/coeur/package.json', PACKAGE('coeur'));
  ecrire(racine, 'clones/adaptations/CMakeLists.txt', CMAKE('adaptations'));
  ecrire(racine, 'clones/scripts/pyproject.toml', PYPROJECT('scripts'));
  ecrire(racine, 'packages/clone/package.json', PACKAGE('clone'));
  declarerLesLangages(racine, {
    'osd-embed': 'c',
    outil: 'python',
    'packages/coeur': 'typescript',
  });
  if (depot) {
    git(racine, 'init', '-q');
    ecrire(racine, '.gitignore', 'clones/\npackages/clone/\n');
  }
  return racine;
}

const dossiers = (nom: string, racine: string) =>
  langage(nom)
    .composants(racine)
    .map(c => path.relative(racine, c.dossier))
    .sort();

describe('a folder git ignores holds no component', () => {
  it('c: the CMakeLists.txt of an ignored folder gives no component', () => {
    expect(dossiers('c', projet({ depot: true }))).toEqual(['osd-embed']);
  });

  it('python: the pyproject.toml of an ignored folder gives no component', () => {
    expect(dossiers('python', projet({ depot: true }))).toEqual(['outil']);
  });

  it('typescript: an ignored folder under packages/ gives no component', () => {
    expect(dossiers('typescript', projet({ depot: true }))).toEqual(['packages/coeur']);
  });

  it('typescript: an ignored folder without package.json under src/ gives no component', () => {
    const racine = projet({ depot: true });
    ecrire(racine, 'src/noyau/index.ts', 'export {};\n');
    ecrire(racine, 'src/clone/index.ts', 'export {};\n');
    ecrire(racine, '.gitignore', 'clones/\npackages/clone/\nsrc/clone/\n');
    expect(dossiers('typescript', racine)).toEqual(['packages/coeur', 'src/noyau']);
  });

  it('the guard of the languages has no finding on a main tree that holds an ignored clone', () => {
    expect(constats(projet({ depot: true }))).toEqual([]);
  });
});

describe('a component git does not ignore is found as before', () => {
  it('in a git repository, a manifest not yet added is a component', () => {
    const racine = projet({ depot: true });
    ecrire(racine, 'neuf/CMakeLists.txt', CMAKE('neuf'));
    ecrire(racine, 'neuf-py/pyproject.toml', PYPROJECT('neuf-py'));
    ecrire(racine, 'packages/neuf/package.json', PACKAGE('neuf'));
    expect(dossiers('c', racine)).toEqual(['neuf', 'osd-embed']);
    expect(dossiers('python', racine)).toEqual(['neuf-py', 'outil']);
    expect(dossiers('typescript', racine)).toEqual(['packages/coeur', 'packages/neuf']);
  });

  it('in a git repository, a manifest git tracks under an ignored folder is a component', () => {
    const racine = projet({ depot: true });
    git(racine, 'add', '-f', 'clones/adaptations/CMakeLists.txt', 'clones/scripts/pyproject.toml');
    expect(dossiers('c', racine)).toEqual(['clones/adaptations', 'osd-embed']);
    expect(dossiers('python', racine)).toEqual(['clones/scripts', 'outil']);
  });

  it('in a git repository, a package.json git tracks under an ignored folder is a component', () => {
    const racine = projet({ depot: true });
    git(racine, 'add', '-f', 'packages/clone/package.json');
    expect(dossiers('typescript', racine)).toEqual(['packages/clone', 'packages/coeur']);
  });

  it('a submodule that holds a manifest is a component, and the ignored folder beside it is none', () => {
    const racine = projet({ depot: true });
    const auteur = ['-c', 'user.name=essai', '-c', 'user.email=essai@exemple.invalid'];
    ecrire(racine, 'vendu/CMakeLists.txt', CMAKE('vendu'));
    git(racine, 'init', '-q', 'vendu');
    git(path.join(racine, 'vendu'), 'add', 'CMakeLists.txt');
    git(path.join(racine, 'vendu'), ...auteur, 'commit', '-q', '--no-verify', '-m', 'essai');
    git(racine, '-c', 'advice.addEmbeddedRepo=false', 'add', 'vendu');
    expect(dossiers('c', racine)).toEqual(['osd-embed', 'vendu']);
  });

  it('in a folder without git, every manifest on the disk is a component', () => {
    const racine = projet({ depot: false });
    ecrire(racine, '.gitignore', 'clones/\npackages/clone/\n');
    expect(dossiers('c', racine)).toEqual(['clones/adaptations', 'osd-embed']);
    expect(dossiers('python', racine)).toEqual(['clones/scripts', 'outil']);
    expect(dossiers('typescript', racine)).toEqual(['packages/clone', 'packages/coeur']);
  });
});
