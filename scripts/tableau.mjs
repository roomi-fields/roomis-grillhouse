#!/usr/bin/env node
// The board of a project, on three levels, measured on Beads, the register of finished agents,
// the transcripts of running ones and the running processes — never on what an agent declares.
// The Grillhouse mod shows its lines; `npm run tableau` prints them.
//
//   node scripts/tableau.mjs            the board, as JSON (with its lines, 52 columns wide)
//   node scripts/tableau.mjs --texte    the board, as text
//
// Each measure writes the status line (the chantier in progress) to `grillhouse-etat.txt` in the
// common git directory, where the status line (`scripts/ligne-etat/`) reads it.
//
// - Global: the work tickets of the project (a ticket without children; a mother is a grouping)
//   by state, the agents' working time and tokens of the day and in all, the alerts.
// - Agents: one block per role (`grillhouse.roles` in package.json replaces the default), for the
//   whole project. The site manager's block heads them as 0 wherever the list declares it, the
//   other roles are numbered from 1 in the order declared. A ticket stands under every agent that
//   runs on it, or waits in one place. A ticket a site manager led (a passage of its role in the
//   register) waits under block 0; any other waits for the next role, deduced from the roles that
//   ran on it and the reviewer's last verdict (`ACCEPTÉ` or `RENDU` at the start of a comment). A
//   project whose roles leave the site manager out keeps the deduction for every ticket.
// - Chantier: a root epic with work in progress, its tree of mothers, each with its work tickets
//   done over all; the tree shows the open work: a closed ticket, mother included, counts without
//   a line, and a closed mother's open tickets take her place. The other chantiers, one line each.
//   Then the tickets closed today.
// - Lines: the head, AGENTS, CHANTIER, then FAITS AUJOURD'HUI, every line of each list shown; a
//   line folds only lines of another state (the tree's « + 2 prêts ») or the chantiers not in
//   progress.
// - Measures: a finished agent from the register (`scripts/registre.mjs`), a running one from its
//   transcript: a role agent launched in a shell (`TON TICKET` and `--agent` in its arguments)
//   while its process runs, a sub-agent or a session whose transcript moved in the last 2 minutes.
//   With an end in the register, it runs only when an incoming message (of the person, another
//   agent, a notification) follows its latest end strictly (a reviewer resumed by a message); the
//   writings of its last turn after that end leave it finished, measured by that latest end.
//   A sub-agent, whatever its role, runs also while its last tool call awaits its answer, its
//   transcript having moved in the last 30 minutes; a session keeps the 2-minute rule alone. The
//   board reads no transcript older than 30 minutes: a shell agent whose transcript is older shows
//   by its process alone. A sub-agent whose prompt names no ticket takes that of the site manager
//   that launched it.
// - Time: a transcript's working time is the union of its turns, each bounded by the earliest and
//   the latest date of its events, whatever their order in the file; a transcript is read where the
//   board stopped, its reading kept in the cache file.
// - Alerts: one red alert per open night ticket (its subject, then its number), tickets awaiting
//   the responsable, a shell agent silent for 10 minutes, a ticket in progress without anything
//   running for 30 minutes.
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MINUTE = 60_000;
export const SILENCE = 10 * MINUTE;
export const SANS_AGENT = 30 * MINUTE;
const RECENT = 2 * MINUTE;
export const LARGEUR = 52;
const CHEF = 'chef-de-chantier';
export const ROLES = [
  CHEF,
  'explorateur',
  'arbitre',
  'testeur',
  'developpeur',
  'relecteur',
  'integrateur',
];
// A sub-agent's role from its meta file: the type it was spawned as; a named agent's `agentType`
// is its name.
export const roleDuMeta = m => m.spawnedAgentType ?? m.customAgentType ?? m.agentType ?? null;
const NOMS = {
  [CHEF]: 'chef de chantier',
  developpeur: 'développeur',
  integrateur: 'intégrateur',
};
const enTirets = p => p.replace(/[^A-Za-z0-9]/g, '-');

// The origins of an incoming message: the person, another agent, a notification.
const ORIGINES = new Set(['human', 'peer', 'task-notification']);
// The mark the tool writes when the person stops a turn.
const INTERRUPTION = /^\[Request interrupted by user( for tool use)?\]$/;

// An incoming message opens a turn: a message of the person, of another agent or a notification.
// Its origin decides; a message without origin is one unless it is a tool's result, a meta message
// (a system reminder, a loaded skill), the summary written after a compaction or the interruption
// mark.
function entrant(e) {
  if (e.type !== 'user') {
    return false;
  }
  if (e.origin) {
    return ORIGINES.has(e.origin.kind);
  }
  const contenu = e.message?.content;
  if (e.isMeta || e.isCompactSummary) {
    return false;
  }
  if (Array.isArray(contenu)) {
    if (contenu.some(c => c.type === 'tool_result')) {
      return false;
    }
    return !INTERRUPTION.test(contenu.map(c => c.text ?? '').join(''));
  }
  return typeof contenu === 'string' && !INTERRUPTION.test(contenu);
}

// The reading of a transcript is a state that lines are added to, one JSON object per line: it
// holds the tokens, the turns, the start and end, the last incoming message, the ticket, the role,
// the cost and the last tool call, and it is plain JSON, so the board keeps it between two
// measures and reads only what was appended. A turn is bounded by the earliest and the latest date
// of its events, whatever their order in the file; the first one holds the events before the first
// incoming message, each next one opens at an incoming message and holds the events up to the next.
const etatNeuf = () => ({
  jetons: 0,
  cache: 0,
  premier: null,
  dernier: null,
  entre: null,
  ticket: null,
  role: null,
  cout: null,
  appel: null,
  reponses: [],
  tours: [],
  recu: false,
  vus: [],
});

