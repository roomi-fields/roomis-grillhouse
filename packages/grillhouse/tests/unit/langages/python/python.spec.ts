// grillhouse-ziy — the module python (decisions D2 to D5 of grillhouse-1zu): a package of Python
// declared in the architecture carries its pyproject.toml, its group `test` and its uv.lock; the
// testwriter writes its tests, its group `test` and its uv.lock; uv plays pytest, its JUnit report
// read by the verdict, compileall types, `uv sync --locked` prepares; the envelope opens what uv,
// pytest and Python write; a night test is `*_nuit_test.py`; the guards of the sizes and of the
// temporary directory hold in Python; the update installs uv at its exact version. Against the
// fake uv (./faux-uv.ts); the real one plays at night (python.nuit.test.ts).
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortiesDuLangage } from '../../../../scripts/enveloppe/enveloppe.mjs';
import type { Langage } from '../../../../scripts/jointure.js';
import { constats } from '../../../../scripts/langages-des-paquets.mjs';
import { LANGAGES, langageDe } from '../../../../scripts/langages.mjs';
import module from '../../../../scripts/langages/python/index.mjs';
import { installerFauxUv } from './faux-uv.js';

const python = module as unknown as Langage;
const MODULE = path.resolve(__dirname, '../../../../scripts/langages/python');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'python-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const JOURNAL = path.join(ESSAIS, 'journal');
let FAUX: string;
beforeAll(() => {
  FAUX = installerFauxUv(ESSAIS);
});

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

const PYPROJECT = `[project]
name = "generateur"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["mkdocs>=1.6"]

[dependency-groups]
test = ["pytest>=8"]
docs = ["mkdocs-material"]
`;

// A project whose package `site` is declared python, with its pyproject.toml, its uv.lock, a test
// of the day, a night test and a conftest.py.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { site: 'python' });
  ecrire(racine, 'site/pyproject.toml', PYPROJECT);
  ecrire(racine, 'site/uv.lock', 'version = 1\n');
  ecrire(racine, 'site/pages/generer.py', 'def generer():\n    return 1\n');
  ecrire(racine, 'site/pages/test_pages.py', 'def test_generer():\n    assert True\n');
  ecrire(racine, 'site/pages/site_nuit_test.py', 'def test_tout():\n    assert True\n');
  ecrire(racine, 'site/conftest.py', '');
  return racine;
}

