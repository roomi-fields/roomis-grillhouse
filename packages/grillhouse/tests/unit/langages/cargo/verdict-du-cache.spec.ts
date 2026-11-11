// Le verdict du module cargo prend ses tâches du résumé de Turborepo (`<dossier>/turbo/`), reconnues
// à leur identifiant (`<paquet>#test:unit`) : un crate relu du cache y paraît, succès sans rapport,
// et une tâche que `tests-du-paquet` a écrite ne s'y ajoute que si le résumé n'a pas son identifiant.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verdict as verdictDeCargo } from '../../../../scripts/langages/cargo/verdict.mjs';

type Tache = { tache: string; [champ: string]: unknown };
type Verdict = {
  taches: Tache[];
  rapports: { tests: { titre: string }[] }[];
};
const verdict = verdictDeCargo as (dossier: string) => Verdict;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'cargo-verdict-cache-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (dossier: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true });
  writeFileSync(path.join(dossier, f), texte);
};
const tacheEcrite = (paquet: string, script = 'test:unit') => ({
  tache: `${paquet}#${script}`,
  paquet,
  dossier: `crates/${paquet}`,
  script,
  tests: script === 'test:unit',
  code: 0,
  cache: null,
  journal: null,
});
const tacheDuResume = (paquet: string, extra: Record<string, unknown>) => ({
  taskId: `${paquet}#test:unit`,
  task: 'test:unit',
  package: paquet,
  directory: `crates/${paquet}`,
  logFile: `crates/${paquet}/.turbo/turbo-test:unit.log`,
  ...extra,
});
const junit = (suite: string, test: string) =>
  `<?xml version="1.0"?><testsuites><testsuite name="${suite}" tests="1"><testcase name="${test}" classname="${suite}"/></testsuite></testsuites>`;

// Un crate joué (`joue`, ses tâches et son rapport écrits par tests-du-paquet) et un crate relu du
// cache (`relu`, seulement dans le résumé de Turborepo).
function dossierDeResultats(avecEcrites = true) {
  const d = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  ecrire(
    d,
    'cargo/run.json',
    JSON.stringify({ taches: avecEcrites ? [tacheEcrite('joue')] : [], cibles: {} })
  );
  ecrire(d, 'nextest/run-joue.xml', junit('joue', 'tests::marche'));
  ecrire(
    d,
    'turbo/resume.json',
    JSON.stringify({
      tasks: [
        tacheDuResume('joue', { execution: { exitCode: 0 }, cache: { status: 'MISS' } }),
        tacheDuResume('relu', { cache: { status: 'HIT', source: 'LOCAL' } }),
      ],
    })
  );
  return d;
}
const parId = (taches: { tache: string }[]) => Object.fromEntries(taches.map(t => [t.tache, t]));

describe('le verdict de cargo lit le résumé de Turborepo', () => {
  it('un crate relu du cache paraît : tâche de tests, statut HIT, succès sans rapport', () => {
    const v = verdict(dossierDeResultats());
    const relu = parId(v.taches)['relu#test:unit'];
    expect(relu).toMatchObject({
      paquet: 'relu',
      dossier: 'crates/relu',
      script: 'test:unit',
      tests: true,
      cache: 'HIT',
      code: 0,
    });
    expect(relu!.code).not.toBeNull();
  });

  it('un crate joué et un crate relu : deux tâches, et les rapports du seul crate joué', () => {
    const v = verdict(dossierDeResultats());
    expect(v.taches.map(t => t.tache).sort()).toEqual(['joue#test:unit', 'relu#test:unit']);
    expect(v.rapports.flatMap(r => r.tests.map(t => t.titre))).toEqual(['tests::marche']);
  });

  it('la tâche du résumé l’emporte sur celle qu’a écrite tests-du-paquet, sans doublon', () => {
    const v = verdict(dossierDeResultats());
    const joue = v.taches.filter(t => t.tache === 'joue#test:unit');
    expect(joue).toHaveLength(1);
    expect(joue[0]).toMatchObject({ cache: 'MISS', code: 0, tests: true });
  });

  it('une tâche écrite que le résumé n’a pas s’ajoute', () => {
    const d = dossierDeResultats();
    ecrire(
      d,
      'cargo/run2.json',
      JSON.stringify({ taches: [tacheEcrite('autre', 'deny')], cibles: {} })
    );
    expect(Object.keys(parId(verdict(d).taches)).sort()).toEqual([
      'autre#deny',
      'joue#test:unit',
      'relu#test:unit',
    ]);
  });

  it('sans résumé, les tâches sont celles de tests-du-paquet', () => {
    const d = mkdtempSync(path.join(ESSAIS, 'sans-resume-'));
    ecrire(d, 'cargo/run.json', JSON.stringify({ taches: [tacheEcrite('joue')], cibles: {} }));
    expect(verdict(d).taches).toEqual([tacheEcrite('joue')]);
  });
});
