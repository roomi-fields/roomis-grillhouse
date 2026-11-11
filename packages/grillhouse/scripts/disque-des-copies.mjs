// The disk of the copies of a project, which a circuit's start consumes (its copy, its
// dependencies, its compilation), as Nomad reserves the disk of a client (`client.reserved.disk`):
// the queue of the tickets admits a circuit only when the disk of the project's copies
// (`<racine>/.claude/worktrees`) has the room of one more copy, and says otherwise what holds it.
//
// - The size of a copy is measured once, when its circuit pauses on a question or ends
//   (`mesurerLaCopie`), and kept beside it (`<ticket>.taille`, JSON `{ octets, mesure }`), as the
//   bilan is kept: never a `du` at each judgement.
// - The room a start wants: the expected size of a copy of the project (the largest kept, else the
//   largest `tailleDUneCopie` of the modules of the languages it declares, scripts/jointure.d.ts,
//   1 GB without one) and the margin of the charter (LIBRE_MIN, 4 GB).
// - What holds the disk: the copies present with their kept size, the largest first.
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { langagesDe } from './langages.mjs';
import { LIBRE_MIN } from './verrou-de-machine.mjs';

const GO = 1024 ** 3;
/** The expected size of a copy of a project that declares no language, before any measure. */
export const TAILLE_PAR_DEFAUT = GO;
const SUFFIXE = '.taille';

/** The directory of the copies of the project at <racine>. */
export const dossierDesCopies = racine => path.join(racine, '.claude', 'worktrees');

// « 7,3 Go ».
const go = n => `${(n / GO).toFixed(1).replace('.', ',')} Go`;

// The room the tree at <dossier> takes on its disk, as `du` counts it: the blocks of each entry,
// links not followed; an entry that vanishes meanwhile counts none.
function occupation(dossier) {
  let octets = 0;
  const pile = [dossier];
  while (pile.length) {
    const d = pile.pop();
    try {
      octets += lstatSync(d).blocks * 512;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const chemin = path.join(d, e.name);
        if (e.isDirectory()) {
          pile.push(chemin);
        } else {
          octets += lstatSync(chemin).blocks * 512;
        }
      }
    } catch {
      // Gone meanwhile.
    }
  }
  return octets;
}

/**
 * Measures the copy of <ticket> once (the room its tree takes, as `du`) and keeps its size beside
 * it; null when the copy is absent or does not read.
 * @param {string} racine
 * @param {string} ticket
 * @returns {number | null}
 */
export function mesurerLaCopie(racine, ticket) {
  const copie = path.join(dossierDesCopies(racine), ticket);
  if (!existsSync(copie)) {
    return null;
  }
  let octets;
  try {
    octets = occupation(copie);
  } catch {
    return null;
  }
  writeFileSync(
    `${copie}${SUFFIXE}`,
    `${JSON.stringify({ octets, mesure: new Date().toISOString() })}\n`
  );
  return octets;
}

/**
 * The sizes kept of the copies of the project at <racine>: each its ticket, its size, and whether
 * the copy is still there.
 * @param {string} racine
 * @returns {Array<{ ticket: string, octets: number, presente: boolean }>}
 */
export function taillesGardees(racine) {
  const dossier = dossierDesCopies(racine);
  let noms;
  try {
    noms = readdirSync(dossier).filter(n => n.endsWith(SUFFIXE));
  } catch {
    return [];
  }
  return noms.flatMap(n => {
    try {
      const { octets } = JSON.parse(readFileSync(path.join(dossier, n), 'utf8'));
      const ticket = n.slice(0, -SUFFIXE.length);
      return Number.isFinite(octets)
        ? [{ ticket, octets, presente: existsSync(path.join(dossier, ticket)) }]
        : [];
    } catch {
      return [];
    }
  });
}

/**
 * The disk of the copies of the project at <racine>: its path, its free room, the room a start
 * wants, what holds it, and the reason a start waits (null when the room is there).
 * @param {string} racine
 * @param {{ libre?: (chemin: string) => number, tailles?: (racine: string) => number[] }} [o]
 * @returns {{ chemin: string, libre: number, requis: number,
 *   occupe: Array<{ ticket: string, octets: number }>, raison: string | null }}
 */
export function disqueDesCopies(racine, o = {}) {
  const libreDe =
    o.libre ??
    (c => {
      const s = statfsSync(c);
      return s.bavail * s.bsize;
    });
  const parLangage = o.tailles ?? (r => langagesDe(r).map(l => l.tailleDUneCopie));
  const dossier = dossierDesCopies(racine);
  const chemin = existsSync(dossier) ? dossier : racine;
  const tailles = taillesGardees(racine);
  let declarees = [];
  try {
    declarees = parLangage(racine);
  } catch {
    declarees = [];
  }
  const attendue = tailles.length
    ? Math.max(...tailles.map(t => t.octets))
    : Math.max(TAILLE_PAR_DEFAUT, ...declarees);
  const requis = attendue + LIBRE_MIN;
  const libre = libreDe(chemin);
  const occupe = tailles
    .filter(t => t.presente)
    .sort((a, b) => b.octets - a.octets)
    .map(({ ticket, octets }) => ({ ticket, octets }));
  const raison =
    libre >= requis
      ? null
      : `disque des copies (${chemin}) : ${go(libre)} libres, ${go(requis)} requis${
          occupe.length
            ? ` ; copies en pause : ${occupe.map(c => `${c.ticket} ${go(c.octets)}`).join(', ')}`
            : ''
        }`;
  return { chemin, libre, requis, occupe, raison };
}
