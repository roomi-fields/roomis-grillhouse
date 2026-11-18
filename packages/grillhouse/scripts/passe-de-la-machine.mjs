// A pass on the machine: each takes its part of the budget (scripts/places-de-la-machine.mjs
// `prendreUnePart`), waiting for it when the parts held leave too little, and plays held to that
// part by the system: a control group of its own (`systemd-run --user --scope`) whose CPU weight
// and memory bound come from the part, with no hard CPU ceiling (a ceiling pauses a pass by jerks;
// a weight slows nothing on a free machine, as the `cpu.weight` of the kernel shares the cores
// only when they are short). Its tools receive the processes of its part
// (GRILLHOUSE_TRAVAILLEURS). A pass takes no place of the machine: a place is a session of an
// agent or a circuit.
//
// - A pass out of the envelope of an agent is held to its part: the heavy pass of a circuit (its
//   command, launched by the circuit), `npm run verifier`, a targeted `npm test`, the CI on a
//   machine of ours, the night. The commands an agent launches in its envelope take no part (the
//   place of its session covers them) and play without a group; where the system gives no group
//   (no manager of the user), the pass plays without one too; each says it once, « joue sans part
//   tenue ».
// - A heavy pass keeps what it consumes (scripts/consommation-des-passes.mjs): a pass that is the
//   process itself (`npm run verifier`) enters its group by `StartTransientUnit` of the manager
//   of the user, the weight and the bound of its part among its properties; a pass the circuit
//   launches as a command (`mode: 'commande'`) runs in the group `commandeDuGroupe` builds, its
//   unit named, which a sampler reads. A pass that consumes clearly more than its part is said to
//   the board and to the figures (`depasseLaPart`).
// - A pass under the part its parent holds (GRILLHOUSE_PART_TENUE) takes none of its own.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  coeursDeLaMachine,
  depasseLaPart,
  garderLaConsommation,
  poidsDeLaPart,
  scopeDeCommande,
  scopeSystemd,
  sorteDeLaPasse,
} from './consommation-des-passes.mjs';
import { AttenteDeLaMachine } from './attente-de-la-machine.mjs';
import {
  attacheDesCoeurs,
  chargeHorsMesure,
  codeDeLaMesure,
  ecartDesProgrammes,
  listeDeCoeurs,
  lireLesTempsOccupes,
  OUTIL_D_AFFINITE,
  tempsDuSysteme,
} from './coeurs-dedies.mjs';
import { paquetsDeLEnveloppe } from './enveloppe/paquets-du-plan.mjs';
import {
  dossierDesParts,
  prendreUnePart,
  sousNiceEtIonice,
  travailleursDe,
  VARIABLE_TRAVAILLEURS,
} from './places-de-la-machine.mjs';

// The launcher of a command in a control group of the manager of the user.
const LANCEUR_DE_GROUPE = 'systemd-run';
// The slice of the user's manager the groups of the frame live under, beside `app.slice`, which the
// programs out of the frame are in: the cores kept from them are not kept from the frame's groups.
const TRANCHE_DU_CADRE = 'grillhouse.slice';

/**
 * Whether the npm command of a step is a heavy pass: `npm run verifier`, whatever its step.
 * @param {{ etape: string, args: string[] }} o
 */
export function passeLourde({ args }) {
  return args.includes('verifier');
}

/**
 * What a session out of the envelope launches: its command under `nice` and `ionice`,
 * GRILLHOUSE_TRAVAILLEURS set to max(1, cores ÷ places); a heavy one runs its command as it is,
 * without the workers it inherits.
 * @param {{ lourde: boolean, cmd: string, args: string[], env: Record<string, string | undefined> }} o
 * @returns {{ cmd: string, args: string[], env: Record<string, string | undefined> }}
 */
export function lancementDeLaPasse({ lourde, cmd, args, env }) {
  const { [VARIABLE_TRAVAILLEURS]: _herite, ...sansTravailleurs } = env;
  if (lourde) {
    return { cmd, args, env: sansTravailleurs };
  }
  const [commande, ...arguments_] = sousNiceEtIonice([cmd, ...args]);
  return {
    cmd: commande,
    args: arguments_,
    env: { ...sansTravailleurs, [VARIABLE_TRAVAILLEURS]: String(travailleursDe({ env })) },
  };
}

