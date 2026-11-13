// The follower of the board (`grillhouse tableau --suivre`): one producer that follows the events
// and, at each measure, writes the status line's text (`grillhouse-etat.txt`) and the pane's line
// (`grillhouse-tableau.ligne`) from that one measure, in the common git directory. The status line
// and the pane are readers; as watchman or `tsc --watch` keep one watch and one state.
//
// - A measure follows an event: a change under `.beads/`, a change of the git state (HEAD, the
//   references), a change of the set of circuits (a light poll of Temporal), the end of a bd or git
//   command (through the first two). Events close together fold into one measure (`rebondir`).
// - Without an event, a measure every SECOURS; every AVANCEMENT while a line of progress shows.
// - One follower writes per repository: it holds the lock `grillhouse-suiveur.verrou` of the common
//   directory; another follower relays the lines the writer writes, and takes the lock over when
//   the writer's process is gone.
// - Each line the writer writes goes to the standard output, one JSON board per line.
import { mkdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync } from 'node:fs';
import path from 'node:path';

import { vivant as processVivant } from './mesure/base-de-passe.mjs';

// The measure (the board) and the common git folder come from the command that starts the
// follower (`tableau --suivre`), which owns them: the status line imports this module for
// `lireEtat` and must start fast, and no cycle ties it to the board.

/** A status measure older than this shows nothing in the status line. */
export const PEREMPTION = 10 * 60_000;
/** The longest wait between two measures without an event. */
export const SECOURS = 5 * 60_000;
/** The wait between two measures while a line of progress shows. */
export const AVANCEMENT = 10_000;
/** Events closer than this fold into one measure. */
export const REBOND = 300;
// The light poll of Temporal.
const SONDAGE = 15_000;
// How often a relaying follower looks at the lock of the writer.
const RELEVE = 15_000;

const FICHIER_ETAT = 'grillhouse-etat.txt';
const FICHIER_LIGNE = 'grillhouse-tableau.ligne';
const FICHIER_VERROU = 'grillhouse-suiveur.verrou';

// Writes `contenu` to `fichier` whole: a reader never sees it half written.
function ecrire(fichier, contenu) {
  const prive = `${fichier}.${process.pid}.tmp`;
  writeFileSync(prive, contenu);
  renameSync(prive, fichier);
}

/**
 * Measures the board once and writes both outputs from that one call: the status text with the
 * time of the measure, and the pane's line.
 * @param {string} racine
 * @param {{ commun: string | null, mesure: Function, projets?: string[], maintenant?: number }} o
 * @returns {Promise<{ texte: string, ligne: string }>}
 */
export async function mesurerUneFois(
  racine,
  { commun, mesure, projets = [], maintenant = Date.now() }
) {
  const t = await mesure(racine, { projets, maintenant });
  const texte = t.etat ?? '';
  const ligne = JSON.stringify(t);
  if (commun) {
    try {
      ecrire(path.join(commun, FICHIER_ETAT), JSON.stringify({ texte, mesure: maintenant }));
      ecrire(path.join(commun, FICHIER_LIGNE), `${ligne}\n`);
    } catch {
      // A read-only place keeps the follower working, without its files.
    }
  }
  return { texte, ligne };
}

/**
 * The status text a file's content holds, or '' when it is empty, unreadable, timeless or older
 * than PEREMPTION at `maintenant`.
 * @param {string} contenu
 * @param {number} maintenant
 */
export function lireEtat(contenu, maintenant) {
  try {
    const { texte, mesure } = JSON.parse(contenu);
    if (typeof texte !== 'string' || typeof mesure !== 'number') {
      return '';
    }
    return maintenant - mesure > PEREMPTION ? '' : texte;
  } catch {
    return '';
  }
}

/**
 * The wait, in ms, before the next measure without an event.
 * @param {{ derniere: number, maintenant: number, avancement: boolean }} o
 */
