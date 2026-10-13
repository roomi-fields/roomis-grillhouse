#!/usr/bin/env node
// The boundaries of the code, checked by dependency-cruiser. Its configuration
// (`.dependency-cruiser.cjs`) is generated from the components of the repository, like the index
// of the interfaces; a project adds its own rules and options in `.dependency-cruiser.projet.cjs`
// (`module.exports = { forbidden: [...], options: {...} }`), which the generated file reads when
// dependency-cruiser loads it. The file brings every key of dependency-cruiser's configuration:
// its `forbidden`, `allowed` and `required` rules add to the frame's; `allowedSeverity` and
// `extends` pass as they are. Its `exclude` and `doNotFollow` patterns add to the frame's; any
// other option replaces the frame's at its first level, as the `extends` of dependency-cruiser does.
//
//   node scripts/frontieres.mjs           refuses a stale configuration, then runs dependency-cruiser
//   node scripts/frontieres.mjs --ecrire  writes the configuration
//
// The rules: no cycle; a package reaches another by its name, never by a path into its tree; a
// module of `src/` reaches another by its entry (`index`); production code imports no test and no
// development dependency; every import resolves (a path a package does not export is refused);
// an orphan file is reported, without refusing. Who uses which component is the consumers
// check's (`scripts/consommateurs.mjs`). The files of a package out of the frame
// (`docs/agents/hors-cadre.txt`) are excluded, and no module rule is written for it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composants, horsCadre } from './consommateurs.mjs';

export const CONFIGURATION = '.dependency-cruiser.cjs';
export const RACINES = ['src', 'packages'];
const TESTS = '(^|/)(test|tests|__tests__)/|[.](test|spec)[.][a-z]+$';
const CODE = '^src/|^packages/[^/]+/src/';

// The `exclude` patterns of the configuration: built files, and the directories under `src/` and
// `packages/` that the list out of the frame names.
function exclus(racine) {
  const motifs = ['^(dist|build|coverage)/', '^packages/[^/]+/(dist|build|coverage)/'];
  for (const nom of [...horsCadre(racine)].sort()) {
    motifs.push(`^(packages|src)/${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`);
  }
  return motifs;
}

// The width of a line of the generated configuration, the project's (`.prettierrc`).
const LARGEUR = 100;

// A rule as JavaScript lines at indent <retrait>, each within LARGEUR columns: one key per line,
// a string too long for its line cut at a space, a `|` or the width into pieces joined by `+`.
function ecrire(regle, retrait) {
  const lignes = JSON.stringify(regle, null, 2).split('\n');
  return lignes
    .map(l => {
      const ligne = retrait + l;
      const m = /^(\s*(?:"[^"]*": )?)"(.*)"(,?)$/.exec(ligne);
      if (ligne.length <= LARGEUR || !m) return ligne;
      const [, tete, valeur, virgule] = m;
      const pieces = [];
      let reste = valeur;
      const place = LARGEUR - tete.length - 6;
      while (reste.length > place) {
        const dans = reste.slice(0, place);
        let coupe = Math.max(dans.lastIndexOf(' '), dans.lastIndexOf('|')) + 1;
        if (coupe === 0) coupe = place;
        while (reste[coupe - 1] === '\\') coupe -= 1;
        pieces.push(reste.slice(0, coupe));
        reste = reste.slice(coupe);
      }
      pieces.push(reste);
      const pas = `${/^\s*/.exec(tete)[0]}  `;
      return `${tete}"${pieces.join(`" +\n${pas}"`)}"${virgule}`;
    })
    .join('\n');
}

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
  return `// Généré par \`node scripts/frontieres.mjs --ecrire\` ; ne pas éditer. Les règles et les options
// propres au projet vivent dans .dependency-cruiser.projet.cjs, lu au chargement.
const fs = require('node:fs');
const projet = fs.existsSync(\`\${__dirname}/.dependency-cruiser.projet.cjs\`)
  ? require('./.dependency-cruiser.projet.cjs')
  : {};

// The non-empty patterns of a filter written in any form dependency-cruiser accepts.
const motifs = f => {
  if (typeof f === 'string') return [f];
  if (Array.isArray(f)) return f;
  return f && typeof f === 'object' ? motifs(f.path) : [];
};
// A filter of the frame plus the project's: the patterns add up, the other keys are the project's.
const ajoute = (cadre, propre) => {
  const ajouts = motifs(propre).filter(Boolean);
  const reste = propre && typeof propre === 'object' && !Array.isArray(propre) ? propre : {};
  return { ...reste, path: [cadre.path, ...ajouts].join('|') };
};
const cadre = {
  doNotFollow: { path: 'node_modules' },
  exclude: {
    path: [
${exclus(racine)
  .map(m => `      '${m.replace(/[\\']/g, '\\$&')}',`)
  .join('\n')}
    ].join('|'),
  },
  tsPreCompilationDeps: true,
  preserveSymlinks: true,
${tsconfig ? "  tsConfig: { fileName: 'tsconfig.json' },\n" : ''}  enhancedResolveOptions: {
    exportsFields: ['exports'],
    conditionNames: ['import', 'require', 'default', 'types'],
  },
};

module.exports = {
  forbidden: [
${regles.map(r => `${ecrire(r, '    ')},`).join('\n')}
    ...(projet.forbidden ?? []),
  ],
  ...(projet.allowed ? { allowed: projet.allowed } : {}),
  ...(projet.required ? { required: projet.required } : {}),
  ...(projet.allowedSeverity ? { allowedSeverity: projet.allowedSeverity } : {}),
  ...(projet.extends ? { extends: projet.extends } : {}),
  options: {
    ...cadre,
    ...projet.options,
    doNotFollow: ajoute(cadre.doNotFollow, projet.options?.doNotFollow),
    exclude: ajoute(cadre.exclude, projet.options?.exclude),
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
