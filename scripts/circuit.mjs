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
//   for, in its own process group. The instruction is written from the first template of
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
// - The proof of the red: the test files the testeur's lot adds or changes in the component
//   (git status of the copy, the testeur's files as the integration shares them, `isTesterFile`),
//   played by `npm test -- <files> --reporter=default --reporter=json --outputFile=<f>` in the
//   copy, one run per package. A file that does not load proves nothing; a green test passes only
//   when a comment of an agent at the ticket carries the line `vert attendu : <name of the test> —
//   <reason>`. A failed proof relaunches the testeur with its report, twice at most. The report
//   (reds, justified greens) is written at the ticket. A proof without a red skips the
//   developpeur: the lot is a lot of tests alone.
// - The checks after the developpeur, in the copy: `npm test -- <test files of the lot>`,
//   `npm run verifier -- --gardes`, and `npm test -- <package>` for each package the lot touches
//   (`npm test` in a repository without packages). A check at 75 (« à repasser ») plays once more.
//   A red relaunches the developpeur with the output, twice at most, the third session on the
//   strong model (`lancer.sh --modele opus --effort high`).
// - The state is `.claude/worktrees/<ticket>.circuit.json`, written again at each step:
//   `{ etape, composant, tentative, code, raison, rapport, dernier, journal }`; `etape` is testeur,
//   preuve, developpeur, controles or relecture; `raison` names the stop; `dernier` is the last
//   component of the run. `--reprendre` starts again at the step and component of the state, its
//   report given to the next session, and goes on to its `dernier`.
// - A lot the reviewer sends back passes again: `--depuis <testeur|developpeur> <composant>`
//   starts at that step for that component (a path or a package name the title names), the text of
//   `--contexte` (the findings of the verdict) as the report of its first session, plays the rest
//   of that component's steps (developpeur → controles, or testeur → preuve → developpeur →
//   controles), then stops at « relecture ». It goes with no `--reprendre`.
// - At each step, a short comment at the ticket: `Circuit · <composant> · <étape> : <résumé>`.
// - The commands of the circuit (the proof, the checks) are added to the log of the ticket,
//   `.claude/worktrees/<ticket>.log`, next to the sessions, each under its header line.
// - Exit codes: 0 at « relecture »; 2 a malformed call; a stop, by its name (ARRETS):
//   10 lancement (lancer.sh stopped before the session), 11 bloqué (a motionless transcript),
//   12 sans-passation (twice no handover), 13 preuve (the third proof fails), 14 controles (the
//   third developpeur leaves a red check), 75 a-repasser (a check still at 75 once played again).
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
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

