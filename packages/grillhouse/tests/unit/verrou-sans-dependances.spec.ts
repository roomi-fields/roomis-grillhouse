// The write lock judges where the dependencies of the frame's package are not installed: it loads
// the join of the languages and each module of language from a version of the frame, and none of
// them loads a dependency of the package while it loads (a dependency of one command is required
// when that command runs). A medium test: the scripts of the package, copied in a temporary
// directory without its dependencies, are imported there and asked.
// @lit packages/grillhouse/scripts/**
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PAQUET = path.resolve(__dirname, '../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-sans-dependances-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const requis = createRequire(import.meta.url);

interface Langages {
  LANGAGES: Record<string, string>;
  langage: (nom: string) => { estUnTest: unknown };
}
interface Verrou {
  refusal: (
    role: string,
    input: { tool_name: string; tool_input: { file_path: string; content: string }; cwd: string },
    options: { tmp: string }
  ) => string | null;
}

// The names of the frame's languages, read in the package itself: the copy holds the same list.
const NOMS = Object.keys((requis(path.join(PAQUET, 'scripts/langages.mjs')) as Langages).LANGAGES);

// The package as a version installed without its dependencies: its package.json and its scripts.
const COPIE = path.join(ESSAIS, 'installee/node_modules/@roomi-fields/grillhouse');
beforeAll(() => {
  mkdirSync(COPIE, { recursive: true });
  cpSync(path.join(PAQUET, 'package.json'), path.join(COPIE, 'package.json'));
  cpSync(path.join(PAQUET, 'scripts'), path.join(COPIE, 'scripts'), { recursive: true });
});

// A project the lock judges: it declares its language and has a package a.
let n = 0;
function projet() {
  const repo = path.join(ESSAIS, `projet-${++n}`);
  mkdirSync(path.join(repo, 'packages/a'), { recursive: true });
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ name: 'racine', private: true, workspaces: ['packages/*'] })
  );
  declarerLesLangages(repo);
  writeFileSync(
    path.join(repo, 'packages/a/package.json'),
    JSON.stringify({ name: 'a', version: '1.0.0' })
  );
  return repo;
}

// The verdict of the copy's lock on the write of <fichier> by the testwriter, in a trial project.
// The project lies under the system temporary directory, which the lock always lets through: the
// lock is given a temporary directory of its own.
const verdict = (fichier: string) => {
  const { refusal } = requis(path.join(COPIE, 'scripts/verrous/verrou.mjs')) as Verrou;
  const repo = projet();
  const tmp = path.join(ESSAIS, `tmp-${n}`);
  mkdirSync(tmp);
  return refusal(
    'testwriter',
    {
      tool_name: 'Write',
      tool_input: { file_path: path.join(repo, fichier), content: 'x' },
      cwd: repo,
    },
    { tmp }
  );
};

describe('le verrou d’écriture juge sans les dépendances du paquet', () => {
  it('la copie d’essai ne résout aucune dépendance du paquet : semver y est introuvable', () => {
    const deLaCopie = createRequire(path.join(COPIE, 'scripts/langages.mjs'));
    expect(() => deLaCopie.resolve('semver')).toThrow(/Cannot find module 'semver'/);
  });

  it.each(NOMS)('le module de langage %s se charge sans les dépendances du paquet', nom => {
    const { langage } = requis(path.join(COPIE, 'scripts/langages.mjs')) as Langages;
    expect(typeof langage(nom).estUnTest).toBe('function');
  });

  it('le verrou laisse passer l’écriture d’un test par le testwriter', () => {
    expect(verdict('packages/a/tests/unit/x.spec.ts')).toBeNull();
  });

  it('le verrou refuse au testwriter un fichier de code, avec son message', () => {
    expect(verdict('packages/a/src/x.ts')).toMatch(/seulement des fichiers de test/);
  });
});
