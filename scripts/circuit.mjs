#!/usr/bin/env node
// The circuit of one ticket: for each component its title names, in order, the provider first, the
// testeur, the proof of the red, the developpeur and the checks; then the state « relecture »,
// where the chef de chantier launches the reviewer. The chef runs it in the background and wakes
// at its end; he reads the state, and after a stop he settles (or refers upward) and resumes.
//
//   node scripts/circuit.mjs <ticket> [--reprendre] [--contexte <texte>]
//   node scripts/circuit.mjs <ticket> --depuis <testeur|developpeur> <composant> --contexte <texte>
//
// - The components are read in the ticket's title (`bd show <ticket> --json`), after its last
//   « — », separated by commas: each one a path (`packages/<nom>`, or `.`), or the name of a
//   package, which becomes its directory (scripts/paquets.mjs), read in the ticket's copy when it
//   exists, else in the main tree. A component that names neither stops the call, exit 2, named.
// - Each session is a launch of scripts/enveloppe/lancer.sh, a child process the circuit waits
//   for, in its own process group, its errors written to a file: a session outlives the death of
//   its circuit (its caller dead, the circuit with it), and the state names its group while it
//   runs. The instruction is written from the first template of
//   .claude/skills/pitmaster/references/consigne-agent.md, each `{{champ}}` filled: the ticket and
//   its subject, the component, the ticket's description (its criteria), the report of the step
//   before (the proof, the output of a red check), the last handover at the ticket, and the line
//   `CONTEXTE :` that `--contexte` gives. The session's own exit code is the one lancer.sh writes
//   to `.claude/worktrees/<ticket>.fin`; a launch that leaves none stopped before its session.
// - A session whose transcripts (`~/.claude/projects/<copy in dashes>/`, as scripts/registre.mjs
//   reads them) and log (its preparation writes there before the session opens) stand still for
//   20 minutes (IMMOBILE_MS; GRILLHOUSE_CIRCUIT_IMMOBILE_MS replaces
//   it, in milliseconds) is stopped: SIGTERM, then SIGKILL, to the launcher's group.
// - After each session, a new comment of the agent is at the ticket: one that is not the circuit's
//   own (« Circuit · … »). Without it, the session is launched once more, then the circuit stops.
// - The proof of the red plays the whole component, as the CI of bors plays the whole suite of
//   the components a change touches: main is green, so a test HEAD holds that turns red in the
//   copy is a regression of the lot. One run per package, `npm test -- <package> <files>
//   --reporter=default --reporter=json --outputFile=<f>` in the copy: each package of the
//   component that has a script `test:vitest`, played whole, and the test files the testeur's lot
//   adds or changes in the component (git status of the copy, the testeur's files as the
//   integration shares them, `isTesterFile`). A test of a file out of the lot that fails is a red,
//   written `rouge existant : <file> › <name> — <message>`, and so is a file out of the lot that
//   does not load while no build of the component fails (it loaded at HEAD); its greens do not
//   count. A file of the lot that does not load proves nothing; a failed build of a
//   package of the component (Turborepo's line « Failed: » naming `<package>#build`) is a red, as
//   not compiling is failing, and the files it keeps from loading play at the checks, after the
//   developpeur; a failed build of a package out of the component leaves them broken. A green
//   test passes only when a comment of an agent at the ticket carries the line `vert attendu :
//   <name of the test> — <reason>`. A green test HEAD already holds has nothing to prove: the
//   version of HEAD of each file plays in the same run, from a sibling file
//   (`<nom>.circuit-avant.test.<ext>`, removed after it), and a green test whose full name HEAD's
//   version holds, green there too, is set aside, counted; a body changed under the same name is
//   not told apart. The proof passes with a red (of the lot, existing or of a build), even
//   without a file of the lot in the component: a testeur with no new test to write says so in
//   his handover, the existing reds are enough. It fails with neither a file of the lot nor a red,
//   with a broken file of the lot, or with a green of the lot without its « vert attendu ». A
//   failed proof relaunches the testeur with its report, twice at most. The report (reds,
//   justified greens) is written at the ticket. A proof with a red launches the developpeur; one
//   without a red skips him: the lot is a lot of tests alone.
// - A developpeur is launched on a red alone, of a proof or of a check: a session that changes
//   no file of its component (`git status --porcelain` of its directory and the content of each
//   file it lists, taken before and after the session; the handover's text does not count) stops
//   the circuit at « sans-livraison », its report naming the component and sending to the
//   developpeur's handover.
// - The checks after the developpeur of a component judge what is done, the components of the run
//   up to it: `npm test -- <test files of the lot>` that lie in those components (and those of the
//   shared test material whose package depends on none of the components after it), `npm test --
//   <package>` for each package of those components, touched by the lot or not (a package without
//   a script `test:vitest` plays only when the lot touches it), then the guards in the
//   envelope of the component (`GRILLHOUSE_ENVELOPPE=<composant> npm run grillhouse:gardes`, and
//   `npm run gardes` when the project has it): a red guard that names only files of the
//   components after it waits for the final pass.
// - After the last component of the run, the final pass: `npm run verifier`, what the
//   integration plays, as bors plays on a lot the very check of the merge. Turborepo's cache
//   holds its cost: a task nothing moved replays from it, and what the lot reaches plays again,
//   by the dependencies, the inputs of the tasks and `grillhouse.lit` (a reader out of the title
//   whose tests read a directory the lot changes included). A red goes to the developpeur of the
//   component that owns it: a package of a failed task (Turborepo's line « Failed: »), else,
//   when no failed task is a package's (the guards, tasks of the root), the first component a
//   path of the failed tasks' lines names (notices ⚠️ and ℹ️ aside), the provider first; its
//   report holds the lines of the failed tasks. A red in a package no component of the title
//   holds, or that no component owns, stops at « controles », the package named: the chef de
//   chantier decides, who adds the component to the title then resumes, or has the lot
//   corrected. From then on every check is the final pass.
// - A check at 75 (« à repasser ») out of the final pass plays once more; verifier plays its
//   tasks at 75 again itself, at rest, and its 75 is the final pass's. A red relaunches the
//   developpeur with the output, twice at most, the third session on the strong model
//   (`lancer.sh --modele opus --effort high`): three sessions for a component's checks, and three
//   for the whole final pass whatever the components its reds go to (the last component's
//   sessions counted in it), so that two components sending a red to each other stop at
//   « controles ».
// - The state is `.claude/worktrees/<ticket>.circuit.json`, written again at each step and at the
//   start and end of each session: `{ etape, composant, tentative, code, raison, rapport, dernier,
//   finale, seance, journal }`; `etape` is testeur, preuve, developpeur, controles or relecture;
//   `raison` names the stop; `dernier` is the last component of the run; `finale` whether the
//   final pass has begun; `seance` the process group of the session that runs, null between two.
//   `--reprendre` starts again at the step and component of the state, its report given to the
//   next session, and goes on to its `dernier`; after any stop, the death of the circuit with its
//   caller included. A session the state names that still runs is waited for first, and stopped
//   when it stands still as long as a motionless session.
// - A lot the reviewer sends back passes again: `--depuis <testeur|developpeur> <composant>`
//   starts at that step for that component (a path or a package name the title names), the text of
//   `--contexte` (the findings of the verdict) as the report of its first session, plays the rest
//   of that component's steps (developpeur → controles, or testeur → preuve → developpeur →
//   controles, the checks a final pass), then stops at « relecture ». It goes with no
//   `--reprendre`.
// - At each step, a short comment at the ticket: `Circuit · <composant> · <étape> : <résumé>`.
// - The commands of the circuit (the proof, the checks) are added to the log of the ticket,
//   `.claude/worktrees/<ticket>.log`, next to the sessions, each under its header line.
// - Exit codes: 0 at « relecture »; 2 a malformed call; a stop, by its name (ARRETS):
//   10 lancement (lancer.sh stopped before the session), 11 bloqué (a motionless transcript),
//   12 sans-passation (twice no handover), 13 preuve (the third proof fails), 14 controles (the
//   third developpeur of a component's checks or of the final pass leaves a red check, or a red
//   of the final pass no component of the title owns),
//   15 sans-livraison (a developpeur session that changes no file of its component),
//   75 a-repasser (a check still at 75 once played again).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  appendFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matieres, NOM_DE_TEST } from './consommateurs.mjs';
import { VARIABLE as VARIABLE_ENVELOPPE } from './enveloppe/composant.mjs';
import { paquets } from './paquets.mjs';
import { transcriptionsDeLaCopie } from './registre.mjs';
import { isTesterFile } from './verrous/verrou.mjs';
import { A_REPASSER } from './vitest-config/pression.mjs';

