// grillhouse-pkl.3, criteria 7 and 8 — the commands of the module cargo, each `{ script, args }`
// with a real script of the module, described without running anything; run against the fake
// cargo (./faux-cargo.ts), whose journal lists the calls: tester (the build of the test targets
// and nextest for each crate with tests, then its doctests), typer (cargo check --all-targets), verifier (the tests, then cargo
// deny check), preparer (cargo fetch --locked); the verdict of a run reads the JUnit report of
// nextest and the code of each task, and a red makes verifier's code 1. Verifier plays under the
// lock of the machine: a lock held makes it wait, and the bound of the wait reached it stops at 75
// without running cargo; it plays the crates the changes since the last green touch and their
// dependents.
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
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
import { sortiesDuLangage } from '../../../../scripts/enveloppe/enveloppe.mjs';
import { paquetsDuLangage } from '../../../../scripts/enveloppe/paquets-du-plan.mjs';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import {
  espaceDesProcessus,
  socketDuServeur,
} from '../../../../scripts/langages/cargo/sccache.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;

type Depots = Record<'espace' | 'seul', string>;
const MODULE = path.resolve(__dirname, '../../../../scripts/langages/cargo');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'commandes-cargo-'));
const JOURNAL = path.join(ESSAIS, 'journal');
let restaurer = () => {};
let d: Depots;
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
  d = (exemples.preparer(ESSAIS) as { depots: Depots }).depots;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());
beforeEach(() => writeFileSync(JOURNAL, ''));

// Runs the command <nom> of the module in <racine> with <args>, the codes <codes> of the fake
// cargo, a results directory of its own: `{ code, stderr, appels, verdict }`, `appels` the calls
// of cargo but metadata.
function lancer(
  racine: string,
  nom: string,
  args: string[] = [],
  codes: object = {},
  env: NodeJS.ProcessEnv = {}
) {
  writeFileSync(JOURNAL, '');
  const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const c = cargo.commandes(racine)[nom];
  const r = spawnSync(process.execPath, [c.script, ...c.args, ...args], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      GRILLHOUSE_RESULTATS: resultats,
      FAUX_CARGO_CODES: JSON.stringify(codes),
      ...env,
    },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, ...lu(resultats) };
}

// The calls of cargo of the journal but metadata, and the verdict of <resultats>.
function lu(resultats: string) {
  const appels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('metadata '))
    .map(l => l.replace(/--tool-config-file grillhouse:\S+ --profile grillhouse /, ''));
  return { appels, verdict: cargo.verdict(resultats) };
}

describe('grillhouse-pkl.3, critère 7 — les commandes du module cargo', () => {
  it('each command is its script of the module and its name, described, nothing run', () => {
    const c = cargo.commandes(d.espace);
    expect(Object.keys(c)).toEqual([
      'tester',
      'verifier',
      'typer',
      'preparer',
      'clippy',
      'frontieres',
      'index-interfaces',
    ]);
    for (const nom of ['tester', 'verifier', 'typer', 'preparer']) {
      expect(c[nom]).toEqual({ script: path.join(MODULE, 'commandes.mjs'), args: [nom] });
    }
    expect(existsSync(path.join(MODULE, 'commandes.mjs'))).toBe(true);
    expect(readFileSync(JOURNAL, 'utf8')).toBe('');
  });

  // grillhouse-pkl.7 (grillhouse-pkl.6.1): a red guard is named `grillhouse <its script's name>`
  // (scripts/gardes-du-cadre.mjs); each guard of the module is a command of that name, its script.
  it('each guard of the module is a command by its script’s name, so the line of a red guard names a command that exists', () => {
    const c = cargo.commandes(d.espace);
    const gardes = cargo.gardes(d.espace);
    expect(gardes.length).toBe(3);
    for (const [script] of gardes) {
      const nom = path.basename(script).replace(/\.[cm]?js$/, '');
      expect(c[nom], nom).toEqual({ script, args: [] });
      expect(existsSync(script), script).toBe(true);
    }
  });

  it('tester plays nextest for each crate with tests, then the doctests of each library', () => {
    const r = lancer(d.espace, 'tester');
    expect(r.code).toBe(0);
    expect(r.appels).toEqual([
      'test --no-run -p ws-app',
      'nextest run --no-fail-fast -p ws-app',
      'test --doc -p ws-app',
      'test --no-run -p ws-core',
      'nextest run --no-fail-fast -p ws-core',
      'test --doc -p ws-core',
      'test --doc -p ws-matiere',
      'test --doc -p ws-outil',
    ]);
  });

  it('tester with paths: the crate of each, a test target alone; a path out of every crate refused', () => {
    expect(lancer(d.espace, 'tester', ['crates/core/tests/t.rs']).appels).toEqual([
      'test --no-run -p ws-core --test t',
      'nextest run --no-fail-fast -p ws-core --test t',
    ]);
    expect(lancer(d.espace, 'tester', ['crates/app']).appels).toEqual([
      'test --no-run -p ws-app',
      'nextest run --no-fail-fast -p ws-app',
      'test --doc -p ws-app',
    ]);
    const refus = lancer(d.espace, 'tester', ['README.md', 'crates/outil/src/lib.rs']);
    expect(refus.code).toBe(2);
    expect(refus.stderr).toMatch(/README\.md : hors de tout crate/);
    expect(refus.stderr).toMatch(
      /ws-outil n'a aucun test, ni dossier tests\/, ni tests\.rs sous src\//
    );
    expect(refus.appels).toEqual([]);
  });

  it('typer, preparer: cargo check --all-targets, cargo fetch --locked', () => {
    expect(lancer(d.seul, 'typer').appels).toEqual(['check --all-targets']);
    expect(lancer(d.seul, 'preparer').appels).toEqual(['fetch --locked']);
  });

  it('verifier plays the tests, then cargo deny check', () => {
    const r = lancer(d.seul, 'verifier', ['--tout']);
    expect(r.code).toBe(0);
    expect(r.appels).toEqual([
      'test --no-run -p seul',
      'nextest run --no-fail-fast -p seul',
      'test --doc -p seul',
      'deny check',
    ]);
  });
});

