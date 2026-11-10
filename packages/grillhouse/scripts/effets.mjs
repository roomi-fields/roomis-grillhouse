// The external effects of the circuit, as data, and their one writer (docs/ARCHITECTURE.md, the
// workflow of a ticket: « une activité, un effet, une clé »), as a functional core hands its
// imperative shell what to write. The code of the circuit that the workflow of a ticket runs
// (scripts/circuit.mjs, scripts/seances.mjs, scripts/activites.mjs, scripts/ticket-du-circuit.mjs),
// and the queue of a project its comments (scripts/integration/file.mjs), write nothing outside
// themselves: it emits each effect (`emettre`). An effect emitted outside an act is played
// at once (`jouerLEffet`, without a key); an act of the workflow gathers
// them in `ctx.rendus` and gives them back with its outcome (scripts/faits-du-circuit.mjs), its
// own readings seeing those it already emitted (`rendusDe`), and the workflow plays each one in an
// activity of its own, under the key of that activity (src/temporal/acte.ts `cleDeLActivite`).
//
// The effects, `{ genre, ... }`:
//
// - `commentaire` `{ ticket, texte, auteur }`: a comment at a ticket, by its author;
// - `fiche` `{ entree }`: a line of the ticket's sheets (`<ticket>.fiches.jsonl`), dated;
// - `decouverte` `{ role, sujet, corps, composants }`: a discovery filed closed under the ticket
//   (scripts/ticket.sh, label `decouverte`), then its line among the sheets (`{ id, sujet }`);
// - `registre` `{ ligne }`: a line of the register of the steps (scripts/registre.mjs);
// - `trace` `{ ligne }`: a line of the journal of states (scripts/journal-des-etats.mjs), whose
//   failure is said once and never stops the circuit;
// - `etat` `{ etat }`: the circuit's state, which the workflow of a ticket holds and no player writes
//   (src/temporal/circuit/deroule.ts);
// - `plan` `{ titre, description }`: the plan written at the ticket (its title, its description);
// - `bilan` `{ ticket }`: the bilan of the ticket computed when it is written, once the effects
//   before it are, kept in the main tree, and its text at the ticket (scripts/bilan.mjs
//   `ecrireLeBilan`), its key in the comment;
// - `resume-du-tri` `{ ticket, debut, ecritures }`: the line of the tri at the ticket, which reads
//   each discovery's writings when it is written (`{ decouverte, verdict, etiquettes, rouvre }`:
//   its comment, its labels, its reopening), its key in the comment;
// - `etiquettes` `{ ticket, etiquettes }`: labels added to a ticket;
// - `reouverture` `{ ticket }`: a ticket reopened.
//
// An effect that does not replay without harm carries the key it is played under (`AVEC_CLE`),
// and is read before it is written: a comment holds it in a line of HTML comment, a line of the
// sheets or of the register in a field `cle`, a discovery in its body. Every other effect writes
// the same thing however often it is played: it takes no key. Each player returns `{ status,
// stderr }`, as bd does; an effect not written has one outcome
// (`ecrireLEffet`): said on the error output, or a stop.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { ecrireLeBilan } from './bilan.mjs';
import { ecrireLaTrace } from './journal-des-etats.mjs';
import { ecrire as ecrireAuRegistre } from './registre.mjs';

/** The line of HTML comment that carries the key <cle> in a text at a ticket. */
export const marqueDeCle = cle => `<!-- grillhouse : ${cle} -->`;

/** The effects that do not replay without harm: each carries its key. */
export const AVEC_CLE = new Set([
  'commentaire',
  'fiche',
  'decouverte',
  'registre',
  'bilan',
  'resume-du-tri',
]);

// The variable in which bd reads the author of a comment (`bd --help`: « default: $BEADS_ACTOR,
// git user.name, $USER »), each session's its role; the author of the circuit's own lines, and
// the start of each of them at a ticket.
export const ACTEUR = 'BEADS_ACTOR';
export const AUTEUR_DU_CIRCUIT = 'circuit';
export const PREFIXE = 'Circuit · ';
const TICKET_SH = path.join(import.meta.dirname, 'ticket.sh');

