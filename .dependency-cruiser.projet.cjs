// The repository's own rules of dependency-cruiser, which `grillhouse frontieres` adds to the
// frame's (.dependency-cruiser.cjs reads this file): the join of the languages of the package
// (packages/grillhouse/docs/CADRE.md, R3), as Nx's enforce-module-boundaries holds a plugin to
// `@nx/devkit`.
//
// - The core (`scripts/` and `bin/` of the package, out of `scripts/langages/`) imports a module of
//   language by the join alone, `scripts/langages.mjs`.
// - A module of language (`scripts/langages/<nom>/`) imports of the core its published entries
//   alone: the targets of the package's `exports` out of every module (./jointure gives it the
//   services of the core).
const path = require('node:path');
const { exports: entrees } = require('./packages/grillhouse/package.json');

const PAQUET = 'packages/grillhouse/';
const MODULES = `^${PAQUET}scripts/langages/`;
const echappe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The files of the core that its entries publish.
const publies = Object.values(entrees)
  .flatMap(e => (typeof e === 'string' ? [e] : Object.values(e)))
  .map(c => path.posix.join(PAQUET, c))
  .filter(c => /\.[cm]?js$/.test(c) && !new RegExp(MODULES).test(c));

module.exports = {
  forbidden: [
    {
      name: 'noyau-hors-de-la-jointure',
      comment:
        'le noyau importe un module de langage par la jointure seule (scripts/langages.mjs, packages/grillhouse/docs/CADRE.md, R3)',
      severity: 'error',
      from: {
        path: `^${PAQUET}(scripts|bin)/`,
        pathNot: [MODULES, `^${PAQUET}scripts/langages[.]mjs$`],
      },
      to: { path: MODULES },
    },
    {
      name: 'module-hors-des-entrees-du-noyau',
      comment:
        'un module de langage importe du noyau ses entrées publiées seules (./jointure lui donne les services du noyau)',
      severity: 'error',
      from: { path: `${MODULES}([^/]+)/` },
      to: {
        path: `^${PAQUET}(scripts|bin)/`,
        pathNot: [`${MODULES}$1/`, ...publies.map(c => `^${echappe(c)}$`)],
      },
    },
  ],
};
