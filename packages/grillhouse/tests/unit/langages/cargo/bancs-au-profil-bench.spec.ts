// The module cargo builds and plays the time budget benches under cargo's profile `bench`, in a
// build of their own, and waits for the rest of the machine before each: a bound of time is
// measured on the optimized code (docs/architecture/tests.md §3.3). Medium tests: the module run
// as a local process, against the fake cargo (./faux-cargo.ts).
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { avecFauxCargo, installerFauxCargo, profilDuBancEnTete } from './faux-cargo.js';

const cargo = module as unknown as Langage;
type Depots = Record<'espace' | 'seul', string>;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'bancs-au-profil-bench-'));
const JOURNAL = path.join(ESSAIS, 'journal');
const MAISON = path.join(ESSAIS, 'maison');
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());
beforeEach(() => writeFileSync(JOURNAL, ''));

const BANC = 'tests/recherche_budget.rs';
const REPOS = 0;
const CHARGE = 60;
const AU_BANC = /--(cargo-)?profile[ =]bench(?= |$)/;
const ATTENTE = /attente du repos/g;

function ecrire(racine: string, fichiers: Record<string, string>) {
  for (const [f, texte] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
    writeFileSync(path.join(racine, f), texte);
  }
}

// A crate at the root (src/lib.rs, src/main.rs, tests/bout.rs) with a unit test of `src/`, a
// night test, and its benches: the target `recherche_budget`, and `it_budget` on demand.
function seul({ itBudget = false, banc = true } = {}) {
  const e = exemples.preparer(mkdtempSync(path.join(ESSAIS, 'seul-'))) as { depots: Depots };
  const racine = e.depots.seul;
  ecrire(racine, {
    'src/server/tests.rs': '#[test]\nfn relais() {}\n',
    'tests/lourd_nuit.rs': '#[test]\nfn long() {}\n',
    ...(banc ? { [BANC]: '#[test]\nfn vite() {}\n' } : {}),
    ...(itBudget
      ? {
          'tests/it_budget/main.rs': 'mod temps;\n',
          'tests/it_budget/temps.rs': '#[test]\nfn vite() {}\n',
        }
      : {}),
  });
  return racine;
}

// A workspace whose crates `app` and `core` hold a bench each; `core` a night test on demand.
function espace({ nuitDeCore = false } = {}) {
  const e = exemples.preparer(mkdtempSync(path.join(ESSAIS, 'espace-'))) as { depots: Depots };
  const racine = e.depots.espace;
  ecrire(racine, {
    'crates/app/tests/recherche_budget.rs': '#[test]\nfn vite() {}\n',
    'crates/core/tests/recherche_budget.rs': '#[test]\nfn vite() {}\n',
    ...(nuitDeCore ? { 'crates/core/tests/lourd_nuit.rs': '#[test]\nfn long() {}\n' } : {}),
  });
  return racine;
}

// A file of CPU pressure, as /proc/pressure/cpu, at <valeur> %, and its writer.
function pression(valeur: number) {
  const fichier = path.join(mkdtempSync(path.join(ESSAIS, 'pression-')), 'cpu');
  const poser = (v: number) =>
    writeFileSync(fichier, `some avg10=${v.toFixed(2)} avg60=0.00 avg300=0.00 total=0\n`);
  poser(valeur);
  return { fichier, poser };
}

interface Options {
  codes?: object;
  env?: NodeJS.ProcessEnv;
}