const ok = { status: 0, stdout: '', stderr: '' };
// A failure of a player, as bd answers one.
const echec = stderr => ({ status: 1, stdout: '', stderr });

/** <t> without its colours. */
export const sansCouleurs = t => stripVTControlCharacters(String(t ?? ''));
/** The first line of <t>, without its colours, 300 characters at most. */
export const premiereLigne = t => sansCouleurs(t).trim().split('\n')[0].slice(0, 300);

/** An effect not written that Temporal tries again: its activity's failure is retryable. */
export class EffetNonEcrit extends Error {
  constructor(message) {
    super(message);
    this.reessayable = true;
  }
}

// The JSON answer of bd <r>, or the failure of its reading: bd that fails, or answers what does
// not parse.
function lu(r, quoi) {
  if (r.status !== 0) {
    return { echec: echec(`${quoi} illisibles : ${r.stderr ?? ''}`.trim()) };
  }
  try {
    return { valeur: JSON.parse(r.stdout || '[]') };
  } catch (e) {
    return { echec: echec(`${quoi} illisibles : ${e.message}`) };
  }
}

/**
 * The effect <effet> of <ctx> emitted: gathered in `ctx.rendus` under an act of the workflow,
 * else played at once (`jouerLEffet`, without a key). What its player returns (`{ status }`), and
 * success when it is gathered.
 */
export function emettre(ctx, effet) {
  if (ctx.rendus) {
    ctx.rendus.push(effet);
    return ok;
  }
  return ecrireLEffet(ctx, effet, null);
}

/** The effects of the sort <genre> <ctx> emitted and not yet played, in their order. */
export const rendusDe = (ctx, genre) => (ctx.rendus ?? []).filter(e => e.genre === genre);

// bd under the author <auteur>, in the main tree of <ctx>.
const bdSous = (ctx, auteur, ...a) => (ctx.bdSous ? ctx.bdSous(auteur, ...a) : ctx.bd(...a));

// The lines of the file <f> parsed, a torn one left out.
const lignes = f =>
  (existsSync(f) ? readFileSync(f, 'utf8') : '').split('\n').flatMap(l => {
    try {
      return l ? [JSON.parse(l)] : [];
    } catch {
      return [];
    }
  });

// Whether a comment at <ticket> of <ctx> already holds the mark of <cle>, or the failure of its
// reading.
function dejaCommente(ctx, ticket, cle) {
  const r = lu(ctx.bd('comments', ticket, '--json'), `commentaires de ${ticket}`);
  if (r.echec) {
    return r.echec;
  }
  const marque = marqueDeCle(cle);
  return (r.valeur ?? []).some(c => String(c?.text ?? '').includes(marque));
}

// The id of the discovery filed under the ticket of <ctx> whose body holds the mark of <cle>, '',
// or the failure of its reading.
function decouverteDeLaCle(ctx, cle) {
  const r = lu(
    ctx.bd('list', '--parent', ctx.ticket, '--all', '--desc-contains', marqueDeCle(cle), '--json'),
    `découvertes de ${ctx.ticket}`
  );
  if (r.echec) {
    return r.echec;
  }
  return r.valeur?.[0]?.id ?? '';
}

// The line <entree> among the sheets of <ctx>, under the key <cle> (null without one), once.
function ficheUneFois(ctx, entree, cle) {
  if (cle && lignes(ctx.fiches).some(e => e.cle === cle)) {
    return ok;
  }
  appendFileSync(ctx.fiches, `${JSON.stringify({ ...entree, ...(cle ? { cle } : {}) })}\n`);
  return ok;
}

// The comment <texte> at <ticket> of <ctx> by <auteur>, under the key <cle> (null without one),
// once.
function commenterUneFois(ctx, { ticket, texte, auteur }, cle) {
  const deja = cle ? dejaCommente(ctx, ticket, cle) : false;
  if (deja) {
    return deja === true ? ok : deja;
  }
  return bdSous(
    ctx,
    auteur ?? AUTEUR_DU_CIRCUIT,
    'comments',
    'add',
    ticket,
    cle ? `${texte}\n\n${marqueDeCle(cle)}` : texte
  );
}

