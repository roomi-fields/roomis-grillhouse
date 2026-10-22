// The frame's base configuration of Vitest is the package's: `@roomi-fields/grillhouse/vitest-config`
// (and `/mesure`), in place of the workspace package `@grillhouse/vitest-config` that the frame's
// copied files held.
//
// - Each source file of the project (`.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`; node_modules,
//   .git, dist, coverage, .turbo, .claude, .beads, .codegraph and .rtfm left out) that names
//   `@grillhouse/vitest-config` or `@grillhouse/vitest-config/mesure` in quotes names the package's
//   instead; a root configuration that imports the base by its former path
//   (`./scripts/vitest-config/base.mjs`, `./packages/grillhouse/scripts/vitest-config/base.mjs`)
//   imports it by its name.
// - Each package.json of the project (the root's and each workspace's) that declares
//   `@grillhouse/vitest-config` declares `@roomi-fields/grillhouse` in the same field in its place,
//   at the range the root declares (else `^<version>` of the package), unless it already declares
//   it; the root's workspaces lose the former directory of the package (`scripts/vitest-config`,
//   `packages/grillhouse/scripts/vitest-config`).
// - A project already in the new form is not written.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { VERSION } from '../cadre.mjs';
import { paquets } from '../paquets.mjs';

export const version = '0.23.0';
export const nom = 'configuration de base de Vitest';

const ANCIEN = '@grillhouse/vitest-config';
const PAQUET = '@roomi-fields/grillhouse';
const NOUVEAU = `${PAQUET}/vitest-config`;
const ANCIENS_ESPACES = ['scripts/vitest-config', 'packages/grillhouse/scripts/vitest-config'];
const CHAMPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const EXTENSIONS = /\.(?:[mc]?ts|[mc]?js)$/;
const HORS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.turbo',
  '.claude',
  '.beads',
  '.codegraph',
  '.rtfm',
]);
// A quoted name of the former package, or a former path of the base at the root.
const NOMME =
  /(['"])(?:@grillhouse\/vitest-config(\/mesure)?|\.\/(?:packages\/grillhouse\/)?scripts\/vitest-config\/base\.mjs)\1/g;

function sources(racine, rel = '') {
  return readdirSync(path.join(racine, rel), { withFileTypes: true }).flatMap(e => {
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) return HORS.has(e.name) ? [] : sources(racine, r);
    return e.isFile() && EXTENSIONS.test(e.name) ? [r] : [];
  });
}

const lireJson = f => JSON.parse(readFileSync(f, 'utf8'));
const ecrireJson = (f, v) => writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);

/** Brings the project to the package's base configuration of Vitest; returns what it did. */
export function migrer(projet) {
  const lignes = [];
  for (const f of sources(projet)) {
    const texte = readFileSync(path.join(projet, f), 'utf8');
    const neuf = texte.replace(NOMME, (_, q, mesure) => `${q}${NOUVEAU}${mesure ?? ''}${q}`);
    if (neuf !== texte) {
      writeFileSync(path.join(projet, f), neuf);
      lignes.push(`${f} : importe ${NOUVEAU}`);
    }
  }
  const fracine = path.join(projet, 'package.json');
  if (!existsSync(fracine)) return lignes;
  const racine = lireJson(fracine);
  const plage = CHAMPS.map(c => racine[c]?.[PAQUET]).find(v => v !== undefined) ?? `^${VERSION}`;
  const declarer = pkg => {
    let change = false;
    for (const c of CHAMPS) {
      if (pkg[c]?.[ANCIEN] === undefined) continue;
      const { [ANCIEN]: _ancien, ...reste } = pkg[c];
      const deja = CHAMPS.some(d => pkg[d]?.[PAQUET] !== undefined);
      pkg[c] = Object.fromEntries(
        Object.entries(deja ? reste : { ...reste, [PAQUET]: plage }).sort(([a], [b]) =>
          a.localeCompare(b, 'en')
        )
      );
      change = true;
    }
    return change;
  };
  for (const { dossier, pkg } of paquets(projet)) {
    if (ANCIENS_ESPACES.includes(dossier) || !declarer(pkg)) continue;
    ecrireJson(path.join(projet, dossier, 'package.json'), pkg);
    lignes.push(`${dossier}/package.json : déclare ${PAQUET} à la place de ${ANCIEN}`);
  }
  const declare = declarer(racine);
  if (declare) lignes.push(`package.json : déclare ${PAQUET} à la place de ${ANCIEN}`);
  const liste = Array.isArray(racine.workspaces) ? racine.workspaces : racine.workspaces?.packages;
  const restants = Array.isArray(liste) ? liste.filter(e => !ANCIENS_ESPACES.includes(e)) : liste;
  const espaces = Array.isArray(liste) && restants.length !== liste.length;
  if (espaces) {
    racine.workspaces = Array.isArray(racine.workspaces)
      ? restants
      : { ...racine.workspaces, packages: restants };
    lignes.push(`package.json : l'ancien dossier de ${ANCIEN} quitte les workspaces`);
  }
  if (declare || espaces) ecrireJson(fracine, racine);
  return lignes;
}
