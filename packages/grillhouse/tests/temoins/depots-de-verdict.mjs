// The trials of the verdicts of the witnesses (grillhouse-3dr.2.1): `depotDeVerdict`, two packages,
// `a` of the sort given (`vert`, `rouge`, `delai`: past its delay every time; `tenu`: green, the
// lock of the machine held by another measure), `b` green, played by the real Turborepo and the
// real Vitest of the repository; what ./enregistrer.mjs records and the night's specification
// compares, built the same way on both sides.
import { spawn } from 'node:child_process';
import { existsSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEPOT, ecrireDans, git, initialiser, json } from './depots.mjs';

// The trial of a verdict, its package `a` of <sorte>, its tests under the base configuration
// <base> (the `vitest-config/base.mjs` of the code measured): `{ racine, env }`, the environment
// with the pressure at <pression> and the lock of the machine of its own.
export function depotDeVerdict(racine, sorte, { base, pression = 1 }) {
  const ecrire = ecrireDans(racine);
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(racine, 'node_modules'), 'dir');
  ecrire(
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  ecrire(
    'turbo.json',
    json({
      $schema: 'https://turborepo.com/schema.json',
      globalPassThroughEnv: [
        'GRILLHOUSE_PRESSION_CPU',
        'GRILLHOUSE_RESULTATS',
        'GRILLHOUSE_VERROU_MACHINE',
      ],
      tasks: {
        build: { outputs: [] },
        'grillhouse:gardes': { dependsOn: ['build'], outputs: [] },
        gardes: { dependsOn: ['build'], outputs: [] },
        'test:vitest': { dependsOn: ['build'], env: ['GRILLHOUSE_TESTS'], outputs: [] },
        typecheck: { dependsOn: ['build', '^build'], outputs: [] },
      },
    })
  );
  const corps = {
    vert: '',
    rouge: '  expect(1).toBe(2);\n',
    delai: '  await new Promise(r => setTimeout(r, 400));\n',
  };
  for (const [nom, s] of [
    ['a', sorte],
    ['b', 'vert'],
  ]) {
    ecrire(
      `packages/${nom}/package.json`,
      json({ name: nom, type: 'module', scripts: { 'test:vitest': 'vitest run' } })
    );
    ecrire(
      `packages/${nom}/vitest.config.mjs`,
      `import base from ${JSON.stringify(base)};\nexport default base;\n`
    );
    ecrire(
      `packages/${nom}/test/x.test.mjs`,
      "import { it, expect } from 'vitest';\n" +
        `it('${nom}', async () => {\n${corps[s] ?? ''}}, 100);\n`
    );
  }
  ecrire('.gitignore', 'node_modules\n.turbo/\n');
  ecrire(
    'pression',
    `some avg10=${pression.toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`
  );
  initialiser(racine);
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'essai');
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS' && !k.startsWith('GRILLHOUSE_')
      )
    ),
    PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    TURBO_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
    GRILLHOUSE_PRESSION_CPU: path.join(racine, 'pression'),
    GRILLHOUSE_VERROU_MACHINE: path.join(racine, 'mesure.lock'),
  };
  return { racine, env };
}

// A process that holds the lock of the machine of the trial <env> names, by the module
// <verrou> (the `verrou-de-machine.mjs` of the code measured), until `liberer`: `{ pret, liberer,
// fin }`, `pret` resolved once it holds it.
export function tenirLaMachine(verrou, env, dossier) {
  const tenu = path.join(dossier, 'tenu');
  const libere = path.join(dossier, 'libere');
  const code = `
    import { existsSync, writeFileSync } from 'node:fs';
    import { avecLaMachine } from ${JSON.stringify(verrou)};
    avecLaMachine(() => {
      writeFileSync(${JSON.stringify(tenu)}, '');
      while (!existsSync(${JSON.stringify(libere)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }, { racine: ${JSON.stringify(dossier)} });
  `;
  const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env, stdio: 'ignore' });
  const fin = new Promise(resolve => p.on('close', resolve));
  const pret = new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (existsSync(tenu)) {
        clearInterval(t);
        resolve();
      }
    }, 50);
    p.on('close', c => {
      clearInterval(t);
      reject(new Error(`le détenteur du verrou s'arrête (code ${c})`));
    });
  });
  return { pret, fin, liberer: () => writeFileSync(libere, '') };
}

// The verdicts the witnesses hold: each command, the sort of `a`, and the CPU pressure.
export const VERDICTS = [
  { commande: 'tests', sorte: 'vert', pression: 1 },
  { commande: 'tests', sorte: 'rouge', pression: 1 },
  { commande: 'tests', sorte: 'delai', pression: 90 },
  { commande: 'verifier', sorte: 'vert', pression: 1 },
  { commande: 'verifier', sorte: 'rouge', pression: 1 },
  { commande: 'verifier', sorte: 'tenu', pression: 1 },
];

// A verdict as the witness keeps it, out of what moves from one run to the next: the code, and
// the tasks and test files read in the results, each by its package, script, code; its path from
// the trial, its status, its tests' names and statuses.
export function verdictStable(racine, code, { taches, rapports }) {
  return {
    code,
    taches: taches
      .filter(t => t.code !== null)
      .map(t => ({ paquet: t.paquet, script: t.script, code: t.code }))
      .sort((x, y) => `${x.paquet}#${x.script}`.localeCompare(`${y.paquet}#${y.script}`)),
    rapports: rapports
      .map(r => ({
        fichier: path.relative(racine, r.fichier),
        etat: r.etat,
        tests: r.tests.map(t => ({ nom: t.nom, etat: t.etat })),
      }))
      .sort((x, y) => x.fichier.localeCompare(y.fichier)),
  };
}
