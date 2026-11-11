// L'environnement uv de l'arbre d'avant du module python : l'arbre réutilise l'environnement de la
// copie (`GRILLHOUSE_VENV_DE_LA_COPIE`, `<copie>/.venv`), jamais un neuf recréé par fichier. Joué
// contre le faux uv (./faux-uv.ts) ; le vrai uv joue l'import dans ./environnement-de-l-arbre-uv.spec.ts.
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
const VARIABLE = 'GRILLHOUSE_VENV_DE_LA_COPIE';
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'python-env-arbre-'));
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

// Un projet de deux paquets python, `site` et `packages/profond`, chacun avec deux fichiers de test.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { site: 'python', 'packages/profond': 'python' });
  for (const d of ['site', 'packages/profond']) {
    ecrire(
      racine,
      `${d}/pyproject.toml`,
      `[project]\nname = "${path.basename(d)}"\nversion = "0.1.0"\n\n[dependency-groups]\ntest = ["pytest>=8"]\n`
    );
    ecrire(racine, `${d}/uv.lock`, 'version = 1\n');
    ecrire(racine, `${d}/test_a.py`, 'def test_a():\n    assert True\n');
    ecrire(racine, `${d}/test_b.py`, 'def test_b():\n    assert True\n');
  }
  ecrire(racine, 'docs/notes_test.py', 'def test_x():\n    assert True\n');
  return racine;
}

// La valeur d'UV_PROJECT_ENVIRONMENT que uv reçoit du paquet <dossier>, la passe jouée sous <env>.
function venvRecu(racine: string, dossier: string, env: Record<string, string> = {}) {
  writeFileSync(JOURNAL, '');
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const c = python.commandes(racine)['tests-du-paquet']!;
  const hote: NodeJS.ProcessEnv = { ...process.env };
  delete hote[VARIABLE];
  delete hote.UV_PROJECT_ENVIRONMENT;
  const r = spawnSync(process.execPath, [c.script, ...c.args, dossier], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...hote,
      PATH: `${FAUX}${path.delimiter}${process.env.PATH ?? ''}`,
      GRILLHOUSE_RESULTATS: resultats,
      FAUX_UV_JOURNAL: JOURNAL,
      ...env,
    },
  });
  expect(r.status, r.stderr).toBe(0);
  const appels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as { venv: string | null });
  return appels.map(a => a.venv);
}

describe('envDArbre du module python', () => {
  it("donne à deux fichiers d'un même paquet le dossier des environnements de la copie, sous la variable de la copie", () => {
    const racine = projet();
    const a = python.envDArbre('site/test_a.py', racine);
    const b = python.envDArbre('site/test_b.py', racine);
    expect(a).toEqual({ [VARIABLE]: path.join(racine, '.venv') });
    expect(b).toEqual(a);
  });

  it('donne la même valeur aux fichiers de paquets différents, et jamais un chemin sous le dossier de travail de la copie', () => {
    const racine = projet();
    const profond = python.envDArbre('packages/profond/test_a.py', racine);
    expect(profond).toEqual(python.envDArbre('site/test_a.py', racine));
    expect(Object.values(profond).join(' ')).not.toContain('.travail');
    expect(Object.values(profond).join(' ')).not.toContain('avant-');
  });

  it("ne donne pas UV_PROJECT_ENVIRONMENT à l'arbre : la passe de l'arbre le calcule", () => {
    const racine = projet();
    expect(python.envDArbre('site/test_a.py', racine)).not.toHaveProperty('UV_PROJECT_ENVIRONMENT');
  });

  it('donne un environnement vide à un fichier hors de tout paquet python', () => {
    const racine = projet();
    expect(python.envDArbre('docs/notes_test.py', racine)).toEqual({});
  });
});

describe("la passe de tests du module python et l'environnement de la copie", () => {
  it("donne à uv <valeur>/<dossier> quand la copie nomme son dossier d'environnements", () => {
    const racine = projet();
    const copie = path.join(ESSAIS, 'copie', '.venv');
    expect(venvRecu(racine, 'site', { [VARIABLE]: copie })).toEqual([path.join(copie, 'site')]);
  });

  it('garde le dossier du paquet depuis la racine de la passe, sur plusieurs niveaux', () => {
    const racine = projet();
    const copie = path.join(ESSAIS, 'copie', '.venv');
    expect(venvRecu(racine, 'packages/profond', { [VARIABLE]: copie })).toEqual([
      path.join(copie, 'packages', 'profond'),
    ]);
  });

  it('donne à uv <racine de la passe>/.venv/<dossier> sans la variable de la copie', () => {
    const racine = projet();
    expect(venvRecu(racine, 'site')).toEqual([path.join(racine, '.venv', 'site')]);
    expect(venvRecu(racine, 'packages/profond')).toEqual([
      path.join(racine, '.venv', 'packages', 'profond'),
    ]);
  });

  it("écrase un UV_PROJECT_ENVIRONMENT de l'appelant, avec ou sans la variable de la copie", () => {
    const racine = projet();
    const copie = path.join(ESSAIS, 'copie', '.venv');
    const autre = { UV_PROJECT_ENVIRONMENT: path.join(ESSAIS, 'ailleurs') };
    expect(venvRecu(racine, 'site', { ...autre, [VARIABLE]: copie })).toEqual([
      path.join(copie, 'site'),
    ]);
    expect(venvRecu(racine, 'site', autre)).toEqual([path.join(racine, '.venv', 'site')]);
  });
});
