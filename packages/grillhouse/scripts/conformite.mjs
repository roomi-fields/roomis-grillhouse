// The suite of conformity of the join of the languages: one check per demand that the core makes
// of a module of language (scripts/jointure.d.ts, docs/INTERFACE.md), held on every module, as
// ESLint's RuleTester holds a rule to its cases and Babel's test runner a plugin to its fixtures.
// It carries no test framework: a module's test asks it.
//
// - `cas(langage, exemples, { dans })`: one case per demand, `{ nom, valide, invalide, attendu }`.
//   Each judges the module's answer on an entry and gives the faults it finds, as lines; a sound
//   module gives none on its valid entry, and exactly `attendu` on its defective entry, so that a
//   check that never fails is seen.
// - The entries are the module's (`exemples.preparer(dans)`, for typescript
//   scripts/langages/typescript/exemples.mjs), prepared once per directory.
// - `echecs(langage, exemples, { dans })`: the cases a module fails, `{ nom, raison }`.
//
// The checks:
// - composants: each component of the repository of the entry, its name and its package, its
//   folder absolute and existing;
// - composantDe: each file of the entry lies in the component it names, among `composants`;
// - lecteurs: what each component reads of another, by its code, and each name of the entry no
//   component provides;
// - touches: what changed since the commit of the entry, each component touched, each dependent
//   and each file out of the graph;
// - commandes: each command named is described (`{ script, args }`, the script a file), and asking
//   them writes nothing in the repository;
// - verdict: each task neither green nor unplayed (« à repasser » at 75, red otherwise), the one
//   that plays the tests marked, and each test failed;
// - estUnTest: each path the testwriter writes, with what it is (`joue`, `test`, `matiere`);
// - fichiersEngendres: each generated file whose check finds a gap;
// - gardes: each guard named that the module does not play, and each script it plays that does
//   not exist;
// - elementsDuLot: each file the lot of the entry changes, each changed source the module reads no
//   element of, and each element it adds, changes or removes;
// - matieres: each component of the shared test material of the repository of the entry;
// - joueDesTests: each component of the repository of the entry that plays tests;
// - trouve: each repository of the entry where the module finds its language.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const preparees = new WeakMap();
// The entries of <exemples> under <dans>, prepared once.
function entrees(exemples, dans) {
  if (!preparees.has(exemples)) preparees.set(exemples, new Map());
  const parDossier = preparees.get(exemples);
  if (!parDossier.has(dans)) parDossier.set(dans, exemples.preparer(dans));
  return parDossier.get(dans);
}

// The files under <racine>, `.git` left out, with their instant of change.
function etat(racine) {
  const out = new Map();
  const parcourir = d => {
    for (const n of readdirSync(d)) {
      if (n === '.git') continue;
      const f = path.join(d, n);
      const s = statSync(f);
      if (s.isDirectory()) parcourir(f);
      else out.set(f, s.mtimeMs);
    }
  };
  parcourir(racine);
  return out;
}

// Whether <c> is a command described: an existing script and a list of arguments.
const decrite = c =>
  c !== null &&
  typeof c === 'object' &&
  typeof c.script === 'string' &&
  path.isAbsolute(c.script) &&
  existsSync(c.script) &&
  Array.isArray(c.args) &&
  c.args.every(a => typeof a === 'string');

const nomDeGarde = g => path.basename(String(g?.[0] ?? '')).replace(/\.[cm]?js$/, '');

/**
 * The cases of the join for the module <langage>, its entries <exemples> prepared under <dans>.
 * @param {import('./jointure.js').Langage} langage the module of language
 * @param {import('./conformite.js').Exemples} exemples its entries
 * @param {{ dans?: string }} [options] the directory of the entries
 * @returns {import('./conformite.js').Cas[]}
 */