/**
 * The command line that runs <cmd> in a control group of its own under the part <part>: `systemd-run
 * --user --scope` (the manager of the user, no privilege), its CPU weight and its memory bound
 * drawn from the part, no hard ceiling of CPU, the command of the pass whole at the end after
 * `--`. <unite> names the scope, which a sampler reads. With <fils> (the precise threads of the
 * part, the system delegating the cpuset controller to the account) the group allows those
 * threads only (`AllowedCPUs`), under the slice of the frame, which the programs out of the frame
 * are kept out of.
 * @param {{ part: { coeurs: number, memoire: number }, cmd: string, args: string[],
 *   unite?: string | null, fils?: number[] | null }} o
 * @returns {{ cmd: string, args: string[] }}
 */
export function commandeDuGroupe({ part, cmd, args, unite = null, fils = null }) {
  return {
    cmd: LANCEUR_DE_GROUPE,
    args: [
      '--user',
      '--scope',
      '--quiet',
      ...(unite ? [`--unit=${unite}`] : []),
      ...(fils ? [`--slice=${TRANCHE_DU_CADRE}`] : []),
      '-p',
      'CPUAccounting=yes',
      '-p',
      'MemoryAccounting=yes',
      '-p',
      `CPUWeight=${poidsDeLaPart(part)}`,
      '-p',
      `MemoryMax=${Math.floor(part.memoire)}`,
      ...(fils ? ['-p', `AllowedCPUs=${listeDeCoeurs(fils)}`] : []),
      '--',
      cmd,
      ...args,
    ],
  };
}

/**
 * What a pass under its part launches: its command, in its control group when the system gives
 * one (<groupe>), as it is otherwise, GRILLHOUSE_TRAVAILLEURS set to the cores of its part. Its
 * precise threads <fils> hold it to them: the allowed cores of its group (the cpuset controller
 * delegated to the account), or, with <affinite>, the affinity of the launch (`taskset`, which its
 * children inherit); without either of the two, nothing is attached.
 * @param {{ part: { coeurs: number, memoire: number }, cmd: string, args: string[],
 *   env: Record<string, string | undefined>, groupe: boolean, unite?: string | null,
 *   fils?: number[] | null, affinite?: boolean }} o
 * @returns {{ cmd: string, args: string[], env: Record<string, string | undefined> }}
 */
export function lancementSousPart({
  part,
  cmd,
  args,
  env,
  groupe,
  unite = null,
  fils = null,
  affinite = false,
}) {
  const { [VARIABLE_TRAVAILLEURS]: _herite, ...sans } = env;
  const e = { ...sans, [VARIABLE_TRAVAILLEURS]: String(part.coeurs) };
  const attachee =
    affinite && fils ? { cmd: OUTIL_D_AFFINITE, args: ['-c', listeDeCoeurs(fils), cmd, ...args] } : { cmd, args };
  return groupe
    ? {
        ...commandeDuGroupe({ part, ...attachee, unite, fils: affinite ? null : fils }),
        env: e,
      }
    : { ...attachee, env: e };
}

// Whether the manager of the user starts a scope: the probe of the system, asked once.
let sondeLue = null;
const sondeDuSysteme = () => {
  sondeLue ??=
    spawnSync(
      LANCEUR_DE_GROUPE,
      // The probe starts a scope with the properties a part sets, so that a manager that refuses
      // them is known before a pass runs in it.
      ['--user', '--scope', '--quiet', '-p', 'CPUWeight=100', '-p', 'MemoryMax=infinity', 'true'],
      { stdio: 'ignore', timeout: 20_000 }
    ).status === 0;
  return sondeLue;
};

/**
 * Why a pass plays without a control group of its own, null when the system gives one: the
 * commands of an agent, in its envelope, play without (its session's place covers them); so does
 * a system whose manager of the user does not answer (<sonde>, asked only out of the envelope).
 * @param {{ env: Record<string, string | undefined>, sonde?: () => boolean }} o
 * @returns {string | null}
 */