// The players, by sort, each on <ctx>, the effect and its key (null without one).
const JOUEURS = {
  commentaire: commenterUneFois,
  fiche(ctx, { entree }, cle) {
    return ficheUneFois(ctx, entree, cle);
  },
  decouverte(ctx, { role, sujet, corps, composants }, cle) {
    let id = cle ? decouverteDeLaCle(ctx, cle) : '';
    if (typeof id !== 'string') {
      return id;
    }
    if (!id) {
      const r = spawnSync(
        'bash',
        [
          TICKET_SH,
          ctx.ticket,
          sujet,
          composants,
          cle ? `${corps}\n\n${marqueDeCle(cle)}` : corps,
          'decouverte',
        ],
        { cwd: ctx.racine, encoding: 'utf8', env: { ...process.env, [ACTEUR]: AUTEUR_DU_CIRCUIT } }
      );
      id = r.status === 0 ? r.stdout.trim().split('\n').at(-1) : '';
      if (!id) {
        return { status: r.status || 1, stdout: '', stderr: r.stderr ?? '' };
      }
    }
    // Filed, its line among the sheets not written stops (a writing of the sheets).
    return ficheUneFois(
      ctx,
      { date: new Date().toISOString(), role, decouverte: { id, sujet } },
      cle
    );
  },
  registre(_ctx, { ligne }, cle) {
    try {
      ecrireAuRegistre({ ...ligne, ...(cle ? { cle } : {}) });
      return ok;
    } catch (e) {
      return echec(e.message);
    }
  },
  // A line of the journal of states: never an arrest, never a wait (ecrireLaTrace says a failure
  // once and goes on).
  trace(ctx, { ligne }) {
    ecrireLaTrace(ctx.racine, ligne);
    return ok;
  },
  plan(ctx, { titre, description }) {
    const options = [
      ...(titre === null ? [] : ['--title', titre]),
      ...(description === null ? [] : ['-d', description]),
    ];
    return options.length ? ctx.bd('update', ctx.ticket, ...options) : ok;
  },
  bilan(ctx, { ticket, fin }, cle) {
    let texte;
    try {
      texte = ecrireLeBilan(ctx.racine, ticket, fin ?? null);
    } catch (e) {
      return echec(e.message);
    }
    return commenterUneFois(
      ctx,
      { ticket, texte: `${PREFIXE}bilan : ${texte}`, auteur: AUTEUR_DU_CIRCUIT },
      cle
    );
  },
  // The line of the tri, written once its writings are: each discovery read now (its comments,
  // its labels, its status), a writing absent named among those that failed, a ticket to reopen
  // not open not counted, so that the line says what the tickets are.
  'resume-du-tri'(ctx, { ticket, debut, ecritures }, cle) {
    const rouvertes = [];
    const rates = [];
    // The cause bd gave for a writing of <genre> at <decouverte> that failed (`ecrireLEffet`).
    const echecs = lignes(ctx.fiches).filter(e => e.echec);
    const cause = (genre, decouverte) =>
      echecs.findLast(e => e.echec.genre === genre && e.echec.ticket === decouverte)?.echec.raison;
    for (const { decouverte, verdict, etiquettes, rouvre } of ecritures) {
      const ici = [];
      const montre = lu(ctx.bd('show', decouverte, '--json'), `ticket ${decouverte}`);
      const t = montre.valeur?.[0] ?? null;
      const dits = lu(ctx.bd('comments', decouverte, '--json'), `commentaires de ${decouverte}`);
      if (dits.echec) {
        ici.push(`verdict (${premiereLigne(dits.echec.stderr)})`);
      } else if (!(dits.valeur ?? []).some(c => String(c?.text ?? '').startsWith(verdict))) {
        ici.push(`verdict (${cause('commentaire', decouverte) ?? 'absent'})`);
      }
      if (montre.echec) {
        ici.push(`étiquette (${premiereLigne(montre.echec.stderr)})`);
      } else if (!etiquettes.every(e => (t?.labels ?? []).includes(e))) {
        ici.push(`étiquette (${cause('etiquettes', decouverte) ?? 'absente'})`);
      }
      if (rouvre) {
        if (t?.status && t.status !== 'closed') {
          rouvertes.push(decouverte);
        } else {
          const pourquoi = montre.echec
            ? premiereLigne(montre.echec.stderr)
            : (cause('reouverture', decouverte) ?? 'toujours fermée');
          ici.push(`réouverture (${pourquoi})`);
        }
      }
      if (ici.length) {
        rates.push(`${decouverte} : ${ici.join(', ')}`);
      }
    }
    const texte = `${debut} ; ${rouvertes.length ? `rouvertes sous a-valider : ${rouvertes.join(', ')}` : 'aucune rouverte'}${rates.length ? ` ; écritures en échec : ${rates.join(' ; ')}` : ''}.`;
    return commenterUneFois(ctx, { ticket, texte, auteur: AUTEUR_DU_CIRCUIT }, cle);
  },
  etiquettes(ctx, { ticket, etiquettes }) {
    return ctx.bd('update', ticket, ...etiquettes.flatMap(e => ['--add-label', e]));
  },
  reouverture(ctx, { ticket }) {
    const r = ctx.bd('show', ticket, '--json');
    const statut = lu(r, `ticket ${ticket}`).valeur?.[0]?.status ?? null;
    return statut && statut !== 'closed' ? ok : ctx.bd('reopen', ticket);
  },
};

