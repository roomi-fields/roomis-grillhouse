// grillhouse-44b.4, décision 1 du responsable (option B) — le module python publie des commandes
// par paquet, que les scripts build et typecheck du package.json d'un projet Python appellent :
// `construire <chemin>` (`uv sync --locked --group test` dans le seul projet : il prouve que son
// verrou se résout) et `typer <chemin>` (`compileall` du seul projet). `typer` sans chemin reste
// le contrôle de tous les projets. Joué contre le faux uv (./faux-uv.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/python/index.mjs';
import { commandeDe } from '../../../../scripts/sous-commandes.mjs';
import { installerFauxUv } from './faux-uv.js';

const python = module as unknown as Langage;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'python-par-paquet-'));
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

// Deux projets Python, `site` et `autre`, chacun avec son verrou et un test.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { site: 'python', autre: 'python' });
  for (const p of ['site', 'autre']) {
    ecrire(
      racine,
      `${p}/pyproject.toml`,
      `[project]\nname = "${p}"\nversion = "0.1.0"\n\n[dependency-groups]\ntest = ["pytest>=8"]\n`
    );
    ecrire(racine, `${p}/uv.lock`, 'version = 1\n');
    ecrire(racine, `${p}/test_${p}.py`, 'def test_x():\n    assert True\n');
  }
  return racine;
}

function lancer(racine: string, nom: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  writeFileSync(JOURNAL, '');
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const c = python.commandes(racine)[nom]!;
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
    .map(l => JSON.parse(l) as { args: string[]; cwd: string });
  return { code: r.status, stderr: r.stderr, appels };
}

describe('grillhouse-44b.4, décision 1 — les commandes par paquet du module python', () => {
  it('construire est une commande décrite du module, comme typer, et le cadre la sert par son nom', () => {
    const racine = projet();
    const c = python.commandes(racine);
    expect(c.construire).toEqual({ script: c.typer.script, args: ['construire'] });
    expect(commandeDe('construire', racine)).toEqual(c.construire);
    expect(commandeDe('typer', racine)).toEqual(c.typer);
  });

  it('construire <chemin> : uv sync --locked --group test dans ce projet seul', () => {
    const racine = projet();
    const r = lancer(racine, 'construire', ['autre']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels.map(a => [a.args, a.cwd])).toEqual([
      [['sync', '--locked', '--group', 'test'], path.join(racine, 'autre')],
    ]);
  });

  it('typer <chemin> : compileall de ce projet seul ; sans chemin, de tous', () => {
    const racine = projet();
    const un = lancer(racine, 'typer', ['site']);
    expect(un.code, un.stderr).toBe(0);
    expect(un.appels).toHaveLength(1);
    expect(un.appels[0]!.args.slice(0, 5)).toEqual([
      'run',
      '--locked',
      'python',
      '-m',
      'compileall',
    ]);
    expect(un.appels[0]!.cwd).toBe(path.join(racine, 'site'));
    expect(lancer(racine, 'typer', []).appels).toHaveLength(2);
  });

  it('un chemin qui n’est pas un projet est refusé par son nom, uv jamais lancé', () => {
    const racine = projet();
    for (const nom of ['construire', 'typer']) {
      const r = lancer(racine, nom, ['inconnu']);
      expect(r.code, nom).toBe(2);
      expect(r.stderr, nom).toMatch(/inconnu/);
      expect(r.appels, nom).toEqual([]);
    }
  });

  it('un projet dont uv échoue rend le code rouge', () => {
    const racine = projet();
    const r = lancer(racine, 'construire', ['site'], {
      FAUX_UV_CODES: JSON.stringify({ sync: 1 }),
    });
    expect(r.code).not.toBe(0);
  });
});