// The union of intervals, ordered by date: no instant is in two of them.
function reunir(intervalles) {
  const out = [];
  for (const [debut, fin] of [...intervalles].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const dernier = out[out.length - 1];
    if (dernier && debut <= dernier[1]) {
      dernier[1] = Math.max(dernier[1], fin);
    } else {
      out.push([debut, fin]);
    }
  }
  return out;
}

// Adds the lines of `texte` to the state `etat`, which it returns.
function avancer(etat, texte) {
  const vus = new Set(etat.vus);
  const reponses = new Set(etat.reponses);
  for (const ligne of texte.split('\n')) {
    if (!ligne.trim()) {
      continue;
    }
    let e;
    try {
      e = JSON.parse(ligne);
    } catch {
      continue;
    }
    if (e.type === 'agent-setting') {
      etat.role ??= e.agentSetting ?? null;
    }
    if (e.type === 'cost-state' && typeof e.totalCostUSD === 'number') {
      etat.cout = e.totalCostUSD;
    }
    const t = e.timestamp ? Date.parse(e.timestamp) : NaN;
    if (!Number.isNaN(t)) {
      etat.premier = etat.premier === null ? t : Math.min(etat.premier, t);
      etat.dernier = etat.dernier === null ? t : Math.max(etat.dernier, t);
      // The first incoming message continues the turn its earlier events opened.
      const recoit = entrant(e);
      const coupe = recoit && etat.recu;
      etat.recu ||= recoit;
      if (recoit) {
        etat.entre = etat.entre === null ? t : Math.max(etat.entre, t);
      }
      if (etat.tours.length === 0 || coupe) {
        etat.tours.push([t, t]);
      } else {
        const tour = etat.tours[etat.tours.length - 1];
        tour[0] = Math.min(tour[0], t);
        tour[1] = Math.max(tour[1], t);
      }
    }
    for (const c of Array.isArray(e.message?.content) ? e.message.content : []) {
      if (c.type === 'tool_use') {
        etat.appel = c.id;
      } else if (c.type === 'tool_result') {
        reponses.add(c.tool_use_id);
      }
    }
    if (etat.ticket === null && e.type === 'user') {
      const contenu = e.message?.content;
      const texteUser =
        typeof contenu === 'string'
          ? contenu
          : Array.isArray(contenu)
            ? contenu.map(c => c.text ?? '').join(' ')
            : '';
      const m = /TON TICKET : ([A-Za-z0-9_-]+-[A-Za-z0-9]+(?:\.[0-9]+)*)/.exec(texteUser);
      etat.ticket = m ? m[1] : '';
    }
    const u = e.message?.usage;
    const id = e.message?.id ?? e.requestId;
    if (!u || (id && vus.has(id))) {
      continue;
    }
    if (id) {
      vus.add(id);
    }
    etat.jetons +=
      (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    etat.cache += u.cache_read_input_tokens ?? 0;
  }
  etat.vus = [...vus];
  etat.reponses = [...reponses];
  return etat;
}

// The measures of a state: the tokens, the turns and their working time (the union of the turns,
// the waits left out), the start (the oldest date) and the end (the latest), the ticket, the role
// (a session launched with `--agent`) and the cost (the total a session writes). `entre` is the
// time of the latest incoming message, or null; `attend` tells whether the last tool call still
// awaits its answer, the call and its answer paired by their identifier.
const mesurer = etat => ({
  jetons: etat.jetons,
  cache: etat.cache,
  travail: reunir(etat.tours).reduce((s, [debut, fin]) => s + (fin - debut), 0),
  tours: etat.tours.map(tour => [...tour]),
  premier: etat.premier,
  dernier: etat.dernier,
  entre: etat.entre,
  attend: etat.appel !== null && !etat.reponses.includes(etat.appel),
  ticket: etat.ticket || null,
  role: etat.role,
  cout: etat.cout,
});

// The measures of the transcript `texte`, read whole.
export const lireTranscription = texte => mesurer(avancer(etatNeuf(), texte));

// One line per agent, its latest end: the register holds a line at each stop of an agent, each
// the reading of its whole transcript at that stop, so the latest one holds all its sessions.
function parAgent(registre) {
  const derniere = new Map();
  for (const r of registre) {
    const avant = derniere.get(r.agent);
    if (!avant || Date.parse(r.fin) > Date.parse(avant.fin)) {
      derniere.set(r.agent, r);
    }
  }
  return [...derniere.values()];
}

// The register's lines of this project, one per agent: its latest end.
export function lireRegistre(texte, racine) {
  const out = [];
  for (const l of texte.split('\n')) {
    try {
      const e = JSON.parse(l);
      if (e.projet === racine) {
        out.push(e);
      }
    } catch {
      // A torn line counts nothing.
    }
  }
  return parAgent(out);
}

// The bytes of `f` from `decalage` to `taille`, cut after their last whole line: a line still being
// written waits for its end, unless it is already whole JSON.
function lireDepuis(f, decalage, taille) {
  const fd = openSync(f, 'r');
  try {
    const tampon = Buffer.alloc(taille - decalage);
    const lus = readSync(fd, tampon, 0, tampon.length, decalage);
    const lu = tampon.subarray(0, lus);
    const fin = lu.lastIndexOf(10) + 1;
    let entier = lu.subarray(0, fin);
    if (fin < lu.length) {
      try {
        JSON.parse(lu.subarray(fin).toString('utf8'));
        entier = lu;
      } catch {
        // The line is not whole yet.
      }
    }
    return { texte: entier.toString('utf8'), lus: entier.length };
  } finally {
    closeSync(fd);
  }
}

// A transcript read where it stopped: `cache` maps a file to its reading state and the byte it
// reached. A transcript only grows; one that became shorter is read again from its start.
const lecteur = cache => f => {
  try {
    const taille = statSync(f).size;
    let { etat, decalage } = cache[f] ?? {};
    if (!etat || taille < decalage) {
      etat = etatNeuf();
      decalage = 0;
    }
    if (taille > decalage) {
      const { texte, lus } = lireDepuis(f, decalage, taille);
      avancer(etat, texte);
      decalage += lus;
    }
    cache[f] = { etat, decalage };
    return mesurer(etat);
  } catch {
    return null;
  }
};
const fichiers = (dir, fin) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(n => n.endsWith(fin))
        .map(n => path.join(dir, n))
    : [];

// Whether the last tool call of the transcript `f` awaits its answer, read from the end of the
// file (the last call and its answer sit in its last bytes) so a transcript that waits on nothing
// is never read whole.
const FIN_LUE = 65_536;
function appelEnAttente(f) {
  try {
    const taille = statSync(f).size;
    const debut = Math.max(0, taille - FIN_LUE);
    const { texte } = lireDepuis(f, debut, taille);
    return lireTranscription(
      texte
        .split('\n')
        .slice(debut > 0 ? 1 : 0)
        .join('\n')
    ).attend;
  } catch {
    return false;
  }
}

// Whether the agent whose transcript is `f` runs at `maintenant`: its transcript moved in the last
// 2 minutes; a sub-agent (`sousAgent`) runs also while its last tool call awaits its answer, its
// transcript having moved in the last 30 minutes. The board and the catch-up of the register share
// this definition.
export function tourne(f, maintenant, sousAgent) {
  const age = maintenant - statSync(f).mtimeMs;
  return age < RECENT || (sousAgent && age <= SANS_AGENT && appelEnAttente(f));
}

// A sub-agent's meta file (next to its transcript `f`), or {}.
const metaDe = f => {
  try {
    return JSON.parse(readFileSync(f.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
  } catch {
    return {};
  }
};

// The ticket a sub-agent takes from the site manager that launched it: the ticket its prompt names,
// read from the manager's transcript in the same folder; null when its parent is not a site manager
// (by its spawned role) or names no ticket. With `depuis`, a manager whose transcript has not moved
// since that time (ms) is not read. `lire` reads a transcript (the board passes its cached reader).
export function ticketDuChef(f, depuis = -Infinity, lire = lecteur({})) {
  const parent = metaDe(f).parentAgentId;
  if (!parent) {
    return null;
  }
  const g = path.join(path.dirname(f), `agent-${parent}.jsonl`);
  if (roleDuMeta(metaDe(g)) !== CHEF) {
    return null;
  }
  try {
    if (statSync(g).mtimeMs < depuis) {
      return null;
    }
    return lire(g)?.ticket ?? null;
  } catch {
    return null;
  }
}

// The agents running now, each with its measures so far. `ps` is the process list
// (`pid etimes args` per line); `cache` keeps the readings of unchanged transcripts.
export function lireVivant({ racine, home, prefix, maintenant, ps, cache = {} }) {
  const lire = lecteur(cache);
  const vivants = [];
  const limite = maintenant - SANS_AGENT;
  const projets = path.join(home, '.claude', 'projects');
  const motif = new RegExp(`TON TICKET : (${prefix}-[A-Za-z0-9]+(?:\\.[0-9]+)*)`);
  const vus = new Set();
  for (const ligne of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(ligne);
    const t = m && motif.exec(m[3]);
    const role = m && /--agent[= ](\S+)/.exec(m[3]);
    if (!t || !role || vus.has(t[1])) {
      continue;
    }
    vus.add(t[1]);
    const copie = path.join(racine, '.claude', 'worktrees', t[1]);
    const dernier = fichiers(path.join(projets, enTirets(copie)), '.jsonl')
      .map(f => ({ f, mtime: statSync(f).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0];
    const lu = dernier && dernier.mtime >= limite ? lire(dernier.f) : null;
    vivants.push({
      agent: dernier ? path.basename(dernier.f, '.jsonl') : `pid-${m[1]}`,
      ticket: t[1],
      role: role[1],
      ligne: true,
      depuis: maintenant - Number(m[2]) * 1000,
      silence: dernier ? maintenant - dernier.mtime : null,
      entre: lu?.entre ?? null,
      jetons: lu?.jetons ?? 0,
      travail: lu?.travail ?? 0,
      tours: lu?.tours ?? [],
    });
  }
  const propre = path.join(projets, enTirets(racine));
  for (const f of fichiers(propre, '.jsonl').filter(g => tourne(g, maintenant, false))) {
    const lu = lire(f);
    if (lu) {
      vivants.push({
        agent: path.basename(f, '.jsonl'),
        ticket: null,
        role: null,
        ligne: false,
        depuis: lu.premier ?? maintenant,
        entre: lu.entre,
        jetons: lu.jetons,
        travail: lu.travail,
        tours: lu.tours,
      });
    }
  }
  const sessions = existsSync(propre)
    ? readdirSync(propre, { withFileTypes: true }).filter(e => e.isDirectory())
    : [];
  for (const s of sessions) {
    const dossier = path.join(propre, s.name, 'subagents');
    for (const f of fichiers(dossier, '.jsonl').filter(g => tourne(g, maintenant, true))) {
      const lu = lire(f);
      if (!lu) {
        continue;
      }
      const meta = metaDe(f);
      vivants.push({
        agent: path.basename(f, '.jsonl').replace(/^agent-/, ''),
        ticket: lu.ticket ?? ticketDuChef(f, limite, lire),
        role: roleDuMeta(meta),
        ligne: false,
        depuis: lu.premier ?? maintenant,
        entre: lu.entre,
        jetons: lu.jetons,
        travail: lu.travail,
        tours: lu.tours,
      });
    }
  }
  return vivants;
}

// The reviewer's last verdict among a ticket's comments, or null.
export function verdict(commentaires) {
  let v = null;
  for (const c of [...commentaires].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
  )) {
    const m = /^\s*(ACCEPTÉ|RENDU)/.exec(c.text ?? '');
    if (m) {
      v = { verdict: m[1], date: Date.parse(c.created_at) };
    }
  }
  return v;
}

// The role a ticket waits for, from the roles of the flow that ran on it (finished, oldest first)
// and the reviewer's last verdict; null when it waits for none.
export function etape(passages, v) {
  const faits = passages.filter(
    p => ROLES.includes(p.role) && p.role !== 'arbitre' && p.role !== CHEF
  );
  const dernier = faits[faits.length - 1];
  if (!dernier) {
    return 'testeur';
  }
  const fin = Date.parse(dernier.fin);
  const jugé = v && v.date >= fin ? v.verdict : null;
  if (dernier.role === 'testeur') {
    return 'developpeur';
  }
  if (dernier.role === 'developpeur') {
    return jugé === 'ACCEPTÉ' ? 'integrateur' : jugé === 'RENDU' ? 'developpeur' : 'relecteur';
  }
  if (dernier.role === 'relecteur') {
    return v?.verdict === 'ACCEPTÉ' ? 'integrateur' : 'developpeur';
  }
  if (dernier.role === 'integrateur') {
    return 'developpeur';
  }
  return null;
}

// A ticket's number, subject and component: its title « number — subject — component » when
// the number ends its id, else its id without the prefix and its whole title.
export function lecture(t, prefix) {
  const brut =
    prefix && t.id.startsWith(`${prefix}-`)
      ? t.id.slice(prefix.length + 1)
      : t.id.slice(t.id.indexOf('-') + 1);
  const parts = (t.title ?? '').split(' — ');
  if (parts.length >= 2 && (brut === parts[0] || brut.endsWith(`.${parts[0]}`))) {
    return parts.length >= 3
      ? {
          numero: parts[0],
          sujet: parts.slice(1, -1).join(' — '),
          composant: parts[parts.length - 1],
        }
      : { numero: parts[0], sujet: parts[1], composant: '' };
  }
  return { numero: brut, sujet: t.title ?? t.id, composant: '' };
}

// The board, from what was read. Pure: every source comes in, the time included.
export function assembler({
  tous,
  prefix = '',
  registre: lignesDuRegistre,
  vivants,
  verdicts = {},
  roles = ROLES,
  maintenant,
  jour,
}) {
  const registre = parAgent(lignesDuRegistre);
  // A living agent runs without an end in the register, or when an incoming message follows its
  // latest end strictly; the writings of its last turn after that end leave it finished. A running
  // agent's transcript holds its sessions already in the register.
  const fins = new Map(registre.map(r => [r.agent, Date.parse(r.fin)]));
  const enCoursMesures = vivants.filter(
    v => !fins.has(v.agent) || (v.entre ?? -Infinity) > fins.get(v.agent)
  );
  const repris = new Set(enCoursMesures.map(v => v.agent));
  const finis = registre.filter(r => !repris.has(r.agent));
  const parId = new Map(tous.map(t => [t.id, t]));
  const lu = new Map(tous.map(t => [t.id, lecture(t, prefix)]));
  const numero = id => lu.get(id)?.numero ?? id;
  const titre = t => lu.get(t.id);
  const ouvert = id => parId.has(id) && parId.get(id).status !== 'closed';
  // Ready: open, every ticket that blocks it closed (Beads' own rule, without a second call).
  const blocages = t =>
    (t.dependencies ?? []).filter(d => d.type === 'blocks' && ouvert(d.depends_on_id));
  const prets = tous.filter(t => t.status === 'open' && blocages(t).length === 0);
  const aValider = tous.filter(
    t => t.status !== 'closed' && (t.labels ?? []).includes('a-valider')
  );
  const nuit = tous.filter(t => t.status !== 'closed' && (t.labels ?? []).includes('nuit'));
  const enfants = new Map();
  for (const t of tous) {
    if (t.parent && parId.has(t.parent)) {
      (enfants.get(t.parent) ?? enfants.set(t.parent, []).get(t.parent)).push(t);
    }
  }
  const ordre = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });
  for (const l of enfants.values()) {
    l.sort(ordre);
  }
  const actifs = new Set(enCoursMesures.map(v => v.ticket).filter(Boolean));
  // A ticket is work unless it is an epic or a mother; a ticket an agent holds stays work, its
  // discoveries under it notwithstanding.
  const travail = t =>
    t.issue_type !== 'epic' &&
    (!enfants.has(t.id) || t.status === 'in_progress' || actifs.has(t.id));
  const pret = new Set(prets.map(t => t.id));
  const avalider = new Set(aValider.map(t => t.id));
  const bloquePar = t => blocages(t).map(d => numero(d.depends_on_id));
  const etat = t => {
    if (t.status === 'closed') {
      return 'fermes';
    }
    if (t.status === 'in_progress' || actifs.has(t.id)) {
      return 'enCours';
    }
    if (t.status === 'deferred') {
      return 'reportes';
    }
    if (avalider.has(t.id)) {
      return 'aValider';
    }
    if (pret.has(t.id)) {
      return 'prets';
    }
    return 'bloques';
  };

  // Global.
  const compteurs = { enCours: 0, prets: 0, bloques: 0, aValider: 0, reportes: 0, fermes: 0 };
  for (const t of tous) {
    if (travail(t)) {
      compteurs[etat(t)]++;
    }
  }
  const mesures = [
    ...finis.map(r => ({ ...r, quand: Date.parse(r.fin) })),
    ...enCoursMesures.map(v => ({ ...v, quand: maintenant })),
  ];
  const somme = l => ({
    travail: l.reduce((s, x) => s + (x.travail ?? 0), 0),
    jetons: l.reduce((s, x) => s + (x.jetons ?? 0), 0),
  });
  // A measure with its turns counts in the day the parts since midnight of their union; a register
  // line written without them counts whole in the day it ended.
  const partDuJour = tours =>
    reunir(tours).reduce((s, [debut, fin]) => s + Math.max(0, fin - Math.max(debut, jour)), 0);
  const duJour = mesures
    .filter(m => m.quand >= jour)
    .map(m => (m.tours ? { ...m, travail: partDuJour(m.tours) } : m));
  const global = { compteurs, jour: somme(duJour), cumul: somme(mesures) };

  // Chantiers.
  const sous = t => [t, ...(enfants.get(t.id) ?? []).flatMap(sous)];
  const mesure = ids => somme(mesures.filter(m => ids.has(m.ticket)));
  // A ticket's duration: claimed → closed, or now.
  const dureeDe = t =>
    t.started_at
      ? (t.closed_at ? Date.parse(t.closed_at) : maintenant) - Date.parse(t.started_at)
      : 0;
  const noeud = t => {
    const liste = sous(t).filter(travail);
    const faits = liste.filter(x => x.status === 'closed').length;
    const e = travail(t)
      ? etat(t)
      : t.status === 'in_progress' || liste.some(x => etat(x) === 'enCours')
        ? 'enCours'
        : faits === liste.length
          ? 'fermes'
          : bloquePar(t).length
            ? 'bloques'
            : 'prets';
    return {
      id: t.id,
      ...titre(t),
      mere: !travail(t),
      etat: e,
      faits,
      total: liste.length,
      bloquePar: bloquePar(t),
      duree: dureeDe(t),
      ...mesure(new Set(sous(t).map(x => x.id))),
      enfants: ouverts(t).map(noeud),
    };
  };
  // The tree holds open tickets only: a closed child leaves it, and a closed mother gives her place
  // to her open descendants, at her level, in her order.
  const ouverts = t =>
    (enfants.get(t.id) ?? []).flatMap(x => (x.status === 'closed' ? ouverts(x) : [x]));
  const racines = tous
    .filter(t => t.issue_type === 'epic' && !t.parent && t.status !== 'closed')
    .sort((a, b) => a.priority - b.priority || ordre(a, b));
  const chantiers = [];
  const autres = [];
  for (const r of racines) {
    const n = noeud(r);
    if (n.etat === 'enCours') {
      chantiers.push(n);
    } else {
      autres.push({ id: n.id, numero: n.numero, sujet: n.sujet, faits: n.faits, total: n.total });
    }
  }

  // Agents.
  const passages = new Map();
  for (const r of [...registre].sort((a, b) => Date.parse(a.fin) - Date.parse(b.fin))) {
    if (r.ticket) {
      (passages.get(r.ticket) ?? passages.set(r.ticket, []).get(r.ticket)).push(r);
    }
  }
  // The site manager heads the blocks as 0; the other roles follow from 1 in their declared order.
  const avecChef = roles.includes(CHEF);
  const ordreDesBlocs = avecChef ? [CHEF, ...roles.filter(r => r !== CHEF)] : roles;
  const blocs = ordreDesBlocs.map((role, i) => ({
    numero: avecChef ? i : i + 1,
    role,
    nom: NOMS[role] ?? role,
    enCours: [],
    attend: [],
  }));
  const bloc = role => blocs.find(b => b.role === role);
  const places = new Set();
  // One line per ticket: a ticket on which a role of the flow runs stands under that role, and
  // under the site manager only while none of its agents runs.
  const auTravail = new Set(
    enCoursMesures.filter(v => v.role !== CHEF && bloc(v.role)).map(v => v.ticket)
  );
  for (const v of enCoursMesures) {
    const t = v.ticket && parId.get(v.ticket);
    if (!t || !bloc(v.role) || (v.role === CHEF && auTravail.has(v.ticket))) {
      continue;
    }
    places.add(t.id);
    bloc(v.role).enCours.push({
      id: t.id,
      numero: numero(t.id),
      sujet: titre(t).sujet,
      composant: titre(t).composant,
      ligne: v.ligne,
      depuis: v.depuis,
      silence: v.silence ?? null,
      ...mesure(new Set([t.id])),
    });
  }
  for (const t of [...tous].sort(ordre)) {
    if (
      !travail(t) ||
      places.has(t.id) ||
      t.status === 'closed' ||
      t.status === 'deferred' ||
      avalider.has(t.id)
    ) {
      continue;
    }
    const p = passages.get(t.id) ?? [];
    if (p.length === 0 && !pret.has(t.id)) {
      continue;
    }
    // A ticket a site manager led waits for it; the flow's deduction serves the other tickets.
    const r = avecChef && p.some(x => x.role === CHEF) ? CHEF : etape(p, verdicts[t.id] ?? null);
    if (r && bloc(r)) {
      bloc(r).attend.push({
        id: t.id,
        numero: numero(t.id),
        sujet: titre(t).sujet,
        duree: dureeDe(t),
        ...mesure(new Set([t.id])),
      });
    }
  }
  const debutJour = jour;
  const faitsDuJour = tous
    .filter(t => travail(t) && t.closed_at && Date.parse(t.closed_at) >= debutJour)
    .sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at))
    .map(t => ({
      id: t.id,
      numero: numero(t.id),
      sujet: titre(t).sujet,
      duree: dureeDe(t),
      ...mesure(new Set([t.id])),
    }));

  // Alerts.
  const alertes = [];
  for (const t of nuit) {
    const { sujet, numero: n } = titre(t);
    alertes.push({ niveau: 'rouge', texte: `${sujet} ${n}`, sujet, numero: n });
  }
  if (aValider.length) {
    alertes.push({
      niveau: 'decision',
      texte: `${aValider.length} ticket(s) attendent ta décision`,
    });
  }
  for (const b of blocs) {
    for (const x of b.enCours) {
      if (x.ligne && x.silence !== null && x.silence > SILENCE) {
        alertes.push({
          niveau: 'orange',
          texte: `${x.numero}, agent ${b.numero} silencieux depuis ${Math.round(x.silence / MINUTE)} min`,
        });
      }
    }
  }
  for (const t of tous) {
    if (
      travail(t) &&
      t.status === 'in_progress' &&
      !actifs.has(t.id) &&
      t.started_at &&
      maintenant - Date.parse(t.started_at) > SANS_AGENT
    ) {
      alertes.push({ niveau: 'orange', texte: `${numero(t.id)} en cours sans rien qui tourne` });
    }
  }
  return { global, alertes, chantiers, autres, agents: blocs, faitsDuJour };
}

