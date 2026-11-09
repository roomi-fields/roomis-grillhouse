// The night tests, in a project of trial: a package whose configuration extends the frame's base
// configuration of the day plays its day tests and neither its night tests nor its benches, and
// the command `tests-de-nuit` of the module typescript plays the night tests, then the measures.
// What each configuration holds, read from the configurations themselves, is the day's
// (packages/grillhouse/tests/unit/tests-de-nuit.spec.ts).
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lierDependances } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE, RACINE } from './cadre.js';

const DEPOT = RACINE;

// The trial directories of this run live in one root, removed at its end.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-de-nuit-config-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`.slice(-3000);

describe('the base configuration of the day leaves the night out of every configuration that extends it', () => {
  const PAQUET = path.join(CADRE, 'scripts/langages/typescript/vitest-config');
  it('a package whose configuration imports it by its name plays its day tests, and neither its night tests nor its benches', () => {
    const repo = mkdtempSync(path.join(ESSAIS, 'paquets-'));
    lierDependances(repo, DEPOT);
    // The frame's package as npm installs it: its package.json and its scripts (the base
    // configuration of the module typescript, the core's entries it reads), in place of the link
    // to the repository's.
    const installe = path.join(repo, 'node_modules/@roomi-fields/grillhouse');
    rmSync(path.join(repo, 'node_modules/@roomi-fields'), { force: true });
    cpSync(path.join(PAQUET, '../../..'), path.join(installe, 'scripts'), { recursive: true });
    cpSync(path.join(CADRE, 'package.json'), path.join(installe, 'package.json'));
    const paquet = path.join(repo, 'packages/a');
    const trace = path.join(repo, 'trace');
    // A test file that appends its name to the trace.
    const essai = (nom: string) =>
      `import { appendFileSync } from 'node:fs';\nimport { test } from 'vitest';\n` +
      `test('${nom}', () => {\n  appendFileSync(${JSON.stringify(trace)}, '${nom}\\n');\n});\n`;
    const fichiers: Record<string, string> = {
      'vitest.config.mjs':
        "import { defineConfig, mergeConfig } from 'vitest/config';\n" +
        "import base from '@roomi-fields/grillhouse/vitest-config';\n" +
        'export default mergeConfig(base, defineConfig({ test: { include: ' +
        "['tests/**/*.{test,spec}.{ts,mjs}'] } }));\n",
      'tests/jour.spec.ts': essai('jour.spec.ts'),
      'tests/a.nuit.test.ts': essai('a.nuit.test.ts'),
      'tests/b.budget.spec.ts': essai('b.budget.spec.ts'),
      'tests/profond/c.nuit.spec.mjs': essai('c.nuit.spec.mjs'),
    };
    for (const [f, contenu] of Object.entries(fichiers)) {
      mkdirSync(path.dirname(path.join(paquet, f)), { recursive: true });
      writeFileSync(path.join(paquet, f), contenu);
    }
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    );
    const r = spawnSync(path.join(repo, 'node_modules/.bin/vitest'), ['run'], {
      cwd: paquet,
      encoding: 'utf8',
      env,
      timeout: 120_000,
    });
    expect(r.status, sortie(r)).toBe(0);
    expect(readFileSync(trace, 'utf8').split('\n').filter(Boolean)).toEqual(['jour.spec.ts']);
  }, 120_000);
});

// Every measure of time plays at night, alone, at rest. The command `tests-de-nuit` of the module
// typescript (scripts/langages/typescript/tests-de-nuit.mjs) plays the night tests, then the
// measures, the time witnesses (a file that imports `mesurerAuRepos`) and the time budget
// benches, one file at a time, as the module cargo plays its benches after its night tests, one
// test at a time.
describe('the night plays the measures of time alone, after its night tests', () => {
  const SCRIPT = path.join(CADRE, 'scripts/langages/typescript/tests-de-nuit.mjs');
  const MESURE = path.join(CADRE, 'scripts/langages/typescript/vitest-config/mesure.mjs');
  // A test that writes « <nom> début », waits 300 ms, then writes « <nom> fin » to <trace>; a
  // witness when <temoin>.
  const lent = (trace: string, nom: string, temoin = false) =>
    "import { appendFileSync } from 'node:fs';\nimport { it } from 'vitest';\n" +
    (temoin ? `import { mesurerAuRepos } from ${JSON.stringify(MESURE)};\n` : '') +
    `it('${nom}', ${temoin ? 'ctx => mesurerAuRepos(ctx, async () => {' : 'async () => {'}\n` +
    `  appendFileSync(${JSON.stringify(trace)}, '${nom} début\\n');\n` +
    '  await new Promise(r => setTimeout(r, 300));\n' +
    `  appendFileSync(${JSON.stringify(trace)}, '${nom} fin\\n');\n` +
    `}${temoin ? ')' : ''});\n`;
  it('the night tests first, then each witness and each bench alone, and no day test', () => {
    const repo = mkdtempSync(path.join(ESSAIS, 'mesures-'));
    lierDependances(repo, DEPOT);
    const trace = path.join(repo, 'trace');
    const fichiers: Record<string, string> = {
      'package.json': '{"type":"module"}\n',
      'tests/a.nuit.test.mjs': lent(trace, 'nuit-a'),
      'tests/b.nuit.test.mjs': lent(trace, 'nuit-b'),
      'tests/t.budget.test.mjs': lent(trace, 'banc'),
      'tests/temps.test.mjs': lent(trace, 'temoin-1', true),
      'tests/profond/temps.spec.mjs': lent(trace, 'temoin-2', true),
      'tests/jour.test.mjs': lent(trace, 'jour'),
    };
    for (const [f, contenu] of Object.entries(fichiers)) {
      mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
      writeFileSync(path.join(repo, f), contenu);
    }
    const pression = path.join(repo, 'pression');
    writeFileSync(pression, 'some avg10=1.00 avg60=0.00 avg300=0.00 total=1\n');
    const env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
      ),
      GRILLHOUSE_PRESSION_CPU: pression,
    };
    const r = spawnSync(process.execPath, [SCRIPT], {
      cwd: repo,
      encoding: 'utf8',
      env,
      timeout: 120_000,
    });
    expect(r.status, sortie(r)).toBe(0);
    const lignes = readFileSync(trace, 'utf8').split('\n').filter(Boolean);
    expect(lignes.some(l => l.startsWith('jour'))).toBe(false);
    // The night tests, both, before any measure.
    expect(
      lignes
        .slice(0, 4)
        .map(l => l.split(' ')[0])
        .sort()
    ).toEqual(['nuit-a', 'nuit-a', 'nuit-b', 'nuit-b']);
    // Then the three measures, each one ended before the next begins.
    const mesures = lignes.slice(4);
    expect(mesures).toHaveLength(6);
    for (let i = 0; i < 6; i += 2) {
      expect(mesures[i]).toMatch(/ début$/);
      expect(mesures[i + 1]).toBe(mesures[i].replace(' début', ' fin'));
    }
    expect(
      mesures
        .filter(l => l.endsWith('début'))
        .map(l => l.split(' ')[0])
        .sort()
    ).toEqual(['banc', 'temoin-1', 'temoin-2']);
  }, 120_000);
});
