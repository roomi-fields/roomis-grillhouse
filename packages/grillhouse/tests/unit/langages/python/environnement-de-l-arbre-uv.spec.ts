// L'arbre d'avant du module python contre le vrai uv : sur l'environnement de la copie, `uv run
// --locked` remet l'environnement d'accord avec l'arbre, de sorte que le test de HEAD importe le
// code de l'arbre, jamais celui de la copie ; la copie rejouée retrouve le sien. Le paquet est
// bâti par un backend local (`backend.py`), qui n'a besoin d'aucun réseau.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/python/index.mjs';

const python = module as unknown as Langage;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'python-arbre-uv-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// Un backend de construction local : un wheel (ou un wheel éditable) du module `essai`.
const BACKEND = `import base64
import hashlib
import os
import zipfile

NOM = "essai"
VERSION = "0.1.0"
DIST = NOM + "-" + VERSION
ICI = os.path.dirname(os.path.abspath(__file__))


def _roue(dossier, fichiers):
    nom = DIST + "-py3-none-any.whl"
    fichiers = dict(fichiers)
    fichiers[DIST + ".dist-info/METADATA"] = "Metadata-Version: 2.1\\nName: " + NOM + "\\nVersion: " + VERSION + "\\n"
    fichiers[DIST + ".dist-info/WHEEL"] = "Wheel-Version: 1.0\\nGenerator: backend\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n"
    lignes = []
    with zipfile.ZipFile(os.path.join(dossier, nom), "w") as z:
        for chemin, texte in fichiers.items():
            octets = texte.encode()
            z.writestr(chemin, octets)
            h = base64.urlsafe_b64encode(hashlib.sha256(octets).digest()).rstrip(b"=").decode()
            lignes.append(chemin + ",sha256=" + h + "," + str(len(octets)))
        lignes.append(DIST + ".dist-info/RECORD,,")
        z.writestr(DIST + ".dist-info/RECORD", "\\n".join(lignes) + "\\n")
    return nom


def get_requires_for_build_wheel(config_settings=None):
    return []


def get_requires_for_build_editable(config_settings=None):
    return []


def build_wheel(wheel_directory, config_settings=None, metadata_directory=None):
    with open(os.path.join(ICI, "essai.py")) as f:
        return _roue(wheel_directory, {"essai.py": f.read()})


def build_editable(wheel_directory, config_settings=None, metadata_directory=None):
    return _roue(wheel_directory, {"__editable__." + NOM + ".pth": ICI + "\\n"})
`;

// Un paquet \`site\` dans <racine>, dont le module \`essai\` dit son <origine>, verrouillé.
function paquet(racine: string, origine: string) {
  ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { site: 'python' });
  ecrire(
    racine,
    'site/pyproject.toml',
    '[project]\nname = "essai"\nversion = "0.1.0"\nrequires-python = ">=3.10"\ndependencies = []\n\n' +
      '[build-system]\nrequires = []\nbuild-backend = "backend"\nbackend-path = ["."]\n'
  );
  ecrire(racine, 'site/backend.py', BACKEND);
  ecrire(racine, 'site/essai.py', `ORIGINE = ${JSON.stringify(origine)}\n`);
  ecrire(racine, 'site/test_origine.py', 'def test_origine():\n    assert True\n');
  const lock = uv(racine, ['lock'], {});
  expect(lock.status, lock.stderr).toBe(0);
}

// Joue uv dans le paquet \`site\` de <racine>, sous <env> (celui de l'arbre d'avant).
function uv(racine: string, args: string[], env: Record<string, string>) {
  const hote: NodeJS.ProcessEnv = { ...process.env };
  delete hote.UV_PROJECT_ENVIRONMENT;
  return spawnSync('uv', args, {
    cwd: path.join(racine, 'site'),
    encoding: 'utf8',
    env: { ...hote, TMPDIR: ESSAIS, UV_PYTHON_DOWNLOADS: 'never', ...env },
  });
}

const origine = (racine: string, env: Record<string, string>) => {
  const r = uv(
    racine,
    ['run', '--locked', 'python', '-c', 'import essai; print(essai.ORIGINE)'],
    env
  );
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
};

describe("l'arbre d'avant du module python sur l'environnement de la copie", () => {
  it("importe le module de l'arbre, puis la copie rejouée retrouve le sien", () => {
    const copie = path.join(ESSAIS, 'copie');
    const arbre = path.join(ESSAIS, 'copie.travail', 'avant-test_origine');
    paquet(copie, 'copie');
    paquet(arbre, 'arbre');
    // L'environnement de la copie, tel que sa passe le donne à uv, et celui de l'arbre, tel que
    // `envDArbre` le nomme pour la passe de l'arbre.
    const venvDeLaCopie = path.join(copie, '.venv', 'site');
    const envCopie = { UV_PROJECT_ENVIRONMENT: venvDeLaCopie };
    const dArbre = python.envDArbre('site/test_origine.py', copie);
    expect(dArbre.GRILLHOUSE_VENV_DE_LA_COPIE).toBe(path.join(copie, '.venv'));
    const envArbre = {
      UV_PROJECT_ENVIRONMENT: path.join(dArbre.GRILLHOUSE_VENV_DE_LA_COPIE!, 'site'),
    };
    expect(envArbre.UV_PROJECT_ENVIRONMENT).toBe(venvDeLaCopie);

    expect(origine(copie, envCopie)).toBe('copie');
    expect(origine(arbre, envArbre)).toBe('arbre');
    expect(origine(copie, envCopie)).toBe('copie');
  });
});
