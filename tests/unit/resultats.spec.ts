// The one module of the formats of results (scripts/resultats.mjs), which the circuit, the guards
// and the tests read: the end-of-session sheet of each role (Claude Code's structured output,
// `claude -p --output-format json --json-schema`, its field `structured_output`), the findings of a
// guard in SARIF 2.1.0, the run summary of Turborepo (`--summarize`) and the JSON report of Vitest.
// Witness: BPScript 320.3 (2026-10-20), where the circuit read free text: the line « Agent :
// testeur » only at the start of a line, the notice ⚠ of a guard not set aside, the red of the
// guards given to the component under way, the last 60 lines of a log that hid the real red, and
// 8 relaunches of a testeur for the form of a line « vert attendu ».
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  RESULTATS,
  ecrireSarif,
  lireFiche,
  lireRapportsVitest,
  lireResumes,
  lireSarif,
  sarif,
  schemaDeFiche,
} from '../../scripts/resultats.mjs';

const DEPOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(DEPOT, 'scripts/resultats.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'resultats-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Schema = { type: string; required: string[]; properties: Record<string, unknown> };
const champs = (role: string) => Object.keys((schemaDeFiche(role) as Schema).properties).sort();
// What claude prints on its standard output with `--output-format json`.
const sortie = (structured?: unknown) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: 'abc',
    result: 'fini',
    ...(structured === undefined ? {} : { structured_output: structured }),
  });

describe('the sheet of each role holds only the fields a reader reads', () => {
  it('the testeur: its status, its reason or question, its expected greens, its discoveries', () => {
    expect(champs('testeur')).toEqual(
      ['decouvertes', 'question', 'raison', 'statut', 'verts_attendus'].sort()
    );
    expect((schemaDeFiche('testeur') as Schema).required).toEqual(['statut']);
  });
  it('the developpeur: its status, its sending to a testeur, the deviations to name at the commit, its discoveries', () => {
    expect(champs('developpeur')).toEqual(
      ['decouvertes', 'ecarts', 'question', 'raison', 'renvoi', 'statut'].sort()
    );
  });
  it('the reviewer: its verdict, its findings, the findings before it judged (a bounded review), its remarks, the deviations, its question for the owner, its discoveries', () => {
    expect(champs('relecteur')).toEqual(
      ['constats', 'decouvertes', 'ecarts', 'question', 'remarques', 'suivi', 'verdict'].sort()
    );
    expect((schemaDeFiche('relecteur') as Schema).required).toEqual(['verdict']);
  });
  it('the regulator: its decision, the agent a RELANCE --depuis names, its context, its question, its discoveries', () => {
    expect(champs('regulateur')).toEqual(
      ['contexte', 'decision', 'decouvertes', 'depuis', 'question'].sort()
    );
    expect((schemaDeFiche('regulateur') as Schema).required).toEqual(['decision']);
  });
  it('a role the circuit does not lead has no sheet', () => {
    expect(schemaDeFiche('explorateur')).toBeNull();
  });
  it('the command prints the schema of a role as JSON, the one claude receives; a role without a sheet exits 1', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--schema', 'developpeur'], {
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(schemaDeFiche('developpeur'));
    const sans = spawnSync(process.execPath, [SCRIPT, '--schema', 'explorateur'], {
      encoding: 'utf8',
    });
    expect(sans.status).toBe(1);
  });
});

