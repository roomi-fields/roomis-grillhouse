// The skeleton of a new package of the module python, the demand `squelette` of the join
// (scripts/jointure.d.ts), which `grillhouse paquet` writes (scripts/paquet.mjs), as `uv init`
// writes one: no behaviour, no test.
//
// - Its files: its pyproject.toml (PEP 621: its name, the folder's, its version 0.1.0, the Python
//   it requires, no dependency; its group `test` of `[dependency-groups]`, PEP 735, pytest, which
//   the module runs by `uv run --group test pytest`; the configuration of pytest,
//   `[tool.pytest.ini_options]`, its tests under `tests/` and its code importable from `src/`, as
//   uv's layout of a library has it); `src/<module>/__init__.py`, the module named after the
//   package (`-` read `_`), without code; `tests/.gitkeep`, its folder of tests. The typing is
//   `python -m compileall`, which needs no configuration. No build system: uv neither builds nor
//   installs the package to run its tests.
// - The workspace: a root pyproject.toml whose `[tool.uv.workspace]` names its `members` receives
//   the package's path there, as `uv init` adds a project under a workspace to its members; without
//   one, the package is its own project of uv, as the module plays each package (./commandes.mjs).
// - The lock of the versions: `uv lock`, at the workspace's root, else in the package.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** @type {import('../../jointure.js').Langage['squelette']} */
export function squelette(racine, { chemin }) {
  const nom = path.posix.basename(chemin);
  const module = nom.replace(/-/g, '_');
  const manifeste = [
    '[project]',
    `name = ${JSON.stringify(nom)}`,
    'version = "0.1.0"',
    'requires-python = ">=3.12"',
    'dependencies = []',
    '',
    '[dependency-groups]',
    'test = ["pytest>=8"]',
    '',
    '[tool.pytest.ini_options]',
    'testpaths = ["tests"]',
    'pythonpath = ["src"]',
    '',
  ].join('\n');
  const fichiers = {
    [`${chemin}/pyproject.toml`]: manifeste,
    [`${chemin}/src/${module}/__init__.py`]: `"""The package ${nom}: its interface, docs/INTERFACE.md, says what it offers."""\n`,
    [`${chemin}/tests/.gitkeep`]: '',
  };
  const f = path.join(racine, 'pyproject.toml');
  const texte = existsSync(f) ? readFileSync(f, 'utf8') : null;
  const espace =
    texte === null ? null : (require('smol-toml').parse(texte).tool?.uv?.workspace ?? null);
  const membres = Array.isArray(espace?.members) ? espace.members : null;
  let entree = null;
  if (membres && !membres.some(m => typeof m === 'string' && path.matchesGlob(chemin, m))) {
    const m = /^(\s*members\s*=\s*\[)([\s\S]*?)(\])/m.exec(
      texte.slice(texte.search(/^\s*\[tool\.uv\.workspace\]/m))
    );
    const corps = m[2].replace(/\s*$/, '').replace(/,$/, '');
    const ajout = `${m[1]}${corps.trim() ? `${corps}, ` : ''}${JSON.stringify(chemin)}${m[3]}`;
    entree = { fichier: 'pyproject.toml', texte: texte.replace(m[0], ajout) };
  }
  return {
    fichiers,
    espace: entree,
    verrouiller: { commande: 'uv', args: ['lock'], dossier: membres ? '.' : chemin },
  };
}
