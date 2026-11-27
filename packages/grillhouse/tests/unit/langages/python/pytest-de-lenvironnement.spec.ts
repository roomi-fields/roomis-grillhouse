// The module python plays the pytest of the environment of the package, by its path
// (`.venv/<paquet>/bin/pytest`), never by its name alone: the scripts of an environment moved with
// its repository keep a shebang to the old folder, `uv sync --locked` leaves them as they are, and
// `uv run … pytest` then plays the `pytest` of the PATH without a word (measured with uv 0.10.4).
// A pytest absent or broken is red, its line naming the repair. Against the fake uv
// (./faux-uv.ts), which plays any call by the name alone, as that fallback does.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/python/index.mjs';
import { installerFauxUv } from './faux-uv.js';

const python = module as unknown as Langage;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'python-env-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const JOURNAL = path.join(ESSAIS, 'journal');
let FAUX: string;
beforeAll(() => {
  FAUX = installerFauxUv(ESSAIS);
});

const ecrire = (racine: string, f: string, texte: string, mode?: number) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte, { mode });
};

// A project of two packages of Python, one at the first level and one deeper, each with a test of
// the day and a night test; the group test of `site` holds pytest-xdist.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { site: 'python', 'outils/gen': 'python' });
  for (const [dossier, groupe] of [
    ['site', '"pytest>=8", "pytest-xdist"'],
    ['outils/gen', '"pytest>=8"'],
  ] as const) {
    ecrire(
      racine,
      `${dossier}/pyproject.toml`,
      `[project]\nname = "${path.basename(dossier)}"\nversion = "0.1.0"\nrequires-python = ">=3.12"\n\n[dependency-groups]\ntest = [${groupe}]\n`
    );
    ecrire(racine, `${dossier}/uv.lock`, 'version = 1\n');
    ecrire(racine, `${dossier}/tests/test_a.py`, 'def test_a():\n    assert True\n');
    ecrire(racine, `${dossier}/tests/a_nuit_test.py`, 'def test_n():\n    assert True\n');
  }
  return racine;
}

// The environment of `site` as its repository moved leaves it: its pytest there, the interpreter
// of its shebang gone.
function deplacer(racine: string) {
  ecrire(
    racine,
    '.venv/site/bin/pytest',
    `#!${path.join(racine, 'ancien-dossier/.venv/site/bin/python3')}\n`,
    0o755
  );
}

// The header uv writes for an interpreter whose path holds a space or is too long for a shebang
// (measured with uv 0.10.4): `/bin/sh`, which then `exec`s the interpreter named on the next line.
function enTeteSh(racine: string, interpreteur: string) {
  ecrire(
    racine,
    '.venv/site/bin/pytest',
    `#!/bin/sh\n'''exec' '${interpreteur}' "$0" "$@"\n' '''\n`,
    0o755
  );
}

