// The sessions of the agents (circuit.md §3.1, « Actes du circuit »; the sheet they end on, §4.4):
// each session is a
// process group the activity launches (`jouerLeGroupe`), which sends a sign of life
// `{ pid, depart, seanceId }` at its launch and at each step of its watch, stops on a motionless
// transcript (`IMMOBILE_MS` of scripts/circuit.mjs, `ctx.immobileMs`), and, cancelled, kills its
// group; a launch that finds alive the group a launch before left (its last sign of life) waits
// for it, under the same watch, before it takes its place (`lancer`): the second attempt of
// `jusquALaFiche`, and the fresh session that follows a failed resumption in `seance`; the id of
// each session comes from its caller, which gives a new one to each session it launches. `lancer` launches one session, `jusquALaFiche` until its
// sheet, `seance` that of the testwriter, the developpeur or the agent direct on the whole ticket, with the instruction of
// the templates (`consigne`) and the findings of the reviewer open for its role
// (`constatsDeLaSeance`). Each session of a role ends on the judgment of its lot (`jugerLeLot`,
// machine.md §5.5). The circuit (scripts/circuit.mjs) calls them.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GREFFON } from './cadre.mjs';
import { avecLeFichierDuPoste, configurationDuPoste } from './fichier-du-poste.mjs';
import {
  changements,
  ecritPar,
  etatDuFichier,
  marquesRestantes,
  photographier,
  texteDeLEtat,
} from './enveloppe/travail-de-la-copie.mjs';
import {
  ecrireLaListe,
  paquetQuiTient,
  paquetsDuLangage,
  VARIABLE_TESTS_ETENDUS,
} from './enveloppe/paquets-du-plan.mjs';
import { langageDe, langageDeLaCopie } from './langages.mjs';
import { leRole, nomDuRole } from './etapes.mjs';
import { departDe, VARIABLE_SEANCE } from './mesure/base-de-passe.mjs';
import { groupeVivant, signalerGroupe } from './mesure-de-la-machine.mjs';
import {
  commandeDuGroupe,
  lancementDeLaPasse,
  mesureDeLaSeance,
} from './passe-de-la-machine.mjs';
import { prendreUnePlace } from './places-de-la-machine.mjs';
import { transcriptionsDeLaCopie } from './registre.mjs';
import { cleDuConstat, lireFiche, reponsesAuxConstats, schemaDeFiche } from './resultats.mjs';
import {
  ACTEUR,
  Arret,
  AUTEUR_DU_CIRCUIT,
  commenter,
  derniereDe,
  entete,
  fichesDe,
  fin,
  inscrire,
  leTicket,
  lire,
  nomsDe,
} from './ticket-du-circuit.mjs';
import { emettre } from './effets.mjs';
import { fichierNommeAuTicket } from './fichiers-nommes.mjs';
import { limiteDUsage } from './limite-d-usage.mjs';
import { AttenteDeLaMachine } from './attente-de-la-machine.mjs';

// The number of the next files of a session in the working directory <dossier> of the ticket: one
// past the highest its files carry (`consigne-<n>.md`, `erreurs-<n>.txt`), read
// at each launch, so that no counter is shared between the circuit and its activities.
export function prochainNumero(dossier) {
  const lus = existsSync(dossier) ? readdirSync(dossier) : [];
  return 1 + Math.max(0, ...lus.map(n => Number(/-(\d+)(?:\.[a-z]+)?$/.exec(n)?.[1] ?? 0)));
}

/**
 * The id of the session of the event <evenement> under the act of <ctx>: the session
 * `<séance>-e<essai>`, <séance> drawn from the key of its activity (`ctx.cle`) and the event, and
 * <essai> the attempt of that activity (`ctx.essaiDeLActe`), so that two attempts never share a
 * `--session-id`; out of an act, drawn anew. A UUID drawn from that name, as claude's
 * `--session-id` takes it.
 */
export function idDeSeance(ctx, evenement) {
  if (!ctx.cle) {
    return randomUUID();
  }
  const nom = `${ctx.cle}:seance:${evenement}-e${ctx.essaiDeLActe ?? 1}`;
  const h = createHash('sha256').update(nom).digest('hex');
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// A session cancelled (the AbortSignal its caller gives), its group killed.
export class SeanceAnnulee extends Error {
  constructor(role) {
    super(`la séance du ${nomDuRole(role)} est annulée, son groupe tué.`);
    this.name = 'SeanceAnnulee';
  }
}

// The model of each session under the envelope is named by the circuit, never taken from the
// account; no session fixes the effort, which stays adaptive.
const SONNET = ['--modele', 'sonnet'];
const FORT = ['--modele', 'opus'];

const LANCEUR = path.join(import.meta.dirname, 'enveloppe', 'lancer.sh');

const REGISTRE = path.join(import.meta.dirname, 'registre.mjs');

// The script that opens the temporary directory of a session out of the envelope, the base of a
// pass whose owner is the process its argument names, and writes it without its end of line.
const OUVRIR_LE_TEMPORAIRE = `import { ouvrirBase } from ${JSON.stringify(
  pathToFileURL(path.join(import.meta.dirname, 'mesure', 'base-de-passe.mjs')).href
)}; process.stdout.write(ouvrirBase('seance', { pid: Number(process.argv[1]) }).dossier);`;

// The shell that carries a session out of the envelope (`$0` the file of its exit code, `$1` node,
// `$2` the script above, then the session's command): it opens the session's temporary directory,
// which it owns, so that it outlives a dead circuit, names it in TMPDIR, TMP and TEMP, whatever
// CLAUDE_CODE_TMPDIR the poste holds, and removes it at its end, even interrupted.
const PORTER_LA_SEANCE = [
  "trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM",
  't=$("$1" --input-type=module -e "$2" "$$" </dev/null) || exit',
  'trap \'rm -rf -- "${t%/t}"\' EXIT',
  'shift 2',
  'export TMPDIR="$t" TMP="$t" TEMP="$t"',
  'unset CLAUDE_CODE_TMPDIR',
  '"$@"; c=$?; echo "$c" > "$0"; exit "$c"',
].join('\n');

// The templates of the instructions, in the skill of the supervisor, which the frame's plugin
// carries, read at the plugin's root (scripts/cadre.mjs).
const GABARIT = path.join(GREFFON, 'skills', 'pitmaster', 'references', 'consigne-agent.md');

// The latest moment a transcript of the copy moved, or 0.
function derniereTrace(dossier) {
  if (!existsSync(dossier)) {
    return 0;
  }
  let m = 0;
  for (const f of readdirSync(dossier, { recursive: true })) {
    if (!String(f).endsWith('.jsonl')) {
      continue;
    }
    try {
      m = Math.max(m, statSync(path.join(dossier, String(f))).mtimeMs);
    } catch {
      // A transcript removed meanwhile does not move.
    }
  }
  return m;
}

const mtime = f => {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return 0;
  }
};

/**
 * Where the session <id> of <ctx> keeps its result, in the working directory of the ticket
 * (`<copie>.travail/seances/<id>/`, as lancer.sh writes it): its exit code (`fin`), claude's JSON
 * result (`resultat.json`), the tree the prepared copy held before it (`avant`) and the witness
 * that the envelope started its command (`demarree`).
 */
export function rangDeLaSeance(ctx, id) {
  const dossier = path.join(ctx.tmp, 'seances', id);
  return {
    dossier,
    fin: path.join(dossier, 'fin'),
    resultat: path.join(dossier, 'resultat.json'),
    avant: path.join(dossier, 'avant'),
    demarree: path.join(dossier, 'demarree'),
  };
}

// The result the session ranged at <rang> left, or null without its end file; <horsEnveloppe>, a
// session no envelope holds, has no witness of its start.
function resultatRange(rang, id, { horsEnveloppe = false } = {}) {
  if (!existsSync(rang.fin)) {
    return null;
  }
  return {
    code: 0,
    seance: Number(readFileSync(rang.fin, 'utf8').trim()),
    bloque: false,
    erreur: null,
    sortie: lire(rang.resultat).trim(),
    id,
    demarree: horsEnveloppe ? null : existsSync(rang.demarree),
  };
}

