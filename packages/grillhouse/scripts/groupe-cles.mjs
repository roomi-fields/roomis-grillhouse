// The reading of the key `grillhouse.groupe` of a package.json (grillhouse-pie), read as written:
// a list of projects, each by its path (absolute, or relative to the project's root), every
// project of the group, the project itself included. The projects of a group are ordered together:
// their tickets that wait for a place leave by priority (scripts/regles-des-places.mjs), and
// `grillhouse maj` writes the other projects of the group as the `external_projects` of the Beads
// of each (`bd ship` and `external:<project>:<capability>` dependencies resolve through them).
// Any other value is a fault, named by its key before any work.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

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
