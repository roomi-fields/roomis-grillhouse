// What a heavy pass consumes, kept with the project: the transient scope of the user's systemd
// manager a pass runs in (`scopeSystemd`, read for `CPUUsageNSec` and `MemoryPeak`, as `systemctl
// show` and Slurm's `sacct` do), the register under `<git common dir>/grillhouse/` where each
// measure is a line added (`garderLaConsommation`), and the figures per kind of pass
// (`bilanDeLaConsommation`). The pass itself is `avecLaPasse` (./passe-de-la-machine.mjs).
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRE = 'consommation.jsonl';
// The client of the D-Bus of the user's systemd manager, which starts the transient scope.
const CLIENT_DBUS = 'busctl';
const SAMPLEUR =fileURLToPath(new URL('./echantillonneur-de-la-passe.mjs', import.meta.url));
// systemd's "infinity" for a 64-bit counter.
const INFINI = 2n ** 64n - 1n;

/**
 * The cumulated processor time (ns) and the peak of memory (bytes) a scope reports, from the
 * text of `systemctl show -p CPUUsageNSec -p MemoryPeak`; null for a value systemd does not give
 * (`[not set]`, its "infinity"), never zero.
 * @param {string} texte
 * @returns {{ cpuNs: number | null, memoirePic: number | null }}
 */
export function lireLeScope(texte) {
  const valeur = nom => {
    const m = new RegExp(`^${nom}=(\\d+)$`, 'm').exec(texte);
    if (!m) {
      return null;
    }
    const n = BigInt(m[1]);
    return n >= INFINI ? null : Number(n);
  };
  return { cpuNs: valeur('CPUUsageNSec'), memoirePic: valeur('MemoryPeak') };
}

/**
 * The register of the project at <racine>: `consommation.jsonl` under the `grillhouse/` directory
 * of its common git directory; null out of git.
 * @param {string} racine
 * @returns {string | null}
 */
export function fichierDeConsommation(racine) {
  const r = spawnSync(
    'git',
    ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8' }
  );
  return r.status === 0 ? path.join(r.stdout.trim(), 'grillhouse', REGISTRE) : null;
}

/**
 * Adds <ligne> (`{ sorte, ticket?, dureeMs, cpuNs, memoirePic, coeurs, issue, fin }`) to the
 * register of <racine>; nothing out of git.
 * @param {string} racine
 * @param {Record<string, unknown>} ligne
 */
export function garderLaConsommation(racine, ligne) {
  const f = fichierDeConsommation(racine);
  if (f === null) {
    return;
  }
  mkdirSync(path.dirname(f), { recursive: true });
  appendFileSync(f, `${JSON.stringify(ligne)}\n`);
}

/**
 * The lines of the register of <racine>, in order; none when it is absent, a malformed line
 * skipped.
 * @param {string} racine
 * @returns {Record<string, any>[]}
 */
export function lireLaConsommation(racine) {
  const f = fichierDeConsommation(racine);
  let texte;
  try {
    texte = readFileSync(f ?? '', 'utf8');
  } catch {
    return [];
  }
  const lignes = [];
  for (const l of texte.split('\n')) {
    try {
      const o = l.trim() === '' ? null : JSON.parse(l);
      if (o && typeof o === 'object' && typeof o.sorte === 'string') {
        lignes.push(o);
      }
    } catch {
      // a malformed line is skipped
    }
  }
  return lignes;
}

