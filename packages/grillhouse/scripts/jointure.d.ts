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

/** What the testwriter writes of the manifests, as the author of a test of Bazel declares the deps
 * of its target: the part of a component's manifest that declares what its tests depend on, and
 * the lock files of the versions. */
export interface Manifestes {
  /** The lock files of the versions, from the root: the testwriter writes them, and the envelope
   * opens them to him. */
  verrous: string[];
  /** The parts of a file of a component at `chemin` (absolute, or from `racine`) that change from
   * `avant` (null: no file) to `apres` out of the part of its tests, each named, empty for none:
   * of its manifest, the part that declares what its tests depend on; for cargo, of a file of code
   * of `src/`, its test module. Null for a file the module does not judge. */
  horsDesTests(
    chemin: string,
    racine: string,
    avant: string | null,
    apres: string
  ): string[] | null;
}

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
  /** What each component reads: its production code, and its dependencies of every kind. */
  lit: Map<Composant, Set<Composant>>;
  /** What each component's tests read: the components they import, its dependencies of
   * development. */
  parLesTests: Map<Composant, Set<Composant>>;
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

/** What the core asks of the languages of a project: a module of language, or the composition of
 * the modules a project declares (scripts/composition-des-langages.mjs), whose name joins theirs
 * with `+`. */
export interface Composition {
  nom: string;
  /** The tools a project of this language installs, optional peers of the package. */
  outils: string[];
  /** The binaries a project of this language installs on the machine, each at its exact version:
   * the update installs each one missing or at another version (`miseAJour.installation`). */
  binaires: Record<string, string>;
  /** The directories the language's tools write in a project, by name: the source files leave them
   * out, the update writes them in the project's `.gitignore`, and the removal of the finished
   * copies removes them from a kept copy whose ticket is closed (scripts/copies-finies.mjs). */
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
  /** The hashes of the inputs of the tests tasks of the components `noms` (their package names)
   * and of their dependents, `{ <paquet>: <hash> }`, as the task runner plans them (the hash of a
   * task covers the content of the files it reads and of what it waits for); null when the runner
   * gives no plan. The fingerprint of a step of the circuit reads them. */
  empreintes(racine: string, noms: string[]): Record<string, string> | null;
  /** The environment the tools of the language run under on the poste, from `env`: the variables
   * of the file of the poste the module names (`avecLeFichierDuPoste`), the server of the remote
   * cache of its task runner, read-only; `env` itself without the file, or when `env` already
   * names one of its variables (a CI). The commands of the module run under it. */
  environnementDuPoste(env: Record<string, string | undefined>): Record<string, string | undefined>;
  lecteurs(
    racine: string,
    o: { composants: Composant[]; noms: string[]; texte: string; nommes: Composant[] }
  ): Lecteurs;
  elementsDuLot(racine: string, o: { avant: string; apres: string }): ElementsDuLot;
  commandes(
    racine: string
  ): { tester: Commande; verifier: Commande; typer: Commande } & Record<string, Commande>;
  verdict(dossier: string): { rapports: RapportDeTest[]; taches: TacheJouee[] };
  estUnTest(chemin: string, racine: string): ClasseDeTest;
  /** Whether the test file `chemin` (from `racine`) is out of the day, one that only the night
   * plays (a night test, a time budget bench, a time witness), by the module's own definitions;
   * false for any other file. */
  horsDuJour(chemin: string, racine: string): boolean;
  /** Optional, for a tool that reads a test file beside it (typescript): the sibling of HEAD's
   * version of the test file `chemin` (from `racine`), from the root: a file beside it, a test
   * the tool plays in the same run as it, its tests named in the run's report as the file's, of
   * its class (day, night, bench), which the proof of the red writes, plays and removes; null for
   * a file that has none. */
  soeurDAvant?(chemin: string, racine: string): string | null;
  /** Whether HEAD's version of the test file `chemin` (from `racine`) plays in a tree of its own,
   * the copy's with that file alone replaced, under the file's own name, which the proof of the
   * red builds, plays and removes (cargo, python); false for a file the tool cannot play so
   * (cargo: a target `tests/<dossier>/main.rs`, a unit test of `src/`: `testsDeHead`), plays
   * beside it (typescript: `soeurDAvant`) or does not play. */
  arbreDAvant(chemin: string, racine: string): boolean;
  /** The environment a tree of HEAD's version of `chemin` plays under (cargo: the target
   * directory of the copy's compilations); empty for none. */
  envDArbre(chemin: string, racine: string): Record<string, string>;
  /** The names of the tests of HEAD's version of the test file `chemin` (from `racine`), as the
   * verdict names them, read without playing them, for a file whose tree the proof does not play
   * (cargo: a unit test of `src/`, a target `tests/<dossier>/main.rs`, its out-of-line modules read
   * too), or whose tree breaks the build of its package while the lot alone builds (cargo: a
   * target `tests/<nom>.rs` whose HEAD's version no longer compiles against the lot's
   * `tests/common`, grillhouse-3e2.2); the proof of the red holds each for a green HEAD already
   * holds. `lire` gives HEAD's text of a file from the root, null for none. Null for any other
   * file, or one HEAD does not hold. */
  testsDeHead(
    chemin: string,
    racine: string,
    lire: (fichier: string) => string | null
  ): string[] | null;
  manifestes: Manifestes;
  fichiersEngendres(racine: string): FichierEngendre[];
  gardes(racine: string): string[][];
  migrations: Migration[];
}

