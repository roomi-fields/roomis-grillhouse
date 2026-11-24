#!/usr/bin/env node
// The night tests that depend on the poste: a night test that needs what a shared machine (a CI
// runner) does not have bears the tag `@poste` in the comment at its head (`porteLEtiquetteDuPoste`
// of ./vitest-config/cibles.mjs), as Bazel's tags (`manual`, `exclusive`) and pytest's markers live
// with the test; the night of a shared machine leaves it out (`tests-de-nuit --hors-du-poste`), the
// night of the poste plays it. The tag lives in the test, never in a list beside it. Mechanism:
// packages/grillhouse/docs/architecture/tests.md, §3.4 (the guards).
//
//   npx grillhouse tests-du-poste   run from the repository root (a guard of grillhouse:gardes)
//
// - The files read are the night tests (`*.nuit.test.*`, `*.nuit.spec.*`) git lists in the
//   repository (`testsDuDepot` of ./tailles-des-tests.mjs), each with the test material it imports
//   by a relative path (a file under a directory `test`, `tests` or `__tests__`, not a test),
//   followed from file to file; a module of the product, or a package imported by its name, is
//   not read.
// - A file depends on the poste when its code (its comments and imports left out) or its material's
//   shows one of the marks of DEPENDANCES: the envelope (`canWrap`, the program `bwrap`, its module,
//   its night tests played by their name, `'enveloppe.lanceur'`), the real bd (`hasBd`), a Temporal
//   server (the arguments `'server', 'start-dev'`), sccache, the binaries of the module cargo (the
//   template of a project of Rust, `templates/cargo`, whose package's creation installs
//   cargo-nextest, cargo-deny and sccache when the machine lacks them), systemd, the
//   keyring, the session of the user (`/run/user/`), or the command claude started for more than
//   `plugin` or `--version` (a session, a model). A mark the reading does not see (a path built at
//   run time, a dependency of the product's code) escapes it: such a test takes the tag by hand.
// - A night test that plays other night tests by their name carries what they ask, as a tag of
//   Bazel reaches the target that runs the tagged one: a string of its code, or of its material's,
//   that ends with the name of a night test (`tests/enveloppe.nuit.spec.ts`) names each night
//   test of the repository whose path is that string or ends with it from a directory. A test
//   named that bears the tag `@poste`, or shows a mark of the poste, is a mark of the poste of
//   the one that names it; one tagged `@equipee`, or showing a mark of equipment, a mark of
//   equipment. A name built at run time is not read.
// - A night test that depends on the poste without the tag is a finding,
//   `{ fichier, regle: 'poste-sans-etiquette', message }`, naming its marks; a tag without a mark
//   passes. A finding inscribed in the project's debt (`grillhouse-dette.json`, ../../dette.mjs)
//   passes, and the count never rises.
// - The guard writes on its error stream the count of the night tests and of those tagged.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODE, trancher } from '../../dette.mjs';
import { testsDuDepot } from './tailles-des-tests.mjs';
import {
  estUnTestDeNuit,
  porteLEtiquetteDuPoste,
  porteLEtiquetteEquipee,
} from './vitest-config/cibles.mjs';
import {
  code,
  IMPORT,
  lireLeDisque,
  MATIERE,
  resoudreRelatif,
  TEST,
} from './vitest-config/lances.mjs';

export const GARDE = 'tests-du-poste';
export const REGLE = 'poste-sans-etiquette';
export const REGLE_EQUIPEE = 'equipee-sans-etiquette';

// A call that starts the command claude, its arguments to the end of the line.
const CLAUDE =
  /(?<![\w$])(?:spawnSync|spawn|execFileSync|execFile|execaSync|execa)\s*\(\s*['"`]claude['"`]\s*,\s*\[\s*(['"`])?([^'"`\]\s,]*)/g;
// The subcommands of claude a shared machine plays: the plugins of the frame and its version.
const CLAUDE_PARTAGE = new Set(['plugin', '--version']);

/**
 * The marks of what a shared machine does not have, each `{ nom, classe, voit(code) }`: the class
 * `equipee` is the equipment of a machine (the tag `@equipee`: the envelope, a Temporal server,
 * sccache, the binaries of the module cargo), the class `poste` what only the poste has (the tag
 * `@poste`: the real bd, systemd, the keyring, the session of the user, a session of claude).
 */
