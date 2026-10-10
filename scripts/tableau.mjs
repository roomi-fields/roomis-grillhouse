#!/usr/bin/env node
// The board of a project, on three levels, measured on Beads, the register of finished agents,
// the transcripts of running ones and the running processes — never on what an agent declares.
// The Grillhouse mod shows its lines; `npm run tableau` prints them.
//
//   node scripts/tableau.mjs            the board, as JSON (with its lines, 52 columns wide)
//   node scripts/tableau.mjs --texte    the board, as text
//
// - Global: the work tickets of the project (a ticket without children; a mother is a grouping)
//   by state, the agents' working time and tokens of the day and in all, the alerts.
// - Chantier: a root epic with work in progress, its tree of mothers, each with its work tickets
//   done over all; a finished mother folds into one line, a finished ticket counts without a
//   line; past 30 lines, the open tickets by number replace the tree. The other chantiers, one
//   line each.
// - Agents: one block per role, numbered in the order of the flow (`grillhouse.roles` in
//   package.json replaces the default), for the whole project. A ticket stands in one place:
//   in progress under the role that runs on it, or waiting for the next role, deduced from the
//   roles that ran on it and the reviewer's last verdict (`ACCEPTÉ` or `RENDU` at the start of a
//   comment). Then the tickets closed today.
// - Measures: a finished agent from the register (`scripts/registre.mjs`), a running one from its
//   transcript: a role agent launched in a shell (`TON TICKET` and `--agent` in its arguments,
//   marked ⌁), a sub-agent or a session whose transcript moved in the last 2 minutes.
// - Alerts: a red night, tickets awaiting the responsable, a shell agent silent for 10 minutes,
//   a ticket in progress without anything running for 30 minutes.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MINUTE = 60_000;
export const SILENCE = 10 * MINUTE;
export const SANS_AGENT = 30 * MINUTE;
const RECENT = 2 * MINUTE;
export const LARGEUR = 52;
const ARBRE_MAX = 30;
export const ROLES = [
  'explorateur',
  'arbitre',
  'testeur',
  'developpeur',
  'relecteur',
  'integrateur',
];
const NOMS = { developpeur: 'développeur', integrateur: 'intégrateur' };
const enTirets = p => p.replace(/[^A-Za-z0-9]/g, '-');

// The tokens, the working span, the ticket, the role (a session launched with `--agent`) and the
// cost (the total a session writes) of a transcript's lines (one JSON object per line).
export function lireTranscription(texte) {
  let jetons = 0;
  let cache = 0;
  let premier = null;
  let dernier = null;
  let ticket = null;
  let role = null;
  let cout = null;
  const vus = new Set();
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
      role ??= e.agentSetting ?? null;
    }
    if (e.type === 'cost-state' && typeof e.totalCostUSD === 'number') {
      cout = e.totalCostUSD;
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
    if (!u || (id && vus.has(id))) {
      continue;
    }
    if (id) {
      vus.add(id);
    }
    jetons += (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    cache += u.cache_read_input_tokens ?? 0;
  }
  return {
    jetons,
    cache,
    travail: premier !== null ? dernier - premier : 0,
    premier,
    dernier,
    ticket: ticket || null,
    role,
    cout,
  };
}

// The register's lines of this project.
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
  return out;
}