// The command <nom> of the module in <racine>: its process, described, on a machine at rest unless
// <env> says otherwise.
function preparer(racine: string, nom: string, args: string[], { codes = {}, env = {} }: Options) {
  writeFileSync(JOURNAL, '');
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const vus = path.join(resultats, '..', `${path.basename(resultats)}.vus`);
  const c = cargo.commandes(racine)[nom];
  const environnement: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: MAISON,
    XDG_CACHE_HOME: '',
    GRILLHOUSE_TESTS: '',
    GRILLHOUSE_TRAVAILLEURS: '',
    GRILLHOUSE_RESULTATS: resultats,
    GRILLHOUSE_PRESSION_CPU: pression(REPOS).fichier,
    GRILLHOUSE_ATTENTE_REPOS_MS: '1',
    FAUX_CARGO_CODES: JSON.stringify(codes),
    FAUX_CARGO_VUS: vus,
    ...env,
  };
  // The listing of the commands above writes its `metadata` line in this process.
  writeFileSync(JOURNAL, '');
  const lire = () => ({
    appels: readFileSync(JOURNAL, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('metadata '))
      .map(l =>
        profilDuBancEnTete(l)
          .replace(/--tool-config-file grillhouse:\S+ --profile grillhouse /, '')
          .replace(' --message-format=json-render-diagnostics', '')
      ),
    verdict: cargo.verdict(resultats),
    vus: existsSync(vus)
      ? readFileSync(vus, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(l => JSON.parse(l) as { crate: string; deps: string; release: string[] })
      : [],
  });
  return { programme: [c.script, ...c.args, ...args], environnement, lire };
}

function lancer(racine: string, nom: string, args: string[] = [], options: Options = {}) {
  const p = preparer(racine, nom, args, options);
  const r = spawnSync(process.execPath, p.programme, {
    cwd: racine,
    encoding: 'utf8',
    env: p.environnement,
    timeout: 30_000,
  });
  if (r.signal) {
    throw new Error(`${nom} est tuée par ${r.signal} :\n${r.stderr}`);
  }
  return { code: r.status, sortie: r.stdout + r.stderr, ...p.lire() };
}

// The same, the output read as it comes: <aLAttente> runs at the first line that says the module
// waits for rest.
async function lancerEtEcouter(
  racine: string,
  options: Options,
  aLAttente: (sortie: string) => void
) {
  const p = preparer(racine, 'tests-de-nuit', [], options);
  const enfant = spawn(process.execPath, p.programme, { cwd: racine, env: p.environnement });
  let sortie = '';
  let vue = false;
  const lire = (morceau: Buffer) => {
    sortie += morceau.toString('utf8');
    if (!vue && /attente du repos[^\n]*\n/.test(sortie)) {
      vue = true;
      aLAttente(sortie);
    }
  };
  enfant.stdout.on('data', lire);
  enfant.stderr.on('data', lire);
  const garde = setTimeout(() => enfant.kill('SIGKILL'), 30_000);
  const code = await new Promise<number | null>(fin => enfant.on('close', c => fin(c)));
  clearTimeout(garde);
  return { code, sortie, ...p.lire() };
}

type Run = ReturnType<typeof lancer>;
const constructions = (r: Run) => r.appels.filter(a => a.startsWith('test --no-run'));
const nextests = (r: Run) => r.appels.filter(a => a.startsWith('nextest run'));
const auBanc = (appels: string[]) => appels.filter(a => AU_BANC.test(a));
const horsDuBanc = (appels: string[]) => appels.filter(a => !AU_BANC.test(a));
const cibles = (appel: string) => [...appel.matchAll(/--test (\S+)/g)].map(m => m[1]).sort();
const taches = (r: Run, script: string) => r.verdict.taches.filter(t => t.script === script);