/** A module of language, the default export of `scripts/langages/<nom>/index.mjs`. */
export interface Langage extends Composition {
  /** The programs of this language's toolchain (`cargo`, `python3`) that the installer of Temporal
   * requires in its PATH, each refused by its name when absent; none for TypeScript, Node being a
   * tool of the account. */
  executables: string[];
  /** The manifest of a package of this language, in its folder (`package.json`, `Cargo.toml`):
   * the guard of the languages asks it of a package the architecture declares of this language. */
  manifeste: string;
  /** The name the text of a manifest of this language gives its package (the `name` of a
   * `package.json`, of the `[package]` of a `Cargo.toml`, of the `[project]` of a
   * `pyproject.toml`); null for none. */
  nomDuManifeste(texte: string): string | null;
  /** The internal dependencies the manifest of the package at `chemin` (from `racine`) links by a
   * path or a workspace entry, as the names of the packages (`nomA` gives the name of the package
   * whose manifest lies in a folder, null for none; a dependency without one keeps its key);
   * `table` names where the manifest links them and `outil` the tool that builds by them. None for
   * a language whose manifest is the package.json. */
  liensDuManifeste(
    racine: string,
    chemin: string,
    nomA: (dossier: string) => string | null
  ): { noms: string[]; table: string; outil: string };
  /** Builds the packages `noms` (by their package.json name) of the project in the working
   * directory, before the tests of a package that declares them as data; throws, named, on a
   * failure. Held by the module of the language whose manifest is the package.json. */
  construireLesPaquets(noms: string[]): void;
  /** The absolute path of the output `sortie` that the package at `chemin` (from `racine`) builds,
   * which another package's tests run (`grillhouse.donnees`, scripts/donnees-cles.mjs): for a
   * crate, a binary of `cargo metadata` in its target directory, `release` or `debug` as `release`
   * says. Throws, named, for a package without that output, and « sortie non prise en charge pour
   * <langage> » for a language whose outputs are not data. */
  sortieDuPaquet(
    racine: string,
    chemin: string,
    sortie: string,
    options?: { release?: boolean }
  ): string;
  /** The entries of the index of the interfaces, one per interface of the module's components and
   * the root's, `lignes` as the index writes them, which the core assembles for a project of
   * several languages (scripts/index-interfaces.mjs). */
  entreesDeLIndex(racine: string): { rel: string; lignes: string[] }[];
  miseAJour: MiseAJour;
  /** The skeleton of a new package of this language at `chemin` (from the root) of the project at
   * `racine`, without behaviour nor test, as `cargo new --lib` or `nx g @nx/js:lib` writes one
   * (`grillhouse paquet`, scripts/paquet.mjs): `fichiers`, each file of the package from the root
   * and its text (its manifest, the configuration of its tests and of its typing, a file of code,
   * its folder of tests), which the core writes where absent; `espace`, the manifest of the
   * workspace with the package's entry, from the root and its new text, null when it holds it
   * already; `verrouiller`, the commands, each run in its `dossier` (from the root) in their order,
   * that bring the lock of the versions in line with the new package, as `uv add -r` takes the
   * dependencies a file declares. `modele`: the package.json of the module's template
   * (`miseAJour.gabarit`), the versions of its tools; `existants`: the files the folder already
   * holds, from it, its docs/, its hidden entries and the directories the sources of the project
   * leave out (`hors` of scripts/sources.mjs: node_modules, dist, each `ignorer`) left out, which the
   * skeleton takes as they are (as `cargo init` takes the code in place). Throws, named, for a
   * path where the module holds no package, and for a folder whose files it cannot take, what is
   * missing named. */
  squelette(
    racine: string,
    o: { chemin: string; modele: Record<string, unknown>; existants: string[] }
  ): {
    fichiers: Record<string, string>;
    espace: { fichier: string; texte: string } | null;
    verrouiller: { commande: string; args: string[]; dossier: string }[];
  };
}

