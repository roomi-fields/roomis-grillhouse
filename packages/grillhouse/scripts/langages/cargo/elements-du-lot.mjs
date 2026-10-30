// The elements of a lot of a workspace of cargo, the demand `elementsDuLot` of the join
// (scripts/jointure.d.ts): one element per crate the lot adds, changes or removes, as a review of
// a Cargo workspace reads a change crate by crate.
//
// - The lot is the difference between two commits (`git diff --name-status -z --no-renames`).
// - The crates of a commit: each Cargo.toml it holds whose section `[package]` names a crate,
//   read in git (`git ls-tree`, `git show`), so that a removed crate is read where it was; the
//   folder of the manifest is the crate's.
// - A crate is new when its manifest is in the commit after alone, removed when it is in the
//   commit before alone, and changed when a file the lot changes lies in its folder, the longest
//   one; its element `<dossier>/Cargo.toml#<crate>`, kind `crate`, its manifest's line of its name.
// - The module reads no element of a Rust source: each `.rs` the lot changes is named in
//   `horsDuService`, and the reviewer surveys its items himself (`service` says why).
// - Every file the lot changes is named in `fichiers`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const MANIFESTE = 'Cargo.toml';
const SERVICE = 'le module cargo relève les crates du lot, pas les éléments de ses sources Rust';

const git = (racine, ...a) =>
  spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// The name of the crate the manifest <texte> declares, and the line of it; null without
// `[package]`.
function nomDuCrate(texte) {
  let section = null;
  for (const [i, l] of texte.split('\n').entries()) {
    const s = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(l);
    if (s) {
      section = s[1].trim();
    }
    const n = /^\s*name\s*=\s*"([^"]+)"/.exec(l);
    if (section === 'package' && n) {
      return { nom: n[1], ligne: i + 1 };
    }
  }
  return null;
}

// The crates of the commit <rev> of <racine>: Map dossier (from the root, '' for it) → `{ nom,
// ligne, fichier }`.
function cratesA(racine, rev) {
  const r = git(racine, 'ls-tree', '-r', '-z', '--name-only', rev);
  if (r.status !== 0) {
    throw new Error(`git ls-tree ${rev} : ${r.stderr.trim()}`);
  }
  const out = new Map();
  for (const f of r.stdout.split('\0').filter(Boolean)) {
    if (path.posix.basename(f) !== MANIFESTE) {
      continue;
    }
    const t = git(racine, 'show', `${rev}:${f}`);
    const c = t.status === 0 ? nomDuCrate(t.stdout) : null;
    const dossier = path.posix.dirname(f);
    if (c) {
      out.set(dossier === '.' ? '' : dossier, { ...c, fichier: f });
    }
  }
  return out;
}

// The folder of <crates> that holds <fichier>, the longest; undefined for none.
const dossierDe = (crates, fichier) =>
  [...crates.keys()]
    .filter(d => d === '' || fichier.startsWith(`${d}/`))
    .sort((a, b) => b.length - a.length)[0];

/**
 * The elements the lot of <racine> adds, changes or removes between <avant> and <apres>.
 * @param {string} racine the root of the workspace
 * @param {{ avant: string, apres: string }} o the two commits
 */
export function elementsDuLot(racine, { avant, apres }) {
  try {
    const r = git(racine, 'diff', '--name-status', '-z', '--no-renames', avant, apres);
    if (r.status !== 0) {
      throw new Error(`git diff : ${r.stderr.trim()}`);
    }
    const morceaux = r.stdout.split('\0').filter(Boolean);
    const changes = [];
    for (let i = 0; i + 1 < morceaux.length; i += 2) {
      changes.push({ statut: morceaux[i], fichier: morceaux[i + 1] });
    }
    const crAvant = cratesA(racine, avant);
    const crApres = cratesA(racine, apres);
    const elements = [];
    const vus = new Set();
    const element = (dossier, c, statut) => {
      if (vus.has(dossier)) {
        return;
      }
      vus.add(dossier);
      elements.push({
        id: `${c.fichier}#${c.nom}`,
        nom: c.nom,
        genre: 'crate',
        statut,
        paquet: c.nom,
        fichier: c.fichier,
        ligne: c.ligne,
        exporte: true,
      });
    };
    for (const { fichier } of changes) {
      const da = dossierDe(crApres, fichier);
      const dv = dossierDe(crAvant, fichier);
      if (da !== undefined && !crAvant.has(da)) {
        element(da, crApres.get(da), 'neuf');
      } else if (da !== undefined) {
        element(da, crApres.get(da), 'changé');
      }
      if (dv !== undefined && !crApres.has(dv)) {
        element(dv, crAvant.get(dv), 'supprimé');
      } else if (dv !== undefined && da === undefined) {
        element(dv, crApres.get(dv), 'changé');
      }
    }
    elements.sort((x, y) => x.fichier.localeCompare(y.fichier) || x.nom.localeCompare(y.nom));
    const fichiers = [...new Set(changes.map(c => c.fichier))].sort();
    const horsDuService = fichiers.filter(f => f.endsWith('.rs'));
    return {
      etat: 'fait',
      raison: null,
      elements,
      horsDuService,
      fichiers,
      service: horsDuService.length ? SERVICE : null,
    };
  } catch (e) {
    return {
      etat: 'impossible',
      raison: `erreur : ${String(e.message).split('\n')[0]}`,
      elements: [],
      horsDuService: [],
      fichiers: [],
    };
  }
}
