// La preuve du rouge joue l'exécutable d'un module : un fichier `.rs` d'un dossier de `tests/` qui
// a sa cible `tests/<dossier>/main.rs` est un fichier de cet exécutable, et le changer le rejoue
// entier, comme Bazel rejoue la cible dont une source change. Le module cargo le dit au noyau
// (`jouePar` de `estUnTest`), et la preuve juge, dans cet exécutable, les tests des modules du lot
// et ceux que la fiche du testwriter nomme.
// Cas réel : OSD, OSD-sf1.25.40 : export/tests/it/ci_preparer.rs changé avec un test rouge nommé,
// la preuve n'a joué que tests/it/main.rs et n'a compté aucun rouge.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../../../scripts/activites.mjs';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import { ficheNommant, preuve, resultatDe, unTest } from '../../preuve-essai.js';
import type { Ctx, Resultat, Run } from '../../preuve-essai.js';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preuve-des-modules-'));
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal-cargo'));
});
afterAll(() => restaurer());
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const CRATE = 'crates/service';
const IT = `${CRATE}/tests/it`;
const MAIN = `${IT}/main.rs`;
const NUIT = `${CRATE}/tests/it_nuit`;
const BUDGET = `${CRATE}/tests/it_budget`;
const BOUT = `${CRATE}/tests/bout`;

// What main holds: a crate with an executable of tests for each moment, a second target of its
// own folder, a target of one file, a unit test, shared helpers and a folder of data without a
// target.
const MAIN_TIENT: Record<string, string> = {
  'package.json': '{ "name": "essai" }\n',
  'docs/ARCHITECTURE.md': architecture(['cargo']),
  'Cargo.toml': '[workspace]\nresolver = "2"\nmembers = ["crates/service"]\n',
  'Cargo.lock': 'version = 4\n',
  [`${CRATE}/Cargo.toml`]: '[package]\nname = "service"\nversion = "0.1.0"\n',
  [`${CRATE}/src/lib.rs`]: 'pub fn service() {}\n',
  [`${CRATE}/src/tests.rs`]: '// unit\n',
  [MAIN]: 'mod db_lock;\n',
  [`${IT}/db_lock.rs`]: '// main holds it\n',
  [`${NUIT}/main.rs`]: 'mod long;\n',
  [`${NUIT}/long.rs`]: '// night\n',
  [`${BUDGET}/main.rs`]: 'mod temps;\n',
  [`${BUDGET}/temps.rs`]: '// bench\n',
  [`${BOUT}/main.rs`]: 'mod pas;\n',
  [`${BOUT}/pas.rs`]: '// bout\n',
  [`${CRATE}/tests/seul.rs`]: '// one file\n',
  [`${CRATE}/tests/common/mod.rs`]: '// shared\n',
  [`${CRATE}/tests/fixtures/aide.rs`]: '// no target\n',
};

const ecrire = (racine: string, fichiers: Record<string, string>) => {
  for (const [f, texte] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
    writeFileSync(path.join(racine, f), texte);
  }
};

// A copy whose HEAD is MAIN_TIENT, the lot writing <lot> (a file of main changed, or a new one),
// the testwriter's sheet naming <portent>.
function copie(
  lot: string[],
  portent: { fichier: string; test?: string }[] = [],
  sorte?: { comportement: string }
): Ctx {
  const tmp = mkdtempSync(path.join(ESSAIS, 'ticket-'));
  const racine = realpathSync(mkdtempSync(path.join(ESSAIS, 'copie-')));
  const git = (...a: string[]) =>
    spawnSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  ecrire(racine, MAIN_TIENT);
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'départ');
  ecrire(racine, Object.fromEntries(lot.map(f => [f, `// le lot change ${f}\n`])));
  const fiches = path.join(tmp, 'fiches.jsonl');
  writeFileSync(fiches, `${JSON.stringify(ficheNommant(portent))}\n`);
  return {
    copie: racine,
    racine,
    ticket: 'demo-1',
    paquets: ['.'],
    tmp,
    journal: path.join(tmp, 'journal'),
    fiches,
    base: { dossier: tmp },
    ...(sorte ? { sorte } : {}),
  };
}

