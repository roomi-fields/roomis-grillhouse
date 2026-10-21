#!/usr/bin/env node
// The boundaries of the code, checked by dependency-cruiser. Its configuration
// (`.dependency-cruiser.cjs`) is generated from the components of the repository, like the index
// of the interfaces; a project adds its own rules and options in `.dependency-cruiser.projet.cjs`
// (`module.exports = { forbidden: [...], options: {...} }`), which the generated file reads when
// dependency-cruiser loads it. The file brings every key of dependency-cruiser's configuration:
// its `forbidden`, `allowed` and `required` rules add to the frame's; `allowedSeverity` and
// `extends` pass as they are. Its `exclude` and `doNotFollow` patterns add to the frame's; any
// other option replaces the frame's at its first level, as the `extends` of dependency-cruiser does.
//
//   node scripts/frontieres.mjs           refuses a stale configuration, then runs dependency-cruiser
//   node scripts/frontieres.mjs --ecrire  writes the configuration
//
// The rules: no cycle; a package reaches another by its name, never by a path into its tree; a
// module of `src/` reaches another by its entry (`index`); the code of `src/` imports no test; the
// published code imports no development dependency, whether it imports values or only types: it
// is the code of `src/` outside the test files, and every file that the `exports` of a package
// reach (each target of a condition, the exported test material included) with the files these
// import; every import resolves (a path a package does not export is refused); an orphan file is
// reported, without refusing, unless it is an entry: an index, a configuration, a declaration, a
// test, or a file that the `bin` field of a package names (its commands, as knip takes them). Who uses which component is the consumers check's
// (`scripts/consommateurs.mjs`). The files of a package out of the frame
// (`docs/agents/hors-cadre.txt`) are excluded, and no module rule is written for it.
//
// An error of dependency-cruiser inscribed in the project's debt (`grillhouse-dette.json`, see
// `dette.mjs`) passes, keyed by the file it starts from and the rule's name; the report, written by
// dependency-cruiser's `err-long` reporter, ignores the errors the debt covers as known violations
// (`--ignore-known`). A stale configuration and an entry without a source are never inscribed.
//
// The published code is found before dependency-cruiser runs: each package under `packages/`
// names its entries, the targets of its `exports`; an entry is a TypeScript source, or a built
// file that comes back to its sources by what TypeScript emits with the `tsconfig*.json` of the
// package; an entry that is neither is refused, named. A first run of dependency-cruiser gives
// the files these sources import; the second judges them, through the file that
// `GRILLHOUSE_JUGES` names, which the generated configuration reads.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { composants, horsCadre } from './consommateurs.mjs';
import { trancher } from './dette.mjs';

export const CONFIGURATION = '.dependency-cruiser.cjs';
export const RACINES = ['src', 'packages'];
const TESTS = '(^|/)(test|tests|__tests__)/|[.](test|spec)[.][a-z]+$';
const CODE = '^src/|^packages/[^/]+/src/';
const REGLE_OUTILS = 'pas-d-outil-de-developpement-dans-le-code';
// The environment variable naming the file that holds the pattern of the published files.
const JUGES = 'GRILLHOUSE_JUGES';

// The `exclude` patterns of the configuration: built files, and the directories under `src/` and
// `packages/` that the list out of the frame names.
function exclus(racine) {
  const motifs = ['^(dist|build|coverage)/', '^packages/[^/]+/(dist|build|coverage)/'];
  for (const nom of [...horsCadre(racine)].sort()) {
    motifs.push(`^(packages|src)/${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`);
  }
  return motifs;
}

// The width of a line of the generated configuration, the project's (`.prettierrc`).
const LARGEUR = 100;