describe('the time budget benches are built and played under the profile bench', () => {
  it('a night builds the benches with cargo test under the profile bench, then nextest with the cargo profile bench', () => {
    const r = lancer(seul({ itBudget: true }), 'tests-de-nuit');
    expect(r.code, r.sortie).toBe(0);
    const [construction, ...autres] = auBanc(constructions(r));
    expect(autres).toEqual([]);
    expect(construction).toMatch(/^test --no-run --profile bench -p seul /);
    expect(cibles(construction)).toEqual(['it_budget', 'recherche_budget']);
    const [banc] = auBanc(nextests(r));
    expect(banc).toMatch(/^nextest run --cargo-profile bench /);
    expect(banc).toContain('--test-threads 1');
    expect(cibles(banc)).toEqual(['it_budget', 'recherche_budget']);
    expect(r.appels.indexOf(construction)).toBeLessThan(r.appels.indexOf(banc));
  });

  it.each([
    ['the file of a bench target', BANC, 'recherche_budget'],
    ['a module of tests/it_budget/', 'tests/it_budget/temps.rs', 'it_budget'],
    ['the main.rs of tests/it_budget/', 'tests/it_budget/main.rs', 'it_budget'],
  ])(
    'a run that names %s builds and plays it under the profile bench alone',
    (_, chemin, cible) => {
      const r = lancer(seul({ itBudget: true }), 'tests-du-paquet', [chemin]);
      expect(r.code, r.sortie).toBe(0);
      expect(constructions(r)).toEqual([`test --no-run --profile bench -p seul --test ${cible}`]);
      expect(nextests(r)).toHaveLength(1);
      expect(auBanc(nextests(r))).toHaveLength(1);
    }
  );

  it('a night builds the night tests and the benches apart, the night tests under the profile test', () => {
    const r = lancer(seul(), 'tests-de-nuit');
    expect(horsDuBanc(constructions(r))).toEqual(['test --no-run -p seul --test lourd_nuit']);
    expect(auBanc(constructions(r))).toEqual([
      'test --no-run --profile bench -p seul --test recherche_budget',
    ]);
    expect(horsDuBanc(nextests(r)).map(cibles)).toEqual([['lourd_nuit']]);
    expect(auBanc(nextests(r)).map(cibles)).toEqual([['recherche_budget']]);
  });

  it.each([
    ['a day target', 'tests/bout.rs', 'test --no-run -p seul --test bout'],
    ['a unit test of src/', 'src/server/tests.rs', 'test --no-run -p seul'],
  ])('a bench named beside %s is built apart, the other build unchanged', (_, chemin, jour) => {
    for (const chemins of [
      [chemin, BANC],
      [BANC, chemin],
    ]) {
      const r = lancer(seul(), 'tests-du-paquet', chemins);
      expect(r.code, r.sortie).toBe(0);
      expect(horsDuBanc(constructions(r))).toEqual([jour]);
      expect(auBanc(constructions(r))).toEqual([
        'test --no-run --profile bench -p seul --test recherche_budget',
      ]);
      expect(auBanc(nextests(r)).map(cibles)).toEqual([['recherche_budget']]);
      expect(horsDuBanc(nextests(r))).toHaveLength(1);
      expect(horsDuBanc(nextests(r))[0]).not.toContain('recherche_budget');
    }
  });

  it('the first tranche of a pass builds and plays the benches under the profile bench', () => {
    const r = lancer(seul(), 'tests-du-paquet', ['.'], {
      env: { GRILLHOUSE_TESTS: JSON.stringify({ arguments: [BANC], tranche: '1/3' }) },
    });
    expect(r.code, r.sortie).toBe(0);
    expect(auBanc(constructions(r))).toHaveLength(1);
    expect(auBanc(nextests(r))).toHaveLength(1);
  });
});

describe('a run that plays no bench runs nothing under the profile bench and waits for no rest', () => {
  const sansBanc = (r: Run) => {
    expect(r.code, r.sortie).toBe(0);
    expect(auBanc(r.appels)).toEqual([]);
    expect(taches(r, 'budget')).toEqual([]);
    expect(r.sortie).not.toMatch(ATTENTE);
  };
  const charge = () => ({ GRILLHOUSE_PRESSION_CPU: pression(CHARGE).fichier });

  it.each([
    ['the whole crate of the day', '.'],
    ['a folder', 'tests'],
    ['a day target', 'tests/bout.rs'],
  ])('%s', (_, chemin) => {
    const r = lancer(seul(), 'tests-du-paquet', [chemin], { env: charge() });
    sansBanc(r);
  });

  it('the build of a whole crate of the day keeps its command, its benches compiled with it', () => {
    const r = lancer(seul(), 'tests-du-paquet', ['.']);
    expect(constructions(r)).toEqual(['test --no-run -p seul']);
  });

  it('a night of night tests alone', () => {
    const r = lancer(seul({ banc: false }), 'tests-de-nuit', [], { env: charge() });
    sansBanc(r);
    expect(r.appels).toHaveLength(2);
  });

  it('a night out of the poste', () => {
    sansBanc(lancer(seul(), 'tests-de-nuit', ['--hors-du-poste'], { env: charge() }));
  });

  it('a tranche other than the first, even one that names a bench', () => {
    const r = lancer(seul(), 'tests-du-paquet', ['.'], {
      env: {
        ...charge(),
        GRILLHOUSE_TESTS: JSON.stringify({
          arguments: ['tests/bout.rs', BANC],
          tranche: '2/3',
        }),
      },
    });
    sansBanc(r);
  });
});