/** The frame's languages, each its module. */
export const LANGAGES: Record<string, string>;
/** The languages the project at `racine` declares: the column « Langage » of the table of the
 * components of its docs/ARCHITECTURE.md, each once, empty for none. */
export function langagesDeclares(racine: string): string[];
/** The modules of the languages the project at `racine` declares, in the order of the table;
 * throws when it declares none, or one out of the list. */
export function langagesDe(racine: string): Langage[];
/** The join of the modules that serve the project at `racine`: the module itself for one, their
 * composition for several; throws as `langagesDe`. */
export function langageDe(racine: string): Composition;

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
export function garderLeTotal(dossier: string): void;
/** Names the progress directory of the measure that holds the lock of the machine under `env`,
 * beside the lock (scripts/verrou-de-machine.mjs); the function that takes it out. */
export function nommerLAvancement(o: { env?: NodeJS.ProcessEnv; dossier: string }): () => void;
/** Opens the base of a pass of the kind `genre` (scripts/mesure/base-de-passe.mjs). */
export function ouvrirBase(genre: string, o?: { dans?: string }): unknown;
/** Whether `chemin` lies in a temporary directory under `env` (scripts/mesure/base-de-passe.mjs). */
export function dansLeTemporaire(chemin: string, env?: NodeJS.ProcessEnv): boolean;
/** The cache of compilation of `outil`, under `~/.cache/grillhouse/`, never in the temporary
 * directory. */
export function cacheDeCompilation(outil: string, env?: NodeJS.ProcessEnv): string;
/** The environment <env> with the variables of the file `fichier` of the poste (under
 * `$XDG_CONFIG_HOME/grillhouse/`, `~/.config/grillhouse/` without it), then `ajouts`; <env> itself
 * when the file is absent or <env> already names one of its variables
 * (scripts/fichier-du-poste.mjs). */
export function avecLeFichierDuPoste<T extends Record<string, string | undefined>>(
  env: T,
  o: { fichier: string; ajouts?: Record<string, string>; lire?: (f: string) => string | null }
): T;
/** The path of the command <nom> in the PATH of <env>, or null (scripts/commandes-du-path.mjs). */
export function trouverDansLePath(nom: string, env?: NodeJS.ProcessEnv): string | null;
/** The cache of `outil` for the build rooted at `racine`, swept once `racine` is gone. */
export function cacheDeLaRacine(
  outil: string,
  racine: string,
  env?: NodeJS.ProcessEnv,
  o?: { creer?: boolean }
): string;
/** The line of the guard of a pass of tests, what its tests left in their temporary directory
 * named; null when they left nothing. */