describe('grillhouse-pkl.3, critère 8 — le verdict d’un lancement', () => {
  it('green: each task 0, each test of the JUnit report in its file', () => {
    const v = lancer(d.seul, 'verifier', ['--tout']).verdict;
    expect(v.taches.map(t => [t.tache, t.code, t.tests])).toEqual([
      ['seul#build', 0, false],
      ['seul#nextest', 0, true],
      ['seul#doctest', 0, true],
      ['//#deny', 0, false],
    ]);
    expect(v.rapports.map(r => [path.relative(d.seul, r.fichier), r.etat])).toEqual([
      ['src/lib.rs', 'passed'],
      ['tests/bout.rs', 'passed'],
    ]);
  });

  it('a fake cargo deny at 4 makes verifier 1, its task red', () => {
    const r = lancer(d.seul, 'verifier', ['--tout'], { deny: 4 });
    expect(r.code).toBe(1);
    expect(r.verdict.taches.find(t => t.script === 'deny')?.code).toBe(4);
  });

  it('a red of nextest: its task red, each test failed with its message', () => {
    const r = lancer(d.seul, 'tester', [], { 'nextest seul': 100 });
    expect(r.code).toBe(1);
    expect(r.verdict.taches[1]).toMatchObject({ tache: 'seul#nextest', code: 100, tests: true });
    expect(r.verdict.rapports.flatMap(x => x.tests)).toEqual([
      { titre: 'essai', nom: 'essai', etat: 'failed', message: 'rouge & faux' },
      { titre: 'essai', nom: 'essai', etat: 'failed', message: 'rouge & faux' },
    ]);
  });

  it('the defective trial: 75 « à repasser », a task not played null, a test failed', () => {
    const e = exemples.preparer(mkdtempSync(path.join(ESSAIS, 'defaut-'))) as {
      verdict: { invalide: string };
    };
    const v = cargo.verdict(e.verdict.invalide);
    expect(v.taches.map(t => [t.tache, t.code])).toEqual([
      ['ws-core#nextest', 75],
      ['ws-app#nextest', 100],
      ['ws-outil#nextest', null],
      ['//#deny', 4],
    ]);
    const echoue = v.rapports.find(r => r.etat === 'failed');
    expect(path.basename(echoue?.fichier ?? '')).toBe('integ.rs');
    expect(echoue?.tests).toEqual([
      { titre: 'lit', nom: 'lit', etat: 'failed', message: "assertion 'a < b'" },
    ]);
  });
});

