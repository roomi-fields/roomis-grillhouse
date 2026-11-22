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
// - `encoreDeclares` keeps the generated files the tree where the lot is applied still declares, by
//   their names: as a genrule of Bazel removed with its output in one change plays no more, the
//   one a lot removes from the key is not played, and its files follow the lot, their deletion
//   too. The command line stays main's: a lot removes one, it writes none.
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
  if (e === undefined || e === null) {
    return { engendres: [], fautes: [] };
  }
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
  if (!existsSync(f)) {
    return [];
  }
  const { engendres, fautes } = lireEngendres(JSON.parse(readFileSync(f, 'utf8')));
  if (fautes.length) {
    throw new Error(fautes.join('\n'));
  }
  return engendres;
}

// The names the text <texte> of a package.json declares under `grillhouse.engendres`, or null when
// it does not read.
function nomsDeclares(texte) {
  try {
    const declares = JSON.parse(texte)?.grillhouse?.engendres;
    return new Set(
      declares && typeof declares === 'object' && !Array.isArray(declares)
        ? Object.keys(declares)
        : []
    );
  } catch {
    return null;
  }
}

/**
 * The generated files of <engendres> that the package.json of the tree <arbre>, where a lot is
 * applied, still declares under their names. When it does not read (absent, or in conflict), the
 * two versions of the conflict decide (<etages>, `{ base, lot }`, the text of the package.json
 * before the lot and with it): the lot removes the ones its base declares and it does not. All of
 * them when nothing reads.
 * @template {{ nom: string }} E
 * @param {E[]} engendres
 * @param {string} arbre
 * @param {(() => { base: string, lot: string }) | null} [etages]
 * @returns {E[]}
 */
export function encoreDeclares(engendres, arbre, etages = null) {
  let texte = null;
  try {
    texte = readFileSync(path.join(arbre, 'package.json'), 'utf8');
  } catch {
    return engendres;
  }
  const noms = nomsDeclares(texte);
  if (noms) {
    return engendres.filter(e => noms.has(e.nom));
  }
  const { base, lot } = etages?.() ?? { base: '', lot: '' };
  const avant = nomsDeclares(base);
  const avec = nomsDeclares(lot);
  return avant && avec ? engendres.filter(e => !avant.has(e.nom) || avec.has(e.nom)) : engendres;
}

/**
 * What the lots applied in the tree <arbre> ask of the references <references> (`{ nom, entiers }`,
 * those of the project, <duProjet>, among them): `suivis`, the files of <entiers> (the files of
 * the lots a reference writes in full, left out of their application) that follow the lots, the
 * ones no reference still declared writes; `rejouees`, the references of <touchees> (those the
 * lots touch) still declared, whose commands play. A reference of the frame is always declared.
 * @template {{ nom: string, entiers: string[] }} R
 * @param {{ references: R[], duProjet: R[], entiers: string[], touchees: R[], arbre: string }} o
 * @returns {{ suivis: string[], rejouees: R[] }}
 */
export function partDesLots({ references, duProjet, entiers, touchees, arbre }) {
  const declares = encoreDeclares(duProjet, arbre);
  const retire = r => duProjet.includes(r) && !declares.includes(r);
  return {
    suivis: entiers.filter(f => !references.some(r => !retire(r) && couvertPar(r.entiers, f))),
    rejouees: touchees.filter(r => !retire(r)),
  };
}

/**
 * The generated files of <engendres> still declared in the tree <arbre> that the lot of
 * <fichiers> touches: those whose commands play once the lot is applied there.
 * @template {{ nom: string, entiers: string[], lit: string[] }} E
 * @param {E[]} engendres
 * @param {string} arbre
 * @param {string[]} fichiers
 * @returns {E[]}
 */
export const aRejouer = (engendres, arbre, fichiers) =>
  touchesPar(encoreDeclares(engendres, arbre), fichiers);

/**
 * Applies to the tree of <dansCopie> (git in the tree) the files <fichiers> of the lots <lots>
 * (patch files) that an earlier application left out, those of a generated file the lots remove
 * from the key: a deletion is done whatever main's version is, any other change is applied three
 * ways, to the index too. Null, or the refusal.
 * @param {{ lots: string[], fichiers: string[], dansCopie: (...args: string[]) => import('node:child_process').SpawnSyncReturns<string> }} o
 * @returns {string | null}
 */
export function poserLesRetires({ lots, fichiers, dansCopie }) {
  if (!fichiers.length) {
    return null;
  }
  const seuls = fichiers.map(f => `--include=${f}`);
  for (const p of lots) {
    const supprimes = dansCopie('apply', '--summary', ...seuls, p)
      .stdout.split('\n')
      .map(l => /^ delete mode \d+ (.+)$/.exec(l)?.[1])
      .filter(f => f !== undefined && fichiers.includes(f));
    if (
      supprimes.length &&
      dansCopie('rm', '-q', '-f', '--ignore-unmatch', '--', ...supprimes).status !== 0
    ) {
      return `Les fichiers que le lot ${p} supprime ne se retirent pas :\n${supprimes.map(f => `  ${f}`).join('\n')}`;
    }
    const restent = fichiers.filter(f => !supprimes.includes(f)).map(f => `--include=${f}`);
    if (restent.length) {
      const r = dansCopie('apply', '--3way', '--index', '--allow-empty', ...restent, p);
      if (r.status !== 0) {
        return `Le lot ${p} ne s'applique pas :\n${r.stdout}${r.stderr}`;
      }
    }
  }
  return null;
}

/**
 * Resolves the conflicts <conflits> of a rebase stopped in the tree of <dansCopie>, each on a file
 * a generated file writes in full: main's version (`--ours`, the base of the rebase) for one of
 * <vivants>, the generated files the tree still declares; the branch's version, its deletion too,
 * for the others. Whether every conflict is resolved.
 * @param {{ conflits: string[], vivants: { entiers: string[] }[], dansCopie: (...args: string[]) => import('node:child_process').SpawnSyncReturns<string> }} o
 */
export function prendreLesEngendres({ conflits, vivants, dansCopie }) {
  const prendre = (cote, f) =>
    dansCopie('checkout', cote, '--', f).status === 0 && dansCopie('add', '--', f).status === 0;
  return conflits.every(f =>
    vivants.some(e => couvertPar(e.entiers, f))
      ? prendre('--ours', f)
      : prendre('--theirs', f) ||
        dansCopie('rm', '-q', '-f', '--ignore-unmatch', '--', f).status === 0
  );
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
 * passes goes to <ecrire>, the standard output by default: a caller whose standard output is read
 * as data gives its own (scripts/enveloppe/travail-de-la-copie.mjs).
 * @param {{ refs: { nom: string, commande: string, fichiers: string[], cadre?: boolean }[], lancer: (commande: string) => import('node:child_process').SpawnSyncReturns<string>, dansCopie: (...args: string[]) => import('node:child_process').SpawnSyncReturns<string>, ecrire?: (s: string) => void }} o
 * @returns {string | null}
 */
export function regenerer({ refs, lancer, dansCopie, ecrire = s => process.stdout.write(s) }) {
  const etat = () => {
    const r = dansCopie('status', '--porcelain=v1', '-z', '-uall', '--no-renames');
    return r.status === 0 ? r.stdout.split('\0').filter(Boolean) : null;
  };
  const avant = etat();
  if (avant === null) {
    return "L'état de l'arbre ne se lit pas.";
  }
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
  if (apres === null) {
    return "L'état de l'arbre ne se lit pas.";
  }
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