// The time a session's transcripts may stand still before the circuit stops it.
export const IMMOBILE_MS = 20 * 60 * 1000;
// The exit code of each stop.
export const ARRETS = {
  lancement: 10,
  bloqué: 11,
  'sans-passation': 12,
  preuve: 13,
  controles: 14,
  'sans-livraison': 15,
  'a-repasser': A_REPASSER,
};
const CODE_USAGE = 2;
// The testeur is relaunched twice at most after a failed proof; the developpeur has three sessions,
// the last on the strong model.
const RELANCES_TESTEUR = 2;
const SEANCES_DEVELOPPEUR = 3;
const FORT = ['--modele', 'opus', '--effort', 'high'];
const PREFIXE = 'Circuit · ';

const ici = import.meta.dirname;
const LANCEUR = path.join(ici, 'enveloppe', 'lancer.sh');
const GABARIT = path.join(
  ici,
  '..',
  '.claude',
  'skills',
  'pitmaster',
  'references',
  'consigne-agent.md'
);

// A stop of the circuit: its name (a key of ARRETS) and its report.
class Arret extends Error {
  constructor(nom, rapport) {
    super(nom);
    this.nom = nom;
    this.rapport = rapport;
  }
}

// A malformed call: its message.
class Usage extends Error {}

const sansCouleurs = t => t.replace(/\x1b\[[0-9;]*m/g, '');
const premiereLigne = t =>
  sansCouleurs(String(t ?? ''))
    .trim()
    .split('\n')[0]
    .slice(0, 300);
const fin = (t, n) => sansCouleurs(t).split('\n').slice(-n).join('\n');

// The options of the command line, or a Usage.
function lireArguments(argv) {
  const o = { ticket: null, reprendre: false, contexte: null, depuis: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reprendre') o.reprendre = true;
    else if (a === '--depuis') {
      const [etape, composant] = argv.slice(i + 1, i + 3);
      if (!['testeur', 'developpeur'].includes(etape))
        throw new Usage('--depuis attend testeur ou developpeur, puis un composant.');
      if (!composant || composant.startsWith('-'))
        throw new Usage('--depuis attend son composant.');
      o.depuis = { etape, composant };
      i += 2;
    } else if (a === '--contexte') {
      if (i + 1 >= argv.length) throw new Usage('--contexte attend son texte.');
      o.contexte = argv[++i];
    } else if (a.startsWith('-')) throw new Usage(`option inconnue : ${a}`);
    else if (o.ticket) throw new Usage(`un seul ticket : ${o.ticket}, puis ${a}.`);
    else o.ticket = a;
  }
  if (!o.ticket) throw new Usage('le ticket manque.');
  if (o.depuis && o.reprendre) throw new Usage('--depuis et --reprendre ne vont pas ensemble.');
  return o;
}

// The main tree, from git's common directory: run from a copy, the circuit still finds the others.
function arbrePrincipal() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Usage("le dossier courant n'est pas dans un dépôt git.");
  return path.dirname(r.stdout.trim());
}

