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
import { ecrireLePaquet, planDuPaquet } from '../../../../scripts/paquet.mjs';

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
      // grillhouse-44b.5 : `tester` lance les tâches de Turborepo ; le corps de la tâche d'un
      // projet est `tests-du-paquet`.
      const corps = nom === 'tester';
      const c = python.commandes(racine)[corps ? 'tests-du-paquet' : nom];
      const r = spawnSync(process.execPath, [c.script, ...c.args, ...(corps ? ['site'] : [])], {
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
    for (const nom of ['typer']) {
      const r = jouer(nom);
      expect(r.r.status, `${nom}\n${r.r.stderr}`).toBe(0);
    }
    const nuit = jouer('tests-de-nuit');
    expect(nuit.r.status, nuit.r.stderr).toBe(0);
    expect(nuit.verdict.rapports.map(x => path.basename(x.fichier))).toEqual(['tout_nuit_test.py']);
  }, 300_000);
});

// grillhouse-0cy, criterion 1 — a folder of Python already there, SyntHub's site/: born by the
// plan of `grillhouse paquet`, its commands of the lock run by the real uv, pytest collects its
// tests where they are and they import the dependencies its requirements.txt declares.
describe('grillhouse-0cy, critère 1 — un dossier Python existant, par le vrai uv', () => {
  it('its tests in pages/ play, markdown installed from pages/requirements.txt', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'existant-'));
    ecrire(
      racine,
      'docs/ARCHITECTURE.md',
      '| Composant | Rôle | Langage |\n| --- | --- | --- |\n| `site` | les pages | python |\n'
    );
    ecrire(racine, 'package.json', JSON.stringify({ name: 'synthhub' }));
    ecrire(racine, 'site/pages/requirements.txt', 'markdown>=3\n');
    ecrire(
      racine,
      'site/pages/rendu.py',
      'import markdown\n\ndef rendre(t):\n    return markdown.markdown(t)\n'
    );
    ecrire(
      racine,
      'site/pages/test_pages.py',
      'from rendu import rendre\n\ndef test_rendu():\n    assert rendre("*a*") == "<p><em>a</em></p>"\n'
    );
    const plan = planDuPaquet(racine, 'site');
    ecrireLePaquet(racine, plan);
    for (const v of plan.verrouiller) {
      const r = spawnSync(v.commande, v.args, {
        cwd: path.join(racine, v.dossier),
        encoding: 'utf8',
        env: { ...process.env, TMPDIR: ESSAIS },
      });
      expect(r.status, `${v.commande} ${v.args.join(' ')}\n${r.stderr}`).toBe(0);
    }
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    const c = python.commandes(racine)['tests-du-paquet'];
    const r = spawnSync(process.execPath, [c.script, ...c.args, 'site'], {
      cwd: racine,
      encoding: 'utf8',
      env: { ...process.env, GRILLHOUSE_RESULTATS: resultats },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(python.verdict(resultats).rapports.map(x => [path.basename(x.fichier), x.etat])).toEqual(
      [['test_pages.py', 'passed']]
    );
  }, 300_000);
});