// grillhouse-akd: the reviewer plays `npm run verifier -- --gardes`, the guards alone, the same
// verdict in each module: as the module typescript plays the tasks `grillhouse:gardes` and
// `gardes`, the module cargo plays the project's scripts of those names, without its tests nor
// cargo deny.
describe('grillhouse-akd — verifier --gardes, les gardes seules', () => {
  const TRACE = () => path.join(ESSAIS, 'trace-des-gardes');
  // A copy of the crate at the root whose package.json runs <scripts>, each a line of the shell.
  function avecGardes(scripts: Record<string, string>) {
    const racine = mkdtempSync(path.join(ESSAIS, 'gardes-'));
    cpSync(d.seul, racine, { recursive: true });
    writeFileSync(path.join(racine, 'package.json'), JSON.stringify({ name: 'seul', scripts }));
    writeFileSync(TRACE(), '');
    return racine;
  }
  const trace = (n: string) =>
    `node -e "require('node:fs').appendFileSync(process.env.TRACE, '${n}\\n')"`;
  const traces = () => readFileSync(TRACE(), 'utf8').split('\n').filter(Boolean);

  it('plays the guards of the frame, then the project’s, no test and no cargo deny', () => {
    const racine = avecGardes({ 'grillhouse:gardes': trace('cadre'), gardes: trace('projet') });
    const r = lancer(racine, 'verifier', ['--gardes'], {}, { TRACE: TRACE() });
    expect(r.code).toBe(0);
    expect(r.appels).toEqual([]);
    expect(traces()).toEqual(['cadre', 'projet']);
    expect(r.verdict.taches.map(t => [t.tache, t.code])).toEqual([
      ['//#grillhouse:gardes', 0],
      ['//#gardes', 0],
    ]);
  });

  it('a red guard makes it red, its task named; the other guard plays all the same', () => {
    const racine = avecGardes({ 'grillhouse:gardes': 'exit 3', gardes: trace('projet') });
    const r = lancer(racine, 'verifier', ['--gardes'], {}, { TRACE: TRACE() });
    expect(r.code).toBe(1);
    expect(traces()).toEqual(['projet']);
    expect(r.verdict.taches.find(t => t.script === 'grillhouse:gardes')?.code).not.toBe(0);
  });

  it('a project without its script gardes plays the frame’s guards alone', () => {
    const racine = avecGardes({ 'grillhouse:gardes': trace('cadre') });
    const r = lancer(racine, 'verifier', ['--gardes'], {}, { TRACE: TRACE() });
    expect(r.code).toBe(0);
    expect(traces()).toEqual(['cadre']);
    expect(r.verdict.taches.map(t => t.tache)).toEqual(['//#grillhouse:gardes']);
  });
});

describe('grillhouse-pkl.3 — verifier sous le verrou de la machine', () => {
  // A lock of the machine held by a live process of its own, as another measure holds it.
  function tenu() {
    const verrou = path.join(mkdtempSync(path.join(ESSAIS, 'verrou-')), 'mesure.lock');
    const dormeur = spawn('sleep', ['60'], { stdio: 'ignore' });
    writeFileSync(verrou, `${dormeur.pid}:tenu`);
    return { verrou, dormeur };
  }

  it('the bound of the wait reached: 75, the holder named, cargo never run', () => {
    const { verrou, dormeur } = tenu();
    try {
      const r = lancer(
        d.seul,
        'verifier',
        ['--tout'],
        {},
        {
          GRILLHOUSE_VERROU_MACHINE: verrou,
          GRILLHOUSE_ATTENTE_MACHINE_MS: '1000',
        }
      );
      expect(r.code, r.stdout + r.stderr).toBe(75);
      expect(r.stdout).toContain(String(dormeur.pid));
      expect(readFileSync(JOURNAL, 'utf8')).toBe('');
    } finally {
      dormeur.kill();
    }
  });

  it('a lock held makes verifier wait, then it plays once the lock is let go', async () => {
    const { verrou, dormeur } = tenu();
    writeFileSync(JOURNAL, '');
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    const c = cargo.commandes(d.seul).verifier;
    const enfant = spawn(process.execPath, [c.script, ...c.args, '--tout'], {
      cwd: d.seul,
      env: { ...process.env, GRILLHOUSE_RESULTATS: resultats, GRILLHOUSE_VERROU_MACHINE: verrou },
    });
    let sortie = '';
    enfant.stdout.on('data', (b: Buffer) => (sortie += String(b)));
    const fin = new Promise<number | null>(ok => enfant.on('close', ok));
    await new Promise(ok => setTimeout(ok, 1500));
    expect(readFileSync(JOURNAL, 'utf8')).toBe('');
    dormeur.kill();
    expect(await fin, sortie).toBe(0);
    expect(sortie).toMatch(/verrou de la machine pris après/);
    expect(lu(resultats).appels).toEqual([
      'test --no-run -p seul',
      'nextest run --no-fail-fast -p seul',
      'test --doc -p seul',
      'deny check',
    ]);
  }, 30_000);
});

describe('grillhouse-pkl.3 — verifier depuis le dernier vert', () => {
  it('a change of ws-app plays ws-app and its dependents; a README alone plays no crate', () => {
    const { espace } = (
      exemples.preparer(mkdtempSync(path.join(ESSAIS, 'vert-'))) as { depots: Depots }
    ).depots;
    // No last green yet: every crate, and the green is kept.
    expect(lancer(espace, 'verifier').code).toBe(0);
    writeFileSync(path.join(espace, 'crates/app/src/lib.rs'), 'pub fn app() -> i32 {\n    2\n}\n');
    const r = lancer(espace, 'verifier');
    expect(r.code).toBe(0);
    expect(r.appels).toEqual([
      'test --no-run -p ws-app',
      'nextest run --no-fail-fast -p ws-app',
      'test --doc -p ws-app',
      'test --doc -p ws-outil',
      'deny check',
    ]);
    writeFileSync(path.join(espace, 'README.md'), '# Changé\n');
    expect(lancer(espace, 'verifier').appels).toEqual(['deny check']);
  });
});

