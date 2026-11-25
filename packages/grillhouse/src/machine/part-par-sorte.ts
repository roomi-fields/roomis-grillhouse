// The memory of the part of a pass by its sort (`sorte` of the register of the consumptions), as
// Kubernetes splits a request from a limit, the request drawn from the measure as the Vertical Pod
// Autoscaler draws it from the percentile of the observed peaks: the reservation, which the
// admission counts, is the 95th percentile of the peaks of the sort in the register of the
// project; the limit, the ceiling of the control group, their maximum plus a quarter. Pure: the
// lines and the budget come in. Read by scripts/places-de-la-machine.mjs (`partDeLaPasse`), from
// the build. Architecture: docs/architecture/machine.md (§5.2).

/** The peaks a sort needs in the register before its measure sizes its part. */
const RELEVES_MIN = 20;
/** The percentile of the peaks of a sort that a pass of it reserves. */
const CENTILE_DE_LA_RESERVATION = 95;
/** The margin of the limit over the largest peak of the sort: a quarter. */
const MARGE_DE_LA_LIMITE = 1.25;

/** What the memory of a part reads from a line of the register. */
export interface LigneMesuree {
  sorte?: unknown;
  memoirePic?: unknown;
}

/** The memory of a part, in bytes: what the admission counts and where the group cuts. */
export interface MemoireDeLaSorte {
  reservation: number;
  limite: number;
}

/**
 * The reservation and the limit of a pass of the sort `sorte` from the `lignes` of the register,
 * each within the memory of the budget: the 95th percentile (nearest rank) of its peaks and their
 * maximum plus a quarter. Null under 20 peaks: the part of the project then stands for both.
 */
export function memoireDeLaSorte(
  lignes: readonly LigneMesuree[],
  sorte: string,
  budget: number
): MemoireDeLaSorte | null {
  const pics = lignes
    .filter(l => l.sorte === sorte)
    .map(l => l.memoirePic)
    .filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (pics.length < RELEVES_MIN) {
    return null;
  }
  const rang = Math.ceil((pics.length * CENTILE_DE_LA_RESERVATION) / 100);
  const centile = pics[rang - 1] as number;
  const maximum = pics[pics.length - 1] as number;
  return {
    reservation: Math.min(budget, centile),
    limite: Math.min(budget, Math.floor(maximum * MARGE_DE_LA_LIMITE)),
  };
}
