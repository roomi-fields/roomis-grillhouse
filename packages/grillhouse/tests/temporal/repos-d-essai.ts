// When the trial server of Temporal may be stopped while workflows run on it (./essai.ts,
// `attendreLeRepos`). The server hands a worker a task in its answer, and records it started
// before the answer leaves: the answer to a poll, and the answer to a workflow task completed,
// which carries the activities that task scheduled (the eager start of an activity). A server
// killed between the two leaves a task started that no worker holds, played again only once its
// timeout passes: ten seconds for a workflow task, the heartbeat or the start-to-close timeout for
// an activity (90 s for an act of a circuit, ten minutes for a measure of its pause). A test that
// stops its server and bounds what follows stops it at rest.

/** What the server says of a workflow it describes, as `describe().raw` gives it. */
export interface TachesEnAttente {
  pendingWorkflowTask?: object | null;
  pendingActivities?: readonly unknown[] | null;
}

/**
 * Whether the workflow described by <d> is at rest: the server holds for it no workflow task and
 * no activity, scheduled or started, so that no answer in flight carries one of its tasks.
 */
export function estAuRepos(d: TachesEnAttente): boolean {
  return !d.pendingWorkflowTask && !(d.pendingActivities ?? []).length;
}
