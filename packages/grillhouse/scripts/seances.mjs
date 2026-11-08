// The sessions of the agents as activities, as Temporal runs an activity: each session is a
// process group the activity launches (`jouerLeGroupe`), which sends a sign of life
// `{ pid, depart, seanceId }` at its launch and at each step of its watch, stops on a motionless
// transcript (`IMMOBILE_MS` of scripts/circuit.mjs, `ctx.immobileMs`), and, cancelled, kills its
// group; a launch that finds alive the group a launch before left (its last sign of life) waits
// for it, under the same watch, before it takes its place (`lancer`): the second attempt of
// `jusquALaFiche`, and the fresh session that follows a failed resumption in `seance`; the id of
// each session comes from its caller, which gives a new one to each session it launches. `lancer` launches one session, `jusquALaFiche` until its
// sheet, `seance` the testwriter's or the developpeur's on the whole ticket, with the instruction of
// the templates (`consigne`) and the findings of the reviewer open for its role
// (`constatsDeLaSeance`). The circuit (scripts/circuit.mjs) calls them (grillhouse-4nr.3).
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
import path from 'node:path';
import { GREFFON } from './cadre.mjs';
import { ecrireLaListe } from './enveloppe/paquets-du-plan.mjs';
import { nomDuRole } from './etapes.mjs';
import { departDe } from './mesure/base-de-passe.mjs';
import { groupeVivant, signalerGroupe } from './mesure-de-la-machine.mjs';
import { lancementDeLaPasse } from './passe-de-la-machine.mjs';
import { prendreUnePlace } from './places-de-la-machine.mjs';
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
import { AttenteDeLaMachine } from './verrou-de-machine.mjs';

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
 * result (`resultat.json`) and the reason of a write out of the plan (`hors-plan`).
 */
export function rangDeLaSeance(ctx, id) {
  const dossier = path.join(ctx.tmp, 'seances', id);
  return {
    dossier,
    fin: path.join(dossier, 'fin'),
    resultat: path.join(dossier, 'resultat.json'),
    horsPlan: path.join(dossier, 'hors-plan'),
  };
}

// The result the session ranged at <rang> left, or null without its end file.
function resultatRange(rang, id) {
  if (!existsSync(rang.fin)) {
    return null;
  }
  return {
    code: 0,
    seance: Number(readFileSync(rang.fin, 'utf8').trim()),
    bloque: false,
    horsPlan: existsSync(rang.horsPlan) ? lire(rang.horsPlan).trim() : null,
    erreur: null,
    sortie: lire(rang.resultat).trim(),
    id,
  };
}