const classe = (c: Ctx, f: string) =>
  cargo.estUnTest(f, c.copie) as unknown as { test: boolean; jouePar?: string } | null;

describe('le module cargo dit quel exécutable joue un fichier de son dossier', () => {
  it.each([
    ['un module', `${IT}/db_lock.rs`, MAIN],
    ['un module neuf', `${IT}/neuf.rs`, MAIN],
    ['un module en mod.rs', `${IT}/scenes/mod.rs`, MAIN],
    ['un sous-module', `${IT}/scenes/ouverture.rs`, MAIN],
    ['une aide sans test, au fond d’un dossier', `${IT}/aides/disque/faux.rs`, MAIN],
    ['un module d’une autre cible', `${BOUT}/pas.rs`, `${BOUT}/main.rs`],
    ['un module de nuit', `${NUIT}/long.rs`, `${NUIT}/main.rs`],
    ['un module de banc', `${BUDGET}/temps.rs`, `${BUDGET}/main.rs`],
  ])('%s désigne le main.rs de sa cible, depuis la racine', (_sorte, fichier, main) => {
    const c = copie([fichier]);
    expect(classe(c, fichier)).toMatchObject({ test: true, jouePar: main });
  });

  it.each([
    ['une donnée d’un dossier de cible', `${IT}/donnees/a.json`],
    ['un fichier d’un dossier sans cible main.rs', `${CRATE}/tests/fixtures/aide.rs`],
    ['une cible d’un seul fichier', `${CRATE}/tests/seul.rs`],
    ['un test unitaire de src/', `${CRATE}/src/tests.rs`],
    ['une aide de tests/common/', `${CRATE}/tests/common/mod.rs`],
    ['un fichier de code', `${CRATE}/src/lib.rs`],
  ])('%s ne désigne aucun autre exécutable', (_sorte, fichier) => {
    const c = copie([]);
    expect(classe(c, fichier)?.jouePar).toBeUndefined();
  });
});

describe('les fichiers de test du lot que la preuve joue', () => {
  it.each([
    ['un seul module', [`${IT}/db_lock.rs`]],
    ['un sous-module', [`${IT}/scenes/ouverture.rs`]],
    ['une aide sans test', [`${IT}/aides/faux.rs`]],
    ['plusieurs modules', [`${IT}/db_lock.rs`, `${IT}/neuf.rs`, `${IT}/scenes/mod.rs`]],
    ['un module et le main.rs', [MAIN, `${IT}/neuf.rs`]],
  ])('%s fait jouer le main.rs de sa cible, une seule fois', (_sorte, lot) => {
    expect(activites.testsDuLot(copie(lot))).toEqual([MAIN]);
  });

  it('des modules de deux cibles font jouer les deux exécutables', () => {
    const c = copie([`${IT}/db_lock.rs`, `${BOUT}/pas.rs`]);
    expect(activites.testsDuLot(c)).toEqual([`${BOUT}/main.rs`, MAIN]);
  });

  it('une cible d’un seul fichier et un test unitaire se jouent eux-mêmes', () => {
    const lot = [`${CRATE}/src/tests.rs`, `${CRATE}/tests/seul.rs`];
    expect(activites.testsDuLot(copie(lot))).toEqual(lot);
  });

  it('une donnée et un dossier sans cible ne font jouer aucun exécutable de plus', () => {
    const c = copie([
      `${IT}/donnees/a.json`,
      `${CRATE}/tests/fixtures/aide.rs`,
      `${CRATE}/tests/seul.rs`,
    ]);
    expect(activites.testsDuLot(c)).toEqual([`${CRATE}/tests/seul.rs`]);
  });

  it('une aide de tests/common/ seule ne désigne aucune cible : les paquets joueront entiers', () => {
    expect(activites.testsDuLot(copie([`${CRATE}/tests/common/mod.rs`]))).toEqual([]);
  });

  it.each([
    ['de nuit', NUIT, 'long'],
    ['de banc', BUDGET, 'temps'],
  ])('un module %s ne fait rien jouer de jour, comme son main.rs', (_moment, dossier, nom) => {
    const c = copie([`${dossier}/${nom}.rs`]);
    const { jour, misDeCote } = activites.separerLesFichiersDuJour(c, activites.testsDuLot(c));
    expect(jour).toEqual([]);
    expect(misDeCote).toEqual([`${dossier}/main.rs`]);
  });

  it('un module de nuit à côté d’un module du jour : le jour joue son seul exécutable', () => {
    const c = copie([`${IT}/db_lock.rs`, `${NUIT}/long.rs`]);
    const { jour, misDeCote } = activites.separerLesFichiersDuJour(c, activites.testsDuLot(c));
    expect(jour).toEqual([MAIN]);
    expect(misDeCote).toEqual([`${NUIT}/main.rs`]);
  });
});