// The context of one run: the paths of the ticket, its components, how the circuit speaks to bd.
function contexte(o) {
  const racine = arbrePrincipal();
  const copie = path.join(racine, '.claude', 'worktrees', o.ticket);
  const bd = (...a) => spawnSync('bd', a, { cwd: racine, encoding: 'utf8' });
  const show = bd('show', o.ticket, '--json');
  if (show.status !== 0) throw new Usage(`ticket ${o.ticket} illisible : ${show.stderr}`);
  const t = JSON.parse(show.stdout)[0];
  const parts = String(t?.title ?? '').split(' — ');
  if (parts.length < 2) throw new Usage(`le titre de ${o.ticket} ne nomme pas ses composants.`);
  const base = existsSync(copie) ? copie : racine;
  const liste = paquets(base);
  const resoudre = nom => {
    if (nom === '.') return '.';
    const norme = path.normalize(nom).replace(/\/$/, '');
    if (liste.some(p => p.dossier === norme)) return norme;
    const parNom = liste.find(p => p.pkg.name === nom);
    if (parNom) return parNom.dossier;
    if (!norme.startsWith('..') && existsSync(path.join(base, norme))) return norme;
    throw new Usage(
      `le composant « ${nom} » du titre ne nomme ni un paquet ni un chemin du dépôt.`
    );
  };
  const composants = parts
    .at(-1)
    .split(',')
    .map(c => c.trim())
    .filter(Boolean)
    .map(resoudre);
  if (o.depuis) {
    const c = composants.includes(o.depuis.composant)
      ? o.depuis.composant
      : composants.find(x => {
          try {
            return resoudre(o.depuis.composant) === x;
          } catch {
            return false;
          }
        });
    if (!c) throw new Usage(`--depuis : ${o.depuis.composant} n'est pas un composant du titre.`);
    o.depuis.composant = c;
  }
  return {
    ...o,
    racine,
    copie,
    bd,
    sujet: parts.length > 2 ? parts.slice(1, -1).join(' — ') : parts[0],
    description: String(t.description ?? ''),
    composants,
    etat: `${copie}.circuit.json`,
    journal: `${copie}.log`,
    fin: `${copie}.fin`,
    transcriptions: transcriptionsDeLaCopie(copie, os.homedir()),
    immobileMs: Number(process.env.GRILLHOUSE_CIRCUIT_IMMOBILE_MS) || IMMOBILE_MS,
    tmp: mkdtempSync(path.join(os.tmpdir(), 'circuit-')),
    numero: 0,
  };
}

// The comments of the agents at the ticket: every comment but the circuit's own.
function passations(ctx) {
  const r = ctx.bd('comments', ctx.ticket, '--json');
  if (r.status !== 0) return [];
  return (JSON.parse(r.stdout || '[]') ?? [])
    .map(c => String(c.text ?? ''))
    .filter(t => !t.startsWith(PREFIXE));
}

// One line of the circuit's history at the ticket.
function commenter(ctx, composant, etape, texte) {
  const r = ctx.bd('comments', 'add', ctx.ticket, `${PREFIXE}${composant} · ${etape} : ${texte}`);
  if (r.status !== 0) process.stderr.write(`⚠️  commentaire non écrit au ticket : ${r.stderr}\n`);
}

// The state of the run, written whole (`seance` null and `finale` false unless <etat> sets them),
// kept as the run's current state.
function ecrireEtat(ctx, etat) {
  ctx.courant = { finale: false, seance: null, ...etat };
  const provisoire = `${ctx.etat}.${process.pid}`;
  writeFileSync(
    provisoire,
    `${JSON.stringify({ ...ctx.courant, journal: ctx.journal }, null, 2)}\n`
  );
  renameSync(provisoire, ctx.etat);
}

const entete = (ctx, etape, composant) =>
  appendFileSync(
    ctx.journal,
    `=== ${new Date().toISOString()} · circuit · ${etape} · ${composant} ===\n`
  );