// One launch of a session: `{ code, seance, bloque, erreur, sortie, id, demarree }`, `seance` the
// session's exit code (from lancer.sh's end file for a session in the envelope), null when the
// launch stopped before it, `sortie` claude's JSON result, its sheet in `structured_output`, `id`
// the session whose result it is, `demarree` whether the envelope started its command (the
// witness lancer.sh ranges; null for a session no envelope holds). Every
// session runs with the author of its role (BEADS_ACTOR). A session in the envelope, on the whole
// ticket (`.` its component, the plan its `--paquets`), opens under the id <ouvre> (lancer.sh
// --seance), or resumes the session <reprend> (lancer.sh --reprise); its result is the file
// lancer.sh ranges under its id (`rangDeLaSeance`).
// A session <horsEnveloppe> (the explorateur's, the questionneur's, the reviewer's) is claude
// itself, in the ticket's
// copy (the main tree once the copy is gone), under <droits> (`horsDeLEnveloppe`), the
// schema of its role's sheet and the options <session> names (its id, or the session it
// resumes), its instruction on its standard input and its result on its standard output, in a
// temporary directory of its own (PORTER_LA_SEANCE), ranged
// under its id with its exit code as lancer.sh ranges them, added to the log under its header
// line, then its line written to the register, as lancer.sh does.
// Its launch is kept with the circuit's results (`lancement`: its role, its session id, and the
// <objet> of a session that is not its role's own work, `tri`), which the bilan reads to count the
// sessions the circuit launched (scripts/bilan.mjs). Its sign of life names the session
// (`seanceId`) and the launch by its <evenement> and its <relance>
// (`lancement:<événement>:<relance>`), which an attempt played again recognizes. Its sheet is the
// schema <fiche>, by default its role's. It is an activity (`jouerLeGroupe`): <signeDeVie>
// receives the sign of life of its group, which names the launch, <annulation> (an AbortSignal)
// kills it, and a group a previous attempt left running (<precedent>, its last sign of life) is
// waited for before the place is taken (<prendrePlace>, `prendreUnePlace` of
// scripts/places-de-la-machine.mjs by default). Only an attempt Temporal plays again
// (`ctx.essaiDeLActe` 2 or more), at the launch <precedent> names, takes, once that group has
// ended, the result the session of the dead attempt ranged (its `seanceId`), with no second
// session, and writes the launch line that died with that attempt; a session dead without a
// result is launched anew, under the id of this attempt. A
// cancelled session throws SeanceAnnulee.
export async function lancer(
  ctx,
  role,
  consigne,
  {
    fort,
    horsEnveloppe,
    droits = [],
    session = [],
    ouvre,
    reprend,
    fiche: sorte,
    objet,
    signeDeVie = () => {},
    annulation = null,
    precedent = null,
    evenement,
    relance = 1,
    prendrePlace = prendreUnePlace,
  } = {}
) {
  // The traces of the session: its transcripts and the ticket's log.
  const traces = () => Math.max(derniereTrace(ctx.transcriptions), mtime(ctx.journal));
  // A group a previous attempt left alive ends before this one launches (`attendreLeGroupe`).
  if (groupeVivant(precedent)) {
    const r = await attendreLeGroupe(precedent, { immobileMs: ctx.immobileMs, traces, annulation });
    if (r.annulee) {
      throw new SeanceAnnulee(role);
    }
  }
  if (annulation?.aborted) {
    throw new SeanceAnnulee(role);
  }
  const id = ouvre ?? reprend ?? session[1] ?? null;
  if (!id) {
    throw new Error(
      `la séance du ${nomDuRole(role)} n'a pas d'identifiant : son résultat se range sous lui.`
    );
  }
  // The launch's identity, the logical event it is: its event and its relaunch.
  const identite = `lancement:${evenement}:${relance}`;
  // Only an attempt Temporal plays again (`essaiDeLActe` 2 or more), at the launch the dead
  // attempt made last (its sign of life names it and its session), takes the result that session
  // ranged: no second session. Dead without a result, it is launched anew, under this id.
  if ((ctx.essaiDeLActe ?? 1) > 1 && precedent?.lancement === identite && precedent.seanceId) {
    const mort = resultatRange(rangDeLaSeance(ctx, precedent.seanceId), precedent.seanceId, {
      horsEnveloppe,
    });
    if (mort) {
      // The launch line of the dead attempt died in memory with it: written now, under its
      // session, which the bilan counts as the circuit's.
      inscrire(ctx, {
        role: AUTEUR_DU_CIRCUIT,
        lancement: { role, seance: precedent.seanceId, ...(objet ? { objet } : {}) },
      });
      return mort;
    }
  }
  // The lot a dead attempt left unjudged is judged before anything of this launch moves the copy.
  const juge = estJuge(role, horsEnveloppe);
  if (juge) {
    jugerLeLot(ctx, role);
  }
  const rang = rangDeLaSeance(ctx, id);
  mkdirSync(rang.dossier, { recursive: true });
  rmSync(rang.fin, { force: true });
  rmSync(rang.resultat, { force: true });
  rmSync(rang.avant, { force: true });
  rmSync(rang.demarree, { force: true });
  inscrire(ctx, {
    role: AUTEUR_DU_CIRCUIT,
    lancement: { role, seance: id, ...(objet ? { objet } : {}) },
  });
  const numero = prochainNumero(ctx.tmp);
  const fichier = path.join(ctx.tmp, `consigne-${numero}.md`);
  writeFileSync(fichier, consigne);
  // A file, not a pipe: a session whose circuit is dead writes its errors without breaking.
  const erreurs = path.join(ctx.tmp, `erreurs-${numero}.txt`);
  let commande;
  // Its result ranged under its id, as lancer.sh ranges a session's: claude's output, then its
  // exit code once it ends, written by the shell that runs it, which outlives a dead circuit.
  const ouvrirLesFds = () =>
    horsEnveloppe
      ? [openSync(fichier, 'r'), openSync(rang.resultat, 'w'), openSync(ctx.journal, 'a')]
      : ['ignore', 'ignore', openSync(erreurs, 'w')];
  let fds = ouvrirLesFds();
  if (horsEnveloppe) {
    entete(ctx, role);
    const fiche = [
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schemaDeFiche(sorte ?? role)),
    ];
    commande = {
      cmd: 'sh',
      args: [
        '-c',
        PORTER_LA_SEANCE,
        rang.fin,
        process.execPath,
        OUVRIR_LE_TEMPORAIRE,
        process.env.CLAUDE_BIN || 'claude',
        ...['-p', '--agent', role, ...fiche, ...droits, '--add-dir', ctx.tmp, ...session],
      ],
      cwd: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    };
  } else {
    commande = {
      cmd: 'bash',
      args: [
        // GRILLHOUSE_LANCEUR names a launcher of trial in place of lancer.sh, as CLAUDE_BIN does claude.
        process.env.GRILLHOUSE_LANCEUR || LANCEUR,
        ...(fort ? FORT : SONNET),
        ...(ouvre ? ['--seance', ouvre] : []),
        ...(reprend ? ['--reprise', reprend] : []),
        // The schema of its sheet when it is not its role's (the explorateur's gesture).
        ...(sorte ? ['--fiche', sorte] : []),
        // The plan of the session: the packages of the title, which it writes; its component the
        // whole copy, which it reads.
        '--paquets',
        ecrireLaListe(ctx.paquets),
        ctx.ticket,
        role,
        '.',
        fichier,
      ],
      cwd: ctx.racine,
    };
  }
  // Each session of an agent takes a place of the machine (scripts/places-de-la-machine.mjs) at
  // its start and gives it back at its end: the circuit holds none between two sessions, nor on a
  // question. The wait keeps the rank of the circuit's arrival, says its reason in the log, and is
  // bounded as the lock of the machine's: « à repasser » (75).
  let place;
  try {
    place = prendrePlace({
      ticket: ctx.ticket,
      rang: ctx.rang ?? undefined,
      dire: l => appendFileSync(ctx.journal, `${l}\n`),
    });
  } catch (e) {
    for (const fd of new Set(fds.filter(f => typeof f === 'number'))) {
      closeSync(fd);
    }
    if (!(e instanceof AttenteDeLaMachine)) {
      throw e;
    }
    throw new Arret('a-repasser', e.message);
  }
  // The key of the API (`cleDeLAPI`): taken for the first attempt, never for the second.
  const cle = cleDeLAPI();
  const fermer = () => {
    for (const fd of new Set(fds.filter(f => typeof f === 'number'))) {
      closeSync(fd);
    }
  };
  // The session writes at the ticket under the author of its role (the mark of its place,
  // `place.env`); the passes it plays out of the envelope take their own part of the machine,
  // those it plays in its envelope none (its place covers them).
  // A session out of the envelope (the relecteur, which plays tests) plays them on its share of
  // the cores, under nice and ionice; the launcher of an enveloped one does it in the envelope.
  const jouer = async base => {
    // The reader packages the plan extended to their tests: the testwriter alone is given them.
    const testsEtendus =
      role === 'testwriter' && ctx.testsEtendus?.length
        ? { [VARIABLE_TESTS_ETENDUS]: ecrireLaListe(ctx.testsEtendus) }
        : {};
    const marque = horsEnveloppe ? { [VARIABLE_SEANCE]: '1' } : {};
    const env = { ...base, ...place.env, ...testsEtendus, ...marque, [ACTEUR]: role };
    const lancement = horsEnveloppe
      ? lancementDeLaPasse({ lourde: false, cmd: commande.cmd, args: commande.args, env })
      : { cmd: commande.cmd, args: commande.args, env };
    // A session out of the envelope runs in a group of its own, which measures its peak into the
    // register (an enveloped one is measured by its envelope): the default weight, no bound.
    const mesure = horsEnveloppe
      ? mesureDeLaSeance({ racine: ctx.racine, role, ticket: ctx.ticket, env: lancement.env })
      : null;
    const lancee = mesure
      ? commandeDuGroupe({
          part: { coeurs: 1, memoire: 0 },
          cmd: lancement.cmd,
          args: lancement.args,
          unite: mesure.unite,
          memoire: false,
        })
      : lancement;
    const r = await jouerLeGroupe({
      cmd: lancee.cmd,
      args: lancee.args,
      cwd: commande.cwd,
      env: lancement.env,
      stdio: fds,
      seanceId: id,
      lancement: identite,
      immobileMs: ctx.immobileMs,
      traces,
      signeDeVie,
      annulation,
      lance: enfant => {
        fermer();
        // The place is the session's own from now on: its process and its start, so that it is
        // freed with the session, even if the circuit dies before.
        if (enfant.pid) {
          place.rattacher({ pid: enfant.pid, depart: departDe(enfant.pid) });
        }
      },
    });
    mesure?.garder({
      status: r.code,
      error: r.erreur ?? undefined,
      signal: r.bloque || r.annulee ? 'SIGTERM' : null,
    });
    if (r.pid === null && r.annulee) {
      fermer();
    }
    if (r.annulee) {
      place.rendre();
      throw new SeanceAnnulee(role);
    }
    return r;
  };
  if (juge) {
    ouvrirLeLot(ctx, role, { id, horsEnveloppe, depot: horsEnveloppe ? commande.cwd : ctx.copie });
  }
  let r = await jouer(cle?.env ?? process.env);
  let sortie = lireLaSortie(rang);
  const motif = cle ? motifDeRefus(sortie) : null;
  if (cle && motif) {
    // The API refused the key: the session plays again, once, on the subscription, under the same
    // id, which the refused attempt opened: claude refuses a second `--session-id` of it
    // (« already in use »), so the relaunch resumes it (`--resume`, `--reprise` of the launcher).
    // The refusal is neither a failure nor a second session.
    noterLeMois(ctx, cle.dossier, motif);
    commande.args = commande.args.map(a =>
      a === '--session-id' ? '--resume' : a === '--seance' ? '--reprise' : a
    );
    rmSync(rang.fin, { force: true });
    rmSync(rang.resultat, { force: true });
    fds = ouvrirLesFds();
    const { ANTHROPIC_API_KEY: _cle, ...sansCle } = process.env;
    r = await jouer(sansCle);
    sortie = lireLaSortie(rang);
  }
  place.rendre();
  let seance;
  if (horsEnveloppe) {
    seance = existsSync(rang.fin)
      ? Number(readFileSync(rang.fin, 'utf8').trim())
      : r.erreur === null
        ? r.code
        : null;
    appendFileSync(ctx.journal, `${sortie}\n`);
    spawnSync(process.execPath, [REGISTRE, '--copie', ctx.copie], {
      cwd: ctx.racine,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } else {
    seance = existsSync(rang.fin) ? Number(readFileSync(rang.fin, 'utf8').trim()) : null;
  }
  return {
    code: r.code,
    seance,
    bloque: r.bloque,
    erreur: r.erreur ?? lire(erreurs),
    sortie,
    id,
    demarree: horsEnveloppe ? null : existsSync(rang.demarree),
  };
}

// The text a session ranged as its result, `lancer` reads it at the end of each attempt.
function lireLaSortie(rang) {
  return lire(rang.resultat).trim();
}

// The API key of the poste (`api.env` of the frame's directory of configuration), applied to the
// environment of the circuit as the files of the poste are (`avecLeFichierDuPoste`): null when the
// circuit's environment already holds a key, when the month is noted (`api-epuise-AAAA-MM`, a
// file of presence whose existence alone is tested) or when the file is absent. Its `env` is the
// environment of the first attempt; its `dossier` the one the month is noted in.
function cleDeLAPI() {
  const dossier = configurationDuPoste(process.env);
  if (dossier === null || process.env.ANTHROPIC_API_KEY !== undefined) {
    return null;
  }
  if (existsSync(path.join(dossier, `api-epuise-${leMois()}`))) {
    return null;
  }
  const env = avecLeFichierDuPoste(process.env, { fichier: 'api.env' });
  return env === process.env ? null : { env, dossier };
}

// The month of the day, `AAAA-MM`.
function leMois() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Why the API refused a session, from its result: only a JSON result of claude in error whose
// status or text is the empty credit's (400) or the refused key's (401) counts; any other result,
// a transient error of the API included, is null and follows the path of the failed sessions.
function motifDeRefus(sortie) {
  let r;
  try {
    r = JSON.parse(sortie);
  } catch {
    return null;
  }
  // The probed form of a refusal: `is_error` true, `terminal_reason` "api_error", the API's status.
  if (r?.is_error !== true || r.terminal_reason !== 'api_error') {
    return null;
  }
  const texte = typeof r.result === 'string' ? r.result : '';
  if (r.api_error_status === 401) {
    return 'clé refusée';
  }
  if (r.api_error_status === 402 || texte.toLowerCase().includes('credit balance is too low')) {
    return 'crédit épuisé';
  }
  return null;
}

// Notes the month in its file of presence, by an exclusive write: of the sessions refused together,
// the first to create it writes the line of the log, the others none.
function noterLeMois(ctx, dossier, motif) {
  const mois = leMois();
  try {
    writeFileSync(path.join(dossier, `api-epuise-${mois}`), '', { flag: 'wx' });
  } catch {
    return;
  }
  appendFileSync(
    ctx.journal,
    `la clé d'API est ${motif} : la séance repart sur l'abonnement, sans clé jusqu'à la fin de ${mois}\n`
  );
}

// The group of a session, as an activity of Temporal runs a process: launched detached, the
// leader of a process group of its own, it sends a sign of life (<signeDeVie>, `{ pid, depart,
// seanceId, lancement }`: the leader of the group, its start, `departDe`, the id of the session
// the caller gives, and the identity of its launch, <lancement>, when it has one) at its launch and at each step of its watch, then null at its end. Its traces
// (<traces>, the latest moment they moved) standing still for <immobileMs>, its group gets
// SIGTERM, then SIGKILL 5 s later (`bloque`); cancelled (<annulation>, an AbortSignal, aborted
// before or during the play), its group gets SIGTERM, then SIGKILL 5 s later (`annulee`), and a
// play cancelled before its launch launches nothing. `{ code, pid, bloque, annulee, erreur }`, `code` the exit code of
// the leader (null when it did not start), `erreur` the message of a launch that failed.
export async function jouerLeGroupe({
  cmd,
  args,
  cwd,
  env,
  stdio = 'ignore',
  seanceId,
  lancement = null,
  immobileMs,
  traces = () => 0,
  signeDeVie = () => {},
  annulation = null,
  lance = () => {},
}) {
  if (annulation?.aborted) {
    return { code: null, pid: null, bloque: false, annulee: true, erreur: null };
  }
  return new Promise(resolve => {
    const enfant = spawn(cmd, args, { cwd, detached: true, stdio, env });
    const pid = enfant.pid ?? null;
    const vie = pid
      ? { pid, depart: departDe(pid), seanceId, ...(lancement ? { lancement } : {}) }
      : null;
    lance(enfant);
    if (vie) {
      signeDeVie(vie);
    }
    let bloque = false;
    let annulee = false;
    let fini = false;
    let erreur = null;
    const arreter = () => {
      signalerGroupe(pid, 'SIGTERM');
      setTimeout(() => signalerGroupe(pid, 'SIGKILL'), 5_000).unref();
    };
    const veille = pid
      ? surveiller(
          { immobileMs, traces },
          () => {
            bloque = true;
            arreter();
          },
          () => signeDeVie(vie)
        )
      : null;
    const surAnnulation = () => {
      annulee = true;
      arreter();
    };
    annulation?.addEventListener('abort', surAnnulation, { once: true });
    enfant.on('error', e => {
      erreur = e.message;
      if (!pid) {
        enfant.emit('close', null);
      }
    });
    enfant.on('close', code => {
      if (fini) {
        return;
      }
      fini = true;
      if (veille) {
        clearInterval(veille);
      }
      annulation?.removeEventListener('abort', surAnnulation);
      // What remains of the group goes with its leader.
      if (bloque || annulee) {
        signalerGroupe(pid, 'SIGKILL');
      }
      signeDeVie(null);
      resolve({ code, pid, bloque, annulee, erreur });
    });
  });
}

// The watch of the group <pid>: each step (a quarter of <immobileMs>, between 100 ms and 30 s), the
// sign of life <pouls>; its traces standing still for <immobileMs>, <bloque> called once. Its
// interval, which the caller clears.
export function surveiller({ immobileMs, traces }, bloque, pouls = () => {}) {
  let bouge = Date.now();
  let arrete = false;
  const pas = Math.max(100, Math.min(30_000, Math.floor(immobileMs / 4)));
  return setInterval(() => {
    pouls();
    bouge = Math.max(bouge, traces());
    if (!arrete && Date.now() - bouge >= immobileMs) {
      arrete = true;
      bloque();
    }
  }, pas);
}

// The wait for the group <vie> left alive, under the same watch as a session (standing still, it
// is killed) and <annulation> (cancelled, it is killed and the wait ends `annulee`).
export async function attendreLeGroupe(vie, { immobileMs, traces, annulation = null }) {
  const tuer = () => {
    signalerGroupe(vie.pid, 'SIGTERM');
    setTimeout(() => signalerGroupe(vie.pid, 'SIGKILL'), 5_000).unref();
  };
  const veille = surveiller({ immobileMs, traces }, tuer);
  let annulee = false;
  const surAnnulation = () => {
    annulee = true;
    tuer();
  };
  annulation?.addEventListener('abort', surAnnulation, { once: true });
  try {
    while (groupeVivant(vie)) {
      await new Promise(r => setTimeout(r, 500));
    }
  } finally {
    clearInterval(veille);
    annulation?.removeEventListener('abort', surAnnulation);
  }
  return { annulee: annulee || Boolean(annulation?.aborted) };
}

// The template of the instruction at <rang> (0 the testwriter's and the developpeur's, 1 the
// reviewer's, 2 any session's on a sheet absent or out of its schema, 3 the testwriter's and the
// developpeur's on a resumption, 4 the questionneur's on the plan, 5 the explorateur's on the plan,
// 6 the explorateur's on the questions of the plan, 7 the explorateur's on the tri of the
// discoveries, 8 the explorateur's on the gesture of a mechanical ticket), filled with <valeurs>.
export function consigne(valeurs, rang = 0) {
  const texte = readFileSync(GABARIT, 'utf8');
  const bloc = [...texte.matchAll(/```text\n([\s\S]*?)\n```/g)][rang];
  if (!bloc) {
    throw new Error(`gabarit sans bloc de consigne n° ${rang + 1} : ${GABARIT}`);
  }
  return `${bloc[1].replace(/\{\{(\w+)\}\}/g, (m, k) => (k in valeurs ? valeurs[k] : m))}\n`;
}

// What a direct asks of the reviewer of its lot, written once: the instruction of the circuit's
// reviewer on a direct circuit and that of the rescue command carry it.
const EXIGENCE_DU_DIRECT = [
  'CE LOT EST UN DIRECT : un seul agent, le rôle `direct`, a écrit les tests et le code ensemble. Tout constat bloquant lui est adressé : son destinataire est `direct`.',
  "La preuve du rouge n'est pas jouée : tu la tiens. Un défaut corrigé porte un test qui le reproduit, et ce test échoue sans le code du lot ; sans lui, le constat est bloquant. Un ticket de données ou le squelette d'un paquet, qui ne change aucun comportement, n'a pas de test à exiger.",
].join('\n\n');

/**
 * The instruction of the reviewer of a direct lot: that of the circuit's reviewer (the second
 * template of the supervisor's skill) filled with <valeurs>, then `propre`, what the caller alone
 * says of the lot, then what a direct asks of it.
 * @param {Record<string, string>} valeurs
 * @param {string | null} [propre]
 * @returns {string}
 */
export function consigneDuRelecteurDUnLotDirect(valeurs, propre = null) {
  return `${[consigne(valeurs, 1).trim(), propre, EXIGENCE_DU_DIRECT].filter(Boolean).join('\n\n')}\n`;
}

// One session of <role> on the whole ticket: its sheet. A relaunch on its step (<tentative> past
// 1) that is not the last (<derniere>) resumes the agent's session the circuit keeps
// (<reprise>, its author and id) with the short instruction (the fourth template); its sheet
// refused is asked again once of that same session, as of a fresh one (`jusquALaFiche`), so the
// question it carries goes up (BP 320.3.9); a resumption that ends in error (a code other than 0:
// the session not found) falls back on a fresh and whole session, under a new id, which
// <retenir> gives the circuit to keep before its launch. A fresh session's instruction (the first
// template) carries the ticket's description and notes as they are at its launch, the packages of
// the plan, and the last handover of its author at the ticket. Every instruction, fresh or resumed,
// carries the supervisor's context of the run at its head, as its task, and the findings of the
// reviewer still open for its role (<constats>, which the circuit keeps), all of them, whatever the relaunch: a proof
// refused, red checks, a sending, a RENDU, a resumption of the supervisor (`constatsDeLaSeance`);
// <change> says what changed on a resumption, when it is not the proof or the checks (the
// integration's refusal of the lot, `refus`). Returns the sheet and the findings it leaves,
// which the circuit keeps: the activity writes nothing of the circuit's memory.
// A file left with the marks of a conflict never closes the copy, as git refuses to record an
// unmerged path and pre-commit's check-merge-conflict a file that carries a marker
// (`marquesDuRole`): the instruction names the files of the role that carry marks, and its sheet
// FAIT is refused while one of them does, the file named, as a sheet out of conformity (a sheet
// BLOQUÉ or BESOIN goes up as it is).
// Throws an Arret for a launch that stops before its session, a motionless session, or
// a session that ends twice without a sheet that conforms.
async function uneSeance(
  ctx,
  role,
  {
    tentative,
    rapport: rapportBrut,
    fichiers = null,
    fort,
    derniere,
    change,
    seanceId,
    lectures,
    constats: gardes = [],
    reprise: gardee = null,
    retenir = () => {},
    estUnTest = rouleDeTest(ctx),
    evenement = 'neuve',
    ...activite
  }
) {
  // A resumption at the step that carries a red (`fichiers`, the files the red names): the session
  // carries these files alone, the rest of the lot being green.
  const porte = fichiers?.length
    ? `${rapportBrut ?? ''}\n\nCette séance ne porte que ${fichiers.join(', ')} : le reste du lot est vert et ne se touche pas.`.trim()
    : rapportBrut;
  // The files seen with marks stay looked at, whatever the index says of them afterwards.
  const vus = new Set(ctx.fichiersDuConflit ?? []);
  const marques = () => {
    const { siens } = marquesDuRole(ctx, role, estUnTest, [...vus]);
    siens.forEach(f => vus.add(f));
    return siens;
  };
  const enConflit = marques();
  const rapport = enConflit.length
    ? `${porte ?? ''}\n\nLa copie garde un conflit non résolu dans ces fichiers de ton rôle : ${enConflit.join(', ')}. ${RESOUDRE}`.trim()
    : porte;
  const nom = nomDuRole(role);
  const reprise = tentative > 1 && !derniere && gardee?.agent === role ? gardee : null;
  const {
    tache,
    ouverts,
    constats,
    valider: repond,
    repondre,
  } = constatsDeLaSeance(ctx.contexte, gardes, role, ctx.destinataire ?? null);
  const valider = f =>
    [repond(f), f.statut === 'FAIT' ? fauteDesMarques(marques()) : null]
      .filter(Boolean)
      .join(' ; ') || null;
  // The last sign of life of a launch of this session, which a fresh session after a failed
  // resumption waits for while its group runs.
  let dernierSigne = activite.precedent ?? null;
  const suivie = {
    ...activite,
    signeDeVie: vie => {
      if (vie) {
        dernierSigne = vie;
      }
      activite.signeDeVie?.(vie);
    },
  };
  const plan = ctx.paquets.join(', ');
  // The sheet of an author of the circuit carries what its lot holds out of the rule of its role.
  const repondu = fiche => {
    const constats = fiche ? repondre(gardes, fiche) : gardes;
    const horsRole = fiche && AUTEURS_JUGES.has(role) ? jugerLeLot(ctx, role) : null;
    return { fiche: horsRole ? { ...fiche, horsRole } : fiche, constats };
  };
  if (reprise) {
    const courte = {
      role: nom,
      ticket: ctx.ticket,
      sujet: ctx.sujet,
      paquets: plan,
      tentative,
      change:
        change ??
        (rapport?.startsWith(TITRE_DU_LOT)
          ? 'le jugement du lot, joué après ta séance, trouve ton lot hors de la règle de ton rôle'
          : role === 'testwriter'
          ? 'la preuve du rouge, jouée après ta séance, refuse ton lot'
          : role === 'direct'
            ? 'la passe finale, jouée après ta séance, est rouge'
            : 'les contrôles, joués après ta séance, sont rouges'),
      rapport: rapport ?? 'aucun',
      tache,
      ouverts,
      constats,
    };
    const fiche = await jusquALaFiche(ctx, role, consigne(courte, 3), {
      fort,
      premiere: 'reprend',
      id: reprise.seance,
      evenement: 'reprise',
      repli: true,
      valider,
      ...suivie,
    });
    if (fiche) {
      return repondu(fiche);
    }
    commenter(
      ctx,
      role,
      `reprise de la séance ${reprise.seance} finie en erreur : séance neuve et entière.`
    );
  }
  const lots = fichiers?.length ? fichiers : lectures.lots();
  const { description, notes } = leTicket(ctx);
  // The last handover of this agent; for a developpeur without one yet, the testwriter's last.
  const passation =
    derniereDe(ctx, role) ?? (role === 'developpeur' ? derniereDe(ctx, 'testwriter') : null);
  const valeurs = {
    role: nom,
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    paquets: plan,
    reprise:
      tentative > 1 || ctx.reprendre || ctx.depuis || fichesDe(ctx, role).length
        ? "oui : une séance d'avant a travaillé ce ticket ; ta copie garde son travail, le rapport ci-dessous dit ce qui reste"
        : 'non',
    lots: lots.length
      ? `${role === 'developpeur' ? 'le lot de tests' : 'tes tests'}, déjà dans la copie : ${lots.join(', ')}`
      : 'aucun',
    tache,
    description: description.trim() || 'aucune',
    // The section of the ticket's notes, absent without notes.
    notes: notes.trim()
      ? `\nLES NOTES DU TICKET, l'état qu'un agent d'avant y a écrit :\n\n${notes.trim()}\n`
      : '',
    rapport: rapport ?? 'aucun',
    ouverts,
    constats,
    passation: passation?.text ?? 'aucune',
    references: lectures
      .references()
      .map(r => `- ${r.nom} : ${r.fichiers.map(f => `\`${f}\``).join(', ')}`)
      .join('\n'),
  };
  retenir({ agent: role, seance: seanceId });
  return repondu(
    await jusquALaFiche(ctx, role, consigne(valeurs), {
      fort,
      valider,
      id: seanceId,
      evenement,
      ...suivie,
      precedent: dernierSigne,
    })
  );
}

// How a file in conflict is resolved, as every instruction that names one says it.
const RESOUDRE =
  'Les marques de conflit sont dans la copie (`<<<<<<<`, `=======`, `>>>>>>>`) : tu résous chaque fichier, marques retirées.';

/**
 * The rule of a test file of the module of the language of the copy of <ctx> (`estUnTest`); a copy
 * the module does not read judges every file the developpeur's.
 * @param {{ copie: string }} ctx
 */
export function rouleDeTest(ctx) {
  return fichier => {
    try {
      return langageDe(ctx.copie).estUnTest(fichier, ctx.copie);
    } catch {
      return null;
    }
  };
}

// The files of the copy of <ctx> that still carry the marks of a conflict (`marquesRestantes`, the
// files of the conflict the circuit keeps among them), by who writes them: `siens`, those <role>
// writes (`ecritPar`), `autres`, the other role's. A role that writes no file has none.
function marquesDuRole(ctx, role, estUnTest, suspects = ctx.fichiersDuConflit ?? []) {
  const ecrit = ecritPar(role, estUnTest);
  if (!ecrit) {
    return { siens: [], autres: [] };
  }
  const marques = marquesRestantes(ctx.copie, suspects);
  return { siens: marques.filter(f => ecrit(f)), autres: marques.filter(f => !ecrit(f)) };
}

// What refuses a sheet whose session leaves <fichiers> with the marks of a conflict, or null.
const fauteDesMarques = fichiers =>
  fichiers.length
    ? `conflit non résolu : ${fichiers.join(', ')} ${fichiers.length > 1 ? 'portent' : 'porte'} encore des marques de conflit (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`), à retirer en résolvant ${fichiers.length > 1 ? 'chaque fichier' : 'le fichier'}`
    : null;

/**
 * The session of <role> on the whole ticket (`uneSeance`), the role that can lift a conflict
 * always launched, as GitHub leaves the resolution to who can write the file: a launch the
 * launcher refuses (the stop « lancement ») while files of the other role carry the marks of a
 * conflict (the launcher accepts only the role that writes one of them,
 * scripts/enveloppe/travail-de-la-copie.mjs `--role`) goes to that role first, a fresh session
 * whose report names these files as the conflict it resolves, as the relaunch before a pass names
 * them (scripts/circuit.mjs `avantLaPasse`), under an id and an event of its own (« conflit »):
 * an attempt played again never takes its sheet for the one of <role>. Its sheet BLOQUÉ or BESOIN
 * goes up as its own (`arretDuStatut`); on FAIT, the session of <role> launches again, once: a
 * second refusal goes up.
 */
export async function seance(ctx, role, options) {
  try {
    return await uneSeance(ctx, role, options);
  } catch (e) {
    const { autres } =
      e instanceof Arret && e.nom === 'lancement'
        ? marquesDuRole(ctx, role, options.estUnTest ?? rouleDeTest(ctx))
        : { autres: [] };
    if (!autres.length) {
      throw e;
    }
    const autre = role === 'testwriter' ? 'developpeur' : 'testwriter';
    commenter(
      ctx,
      role,
      `lancement refusé sur un conflit dans des fichiers du ${nomDuRole(autre)} (${autres.join(', ')}) : sa séance d'abord, puis celle-ci.`
    );
    const { fiche, constats } = await uneSeance(ctx, autre, {
      ...options,
      tentative: 1,
      reprise: null,
      retenir: () => {},
      change: undefined,
      fichiers: null,
      rapport: `Le lancement de la séance du ${nomDuRole(role)} s'arrête sur un conflit de la copie dans des fichiers de ton rôle, nommés ci-dessous : ta séance ne porte que leur résolution, puis la sienne se relance.`,
      seanceId: idDeSeance(ctx, `conflit:${autre}`),
      evenement: 'conflit',
    });
    if (fiche.statut !== 'FAIT') {
      throw arretDuStatut(
        ctx,
        autre,
        1,
        fiche,
        `Sa séance devait lever un conflit de la copie (${autres.join(', ')}) avant celle du ${nomDuRole(role)}.`
      );
    }
    if (fiche.horsRole) {
      throw new Arret('controles', fiche.horsRole.rapport);
    }
    return uneSeance(ctx, role, { ...options, constats });
  }
}

/**
 * The stop for the sheet <fiche> of the session <tentative> of <role>, BLOQUÉ (« hors-portee »)
 * or BESOIN (« besoin »): its reason or question first, then its handover; the sheet's piece as
 * its own, and the agent's question as its own, with the package of the file out of the plan a
 * BESOIN sheet names (`manque`) and the command that extends the plan to it. <suite> says what
 * follows a BLOQUÉ.
 */
export function arretDuStatut(
  ctx,
  role,
  tentative,
  fiche,
  suite = 'Le circuit ne le relance pas sur ce rouge.'
) {
  const passation = derniereDe(ctx, role)?.text ?? 'aucune';
  const qui = leRole(role);
  const { piece } = fiche;
  return fiche.statut === 'BESOIN'
    ? new Arret(
        'besoin',
        `${qui} attend une réponse (séance ${tentative}) : ${fiche.question}\n\nSa passation :\n\n${passation}`,
        {
          piece,
          question: [`${qui} demande : ${fiche.question}`, questionDuManque(ctx, fiche.manque)]
            .filter(Boolean)
            .join('\n\n'),
        }
      )
    : new Arret(
        'hors-portee',
        `${qui} se déclare bloqué (séance ${tentative}) : ${fiche.raison}\n\n${suite} Sa passation :\n\n${passation}`,
        { piece }
      );
}

// The file <manque> of a BESOIN sheet, from the root of the copy, and the package that holds it
// (`.` the root), read on the components of the copy; null when it names no path of the copy.
function fichierManquant(ctx, manque) {
  const chemin = manque ? path.posix.normalize(manque.trim()) : '.';
  if (chemin === '.' || chemin.startsWith('..') || path.isAbsolute(chemin)) {
    return null;
  }
  try {
    const racine = existsSync(ctx.copie) ? ctx.copie : ctx.racine;
    const liste = paquetsDuLangage(langageDeLaCopie(racine), racine);
    return { chemin, paquet: paquetQuiTient(chemin, liste) };
  } catch {
    return null;
  }
}

const dansLePlan = (ctx, paquet) => ctx.paquets.some(p => p === '.' || p === paquet);

// What the question of a BESOIN stop adds on the file <manque> out of the plan, or null.
function questionDuManque(ctx, manque) {
  const f = fichierManquant(ctx, manque);
  if (!f || dansLePlan(ctx, f.paquet)) {
    return null;
  }
  return f.paquet === '.'
    ? `${f.chemin} est à la racine du dépôt, hors du plan du ticket : aucun paquet ne le porte, l’écriture est-elle refusée (\`--reprendre\` avec son contexte) ?`
    : `${f.chemin} est dans ${f.paquet}, hors du plan du ticket : le plan s’étend-il à ce paquet (\`--etendre ${f.paquet}\`), ou l’écriture est-elle refusée (\`--reprendre\` avec son contexte) ?`;
}

// The extension of the plan the file <manque> of a BESOIN sheet of <role> calls for without a
// question: `{ etendre: { paquet, chemin, piece } }` for a file the ticket's description names,
// `{ etendreTests: … }` for a test file of a reader package the testwriter asks for (the plan
// extends to its tests alone), null for any other (the root and the documents the responsable
// owns among them), which goes up.
function extensionDemandee(ctx, role, manque) {
  const f = fichierManquant(ctx, manque);
  if (!f || f.paquet === '.' || dansLePlan(ctx, f.paquet)) {
    return null;
  }
  const nomme = fichierNommeAuTicket(leTicket(ctx).description, f.chemin);
  if (nomme) {
    return { etendre: { ...f, piece: nomme.piece } };
  }
  if (role !== 'testwriter' || (ctx.testsEtendus ?? []).includes(f.paquet)) {
    return null;
  }
  const classe = rouleDeTest(ctx)(f.chemin);
  return classe?.test && !classe.matiere
    ? {
        etendreTests: {
          ...f,
          piece: `${f.chemin} est un fichier de test de ${f.paquet}, un paquet lecteur que le lot fait rougir`,
        },
      }
    : null;
}

// The authors of the code, whose sheet answers each finding open for them.
const REPONDENT = ['developpeur', 'direct'];

// The findings of the reviewer open for <role> among <constats>, as a session of the run whose
// supervisor's context is <contexte> (`--contexte`, with `--depuis`, `--reprendre` or
// `--etendre`) receives them, as a review its author relaunches on a change he frames keeps its
// open threads in sight without blocking on them (BP 320.14.2.3: the context after the rule of
// the answers, a session that worked an old finding only, its sheet refused, « sans-livraison »
// twice). With a context, the context heads the instruction as its task (`tache`); the findings
// open at the launch of the run (`enContexte`, `auLancement`) are its context, after the others
// under their own heading, and a developpeur's sheet FAIT is not refused for want of an answer to
// one of them; every other finding, without a context or stated by a RENDU within the run, is its
// task, and his sheet FAIT answers each by its title, refused without one (`valider`,
// `reponsesAuxConstats`). Either way, each answer a developpeur's sheet gives is kept with its
// finding (`repondre`, `avecLesReponses`).
// A context the supervisor gave to another role (<destinataire>, the role `--depuis` names: the
// run plays that role's step, then the ones after it) heads the instruction under that role's
// name: what it asks of him is his session's work, and this session does its own role's share, as
// a job of a pipeline replayed with the variables of the retry reads those meant for another job
// without taking them for its own.
export function constatsDeLaSeance(contexte, constats, role, destinataire = null) {
  const siens = (constats ?? []).filter(c => c.role === role);
  const anciens = siens.filter(c => c.enContexte);
  const neufs = siens.filter(c => !c.enContexte);
  const repondAuxConstats = REPONDENT.includes(role);
  const titres = repondAuxConstats ? neufs.map(c => c.titre) : [];
  const enContexte = `les constats ouverts au lancement de la passe du superviseur, donnés en contexte : ta tâche est celle du superviseur, ci-dessus ; chacun reste ouvert jusqu'à la relecture qui le juge levé, et ta fiche n'a pas à répondre à chacun`;
  const titre =
    'LES CONSTATS DU RELECTEUR QUI RESTENT OUVERTS pour ton rôle, ' +
    (anciens.length && !neufs.length ? enContexte : "chacun jusqu'à la relecture qui le juge levé");
  const texte =
    anciens.length && neufs.length
      ? `${texteDesOuverts(neufs)}\n\nPUIS ${enContexte} :\n\n${texteDesOuverts(anciens, neufs.length)}`
      : texteDesOuverts(siens);
  const avant = `elle passe avant le ticket, le rapport${anciens.length ? ' et les constats donnés en contexte' : ''} ci-dessous`;
  const autre = destinataire && destinataire !== role ? destinataire : null;
  return {
    tache: contexte
      ? autre
        ? `LA TÂCHE DU SUPERVISEUR, donnée au ${nomDuRole(autre)} en relançant le circuit depuis son étape (\`--depuis ${autre}\`) ; ${avant}. Elle s'adresse à lui : ce qu'elle lui demande est le travail de sa séance, déjà jouée ; ta part est celle de ton rôle sur ce qu'elle vise, et tu ne lui renvoies pas ce qu'elle lui demandait :\n\n${contexte}\n\n`
        : `TA TÂCHE, que le superviseur te donne ; ${avant} :\n\n${contexte}\n\n`
      : '',
    ouverts: titre,
    constats: texte,
    valider: f => reponsesAuxConstats(f, titres),
    repondre: (tous, fiche) =>
      repondAuxConstats && siens.length ? avecLesReponses(tous, fiche) : tous,
  };
}

// The findings <constats> as a run launched with the supervisor's context <contexte> holds them:
// each one open at its launch marked `enContexte`, as the threads already open when the author
// relaunches a review on a change he frames; without a context, none. A finding a RENDU states
// within the run comes without the mark (`constatsOuverts`), and is the session's task again.
export const auLancement = (contexte, constats) =>
  (constats ?? []).map(c => {
    const { enContexte: _ancien, ...reste } = c;
    return contexte ? { ...reste, enContexte: true } : reste;
  });

// The findings <constats>, each finding of the author of the code that his sheet <fiche> answers (by its
// title, numbered or not: `cleDuConstat`) with its answer `{ etat, raison, piece }`, as a thread
// of a review keeps the author's reply under its comment.
function avecLesReponses(constats, fiche) {
  const parTitre = new Map((fiche.reponses ?? []).map(r => [cleDuConstat(r.titre), r]));
  return (constats ?? []).map(c => {
    const r = REPONDENT.includes(c.role) ? parTitre.get(c.titre) : undefined;
    if (!r) {
      return c;
    }
    return {
      ...c,
      reponse: { etat: r.etat, ...(r.raison ? { raison: r.raison } : {}), piece: r.piece },
    };
  });
}

// The launch <r> of a session of <role>: nothing for a session that went its way, or the Arret it
// is: a motionless session (« bloqué »), a launch that stops before its session (« lancement »).
export function seanceLancee(ctx, role, r) {
  if (r.bloque) {
    const minutes = Math.round(ctx.immobileMs / 60_000);
    throw new Arret(
      'bloqué',
      `La transcription de la séance du ${role} n'a pas bougé en ${minutes ? `${minutes} min` : `${ctx.immobileMs} ms`} : la séance est arrêtée. Les dernières lignes du journal :\n\n${fin(lire(ctx.journal), 40)}`
    );
  }
  // The envelope's refusal: it ended on a code other than 0 without the witness that its command
  // started (`demarree`, a state, never a text of the log): the launch died before its session,
  // whether the ticket already holds transcripts or not. The end of the log, where the envelope
  // says why, is cited in the report.
  if (r.demarree === false && r.seance !== null && r.seance !== 0) {
    throw new Arret(
      'lancement',
      `L'enveloppe refuse le lancement de la séance du ${role} (code ${r.seance}) : sa commande n'a pas démarré.\n\n${fin(lire(ctx.journal), 20)}`
    );
  }
  if (r.seance === null) {
    throw new Arret(
      'lancement',
      `Le lanceur s'arrête avant la séance du ${role} (code ${r.code}).\n${r.erreur.trim()}\n\n${fin(lire(ctx.journal), 20)}`
    );
  }
}

// The size in bytes of the ticket's log, 0 without it: where a launch's own lines begin.
function tailleDuJournal(ctx) {
  try {
    return statSync(ctx.journal).size;
  } catch {
    return 0;
  }
}

// The lines the ticket's log gained since <depuis> bytes: the end of the log the launch wrote.
function finDuJournal(ctx, depuis) {
  try {
    return readFileSync(ctx.journal).subarray(depuis).toString('utf8');
  } catch {
    return '';
  }
}

// The relaunch of the event <evenement> the dead attempt <precedent> of <ctx> made last (2, its
// resumption, or 1), when this attempt is one Temporal plays again and that session ranged its
// result; else 1.
function relanceDeLaMorte(ctx, evenement, precedent) {
  if ((ctx.essaiDeLActe ?? 1) < 2 || !precedent?.seanceId) {
    return 1;
  }
  if (!existsSync(rangDeLaSeance(ctx, precedent.seanceId).fin)) {
    return 1;
  }
  return precedent.lancement === `lancement:${evenement}:2` ? 2 : 1;
}

// Whether claude holds a conversation under the session <id> of <ctx>: its transcript,
// `<id>.jsonl`, among those of the ticket's copy (`ctx.transcriptions`), or among those of the
// main tree, where a session out of the envelope runs before the copy exists.
function conversationOuverte(ctx, id) {
  return [ctx.transcriptions, transcriptionsDeLaCopie(ctx.racine, os.homedir())].some(d =>
    existsSync(path.join(d, `${id}.jsonl`))
  );
}

// The session of <role> with the instruction <texte>, its sheet read in its result
// (scripts/resultats.mjs): the sheet, kept with the ticket's sheets, its discoveries filed. A
// session that ends without a sheet that conforms (none, one out of its schema, a code other than
// 0) is resumed once, the same session, with the short instruction that names what lacks (the
// third template). The session opens under the id <id>, which its caller gives (a caller that plays
// an attempt again gives the same, and the session resumes), or resumes it with <premiere>
// « reprend »; with <repli> (a resumption), a session that ends in error returns null, for a
// fresh session in its place. A session it opened is resumed only when claude holds its
// conversation (`conversationOuverte`, its transcript): without one (its launch ended in error
// before claude opened it), there is nothing to resume, as a cache
// missed is built again, and the session launches afresh under the same id, once, with <texte>,
// the whole instruction of its role, said at the ticket, and keeps its own resumption.
// Throws an Arret for a launch that stops before its session, a
// motionless session, or twice no sheet that conforms (« sans-fiche »). <avec> joins its fields
// to the sheet's entry (the lot a review read); <valider>(sheet, attempt) names what makes a sheet
// out of conformity beyond its schema at that attempt (an unknown package of a plan, an answer
// without a line for a question put, a discovery without its verdict), or null. <fiche> names its
// sheet's schema when it is not its role's (`tri`), and <objet> its launch (`lancer`). Its sign of
// life (<signeDeVie>), its cancellation (<annulation>) and the group of an attempt before
// (<precedent>) go to each launch, `lancer`, the one place that waits for a group still alive:
// its second launch passes the group of its first. <surLaSeance> receives the id of the session
// whose sheet it keeps (the dead attempt's when it took that one up).
export async function jusquALaFiche(ctx, role, texte, options = {}) {
  const {
    premiere = 'ouvre',
    id,
    evenement,
    avec = {},
    valider = () => null,
    repli = false,
    surLaSeance = () => {},
    ...reste
  } = options;
  if (!id) {
    throw new Error(
      `la séance du ${nomDuRole(role)} n'a pas d'identifiant : il vient de l'appelant (\`id\`).`
    );
  }
  if (!evenement) {
    throw new Error(
      `la séance du ${nomDuRole(role)} n'a pas d'événement (\`evenement\`) : il nomme ses lancements.`
    );
  }
  // The session its relaunch resumes: the one whose result came back, the dead attempt's when this
  // attempt took it up.
  let courante = id;
  const ouvrir = mode =>
    reste.horsEnveloppe
      ? { session: [mode === 'ouvre' ? '--session-id' : '--resume', courante] }
      : { [mode]: courante };
  let lu = null;
  // The last sign of life of a launch, which the next one waits for while its group runs.
  let derniere = reste.precedent ?? null;
  // An attempt Temporal plays again starts at the launch the dead attempt made last, its
  // relaunch of this event whatever its rank, when that session ranged its result (`lancer`).
  const premier = relanceDeLaMorte(ctx, evenement, derniere);
  const signeDeVie = vie => {
    if (vie) {
      derniere = vie;
    }
    reste.signeDeVie?.(vie);
  };
  // The instruction of a resumption after the plan extended to the file a BESOIN sheet names: the
  // session goes on, and the launch is neither a first nor a second. Each package extends once.
  let etendu = null;
  const etendus = new Set();
  // Whether the session already launched afresh for want of a conversation to resume, and
  // whether this call launched it: the launch of a dead attempt is taken up as it is (`lancer`).
  let repartie = false;
  let lancee = false;
  for (let essai = premier; essai <= 2; essai++) {
    const courte = () => consigne({ ticket: ctx.ticket, sujet: ctx.sujet, erreur: lu.erreur }, 2);
    const avantLeJournal = tailleDuJournal(ctx);
    let mode = etendu || essai > 1 ? 'reprend' : premiere;
    // The session this call opened has no conversation to resume: it launches afresh, its first
    // launch again, with its whole instruction.
    if (
      mode === 'reprend' &&
      premiere === 'ouvre' &&
      !etendu &&
      lancee &&
      !repartie &&
      !conversationOuverte(ctx, courante)
    ) {
      repartie = true;
      commenter(
        ctx,
        role,
        `aucune conversation à reprendre sous la séance ${courante} : séance neuve et entière.`
      );
      lu = null;
      essai = 1;
      mode = 'ouvre';
    }
    const r = await lancer(ctx, role, etendu ?? (essai === 1 || !lu ? texte : courte()), {
      ...reste,
      precedent: derniere,
      evenement,
      relance: essai,
      signeDeVie,
      ...ouvrir(mode),
    });
    lancee = true;
    etendu = null;
    // The lot of the session, judged as soon as it ends, whatever it ends on.
    const hors = estJuge(role, reste.horsEnveloppe) ? jugerLeLot(ctx, role) : null;
    // The usage limit stops a session that does not end on its own: neither a sheet missing nor a
    // sheet to resume, the circuit waits for the hour the usage returns (« limite-d-usage »).
    const limite =
      r.seance !== 0
        ? limiteDUsage({ resultat: r.sortie, journal: finDuJournal(ctx, avantLeJournal) })
        : null;
    if (limite) {
      throw new Arret(
        'limite-d-usage',
        `La séance du ${nomDuRole(role)} est arrêtée par la limite d'usage ; elle reprend ${limite.lisible ? `à l'heure que la limite donne (${new Date(limite.reprise).toISOString()})` : 'dans une heure, la limite ne donne aucune heure lisible'}.`,
        { resultat: limite }
      );
    }
    seanceLancee(ctx, role, r);
    courante = r.id ?? courante;
    if (repli && r.seance !== 0) {
      return null;
    }
    lu =
      r.seance === 0
        ? lireSaFiche(ctx, reste.fiche ?? role, r.sortie)
        : { erreur: `la séance finit en erreur (code ${r.seance})` };
    // The session's own validation judges a sheet that holds its schema, refused or not for what
    // it lacks: every fault goes to the one resumption (scripts/resultats.mjs `lireFiche`).
    const lue = lu.fiche ?? lu.lue ?? null;
    const faute = lue ? valider(lue, essai) : null;
    if (faute) {
      lu = { erreur: lu.erreur ? `${lu.erreur} ; ${faute}` : `fiche non conforme : ${faute}` };
    }
    // A role that writes nothing leaves an empty lot: its files go to the one resumption too.
    if (hors && reste.horsEnveloppe) {
      lu = { erreur: [lu.erreur, hors.rapport].filter(Boolean).join(' ; ') };
    }
    if (lu.fiche?.statut === 'BESOIN' && lu.fiche.manque && !reste.horsEnveloppe) {
      const demande = extensionDemandee(ctx, role, lu.fiche.manque);
      const extension = demande?.etendre ?? demande?.etendreTests;
      const etendre = demande?.etendre ? ctx.etendreEnVol : ctx.etendreTestsEnVol;
      if (extension && etendre && !etendus.has(extension.paquet)) {
        etendus.add(extension.paquet);
        garder(ctx, role, lu.fiche, avec);
        etendre(extension);
        etendu = demande.etendre
          ? `Le plan du ticket s'étend à ${extension.paquet} (${extension.piece}) : ${extension.chemin} s'écrit maintenant. Reprends ta tâche là où tu l'as laissée.`
          : `Le plan du ticket s'étend aux tests de ${extension.paquet} (${extension.piece}) : ${extension.chemin} s'écrit maintenant, les fichiers de test de ce paquet seuls ; son code reste hors du plan. Reprends ta tâche là où tu l'as laissée.`;
        essai--;
        continue;
      }
    }
    if (lu.fiche) {
      // The session that gave it, which a resumption of it names (the plan's answer).
      surLaSeance(courante);
      return garder(ctx, role, lu.fiche, avec);
    }
    if (essai === 1) {
      commenter(ctx, role, `séance finie sans fiche conforme : ${lu.erreur} ; reprise une fois.`);
    }
  }
  throw arretQuiSeDit(
    'sans-fiche',
    `Deux fois, la séance du ${nomDuRole(role)} finit sans fiche conforme : ${lu.erreur}. Le journal du ticket : ${ctx.journal} (il se cite en pièce, \`${ctx.ticket}.log:<ligne>\`)`
  );
}

// The stop <nom> whose error message says its report too, for a caller that reads the error alone.
const arretQuiSeDit = (nom, rapport) =>
  Object.assign(new Arret(nom, rapport), { message: `${nom} : ${rapport}` });

// The sheet of schema <sorte> (a role's, or the tri's) in the output <sortie> of its session
// (`lireFiche`), each file piece of it checked in the ticket's copy, or in the main tree before the
// copy exists and once the integration removed it, and each piece of the ticket in its description.
export const lireSaFiche = (ctx, sorte, sortie) =>
  lireFiche(sorte, sortie, {
    copie: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    ticket: leTicket(ctx).description,
  });

// The sheet <fiche> of <role>, kept with the ticket's sheets, <avec> joined to its entry, each of
// its discoveries filed closed under the ticket (the effect `decouverte`), its components the
// packages of the plan, and kept with the circuit's results (`decouverte`: its id and its subject),
// which the tri reads; returns it. A body `@<fichier>` is read from its file (from the main tree),
// so that the effect carries its text.
export function garder(ctx, role, fiche, avec) {
  inscrire(ctx, { role, fiche, ...avec });
  // The components of the plan, read once a discovery is to be filed.
  const composants = () => nomsDe(ctx, ctx.paquets).join(', ');
  for (const d of fiche.decouvertes ?? []) {
    const corps = d.corps.startsWith('@')
      ? readFileSync(path.resolve(ctx.racine, d.corps.slice(1)), 'utf8').trimEnd()
      : d.corps;
    emettre(ctx, {
      genre: 'decouverte',
      role: AUTEUR_DU_CIRCUIT,
      sujet: d.sujet,
      corps,
      composants: composants(),
    });
  }
  return fiche;
}

// The judgment of the lot (machine.md §5.5), as CODEOWNERS judges a change by the files it
// touches, whatever tool wrote them. The lot of a session is what it creates, changes or removes
// in the folder it works in, read on content between the tree the folder held before it (`avant`,
// which lancer.sh takes once the copy is prepared; else the circuit's, before the launch) and the
// tree it holds after it, `.beads/`, the files git ignores and the circuit's copies aside. In the
// main tree, which others write, each session is judged on what changes during it, a commit
// entered meanwhile aside. In a ticket's copy, a commit of the session takes nothing out of the
// lot, and a faulty file stays named until it is back to its state before the session that
// changed it (or to main's, once main changed it): the circuit keeps them by role in the working
// directory of the ticket (`lot-<rôle>.json`: the session under way `enCours`, the faulty files
// `fautifs`), so that neither a session that leaves them nor an act played again lets them pass.
// The judgment runs on the installed frame; it reads the languages of the copy, else, when they do
// not load there, those of the main tree, and it fails closed when neither loads.

// The authors of a circuit whose lot is judged on their rule; the agent direct writes tests and
// code, and its lot is not judged. Every other judged session writes nothing: an empty lot.
const AUTEURS_JUGES = new Set(['testwriter', 'developpeur']);

const estJuge = (role, horsEnveloppe) => Boolean(horsEnveloppe) || AUTEURS_JUGES.has(role);

// The head of the report of a lot out of the rule.
const TITRE_DU_LOT = 'Le lot de la séance sort de la règle de son rôle';

const REGLES_DU_LOT = {
  testwriter:
    'le testwriter n’écrit que ses fichiers de test, la matière de test partagée, la part de ses tests d’un manifeste et les fichiers de verrou des versions',
  developpeur: 'le développeur n’écrit ni un fichier de test ni la matière de test partagée',
};

const fichierDuLot = (ctx, role) => path.join(ctx.tmp, `lot-${role}.json`);

const lotGarde = (ctx, role) =>
  existsSync(fichierDuLot(ctx, role))
    ? JSON.parse(lire(fichierDuLot(ctx, role)))
    : { depot: null, enCours: null, fautifs: {} };

const garderLeLot = (ctx, role, lot) => {
  mkdirSync(ctx.tmp, { recursive: true });
  writeFileSync(fichierDuLot(ctx, role), `${JSON.stringify(lot)}\n`);
};

const estLArbrePrincipal = (ctx, depot) => path.resolve(depot) === path.resolve(ctx.racine);

const teteDe = depot =>
  spawnSync('git', ['-C', depot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

// Notes the session <id> of <role> about to work in <depot>, the tree it holds now.
function ouvrirLeLot(ctx, role, { id, horsEnveloppe, depot }) {
  const lot = lotGarde(ctx, role);
  garderLeLot(ctx, role, {
    depot,
    enCours: {
      id,
      horsEnveloppe: Boolean(horsEnveloppe),
      avant: existsSync(depot) ? photographier(depot) : null,
      principal: teteDe(ctx.racine),
    },
    fautifs: estLArbrePrincipal(ctx, depot) ? {} : lot.fautifs,
  });
}

// The tree the session `enCours` started from: the launcher's, taken after its preparation; else
// the circuit's, for a session out of the envelope, or one that ran to its end. Null for a launch
// that stopped before its session.
function avantLaSeance(ctx, enCours) {
  const rang = rangDeLaSeance(ctx, enCours.id);
  if (existsSync(rang.avant)) {
    return JSON.parse(lire(rang.avant));
  }
  return enCours.horsEnveloppe || existsSync(rang.fin) ? enCours.avant : null;
}

/**
 * Judges the lot of <role> (the section's header): the session under way, once, then each faulty
 * file kept, on the tree the folder holds now. Returns `{ fichiers, rapport }`, or null for a lot
 * in the rule of its role. Throws an Arret when no tree says which languages judge the lot.
 * @returns {{ fichiers: string[], rapport: string } | null}
 */
function jugerLeLot(ctx, role) {
  const lot = lotGarde(ctx, role);
  const { depot, enCours } = lot;
  if (!depot || !existsSync(depot)) {
    return null;
  }
  const principal = estLArbrePrincipal(ctx, depot);
  const avant = enCours ? avantLaSeance(ctx, enCours) : null;
  const apres = avant || !principal ? photographier(depot) : null;
  if (avant && apres) {
    const entres = new Set(
      principal && avant.tete !== apres.tete
        ? changements(depot, avant.tete, apres.tete).map(c => c.chemin)
        : []
    );
    for (const c of changements(depot, avant.arbre, apres.arbre)) {
      if (entres.has(c.chemin) && c.apres === etatDuFichier(depot, apres.tete, c.chemin)) {
        continue;
      }
      lot.fautifs[c.chemin] ??= { avant: c.avant, principal: enCours.principal };
    }
  }
  if (apres) {
    for (const [chemin, f] of Object.entries(lot.fautifs)) {
      const etat = etatDuFichier(depot, apres.arbre, chemin);
      const faute =
        !principal && revenuAMain(ctx, chemin, f.principal, etat)
          ? null
          : fauteDuFichier(ctx, role, depot, { chemin, avant: f.avant, apres: etat });
      if (faute) {
        f.parties = faute.parties;
      } else {
        delete lot.fautifs[chemin];
      }
    }
  }
  garderLeLot(ctx, role, { ...lot, enCours: null });
  const fautifs = Object.entries(lot.fautifs).sort(([a], [b]) => a.localeCompare(b));
  if (!fautifs.length) {
    return null;
  }
  const regle = REGLES_DU_LOT[role] ?? 'ce rôle n’écrit rien, son lot reste vide';
  const lignes = fautifs.map(
    ([chemin, f]) =>
      `- ${chemin}${f.parties ? ` (hors de la part de ses tests : ${f.parties.join(', ')})` : ''}`
  );
  const geste = principal
    ? 'D’autres écrivent l’arbre principal : défais seulement ce que tu as toi-même écrit.'
    : 'Remets chacun à son état d’avant la séance qui l’a changé.';
  return {
    fichiers: fautifs.map(([chemin]) => chemin),
    rapport: `${TITRE_DU_LOT} : ${regle}.\n${lignes.join('\n')}\n${geste}`,
  };
}

// Whether the file <chemin> of a copy, in the state <etat>, is back to main's after main changed it
// since <depuis>: what the advance of the copy brings is no work of a session.
function revenuAMain(ctx, chemin, depuis, etat) {
  const tete = teteDe(ctx.racine);
  return (
    tete !== depuis &&
    etatDuFichier(ctx.racine, tete, chemin) === etat &&
    etatDuFichier(ctx.racine, depuis, chemin) !== etat
  );
}

// What puts the change <c> of a file of <depot> out of the rule of <role>: `{ parties }`, the parts
// of a manifest out of its tests' (null for a whole file), or null for a change in the rule.
function fauteDuFichier(ctx, role, depot, c) {
  if (c.avant === c.apres) {
    return null;
  }
  const entier = { parties: null };
  if (!AUTEURS_JUGES.has(role)) {
    return entier;
  }
  return selonLesLangages(ctx, depot, (langage, racine) => {
    const abs = path.join(racine, c.chemin);
    const classe = langage.estUnTest(abs, racine);
    if (role === 'developpeur') {
      return classe ? entier : null;
    }
    // A reader package the plan extended to its tests: its test files alone.
    const lecteur = (ctx.testsEtendus ?? []).find(d => c.chemin.startsWith(`${d}/`));
    if (lecteur && !dansLePlan(ctx, lecteur)) {
      return classe?.test ? null : entier;
    }
    if (classe || langage.manifestes.verrous.includes(c.chemin)) {
      return null;
    }
    const parties =
      c.apres === null
        ? null
        : langage.manifestes.horsDesTests(
            abs,
            racine,
            texteDeLEtat(depot, c.avant),
            texteDeLEtat(depot, c.apres)
          );
    return parties?.length === 0 ? null : { parties };
  });
}

// `juger(langage, racine)` on the languages of <depot>, else on those of the main tree; an Arret
// that names the version of the frame, the two causes and the main tree when neither loads.
function selonLesLangages(ctx, depot, juger) {
  try {
    return juger(langageDe(depot), depot);
  } catch (ici) {
    try {
      return juger(langageDe(ctx.racine), ctx.racine);
    } catch (la) {
      const { version } = JSON.parse(lire(path.join(import.meta.dirname, '..', 'package.json')));
      throw arretQuiSeDit(
        'inattendu',
        `Le lot n'est pas jugé, et l'étape ne passe pas : la version ${version} du cadre ne charge les langages ni de la copie (${depot} : ${ici.message}) ni de l'arbre principal (${ctx.racine} : ${la.message}). L'arbre principal se répare par le superviseur, hors séance d'agent.`
      );
    }
  }
}

// The findings <constats> as an agent's instruction carries them, each under its heading, with
// what it holds, its body and its piece, numbered after <avant>; « aucun » without one.
export const texteDesOuverts = (constats, avant = 0) =>
  constats.length
    ? constats
        .map(
          (c, i) =>
            `### Constat ${avant + i + 1} — ${c.titre}\nBloquant : ${c.regle}\n${c.corps}${c.piece ? `\nPièce : ${c.piece}` : ''}`
        )
        .join('\n\n')
    : 'aucun';
