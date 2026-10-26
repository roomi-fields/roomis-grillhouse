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
  lirePiece,
  lireRapportsVitest,
  lireResumes,
  lireSarif,
  reponsesAuxQuestions,
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
      ['decouvertes', 'piece', 'question', 'raison', 'statut', 'verts_attendus'].sort()
    );
    expect((schemaDeFiche('testwriter') as Schema).required).toEqual(['statut']);
  });
  it('the developpeur: its status, its sending to a testwriter, the deviations to name at the commit, its discoveries', () => {
    expect(champs('developpeur')).toEqual(
      ['decouvertes', 'ecarts', 'piece', 'question', 'raison', 'renvoi', 'statut'].sort()
    );
  });
  it('the reviewer: its verdict, its line of conformity per element of the lot, its findings, the findings before it judged (a bounded review), the deviations, its question for the owner, its discoveries', () => {
    expect(champs('relecteur')).toEqual(
      [
        'conformite',
        'constats',
        'decouvertes',
        'ecarts',
        'piece',
        'question',
        'suivi',
        'verdict',
      ].sort()
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
      ['corps', 'critere_en_cause', 'genre', 'piece', 'regle', 'role', 'titre'].sort()
    );
    expect(c.items.required).toEqual(['titre', 'corps', 'genre', 'piece']);
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
    expect(q.items.required).toEqual(['question', 'vise', 'piece']);
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
      ['criteres', 'decouvertes', 'ecartes', 'paquets', 'questions', 'reponses'].sort()
    );
    const s = schemaDeFiche('explorateur') as Schema;
    expect(s.required).toEqual(['criteres', 'paquets', 'questions']);
    const r = s.properties.reponses as {
      items: { required: string[]; properties: { reponse: { enum: string[] } } };
    };
    expect(r.items.properties.reponse.enum).toEqual(['CHANGE', 'GARDE']);
    expect(r.items.required).toEqual(['numero', 'reponse', 'texte']);
    const q = s.properties.questions as { items: { required: string[] } };
    expect(q.items.required).toEqual(['question', 'motif', 'piece']);
    const plan = {
      criteres: ['`mesure` rend le double.'],
      paquets: ['000-forms'],
      questions: [],
    };
    expect(lireFiche('explorateur', sortie(plan)).erreur).toBeUndefined();
    expect(lireFiche('explorateur', sortie({ ...plan, paquets: [] })).erreur).toContain('paquets');
    // grillhouse-ybq.3: a component of the survey the plan does not touch, set apart with its
    // reason.
    const ecarte = { ...plan, ecartes: [{ composant: '030-binder', raison: 'inchangé' }] };
    expect(lireFiche('explorateur', sortie(ecarte)).erreur).toBeUndefined();
    expect(
      lireFiche('explorateur', sortie({ ...plan, ecartes: [{ composant: '030-binder' }] })).erreur
    ).toContain('raison');
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
    titre: 'x(0) rend NaN',
    genre: 'bloquant',
    regle: 'critère 2',
    role: 'developpeur',
    corps: 'Preuve : x(0) rend NaN.',
    piece: 'packages/a/src/x.ts:3 divise par sa valeur.',
  };
  const remarque = {
    titre: 'Un nom à revoir',
    genre: 'remarque',
    corps: 'Un nom à revoir.',
    piece: 'packages/a/src/x.ts:9',
  };
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
  };
  const fiche = (f: Record<string, unknown>) => lireFiche('relecteur', sortie(f));

  it('each line names its element, conforme oui or non, the document and the reference of the rule it cites, and its piece', () => {
    const c = (schemaDeFiche('relecteur') as Schema).properties.conformite as {
      items: Schema & {
        properties: { conforme: { enum: string[] }; document: { enum: string[] } };
      };
    };
    expect(Object.keys(c.items.properties).sort()).toEqual(
      ['conforme', 'document', 'element', 'piece', 'reference', 'role'].sort()
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

  it('a « non » blocks the verdict and names its agent', () => {
    expect(fiche({ verdict: 'RENDU', conformite: [oui, non] }).erreur).toBeUndefined();
    expect(fiche({ verdict: 'ACCEPTÉ', conformite: [non] }).erreur).toMatch(
      /verdict : ACCEPTÉ avec un constat bloquant/
    );
    const { role: _r, ...sansRole } = non;
    expect(fiche({ verdict: 'RENDU', conformite: [sansRole] }).erreur).toMatch(
      /conformite\[0\]\.role : manque/
    );
    // grillhouse-3uv.95.6: a « non » names its agent alone, as a finding.
    expect(
      fiche({ verdict: 'RENDU', conformite: [{ ...non, composant: 'packages/a' }] }).erreur
    ).toMatch(/composant/);
    // The circuit plays a « non » as a blocking finding, sent to its recipient.
    expect(bloquantsDeLaFiche({ verdict: 'RENDU', conformite: [oui, non] })).toEqual([
      {
        titre: 'packages/a/src/x.ts#lire',
        genre: 'bloquant',
        regle: 'ARCHITECTURE packages/a, § Les frontières',
        role: 'developpeur',
        corps: `Non conforme : ${non.piece}`,
      },
    ]);
  });

  describe('against the elements of its lot', () => {
    const elements = [
      { id: 'packages/a/src/x.ts#x', nom: 'x', statut: 'changé', exporte: true },
      { id: 'packages/a/src/x.ts#lire', nom: 'lire', statut: 'neuf', exporte: false },
    ];
    const liste = { elements, horsDuService: [] };
    const lire = { ...oui, element: 'packages/a/src/x.ts#lire' };

    it('a sheet with one line per element conforms', () => {
      expect(conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [oui, lire] }, liste)).toBeNull();
    });
    it('a sheet missing an element is refused, naming it', () => {
      expect(conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [oui] }, liste)).toMatch(
        /packages\/a\/src\/x\.ts#lire/
      );
      expect(conformiteDuLot({ verdict: 'ACCEPTÉ' }, liste)).toMatch(/packages\/a\/src\/x\.ts#x/);
    });
    it('a line on an element out of the lot is refused', () => {
      const ailleurs = { ...oui, element: 'packages/a/src/y.ts#y' };
      expect(
        conformiteDuLot({ verdict: 'ACCEPTÉ', conformite: [oui, lire, ailleurs] }, liste)
      ).toMatch(/packages\/a\/src\/y\.ts#y/);
    });
    it('a new export names its entry in the INTERFACE of its package', () => {
      const neuf = [{ id: 'packages/a/src/x.ts#x', nom: 'x', statut: 'neuf', exporte: true }];
      expect(
        conformiteDuLot(
          { verdict: 'ACCEPTÉ', conformite: [oui] },
          { elements: neuf, horsDuService: [] }
        )
      ).toMatch(/INTERFACE/);
      expect(
        conformiteDuLot(
          {
            verdict: 'ACCEPTÉ',
            conformite: [{ ...oui, document: 'INTERFACE', reference: 'packages/a, entrée `x`' }],
          },
          { elements: neuf, horsDuService: [] }
        )
      ).toBeNull();
    });
    // grillhouse-9jr.1: on BPScript bp-mono-vbwf.328, the reviewer named the elements of
    // verif-mots-de-librairie.mjs, out of the language service, as « …mjs#juger » then as the file
    // alone, and every line was refused. As a review accepts a comment on any line of the diff, a
    // line on a file out of the service, or on one of its elements, is accepted.
    describe('a file out of the language service', () => {
      const HORS = 'packages/t/src/verif.mjs';
      const hors = { elements, horsDuService: [HORS] };
      it('a line on one of its elements, or on the file alone, is accepted', () => {
        expect(
          conformiteDuLot(
            {
              verdict: 'ACCEPTÉ',
              conformite: [oui, lire, { ...oui, element: `${HORS}#juger` }],
            },
            hors
          )
        ).toBeNull();
        expect(
          conformiteDuLot(
            { verdict: 'ACCEPTÉ', conformite: [oui, lire, { ...oui, element: HORS }] },
            hors
          )
        ).toBeNull();
      });
      it('a line out of the lot and out of these files is still refused', () => {
        for (const element of [
          'packages/t/src/autre.mjs#juger',
          'packages/t/src/verif.mjs.bak',
          `${HORS}#`,
        ]) {
          expect(
            conformiteDuLot(
              { verdict: 'ACCEPTÉ', conformite: [oui, lire, { ...oui, element }] },
              hors
            )
          ).toMatch(/n'est pas un élément du lot/);
        }
      });
    });
  });
});