function ecrireEtat(ctx, etat) {
  const provisoire = `${ctx.etat}.${process.pid}`;
  writeFileSync(provisoire, `${JSON.stringify({ ...etat, journal: ctx.journal }, null, 2)}\n`);
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
  return new Promise(resolve => {
    const enfant = spawn('bash', args, {
      cwd: ctx.racine,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let erreur = '';
    enfant.stderr.on('data', d => (erreur += d));
    let bouge = Date.now();
    let bloque = false;
    const signal = s => {
      try {
        process.kill(-enfant.pid, s);
      } catch {
        // The group is gone.
      }
    };
    const pas = Math.max(100, Math.min(30_000, Math.floor(ctx.immobileMs / 4)));
    const veille = setInterval(() => {
      bouge = Math.max(bouge, derniereTrace(ctx.transcriptions), mtime(ctx.journal));
      if (!bloque && Date.now() - bouge >= ctx.immobileMs) {
        bloque = true;
        signal('SIGTERM');
        setTimeout(() => signal('SIGKILL'), 5_000).unref();
      }
    }, pas);
    enfant.on('close', code => {
      clearInterval(veille);
      // What remains of the group goes with its launcher.
      if (bloque) signal('SIGKILL');
      const seance = existsSync(ctx.fin) ? Number(readFileSync(ctx.fin, 'utf8').trim()) : null;
      resolve({ code, seance, bloque, erreur });
    });
  });
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

// One npm command in the copy, added to the log: `{ code, sortie }`.
function npm(ctx, etape, composant, args) {
  entete(ctx, etape, composant);
  appendFileSync(ctx.journal, `$ npm ${args.join(' ')}\n`);
  const r = spawnSync('npm', args, {
    cwd: ctx.copie,
    encoding: 'utf8',
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

// The proof of the red on <composant>: `{ ok, rouges, texte, resume }`.
function preuve(ctx, composant) {
  const fichiers = testsDuComposant(ctx, composant);
  const lignes = passations(ctx).flatMap(t => t.split('\n'));
  const rouges = [];
  const justifies = [];
  const injustifies = [];
  const casses = [];
  const liste = paquets(ctx.copie).filter(p => !p.hors);
  const groupes = new Map();
  for (const f of fichiers) {
    const p = paquetDe(liste, f);
    groupes.set(p, [...(groupes.get(p) ?? []), f]);
  }
  for (const [, groupe] of groupes) {
    const rapport = path.join(ctx.tmp, `preuve-${++ctx.numero}.json`);
    const r = npm(ctx, 'preuve', composant, [
      'test',
      '--',
      ...groupe,
      '--reporter=default',
      '--reporter=json',
      `--outputFile=${rapport}`,
    ]);
    let resultats = [];
    try {
      resultats = JSON.parse(readFileSync(rapport, 'utf8')).testResults ?? [];
    } catch {
      // No report: no file of the group played.
    }
    for (const f of groupe) {
      const res = resultats.find(t => t.name === path.join(ctx.copie, f));
      const assertions = res?.assertionResults ?? [];
      if (!res) {
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
    fichiers.length > 0 &&
    casses.length === 0 &&
    injustifies.length === 0 &&
    rouges.length + justifies.length > 0;
  const resume = `${rouges.length} rouge(s), ${justifies.length} vert(s) justifié(s), ${injustifies.length} vert(s) sans « vert attendu », ${casses.length} fichier(s) qui ne se charge(nt) pas`;
  const texte = [
    `Preuve du rouge sur ${composant} : ${resume}.`,
    '',
    ...(fichiers.length
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

// The checks after the developpeur: `{ rouge, aRepasser, texte, resume }`.
function controles(ctx, composant) {
  const lot = changements(ctx);
  const tests = testsDuLot(ctx);
  const liste = paquets(ctx.copie).filter(p => !p.hors);
  const touches = liste.length
    ? [...new Set(lot.map(c => paquetDe(liste, c.fichier)).filter(d => d !== '.'))].sort()
    : ['.'];
  const commandes = [
    ...(tests.length ? [['test', '--', ...tests]] : []),
    ['run', 'verifier', '--', '--gardes'],
    ...touches.map(d => (d === '.' ? ['test'] : ['test', '--', d])),
  ];
  const resultats = commandes.map(args => {
    let r = npm(ctx, 'controles', composant, args);
    if (r.code === A_REPASSER) r = npm(ctx, 'controles', composant, args);
    return { args, ...r };
  });
  const rouges = resultats.filter(r => r.code !== 0 && r.code !== A_REPASSER);
  const aRepasser = resultats.filter(r => r.code === A_REPASSER);
  const nommer = r => `npm ${r.args.join(' ')} (code ${r.code})`;
  const resume = rouges.length
    ? `rouge : ${rouges.map(nommer).join(' ; ')}`
    : aRepasser.length
      ? `à repasser : ${aRepasser.map(nommer).join(' ; ')}`
      : `verts : ${resultats.map(r => `npm ${r.args.join(' ')}`).join(' ; ')}`;
  const texte = [
    `Contrôles sur ${composant} : ${resume}.`,
    ...[...rouges, ...aRepasser].map(r => `\n$ npm ${r.args.join(' ')}\n${fin(r.sortie, 60)}`),
  ].join('\n');
  return { rouge: rouges.length > 0, aRepasser: aRepasser.length > 0, texte, resume };
}

// The circuit from <depart> to « relecture ».
async function derouler(ctx, depart) {
  let { index, etape, tentative, rapport, dernier } = depart;
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
        await seance(ctx, 'developpeur', composant, { tentative, rapport, fort });
        commenter(
          ctx,
          composant,
          'developpeur',
          `séance ${tentative}${fort ? ' (opus, effort high)' : ''} finie, passation au ticket.`
        );
        etape = 'controles';
      } else if (etape === 'controles') {
        const k = controles(ctx, composant);
        rapport = k.texte;
        if (k.rouge && tentative < SEANCES_DEVELOPPEUR) {
          commenter(
            ctx,
            composant,
            'controles',
            `${k.resume} ; développeur relancé (séance ${tentative + 1}).`
          );
          etape = 'developpeur';
          tentative++;
        } else if (k.rouge) {
          throw new Arret('controles', k.texte);
        } else if (k.aRepasser) {
          throw new Arret('a-repasser', k.texte);
        } else {
          commenter(ctx, composant, 'controles', `${k.resume}.`);
          if (index < dernier) {
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

// Where the run starts: the first component's testeur, or the step and component of the state.
function depart(ctx) {
  const fin = ctx.composants.length - 1;
  if (ctx.depuis) {
    const index = ctx.composants.indexOf(ctx.depuis.composant);
    return { index, etape: ctx.depuis.etape, tentative: 1, rapport: ctx.contexte, dernier: index };
  }
  if (!ctx.reprendre)
    return { index: 0, etape: 'testeur', tentative: 1, rapport: null, dernier: fin };
  if (!existsSync(ctx.etat)) throw new Usage(`rien à reprendre : ${ctx.etat} n'existe pas.`);
  const e = JSON.parse(readFileSync(ctx.etat, 'utf8'));
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
  };
}

export async function main(argv) {
  let ctx = null;
  try {
    ctx = contexte(lireArguments(argv));
    mkdirSync(path.dirname(ctx.copie), { recursive: true });
    return await derouler(ctx, depart(ctx));
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
