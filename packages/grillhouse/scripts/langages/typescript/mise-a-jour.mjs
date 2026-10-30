// What the module typescript brings to the update of a project (`grillhouse maj`,
// scripts/grillhouse-maj.mjs), the demand `miseAJour` of the join (scripts/jointure.d.ts), as the
// `init` generator of a plugin of Nx brings its tool to a workspace. The core writes the root
// package.json after, and reports the lines.
//
// - The template: `templates/projet/` of the frame's files, whose package.json gives the frame's
//   scripts and the versions of the tools.
// - A project that runs Vitest (its `test` script names it, or `vitest` is in the `dependencies` or
//   `devDependencies` of its root `package.json` or of one of its packages, the workspaces as npm
//   maps them, read by `paquets` of scripts/paquets.mjs: a package out of the frame
//   (`docs/agents/hors-cadre.txt`), which Turborepo never tests, counts for nothing) has its root
//   scripts `test`, `test:unit`, `test:forcer` and `verifier` become the template's (`npm test`, the
//   tests as Turborepo's tasks with its cache; `npm run test:forcer`, the same played for real;
//   `npm run verifier`, ./verifier.mjs, the guards and the tests beside each other), when the
//   Vitest of the project's root (`npx --no-install vitest`, the one `test:unit` calls) satisfies
//   the range the template declares for `vitest`. Where the root resolves no Vitest or another
//   version, the project's scripts stay (the frame's included) and the report names the version
//   found and the range required. A `test` that runs anything else stays. A repository of packages
//   keeps its tests in its packages: its root gets no `test:unit`, and the frame's own leaves.
// - A package of the frame whose code imports the frame's package (a file of its `src/` out of the
//   tests, its imports read by TypeScript's `preProcessFile`) declares it in its `dependencies`, as
//   npm puts there what the published code imports: a declaration in its `devDependencies` moves
//   there with its range, else the range the root declares (else `^<version>`).
// - The frame's base configuration of Vitest is the package's (`@roomi-fields/grillhouse/vitest-config`),
//   which each Vitest configuration imports by its name: in a project with `workspaces`, each
//   package of the frame that plays tests (`joueDesTests`: its script `test:unit`) declares the
//   frame's package in its `devDependencies`, at the range the root declares (else `^<version>`),
//   a declaration it holds kept. The update writes no Vitest configuration.
// - The typing: each package of TypeScript (a `tsconfig.json`) that has no `typecheck` script
//   receives the template's, `tsc -p tsconfig.json --noEmit`: each package of the frame in a
//   project with `workspaces` (the root's `typecheck` stays the project's), the root in a project
//   without. Witness: BPScript 320.21.4, whose type errors in test/ showed only at night.
// - `turbo.json` is the project's own file. A project with no `turbo.json` receives the frame's
//   template of its form: `templates/turbo/paquets.json` when its package.json declares
//   `workspaces`, else `templates/turbo/sans-paquets.json`. A `turbo.json` present is never written
//   again; only the generator of the packages' turbo.json writes in it.
// - The generators: the boundaries' configuration (`.dependency-cruiser.cjs`), the index of the
//   interfaces, and the turbo.json of each package in a repository with `workspaces`.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CODE, paquets, TYPAGE } from '../../paquets.mjs';
import { sources } from '../../services-du-noyau.mjs';
import { estUnTest } from './regle-des-tests.mjs';
import { SCRIPT_DES_TESTS } from './script-des-tests.mjs';

// The frame's package, as a project declares it, and its base configuration of Vitest.
const PAQUET_DU_CADRE = '@roomi-fields/grillhouse';
const CONFIG_VITEST = `${PAQUET_DU_CADRE}/vitest-config`;
// The root scripts of the tests, written together from the template.
const SCRIPTS_DES_TESTS = ['test', SCRIPT_DES_TESTS, 'test:forcer', 'verifier'];
const CHAMPS_INSTALLES = ['dependencies', 'devDependencies', 'optionalDependencies'];
// The frame's templates of `turbo.json`, one per form of repository, read in the source.
const TURBO_PAQUETS = 'templates/turbo/paquets.json';
const TURBO_SANS_PAQUETS = 'templates/turbo/sans-paquets.json';

