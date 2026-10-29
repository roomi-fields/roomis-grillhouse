// The readers of the elements a ticket names, by the code of the module typescript: the part of
// the survey of composants-affectes (scripts/composants-affectes.mjs) that reads the sources, the
// first demand of the join (scripts/jointure.d.ts, `lecteurs`), as « find all references » of a
// language service starts from a published symbol.
//
// - The provider of an element is the component whose interface (`docs/INTERFACE.md`) publishes
//   it: a heading of its generated part (`lire` of scripts/index-interfaces.mjs). A name no
//   interface publishes, no component bears as its package name and no survey by the types
//   resolves, that names a path of the repository or a declaration at the top of a component's
//   production source, is set apart (`sansFournisseur`).
// - The readers of an element are the other components that: its provider's `## Consommateurs`
//   declares for it, or for `*` (`consommateurs`); import it, or the whole provider, in their
//   production code, or in their tests for a package of the shared test material (`import`, the
//   uses of scripts/consommateurs.mjs); hold a test file that names it, as a whole word, and
//   imports the provider (the test file's path).
// - By the types (scripts/references-par-les-types.mjs): each element the text writes, resolved by
//   TypeScript's language service over the components' `tsconfig.json`.
// - What each component reads (`lit`): its imports, and the providers of the elements it reads.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  declares,
  imports,
  lireSiPresent,
  NOM_DE_TEST,
  parcourir,
  utilise,
} from '../../consommateurs.mjs';
import { lire } from '../../index-interfaces.mjs';
import { elementsEcrits, parLesTypes } from '../../references-par-les-types.mjs';

const DOSSIERS_DE_TEST = new Set(['test', 'tests', '__tests__']);
const SAUTES = new Set(['node_modules', 'dist', 'build', 'coverage']);
const SOURCE = /\.[cm]?[jt]sx?$/;
const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const identifiant = nom => new RegExp(`(?<![\\w$])${echapper(nom)}(?![\\w$])`);

// A declaration of <nom> at the top of a source, exported or not.
const DECLARATION_EN_TETE = nom =>
  new RegExp(
    `^(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:function\\*?|class|interface|type|enum|const|let|var)\\s+${echapper(nom)}(?![\\w$])`,
    'm'
  );
// The texts of the production sources of the components <tous>, their tests left out.
function sourcesDe(tous) {
  return tous.flatMap(c =>
    parcourir(c.dir, p => SAUTES.has(path.basename(p)))
      .filter(f => {
        if (!SOURCE.test(f) || NOM_DE_TEST.test(path.basename(f))) return false;
        return !path
          .relative(c.dir, f)
          .split(path.sep)
          .some(d => DOSSIERS_DE_TEST.has(d));
      })
      .map(f => lireSiPresent(f) ?? '')
  );
}