function lancer(racine: string, nom: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  writeFileSync(JOURNAL, '');
  const c = python.commandes(racine)[nom]!;
  const r = spawnSync(process.execPath, [c.script, ...c.args, ...args], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${FAUX}${path.delimiter}${process.env.PATH ?? ''}`,
      GRILLHOUSE_RESULTATS: mkdtempSync(path.join(ESSAIS, 'resultats-')),
      GRILLHOUSE_TRAVAILLEURS: '',
      GRILLHOUSE_TESTS: '',
      FAUX_UV_JOURNAL: JOURNAL,
      ...env,
    },
  });
  const appels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as { args: string[]; cwd: string });
  return { code: r.status, stderr: r.stderr, sortie: r.stdout + r.stderr, appels };
}

const REPARATION = 'uv sync --locked --group test --reinstall';
const AVANT_LE_PROGRAMME = ['run', '--locked', '--group', 'test'];
const pytestDe = (racine: string, paquet: string) =>
  path.join(racine, '.venv', paquet, 'bin/pytest');

describe('les tests python jouent le pytest de l’environnement du paquet, par son chemin', () => {
  it('le paquet entier : uv run reçoit le chemin du pytest de .venv/<paquet>, sans autre exigence', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['site']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels.map(a => a.args.slice(0, 5))).toEqual([
      [...AVANT_LE_PROGRAMME, pytestDe(racine, 'site')],
    ]);
    expect(r.appels[0]!.args).not.toContain('--python');
    expect(r.sortie).not.toContain(REPARATION);
  });

  it('un paquet plus profond : le pytest de son propre environnement', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['outils/gen']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels[0]!.args[4]).toBe(pytestDe(racine, 'outils/gen'));
  });

  it('un chemin nommé : le même pytest, les options, le rapport JUnit et -n gardés', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-du-paquet', ['site/tests/test_a.py', '-x'], {
      GRILLHOUSE_TRAVAILLEURS: '3',
    });
    expect(r.code, r.stderr).toBe(0);
    const { args } = r.appels[0]!;
    expect(args[4]).toBe(pytestDe(racine, 'site'));
    expect(args).toContain('junit_family=xunit1');
    expect(args.some(a => a.startsWith('--junit-xml='))).toBe(true);
    expect(args[args.indexOf('-n') + 1]).toBe('3');
    expect(args.slice(-2)).toEqual(['tests/test_a.py', '-x']);
  });

  it('les tests de nuit : chaque paquet joue le pytest de son environnement', () => {
    const racine = projet();
    const r = lancer(racine, 'tests-de-nuit');
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels.map(a => [a.args[4], a.args.at(-1)]).sort()).toEqual([
      [pytestDe(racine, 'outils/gen'), 'tests/a_nuit_test.py'],
      [pytestDe(racine, 'site'), 'tests/a_nuit_test.py'],
    ]);
  });
});

describe('un pytest absent ou cassé de l’environnement est rouge, sa ligne nommant la réparation', () => {
  // No call plays the pytest of the PATH: none names pytest alone.
  const sansRepli = (r: ReturnType<typeof lancer>) =>
    expect(r.appels.filter(a => a.args.includes('pytest'))).toEqual([]);
  const ligne = (r: ReturnType<typeof lancer>) =>
    r.sortie.split('\n').find(l => l.includes(REPARATION));

  it('un environnement déplacé, paquet entier : rouge, sans repli sur le PATH, la réparation nommée', () => {
    const racine = projet();
    deplacer(racine);
    const r = lancer(racine, 'tests-du-paquet', ['site']);
    expect(r.code, r.sortie).toBe(1);
    sansRepli(r);
    expect(ligne(r), r.sortie).toMatch(/\bsite\b/);
  });

  it('un environnement déplacé, chemin nommé : rouge, la réparation nommée', () => {
    const racine = projet();
    deplacer(racine);
    const r = lancer(racine, 'tests-du-paquet', ['site/tests/test_a.py']);
    expect(r.code, r.sortie).toBe(1);
    sansRepli(r);
    expect(ligne(r), r.sortie).toBeDefined();
  });

  it('un environnement déplacé, la nuit : rouge, la réparation nommée', () => {
    const racine = projet();
    deplacer(racine);
    const r = lancer(racine, 'tests-de-nuit');
    expect(r.code, r.sortie).toBe(1);
    sansRepli(r);
    expect(ligne(r), r.sortie).toMatch(/\bsite\b/);
  });

  it('un environnement déplacé au lanceur à en-tête /bin/sh : rouge, la réparation nommée', () => {
    const racine = projet();
    enTeteSh(racine, path.join(racine, 'ancien dossier/.venv/site/bin/python3'));
    // The code of /bin/sh whose `exec` finds no interpreter.
    const r = lancer(racine, 'tests-du-paquet', ['site'], {
      FAUX_UV_CODES: JSON.stringify({ pytest: 127 }),
    });
    expect(r.code, r.sortie).toBe(1);
    sansRepli(r);
    expect(ligne(r), r.sortie).toMatch(/\bsite\b/);
  });

  it('un test rouge sous un en-tête /bin/sh à l’interpréteur présent ne demande aucune réparation', () => {
    const racine = projet();
    enTeteSh(racine, process.execPath);
    const r = lancer(racine, 'tests-du-paquet', ['site'], {
      FAUX_UV_CODES: JSON.stringify({ pytest: 1 }),
    });
    expect(r.code, r.sortie).toBe(1);
    expect(r.sortie).not.toContain(REPARATION);
  });

  it('un environnement sans pytest : rouge, sans repli sur le PATH, la réparation nommée', () => {
    const r = lancer(projet(), 'tests-du-paquet', ['outils/gen'], { FAUX_UV_SANS_PYTEST: '1' });
    expect(r.code, r.sortie).toBe(1);
    sansRepli(r);
    expect(ligne(r), r.sortie).toMatch(/outils\/gen|\bgen\b/);
  });

  it('un test rouge d’un environnement sain ne demande aucune réparation', () => {
    const r = lancer(projet(), 'tests-du-paquet', ['site'], {
      FAUX_UV_CODES: JSON.stringify({ pytest: 1 }),
    });
    expect(r.code, r.sortie).toBe(1);
    expect(r.sortie).not.toContain(REPARATION);
  });
});
