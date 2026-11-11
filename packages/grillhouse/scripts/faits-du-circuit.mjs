#!/usr/bin/env node
// One act of the circuit of a ticket for its workflow under Temporal (src/temporal/circuit/), in a
// process of its own, as Buildkite's agent and GitLab's runner play each job in a child process:
// the circuit's code waits on its passes synchronously, so the worker that awaits this process
// keeps serving, and sends its heartbeats, while the act plays. The worker's activities
// (src/temporal/circuit/activites.ts) start it in the main tree of the repository:
//
//   node scripts/faits-du-circuit.mjs <acte>    (its input in JSON on the standard input)
//
// Each sign of life of a session goes out as a line `vie <json>`, and the act's outcome as the
// last line, `resultat <json>`. SIGTERM cancels the act: the session it leads ends, its group
// killed (scripts/seances.mjs). The act ends with its worker: once the worker is gone, it exits
// at once, the group of its session left running, which the attempt played again waits for.
//
// The acts of a ticket write nothing outside themselves (docs/ARCHITECTURE.md, « une activité, un
// effet, une clé »): each gathers the effects the circuit's code emits (scripts/effets.mjs) and
// gives them back with its outcome (`effets`), its own readings seeing those it already emitted;
// the workflow then plays each one in an activity of its own, the act `effet`, under the key of
// that activity (`cle`: its workflow, its run, its activity, the same for each of its attempts).
// A fact (the act `fait`) is read again on an attempt played again: a reading, a measure, a pass
// of the checks, a regeneration and the integration (no second commit for a lot already in the
// queue) replay without harm. Under the opening and a fact, a session draws its id from the key of
// its activity, its event and the attempt of the activity (`idDeSeance` of scripts/seances.mjs,
// `<séance>-e<essai>`), and ranges its result under it (`rangDeLaSeance`). Only an attempt Temporal plays again (its
// attempt 2 or more, `essai`), at the launch the dead attempt made last, takes the result of a
// session the dead attempt launched in its envelope once its group has ended, with no second
// session (scripts/seances.mjs `lancer`); a session out of the envelope (the explorateur's, the
// questionneur's, the reviewer's), which writes nothing in the lot, is launched again. The acts of
// the queue of a project follow the same model: each of their gestures replays without harm (main
// moved onto a lot already on main enters it, a ticket closed stays closed, a commit pushed is
// pushed again as it is), and their comments are effects they give back, which the workflow of
// the queue writes one per activity (`effet-de-la-file`).
//
// The acts, each on the context the circuit builds for a run (`contexte` of scripts/circuit.mjs)
// and the memory the workflow holds:
//
// - `ouvrir`, the opening of a run up to its plan (`ouvrirJusquAuPlan`), first or on the
//   supervisor's answer to a stop, the state of a circuit stopped on his word read from its file;
// - `plan`, one step of the plan (`unPasDuPlan`: the explorateur, the questionneur, the answer,
//   the conclusion playing with the last), which the workflow decides (`pasDuPlan`);
// - `preparer`, the start of a step (`commencerLEtape`) and the copy prepared on the tip of main
//   before its pass (`avantLaPasse`);
// - `fait`, the fact a decision asks for (`lireLeFait`), an Arret it raises given back as such;
// - `effets`, the effects of a decision (`appliquer`), then the end of its step (`finirLEtape`);
// - `arret`, a stop written (`publierLArret`), its question gone up (`monter`) unless it is a
//   « a-repasser » the workflow plays again, the end of its step, then the end of the run
//   (`aLaFin`);
// - `fin`, the end of a run integrated; `arreter`, the stop on the supervisor's word (`arreter`);
// - `effet`, one effect an act gave back, written under the key of its activity (`ecrireLEffet`):
//   an effect not written has its outcome, said on the error output or the failure of its
//   activity;
// - the acts of the queue of a project (scripts/integration/file.mjs, grillhouse-4nr.8): `situer`,
//   where the lot of a ticket stands (`situerLeLot`); `brancher`, the branch made the candidate its
//   CI judges and pushed (`preparerLaBranche`); `ci`, one reading of the CI of a commit
//   (`lireUneFoisLaCI`); `conclure`, the CI concluded at the ticket (`conclureLaCI`); `avancer`,
//   main moved onto the candidate (`avancerMain`); each of `brancher` and `avancer` telling the
//   ticket of a branch out of the queue or kept (`direLIssue`); `fermer`, the ticket closed and main
//   pushed (`fermerLEntree`); `effet-de-la-file`, one effect they gave back, under the key of its
//   activity. Their lines go to the error output.
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  aLaFin,
  appliquer,
  commencerLEtape,
  finirLEtape,
  arretDe,
  arreter,
  avantLaPasse,
  contexte,
  ecrireEtat,
  finirLOuverture,
  lireLeFait,
  MEMOIRE,
  monter,
  ouvrirJusquAuPlan,
  publierLArret,
  SANS_CONFLIT,
  SUR_LA_POINTE,
  suiteDuConflit,
  unPasDuPlan,
} from './circuit.mjs';
import {
  avancerMain,
  conclureLaCI,
  direLIssue,
  fermerLEntree,
  lireLesPassagesDeLaCI,
  lireUneFoisLaCI,
  outilsDeLaFile,
  preparerLaBranche,
  situerLeLot,
} from './integration/file.mjs';
import { avancementDeLaCI } from './avancement.mjs';
import { ecrireLEffet } from './effets.mjs';
import { Arret, geste } from './ticket-du-circuit.mjs';