// Runs the command <nom> of the module in <racine> with <args>, the fake uv first on the PATH:
// `{ code, stderr, appels, verdict }`, `appels` the calls of uv, each `{ args, cwd, pycache, venv,
// tmpdir }`.
function lancer(racine: string, nom: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  writeFileSync(JOURNAL, '');
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const c = python.commandes(racine)[nom];
  const r = spawnSync(process.execPath, [c.script, ...c.args, ...args], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${FAUX}${path.delimiter}${process.env.PATH ?? ''}`,
      GRILLHOUSE_RESULTATS: resultats,
      FAUX_UV_JOURNAL: JOURNAL,
      ...env,
    },
  });
  const appels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(
      l =>
        JSON.parse(l) as {
          args: string[];
          cwd: string;
          pycache: string | null;
          venv: string | null;
          tmpdir: string;
        }
    );
  return { code: r.status, stderr: r.stderr, appels, verdict: python.verdict(resultats) };
}

describe('grillhouse-ziy, critère 1 — un paquet python porte son pyproject.toml', () => {
  it('the frame’s list names python, its manifest a pyproject.toml', () => {
    expect(LANGAGES).toHaveProperty('python', './langages/python/index.mjs');
    expect(python.nom).toBe('python');
    expect(python.manifeste).toBe('pyproject.toml');
  });

  it('a folder with a pyproject.toml is a package, its name the folder’s, its package the [project]’s', () => {
    const racine = projet();
    expect(langageDe(racine).nom).toBe('python');
    expect(python.composants(racine)).toEqual([
      { dossier: path.join(racine, 'site'), nom: 'site', paquet: 'generateur' },
    ]);
    expect(python.composantDe(racine, 'site/pages/generer.py')?.nom).toBe('site');
    expect(python.composantDe(racine, 'docs/ARCHITECTURE.md')).toBeNull();
    expect(python.joueDesTests(racine, python.composants(racine)[0])).toBe(true);
  });

  it('the guard of the languages: declared python and with its pyproject.toml, no finding; without it, refused', () => {
    const racine = projet();
    declarerLesLangages(racine, { site: 'python', outil: 'python' });
    ecrire(racine, 'outil/pyproject.toml', '[project]\nname = "outil"\n');
    expect(constats(racine)).toEqual([]);
    rmSync(path.join(racine, 'site/pyproject.toml'));
    expect(constats(racine).map(c => c.message)).toEqual([
      'site : déclaré python (docs/ARCHITECTURE.md:5), sans son pyproject.toml.',
    ]);
  });

  it('a pyproject.toml the architecture does not declare is refused, named', () => {
    const racine = projet();
    ecrire(racine, 'autre/pyproject.toml', '[project]\nname = "autre"\n');
    expect(
      constats(racine)
        .map(c => c.message)
        .join('\n')
    ).toMatch(
      /autre : paquet python \(son pyproject\.toml\) que docs\/ARCHITECTURE\.md ne déclare pas/
    );
  });
});

describe('grillhouse-ziy, critère 2 — ce que le testwriter écrit', () => {
  it('test_*.py and *_test.py are played; conftest.py and the files of tests/ are his; the code is not', () => {
    const racine = projet();
    const joue = { joue: true, test: true, matiere: false };
    const aide = { joue: false, test: true, matiere: false };
    expect(python.estUnTest('site/pages/test_pages.py', racine)).toEqual(joue);
    expect(python.estUnTest('site/pages/rendu_test.py', racine)).toEqual(joue);
    expect(python.estUnTest('site/pages/site_nuit_test.py', racine)).toEqual(joue);
    expect(python.estUnTest('site/conftest.py', racine)).toEqual(aide);
    expect(python.estUnTest('site/tests/donnees/devices.json', racine)).toEqual(aide);
    expect(python.estUnTest('site/pages/generer.py', racine)).toBeNull();
    expect(python.estUnTest('site/pyproject.toml', racine)).toBeNull();
    // A manifest is never a test file, under tests/ neither: it would make a package of its own.
    expect(python.estUnTest('site/tests/autre/pyproject.toml', racine)).toBeNull();
    expect(python.estUnTest('site/tests/autre/uv.lock', racine)).toBeNull();
    expect(python.estUnTest('docs/ARCHITECTURE.md', racine)).toBeNull();
  });

  it('of the pyproject.toml, the group test alone; uv.lock is his; any other part is named', () => {
    const racine = projet();
    const hors = (f: string, apres: string) =>
      python.manifestes.horsDesTests(f, racine, readFileSync(path.join(racine, f), 'utf8'), apres);
    expect(python.manifestes.verrous).toEqual(['uv.lock']);
    expect(
      hors('site/pyproject.toml', PYPROJECT.replace('"pytest>=8"', '"pytest>=8", "pyyaml"'))
    ).toEqual([]);
    expect(
      hors('site/pyproject.toml', PYPROJECT.replace('"mkdocs>=1.6"', '"mkdocs>=1.6", "jinja2"'))
    ).toEqual(['[project]']);
    expect(
      hors('site/pyproject.toml', PYPROJECT.replace('"mkdocs-material"', '"mkdocs-material", "x"'))
    ).toEqual(['[dependency-groups].docs']);
    expect(hors('site/uv.lock', 'version = 1\nrevision = 2\n')).toEqual([]);
    expect(hors('site/pages/generer.py', 'x = 1\n')).toBeNull();
  });
});

describe('grillhouse-ziy, critère 3 — les commandes par uv', () => {
  it('each command is its script of the module and its name; each guard its own', () => {
    const c = python.commandes(ESSAIS);
    for (const nom of ['tester', 'verifier', 'typer', 'preparer', 'tests-de-nuit']) {
      expect(c[nom]).toEqual({ script: path.join(MODULE, 'commandes.mjs'), args: [nom] });
    }
    const script = path.join(MODULE, 'tailles-des-tests.mjs');
    expect(c['tailles-des-tests']).toEqual({ script, args: [] });
    const index = path.join(MODULE, 'index-interfaces.mjs');
    expect(c['index-interfaces']).toEqual({ script: index, args: [] });
    expect(python.gardes(ESSAIS)).toEqual([[script], [index, '--verifier']]);
  });

  it('tester: uv run --locked --group test pytest in the package, its JUnit report read by the verdict', () => {
    const racine = projet();
    const r = lancer(racine, 'tester');
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels).toHaveLength(1);
    const [appel] = r.appels;
    expect(appel.cwd).toBe(path.join(racine, 'site'));
    expect(appel.args.slice(0, 5)).toEqual(['run', '--locked', '--group', 'test', 'pytest']);
    expect(appel.args).toContain('junit_family=xunit1');
    expect(r.verdict.taches.map(t => [t.tache, t.tests, t.code])).toEqual([
      ['site#pytest', true, 0],
    ]);
    expect(r.verdict.rapports).toEqual([
      {
        fichier: path.join(racine, 'site/pages/test_pages.py'),
        etat: 'passed',
        message: '',
        tests: [{ titre: 'essai', nom: 'essai', etat: 'passed', message: '' }],
      },
    ]);
  });

  it('a red test: the code 1, the failure read', () => {
    const r = lancer(projet(), 'tester', [], { FAUX_UV_CODES: JSON.stringify({ pytest: 1 }) });
    expect(r.code).toBe(1);
    expect(r.verdict.rapports[0].etat).toBe('failed');
    expect(r.verdict.rapports[0].tests[0].message).toBe('rouge & faux');
  });

  it('a path chooses its package and plays alone; a path out of every package is refused', () => {
    const racine = projet();
    const r = lancer(racine, 'tester', ['site/pages/test_pages.py']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels[0].args.at(-1)).toBe('pages/test_pages.py');
    const refus = lancer(racine, 'tester', ['docs/ARCHITECTURE.md']);
    expect(refus.code).toBe(2);
    expect(refus.stderr).toMatch(/docs\/ARCHITECTURE\.md : hors de tout paquet Python/);
    expect(refus.appels).toEqual([]);
  });

  it('typer: python -m compileall in the package; preparer: uv sync --locked', () => {
    const racine = projet();
    const t = lancer(racine, 'typer');
    expect(t.code, t.stderr).toBe(0);
    expect(t.appels.map(a => a.args.slice(0, 5))).toEqual([
      ['run', '--locked', 'python', '-m', 'compileall'],
    ]);
    const p = lancer(racine, 'preparer');
    expect(p.code, p.stderr).toBe(0);
    expect(p.appels.map(a => [a.args, a.cwd])).toEqual([
      [['sync', '--locked', '--group', 'test'], path.join(racine, 'site')],
    ]);
  });
});

describe('grillhouse-ziy, critère 4 — l’enveloppe', () => {
  it('.venv, .pytest_cache and uv’s cache written, a __pycache__ proper to the session, uv’s Pythons read', () => {
    expect(python.sorties).toEqual({
      ecrites: ['.venv/', '.pytest_cache/', '~/.cache/uv/'],
      propres: ['__pycache__'],
      lues: ['~/.local/share/uv/python/'],
    });
    const s = sortiesDuLangage(python.sorties, { maison: '/home/x', principal: '/depot' });
    expect(s.magasins).toEqual(['/home/x/.cache/uv']);
    expect(s.lectures).toEqual(['/home/x/.local/share/uv/python']);
    expect(s.sorties).toEqual({ ecrites: ['.venv', '.pytest_cache'], propres: ['__pycache__'] });
    expect(python.ignorer).toEqual(['.venv', '.pytest_cache', '__pycache__']);
  });

  it('Python writes its bytecode under the __pycache__ of the root', () => {
    const racine = projet();
    const r = lancer(racine, 'tester');
    expect(r.appels[0].pycache).toBe(path.join(racine, '__pycache__'));
  });

  it('uv writes the environment of each package, pytest its cache, under .venv and .pytest_cache of the root', () => {
    const racine = projet();
    const r = lancer(racine, 'tester');
    expect(r.appels[0].venv).toBe(path.join(racine, '.venv', 'site'));
    expect(r.appels[0].args).toContain(`cache_dir=${path.join(racine, '.pytest_cache', 'site')}`);
    const p = lancer(racine, 'preparer');
    expect(p.appels[0].venv).toBe(path.join(racine, '.venv', 'site'));
  });

  it('pytest run directly is refused to a role that writes', () => {
    expect(python.droits).toEqual(
      expect.arrayContaining(['Bash(pytest*)', 'Bash(uv run*pytest*)'])
    );
  });
});

describe('grillhouse-ziy, critère 5 — les tailles et le dossier temporaire', () => {
  it('the day leaves *_nuit_test.py out; tests-de-nuit plays it; named, it plays', () => {
    const racine = projet();
    const jour = lancer(racine, 'tester');
    expect(jour.appels[0].args).toContain('--ignore-glob=*_nuit_test.py');
    expect(jour.verdict.rapports.map(x => path.basename(x.fichier))).toEqual(['test_pages.py']);
    const nuit = lancer(racine, 'tests-de-nuit');
    expect(nuit.code, nuit.stderr).toBe(0);
    expect(nuit.appels[0].args.at(-1)).toBe('pages/site_nuit_test.py');
    expect(nuit.verdict.rapports.map(x => path.basename(x.fichier))).toEqual(['site_nuit_test.py']);
    const nomme = lancer(racine, 'tester', ['site/pages/site_nuit_test.py']);
    expect(nomme.appels[0].args).not.toContain('--ignore-glob=*_nuit_test.py');
  });

  it('the guard of the sizes refuses a large test of the day, never a night one', () => {
    const racine = projet();
    // The command of git that mounts a trial repository, assembled, so that this file is no large
    // test for the module typescript's own guard.
    const INIT = ['in', 'it'].join('');
    const grand = [
      'import subprocess',
      'from tempfile import TemporaryDirectory',
      '',
      'def test_bout():',
      '    with TemporaryDirectory() as d:',
      `        subprocess.run(['git', '${INIT}', d], check=True)`,
      "        subprocess.run(['python', '-m', 'generateur', d], check=True)",
      '',
    ].join('\n');
    ecrire(racine, 'site/pages/bout_test.py', grand);
    ecrire(racine, 'site/pages/bout_nuit_test.py', grand);
    ecrire(racine, 'site/pages/moyen_test.py', "import subprocess\nsubprocess.run(['ls'])\n");
    const script = python.commandes(racine)['tailles-des-tests'].script;
    const r = spawnSync(process.execPath, [script], { cwd: racine, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/site\/pages\/bout_test\.py : un grand test/);
    expect(r.stderr).not.toMatch(/bout_nuit_test\.py : un grand test/);
    expect(r.stderr).toMatch(
      /5 fichier\(s\) de tests, 2 petit\(s\), 1 moyen\(s\), 2 grand\(s\) ; 2 de nuit/
    );
  });

  it('a test that leaves a file in its temporary directory fails the pass, named', () => {
    const racine = projet();
    const r = lancer(racine, 'tester', [], { FAUX_UV_RESTE: 'oublie.txt' });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/oublie\.txt/);
    expect(r.appels[0].tmpdir).toMatch(/grillhouse-tests-/);
  });
});

describe('grillhouse-ziy, critère 6 — maj installe uv à sa version exacte', () => {
  const binaires = path.join(MODULE, 'binaires.mjs');
  const jouer = (args: string[], env: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [binaires, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${FAUX}${path.delimiter}${process.env.PATH ?? ''}`, ...env },
    });

  it('uv at an exact version, listed by uv --version, installed by Astral’s installer', () => {
    expect(Object.keys(python.binaires)).toEqual(['uv']);
    expect(python.binaires.uv).toMatch(/^\d+\.\d+\.\d+$/);
    const i = python.miseAJour.installation;
    expect(i?.liste).toEqual({ script: binaires, args: ['liste'] });
    expect(i?.installer('uv', '0.10.4')).toEqual({
      script: binaires,
      args: ['installer', 'uv@0.10.4'],
    });
    expect(JSON.parse(jouer(['liste'], { FAUX_UV_VERSION: '0.9.1' }).stdout)).toEqual({
      uv: '0.9.1',
    });
    expect(JSON.parse(jouer(['liste'], { FAUX_UV_ABSENT: '1' }).stdout)).toEqual({});
  });

  it('the installer leaves the profiles of the shell as they are (UV_NO_MODIFY_PATH)', () => {
    // A stand-in for sh, first on the PATH, which writes its arguments and the variable.
    const dossier = mkdtempSync(path.join(ESSAIS, 'faux-sh-'));
    const journal = path.join(dossier, 'journal');
    writeFileSync(
      path.join(dossier, 'sh'),
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(journal)}, JSON.stringify({ args: process.argv.slice(2), modifier: process.env.UV_NO_MODIFY_PATH ?? null }));\n`
    );
    chmodSync(path.join(dossier, 'sh'), 0o755);
    const r = spawnSync(process.execPath, [binaires, 'installer', 'uv@0.10.4'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dossier}${path.delimiter}${process.env.PATH ?? ''}` },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(readFileSync(journal, 'utf8'))).toEqual({
      args: ['-c', 'curl -LsSf https://astral.sh/uv/0.10.4/install.sh | sh'],
      modifier: '1',
    });
  });

  it('the template gives the test scripts a project lacks', () => {
    const p: { scripts?: Record<string, string> } = { scripts: { test: 'le mien' } };
    const modele = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../../../../../templates/python/package.json'),
        'utf8'
      )
    ) as Record<string, unknown>;
    const part = python.miseAJour.appliquer(ESSAIS, { p, modele, source: '', version: '0' });
    expect(p.scripts).toEqual({
      test: 'le mien',
      'test:forcer': 'grillhouse tests --force',
      verifier: 'grillhouse verifier',
    });
    expect(part.bilan).toEqual({ scripts: ['test:forcer', 'verifier'] });
    expect(python.miseAJour.gabarit).toBe('templates/python');
  });
});
