#!/usr/bin/env node
// The board of a project: its state in one object, measured on Beads, the session transcripts,
// the integration lock, the agents' copies and the running processes — never on what an agent
// writes. The Grillhouse mod draws it; it also reads as text.
//
//   node scripts/tableau.mjs            the board, as JSON
//   node scripts/tableau.mjs --texte    the board, as text
//
// - Epics: the one(s) with tickets in progress first, each with its tickets in progress, ready,
//   blocked, awaiting the responsable (label `a-valider`), deferred and closed; the project's
//   totals.
// - The order: Beads' (`bd ready`: priority, then dependencies), its next five tickets, and the
//   open epics without work in progress, by priority.
// - Per ticket: its duration (claimed → closed, or now) and the agents' working time and tokens.
//   A transcript belongs to a ticket by its copy (`.claude/worktrees/<ticket>`) or by the
//   « TON TICKET : <id> » line of its first message; the rest is « supervision ». Tokens: input +
//   output + cache creation; cache reads apart. Transcripts are read again only when they change
//   (<git common dir>/tableau-cache.json).
// - What runs: the integration lock's process, the agents' processes (`TON TICKET` in their
//   arguments) with their copy's log, the subagents whose transcript moved in the last 2 minutes.
// - Alerts: a red night, tickets awaiting the responsable, an agent silent for 10 minutes, a
//   ticket in progress without anything running for 30 minutes.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MINUTE = 60_000;
export const SILENCE = 10 * MINUTE;
export const SANS_AGENT = 30 * MINUTE;
const RECENT = 2 * MINUTE;
const enTirets = p => p.replace(/[^A-Za-z0-9]/g, '-');

// The tokens and the working span of a transcript's lines (one JSON object per line).
export function lireTranscription(texte) {
  let jetons = 0;
  let cache = 0;
  let premier = null;
  let dernier = null;
  let ticket = null;
  const vus = new Set();
  for (const ligne of texte.split('\n')) {
    if (!ligne.trim()) continue;
    let e;
    try {
      e = JSON.parse(ligne);
    } catch {
      continue;
    }
    const t = e.timestamp ? Date.parse(e.timestamp) : NaN;
    if (!Number.isNaN(t)) {
      premier ??= t;
      dernier = t;
    }
    if (ticket === null && e.type === 'user') {
      const contenu = e.message?.content;
      const texteUser =
        typeof contenu === 'string'
          ? contenu
          : Array.isArray(contenu)
            ? contenu.map(c => c.text ?? '').join(' ')
            : '';
      const m = /TON TICKET : ([A-Za-z0-9_-]+-[A-Za-z0-9]+(?:\.[0-9]+)*)/.exec(texteUser);
      ticket = m ? m[1] : '';
    }
    const u = e.message?.usage;
    const id = e.message?.id ?? e.requestId;
    if (!u || (id && vus.has(id))) continue;
    if (id) vus.add(id);
    jetons += (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    cache += u.cache_read_input_tokens ?? 0;
  }
  return {
    jetons,
    cache,
    travail: premier !== null ? dernier - premier : 0,
    dernier,
    ticket: ticket || null,
  };
}

// Every transcript of the project, with the ticket it belongs to (null: supervision).
function transcriptions(racine, home) {
  const projets = path.join(home, '.claude', 'projects');
  if (!existsSync(projets)) return [];
  const propre = enTirets(racine);
  const copies = `${enTirets(path.join(racine, '.claude', 'worktrees'))}-`;
  const out = [];
  const jsonl = (dir, rattache) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isFile() && e.name.endsWith('.jsonl')) out.push({ fichier: p, rattache });
      else if (e.isDirectory()) jsonl(path.join(p, 'subagents'), 'premier-message');
    }
  };
  for (const d of readdirSync(projets)) {
    if (d === propre) jsonl(path.join(projets, d), null);
    else if (d.startsWith(copies)) {
      // The copy's name is its ticket; the dashes of the encoding stand for its dots.
      const nom = d.slice(copies.length);
      const vrai = existsSync(path.join(racine, '.claude', 'worktrees'))
        ? readdirSync(path.join(racine, '.claude', 'worktrees')).find(n => enTirets(n) === nom)
        : null;
      jsonl(path.join(projets, d), vrai ?? nom);
    }
  }
  return out;
}