describe('the reading of a sheet in the output of a session', () => {
  it('a conforming sheet is read with the session that wrote it', () => {
    const lu = lireFiche(
      'testeur',
      sortie({
        statut: 'FAIT',
        verts_attendus: [{ fichier: 'packages/a/test/x.test.ts', raison: 'renommé' }],
      })
    );
    expect(lu).toEqual({
      fiche: {
        statut: 'FAIT',
        verts_attendus: [{ fichier: 'packages/a/test/x.test.ts', raison: 'renommé' }],
      },
      seance: 'abc',
    });
  });
  it('an output without structured_output has no sheet, and says so', () => {
    const lu = lireFiche('testeur', sortie());
    expect(lu.fiche).toBeUndefined();
    expect(lu.erreur).toContain('structured_output');
  });
  it('an output that is no JSON, or empty, has no sheet', () => {
    expect(lireFiche('testeur', 'passation au ticket').erreur).toBeTruthy();
    expect(lireFiche('testeur', '').erreur).toBeTruthy();
  });
  it.each([
    ['testeur', { statut: 'PEUT-ÊTRE' }, 'statut'],
    ['testeur', { statut: 'FAIT', note: 'x' }, 'note'],
    ['testeur', { statut: 'BLOQUÉ' }, 'raison'],
    ['developpeur', { statut: 'BESOIN' }, 'question'],
    ['testeur', { statut: 'FAIT', verts_attendus: [{ fichier: 'a.test.ts' }] }, 'raison'],
    ['developpeur', { statut: 'FAIT', renvoi: { role: 'developpeur', composant: 'a' } }, 'role'],
    ['relecteur', { verdict: 'PEUT-ÊTRE' }, 'verdict'],
    ['relecteur', { verdict: 'RENDU', constats: [{ titre: 't' }] }, 'corps'],
    ['regulateur', { decision: 'RELANCE --depuis' }, 'depuis'],
    ['regulateur', { decision: 'MONTE' }, 'question'],
    ['regulateur', { decision: 'RELANCE --reprendre', contexte: 3 }, 'contexte'],
  ])(
    'a sheet of the %s that does not conform is refused, naming its field: %j',
    (role, f, champ) => {
      const lu = lireFiche(role, sortie(f));
      expect(lu.fiche).toBeUndefined();
      expect(lu.erreur).toContain(champ);
    }
  );
});

describe('the findings of a guard in SARIF 2.1.0', () => {
  // A repository of packages: packages/a holds the package `a`.
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify({ name: 'r', private: true, workspaces: ['packages/*'] })
  );
  mkdirSync(path.join(racine, 'packages/a/src'), { recursive: true });
  writeFileSync(path.join(racine, 'packages/a/package.json'), JSON.stringify({ name: 'a' }));

  it('each finding is a result: ruleId the guard, its file and line, its level, its message, its package and its kind', () => {
    const s = sarif({
      garde: 'mots',
      racine,
      constats: [
        { fichier: 'packages/a/src/x.ts', ligne: 57, message: 'un mot en dur', regle: 'mot' },
        { message: 'le registre ne se lit pas', genre: 'a-arbitrer', niveau: 'warning' },
      ],
    }) as {
      version: string;
      runs: { tool: { driver: { name: string } }; results: Record<string, unknown>[] }[];
    };
    expect(s.version).toBe('2.1.0');
    expect(s.runs[0].tool.driver.name).toBe('mots');
    expect(s.runs[0].results).toEqual([
      {
        ruleId: 'mots',
        level: 'error',
        message: { text: 'un mot en dur' },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'packages/a/src/x.ts' },
              region: { startLine: 57 },
            },
          },
        ],
        properties: { regle: 'mot', paquet: 'packages/a', genre: 'a-corriger' },
      },
      {
        ruleId: 'mots',
        level: 'warning',
        message: { text: 'le registre ne se lit pas' },
        properties: { paquet: null, genre: 'a-arbitrer' },
      },
    ]);
  });

  it('written under the results directory the run names, read back as findings; nothing written without it', () => {
    const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    const constats = [{ fichier: 'packages/a/src/x.ts', ligne: 3, message: 'm' }];
    expect(ecrireSarif({ garde: 'g', racine, constats, env: {} })).toBeNull();
    expect(readdirSync(dossier)).toEqual([]);
    ecrireSarif({ garde: 'g', racine, constats, env: { [RESULTATS]: dossier } });
    ecrireSarif({ garde: 'h', racine, constats: [], env: { [RESULTATS]: dossier } });
    expect(lireSarif(dossier)).toEqual({
      gardes: ['g', 'h'],
      constats: [
        {
          garde: 'g',
          regle: null,
          fichier: 'packages/a/src/x.ts',
          ligne: 3,
          niveau: 'error',
          message: 'm',
          paquet: 'packages/a',
          genre: 'a-corriger',
        },
      ],
    });
  });

  it('a directory without SARIF reads as no guard and no finding', () => {
    expect(lireSarif(path.join(ESSAIS, 'absent'))).toEqual({ gardes: [], constats: [] });
  });
});