// Each component's published elements and declared consumers, read in its interface.
function interfacesDe(racine, tous) {
  const out = new Map();
  for (const c of tous) {
    const f = path.join(c.dir, 'docs', 'INTERFACE.md');
    if (!existsSync(f)) continue;
    const i = lire(path.relative(racine, f).split(path.sep).join('/'), readFileSync(f, 'utf8'));
    const publies = new Set(
      i.parties.filter(p => !p.consommateurs).map(p => p.titre.replace(/`/g, '').trim())
    );
    const consommateurs = i.parties.find(p => p.consommateurs)?.consommateurs ?? declares('');
    out.set(c, { publies, consommateurs });
  }
  return out;
}

// The test sources of the component <c>: test files, and the sources of its test folders, built
// files left out.
function testsDe(c) {
  return parcourir(c.dir, p => SAUTES.has(path.basename(p))).filter(f => {
    if (!SOURCE.test(f)) return false;
    const rel = path.relative(c.dir, f).split(path.sep);
    return NOM_DE_TEST.test(path.basename(f)) || rel.some(d => DOSSIERS_DE_TEST.has(d));
  });
}

// Whether the source <texte> of the file <fichier> imports the component <p>.
function importe(texte, fichier, p) {
  return imports(texte).some(({ spec }) => {
    if (spec.startsWith('.')) {
      const cible = path.resolve(path.dirname(fichier), spec);
      return cible === p.dir || cible.startsWith(p.dir + path.sep);
    }
    return Boolean(p.paquet) && (spec === p.paquet || spec.startsWith(`${p.paquet}/`));
  });
}

// The readers, by the code, of the elements <noms> that the text <texte> names, among the
// components <composants> of <racine> (`composants` of the module), the components the text
// names <nommes>: `{ elements: [{ nom, fournisseur, lecteurs: [{ composant, par }] }],
// sansFournisseur, types: { etat, raison, elements: [{ nom, declarations: [{ composant, publie }],
// lecteurs: Map composant → Set of « par » }] }, lit: Map composant → Set of composants }`, each
// component one of <composants>.
export function lecteurs(racine, { composants, noms, texte, nommes }) {
  const tous = composants.map(c => ({ nom: c.nom, dir: c.dossier, paquet: c.paquet, c }));
  const exterieur = i => i.c;
  const reel = utilise(racine, tous);
  const ifaces = interfacesDe(racine, tous);
  const tests = new Map();
  const testsDuComposant = c => {
    if (!tests.has(c))
      tests.set(
        c,
        testsDe(c).map(f => ({ f, texte: lireSiPresent(f) ?? '' }))
      );
    return tests.get(c);
  };
  const elements = [];
  const sansFournisseur = [];
  for (const nom of noms) {
    const fournisseurs = tous.filter(c => ifaces.get(c)?.publies.has(nom));
    if (fournisseurs.length === 0) {
      if (!tous.some(c => c.paquet === nom)) sansFournisseur.push(nom);
      continue;
    }
    for (const p of fournisseurs) {
      const lus = [];
      for (const c of tous) {
        if (c === p) continue;
        const par = [];
        const declare =
          ifaces.get(p).consommateurs.get(c.nom) ?? ifaces.get(p).consommateurs.get(c.paquet);
        if (declare && (declare.has(nom) || declare.has('*'))) par.push('consommateurs');
        const n = reel.get(p.nom)?.get(c.nom);
        if (n && (n.has(nom) || n.has('*'))) par.push('import');
        for (const t of testsDuComposant(c)) {
          if (identifiant(nom).test(t.texte) && importe(t.texte, t.f, p)) {
            par.push(path.relative(racine, t.f).split(path.sep).join('/'));
          }
        }
        if (par.length) lus.push({ composant: exterieur(c), par });
      }
      elements.push({ nom, fournisseur: exterieur(p), lecteurs: lus });
    }
  }
  const parInterne = new Map(tous.map(i => [i.c, i]));
  const types = parLesTypes(racine, tous, elementsEcrits(texte), {
    fichiers: new Set(
      [...texte.matchAll(/[\w.-]+\.[cm]?[jt]sx?\b/g)].map(m => path.basename(m[0]))
    ),
    composants: new Set(nommes.map(c => parInterne.get(c))),
  });
  const resolus = new Set(types.elements.map(e => e.ecrit));
  let sources = null;
  const lit = new Map(composants.map(c => [c, new Set()]));
  for (const p of tous) {
    for (const nomLecteur of reel.get(p.nom)?.keys() ?? []) {
      for (const c of tous) if (c.nom === nomLecteur) lit.get(c.c).add(p.c);
    }
  }
  for (const e of elements) for (const l of e.lecteurs) lit.get(l.composant).add(e.fournisseur);
  return {
    elements,
    sansFournisseur: sansFournisseur.filter(
      n =>
        !resolus.has(n) &&
        (existsSync(path.join(racine, n)) ||
          (sources ??= sourcesDe(tous)).some(s => DECLARATION_EN_TETE(n).test(s)))
    ),
    types: {
      etat: types.etat,
      raison: types.raison,
      elements: types.elements.map(e => ({
        nom: e.nom,
        declarations: e.declarations.map(d => ({ composant: exterieur(d.c), publie: d.publie })),
        lecteurs: new Map([...e.lecteurs].map(([c, par]) => [exterieur(c), par])),
      })),
    },
    lit,
  };
}
