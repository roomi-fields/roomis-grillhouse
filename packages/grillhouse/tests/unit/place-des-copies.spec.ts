// grillhouse-k5y: the room the copies hold on the disk. On 2026-11-01 the main disk, full at 100 %,
// killed three circuits without a word: each copy of SyntHub compiled into its own target/, up to
// 5.0 GB (1.1 GB of it incremental compilation), and the frame waited for room under the temporary
// directory alone. As the CI of Rust compiles without incremental compilation, as Bazel and
// Buildkite refuse to start a build under a floor of free room, and as a CI cleans its workspaces:
// cargo compiles without incremental compilation unless the caller or the project says otherwise;
// a heavy pass waits for room on the disk of its copy too, naming the copies that hold it; the
// copies that last lose their tools' outputs once their pass is played; a copy whose circuit no
// longer runs is named with its place.
//
// Each case of the copies plays the real git in a repository of trial.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { avecSccache } from '../../scripts/langages/cargo/sccache.mjs';
import {
  occupantsDesCopies,
  retirerLesCopiesDuDepot,
  retirerLesCopiesFinies,
} from '../../scripts/copies-finies.mjs';
import { departDe } from '../../scripts/mesure/base-de-passe.mjs';
import { attendreDeLaPlace, avecLaMachine } from '../../scripts/verrou-de-machine.mjs';

