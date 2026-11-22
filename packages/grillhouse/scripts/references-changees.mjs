// The difference of the reference files a lot changes, as the review of a snapshot (the snapshots
// of Jest and insta, the review of the goldens of Chromium) shows the difference of each file:
// measured by git between the base of the lot and the lot kept (`git diff --numstat`), summarised
// by name of field for a JSON file, so that the reviewer judges the change of a reference on the
// tree, not on what the agent declares.
import { spawnSync } from 'node:child_process';
import { couvertPar } from './engendres.mjs';

// The most fields the text of a difference lists per file, the rest counted.
const CHAMPS_MAX = 40;

const objet = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const egales = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The difference of two JSON texts by name of field: `[{ champ, changees, ajoutees, retirees }]`,
 * the fields whose values changed, were added or removed (an object descended into by its keys, a
 * list by its positions, its extra or missing elements counted under the name of the list), in the
 * order they first appear; an empty list for two equal documents; null when a text is no JSON.
 * @param {string} avant
 * @param {string} apres
 * @returns {{ champ: string, changees: number, ajoutees: number, retirees: number }[] | null}
 */
export function resumeJson(avant, apres) {
  let a;
  let b;
  try {
    a = JSON.parse(avant);
    b = JSON.parse(apres);
  } catch {
    return null;
  }
  const champs = new Map();
  const compter = (nom, sorte, n = 1) => {
    const c = champs.get(nom) ?? { champ: nom, changees: 0, ajoutees: 0, retirees: 0 };
    c[sorte] += n;
    champs.set(nom, c);
  };
  const descendre = (x, y, nom) => {
    if (Array.isArray(x) && Array.isArray(y)) {
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        descendre(x[i], y[i], nom);
      }
      if (y.length > x.length) {
        compter(nom, 'ajoutees', y.length - x.length);
      } else if (x.length > y.length) {
        compter(nom, 'retirees', x.length - y.length);
      }
    } else if (objet(x) && objet(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (!(k in y)) {
          compter(k, 'retirees');
        } else if (!(k in x)) {
          compter(k, 'ajoutees');
        } else {
          descendre(x[k], y[k], k);
        }
      }
    } else if (!egales(x, y)) {
      compter(nom, 'changees');
    }
  };
  descendre(a, b, '(racine)');
  return [...champs.values()];
}

const git = (copie, args) =>
  spawnSync('git', ['-C', copie, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// The text of <fichier> at <commit>, or null when it is not there.
const texteA = (copie, commit, fichier) => {
  const r = git(copie, ['show', `${commit}:${fichier}`]);
  return r.status === 0 ? r.stdout : null;
};

/**
 * The reference files the lot changes, measured by git between <base> and <lot> in <copie>: each
 * `{ fichier, ajoutees, retirees, champs }`, its lines added and removed, and for a JSON file
 * present on both sides its fields (`resumeJson`), else null. A reference file is one that a
 * reference of <references> (`lesReferences`: `fichiers` and `entiers`) covers.
 * @param {{ copie: string, references: { fichiers: string[], entiers?: string[] }[], base: string, lot: string }} o
 * @returns {{ fichier: string, ajoutees: number, retirees: number, champs: { champ: string, changees: number, ajoutees: number, retirees: number }[] | null }[]}
 */
export function differencesDesReferences({ copie, references, base, lot }) {
  const motifs = references.flatMap(r => [...(r.fichiers ?? []), ...(r.entiers ?? [])]);
  if (!motifs.length) {
    return [];
  }
  const r = git(copie, ['diff', '--numstat', '--no-renames', '-z', base, lot]);
  if (r.status !== 0) {
    return [];
  }
  const sorties = [];
  for (const entree of r.stdout.split('\0')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/s.exec(entree);
    if (!m || !couvertPar(motifs, m[3])) {
      continue;
    }
    const fichier = m[3];
    let champs = null;
    if (fichier.endsWith('.json')) {
      const avant = texteA(copie, base, fichier);
      const apres = texteA(copie, lot, fichier);
      champs = avant !== null && apres !== null ? resumeJson(avant, apres) : null;
    }
    sorties.push({
      fichier,
      ajoutees: m[1] === '-' ? 0 : Number(m[1]),
      retirees: m[2] === '-' ? 0 : Number(m[2]),
      champs,
    });
  }
  return sorties.sort((x, y) => x.fichier.localeCompare(y.fichier));
}

const ligneDuChamp = c =>
  `${c.champ} : ${[
    c.changees && `${c.changees} changées`,
    c.ajoutees && `${c.ajoutees} ajoutées`,
    c.retirees && `${c.retirees} retirées`,
  ]
    .filter(Boolean)
    .join(', ')}`;

/**
 * The text the reviewer reads: each changed reference file with its lines (`+a −b`) and, for a
 * JSON file, a line per field; « aucun » when the lot changes no reference.
 * @param {{ fichier: string, ajoutees: number, retirees: number, champs: any[] | null }[]} diffs
 */
export function texteDesDifferences(diffs) {
  if (!diffs.length) {
    return 'aucun';
  }
  return diffs
    .map(d => {
      const champs = d.champs ?? [];
      const reste = champs.length - CHAMPS_MAX;
      return [
        `- ${d.fichier} (+${d.ajoutees} −${d.retirees})`,
        ...champs.slice(0, CHAMPS_MAX).map(c => `  - ${ligneDuChamp(c)}`),
        ...(reste > 0 ? [`  - … ${reste} autres champs`] : []),
      ].join('\n');
    })
    .join('\n');
}

/**
 * The line of the commit message: « Références changées (N) : <fichier> (+a −b), … », empty when
 * the lot changes no reference.
 * @param {{ fichier: string, ajoutees: number, retirees: number }[]} diffs
 */
export function ligneDesReferences(diffs) {
  return diffs.length
    ? `Références changées (${diffs.length}) : ${diffs
        .map(d => `${d.fichier} (+${d.ajoutees} −${d.retirees})`)
        .join(', ')}`
    : '';
}
