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
import { ecrireLePaquet, planDuPaquet } from '../../scripts/paquet.mjs';

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
    expect(plan.verrouiller).toEqual({ commande: 'npm', args: ['install'], dossier: '.' });
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
    expect(plan.verrouiller).toEqual({
      commande: 'cargo',
      args: ['update', '--workspace'],
      dossier: '.',
    });
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
    expect(plan.verrouiller).toEqual({ commande: 'uv', args: ['lock'], dossier: 'outils' });
    ecrireLePaquet(racine, plan);
    const projet = parse(lire(racine, 'outils/pyproject.toml')) as {
      project: { name: string };
      'dependency-groups': { test: string[] };
      tool: { pytest: { ini_options: { testpaths: string[] } } };
    };
    expect(projet.project.name).toBe('outils');
    expect(projet['dependency-groups'].test.some(d => d.startsWith('pytest'))).toBe(true);
    expect(projet.tool.pytest.ini_options.testpaths).toEqual(['tests']);
    expect(existsSync(path.join(racine, 'outils/src/outils/__init__.py'))).toBe(true);
    expect(existsSync(path.join(racine, 'outils/tests/.gitkeep'))).toBe(true);
    expect(lire(racine, 'outils/docs/INTERFACE.md')).toMatch(/^\*\*Langage\*\* : python$/m);
  });

  it('python: a workspace of uv at the root receives the member, locked at the root', () => {
    const racine = synthub();
    ecrire(racine, 'pyproject.toml', '[tool.uv.workspace]\nmembers = ["site"]\n');
    const plan = planDuPaquet(racine, 'outils');
    expect(plan.verrouiller.dossier).toBe('.');
    ecrireLePaquet(racine, plan);
    const racinePy = parse(lire(racine, 'pyproject.toml')) as {
      tool: { uv: { workspace: { members: string[] } } };
    };
    expect(racinePy.tool.uv.workspace.members).toEqual(['site', 'outils']);
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

  it('the CHANGELOG says it under Unreleased', () => {
    const texte = readFileSync(path.join(DEPOT, 'CHANGELOG.md'), 'utf8');
    const unreleased =
      texte.split(/^## /m).find(s => s.startsWith('[Unreleased]') || s.startsWith('Unreleased')) ??
      '';
    expect(unreleased).toContain('grillhouse paquet');
  });
});
