// The skeleton of a new package of the module typescript, the demand `squelette` of the join
// (scripts/jointure.d.ts), which `grillhouse paquet` writes (scripts/paquet.mjs), as `nx g
// @nx/js:lib` and `turbo gen workspace` write one: no behaviour, no test.
//
// - A package of TypeScript lives under `packages/<nom>`, where the module finds its components
//   (./composants.mjs); another path is refused, named.
// - Its files: its package.json (its name, the root's scope before the folder's name when the root's
//   name has one, as Nx names a library after the workspace's scope; private; an ES module; its
//   script `test:unit`, which makes it a package that plays tests, and the tools of its tests and
//   of its typing the root does not declare, TypeScript, Vitest and Node's types, at the versions of
//   the module's template); its tsconfig.json, which types its sources, its tests and its
//   configuration, nothing emitted; its vitest.config.ts, the frame's base configuration by its
//   name, which passes while the package has no test yet, as the configuration of a library that
//   Nx generates (`passWithNoTests`); `src/index.ts`, an empty module; `tests/.gitkeep`, its folder
//   of tests. The update gives it its script `typecheck` and the frame's package in its
//   devDependencies (./mise-a-jour.mjs).
// - The workspace: the root package.json receives the package's path in its `workspaces` (created
//   when the root has none), unless a pattern there covers it already.
// - The lock of the versions: `npm install`, at the root.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CHAMPS = ['dependencies', 'devDependencies', 'optionalDependencies'];
// The tools of a package's tests and of its typing, at the versions of the module's template.
const OUTILS_DU_PAQUET = ['@types/node', 'typescript', 'vitest'];

const lireJson = f => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const json = v => `${JSON.stringify(v, null, 2)}\n`;

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022'],
    module: 'Node16',
    moduleResolution: 'Node16',
    resolveJsonModule: true,
    noEmit: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    isolatedModules: true,
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
  },
  include: ['src/**/*', 'tests/**/*', '*.ts'],
  exclude: ['node_modules', 'dist'],
};

const VITEST = `import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@roomi-fields/grillhouse/vitest-config';

// The tests of the package: the frame's base configuration, by its name, extended with what is the
// package's own. It passes while the package has no test yet, as the configuration of a library
// that Nx generates; its first test plays as any other.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['src/**/*.{test,spec}.{ts,js,mjs}', 'tests/**/*.{test,spec}.{ts,js,mjs}'],
      passWithNoTests: true,
    },
  })
);
`;

/** @type {import('../../jointure.js').Langage['squelette']} */
export function squelette(racine, { chemin, modele }) {
  if (!/^packages\/[^/]+$/.test(chemin)) {
    throw new Error(
      `${chemin} : un paquet typescript vit sous packages/<nom>, où le module trouve ses composants.`
    );
  }
  const racinePkg = lireJson(path.join(racine, 'package.json')) ?? {};
  const nom = path.posix.basename(chemin);
  const portee = /^(@[^/]+)\//.exec(String(racinePkg.name ?? ''))?.[1];
  const declare = n => CHAMPS.some(c => racinePkg[c]?.[n] !== undefined);
  const versions = modele.devDependencies ?? {};
  const devDependencies = Object.fromEntries(
    OUTILS_DU_PAQUET.filter(n => !declare(n) && typeof versions[n] === 'string').map(n => [
      n,
      versions[n],
    ])
  );
  const pkg = {
    name: portee ? `${portee}/${nom}` : nom,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { 'test:unit': 'vitest run' },
    ...(Object.keys(devDependencies).length ? { devDependencies } : {}),
  };
  const fichiers = {
    [`${chemin}/package.json`]: json(pkg),
    [`${chemin}/tsconfig.json`]: json(TSCONFIG),
    [`${chemin}/vitest.config.ts`]: VITEST,
    [`${chemin}/src/index.ts`]: `// The entry of the package ${nom}: its interface, docs/INTERFACE.md, says what it exports.\nexport {};\n`,
    [`${chemin}/tests/.gitkeep`]: '',
  };
  const espaces = Array.isArray(racinePkg.workspaces)
    ? racinePkg.workspaces
    : (racinePkg.workspaces?.packages ?? null);
  const couvert = (espaces ?? []).some(
    m => typeof m === 'string' && !m.startsWith('!') && path.matchesGlob(chemin, m)
  );
  let espace = null;
  if (!couvert) {
    const p = { ...racinePkg };
    if (Array.isArray(p.workspaces) || p.workspaces === undefined) {
      p.workspaces = [...(p.workspaces ?? []), chemin];
    } else {
      p.workspaces = { ...p.workspaces, packages: [...(p.workspaces.packages ?? []), chemin] };
    }
    espace = { fichier: 'package.json', texte: json(p) };
  }
  return { fichiers, espace, verrouiller: { commande: 'npm', args: ['install'], dossier: '.' } };
}
