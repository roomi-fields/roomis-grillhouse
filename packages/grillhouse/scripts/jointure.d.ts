// The join of the languages: what the core asks of a module of language (docs/INTERFACE.md, « La
// jointure des langages »), the types of scripts/services-du-noyau.mjs (the join of scripts/langages.mjs and
// the services of the core to a module) and of scripts/conformite.mjs as the entries
// `@roomi-fields/grillhouse/jointure` and `@roomi-fields/grillhouse/conformite` publish them.

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

/** A task of a run, as its runner reports it; `code` null for a task that did not run, `tests`
 * true for the task that plays the tests of its component. */
export interface TacheJouee {
  tache: string;
  paquet: string;
  dossier: string;
  script: string;
  tests: boolean;
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

/** The elements a lot adds, changes or removes between two commits, each with its place. */
export interface ElementsDuLot {
  etat: 'fait' | 'impossible';
  raison: string | null;
  elements: {
    id: string;
    nom: string;
    genre: string;
    statut: string;
    paquet: string | null;
    fichier: string;
    ligne: number;
    exporte: boolean;
  }[];
  /** The changed sources the module reads no element of: the reviewer surveys them himself. */
  horsDuService: string[];
  /** Every file the lot changes, a source or not. */
  fichiers: string[];
}

/** A migration of a project from one version of the frame to the next (scripts/migrations.mjs). */
export interface Migration {
  version: string;
  nom: string;
  migrer(projet: string): (string | { aFaire: string })[];
  restes?(projet: string): string[];
}

/** A generator of the frame the update runs in a project, by the project's command
 * (`grillhouse <commande> <args>`). */
export interface Generateur {
  commande: string;
  args: string[];
  /** The file it writes, from the root: it runs where the project holds that file (every one for a
   * project `grillhouse init` creates); null, it runs in every project whose package.json declares
   * `workspaces`. */
  sortie: string | null;
}

/** What the module brings to the update of a project (`grillhouse maj`), as each plugin of Nx
 * brings its `init` generator. */
export interface MiseAJour {
  /** The directory of the frame's template of a project of the language, from the frame's files:
   * its package.json gives the frame's scripts and the versions of the tools. */
  gabarit: string;
  /** Brings the project at `projet` to the form the module asks: its root package.json `p`, which
   * the core writes after, and its other files, from the frame's files at `source` (its template's
   * package.json `modele`; `version`, the frame's). Its share of the update: `bilan`, the changes by
   * name, each null when nothing changes; `lignes`, the lines of the report; `aFaire`, what the
   * update leaves to the project, each line naming its gesture, written on the error stream, the
   * code 1 and the verification not played; `installer`, whether `npm install` comes before the
   * verification; `sansVerifier`, the line that says why the project has no script `verifier`,
   * null for the core's. */
  appliquer(
    projet: string,
    o: {
      p: Record<string, unknown>;
      modele: Record<string, unknown>;
      source: string;
      version: string;
    }
  ): {
    bilan: Record<string, unknown>;
    lignes: string[];
    aFaire: string[];
    installer: boolean;
    sansVerifier: string | null;
  };
  /** The generators the update runs after the package.json. */
  generateurs: Generateur[];
  /** How the binaries of the language (`binaires`) are installed, null without any: `liste`, the
   * command that writes on its standard output the binaries installed, `{ <nom>: <version> }` in
   * JSON; `installer`, the command that installs one at its version. The core runs them, each by
   * Node, and reports the error stream of a failure. */
  installation: {
    liste: Commande;
    installer(nom: string, version: string): Commande;
  } | null;
}

/** A module of language, the default export of `scripts/langages/<nom>/index.mjs`. */
export interface Langage {
  nom: string;
  /** Whether the repository at `racine` holds code of this language, which the update declares. */
  trouve(racine: string): boolean;
  /** What `trouve` looks for, in words: the refusal of the update names it. */
  signe: string;
  /** The tools a project of this language installs, optional peers of the package. */
  outils: string[];
  /** The binaries a project of this language installs on the machine, each at its exact version:
   * the update installs each one missing or at another version (`miseAJour.installation`). */
  binaires: Record<string, string>;
  /** The directories the language's tools write in a project, by name: the source files leave them
   * out, and the update writes them in the project's `.gitignore`. */
  ignorer: string[];
  /** Where a run of the language's tools writes, which the envelope opens to a session. */
  sorties: {
    /** Opened in writing: from the root of the copy, from the home (`~/…`), or from the main
     * tree (`//…`), a store shared by every copy; each created before the session, a directory
     * when it ends with `/`, else an empty file. */
    ecrites: string[];
    /** Proper to the session: from the root of the copy and of each component of the shared test
     * material, where the session does not write them, an empty directory. */
    propres: string[];
    /** Read by the tools, from the home (`~/…`) or the main tree (`//…`), mounted read-only
     * before what is written inside them; one absent is not mounted. */
    lues: string[];
  };
  /** The rules of Claude Code that refuse a role that writes the test tool run directly (charter,
   * « Aucun agent ne lance l'outil de test directement »). */
  droits: string[];
  composants(racine: string): Composant[];
  composantDe(racine: string, fichier: string): Composant | null;
  matieres(racine: string): Composant[];
  /** Whether the component plays tests: the runner of the language has tests to play in it. */
  joueDesTests(racine: string, composant: Composant): boolean;
  lecteurs(
    racine: string,
    o: { composants: Composant[]; noms: string[]; texte: string; nommes: Composant[] }
  ): Lecteurs;
  touches(
    racine: string,
    o: { depuis: string }
  ): { touches: Composant[]; dependants: Composant[]; horsGraphe: string[] };
  elementsDuLot(racine: string, o: { avant: string; apres: string }): ElementsDuLot;
  commandes(
    racine: string
  ): { tester: Commande; verifier: Commande; typer: Commande } & Record<string, Commande>;
  verdict(dossier: string): { rapports: RapportDeTest[]; taches: TacheJouee[] };
  estUnTest(chemin: string, racine: string): ClasseDeTest;
  fichiersEngendres(racine: string): FichierEngendre[];
  gardes(racine: string): string[][];
  migrations: Migration[];
  miseAJour: MiseAJour;
}

/** The frame's languages, each its module. */
export const LANGAGES: Record<string, string>;
/** The languages the project at `racine` declares (`grillhouse.langages`), empty for none. */
export function langagesDeclares(racine: string): string[];
/** The languages of the frame whose module finds its code in the repository at `racine`. */
export function langagesTrouves(racine: string): string[];
/** The module of the language that serves the project at `racine`; throws when it declares none. */
export function langageDe(racine: string): Langage;

// The services of the core to a module of language, which imports of the core its published
// entries alone (.dependency-cruiser.projet.cjs of the frame's repository).

/** The plan of the envelope of an agent, its packages (scripts/enveloppe/paquets-du-plan.mjs). */
export function paquetsDeLEnveloppe(env?: NodeJS.ProcessEnv): string[] | null;
/** The packages of a plan written by `ecrireLaListe`. */
export function lireLaListe(texte: string): string[];
/** The variable naming the directory of the progress of a pass (scripts/mesure/avancement.mjs). */
export const AVANCEMENT: string;
/** Writes the progress of the task `nom` in the directory `dossier`. */
export function ecrireTache(
  dossier: string,
  nom: string,
  o: { hash?: string | null; faits: number; prevus: number }
): void;
/** Opens the progress of a pass (scripts/avancement.mjs): its directory. */
export function ouvrirAvancement(o: {
  racine: string;
  genre?: string | null;
  dans?: string;
  debut?: number;
}): string;
/** Writes the plan of the tasks of a pass in its progress. */
export function inscrireLePlan(dossier: string, o: { racine: string; taches: unknown[] }): void;
/** Keeps the total of a pass that ended, for the next one's measure. */
export function garderLeTotal(dossier: string, racine: string): void;
/** Writes the measure of a pass. */
export function ecrireLaMesure(o: {
  env?: NodeJS.ProcessEnv;
  depot: string;
  commande: string;
  dossier: string;
}): void;
/** Opens the base of a pass of the kind `genre` (scripts/mesure/base-de-passe.mjs). */
export function ouvrirBase(genre: string, o?: { dans?: string }): unknown;
/** The line of the guard of a pass of tests, what its tests left in their temporary directory
 * named; null when they left nothing. */
export function ligneDesRestes(restes: string[]): string | null;
/** Runs `retirer` when the process is interrupted, then lets the signal end it; the removal of
 * the handlers. */
export function retirerALInterruption(retirer: () => void): () => void;
/** The pressure of the processor above which a pass is « à repasser » (scripts/mesure/pression.mjs). */
export const SEUIL_PRESSION: number;
/** The exit code of a pass « à repasser ». */
export const A_REPASSER: number;
/** The longest wait for the rest of the machine, in milliseconds. */
export const BORNE_ATTENTE_MS: number;
/** The pressure of the processor, in percent, or null when it cannot be read. */
export function lirePression(fichier?: string): number | null;
/** The pressure `p` as a line says it. */
export function ecrirePression(p: number | null): string;
/** Waits for the rest of the machine, within its bound. */
export function attendreLeRepos(o?: Record<string, unknown>): unknown;
/** The variable naming the files changed since the last green (scripts/dernier-vert.mjs). */
export const CHANGEMENTS: string;
/** The variable naming the commit of the last green a run measures itself from. */
export const DEPUIS_LE_VERT: string;
/** Keeps the green of a pass, which the next one measures itself from. */
export function garderLeVert(etat: unknown): void;
/** The measure of the repository at `racine` against its last green. */
export function mesure(racine: string, o?: { tout?: boolean; dans?: string }): unknown;
/** The wait for the lock of the machine, ended without it (scripts/verrou-de-machine.mjs). */
export class AttenteDeLaMachine extends Error {}
/** Runs `faire` under the lock of the machine. */
export function avecLaMachine(...args: unknown[]): unknown;
/** The source files of the project at `racine` under `dossier`, as paths from `racine`, what the
 * tools of its language write left out (scripts/sources.mjs). */
export function sources(racine: string, dossier?: string): string[];
/** True when the text of a ticket's comment is an arbitrage (scripts/arbitrages.mjs). */
export function estArbitrage(text: string | null | undefined): boolean;
/** True when the arbitrage `a` of `comments` is settled. */
export function arbitrageTranche(comments: { text: string }[], a: { text: string }): boolean;