// grillhouse-nt4: a pass of tests plays under a temporary directory of its own (TMPDIR, TMP,
// TEMP), removed at its end, green, red or interrupted, and fails naming what its tests left
// there, as the CI of osc-bridge does (OB-ud1.3). Witness: SyntHub's passes each left ~10
// directories `synthhub-db-*` in /tmp (crates/service/src/db.rs:36).
describe('grillhouse-nt4, critères 2 et 3 — les tests du module cargo sous un dossier temporaire de passe', () => {
  // A temporary directory of trial, the one the command is launched with, and a probe beside it.
  const essai = () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'temporaire-'));
    const dans = path.join(racine, 'tmp');
    mkdirSync(dans);
    return { dans, sonde: path.join(racine, 'sonde.json') };
  };
  const motif = (dans: string, genre: string) =>
    new RegExp(`^${dans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/grillhouse-${genre}-[^/]+/t$`);

  for (const [nom, args, genre] of [
    ['tester', [], 'tests'],
    ['verifier', ['--tout'], 'verification'],
  ] as const) {
    it(`${nom}: a red nextest plays under TMPDIR, TMP and TEMP of the pass, then nothing stays and no leftover is named`, () => {
      const { dans, sonde } = essai();
      const r = lancer(
        d.seul,
        nom,
        [...args],
        { nextest: 100 },
        { TMPDIR: dans, FAUX_CARGO_TEMPORAIRE: sonde }
      );
      expect(r.code, r.stdout + r.stderr).toBe(1);
      const t = JSON.parse(readFileSync(sonde, 'utf8')) as Record<string, string>;
      expect(t.TMPDIR).toMatch(motif(dans, genre));
      expect(t.TMP).toBe(t.TMPDIR);
      expect(t.TEMP).toBe(t.TMPDIR);
      expect(r.stderr).not.toMatch(/dossier temporaire/);
      expect(readdirSync(dans)).toEqual([]);
    });

    it(`${nom}: a test that leaves a file in its temporary directory fails the pass, the file named, and nothing stays`, () => {
      const { dans } = essai();
      const r = lancer(d.seul, nom, [...args], {}, { TMPDIR: dans, FAUX_CARGO_RESTE: 'oublie.db' });
      expect(r.code, r.stdout + r.stderr).toBe(1);
      expect(r.stderr).toMatch(/dossier temporaire.*oublie\.db/);
      expect(readdirSync(dans)).toEqual([]);
    });
  }

  it('tester interrupted (SIGINT) leaves nothing in the temporary directory', async () => {
    const { dans, sonde } = essai();
    const c = cargo.commandes(d.seul).tester;
    const enfant = spawn(process.execPath, [c.script, ...c.args], {
      cwd: d.seul,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        TMPDIR: dans,
        FAUX_CARGO_TEMPORAIRE: sonde,
        FAUX_CARGO_ATTENDRE: '20000',
      },
    });
    const fin = new Promise(ok => enfant.on('close', ok));
    for (let i = 0; i < 200 && !existsSync(sonde); i++) {
      await new Promise(ok => setTimeout(ok, 50));
    }
    expect(existsSync(sonde)).toBe(true);
    // Ctrl-C reaches the whole group of the command, as a terminal sends it.
    process.kill(-(enfant.pid ?? 0), 'SIGINT');
    await fin;
    expect(readdirSync(dans)).toEqual([]);
  }, 30_000);
});

