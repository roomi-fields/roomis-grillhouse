// grillhouse-b32 — a package is born out of the circuit (the decision of the responsible of
// 2026-11-01): grill, writing of its row and its documents, then `grillhouse paquet <chemin>`,
// which reads its row of the table of the components and writes what its language asks, as the
// generators of Nx and `cargo new --lib` added to the members of the workspace; then a ticket of
// code by the circuit. Witness: OSC Bridge (SyntHub SH-13y.6, 0.27.0), a project of Rust whose
// first package of TypeScript, `packages/interface`, no procedure created: the circuit refused a
// title naming a package absent from the disk.
//
// - Criterion 1: the command refuses, by its name, a path no row names, a row without language and
//   a folder that holds the manifest of its language; a folder that holds docs/ alone is accepted.
// - Criterion 2: for a row typescript, cargo or python, the skeleton of the language (its
//   manifest, the configuration of its tests and of its typing, a file of code, its folder of
//   tests, the entry of the workspace) and the documents of the package absent, from the template.
// - Criterion 4: a package born of the command enters the circuit, its path in a title resolved.
// - Criterion 5: the common charter, the skills grill and pitmaster, the package's architecture and
//   the CHANGELOG say the four times.
// Criterion 3 (the tools of the first package of a language, then the guards green) and « it
// commits nothing » play at night: packages/grillhouse-essais/tests/premier-paquet.nuit.spec.ts.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import { afterAll, describe, expect, it } from 'vitest';
import { composantsDe, resoudreComposant } from '../../scripts/circuit.mjs';
import { creerPaquet, ecrireLePaquet, planDuPaquet, Refus } from '../../scripts/paquet.mjs';