const ecrireJson = (f, v) => writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);
// <deps> written sorted by name, as npm writes them.
const trie = deps =>
  Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b, 'en')));
// The range at which the root package.json <p> declares the frame's package, or undefined.
const plageDeLaRacine = p =>
  CHAMPS_INSTALLES.map(c => p[c]?.[PAQUET_DU_CADRE]).find(v => v !== undefined);

// Whether `vitest` is declared in the dependencies of the package.json <p> (read at <dossier>) or of
// one of its packages of the frame.
const declareVitest = (dossier, p) => {
  const a = pkg => Boolean(pkg?.dependencies?.vitest ?? pkg?.devDependencies?.vitest);
  return a(p) || paquets(dossier).some(({ pkg, hors }) => !hors && a(pkg));
};
// The version of the Vitest the project's root resolves, as `test:unit` calls it
// (`npx --no-install vitest --version`); null when it answers none.
const vitestDeLaRacine = projet => {
  const r = spawnSync('npx', ['--no-install', 'vitest', '--version'], {
    cwd: projet,
    encoding: 'utf8',
  });
  return r.status === 0 ? (/vitest\/(\d+\.\d+\.\d+\S*)/.exec(r.stdout)?.[1] ?? null) : null;
};

// The frame's tests (Turborepo's tasks) in place of a project's own test that runs Vitest, in the
// root package.json <p>, from the template's <modele>: `{ test, vitest }`, each null when nothing
// is said.
function poserLesTests(projet, p, modele) {
  const testDuCadre = modele.scripts?.test;
  const testDuProjet = p.scripts?.test;
  const vitestExige = modele.devDependencies?.vitest ?? modele.dependencies?.vitest;
  const lanceVitest =
    typeof testDuCadre === 'string' &&
    typeof testDuProjet === 'string' &&
    (testDuProjet === testDuCadre || /\bvitest\b/.test(testDuProjet) || declareVitest(projet, p));
  if (!lanceVitest) {
    return { test: null, vitest: null };
  }
  // semver, required here alone: the module loads where the package's dependencies are not
  // installed (a copy of the frame's scripts, the night of a trial), and only this update reads it.
  const semver = createRequire(import.meta.url)('semver');
  // The root must resolve the Vitest the frame requires (`test:unit` calls it).
  const trouvee = typeof vitestExige === 'string' ? vitestDeLaRacine(projet) : null;
  const convient =
    typeof vitestExige !== 'string' || (trouvee !== null && semver.satisfies(trouvee, vitestExige));
  if (!convient) {
    return { test: null, vitest: { trouvee, exigee: vitestExige } };
  }
  for (const nom of SCRIPTS_DES_TESTS) {
    const script = modele.scripts?.[nom];
    if (typeof script !== 'string') {
      continue;
    }
    // A repository of packages keeps its tests in its packages, as Turborepo does.
    if (p.workspaces !== undefined && nom === SCRIPT_DES_TESTS) {
      if (p.scripts[nom] === script) {
        delete p.scripts[nom];
      }
      continue;
    }
    p.scripts[nom] = script;
  }
  return {
    test: testDuProjet !== testDuCadre ? { ancien: testDuProjet, nouveau: testDuCadre } : null,
    vitest: null,
  };
}

// Whether the code of the package at <dossier> of <projet> imports the frame's package (an entry of
// it): a file of its `src/` (CODE) out of the tests, its imports read by TypeScript
// (`preProcessFile`), a comment or a string importing nothing.
function codeImporteLeCadre(projet, dossier) {
  const ts = createRequire(import.meta.url)('typescript');
  return sources(projet, dossier)
    .filter(f => new RegExp(CODE).test(f) && !estUnTest(f, projet)?.test)
    .some(f =>
      ts
        .preProcessFile(readFileSync(path.join(projet, f), 'utf8'), true, true)
        .importedFiles.some(
          ({ fileName: m }) => m === PAQUET_DU_CADRE || m.startsWith(`${PAQUET_DU_CADRE}/`)
        )
    );
}