// grillhouse-9jr.5: on BPScript 320.10 the explorateur's second sheet carried no `reponses`,
// though it had answered by adding criteria, and the stop « questionnement » came back with its 4
// questions « sans réponse ». As a reviewer gives a line to each element of its lot
// (conformiteDuLot), the explorateur's answer gives a line to each question put.
describe('the answer of the explorateur to the questions put', () => {
  const ligne = (numero: string) => ({ numero, reponse: 'GARDE', texte: 'x' });
  it('critère 1 — one line of reponses by question put conforms; each missing number is named', () => {
    expect(reponsesAuxQuestions({ reponses: [ligne('1'), ligne('2')] }, 2)).toBeNull();
    expect(reponsesAuxQuestions({ reponses: [ligne('2')] }, 3)).toBe(
      'reponses : sans ligne pour les questions 1, 3'
    );
    expect(reponsesAuxQuestions({}, 1)).toBe('reponses : sans ligne pour les questions 1');
    expect(reponsesAuxQuestions({}, 0)).toBeNull();
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
        sortie({
          issue: 'QUESTIONS',
          questions: [{ question: 'Pourquoi ?', vise: 'intention', piece: 'CLAUDE.md:7' }],
        })
      ).erreur
    ).toBeUndefined();
    expect(
      lireFiche(
        'questionneur',
        sortie({
          issue: 'QUESTIONS',
          questions: [{ question: 'Pourquoi ?', vise: 'goût', piece: 'CLAUDE.md:7' }],
        })
      ).erreur
    ).toContain('vise');
  });
});

