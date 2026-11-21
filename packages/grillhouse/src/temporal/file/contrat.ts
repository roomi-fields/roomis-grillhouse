// The contract of the queue of integration of a project (grillhouse-4nr.8), the final pass judging
// the lot laid on the tip of main before main moves (grillhouse-3uv.121): the id of the queue (its
// type is the name of its function, ./deroule.ts), its signals and its query by their names, what
// they receive and give back, and the activities it calls (./activites.ts, each an act of
// scripts/faits-du-circuit.mjs over scripts/integration/file.mjs). The workflows, their activities
// and their clients share it.

/** The id of the one queue of the repository at <racine>. */
export const idDeLaFile = (racine: string) => `file:${racine}`;
/** The signal that puts a ticket's branch in the queue. */
export const ENTRER = 'entrer';
/** The signal by which the queue gives the circuit of a ticket the issue of its entry. */
export const ISSUE_DE_LA_FILE = 'issueDeLaFile';
/** The query of the queue: the entry under way and those that wait. */
export const L_ETAT_DE_LA_FILE = 'etatDeLaFile';
/**
 * The signal that asks the queue to restart as new (the installation of a new version): at rest it
 * continues as new at once; busy, it finishes its entry under way, gives its issue to the circuit,
 * then continues as new with those that wait, none of them treated before.
 */
export const RELANCER = 'relancer';

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
  /**
   * Whether the queue enters main by the final pass: always true; a queue recorded before this
   * field answers without it, which reads as false (`temporal installer` restarts it).
   */
  surLaPasseFinale?: boolean;
}

/**
 * The issue of an entry, the fact `file` of the circuit (scripts/transitions.mjs); `echec`, an act
 * of the queue that failed, on which the circuit stops (« inattendu »).
 */
export interface IssueDeLaFile {
  etat: 'ferme' | 'en-file' | 'rouvert' | 'echec';
  raison: string;
  /** A branch reopened because it does not replay on main: its lot goes back to the developpeur. */
  conflit?: boolean;
}

/** Where the lot of a ticket stands: the status of the ticket in Beads, and its reason of closure. */
interface Lot {
  statut: string | null;
  raison: string | null;
}

/** An effect an act of the queue gives back (scripts/effets.mjs): a comment at a ticket. */
export type EffetDeLaFile = { genre: string } & Record<string, unknown>;

/** What an act of the queue that writes gives back besides its outcome: its effects, in order. */
interface Rendus {
  effets: EffetDeLaFile[];
}

export interface ActivitesDeLaFile {
  /** Where the lot of <ticket> stands: closed, or to enter by the queue. */
  situerLeLot(e: { racine: string; ticket: string }): Promise<Lot>;
  /**
   * The branch made the candidate the final pass judges (scripts/integration/file.mjs
   * `preparerLaBranche`): on top of main, replaced when main moved, pushed to origin; `{ entre }`,
   * a lot already on main; or the issue for the circuit, the ticket told of a branch out of the
   * queue or kept.
   */
  preparerLaBranche(e: {
    racine: string;
    ticket: string;
    branche: string;
  }): Promise<
    ({ candidat: { commit: string } } | { entre: { commit: string } } | { issue: IssueDeLaFile }) &
      Rendus
  >;
  /**
   * The final pass on the candidate <commit>, the lot laid on the tip of main (`jugerLeCandidat`):
   * `{ juge: true }`, green or its tree already judged; or the issue for the circuit, red or to
   * play again, the ticket told.
   */
  jugerLeCandidat(e: {
    racine: string;
    ticket: string;
    branche: string;
    commit: string;
  }): Promise<({ juge: true } | { issue: IssueDeLaFile }) & Rendus>;
  /**
   * The CI of main read once, the defect ticket of a red passage opened for the owner
   * (scripts/ci-de-main.mjs `ouvrirLeDefautDeMain`); the queue goes on whatever it reads.
   */
  surveillerLaCiDeMain(e: { racine: string }): Promise<{ etat: 'verte' | 'rouge' | 'non-lue' }>;
  /**
   * Main moved forward onto the candidate <commit> the final pass judged (`avancerMain`): `{ entre }`;
   * `{ bouge: true }`, main moved meanwhile; or the issue for the circuit, main kept.
   */
  avancerMain(e: {
    racine: string;
    ticket: string;
    branche: string;
    commit: string;
  }): Promise<
    ({ entre: { commit: string } } | { bouge: true } | { issue: IssueDeLaFile }) & Rendus
  >;
  /**
   * The ticket closed, its branch deleted, main pushed (`fermerLEntree`): the branch pushed to, or
   * null and why, in one line; `livraison`, the fault of a `bd ship` of a capability the ticket
   * exports, in one line, null without one.
   */
  fermerLEntree(e: {
    racine: string;
    ticket: string;
    branche: string;
    commit: string;
  }): Promise<
    { poussee: string | null; raison?: string | null; livraison?: string | null } & Rendus
  >;
  /**
   * One effect <effet> an act of the queue gave back, written under the key of this activity (its
   * workflow, its run, its activity id, which the workflow sets): one that is not written fails.
   */
  jouerUnEffetDeLaFile(e: { racine: string; effet: EffetDeLaFile }): Promise<void>;
}
