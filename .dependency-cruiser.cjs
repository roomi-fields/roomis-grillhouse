// Généré par `node scripts/frontieres.mjs --ecrire` ; ne pas éditer. Les règles propres au
// projet vivent dans .dependency-cruiser.projet.cjs.
const fs = require('node:fs');
const projet = fs.existsSync(`${__dirname}/.dependency-cruiser.projet.cjs`)
  ? require('./.dependency-cruiser.projet.cjs')
  : { forbidden: [] };

module.exports = {
  forbidden: [
    {"name":"pas-de-cycle","comment":"aucun module ne dépend de lui-même par un détour","severity":"error","from":{},"to":{"circular":true}},
    {"name":"un-paquet-par-son-nom","comment":"un paquet en importe un autre par son nom, jamais par un chemin dans son arbre","severity":"error","from":{"path":"^packages/([^/]+)/"},"to":{"path":"^packages/([^/]+)/","pathNot":"^packages/$1/"}},
    {"name":"un-module-par-son-entree","comment":"un module de src en importe un autre par son entrée (index), jamais par l'intérieur","severity":"error","from":{"path":"^src/([^/]+)/"},"to":{"path":"^src/([^/]+)/","pathNot":"^src/$1/|^src/[^/]+/index[.][a-z]+$"}},
    {"name":"pas-de-test-dans-le-code","comment":"le code livré n'importe aucun test","severity":"error","from":{"path":"^src/|^packages/[^/]+/src/","pathNot":"(^|/)(test|tests|__tests__)/|[.](test|spec)[.][a-z]+$"},"to":{"path":"(^|/)(test|tests|__tests__)/|[.](test|spec)[.][a-z]+$"}},
    {"name":"pas-d-outil-de-developpement-dans-le-code","comment":"le code livré n'importe aucune dépendance de développement","severity":"error","from":{"path":"^src/|^packages/[^/]+/src/","pathNot":"(^|/)(test|tests|__tests__)/|[.](test|spec)[.][a-z]+$"},"to":{"dependencyTypes":["npm-dev"],"dependencyTypesNot":["type-only"]}},
    {"name":"tout-import-se-resout","comment":"un import se résout : un chemin qu'un paquet n'exporte pas est refusé","severity":"error","from":{},"to":{"couldNotResolve":true}},
    {"name":"pas-d-orphelin","comment":"un fichier que rien n'importe est signalé","severity":"warn","from":{"orphan":true,"pathNot":"(^|/)(test|tests|__tests__)/|[.](test|spec)[.][a-z]+$|(^|/)index[.][a-z]+$|[.]d[.]ts$|[.]config[.][a-z]+$"},"to":{}},
    ...projet.forbidden,
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(dist|build|coverage)/|^packages/[^/]+/(dist|build|coverage)/' },
    tsPreCompilationDeps: true,
    preserveSymlinks: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'default', 'types'],
    },
  },
};