// What the workflow keeps of the circuit's memory besides the decisions': the session a relaunch
// resumes, the rank of arrival, the sort of the ticket, what the opening reads of the project's
// package.json (its tools, its data, its generated files), which every pass of a later act plays
// with, each act in a process of its own, and the supervisor's context of the
// run (`contexte`), which each session of the run reads at the head of its instruction; a context
// the act is given (an answer's, a motive) is kept over it.
const GARDEE = [
  ...MEMOIRE,
  'seanceReprise',
  'rang',
  'sorte',
  'outils',
  'donnees',
  'engendres',
  'contexte',
];

// The bases of the passes of the contexts this act opened, which its end removes, its death
// before its `finally` included.
const bases = new Set();

const dire = (genre, valeur) => process.stdout.write(`${genre} ${JSON.stringify(valeur)}\n`);

// The context of a run of the circuit of <ticket> with the options <options>, its memory
// <memoire>: its ports say each sign of life on the standard output, and the effects it emits are
// gathered (`rendus`), which the act gives back.
// The supervisor's session of the act being played (`superviseur` of its input, the entry of the
// workflow), which `leContexte` gives each context: one act per process. An act after the opening
// passes the plan its workflow holds (`paquets`): its context reads only the
// subject of the title, since the integration removes the copy while the circuit still runs.
let superviseurDeLActe = null;

function leContexte(ticket, memoire = {}, options = {}) {
  const ctx = contexte({
    ticket,
    reprendre: false,
    contexte: null,
    depuis: null,
    etendre: null,
    arreter: false,
    ...options,
  });
  Object.assign(ctx, laMemoireReprise(memoire, options));
  bases.add(ctx.base);
  ctx.superviseur = superviseurDeLActe;
  ctx.rendus = [];
  ctx.constats = [...(ctx.constats ?? [])];
  ctx.ports = { signeDeVie: vie => dire('vie', vie) };
  return ctx;
}

// The tools of the queue on the main tree <racine> (the act plays there), its lines on the error
// output, the progress directory <avancement> of a reading of the CI, the effects it emits
// gathered (`rendus`), which the act gives back.
const laFile = (racine, avancement = null) => {
  const o = outilsDeLaFile(racine, l => process.stderr.write(`${l}\n`), avancement);
  o.rendus = [];
  return o;
};

/** The memory of <ctx> the workflow keeps from one act to the next. */
export const laMemoire = ctx => Object.fromEntries(GARDEE.map(k => [k, ctx[k] ?? null]));

/**
 * What a context takes back of the memory <memoire> the workflow kept, but what the act is given
 * (<options>: an answer's context, a motive).
 */
export const laMemoireReprise = (memoire, options = {}) =>
  Object.fromEntries(GARDEE.filter(k => k in memoire && !(k in options)).map(k => [k, memoire[k]]));

// The stop the state of <ctx> names once `monter` wrote it, at the state <etat>.
const arretDeLEtat = (ctx, code, etat) => ({
  code,
  nom: ctx.courant?.raison ?? null,
  question: ctx.courant?.question ?? null,
  etat: { ...etat, raison: ctx.courant?.raison ?? null },
});

// The options of a run on the supervisor's answer <reponse>.
const optionsDe = reponse => {
  if (!reponse) {
    return {};
  }
  const contexteDuSuperviseur = reponse.contexte ?? null;
  if (reponse.genre === 'reprendre') {
    return { reprendre: true, contexte: contexteDuSuperviseur };
  }
  if (reponse.genre === 'depuis') {
    return { depuis: reponse.role, contexte: contexteDuSuperviseur };
  }
  return { etendre: reponse.paquets, contexte: contexteDuSuperviseur };
};