export function groupeIndisponible({ env, sonde = sondeDuSysteme }) {
  if (paquetsDeLEnveloppe(env) !== null) {
    return "dans l'enveloppe d'un agent";
  }
  return sonde() ? null : 'aucun gestionnaire de groupes de contrôle de l’utilisateur joignable';
}

/**
 * The line-writer <dire> of a pass, which writes a line once: the same pass says « joue sans part
 * tenue » one time, however often it asks.
 * @param {(l: string) => void} dire
 * @returns {(l: string) => void}
 */
export function direUneFois(dire) {
  let dit = false;
  return l => {
    if (!dit) {
      dit = true;
      dire(l);
    }
  };
}

// How a pass ended, from what it returns: a number or a `{ status, signal, error }` of a child
// process; `interrompue` for a signal, `rouge` for a failure, `verte` otherwise.
const issueDe = r => {
  if (typeof r === 'number') {
    return r === 0 ? 'verte' : 'rouge';
  }
  if (r && typeof r === 'object') {
    if (r.signal) {
      return 'interrompue';
    }
    if (r.error !== undefined || (r.status !== undefined && r.status !== 0)) {
      return 'rouge';
    }
  }
  return 'verte';
};

// Plays <jouer> in the group <ouvert> (`ouvrir()` of a scope), reads what it consumed before the
// group goes, and, for a heavy pass, keeps the line in the register of the project, the pass red
// or interrupted included: the figures, its part, and what exceeds it.
function jouerMesuree(jouer, { ouvert, racine, ticket, sorte, part, horloge, coeurs, lourde }) {
  const debut = horloge();
  let issue = 'rouge';
  try {
    const r = jouer();
    issue = issueDe(r);
    return r;
  } finally {
    let lecture = null;
    try {
      lecture = ouvert.lire();
    } catch {
      // an unreadable scope keeps a line without values
    }
    try {
      if (lourde) {
        const dureeMs = horloge() - debut;
        garderLaConsommation(racine, {
          sorte,
          ...(ticket ? { ticket } : {}),
          dureeMs,
          cpuNs: lecture?.cpuNs ?? null,
          memoirePic: lecture?.memoirePic ?? null,
          coeurs,
          partCoeurs: part.coeurs,
          partMemoire: part.memoire,
          ...(lecture
            ? (d => (d ? { depasse: d } : {}))(
                depasseLaPart({ part, cpuNs: lecture.cpuNs, dureeMs, memoirePic: lecture.memoirePic })
              )
            : {}),
          issue,
          fin: new Date().toISOString(),
        });
      }
    } finally {
      ouvert.clore?.();
    }
  }
}

/**
 * Plays <mesure> on its part of the machine, held to it by the system, and returns what it
 * returns; <mesure> receives the environment of its children (the mark of the part, the workers
 * of its tools) and `{ part, groupe, unite }`: the part held (null where none is), whether its
 * command is to run in a control group of its own (`mode: 'commande'`, `lancementSousPart`), and
 * the name of that group. The wait for the part says its reason and stops at the bound (75). A
 * heavy pass (<lourde>) keeps what it consumes.
 * @template T
 * @param {(env: Record<string, string | undefined>,
 *   contexte: { part: { coeurs: number, memoire: number } | null, groupe: boolean,
 *   unite: string | null }) => T} mesure
 * @param {{ lourde?: boolean, mode?: 'processus' | 'commande', entiere?: boolean,
 *   env?: Record<string, string | undefined>, racine?: string, ticket?: string, sorte?: string,
 *   dire?: (l: string) => void, borneMs?: number, rappelMs?: number, scope?: object,
 *   horloge?: () => number, coeurs?: number, sonde?: () => boolean } & Record<string, unknown>} options
 *   `mode` « processus » (by default): the pass is the process itself, which enters its group;
 *   `entiere`: the whole budget, the night's part; `mesure`: a measure of time, which plays on
 *   dedicated cores (scripts/coeurs-dedies.mjs), attached to them (`contexte.fils`,
 *   `contexte.affinite`) and judged on the load of those cores out of it
 * @returns {T}
 */
