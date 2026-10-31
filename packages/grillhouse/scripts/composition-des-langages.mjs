// The composition of the modules of language a project declares (scripts/langages.mjs,
// `langageDe`), as Bazel and Nx run one list of targets, one tool per language, each target of one
// language alone: a project has several languages, a package one. The composition answers what the
// core asks of a language (scripts/jointure.d.ts, `Composition`), by asking each module.
//
// - One module declared: the composition is the module itself.
// - The components are each module's, in the order of the declaration. A folder two modules claim
//   is refused, named with both languages: a package has one language. A file belongs to the
//   module of the component that holds it, the deepest (`moduleDuFichier`); a file out of every
//   component stays the core's, as with one language: the first module, in the order of the
//   declaration, whose answer is not null judges it (`estUnTest`, `manifestes.horsDesTests`).
// - Whether a component plays tests, the readers of components and the components touched are
//   each module's on its own components, the results joined: a name without supplier is without
//   supplier in every module, a file out of the graph is out of every module's graph.
// - The elements of a lot are every module's; a changed source that no element reads is the one
//   its own module names (every module, for a file out of every component); the lot is impossible
//   when one module cannot read it, its reason named with its language.
// - The verdict of a run is every module's, read in the same results directory, where each module
//   writes under names of its own (scripts/resultats.mjs).
// - Each command a module describes is the composed command by its name
//   (./commandes-composees.mjs), which plays it in each module that describes it and joins their
//   codes.
// - The guards, the generated files, the migrations, the shared test material: every module's, in
//   the order of the declaration; but the index of the interfaces, which each module generates:
//   one of the core (./index-interfaces.mjs), assembled from each module's entries, its command
//   (`index-interfaces`), its generated file and its guard in place of the modules', at the place
//   of the first. What the role lock, the envelope and the update ask (the lock
//   files, the outputs, the rules of the roles, the tools, the binaries, the directories to
//   ignore): the union, each once.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The scripts of the commands above the composition, named by their paths, never imported: the
// one that plays a composed command (./commandes-composees.mjs), and the index of the interfaces
// (./index-interfaces.mjs).
const ICI = path.dirname(fileURLToPath(import.meta.url));
const COMMANDES_COMPOSEES = path.join(ICI, 'commandes-composees.mjs');
const INDEX = path.join(ICI, 'index-interfaces.mjs');
/** The index of the interfaces, from the root. */
export const INDEX_DES_INTERFACES = 'docs/agents/index-des-interfaces.md';

/**
 * The index of the interfaces of the project at <racine>, from the modules <modules>: each one's
 * entries (`entreesDeLIndex`), in the order of their paths, an interface two modules give (the
 * root's) once, the first module's.
 * @param {string} racine
 * @param {import('./jointure.js').Langage[]} modules
 */
export function indexDesInterfaces(racine, modules) {
  const parRel = new Map();
  for (const m of modules) {
    for (const e of m.entreesDeLIndex(racine)) {
      if (!parRel.has(e.rel)) {
        parRel.set(e.rel, e.lignes);
      }
    }
  }
  const corps = [...parRel]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([, lignes]) => lignes);
  return [
    '# Index des interfaces',
    '',
    'Généré par `npx grillhouse index-interfaces` depuis les `INTERFACE.md` de chaque langage ; ne pas éditer.',
    "Une ligne par composant, puis, selon son langage, une par élément qu'il fournit ; l'interface donne le détail.",
    '',
    ...corps,
  ].join('\n');
}

/**
 * The findings of the check of the index of the project at <racine>: none when it is up to date.
 * @param {string} racine
 * @param {import('./jointure.js').Langage[]} modules
 */
export function indexEnRetard(racine, modules) {
  const cible = path.join(racine, INDEX_DES_INTERFACES);
  const present = existsSync(cible) ? readFileSync(cible, 'utf8') : '';
  return present === indexDesInterfaces(racine, modules)
    ? []
    : [
        {
          fichier: INDEX_DES_INTERFACES,
          message: `${INDEX_DES_INTERFACES} n'est pas à jour avec les interfaces : npx grillhouse index-interfaces le régénère.`,
        },
      ];
}

const unique = liste => [...new Set(liste)];
// The index of the interfaces, which each module generates, and its command: one of the core
// for several languages (./index-interfaces.mjs).
const INDEX_COMMANDE = 'index-interfaces';
const deLIndex = e => e.fichiers.includes(INDEX_DES_INTERFACES);
const sous = (dossier, abs) => abs === dossier || abs.startsWith(`${dossier}${path.sep}`);