// The act <f> on the context <ctx>: its outcome and the effects it emitted (`effets`), its bases
// closed.
async function rendre(ctx, f) {
  try {
    const valeur = await f();
    return { ...(valeur ?? {}), effets: ctx.rendus };
  } finally {
    ctx.base.fermer();
  }
}

// The acts, each on its input; each returns its outcome.
const ACTES = {
  async ouvrir({ ticket, memoire, reponse, arrete, cle, essai }) {
    const ctx = leContexte(ticket, memoire, optionsDe(reponse));
    // The key of its activity and its attempt name the sessions of the plan (`idDeSeance`).
    ctx.cle = cle ?? null;
    ctx.essaiDeLActe = essai ?? 1;
    return rendre(ctx, () => ouvrirSur(ctx, memoire, arrete));
  },
  // One step of the plan (`unPasDuPlan`): the state of the plan that follows, the opening once it
  // passes, or its stop gone up.
  async plan({ ticket, memoire, reponse, pas, plan, cle, essai }) {
    const ctx = leContexte(ticket, memoire, optionsDe(reponse));
    ctx.cle = cle ?? null;
    ctx.essaiDeLActe = essai ?? 1;
    ctx.contexte = plan.contexte ?? ctx.contexte ?? null;
    return rendre(ctx, async () => {
      const r = await unPasDuPlan(ctx, pas, plan.etat);
      if ('code' in r) {
        aLaFin(ctx, r.code);
        return { arret: arretDeLEtat(ctx, r.code, ctx.courant ?? {}) };
      }
      if (r.passe) {
        finirLOuverture(ctx, plan.debut);
        return { ouverture: lOuverture(ctx, plan.debut) };
      }
      return { plan: { ...plan, etat: r.plan, memoire: laMemoire(ctx) } };
    });
  },
  async preparer({ ticket, memoire, etape, paquets }) {
    const ctx = leContexte(ticket, memoire, { paquets });
    return rendre(ctx, () => {
      const { etat, menee } = commencerLEtape(ctx, etape);
      const pointe = avantLaPasse(ctx, etape.etape, ctx.regeneration ?? null);
      if (pointe.arret) {
        const { nom, rapport, piece, question } = pointe.arret;
        return { arret: { leve: { nom, rapport, piece, question } }, etat, menee };
      }
      if (pointe.conflit) {
        // The copy's advance left files in conflict, or a lot kept: the role that writes the first
        // of them is relaunched (the decision of the workflow), then the pass prepares again.
        geste(ctx, 'conflit-de-l-avance');
        const { role, memoire } = suiteDuConflit(ctx, etape, pointe.conflit);
        return {
          conflit: { role, fichiers: pointe.conflit.fichiers, rapport: pointe.conflit.rapport },
          memoire: { regeneration: pointe.regeneration ?? null, ...memoire },
          etat,
          menee,
        };
      }
      if (pointe.avancee) {
        appendFileSync(ctx.journal, 'la copie avance sur la pointe de main avant la passe.\n');
      }
      return {
        memoire: {
          regeneration: pointe.regeneration ?? null,
          ...(SUR_LA_POINTE.has(etape.etape) ? SANS_CONFLIT : {}),
        },
        etat,
        menee,
      };
    });
  },
  async fait(
    { ticket, memoire, fait, parametres, faits, sorte, paquets, precedent, cle, essai },
    annulation
  ) {
    const ctx = leContexte(ticket, memoire, { paquets });
    ctx.sorte = sorte;
    // A fact is read again on an attempt played again: the key of its activity names its sessions
    // (`idDeSeance`), and its attempt says whether Temporal plays it again (`lancer` of
    // scripts/seances.mjs).
    ctx.cle = cle ?? null;
    ctx.essaiDeLActe = essai ?? 1;
    return rendre(ctx, async () => {
      const avec = fait === 'seance' ? { ...parametres, precedent, annulation } : parametres;
      try {
        const valeur = await lireLeFait(ctx, fait, avec, faits);
        return { valeur: valeur ?? null, memoire: laMemoire(ctx) };
      } catch (e) {
        if (!(e instanceof Arret)) {
          throw e;
        }
        const { nom, rapport, rouges, motif, resultat, piece, question, qui, etape } = e;
        return {
          leve: { nom, rapport, rouges, motif, resultat, piece, question, qui, etape },
          memoire: laMemoire(ctx),
        };
      }
    });
  },
  async effets({ ticket, memoire, effets, menee, paquets }) {
    const ctx = leContexte(ticket, memoire, { paquets });
    return rendre(ctx, () => {
      for (const e of effets) {
        appliquer(ctx, e);
      }
      finirLEtape(ctx, menee ?? null);
      return null;
    });
  },
  async arret({ ticket, memoire, arret, etat, monter: aMonter, paquets, menee }) {
    const ctx = leContexte(ticket, memoire, { paquets });
    return rendre(ctx, () => {
      const a = publierLArret(ctx, erreurDe(ctx, arret), etat);
      finirLEtape(ctx, menee ?? null);
      if (a.nom === 'a-repasser' && !aMonter) {
        geste(ctx, 'a-repasser');
        aLaFin(ctx, a.code);
        return { code: a.code, nom: a.nom, question: null, etat: { ...a.etat, raison: a.nom } };
      }
      const code = monter(ctx, a);
      aLaFin(ctx, code);
      return arretDeLEtat(ctx, code, a.etat);
    });
  },
  async fin({ ticket, memoire, etat, paquets }) {
    const ctx = leContexte(ticket, memoire, { paquets });
    return rendre(ctx, () => {
      ecrireEtat(ctx, { ...etat, etape: 'integre', code: 0 });
      aLaFin(ctx, 0);
      return null;
    });
  },
  async arreter({ ticket, memoire, etat, contexte: motif }) {
    const ctx = leContexte(ticket, memoire, { arreter: true, contexte: motif ?? null });
    return rendre(ctx, async () => {
      await arreter(ctx, { ...etat, ...laMemoire(ctx) });
      return null;
    });
  },
  // One effect an act gave back, under the key of its activity, with the outcome of the
  // circuit when it is not written (`ecrireLEffet`): said at the last attempt of its activity
  // (`derniere`), tried again by Temporal before it, or the act fails.
  async effet({ ticket, effet, cle, derniere }) {
    const ctx = contexte({
      ticket,
      reprendre: false,
      contexte: null,
      depuis: null,
      etendre: null,
      arreter: true,
    });
    bases.add(ctx.base);
    try {
      ecrireLEffet(ctx, effet, cle ?? null, { reessayer: derniere === false });
      return null;
    } finally {
      ctx.base.fermer();
    }
  },
};

