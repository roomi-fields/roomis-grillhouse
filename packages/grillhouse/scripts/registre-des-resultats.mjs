// The registry of test results, by branch, of a repository: what the last green pass of
// `npm run verifier` (scripts/langages/typescript/verifier.mjs) holds, test by test. As Chromium's
// ResultDB and Mozilla's Treeherder keep the result of each test by version of the main branch, and
// as `.pytest_cache` keeps the last run's tests, the proof of the red reads here which tests main
// already holds green, instead of compiling and playing HEAD's version of each test file.
//
// - It lives in `<git common dir>/grillhouse/resultats/<branche>.json`, one per branch, beside the
//   last green (scripts/dernier-vert.mjs), written by the same green pass under the same conditions
//   (`poserLeVert`): `{ commit, tests: { "<fichier depuis la racine>": { "<nom complet>":
//   "passed" } } }`, HEAD at that pass and the passed tests of each file.
// - A pass in a copy reads the registry of its branch when it counts (its commit an ancestor of
//   HEAD), else main's, as `dernier-vert` measures the last green: the proof of a ticket's copy
//   thus reads what main holds green.
// - A test of the lot whose full name is in the registry of <fichier> existed before the ticket
//   (its green is accepted); one absent is new (a test named in `portent_le_travail` must be red).
// - A regression is a test the registry held green that a pass of the day (`verifier`) or of the
//   night turns red: it is recorded in `<git common dir>/grillhouse/regressions/<branche>.json`
//   with the moment it turned red — its last green commit and its first red HEAD — for the night to
//   classify and correct (the charter, « Main reste vert »).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { etatDuDepot, fichierSous, git, SHA } from './etat-du-depot.mjs';

// Keeps <etat> (etatDuDepot) and the passed tests of the reports <rapports> (`verdict` of the join,
// each `{ fichier, tests: [{ nom, etat }] }`, `fichier` absolute) as the registry of its branch,
// of main when HEAD is detached. Only the passed tests, since a green pass holds no other.
export function garderLeRegistre(etat, rapports) {
  const branche = etat.branche ?? etat.main;
  const f = branche ? fichierSous(etat.racine, 'resultats', branche) : null;
  if (!f) {
    return;
  }
  const tests = {};
  for (const r of rapports) {
    const rel = path.relative(etat.racine, r.fichier);
    for (const t of r.tests ?? []) {
      if (t.etat === 'passed') {
        (tests[rel] ??= {})[t.nom] = 'passed';
      }
    }
  }
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, `${JSON.stringify({ commit: etat.commit, tests }, null, 2)}\n`);
}

// The registry that counts for a pass in the repository at <racine>: its branch's when its commit
// is an ancestor of HEAD, else main's, as `dernier-vert` reads the last green. `{ commit, tests,
// branche }`, or null when none counts (out of git, or no registry whose commit is an ancestor).
export function lireLeRegistre(racine) {
  const etat = etatDuDepot(racine);
  if (etat.raison) {
    return null;
  }
  for (const branche of [...new Set([etat.branche, etat.main].filter(Boolean))]) {
    const f = fichierSous(racine, 'resultats', branche);
    let v = null;
    try {
      v = JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      continue;
    }
    if (!SHA.test(v?.commit ?? '') || typeof v.tests !== 'object' || v.tests === null) {
      continue;
    }
    if (git(racine, ['merge-base', '--is-ancestor', v.commit, etat.commit]).status !== 0) {
      continue;
    }
    return { commit: v.commit, tests: v.tests, branche };
  }
  return null;
}

// The green tests of the file <fichier> (from the racine) that the registry <registre> holds, by
// their full name; an empty set for a file the registry does not hold (a new file of the lot).
export function vertsDuRegistre(registre, fichier) {
  const t = registre?.tests?.[fichier] ?? {};
  return new Set(Object.keys(t).filter(nom => t[nom] === 'passed'));
}

// Records as regressions, in `regressions/<branche>.json` of <etat>'s branch (of main detached),
// the red tests <rouges> (`{ fichier, nom }`, `fichier` from the racine) that the registry
// <registre> held green, from a pass of <quand> ('jour' | 'nuit'): `{ fichier, nom, dernierVert,
// premierRouge, quand, vu }`, the moment a green test turned red. A regression already recorded
// for the same test is not duplicated (its first red stays its first).
export function consignerLesRegressions(etat, rouges, registre, quand) {
  const branche = etat.branche ?? etat.main;
  const f = branche ? fichierSous(etat.racine, 'regressions', branche) : null;
  if (!f || !registre) {
    return;
  }
  let liste = [];
  try {
    const v = JSON.parse(readFileSync(f, 'utf8'));
    liste = Array.isArray(v) ? v : [];
  } catch {
    liste = [];
  }
  const connu = new Set(liste.map(r => `${r.fichier}\t${r.nom}`));
  let change = false;
  for (const { fichier, nom } of rouges) {
    if (registre.tests?.[fichier]?.[nom] !== 'passed' || connu.has(`${fichier}\t${nom}`)) {
      continue;
    }
    liste.push({
      fichier,
      nom,
      dernierVert: registre.commit,
      premierRouge: etat.commit,
      quand,
      vu: new Date().toISOString(),
    });
    connu.add(`${fichier}\t${nom}`);
    change = true;
  }
  if (change) {
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, `${JSON.stringify(liste, null, 2)}\n`);
  }
}