// grillhouse-9jr.3 (BP bp-mono-vbwf.328): the plan stopped at « questionnement » on a question the
// ticket already settled, its recommendation written in it. As a structured output holds its form
// by its schema (a required field, an enum), each open question of the plan names why it goes up.
describe('the reason an open question of the plan goes up (9jr.3)', () => {
  const plan = (q: Record<string, unknown>) =>
    sortie({ criteres: [], paquets: ['packages/a'], questions: [q] });
  const question = { question: 'Le format change-t-il ?', piece: 'CLAUDE.md:7' };

  it('critère 1 — an open question carries a required motif: the language, the architecture, a gap to the reference, or no answer', () => {
    const items = (
      (schemaDeFiche('explorateur') as Schema).properties.questions as {
        items: Schema & { properties: { motif: { enum: string[] } } };
      }
    ).items;
    expect(items.required).toContain('motif');
    expect(items.properties.motif.enum).toEqual([
      'langage',
      'architecture',
      'écart à la référence',
      'sans réponse',
    ]);
    for (const motif of items.properties.motif.enum) {
      expect(lireFiche('explorateur', plan({ ...question, motif })).erreur).toBeUndefined();
    }
  });

  it('critère 2 — a question without its motif, or with a motif out of its values, is refused, naming the field', () => {
    expect(lireFiche('explorateur', plan(question)).erreur).toMatch(
      /questions\[0\]\.motif : manque/
    );
    expect(lireFiche('explorateur', plan({ ...question, motif: 'recommandation' })).erreur).toMatch(
      /questions\[0\]\.motif : « recommandation » n'est pas l'un de langage, architecture, écart à la référence, sans réponse/
    );
  });
});

