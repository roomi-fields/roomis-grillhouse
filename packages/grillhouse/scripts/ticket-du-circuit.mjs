// The ticket of a circuit, read and written as the circuit and its activities share it
// (scripts/circuit.mjs, scripts/seances.mjs): its comments and its description in Beads, the
// sheets and the results of its sessions (`<ticket>.fiches.jsonl`), its log, the components of its
// repository, and the stop of the circuit (`Arret`). Every function takes the circuit's context
// <ctx> (`contexte` of scripts/circuit.mjs: `bd`, `ticket`, `fiches`, `journal`, `copie`,
// `racine`) and holds no state of its own. Its writings at the ticket and among the sheets are
// effects (scripts/effets.mjs `emettre`), and its readings see those an act of the workflow
// emitted and has not yet played (`rendusDe`).
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { gesteDe } from './etapes.mjs';
import { paquetsDuLangage } from './enveloppe/paquets-du-plan.mjs';
import { langageDe } from './langages.mjs';
import { AUTEUR_DU_CIRCUIT, PREFIXE, emettre, rendusDe, sansCouleurs } from './effets.mjs';

// The author of a comment, the circuit's, and the start of its lines: those of its one writer.
export { ACTEUR, AUTEUR_DU_CIRCUIT, PREFIXE, premiereLigne, sansCouleurs } from './effets.mjs';

// A stop of the circuit: its name (a key of ARRETS) and its report; for a stop of the checks, its
// reds read in the structured results (`{ paquet, texte, detail }`) and its motive, the report
// without their list; the outcome of the step it stops, when it has one (a proof's, the checks'
// with their reds), which the bilan reads; and what its montée carries beyond the question of its kind (scripts/etapes.mjs,
// MONTEES): its `piece` (file:line, or command and output), its own `question`, and who must
// answer it (`qui`, the owner for the reviewer's question).
export class Arret extends Error {
  constructor(
    nom,
    rapport,
    {
      rouges = null,
      motif = null,
      resultat = null,
      piece = null,
      question = null,
      qui = null,
      etape = null,
    } = {}
  ) {
    super(nom);
    this.nom = nom;
    this.rapport = rapport;
    this.rouges = rouges;
    this.motif = motif;
    this.resultat = resultat;
    this.piece = piece;
    this.question = question;
    this.qui = qui;
    // The step the stop stands at, when it is not the step that throws it.
    this.etape = etape;
  }
}

export const fin = (t, n) => sansCouleurs(t).split('\n').slice(-n).join('\n');
export const enUneLigne = t =>
  sansCouleurs(t)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 300);

// The components of the repository at <racine> as the module of its language gives them, and the
// packages out of the frame a plan may name (`paquetsDuLangage`, as the envelope reads them):
// `{ dossier, pkg: { name }, hors }`, `dossier` relative to <racine>, `.` for a component at its
// root (a crate whose workspace is its own, as OSC Bridge's).
export const composantsDe = racine => paquetsDuLangage(langageDe(racine), racine);

// Every comment at the ticket, in their order, `{ author, text }` as Beads gives them, then those
// emitted and not yet played; a failed read throws.
export function lesCommentaires(ctx) {
  const r = ctx.bd('comments', ctx.ticket, '--json');
  if (r.status !== 0) {
    throw new Error(
      `commentaires de ${ctx.ticket} illisibles : ${r.error?.message ?? r.stderr ?? ''}`.trim()
    );
  }
  return [
    ...(JSON.parse(r.stdout || '[]') ?? []).map(c => ({
      author: String(c.author ?? ''),
      text: String(c.text ?? ''),
    })),
    ...rendusDe(ctx, 'commentaire')
      .filter(e => e.ticket === ctx.ticket)
      .map(e => ({ author: e.auteur ?? AUTEUR_DU_CIRCUIT, text: e.texte })),
  ];
}

// The ticket's description (its criteria), notes, title and labels as Beads holds them at this
// moment, read at the launch of each session, the plan emitted and not yet played written over
// them: `{ description, notes, titre, labels }`; a failed read throws.
export function leTicket(ctx) {
  const r = ctx.bd('show', ctx.ticket, '--json');
  if (r.status !== 0) {
    throw new Error(
      `ticket ${ctx.ticket} illisible : ${r.error?.message ?? r.stderr ?? ''}`.trim()
    );
  }
  const t = JSON.parse(r.stdout || '[]')[0] ?? {};
  const lu = {
    description: String(t.description ?? ''),
    notes: String(t.notes ?? ''),
    titre: String(t.title ?? ''),
    labels: Array.isArray(t.labels) ? t.labels.map(String) : [],
  };
  for (const p of rendusDe(ctx, 'plan')) {
    if (p.titre !== null) {
      lu.titre = p.titre;
    }
    if (p.description !== null) {
      lu.description = p.description;
    }
  }
  return lu;
}

