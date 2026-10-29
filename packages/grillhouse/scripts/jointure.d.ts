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

/** A module of language, the default export of `scripts/langages/<nom>/index.mjs`. */
export interface Langage {
  nom: string;
  composants(racine: string): Composant[];
  composantDe(racine: string, fichier: string): Composant | null;
  matieres(racine: string): Composant[];
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
}

/** The frame's languages, each its module. */
export const LANGAGES: Record<string, string>;
/** The languages of a project that declares none. */
export const PAR_DEFAUT: string[];
/** The languages the project at `racine` declares (`grillhouse.langages`), or PAR_DEFAUT. */
export function langagesDeclares(racine: string): string[];
/** The module of the language that serves the project at `racine`. */
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
/** True when the text of a ticket's comment is an arbitrage (scripts/arbitrages.mjs). */
export function estArbitrage(text: string | null | undefined): boolean;
/** True when the arbitrage `a` of `comments` is settled. */
export function arbitrageTranche(comments: { text: string }[], a: { text: string }): boolean;
