// grillhouse-3e2.4 — le module cargo joue un test unitaire sous `src/` (`tests.rs`) et garde un banc
// (`tests/<nom>_budget.rs`) nommé, et refuse un test de nuit nommé, même quand un fichier sous `src/` du même
// crate le précède dans la liste. Témoin : SyntHub SH-ae6.5.14 (2026-11-02), où la preuve du rouge
// nommait `crates/service/src/server/tests.rs` puis `crates/service/tests/search_budget.rs` :
// `choisir` créait l'entrée du crate avec « tout le jour » au premier, n'ajoutait plus aucune
// cible, et le banc n'était jamais joué.
// Tests moyens : le module lancé comme processus local, contre le faux cargo (./faux-cargo.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;
type Depots = Record<'espace' | 'seul', string>;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'src-et-bancs-'));
const JOURNAL = path.join(ESSAIS, 'journal');
const MAISON = path.join(ESSAIS, 'maison');
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());
beforeEach(() => writeFileSync(JOURNAL, ''));

const TESTS_RS = 'src/server/tests.rs';
const BANC = 'tests/recherche_budget.rs';
const NUIT = 'tests/lourd_nuit.rs';

// Un crate à la racine (src/main.rs, src/lib.rs, tests/bout.rs), son test unitaire sous `src/`,
// et, selon <avec>, un banc et un test de nuit.
function crate(avec: { banc: boolean; nuit: boolean }) {
  const e = exemples.preparer(mkdtempSync(path.join(ESSAIS, 'crate-'))) as { depots: Depots };
  const racine = e.depots.seul;
  mkdirSync(path.join(racine, 'src/server'), { recursive: true });
  writeFileSync(path.join(racine, TESTS_RS), '#[test]\nfn relais() {}\n');
  if (avec.banc) {
    writeFileSync(path.join(racine, BANC), '#[test]\nfn vite() {}\n');
  }
  if (avec.nuit) {
    writeFileSync(path.join(racine, NUIT), '#[test]\nfn long() {}\n');
  }
  return racine;
}

// `tests-du-paquet <chemins>` dans <racine> (grillhouse-44b.5 : le corps de la tâche des tests, que
// `tester` lance par Turborepo) : les appels de cargo (hors metadata) et les rapports du verdict.
function tester(racine: string, chemins: string[], cas: object = {}) {
  writeFileSync(JOURNAL, '');
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const c = cargo.commandes(racine)['tests-du-paquet'];
  const r = spawnSync(process.execPath, [c.script, ...c.args, ...chemins], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: MAISON,
      XDG_CACHE_HOME: '',
      GRILLHOUSE_RESULTATS: resultats,
      FAUX_CARGO_CODES: '{}',
      FAUX_CARGO_CAS: JSON.stringify(cas),
    },
  });
  const appels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('metadata '));
  return { code: r.status, erreur: r.stderr, appels, verdict: cargo.verdict(resultats) };
}
const nextests = (appels: string[]) => appels.filter(a => a.startsWith('nextest run'));
const jour = (appels: string[]) => nextests(appels).filter(a => a.includes('--lib'));
const banc = (appels: string[]) =>
  nextests(appels).filter(a => a.includes('--test recherche_budget'));

describe('grillhouse-3e2.4, critère 1 — un test unitaire sous src/ se joue', () => {
  it('critère 1 : un tests.rs nommé seul, dans un crate qui porte un banc, joue la bibliothèque du jour sans le banc', () => {
    const r = tester(crate({ banc: true, nuit: false }), [TESTS_RS]);
    expect(r.code, r.erreur).toBe(0);
    expect(jour(r.appels)).toHaveLength(1);
    expect(banc(r.appels)).toEqual([]);
  });

  it('critère 1 : dans un crate sans banc, un tests.rs nommé seul joue aussi la bibliothèque', () => {
    const r = tester(crate({ banc: false, nuit: false }), [TESTS_RS]);
    expect(r.code, r.erreur).toBe(0);
    expect(nextests(r.appels)).toHaveLength(1);
  });
});

describe('grillhouse-3e2.4, critère 5 — un banc nommé reste joué derrière un fichier sous src/', () => {
  it('critère 5 : tests.rs puis le banc — le banc se joue seul, sur un fil, et le jour aussi', () => {
    const r = tester(crate({ banc: true, nuit: false }), [TESTS_RS, BANC]);
    expect(r.code, r.erreur).toBe(0);
    expect(banc(r.appels)).toHaveLength(1);
    expect(banc(r.appels)[0]).toContain('--test-threads 1');
    expect(jour(r.appels)).toHaveLength(1);
    expect(jour(r.appels)[0]).not.toContain('recherche_budget');
  });

  it('critère 5 : le banc puis tests.rs — le même choix, quel que soit l’ordre de la liste', () => {
    const r = tester(crate({ banc: true, nuit: false }), [BANC, TESTS_RS]);
    expect(r.code, r.erreur).toBe(0);
    expect(banc(r.appels)).toHaveLength(1);
    expect(banc(r.appels)[0]).toContain('--test-threads 1');
    expect(jour(r.appels)).toHaveLength(1);
  });

  it('un test de nuit nommé, même derrière tests.rs, est refusé par son nom et rien ne se joue', () => {
    const r = tester(crate({ banc: false, nuit: true }), [TESTS_RS, NUIT]);
    expect(r.code, r.erreur).toBe(2);
    expect(r.erreur).toContain('un test de nuit se joue la nuit seulement');
    expect(nextests(r.appels)).toHaveLength(0);
  });
});

describe('grillhouse-3e2.4, critère 7 — le rapport d’un test sous src/ est sous son propre fichier', () => {
  const CAS = { seul: ['server::tests::relais', 'server::tests::autre'] };
  const duFichier = (v: ReturnType<typeof tester>['verdict']) =>
    v.rapports.find(x => x.fichier.endsWith(TESTS_RS));

  it('critère 7 : crate sans banc — les tests de server::tests sont rapportés sous src/server/tests.rs', () => {
    const racine = crate({ banc: false, nuit: false });
    const r = tester(racine, [TESTS_RS], CAS);
    const rapport = duFichier(r.verdict);
    expect(rapport?.tests.map(t => t.nom).sort()).toEqual([
      'server::tests::autre',
      'server::tests::relais',
    ]);
  });

  it('critère 7 : crate qui porte un banc — le même rapport, sous le même fichier', () => {
    const r = tester(crate({ banc: true, nuit: false }), [TESTS_RS], CAS);
    expect(
      duFichier(r.verdict)
        ?.tests.map(t => t.nom)
        .sort()
    ).toEqual(['server::tests::autre', 'server::tests::relais']);
  });

  it('critère 7 : crate qui porte un banc, tests.rs et le banc nommés — le rapport de tests.rs est gardé', () => {
    const r = tester(crate({ banc: true, nuit: false }), [TESTS_RS, BANC], CAS);
    expect(duFichier(r.verdict)?.tests).toHaveLength(2);
  });

  it('critère 7 : les noms de la version d’avant, lus dans HEAD sans les jouer, que le crate porte ou non un banc', () => {
    const texte = '#[test]\nfn ancien() {}\nmod groupe {\n    #[test]\n    fn interne() {}\n}\n';
    for (const avecBanc of [false, true]) {
      const racine = crate({ banc: avecBanc, nuit: false });
      const noms = cargo.testsDeHead(TESTS_RS, racine, () => texte);
      expect(noms?.slice().sort(), `banc : ${avecBanc}`).toEqual([
        'server::tests::ancien',
        'server::tests::groupe::interne',
      ]);
    }
  });
});