const DEPOT = path.resolve(import.meta.dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'place-des-copies-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));
const LONG = 30_000;

describe('grillhouse-k5y, critères 1 et 2 — cargo compile sans compilation incrémentale, sauf avis contraire', () => {
  // A workspace of cargo out of the temporary directory's reach for the target (CARGO_TARGET_DIR
  // given), its home a trial folder, its Cargo.toml <manifeste>.
  const espace = (manifeste = '[workspace]\nmembers = []\n') => {
    const racine = unDossier('espace');
    writeFileSync(path.join(racine, 'Cargo.toml'), manifeste);
    const env = { HOME: unDossier('maison'), PATH: '', CARGO_TARGET_DIR: path.join(racine, 't') };
    return { racine, env };
  };

  it('criterion 1: every compilation of the module runs with CARGO_INCREMENTAL=0', () => {
    const { racine, env } = espace();
    expect(avecSccache(racine, env).CARGO_INCREMENTAL).toBe('0');
  });

  it('criterion 1: with a wrapper of rustc of its own, the project still compiles without incremental compilation', () => {
    const { racine, env } = espace();
    const e = avecSccache(racine, { ...env, RUSTC_WRAPPER: 'mon-lanceur' });
    expect(e.RUSTC_WRAPPER).toBe('mon-lanceur');
    expect(e.CARGO_INCREMENTAL).toBe('0');
  });

  it('criterion 2: a CARGO_INCREMENTAL the caller sets wins, whatever its value', () => {
    const { racine, env } = espace();
    expect(avecSccache(racine, { ...env, CARGO_INCREMENTAL: '1' }).CARGO_INCREMENTAL).toBe('1');
    expect(avecSccache(racine, { ...env, CARGO_INCREMENTAL: '0' }).CARGO_INCREMENTAL).toBe('0');
  });

  it('criterion 2: CARGO_BUILD_INCREMENTAL, or a profile set by the environment, is the caller’s too', () => {
    const { racine, env } = espace();
    for (const cle of ['CARGO_BUILD_INCREMENTAL', 'CARGO_PROFILE_DEV_INCREMENTAL']) {
      const e = avecSccache(racine, { ...env, [cle]: 'true' });
      expect(e[cle]).toBe('true');
      expect(e.CARGO_INCREMENTAL).toBeUndefined();
    }
  });

  it('criterion 2: a profile of the Cargo.toml that says `incremental` is the project’s, never overwritten', () => {
    const { racine, env } = espace(
      '[workspace]\nmembers = []\n\n[profile.dev]\nincremental = true\nopt-level = 1\n'
    );
    expect(avecSccache(racine, env).CARGO_INCREMENTAL).toBeUndefined();
  });

  it('criterion 2: a profile without `incremental` keeps the default of the frame, its other settings untouched', () => {
    const { racine, env } = espace('[workspace]\nmembers = []\n\n[profile.dev]\ndebug = 1\n');
    const e = avecSccache(racine, env);
    expect(e.CARGO_INCREMENTAL).toBe('0');
    expect(Object.keys(e).filter(k => k.startsWith('CARGO_PROFILE_'))).toEqual([]);
  });

  it('criterion 2: `build.incremental` of a .cargo/config.toml of the project is the project’s', () => {
    const { racine, env } = espace();
    mkdirSync(path.join(racine, '.cargo'));
    writeFileSync(path.join(racine, '.cargo', 'config.toml'), '[build]\nincremental = true\n');
    expect(avecSccache(racine, env).CARGO_INCREMENTAL).toBeUndefined();
  });

  it('criterion 2: the developer’s skill says how to turn it back on for a pass of his own', () => {
    const competence = readFileSync(
      path.join(DEPOT, 'mods/grillhouse/skills/developpeur/SKILL.md'),
      'utf8'
    );
    expect(competence).toMatch(/CARGO_INCREMENTAL=1/);
    expect(competence).toMatch(/\[profile\.\*\]/);
  });
});

// The repository of trial, on main, its copies and target/ ignored.
const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
function depot() {
  const r = unDossier('depot');
  git(r, 'init', '-q', '-b', 'main');
  git(r, 'config', 'user.email', 'essai@example.com');
  git(r, 'config', 'user.name', 'essai');
  writeFileSync(path.join(r, 'a.txt'), 'a\n');
  writeFileSync(path.join(r, '.gitignore'), '.claude/worktrees/\ntarget/\nnode_modules/\n');
  git(r, 'add', '-A');
  git(r, 'commit', '-q', '-m', 'base');
  return r;
}
// The copy .claude/worktrees/<nom> of <racine>, on a branch of its own.
function copie(racine: string, nom: string) {
  const c = path.join(racine, '.claude', 'worktrees', nom);
  git(racine, 'worktree', 'add', '-q', '-b', `agent/${nom}`, c);
  return c;
}
// A commit in <dossier> that main does not hold.
function engager(dossier: string, texte: string) {
  writeFileSync(path.join(dossier, 'a.txt'), texte);
  git(dossier, 'commit', '-q', '-am', texte.trim());
}
// A target/ of <ko> KB in the copy <c>.
function cible(c: string, ko: number) {
  mkdirSync(path.join(c, 'target', 'debug', 'deps'), { recursive: true });
  writeFileSync(path.join(c, 'target', 'debug', 'deps', 'gros'), Buffer.alloc(ko * 1024, 1));
}

describe('grillhouse-k5y, critère 3 — une passe lourde attend la place sur le disque de sa copie', () => {
  // The environment of a wait: a temporary directory apart from the copy, a lock of its own.
  const environnement = (ajouts: Record<string, string> = {}) => ({
    TMPDIR: unDossier('tmp'),
    GRILLHOUSE_VERROU_MACHINE: path.join(unDossier('verrou'), 'mesure.lock'),
    ...ajouts,
  });
  // The stop of a wait that throws: its message and its code.
  const arret = (f: () => void) => {
    try {
      f();
    } catch (e) {
      const { message, code } = e as { message: string; code: number };
      return { message, code };
    }
    return null;
  };

  it(
    'under the floor, the wait names the disk of the copy and the copies that hold it, target/ and ticket named, then 75 at its bound',
    () => {
      const racine = depot();
      // The project declares cargo, whose module names its outputs (`ignorer`: target).
      mkdirSync(path.join(racine, 'docs'));
      writeFileSync(
        path.join(racine, 'docs', 'ARCHITECTURE.md'),
        '# Architecture\n\n| Composant | Langage |\n| --- | --- |\n| `.` | cargo |\n'
      );
      const gros = copie(racine, 'demo-7');
      cible(gros, 2048);
      const petit = copie(racine, 'demo-8');
      cible(petit, 64);
      const env = environnement();
      const lignes: string[] = [];
      const r = arret(() =>
        attendreDeLaPlace({
          env,
          racine: gros,
          libre: (d: string) => (d === env.TMPDIR ? Infinity : 0),
          borneMs: 0,
          dire: (l: string) => lignes.push(l),
          ticket: 'demo-7',
        })
      );
      expect(r?.code).toBe(75);
      expect(r?.message).toMatch(/^⏱ attente de place bornée à .* : le disque de la copie \(/);
      expect(r?.message).toContain(`(${gros})`);
      expect(r?.message).toMatch(
        /n'a que 0,0 Go libres, moins des 4,0 Go .*GRILLHOUSE_COPIE_LIBRE/
      );
      expect(r?.message).toMatch(
        /l'occupent : \.claude\/worktrees\/demo-7 \(le ticket demo-7, 2,\d Mo, dont target 2,\d Mo\), \.claude\/worktrees\/demo-8 \(le ticket demo-8, /
      );
      expect(r?.message).toMatch(/à repasser \(code 75\)/);
    },
    LONG
  );

  it('it waits, says so, then lets the pass play once the room is back', () => {
    const racine = depot();
    const env = environnement();
    const lignes: string[] = [];
    let n = 0;
    attendreDeLaPlace({
      env,
      racine,
      libre: (d: string) => (d === env.TMPDIR ? Infinity : ++n > 3 ? Infinity : 1024 ** 3),
      occupe: () => 'rien',
      rappelMs: 1,
      dire: (l: string) => lignes.push(l),
    });
    expect(lignes[0]).toMatch(
      /^⏳ le disque de la copie \(.+\) n'a que 1,0 Go libres, moins des 4,0 Go qu'une passe lourde demande \(GRILLHOUSE_COPIE_LIBRE\)/
    );
    expect(lignes.at(-1)).toMatch(/^✓ place sur le disque de la copie après /);
  });

  it('the temporary directory is still waited for first, its own floor and words unchanged', () => {
    const racine = depot();
    const env = environnement();
    const r = arret(() =>
      attendreDeLaPlace({ env, racine, libre: () => 0, occupe: () => 'x', borneMs: 0 })
    );
    expect(r?.code).toBe(75);
    expect(r?.message).toMatch(
      /le dossier temporaire \(.+\) n'a que 0,0 Go libres.*GRILLHOUSE_TEMPORAIRE_LIBRE/
    );
  });

  it('GRILLHOUSE_COPIE_LIBRE names another floor, in bytes', () => {
    const racine = depot();
    const env = environnement({ GRILLHOUSE_COPIE_LIBRE: '10' });
    const lignes: string[] = [];
    attendreDeLaPlace({
      env,
      racine,
      libre: (d: string) => (d === env.TMPDIR ? Infinity : 10),
      borneMs: 0,
      dire: (l: string) => lignes.push(l),
    });
    expect(lignes).toEqual([]);
  });

  it('the lock of the machine waits for room on the disk of the copy it plays in before it plays', () => {
    const racine = depot();
    const env = environnement();
    let joue = false;
    const r = arret(() =>
      avecLaMachine(
        () => {
          joue = true;
        },
        {
          env,
          racine,
          libre: (d: string) => (d === env.TMPDIR ? Infinity : 0),
          borneMs: 0,
          dire: () => {},
        }
      )
    );
    expect(r?.code).toBe(75);
    expect(r?.message).toMatch(/le disque de la copie/);
    expect(joue).toBe(false);
  });

  it(
    'the count of the copies names the main tree’s copies alone, the largest first, the frame’s copies without a ticket',
    () => {
      const racine = depot();
      cible(copie(racine, 'demo-9'), 16);
      cible(copie(racine, 'nuit'), 512);
      const lu = occupantsDesCopies(racine, ['target']);
      expect(lu).toMatch(/^\.claude\/worktrees\/nuit \(\d+(,\d)? [KM]o, dont target /);
      expect(lu).toMatch(/\.claude\/worktrees\/demo-9 \(le ticket demo-9, /);
      expect(lu).not.toMatch(/le ticket nuit/);
    },
    LONG
  );

  it('the base configuration of the tests asks no room of the copy’s disk, as of the temporary directory', () => {
    const setup = readFileSync(
      path.join(
        DEPOT,
        'packages/grillhouse/scripts/langages/typescript/vitest-config/machine.setup.mjs'
      ),
      'utf8'
    );
    expect(setup).toMatch(/process\.env\.GRILLHOUSE_COPIE_LIBRE \|\|= '0'/);
  });
});

const balayer = (racine: string, o: { enCours?: Set<string>; fermes?: Set<string> } = {}) =>
  retirerLesCopiesFinies(racine, {
    lireEnCours: () => o.enCours ?? new Set<string>(),
    lireFermes: () => o.fermes ?? new Set<string>(),
    ignorer: ['target'],
  }).join('\n');

describe('grillhouse-k5y, critère 4 — les copies qui durent élaguent leur target/', () => {
  // A repository of trial that declares cargo, and its night's copy, holding a target/ and an
  // install.
  const avecSaNuit = () => {
    const racine = depot();
    mkdirSync(path.join(racine, 'docs'));
    writeFileSync(
      path.join(racine, 'docs', 'ARCHITECTURE.md'),
      '# Architecture\n\n| Composant | Langage |\n| --- | --- |\n| `.` | cargo |\n'
    );
    const nuit = path.join(racine, '.claude', 'worktrees', 'nuit');
    git(racine, 'worktree', 'add', '-q', '--detach', nuit);
    cible(nuit, 64);
    mkdirSync(path.join(nuit, 'node_modules', 'x'), { recursive: true });
    return { racine, nuit };
  };

  it(
    'the night’s copy, its steps played, loses target/ but keeps its install and stays',
    () => {
      const { racine, nuit } = avecSaNuit();
      const journal = retirerLesCopiesDuDepot(racine, [nuit]).join('\n');
      expect(existsSync(nuit)).toBe(true);
      expect(existsSync(path.join(nuit, 'target'))).toBe(false);
      expect(existsSync(path.join(nuit, 'node_modules', 'x'))).toBe(true);
      expect(journal).toMatch(
        /copie élaguée : \.claude\/worktrees\/nuit : target retiré \(\d+(,\d)? [KM]o\)/
      );
    },
    LONG
  );

  it(
    'the night’s copy not named by its owner is never touched: a night may be playing in it',
    () => {
      const { racine, nuit } = avecSaNuit();
      expect(retirerLesCopiesDuDepot(racine)).toEqual([]);
      expect(existsSync(path.join(nuit, 'target', 'debug', 'deps', 'gros'))).toBe(true);
    },
    LONG
  );

  it(
    'the integration’s copy, kept with no lock, loses target/ and keeps its install; under its lock it keeps all',
    () => {
      const racine = depot();
      const integration = path.join(racine, '.claude', 'worktrees', 'integration');
      git(racine, 'worktree', 'add', '-q', '--detach', integration);
      engager(integration, 'lot non entré\n');
      cible(integration, 64);
      mkdirSync(path.join(integration, 'node_modules', 'x'), { recursive: true });
      const commun = git(racine, 'rev-parse', '--path-format=absolute', '--git-common-dir');
      writeFileSync(path.join(commun, 'integration.lock'), '');
      balayer(racine);
      expect(existsSync(path.join(integration, 'target', 'debug', 'deps', 'gros'))).toBe(true);
      rmSync(path.join(commun, 'integration.lock'));
      const journal = balayer(racine);
      expect(existsSync(integration)).toBe(true);
      expect(existsSync(path.join(integration, 'target'))).toBe(false);
      expect(existsSync(path.join(integration, 'node_modules', 'x'))).toBe(true);
      expect(journal).toMatch(/copie gardée : \.claude\/worktrees\/integration .*target retiré/);
    },
    LONG
  );

  it('the night names its own copy to the removal once its steps are played', () => {
    const nuit = readFileSync(path.join(DEPOT, 'packages/grillhouse/scripts/nuit.sh'), 'utf8');
    expect(nuit).toMatch(/node "\$ici\/copies-finies\.mjs" "\$copie"/);
  });
});

describe('grillhouse-k5y, critère 5 — une copie dont le circuit ne tourne plus est nommée avec sa place', () => {
  // The state of the circuit of the copy <c>, its process <processus>.
  const etat = (c: string, processus: number, depart: string | null) =>
    writeFileSync(
      `${c}.circuit.json`,
      JSON.stringify({ etape: 'controles', processus, depart, finale: true })
    );

  it(
    'its circuit gone, the line names it with the place of the copy and of its target/; its code and its commits stay',
    () => {
      const racine = depot();
      const c = copie(racine, 'demo-20');
      engager(c, 'travail du ticket\n');
      cible(c, 1024);
      mkdirSync(`${c}.travail`);
      // A process gone: a number past the kernel's largest (pid_max, 2^22 at most).
      etat(c, 2 ** 22 + 1, '1');
      const journal = balayer(racine, { enCours: new Set(['demo-20']) });
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/demo-20 \(\d+(,\d)? Mo\) : son circuit ne tourne plus \(son processus \d+ est parti\) ; target y tient 1,\d Mo/
      );
      expect(existsSync(path.join(c, 'target', 'debug', 'deps', 'gros'))).toBe(true);
      expect(readFileSync(path.join(c, 'a.txt'), 'utf8')).toBe('travail du ticket\n');
      expect(git(c, 'log', '-1', '--format=%s')).toBe('travail du ticket');
    },
    LONG
  );

  it(
    'its circuit running, the line says its circuit holds it, as before',
    () => {
      const racine = depot();
      const c = copie(racine, 'demo-21');
      mkdirSync(`${c}.travail`);
      etat(c, process.pid, departDe(process.pid));
      const journal = balayer(racine);
      expect(journal).toMatch(
        /copie gardée : \.claude\/worktrees\/demo-21 \(.*\) : son circuit a son dossier demo-21\.travail/
      );
    },
    LONG
  );

  it(
    'a copy whose working directory has no state of its circuit keeps its line, as before',
    () => {
      const racine = depot();
      const c = copie(racine, 'demo-22');
      mkdirSync(`${c}.travail`);
      expect(balayer(racine)).toMatch(
        /demo-22 \(.*\) : son circuit a son dossier demo-22\.travail/
      );
    },
    LONG
  );
});

describe('grillhouse-k5y, critère 6 — le CHANGELOG le dit', () => {
  it('the Unreleased section names the ticket', () => {
    const journal = readFileSync(path.join(DEPOT, 'CHANGELOG.md'), 'utf8');
    const nonPublie = journal.slice(
      journal.indexOf('## [Unreleased]'),
      journal.indexOf('\n## [', journal.indexOf('## [Unreleased]') + 1)
    );
    expect(nonPublie).toMatch(/grillhouse-k5y/);
  });
});