// The comments of the agents at the ticket, `{ author, text }`: every comment but the circuit's
// own. The circuit reads none of them: it hands an agent's last one to the next session of its
// author, and names it in a stop.
export const passations = ctx => lesCommentaires(ctx).filter(c => c.author !== AUTEUR_DU_CIRCUIT);

// The last handover at the ticket of the author <qui>, or null.
export const derniereDe = (ctx, qui) =>
  passations(ctx)
    .filter(c => c.author === qui)
    .at(-1) ?? null;

// The sheets of the ticket's sessions and the circuit's reports, in their order
// (`<ticket>.fiches.jsonl`, beside the copy): `{ date, role, fiche }` for the sheet of a session,
// `{ date, role: 'circuit', etape, rapport }` for the report of a proof or of checks, which the
// reviewer receives; then those emitted and not yet played.
export function lesFiches(ctx) {
  return [
    ...lire(ctx.fiches)
      .split('\n')
      .filter(Boolean)
      .flatMap(l => {
        try {
          return [JSON.parse(l)];
        } catch {
          return [];
        }
      }),
    ...rendusDe(ctx, 'fiche').map(e => e.entree),
  ];
}

// A result kept among the sheets of <ctx>, dated: the effect `fiche`.
export const inscrire = (ctx, entree) =>
  emettre(ctx, { genre: 'fiche', entree: { date: new Date().toISOString(), ...entree } });

// The sheets of <role>, in their order.
export const fichesDe = (ctx, role) =>
  lesFiches(ctx)
    .filter(e => e.role === role)
    .map(e => e.fiche);

// Whether the code of the behaviour is already in the copy: a developpeur session has run (the
// sheets hold one) and the copy still carries a change of production the testwriter does not write
// (`estUnTest` null: neither a test file nor the shared test material). This is the ground truth,
// not the order of the sessions: a testwriter session after the developpeur's (a RENDU to fix a
// test) does not remove the code, so the sign stays raised; a new lot whose code is not in the copy
// never raises it. With it, no test can turn red, and the proof abstains.
export const codeDejaPresent = ctx => {
  if (!lesFiches(ctx).some(e => e.role === 'developpeur')) {
    return false;
  }
  const r = spawnSync(
    'git',
    ['-C', ctx.copie, 'status', '--porcelain', '-z', '--untracked-files=all'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    return false;
  }
  const langage = langageDe(ctx.copie);
  const entrees = r.stdout.split('\0');
  for (let i = 0; i < entrees.length; i++) {
    const e = entrees[i];
    if (e.length < 4) {
      continue;
    }
    const xy = e.slice(0, 2);
    const fichier = e.slice(3);
    // A rename or a copy names its source in the next entry, which is not a change of its own.
    if (xy.includes('R') || xy.includes('C')) {
      i++;
    }
    // A production file the testwriter does not write, present (not deleted): the developer's code.
    if (!xy.includes('D') && langage.estUnTest(fichier, ctx.copie) === null) {
      return true;
    }
  }
  return false;
};

// One line of the circuit's history at the ticket: `Circuit · <étape> : <texte>`, the effect
// `commentaire`; one not written is said, and the circuit goes on (`ecrireLEffet`).
export function commenter(ctx, etape, texte) {
  emettre(ctx, {
    genre: 'commentaire',
    ticket: ctx.ticket,
    texte: `${PREFIXE}${etape} : ${texte}`,
    auteur: AUTEUR_DU_CIRCUIT,
  });
}

// The time <d> in local time with its offset, to the second, as ISO 8601 writes it and as the
// envelope dates the header of a session (`date -Iseconds`): « 2026-10-25T12:42:11+01:00 ».
export function heureLocale(d = new Date()) {
  const deux = n => String(n).padStart(2, '0');
  const decalage = -d.getTimezoneOffset();
  const a = Math.abs(decalage);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}${decalage < 0 ? '-' : '+'}${deux(Math.floor(a / 60))}:${deux(a % 60)}`;
}

// The header line of a step or a session in the ticket's log, in local time, as the envelope
// dates a session's.
export const entete = (ctx, etape) =>
  appendFileSync(ctx.journal, `=== ${heureLocale()} · circuit · ${etape} ===\n`);

// The name of each package of <dossiers> as a title writes it: its component's name, or its path.
export function nomsDe(ctx, dossiers) {
  const liste = composantsDe(existsSync(ctx.copie) ? ctx.copie : ctx.racine);
  return dossiers.map(d => liste.find(p => p.dossier === d)?.pkg.name ?? d);
}

export const lire = f => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// The gesture <genre> of the circuit (scripts/etapes.mjs, GESTES), with no session: its line at
// the ticket and in the log, with its rule.
export function geste(ctx, genre) {
  const g = gesteDe(genre);
  const texte = `${genre} → ${g.geste} (règle : ${g.regle})`;
  commenter(ctx, 'geste', texte);
  entete(ctx, 'geste');
  appendFileSync(ctx.journal, `geste : ${texte}\n`);
}

// The JSON of the file <f>, or null when it does not read.
export const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