export const k = n =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1).replace('.', ',')} M`
    : n >= 1e3
      ? `${Math.round(n / 1e3)} k`
      : `${n}`;
export const duree = ms => {
  const min = Math.round(ms / MINUTE);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
};

// A line of `largeur` columns: the left part cut to leave the right part whole.
const couper = (gauche, droite, largeur) => {
  if (!droite) {
    return gauche.length > largeur ? `${gauche.slice(0, largeur - 1)}…` : gauche;
  }
  const place = largeur - droite.length - 1;
  const g =
    gauche.length > place ? `${gauche.slice(0, Math.max(place - 1, 0))}…` : gauche.padEnd(place);
  return `${g} ${droite}`;
};
// The board's lines, `largeur` columns wide, each with its tone (titre, alerte, attention, actif,
// discret, or none), its section (`section`: agents, chantier or faits, in that order) and, for a
// ticket's line, its id (`ticket`), which the pane makes selectable; an epic's line is marked
// `chantier`. The head belongs to agents, the first section; a blank line belongs to the section
// of the title after it. A line that counts lines it does not show (« + 2 prêts ») carries them
// (`replie`), which the pane unfolds when the person reaches it; a folded line carries the section
// of the line that folds it. The pane and the text show the same lines.
export function lignes(t, nom, largeur = LARGEUR) {
  const out = [];
  let section = 'agents';
  // Each line laid down takes the current section, its folded lines at any depth with it.
  const marquer = l => ({ ...l, section, ...(l.replie ? { replie: l.replie.map(marquer) } : {}) });
  const poser = (...l) => out.push(...l.map(marquer));
  const cadre = couper;
  const L = (texte, ton, ticket) => poser(ticket ? { texte, ton, ticket } : { texte, ton });
  // A line that counts the lines it folds, and carries them.
  const replie = (texte, caches) => poser({ texte, ton: 'discret', replie: caches });
  const g = t.global;
  const c = g.compteurs;
  L(nom.toUpperCase(), 'titre');
  L(
    cadre(
      `▶ ${c.enCours} en cours · ${c.prets} prêts · ${c.bloques} bloqués · ${c.fermes} faits`,
      '',
      largeur
    )
  );
  L(
    cadre(
      `jour ${duree(g.jour.travail)} · ${k(g.jour.jetons)} · cumul ${duree(g.cumul.travail)} · ${k(g.cumul.jetons)}`,
      '',
      largeur
    ),
    'discret'
  );
  for (const a of t.alertes) {
    L(
      a.numero ? cadre(`⚠ ${a.sujet}`, a.numero, largeur) : cadre(`⚠ ${a.texte}`, '', largeur),
      a.niveau === 'rouge' ? 'alerte' : 'attention'
    );
  }

  L('', undefined);
  L('AGENTS  ▶ en cours · en attente', 'titre');
  for (const b of t.agents) {
    const vide = b.enCours.length === 0 && b.attend.length === 0;
    L(`${b.numero} ${b.nom}${vide ? '  —' : ''}`, vide ? 'discret' : 'titre');
    for (const x of b.enCours) {
      L(
        cadre(`▶ ${x.numero}  ${x.sujet}`, `${duree(x.travail)} · ${k(x.jetons)}`, largeur),
        'actif',
        x.id
      );
    }
    const attente = x => ({
      texte: cadre(`· ${x.numero}  ${x.sujet}`, `${duree(x.duree)} · ${k(x.jetons)}`, largeur),
      ton: 'discret',
      ticket: x.id,
    });
    poser(...b.attend.map(attente));
  }

  section = 'chantier';
  // The tickets the agents' blocks show: the chantier's tree does not show them a second time.
  const dansAgents = new Set(t.agents.flatMap(b => [...b.enCours, ...b.attend].map(x => x.id)));
  for (const ch of t.chantiers) {
    L('', undefined);
    poser({
      texte: cadre(`CHANTIER ${ch.numero} — ${ch.sujet}`, '', largeur),
      ton: 'titre',
      ticket: ch.id,
      chantier: true,
    });
    L(
      cadre(
        `  ${ch.faits}/${ch.total} faits · ${duree(ch.travail)} · ${k(ch.jetons)} jetons`,
        '',
        largeur
      ),
      'discret'
    );
    const arbre = [];
    const marque = n =>
      n.etat === 'enCours'
        ? '▶'
        : n.etat === 'bloques' && n.bloquePar.length
          ? `⏸ ${n.bloquePar.join(', ')}`
          : n.etat === 'aValider'
            ? '? à valider'
            : n.etat === 'reportes'
              ? 'reporté'
              : n.etat === 'fermes'
                ? '✓'
                : '';
    // A level shows its mothers, its tickets in progress or awaiting the responsable that no agent
    // block shows, and one line counting its other open tickets. A ticket with children unfolds
    // them while work runs there; one an agent block shows lets its children take its place.
    const ligneDe = (n, p) => {
      const conso = n.jetons ? ` · ${k(n.jetons)}` : '';
      const droite = n.mere
        ? `${n.faits}/${n.total}${conso}${n.etat === 'fermes' ? ' ✓' : marque(n) ? ` ${marque(n)}` : ''}`
        : n.etat === 'enCours'
          ? `${duree(n.duree)}${conso} ▶`
          : marque(n);
      return {
        texte: cadre(`${' '.repeat(p)}${n.numero}  ${n.sujet}`, droite, largeur),
        ton: n.etat === 'enCours' ? 'actif' : n.etat === 'fermes' ? 'discret' : undefined,
        ticket: n.id,
      };
    };
    const parcourir = (noeuds, p) => {
      const reste = { prets: 0, bloques: 0, reportes: 0 };
      const caches = [];
      for (const n of noeuds) {
        const deplie = n.enfants.length > 0 && n.etat === 'enCours';
        if (!n.mere && dansAgents.has(n.id)) {
          if (deplie) {
            parcourir(n.enfants, p);
          }
          continue;
        }
        const visible = n.mere || n.etat === 'enCours' || n.etat === 'aValider';
        if (!visible) {
          if (n.etat in reste) {
            reste[n.etat]++;
            caches.push(ligneDe(n, p));
          }
          continue;
        }
        arbre.push(ligneDe(n, p));
        if (deplie) {
          parcourir(n.enfants, p + 1);
        }
      }
      const r = [
        reste.prets && `${reste.prets} prêts`,
        reste.bloques && `${reste.bloques} bloqués`,
        reste.reportes && `${reste.reportes} reportés`,
      ].filter(Boolean);
      if (r.length) {
        arbre.push({
          texte: cadre(`${' '.repeat(p)}+ ${r.join(' · ')}`, '', largeur),
          ton: 'discret',
          replie: caches,
        });
      }
    };
    parcourir(ch.enfants, 1);
    poser(...arbre);
  }
  // The epics not in progress, folded in one line: « N chantiers » when none is, else
  // « + N autres chantiers ». Each is selectable, and a chantier (`chantier`) the pane can switch.
  if (t.autres.length) {
    const n = t.autres.length;
    if (!t.chantiers.length) {
      L('', undefined);
    }
    replie(
      t.chantiers.length
        ? `+ ${n} autre${n > 1 ? 's' : ''} chantier${n > 1 ? 's' : ''}`
        : `${n} chantier${n > 1 ? 's' : ''}`,
      t.autres.map(a => ({
        texte: cadre(`${a.numero}  ${a.sujet}`, `${a.faits}/${a.total}`, largeur),
        ton: 'discret',
        ticket: a.id,
        chantier: true,
      }))
    );
  }

  if (t.faitsDuJour.length) {
    section = 'faits';
    L('', undefined);
    // The title carries the day's total: tickets, working time and tokens of the facts below.
    const n = t.faitsDuJour.length;
    const temps = t.faitsDuJour.reduce((s, x) => s + x.duree, 0);
    const jetons = t.faitsDuJour.reduce((s, x) => s + x.jetons, 0);
    L(
      cadre(
        "FAITS AUJOURD'HUI",
        `${n} ticket${n > 1 ? 's' : ''} · ${duree(temps)} · ${k(jetons)}`,
        largeur
      ),
      'titre'
    );
    const fait = x => ({
      texte: cadre(`✓ ${x.numero}  ${x.sujet}`, `${duree(x.duree)} · ${k(x.jetons)}`, largeur),
      ton: 'discret',
      ticket: x.id,
    });
    poser(...t.faitsDuJour.map(fait));
  }
  return out;
}

// The lines of the board, the folded ones included.
const toutes = lignesDuTableau => lignesDuTableau.flatMap(l => [l, ...toutes(l.replie ?? [])]);

// The card of each ticket a line names, folded or not: its number, whole title, component, state,
// duration, agents' tokens (`jetons`: ticket → tokens), the start of its description (`resume`)
// and the whole description (`texte`), which the pane shows for the line chosen.
export function fiches(tous, lignesDuTableau, prefix = '', jetons = {}, maintenant = Date.now()) {
  const ids = new Set(
    toutes(lignesDuTableau)
      .map(l => l.ticket)
      .filter(Boolean)
  );
  const out = {};
  for (const t of tous) {
    if (!ids.has(t.id)) {
      continue;
    }
    const resume = (t.description ?? '')
      .split('\n')
      .map(x => x.trim())
      .filter(x => x && !x.startsWith('#'))
      .join(' ');
    out[t.id] = {
      numero: lecture(t, prefix).numero,
      titre: lecture(t, prefix).sujet,
      composant: lecture(t, prefix).composant,
      statut: t.status,
      duree: t.started_at
        ? (t.closed_at ? Date.parse(t.closed_at) : maintenant) - Date.parse(t.started_at)
        : 0,
      jetons: jetons[t.id] ?? 0,
      resume: resume.length > 400 ? `${resume.slice(0, 399)}…` : resume,
      texte: (t.description ?? '').trim(),
    };
  }
  return out;
}

// Of the tickets the lines name, the one that moved last: a running agent's ticket at its last
// activity, any other at its last update; null when none.
export function dernierBouge(tous, lignesDuTableau, vivants = [], maintenant = Date.now()) {
  const ids = new Set(
    toutes(lignesDuTableau)
      .map(l => l.ticket)
      .filter(Boolean)
  );
  const actif = new Map();
  for (const v of vivants) {
    if (v.ticket) {
      const quand = maintenant - (v.silence ?? 0);
      actif.set(v.ticket, Math.max(actif.get(v.ticket) ?? 0, quand));
    }
  }
  let dernier = null;
  let plusTard = -Infinity;
  for (const t of tous) {
    if (!ids.has(t.id)) {
      continue;
    }
    const quand = Math.max(
      actif.get(t.id) ?? -Infinity,
      Date.parse(t.updated_at ?? t.closed_at ?? t.created_at ?? '') || -Infinity
    );
    if (quand > plusTard) {
      plusTard = quand;
      dernier = t.id;
    }
  }
  return dernier;
}

// The status line: the chantier in progress, alerts first.
export function ligneEtat(t) {
  const alerte = t.alertes.length ? `⚠ ${t.alertes.length} · ` : '';
  const ch = t.chantiers[0];
  const c = t.global.compteurs;
  if (!ch) {
    return `${alerte}Grillhouse : ${c.enCours} en cours · ${c.prets} prêts · ${c.fermes} faits`;
  }
  return `${alerte}${ch.numero} ${ch.faits}/${ch.total} · ▶ ${c.enCours} en cours · ${k(t.global.jour.jetons)} aujourd'hui`;
}

