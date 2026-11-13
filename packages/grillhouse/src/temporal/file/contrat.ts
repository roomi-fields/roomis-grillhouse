// The contract of the queue of integration of a project and of the CI of a commit
// (grillhouse-4nr.8), the CI of a ticket's branch judging it before main moves: the id of the
// queue (the types of both are the names of their functions, ./deroule.ts), its signals and its query by their names, what they receive and give back, and
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

/**
 * One reading of the CI of every expected workflow of a commit (`lireLesPassagesDeLaCI`): green,
 * its run the first workflow's; red, the run of the first red workflow `flux`; or under way, each
 * workflow `nom` with its run (null while it is looked for) and whether it finished.
 */
export type LectureDesPassages =
  | { etat: 'sans-ci' }
  | { etat: 'non-lue'; raison: string }
  | { etat: 'verte'; passage: string }
  | { etat: 'rouge'; passage: string; flux: string }
  | { etat: 'en-cours'; flux: { nom: string; passage: string | null; fini: boolean }[] };

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
   * The branch made the candidate its CI judges (scripts/integration/file.mjs
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
  /** One reading of the CI of <sha> on <branche>, the run <passage> found before (`lireUneFoisLaCI`). */
  lireLaCI(e: {
    racine: string;
    ticket: string;
    sha: string;
    branche: string;
    passage: string | null;
  }): Promise<LectureDeLaCI>;
  /**
   * One reading of the CI of <sha> on <branche>, every expected workflow together
   * (`lireLesPassagesDeLaCI`); it keeps nothing from one reading to the next.
   */
  lireLesPassagesDeLaCI(e: {
    racine: string;
    ticket: string;
    sha: string;
    branche: string;
  }): Promise<LectureDesPassages>;
  /**
   * The CI of the candidate <sha> concluded at the ticket (`conclureLaCI`): `{ avancer: true }`,
   * green or no CI for the branch; or the issue for the circuit, red or not read.
   */
  conclureLaCI(
    e: {
      racine: string;
      ticket: string;
      sha: string;
      branche: string;
    } & VerdictDeLaCI
  ): Promise<({ avancer: true } | { issue: IssueDeLaFile }) & Rendus>;
  /**
   * Main moved forward onto the candidate <commit> its CI judged (`avancerMain`): `{ entre }`;
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
   * The reading of the workflows of main of <sha>, pushed to <branche> at <poussee> ms, recorded as
   * due (`inscrireLesFluxDeMain`): nothing is read, nothing waited for.
   */
  inscrireLesFluxDeMain(e: {
    racine: string;
    ticket: string;
    sha: string;
    branche: string;
    brancheDuTicket: string;
    poussee: number;
  }): Promise<void>;
  /**
   * Every reading due of the workflows of main read once, without waiting (`relireLesLecturesDues`):
   * the number still due; a red workflow reopens its ticket, a comment is given back.
   */
  relireLesFluxDeMain(e: {
    racine: string;
    maintenant: number;
    ci?: DelaisDeLaCI;
  }): Promise<{ dues: number } & Rendus>;
  /**
   * One effect <effet> an act of the queue gave back, written under the key of this activity (its
   * workflow, its run, its activity id, which the workflow sets): one that is not written fails.
   */
  jouerUnEffetDeLaFile(e: { racine: string; effet: EffetDeLaFile }): Promise<void>;
}
