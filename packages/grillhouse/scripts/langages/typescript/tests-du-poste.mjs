#!/usr/bin/env node
// The night tests that depend on the poste: a night test that needs what a shared machine (a CI
// runner) does not have bears the tag `@poste` in the comment at its head (`porteLEtiquetteDuPoste`
// of ./vitest-config/cibles.mjs), as Bazel's tags (`manual`, `exclusive`) and pytest's markers live
// with the test; the night of a shared machine leaves it out (`tests-de-nuit --hors-du-poste`), the
// night of the poste plays it. The tag lives in the test, never in a list beside it.
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
// - A night test that depends on the poste without the tag is a finding,
//   `{ fichier, regle: 'poste-sans-etiquette', message }`, naming its marks; a tag without a mark
//   passes. A finding inscribed in the project's debt (`grillhouse-dette.json`, ../../dette.mjs)
//   passes, and the count never rises.
// - The guard writes on its error stream the count of the night tests and of those tagged.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODE, trancher } from '../../dette.mjs';
import { testsDuDepot } from './tailles-des-tests.mjs';
import { estUnTestDeNuit, porteLEtiquetteDuPoste } from './vitest-config/cibles.mjs';
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

// A call that starts the command claude, its arguments to the end of the line.
const CLAUDE =
  /(?<![\w$])(?:spawnSync|spawn|execFileSync|execFile|execaSync|execa)\s*\(\s*['"`]claude['"`]\s*,\s*\[\s*(['"`])?([^'"`\]\s,]*)/g;
// The subcommands of claude a shared machine plays: the plugins of the frame and its version.
const CLAUDE_PARTAGE = new Set(['plugin', '--version']);

/** The marks of what a shared machine does not have, each `{ nom, voit(code) }`. */
export const DEPENDANCES = [
  {
    nom: "l'enveloppe bwrap",
    voit: c =>
      /\bcanWrap\b|['"`]bwrap['"`]|['"`/]enveloppe\/(?:lancer\.sh|enveloppe\.mjs)['"`]|['"`/]enveloppe(?:\.[\w-]+)?['"`]/.test(
        c
      ),
  },
  { nom: 'le bd réel', voit: c => /\bhasBd\b/.test(c) },
  {
    nom: 'un serveur Temporal',
    voit: c => /['"`]server['"`]\s*,\s*['"`]start-dev['"`]/.test(c),
  },
  { nom: 'sccache', voit: c => /['"`]sccache['"`]/.test(c) },
  { nom: 'les binaires du module cargo', voit: c => /['"`/]templates\/cargo\b/.test(c) },
  { nom: 'systemd', voit: c => /['"`](?:systemctl|systemd-run)['"`]/.test(c) },
  { nom: 'le trousseau', voit: c => /\bkeyrings\b/.test(c) },
  { nom: 'la session de l’utilisateur', voit: c => /\/run\/user\//.test(c) },
  {
    nom: 'une séance de claude',
    voit: c => [...c.matchAll(CLAUDE)].some(m => !m[1] || !CLAUDE_PARTAGE.has(m[2])),
  },
];

/**
 * The marks of the poste the test file <fichier> (absolute) shows, with the test material it
 * imports by a relative path, read by <lire> (a path → its text, null when it does not read), in
 * the repository at <racine>: the names of DEPENDANCES, each once, in their order.
 */
export function dependancesDu(fichier, lire = lireLeDisque, racine = path.parse(fichier).root) {
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
  const tout = codes.join('\n');
  return DEPENDANCES.filter(d => d.voit(tout)).map(d => d.nom);
}

/**
 * Each night test of the repository at <racine>: `[{ fichier, etiquete, dependances }]`, `fichier`
 * from its root, `etiquete` whether it bears the tag `@poste`, `dependances` the marks of the poste
 * it shows.
 */
export function testsDeNuitDuDepot(racine) {
  return testsDuDepot(racine)
    .filter(estUnTestDeNuit)
    .map(fichier => {
      const abs = path.join(racine, fichier);
      return {
        fichier,
        etiquete: porteLEtiquetteDuPoste(lireLeDisque(abs) ?? ''),
        dependances: dependancesDu(abs, lireLeDisque, racine),
      };
    });
}

/**
 * The findings of the repository at <racine>, in the debt's form (../../dette.mjs): one
 * `{ fichier, regle, message }` per night test that depends on the poste without the tag `@poste`.
 */
export function verifier(racine, tous = testsDeNuitDuDepot(racine)) {
  return tous
    .filter(t => !t.etiquete && t.dependances.length > 0)
    .map(({ fichier, dependances }) => ({
      fichier,
      regle: REGLE,
      message: `${fichier} : ce test de nuit dépend du poste (${dependances.join(', ')}), qu'une machine partagée n'a pas ; il porte l'étiquette « // @poste: <raison> » dans le commentaire de sa tête, et la nuit de la CI le laisse au poste.`,
    }));
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
      `ℹ️  ${GARDE} : ${tous.length} test(s) de nuit, ${tous.filter(t => t.etiquete).length} laissé(s) au poste (@poste).`,
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