// The opening of a run of <ctx> on the stopped state <arrete>, which the workflow holds (null at
// the first launch, and for a circuit the server no longer holds, reopened by --depuis), up to its
// plan: the plan still to write goes to the workflow (`plan`), which plays each of its steps (the
// act `plan`).
async function ouvrirSur(ctx, memoire, arrete) {
  const lu = arrete ?? null;
  if (lu) {
    // What the stopped run kept and the new workflow of the answer does not hold yet.
    for (const k of GARDEE) {
      if (!(k in memoire) && lu[k] !== undefined) {
        ctx[k] = lu[k];
      }
    }
  }
  const e = lu ? { ...lu, rang: memoire.rang ?? lu.rang ?? null } : null;
  const o = await ouvrirJusquAuPlan(ctx, e);
  if ('code' in o) {
    aLaFin(ctx, o.code);
    return { arret: arretDeLEtat(ctx, o.code, ctx.courant ?? {}) };
  }
  if (o.plan) {
    return {
      plan: {
        etat: o.plan,
        debut: o.debut,
        contexte: ctx.contexte ?? null,
        memoire: laMemoire(ctx),
      },
    };
  }
  finirLOuverture(ctx, o.debut);
  return { ouverture: lOuverture(ctx, o.debut) };
}

// The opening of the run of <ctx> at the step <debut>, as the workflow keeps it.
const lOuverture = (ctx, debut) => ({
  debut,
  memoire: laMemoire(ctx),
  ticket: {
    id: ctx.ticket,
    paquets: ctx.paquets,
    sorte: ctx.sorte ?? null,
    copie: ctx.copie,
  },
});

// The exception of the stop <arret> the workflow hands the act `arret` (an Arret raised, an
// exception of an activity, a stop a decision returned).
function erreurDe(ctx, arret) {
  if (arret.leve) {
    const { nom, rapport, ...options } = arret.leve;
    return new Arret(nom, rapport, options);
  }
  if (arret.inattendu) {
    const erreur = new Error(arret.inattendu.message);
    erreur.stack = arret.inattendu.pile ?? erreur.stack;
    return erreur;
  }
  return arretDe(ctx, arret);
}