// The tokens and working time per ticket, transcripts read again only when they changed.
export function lireJetons(racine, home, fichierCache) {
  const cache = existsSync(fichierCache) ? JSON.parse(readFileSync(fichierCache, 'utf8')) : {};
  const neuf = {};
  const parTicket = {};
  const supervision = { jetons: 0, cache: 0, travail: 0 };
  const recents = [];
  for (const { fichier, rattache } of transcriptions(racine, home)) {
    const st = statSync(fichier);
    const cle = `${st.size}:${st.mtimeMs}`;
    const lu =
      cache[fichier]?.cle === cle
        ? cache[fichier].lu
        : lireTranscription(readFileSync(fichier, 'utf8'));
    neuf[fichier] = { cle, lu };
    const ticket = rattache === 'premier-message' ? lu.ticket : rattache;
    const cible = ticket
      ? (parTicket[ticket] ??= { jetons: 0, cache: 0, travail: 0 })
      : supervision;
    cible.jetons += lu.jetons;
    cible.cache += lu.cache;
    cible.travail += lu.travail;
    if (rattache === 'premier-message' && ticket) recents.push({ ticket, mtime: st.mtimeMs });
  }
  try {
    writeFileSync(fichierCache, JSON.stringify(neuf));
  } catch {
    // A read-only place keeps the board working, without its cache.
  }
  return { parTicket, supervision, sousAgents: recents };
}

// What runs now: the integration lock, the agents' processes, the recent subagents.
export function lireVivant(racine, commun, prefix, sousAgents, maintenant) {
  const vivant = [];
  const verrou = path.join(commun, 'integration.lock');
  if (existsSync(verrou)) {
    const pid = Number(readFileSync(verrou, 'utf8'));
    try {
      process.kill(pid, 0);
      vivant.push({ type: 'intégration', pid, depuis: statSync(verrou).mtimeMs });
    } catch {
      // A lock whose process is gone runs nothing.
    }
  }
  let ps = '';
  try {
    ps = execFileSync('ps', ['-eo', 'pid=,etimes=,args='], { encoding: 'utf8' });
  } catch {
    ps = '';
  }
  const motif = new RegExp(`TON TICKET : (${prefix}-[A-Za-z0-9]+(?:\\.[0-9]+)*)`);
  const vus = new Set();
  for (const ligne of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(ligne);
    const t = m && motif.exec(m[3]);
    if (!t || !m[3].includes('--agent') || vus.has(t[1])) continue;
    vus.add(t[1]);
    const journal = path.join(racine, '.claude', 'worktrees', `${t[1]}.log`);
    vivant.push({
      type: 'agent',
      ticket: t[1],
      pid: Number(m[1]),
      depuis: maintenant - Number(m[2]) * 1000,
      journal: existsSync(journal) ? journal : null,
      silence: existsSync(journal) ? maintenant - statSync(journal).mtimeMs : null,
    });
  }
  for (const s of sousAgents) {
    if (maintenant - s.mtime < RECENT && !vus.has(s.ticket)) {
      vus.add(s.ticket);
      vivant.push({ type: 'sous-agent', ticket: s.ticket, depuis: s.mtime });
    }
  }
  return vivant;
}

const court = t => ({ id: t.id, titre: t.title, priorite: t.priority });

// The board, from what was read. Pure: every source comes in, the time included.
export function assembler({ tous, prets, bloques, aValider, nuit, jetons, vivant, maintenant }) {
  const parId = new Map(tous.map(t => [t.id, t]));
  const epopeeDe = t => {
    let p = t.parent;
    while (p && parId.get(p)?.issue_type !== 'epic') p = parId.get(p)?.parent;
    return p ?? null;
  };
  const pret = new Set(prets.map(t => t.id));
  const bloque = new Set(bloques.map(t => t.id));
  const avalider = new Set(aValider.map(t => t.id));
  const etat = t => {
    if (t.status === 'closed') return 'fermes';
    if (t.status === 'in_progress') return 'enCours';
    if (t.status === 'deferred') return 'reportes';
    if (avalider.has(t.id)) return 'aValider';
    if (t.status === 'blocked' || bloque.has(t.id)) return 'bloques';
    if (pret.has(t.id)) return 'prets';
    return 'bloques';
  };
  const vide = () => ({
    enCours: [],
    prets: [],
    bloques: [],
    aValider: [],
    reportes: [],
    fermes: [],
  });
  const total = vide();
  const groupes = new Map();
  for (const t of tous) {
    if (t.issue_type === 'epic') continue;
    const e = etat(t);
    total[e].push(court(t));
    const ep = epopeeDe(t) ?? '(sans épopée)';
    if (!groupes.has(ep)) groupes.set(ep, vide());
    groupes.get(ep)[e].push(court(t));
  }
  const compter = g => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.length]));
  const epopees = [...groupes].map(([id, g]) => ({
    id,
    titre: parId.get(id)?.title ?? id,
    priorite: parId.get(id)?.priority ?? 9,
    enCours: g.enCours.length > 0,
    compteurs: compter(g),
    tickets: g,
    jetons: [...Object.values(g)]
      .flat()
      .reduce((s, t) => s + (jetons.parTicket[t.id]?.jetons ?? 0), 0),
  }));
  epopees.sort((a, b) => Number(b.enCours) - Number(a.enCours) || a.priorite - b.priorite);

  const tickets = {};
  for (const t of tous) {
    if (t.issue_type === 'epic' || !t.started_at) continue;
    const debut = Date.parse(t.started_at);
    const fin = t.closed_at ? Date.parse(t.closed_at) : maintenant;
    const j = jetons.parTicket[t.id] ?? { jetons: 0, cache: 0, travail: 0 };
    tickets[t.id] = { duree: fin - debut, travail: j.travail, jetons: j.jetons, cache: j.cache };
  }

  const alertes = [];
  if (nuit.length) {
    alertes.push({
      niveau: 'rouge',
      texte: `La nuit est rouge : ${nuit.map(t => t.id).join(', ')}`,
    });
  }
  if (aValider.length) {
    alertes.push({
      niveau: 'decision',
      texte: `${aValider.length} ticket(s) attendent ta décision`,
    });
  }
  for (const v of vivant) {
    if (v.type === 'agent' && v.silence !== null && v.silence > SILENCE) {
      alertes.push({
        niveau: 'orange',
        texte: `${v.ticket} : agent vivant, silencieux depuis ${Math.round(v.silence / MINUTE)} min`,
      });
    }
  }
  const actifs = new Set(vivant.map(v => v.ticket).filter(Boolean));
  for (const t of total.enCours) {
    const debut = parId.get(t.id)?.started_at;
    if (!actifs.has(t.id) && debut && maintenant - Date.parse(debut) > SANS_AGENT) {
      alertes.push({ niveau: 'orange', texte: `${t.id} : en cours sans rien qui tourne` });
    }
  }

  return {
    projet: compter(total),
    epopees,
    suivants: prets
      .filter(t => t.issue_type !== 'epic')
      .slice(0, 5)
      .map(court),
    epopeesSuivantes: tous
      .filter(t => t.issue_type === 'epic' && t.status !== 'closed')
      .filter(t => !epopees.find(e => e.id === t.id)?.enCours)
      .sort((a, b) => a.priority - b.priority)
      .map(court),
    tickets,
    supervision: jetons.supervision,
    vivant,
    alertes,
  };
}