// A rule as JavaScript lines at indent <retrait>, each within LARGEUR columns: one key per line,
// a string too long for its line cut at a space, a `|` or the width into pieces joined by `+`.
function ecrire(regle, retrait) {
  const lignes = JSON.stringify(regle, null, 2).split('\n');
  return lignes
    .map(l => {
      const ligne = retrait + l;
      const m = /^(\s*(?:"[^"]*": )?)"(.*)"(,?)$/.exec(ligne);
      if (ligne.length <= LARGEUR || !m) return ligne;
      const [, tete, valeur, virgule] = m;
      const pieces = [];
      let reste = valeur;
      const place = LARGEUR - tete.length - 6;
      while (reste.length > place) {
        const dans = reste.slice(0, place);
        let coupe = Math.max(dans.lastIndexOf(' '), dans.lastIndexOf('|')) + 1;
        if (coupe === 0) coupe = place;
        while (reste[coupe - 1] === '\\') coupe -= 1;
        pieces.push(reste.slice(0, coupe));
        reste = reste.slice(coupe);
      }
      pieces.push(reste);
      const pas = `${/^\s*/.exec(tete)[0]}  `;
      return `${tete}"${pieces.join(`" +\n${pas}"`)}"${virgule}`;
    })
    .join('\n');
}

// The patterns of the files that the `bin` field of a package of <racine> names (a path, or an
// object of paths), each from the root: entries of the package, as knip takes them.
function entreesBin(racine) {
  return composants(racine).flatMap(({ dir }) => {
    const fichier = path.join(dir, 'package.json');
    if (!existsSync(fichier)) return [];
    const { bin } = JSON.parse(readFileSync(fichier, 'utf8'));
    const cibles = typeof bin === 'string' ? [bin] : Object.values(bin ?? {});
    return cibles
      .filter(c => typeof c === 'string')
      .map(c => `^${echappe(posix(path.relative(racine, path.resolve(dir, c))))}$`);
  });
}

// The configuration text for the repository at <racine>.
export function configuration(racine) {
  const modules = composants(racine).filter(c => path.relative(racine, c.dir).startsWith('src/'));
  const bin = [...new Set(entreesBin(racine))].sort();
  const regles = [
    {
      name: 'pas-de-cycle',
      comment: 'aucun module ne dépend de lui-même par un détour',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'un-paquet-par-son-nom',
      comment: 'un paquet en importe un autre par son nom, jamais par un chemin dans son arbre',
      severity: 'error',
      from: { path: '^packages/([^/]+)/' },
      to: { path: '^packages/([^/]+)/', pathNot: '^packages/$1/' },
    },
    {
      name: 'pas-de-test-dans-le-code',
      comment: "le code livré n'importe aucun test",
      severity: 'error',
      from: { path: CODE, pathNot: TESTS },
      to: { path: TESTS },
    },
    {
      name: REGLE_OUTILS,
      comment:
        "le code livré (src et ce que les exports du paquet atteignent) n'importe aucune " +
        'dépendance de développement, types compris',
      severity: 'error',
      from: { path: CODE, pathNot: TESTS },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'tout-import-se-resout',
      comment: "un import se résout : un chemin qu'un paquet n'exporte pas est refusé",
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'pas-d-orphelin',
      comment: "un fichier que rien n'importe est signalé",
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [`${TESTS}|(^|/)index[.][a-z]+$|[.]d[.]ts$|[.]config[.][a-z]+$`, ...bin].join('|'),
      },
      to: {},
    },
  ];
  if (modules.length) {
    regles.splice(2, 0, {
      name: 'un-module-par-son-entree',
      comment:
        "un module de src en importe un autre par son entrée (index), jamais par l'intérieur",
      severity: 'error',
      from: { path: '^src/([^/]+)/' },
      to: { path: '^src/([^/]+)/', pathNot: '^src/$1/|^src/[^/]+/index[.][a-z]+$' },
    });
  }
  const tsconfig = existsSync(path.join(racine, 'tsconfig.json'));
  return `// Généré par \`node scripts/frontieres.mjs --ecrire\` ; ne pas éditer. Les règles et les options
// propres au projet vivent dans .dependency-cruiser.projet.cjs, lu au chargement.
const fs = require('node:fs');
const projet = fs.existsSync(\`\${__dirname}/.dependency-cruiser.projet.cjs\`)
  ? require('./.dependency-cruiser.projet.cjs')
  : {};

// The non-empty patterns of a filter written in any form dependency-cruiser accepts.
const motifs = f => {
  if (typeof f === 'string') return [f];
  if (Array.isArray(f)) return f;
  return f && typeof f === 'object' ? motifs(f.path) : [];
};
// A filter of the frame plus the project's: the patterns add up, the other keys are the project's.
const ajoute = (cadre, propre) => {
  const ajouts = motifs(propre).filter(Boolean);
  const reste = propre && typeof propre === 'object' && !Array.isArray(propre) ? propre : {};
  return { ...reste, path: [cadre.path, ...ajouts].join('|') };
};
// The published files that the script found (a pattern, in the file ${JUGES} names)
// replace the default scope of the rule that refuses a development dependency.
const fichierJuges = process.env.${JUGES};
const juges = fichierJuges ? fs.readFileSync(fichierJuges, 'utf8') : null;
const portee = regle =>
  regle.name === '${REGLE_OUTILS}' && juges !== null
    ? { ...regle, from: { path: juges } }
    : regle;
const cadre = {
  doNotFollow: { path: 'node_modules' },
  exclude: {
    path: [
${exclus(racine)
  .map(m => `      '${m.replace(/[\\']/g, '\\$&')}',`)
  .join('\n')}
    ].join('|'),
  },
  tsPreCompilationDeps: true,
  preserveSymlinks: true,
