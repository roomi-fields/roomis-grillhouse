// The sampler of a heavy pass, a process apart outside its scope: while the pass lives it reads the
// scope again and keeps the last reading; when the pass has gone without writing its final line
// (SIGKILL, the watch of the memory), it writes the line « interrompue » with that reading. Started
// by `scopeSystemd` (./consommation-des-passes.mjs); a pass that ends by itself leaves the marker
// file `<id>.fin` the sampler removes.
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { garderLaConsommation, lireLUnite } from './consommation-des-passes.mjs';

const PERIODE_MS = 1000;

/**
 * Samples the pass behind <port> until it is over, then writes its line if it left none.
 * @param {{
 *   base: { sorte: string, ticket?: string, coeurs: number, debut: number },
 *   lire: () => ({ cpuNs: number | null, memoirePic: number | null } | null),
 *   vivante: () => boolean,
 *   finale: () => boolean,
 *   noter: (l: { cpuNs: number | null, memoirePic: number | null }) => void,
 *   garder: (l: Record<string, unknown>) => void,
 *   maintenant: () => number,
 *   dormir: () => void,
 * }} port `vivante`, whether the pass goes on; `finale`, whether it wrote its final line
 */
export function echantillonner({ base, lire, vivante, finale, noter, garder, maintenant, dormir }) {
  let derniere = null;
  while (vivante()) {
    const l = lire();
    if (l && (l.cpuNs !== null || l.memoirePic !== null)) {
      derniere = l;
      noter(l);
    }
    dormir();
  }
  if (finale()) {
    return;
  }
  const fin = maintenant();
  garder({
    sorte: base.sorte,
    ...(base.ticket ? { ticket: base.ticket } : {}),
    dureeMs: fin - base.debut,
    cpuNs: derniere?.cpuNs ?? null,
    memoirePic: derniere?.memoirePic ?? null,
    coeurs: base.coeurs,
    issue: 'interrompue',
    fin: new Date(fin).toISOString(),
  });
}

const vit = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { unite, pid, racine, marqueur, base } = JSON.parse(process.argv[2]);
  const attente = new Int32Array(new SharedArrayBuffer(4));
  echantillonner({
    base,
    lire: () => lireLUnite(unite),
    vivante: () => vit(pid) && !existsSync(marqueur),
    finale: () => existsSync(marqueur),
    noter: l => writeFileSync(`${marqueur}.lecture`, JSON.stringify(l)),
    garder: l => garderLaConsommation(racine, l),
    maintenant: Date.now,
    dormir: () => Atomics.wait(attente, 0, 0, PERIODE_MS),
  });
  rmSync(marqueur, { force: true });
  rmSync(`${marqueur}.lecture`, { force: true });
}
