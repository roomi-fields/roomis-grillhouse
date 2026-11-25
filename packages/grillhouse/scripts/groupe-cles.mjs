// The reading of the key `grillhouse.groupe` of a package.json, read as written:
// a list of projects, each by its path (absolute, or relative to the project's root), every
// project of the group, the project itself included. The projects of a group are ordered together:
// their tickets that wait for a place leave by priority (scripts/regles-des-places.mjs), and
// `grillhouse maj` writes the other projects of the group as the `external_projects` of the Beads
// of each (`bd ship` and `external:<project>:<capability>` dependencies resolve through them).
// Any other value is a fault, named by its key before any work. The board and the start of a
// session signal each fault, and each path that leads to no project of the frame
// (`signalementsDuGroupe`).
// The key is the project's: `groupeDe` reads it in the package.json of the main tree of the
// repository, never of a copy, and resolves its relative paths from that tree, so that a command
// launched in a copy of work reads the same group as one launched in the main tree.
// Architecture: docs/architecture/machine.md (§5.4), greffon.md (§5.1).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NOM_DU_PAQUET } from './aiguillage.mjs';
import { arbrePrincipal } from './outils-cles.mjs';

/**
 * The group a package.json <pkg> declares, read from the project at <racine>.
 * Returns { groupe, fautes }: `groupe` null without the key or on a fault, else `{ id, projets }`
 * (`projets`: each `{ nom, chemin }`, `nom` the folder of the project, the key of Beads'
 * `external_projects`, `chemin` absolute; `id` the same for every project that declares the same
 * paths, in any order); `fautes` each `{ cle, valeur }`, the key it names and the value read.
 * @param {unknown} pkg
 * @param {string} racine
 * @returns {{ groupe: { id: string, projets: { nom: string, chemin: string }[] } | null,
 *   fautes: { cle: string, valeur: string }[] }}
 */
export function lireGroupe(pkg, racine) {
  const liste = pkg?.grillhouse?.groupe;
  if (liste === undefined) {
    return { groupe: null, fautes: [] };
  }
  if (!Array.isArray(liste) || liste.length === 0) {
    return {
      groupe: null,
      fautes: [{ cle: 'grillhouse.groupe', valeur: JSON.stringify(liste) }],
    };
  }
  const fautes = [];
  const projets = [];
  const vus = new Set();
  liste.forEach((v, i) => {
    const cle = `grillhouse.groupe[${i}]`;
    if (typeof v !== 'string' || v.trim() === '') {
      fautes.push({ cle, valeur: JSON.stringify(v) ?? String(v) });
      return;
    }
    const chemin = path.resolve(racine, v);
    if (!existsSync(chemin) || vus.has(chemin)) {
      fautes.push({ cle, valeur: JSON.stringify(v) });
      return;
    }
    vus.add(chemin);
    projets.push({ nom: path.basename(chemin), chemin });
  });
  if (fautes.length > 0) {
    return { groupe: null, fautes };
  }
  const id = createHash('sha256')
    .update([...vus].sort().join('\n'))
    .digest('hex')
    .slice(0, 12);
  return { groupe: { id, projets }, fautes: [] };
}

/**
 * The group of the project that holds <dir>, from the package.json of its main tree, its relative
 * paths resolved from that tree; null without the key, or without a package.json that reads.
 * @param {string} dir a directory of the project: its main tree or a copy
 * @returns {{ id: string, projets: { nom: string, chemin: string }[] } | null}
 * @throws {Error} the faults of the key, each named by its key and its value
 */
export function groupeDe(dir) {
  const racine = arbrePrincipal(dir);
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  const { groupe, fautes } = lireGroupe(pkg, racine);
  if (fautes.length > 0) {
    throw new Error(
      `⛔ ${fautes.map(f => `${f.cle} vaut ${f.valeur}, pas un chemin de projet existant, une fois`).join(' ; ')}.`
    );
  }
  return groupe;
}

// The package.json of the directory <dossier>; null when none reads.
function paquetDe(dossier) {
  try {
    return JSON.parse(readFileSync(path.join(dossier, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

// A project of the frame: its package.json declares the frame's package, as the greffon's mod
// recognises one.
function estUnProjetDuCadre(dossier) {
  const p = paquetDe(dossier);
  return [p?.dependencies, p?.devDependencies].some(d => Object.hasOwn(d ?? {}, NOM_DU_PAQUET));
}

/**
 * What the key of the project that holds <dir> gets wrong, read in the package.json of its main
 * tree: each entry whose path leads to no project of the frame, the project itself apart (`motif`
 * « sans-projet »), and each other fault of the key (« refusee »: a duplicate, a malformed value),
 * in the order of the entries. `ignore` is true when the reading refuses the entry, which drops the
 * whole group; false for a folder that exists and is no project of the frame. Empty without the
 * key, or without a package.json that reads.
 * @param {string} dir a directory of the project: its main tree or a copy
 * @returns {{ cle: string, valeur: string, motif: 'sans-projet' | 'refusee', ignore: boolean }[]}
 */
export function signalementsDuGroupe(dir) {
  const racine = arbrePrincipal(dir);
  const pkg = paquetDe(racine);
  const refusees = new Map(lireGroupe(pkg, racine).fautes.map(f => [f.cle, f.valeur]));
  const liste = pkg?.grillhouse?.groupe;
  if (!Array.isArray(liste) || liste.length === 0) {
    return [...refusees].map(([cle, valeur]) => ({ cle, valeur, motif: 'refusee', ignore: true }));
  }
  return liste.flatMap((v, i) => {
    const cle = `grillhouse.groupe[${i}]`;
    const chemin = typeof v === 'string' && v.trim() !== '' ? path.resolve(racine, v) : null;
    const sansProjet =
      chemin !== null && chemin !== path.resolve(racine) && !estUnProjetDuCadre(chemin);
    const ignore = refusees.has(cle);
    if (!sansProjet && !ignore) {
      return [];
    }
    return [
      {
        cle,
        valeur: refusees.get(cle) ?? JSON.stringify(v),
        motif: sansProjet ? 'sans-projet' : 'refusee',
        ignore,
      },
    ];
  });
}

/**
 * The line the start of a session says for each of `signalementsDuGroupe`.
 * @param {string} dir
 * @returns {string[]}
 */
export function lignesDuGroupe(dir) {
  return signalementsDuGroupe(dir).map(({ cle, valeur, motif, ignore }) => {
    const constat =
      motif === 'sans-projet'
        ? 'ce chemin ne mène à aucun projet du cadre'
        : 'la valeur est refusée (un chemin de projet existant, une fois)';
    const effet = ignore
      ? 'le groupe entier est ignoré (ni les questions de ses projets, ni leur ordre de places)'
      : "aucune question de circuit n'en vient";
    return `⚠️ ${cle} vaut ${valeur} : ${constat} ; ${effet}. Corrige la clé dans le package.json de la racine.`;
  });
}

/**
 * The `external_projects` of the Beads of the project at <racine>: the other projects of its
 * <groupe>, `{ <nom>: <chemin> }`, each path relative to <racine>, the root of its main tree:
 * `.beads/config.yaml` is committed, and a relative path keeps the local tree out of it and holds
 * on every machine where the projects sit side by side.
 * @param {{ projets: { nom: string, chemin: string }[] }} groupe
 * @param {string} racine
 * @returns {Record<string, string>}
 */
export function projetsExternes(groupe, racine) {
  const soi = path.resolve(racine);
  return Object.fromEntries(
    groupe.projets.filter(p => p.chemin !== soi).map(p => [p.nom, path.relative(soi, p.chemin)])
  );
}
