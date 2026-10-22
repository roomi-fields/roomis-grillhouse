// The one module of the formats of results (scripts/resultats.mjs), which the circuit, the guards
// and the tests read: the end-of-session sheet of each role (Claude Code's structured output,
// `claude -p --output-format json --json-schema`, its field `structured_output`), the findings of a
// guard in SARIF 2.1.0, the run summary of Turborepo (`--summarize`) and the JSON report of Vitest.
// Witness: BPScript 320.3 (2026-10-20), where the circuit read free text: the line « Agent :
// testwriter » only at the start of a line, the notice ⚠ of a guard not set aside, the red of the
// guards given to the component under way, the last 60 lines of a log that hid the real red, and
// 8 relaunches of a testwriter for the form of a line « vert attendu ».
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
  it('the testwriter: its status, its reason or question, its expected greens, its discoveries', () => {
    expect(champs('testwriter')).toEqual(
      ['decouvertes', 'question', 'raison', 'statut', 'verts_attendus'].sort()
    );
    expect((schemaDeFiche('testwriter') as Schema).required).toEqual(['statut']);
  });
  it('the developpeur: its status, its sending to a testwriter, the deviations to name at the commit, its discoveries', () => {
    expect(champs('developpeur')).toEqual(
      ['decouvertes', 'ecarts', 'question', 'raison', 'renvoi', 'statut'].sort()
    );
  });
  it('the reviewer: its verdict, its findings, the findings before it judged (a bounded review), the deviations, its question for the owner, its discoveries', () => {
    expect(champs('relecteur')).toEqual(
      ['constats', 'decouvertes', 'ecarts', 'question', 'suivi', 'verdict'].sort()
    );
    expect((schemaDeFiche('relecteur') as Schema).required).toEqual(['verdict']);
  });
  // grillhouse-3uv.92.5, witness BPScript 320.4: eight lines of one commit on the same fingerprint.
  it('each deviation names its subject, which a later sheet names again to give its last value', () => {
    for (const role of ['developpeur', 'relecteur']) {
      const e = (schemaDeFiche(role) as Schema).properties.ecarts as { items: Schema };
      expect(Object.keys(e.items.properties).sort(), role).toEqual(['sujet', 'texte']);
      expect(e.items.required, role).toEqual(['sujet', 'texte']);
    }
  });
  // grillhouse-3uv.91.2, witness BPScript 325: the reviewer sent the lot back on a case the owner
  // ruled out (« non car la V1 ne change pas elle est gelée »), 18 min, ~38 with what followed.
  it('each finding of the reviewer is blocking, with the criterion or the rule it holds, or a remark', () => {
    const c = (schemaDeFiche('relecteur') as Schema).properties.constats as {
      items: Schema & { properties: { genre: { enum: string[] } } };
    };
    expect(Object.keys(c.items.properties).sort()).toEqual(
      ['composant', 'corps', 'critere_en_cause', 'genre', 'regle', 'role', 'titre'].sort()
    );
    expect(c.items.required).toEqual(['titre', 'corps', 'genre']);
    expect(c.items.properties.genre.enum).toEqual(['bloquant', 'remarque']);
  });
  it('the regulator: its decision, the agents a RELANCE --depuis names, its context, its question, the facts the circuit checks, its discoveries', () => {
    expect(champs('regulateur')).toEqual(
      ['contexte', 'decision', 'decouvertes', 'depuis', 'faits', 'question', 'reponses'].sort()
    );
    expect((schemaDeFiche('regulateur') as Schema).required).toEqual(['decision']);
  });
  // grillhouse-3uv.92.2, witness BPScript 320.4 (n° 11, 20 min): the red of the ceiling of 040,
  // visible from the first final pass, was relaunched only after the third, the sheet carrying a
  // single `depuis`.
  it('critère 1 — a RELANCE --depuis names one or more components of the title, each with its step and its context', () => {
    const depuis = (schemaDeFiche('regulateur') as Schema).properties.depuis as {
      type: string;
      items: Schema & { properties: { role: { enum: string[] } } };
    };
    expect(depuis.type).toBe('array');
    expect(Object.keys(depuis.items.properties).sort()).toEqual(['composant', 'contexte', 'role']);
    expect(depuis.items.required).toEqual(['role', 'composant', 'contexte']);
    expect(depuis.items.properties.role.enum).toEqual(['testwriter', 'developpeur']);
    const lu = lireFiche(
      'regulateur',
      sortie({
        decision: 'RELANCE --depuis',
        depuis: [
          { role: 'developpeur', composant: 'packages/a', contexte: 'Le plafond.' },
          { role: 'testwriter', composant: 'packages/b', contexte: 'Le test du critère 2.' },
        ],
      })
    );
    expect(lu.erreur).toBeUndefined();
  });
  // grillhouse-3uv.89.1 (L9): the questionneur asks, the author answers in its own session.
  it('the questionneur: its issue (questions, none, a disagreement), its questions each with what it aims at, its disagreement', () => {
    expect(champs('questionneur')).toEqual(['desaccord', 'issue', 'questions'].sort());
    expect((schemaDeFiche('questionneur') as Schema).required).toEqual(['issue']);
    const issue = (schemaDeFiche('questionneur') as Schema).properties.issue as { enum: string[] };
    expect(issue.enum).toEqual(['QUESTIONS', 'AUCUNE', 'DÉSACCORD']);
    const q = (schemaDeFiche('questionneur') as Schema).properties.questions as {
      items: { properties: { vise: { enum: string[] } }; required: string[] };
    };
    expect(q.items.properties.vise.enum).toEqual([
      'flou',
      'intention',
      'référence',
      'règle',
      'critère',
    ]);
    expect(q.items.required).toEqual(['question', 'vise']);
  });
  it('the référent technique, on the questions to a plan: its answer to each, the title or the description the plan becomes, its discoveries', () => {
    expect(champs('referent-technique')).toEqual(
      ['decouvertes', 'description', 'reponses', 'titre'].sort()
    );
    expect((schemaDeFiche('referent-technique') as Schema).required).toEqual(['reponses']);
    const r = (schemaDeFiche('referent-technique') as Schema).properties.reponses as {
      items: { properties: { choix: { enum: string[] } }; required: string[] };
    };
    expect(r.items.properties.choix.enum).toEqual(['CHANGE', 'GARDE']);
    expect(r.items.required).toEqual(['question', 'choix', 'texte']);
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

// grillhouse-3uv.89 (L4): the facts a regulator's decision rests on, in a form the circuit checks
// on the state before it applies the decision. Witness: BPScript 320.3, where a MONTE rested on
// « 995-tools hors du titre » (D11) while the title named it, and three relaunches on « la charge
// CPU » (D14, D20, D21) while the red was a real one.
describe('the facts of a regulator’s sheet', () => {
  it('each fact names its subject from a closed list, and its component when the subject has one', () => {
    const faits = (schemaDeFiche('regulateur') as Schema).properties.faits as {
      items: { properties: { sujet: { enum: string[] } }; required: string[] };
    };
    expect(faits.items.properties.sujet.enum).toEqual([
      'au-titre',
      'hors-titre',
      'rouge-de',
      'sans-changement',
      'sous-charge',
    ]);
    expect(faits.items.required).toEqual(['sujet']);
    const lu = lireFiche(
      'regulateur',
      sortie({
        decision: 'MONTE',
        question: 'q',
        faits: [{ sujet: 'hors-titre', composant: '995-tools' }, { sujet: 'sous-charge' }],
      })
    );
    expect(lu.erreur).toBeUndefined();
  });
});

// grillhouse-3uv.91.2: only a blocking finding sends the lot back, and it names what it holds.
describe('the findings of a reviewer’s sheet', () => {
  const bloquant = {
    titre: 'packages/a/src/x.ts:3',
    genre: 'bloquant',
    regle: 'critère 2',
    role: 'developpeur',
    composant: 'packages/a',
    corps: 'Preuve : x(0) rend NaN.',
  };
  const remarque = { titre: 'packages/a/src/x.ts:9', genre: 'remarque', corps: 'Un nom à revoir.' };
  it('a blocking finding without the criterion or the rule it holds is refused', () => {
    const { regle: _, ...sans } = bloquant;
    expect(lireFiche('relecteur', sortie({ verdict: 'RENDU', constats: [sans] })).erreur).toMatch(
      /constats\[0\]\.regle : manque/
    );
    expect(
      lireFiche('relecteur', sortie({ verdict: 'RENDU', constats: [{ ...bloquant, regle: ' ' }] }))
        .erreur
    ).toMatch(/constats\[0\]\.regle : manque/);
    expect(
      lireFiche('relecteur', sortie({ verdict: 'RENDU', constats: [bloquant, remarque] })).erreur
    ).toBeUndefined();
  });
  it('a verdict without a blocking finding is ACCEPTÉ, its remarks kept; RENDU needs one', () => {
    expect(
      lireFiche('relecteur', sortie({ verdict: 'ACCEPTÉ', constats: [remarque] })).erreur
    ).toBeUndefined();
    expect(
      lireFiche('relecteur', sortie({ verdict: 'RENDU', constats: [remarque] })).erreur
    ).toMatch(/verdict : RENDU sans constat bloquant/);
    expect(lireFiche('relecteur', sortie({ verdict: 'RENDU' })).erreur).toMatch(
      /verdict : RENDU sans constat bloquant/
    );
    expect(
      lireFiche('relecteur', sortie({ verdict: 'ACCEPTÉ', constats: [bloquant] })).erreur
    ).toMatch(/verdict : ACCEPTÉ avec un constat bloquant/);
  });
});

describe('the sheets of the questioning (L9)', () => {
  it('questions need at least one question, a disagreement its text', () => {
    expect(
      lireFiche('questionneur', sortie({ issue: 'QUESTIONS', questions: [] })).erreur
    ).toContain('questions');
    expect(lireFiche('questionneur', sortie({ issue: 'DÉSACCORD' })).erreur).toContain('desaccord');
    expect(lireFiche('questionneur', sortie({ issue: 'AUCUNE' })).erreur).toBeUndefined();
    expect(
      lireFiche(
        'questionneur',
        sortie({ issue: 'QUESTIONS', questions: [{ question: 'Pourquoi ?', vise: 'intention' }] })
      ).erreur
    ).toBeUndefined();
    expect(
      lireFiche(
        'questionneur',
        sortie({ issue: 'QUESTIONS', questions: [{ question: 'Pourquoi ?', vise: 'goût' }] })
      ).erreur
    ).toContain('vise');
  });
  it('an answer that changes the plan carries the title or the description it becomes', () => {
    const change = { question: 'q', choix: 'CHANGE', texte: 'un critère de plus' };
    expect(lireFiche('referent-technique', sortie({ reponses: [change] })).erreur).toContain(
      'description'
    );
    expect(
      lireFiche('referent-technique', sortie({ reponses: [change], description: 'd' })).erreur
    ).toBeUndefined();
    expect(
      lireFiche(
        'referent-technique',
        sortie({ reponses: [{ question: 'q', choix: 'GARDE', texte: 'parce que' }] })
      ).erreur
    ).toBeUndefined();
  });
});

describe('the reading of a sheet in the output of a session', () => {
  it('a conforming sheet is read with the session that wrote it', () => {
    const lu = lireFiche(
      'testwriter',
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
    const lu = lireFiche('testwriter', sortie());
    expect(lu.fiche).toBeUndefined();
    expect(lu.erreur).toContain('structured_output');
  });
  it('an output that is no JSON, or empty, has no sheet', () => {
    expect(lireFiche('testwriter', 'passation au ticket').erreur).toBeTruthy();
    expect(lireFiche('testwriter', '').erreur).toBeTruthy();
  });
  it.each([
    ['testwriter', { statut: 'PEUT-ÊTRE' }, 'statut'],
    ['testwriter', { statut: 'FAIT', note: 'x' }, 'note'],
    ['testwriter', { statut: 'BLOQUÉ' }, 'raison'],
    ['developpeur', { statut: 'BESOIN' }, 'question'],
    ['testwriter', { statut: 'FAIT', verts_attendus: [{ fichier: 'a.test.ts' }] }, 'raison'],
    ['developpeur', { statut: 'FAIT', renvoi: { role: 'developpeur', composant: 'a' } }, 'role'],
    ['relecteur', { verdict: 'PEUT-ÊTRE' }, 'verdict'],
    ['relecteur', { verdict: 'RENDU', constats: [{ titre: 't', genre: 'bloquant' }] }, 'corps'],
    ['relecteur', { verdict: 'RENDU', constats: [{ titre: 't', corps: 'c' }] }, 'genre'],
    ['relecteur', { verdict: 'ACCEPTÉ', remarques: ['un nom'] }, 'remarques'],
    ['regulateur', { decision: 'RELANCE --depuis' }, 'depuis'],
    ['regulateur', { decision: 'RELANCE --depuis', depuis: [] }, 'depuis'],
    [
      'regulateur',
      {
        decision: 'RELANCE --depuis',
        depuis: { role: 'testwriter', composant: 'a', contexte: 'c' },
      },
      'depuis',
    ],
    [
      'regulateur',
      { decision: 'RELANCE --depuis', depuis: [{ role: 'testwriter', composant: 'a' }] },
      'contexte',
    ],
    [
      'regulateur',
      {
        decision: 'RELANCE --depuis',
        depuis: [{ role: 'testwriter', composant: 'a', contexte: 'c' }],
        contexte: 'c',
      },
      'contexte',
    ],
    ['regulateur', { decision: 'MONTE' }, 'question'],
    ['regulateur', { decision: 'RELANCE --reprendre', contexte: 3 }, 'contexte'],
    ['regulateur', { decision: 'RELANCE --reprendre', faits: [{ sujet: 'peut-etre' }] }, 'sujet'],
    [
      'regulateur',
      { decision: 'MONTE', question: 'q', faits: [{ sujet: 'hors-titre' }] },
      'composant',
    ],
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