// One launch of a session: `{ code, seance, bloque, erreur, sortie, id }`, `seance` the session's
// exit code (from lancer.sh's end file for a session in the envelope), null when the launch
// stopped before it, `sortie` claude's JSON result, its sheet in `structured_output`, `id` the
// session whose result it is. Every
// session runs with the author of its role (BEADS_ACTOR). A session in the envelope, on the whole
// ticket (`.` its component, the plan its `--paquets`), opens under the id <ouvre> (lancer.sh
// --seance), or resumes the session <reprend> (lancer.sh --reprise); its result is the file
// lancer.sh ranges under its id (`rangDeLaSeance`).
// A session <horsEnveloppe> (the explorateur's, the questionneur's, the reviewer's) is claude
// itself, in the ticket's
// copy (the main tree once the copy is gone), under <droits> (`horsDeLEnveloppe`), the
// schema of its role's sheet and the options <session> names (its id, or the session it
// resumes), its instruction on its standard input and its result on its standard output, ranged
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
    const mort = resultatRange(rangDeLaSeance(ctx, precedent.seanceId), precedent.seanceId);
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
  const rang = rangDeLaSeance(ctx, id);
  mkdirSync(rang.dossier, { recursive: true });
  rmSync(rang.fin, { force: true });
  rmSync(rang.resultat, { force: true });
  rmSync(rang.horsPlan, { force: true });
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
  let fds;
  if (horsEnveloppe) {
    entete(ctx, role);
    // Its result ranged under its id, as lancer.sh ranges a session's: claude's output, then its
    // exit code once it ends, written by the shell that runs it, which outlives a dead circuit.
    fds = [openSync(fichier, 'r'), openSync(rang.resultat, 'w'), openSync(ctx.journal, 'a')];
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
        '"$@"; c=$?; echo "$c" > "$0"; exit "$c"',
        rang.fin,
        process.env.CLAUDE_BIN || 'claude',
        ...['-p', '--agent', role, ...fiche, ...droits, '--add-dir', ctx.tmp, ...session],
      ],
      cwd: existsSync(ctx.copie) ? ctx.copie : ctx.racine,
    };
  } else {
    fds = ['ignore', 'ignore', openSync(erreurs, 'w')];
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
  // The session writes at the ticket under the author of its role, and its passes play on its
  // place (the mark of the place, `place.env`), taking none of their own.
  // A session out of the envelope (the relecteur, which plays tests) plays them on its share of
  // the cores, under nice and ionice; the launcher of an enveloped one does it in the envelope.
  const lancement = horsEnveloppe
    ? lancementDeLaPasse({
        lourde: false,
        cmd: commande.cmd,
        args: commande.args,
        env: { ...process.env, ...place.env, [ACTEUR]: role },
      })
    : {
        cmd: commande.cmd,
        args: commande.args,
        env: { ...process.env, ...place.env, [ACTEUR]: role },
      };
  const fermer = () => {
    for (const fd of new Set(fds.filter(f => typeof f === 'number'))) {
      closeSync(fd);
    }
  };
  const r = await jouerLeGroupe({
    cmd: lancement.cmd,
    args: lancement.args,
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
  if (r.pid === null && r.annulee) {
    fermer();
  }
  place.rendre();
  if (r.annulee) {
    throw new SeanceAnnulee(role);
  }
  let seance;
  let sortie;
  let horsPlan = null;
  if (horsEnveloppe) {
    seance = existsSync(rang.fin)
      ? Number(readFileSync(rang.fin, 'utf8').trim())
      : r.erreur === null
        ? r.code
        : null;
    sortie = lire(rang.resultat).trim();
    appendFileSync(ctx.journal, `${sortie}\n`);
    spawnSync(process.execPath, [REGISTRE, '--copie', ctx.copie], {
      cwd: ctx.racine,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } else {
    seance = existsSync(rang.fin) ? Number(readFileSync(rang.fin, 'utf8').trim()) : null;
    sortie = lire(rang.resultat).trim();
    horsPlan = existsSync(rang.horsPlan) ? lire(rang.horsPlan).trim() : null;
  }
  return {
    code: r.code,
    seance,
    bloque: r.bloque,
    horsPlan,
    erreur: r.erreur ?? lire(erreurs),
    sortie,
    id,
  };
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
// Throws an Arret for a launch that stops before its session, a motionless session, or
// a session that ends twice without a sheet that conforms.
export async function seance(
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
    ...activite
  }
) {
  // A resumption at the step that carries a red (`fichiers`, the files the red names): the session
  // carries these files alone, the rest of the lot being green.
  const rapport = fichiers?.length
    ? `${rapportBrut ?? ''}\n\nCette séance ne porte que ${fichiers.join(', ')} : le reste du lot est vert et ne se touche pas.`.trim()
    : rapportBrut;
  const nom = nomDuRole(role);
  const reprise = tentative > 1 && !derniere && gardee?.agent === role ? gardee : null;
  const { tache, ouverts, constats, valider, repondre } = constatsDeLaSeance(
    ctx.contexte,
    gardes,
    role
  );
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
  const repondu = fiche => ({ fiche, constats: fiche ? repondre(gardes, fiche) : gardes });
  if (reprise) {
    const courte = {
      role: nom,
      ticket: ctx.ticket,
      sujet: ctx.sujet,
      paquets: plan,
      tentative,
      change:
        change ??
        (role === 'testwriter'
          ? 'la preuve du rouge, jouée après ta séance, refuse ton lot'
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
      evenement: 'neuve',
      ...suivie,
      precedent: dernierSigne,
    })
  );
}

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
export function constatsDeLaSeance(contexte, constats, role) {
  const siens = (constats ?? []).filter(c => c.role === role);
  const anciens = siens.filter(c => c.enContexte);
  const neufs = siens.filter(c => !c.enContexte);
  const titres = role === 'developpeur' ? neufs.map(c => c.titre) : [];
  const enContexte = `les constats ouverts au lancement de la passe du superviseur, donnés en contexte : ta tâche est celle du superviseur, ci-dessus ; chacun reste ouvert jusqu'à la relecture qui le juge levé, et ta fiche n'a pas à répondre à chacun`;
  const titre =
    'LES CONSTATS DU RELECTEUR QUI RESTENT OUVERTS pour ton rôle, ' +
    (anciens.length && !neufs.length ? enContexte : "chacun jusqu'à la relecture qui le juge levé");
  const texte =
    anciens.length && neufs.length
      ? `${texteDesOuverts(neufs)}\n\nPUIS ${enContexte} :\n\n${texteDesOuverts(anciens, neufs.length)}`
      : texteDesOuverts(siens);
  return {
    tache: contexte
      ? `TA TÂCHE, que le superviseur te donne ; elle passe avant le ticket, le rapport${anciens.length ? ' et les constats donnés en contexte' : ''} ci-dessous :\n\n${contexte}\n\n`
      : '',
    ouverts: titre,
    constats: texte,
    valider: f => reponsesAuxConstats(f, titres),
    repondre: (tous, fiche) =>
      role === 'developpeur' && siens.length ? avecLesReponses(tous, fiche) : tous,
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

// The findings <constats>, each finding of the developpeur that his sheet <fiche> answers (by its
// title, numbered or not: `cleDuConstat`) with its answer `{ etat, raison, piece }`, as a thread
// of a review keeps the author's reply under its comment.
function avecLesReponses(constats, fiche) {
  const parTitre = new Map((fiche.reponses ?? []).map(r => [cleDuConstat(r.titre), r]));
  return (constats ?? []).map(c => {
    const r = c.role === 'developpeur' ? parTitre.get(c.titre) : undefined;
    if (!r) {
      return c;
    }
    return {
      ...c,
      reponse: { etat: r.etat, ...(r.raison ? { raison: r.raison } : {}), piece: r.piece },
    };
  });
}

// The launch <r> of a session of <role>, or the Arret it is: a session its lock stopped on a
// write out of the plan (« hors-plan », the write as its piece), a motionless session
// (« bloqué »), a launch that stops before its session (« lancement »).
export function seanceLancee(ctx, role, r) {
  if (r.horsPlan) {
    throw new Arret(
      'hors-plan',
      `Le crochet de la séance du ${nomDuRole(role)} l'arrête sur une écriture hors du plan du ticket (ses paquets : ${ctx.paquets.join(', ')}) :\n\n${r.horsPlan}`,
      { piece: r.horsPlan }
    );
  }
  if (r.bloque) {
    const minutes = Math.round(ctx.immobileMs / 60_000);
    throw new Arret(
      'bloqué',
      `La transcription de la séance du ${role} n'a pas bougé en ${minutes ? `${minutes} min` : `${ctx.immobileMs} ms`} : la séance est arrêtée. Les dernières lignes du journal :\n\n${fin(lire(ctx.journal), 40)}`
    );
  }
  if (r.seance === null) {
    throw new Arret(
      'lancement',
      `Le lanceur s'arrête avant la séance du ${role} (code ${r.code}).\n${r.erreur.trim()}\n\n${fin(lire(ctx.journal), 20)}`
    );
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

// The session of <role> with the instruction <texte>, its sheet read in its result
// (scripts/resultats.mjs): the sheet, kept with the ticket's sheets, its discoveries filed. A
// session that ends without a sheet that conforms (none, one out of its schema, a code other than
// 0) is resumed once, the same session, with the short instruction that names what lacks (the
// third template). The session opens under the id <id>, which its caller gives (a caller that plays
// an attempt again gives the same, and the session resumes), or resumes it with <premiere>
// « reprend »; with <repli> (a resumption), a session that ends in error returns null, for a
// fresh session in its place. Throws an Arret for a launch that stops before its session, a
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
  for (let essai = premier; essai <= 2; essai++) {
    const courte = () => consigne({ ticket: ctx.ticket, sujet: ctx.sujet, erreur: lu.erreur }, 2);
    const r = await lancer(ctx, role, essai === 1 || !lu ? texte : courte(), {
      ...reste,
      precedent: derniere,
      evenement,
      relance: essai,
      signeDeVie,
      ...ouvrir(essai === 1 ? premiere : 'reprend'),
    });
    seanceLancee(ctx, role, r);
    courante = r.id ?? courante;
    if (repli && r.seance !== 0) {
      return null;
    }
    lu =
      r.seance === 0
        ? lireSaFiche(ctx, reste.fiche ?? role, r.sortie)
        : { erreur: `la séance finit en erreur (code ${r.seance})` };
    const faute = lu.fiche ? valider(lu.fiche, essai) : null;
    if (faute) {
      lu = { erreur: `fiche non conforme : ${faute}` };
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
  throw new Arret(
    'sans-fiche',
    `Deux fois, la séance du ${nomDuRole(role)} finit sans fiche conforme : ${lu.erreur}. Le journal du ticket : ${ctx.journal}`
  );
}

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
