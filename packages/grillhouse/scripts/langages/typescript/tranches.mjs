// The tranches of a pass (`npm run verifier -- --tranche i/n`, ./verifier.mjs), as Vitest shards
// a run (`--shard=i/n`, `--reporter=blob`, then `--merge-reports`: https://vitest.dev/guide/improving-performance#sharding),
// and the command `fusion-des-tranches` of the module typescript, which merges them.
//
//   npx grillhouse fusion-des-tranches      from the root of the project, once every tranche played
//
// - A tranche `i/n` (LA_FORME: 1 ≤ i ≤ n, both whole) plays, in each package of Vitest, the i-th of
//   n parts of its test files, Vitest's own split (its sequencer's `shard`, by the hash of each
//   file's path): the n tranches together play each file of the pass once.
// - The plugin of the day (./vitest-config/cibles.mjs) applies the tranche the variable
//   `GRILLHOUSE_TESTS` carries (`trancher`): the shard, a blob reporter beside the configuration's
//   reporters, writing `<rapports>/blobs/<paquet>-<i>-<n>.json`, and a sequencer that writes, in
//   `<rapports>/fichiers/<paquet>-<i>-<n>.json`, the files of the pass the split received and the
//   files of its tranche (`{ paquet, tranche, passe, joues }`, each path relative to the package).
//   <rapports> is RAPPORTS under the root of the project, Vitest's own directory of the blobs.
// - `fusion-des-tranches` reads the files of RAPPORTS: each package must hold the n tranches, the
//   same files of the pass in each, and each file of the pass played by one tranche exactly; each
//   fault is named (`controlerLesTranches`). It then merges the blobs into one report,
//   `vitest run --merge-reports <rapports>/blobs --reporter=default`, from the root. Its code: 0
//   when the tranches hold and the merged report is green; 1 otherwise. A pass with no test file
//   (a push whose changes no test relates to: Vitest writes no blob then) has neither blob nor
//   file of tranche, and merges nothing, green; blobs without any file of tranche are a fault (the
//   tranche did not reach Vitest, which played every file in each tranche).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The directory of the reports of the tranches, under the root of the project: Vitest's own. */
export const RAPPORTS = '.vitest-reports';
const BLOBS = 'blobs';
const FICHIERS = 'fichiers';
/** The form of a tranche, as Vitest's `--shard` reads it. */
export const LA_FORME = 'i/n';

/**
 * The tranche <texte> reads, `{ index, count }`, or null when it is not `i/n` with 1 ≤ i ≤ n.
 * @param {unknown} texte
 * @returns {{ index: number, count: number } | null}
 */
export function lireLaTranche(texte) {
  const m = /^([1-9]\d*)\/([1-9]\d*)$/.exec(typeof texte === 'string' ? texte : '');
  if (!m) {
    return null;
  }
  const index = Number(m[1]);
  const count = Number(m[2]);
  return index <= count ? { index, count } : null;
}

// The name of the files of the package <paquet> for the tranche <t>.
const nomDuFichier = (paquet, t) =>
  `${paquet.replace(/[^A-Za-z0-9._-]+/g, '_')}-${t.index}-${t.count}.json`;

// The name a package.json at <racine> gives its package, else the name of its directory.
function paquetDe(racine) {
  try {
    const nom = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')).name;
    if (typeof nom === 'string' && nom) {
      return nom;
    }
  } catch {
    // no package.json: the directory names it
  }
  return path.basename(racine);
}

/**
 * The sequencer that splits as <Parent> does and writes in <fichier> the files of the pass it
 * received and those of its tranche, each relative to <racine>, sorted; called once per pool, it
 * keeps every call's.
 * @param {new (ctx: any) => { shard(files: any[]): Promise<any[]> }} Parent
 * @param {{ fichier: string, racine: string, paquet: string, tranche: string }} o
 */