export function avecLaPasse(
  mesure,
  {
    lourde = true,
    mode = 'processus',
    env = process.env,
    racine = process.cwd(),
    ticket,
    sorte,
    dire = l => process.stdout.write(`${l}\n`),
    scope,
    horloge = Date.now,
    coeurs = coeursDeLaMachine(),
    sonde,
    delegation,
    affinite,
    ecarter = ecarterLesProgrammes,
    ...options
  } = {}
) {
  const prise = prendreUnePart({ ...options, env, racine, ticket, sorte, dire });
  try {
    const direSansPart = direUneFois(dire);
    // How the precise threads of the part are held: the allowed cores of a group, the affinity of
    // the launch, or not at all; a measure of time says it once.
    const attache = prise.fils
      ? attacheDesCoeurs({
          env,
          ...(delegation ? { delegation } : {}),
          ...(affinite ? { affinite } : {}),
        })
      : null;
    if (attache?.dit && prise.dediee) {
      dire(attache.dit);
    }
    const contexteDe = (groupe, unite) => ({
      part: prise.part,
      groupe,
      unite,
      fils: attache && attache.voie !== 'aucune' ? prise.fils : null,
      affinite: attache?.voie === 'affinite',
    });
    const sans = raison => {
      direSansPart(`joue sans part tenue : ${raison}`);
      return mesure(prise.env, contexteDe(false, null));
    };
    if (prise.part === null) {
      return prise.raison === "dans l'enveloppe d'un agent"
        ? sans(prise.raison)
        : mesure(prise.env, { part: null, groupe: false, unite: null });
    }
    const indisponible = groupeIndisponible({ env, ...(sonde ? { sonde } : {}) });
    if (indisponible !== null) {
      return sans(indisponible);
    }
    // The programs out of the frame kept away from the dedicated cores while a measure plays (the
    // cpuset controller delegated), and the cores given back at its end; the pass plays as it is
    // when the system refuses it, which it says.
    let rendreLesCoeurs = () => {};
    if (attache?.voie === 'groupe' && prise.dediee) {
      const tous = prise.topologie.coeurs.flatMap(c => c.fils);
      if (!ecarter({ dedies: prise.fils, fils: tous })) {
        dire(
          'les programmes hors du cadre ne sont pas tenus à l’écart des cœurs dédiés : le système refuse de régler leur groupe.'
        );
      }
      rendreLesCoeurs = () => void ecarter({ dedies: [], fils: tous });
    }
    const identite = {
      racine,
      sorte: sorteDeLaPasse(sorte ?? (env.GRILLHOUSE_VERIFICATION_SORTE || 'verification')),
      ticket: ticket ?? (env.GRILLHOUSE_VERIFICATION_TICKET || undefined),
      coeurs,
      part: { ...prise.part, dossier: dossierDesParts(env), id: prise.id },
      mesurer: lourde,
    };
    const mesuree = { racine, ticket: identite.ticket, sorte: identite.sorte, part: prise.part, horloge, coeurs, lourde };
    // A measure of time judges the load of its dedicated cores while it plays: the busy time of
    // those cores out of its own (read from its group), a red on loaded cores « à repasser ».
    const jugee = (jouer, ouvert) => () => {
      if (!prise.dediee || !attache || attache.voie === 'aucune') {
        return jouer();
      }
      const avant = lireLesTempsOccupes(tempsDuSysteme());
      const r = jouer();
      let cpuNs = null;
      try {
        cpuNs = ouvert.lire?.()?.cpuNs ?? null;
      } catch {
        // an unreadable group gives no measure's own time
      }
      const charge =
        cpuNs === null
          ? null
          : chargeHorsMesure({
              avant,
              apres: lireLesTempsOccupes(tempsDuSysteme()),
              fils: prise.fils,
              mesureNs: cpuNs,
            });
      if (charge === null) {
        dire('la charge des cœurs dédiés pendant la mesure ne se lit pas : la mesure ne la juge pas.');
        return r;
      }
      const code = typeof r === 'number' ? r : (r?.status ?? 0);
      const juge = codeDeLaMesure({ code, charge });
      if (juge === code) {
        return r;
      }
      dire(
        `les cœurs dédiés étaient chargés à ${Math.round(charge * 100)} % hors la mesure pendant son jeu : son échec est à repasser (code ${juge}).`
      );
      return typeof r === 'number' ? juge : { ...r, status: juge };
    };
    try {
      if (mode === 'commande') {
        const ouvert = (scope ?? scopeDeCommande(identite)).ouvrir();
        const contexte = contexteDe(true, ouvert.unite ?? null);
        return jouerMesuree(jugee(() => mesure(prise.env, contexte), ouvert), { ...mesuree, ouvert });
      }
      const ouvert = (
        scope ??
        scopeSystemd({ ...identite, ...(attache?.voie === 'groupe' ? { fils: prise.fils } : {}) })
      ).ouvrir();
      if ('raison' in ouvert) {
        return sans(ouvert.raison);
      }
      // The pass is the process itself: under the affinity of the launch, it takes its cores and
      // gives its own back at its end, its children inheriting them in between.
      const rendreLAffinite =
        attache?.voie === 'affinite' ? attacherLeProcessus(prise.fils) : () => {};
      try {
        return jouerMesuree(
          jugee(() => mesure(prise.env, contexteDe(false, null)), ouvert),
          { ...mesuree, ouvert }
        );
      } finally {
        rendreLAffinite();
      }
    } finally {
      rendreLesCoeurs();
    }
  } finally {
    prise.rendre();
  }
}