// The latest moment a transcript of the copy moved, or 0.
function derniereTrace(dossier) {
  if (!existsSync(dossier)) return 0;
  let m = 0;
  for (const f of readdirSync(dossier, { recursive: true })) {
    if (!String(f).endsWith('.jsonl')) continue;
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

// One launch of a session: `{ code, seance, bloque, erreur }`, `seance` the session's exit code
// from lancer.sh's end file, null when the launch stopped before it.
function lancer(ctx, role, composant, consigne, fort) {
  rmSync(ctx.fin, { force: true });
  const fichier = path.join(ctx.tmp, `consigne-${++ctx.numero}.md`);
  writeFileSync(fichier, consigne);
  const args = [LANCEUR, ...(fort ? FORT : []), ctx.ticket, role, composant, fichier];
  // A file, not a pipe: a session whose circuit is dead writes its errors without breaking.
  const erreurs = path.join(ctx.tmp, `erreurs-${ctx.numero}.txt`);
  const fd = openSync(erreurs, 'w');
  return new Promise(resolve => {
    const enfant = spawn('bash', args, {
      cwd: ctx.racine,
      detached: true,
      stdio: ['ignore', 'ignore', fd],
    });
    closeSync(fd);
    ecrireEtat(ctx, { ...ctx.courant, seance: enfant.pid });
    let bloque = false;
    const veille = surveiller(ctx, enfant.pid, () => (bloque = true));
    enfant.on('close', code => {
      clearInterval(veille);
      // What remains of the group goes with its launcher.
      if (bloque) signalerGroupe(enfant.pid, 'SIGKILL');
      ecrireEtat(ctx, { ...ctx.courant, seance: null });
      const seance = existsSync(ctx.fin) ? Number(readFileSync(ctx.fin, 'utf8').trim()) : null;
      resolve({ code, seance, bloque, erreur: lire(erreurs) });
    });
  });
}

// <signal> to the process group <groupe>; false when the group is gone (or not the circuit's).
function signalerGroupe(groupe, signal) {
  try {
    process.kill(-groupe, signal);
    return true;
  } catch {
    return false;
  }
}

// The watch of the session whose launcher leads the group <groupe>: its transcripts and the log
// standing still for the delay, SIGTERM, then SIGKILL, to the group, and <bloque> called. Its
// interval, which the caller clears.
function surveiller(ctx, groupe, bloque) {
  let bouge = Date.now();
  let arrete = false;
  const pas = Math.max(100, Math.min(30_000, Math.floor(ctx.immobileMs / 4)));
  return setInterval(() => {
    bouge = Math.max(bouge, derniereTrace(ctx.transcriptions), mtime(ctx.journal));
    if (!arrete && Date.now() - bouge >= ctx.immobileMs) {
      arrete = true;
      bloque();
      signalerGroupe(groupe, 'SIGTERM');
      setTimeout(() => signalerGroupe(groupe, 'SIGKILL'), 5_000).unref();
    }
  }, pas);
}

// The wait for the session of group <groupe> that a dead circuit left running, under the same
// watch as a session: a resumption starts once it has ended, so that two sessions never write
// together in the copy.
async function attendreLaSeance(ctx, groupe) {
  if (!groupe || !signalerGroupe(groupe, 0)) return;
  process.stderr.write(
    `… la séance du groupe ${groupe}, laissée par l'arrêt d'avant, tourne encore : le circuit attend sa fin.\n`
  );
  const veille = surveiller(ctx, groupe, () => {});
  while (signalerGroupe(groupe, 0)) await new Promise(r => setTimeout(r, 500));
  clearInterval(veille);
}

// The first template of the instruction, filled with <valeurs>.
function consigne(valeurs) {
  const texte = readFileSync(GABARIT, 'utf8');
  const bloc = /```text\n([\s\S]*?)\n```/.exec(texte);
  if (!bloc) throw new Error(`gabarit sans bloc de consigne : ${GABARIT}`);
  return `${bloc[1].replace(/\{\{(\w+)\}\}/g, (m, k) => (k in valeurs ? valeurs[k] : m))}\n`;
}

// One session of <role> on <composant>, launched again once when it leaves no handover. Throws an
// Arret for a launch that stops before its session, a motionless session, or twice no handover.
async function seance(ctx, role, composant, { tentative, rapport, fort }) {
  const avant = passations(ctx);
  const lots = role === 'developpeur' ? testsDuLot(ctx) : testsDuComposant(ctx, composant);
  const valeurs = {
    role: role === 'developpeur' ? 'développeur' : role,
    depot: ctx.racine,
    ticket: ctx.ticket,
    sujet: ctx.sujet,
    composant,
    reprise:
      tentative > 1 || ctx.reprendre || ctx.depuis
        ? "oui : une séance d'avant a travaillé ce composant ; ta copie garde son travail, le rapport ci-dessous dit ce qui reste"
        : 'non',
    lots: lots.length
      ? `${role === 'developpeur' ? 'le lot de tests' : 'tes tests'}, déjà dans la copie : ${lots.join(', ')}`
      : 'aucun',
    contexte: (!ctx.depuis && ctx.contexte) || 'aucun',
    description: ctx.description.trim() || 'aucune',
    rapport: rapport ?? 'aucun',
    passation: avant.at(-1) ?? 'aucune',
  };
  let texte = consigne(valeurs);
  for (let essai = 1; essai <= 2; essai++) {
    const r = await lancer(ctx, role, composant, texte, fort);
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
    if (passations(ctx).length > avant.length) return;
    if (essai === 1) {
      commenter(ctx, composant, role, 'séance finie sans passation au ticket ; relancée une fois.');
      texte = `${texte}\nRELANCE : ta séance d'avant a fini sans passation au ticket. Ta passation s'écrit par \`bd comments add ${ctx.ticket}\` avant la fin de ta séance.\n`;
    }
  }
  throw new Arret(
    'sans-passation',
    `Deux séances du ${role} ont fini sans passation au ticket.\n\n${fin(lire(ctx.journal), 20)}`
  );
}

const lire = f => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// The files the copy changes against its HEAD: [{ fichier, supprime }], relative to the copy.
function changements(ctx) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '-z', '--untracked-files=all'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) return [];
  const entrees = r.stdout.split('\0');
  const out = [];
  for (let i = 0; i < entrees.length; i++) {
    const e = entrees[i];
    if (e.length < 4) continue;
    const xy = e.slice(0, 2);
    out.push({ fichier: e.slice(3), supprime: xy.includes('D') });
    // A rename or a copy names its source next.
    if (/[RC]/.test(xy)) i++;
  }
  return out;
}

// The test files of the lot that the testeur writes, present in the copy.
function testsDuLot(ctx) {
  return changements(ctx)
    .filter(c => !c.supprime)
    .map(c => c.fichier)
    .filter(f => NOM_DE_TEST.test(path.basename(f)) && isTesterFile(f, ctx.copie))
    .sort();
}