/**
 * The components of the modules <modules> in the repository at <racine>, each with its module:
 * `[{ composant, module }]`, in the order of the declaration. Throws when two modules claim a
 * folder.
 * @param {import('./jointure.js').Langage[]} modules
 * @param {string} racine
 */
export function composantsRanges(modules, racine) {
  const ranges = modules.flatMap(module =>
    module.composants(racine).map(composant => ({ composant, module }))
  );
  const parDossier = new Map();
  for (const r of ranges) {
    const deja = parDossier.get(r.composant.dossier);
    if (deja && deja.module !== r.module) {
      const rel = path.relative(racine, r.composant.dossier) || '.';
      throw new Error(
        `⛔ ${rel} : revendiqué par ${deja.module.nom} et ${r.module.nom} ; un paquet n'a qu'un seul langage.`
      );
    }
    parDossier.set(r.composant.dossier, r);
  }
  return ranges;
}

/**
 * The module of the component that holds <fichier> (absolute, or from <racine>), the deepest;
 * null when no component of <modules> holds it.
 * @param {import('./jointure.js').Langage[]} modules
 * @param {string} racine
 * @param {string} fichier
 */
export function moduleDuFichier(modules, racine, fichier) {
  return rangeDe(composantsRanges(modules, racine), racine, fichier)?.module ?? null;
}

function rangeDe(ranges, racine, fichier) {
  const abs = path.resolve(racine, fichier);
  return (
    ranges
      .filter(r => sous(r.composant.dossier, abs))
      .sort((a, b) => b.composant.dossier.length - a.composant.dossier.length)[0] ?? null
  );
}

// The answer of the module of <fichier>'s component, else the first of <modules> not null.
function premiereReponse(modules, racine, fichier, demander) {
  const proprietaire = moduleDuFichier(modules, racine, fichier);
  if (proprietaire) {
    return demander(proprietaire);
  }
  for (const m of modules) {
    const r = demander(m);
    if (r !== null) {
      return r;
    }
  }
  return null;
}

/**
 * The composition of <modules>, in the order of the declaration; the module itself for one.
 * @param {import('./jointure.js').Langage[]} modules
 * @returns {import('./jointure.js').Composition}
 */