// grillhouse-rph: OSC Bridge ignored its Cargo.lock, and the verification, `--locked`, failed in
// the integration's copy alone (« cannot create the lock file … because --locked was passed »).
// As `npm ci` refuses a project without package-lock.json, tester, verifier and preparer refuse,
// before any run of cargo, a workspace whose Cargo.lock git does not track, in one line that names
// the file and the gesture.
describe('grillhouse-rph, critère 1 — un Cargo.lock non versionné se signale', () => {
  const git = (racine: string, ...args: string[]) =>
    spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  // A crate at the root whose Cargo.lock .gitignore ignores, the lock taken out of git and kept
  // on disk: OSC Bridge's case.
  const ignore = () => {
    const { seul } = (
      exemples.preparer(mkdtempSync(path.join(ESSAIS, 'ignore-'))) as { depots: Depots }
    ).depots;
    git(seul, 'rm', '-q', '--cached', 'Cargo.lock');
    writeFileSync(path.join(seul, '.gitignore'), '/target\nCargo.lock\n');
    git(seul, 'commit', '-q', '-am', 'ignore Cargo.lock');
    return seul;
  };

  it('every workspace of the trials commits its Cargo.lock', () => {
    for (const racine of [d.espace, d.seul]) {
      expect(git(racine, 'ls-files', 'Cargo.lock').stdout.trim(), racine).toBe('Cargo.lock');
    }
  });

  for (const [nom, args] of [
    ['tester', []],
    ['verifier', ['--tout']],
    ['preparer', []],
  ] as const) {
    it(`${nom}: a Cargo.lock ignored by git is refused in one line, cargo never run`, () => {
      const racine = ignore();
      const r = lancer(racine, nom, [...args]);
      expect(r.code, r.stdout + r.stderr).toBe(2);
      expect(r.stderr).toBe('⛔ Cargo.lock non versionné : git add Cargo.lock\n');
      expect(readFileSync(JOURNAL, 'utf8')).toBe('');
    });
  }

  it('a Cargo.lock absent is refused, the gesture that writes it named', () => {
    const racine = ignore();
    rmSync(path.join(racine, 'Cargo.lock'));
    const r = lancer(racine, 'preparer');
    expect(r.code).toBe(2);
    expect(r.stderr).toBe(
      '⛔ Cargo.lock absent : cargo generate-lockfile, puis git add Cargo.lock\n'
    );
    expect(readFileSync(JOURNAL, 'utf8')).toBe('');
  });

  it('a Cargo.lock tracked: nothing changes, cargo runs', () => {
    const r = lancer(d.seul, 'preparer');
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.appels).toEqual(['fetch --locked']);
  });
});

// grillhouse-egm: in TDD, a test that does not compile is a red (Kent Beck, TDD by Example), and
// the proof of the red reads a failed build of a package of the plan as one (« construction de
// <paquet> », constructionsEchouees of scripts/circuit.mjs: a task `script: 'build'` of the
// verdict, its package the component's name, its log from the root). Witness: OSD-b91.2.3, whose
// tests called the ticket's new interface (`osd::convert`, `osd::read_as`, `Version::V0_5`): cargo
// stopped the whole pass, and the proof read six files « non joué (code 1) » and refused the lot.
describe('grillhouse-egm, critères 1 et 2 — la compilation des tests d’une caisse est une construction', () => {
  it('a crate whose tests do not compile: a failed build task, its log the beginning of cargo’s output', () => {
    const r = lancer(d.seul, 'tester', [], { 'build seul': 101 });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.appels).toEqual(['test --no-run -p seul']);
    const b = r.verdict.taches.find(t => t.script === 'build');
    expect(b).toMatchObject({ tache: 'seul#build', paquet: 'seul', code: 101, tests: false });
    // The log from the root of the workspace, as the circuit reads a task's log
    // (journalDeTache: path.join(<copie>, journal)).
    const journal = b?.journal ?? '';
    expect(journal).not.toBe('');
    expect(path.isAbsolute(journal)).toBe(false);
    const texte = readFileSync(path.join(d.seul, journal), 'utf8');
    expect(texte).toContain('error[E0425]: cannot find function `convert` in crate `seul`');
    expect(texte).toContain('error: could not compile `seul`');
    // The output of the build still shows on the command's own streams.
    expect(r.stderr).toContain('error[E0425]');
  });

  it('a failed build leaves its crate’s tests not played and no report: they play at the checks', () => {
    const r = lancer(d.seul, 'tester', ['tests/bout.rs'], { 'build seul': 101 });
    expect(r.appels).toEqual(['test --no-run -p seul --test bout']);
    expect(r.verdict.taches.map(t => [t.tache, t.code])).toEqual([
      ['seul#build', 101],
      ['seul#nextest', null],
    ]);
    expect(r.verdict.rapports).toEqual([]);
  });

  it('the build task bears the name and the directory the circuit gives the crate', () => {
    const r = lancer(d.espace, 'tester', [], { 'build ws-core': 101 });
    expect(r.code).toBe(1);
    const echouees = r.verdict.taches.filter(
      t => t.script === 'build' && t.code !== null && t.code !== 0
    );
    expect(echouees.map(t => [t.paquet, t.dossier])).toEqual([['ws-core', 'crates/core']]);
    expect(paquetsDuLangage(cargo, d.espace)).toContainEqual({
      dossier: 'crates/core',
      pkg: { name: 'ws-core' },
      hors: false,
    });
  });

  it('the build of one crate failed, the other crates play their tests', () => {
    const r = lancer(d.espace, 'tester', [], { 'build ws-core': 101 });
    expect(r.appels).toEqual([
      'test --no-run -p ws-app',
      'nextest run --no-fail-fast -p ws-app',
      'test --doc -p ws-app',
      'test --no-run -p ws-core',
      'test --doc -p ws-matiere',
      'test --doc -p ws-outil',
    ]);
    expect(
      r.verdict.taches.filter(t => t.paquet === 'ws-core').map(t => [t.script, t.code])
    ).toEqual([
      ['build', 101],
      ['nextest', null],
      ['doctest', null],
    ]);
  });
});