describe('a build that fails', () => {
  const journal = (racine: string, r: Run, code: number) => {
    const t = taches(r, 'build').find(x => x.code === code);
    expect(t?.journal, JSON.stringify(r.verdict.taches)).toBeTruthy();
    return path.resolve(racine, t?.journal ?? '');
  };

  it('of the benches is a red task build of the crate with its own log, and the bench is not played', () => {
    const racine = seul();
    const r = lancer(racine, 'tests-de-nuit', [], {
      codes: { 'build-bench seul': 101 },
      env: { GRILLHOUSE_PRESSION_CPU: pression(CHARGE).fichier },
    });
    expect(r.code, r.sortie).toBe(1);
    expect(taches(r, 'build').map(t => [t.paquet, t.code])).toEqual(
      expect.arrayContaining([
        ['seul', 0],
        ['seul', 101],
      ])
    );
    expect(taches(r, 'build')).toHaveLength(2);
    const duTest = journal(racine, r, 0);
    const duBanc = journal(racine, r, 101);
    expect(duBanc).not.toBe(duTest);
    expect(readFileSync(duBanc, 'utf8')).toContain('build failed under the profile bench');
    expect(readFileSync(duTest, 'utf8')).toContain('`test` profile');
    expect(auBanc(nextests(r))).toEqual([]);
    expect(taches(r, 'budget').filter(t => t.code !== null)).toEqual([]);
    expect(horsDuBanc(nextests(r)).map(cibles)).toEqual([['lourd_nuit']]);
  });

  it.each([
    ['a night', 'tests-de-nuit', []],
    ['a targeted run', 'tests-du-paquet', ['tests/bout.rs', BANC]],
  ])(
    'under the profile test in %s leaves the build of the benches and the benches not played',
    (_, nom, args) => {
      const r = lancer(seul(), nom, args, { codes: { 'build seul': 101 } });
      expect(r.code, r.sortie).toBe(1);
      expect(r.appels).toHaveLength(1);
      expect(auBanc(r.appels)).toEqual([]);
      expect(r.verdict.taches.filter(t => t.code !== null).map(t => t.code)).toEqual([101]);
    }
  );

  it.each([
    ['test', 'build ws-core'],
    ['bench', 'build-bench ws-core'],
  ])(
    'under the profile %s in one crate leaves the benches of another built and played',
    (_, cle) => {
      // Only a crate with a target beside its bench has a build under the profile test.
      const racine = espace({ nuitDeCore: cle === 'build ws-core' });
      const r = lancer(racine, 'tests-de-nuit', [], { codes: { [cle]: 101 } });
      expect(r.code, r.sortie).toBe(1);
      expect(taches(r, 'build').filter(t => t.code === 101)).toHaveLength(1);
      expect(auBanc(nextests(r))).toHaveLength(1);
      expect(auBanc(nextests(r))[0]).toContain('-p ws-app');
    }
  );
});