const bdJson = (racine, ...args) => {
  try {
    return JSON.parse(
      execFileSync('bd', [...args, '--json'], {
        cwd: racine,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 1 << 28,
      })
    );
  } catch {
    return [];
  }
};

// The board of the repository at <racine>.
export function tableau(racine, { home = os.homedir(), maintenant = Date.now() } = {}) {
  let prefix = '';
  try {
    prefix = execFileSync('bd', ['config', 'get', 'issue_prefix'], {
      cwd: racine,
      encoding: 'utf8',
    }).trim();
  } catch {
    prefix = '';
  }
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'));
  } catch {
    pkg = {};
  }
  let ps = '';
  try {
    ps = execFileSync('ps', ['-eo', 'pid=,etimes=,args='], { encoding: 'utf8' });
  } catch {
    ps = '';
  }
  const fichierRegistre =
    process.env.GRILLHOUSE_REGISTRE ?? path.join(home, '.claude', 'grillhouse', 'registre.jsonl');
  const registre = existsSync(fichierRegistre)
    ? lireRegistre(readFileSync(fichierRegistre, 'utf8'), racine)
    : [];
  const tous = bdJson(racine, 'list', '--all', '--limit', '0');
  // The reviewer's verdict matters once a developer or a reviewer ran: only those tickets are read.
  const dernier = {};
  for (const r of [...registre].sort((x, y) => Date.parse(x.fin) - Date.parse(y.fin))) {
    if (r.ticket && r.role !== 'arbitre' && r.role !== CHEF) {
      dernier[r.ticket] = r.role;
    }
  }
  const verdicts = {};
  for (const t of tous) {
    if (t.status === 'closed' || !['developpeur', 'relecteur'].includes(dernier[t.id])) {
      continue;
    }
    const v = verdict(bdJson(racine, 'comments', t.id));
    if (v) {
      verdicts[t.id] = v;
    }
  }
  let commun = null;
  try {
    commun = execFileSync(
      'git',
      ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8' }
    ).trim();
  } catch {
    commun = null;
  }
  const fichierCache = commun && path.join(commun, 'tableau-cache.json');
  let cache = {};
  try {
    cache = JSON.parse(readFileSync(fichierCache, 'utf8'));
  } catch {
    cache = {};
  }
  const vivants = lireVivant({
    racine,
    home,
    prefix: prefix || '[A-Za-z0-9_]+',
    maintenant,
    ps,
    cache,
  });
  try {
    if (fichierCache) {
      writeFileSync(
        fichierCache,
        JSON.stringify(Object.fromEntries(Object.entries(cache).filter(([f]) => existsSync(f))))
      );
    }
  } catch {
    // A read-only place keeps the board working, without its cache.
  }
  const minuit = new Date(maintenant);
  minuit.setHours(0, 0, 0, 0);
  const t = assembler({
    tous,
    prefix,
    registre,
    vivants,
    verdicts,
    roles: pkg.grillhouse?.roles ?? ROLES,
    maintenant,
    jour: minuit.getTime(),
  });
  // The project is named by its repository's folder, as a shell prompt names it.
  const nom = path.basename(racine);
  const l = lignes(t, nom);
  const parTicket = {};
  for (const r of registre) {
    if (r.ticket) {
      parTicket[r.ticket] = (parTicket[r.ticket] ?? 0) + (r.jetons ?? 0);
    }
  }
  const etat = ligneEtat(t);
  try {
    if (commun) {
      writeFileSync(path.join(commun, 'grillhouse-etat.txt'), `${etat}\n`);
    }
  } catch {
    // A read-only place keeps the board working, without its status line.
  }
  return {
    ...t,
    lignes: l,
    fiches: fiches(tous, l, prefix, parTicket, maintenant),
    dernier: dernierBouge(tous, l, vivants, maintenant),
    etat,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const t = tableau(process.cwd());
  process.stdout.write(
    process.argv.includes('--texte')
      ? `${t.lignes.map(l => l.texte).join('\n')}\n`
      : JSON.stringify(t)
  );
}