const bdJson = (racine, ...args) => {
  try {
    return JSON.parse(execFileSync('bd', [...args, '--json'], { cwd: racine, encoding: 'utf8' }));
  } catch {
    return [];
  }
};

// The board of the repository at <racine>.
export function tableau(racine, { home = os.homedir(), maintenant = Date.now() } = {}) {
  const commun = execFileSync(
    'git',
    ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8' }
  ).trim();
  let prefix = '';
  try {
    prefix = execFileSync('bd', ['config', 'get', 'issue_prefix'], {
      cwd: racine,
      encoding: 'utf8',
    }).trim();
  } catch {
    prefix = '';
  }
  const jetons = lireJetons(racine, home, path.join(commun, 'tableau-cache.json'));
  return assembler({
    tous: bdJson(racine, 'list', '--all', '--limit', '0'),
    prets: bdJson(racine, 'ready', '--limit', '0'),
    bloques: bdJson(racine, 'blocked'),
    aValider: bdJson(racine, 'list', '--label', 'a-valider', '--limit', '0').filter(
      t => t.status !== 'closed'
    ),
    nuit: bdJson(racine, 'list', '--label', 'nuit', '--limit', '0').filter(
      t => t.status !== 'closed'
    ),
    jetons,
    vivant: lireVivant(racine, commun, prefix || '[A-Za-z0-9_]+', jetons.sousAgents, maintenant),
    maintenant,
  });
}

const k = n =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : `${n}`;
const minutes = ms => `${Math.round(ms / MINUTE)} min`;

// The board as text.
export function texte(t) {
  const lignes = [];
  const c = x =>
    `${x.enCours} en cours · ${x.prets} prêts · ${x.bloques} bloqués · ${x.aValider} à valider · ${x.reportes} reportés · ${x.fermes} fermés`;
  for (const a of t.alertes) lignes.push(`! ${a.texte}`);
  lignes.push(`Projet : ${c(t.projet)}`);
  for (const e of t.epopees) {
    lignes.push(
      `${e.enCours ? '▶' : ' '} ${e.id} — ${e.titre} : ${c(e.compteurs)} · ${k(e.jetons)} jetons`
    );
    for (const x of e.tickets.enCours) {
      const m = t.tickets[x.id];
      lignes.push(
        `    ◐ ${x.id} ${x.titre}${m ? ` (${minutes(m.duree)}, ${k(m.jetons)} jetons)` : ''}`
      );
    }
  }
  if (t.suivants.length) lignes.push(`Suivants : ${t.suivants.map(x => x.id).join(', ')}`);
  for (const v of t.vivant) {
    lignes.push(
      `● ${v.type}${v.ticket ? ` ${v.ticket}` : ''} depuis ${minutes(Date.now() - v.depuis)}`
    );
  }
  lignes.push(`Supervision : ${k(t.supervision.jetons)} jetons`);
  return lignes.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const t = tableau(process.cwd());
  process.stdout.write(process.argv.includes('--texte') ? `${texte(t)}\n` : JSON.stringify(t));
}
