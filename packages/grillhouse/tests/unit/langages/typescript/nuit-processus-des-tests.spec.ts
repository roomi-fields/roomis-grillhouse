// The unit of a run of the night (GRILLHOUSE_NUIT_PAQUET: the configuration of the package the run
// plays, and what it leaves out) is the run's own: the night's configuration takes it out of the
// environment once read, as it does the choice of the run and its tranche, so that a Vitest a night
// test starts itself, in another package, never plays under the configuration of the package of
// the run that started it. Medium test: a project of trial played by `testsDeNuit` of
// scripts/langages/typescript/tests-de-nuit.mjs, without the whole product.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import * as nuitMjs from '../../../../scripts/langages/typescript/tests-de-nuit.mjs';

const nuit = nuitMjs as unknown as { testsDeNuit: (racine: string) => number };

const DEPOT = path.resolve(fileURLToPath(import.meta.url), '../../../../../../..');
const CONFIGURATION_DE_NUIT = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/vitest.nuit.config.mjs'
);
const VITEST = path.join(DEPOT, 'node_modules/vitest/vitest.mjs');
const VARIABLES = [
  'GRILLHOUSE_NUIT_PAQUET',
  'GRILLHOUSE_TESTS_DE_NUIT',
  'GRILLHOUSE_TRANCHE_DE_NUIT',
] as const;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nuit-processus-des-tests-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Ligne = { nom: string; variables: Record<string, string | null>; code?: number | null };

// A project of trial: its root, its trace, a link to the repository's node_modules, the files
// <fichiers> written under the root (the paths from the root).
function projet(fichiers: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  const trace = path.join(racine, 'trace.jsonl');
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(racine, 'node_modules'));
  const tous: Record<string, string> = { 'package.json': '{"type":"module"}\n', ...fichiers };
  for (const [f, contenu] of Object.entries(tous)) {
    mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
    writeFileSync(
      path.join(racine, f),
      contenu.replaceAll('%TRACE%', JSON.stringify(trace)).replaceAll('%RACINE%', racine)
    );
  }
  return { racine, trace };
}

const lignes = (trace: string): Ligne[] =>
  existsSync(trace)
    ? readFileSync(trace, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l) as Ligne)
    : [];
const de = (trace: string, nom: string) => lignes(trace).find(l => l.nom === nom);

const ENTETE =
  "import { appendFileSync } from 'node:fs';\nimport { it } from 'vitest';\n" +
  `const variables = () => Object.fromEntries(${JSON.stringify(VARIABLES)}.map(v => [v, process.env[v] ?? null]));\n`;

// A night file that records the variables of the night its own process holds.
const temoin = (nom: string) =>
  `${ENTETE}it('${nom}', () => {\n` +
  `  appendFileSync(%TRACE%, JSON.stringify({ nom: '${nom}', variables: variables() }) + '\\n');\n});\n`;

// A night file that starts a Vitest of its own, as a night test of the frame does: the night's
// configuration on the night file <fichier> of the package at <dossier> (from the root), a child
// that is a run of its own, not a worker of this one; it records the child's code.
const lanceur = (nom: string, dossier: string, fichier: string) =>
  "import { spawnSync } from 'node:child_process';\n" +
  ENTETE +
  `it('${nom}', () => {\n` +
  '  const env = Object.fromEntries(Object.entries(process.env).filter(' +
  "([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS'));\n" +
  `  const r = spawnSync(process.execPath, [${JSON.stringify(VITEST)}, 'run', '--root', ` +
  `'%RACINE%/${dossier}', '--config', ${JSON.stringify(CONFIGURATION_DE_NUIT)}, ` +
  `'%RACINE%/${dossier}/${fichier}'], { cwd: '%RACINE%/${dossier}', encoding: 'utf8', ` +
  "env: { ...env, GRILLHOUSE_TESTS_DE_NUIT: 'nuit' } });\n" +
  `  appendFileSync(%TRACE%, JSON.stringify({ nom: '${nom}', variables: variables(), code: r.status }) + '\\n');\n` +
  '  if (r.status !== 0) {\n    throw new Error(r.stdout + r.stderr);\n  }\n}, 60000);\n';

const AUCUNE = Object.fromEntries(VARIABLES.map(v => [v, null]));

describe('l’unité d’un run de la nuit ne sort pas de ce run', () => {
  it('le processus d’un test de nuit ne reçoit aucune variable de la nuit, sous la configuration d’un paquet comme à la racine', () => {
    const { racine, trace } = projet({
      'packages/a/vitest.config.mjs': "export default { test: { env: { MARQUE: 'a' } } };\n",
      'packages/a/tests/n.nuit.test.mjs': temoin('en-a'),
      'tests/n.nuit.test.mjs': temoin('a-la-racine'),
    });
    expect(nuit.testsDeNuit(racine)).toBe(0);
    expect(de(trace, 'en-a')?.variables).toEqual(AUCUNE);
    expect(de(trace, 'a-la-racine')?.variables).toEqual(AUCUNE);
  }, 120_000);

  it('un Vitest qu’un test de nuit lance dans un autre paquet ne joue pas sous la configuration du paquet du lanceur', () => {
    // The package of the launcher has a setup file of its own, named from its root: played under
    // that configuration in the root of the other package, the child would not find it.
    const { racine, trace } = projet({
      'packages/a/vitest.config.mjs':
        "export default { test: { setupFiles: ['tests/preparation.mjs'] } };\n",
      'packages/a/tests/preparation.mjs': 'globalThis.__PREPARE = true;\n',
      'packages/a/tests/lanceur.nuit.test.mjs': lanceur(
        'lanceur',
        'essais/b',
        'cible.nuit.test.mjs'
      ),
      'essais/b/package.json': '{"type":"module"}\n',
      'essais/b/cible.nuit.test.mjs': temoin('cible'),
    });
    expect(nuit.testsDeNuit(racine)).toBe(0);
    expect(de(trace, 'lanceur')).toMatchObject({ code: 0 });
  }, 120_000);
});