${tsconfig ? "  tsConfig: { fileName: 'tsconfig.json' },\n" : ''}  enhancedResolveOptions: {
    exportsFields: ['exports'],
    conditionNames: ['import', 'require', 'default', 'types'],
  },
};

module.exports = {
  forbidden: [
    ...[
${regles.map(r => `${ecrire(r, '      ')},`).join('\n')}
    ].map(portee),
    ...(projet.forbidden ?? []),
  ],
  ...(projet.allowed ? { allowed: projet.allowed } : {}),
  ...(projet.required ? { required: projet.required } : {}),
  ...(projet.allowedSeverity ? { allowedSeverity: projet.allowedSeverity } : {}),
  ...(projet.extends ? { extends: projet.extends } : {}),
  options: {
    ...cadre,
    ...projet.options,
    doNotFollow: ajoute(cadre.doNotFollow, projet.options?.doNotFollow),
    exclude: ajoute(cadre.exclude, projet.options?.exclude),
  },
};
`;
}

// ---- The published code -------------------------------------------------------------------------

const requis = createRequire(import.meta.url);
const posix = chemin => chemin.split(path.sep).join('/');
const echappe = texte => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DECLARATION = /[.]d[.]ts$/;
const SOURCE_TS = /[.]tsx?$/;

// What the `tsconfig*.json` of the package at <dir> emit, as TypeScript reads them (their
// `extends` included) and computes their output (`getOutputFileNames`): a Map from the absolute
// path of an emitted file to the sources it comes from.
export function sorties(dir) {
  const ts = requis('typescript');
  const hote = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} };
  const table = new Map();
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || !/^tsconfig.*[.]json$/.test(e.name)) continue;
    const analyse = ts.getParsedCommandLineOfConfigFile(path.join(dir, e.name), {}, hote);
    if (!analyse || analyse.options.noEmit) continue;
    for (const source of analyse.fileNames.map(f => path.resolve(f))) {
      if (DECLARATION.test(source) || !existsSync(source)) continue;
      const emises = ts.getOutputFileNames(analyse, source, ts.sys.useCaseSensitiveFileNames);
      for (const sortie of emises) {
        const chemin = path.resolve(sortie);
        if (chemin !== source) table.set(chemin, new Set([...(table.get(chemin) ?? []), source]));
      }
    }
  }
  return table;
}

// The targets of an `exports` value: the string itself, or the targets of each value of an object
// (its subpaths and its conditions).
function cibles(valeur) {
  if (typeof valeur === 'string') return [valeur];
  return valeur && typeof valeur === 'object' ? Object.values(valeur).flatMap(cibles) : [];
}

// The source files published by the package at <dir>, and the entries without a source:
// { sources: Set of absolute paths, refus: [message] }. An entry is its own source when it is a
// TypeScript source that exists, else its sources are those TypeScript emits it from.
function sourcesDuPaquet(racine, dir) {
  const sources = new Set();
  const refus = [];
  const fichier = path.join(dir, 'package.json');
  if (!existsSync(fichier)) return { sources, refus };
  const entrees = cibles(JSON.parse(readFileSync(fichier, 'utf8')).exports);
  if (entrees.length === 0) return { sources, refus };
  const emis = sorties(dir);
  for (const cible of entrees) {
    const abs = path.resolve(dir, cible);
    const source = SOURCE_TS.test(abs) && !DECLARATION.test(abs);
    const trouvees = source ? [abs].filter(f => existsSync(f)) : [...(emis.get(abs) ?? [])];
    if (trouvees.length === 0) {
      refus.push(
        `⛔ ${posix(path.relative(racine, fichier))} : l'entrée ${cible} n'a pas de source — ` +
          'ni fichier source, ni configuration TypeScript du paquet qui la produise.'
      );
    }
    for (const f of trouvees) sources.add(f);
  }
  return { sources, refus };
}

// The sources published by the packages of the repository at <racine>, as paths relative to
// <racine>, with the entries refused: { sources: Set, refus: [message] }.
export function publiees(racine) {
  const sources = new Set();
  const refus = [];
  for (const { dir } of composants(racine)) {
    const trouve = sourcesDuPaquet(racine, dir);
    for (const f of trouve.sources) sources.add(posix(path.relative(racine, f)));
    refus.push(...trouve.refus);
  }
  return { sources, refus };
}

// One run of dependency-cruiser over <racines>; `json` gives the graph on the standard output.
// <connues>, when given, names the file of the known violations dependency-cruiser ignores
// (`--ignore-known`).
function depcruise(racine, racines, type, environnement, connues = null) {
  const json = type === 'json';
  const ignorees = connues ? ['--ignore-known', connues] : [];
  return spawnSync(
    'npx',
    [
      '--no-install',
      'depcruise',
      ...racines,
      '--config',
      CONFIGURATION,
      '--output-type',
      type,
      ...ignorees,
    ],
    {
      cwd: racine,
      env: environnement,
      encoding: 'utf8',
      stdio: json ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      maxBuffer: 1024 * 1024 * 512,
    }
  );
}

// The files the rule judges, from the graph that dependency-cruiser gives: the code of `src/`
// outside the test files, and every file reached from a published source without crossing
// node_modules.
function aJuger(graphe, sources) {
  const modules = new Map(graphe.modules.map(m => [m.source, m]));
  const juges = new Set(
    [...modules.keys()].filter(f => new RegExp(CODE).test(f) && !new RegExp(TESTS).test(f))
  );
  const atteints = new Set();
  const pile = [...sources];
  while (pile.length) {
    const f = pile.pop();
    if (atteints.has(f)) continue;
    atteints.add(f);
    juges.add(f);
    for (const d of modules.get(f)?.dependencies ?? []) {
      if (d.couldNotResolve || d.coreModule || /(^|\/)node_modules\//.test(d.resolved)) continue;
      pile.push(d.resolved);
    }
  }
  return juges;
}

// The errors of a cruise result as findings the debt (`dette.mjs`) judges: keyed by the file a
// violation starts from and its rule's name, the violation kept to be reported.
export function constats(resultat) {
  return resultat.summary.violations
    .filter(v => v.rule.severity === 'error')
    .map(v => ({
      fichier: v.from,
      regle: v.rule.name,
      message: `${v.rule.name}: ${v.from} → ${v.to}`,
      violation: v,
    }));
}

// The pattern of the files to judge, as dependency-cruiser's `path` filter reads it.
const motifDes = fichiers => `^(${[...fichiers].sort().map(echappe).join('|')})$`;

// The command on the repository at <racine>, with <args>: its exit code.
function frontieres(racine, args) {
  const attendu = configuration(racine);
  const cible = path.join(racine, CONFIGURATION);
  if (args.includes('--ecrire')) {
    writeFileSync(cible, attendu);
    return 0;
  }
  const present = existsSync(cible) ? readFileSync(cible, 'utf8') : '';
  if (present !== attendu) {
    process.stderr.write(
      `⛔ ${CONFIGURATION} n'est pas à jour avec les composants : node scripts/frontieres.mjs --ecrire le régénère.\n`
    );
    return 1;
  }
  // An entry without a source stops the check before dependency-cruiser runs.
  const { sources, refus } = publiees(racine);
  if (refus.length > 0) {
    process.stderr.write(`${refus.join('\n')}\n`);
    return 1;
  }
  const racines = RACINES.filter(r => existsSync(path.join(racine, r)));
  if (racines.length === 0) return 0;
  const environnement = { ...process.env };
  delete environnement[JUGES];
  let dossier = null;
  try {
    if (sources.size > 0) {
      const graphe = depcruise(racine, racines, 'json', environnement);
      if (!graphe.stdout) return graphe.status || 1;
      dossier = mkdtempSync(path.join(tmpdir(), 'frontieres-'));
      const fichier = path.join(dossier, 'juges.txt');
      writeFileSync(fichier, motifDes(aJuger(JSON.parse(graphe.stdout), sources)));
      environnement[JUGES] = fichier;
    }
    const r = depcruise(racine, racines, 'json', environnement);
    if (!r.stdout) return r.status || 1;
    const resultat = JSON.parse(r.stdout);
    const { refus, lignes } = trancher(racine, 'frontieres', constats(resultat));
    // The report is dependency-cruiser's own (`err-long`): the result formatted as it is when the
    // debt covers nothing, else a cruise that ignores the violations the debt covers, given as its
    // known violations (`--ignore-known`).
    const refusees = new Set(refus.map(c => c.violation));
    const couvertes = resultat.summary.violations.filter(
      v => v.rule.severity === 'error' && !refusees.has(v)
    );
    dossier ??= mkdtempSync(path.join(tmpdir(), 'frontieres-'));
    if (couvertes.length) {
      const connues = path.join(dossier, 'connues.json');
      writeFileSync(connues, JSON.stringify(couvertes));
      depcruise(racine, racines, 'err-long', environnement, connues);
    } else {
      const fichier = path.join(dossier, 'resultat.json');
      writeFileSync(fichier, r.stdout);
      spawnSync('npx', ['--no-install', 'depcruise-fmt', fichier, '--output-type', 'err-long'], {
        cwd: racine,
        stdio: 'inherit',
      });
    }
    for (const l of lignes) process.stderr.write(`${l}\n`);
    return refus.length ? 1 : 0;
  } finally {
    if (dossier) rmSync(dossier, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = frontieres(process.cwd(), process.argv.slice(2));
}
