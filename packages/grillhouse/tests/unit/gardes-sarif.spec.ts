// The guards write their findings in SARIF 2.1.0 (scripts/resultats.mjs) under the results
// directory a run names (`GRILLHOUSE_RESULTATS`), beside their output for the human: the frame's
// guards through the known debt (scripts/dette.mjs, `trancher`, the findings it refuses) or on
// their own, the runner of the frame's guards (scripts/gardes-du-cadre.mjs) for a red guard that
// wrote none, and a project's guards (its script `gardes`) by the same function, as the charter
// says. So the circuit reads a guard's findings, each with its file, never its output.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FICHIER, trancher } from '../../scripts/dette.mjs';
import { jouerLesGardes } from '../../scripts/gardes-du-cadre.mjs';
import { RESULTATS, lireSarif } from '../../scripts/resultats.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'gardes-sarif-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository of packages: packages/a holds the package `a`.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify({ name: 'r', private: true, workspaces: ['packages/*'] })
  );
  mkdirSync(path.join(racine, 'packages/a/src'), { recursive: true });
  writeFileSync(path.join(racine, 'packages/a/package.json'), JSON.stringify({ name: 'a' }));
  return racine;
}
const dossier = () => mkdtempSync(path.join(ESSAIS, 'resultats-'));

describe('the known debt writes the findings it refuses in SARIF', () => {
  const constats = [
    { fichier: 'packages/a/src/x.ts', regle: 'exports', message: 'x : export inutilisé', ligne: 4 },
    { fichier: 'packages/a/src/y.ts', regle: 'exports', message: 'y : export inutilisé' },
  ];
  it('each refused finding, with its file, line, package; a finding the debt covers is not among them', () => {
    const racine = depot();
    writeFileSync(
      path.join(racine, FICHIER),
      JSON.stringify({ 'code-mort': { 'packages/a/src/y.ts': { exports: { count: 1 } } } })
    );
    const d = dossier();
    const { refus } = trancher(racine, 'code-mort', constats, undefined, {
      [RESULTATS]: d,
    }) as { refus: unknown[] };
    expect(refus).toHaveLength(1);
    expect(lireSarif(d)).toEqual({
      gardes: ['code-mort'],
      constats: [
        {
          garde: 'code-mort',
          regle: 'exports',
          fichier: 'packages/a/src/x.ts',
          ligne: 4,
          niveau: 'error',
          message: 'x : export inutilisé',
          paquet: 'packages/a',
          genre: 'a-corriger',
        },
      ],
    });
  });
  it('a green guard writes its SARIF too, empty: it played', () => {
    const d = dossier();
    trancher(depot(), 'resumes', [], undefined, { [RESULTATS]: d });
    expect(lireSarif(d)).toEqual({ gardes: ['resumes'], constats: [] });
  });
  it('without the variable, nothing is written', () => {
    const racine = depot();
    trancher(racine, 'code-mort', constats, undefined, {});
    expect(lireSarif(racine)).toEqual({ gardes: [], constats: [] });
  });
});

describe('the runner of the frame’s guards names a red guard without SARIF as a global finding', () => {
  // A guard that exits with <code>, writing its own SARIF when <sarif>.
  function garde(racine: string, nom: string, code: number, sarif = false) {
    const f = `${nom}.mjs`;
    const ecrit = sarif
      ? `import { ecrireSarif } from ${JSON.stringify(path.join(DEPOT, 'packages/grillhouse/scripts/resultats.mjs'))};\necrireSarif({ garde: '${nom}', constats: [{ fichier: 'packages/a/src/x.ts', message: 'm' }] });\n`
      : '';
    writeFileSync(path.join(racine, f), `${ecrit}process.exit(${code});\n`);
    return [f];
  }
  it('a red guard without SARIF: one result without location, the guard and its code; a green one: nothing', () => {
    const racine = depot();
    const d = dossier();
    const code = jouerLesGardes({
      racine,
      gardes: [garde(racine, 'rouge', 3), garde(racine, 'verte', 0)],
      env: { ...process.env, [RESULTATS]: d },
      dire: () => {},
    });
    expect(code).toBe(1);
    const { constats } = lireSarif(d);
    expect(constats).toHaveLength(1);
    expect(constats[0]).toMatchObject({ garde: 'rouge', fichier: null, paquet: null });
    expect(constats[0].message).toContain('code 3');
  });
  it('a red guard that wrote its own SARIF keeps its findings alone', () => {
    const racine = depot();
    const d = dossier();
    jouerLesGardes({
      racine,
      gardes: [garde(racine, 'situee', 1, true)],
      env: { ...process.env, [RESULTATS]: d },
      dire: () => {},
    });
    expect(lireSarif(d).constats).toEqual([
      expect.objectContaining({
        garde: 'situee',
        fichier: 'packages/a/src/x.ts',
        paquet: 'packages/a',
      }),
    ]);
  });
});

describe('the frame’s guards that judge the root write their refusals in SARIF', () => {
  it('turbo-des-paquets: each refusal a finding of the root, without a file of a component', () => {
    const racine = depot();
    writeFileSync(path.join(racine, 'turbo.json'), JSON.stringify({ tasks: { build: {} } }));
    const d = dossier();
    const r = spawnSync(
      process.execPath,
      [path.join(DEPOT, 'packages/grillhouse/scripts/turbo-des-paquets.mjs')],
      {
        cwd: racine,
        encoding: 'utf8',
        env: { ...process.env, [RESULTATS]: d },
      }
    );
    expect(r.status).toBe(1);
    const { gardes, constats } = lireSarif(d);
    expect(gardes).toEqual(['turbo-des-paquets']);
    expect(constats.length).toBeGreaterThan(0);
    expect(constats.every(c => c.garde === 'turbo-des-paquets' && c.paquet === null)).toBe(true);
    expect(r.stderr).toContain(constats[0].message);
  });
});

describe('a project’s guards write their SARIF by the same means, as the charter says', () => {
  it('the charter names the function and the variable', () => {
    const charte = readFileSync(path.join(DEPOT, '.claude/grillhouse/charte.md'), 'utf8');
    expect(charte).toContain('ecrireSarif');
    expect(charte).toContain(RESULTATS);
  });
});