// Sets the programs out of the frame away from the dedicated cores (`ecartDesProgrammes`): whether
// the system took it.
function ecarterLesProgrammes({ dedies, fils }) {
  const l = ecartDesProgrammes({ dedies, fils });
  return spawnSync(l.cmd, l.args, { stdio: 'ignore', timeout: 20_000 }).status === 0;
}

// Pins this process, its threads and its future children to <fils> (`taskset`); a function that
// gives it its former cores back. Nothing changes when the system refuses.
function attacherLeProcessus(fils) {
  let avant = null;
  try {
    avant = /^Cpus_allowed_list:\s*(\S+)/m.exec(readFileSync('/proc/self/status', 'utf8'))?.[1] ?? null;
  } catch {
    // unreadable: the former cores are not given back
  }
  const poser = liste =>
    spawnSync(OUTIL_D_AFFINITE, ['-a', '-p', '-c', liste, String(process.pid)], {
      stdio: 'ignore',
      timeout: 20_000,
    }).status === 0;
  if (!poser(listeDeCoeurs(fils)) || avant === null) {
    return () => {};
  }
  return () => void poser(avant);
}

/**
 * Plays <passe> on its part of the machine, as a command a person runs (`npm test`): its exit
 * code, or, a wait that stops (its bound, 75; a faulty key or reserve, 1), its reason said and
 * its code. <passe> receives the environment of its children and its part (null where none is
 * held, in the envelope of an agent).
 * @param {(env: Record<string, string | undefined>,
 *   part: { coeurs: number, memoire: number } | null) => number} passe
 * @param {{ env?: Record<string, string | undefined>, racine?: string, entiere?: boolean,
 *   mesure?: boolean, dire?: (l: string) => void }} [o] `entiere`: the whole budget as its part
 *   (the night); `mesure`: dedicated physical cores as its part (a measure of time)
 * @returns {number}
 */
export function surUnePart(
  passe,
  {
    env = process.env,
    racine = process.cwd(),
    entiere = false,
    mesure = false,
    dire = l => process.stderr.write(`${l}\n`),
  } = {}
) {
  try {
    return avecLaPasse((e, { part }) => passe(e, part), {
      lourde: false,
      entiere,
      mesure,
      env,
      racine,
      dire,
      sorte: 'Tests',
    });
  } catch (e) {
    if (!(e instanceof AttenteDeLaMachine)) {
      throw e;
    }
    dire(e.message);
    return e.code;
  }
}
