// grillhouse-ziy, criterion 7 — the module python against the real uv, at night: a package of
// Python with its group `test` and its uv.lock plays pytest by `uv run --locked`, its JUnit report
// read by the verdict, the night test left to `tests-de-nuit`; `uv sync --locked` prepares and
// compileall types. uv locks the versions from its
// index, which the night reaches.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/python/index.mjs';

const python = module as unknown as Langage;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'python-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

describe('grillhouse-ziy, critère 7 — le vrai uv', () => {
  it('uv run --locked plays pytest, the verdict reads its report; the night test plays at night', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    ecrire(
      racine,
      'site/pyproject.toml',
      '[project]\nname = "site"\nversion = "0.1.0"\nrequires-python = ">=3.10"\ndependencies = []\n\n[dependency-groups]\ntest = ["pytest>=8"]\n'
    );
    ecrire(racine, 'site/test_vert.py', 'def test_vert():\n    assert 1 + 1 == 2\n');
    ecrire(racine, 'site/tout_nuit_test.py', 'def test_tout():\n    assert True\n');
    // uv takes its lock files in its temporary directory: the trial's, removed with it.
    const lock = spawnSync('uv', ['lock'], {
      cwd: path.join(racine, 'site'),
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: ESSAIS },
    });
    expect(lock.status, lock.stderr).toBe(0);
    const jouer = (nom: string) => {
      const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
      const c = python.commandes(racine)[nom];
      const r = spawnSync(process.execPath, [c.script, ...c.args], {
        cwd: racine,
        encoding: 'utf8',
        env: { ...process.env, GRILLHOUSE_RESULTATS: resultats },
      });
      return { r, verdict: python.verdict(resultats) };
    };
    const jour = jouer('tester');
    expect(jour.r.status, jour.r.stderr).toBe(0);
    expect(jour.verdict.rapports.map(x => [path.basename(x.fichier), x.etat])).toEqual([
      ['test_vert.py', 'passed'],
    ]);
    // uv's environment and pytest's cache lie under the root, where the envelope opens them.
    expect(existsSync(path.join(racine, '.venv/site'))).toBe(true);
    expect(existsSync(path.join(racine, '.pytest_cache/site'))).toBe(true);
    expect(existsSync(path.join(racine, 'site/.venv'))).toBe(false);
    expect(existsSync(path.join(racine, 'site/.pytest_cache'))).toBe(false);
    for (const nom of ['preparer', 'typer']) {
      const r = jouer(nom);
      expect(r.r.status, `${nom}\n${r.r.stderr}`).toBe(0);
    }
    const nuit = jouer('tests-de-nuit');
    expect(nuit.r.status, nuit.r.stderr).toBe(0);
    expect(nuit.verdict.rapports.map(x => path.basename(x.fichier))).toEqual(['tout_nuit_test.py']);
  }, 300_000);
});