// A transcript read again only when it changed: `cache` maps a file to its size, time and reading.
const lecteur = cache => f => {
  try {
    const st = statSync(f);
    const cle = `${st.size}:${st.mtimeMs}`;
    if (cache[f]?.cle !== cle) {
      cache[f] = { cle, lu: lireTranscription(readFileSync(f, 'utf8')) };
    }
    return cache[f].lu;
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

// The agents running now, each with its measures so far. `ps` is the process list
// (`pid etimes args` per line); `cache` keeps the readings of unchanged transcripts.
export function lireVivant({ racine, home, prefix, maintenant, ps, cache = {} }) {
  const lire = lecteur(cache);
  const vivants = [];
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
    const lu = dernier ? lire(dernier.f) : null;
    vivants.push({
      agent: dernier ? path.basename(dernier.f, '.jsonl') : `pid-${m[1]}`,
      ticket: t[1],
      role: role[1],
      ligne: true,
      depuis: maintenant - Number(m[2]) * 1000,
      silence: dernier ? maintenant - dernier.mtime : null,
      jetons: lu?.jetons ?? 0,
      travail: lu?.travail ?? 0,
    });
  }
  const propre = path.join(projets, enTirets(racine));
  const recent = f => maintenant - statSync(f).mtimeMs < RECENT;
  for (const f of fichiers(propre, '.jsonl').filter(recent)) {
    const lu = lire(f);
    if (lu) {
      vivants.push({
        agent: path.basename(f, '.jsonl'),
        ticket: null,
        role: null,
        ligne: false,
        depuis: lu.premier ?? maintenant,
        jetons: lu.jetons,
        travail: lu.travail,
      });
    }
  }
  const sessions = existsSync(propre)
    ? readdirSync(propre, { withFileTypes: true }).filter(e => e.isDirectory())
    : [];
  for (const s of sessions) {
    for (const f of fichiers(path.join(propre, s.name, 'subagents'), '.jsonl').filter(recent)) {
      const lu = lire(f);
      if (!lu) {
        continue;
      }
      let role = null;
      try {
        role =
          JSON.parse(readFileSync(f.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType ?? null;
      } catch {
        role = null;
      }
      vivants.push({
        agent: path.basename(f, '.jsonl').replace(/^agent-/, ''),
        ticket: lu.ticket,
        role,
        ligne: false,
        depuis: lu.premier ?? maintenant,
        jetons: lu.jetons,
        travail: lu.travail,
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

// The role a ticket waits for, from the roles that ran on it (finished, oldest first) and the
// reviewer's last verdict; null when it waits for none.
export function etape(passages, v) {
  const faits = passages.filter(p => p.role && p.role !== 'arbitre');
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
  registre,
  vivants,
  verdicts = {},
  roles = ROLES,
  maintenant,
  jour,
}) {
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
  const travail = t => t.issue_type !== 'epic' && !enfants.has(t.id);
  const pret = new Set(prets.map(t => t.id));
  const avalider = new Set(aValider.map(t => t.id));
  const actifs = new Set(vivants.map(v => v.ticket).filter(Boolean));
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
  const finis = new Set(registre.map(r => r.agent));
  const enCoursMesures = vivants.filter(v => !finis.has(v.agent));
  const mesures = [
    ...registre.map(r => ({ ...r, quand: Date.parse(r.fin) })),
    ...enCoursMesures.map(v => ({ ...v, quand: maintenant, court: true })),
  ];
  const somme = l => ({
    travail: l.reduce((s, x) => s + (x.travail ?? 0), 0),
    jetons: l.reduce((s, x) => s + (x.jetons ?? 0), 0),
  });
  // A running session counts in the day only for its part since midnight.
  const duJour = mesures
    .filter(m => m.quand >= jour)
    .map(m => (m.court ? { ...m, travail: Math.min(m.travail, maintenant - jour) } : m));
  const global = { compteurs, jour: somme(duJour), cumul: somme(mesures) };

  // Chantiers.
  const sous = t => [t, ...(enfants.get(t.id) ?? []).flatMap(sous)];
  const noeud = t => {
    const liste = sous(t).filter(travail);
    const faits = liste.filter(x => x.status === 'closed').length;
    const e = travail(t)
      ? etat(t)
      : liste.some(x => etat(x) === 'enCours')
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
      enfants: (enfants.get(t.id) ?? []).map(noeud),
    };
  };
  const mesure = ids => somme(mesures.filter(m => ids.has(m.ticket)));
  const racines = tous
    .filter(t => t.issue_type === 'epic' && !t.parent && t.status !== 'closed')
    .sort((a, b) => a.priority - b.priority || ordre(a, b));
  const chantiers = [];
  const autres = [];
  for (const r of racines) {
    const n = noeud(r);
    if (n.etat === 'enCours') {
      chantiers.push({ ...n, ...mesure(new Set(sous(r).map(x => x.id))) });
    } else {
      autres.push({ id: n.id, numero: n.numero, faits: n.faits, total: n.total });
    }
  }

  // Agents.
  const passages = new Map();
  for (const r of [...registre].sort((a, b) => Date.parse(a.fin) - Date.parse(b.fin))) {
    if (r.ticket) {
      (passages.get(r.ticket) ?? passages.set(r.ticket, []).get(r.ticket)).push(r);
    }
  }
  const blocs = roles.map((role, i) => ({
    numero: i + 1,
    role,
    nom: NOMS[role] ?? role,
    enCours: [],
    attend: [],
  }));
  const bloc = role => blocs.find(b => b.role === role);
  const places = new Set();
  for (const v of enCoursMesures) {
    const t = v.ticket && parId.get(v.ticket);
    if (!t || !bloc(v.role)) {
      continue;
    }
    places.add(t.id);
    bloc(v.role).enCours.push({
      id: t.id,
      numero: numero(t.id),
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
    const r = etape(p, verdicts[t.id] ?? null);
    if (r && bloc(r)) {
      bloc(r).attend.push(numero(t.id));
    }
  }
  const debutJour = jour;
  const faitsDuJour = tous
    .filter(t => travail(t) && t.closed_at && Date.parse(t.closed_at) >= debutJour)
    .sort(ordre)
    .map(t => numero(t.id));

  // Alerts.
  const alertes = [];
  if (nuit.length) {
    alertes.push({
      niveau: 'rouge',
      texte: `La nuit est rouge : ${nuit.map(t => numero(t.id)).join(', ')}`,
    });
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
const cadre = (gauche, droite, largeur) => {
  if (!droite) {
    return gauche.length > largeur ? `${gauche.slice(0, largeur - 1)}…` : gauche;
  }
  const place = largeur - droite.length - 1;
  const g =
    gauche.length > place ? `${gauche.slice(0, Math.max(place - 1, 0))}…` : gauche.padEnd(place);
  return `${g} ${droite}`;
};
const liste = (l, place) => {
  let s = '';
  for (let i = 0; i < l.length; i++) {
    const suite = `${s ? `${s} · ` : ''}${l[i]}`;
    const reste = l.length - i - 1;
    if (suite.length + (reste ? ` +${reste}`.length : 0) > place) {
      return `${s} +${l.length - i}`;
    }
    s = suite;
  }
  return s;
};

// The board's lines, `largeur` columns wide, each with its tone (titre, alerte, attention, actif,
// discret, or none). The pane and the text show the same lines.
export function lignes(t, nom, largeur = LARGEUR) {
  const out = [];
  const L = (texte, ton) => out.push({ texte, ton });
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
    L(cadre(`⚠ ${a.texte}`, '', largeur), a.niveau === 'rouge' ? 'alerte' : 'attention');
  }

  for (const ch of t.chantiers) {
    L('', undefined);
    L(cadre(`CHANTIER ${ch.numero} — ${ch.sujet}`, '', largeur), 'titre');
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
    // A level shows its mothers (unfolded while work runs below), its tickets in progress or
    // awaiting the responsable, and one line counting its other open tickets.
    const parcourir = (noeuds, p) => {
      const reste = { prets: 0, bloques: 0, reportes: 0 };
      for (const n of noeuds) {
        const visible = n.mere || n.etat === 'enCours' || n.etat === 'aValider';
        if (!visible) {
          if (n.etat in reste) {
            reste[n.etat]++;
          }
          continue;
        }
        const droite = n.mere
          ? `${n.faits}/${n.total}${n.etat === 'fermes' ? ' ✓' : marque(n) ? ` ${marque(n)}` : ''}`
          : marque(n);
        arbre.push({
          texte: cadre(`${' '.repeat(p)}${n.numero}  ${n.sujet}`, droite, largeur),
          ton: n.etat === 'enCours' ? 'actif' : n.etat === 'fermes' ? 'discret' : undefined,
        });
        if (n.mere && n.etat === 'enCours') {
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
        });
      }
    };
    parcourir(ch.enfants, 1);
    out.push(...arbre.slice(0, ARBRE_MAX));
    if (arbre.length > ARBRE_MAX) {
      L(`  … ${arbre.length - ARBRE_MAX} lignes de plus`, 'discret');
    }
  }
  if (t.autres.length) {
    L(
      cadre(
        `autres : ${t.autres.map(a => `${a.numero} ${a.faits}/${a.total}`).join(' · ')}`,
        '',
        largeur
      ),
      'discret'
    );
  }

  L('', undefined);
  L('AGENTS', 'titre');
  const marge = 15;
  for (const b of t.agents) {
    const tete = `${b.numero} ${b.nom}`.padEnd(marge);
    const attend = b.attend.length ? `attend : ${liste(b.attend, largeur - marge - 9)}` : '';
    if (b.enCours.length === 0) {
      L(cadre(`${tete}—${attend ? ` · ${attend}` : ''}`, '', largeur), 'discret');
      continue;
    }
    b.enCours.forEach((x, i) => {
      const droite = `${duree(x.travail)} · ${k(x.jetons)}`;
      L(
        cadre(
          `${i === 0 ? tete : ' '.repeat(marge)}▶ ${x.numero} ${x.composant}${x.ligne ? ' ⌁' : ''}`,
          droite,
          largeur
        ),
        'actif'
      );
    });
    if (attend) {
      L(cadre(`${' '.repeat(marge)}${attend}`, '', largeur), 'discret');
    }
  }
  if (t.faitsDuJour.length) {
    L(cadre(`faits aujourd'hui : ${liste(t.faitsDuJour, largeur - 20)}`, '', largeur), 'discret');
  }
  return out;
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
    if (r.ticket && r.role !== 'arbitre') {
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
  const nom = (pkg.name ?? path.basename(racine)).replace(/^@[^/]+\//, '');
  return { ...t, lignes: lignes(t, nom), etat: ligneEtat(t) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const t = tableau(process.cwd());
  process.stdout.write(
    process.argv.includes('--texte')
      ? `${t.lignes.map(l => l.texte).join('\n')}\n`
      : JSON.stringify(t)
  );
}
