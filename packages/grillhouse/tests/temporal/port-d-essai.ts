// What the trial server of Temporal does once its port is refused (./essai.ts,
// `demarrerLeServeur`): a free port is read, released, then bound later by the server, and another
// process of the machine may take it between the two (three tranches of the night play side by
// side on one runner).

/** What follows a start whose port was refused. */
export type SuiteDUnRefus = 'echec' | 'meme-port' | 'autre-port';

/**
 * What follows the <essai>-th start of a server whose port was refused, of <essais> starts in all:
 * `echec` once they are spent; else `meme-port` for a restart on a base already served
 * (<servie>), whose clients hold its address, and `autre-port` for a first start, as a test server
 * that binds port 0 never meets the race.
 */
export function apresUnRefus({
  servie,
  essai,
  essais,
}: {
  servie: boolean;
  essai: number;
  essais: number;
}): SuiteDUnRefus {
  if (essai >= essais) {
    return 'echec';
  }
  return servie ? 'meme-port' : 'autre-port';
}