// The test files of the lot written in <composant> or in the shared test material: the testeur's
// lot of this component.
function testsDuComposant(ctx, composant) {
  const dossiers = [
    path.join(ctx.copie, composant),
    ...(existsSync(ctx.copie) ? matieres(ctx.copie).map(m => m.dir) : []),
  ];
  return testsDuLot(ctx).filter(f => {
    const abs = path.join(ctx.copie, f);
    return dossiers.some(d => {
      const rel = path.relative(d, abs);
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
  });
}

// The package directory of the copy that holds <fichier>, or « . ».
function paquetDe(liste, fichier) {
  const p = liste.find(({ dossier }) => `${fichier}`.startsWith(`${dossier}${path.sep}`));
  return p ? p.dossier : '.';
}

// One npm command in the copy, under <env> added to the circuit's environment, added to the log:
// `{ code, sortie }`.
function npm(ctx, etape, composant, args, env = {}) {
  entete(ctx, etape, composant);
  const prefixe = Object.entries(env).map(([k, v]) => `${k}=${v} `);
  appendFileSync(ctx.journal, `$ ${prefixe.join('')}npm ${args.join(' ')}\n`);
  const r = spawnSync('npm', args, {
    cwd: ctx.copie,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 256 * 1024 * 1024,
  });
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  appendFileSync(ctx.journal, sortie);
  return { code: r.status ?? 1, sortie };
}

// The justification of the green test <noms> (its title and its full name) in the comments of
// the agents: the reason of its line `vert attendu : <nom> — <raison>`, or null.
function justification(lignes, noms) {
  for (const l of lignes) {
    const m = /^\s*(?:[-*]\s*)?vert attendu\s*:\s*(.*)$/i.exec(l);
    if (!m) continue;
    for (const nom of noms) {
      if (nom && m[1].startsWith(`${nom} —`)) return m[1].slice(nom.length).replace(/^\s*—\s*/, '');
    }
  }
  return null;
}

// HEAD's version of each file of <fichiers> that HEAD holds, written beside it in the copy under
// the name `<nom>.circuit-avant.<test|spec>.<ext>`, which the same run plays: Map file → sibling,
// both relative to the copy. The caller removes the siblings.
function versionsDAvant(ctx, fichiers) {
  const out = new Map();
  for (const f of fichiers) {
    const r = spawnSync('git', ['-C', ctx.copie, 'show', `HEAD:${f}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) continue;
    const soeur = f.replace(/\.(test|spec)(\.[cm]?[jt]sx?)$/, '.circuit-avant.$1$2');
    if (soeur === f) continue;
    writeFileSync(path.join(ctx.copie, soeur), r.stdout);
    out.set(f, soeur);
  }
  return out;
}

// The proof of the red on <composant>: `{ ok, rouges, texte, resume }`.
function preuve(ctx, composant) {
  const fichiers = testsDuComposant(ctx, composant);
  const lignes = passations(ctx).flatMap(t => t.split('\n'));
  const rouges = [];
  const justifies = [];
  const injustifies = [];
  const casses = [];
  const liste = paquets(ctx.copie).filter(p => !p.hors);
  const index = ctx.composants.indexOf(composant);
  // Each package of the component plays whole, beside the files of the lot.
  const entiers = paquetsDesComposants(ctx, liste, i => i === index);
  const groupes = new Map(entiers.map(d => [d, []]));
  for (const f of fichiers) {
    const p = paquetDe(liste, f);
    groupes.set(p, [...(groupes.get(p) ?? []), f]);
  }
  let anciens = 0;
  const reportes = [];
  for (const [dossier, groupe] of groupes) {
    const entier = entiers.includes(dossier);
    const rapport = path.join(ctx.tmp, `preuve-${++ctx.numero}.json`);
    const avant = versionsDAvant(ctx, groupe);
    let r;
    try {
      r = npm(ctx, 'preuve', composant, [
        'test',
        '--',
        ...(entier ? [dossier] : []),
        ...groupe,
        ...avant.values(),
        '--reporter=default',
        '--reporter=json',
        `--outputFile=${rapport}`,
      ]);
    } finally {
      for (const soeur of avant.values()) rmSync(path.join(ctx.copie, soeur), { force: true });
    }
    let resultats = [];
    try {
      resultats = JSON.parse(readFileSync(rapport, 'utf8')).testResults ?? [];
    } catch {
      // No report: no file of the group played.
    }
    // The builds of the component's packages that failed: each one a red, not compiling is failing.
    const constructions = constructionsEchouees(ctx, liste, r.sortie, index);
    for (const { nom, erreur } of constructions) {
      if (reportes.includes(nom)) continue;
      rouges.push(`construction de ${nom} — ${erreur}`);
      reportes.push(nom);
    }
    // The files out of the lot, which HEAD holds green: a red of theirs is a regression of the lot.
    if (entier) {
      const duLot = new Set(groupe.map(f => path.join(ctx.copie, f)));
      for (const res of resultats) {
        if (duLot.has(res.name) || /\.circuit-avant\.(test|spec)\./.test(res.name)) continue;
        const f = path.relative(ctx.copie, res.name);
        const assertions = res.assertionResults ?? [];
        if (assertions.length === 0 && res.status === 'failed' && !constructions.length) {
          rouges.push(
            `rouge existant : ${f} — ne se charge pas : ${premiereLigne(res.message || res.status)}`
          );
        }
        for (const a of assertions.filter(x => x.status === 'failed')) {
          rouges.push(
            `rouge existant : ${f} › ${a.fullName || a.title} — ${premiereLigne(a.failureMessages?.[0])}`
          );
        }
      }
    }
    for (const f of groupe) {
      const res = resultats.find(t => t.name === path.join(ctx.copie, f));
      const assertions = res?.assertionResults ?? [];
      // The green tests of HEAD's version of the file, by their full name.
      const deHead = new Set(
        (
          resultats.find(t => avant.has(f) && t.name === path.join(ctx.copie, avant.get(f)))
            ?.assertionResults ?? []
        )
          .filter(a => a.status === 'passed')
          .map(a => a.fullName || a.title)
      );
      if (constructions.length && (!res || assertions.length === 0)) {
        // It cannot load before the build: it plays at the checks.
      } else if (!res) {
        casses.push(
          `${f} — ne se charge pas : non joué (code ${r.code}) ; ${premiereLigne(fin(r.sortie, 5))}`
        );
      } else if (assertions.length === 0) {
        casses.push(`${f} — ne se charge pas : ${premiereLigne(res.message || res.status)}`);
      }
      for (const a of assertions) {
        const nom = a.fullName || a.title;
        if (a.status === 'failed') {
          rouges.push(`${f} › ${nom} — ${premiereLigne(a.failureMessages?.[0])}`);
        } else if (a.status === 'passed' && deHead.has(nom)) {
          anciens++;
        } else if (a.status === 'passed') {
          const raison = justification(lignes, [a.title, a.fullName]);
          if (raison) justifies.push(`${f} › ${nom} — ${raison}`);
          else injustifies.push(`${f} › ${nom}`);
        }
      }
    }
  }
  const section = (titre, l) =>
    l.length ? [`${titre} (${l.length}) :`, ...l.map(x => `- ${x}`), ''] : [];
  const ok =
    (fichiers.length > 0 || rouges.length > 0) &&
    casses.length === 0 &&
    injustifies.length === 0 &&
    rouges.length + justifies.length + anciens > 0;
  const resume = `${rouges.length} rouge(s), ${justifies.length} vert(s) justifié(s), ${injustifies.length} vert(s) sans « vert attendu », ${casses.length} fichier(s) qui ne se charge(nt) pas, ${anciens} test(s) vert(s) que HEAD tient déjà, laissé(s) de côté`;
  const texte = [
    `Preuve du rouge sur ${composant} : ${resume}.`,
    ...[...new Set(reportes)].map(
      nom => `Les tests de ${nom} se jouent aux contrôles, après le développeur.`
    ),
    '',
    ...(fichiers.length || rouges.length
      ? []
      : [`Aucun fichier de test du lot dans ${composant} : rien ne prouve le rouge.`, '']),
    ...section('Rouges', rouges),
    ...section('Verts justifiés', justifies),
    ...section(
      'Verts sans « vert attendu » (un test vert avant le code passe seulement avec la ligne `vert attendu : <nom du test> — <raison>` dans la passation)',
      injustifies
    ),
    ...section('Fichiers qui ne prouvent rien', casses),
  ]
    .join('\n')
    .trim();
  return { ok, rouges: rouges.length, texte, resume };
}

// The builds that failed in <sortie> (Turborepo's line « Failed: », task `<package>#build`) of a
// package of the component at <index>: `{ nom, erreur }`, `erreur` the first line of the build's
// output (`<package>:build:`) that holds `error`, else the end of the output.
function constructionsEchouees(ctx, liste, sortie, index) {
  const texte = sansCouleurs(sortie);
  const noms = new Set();
  for (const m of texte.matchAll(/^\s*Failed:\s+(.+)$/gm)) {
    for (const tache of m[1].split(/[,\s]+/).filter(Boolean)) {
      const [nom, script] = tache.split('#');
      const p = liste.find(x => x.pkg.name === nom);
      if (script === 'build' && p && proprietaire(ctx, p.dossier) === index) noms.add(nom);
    }
  }
  return [...noms].map(nom => {
    const prefixe = `${nom}:build:`;
    const ligne = texte
      .split('\n')
      .map(l => l.trim())
      .find(l => l.startsWith(prefixe) && l.includes('error'));
    return {
      nom,
      erreur: ligne ? premiereLigne(ligne.slice(prefixe.length)) : premiereLigne(fin(sortie, 5)),
    };
  });
}

// The checks after the developpeur of the component at <index>: what is done, or, when <finale>,
// `npm run verifier`, what the integration plays. `{ rouge, aRepasser, texte, resume,
// proprietaire, horsTitre }`, `proprietaire` the index of the component that owns the red, -1 for
// none; `horsTitre` the packages out of the title whose task is red.
function controles(ctx, index, finale) {
  const composant = ctx.composants[index];
  const liste = paquets(ctx.copie).filter(p => !p.hors);
  const commandes = finale
    ? [{ args: ['run', 'verifier'] }]
    : commandesDuComposant(ctx, index, liste);
  const resultats = commandes.map(({ args, env }) => {
    let r = npm(ctx, 'controles', composant, args, env);
    // verifier plays a task at 75 again itself, at rest: its 75 is final.
    if (r.code === A_REPASSER && !finale) r = npm(ctx, 'controles', composant, args, env);
    return { args, env, ...r, ...proprietaires(ctx, liste, r.sortie) };
  });
  const echecs = resultats.filter(r => r.code !== 0 && r.code !== A_REPASSER);
  // Out of the final pass, a red that names only components after <index> waits for it.
  const attend = r =>
    !finale && r.proprietaires.length > 0 && r.proprietaires.every(i => i > index);
  const rouges = echecs.filter(r => !attend(r));
  const reportes = echecs.filter(attend);
  const aRepasser = resultats.filter(r => r.code === A_REPASSER);
  const ligne = r =>
    `${Object.entries(r.env ?? {})
      .map(([k, v]) => `${k}=${v} `)
      .join('')}npm ${r.args.join(' ')}`;
  const nommer = r => `${ligne(r)} (code ${r.code})`;
  const resume = rouges.length
    ? `rouge : ${rouges.map(nommer).join(' ; ')}`
    : aRepasser.length
      ? `à repasser : ${aRepasser.map(nommer).join(' ; ')}`
      : `verts : ${resultats
          .filter(r => !reportes.includes(r))
          .map(ligne)
          .join(' ; ')}${
          reportes.length
            ? ` ; laissés à la passe finale, rouges dans un composant d'après : ${reportes.map(nommer).join(' ; ')}`
            : ''
        }`;
  const texte = [
    `Contrôles sur ${composant}${finale ? ' (passe finale)' : ''} : ${resume}.`,
    ...[...rouges, ...aRepasser].map(r => `\n$ ${ligne(r)}\n${extrait(r)}`),
  ].join('\n');
  // The owner of the red: the first component, provider first, that a red names; -1 for none.
  const nommes = rouges.flatMap(r => r.proprietaires);
  const proprio = rouges.length && nommes.length ? Math.min(...nommes) : -1;
  return {
    rouge: rouges.length > 0,
    aRepasser: aRepasser.length > 0,
    texte,
    resume,
    proprietaire: proprio,
    horsTitre: [...new Set(rouges.flatMap(r => r.horsTitre))].sort(),
  };
}

// The checks of the components of the run up to <index>, out of the final pass: `npm test --
// <test files of the lot>` that lie in them (or in the shared test material that reads only
// them), `npm test -- <package>` for each of their packages and each of theirs the lot touches,
// then the guards in the envelope of the component.
function commandesDuComposant(ctx, index, liste) {
  const lot = changements(ctx);
  const touches = liste.length
    ? [...new Set(lot.map(c => paquetDe(liste, c.fichier)).filter(d => d !== '.'))].sort()
    : ['.'];
  const fait = chemin => {
    const i = proprietaire(ctx, chemin);
    return i >= 0 && i <= index;
  };
  const tests = testsDuLot(ctx).filter(f => fait(f) || matiereFaite(ctx, liste, f, index));
  const scripts = lireJson(path.join(ctx.copie, 'package.json'))?.scripts ?? {};
  const enveloppe = { [VARIABLE_ENVELOPPE]: ctx.composants[index] };
  return [
    ...(tests.length ? [{ args: ['test', '--', ...tests] }] : []),
    ...[...new Set([...touches.filter(fait), ...paquetsDesComposants(ctx, liste, i => i <= index)])]
      .sort()
      .map(d => ({ args: d === '.' ? ['test'] : ['test', '--', d] })),
    ...['grillhouse:gardes', 'gardes']
      .filter(s => s in scripts)
      .map(s => ({ args: ['run', s], env: enveloppe })),
  ];
}

// The lines of <texte> that Turborepo writes for the tasks <taches> (`<package>#<task>`): each
// begins with `<package>:<task>: `, a task of the root (`//#<task>`) with `<task>: ` or
// `//:<task>: `.
function lignesDesTaches(texte, taches) {
  const prefixes = taches.flatMap(t => {
    const [nom, script] = t.split('#');
    return nom === '//' ? [`${script}: `, `//:${script}: `] : [`${nom}:${script}: `];
  });
  return texte.split('\n').filter(l => prefixes.some(p => l.trimStart().startsWith(p)));
}

// The output of the red check <r> for its report: the lines of its failed tasks, the last 60,
// then the end of the output; else the last 60 lines of the output.
function extrait(r) {
  const lignes = lignesDesTaches(sansCouleurs(r.sortie), r.taches);
  return lignes.length
    ? [...lignes.slice(-60), '…', fin(r.sortie, 12)].join('\n')
    : fin(r.sortie, 60);
}

// The directories of the packages of <liste> that play tests (a script `test:vitest`) and whose
// component, by its index, <garde> keeps; sorted.
function paquetsDesComposants(ctx, liste, garde) {
  return liste
    .filter(p => p.pkg.scripts?.['test:vitest'])
    .filter(p => {
      const i = proprietaire(ctx, p.dossier);
      return i >= 0 && garde(i);
    })
    .map(p => p.dossier)
    .sort();
}

// The fingerprint of the files of <composant> in the copy: `git status --porcelain` of its
// directory and the content of each file it lists.
function empreinte(ctx, composant) {
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '-z', '--untracked-files=all', '--', composant],
    { encoding: 'utf8' }
  );
  const statut = String(r.stdout ?? '');
  const h = createHash('sha256').update(statut);
  for (const e of statut.split('\0')) {
    if (e.length < 4) continue;
    const f = path.join(ctx.copie, e.slice(3));
    try {
      if (statSync(f).isFile()) h.update(e).update(readFileSync(f));
    } catch {
      // A file removed: its line in the status is its trace.
    }
  }
  return h.digest('hex');
}

// The index of the component of the run that holds <chemin> (relative to the copy), the deepest
// one, `.` holding every path; -1 for none.
function proprietaire(ctx, chemin) {
  let trouve = -1;
  let profondeur = -1;
  ctx.composants.forEach((c, i) => {
    const dedans = c === '.' || chemin === c || chemin.startsWith(`${c}/`);
    const p = c === '.' ? 0 : c.split('/').length;
    if (dedans && p > profondeur) {
      trouve = i;
      profondeur = p;
    }
  });
  return trouve;
}

// True when <fichier> lies in a package of the shared test material that depends on no component
// after <index>: a test it holds then reads only what is done.
function matiereFaite(ctx, liste, fichier, index) {
  const m = matieres(ctx.copie)
    .map(x => path.relative(ctx.copie, x.dir))
    .find(d => fichier.startsWith(`${d}/`));
  if (!m) return false;
  const pkg =
    liste.find(p => p.dossier === m)?.pkg ??
    lireJson(path.join(ctx.copie, m, 'package.json')) ??
    {};
  const noms = Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  });
  return noms.every(n => {
    const p = liste.find(x => x.pkg.name === n);
    return !p || proprietaire(ctx, p.dossier) <= index;
  });
}

// What a red output names. `proprietaires`: the components that own it, as indexes, sorted: the
// packages of its failed tasks (Turborepo's line « Failed: »), else, when no failed task is a
// package's (none named, or a task of the root such as the guards), the components that hold a
// path its lines name, the lines of a notice (⚠️, ℹ️) aside. `horsTitre`: the packages of its
// failed tasks that no component of the title holds. `taches`: its failed tasks.
function proprietaires(ctx, liste, sortie) {
  const texte = sansCouleurs(sortie);
  const out = new Set();
  const horsTitre = new Set();
  const taches = new Set();
  let deRacine = false;
  for (const m of texte.matchAll(/^\s*Failed:\s+(.+)$/gm)) {
    for (const tache of m[1].split(/[,\s]+/).filter(Boolean)) {
      taches.add(tache);
      const p = liste.find(x => x.pkg.name === tache.split('#')[0]);
      const i = p ? proprietaire(ctx, p.dossier) : -1;
      if (i >= 0) out.add(i);
      else if (p) horsTitre.add(p.pkg.name);
      else deRacine = true;
    }
  }
  if (out.size === 0 && (deRacine || taches.size === 0)) {
    // The lines of the failed tasks when Turborepo names them: those of the green ones aside.
    const lignes = taches.size ? lignesDesTaches(texte, [...taches]) : texte.split('\n');
    for (const l of lignes) {
      if (l.includes('⚠️') || l.includes('ℹ️')) continue;
      for (const [chemin] of l.matchAll(/\/?[\w@.-]+(?:\/[\w@.-]+)+/g)) {
        const rel = path.isAbsolute(chemin) ? path.relative(ctx.copie, chemin) : chemin;
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
        const i = proprietaire(ctx, rel);
        if (i >= 0) out.add(i);
      }
    }
  }
  return {
    proprietaires: [...out].sort((a, b) => a - b),
    horsTitre: [...horsTitre].sort(),
    taches: [...taches],
  };
}

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The circuit from <depart> to « relecture ».
async function derouler(ctx, depart) {
  let { index, etape, tentative, rapport, dernier, finale } = depart;
  for (;;) {
    const composant = ctx.composants[index];
    const etat = {
      etape,
      composant,
      tentative,
      code: null,
      raison: null,
      rapport,
      dernier: ctx.composants[dernier],
      finale,
    };
    ecrireEtat(ctx, etat);
    try {
      if (etape === 'testeur') {
        await seance(ctx, 'testeur', composant, { tentative, rapport });
        commenter(ctx, composant, 'testeur', `séance ${tentative} finie, passation au ticket.`);
        etape = 'preuve';
      } else if (etape === 'preuve') {
        const p = preuve(ctx, composant);
        rapport = p.texte;
        if (p.ok) {
          const suite = p.rouges
            ? 'au développeur'
            : 'aucun rouge : un lot de tests seul, aux contrôles';
          commenter(ctx, composant, 'preuve', `${p.resume} ; ${suite}.\n\n${p.texte}`);
          etape = p.rouges ? 'developpeur' : 'controles';
          tentative = p.rouges ? 1 : 0;
        } else if (tentative <= RELANCES_TESTEUR) {
          commenter(
            ctx,
            composant,
            'preuve',
            `${p.resume} ; testeur relancé (séance ${tentative + 1}).\n\n${p.texte}`
          );
          etape = 'testeur';
          tentative++;
        } else {
          throw new Arret('preuve', p.texte);
        }
      } else if (etape === 'developpeur') {
        const fort = tentative >= SEANCES_DEVELOPPEUR;
        const avant = empreinte(ctx, composant);
        await seance(ctx, 'developpeur', composant, { tentative, rapport, fort });
        if (empreinte(ctx, composant) === avant) {
          throw new Arret(
            'sans-livraison',
            `La séance ${tentative} du développeur de ${composant} ne change aucun fichier de ${composant} : un développeur n'est lancé que sur un rouge, et ce rouge reste. Sa passation au ticket dit pourquoi :\n\n${passations(ctx).at(-1) ?? 'aucune'}`
          );
        }
        commenter(
          ctx,
          composant,
          'developpeur',
          `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie, passation au ticket.`
        );
        etape = 'controles';
      } else if (etape === 'controles') {
        const passeFinale = finale || index === dernier;
        const k = controles(ctx, index, passeFinale);
        rapport = k.texte;
        // The developpeur a red goes to: this component's, or in the final pass the owner's.
        const vers = k.rouge && passeFinale ? k.proprietaire : index;
        // One count of sessions for the component's checks, and one for the whole final pass,
        // whichever component its red goes to.
        const suivante = tentative + 1;
        if (k.rouge && passeFinale && k.horsTitre.length) {
          throw new Arret(
            'controles',
            `La passe finale est rouge dans ${k.horsTitre.join(', ')}, hors des composants du ticket (${ctx.composants.join(', ')}) : aucun de leurs développeurs n'est relancé. La décision revient au chef de chantier : ajouter ce composant au titre du ticket puis reprendre le circuit (\`--reprendre\`), le rouge allant à son développeur ; ou faire corriger le lot par le composant qui le cause (\`--depuis developpeur <composant> --contexte <le rouge>\`).\n\n${k.texte}`
          );
        } else if (k.rouge && vers < 0) {
          throw new Arret(
            'controles',
            `Aucun composant du ticket (${ctx.composants.join(', ')}) ne possède ce rouge de la passe finale : la décision revient au chef de chantier.\n\n${k.texte}`
          );
        } else if (k.rouge && suivante <= SEANCES_DEVELOPPEUR) {
          const qui = vers === index ? '' : ` de ${ctx.composants[vers]}`;
          commenter(
            ctx,
            composant,
            'controles',
            `${k.resume} ; développeur${qui} relancé (séance ${suivante}).`
          );
          etape = 'developpeur';
          tentative = suivante;
          index = vers;
          finale = passeFinale;
        } else if (k.rouge) {
          throw new Arret('controles', k.texte);
        } else if (k.aRepasser) {
          throw new Arret('a-repasser', k.texte);
        } else {
          commenter(ctx, composant, 'controles', `${k.resume}.`);
          if (!passeFinale) {
            index++;
            etape = 'testeur';
            tentative = 1;
            rapport = null;
          } else {
            etape = 'relecture';
          }
        }
      } else if (etape === 'relecture') {
        ecrireEtat(ctx, { ...etat, code: 0 });
        commenter(
          ctx,
          composant,
          'relecture',
          ctx.depuis
            ? `${composant} a repassé le circuit depuis ${ctx.depuis.etape} ; le lot va au relecteur.`
            : `les ${ctx.composants.length} composant(s) ont passé le circuit ; le lot va au relecteur.`
        );
        return 0;
      } else {
        throw new Usage(`étape inconnue dans l'état : ${etape}`);
      }
    } catch (e) {
      if (!(e instanceof Arret)) throw e;
      const code = ARRETS[e.nom];
      ecrireEtat(ctx, { ...etat, code, raison: e.nom, rapport: e.rapport });
      commenter(
        ctx,
        composant,
        etape,
        `arrêt ${e.nom} — ${premiereLigne(e.rapport)} — journal ${ctx.journal}`
      );
      process.stderr.write(
        `⛔ Circuit de ${ctx.ticket} arrêté : ${e.nom}, à l'étape ${etape} de ${composant}.\n`
      );
      return code;
    }
  }
}

// Where the run starts: the first component's testeur, or the step and component of the state
// <e> (null without one).
function depart(ctx, e) {
  const fin = ctx.composants.length - 1;
  if (ctx.depuis) {
    const index = ctx.composants.indexOf(ctx.depuis.composant);
    return {
      index,
      etape: ctx.depuis.etape,
      tentative: 1,
      rapport: ctx.contexte,
      dernier: index,
      finale: false,
    };
  }
  if (!ctx.reprendre)
    return { index: 0, etape: 'testeur', tentative: 1, rapport: null, dernier: fin, finale: false };
  if (!e) throw new Usage(`rien à reprendre : ${ctx.etat} n'existe pas.`);
  const index = ctx.composants.indexOf(e.composant);
  if (index < 0)
    throw new Usage(`le composant de l'état, ${e.composant}, n'est plus dans le titre.`);
  const dernier = ctx.composants.indexOf(e.dernier);
  return {
    index,
    etape: e.etape,
    tentative: e.etape === 'controles' ? 0 : 1,
    rapport: e.rapport,
    dernier: dernier < 0 ? fin : dernier,
    finale: e.finale === true,
  };
}

export async function main(argv) {
  let ctx = null;
  try {
    ctx = contexte(lireArguments(argv));
    mkdirSync(path.dirname(ctx.copie), { recursive: true });
    const e = existsSync(ctx.etat) ? JSON.parse(readFileSync(ctx.etat, 'utf8')) : null;
    const d = depart(ctx, e);
    // A session a dead circuit left running ends before this run launches its own.
    await attendreLaSeance(ctx, e?.seance);
    return await derouler(ctx, d);
  } catch (e) {
    if (!(e instanceof Usage)) throw e;
    process.stderr.write(
      `usage: circuit.mjs <ticket> [--reprendre] [--depuis <testeur|developpeur> <composant>] [--contexte <texte>]\n⛔ ${e.message}\n`
    );
    return CODE_USAGE;
  } finally {
    if (ctx) rmSync(ctx.tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