// grillhouse-cyr (OSC Bridge, 2026-10-31): each copy of a circuit of Rust kept its own target/, of
// 3 to 6.5 GB, compiled again from nothing. The cargo commands of the frame compile through
// sccache (RUSTC_WRAPPER), its cache one directory of the home, common to the copies of the
// machine, which the envelope opens in writing.
describe('grillhouse-cyr, critère 1 — les commandes cargo compilent à travers sccache', () => {
  // The home of the runs, which the cache follows.
  const MAISON = path.join(ESSAIS, 'maison');
  const CACHE = path.join(MAISON, '.cache', 'sccache');
  // The calls of cargo of the command <nom> run in <racine> under <env>, each `{ sous, wrapper,
  // cache, socket }`, metadata left out.
  const compilateur = (
    racine: string,
    nom: string,
    args: string[] = [],
    env: NodeJS.ProcessEnv = {}
  ) => {
    const f = path.join(mkdtempSync(path.join(ESSAIS, 'compilateur-')), 'appels');
    writeFileSync(f, '');
    lancer(
      racine,
      nom,
      args,
      {},
      {
        FAUX_CARGO_COMPILATEUR: f,
        RUSTC_WRAPPER: '',
        CARGO_BUILD_RUSTC_WRAPPER: '',
        CARGO_HOME: '',
        SCCACHE_DIR: '',
        SCCACHE_SERVER_UDS: '',
        GRILLHOUSE_ENVELOPPE: '',
        HOME: MAISON,
        ...env,
      }
    );
    return readFileSync(f, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('metadata '))
      .map(l => {
        const [sous, ...v] = l.split(' ');
        const o = new Map(
          v.map((x): [string, string] => [x.split('=')[0], x.slice(x.indexOf('=') + 1)])
        );
        return {
          sous,
          wrapper: o.get('RUSTC_WRAPPER') ?? '',
          cache: o.get('SCCACHE_DIR') ?? '',
          socket: o.get('SCCACHE_SERVER_UDS') ?? '',
        };
      });
  };
  // A call through sccache, its common cache and its server's socket, an abstract unix socket.
  const parSccache = (appels: ReturnType<typeof compilateur>, sous: string[]) => {
    expect(appels.map(a => a.sous)).toEqual(sous);
    for (const a of appels) {
      expect(a.wrapper).toBe('sccache');
      expect(a.cache).toBe(CACHE);
      expect(a.socket).toMatch(/^\\x00grillhouse-sccache-[0-9a-f]{16}$/);
    }
    return appels[0].socket;
  };

  it('tester, verifier and typer give cargo the wrapper sccache and the common cache', () => {
    parSccache(compilateur(d.seul, 'tester'), ['build', 'nextest', 'test']);
    parSccache(compilateur(d.seul, 'verifier', ['--tout']), ['build', 'nextest', 'test', 'deny']);
    parSccache(compilateur(d.seul, 'typer'), ['check']);
  });

  it('the guard clippy compiles through sccache too', () => {
    parSccache(compilateur(d.seul, 'clippy'), ['clippy']);
  });

  it('one server per copy and per namespace of processes: its socket follows both', () => {
    const seul = parSccache(compilateur(d.seul, 'typer'), ['check']);
    expect(parSccache(compilateur(d.seul, 'tester'), ['build', 'nextest', 'test'])).toBe(seul);
    expect(seul).toBe(socketDuServeur(d.seul, espaceDesProcessus()));
    const espace = parSccache(compilateur(d.espace, 'typer'), ['check']);
    // Another namespace of processes, as an envelope creates (bwrap --unshare-pid).
    const enveloppe = socketDuServeur(d.seul, 'pid:[1]');
    const autre = socketDuServeur(d.seul, 'pid:[2]');
    expect(new Set([seul, espace, enveloppe, autre]).size).toBe(4);
    expect(socketDuServeur(d.seul, 'pid:[2]')).toBe(autre);
  });

  // grillhouse-cyr: the circuit sets GRILLHOUSE_ENVELOPPE for its checks out of bwrap; a server
  // named after that variable would serve the next session in the envelope, from outside it.
  it('the environment of the envelope does not choose the server: out of bwrap, the same one', () => {
    const hors = parSccache(compilateur(d.seul, 'typer'), ['check']);
    const marque = compilateur(d.seul, 'typer', [], { GRILLHOUSE_ENVELOPPE: 'crates/a' });
    expect(parSccache(marque, ['check'])).toBe(hors);
  });

  it('a wrapper the project sets is kept, without sccache, and no sccache is asked for', () => {
    const [appel] = compilateur(d.seul, 'typer', [], { RUSTC_WRAPPER: 'mon-lanceur' });
    expect(appel).toEqual({ sous: 'check', wrapper: 'mon-lanceur', cache: '', socket: '' });
    // Its .cargo/config.toml: cargo reads it, the environment adds nothing; a PATH without sccache.
    const projet = mkdtempSync(path.join(ESSAIS, 'lanceur-'));
    writeFileSync(path.join(projet, 'Cargo.toml'), '[package]\nname = "lanceur"\n');
    mkdirSync(path.join(projet, '.cargo'));
    writeFileSync(
      path.join(projet, '.cargo', 'config.toml'),
      '[build]\nrustc-wrapper = "mon-lanceur"\n'
    );
    const sans = mkdtempSync(path.join(ESSAIS, 'sans-sccache-'));
    copyFileSync(
      path.join(process.env.PATH!.split(path.delimiter)[0], 'cargo'),
      path.join(sans, 'cargo')
    );
    chmodSync(path.join(sans, 'cargo'), 0o755);
    const PATH = [sans, path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter);
    expect(compilateur(projet, 'typer', [], { PATH })).toEqual([
      { sous: 'check', wrapper: '', cache: '', socket: '' },
    ]);
  });

  it('a wrapper of a parent directory or of $CARGO_HOME, as cargo reads them, is kept too', () => {
    const configurer = (dossier: string, texte: string) => {
      mkdirSync(path.join(dossier, '.cargo'), { recursive: true });
      writeFileSync(path.join(dossier, '.cargo', 'config.toml'), texte);
    };
    const parent = mkdtempSync(path.join(ESSAIS, 'parent-'));
    configurer(parent, '[build]\nrustc-wrapper = "du-parent"\n');
    const projet = path.join(parent, 'projet');
    mkdirSync(projet);
    writeFileSync(path.join(projet, 'Cargo.toml'), '[package]\nname = "projet"\n');
    expect(compilateur(projet, 'typer')).toEqual([
      { sous: 'check', wrapper: '', cache: '', socket: '' },
    ]);
    // $CARGO_HOME, `.cargo` of the home when unset.
    const maison = mkdtempSync(path.join(ESSAIS, 'cargo-home-'));
    writeFileSync(path.join(maison, 'config.toml'), '[build]\nrustc-wrapper = "de-la-maison"\n');
    expect(compilateur(d.seul, 'typer', [], { CARGO_HOME: maison })).toEqual([
      { sous: 'check', wrapper: '', cache: '', socket: '' },
    ]);
    const home = mkdtempSync(path.join(ESSAIS, 'home-'));
    configurer(home, '[build]\nrustc-wrapper = "du-home"\n');
    expect(compilateur(d.seul, 'typer', [], { HOME: home })).toEqual([
      { sous: 'check', wrapper: '', cache: '', socket: '' },
    ]);
    // CARGO_BUILD_RUSTC_WRAPPER, cargo's variable of the same key.
    expect(
      compilateur(d.seul, 'typer', [], { CARGO_BUILD_RUSTC_WRAPPER: 'par-cargo' })[0].wrapper
    ).toBe('');
  });

  it('without sccache on the PATH, tester, verifier, typer and clippy refuse, named, cargo never run', () => {
    // A PATH that holds the fake cargo, node and git, without sccache.
    const sans = mkdtempSync(path.join(ESSAIS, 'sans-sccache-'));
    copyFileSync(
      path.join(process.env.PATH!.split(path.delimiter)[0], 'cargo'),
      path.join(sans, 'cargo')
    );
    chmodSync(path.join(sans, 'cargo'), 0o755);
    const PATH = [sans, path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter);
    for (const [nom, args] of [
      ['tester', []],
      ['verifier', ['--tout']],
      ['typer', []],
      ['clippy', []],
    ] as const) {
      const r = lancer(d.seul, nom, [...args], {}, { PATH });
      expect(r.code, nom).not.toBe(0);
      expect(r.stderr, nom).toContain('sccache absent du PATH');
      expect(r.stderr, nom).toContain('npx grillhouse maj');
      expect(r.appels, nom).toEqual([]);
    }
  });

  it('the envelope opens the cache of sccache in writing, a store of the home it creates before mounting', () => {
    expect(cargo.sorties.ecrites).toContain('~/.cache/sccache/');
    // The stores of the home are created before bwrap mounts them (scripts/enveloppe/enveloppe.mjs,
    // `creer` of each of `magasins`).
    const { magasins, fichiers } = sortiesDuLangage(cargo.sorties, {
      maison: '/h',
      principal: '/p',
    });
    expect(magasins).toContain('/h/.cache/sccache');
    expect(fichiers).not.toContain('/h/.cache/sccache');
  });
});

