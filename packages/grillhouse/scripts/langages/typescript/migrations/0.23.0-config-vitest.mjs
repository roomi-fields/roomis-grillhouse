// The frame's base configuration of Vitest is the package's: `@roomi-fields/grillhouse/vitest-config`
// (and `/mesure`), in place of the workspace package `@grillhouse/vitest-config` that the frame's
// copied files held.
//
// - A migration of the module typescript (../index.mjs), which a project of TypeScript plays.
// - Each source file of the project (`sources` of the core) that names
//   `@grillhouse/vitest-config` or `@grillhouse/vitest-config/mesure` in quotes names the package's
//   instead; a root configuration that imports the base by its former path
//   (`./scripts/vitest-config/base.mjs`, `./packages/grillhouse/scripts/vitest-config/base.mjs`)
//   imports it by its name. The migration of the copies (scripts/migrations/0.23.2-copies-du-cadre.mjs)
//   still knows a former copy of the frame so rewritten by its fingerprint.
// - Each package.json of the project (the root's and each workspace's) that declares
//   `@grillhouse/vitest-config` declares `@roomi-fields/grillhouse` in the same field in its place,
//   at the range the root declares (else `^<version>` of the package), unless it already declares
//   it; the root's workspaces lose the former directory of the package (`scripts/vitest-config`,
//   `packages/grillhouse/scripts/vitest-config`).
// - A project already in the new form is not written.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { paquets } from '../../../paquets.mjs';
import { sources } from '../../../services-du-noyau.mjs';

// The version of the frame's package, read by its published entry `./package.json`.
const VERSION = createRequire(import.meta.url)('@roomi-fields/grillhouse/package.json').version;

export const version = '0.23.0';
export const nom = 'configuration de base de Vitest';

const ANCIEN = '@grillhouse/vitest-config';
const PAQUET = '@roomi-fields/grillhouse';
const NOUVEAU = `${PAQUET}/vitest-config`;
const ANCIENS_ESPACES = ['scripts/vitest-config', 'packages/grillhouse/scripts/vitest-config'];
const CHAMPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
// A quoted name of the former package, or a former path of the base at the root.
const NOMME =
  /(['"])(?:@grillhouse\/vitest-config(\/mesure)?|\.\/(?:packages\/grillhouse\/)?scripts\/vitest-config\/base\.mjs)\1/g;

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