describe('the summary of a Turborepo run', () => {
  it('each task: its id, package, directory, script, exit code, cache status and log file', () => {
    const dossier = mkdtempSync(path.join(ESSAIS, 'turbo-'));
    mkdirSync(path.join(dossier, 'turbo'));
    writeFileSync(
      path.join(dossier, 'turbo', 'run.json'),
      JSON.stringify({
        tasks: [
          {
            taskId: 'a#build',
            task: 'build',
            package: 'a',
            directory: 'packages/a',
            logFile: 'packages/a/.turbo/turbo-build.log',
            execution: { exitCode: 2 },
            cache: { status: 'MISS' },
          },
          {
            taskId: '//#gardes',
            task: 'gardes',
            package: '//',
            directory: '',
            logFile: '.turbo/turbo-gardes.log',
            execution: { exitCode: 0 },
            cache: { status: 'HIT' },
          },
        ],
      })
    );
    expect(lireResumes(dossier)).toEqual([
      {
        tache: 'a#build',
        paquet: 'a',
        dossier: 'packages/a',
        script: 'build',
        code: 2,
        cache: 'MISS',
        journal: 'packages/a/.turbo/turbo-build.log',
      },
      {
        tache: '//#gardes',
        paquet: '//',
        dossier: '.',
        script: 'gardes',
        code: 0,
        cache: 'HIT',
        journal: '.turbo/turbo-gardes.log',
      },
    ]);
  });
  it('no summary reads as no task', () => {
    expect(lireResumes(path.join(ESSAIS, 'absent'))).toEqual([]);
  });
});

describe('the JSON reports of Vitest', () => {
  it('each test file: its path, its status, the message of a file that does not load, its tests', () => {
    const dossier = mkdtempSync(path.join(ESSAIS, 'vitest-'));
    mkdirSync(path.join(dossier, 'vitest'));
    writeFileSync(
      path.join(dossier, 'vitest', 'a.json'),
      JSON.stringify({
        testResults: [
          {
            name: '/r/packages/a/test/x.test.ts',
            status: 'failed',
            message: '',
            assertionResults: [
              {
                title: 'critère 1',
                fullName: 'mesure critère 1',
                status: 'failed',
                failureMessages: ['expected 2 to be 4\n    at x.test.ts:3'],
              },
              { title: 'ancien', fullName: 'ancien', status: 'passed', failureMessages: [] },
            ],
          },
          {
            name: '/r/packages/a/test/y.test.ts',
            status: 'failed',
            message: 'Cannot find module',
            assertionResults: [],
          },
        ],
      })
    );
    expect(lireRapportsVitest(dossier)).toEqual([
      {
        fichier: '/r/packages/a/test/x.test.ts',
        etat: 'failed',
        message: '',
        tests: [
          {
            titre: 'critère 1',
            nom: 'mesure critère 1',
            etat: 'failed',
            message: 'expected 2 to be 4\n    at x.test.ts:3',
          },
          { titre: 'ancien', nom: 'ancien', etat: 'passed', message: '' },
        ],
      },
      {
        fichier: '/r/packages/a/test/y.test.ts',
        etat: 'failed',
        message: 'Cannot find module',
        tests: [],
      },
    ]);
  });
});
