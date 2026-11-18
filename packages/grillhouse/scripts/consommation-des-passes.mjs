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

const TRANCHE_DU_CADRE = 'grillhouse.slice';

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
 * The weight of a part for the CPU: 100 per core, within the 1 to 10000 range of `CPUWeight`, so
 * that the weights of two parts share the cores in proportion of their cores.
 * @param {{ coeurs: number }} part
 * @returns {number}
 */
export const poidsDeLaPart = part => Math.max(1, Math.min(10_000, part.coeurs * 100));

const un = n => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/**
 * What a pass consumes beyond its part, said, null when it holds to it: the cores it occupied
 * (processor time ÷ duration, once the pass has played SEUIL_DE_DEPASSEMENT_MS) above
 * DEPASSEMENT times its cores, or a peak of memory above its memory.
 * @param {{ part: { coeurs: number, memoire: number }, cpuNs: number | null, dureeMs: number,
 *   memoirePic: number | null }} o
 * @returns {string | null}
 */
export function depasseLaPart({ part, cpuNs, dureeMs, memoirePic }) {
  if (typeof cpuNs === 'number' && dureeMs >= SEUIL_DE_DEPASSEMENT_MS) {
    const occupes = cpuNs / 1e6 / dureeMs;
    if (occupes > part.coeurs * DEPASSEMENT) {
      return `cœurs : ${un(Math.round(occupes * 10) / 10)} mesurés pour ${part.coeurs}`;
    }
  }
  if (typeof memoirePic === 'number' && memoirePic > part.memoire) {
    return `mémoire : ${un(Math.round((memoirePic / 1024 ** 3) * 10) / 10)} Go mesurés pour ${un(Math.round((part.memoire / 1024 ** 3) * 10) / 10)}`;
  }
  return null;
}

/** A pass consumes clearly more than its part above this ratio of its cores. */
export const DEPASSEMENT = 1.5;
/** A pass is judged on its cores once it has played this long, in ms. */
export const SEUIL_DE_DEPASSEMENT_MS = 5_000;

// Starts the sampler of a pass outside its group (./echantillonneur-de-la-passe.mjs): it reads the
// group <unite> while the pass lives, notes its last reading beside the marker, and, given the part
// of the pass, says in the file of the part when the pass exceeds it. Without a register for the
// project, nothing is started.
function demarrerLEchantillonneur({ racine, sorte, ticket, coeurs, part, unite, id }) {
  const registre = fichierDeConsommation(racine);
  const marqueur = registre === null ? null : path.join(path.dirname(registre), `${id}.fin`);
  if (marqueur === null) {
    return { marqueur, echantillonneur: null };
  }
  mkdirSync(path.dirname(marqueur), { recursive: true });
  const echantillonneur = spawn(
    process.execPath,
    [
      SAMPLEUR,
      JSON.stringify({
        unite,
        pid: process.pid,
        racine,
        marqueur,
        part,
        base: { sorte, ...(ticket ? { ticket } : {}), coeurs, debut: Date.now() },
      }),
    ],
    { detached: true, stdio: 'ignore' }
  );
  echantillonneur.unref();
  return { marqueur, echantillonneur };
}

/**
 * The group of a pass whose command is launched in it (`commandeDuGroupe` of
 * ./passe-de-la-machine.mjs): `ouvrir()` starts the sampler, which reads the group named after the
 * part of the pass while its command runs, and returns `{ unite, lire, clore }`: `lire()` the last
 * reading the sampler noted, null without one.
 * @param {{ racine: string, sorte: string, ticket?: string, coeurs: number,
 *   part: { id: string, coeurs: number, memoire: number, dossier: string }, mesurer?: boolean }} o
 */
export function scopeDeCommande({ racine, sorte, ticket, coeurs, part, mesurer = true }) {
  return {
    ouvrir() {
      const unite = `grillhouse-passe-${part.id}.scope`;
      const { marqueur } = mesurer
        ? demarrerLEchantillonneur({ racine, sorte, ticket, coeurs, part, unite, id: part.id })
        : { marqueur: null };
      return {
        unite,
        lire: () => {
          try {
            return marqueur === null ? null : JSON.parse(readFileSync(`${marqueur}.lecture`, 'utf8'));
          } catch {
            return null;
          }
        },
        clore: () => {
          if (marqueur !== null) {
            writeFileSync(marqueur, '');
          }
        },
      };
    },
  };
}

/**
 * The real scope of a pass that is the process itself: `ouvrir()` moves this process into a
 * transient scope of the user's systemd manager (`StartTransientUnit` with its PID, which its
 * children inherit), the CPU weight and the memory bound of its part among its properties, after
 * having started the sampler outside it (<mesurer>), and returns `{ lire, clore }`; `{ raison }`
 * when no manager of the user is reachable. The scope goes when empty.
 * @param {{ racine: string, sorte: string, ticket?: string, coeurs: number,
 *   part?: { id: string, coeurs: number, memoire: number, dossier: string } | null,
 *   mesurer?: boolean }} o
 * @returns {{ ouvrir: () => { lire: () => ({ cpuNs: number | null, memoirePic: number | null } | null),
 *   clore: () => void } | { raison: string } }}
 */
export function scopeSystemd({
  racine,
  sorte,
  ticket,
  coeurs,
  part = null,
  mesurer = true,
  fils = null,
}) {
  // `AllowedCPUs` of systemd is a bit mask of the threads, a byte array, the first byte the
  // threads 0 to 7.
  const masque = (() => {
    if (!fils || fils.length === 0) {
      return [];
    }
    const octets = new Array(Math.floor(Math.max(...fils) / 8) + 1).fill(0);
    for (const f of fils) {
      octets[Math.floor(f / 8)] |= 1 << f % 8;
    }
    return octets.map(String);
  })();
  return {
    ouvrir() {
      const id = `${process.pid}-${Date.now()}`;
      const unite = `grillhouse-passe-${id}.scope`;
      const { marqueur, echantillonneur } = mesurer
        ? demarrerLEchantillonneur({ racine, sorte, ticket, coeurs, part, unite, id })
        : { marqueur: null, echantillonneur: null };
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
          String(4 + (part ? 2 : 0) + (masque.length > 0 ? 2 : 0)),
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
          ...(part
            ? [
                'CPUWeight',
                't',
                String(poidsDeLaPart(part)),
                'MemoryMax',
                't',
                String(Math.floor(part.memoire)),
              ]
            : []),
          // Under the framework slice, whose cores are not those withdrawn from the user's `app.slice`.
          ...(masque.length > 0
            ? [
                'Slice',
                's',
                TRANCHE_DU_CADRE,
                'AllowedCPUs',
                'ay',
                String(masque.length),
                ...masque,
              ]
            : []),
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
