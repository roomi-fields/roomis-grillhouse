// The contract of the queue of integration of a project and of the CI of a commit
// (grillhouse-4nr.8): the id of the queue (the types of both are the names of their functions,
// ./deroule.ts), its signals and its query by their names, what they receive and give back, and
// the activities they call (./activites.ts, each an act of scripts/faits-du-circuit.mjs over
// scripts/integration/file.mjs). The workflows, their activities and their clients share it.

/** The id of the one queue of the repository at <racine>. */
export const idDeLaFile = (racine: string) => `file:${racine}`;
/** The signal that puts a ticket's branch in the queue. */
export const ENTRER = 'entrer';
/** The signal by which the queue gives the circuit of a ticket the issue of its entry. */
export const ISSUE_DE_LA_FILE = 'issueDeLaFile';
/** The query of the queue: the entry under way and those that wait. */
export const L_ETAT_DE_LA_FILE = 'etatDeLaFile';

/** The bounds of the reading of the CI, in ms: its search (2 min), its wait (30 min), its step (10 s). */
export interface DelaisDeLaCI {
  rechercheMs?: number;
  attenteMs?: number;
  pasMs?: number;
}

/** An entry of the queue: the ticket, its branch, the workflow of its circuit that awaits it. */
export interface EntreeDeLaFile {
  ticket: string;
  branche: string;
  deroule: string;
}

/** What the queue receives; `suite` the entries a Continue-As-New carries. */
export interface EntreeDeLaFileDuProjet {
  racine: string;
  ci?: DelaisDeLaCI;
  suite?: { attente: EntreeDeLaFile[] };
}

/** The queue as its query gives it. */
export interface VueDeLaFile {
  enCours: string | null;
  attente: string[];
}

/**
 * The issue of an entry, the fact `file` of the circuit (scripts/transitions.mjs); `echec`, an act
 * of the queue that failed, on which the circuit stops (« inattendu »).
 */
export interface IssueDeLaFile {
  etat: 'ferme' | 'en-file' | 'rouvert' | 'echec';
  raison: string;
}

/** One reading of the CI of a commit. */
export type LectureDeLaCI =
  | { etat: 'sans-ci' }
  | { etat: 'cherche' }
  | { etat: 'en-cours'; passage: string }
  | { etat: 'finie'; passage: string; conclusion: string | null }
  | { etat: 'non-lue'; raison: string };

/** The verdict of the CI of a commit, its run, the reason of a CI not read. */
export interface VerdictDeLaCI {
  verdict: 'verte' | 'rouge' | 'sans-ci' | 'non-lue';
  passage: string | null;
  raison: string | null;
}

/** What the CI of a commit receives. */
export interface EntreeDeLaCI {
  racine: string;
  ticket: string;
  sha: string;
  /** The branch the commit was pushed to, whose workflows run. */
  branche: string;
  ci?: DelaisDeLaCI;
}

/** Where the lot of a ticket stands. */
interface Lot {
  /** The status of the ticket in Beads, and its reason of closure. */
  statut: string | null;
  raison: string | null;
  /** Whether its branch `agent/<ticket>` holds a lot ahead of main, which enters by the queue. */
  aEntrer: boolean;
  /** The commit of main that delivers the ticket, null without one. */
  commit: string | null;
  /** The branch main is pushed to (`grillhouse.poussee.commit`), null on a fault of the key. */
  branche: string | null;
  /**
   * Whether the commit is on that branch of origin: « non » for a lot on the local main alone,
   * « inconnu » when origin does not answer, its reason in `raisonOrigin`.
   */
  surOrigin: 'oui' | 'non' | 'inconnu';
  raisonOrigin: string | null;
}

/** An effect an act of the queue gives back (scripts/effets.mjs): a comment at a ticket. */
export type EffetDeLaFile = { genre: string } & Record<string, unknown>;

/** What an act of the queue that writes gives back besides its outcome: its effects, in order. */
interface Rendus {
  effets: EffetDeLaFile[];
}

export interface ActivitesDeLaFile {
  /** Where the lot of <ticket> stands: closed, on main with its ticket open, or to enter. */
  situerLeLot(e: { racine: string; ticket: string }): Promise<Lot>;
  /**
   * Main moved onto the branch (scripts/integration/file.mjs `avancerMain`), the ticket told of a
   * branch out of the queue or kept: `{ entre }`, or the issue for the circuit.
   */
  avancerMain(e: {
    racine: string;
    ticket: string;
    branche: string;
  }): Promise<({ entre: { commit: string } } | { issue: IssueDeLaFile }) & Rendus>;
  /**
   * The ticket closed, its branch deleted, main pushed (`fermerLEntree`): the branch pushed to, or
   * null and why, in one line.
   */
  fermerLEntree(e: {
    racine: string;
    ticket: string;
    branche: string;
    commit: string;
  }): Promise<{ poussee: string | null; raison?: string | null } & Rendus>;
  /** One reading of the CI of <sha>, the run <passage> found before (`lireUneFoisLaCI`). */
  lireLaCI(e: {
    racine: string;
    ticket: string;
    sha: string;
    branche: string;
    passage: string | null;
  }): Promise<LectureDeLaCI>;
  /** The CI of <sha> concluded at the ticket (`conclureLaCI`): the issue for the circuit. */
  conclureLaCI(
    e: {
      racine: string;
      ticket: string;
      sha: string;
      branche: string;
      relue: boolean;
    } & VerdictDeLaCI
  ): Promise<IssueDeLaFile & Rendus>;
  /**
   * One effect <effet> an act of the queue gave back, written under the key of this activity (its
   * workflow, its run, its activity id, which the workflow sets): one that is not written fails.
   */
  jouerUnEffetDeLaFile(e: { racine: string; effet: EffetDeLaFile }): Promise<void>;
}