const mediane = valeurs => {
  const v = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Per kind of pass, in the order of first appearance: the number of passes, the median and the
 * maximum of the cores occupied (processor time ÷ duration) and of the peak of memory. A line
 * whose processor time is unreadable, or whose duration is nil, is left out.
 * @param {Record<string, any>[]} lignes
 * @returns {{ sorte: string, passes: number, coeursMediane: number, coeursMax: number,
 *   memoireMediane: number, memoireMax: number }[]}
 */
export function bilanDeLaConsommation(lignes) {
  const parSorte = new Map();
  for (const l of lignes) {
    if (typeof l.cpuNs !== 'number' || !(l.dureeMs > 0)) {
      continue;
    }
    const liste = parSorte.get(l.sorte) ?? [];
    liste.push(l);
    parSorte.set(l.sorte, liste);
  }
  return [...parSorte].map(([sorte, liste]) => {
    const coeurs = liste.map(l => l.cpuNs / 1e6 / l.dureeMs);
    const memoires = liste.filter(l => typeof l.memoirePic === 'number').map(l => l.memoirePic);
    return {
      sorte,
      passes: liste.length,
      coeursMediane: mediane(coeurs),
      coeursMax: Math.max(...coeurs),
      memoireMediane: memoires.length ? mediane(memoires) : 0,
      memoireMax: memoires.length ? Math.max(...memoires) : 0,
    };
  });
}

/**
 * The name of a kind of pass in the register: lower case, without accent, words joined by dashes
 * (« Vérification » → `verification`).
 * @param {string} nom
 */
export function sorteDeLaPasse(nom) {
  return nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The cores of the machine. */
export const coeursDeLaMachine = () => cpus().length;

/**
 * What the scope <unite> reports now (`lireLeScope` of `systemctl --user show`); null when the
 * manager does not answer, the scope gone.
 * @param {string} unite
 */
export const lireLUnite = unite => {
  const r = spawnSync(
    'systemctl',
    ['--user', 'show', unite, '-p', 'CPUUsageNSec', '-p', 'MemoryPeak'],
    { encoding: 'utf8' }
  );
  return r.status === 0 ? lireLeScope(r.stdout) : null;
};

/**
 * The real scope of a pass: `ouvrir()` moves this process into a transient scope of the user's
 * systemd manager (`StartTransientUnit` with its PID, which its children inherit), after having
 * started the sampler outside it, and returns `{ lire, clore }`; `{ raison }` when nothing can
 * measure (no manager of the user reachable). The scope goes when empty.
 * @param {{ racine: string, sorte: string, ticket?: string, coeurs: number }} o
 * @returns {{ ouvrir: () => { lire: () => ({ cpuNs: number | null, memoirePic: number | null } | null),
 *   clore: () => void } | { raison: string } }}
 */
export function scopeSystemd({ racine, sorte, ticket, coeurs }) {
  return {
    ouvrir() {
      const registre = fichierDeConsommation(racine);
      const id = `${process.pid}-${Date.now()}`;
      const unite = `grillhouse-passe-${id}.scope`;
      const marqueur = registre === null ? null : path.join(path.dirname(registre), `${id}.fin`);
      let echantillonneur = null;
      if (marqueur !== null) {
        mkdirSync(path.dirname(marqueur), { recursive: true });
        echantillonneur = spawn(
          process.execPath,
          [
            SAMPLEUR,
            JSON.stringify({
              unite,
              pid: process.pid,
              racine,
              marqueur,
              base: { sorte, ...(ticket ? { ticket } : {}), coeurs, debut: Date.now() },
            }),
          ],
          { detached: true, stdio: 'ignore' }
        );
        echantillonneur.unref();
      }
      const r = spawnSync(
        CLIENT_DBUS,
        [
          '--user',
          'call',
          'org.freedesktop.systemd1',
          '/org/freedesktop/systemd1',
          'org.freedesktop.systemd1.Manager',
          'StartTransientUnit',
          'ssa(sv)a(sa(sv))',
          unite,
          'fail',
          '4',
          'PIDs',
          'au',
          '1',
          String(process.pid),
          'Description',
          's',
          `grillhouse : passe ${sorte}`,
          'CPUAccounting',
          'b',
          'true',
          'MemoryAccounting',
          'b',
          'true',
          '0',
        ],
        { encoding: 'utf8', timeout: 20_000 }
      );
      if (r.status !== 0) {
        if (echantillonneur?.pid) {
          try {
            process.kill(echantillonneur.pid);
          } catch {
            // already gone
          }
        }
        const dit = `${r.stderr ?? ''}${r.error?.message ?? ''}`.trim().split('\n')[0];
        return {
          raison: `aucun gestionnaire systemd utilisateur joignable${dit ? ` (${dit})` : ''}`,
        };
      }
      return {
        lire: () => lireLUnite(unite),
        clore: () => {
          if (marqueur !== null) {
            writeFileSync(marqueur, '');
          }
        },
      };
    },
  };
}