// Declares the frame's package in the dependencies of each package of the frame whose code imports
// it (see the header): { nom, paquets }, or null when nothing changes.
function declarerDependanceDuCadre(projet, p, version) {
  if (p.workspaces === undefined) {
    return null;
  }
  const racine = plageDeLaRacine(p);
  const declarants = [];
  for (const { dossier, pkg, hors } of paquets(projet)) {
    const declare = ['dependencies', 'optionalDependencies'].some(
      c => pkg[c]?.[PAQUET_DU_CADRE] !== undefined
    );
    if (hors || declare || !codeImporteLeCadre(projet, dossier)) {
      continue;
    }
    const { [PAQUET_DU_CADRE]: dev, ...autres } = pkg.devDependencies ?? {};
    pkg.dependencies = trie({
      ...(pkg.dependencies ?? {}),
      [PAQUET_DU_CADRE]: dev ?? racine ?? `^${version}`,
    });
    if (dev !== undefined) {
      pkg.devDependencies = autres;
    }
    ecrireJson(path.join(projet, dossier, 'package.json'), pkg);
    declarants.push(dossier);
  }
  return declarants.length > 0 ? { nom: PAQUET_DU_CADRE, paquets: declarants } : null;
}

// Declares the frame's package, whose base configuration of Vitest each Vitest configuration
// imports, in the devDependencies of each package of the frame that plays tests (see the header):
// { nom, paquets }, or null when nothing changes.
function poserConfigVitest(projet, p, version, joueDesTests) {
  if (p.workspaces === undefined) {
    return null;
  }
  const testes = paquets(projet).filter(
    ({ dossier, pkg, hors }) =>
      !hors &&
      joueDesTests(projet, {
        dossier: path.join(projet, dossier),
        nom: path.basename(dossier),
        paquet: pkg.name ?? null,
      })
  );
  const racine = plageDeLaRacine(p);
  const declarants = [];
  for (const { dossier, pkg } of testes) {
    if (CHAMPS_INSTALLES.some(c => pkg[c]?.[PAQUET_DU_CADRE] !== undefined)) {
      continue;
    }
    pkg.devDependencies = trie({
      ...(pkg.devDependencies ?? {}),
      [PAQUET_DU_CADRE]: racine ?? `^${version}`,
    });
    ecrireJson(path.join(projet, dossier, 'package.json'), pkg);
    declarants.push(dossier);
  }
  return declarants.length > 0 ? { nom: PAQUET_DU_CADRE, paquets: declarants } : null;
}

// Gives the typing script of the template, <script>, to each package of TypeScript that has none
// (see the header): { script, paquets } (`.` for the root), or null when nothing changes.
function poserTypage(projet, p, script) {
  if (typeof script !== 'string') {
    return null;
  }
  const types = dossier => existsSync(path.join(projet, dossier, 'tsconfig.json'));
  const sans = pkg => typeof pkg.scripts?.[TYPAGE] !== 'string';
  const declarants = [];
  if (p.workspaces === undefined) {
    if (types('.') && sans(p)) {
      p.scripts = { ...(p.scripts ?? {}), [TYPAGE]: script };
      declarants.push('.');
    }
  } else {
    for (const { dossier, pkg, hors } of paquets(projet)) {
      if (hors || !types(dossier) || !sans(pkg)) {
        continue;
      }
      pkg.scripts = { ...(pkg.scripts ?? {}), [TYPAGE]: script };
      ecrireJson(path.join(projet, dossier, 'package.json'), pkg);
      declarants.push(dossier);
    }
  }
  return declarants.length > 0 ? { script, paquets: declarants } : null;
}

// Writes the `turbo.json` of the project at <projet>, when it has none, from the source's template
// of its form (`workspaces` declared in <p>); the template written, or null.
function poserTurbo(projet, p, source) {
  const f = path.join(projet, 'turbo.json');
  if (existsSync(f)) {
    return null;
  }
  const gabarit = p.workspaces !== undefined ? TURBO_PAQUETS : TURBO_SANS_PAQUETS;
  if (!existsSync(path.join(source, gabarit))) {
    return null;
  }
  copyFileSync(path.join(source, gabarit), f);
  return gabarit;
}