describe('the builds of the benches in a pass', () => {
  it('all come before the first bench played', () => {
    const r = lancer(espace(), 'tests-de-nuit');
    expect(r.code, r.sortie).toBe(0);
    const construites = auBanc(constructions(r));
    expect(construites).toHaveLength(2);
    const premier = r.appels.indexOf(auBanc(nextests(r))[0]);
    for (const c of construites) {
      expect(r.appels.indexOf(c)).toBeLessThan(premier);
    }
  });

  it('take the workers of the pass, the bench playing on one thread', () => {
    const r = lancer(seul(), 'tests-de-nuit', [], { env: { GRILLHOUSE_TRAVAILLEURS: '3' } });
    expect(auBanc(constructions(r))).toHaveLength(1);
    expect(auBanc(constructions(r))[0]).toContain(' -j 3 ');
    expect(auBanc(nextests(r))[0]).not.toContain(' -j ');
  });

  it.each([
    ['green', 0],
    ['red', 101],
  ])('leave no test executable once a %s bench played', (_, code) => {
    const r = lancer(seul(), 'tests-du-paquet', [BANC], {
      codes: { 'nextest seul::recherche_budget': code },
    });
    const banc = r.vus.at(-1);
    const executable = 'recherche_budget-0000000000000003';
    expect(banc?.release).toContain(executable);
    const optimises = path.resolve(banc?.deps ?? '', '..', '..', 'release', 'deps');
    expect(readdirSync(optimises)).not.toContain(executable);
  });
});

describe('before each bench, the module waits for the rest of the machine', () => {
  const rouge = { 'nextest seul::recherche_budget': 101 };

  it('a red bench stays red when the load falls during the wait', async () => {
    const p = pression(CHARGE);
    const r = await lancerEtEcouter(
      seul(),
      {
        codes: rouge,
        env: { GRILLHOUSE_PRESSION_CPU: p.fichier, GRILLHOUSE_ATTENTE_REPOS_MS: '25000' },
      },
      () => p.poser(REPOS)
    );
    expect(r.sortie).toMatch(ATTENTE);
    expect(r.code, r.sortie).toBe(1);
    expect(taches(r, 'budget').map(t => t.code)).toEqual([101]);
  }, 60_000);

  it('the wait lasts one minute at most when no bound is set', async () => {
    const p = pression(CHARGE);
    let annonce = '';
    const r = await lancerEtEcouter(
      seul(),
      {
        codes: rouge,
        env: { GRILLHOUSE_PRESSION_CPU: p.fichier, GRILLHOUSE_ATTENTE_REPOS_MS: undefined },
      },
      sortie => {
        annonce = sortie;
        p.poser(REPOS);
      }
    );
    expect(annonce, r.sortie).toMatch(/attente du repos, 1 min au plus/);
    expect(r.code, r.sortie).toBe(1);
  }, 60_000);

  it('at the bound each bench plays all the same, after its own wait, its red under load to play again (75)', () => {
    const r = lancer(espace(), 'tests-de-nuit', [], {
      codes: { 'nextest ws-app::recherche_budget': 101, 'nextest ws-core::recherche_budget': 101 },
      env: {
        GRILLHOUSE_PRESSION_CPU: pression(CHARGE).fichier,
        GRILLHOUSE_ATTENTE_REPOS_MS: '500',
      },
    });
    expect(r.code, r.sortie).toBe(75);
    expect(taches(r, 'budget').map(t => t.code)).toEqual([75, 75]);
    expect(r.sortie.match(ATTENTE)).toHaveLength(2);
  }, 60_000);

  it('a green bench under a load that lasts is played and green', () => {
    const r = lancer(seul(), 'tests-du-paquet', [BANC], {
      env: { GRILLHOUSE_PRESSION_CPU: pression(CHARGE).fichier },
    });
    expect(r.code, r.sortie).toBe(0);
    expect(taches(r, 'budget').map(t => t.code)).toEqual([0]);
  });

  it('a pressure that does not read lets the bench play, its red a red', () => {
    const r = lancer(seul(), 'tests-du-paquet', [BANC], {
      codes: rouge,
      env: {
        GRILLHOUSE_PRESSION_CPU: path.join(ESSAIS, 'pression-absente'),
        GRILLHOUSE_ATTENTE_REPOS_MS: '25000',
      },
    });
    expect(r.code, r.sortie).toBe(1);
    expect(taches(r, 'budget').map(t => t.code)).toEqual([101]);
  });
});