export function composer(modules) {
  if (modules.length === 1) {
    return modules[0];
  }
  const ranges = racine => composantsRanges(modules, racine);
  const moduleDe = (racine, fichier) => moduleDuFichier(modules, racine, fichier);
  const moduleDuComposant = (racine, composant) =>
    ranges(racine).find(r => r.composant.dossier === composant.dossier)?.module ?? null;
  const leurs = (racine, liste) =>
    new Map(modules.map(m => [m, liste.filter(c => moduleDuComposant(racine, c) === m)]));
  return {
    nom: modules.map(m => m.nom).join('+'),
    outils: unique(modules.flatMap(m => m.outils)),
    binaires: Object.assign({}, ...modules.map(m => m.binaires)),
    ignorer: unique(modules.flatMap(m => m.ignorer)),
    sorties: {
      ecrites: unique(modules.flatMap(m => m.sorties.ecrites)),
      propres: unique(modules.flatMap(m => m.sorties.propres)),
      lues: unique(modules.flatMap(m => m.sorties.lues)),
    },
    droits: unique(modules.flatMap(m => m.droits)),
    composants: racine => ranges(racine).map(r => r.composant),
    composantDe: (racine, fichier) => rangeDe(ranges(racine), racine, fichier)?.composant ?? null,
    matieres: racine => modules.flatMap(m => m.matieres(racine)),
    joueDesTests: (racine, composant) =>
      moduleDuComposant(racine, composant)?.joueDesTests(racine, composant) ?? false,
    lecteurs(racine, o) {
      const composants = leurs(racine, o.composants);
      const nommes = leurs(racine, o.nommes);
      const parts = modules
        .filter(m => composants.get(m).length)
        .map(m =>
          m.lecteurs(racine, { ...o, composants: composants.get(m), nommes: nommes.get(m) })
        );
      const pasFaits = parts.filter(p => p.types.etat !== 'fait');
      return {
        elements: parts.flatMap(p => p.elements),
        sansFournisseur: parts.length
          ? parts[0].sansFournisseur.filter(n => parts.every(p => p.sansFournisseur.includes(n)))
          : [...o.noms],
        types: {
          etat: pasFaits[0]?.types.etat ?? 'fait',
          raison:
            pasFaits
              .map(p => p.types.raison)
              .filter(Boolean)
              .join(' ; ') || null,
          elements: parts.flatMap(p => p.types.elements),
        },
        lit: new Map(parts.flatMap(p => [...p.lit])),
        parLesTests: new Map(parts.flatMap(p => [...p.parLesTests])),
      };
    },
    touches(racine, o) {
      const parts = modules.map(m => m.touches(racine, o));
      const touches = parts.flatMap(p => p.touches);
      const vus = new Set(touches.map(c => c.dossier));
      return {
        touches,
        dependants: parts.flatMap(p => p.dependants).filter(c => !vus.has(c.dossier)),
        horsGraphe: parts[0].horsGraphe.filter(f => parts.every(p => p.horsGraphe.includes(f))),
      };
    },
    elementsDuLot(racine, o) {
      const parts = modules.map(m => ({ m, l: m.elementsDuLot(racine, o) }));
      const impossibles = parts.filter(p => p.l.etat !== 'fait');
      const horsDuService = unique(parts.flatMap(p => p.l.horsDuService)).filter(f => {
        const proprietaire = moduleDe(racine, f);
        return parts
          .filter(p => (proprietaire ? p.m === proprietaire : true))
          .every(p => p.l.horsDuService.includes(f));
      });
      return {
        etat: impossibles.length ? 'impossible' : 'fait',
        raison: impossibles.length
          ? impossibles.map(p => `${p.m.nom} : ${p.l.raison}`).join(' ; ')
          : null,
        elements: parts.flatMap(p => p.l.elements),
        horsDuService: horsDuService.sort(),
        fichiers: unique(parts.flatMap(p => p.l.fichiers)).sort(),
      };
    },
    commandes: racine =>
      Object.fromEntries(
        unique(modules.flatMap(m => Object.keys(m.commandes(racine)))).map(nom => [
          nom,
          nom === INDEX_COMMANDE
            ? { script: INDEX, args: [] }
            : { script: COMMANDES_COMPOSEES, args: [nom] },
        ])
      ),
    verdict(dossier) {
      const parts = modules.map(m => m.verdict(dossier));
      return {
        rapports: parts.flatMap(p => p.rapports),
        taches: parts.flatMap(p => p.taches),
      };
    },
    estUnTest: (chemin, racine) =>
      premiereReponse(modules, racine, chemin, m => m.estUnTest(chemin, racine)),
    manifestes: {
      verrous: unique(modules.flatMap(m => m.manifestes.verrous)),
      horsDesTests: (chemin, racine, avant, apres) =>
        premiereReponse(modules, racine, chemin, m =>
          m.manifestes.horsDesTests(chemin, racine, avant, apres)
        ),
    },
    fichiersEngendres(racine) {
      const tous = modules.flatMap(m => m.fichiersEngendres(racine));
      const index = tous.filter(deLIndex);
      if (index.length === 0) {
        return tous;
      }
      const reste = tous.filter(e => !deLIndex(e));
      reste.splice(tous.findIndex(deLIndex), 0, {
        nom: index[0].nom,
        commande: `node ${JSON.stringify(INDEX)}`,
        fichiers: [INDEX_DES_INTERFACES],
        lit: unique(index.flatMap(e => e.lit)),
        gardes: unique(index.flatMap(e => e.gardes)),
        entiers: [INDEX_DES_INTERFACES],
        verifier: r => indexEnRetard(r, modules),
      });
      return reste;
    },
    gardes(racine) {
      const tous = modules.flatMap(m => m.gardes(racine));
      const noms = new Set(
        modules
          .flatMap(m => m.fichiersEngendres(racine))
          .filter(deLIndex)
          .flatMap(e => e.gardes)
      );
      if (noms.size === 0) {
        return tous;
      }
      const deLaGarde = g => noms.has(path.basename(g[0]).replace(/\.[cm]?js$/, ''));
      const reste = tous.filter(g => !deLaGarde(g));
      const i = tous.findIndex(deLaGarde);
      reste.splice(i < 0 ? reste.length : i, 0, [INDEX, '--verifier']);
      return reste;
    },
    migrations: modules.flatMap(m => m.migrations),
  };
}