describe('la preuve reprise à un rouge qui nomme un module', () => {
  const reprise = (c: Ctx, nommes: string[]) =>
    (activites.testsDeLaReprise as (c: Ctx, nommes: string[]) => string[])(c, nommes);

  it('rejoue l’exécutable de ce module', () => {
    const c = copie([`${IT}/db_lock.rs`]);
    expect(reprise(c, [`${IT}/db_lock.rs`])).toEqual([MAIN]);
  });

  it('rejoue une seule fois l’exécutable de plusieurs fichiers nommés', () => {
    const c = copie([`${IT}/db_lock.rs`]);
    expect(reprise(c, [`${IT}/db_lock.rs`, MAIN, `${IT}/neuf.rs`])).toEqual([MAIN]);
  });
});

// The proof of the lot of <c> on one run of the executable of the day, which reports the modules
// <modules> (each its tests).
function prouver(
  c: Ctx,
  modules: Record<string, ReturnType<typeof unTest>[]>,
  { code, constructions = [] }: { code?: number; constructions?: Run['constructions'] } = {}
) {
  const { jour } = activites.separerLesFichiersDuJour(c, activites.testsDuLot(c));
  const resultats: Resultat[] = Object.entries(modules).map(([m, tests]) =>
    resultatDe(c, `${IT}/${m}.rs`, tests)
  );
  const rouge = resultats.some(r => r.etat === 'failed');
  return preuve(c, {
    mesure: {
      cle: activites.cleDeLaMesure(c, jour),
      runs: [
        {
          groupe: [MAIN],
          entier: false,
          code: code ?? (rouge ? 101 : 0),
          resultats,
          constructions,
        },
      ],
    },
  });
}

const vert = (nom: string) => unTest(nom);
const rougi = (nom: string) => unTest(nom, 'failed', 'panicked');
const DB = `${IT}/db_lock.rs`;
// A helper without a test, the one file the lot changes: every module with tests is main's.
const AIDE = `${IT}/aides/faux.rs`;