export function enregistreur(Parent, { fichier, racine, paquet, tranche }) {
  const passe = [];
  const joues = [];
  const relatif = s =>
    path
      .relative(racine, s?.moduleId ?? s?.[1] ?? String(s))
      .split(path.sep)
      .join('/');
  return class extends Parent {
    async shard(files) {
      const siens = await super.shard(files);
      passe.push(...files.map(relatif));
      joues.push(...siens.map(relatif));
      mkdirSync(path.dirname(fichier), { recursive: true });
      writeFileSync(
        fichier,
        `${JSON.stringify({ paquet, tranche, passe: [...passe].sort(), joues: [...joues].sort() }, null, 2)}\n`
      );
      return siens;
    }
  };
}

/**
 * Applies to the test options <test> of the configuration <config> the tranche of <valeur> (the
 * content of `GRILLHOUSE_TESTS`: `tranche`, `i/n`, and `rapports`, the directory of the reports):
 * the shard, the blob reporter beside the configuration's, and the sequencer that writes the files.
 * @param {{ root?: string }} config
 * @param {Record<string, any>} test
 * @param {{ tranche: string, rapports: string }} valeur
 */
export async function trancher(config, test, { tranche, rapports }) {
  const t = lireLaTranche(tranche);
  if (!t) {
    throw new Error(`⛔ la tranche « ${tranche} » n'a pas la forme ${LA_FORME} (1 ≤ i ≤ n).`);
  }
  const racine = path.resolve(config.root ?? process.cwd());
  const paquet = paquetDe(racine);
  const nom = nomDuFichier(paquet, t);
  test.shard = `${t.index}/${t.count}`;
  const actuels = test.reporters ?? ['default'];
  test.reporters = [
    ...(Array.isArray(actuels) ? actuels : [actuels]),
    ['blob', { outputFile: path.join(rapports, BLOBS, nom) }],
  ];
  const { BaseSequencer } = await import('vitest/node');
  test.sequence = {
    ...test.sequence,
    sequencer: enregistreur(test.sequence?.sequencer ?? BaseSequencer, {
      fichier: path.join(rapports, FICHIERS, nom),
      racine,
      paquet,
      tranche: test.shard,
    }),
  };
}

/**
 * The files of the reports of the tranche <tranche> under <rapports>: the blobs and the files each
 * package wrote, which a new run of that tranche replaces.
 * @param {string} rapports
 * @param {{ index: number, count: number }} tranche
 * @returns {string[]}
 */
export function fichiersDeLaTranche(rapports, tranche) {
  const fin = `-${tranche.index}-${tranche.count}.json`;
  return [BLOBS, FICHIERS].flatMap(d => {
    const dossier = path.join(rapports, d);
    return existsSync(dossier)
      ? readdirSync(dossier)
          .filter(f => f.endsWith(fin))
          .map(f => path.join(dossier, f))
      : [];
  });
}

/**
 * The faults of the tranches <enregistrements> (each `{ paquet, tranche, passe, joues }`), each a
 * line: none when every package holds its n tranches, the same files of the pass in each, and
 * each file of the pass played by one tranche exactly; none either when there is no tranche.
 * @param {{ paquet: string, tranche: string, passe: string[], joues: string[] }[]} enregistrements
 * @returns {string[]}
 */
