// The generated files a project keeps committed, and their regeneration on a tree where a lot is
// applied. As npm writes package-lock.json again after a merge instead of merging it, and as a
// genrule of Bazel writes its output again on the merged tree, a derived file is never merged: its
// command writes it again from its merged sources.
//
// - The key `grillhouse.engendres` of the root package.json declares them, read from the main tree
//   of the repository (`engendresDe`), never from a copy, as `grillhouse.outils`
//   (scripts/outils-cles.mjs): `{ "<nom>": { "commande": "<ligne du shell>", "fichiers":
//   ["<motif>"], "lit": ["<motif>"] } }`, each pattern from the root (a path, a directory or a glob
//   pattern, as `couvertPar` reads it), `lit` the files it reads, empty when not given. Each one
//   is read in the form of a file a module of language generates (`FichierEngendre` of
//   scripts/jointure.d.ts): its command writes its `fichiers` in full (`entiers`), and no guard
//   judges it (`gardes` empty). A key without a command, without files, or with a pattern out of
//   the repository (absolute, or climbing above the root) is refused by its name, and gives no
//   generated file: the circuit stops at its launch, the integration, the queue and the move of a
//   copy onto main refuse before any work.
// - `touchesPar` gives the generated files a lot touches: one of their files, or one they read.
// - `regenerer` plays the command of each, in order, then stages every file they changed; a command
//   of the project at another code than 0, one of the frame on a real failure (126, 127, a signal,
//   128 + its number), or a file changed that their `fichiers` do not cover refuses, the command,
//   its code and its output named. The integration (scripts/integration/integrer.mjs), the queue
//   (scripts/integration/file.mjs) and the move of a copy onto main
//   (scripts/enveloppe/travail-de-la-copie.mjs) call it on the tree where they applied the lot,
//   main's version of each file taken.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { arbrePrincipal } from './outils-cles.mjs';

/**
 * Whether one of <motifs> covers the file <fichier>, both from the root of the copy, as the inputs
 * of Turborepo read them: a path names that file, a directory every file under it, a glob pattern
 * (`*`, `**`) the files it matches (`path.matchesGlob` of Node).
 * @param {string[]} motifs
 * @param {string} fichier
 */
export function couvertPar(motifs, fichier) {
  return motifs.some(m => {
    const dossier = m.replace(/\/+$/, '');
    return fichier === dossier || fichier.startsWith(`${dossier}/`) || path.matchesGlob(fichier, m);
  });
}

// Whether the pattern <m> leaves the repository: absolute, or climbing above the root.
const horsDuDepot = m => path.isAbsolute(m) || path.posix.normalize(m).split('/')[0] === '..';

// Whether <v> is a list of strings, non-empty ones.
const motifs = v => Array.isArray(v) && v.every(m => typeof m === 'string' && m !== '');

/**
 * The generated files that the package.json <pkg> declares (`grillhouse.engendres`): `engendres`,
 * none when a fault is found; `fautes`, one sentence per fault, naming its key.
 * @param {any} pkg the parsed package.json
 * @returns {{ engendres: { nom: string, commande: string, fichiers: string[], lit: string[], gardes: string[], entiers: string[] }[], fautes: string[] }}
 */
export function lireEngendres(pkg) {
  const e = pkg?.grillhouse?.engendres;
  if (e === undefined || e === null) return { engendres: [], fautes: [] };
  if (typeof e !== 'object' || Array.isArray(e)) {
    return {
      engendres: [],
      fautes: [
        `la clé grillhouse.engendres vaut ${JSON.stringify(e)}, pas un objet { nom: { commande, fichiers, lit } }.`,
      ],
    };
  }
  /** @type {string[]} */
  const fautes = [];
  const engendres = [];
  for (const [nom, v] of Object.entries(e)) {
    const cle = `grillhouse.engendres.${nom}`;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      fautes.push(
        `la clé ${cle} vaut ${JSON.stringify(v)}, pas un objet { commande, fichiers, lit }.`
      );
      continue;
    }
    const avant = fautes.length;
    if (typeof v.commande !== 'string' || v.commande.trim() === '') {
      fautes.push(`la clé ${cle} n'a pas de commande, la ligne du shell qui écrit ses fichiers.`);
    }
    if (!motifs(v.fichiers) || v.fichiers.length === 0) {
      fautes.push(`la clé ${cle} n'a pas de fichiers, les motifs depuis la racine qu'elle écrit.`);
    }
    if (v.lit !== undefined && !motifs(v.lit)) {
      fautes.push(`la clé ${cle}.lit vaut ${JSON.stringify(v.lit)}, pas une liste de motifs.`);
    }
    for (const m of [...(motifs(v.fichiers) ? v.fichiers : []), ...(motifs(v.lit) ? v.lit : [])]) {
      if (horsDuDepot(m)) {
        fautes.push(`la clé ${cle} nomme « ${m} », hors du dépôt : un motif part de la racine.`);
      }
    }
    if (fautes.length === avant) {
      engendres.push({
        nom,
        commande: v.commande,
        fichiers: v.fichiers,
        lit: v.lit ?? [],
        gardes: [],
        entiers: v.fichiers,
      });
    }
  }
  return { engendres: fautes.length ? [] : engendres, fautes };
}