/**
 * The effect <effet> written for <ctx>, under the key <cle> when its sort takes one (`AVEC_CLE`;
 * null plays it without, as an effect emitted outside an act): what its player returns,
 * `{ status, stderr }`.
 */
export function jouerLEffet(ctx, effet, cle) {
  const joueur = JOUEURS[effet?.genre];
  if (!joueur) {
    throw new Error(`effet inconnu du circuit : ${effet?.genre}`);
  }
  return joueur(ctx, effet, AVEC_CLE.has(effet.genre) ? (cle ?? null) : null);
}

// The effects whose failure the circuit goes on past: what the line on the error output says is
// not written. Every other effect not written stops (the state, a line of the sheets, the plan, a
// question read).
const DIT_SANS_ARRETER = {
  commentaire: e => `commentaire non écrit au ticket ${e.ticket}`,
  decouverte: e => `découverte « ${e.sujet} » non consignée`,
  registre: () => 'registre non écrit',
  bilan: e => `bilan non écrit au ticket ${e.ticket}`,
  etiquettes: e => `étiquettes non posées sur ${e.ticket}`,
  'resume-du-tri': e => `ligne du tri non écrite au ticket ${e.ticket}`,
  reouverture: e => `${e.ticket} non rouvert`,
};

/**
 * The effect <effet> written for <ctx> under the key <cle> (`jouerLEffet`), with one outcome,
 * emitted outside an act (`emettre`) or played by an activity of the workflow: an effect the
 * circuit goes on past (`DIT_SANS_ARRETER`) not written is said on the error output, its cause kept among
 * the sheets of the ticket (`echec`, which the line of the tri reads), and its `{ status, stderr }`
 * returned; any other not written throws. Under an activity Temporal tries again
 * (<reessayer>, before its last attempt), an effect not written throws, so that a passing
 * failure is tried again, and it is said at the last attempt only.
 */
export function ecrireLEffet(ctx, effet, cle, { reessayer = false } = {}) {
  const r = jouerLEffet(ctx, effet, cle);
  if (r.status === 0) {
    return r;
  }
  const raison = String(r.stderr ?? '').trim() || `code ${r.status}`;
  const dit = DIT_SANS_ARRETER[effet.genre];
  if (!dit) {
    throw new Error(`effet ${effet.genre} non écrit : ${raison}`);
  }
  if (reessayer) {
    throw new EffetNonEcrit(`effet ${effet.genre} non écrit : ${raison}`);
  }
  process.stderr.write(`⚠️  ${dit(effet)} : ${raison}\n`);
  // Its cause kept among the sheets of the ticket, which the line of the tri names.
  if (ctx.fiches) {
    ficheUneFois(
      ctx,
      {
        date: new Date().toISOString(),
        role: AUTEUR_DU_CIRCUIT,
        echec: { genre: effet.genre, ticket: effet.ticket ?? null, raison: premiereLigne(raison) },
      },
      null
    );
  }
  return r;
}
