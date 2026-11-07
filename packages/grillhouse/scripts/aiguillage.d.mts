// The types of ./aiguillage.mjs, for the frame's TypeScript (src/temporal/installation.ts) and its
// tests.

/** The key of the project's package.json that names its version of the frame. */
export const CLE: string;
/** The name of the frame's package. */
export const NOM_DU_PAQUET: string;
/** A version x.y.z. */
export const X_Y_Z: RegExp;
/** The subcommands of the orchestration, which the published version runs. */
export const REDIRIGEES: Set<string>;
/** The subcommands of the code that runs, the ticket's copy for a session of the circuit. */
export const DU_CODE_EN_COURS: Set<string>;
/** The tools of the repository. */
export const OUTILS_DU_DEPOT: Set<string>;

/** The cache of the versions installed under the home <maison>, ~/.cache/grillhouse/outil by default. */
export function cacheDesOutils(maison?: string): string;
/** The folder of the version <version> under <cache>. */
export function dossierDeLOutil(version: string, cache?: string): string;
/** The version the project at <racine> names, or null; throws on a value that is no version. */
export function versionDeLOutil(racine?: string): string | null;
/** Where the subcommand <nom> runs in the project at <racine>, or null for the code that runs. */
export function aiguillage(
  nom: string,
  options?: { racine?: string; cache?: string; paquet?: string }
): { version: string; dossier: string; commande: string } | null;
/** The failed installation of the version the project at <racine> names, or null. */
export function echecDeLOutil(
  racine?: string,
  options?: { cache?: string }
): { version: string; raison: string; date: string } | null;
/** Installs the published version <version> under <cache>: its folder, and whether it laid it down. */
export function installer(
  version: string,
  options?: { cache?: string; npm?: string; retenue?: number }
): { dossier: string; installe: boolean };
