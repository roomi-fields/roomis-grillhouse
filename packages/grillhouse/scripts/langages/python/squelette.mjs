// The skeleton of a new package of the module python, the demand `squelette` of the join
// (scripts/jointure.d.ts), which `grillhouse paquet` writes (scripts/paquet.mjs), as `uv init`
// writes one: no behaviour, no test.
//
// - Its name: the folder's, prefixed by the project's name when the root declares one (the
//   `[project].name` of its pyproject.toml, else the `name` of its package.json, its scope when it
//   has one), as the module typescript prefixes a package with the root's scope and Nx names a
//   library after the workspace's scope; normalized as uv writes the name of a project (PEP 503:
//   lowercase, each run of `-`, `_` or `.` read `-`), its module the name with `-` read `_`.
// - A module that would bear the name of a module of the standard library of Python is refused,
//   by its name, nothing written, the name to give named (the root folder's name before the
//   package's), as `cargo new` refuses a name Rust reserves: `import site` reaches the standard
//   module, never the package. The list is the interpreter's own, `sys.stdlib_module_names`, of
//   the Python the package requires, which uv provides; without uv, the refusal names `npx
//   grillhouse maj`, which installs it.
// - Its files: its pyproject.toml (PEP 621: its name, its version 0.1.0, the Python it requires, no
//   dependency; its group `test` of `[dependency-groups]`, PEP 735, pytest, which the module runs
//   by `uv run --group test pytest`; the configuration of pytest, `[tool.pytest.ini_options]`, its
//   tests under `tests/` and its code importable from `src/`, as uv's layout of a library has it);
//   `src/<module>/__init__.py`, without code; `tests/.gitkeep`, its folder of tests. The typing is
//   `python -m compileall`, which needs no configuration. No build system: uv neither builds nor
//   installs the package to run its tests.
// - The workspace: a root pyproject.toml whose `[tool.uv.workspace]` names its `members` receives
//   the package's path there, as `uv init` adds a project under a workspace to its members; without
//   one, the package is its own project of uv, as the module plays each package (./commandes.mjs).
// - The lock of the versions: `uv lock`, at the workspace's root, else in the package.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// The Python a package requires.
const PYTHON = '>=3.12';

// <n> normalized as uv writes the name of a project (PEP 503).
const normaliser = n => n.toLowerCase().replace(/[-_.]+/g, '-');

// The project's name the root at <racine> declares (see the header), null for none; <racinePy>
// its pyproject.toml read, null without one.
function nomDuProjet(racine, racinePy) {
  const py = racinePy?.project?.name;
  if (typeof py === 'string' && py.trim()) {
    return py;
  }
  const f = path.join(racine, 'package.json');
  const n = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).name : undefined;
  return typeof n === 'string' && n.trim() ? (/^@([^/]+)\//.exec(n)?.[1] ?? n) : null;
}

// The modules of the standard library of Python, `sys.stdlib_module_names`, of the interpreter uv
// provides for PYTHON; throws, uv named, when uv cannot give them.
function modulesStandard(racine) {
  const code = 'import sys; print("\\n".join(sorted(sys.stdlib_module_names)))';
  const r = spawnSync(
    'uv',
    ['run', '--no-project', '--quiet', '--python', PYTHON, 'python', '-c', code],
    { cwd: racine, encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(
      `uv ne donne pas les modules de la bibliothèque standard de Python (${String(r.error?.message ?? r.stderr).trim()}) ; \`npx grillhouse maj\` installe uv, puis relance la commande.`
    );
  }
  return new Set(r.stdout.split('\n').filter(Boolean));
}

/** @type {import('../../jointure.js').Langage['squelette']} */
export function squelette(racine, { chemin }) {
  const f = path.join(racine, 'pyproject.toml');
  const texte = existsSync(f) ? readFileSync(f, 'utf8') : null;
  const racinePy = texte === null ? null : require('smol-toml').parse(texte);
  const dossier = path.posix.basename(chemin);
  const projet = nomDuProjet(racine, racinePy);
  const nom = normaliser(projet ? `${projet}-${dossier}` : dossier);
  const module = nom.replace(/-/g, '_');
  if (modulesStandard(racine).has(module)) {
    const autre = normaliser(`${path.basename(racine)}-${nom}`);
    throw new Error(
      `${chemin} : son module, ${module}, est un module de la bibliothèque standard de Python ; \`import ${module}\` le trouverait, jamais le paquet. Nomme-le ${autre} (le dossier et sa ligne du tableau des composants), ou déclare le nom du projet à la racine (le \`name\` de son package.json), qui préfixe le paquet.`
    );
  }
  const manifeste = [
    '[project]',
    `name = ${JSON.stringify(nom)}`,
    'version = "0.1.0"',
    `requires-python = ${JSON.stringify(PYTHON)}`,
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
  const espace = racinePy?.tool?.uv?.workspace ?? null;
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
