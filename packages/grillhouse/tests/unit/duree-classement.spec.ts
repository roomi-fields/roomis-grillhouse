// The classification of the duration reporter is a pure function of an internal module of the
// package (`classer` of duree.classement.mjs; the published reporter keeps its default export):
// it takes data, never the disk nor the global state, and gives, per failure, its cause (réel,
// mesure de temps, banc de temps, délai dépassé), its delay label and the pressures at the start
// and at the end; then the verdict of the run: `rouge`, `a-repasser` (75) or `vitest` (Vitest's
// verdict stands), with the line of conclusion (null when no pressure was measured).
//
// Each case builds the tasks by hand (`type`, `result.state`, `result.errors`, `meta`, `filepath`),
// without any process; the reading of the pressure, of the disk and of the exit code belongs to the
// reporter, which a child Vitest proves (temps-au-repos.spec.ts).
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { A_REPASSER, SEUIL_PRESSION } from '../../scripts/mesure/pression.mjs';

// The module loads at the call of a case, so a module that is missing fails each case, not the file.
const MODULE = path.resolve(
  __dirname,
  '../../scripts/langages/typescript/vitest-config/duree.classement.mjs'
);
interface Tache {
  type: string;
  name: string;
  filepath?: string;
  suite?: Tache;
  file?: Tache;
  meta?: Record<string, unknown>;
  tasks?: Tache[];
  result?: { state: string; errors?: { message: string }[] };
}
interface Echec {
  fichier: string;
  nom: string;
  cause: string;
  delai: string | null;
  pressionDebut: number | null;
  pressionFin: number | null;
}
interface Classement {
  echecs: Echec[];
  verdict: string;
  conclusion: string | null;
}
const classer = (entree: unknown): Classement =>
  (createRequire(__filename)(MODULE) as { classer: (e: unknown) => Classement }).classer(entree);

const CHARGE = 90;
const REPOS = 1;
const DELAI_JOUR = 'petit, 60 s';
const DELAI_NUIT = 'grand, 600 s';

const MSG_DELAI = 'Test timed out in 100ms.\nIf this is a long-running test, use a larger timeout.';
const MSG_HOOK = 'Hook timed out in 100ms.';

type Meta = Record<string, unknown>;
// A file task and, under it, a failed test <nom> (errors <messages>, <meta>).
function fichierAvec(
  chemin: string,
  nom: string,
  messages: string[],
  meta: Meta = {}
): { fichier: Tache; test: Tache } {
  const fichier: Tache = { type: 'suite', name: chemin, filepath: chemin, tasks: [] };
  const test: Tache = {
    type: 'test',
    name: nom,
    suite: fichier,
    file: fichier,
    meta,
    result: { state: 'fail', errors: messages.map(message => ({ message })) },
  };
  fichier.tasks?.push(test);
  return { fichier, test };
}
// A file whose hook fails outside of a test: errors on the suite itself.
function fichierAvecHook(chemin: string, messages: string[]): Tache {
  const fichier: Tache = {
    type: 'suite',
    name: chemin,
    filepath: chemin,
    tasks: [],
    result: { state: 'fail', errors: messages.map(message => ({ message })) },
  };
  return fichier;
}
const infos = (horsDuJour: boolean) => ({
  horsDuJour,
  libelleDelai: horsDuJour ? DELAI_NUIT : DELAI_JOUR,
});

const JOUR = '/p/tests/a.test.mjs';
const NUIT = '/p/tests/a.nuit.test.mjs';
const BANC = '/p/tests/t.budget.test.mjs';

function passe(
  files: Tache[],
  o: {
    debut?: number | null;
    fin?: number | null;
    code?: number;
    errors?: unknown[];
    horsDuJour?: string[];
  } = {}
) {
  const hors = new Set(o.horsDuJour ?? []);
  const fichiers: Record<string, ReturnType<typeof infos>> = {};
  for (const f of files) {
    const chemin = f.filepath ?? '';
    fichiers[chemin] = infos(hors.has(chemin));
  }
  return classer({
    files,
    errors: o.errors ?? [],
    debut: o.debut === undefined ? CHARGE : o.debut,
    fin: o.fin === undefined ? CHARGE : o.fin,
    codeDeSortie: o.code ?? 1,
    fichiers,
  });
}