/**
 * The generated files of the project that holds <dir>, from the package.json of its main tree,
 * never of a copy, so that no lot writes the command line the integration then runs; the script
 * that line launches is the one of the tree it runs in, which the lot may change. None without one.
 * @param {string} dir a directory of the project: its main tree or a copy
 * @throws {Error} the faults of the key, one per line
 */
export function engendresDe(dir) {
  const f = path.join(arbrePrincipal(dir), 'package.json');
  if (!existsSync(f)) return [];
  const { engendres, fautes } = lireEngendres(JSON.parse(readFileSync(f, 'utf8')));
  if (fautes.length) throw new Error(fautes.join('\n'));
  return engendres;
}

/**
 * The generated files of <engendres> the lot of <fichiers> touches: one of the files it writes in
 * full, or one it reads.
 * @template {{ entiers: string[], lit: string[] }} E
 * @param {E[]} engendres
 * @param {string[]} fichiers
 * @returns {E[]}
 */
export const touchesPar = (engendres, fichiers) =>
  engendres.filter(e => fichiers.some(f => couvertPar(e.entiers, f) || couvertPar(e.lit, f)));

/**
 * Plays the command of each of <refs>, in order (`lancer`, which runs a line of the shell at the
 * root of the tree and gives the result of spawnSync), then stages every file they changed (`dansCopie`, git in the
 * tree, its strings in UTF-8). Null, or the refusal (see the header). The output of a command that
 * passes goes to <ecrire>.
 * @param {{ refs: { nom: string, commande: string, fichiers: string[], cadre?: boolean }[], lancer: (commande: string) => import('node:child_process').SpawnSyncReturns<string>, dansCopie: (...args: string[]) => import('node:child_process').SpawnSyncReturns<string>, ecrire?: (s: string) => void }} o
 * @returns {string | null}
 */
export function regenerer({ refs, lancer, dansCopie, ecrire = s => process.stdout.write(s) }) {
  const etat = () => {
    const r = dansCopie('status', '--porcelain=v1', '-z', '-uall', '--no-renames');
    return r.status === 0 ? r.stdout.split('\0').filter(Boolean) : null;
  };
  const avant = etat();
  if (avant === null) return "L'état de l'arbre ne se lit pas.";
  for (const r of refs) {
    const x = lancer(r.commande);
    const sortie = `${x.stdout ?? ''}${x.stderr ?? ''}`;
    const code = x.status ?? 1;
    const panne =
      x.signal !== null || x.error !== undefined || code === 126 || code === 127 || code > 128;
    if (panne || (!r.cadre && code !== 0)) {
      return `La commande de « ${r.nom} » (\`${r.commande}\`) rend le code ${code}. Sa sortie :\n${sortie.trim()}`;
    }
    ecrire(sortie);
  }
  const apres = etat();
  if (apres === null) return "L'état de l'arbre ne se lit pas.";
  const deja = new Set(avant);
  const ecrits = apres.filter(l => !deja.has(l)).map(l => l.slice(3));
  const horsDeclaration = ecrits.filter(f => !refs.some(r => couvertPar(r.fichiers, f)));
  if (horsDeclaration.length) {
    return `La régénération change des fichiers qu'aucune commande rejouée n'écrit :\n${horsDeclaration.map(f => `  ${f}`).join('\n')}`;
  }
  if (ecrits.length && dansCopie('add', '-A', '--', ...ecrits).status !== 0) {
    return "Les fichiers régénérés ne s'ajoutent pas à l'index.";
  }
  return null;
}
