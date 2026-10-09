#!/usr/bin/env node
// The boundaries of the code, checked by dependency-cruiser. Its configuration
// (`.dependency-cruiser.cjs`) is generated from the components of the repository, like the index
// of the interfaces; a project adds its own rules in `.dependency-cruiser.projet.cjs`
// (`module.exports = { forbidden: [...] }`), which the generated file reads.
//
//   node scripts/frontieres.mjs           refuses a stale configuration, then runs dependency-cruiser
//   node scripts/frontieres.mjs --ecrire  writes the configuration
//
// The rules: no cycle; a package reaches another by its name, never by a path into its tree; a
// module of `src/` reaches another by its entry (`index`); production code imports no test and no
// development dependency; every import resolves (a path a package does not export is refused);
// an orphan file is reported, without refusing. Who uses which component is the consumers
// check's (`scripts/consommateurs.mjs`).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composants } from './consommateurs.mjs';

export const CONFIGURATION = '.dependency-cruiser.cjs';
export const RACINES = ['src', 'packages'];
const TESTS = '(^|/)(test|tests|__tests__)/|[.](test|spec)[.][a-z]+$';
const CODE = '^src/|^packages/[^/]+/src/';

// The configuration text for the repository at <racine>.
export function configuration(racine) {
  const modules = composants(racine).filter(c => path.relative(racine, c.dir).startsWith('src/'));
  const regles = [
    {
      name: 'pas-de-cycle',
      comment: 'aucun module ne dépend de lui-même par un détour',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'un-paquet-par-son-nom',
      comment: 'un paquet en importe un autre par son nom, jamais par un chemin dans son arbre',
      severity: 'error',
      from: { path: '^packages/([^/]+)/' },
      to: { path: '^packages/([^/]+)/', pathNot: '^packages/$1/' },
    },
    {
      name: 'pas-de-test-dans-le-code',
      comment: "le code livré n'importe aucun test",
      severity: 'error',
      from: { path: CODE, pathNot: TESTS },
      to: { path: TESTS },
    },
    {
      name: 'pas-d-outil-de-developpement-dans-le-code',
      comment: "le code livré n'importe aucune dépendance de développement",
      severity: 'error',
      from: { path: CODE, pathNot: TESTS },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'tout-import-se-resout',
      comment: "un import se résout : un chemin qu'un paquet n'exporte pas est refusé",
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'pas-d-orphelin',
      comment: "un fichier que rien n'importe est signalé",
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: `${TESTS}|(^|/)index[.][a-z]+$|[.]d[.]ts$|[.]config[.][a-z]+$`,
      },
      to: {},
    },
  ];
  if (modules.length) {
    regles.splice(2, 0, {
      name: 'un-module-par-son-entree',
      comment:
        "un module de src en importe un autre par son entrée (index), jamais par l'intérieur",
      severity: 'error',
      from: { path: '^src/([^/]+)/' },
      to: { path: '^src/([^/]+)/', pathNot: '^src/$1/|^src/[^/]+/index[.][a-z]+$' },
    });
  }
  const tsconfig = existsSync(path.join(racine, 'tsconfig.json'));
  return `// Généré par \`node scripts/frontieres.mjs --ecrire\` ; ne pas éditer. Les règles propres au
// projet vivent dans .dependency-cruiser.projet.cjs.
const fs = require('node:fs');
const projet = fs.existsSync(\`\${__dirname}/.dependency-cruiser.projet.cjs\`)
  ? require('./.dependency-cruiser.projet.cjs')
  : { forbidden: [] };

module.exports = {
  forbidden: [
${regles.map(r => `    ${JSON.stringify(r)},`).join('\n')}
    ...projet.forbidden,
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(dist|build|coverage)/|^packages/[^/]+/(dist|build|coverage)/' },
    tsPreCompilationDeps: true,
    preserveSymlinks: true,
${tsconfig ? "    tsConfig: { fileName: 'tsconfig.json' },\n" : ''}    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'default', 'types'],
    },
  },
};
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const attendu = configuration(racine);
  const cible = path.join(racine, CONFIGURATION);
  if (process.argv.includes('--ecrire')) {
    writeFileSync(cible, attendu);
    process.exit(0);
  }
  const present = existsSync(cible) ? readFileSync(cible, 'utf8') : '';
  if (present !== attendu) {
    process.stderr.write(
      `⛔ ${CONFIGURATION} n'est pas à jour avec les composants : node scripts/frontieres.mjs --ecrire le régénère.\n`
    );
    process.exit(1);
  }
  const racines = RACINES.filter(r => existsSync(path.join(racine, r)));
  if (racines.length === 0) process.exit(0);
  const r = spawnSync(
    'npx',
    [
      '--no-install',
      'depcruise',
      ...racines,
      '--config',
      CONFIGURATION,
      '--output-type',
      'err-long',
    ],
    { cwd: racine, stdio: 'inherit' }
  );
  process.exit(r.status ?? 1);
}
