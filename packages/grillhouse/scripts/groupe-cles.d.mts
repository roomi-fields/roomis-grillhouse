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

/**
 * The group of the project that holds <dir> (its main tree or a copy), read in the package.json of
 * its main tree; null without the key. Throws the faults of the key.
 */
export function groupeDe(dir: string): GroupeDeclare | null;

/** A fault of the key, or a path of it that leads to no project of the frame. */
export interface SignalementDuGroupe {
  cle: string;
  valeur: string;
  motif: 'sans-projet' | 'refusee';
  /** The reading refuses the entry, which drops the whole group. */
  ignore: boolean;
}

/** Each signalement of the key of the project that holds <dir>, read in its main tree. */
export function signalementsDuGroupe(dir: string): SignalementDuGroupe[];

/** The line the start of a session says for each signalement. */
export function lignesDuGroupe(dir: string): string[];

/** The `external_projects` of the Beads of the project at <racine>: the other projects of its group. */
export function projetsExternes(
  groupe: { projets: ProjetDuGroupe[] },
  racine: string
): Record<string, string>;