export function controlerLesTranches(enregistrements) {
  if (enregistrements.length === 0) {
    return [];
  }
  const fautes = [];
  const comptes = new Set(enregistrements.map(e => lireLaTranche(e.tranche)?.count));
  if (comptes.size !== 1 || comptes.has(undefined)) {
    return [
      `⛔ les tranches ne découpent pas la passe en un même nombre : ${[...new Set(enregistrements.map(e => e.tranche))].sort().join(', ')}.`,
    ];
  }
  const [n] = comptes;
  const parPaquet = new Map();
  for (const e of enregistrements) {
    parPaquet.set(e.paquet, [...(parPaquet.get(e.paquet) ?? []), e]);
  }
  for (const [paquet, liste] of [...parPaquet].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const index = liste.map(e => lireLaTranche(e.tranche).index);
    for (let i = 1; i <= n; i++) {
      const fois = index.filter(x => x === i).length;
      if (fois === 0) {
        fautes.push(`⛔ ${paquet} : la tranche ${i}/${n} manque.`);
      } else if (fois > 1) {
        fautes.push(`⛔ ${paquet} : la tranche ${i}/${n} se répète.`);
      }
    }
    const passe = JSON.stringify([...liste[0].passe].sort());
    if (liste.some(e => JSON.stringify([...e.passe].sort()) !== passe)) {
      fautes.push(`⛔ ${paquet} : les tranches ne découpent pas les mêmes fichiers de la passe.`);
      continue;
    }
    const parFichier = new Map(liste[0].passe.map(f => [f, []]));
    for (const e of liste) {
      for (const f of e.joues) {
        if (!parFichier.has(f)) {
          fautes.push(
            `⛔ ${paquet} : ${f}, joué par la tranche ${e.tranche}, n'est pas de la passe.`
          );
          continue;
        }
        parFichier.get(f).push(e.tranche);
      }
    }
    for (const [f, tranches] of parFichier) {
      if (tranches.length === 0) {
        fautes.push(`⛔ ${paquet} : ${f} n'est joué par aucune tranche.`);
      } else if (tranches.length > 1) {
        fautes.push(
          `⛔ ${paquet} : ${f} est joué par plusieurs tranches (${tranches.join(', ')}).`
        );
      }
    }
  }
  return fautes;
}

/**
 * The files the tranches wrote under <rapports>, read.
 * @param {string} rapports
 */
export function lireLesTranches(rapports) {
  const dossier = path.join(rapports, FICHIERS);
  if (!existsSync(dossier)) {
    return [];
  }
  return readdirSync(dossier)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => JSON.parse(readFileSync(path.join(dossier, f), 'utf8')));
}

/**
 * Merges the tranches of the project at <racine>: their faults named, then their blobs merged in
 * one report by Vitest (<fusionner>, given the directory of the blobs, its exit code); 0 or 1.
 * @param {{ racine?: string, dire?: (l: string) => void,
 *   fusionner?: (blobs: string, racine: string) => number | null }} o
 */
export function fusionDesTranches({
  racine = process.cwd(),
  dire = l => process.stdout.write(`${l}\n`),
  fusionner = (blobs, cwd) =>
    spawnSync(
      'npx',
      ['--no-install', 'vitest', 'run', '--merge-reports', blobs, '--reporter=default'],
      {
        cwd,
        stdio: 'inherit',
      }
    ).status,
}) {
  const rapports = path.join(racine, RAPPORTS);
  const enregistrements = lireLesTranches(rapports);
  const blobs = path.join(rapports, BLOBS);
  const avecBlobs = existsSync(blobs) && readdirSync(blobs).length > 0;
  if (enregistrements.length === 0) {
    if (avecBlobs) {
      dire(
        `⛔ des rapports sans fichier de tranche sous ${RAPPORTS}/${FICHIERS} : la tranche n'a pas atteint Vitest.`
      );
      return 1;
    }
    dire('↳ aucun fichier de test dans la passe : rien à fusionner.');
    return 0;
  }
  const fautes = controlerLesTranches(enregistrements);
  const code = avecBlobs ? fusionner(blobs, racine) : null;
  for (const f of fautes) {
    dire(f);
  }
  if (fautes.length === 0 && code === 0) {
    dire(
      '✅ les tranches réunies jouent chaque fichier de la passe une fois, et leur rapport est vert.'
    );
    return 0;
  }
  if (code !== 0) {
    dire(
      code === null
        ? `⛔ aucun rapport blob sous ${RAPPORTS}/${BLOBS}.`
        : `⛔ la fusion des rapports des tranches sort en ${code}.`
    );
  }
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = fusionDesTranches({});
}