export const delaiAvantLaMesure = ({ derniere, maintenant, avancement }) =>
  Math.max(0, derniere + (avancement ? AVANCEMENT : SECOURS) - maintenant);

/**
 * A key of the set of circuits: step, attempt and life of each ticket's circuit, in any order,
 * whatever its progress counters.
 * @param {{ ticket: string, etape: string, tentative?: number, vivant?: boolean }[]} circuits
 */
export const empreinteDesCircuits = circuits =>
  JSON.stringify(
    circuits
      .map(c => [c.ticket, c.etape, c.tentative ?? null, c.vivant ?? null])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  );

/**
 * Folds the events asked within `ms` of each other into one call of `mesure`.
 * @param {number} ms
 * @param {() => void} mesure
 */
export function rebondir(ms, mesure) {
  let minuteur = null;
  return {
    demander() {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => {
        minuteur = null;
        mesure();
      }, ms);
    },
    annuler() {
      clearTimeout(minuteur);
      minuteur = null;
    },
  };
}

/**
 * Watches the files that tell the board changed: `.beads/`, and the git state (HEAD, packed-refs,
 * the references) of the common directory. Each change asks, folded by `rebond`, for `quand`.
 * @param {{ racine: string, commun: string, rebond?: number, quand: () => void }} o
 * @returns {{ fermer: () => void }}
 */
export function veiller({ racine, commun, rebond = REBOND, quand }) {
  const r = rebondir(rebond, quand);
  const veilles = [];
  const sur = (dossier, options, garde) => {
    try {
      veilles.push(
        watch(dossier, options, (_evenement, nom) => {
          if (garde(String(nom ?? ''))) {
            r.demander();
          }
        })
      );
    } catch {
      // A folder that does not exist is not watched.
    }
  };
  sur(path.join(racine, '.beads'), { recursive: true }, () => true);
  // The day's marker (`grillhouse newday`) moves the board too.
  sur(commun, {}, nom => nom === 'HEAD' || nom === 'packed-refs' || nom === 'tableau-repere.json');
  sur(path.join(commun, 'refs'), { recursive: true }, () => true);
  return {
    fermer() {
      r.annuler();
      for (const v of veilles) {
        v.close();
      }
    },
  };
}

/**
 * Takes the lock of the writing follower of the repository whose common directory is `commun`; a
 * lock of a dead process is taken over.
 * @param {string} commun
 * @param {{ pid?: number, vivant?: (pid: number) => boolean }} [o]
 * @returns {{ pris: boolean, detenteur: number | null, liberer: () => void }}
 */