describe('the classification of the duration reporter, without a process', () => {
  it('critère 2: a delay past in a night test is a « délai dépassé », with its delay label and the pressures', () => {
    const { fichier } = fichierAvec(NUIT, 'lent', [MSG_DELAI]);
    const r = passe([fichier], { horsDuJour: [NUIT] });
    expect(r.echecs).toHaveLength(1);
    expect(r.echecs[0]).toMatchObject({
      fichier: NUIT,
      nom: 'lent',
      cause: 'délai dépassé',
      delai: DELAI_NUIT,
      pressionDebut: CHARGE,
      pressionFin: CHARGE,
    });
    expect(r.verdict).toBe('a-repasser');
    expect(r.conclusion).toContain(`code ${A_REPASSER}`);
    expect(r.conclusion).toMatch(/à repasser/);
  });

  it('critère 2: a time budget bench that fails is a « banc de temps », whatever its error', () => {
    const { fichier } = fichierAvec(BANC, 'borne', ['expected 50 to be less than 10']);
    const r = passe([fichier]);
    expect(r.echecs[0]).toMatchObject({ cause: 'banc de temps', delai: null });
    expect(r.verdict).toBe('a-repasser');
  });

  it('critère 2: a test marked by mesurerAuRepos that fails is a « mesure de temps »; unmarked, a real red', () => {
    const marque = fichierAvec(JOUR, 'mesure', ['faux'], { mesureDeTemps: true }).fichier;
    const m = passe([marque]);
    expect(m.echecs[0].cause).toBe('mesure de temps');
    expect(m.verdict).toBe('a-repasser');
    const nu = fichierAvec(JOUR, 'mesure', ['faux']).fichier;
    const n = passe([nu]);
    expect(n.echecs[0].cause).toBe('réel');
    expect(n.verdict).toBe('vitest');
  });

  it('critère 2: a mark of measure on a suite or a hook (not a test) does not make a measure', () => {
    const f = fichierAvecHook(JOUR, ['faux']);
    f.meta = { mesureDeTemps: true };
    expect(passe([f]).echecs[0].cause).toBe('réel');
  });

  it('critère 2: a delay past in a day test is a real red, with its delay label, never « à repasser »', () => {
    const { fichier } = fichierAvec(JOUR, 'lent', [MSG_DELAI]);
    const r = passe([fichier]);
    expect(r.echecs[0]).toMatchObject({ cause: 'réel', delai: DELAI_JOUR });
    expect(r.verdict).toBe('vitest');
    expect(r.conclusion).toBeNull();
  });

  it('critère 2: a real red has no delay label', () => {
    const { fichier } = fichierAvec(JOUR, 'faux', ['expected 1 to be 2']);
    const r = passe([fichier]);
    expect(r.echecs[0]).toMatchObject({ cause: 'réel', delai: null });
  });

  it('critère 2: a delay past at rest in a night test is a red: rouge, with the threshold in the conclusion', () => {
    const { fichier } = fichierAvec(NUIT, 'lent', [MSG_DELAI]);
    const r = passe([fichier], { horsDuJour: [NUIT], debut: REPOS, fin: REPOS });
    expect(r.verdict).toBe('rouge');
    expect(r.conclusion).toContain(`sous ${SEUIL_PRESSION} %`);
    expect(r.conclusion).toMatch(/rouge/);
  });

  it('critère 2: a delay past under load beside a real red is the verdict of Vitest', () => {
    const a = fichierAvec(NUIT, 'lent', [MSG_DELAI]).fichier;
    const b = fichierAvec('/p/tests/b.nuit.test.mjs', 'faux', ['faux']).fichier;
    const r = passe([a, b], { horsDuJour: [NUIT, '/p/tests/b.nuit.test.mjs'] });
    expect(r.echecs.map(e => e.cause)).toEqual(['délai dépassé', 'réel']);
    expect(r.verdict).toBe('vitest');
    expect(r.conclusion).toMatch(/ne dépend pas d’une durée/);
  });

  it('critère 2: a real red alone has no pressure, no conclusion line: the verdict of Vitest', () => {
    const { fichier } = fichierAvec(JOUR, 'faux', ['faux']);
    const r = passe([fichier]);
    expect(r.verdict).toBe('vitest');
    expect(r.conclusion).toBeNull();
  });

  it('critère 2: a hook past its delay in a night file is a delay, under load « à repasser »', () => {
    const f = fichierAvecHook(NUIT, [MSG_HOOK]);
    const r = passe([f], { horsDuJour: [NUIT] });
    expect(r.echecs).toHaveLength(1);
    expect(r.echecs[0]).toMatchObject({ cause: 'délai dépassé', delai: DELAI_NUIT });
    expect(r.verdict).toBe('a-repasser');
  });

  it('critère 2: a load at the start only, or at the end only, is a load', () => {
    const { fichier } = fichierAvec(NUIT, 'lent', [MSG_DELAI]);
    const debut = passe([fichier], { horsDuJour: [NUIT], debut: SEUIL_PRESSION, fin: REPOS });
    expect(debut.verdict).toBe('a-repasser');
    expect(debut.echecs[0]).toMatchObject({ pressionDebut: SEUIL_PRESSION, pressionFin: REPOS });
    const fin = passe([fichier], { horsDuJour: [NUIT], debut: REPOS, fin: CHARGE });
    expect(fin.verdict).toBe('a-repasser');
    const justeSous = passe([fichier], {
      horsDuJour: [NUIT],
      debut: SEUIL_PRESSION - 0.1,
      fin: SEUIL_PRESSION - 0.1,
    });
    expect(justeSous.verdict).toBe('rouge');
  });

  it('critère 2: the pressure of a test noted by the setup wins over the reporter’s; a hook has the run’s', () => {
    const { fichier } = fichierAvec(BANC, 'borne', ['faux'], {
      pressionDebut: REPOS,
      pressionFin: CHARGE,
    });
    const r = passe([fichier], { debut: 5, fin: 6 });
    expect(r.echecs[0]).toMatchObject({ pressionDebut: REPOS, pressionFin: CHARGE });
    const h = passe([fichierAvecHook(NUIT, [MSG_HOOK])], {
      horsDuJour: [NUIT],
      debut: 7,
      fin: CHARGE,
    });
    expect(h.echecs[0]).toMatchObject({ pressionDebut: 7, pressionFin: CHARGE });
  });

  it('critère 2: a pressure that does not read leaves the verdict to Vitest and says so', () => {
    const { fichier } = fichierAvec(NUIT, 'lent', [MSG_DELAI]);
    const r = passe([fichier], { horsDuJour: [NUIT], debut: null, fin: null });
    expect(r.echecs[0]).toMatchObject({ pressionDebut: null, pressionFin: null });
    expect(r.verdict).toBe('vitest');
    expect(r.conclusion).toMatch(/pression CPU illisible/);
  });

  it('critère 2: one pressure read among unreadable ones is enough to judge', () => {
    const { fichier } = fichierAvec(NUIT, 'lent', [MSG_DELAI]);
    const r = passe([fichier], { horsDuJour: [NUIT], debut: null, fin: CHARGE });
    expect(r.verdict).toBe('a-repasser');
  });

  it('critère 2: an exit code of Vitest other than 1 leaves the verdict to Vitest', () => {
    const { fichier } = fichierAvec(NUIT, 'lent', [MSG_DELAI]);
    for (const code of [0, 2, A_REPASSER]) {
      const r = passe([fichier], { horsDuJour: [NUIT], code });
      expect(r.verdict, `code ${code}`).toBe('vitest');
      expect(r.conclusion).toMatch(/ne dépend pas d’une durée/);
    }
  });

  it('critère 2: errors outside the tests leave the verdict to Vitest', () => {
    const { fichier } = fichierAvec(NUIT, 'lent', [MSG_DELAI]);
    const r = passe([fichier], { horsDuJour: [NUIT], errors: [new Error('Unhandled')] });
    expect(r.verdict).toBe('vitest');
    expect(r.conclusion).toMatch(/ne dépend pas d’une durée/);
  });

  it('critère 2: no failure is no line of conclusion: the verdict of Vitest', () => {
    const fichier: Tache = {
      type: 'suite',
      name: JOUR,
      filepath: JOUR,
      tasks: [
        { type: 'test', name: 'juste', result: { state: 'pass', errors: [] }, meta: {} },
        { type: 'test', name: 'saute', result: { state: 'skip' }, meta: {} },
      ],
    };
    const r = passe([fichier], { code: 0 });
    expect(r.echecs).toEqual([]);
    expect(r.verdict).toBe('vitest');
    expect(r.conclusion).toBeNull();
  });

  it('critère 2: a failure in a nested suite takes its full name', () => {
    const fichier: Tache = { type: 'suite', name: NUIT, filepath: NUIT, tasks: [] };
    const suite: Tache = { type: 'suite', name: 's', suite: fichier, tasks: [] };
    suite.tasks?.push({
      type: 'test',
      name: 'dedans',
      suite,
      meta: {},
      result: { state: 'fail', errors: [{ message: MSG_DELAI }] },
    });
    fichier.tasks?.push(suite);
    const r = passe([fichier], { horsDuJour: [NUIT] });
    expect(r.echecs[0]).toMatchObject({ fichier: NUIT, nom: 's › dedans' });
  });

  it('critère 2: a test with several errors is a delay only when every one is a delay', () => {
    const tous = fichierAvec(NUIT, 'lent', [MSG_DELAI, MSG_HOOK]).fichier;
    expect(passe([tous], { horsDuJour: [NUIT] }).echecs[0].cause).toBe('délai dépassé');
    const mixte = fichierAvec(NUIT, 'lent', [MSG_DELAI, 'expected 1 to be 2']).fichier;
    expect(passe([mixte], { horsDuJour: [NUIT] }).echecs[0].cause).toBe('réel');
  });

  it('critère 1: the function reads nothing but its argument and does not touch the exit code', () => {
    const { fichier } = fichierAvec(NUIT, 'lent', [MSG_DELAI]);
    const avant = process.exitCode;
    const a = passe([fichier], { horsDuJour: [NUIT] });
    const b = passe([fichier], { horsDuJour: [NUIT] });
    expect(process.exitCode).toBe(avant);
    expect(b).toEqual(a);
  });
});
