// The types of ./consommateurs.mjs as the entry `@roomi-fields/grillhouse/consommateurs`
// publishes it, for a project's guard over the shared test material.

/**
 * The components of `racine` whose `package.json` exports `./test-fixtures`, a package out of the
 * frame never one: the packages of the shared test material.
 */
export function matieres(racine: string): { nom: string; dir: string; paquet: string | null }[];