describe('les tests que la fiche nomme sont ceux du lot, quel que soit leur module', () => {
  it('un test nommé rouge d’un module que le lot ne change pas est un rouge du lot', () => {
    const c = copie([AIDE], [{ fichier: DB, test: 'db_lock::il_synchronise' }]);
    const r = prouver(c, { db_lock: [rougi('db_lock::il_synchronise')] });
    expect(r.texte).toContain(`- ${DB} › db_lock::il_synchronise`);
    expect(r.texte).not.toContain('rouge existant');
    expect(r.ok).toBe(true);
  });

  it('un test nommé vert d’un module que le lot ne change pas refuse la preuve', () => {
    const c = copie([`${IT}/neuf.rs`], [{ fichier: DB, test: 'db_lock::il_synchronise' }]);
    const r = prouver(c, {
      db_lock: [vert('db_lock::il_synchronise'), vert('db_lock::une_connexion_attend')],
      neuf: [rougi('neuf::un_cas')],
    });
    expect(r.ok).toBe(false);
    expect(r.texte).toContain(`- ${DB} › db_lock::il_synchronise`);
    expect(r.texte).not.toContain('db_lock::une_connexion_attend');
    expect(r.resume).toContain('1 vert(s) nommé(s)');
    expect(r.resume).toContain('0 vert(s) non nommé(s)');
  });

  it('un module nommé en entier juge chacun de ses tests comme ceux du lot', () => {
    const c = copie([AIDE], [{ fichier: DB }]);
    const r = prouver(c, { db_lock: [rougi('db_lock::il_synchronise'), vert('db_lock::il_lit')] });
    expect(r.texte).not.toContain('rouge existant');
    expect(r.resume).toContain('1 vert(s) nommé(s)');
    expect(r.ok).toBe(false);
  });

  it('à côté d’un test nommé, les autres tests du module restent ceux de main', () => {
    const c = copie([AIDE], [{ fichier: DB, test: 'db_lock::il_synchronise' }]);
    const r = prouver(c, {
      db_lock: [
        rougi('db_lock::il_synchronise'),
        rougi('db_lock::une_connexion_attend'),
        vert('db_lock::il_lit'),
      ],
    });
    expect(r.texte).toContain(`rouge existant : ${DB} › db_lock::une_connexion_attend`);
    expect(r.texte).not.toContain(`rouge existant : ${DB} › db_lock::il_synchronise`);
    expect(r.texte).not.toContain('db_lock::il_lit');
    expect(r.ok).toBe(true);
  });

  it('un exécutable qui ne se joue pas reste un fichier qui ne prouve rien', () => {
    const r = prouver(copie([AIDE]), {}, { code: 101 });
    expect(r.ok).toBe(false);
    expect(r.texte).toContain(`${MAIN} — ne se charge pas`);
  });
});

describe('des rouges existants seuls ne passent pas la preuve d’un lot qui a des tests joués', () => {
  const ANCIEN = { db_lock: [rougi('db_lock::une_connexion_attend')] };

  it('un rouge de main sans rouge du lot refuse la preuve, le rouge écrit au rapport', () => {
    const r = prouver(copie([AIDE]), ANCIEN);
    expect(r.texte).toContain(`rouge existant : ${DB} › db_lock::une_connexion_attend`);
    expect(r.ok).toBe(false);
  });

  it('un vert non nommé du lot à côté d’un rouge de main ne la fait pas passer', () => {
    const r = prouver(copie([`${IT}/neuf.rs`]), { ...ANCIEN, neuf: [vert('neuf::un_vert')] });
    expect(r.ok).toBe(false);
  });

  it('un rouge du lot à côté d’un rouge de main la fait passer', () => {
    const r = prouver(copie([`${IT}/neuf.rs`]), { ...ANCIEN, neuf: [rougi('neuf::un_cas')] });
    expect(r.ok).toBe(true);
  });

  it('une construction rouge à côté d’un rouge de main la fait passer', () => {
    const r = prouver(copie([AIDE]), ANCIEN, {
      constructions: [{ nom: 'service', erreur: 'error[E0425]' }],
    });
    expect(r.ok).toBe(true);
  });

  it('sous un plan « tests-adaptés », aucun rouge du lot n’est attendu', () => {
    const c = copie([AIDE], [], { comportement: 'tests-adaptés' });
    expect(prouver(c, ANCIEN).ok).toBe(true);
  });

  it('un lot sans fichier de test joué, dont le paquet joue entier, passe sur un rouge existant', () => {
    const c = copie([`${CRATE}/tests/common/mod.rs`]);
    const r = preuve(c, {
      mesure: {
        cle: activites.cleDeLaMesure(c, []),
        runs: [
          {
            groupe: [],
            entier: true,
            code: 101,
            resultats: [resultatDe(c, DB, ANCIEN.db_lock)],
            constructions: [],
          },
        ],
      },
    });
    expect(r.texte).toContain(`rouge existant : ${DB}`);
    expect(r.ok).toBe(true);
  });

  it('un lot de modules de nuit seuls passe, ses exécutables mis de côté', () => {
    const c = copie([`${NUIT}/long.rs`]);
    const r = preuve(c, { mesure: { cle: activites.cleDeLaMesure(c, []), runs: [] } });
    expect(r.texte).toContain(`- ${NUIT}/main.rs`);
    expect(r.ok).toBe(true);
  });
});