// The lines of the report of the share <b>.
function rapport(b) {
  const lignes = [];
  if (b.configVitest) {
    const { nom, paquets: declarants } = b.configVitest;
    lignes.push(
      `Configuration de base de Vitest : ${nom} déclaré dans les devDependencies de ${declarants.join(', ')}. \`npm install\` relie le paquet. La configuration Vitest de chaque paquet l'importe par son nom : \`import base from '${CONFIG_VITEST}'\`.`
    );
  }
  if (b.dependanceDuCadre) {
    const { nom, paquets: declarants } = b.dependanceDuCadre;
    lignes.push(
      `Dépendance d'exécution : ${nom} déclaré dans les dependencies de ${declarants.join(', ')}, dont le code hors des tests importe une entrée du paquet. \`npm install\` relie le paquet.`
    );
  }
  if (b.typage) {
    lignes.push(
      `Typage : \`${b.typage.script}\` écrit dans ${b.typage.paquets.join(', ')} (le script typecheck, ses sources et ses tests, que son tsconfig.json inclut) ; \`npm run verifier\` le joue à côté des gardes et des tests.`
    );
  }
  if (b.turbo) {
    lignes.push(
      `turbo.json écrit depuis le gabarit du cadre ${b.turbo} ; il est au projet, la mise à jour n'y touche plus.`
    );
  }
  if (b.vitest) {
    lignes.push(
      `Vitest : la racine résout ${b.vitest.trouvee ?? 'aucune version'}, le cadre exige ${b.vitest.exigee} ; le script test du projet reste tel quel.`
    );
  }
  if (b.test) {
    lignes.push(
      `Script test : \`${b.test.ancien}\` remplacé par le test du cadre \`${b.test.nouveau}\` (Turborepo : construction, puis tests ; une tâche dont rien n'a bougé est relue de son cache ; \`npm run verifier\` joue les gardes et les tests).`
    );
  }
  return lignes;
}

/** @type {import('../../jointure.js').MiseAJour['appliquer']} */
function appliquer(projet, { p, modele, source, version }, joueDesTests) {
  p.scripts ??= {};
  const { test, vitest } = poserLesTests(projet, p, modele);
  const bilan = {
    test,
    vitest,
    dependanceDuCadre: declarerDependanceDuCadre(projet, p, version),
    configVitest: poserConfigVitest(projet, p, version, joueDesTests),
    typage: poserTypage(projet, p, modele.scripts?.[TYPAGE]),
    turbo: poserTurbo(projet, p, source),
  };
  return {
    bilan,
    lignes: rapport(bilan),
    installer: bilan.configVitest !== null || bilan.dependanceDuCadre !== null,
    sansVerifier: bilan.vitest
      ? 'La ligne « Vitest : » ci-dessus dit pourquoi : installe à la racine le Vitest que le cadre exige, puis relance `npx grillhouse maj`, qui écrit le script.'
      : 'La mise à jour l’écrit dans un projet testé par Vitest ; sinon, écris-le pour ses tests.',
  };
}

/**
 * The share of the module typescript in the update, its components playing tests by <joueDesTests>.
 * @param {(racine: string, c: import('../../jointure.js').Composant) => boolean} joueDesTests
 * @returns {import('../../jointure.js').MiseAJour}
 */
export const miseAJour = joueDesTests => ({
  gabarit: 'templates/projet',
  appliquer: (projet, o) => appliquer(projet, o, joueDesTests),
  generateurs: [
    { commande: 'frontieres', args: ['--ecrire'], sortie: '.dependency-cruiser.cjs' },
    { commande: 'index-interfaces', args: [], sortie: 'docs/agents/index-des-interfaces.md' },
    { commande: 'turbo-des-paquets', args: ['--ecrire'], sortie: null },
  ],
  // No binary of the machine: nothing to install.
  installation: null,
});
