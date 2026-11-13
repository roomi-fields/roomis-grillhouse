// The copy of a template of the frame into a project that lacks the file: the update of a module
// of language (`miseAJour.appliquer`, scripts/jointure.d.ts) poses so the configuration of its
// tool at the root of a project, one template per form of repository, as `nx init` writes the
// configuration of a workspace once and leaves it to the project.
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Writes <fichier> at the root of the project at <projet> when it has none, from the template of
 * the source <source> that fits its form: <avecEspaces> when its package.json <p> declares
 * `workspaces`, else <sansEspaces>. A file present is the project's own, never written again.
 * Returns the template written, or null.
 * @param {string} projet
 * @param {string} source
 * @param {Record<string, unknown>} p
 * @param {{ fichier: string, avecEspaces: string, sansEspaces: string }} gabarits
 * @returns {string | null}
 */
export function poserLeGabaritAbsent(projet, source, p, { fichier, avecEspaces, sansEspaces }) {
  const f = path.join(projet, fichier);
  if (existsSync(f)) {
    return null;
  }
  const gabarit = p.workspaces !== undefined ? avecEspaces : sansEspaces;
  if (!existsSync(path.join(source, gabarit))) {
    return null;
  }
  copyFileSync(path.join(source, gabarit), f);
  return gabarit;
}