// grillhouse-3uv.95.10, decision 5 of grillhouse-3uv.95: in BP 320.9 a question born of a line
// read wrong (native.ts:234) was copied by five agents up to the owner, none of them re-reading it.
// As a code review cites the line it judges, a finding, a question or a montée carries its piece,
// in one format: `<fichier>:<ligne>` from the root of the copy, or `$ <commande>` and its output;
// the circuit checks that a file piece is in the copy.
describe('the piece of each fact a sheet carries', () => {
  const copie = mkdtempSync(path.join(ESSAIS, 'copie-'));
  mkdirSync(path.join(copie, 'packages/a/src'), { recursive: true });
  writeFileSync(path.join(copie, 'packages/a/src/x.ts'), 'un\ndeux\ntrois\n');
  writeFileSync(path.join(ESSAIS, 'dehors.ts'), 'un\n');
  const besoin = (piece?: string) => ({
    statut: 'BESOIN',
    question: 'Que rend x de 0 ?',
    ...(piece === undefined ? {} : { piece }),
  });

  it('a piece is a file and its line from the root of the copy, or a command and its output', () => {
    expect(lirePiece('packages/a/src/x.ts:3 divise par sa valeur.')).toEqual({
      fichier: 'packages/a/src/x.ts',
      ligne: 3,
    });
    expect(lirePiece('packages/a/src/x.ts:3')).toEqual({
      fichier: 'packages/a/src/x.ts',
      ligne: 3,
    });
    // A range, as SARIF's region and GitHub's link; the place in backquotes or before punctuation.
    expect(lirePiece('packages/a/src/x.ts:1-3 la boucle.')).toEqual({
      fichier: 'packages/a/src/x.ts',
      ligne: 1,
      fin: 3,
    });
    expect(lirePiece('packages/a/src/x.ts:3.')).toEqual({
      fichier: 'packages/a/src/x.ts',
      ligne: 3,
    });
    expect(lirePiece('`packages/a/src/x.ts:3`, la division')).toEqual({
      fichier: 'packages/a/src/x.ts',
      ligne: 3,
    });
    expect(lirePiece('$ npm test -- packages/a\n1 failed : x(0)')).toEqual({
      commande: 'npm test -- packages/a',
      sortie: '1 failed : x(0)',
    });
    for (const faux of [
      'packages/a/src/x.ts',
      'packages/a/src/x.ts:0',
      'packages/a/src/x.ts:3-1',
      'packages/a/src/x.ts:1-2-3',
      'packages/a/src/x.ts:trois',
      ':3',
      '$ npm test',
      '$ \n1 failed',
      'voir le code',
      '',
    ]) {
      expect(lirePiece(faux), faux).toBeNull();
    }
  });

  // BP 320.3.9: a developpeur's BESOIN, its piece « $ … gardes\n⛔ … » with a « \n » written in two
  // characters, was refused, and its question lost.
  it('a command piece whose output follows a « \\n » written in two characters reads as after a line break', () => {
    expect(
      lirePiece('$ npm run grillhouse:gardes\\n⛔ consommateurs-arbitres : isHeadLayer')
    ).toEqual({
      commande: 'npm run grillhouse:gardes',
      sortie: '⛔ consommateurs-arbitres : isHeadLayer',
    });
    expect(
      lireFiche('developpeur', sortie(besoin('$ npm test -- packages/a\\n1 failed'))).erreur
    ).toBeUndefined();
    expect(lirePiece('$ npm test\\n')).toBeNull();
  });

  it('each finding, question and stop of a sheet holds its piece in its schema', () => {
    type Liste = { items: { required: string[] } };
    const props = (role: string) => (schemaDeFiche(role) as Schema).properties;
    expect((props('relecteur').constats as Liste).items.required).toContain('piece');
    expect((props('questionneur').questions as Liste).items.required).toContain('piece');
    expect((props('explorateur').questions as Liste).items.required).toContain('piece');
    for (const role of ['testwriter', 'developpeur', 'relecteur']) {
      expect(props(role), role).toHaveProperty('piece');
    }
  });

  it.each([
    ['testwriter', { statut: 'BLOQUÉ', raison: 'le type manque.' }],
    ['developpeur', besoin()],
    ['relecteur', { verdict: 'ACCEPTÉ', question: 'Ce mot est-il du langage ?' }],
    [
      'relecteur',
      { verdict: 'ACCEPTÉ', constats: [{ titre: 'Un nom', genre: 'remarque', corps: 'à revoir' }] },
    ],
    ['questionneur', { issue: 'QUESTIONS', questions: [{ question: 'Pourquoi ?', vise: 'flou' }] }],
    [
      'explorateur',
      {
        criteres: [],
        paquets: ['packages/a'],
        questions: [{ question: 'Le format change-t-il ?', motif: 'architecture' }],
      },
    ],
  ])('a sheet of the %s without its piece is refused: %j', (role, f) => {
    const lu = lireFiche(role, sortie(f));
    expect(lu.fiche).toBeUndefined();
    expect(lu.erreur).toMatch(/piece : manque/);
  });

  it('a piece in neither form is refused, naming its field', () => {
    expect(lireFiche('developpeur', sortie(besoin('voir le code'))).erreur).toMatch(
      /piece : « voir le code » n'est pas une pièce/
    );
    const ligne = {
      element: 'packages/a/src/x.ts#x',
      conforme: 'oui',
      document: 'CADRE',
      reference: 'packages/a, R2',
      piece: 'le code de x',
    };
    expect(
      lireFiche('relecteur', sortie({ verdict: 'ACCEPTÉ', conformite: [ligne] })).erreur
    ).toMatch(/conformite\[0\]\.piece : « le code de x » n'est pas une pièce/);
  });

  it('a file piece is checked in the copy: the file present, the line in the file', () => {
    const lu = (piece: string) => lireFiche('developpeur', sortie(besoin(piece)), { copie });
    expect(lu('packages/a/src/x.ts:3 rend trois.').erreur).toBeUndefined();
    expect(lu('$ npm test -- packages/a\n1 failed').erreur).toBeUndefined();
    expect(lu('packages/a/src/x.ts:2-3').erreur).toBeUndefined();
    expect(lu('`packages/a/src/x.ts:3`.').erreur).toBeUndefined();
    expect(lu('packages/a/src/x.ts:2-4').erreur).toMatch(
      /piece : packages\/a\/src\/x\.ts:2-4 introuvable dans la copie : le fichier a 3 lignes/
    );
    expect(lu('packages/a/src/x.ts:4').erreur).toMatch(
      /piece : packages\/a\/src\/x\.ts:4 introuvable dans la copie : le fichier a 3 lignes/
    );
    expect(lu('packages/a/src/y.ts:1').erreur).toMatch(
      /piece : packages\/a\/src\/y\.ts:1 introuvable dans la copie : pas de tel fichier/
    );
    expect(lu('packages/a/src:1').erreur).toMatch(/introuvable dans la copie : pas de tel fichier/);
    expect(lu(`../${path.basename(ESSAIS)}/dehors.ts:1`).erreur).toMatch(
      /introuvable dans la copie/
    );
    // Without the copy, the form alone is read.
    expect(
      lireFiche('developpeur', sortie(besoin('packages/a/src/y.ts:1'))).erreur
    ).toBeUndefined();
  });

  it('the piece of each line of conformity and of each finding is checked in the copy', () => {
    const ligne = {
      element: 'packages/a/src/x.ts#x',
      conforme: 'oui',
      document: 'CADRE',
      reference: 'packages/a, R2',
      piece: 'packages/a/src/x.ts:9 reçoit son type.',
    };
    const remarque = {
      titre: 'Un nom',
      genre: 'remarque',
      corps: 'à revoir',
      piece: 'packages/a/src/x.ts:2',
    };
    const lu = (f: Record<string, unknown>) => lireFiche('relecteur', sortie(f), { copie });
    expect(lu({ verdict: 'ACCEPTÉ', conformite: [ligne] }).erreur).toMatch(
      /conformite\[0\]\.piece : packages\/a\/src\/x\.ts:9 introuvable/
    );
    expect(
      lu({ verdict: 'ACCEPTÉ', conformite: [{ ...ligne, piece: 'packages/a/src/x.ts:1' }] }).erreur
    ).toBeUndefined();
    expect(
      lu({ verdict: 'ACCEPTÉ', constats: [{ ...remarque, piece: 'packages/b/x.ts:1' }] }).erreur
    ).toMatch(/constats\[0\]\.piece : packages\/b\/x\.ts:1 introuvable/);
    expect(lu({ verdict: 'ACCEPTÉ', constats: [remarque] }).erreur).toBeUndefined();
    expect(
      lireFiche(
        'explorateur',
        sortie({
          criteres: [],
          paquets: ['packages/a'],
          questions: [
            {
              question: 'Le format change-t-il ?',
              motif: 'architecture',
              piece: 'packages/a/src/z.ts:1',
            },
          ],
        }),
        { copie }
      ).erreur
    ).toMatch(/questions\[0\]\.piece : packages\/a\/src\/z\.ts:1 introuvable/);
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
    ['developpeur', { statut: 'FAIT', renvoi: { role: 'developpeur' } }, 'role'],
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