const PAQUET = path.resolve(__dirname, '../..');
const DEPOT = path.resolve(PAQUET, '../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'paquet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const GABARIT = JSON.parse(
  readFileSync(path.join(DEPOT, 'templates/projet/package.json'), 'utf8')
) as {
  devDependencies: Record<string, string>;
};

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const json = (racine: string, f: string) => JSON.parse(lire(racine, f)) as Record<string, unknown>;

// SyntHub's table of the components as it stands (plain names, a crate of another repository
// without language), its row `interface` declared typescript at the second time.
const TABLE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`osd\` | OSD | lire un pilote | |
| service | SyntHub | le service | cargo |
| interface | SyntHub | ce que le navigateur exécute | typescript |
| site | SyntHub | les pages rendues | |
| \`crates/journal\` | SyntHub | le journal des requêtes | cargo |
| outils | SyntHub | les commandes du catalogue | python |
`;

const CARGO_RACINE = `[workspace]
members = ["crates/service"]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
publish = false

[workspace.lints.rust]
unsafe_code = "forbid"

[workspace.dependencies]
serde = "1"
`;

// A project of Rust as SyntHub's: a workspace of cargo, its crate service, a root package.json of
// the frame without workspaces.
function synthub(): string {
  const racine = mkdtempSync(path.join(ESSAIS, 'synthub-'));
  ecrire(racine, 'docs/ARCHITECTURE.md', TABLE);
  ecrire(racine, 'Cargo.toml', CARGO_RACINE);
  ecrire(
    racine,
    'crates/service/Cargo.toml',
    '[package]\nname = "service"\nversion.workspace = true\n'
  );
  ecrire(racine, 'crates/service/src/lib.rs', '');
  ecrire(
    racine,
    'package.json',
    `${JSON.stringify({ name: 'synthub', private: true, scripts: { test: 'grillhouse tests' } }, null, 2)}\n`
  );
  return racine;
}

// Every file under <racine>, from it.
const tous = (racine: string): string[] =>
  readdirSync(racine, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(racine, path.join(e.parentPath, e.name)))
    .sort();

describe('grillhouse-b32, critère 1 — la commande refuse, par son nom', () => {
  it('a path no row of the table names is refused, the path and the table named, nothing written', () => {
    const racine = synthub();
    const avant = tous(racine);
    expect(() => planDuPaquet(racine, 'packages/absent')).toThrow(
      /packages\/absent : aucune ligne d'un tableau des composants de docs\/ARCHITECTURE\.md ne le nomme/
    );
    expect(tous(racine)).toEqual(avant);
  });

  it('a row without language is refused, its line named', () => {
    const racine = synthub();
    expect(() => planDuPaquet(racine, 'site')).toThrow(
      /site : sa ligne \(docs\/ARCHITECTURE\.md:8\) ne nomme pas son langage/
    );
  });

  it('a folder that holds the manifest of its language is refused, the manifest named', () => {
    const racine = synthub();
    ecrire(racine, 'packages/interface/package.json', '{"name":"interface"}\n');
    expect(() => planDuPaquet(racine, 'packages/interface')).toThrow(
      /packages\/interface : le dossier porte déjà son package\.json/
    );
  });

  it('a folder that holds docs/ alone is accepted, and its documents stay as they are', () => {
    const racine = synthub();
    ecrire(
      racine,
      'packages/interface/docs/CADRE.md',
      '# interface — cadre\n\nÉcrit au temps 2.\n'
    );
    const plan = planDuPaquet(racine, 'packages/interface');
    ecrireLePaquet(racine, plan);
    expect(lire(racine, 'packages/interface/docs/CADRE.md')).toBe(
      '# interface — cadre\n\nÉcrit au temps 2.\n'
    );
    expect(existsSync(path.join(racine, 'packages/interface/package.json'))).toBe(true);
  });
});

describe('grillhouse-b32, critère 2 — le squelette du langage de la ligne', () => {
  it('typescript: manifest, tests, typing, code, folder of tests, the workspaces entry, the documents', () => {
    const racine = synthub();
    const plan = planDuPaquet(racine, 'packages/interface');
    expect(plan.verrouiller).toEqual([{ commande: 'npm', args: ['install'], dossier: '.' }]);
    ecrireLePaquet(racine, plan);
    const pkg = json(racine, 'packages/interface/package.json') as {
      name: string;
      private: boolean;
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('interface');
    expect(pkg.private).toBe(true);
    expect(pkg.scripts['test:unit']).toBe('vitest run');
    for (const outil of ['typescript', 'vitest', '@types/node']) {
      expect(pkg.devDependencies[outil], outil).toBe(GABARIT.devDependencies[outil]);
    }
    expect(json(racine, 'packages/interface/tsconfig.json')).toMatchObject({
      compilerOptions: { strict: true, noEmit: true },
    });
    expect(lire(racine, 'packages/interface/vitest.config.ts')).toContain(
      "import base from '@roomi-fields/grillhouse/vitest-config';"
    );
    expect(existsSync(path.join(racine, 'packages/interface/src/index.ts'))).toBe(true);
    expect(existsSync(path.join(racine, 'packages/interface/tests/.gitkeep'))).toBe(true);
    expect(json(racine, 'package.json').workspaces).toEqual(['packages/interface']);
    const iface = lire(racine, 'packages/interface/docs/INTERFACE.md');
    expect(iface).toMatch(/^# interface — interface\n/);
    expect(iface).toMatch(/^\*\*Langage\*\* : typescript$/m);
    expect(lire(racine, 'packages/interface/docs/CADRE.md')).toMatch(/^# interface — cadre\n/);
  });

  it('typescript: a pattern of the workspaces that covers the path leaves the root as it is', () => {
    const racine = synthub();
    ecrire(
      racine,
      'package.json',
      JSON.stringify({ name: '@s/racine', workspaces: ['packages/*'] })
    );
    const plan = planDuPaquet(racine, 'packages/interface');
    expect(plan.espace).toBeNull();
    ecrireLePaquet(racine, plan);
    expect(lire(racine, 'package.json')).toBe(
      JSON.stringify({ name: '@s/racine', workspaces: ['packages/*'] })
    );
    expect(json(racine, 'packages/interface/package.json').name).toBe('@s/interface');
  });

  it('cargo: its Cargo.toml inheriting the workspace, src/lib.rs, tests/, the member added', () => {
    const racine = synthub();
    const plan = planDuPaquet(racine, 'crates/journal');
    expect(plan.verrouiller).toEqual([
      { commande: 'cargo', args: ['update', '--workspace'], dossier: '.' },
    ]);
    ecrireLePaquet(racine, plan);
    const crate = parse(lire(racine, 'crates/journal/Cargo.toml')) as {
      package: Record<string, unknown>;
      lints: Record<string, unknown>;
    };
    expect(crate.package).toEqual({
      name: 'journal',
      version: { workspace: true },
      edition: { workspace: true },
      publish: { workspace: true },
    });
    expect(crate.lints).toEqual({ workspace: true });
    expect(existsSync(path.join(racine, 'crates/journal/src/lib.rs'))).toBe(true);
    expect(existsSync(path.join(racine, 'crates/journal/tests/.gitkeep'))).toBe(true);
    const espace = parse(lire(racine, 'Cargo.toml')) as {
      workspace: { members: string[]; dependencies: Record<string, unknown> };
    };
    expect(espace.workspace.members).toEqual(['crates/service', 'crates/journal']);
    expect(espace.workspace.dependencies).toEqual({ serde: '1' });
    expect(lire(racine, 'crates/journal/docs/INTERFACE.md')).toMatch(/^\*\*Langage\*\* : cargo$/m);
  });

  it('python: its pyproject.toml, its group test and pytest, its module, tests/, locked in itself', () => {
    const racine = synthub();
    const plan = planDuPaquet(racine, 'outils');
    expect(plan.espace).toBeNull();
    expect(plan.verrouiller).toEqual([{ commande: 'uv', args: ['lock'], dossier: 'outils' }]);
    ecrireLePaquet(racine, plan);
    const projet = parse(lire(racine, 'outils/pyproject.toml')) as {
      project: { name: string };
      'dependency-groups': { test: string[] };
      tool: { pytest: { ini_options: { testpaths: string[] } } };
    };
    expect(projet.project.name).toBe('synthub-outils');
    expect(projet['dependency-groups'].test.some(d => d.startsWith('pytest'))).toBe(true);
    expect(projet.tool.pytest.ini_options.testpaths).toEqual(['tests']);
    expect(existsSync(path.join(racine, 'outils/src/synthub_outils/__init__.py'))).toBe(true);
    expect(existsSync(path.join(racine, 'outils/tests/.gitkeep'))).toBe(true);
    expect(lire(racine, 'outils/docs/INTERFACE.md')).toMatch(/^\*\*Langage\*\* : python$/m);
  });

  it('python: a workspace of uv at the root receives the member, locked at the root', () => {
    const racine = synthub();
    ecrire(racine, 'pyproject.toml', '[tool.uv.workspace]\nmembers = ["site"]\n');
    const plan = planDuPaquet(racine, 'outils');
    expect(plan.verrouiller).toEqual([{ commande: 'uv', args: ['lock'], dossier: '.' }]);
    ecrireLePaquet(racine, plan);
    const racinePy = parse(lire(racine, 'pyproject.toml')) as {
      tool: { uv: { workspace: { members: string[] } } };
    };
    expect(racinePy.tool.uv.workspace.members).toEqual(['site', 'outils']);
  });
});

// grillhouse-b2o — the name of a new package does not clash with the standard library: in OSC
// Bridge (SyntHub, 0.28.3), `grillhouse paquet site` wrote a package of Python named `site`, which
// `import site` never reaches (the standard module, loaded at the interpreter's start). As Nx
// prefixes a library with the workspace's scope (the module typescript) and `cargo new` refuses a
// name reserved by Rust:
// - Criterion 1: a package of Python whose module would bear the name of a module of the standard
//   library (`sys.stdlib_module_names`) is refused by its name, nothing written, the name to give
//   named.
// - Criterion 2: the name written is prefixed by the project's name when the root declares one
//   (`[project].name` of the root pyproject.toml, else the `name` of the root package.json, its
//   scope when it has one), the package's name in `-`, its module in `_`, as uv writes them.
// - Criterion 3: the module cargo refuses a name cargo refuses (a keyword, `test`), nothing
//   written, the name to give named.
const LIGNE_PY = (nom: string) =>
  `| Composant | Rôle | Langage |\n| --- | --- | --- |\n| \`${nom}\` | les pages | python |\n`;

// A project at a folder named <dossier>, its table declaring <nom> in Python.
function projetPy(dossier: string, nom: string): string {
  const racine = path.join(mkdtempSync(path.join(ESSAIS, 'b2o-')), dossier);
  ecrire(racine, 'docs/ARCHITECTURE.md', LIGNE_PY(nom));
  return racine;
}

describe('grillhouse-b2o, critère 1 — un nom de la bibliothèque standard de Python est refusé', () => {
  it('site, without a project name, is refused by its name, nothing written, the name to give named', () => {
    const racine = projetPy('synthhub', 'site');
    const avant = tous(racine);
    expect(() => planDuPaquet(racine, 'site')).toThrow(Refus);
    expect(() => planDuPaquet(racine, 'site')).toThrow(
      /site.*bibliothèque standard de Python.*synthhub-site/s
    );
    expect(() => {
      creerPaquet(racine, 'site', { executer: () => 0 });
    }).toThrow(Refus);
    expect(tous(racine)).toEqual(avant);
  });

  it('json, another module of the standard library, is refused as well', () => {
    const racine = projetPy('essai', 'json');
    expect(() => planDuPaquet(racine, 'json')).toThrow(/json.*bibliothèque standard/s);
  });

  it('a name out of the standard library passes', () => {
    const racine = projetPy('essai', 'catalogue');
    const projet = parse(
      planDuPaquet(racine, 'catalogue').fichiers['catalogue/pyproject.toml']!
    ) as {
      project: { name: string };
    };
    expect(projet.project.name).toBe('catalogue');
  });
});

describe('grillhouse-b2o, critère 2 — le nom écrit est préfixé par le nom du projet', () => {
  it('the name of the root package.json prefixes the package, its module in `_`', () => {
    const racine = projetPy('depot', 'site');
    ecrire(racine, 'package.json', JSON.stringify({ name: 'synthhub' }));
    const plan = planDuPaquet(racine, 'site');
    const projet = parse(plan.fichiers['site/pyproject.toml']!) as { project: { name: string } };
    expect(projet.project.name).toBe('synthhub-site');
    expect(Object.keys(plan.fichiers)).toContain('site/src/synthhub_site/__init__.py');
    expect(Object.keys(plan.fichiers).some(f => f.startsWith('site/src/site/'))).toBe(false);
  });

  it('a scoped name of the root package.json gives its scope, as the module typescript', () => {
    const racine = projetPy('depot', 'site');
    ecrire(racine, 'package.json', JSON.stringify({ name: '@osc-bridge/racine' }));
    const plan = planDuPaquet(racine, 'site');
    const projet = parse(plan.fichiers['site/pyproject.toml']!) as { project: { name: string } };
    expect(projet.project.name).toBe('osc-bridge-site');
    expect(Object.keys(plan.fichiers)).toContain('site/src/osc_bridge_site/__init__.py');
  });

  it('the `[project].name` of the root pyproject.toml comes first, normalized as uv does', () => {
    const racine = projetPy('depot', 'mes_outils');
    ecrire(racine, 'package.json', JSON.stringify({ name: 'synthhub' }));
    ecrire(racine, 'pyproject.toml', '[project]\nname = "Osc.Bridge"\nversion = "0.1.0"\n');
    const plan = planDuPaquet(racine, 'mes_outils');
    const projet = parse(plan.fichiers['mes_outils/pyproject.toml']!) as {
      project: { name: string };
    };
    expect(projet.project.name).toBe('osc-bridge-mes-outils');
    expect(Object.keys(plan.fichiers)).toContain(
      'mes_outils/src/osc_bridge_mes_outils/__init__.py'
    );
  });
});

describe('grillhouse-b2o, critère 3 — le module cargo refuse un nom que cargo refuse', () => {
  const projetCargo = (nom: string) => {
    const racine = path.join(mkdtempSync(path.join(ESSAIS, 'b2o-')), 'synthhub');
    ecrire(
      racine,
      'docs/ARCHITECTURE.md',
      `| Composant | Rôle | Langage |\n| --- | --- | --- |\n| \`crates/${nom}\` | le cœur | cargo |\n`
    );
    ecrire(racine, 'Cargo.toml', CARGO_RACINE);
    return racine;
  };

  it.each([
    ['test', /test.*built-in test library.*synthhub-test/s],
    ['fn', /fn.*keyword.*synthhub-fn/s],
    ['std', /std.*Rust's standard library.*synthhub-std/s],
  ])(
    "crates/%s is refused by its name, cargo's reason and the name to give, nothing written",
    (nom, motif) => {
      const racine = projetCargo(nom);
      const avant = tous(racine);
      expect(() => planDuPaquet(racine, `crates/${nom}`)).toThrow(Refus);
      expect(() => planDuPaquet(racine, `crates/${nom}`)).toThrow(motif);
      expect(tous(racine)).toEqual(avant);
    }
  );

  it("a name cargo accepts passes, the folder's", () => {
    const racine = projetCargo('journal');
    const crate = parse(
      planDuPaquet(racine, 'crates/journal').fichiers['crates/journal/Cargo.toml']!
    ) as {
      package: { name: string };
    };
    expect(crate.package.name).toBe('journal');
  });
});

// grillhouse-0cy — a package born on code already there keeps its tests and its dependencies: in
// OSC Bridge (SyntHub, 0.28.3), `grillhouse paquet` on site/ (its tests site/pages/test_pages.py,
// its dependencies site/pages/requirements.txt) wrote `testpaths = ["tests"]` and no dependency:
// pytest collected nothing, and `import markdown` failed. The owner's decision (2026-11-01), as
// `cargo init` takes the code in place and `uv add -r` takes the dependencies a file declares:
// - Criterion 1: a folder of Python that holds tests and requirements.txt is taken back: its
//   testpaths cover the folders of its tests, each requirements.txt is taken by `uv add -r`, and no
//   src/ is written when Python code is there. Its run by the real uv plays at night
//   (tests/unit/langages/python/python.nuit.test.ts).
// - Criterion 2: an empty folder is unchanged (criterion 2 of grillhouse-b32, above).
// - Criterion 3: a manifest the module does not read (setup.py, setup.cfg, Pipfile) and, in Rust
//   and TypeScript, code out of the module's layout are refused by their name, nothing written,
//   what is missing named.
// - Criterion 4: the CHANGELOG says it.
const TABLE_0CY = `| Composant | Rôle | Langage |
| --- | --- | --- |
| \`site\` | les pages | python |
| \`scripts\` | les commandes | python |
| \`crates/journal\` | le journal | cargo |
| \`interface\` | le navigateur | typescript |
`;

// A project named synthhub whose table declares site and scripts in Python, crates/journal in Rust
// and interface in TypeScript.
function existant(): string {
  const racine = path.join(mkdtempSync(path.join(ESSAIS, '0cy-')), 'osc-bridge');
  ecrire(racine, 'docs/ARCHITECTURE.md', TABLE_0CY);
  ecrire(racine, 'package.json', JSON.stringify({ name: 'synthhub' }));
  ecrire(racine, 'Cargo.toml', CARGO_RACINE);
  return racine;
}

// The configuration of pytest of the pyproject.toml <f> the plan <plan> writes.
const pytestDe = (plan: ReturnType<typeof planDuPaquet>, f: string) =>
  (parse(plan.fichiers[f]!) as { tool: { pytest: { ini_options: Record<string, unknown> } } }).tool
    .pytest.ini_options;

describe('grillhouse-0cy, critère 1 — un dossier Python existant est repris', () => {
  it("SyntHub's site/: its folder of tests collected, its requirements.txt taken by uv add -r, no src/", () => {
    const racine = existant();
    ecrire(racine, 'site/pages/test_pages.py', 'import markdown\n\ndef test_x():\n    pass\n');
    ecrire(racine, 'site/pages/build.py', 'import markdown\n');
    ecrire(racine, 'site/pages/requirements.txt', 'markdown>=3\n');
    const plan = planDuPaquet(racine, 'site');
    const pytest = pytestDe(plan, 'site/pyproject.toml');
    expect(pytest.testpaths).toEqual(['pages', 'tests']);
    expect(pytest.pythonpath).toBeUndefined();
    expect(Object.keys(plan.fichiers).filter(f => f.startsWith('site/src/'))).toEqual([]);
    expect(plan.verrouiller).toEqual([
      { commande: 'uv', args: ['add', '-r', 'pages/requirements.txt'], dossier: 'site' },
    ]);
    ecrireLePaquet(racine, plan);
    expect(lire(racine, 'site/pages/test_pages.py')).toBe(
      'import markdown\n\ndef test_x():\n    pass\n'
    );
    expect(lire(racine, 'site/pages/requirements.txt')).toBe('markdown>=3\n');
  });

  it("SyntHub's scripts/: a test at the package's root, its testpaths the package itself", () => {
    const racine = existant();
    ecrire(racine, 'scripts/test_import_readmes.py', 'def test_x():\n    pass\n');
    ecrire(racine, 'scripts/import_readmes.py', 'print(1)\n');
    const plan = planDuPaquet(racine, 'scripts');
    expect(pytestDe(plan, 'scripts/pyproject.toml').testpaths).toEqual(['.']);
    expect(Object.keys(plan.fichiers).filter(f => f.startsWith('scripts/src/'))).toEqual([]);
    expect(plan.verrouiller).toEqual([{ commande: 'uv', args: ['lock'], dossier: 'scripts' }]);
  });

  it('each requirements.txt in the order of its path; nested folders of tests covered once; .venv left out', () => {
    const racine = existant();
    ecrire(racine, 'site/requirements.txt', 'jinja2\n');
    ecrire(racine, 'site/pages/requirements.txt', 'markdown>=3\n');
    ecrire(racine, 'site/pages/test_b.py', 'def test_b():\n    pass\n');
    ecrire(racine, 'site/pages/tests/test_a.py', 'def test_a():\n    pass\n');
    ecrire(racine, 'site/outils/rendu_test.py', 'def test_r():\n    pass\n');
    ecrire(racine, 'site/.venv/lib/test_tiers.py', 'def test_t():\n    pass\n');
    ecrire(racine, 'site/.venv/lib/requirements.txt', 'tiers\n');
    const plan = planDuPaquet(racine, 'site');
    expect(pytestDe(plan, 'site/pyproject.toml').testpaths).toEqual(['outils', 'pages', 'tests']);
    expect(plan.verrouiller).toEqual([
      { commande: 'uv', args: ['add', '-r', 'pages/requirements.txt'], dossier: 'site' },
      { commande: 'uv', args: ['add', '-r', 'requirements.txt'], dossier: 'site' },
    ]);
  });

  it('Python code under src/: its pythonpath kept, its tests under tests/, no second module', () => {
    const racine = existant();
    ecrire(racine, 'site/src/foo/__init__.py', 'def f():\n    return 1\n');
    ecrire(
      racine,
      'site/tests/test_foo.py',
      'import foo\n\ndef test_f():\n    assert foo.f() == 1\n'
    );
    const plan = planDuPaquet(racine, 'site');
    const pytest = pytestDe(plan, 'site/pyproject.toml');
    expect(pytest.pythonpath).toEqual(['src']);
    expect(pytest.testpaths).toEqual(['tests']);
    expect(Object.keys(plan.fichiers).filter(f => f.startsWith('site/src/'))).toEqual([]);
  });

  it('the outputs of a build are not files of the package: .venv, dist/, target/, __pycache__', () => {
    const racine = existant();
    ecrire(racine, 'site/.venv/lib/setup.py', '\n');
    ecrire(racine, 'site/target/test_tiers.py', 'def test_t():\n    pass\n');
    ecrire(racine, 'site/dist/setup.cfg', '\n');
    ecrire(racine, 'site/__pycache__/requirements.txt', 'tiers\n');
    const plan = planDuPaquet(racine, 'site');
    expect(pytestDe(plan, 'site/pyproject.toml').testpaths).toEqual(['tests']);
    expect(plan.verrouiller).toEqual([{ commande: 'uv', args: ['lock'], dossier: 'site' }]);
  });

  it('Python code without tests: no src/, its tests under tests/', () => {
    const racine = existant();
    ecrire(racine, 'site/build.py', 'print(1)\n');
    const plan = planDuPaquet(racine, 'site');
    expect(pytestDe(plan, 'site/pyproject.toml').testpaths).toEqual(['tests']);
    expect(Object.keys(plan.fichiers).filter(f => f.startsWith('site/src/'))).toEqual([]);
    expect(Object.keys(plan.fichiers)).toContain('site/tests/.gitkeep');
  });

  it('grillhouse paquet plays each command of the lock, in its order', () => {
    const racine = existant();
    ecrire(racine, 'site/requirements.txt', 'jinja2\n');
    ecrire(racine, 'site/pages/requirements.txt', 'markdown>=3\n');
    ecrire(racine, 'site/pages/test_pages.py', 'def test_x():\n    pass\n');
    const joues: string[][] = [];
    creerPaquet(racine, 'site', {
      executer: (commande, args, dossier) => {
        joues.push([commande, ...args, path.relative(racine, dossier)]);
        return 0;
      },
    });
    expect(joues.filter(j => j[0] === 'uv')).toEqual([
      ['uv', 'add', '-r', 'pages/requirements.txt', 'site'],
      ['uv', 'add', '-r', 'requirements.txt', 'site'],
    ]);
  });
});

describe('grillhouse-0cy, critère 3 — un dossier que le module ne sait pas reprendre est refusé', () => {
  it.each([['setup.py'], ['setup.cfg'], ['Pipfile'], ['pages/setup.py']])(
    'python: %s is refused by its name, nothing written, what to do named',
    f => {
      const racine = existant();
      ecrire(racine, `site/${f}`, '\n');
      ecrire(racine, 'site/pages/test_pages.py', 'def test_x():\n    pass\n');
      const avant = tous(racine);
      expect(() => planDuPaquet(racine, 'site')).toThrow(Refus);
      const motif = new RegExp(`site : .*${f.replace(/[.]/g, '\\.')}.*requirements\\.txt`, 's');
      expect(() => planDuPaquet(racine, 'site')).toThrow(motif);
      expect(() => creerPaquet(racine, 'site', { executer: () => 0 })).toThrow(Refus);
      expect(tous(racine)).toEqual(avant);
    }
  );

  it.each([
    ['src/main.rs', /crates\/journal : .*src\/main\.rs/s],
    ['src/bin/outil.rs', /crates\/journal : .*src\/bin\/outil\.rs/s],
    ['lib.rs', /crates\/journal : .*lib\.rs.*src\/lib\.rs/s],
    ['src/journal.rs', /crates\/journal : .*src\/journal\.rs.*src\/lib\.rs/s],
  ])(
    'cargo: %s, out of the layout of the module, is refused by its name, nothing written',
    (f, motif) => {
      const racine = existant();
      ecrire(racine, `crates/journal/${f}`, 'fn f() {}\n');
      const avant = tous(racine);
      expect(() => planDuPaquet(racine, 'crates/journal')).toThrow(Refus);
      expect(() => planDuPaquet(racine, 'crates/journal')).toThrow(motif);
      expect(tous(racine)).toEqual(avant);
    }
  );

  it('cargo: src/lib.rs and tests/ already there are taken as they are', () => {
    const racine = existant();
    ecrire(racine, 'crates/journal/src/lib.rs', 'pub mod ecrire;\n');
    ecrire(racine, 'crates/journal/src/ecrire.rs', 'pub fn f() {}\n');
    ecrire(racine, 'crates/journal/tests/journal.rs', '#[test]\nfn t() {}\n');
    ecrireLePaquet(racine, planDuPaquet(racine, 'crates/journal'));
    expect(lire(racine, 'crates/journal/src/lib.rs')).toBe('pub mod ecrire;\n');
    expect(lire(racine, 'crates/journal/tests/journal.rs')).toBe('#[test]\nfn t() {}\n');
    expect(existsSync(path.join(racine, 'crates/journal/Cargo.toml'))).toBe(true);
  });

  it.each([['scripts/construire.ts'], ['index.js'], ['outils/rendu.mjs']])(
    'typescript: %s, out of src/ and tests/, is refused by its name, nothing written',
    f => {
      const racine = existant();
      ecrire(racine, `packages/interface/${f}`, 'export {};\n');
      const avant = tous(racine);
      expect(() => planDuPaquet(racine, 'packages/interface')).toThrow(Refus);
      expect(() => planDuPaquet(racine, 'packages/interface')).toThrow(
        new RegExp(`packages/interface : .*${f.replace(/[.]/g, '\\.')}.*src/.*tests/`, 's')
      );
      expect(tous(racine)).toEqual(avant);
    }
  );

  it('typescript and cargo: dist/ and target/, outputs of a build, are not refused', () => {
    const racine = existant();
    ecrire(racine, 'packages/interface/dist/index.js', 'export {};\n');
    ecrire(racine, 'crates/journal/target/debug/build/out.rs', 'fn f() {}\n');
    expect(() => planDuPaquet(racine, 'packages/interface')).not.toThrow();
    expect(() => planDuPaquet(racine, 'crates/journal')).not.toThrow();
  });

  it('typescript: code under src/ and tests/ already there is taken as it is', () => {
    const racine = existant();
    ecrire(racine, 'packages/interface/src/index.ts', 'export const a = 1;\n');
    ecrire(racine, 'packages/interface/tests/a.spec.ts', "import '../src/index';\n");
    ecrire(racine, 'packages/interface/README.md', '# interface\n');
    ecrireLePaquet(racine, planDuPaquet(racine, 'packages/interface'));
    expect(lire(racine, 'packages/interface/src/index.ts')).toBe('export const a = 1;\n');
    expect(lire(racine, 'packages/interface/tests/a.spec.ts')).toBe("import '../src/index';\n");
  });
});

describe('grillhouse-b32, critère 4 — un paquet né de la commande entre au circuit', () => {
  it('typescript: the title naming it by its path resolves once it is born, not before', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'ts-'));
    ecrire(racine, 'package.json', JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }));
    ecrire(
      racine,
      'docs/ARCHITECTURE.md',
      '| Composant | Rôle | Langage |\n| --- | --- | --- |\n| `interface` | le navigateur | typescript |\n'
    );
    expect(() => {
      resoudreComposant(composantsDe(racine), racine, 'packages/interface');
    }).toThrow(/ne nomme ni un paquet ni un chemin du dépôt/);
    ecrireLePaquet(racine, planDuPaquet(racine, 'packages/interface'));
    const liste = composantsDe(racine);
    expect(liste.map(p => p.dossier)).toContain('packages/interface');
    expect(resoudreComposant(liste, racine, 'packages/interface')).toBe('packages/interface');
    expect(resoudreComposant(liste, racine, 'interface')).toBe('packages/interface');
  });

  it('python: the title naming it by its path resolves once it is born', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'py-'));
    ecrire(racine, 'package.json', JSON.stringify({ name: 'essai' }));
    ecrire(
      racine,
      'docs/ARCHITECTURE.md',
      '| Composant | Rôle | Langage |\n| --- | --- | --- |\n| `outils` | les commandes | python |\n'
    );
    ecrireLePaquet(racine, planDuPaquet(racine, 'outils'));
    const liste = composantsDe(racine);
    expect(liste.map(p => p.dossier)).toContain('outils');
    expect(resoudreComposant(liste, racine, 'outils')).toBe('outils');
  });
});

describe('grillhouse-b32, critère 5 — les textes disent les quatre temps', () => {
  const textes = [
    'mods/grillhouse/charte.md',
    'mods/grillhouse/skills/grill/SKILL.md',
    'mods/grillhouse/skills/pitmaster/SKILL.md',
    'packages/grillhouse/docs/ARCHITECTURE.md',
  ];
  it.each(textes)('%s names the command and the four times', f => {
    const texte = readFileSync(path.join(DEPOT, f), 'utf8');
    expect(texte).toContain('grillhouse paquet');
    expect(texte).toMatch(/quatre temps/);
  });
});