export function cas(langage, exemples, { dans = tmpdir() } = {}) {
  const e = entrees(exemples, dans);
  const nommer = c => `${c.nom} (${c.paquet ?? 'sans paquet'})`;
  const juges = {
    composants: racine =>
      langage
        .composants(racine)
        .map(c =>
          path.isAbsolute(c.dossier) && existsSync(c.dossier)
            ? nommer(c)
            : `${nommer(c)} : dossier ${c.dossier} absent`
        ),
    composantDe: liste =>
      liste.flatMap(({ fichier, composant }) => {
        const c = langage.composantDe(e.racine, fichier);
        const rel = path.isAbsolute(fichier) ? path.relative(e.racine, fichier) : fichier;
        if (!c) return [`${rel} : hors de tout composant`];
        const connu = langage.composants(e.racine).some(k => k.dossier === c.dossier);
        if (!connu) return [`${rel} : dans ${c.nom}, qui n'est pas un composant`];
        return c.nom === composant ? [] : [`${rel} : dans ${c.nom}, attendu ${composant}`];
      }),
    lecteurs: ({ racine, noms }) => {
      const l = langage.lecteurs(racine, {
        composants: langage.composants(racine),
        noms,
        texte: noms.join(' '),
        nommes: [],
      });
      return [
        ...[...l.lit].flatMap(([c, lus]) => [...lus].map(f => `${c.nom} lit ${f.nom}`)).sort(),
        ...l.sansFournisseur.map(n => `${n} : sans fournisseur`),
      ];
    },
    touches: ({ racine, depuis }) => {
      const t = langage.touches(racine, { depuis });
      return [
        ...t.touches.map(c => `touché ${c.nom}`),
        ...t.dependants.map(c => `dépendant ${c.nom}`),
        ...t.horsGraphe.map(f => `hors ${f}`),
      ];
    },
    commandes: noms => {
      const avant = etat(e.racine);
      const c = langage.commandes(e.racine);
      const out = noms.flatMap(n => {
        if (!Object.hasOwn(c, n)) return [`${n} : absente`];
        return decrite(c[n]) ? [] : [`${n} : pas une commande décrite`];
      });
      if (!isDeepStrictEqual(etat(e.racine), avant)) out.push('commandes écrit dans le dépôt');
      return out;
    },
    verdict: dossier => {
      const v = langage.verdict(dossier);
      return [
        ...v.taches
          .filter(t => t.code !== null && t.code !== 0)
          .map(t =>
            t.code === 75
              ? `${t.paquet}#${t.script} à repasser${t.tests ? ', tests' : ''}`
              : `${t.paquet}#${t.script} rouge (${t.code})${t.tests ? ', tests' : ''}`
          ),
        ...v.rapports.flatMap(r =>
          r.tests
            .filter(t => t.etat === 'failed')
            .map(t => `test ${path.basename(r.fichier)} › ${t.nom}`)
        ),
      ];
    },
    estUnTest: chemins =>
      chemins.flatMap(chemin => {
        const c = langage.estUnTest(chemin, e.racine);
        if (c === null) return [];
        return [`${chemin} : ${['joue', 'test', 'matiere'].filter(k => c[k]).join(', ')}`];
      }),
    fichiersEngendres: racine =>
      langage
        .fichiersEngendres(racine)
        .filter(f => f.verifier(racine).length > 0)
        .map(f => `${f.nom} : en retard`),
    gardes: attendues => {
      const gardes = langage.gardes(e.racine);
      const noms = new Set(gardes.map(nomDeGarde));
      return [
        ...attendues.filter(n => !noms.has(n)).map(n => `${n} : manquante`),
        ...gardes.filter(g => !existsSync(String(g?.[0]))).map(g => `${g?.[0]} : absent`),
      ];
    },
    elementsDuLot: ({ racine, avant, apres }) => {
      const l = langage.elementsDuLot(racine, { avant, apres });
      if (l.etat !== 'fait') return [`impossible : ${l.raison}`];
      return [
        ...l.fichiers.map(f => `fichier ${f}`),
        ...l.horsDuService.map(f => `hors du service ${f}`),
        ...l.elements.map(x => `${x.statut} ${x.id}`),
      ];
    },
    matieres: racine => langage.matieres(racine).map(nommer),
    joueDesTests: racine =>
      langage
        .composants(racine)
        .filter(c => langage.joueDesTests(racine, c))
        .map(c => `${nommer(c)} : joue des tests`),
    trouve: depots => depots.filter(d => langage.trouve(d.racine)).map(d => `${d.nom} : trouvé`),
  };
  const invalides = {
    gardes: [...e.gardes.valide, 'garde-inexistante'],
  };
  const attendus = { gardes: ['garde-inexistante : manquante'] };
  return Object.entries(juges).map(([nom, juger]) => ({
    nom,
    valide: () => juger(e[nom].valide),
    invalide: () => juger(invalides[nom] ?? e[nom].invalide),
    attendu: attendus[nom] ?? e[nom].attendu,
  }));
}

/**
 * The cases the module <langage> fails, a case whose check throws included.
 * @param {import('./jointure.js').Langage} langage the module of language
 * @param {import('./conformite.js').Exemples} exemples its entries
 * @param {{ dans?: string }} [options] the directory of the entries
 * @returns {{ nom: string, raison: string }[]}
 */
export function echecs(langage, exemples, options) {
  return cas(langage, exemples, options).flatMap(c => {
    try {
      const v = c.valide();
      if (v.length) return [{ nom: c.nom, raison: `entrée valide : ${v.join(' ; ')}` }];
      const i = c.invalide();
      if (!isDeepStrictEqual(i, c.attendu)) {
        return [
          {
            nom: c.nom,
            raison: `entrée défectueuse : ${i.join(' ; ') || 'aucune faute'}, attendu ${c.attendu.join(' ; ')}`,
          },
        ];
      }
      return [];
    } catch (err) {
      return [{ nom: c.nom, raison: `lève : ${err?.message ?? err}` }];
    }
  });
}