export const DEPENDANCES = [
  {
    nom: "l'enveloppe bwrap",
    classe: 'equipee',
    voit: c =>
      /\bcanWrap\b|['"`]bwrap['"`]|['"`/]enveloppe\/(?:lancer\.sh|enveloppe\.mjs)['"`]|['"`/]enveloppe(?:\.[\w-]+)?['"`]/.test(
        c
      ),
  },
  { nom: 'le bd réel', classe: 'poste', voit: c => /\bhasBd\b/.test(c) },
  {
    nom: 'un serveur Temporal',
    classe: 'equipee',
    voit: c => /['"`]server['"`]\s*,\s*['"`]start-dev['"`]/.test(c),
  },
  { nom: 'sccache', classe: 'equipee', voit: c => /['"`]sccache['"`]/.test(c) },
  {
    nom: 'les binaires du module cargo',
    classe: 'equipee',
    voit: c => /['"`/]templates\/cargo\b/.test(c),
  },
  { nom: 'systemd', classe: 'poste', voit: c => /['"`](?:systemctl|systemd-run)['"`]/.test(c) },
  { nom: 'le trousseau', classe: 'poste', voit: c => /\bkeyrings\b/.test(c) },
  { nom: 'la session de l’utilisateur', classe: 'poste', voit: c => /\/run\/user\//.test(c) },
  {
    nom: 'une séance de claude',
    classe: 'poste',
    voit: c => [...c.matchAll(CLAUDE)].some(m => !m[1] || !CLAUDE_PARTAGE.has(m[2])),
  },
];

// A string of the code that ends with the name of a night test, to the end of its string.
const TEST_NOMME = /['"`]((?:[\w.@-]+\/)*[\w.@-]+\.nuit\.(?:test|spec)\.[cm]?[jt]sx?)['"`]/g;

/**
 * The marks of the poste the test file <fichier> (absolute) shows, with the test material it
 * imports by a relative path, read by <lire> (a path → its text, null when it does not read), in
 * the repository at <racine>: the names of DEPENDANCES, each once, in their order.
 */
export function dependancesDu(fichier, lire = lireLeDisque, racine = path.parse(fichier).root) {
  return DEPENDANCES.filter(d => d.voit(codeDu(fichier, lire, racine))).map(d => d.nom);
}

// The code of the test file <fichier> and of the test material it imports by a relative path,
// from file to file, their comments and imports left out.
function codeDu(fichier, lire, racine) {
  const vus = new Set();
  const codes = [];
  const suivre = f => {
    if (vus.has(f)) {
      return;
    }
    vus.add(f);
    const texte = lire(f) ?? '';
    codes.push(code(texte));
    for (const m of texte.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
      if (!spec?.startsWith('.')) {
        continue;
      }
      const cible = resoudreRelatif(f, spec, lire);
      const rel = cible && path.relative(racine, cible).split(path.sep).join('/');
      if (rel && MATIERE.test(rel) && !TEST.test(rel)) {
        suivre(cible);
      }
    }
  };
  suivre(fichier);
  return codes.join('\n');
}

// The night tests of <fichiers> (each from the root) the code <tout> of <fichier> names: those
// whose path is a string of the code, or ends with it from a directory; itself left out.
function nommesPar(fichier, tout, fichiers) {
  const noms = new Set([...tout.matchAll(TEST_NOMME)].map(m => m[1].replace(/^(?:\.\/)+/, '')));
  return fichiers.filter(f => f !== fichier && [...noms].some(n => f === n || f.endsWith(`/${n}`)));
}

/**
 * Each night test of the repository at <racine>: `[{ fichier, etiquete, equipee, marques }]`,
 * `fichier` from its root, `etiquete` whether it bears the tag `@poste`, `equipee` whether it bears
 * the tag `@equipee`, `marques` the marks it shows, `{ nom, classe }` each: those of
 * DEPENDANCES, then one per class for each night test it names that asks for that class.
 * @param {string} racine the root of the repository
 * @returns {{ fichier: string, etiquete: boolean, equipee: boolean, marques: { nom: string, classe: string }[] }[]}
 */
export function testsDeNuitDuDepot(racine) {
  const fichiers = testsDuDepot(racine).filter(estUnTestDeNuit);
  const lus = fichiers.map(fichier => {
    const abs = path.join(racine, fichier);
    const texte = lireLeDisque(abs) ?? '';
    const tout = codeDu(abs, lireLeDisque, racine);
    return {
      fichier,
      etiquete: porteLEtiquetteDuPoste(texte),
      equipee: porteLEtiquetteEquipee(texte),
      marques: DEPENDANCES.filter(d => d.voit(tout)).map(({ nom, classe }) => ({ nom, classe })),
      nommes: nommesPar(fichier, tout, fichiers),
    };
  });
  const parFichier = new Map(lus.map(t => [t.fichier, t]));
  // Whether the night test <t> asks for the class <classe>: its tag, or a mark it shows itself.
  const demande = (t, classe) =>
    (classe === 'poste' ? t.etiquete : t.equipee) || t.marques.some(m => m.classe === classe);
  return lus.map(({ nommes, ...t }) => ({
    ...t,
    marques: [
      ...t.marques,
      ...['poste', 'equipee'].flatMap(classe =>
        nommes
          .filter(n => demande(parFichier.get(n), classe))
          .map(n => ({
            nom: `${n}, ${classe === 'poste' ? 'test du poste' : 'test équipé'} joué par son nom`,
            classe,
          }))
      ),
    ],
  }));
}

/**
 * The findings of the repository at <racine>, in the debt's form (../../dette.mjs): one
 * `{ fichier, regle, message }` per night test that shows a mark of the poste without the tag
 * `@poste` (REGLE), and one per night test that shows a mark of equipment without the tag
 * `@equipee` (REGLE_EQUIPEE).
 */
export function verifier(racine, tous = testsDeNuitDuDepot(racine)) {
  const noms = (marques, classe) => marques.filter(m => m.classe === classe).map(m => m.nom);
  return tous.flatMap(({ fichier, etiquete, equipee, marques }) => {
    /** @type {{ fichier: string, regle: string, message: string }[]} */
    const constats = [];
    const poste = noms(marques, 'poste');
    if (!etiquete && poste.length > 0) {
      constats.push({
        fichier,
        regle: REGLE,
        message: `${fichier} : ce test de nuit dépend du poste (${poste.join(', ')}), qu'aucun exécuteur n'a ; il porte l'étiquette « // @poste: <raison> » dans le commentaire de sa tête, et la nuit de PC3 seule le joue.`,
      });
    }
    const equipement = noms(marques, 'equipee');
    if (!equipee && equipement.length > 0) {
      constats.push({
        fichier,
        regle: REGLE_EQUIPEE,
        message: `${fichier} : ce test de nuit exige l'équipement d'une machine (${equipement.join(', ')}) ; il porte l'étiquette « // @equipee: <raison> » dans le commentaire de sa tête, et un exécuteur sans équipement le laisse.`,
      });
    }
    return constats;
  });
}

/**
 * The guard on the repository at <racine>: `{ lignes, code }`, the refusals then the lines of the
 * debt and the count, 1 when a finding is refused, else 0.
 * @param {string} racine the root of the repository
 * @param {NodeJS.ProcessEnv} [env] the environment (the debt's mode, the results directory)
 */
export function rapport(racine, env = process.env) {
  const tous = testsDeNuitDuDepot(racine);
  const { refus, lignes } = trancher(
    racine,
    GARDE,
    verifier(racine, tous),
    env[MODE] || undefined,
    env
  );
  return {
    lignes: [
      ...refus.map(r => `⛔ ${r.message}`),
      ...lignes,
      `ℹ️  ${GARDE} : ${tous.length} test(s) de nuit, ${tous.filter(t => t.etiquete).length} laissé(s) au poste (@poste), ${tous.filter(t => t.equipee).length} équipé(s) (@equipee).`,
    ],
    code: refus.length ? 1 : 0,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { lignes, code: sortie } = rapport(process.cwd());
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  process.exitCode = sortie;
}