export function ligneDesRestes(restes: string[], paquet?: string): string | null;
/** Runs `retirer` when the process is interrupted, then lets the signal end it; the removal of
 * the handlers. */
export function retirerALInterruption(retirer: () => void): () => void;
/** The pressure of the processor above which a pass is « à repasser » (scripts/mesure/pression.mjs). */
export const SEUIL_PRESSION: number;
/** The exit code of a pass « à repasser » (scripts/codes-de-sortie.mjs). */
export const A_REPASSER: number;
/** The file of Beads that holds the prefix of the tickets (scripts/prefixe-des-tickets.mjs). */
export const CONFIG_BEADS: string;
/** The prefix of the tickets, read from the key `issue-prefix`; throws when it is missing. */
export function prefixe(racine: string): string;
/** Writes the key `issue-prefix`, unless it holds a value; the line written, or null. */
export function ecrireLePrefixe(racine: string, valeur: string): string | null;
/** The pressure of the processor, in percent, or null when it cannot be read. */
export function lirePression(fichier?: string): number | null;
/** The pressure `p` as a line says it. */
export function ecrirePression(p: number | null): string;
/** The variable naming the files changed since the last green (scripts/dernier-vert.mjs). */
export const CHANGEMENTS: string;
/** The variable naming the commit of the last green a run measures itself from. */
export const DEPUIS_LE_VERT: string;
/** The variable the composed command sets for a module that plays after a module whose pass was
 * red: the pass of the verification then keeps no green. */
export const PASSE_ROUGE: string;
/** Keeps the green of a pass, which the next one measures itself from: the one pass of the
 * verification keeps it, once, when every task of every language of the graph is green; no module
 * of language keeps one. */
export function garderLeVert(etat: unknown): void;
/** The measure of the repository at `racine` against its last green. */
export function mesure(racine: string, o?: { tout?: boolean; dans?: string }): unknown;
/** The workers a session of an agent plays its tests on (`GRILLHOUSE_TRAVAILLEURS` of `env`), or
 * null in a heavy pass (every core); refuses a value that is not a positive integer, by name. */
export function travailleursDeLaSeance(env?: NodeJS.ProcessEnv): number | null;
/** The wait for the lock of the machine, ended without it (scripts/verrou-de-machine.mjs). */
export class AttenteDeLaMachine extends Error {}
/** Runs `faire` on a place of the machine, then under its lock (scripts/places-de-la-machine.mjs). */
export function avecLaMachineEtUnePlace(...args: unknown[]): unknown;
/** Plays a pass on a place of the machine: its exit code, or the code of the wait that stops. */
export function surUnePlace(
  passe: (env: NodeJS.ProcessEnv) => number,
  o?: { env?: NodeJS.ProcessEnv; dire?: (l: string) => void }
): number;
/** Waits for room in the temporary directory, as a heavy pass does before it plays. */
export function attendreDeLaPlace(o?: Record<string, unknown>): void;
/** The source files of the project at `racine` under `dossier`, as paths from `racine`, what the
 * tools of its language write left out (scripts/sources.mjs). */
export function sources(racine: string, dossier?: string): string[];
/** The packages of a language that has no package.json of its own (a crate, a project of Python)
 * the tables of docs/ARCHITECTURE.md declare at `racine`, each `{ langage, chemin, nom }` (`chemin`
 * from the root, `nom` the manifest's name); none for a project that declares neither language
 * (scripts/paquet-npm.mjs). */
export function paquetsSansPackageJson(
  racine: string
): { langage: string; chemin: string; nom: string }[];
/** The name of the script and of the task of the tests of a package, the same for every language. */
export const SCRIPT_DES_TESTS: string;
/** The name of the environment variable that carries the paths and the options of a targeted run
 * to the task of the tests (`{ arguments, rejouer? }` in JSON), the same for every language. */
