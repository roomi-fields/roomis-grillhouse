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
  bloquantsDeLaFiche,
  conformiteDuLot,
  ecrireSarif,
  lireFiche,
  lireRapportsVitest,
  lireResumes,
  lireSarif,
  sarif,
  schemaDeFiche,
} from '../../scripts/resultats.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/resultats.mjs');
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
  it('the reviewer: its verdict, its line of conformity per element of the lot, its findings, the findings before it judged (a bounded review), the deviations, its question for the owner, its discoveries', () => {
    expect(champs('relecteur')).toEqual(
      ['conformite', 'constats', 'decouvertes', 'ecarts', 'question', 'suivi', 'verdict'].sort()
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
  // grillhouse-3uv.89.1 (L9), grillhouse-3uv.95.4: the questionneur asks, once.
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
  // grillhouse-3uv.95.4: the regulator and the technical referent are removed, their sheets with
  // them.
  it('a role the circuit does not lead has no sheet', () => {
    expect(schemaDeFiche('regulateur')).toBeNull();
    expect(schemaDeFiche('referent-technique')).toBeNull();
  });
  // grillhouse-3uv.95.5 (decision 4 of 3uv.95): the explorateur writes the plan in its sheet, which
  // the circuit writes at the ticket, and answers the questionneur once, question by question.
  it('the explorateur: the plan (its criteria, the packages to touch, its open questions) and its one answer, CHANGE or GARDE by question', () => {
    expect(champs('explorateur')).toEqual(
      ['criteres', 'decouvertes', 'paquets', 'questions', 'reponses'].sort()
    );
    const s = schemaDeFiche('explorateur') as Schema;
    expect(s.required).toEqual(['criteres', 'paquets', 'questions']);
    const r = s.properties.reponses as {
      items: { required: string[]; properties: { reponse: { enum: string[] } } };
    };
    expect(r.items.properties.reponse.enum).toEqual(['CHANGE', 'GARDE']);
    expect(r.items.required).toEqual(['numero', 'reponse', 'texte']);
    const q = s.properties.questions as { items: { required: string[] } };
    expect(q.items.required).toEqual(['question', 'piece']);
    const plan = { criteres: ['`mesure` rend le double.'], paquets: ['000-forms'], questions: [] };
    expect(lireFiche('explorateur', sortie(plan)).erreur).toBeUndefined();
    expect(lireFiche('explorateur', sortie({ ...plan, paquets: [] })).erreur).toContain('paquets');
    // The sheet carries the criteria the plan adds: none is a plan.
    expect(lireFiche('explorateur', sortie({ ...plan, criteres: [] })).erreur).toBeUndefined();
    expect(
      lireFiche(
        'explorateur',
        sortie({ ...plan, reponses: [{ numero: 'un', reponse: 'GARDE', texte: 'x' }] })
      ).erreur
    ).toContain('numero');
  });
  it('the command prints the schema of a role as JSON, the one claude receives; a role without a sheet exits 1', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--schema', 'developpeur'], {
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(schemaDeFiche('developpeur'));
    const sans = spawnSync(process.execPath, [SCRIPT, '--schema', 'regulateur'], {
      encoding: 'utf8',
    });
    expect(sans.status).toBe(1);
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

// grillhouse-3uv.95.7, decision 2 of grillhouse-3uv.95 (Romain, 2026-10-23: « il faut que le
// relecteur valide vraiment la conformité à l'architecture de tout ce qu'il y a de
// nouveau/changé »): as a review that asks a word on every changed file, the reviewer's sheet
// holds one line per element of the lot (scripts/elements-du-lot.mjs), conforming or not, the
// rule it cites (CADRE, INTERFACE or ARCHITECTURE, with its reference) and its piece; a « non »
// sends the lot back to its recipient.
describe('the conformity of each element of the lot in a reviewer’s sheet', () => {
  const oui = {
    element: 'packages/a/src/x.ts#x',
    conforme: 'oui',
    document: 'CADRE',
    reference: 'packages/a, R2',
    piece: 'packages/a/src/x.ts:3 reçoit le type que Reçoit nomme.',
  };
  const non = {
    element: 'packages/a/src/x.ts#lire',
    conforme: 'non',
    document: 'ARCHITECTURE',
    reference: 'packages/a, § Les frontières',
    piece: 'packages/a/src/x.ts:9 lit packages/b/src/interne.ts.',
    role: 'developpeur',
    composant: 'packages/a',
  };
  const fiche = (f: Record<string, unknown>) => lireFiche('relecteur', sortie(f));

  it('each line names its element, conforme oui or non, the document and the reference of the rule it cites, and its piece', () => {
    const c = (schemaDeFiche('relecteur') as Schema).properties.conformite as {
      items: Schema & {
        properties: { conforme: { enum: string[] }; document: { enum: string[] } };
      };
    };
    expect(Object.keys(c.items.properties).sort()).toEqual(
      ['composant', 'conforme', 'document', 'element', 'piece', 'reference', 'role'].sort()
    );
    expect(c.items.required).toEqual(['element', 'conforme', 'document', 'reference', 'piece']);
    expect(c.items.properties.conforme.enum).toEqual(['oui', 'non']);
    expect(c.items.properties.document.enum).toEqual(['CADRE', 'INTERFACE', 'ARCHITECTURE']);
    expect(fiche({ verdict: 'ACCEPTÉ', conformite: [oui] }).erreur).toBeUndefined();
  });

  it('a line that cites no rule of the CADRE, the INTERFACE or the ARCHITECTURE is refused', () => {
    expect(
      fiche({ verdict: 'ACCEPTÉ', conformite: [{ ...oui, document: 'le bon sens' }] }).erreur
    ).toMatch(/conformite\[0\]\.document/);
    const { document: _d, ...sansDocument } = oui;
    expect(fiche({ verdict: 'ACCEPTÉ', conformite: [sansDocument] }).erreur).toMatch(
      /conformite\[0\]\.document : manque/
    );
    expect(fiche({ verdict: 'ACCEPTÉ', conformite: [{ ...oui, reference: ' ' }] }).erreur).toMatch(
      /conformite\[0\]\.reference : manque/
    );
  });

  it('a « non » blocks the verdict and names its recipient', () => {
    expect(fiche({ verdict: 'RENDU', conformite: [oui, non] }).erreur).toBeUndefined();
    expect(fiche({ verdict: 'ACCEPTÉ', conformite: [non] }).erreur).toMatch(
      /verdict : ACCEPTÉ avec un constat bloquant/
    );
    const { role: _r, ...sansRole } = non;
    expect(fiche({ verdict: 'RENDU', conformite: [sansRole] }).erreur).toMatch(
      /conformite\[0\]\.role : manque/
    );
    const { composant: _c, ...sansComposant } = non;
    expect(fiche({ verdict: 'RENDU', conformite: [sansComposant] }).erreur).toMatch(
      /conformite\[0\]\.composant : manque/
    );
    // The circuit plays a « non » as a blocking finding, sent to its recipient.
    expect(bloquantsDeLaFiche({ verdict: 'RENDU', conformite: [oui, non] })).toEqual([
      {
        titre: 'packages/a/src/x.ts#lire',
        genre: 'bloquant',
        regle: 'ARCHITECTURE packages/a, § Les frontières',
        role: 'developpeur',
        composant: 'packages/a',
        corps: `Non conforme : ${non.piece}`,
      },
    ]);
  });

  describe('against the elements of its lot', () => {
    const elements = [
      { id: 'packages/a/src/x.ts#x', nom: 'x', statut: 'changé', exporte: true },
      { id: 'packages/a/src/x.ts#lire', nom: 'lire', statut: 'neuf', exporte: false },
    ];
    const lire = { ...oui, element: 'packages/a/src/x.ts#lire' };

    it('a sheet with one line per element conforms', () => {
      expect(conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [oui, lire] }, elements)).toBeNull();
    });
    it('a sheet missing an element is refused, naming it', () => {
      expect(conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [oui] }, elements)).toMatch(
        /packages\/a\/src\/x\.ts#lire/
      );
      expect(conformiteDuLot({ verdict: 'ACCEPTÉ' }, elements)).toMatch(
        /packages\/a\/src\/x\.ts#x/
      );
    });
    it('a line on an element out of the lot is refused', () => {
      const ailleurs = { ...oui, element: 'packages/a/src/y.ts#y' };
      expect(
        conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [oui, lire, ailleurs] }, elements)
      ).toMatch(/packages\/a\/src\/y\.ts#y/);
    });
    it('a new export names its entry in the INTERFACE of its package', () => {
      const neuf = [{ id: 'packages/a/src/x.ts#x', nom: 'x', statut: 'neuf', exporte: true }];
      expect(conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [oui] }, neuf)).toMatch(/INTERFACE/);
      expect(
        conformiteDuLot(
          {
            verdict: 'ACCEPTÉ',
            conformite: [{ ...oui, document: 'INTERFACE', reference: 'packages/a, entrée `x`' }],
          },
          neuf
        )
      ).toBeNull();
    });
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
    ['questionneur', { issue: 'PEUT-ÊTRE' }, 'issue'],
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