// grillhouse-qmk (OSC Bridge, OB-p58, 2026-10-31): in an agent's envelope, every build stopped on
// « sccache: error: path must be shorter than SUN_LEN ». sccache 0.19.0 starts its server by
// binding a socket under TMPDIR (`<TMPDIR>/sccacheXXXXXX/sock`, src/commands.rs,
// `run_server_process`), and the base of the pass under the session's working directory made it
// longer than the 108 bytes of a socket's path. The commands start the copy's server themselves,
// under the machine's /tmp, before each run of cargo that compiles: cargo finds it running.
describe('grillhouse-qmk, critère 1 — le serveur de sccache démarre sous un dossier temporaire court', () => {
  const MAISON = path.join(ESSAIS, 'maison');
  const CACHE = path.join(MAISON, '.cache', 'sccache');
  // A temporary directory as long as the working directory of a session in a copy of a project
  // (`/tmp/claude-<uid>/<copy in dashes>/travail`), which the commands receive.
  const LONG = path.join(ESSAIS, 'x'.repeat(40), 'y'.repeat(40), 'travail');
  // The calls of sccache and of cargo of the command <nom> run in <racine>, in their order, each
  // `{ appel, tmpdir, cache, socket }`: `sccache <arguments>`, or the subcommand of cargo.
  const appels = (racine: string, nom: string, args: string[] = [], env = {}) => {
    const f = path.join(mkdtempSync(path.join(ESSAIS, 'serveur-')), 'appels');
    writeFileSync(f, '');
    mkdirSync(LONG, { recursive: true });
    lancer(
      racine,
      nom,
      args,
      {},
      {
        FAUX_CARGO_COMPILATEUR: f,
        FAUX_SCCACHE_JOURNAL: f,
        RUSTC_WRAPPER: '',
        CARGO_BUILD_RUSTC_WRAPPER: '',
        CARGO_HOME: '',
        SCCACHE_DIR: '',
        SCCACHE_SERVER_UDS: '',
        GRILLHOUSE_ENVELOPPE: '',
        HOME: MAISON,
        TMPDIR: LONG,
        ...env,
      }
    );
    return readFileSync(f, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('metadata '))
      .map(l => {
        const mots = l.split(' ');
        const cles = mots.filter(m => /^[A-Z_]+=/.test(m));
        const o = new Map(cles.map(x => [x.split('=')[0], x.slice(x.indexOf('=') + 1)]));
        return {
          appel: mots.filter(m => !cles.includes(m)).join(' '),
          tmpdir: o.get('TMPDIR') ?? '',
          cache: o.get('SCCACHE_DIR') ?? '',
          socket: o.get('SCCACHE_SERVER_UDS') ?? '',
        };
      });
  };
  const DEMARRE = 'sccache --start-server';
  // Each run of cargo that compiles follows the start of its server: under /tmp, its cache and
  // its socket cargo's; cargo keeps its own temporary directory.
  const demarreAvant = (a: ReturnType<typeof appels>, attendus: string[]) => {
    expect(a.map(x => x.appel)).toEqual(attendus);
    const socket = a.find(x => x.appel !== DEMARRE)!.socket;
    expect(socket).toMatch(/^\\x00grillhouse-sccache-[0-9a-f]{16}$/);
    for (const x of a) {
      expect(x.socket, x.appel).toBe(socket);
      expect(x.cache, x.appel).toBe(CACHE);
      if (x.appel === DEMARRE) {
        expect(x.tmpdir).toBe('/tmp');
      } else {
        expect(x.tmpdir.startsWith(LONG), x.appel).toBe(true);
      }
    }
  };

  it('tester, verifier and typer start the server of the copy under /tmp before each build', () => {
    demarreAvant(appels(d.seul, 'tester'), [DEMARRE, 'build', DEMARRE, 'nextest', DEMARRE, 'test']);
    demarreAvant(appels(d.seul, 'verifier', ['--tout']), [
      DEMARRE,
      'build',
      DEMARRE,
      'nextest',
      DEMARRE,
      'test',
      'deny',
    ]);
    demarreAvant(appels(d.seul, 'typer'), [DEMARRE, 'check']);
  });

  it('the guard clippy starts it too', () => {
    demarreAvant(appels(d.seul, 'clippy'), [DEMARRE, 'clippy']);
  });

  it('a wrapper the project sets: no server of sccache is started', () => {
    expect(appels(d.seul, 'typer', [], { RUSTC_WRAPPER: 'mon-lanceur' }).map(x => x.appel)).toEqual(
      ['check']
    );
  });
});

describe('grillhouse-cyr, critère 2 — la mise à jour installe sccache à sa version exacte', () => {
  it('sccache is a binary of the module cargo, at the version of mozilla/sccache v0.19.0', () => {
    expect(cargo.binaires.sccache).toBe('0.19.0');
  });
});