export const TESTS_CIBLES: string;
/** The variable the composed command sets for the modules of a `verifier` that plays beside the
 * module of package.json, whose pass already plays every task of the graph: they play none. */
export const GRAPHE_JOUE: string;
/** The beginning of the name of a trace task, the output of a package that another's tests read. */
export const TRACE: string;
/** The name of the package of the graph whose folder is `dossier` (absolute) in `racine`, or null
 * when that folder is no package of the graph (scripts/taches-du-graphe.mjs). */
export function nomDuPaquet(racine: string, dossier: string): string | null;
/** Runs the tasks `taches` of the packages `noms` (all when empty) with the task runner `outil`,
 * each task whose dependencies succeed played to its end: the runner's exit code. `tests` is the
 * content of the variable `TESTS_CIBLES` of the run; the variable of `env` never passes on. */
export function lancerLesTaches(o: {
  outil: string;
  racine: string;
  taches: string[];
  noms?: Iterable<string>;
  tests?: { arguments: string[]; rejouer?: string };
  env?: NodeJS.ProcessEnv;
}): number;
/** The content of the variable `TESTS_CIBLES` for a targeted run: the paths and options it names, and
 * the moment of the run when `force` (the task plays for real); undefined when there is nothing to
 * carry. */
export function testsCibles(o: {
  arguments: string[];
  force?: boolean;
}): { arguments: string[]; rejouer?: string } | undefined;
/** The paths and the options of a task of the tests of a package, run by its script: the paths
 * `donnes` its script names, each replaced by those of the variable `TESTS_CIBLES` of `env` that
 * lie in the same component (`dossierDe`: the folder of the component of an absolute path, or
 * null), the options of the variable, and the tranche of a pass it carries, or null. */
export function cheminsDeLaTache(o: {
  racine: string;
  donnes: string[];
  env?: NodeJS.ProcessEnv;
  dossierDe: (absolu: string) => string | null;
}): { chemins: string[]; options: string[]; tranche: Tranche | null };
/** A tranche of a pass, the i-th (`index`) of n (`count`) parts of the tests. */
export interface Tranche {
  index: number;
  count: number;
}
/** Whether the tests a tool cannot split play in `tranche`: without a tranche, or in the first. */
export function joueCeQuiNeSeDivisePas(tranche: Tranche | null | undefined): boolean;
/** The form of a tranche, `i/n`. */
export const LA_FORME: string;
/** The tranche `texte` reads, or null when it is not `i/n` with 1 ≤ i ≤ n. */
export function lireLaTranche(texte: unknown): Tranche | null;
/** The trace tasks of a plan of the runner (`run … --dry=json`, parsed), those `garder` keeps: their
 * task ids, sorted. */
export function tracesDuPlan(
  plan: { tasks: { task: string; taskId: string }[] },
  garder?: (t: any) => boolean
): string[];
/** The command `construire --echec <fichier> <plan>` of a module, run from the root of the copy:
 * builds the plan and its providers with the task runner `outil`, `run build --filter=<paquet>…`
 * (the whole copy for a plan with a path that is no package); its exit code. */
export function construireDepuisLesArguments(
  outil: string,
  args: string[],
  racine?: string
): number;
/** What `lire` returns, read once under `cle` while the core holds a scope of readings done once
 * (a sweep that asks many questions of a tree that does not move), at each call otherwise
 * (scripts/lecture-unique.mjs). */
export function luUneFois<T>(cle: string, lire: () => T): T;
/** True when the text of a ticket's comment is an arbitrage (scripts/arbitrages.mjs). */
export function estArbitrage(text: string | null | undefined): boolean;
/** True when the arbitrage `a` of `comments` is settled. */
export function arbitrageTranche(comments: { text: string }[], a: { text: string }): boolean;
