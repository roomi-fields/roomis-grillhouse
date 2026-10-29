// The join of the languages: what the core asks of a module of language (docs/INTERFACE.md, « La
// jointure des langages »), the types of scripts/langages.mjs and scripts/conformite.mjs as the
// entries `@roomi-fields/grillhouse/jointure` and `@roomi-fields/grillhouse/conformite` publish
// them.

/** A component of the project: its folder (absolute), its name (the folder's), its package name. */
export interface Composant {
  dossier: string;
  nom: string;
  paquet: string | null;
}

/** A command a module describes: the absolute path of a Node script, and its arguments. */
export interface Commande {
  script: string;
  args: string[];
}

/** A task of a run, as its runner reports it; `code` null for a task that did not run. */
export interface TacheJouee {
  tache: string;
  paquet: string;
  dossier: string;
  script: string;
  code: number | null;
  cache: string | null;
  journal: string | null;
}

/** A test file of a run, its absolute path, and each test of it. */
export interface RapportDeTest {
  fichier: string;
  etat: string;
  message: string;
  tests: { titre: string; nom: string; etat: string; message: string }[];
}

/** A finding of a guard, as scripts/resultats.mjs reads it in SARIF. */
export interface Constat {
  message: string;
  garde?: string;
  regle?: string | null;
  fichier?: string | null;
  ligne?: number | null;
}

/** A file the module generates: what the circuit regenerates and judges (4.2 of the circuit). */
export interface FichierEngendre {
  nom: string;
  /** The command that writes it, a line of the shell. */
  commande: string;
  /** The patterns of its files, from the root. */
  fichiers: string[];
  /** The files of another generated file it reads. */
  lit: string[];
  /** The names its findings carry (their guard or their rule). */
  gardes: string[];
  /** The files of `fichiers` its command writes in full. */
  entiers: string[];
  /** The findings of its check on the repository at `racine`: none when it is up to date. */
  verifier(racine: string): Constat[];
}

/** What the testwriter writes in a file: a test the runner plays (`joue`), a test file or a file of
 * a folder of tests (`test`), a file of the shared test material (`matiere`); null for a file it
 * does not write. */
export type ClasseDeTest = { joue: boolean; test: boolean; matiere: boolean } | null;

/** The readers, by the code, of the elements a ticket names (composants-affectes). */
export interface Lecteurs {
  elements: {
    nom: string;
    fournisseur: Composant;
    lecteurs: { composant: Composant; par: string[] }[];
  }[];
  sansFournisseur: string[];
  types: {
    etat: string;
    raison: string | null;
    elements: {
      nom: string;
      declarations: { composant: Composant; publie: boolean }[];
      lecteurs: Map<Composant, Set<string>>;
    }[];
  };
  lit: Map<Composant, Set<Composant>>;
}

/** A module of language, the default export of `scripts/langages/<nom>/index.mjs`. */
export interface Langage {
  nom: string;
  composants(racine: string): Composant[];
  composantDe(racine: string, fichier: string): Composant | null;
  lecteurs(
    racine: string,
    o: { composants: Composant[]; noms: string[]; texte: string; nommes: Composant[] }
  ): Lecteurs;
  touches(
    racine: string,
    o: { depuis: string }
  ): { touches: Composant[]; dependants: Composant[]; horsGraphe: string[] };
  commandes(racine: string): { tester: Commande; verifier: Commande; typer: Commande };
  verdict(dossier: string): { rapports: RapportDeTest[]; taches: TacheJouee[] };
  estUnTest(chemin: string, racine: string): ClasseDeTest;
  fichiersEngendres(racine: string): FichierEngendre[];
  gardes(racine: string): string[][];
}

/** The frame's languages, each its module. */
export const LANGAGES: Record<string, string>;
/** The languages of a project that declares none. */
export const PAR_DEFAUT: string[];
/** The languages the project at `racine` declares (`grillhouse.langages`), or PAR_DEFAUT. */
export function langagesDeclares(racine: string): string[];
/** The module of the language that serves the project at `racine`. */
export function langageDe(racine: string): Langage;
