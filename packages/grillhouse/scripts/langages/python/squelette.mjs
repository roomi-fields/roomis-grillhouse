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
// - A folder that already holds Python code is taken as it is, as `cargo init` takes the code in
//   place: its tests (`test_*.py`, `*_test.py`, pytest's names) are collected where they are, its
//   testpaths the folders that hold them and `tests`, each once, the package itself for a test at
//   its root; no `src/<module>/` beside its code, and no `pythonpath` for code out of `src/`
//   (code under `src/` keeps `pythonpath = ["src"]`); each `requirements.txt` is
//   taken by `uv add -r`, in the order of its path, run in the package, which declares its
//   dependencies and locks them, in place of `uv lock`. A manifest the module does not read
//   (`setup.py`, `setup.cfg`, `Pipfile`) is refused by its name, nothing written, what to do named.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { estUnFichierDeTest } from './composants.mjs';

const require = createRequire(import.meta.url);

// The Python a package requires.
const PYTHON = '>=3.12';

// The manifests of Python the module does not read.
const ETRANGERS = new Set(['setup.py', 'setup.cfg', 'Pipfile']);

// The testpaths of a package whose files of tests lie in <fichiers> (from the package): the
// folders that hold them and `tests`, each once, a folder under another left out; the package
// itself, `.`, for a test at its root.
function cheminsDesTests(fichiers) {
  const dossiers = new Set(
    fichiers.filter(f => estUnFichierDeTest(path.posix.basename(f))).map(f => path.posix.dirname(f))
  );
  if (dossiers.has('.')) {
    return ['.'];
  }
  const tous = [...dossiers, 'tests'].filter((d, i, l) => l.indexOf(d) === i).sort();
  return tous.filter(d => !tous.some(o => d.startsWith(`${o}/`)));
}

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
export function squelette(racine, { chemin, existants }) {
  const etrangers = existants.filter(e => ETRANGERS.has(path.posix.basename(e)));
  if (etrangers.length) {
    throw new Error(
      `${chemin} : ${etrangers.join(', ')} déclare un paquet Python que le module python ne lit pas. Reprends ses dépendances dans un requirements.txt, que le paquet reprend par \`uv add -r\`, retire-le, puis relance la commande.`
    );
  }
  const code = existants.some(e => e.endsWith('.py'));
  // Code out of src/ and tests/, which `pythonpath = ["src"]` would not reach.
  const aPlat = existants.some(
    e =>
      e.endsWith('.py') &&
      !e.startsWith('src/') &&
      !e.startsWith('tests/') &&
      !estUnFichierDeTest(path.posix.basename(e))
  );
  const exigences = existants.filter(e => path.posix.basename(e) === 'requirements.txt');
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
    `testpaths = ${JSON.stringify(cheminsDesTests(existants)).replaceAll(',', ', ')}`,
    ...(aPlat ? [] : ['pythonpath = ["src"]']),
    '',
  ].join('\n');
  const fichiers = {
    [`${chemin}/pyproject.toml`]: manifeste,
    ...(code
      ? {}
      : {
          [`${chemin}/src/${module}/__init__.py`]: `"""The package ${nom}: its interface, docs/INTERFACE.md, says what it offers."""\n`,
        }),
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
    verrouiller: exigences.length
      ? exigences.map(e => ({ commande: 'uv', args: ['add', '-r', e], dossier: chemin }))
      : [{ commande: 'uv', args: ['lock'], dossier: membres ? '.' : chemin }],
  };
}