// The acts of the queue, each on its input: those that write give back their effects (`effets`).
Object.assign(ACTES, {
  async situer({ racine, ticket }) {
    return situerLeLot(laFile(racine), ticket);
  },
  async brancher({ racine, ticket, branche }) {
    const o = laFile(racine);
    const entree = { ticket, branche };
    const r = preparerLaBranche(o, entree);
    return { ...(r.entre || r.candidat ? r : { issue: direLIssue(o, entree, r) }), effets: o.rendus };
  },
  async avancer({ racine, ticket, branche, commit }) {
    const o = laFile(racine);
    const r = avancerMain(o, { ticket, branche, commit });
    return {
      ...(r.entre || r.bouge ? r : { issue: direLIssue(o, { ticket, branche }, r) }),
      effets: o.rendus,
    };
  },
  async fermer({ racine, ticket, branche, commit }) {
    const o = laFile(racine);
    return { ...fermerLEntree(o, { ticket, branche, commit }), effets: o.rendus };
  },
  // A reading of the CI writes the steps of its run done over planned in the working directory of
  // the ticket, where the board reads them (scripts/avancement.mjs `avancementDeLaCI`); one that
  // looks for its run (no run found yet) empties the records of another.
  async ci({ racine, ticket, sha, branche, passage }) {
    const travail = path.join(racine, '.claude', 'worktrees', `${ticket}.travail`);
    const avancement = avancementDeLaCI(travail, { nouvelle: passage === null });
    return lireUneFoisLaCI(laFile(racine, avancement), { sha, branche, passage });
  },
  // A reading of the CI of every expected workflow of the commit (`lireLesPassagesDeLaCI`), its
  // steps written to the progress directory of the ticket.
  async passages({ racine, ticket, sha, branche }) {
    const travail = path.join(racine, '.claude', 'worktrees', `${ticket}.travail`);
    const avancement = avancementDeLaCI(travail);
    return lireLesPassagesDeLaCI(laFile(racine, avancement), { sha, branche });
  },
  async conclure({ racine, ...e }) {
    const o = laFile(racine);
    return { ...conclureLaCI(o, e), effets: o.rendus };
  },
  // One effect an act of the queue gave back, under the key of its activity, with the outcome of
  // the queue when it is not written (`ecrireLEffet`).
  async 'effet-de-la-file'({ racine, effet, cle, derniere }) {
    ecrireLEffet(
      outilsDeLaFile(racine, l => process.stderr.write(`${l}\n`)),
      effet,
      cle,
      {
        reessayer: derniere === false,
      }
    );
    return null;
  },
});

/**
 * The error <e> of an act as it goes to its activity (src/temporal/acte.ts): its message, its
 * stack, and whether Temporal tries it again (`reessayable`, an effect not written before its last
 * attempt, `EffetNonEcrit` of scripts/effets.mjs).
 */
export const erreurDeLActe = e => ({
  message: String(e?.message ?? e),
  pile: String(e?.stack ?? e),
  reessayable: e?.reessayable === true,
});

/** Plays the act <acte> on <entree>; <annulation> cancels it. */
export async function jouerLActe(acte, entree, annulation) {
  const f = ACTES[acte];
  if (!f) {
    throw new Error(`acte inconnu du circuit : ${acte}`);
  }
  superviseurDeLActe = entree?.superviseur ?? null;
  return f(entree, annulation);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // The act ends with its worker, its bases removed, the group of its session left running: the
  // worker gone (its process another's parent), or its output closed.
  const finir = () => {
    for (const b of bases) {
      b.fermer();
    }
    // The worker gone, its output is closed: nothing to drain, and the act ends at once, the group
    // of its session left running for the attempt played again (not `exitCode`, which would wait
    // for that session).
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  };
  process.stdout.on('error', finir);
  const annulation = new AbortController();
  process.on('SIGTERM', () => annulation.abort());
  const travailleur = process.ppid;
  setInterval(() => {
    if (process.ppid !== travailleur) {
      finir();
    }
  }, 1000).unref();
  try {
    const entree = JSON.parse(readFileSync(0, 'utf8'));
    dire('resultat', await jouerLActe(process.argv[2], entree, annulation.signal));
  } catch (e) {
    dire('erreur', erreurDeLActe(e));
    process.exitCode = 1;
  }
}
