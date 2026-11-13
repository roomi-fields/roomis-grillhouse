// The types of the reading of the key `grillhouse.groupe` (./groupe-cles.mjs).

/** A project of a group: its folder's name (the key of Beads' `external_projects`), its absolute path. */
export interface ProjetDuGroupe {
  nom: string;
  chemin: string;
}

/** The group a package.json declares: the same `id` for every project that declares the same paths. */
export interface GroupeDeclare {
  id: string;
  projets: ProjetDuGroupe[];
}

/** The group declared (null without the key or on a fault), and each fault by its key and value. */
export function lireGroupe(
  pkg: unknown,
  racine: string
): { groupe: GroupeDeclare | null; fautes: Array<{ cle: string; valeur: string }> };

/** The `external_projects` of the Beads of the project at <racine>: the other projects of its group. */
export function projetsExternes(
  groupe: { projets: ProjetDuGroupe[] },
  racine: string
): Record<string, string>;