export function prendreLeVerrou(commun, { pid = process.pid, vivant = processVivant } = {}) {
  const verrou = path.join(commun, FICHIER_VERROU);
  const lire = () => {
    const n = Number(readFileSync(verrou, 'utf8').trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  for (let essai = 0; essai < 5; essai++) {
    try {
      writeFileSync(verrou, `${pid}\n`, { flag: 'wx' });
      return {
        pris: true,
        detenteur: pid,
        liberer() {
          try {
            if (lire() === pid) {
              rmSync(verrou, { force: true });
            }
          } catch {
            // Already gone.
          }
        },
      };
    } catch (e) {
      if (e.code !== 'EEXIST') {
        break;
      }
    }
    let detenteur = null;
    try {
      detenteur = lire();
    } catch {
      continue;
    }
    if (detenteur !== null && vivant(detenteur)) {
      return { pris: false, detenteur, liberer() {} };
    }
    // The holder is gone: the lock is moved aside (one taker wins), then the taking starts again.
    try {
      const ecarte = `${verrou}.${pid}.reprise`;
      renameSync(verrou, ecarte);
      rmSync(ecarte, { force: true });
    } catch {
      // Another taker moved it first.
    }
  }
  return { pris: false, detenteur: null, liberer() {} };
}

/**
 * Gives each line the writer writes to `surLigne`, the line already written first, without
 * measuring.
 * @param {string} commun
 * @param {(ligne: string) => void} surLigne
 * @returns {{ fermer: () => void }}
 */
export function relayer(commun, surLigne) {
  const fichier = path.join(commun, FICHIER_LIGNE);
  let derniere = null;
  const lire = () => {
    try {
      const ligne = readFileSync(fichier, 'utf8').trim();
      if (ligne && ligne !== derniere) {
        derniere = ligne;
        surLigne(ligne);
      }
    } catch {
      // Nothing written yet.
    }
  };
  let veille = null;
  try {
    veille = watch(commun, {}, (_e, nom) => {
      if (String(nom ?? '') === FICHIER_LIGNE) {
        lire();
      }
    });
  } catch {
    // A common directory that cannot be watched relays what it read at the start.
  }
  lire();
  return { fermer: () => veille?.close() };
}

/**
 * The follower: measures on events, writes (or relays) and gives each line to `surLigne`, until
 * `fermer`.
 * @param {string} racine
 * @param {{ projets?: string[], surLigne: (ligne: string) => void, mesure: Function, dossierCommun: (racine: string) => string | null }} o
 * @returns {Promise<{ fermer: () => void }>}
 */
export async function suivre(racine, { projets = [], surLigne, mesure, dossierCommun }) {
  const { circuitsDuServeur } = await import('./circuits-du-serveur.mjs');
  const commun = dossierCommun(racine);
  if (!commun) {
    throw new Error('suivre : le dossier git commun du projet est introuvable.');
  }
  mkdirSync(commun, { recursive: true });
  let ferme = false;
  let ecrivain = null;
  let relais = null;
  let releve = null;

  const ecrire_ = () => {
    const verrou = prendreLeVerrou(commun);
    if (!verrou.pris) {
      return false;
    }
    relais?.fermer();
    relais = null;
    clearInterval(releve);
    let derniere = 0;
    let avancement = false;
    let empreinte = null;
    let attente = null;
    let enCours = false;
    let encore = false;
    const mesurer = async () => {
      if (ferme) {
        return;
      }
      if (enCours) {
        encore = true;
        return;
      }
      enCours = true;
      try {
        do {
          encore = false;
          const r = await mesurerUneFois(racine, { commun, mesure, projets });
          derniere = Date.now();
          avancement = JSON.parse(r.ligne).lignes?.some(l => l.avancement === true) ?? false;
          surLigne(r.ligne);
        } while (encore && !ferme);
      } catch {
        // A measure that fails is tried again at the next event or the fallback.
      } finally {
        enCours = false;
        planifier();
      }
    };
    const rebond = rebondir(REBOND, () => void mesurer());
    const planifier = () => {
      clearTimeout(attente);
      if (ferme) {
        return;
      }
      attente = setTimeout(
        () => void mesurer(),
        delaiAvantLaMesure({ derniere, maintenant: Date.now(), avancement })
      );
    };
    const veillee = veiller({ racine, commun, quand: () => rebond.demander() });
    const sondage = setInterval(() => {
      circuitsDuServeur(racine)
        .then(c => {
          const e = empreinteDesCircuits(c);
          if (empreinte !== null && e !== empreinte) {
            rebond.demander();
          }
          empreinte = e;
        })
        .catch(() => {});
    }, SONDAGE);
    ecrivain = {
      fermer() {
        clearTimeout(attente);
        clearInterval(sondage);
        rebond.annuler();
        veillee.fermer();
        verrou.liberer();
      },
    };
    void mesurer();
    return true;
  };

  if (!ecrire_()) {
    relais = relayer(commun, surLigne);
    releve = setInterval(() => void ecrire_(), RELEVE);
  }
  return {
    fermer() {
      ferme = true;
      clearInterval(releve);
      relais?.fermer();
      ecrivain?.fermer();
    },
  };
}
