// grillhouse-3uv.29: the working copies set their submodules. Three places create a working copy
// — the integration copy (scripts/integration/integrer.mjs, step 4), the agent copy
// (scripts/enveloppe/lancer.sh) and the night copy (scripts/nuit.sh) — and one preparation, called
// by the three, sets the submodules at the commit the superproject references, before any
// installation or build (actions/checkout `submodules: recursive`, `git submodule update --init
// --recursive`).
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { configGit } from '../config-git.js';
import { canWrap } from '../machine.js';
import { CODE_COPIE } from '../../scripts/enveloppe/codes.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'sous-modules-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.resolve(__dirname, '../..');
const SCRIPTS = path.join(RACINE, 'scripts');
const INTEGRER = path.join(SCRIPTS, 'integration/integrer.mjs');
const LANCER = path.join(SCRIPTS, 'enveloppe/lancer.sh');
const POSE = path.join(SCRIPTS, 'sous-modules.sh');
const RETIRER = path.join(SCRIPTS, 'retirer-copie.sh');
const LONG = 60_000;

// The file protocol is refused to submodule commands by default; the test repositories live on
// disk, so the commands that build them allow it, beside the git settings of the suite. The scripts
// under test run without it, as on the machine (grillhouse-3uv.52): an empty global configuration
// of their own, no system one, and the git settings of the suite but that allowance.
const ENV_GIT = {
  ...configGit([['protocol.file.allow', 'always']]),
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
const git = (dir: string, ...a: string[]) =>
  execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...ENV_GIT } });
const CONFIG_GLOBALE = path.join(ESSAIS, 'gitconfig');
writeFileSync(CONFIG_GLOBALE, '');
const ENV_SCRIPTS: NodeJS.ProcessEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^GIT_(CONFIG|ALLOW_PROTOCOL)/.test(k))
  ),
  ...configGit([], cle => !cle.startsWith('protocol.')),
  GIT_CONFIG_GLOBAL: CONFIG_GLOBALE,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
// git as the scripts see it: no allowance from the environment of the test.
const gitScripts = (dir: string, ...a: string[]) =>
  spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: ENV_SCRIPTS });

// A repository whose build succeeds only when its submodule vendor/natif is set, and records what
// it saw; with a fake Beads (every ticket ACCEPTÉ, every list empty). The submodule has two
// commits, `v1` then `v2`; the superproject references `v1`, the older one, so a copy that takes the
// submodule's tip instead of the referenced commit is seen. Its address in .gitmodules is an absolute
// path, a path relative to the superproject, or a file:// URL; `imbrique` gives it a submodule of
// its own, vendor/natif/profond, also at a local address (grillhouse-3uv.52).
type Adresse = 'absolue' | 'relative' | 'file';
function monde(avecSousModule = true, adresse: Adresse = 'absolue', imbrique = false) {
  const repo = mkdtempSync(path.join(ESSAIS, 'sousmod-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1 $2 $3" in "config get issue_prefix") echo demo; exit 0;; esac\ncase "$1" in show) echo '[{"id":"demo-1","labels":[]}]';; comments) echo '[{"text":"ACCEPTÉ"}]';; list) echo '[]';; create) echo demo-12;; esac\n`,
    { mode: 0o755 }
  );
  const vu = path.join(bin, 'vu');
  writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({
      name: 't',
      private: true,
      scripts: {
        build: 'node build.mjs',
        test: 'node suites.mjs',
        'integration:gardes': 'true',
      },
    })
  );
  // Without .gitmodules the build passes. The build says nothing on its own output, so a refusal that names the submodule comes from the
  // preparation, not from it.
  writeFileSync(
    path.join(repo, 'build.mjs'),
    `import fs from 'node:fs';\nconst f = 'vendor/natif/natif.txt';\nconst v = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : 'absent';\nfs.appendFileSync(${JSON.stringify(vu)}, v + '\\n');\nprocess.exit(v === 'absent' && fs.existsSync('.gitmodules') ? 1 : 0);\n`
  );
  // The one test command (grillhouse-3uv.75.1): the integration's call names ROUGES and gets no
  // failing test; any other call (the night's, the agent's) reads the submodule as the build does.
  writeFileSync(
    path.join(repo, 'suites.mjs'),
    "import fs from 'node:fs';\nif (process.env.ROUGES) fs.writeFileSync(process.env.ROUGES, '');\nelse await import('./build.mjs');\n"
  );
  writeFileSync(path.join(repo, '.gitignore'), '.claude/worktrees/\nnode_modules\n');
  mkdirSync(path.join(repo, '.claude/agents'), { recursive: true });
  writeFileSync(path.join(repo, '.claude/agents/developpeur.md'), '---\nname: developpeur\n---\n');
  mkdirSync(path.join(repo, 'packages/a/src'), { recursive: true });
  writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'export const a = 1;\n');
  // The night runs from the repository's own scripts: they are copied whole, so the preparation
  // it calls is there, whatever its file.
  cpSync(SCRIPTS, path.join(repo, 'scripts'), { recursive: true });
  git(repo, 'init', '-q');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'base');

  const natif = mkdtempSync(path.join(ESSAIS, 'natif-'));
  const commits: string[] = [];
  if (avecSousModule) {
    git(natif, 'init', '-q');
    if (imbrique) {
      const profond = mkdtempSync(path.join(ESSAIS, 'profond-'));
      git(profond, 'init', '-q');
      writeFileSync(path.join(profond, 'profond.txt'), 'p1\n');
      git(profond, 'add', '.');
      git(profond, 'commit', '-qm', 'p1');
      git(natif, 'submodule', 'add', '-q', profond, 'profond');
    }
    for (const v of ['v1', 'v2']) {
      writeFileSync(path.join(natif, 'natif.txt'), `${v}\n`);
      git(natif, 'add', '.');
      git(natif, 'commit', '-qm', v);
      commits.push(git(natif, 'rev-parse', 'HEAD').trim());
    }
    const url = {
      absolue: natif,
      relative: `../${path.basename(natif)}`,
      file: `file://${natif}`,
    }[adresse];
    git(repo, 'submodule', 'add', '-q', url, 'vendor/natif');
    if (imbrique) {
      git(repo, 'submodule', 'update', '--init', '--recursive');
    }
    git(path.join(repo, 'vendor/natif'), 'checkout', '-q', commits[0] ?? '');
    git(repo, 'add', 'vendor/natif');
    git(repo, 'commit', '-qm', 'natif v1');
  }
  const env = { ...ENV_SCRIPTS, PATH: `${bin}:${process.env.PATH}` };

  // A lot that adds a source to the component packages/a: its suite plays, so the copy builds.
  let n = 0;
  const lot = () => {
    n += 1;
    const f = `packages/a/src/lot-${n}.ts`;
    writeFileSync(path.join(repo, f), `export const lot${n} = ${n};\n`);
    const p = path.join(bin, `lot-${n}.patch`);
    writeFileSync(
      p,
      spawnSync('git', ['-C', repo, 'diff', '--no-index', '/dev/null', f], { encoding: 'utf8' })
        .stdout
    );
    rmSync(path.join(repo, f));
    return p;
  };
  const message = path.join(bin, 'msg');
  writeFileSync(message, 'feat: une source (demo-1)\n');
  // `ailleurs`: the environment of the scripts with some variables changed (its PATH, say).
  const integrer = (ailleurs: NodeJS.ProcessEnv = {}) =>
    spawnSync('node', [INTEGRER, '--ticket', 'demo-1', '--code', lot(), '--message', message], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...env, ...ailleurs },
    });
  const nuit = (ailleurs: NodeJS.ProcessEnv = {}) =>
    spawnSync('bash', [path.join(repo, 'scripts/nuit.sh')], {
      encoding: 'utf8',
      env: { ...env, ...ailleurs },
    });
  const journalNuit = () => {
    const d = path.join(repo, '.git/nuit');
    return readdirSync(d)
      .filter(f => f.endsWith('.log'))
      .map(f => readFileSync(path.join(d, f), 'utf8'))
      .join('');
  };
  const consigne = path.join(bin, 'consigne.txt');
  writeFileSync(consigne, 'TON TICKET : demo-1 — un sujet.');
  // `ticket`: the ticket launched, demo-1 by default; another one has a consigne of its own.
  const lancer = (ticket = 'demo-1') => {
    const c = ticket === 'demo-1' ? consigne : path.join(bin, `consigne-${ticket}.txt`);
    writeFileSync(c, `TON TICKET : ${ticket} — un sujet.`);
    return spawnSync('bash', [LANCER, ticket, 'developpeur', 'packages/a', c], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...env, CLAUDE_BIN: 'true' },
    });
  };
  const copies = {
    integration: path.join(repo, '.claude/worktrees/integration'),
    agent: path.join(repo, '.claude/worktrees/demo-1'),
    nuit: path.join(repo, '.claude/worktrees/nuit'),
  };
  const natifDe = (copie: string) => {
    const f = path.join(copie, 'vendor/natif/natif.txt');
    return existsSync(f) ? readFileSync(f, 'utf8').trim() : 'absent';
  };
  const vus = () => (existsSync(vu) ? readFileSync(vu, 'utf8').trim().split('\n') : []);
  // The submodule can no longer be fetched: its source has moved.
  const perdreSource = () => renameSync(natif, `${natif}-parti`);
  // main references the submodule's v2.
  const avancerNatif = () => {
    git(path.join(repo, 'vendor/natif'), 'checkout', '-q', commits[1] ?? '');
    git(repo, 'add', 'vendor/natif');
    git(repo, 'commit', '-qm', 'natif v2');
  };
  return {
    repo,
    bin,
    commits,
    copies,
    integrer,
    nuit,
    journalNuit,
    lancer,
    natifDe,
    vus,
    perdreSource,
    avancerNatif,
  };
}

describe('critère 1 — each working copy has its submodules set at the referenced commit', () => {
  it(
    'critère 1: the integration copy sets vendor/natif at the referenced commit before its build',
    () => {
      const m = monde();
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('v1');
      // The build, run after the preparation, saw the submodule.
      expect(m.vus()[0]).toBe('v1');
    },
    LONG
  );
  it(
    'critère 1: the agent copy sets vendor/natif at the referenced commit before its build',
    () => {
      const m = monde();
      m.lancer();
      expect(m.natifDe(m.copies.agent)).toBe('v1');
      expect(m.vus()[0]).toBe('v1');
    },
    LONG
  );
  it(
    'critère 1: the night copy sets vendor/natif at the referenced commit before its build',
    () => {
      const m = monde();
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('v1');
      expect(m.vus()[0]).toBe('v1');
    },
    LONG
  );
  it('critère 1: one preparation sets the submodules, and the three copies call it', () => {
    // The files of scripts/ that run a submodule command (`submodule update`, in shell or as
    // spawn arguments): exactly one, and each of the three copies names it.
    const fichiers: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          walk(p);
        } else {
          fichiers.push(p);
        }
      }
    };
    walk(SCRIPTS);
    const commande = /submodule['"]?\s*,?\s*['"]?update/;
    const preparations = fichiers.filter(f => commande.test(readFileSync(f, 'utf8')));
    expect(preparations.map(f => path.relative(RACINE, f))).toHaveLength(1);
    const nom = path.basename(preparations[0] ?? '').replace(/\.(mjs|sh)$/, '');
    for (const appelant of [INTEGRER, LANCER, path.join(SCRIPTS, 'nuit.sh')]) {
      expect(readFileSync(appelant, 'utf8'), path.relative(RACINE, appelant)).toContain(nom);
    }
  });
});

describe('critère 2 — a submodule that cannot be set stops the preparation', () => {
  it(
    'critère 2: the integration refuses, with a message that names the submodule',
    () => {
      const m = monde();
      m.perdreSource();
      const r = m.integrer();
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/⛔[^\n]*vendor\/natif/);
      expect(r.stdout).not.toMatch(/ne se construit pas/);
      expect(m.vus()).toEqual([]);
    },
    LONG
  );
  it(
    'critère 2: the agent copy stops (CODE_COPIE), its log names the submodule, no build runs',
    () => {
      const m = monde();
      m.perdreSource();
      const r = m.lancer();
      expect(r.status).toBe(CODE_COPIE);
      expect(r.stderr).toMatch(/⛔/);
      expect(readFileSync(`${m.copies.agent}.log`, 'utf8')).toMatch(/vendor\/natif/);
      expect(m.vus()).toEqual([]);
    },
    LONG
  );
  it(
    'critère 2: the night stops red, its log names the submodule, no build or test runs',
    () => {
      const m = monde();
      m.perdreSource();
      const r = m.nuit();
      expect(r.status).not.toBe(0);
      expect(m.journalNuit()).toMatch(/vendor\/natif/);
      expect(m.vus()).toEqual([]);
    },
    LONG
  );
});

describe('critère 3 — a reused integration copy puts its submodules back at HEAD', () => {
  it(
    'critère 3: after main moves the submodule to v2, the reused copy holds v2',
    () => {
      const m = monde();
      expect(m.integrer().status).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('v1');
      m.avancerNatif();
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('v2');
      expect(m.vus().at(-1)).toBe('v2');
    },
    LONG
  );
  it(
    'critère 3: a reused copy whose submodule was moved by hand goes back to the commit of HEAD',
    () => {
      const m = monde();
      expect(m.integrer().status).toBe(0);
      const sous = path.join(m.copies.integration, 'vendor/natif');
      git(sous, 'checkout', '-q', m.commits[1] ?? '');
      expect(m.natifDe(m.copies.integration)).toBe('v2');
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('v1');
    },
    LONG
  );
});

describe('critère 4 — without .gitmodules, nothing changes', () => {
  it(
    'critère 4: the integration commits a lot in a repository without submodules',
    () => {
      const m = monde(false);
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(existsSync(path.join(m.copies.integration, '.gitmodules'))).toBe(false);
    },
    LONG
  );
  // The agent copy runs its agent in a real envelope: without bwrap, the test skips.
  it.runIf(canWrap)(
    'critère 4: the agent copy is prepared in a repository without submodules',
    () => {
      const m = monde(false);
      const r = m.lancer();
      expect(r.status).not.toBe(CODE_COPIE);
      expect(readFileSync(`${m.copies.agent}.log`, 'utf8')).not.toMatch(/⛔/);
      expect(m.vus()).toEqual(['absent']);
    },
    LONG
  );
  it(
    'critère 4: the night plays a repository without submodules',
    () => {
      const m = monde(false);
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.journalNuit()).toMatch(/✓ vert/);
      // The build, then the test: both ran.
      expect(m.vus()).toEqual(['absent', 'absent']);
    },
    LONG
  );
});

describe('critère 9 — a reused agent or night copy puts its submodules back at HEAD, by the same preparation', () => {
  it(
    'critère 9: after main moves the submodule to v2, the reused agent copy holds v2 before its build',
    () => {
      const m = monde();
      m.lancer();
      expect(m.natifDe(m.copies.agent)).toBe('v1');
      m.avancerNatif();
      const r = m.lancer();
      expect(r.status).not.toBe(CODE_COPIE);
      expect(m.natifDe(m.copies.agent)).toBe('v2');
      expect(m.vus().at(-1)).toBe('v2');
    },
    LONG
  );
  it(
    'critère 9: after main moves the submodule to v2, the reused night copy holds v2 before its build',
    () => {
      const m = monde();
      expect(m.nuit().status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('v1');
      m.avancerNatif();
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('v2');
      expect(m.vus().at(-1)).toBe('v2');
    },
    LONG
  );
  it(
    'critère 9: a reused night copy whose submodule was moved by hand goes back to the commit of HEAD',
    () => {
      const m = monde();
      expect(m.nuit().status, m.journalNuit()).toBe(0);
      git(path.join(m.copies.nuit, 'vendor/natif'), 'checkout', '-q', m.commits[1] ?? '');
      expect(m.natifDe(m.copies.nuit)).toBe('v2');
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('v1');
      expect(m.vus().at(-1)).toBe('v1');
    },
    LONG
  );
});

// A local modification in the submodule of a copy: its tracked file edited, not committed.
const modifierNatif = (copie: string, texte: string) =>
  writeFileSync(path.join(copie, 'vendor/natif/natif.txt'), `${texte}\n`);

describe('critère 10 — a local modification in a submodule: overwritten in the disposable copies, kept in the agent copy', () => {
  it(
    'critère 10: the reused integration copy overwrites it and builds at the commit of HEAD',
    () => {
      const m = monde();
      expect(m.integrer().status).toBe(0);
      modifierNatif(m.copies.integration, 'local');
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('v1');
      expect(m.vus().at(-1)).toBe('v1');
    },
    LONG
  );
  it(
    'critère 10: the reused night copy overwrites it and plays the commit of HEAD',
    () => {
      const m = monde();
      expect(m.nuit().status, m.journalNuit()).toBe(0);
      modifierNatif(m.copies.nuit, 'local');
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('v1');
      expect(m.vus().at(-1)).toBe('v1');
    },
    LONG
  );
  it(
    'critère 10: the agent copy stops (CODE_COPIE), its log names the submodule, the work stays, no build runs',
    () => {
      const m = monde();
      m.lancer();
      const avant = m.vus().length;
      modifierNatif(m.copies.agent, 'travail');
      const r = m.lancer();
      expect(r.status).toBe(CODE_COPIE);
      expect(r.stderr).toMatch(/⛔/);
      expect(readFileSync(`${m.copies.agent}.log`, 'utf8')).toMatch(/vendor\/natif/);
      expect(m.natifDe(m.copies.agent)).toBe('travail');
      expect(m.vus()).toHaveLength(avant);
    },
    LONG
  );
  it(
    'critère 10: the agent copy stops on its submodule work even when main moved the submodule',
    () => {
      const m = monde();
      m.lancer();
      const avant = m.vus().length;
      modifierNatif(m.copies.agent, 'travail');
      m.avancerNatif();
      const r = m.lancer();
      expect(r.status).toBe(CODE_COPIE);
      expect(readFileSync(`${m.copies.agent}.log`, 'utf8')).toMatch(/vendor\/natif/);
      expect(m.natifDe(m.copies.agent)).toBe('travail');
      expect(m.vus()).toHaveLength(avant);
    },
    LONG
  );
});

// grillhouse-3uv.52: a submodule at a local address. git refuses the file transport to submodule
// commands by default (CVE-2022-39253); the preparation allows it on its submodule command only,
// as `git -c protocol.file.allow=always submodule update …` does.
describe('grillhouse-3uv.52 critère 1 — a submodule at a local address is set in each copy', () => {
  it(
    'critère 1 (3uv.52): a file:// URL is set in the agent copy at the referenced commit',
    () => {
      const m = monde(true, 'file');
      const r = m.lancer();
      expect(r.status, r.stderr).not.toBe(CODE_COPIE);
      expect(m.natifDe(m.copies.agent)).toBe('v1');
      expect(m.vus()[0]).toBe('v1');
    },
    LONG
  );
  it(
    'critère 1 (3uv.52): a path relative to the superproject is set in the night copy at the referenced commit',
    () => {
      const m = monde(true, 'relative');
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('v1');
      expect(m.vus()[0]).toBe('v1');
    },
    LONG
  );
  it(
    'critère 1 (3uv.52): a nested submodule at a local address is set in the integration copy',
    () => {
      const m = monde(true, 'absolue', true);
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('v1');
      const profond = path.join(m.copies.integration, 'vendor/natif/profond/profond.txt');
      expect(existsSync(profond) ? readFileSync(profond, 'utf8').trim() : 'absent').toBe('p1');
    },
    LONG
  );
});

describe('grillhouse-3uv.52 critère 2 — the file transport is allowed on the submodule command only', () => {
  // The places a lasting allowance would live: the repository, each copy, each submodule and
  // nested submodule of a copy (their own configuration), and the global configuration.
  const AUTRE = 'demo-2';
  const sansAutorisationDurable = (m: ReturnType<typeof monde>, agent: string) => {
    const lieux = [m.repo];
    const copies = { ...m.copies, agent: path.join(m.repo, '.claude/worktrees', agent) };
    for (const copie of Object.values(copies)) {
      lieux.push(copie, path.join(copie, 'vendor/natif'), path.join(copie, 'vendor/natif/profond'));
    }
    for (const lieu of lieux) {
      expect(existsSync(lieu), lieu).toBe(true);
      const r = gitScripts(lieu, 'config', '--show-origin', '--get-regexp', '^protocol\\.');
      expect(r.stdout, lieu).toBe('');
    }
    expect(readFileSync(CONFIG_GLOBALE, 'utf8')).not.toMatch(/protocol/i);
    return lieux.length;
  };
  it(
    'critère 2 (3uv.52): after the three copies set their submodules, no configuration carries the allowance',
    () => {
      const m = monde(true, 'absolue', true);
      const i = m.integrer();
      expect(i.status, i.stdout + i.stderr).toBe(0);
      // The integration puts agent/demo-1 in the queue, and a ticket whose branch is in the queue
      // is not launched again (grillhouse-3uv.63 critère 23): the agent copy is another ticket's.
      expect(m.lancer(AUTRE).status).not.toBe(CODE_COPIE);
      expect(m.nuit().status, m.journalNuit()).toBe(0);
      expect(sansAutorisationDurable(m, AUTRE)).toBe(10);
    },
    LONG * 2
  );
  it(
    'critère 2 (3uv.52): of the git commands the copies run, only the submodule update carries the allowance',
    () => {
      const m = monde(true, 'absolue', true);
      // A git first on the PATH of the scripts notes each command it receives, and whether it
      // carries a file transport allowance (by -c, by GIT_CONFIG_*, or by GIT_ALLOW_PROTOCOL).
      const vrai = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      const journal = path.join(m.bin, 'git.log');
      writeFileSync(
        path.join(m.bin, 'git'),
        `#!/bin/sh
a=0
case " $* " in *protocol.allow=*|*protocol.file.allow=*) a=1;; esac
case "\${GIT_CONFIG_PARAMETERS:-}" in *protocol.*allow*) a=1;; esac
env | grep -q '^GIT_CONFIG_KEY_[0-9]*=protocol\\.' && a=1
[ -n "\${GIT_ALLOW_PROTOCOL+x}" ] && a=1
printf '%s\\t%s\\n' "$a" "$*" >> ${JSON.stringify(journal)}
exec ${JSON.stringify(vrai)} "$@"
`,
        { mode: 0o755 }
      );
      const i1 = m.integrer();
      expect(i1.status, i1.stdout + i1.stderr).toBe(0);
      expect(m.integrer().status).toBe(0);
      // The integrations put agent/demo-1 in the queue, and a ticket whose branch is in the queue
      // is not launched again (grillhouse-3uv.63 critère 23): the agent copy, created then
      // reused, is another ticket's.
      expect(m.lancer(AUTRE).status).not.toBe(CODE_COPIE);
      expect(m.lancer(AUTRE).status).not.toBe(CODE_COPIE);
      expect(m.nuit().status, m.journalNuit()).toBe(0);
      const commandes = readFileSync(journal, 'utf8')
        .trim()
        .split('\n')
        .map(l => {
          const [a, ...args] = l.split('\t');
          return { autorise: a === '1', args: args.join('\t') };
        });
      const pose = (args: string) => /\bsubmodule\b.*\bupdate\b/.test(args);
      // The note sees the commands of the copies: the poses, and the others.
      expect(commandes.filter(c => pose(c.args)).length).toBeGreaterThanOrEqual(5);
      expect(commandes.filter(c => !pose(c.args)).length).toBeGreaterThan(0);
      expect(commandes.filter(c => c.autorise && !pose(c.args)).map(c => c.args)).toEqual([]);
      expect(commandes.filter(c => !c.autorise && pose(c.args)).map(c => c.args)).toEqual([]);
    },
    LONG * 2
  );
});

// grillhouse-3uv.58.1: a submodule the project declares shared (`grillhouse.partage`, a list of
// submodule paths in the package.json of the copy) is not set in a copy: the copy reads the
// submodule of the main repository at its usual path, by a symbolic link marked « ignored in the
// copy » (skip-worktree). The integration and the night play the project's commands under a
// read-only mount (bwrap) of each shared submodule of the main repository; the envelope of an
// agent already shows the main repository read-only. The world is the one above, vendor/natif
// declared shared (`partage: null`: no declaration); `autre` adds a second submodule, vendor/autre,
// never shared; `ecritures` makes
// each command of the project try to write into vendor/natif and into the copy, and note the
// outcome in the copy's ecritures.log (« <step> <outcome in the submodule> <outcome in the copy> »).
const PARTAGE_ECRITURE = `import fs from 'node:fs';
const etape = process.argv[2];
const essai = f => { try { fs.writeFileSync(f, etape + '\\n'); return 'ok'; } catch (e) { return e.code ?? 'refus'; } };
const dansSousModule = essai('vendor/natif/' + etape + '.txt');
const dansCopie = essai('copie-' + etape + '.txt');
fs.appendFileSync('ecritures.log', [etape, dansSousModule, dansCopie].join(' ') + '\\n');
`;
// The lines of ecritures.log whose step wrote into the shared submodule, or failed to write into its copy.
const ecrituresFautives = (vues: string[]) => vues.filter(l => !/^\S+ (?!ok )\S+ ok$/.test(l));
// The package.json of the test repository, as the tests rewrite it.
type Paquet = Record<string, unknown> & { grillhouse?: Record<string, unknown> };
function mondePartage({
  partage = ['vendor/natif'] as unknown,
  autre = false,
  ecritures = false,
  imbrique = false,
  adresse = 'absolue' as Adresse,
} = {}) {
  const m = monde(true, adresse, imbrique);
  const autreCommits: string[] = [];
  if (autre) {
    const depot = mkdtempSync(path.join(ESSAIS, 'autre-'));
    git(depot, 'init', '-q');
    for (const v of ['a1', 'a2']) {
      writeFileSync(path.join(depot, 'autre.txt'), `${v}\n`);
      git(depot, 'add', '.');
      git(depot, 'commit', '-qm', v);
      autreCommits.push(git(depot, 'rev-parse', 'HEAD').trim());
    }
    git(m.repo, 'submodule', 'add', '-q', depot, 'vendor/autre');
    git(path.join(m.repo, 'vendor/autre'), 'checkout', '-q', autreCommits[0] ?? '');
    git(m.repo, 'add', 'vendor/autre');
  }
  const pkgPath = path.join(m.repo, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet;
  if (partage !== null) {
    pkg.grillhouse = { partage };
  }
  if (ecritures) {
    writeFileSync(path.join(m.repo, 'ecrire.mjs'), PARTAGE_ECRITURE);
    mkdirSync(path.join(m.repo, 'dep'));
    writeFileSync(path.join(m.repo, 'dep/package.json'), '{"name":"dep","version":"1.0.0"}\n');
    pkg.version = '1.0.0';
    pkg.dependencies = { dep: 'file:dep' };
    pkg.scripts = {
      postinstall: 'node ecrire.mjs installation',
      build: 'node build.mjs && node ecrire.mjs construction',
      test: 'node ecrire.mjs tests && node suites.mjs',
      'integration:gardes': 'node ecrire.mjs gardes',
      nocturne: 'node ecrire.mjs nuit',
    };
    // `complet`: the integration replays its suites for a lot of documents too.
    pkg.grillhouse = { ...pkg.grillhouse, nuit: 'nocturne', integration: 'complet' };
    writeFileSync(
      path.join(m.repo, 'package-lock.json'),
      JSON.stringify({
        name: 't',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': {
            name: 't',
            version: '1.0.0',
            hasInstallScript: true,
            dependencies: { dep: 'file:dep' },
          },
          dep: { version: '1.0.0' },
          'node_modules/dep': { resolved: 'dep', link: true },
        },
      })
    );
  }
  writeFileSync(pkgPath, JSON.stringify(pkg));
  git(m.repo, 'add', '.');
  git(m.repo, 'commit', '-q', '--allow-empty', '-m', 'partage');
  const principalNatif = path.join(m.repo, 'vendor/natif');
  // A fresh copy, as git creates it: detached on HEAD, its submodule paths empty folders.
  const copieFraiche = (nom: string) => {
    const dir = path.join(m.repo, '.claude/worktrees', nom);
    git(m.repo, 'worktree', 'add', '-q', '--detach', dir, 'HEAD');
    return dir;
  };
  const poser = (copie: string) =>
    spawnSync('bash', [POSE, 'pose', copie], { encoding: 'utf8', env: ENV_SCRIPTS });
  const garder = (copie: string) =>
    spawnSync('bash', [POSE, 'garde', copie], { encoding: 'utf8', env: ENV_SCRIPTS });
  // The build of the copy, run in it as the project runs it: it notes what it read (`vus`).
  const construire = (copie: string) =>
    spawnSync('node', ['build.mjs'], { cwd: copie, encoding: 'utf8', env: ENV_SCRIPTS });
  // A reused copy moved onto the HEAD of the main repository, by the very commands of its caller,
  // then prepared again by the common preparation. Without bwrap, lancer.sh and the integration
  // refuse a copy with a shared submodule (critères 13 and 15): these tests of the preparation run
  // on every machine.
  const tete = () => git(m.repo, 'rev-parse', 'HEAD').trim();
  // As lancer.sh does for the agent copy: the guard, then a fast-forward merge with autostash.
  const avancerCommeLAgent = (copie: string) => {
    const g = garder(copie);
    expect(g.status, g.stderr).toBe(0);
    git(copie, 'merge', '-q', '--ff-only', '--autostash', tete());
    return poser(copie);
  };
  // As the integration does for its copy: detached on HEAD, forced, every untracked file removed.
  const avancerCommeLIntegration = (copie: string) => {
    git(copie, 'checkout', '-q', '--detach', '--force', tete());
    git(copie, 'clean', '-q', '-f', '-d', '-x', '-e', 'node_modules');
    return poser(copie);
  };
  // The copy reads the main repository's submodule: its path is a symbolic link to it.
  const lit = (copie: string, chemin = 'vendor/natif') => {
    const p = path.join(copie, chemin);
    return (
      existsSync(p) &&
      lstatSync(p).isSymbolicLink() &&
      realpathSync(p) === realpathSync(path.join(m.repo, chemin))
    );
  };
  const etat = (copie: string) => ({
    status: git(copie, 'status', '--porcelain'),
    complet: git(copie, 'status', '--porcelain', '--ignore-submodules=none'),
  });
  // An untracked file in the main repository's submodule: the supervisor's work in progress.
  const nonSuivi = path.join(principalNatif, 'principal-non-suivi.txt');
  writeFileSync(nonSuivi, 'travail du principal\n');
  const ecrituresDe = (copie: string) => {
    const f = path.join(copie, 'ecritures.log');
    return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n') : [];
  };
  // The files a copy's commands managed to write into the main repository's submodule.
  const intrus = () =>
    readdirSync(principalNatif).filter(f =>
      /^(installation|construction|tests|gardes|nuit|agent)\.txt$/.test(f)
    );
  return {
    ...m,
    autreCommits,
    principalNatif,
    copieFraiche,
    poser,
    garder,
    construire,
    avancerCommeLAgent,
    avancerCommeLIntegration,
    lit,
    etat,
    nonSuivi,
    ecrituresDe,
    intrus,
  };
}

describe('grillhouse-3uv.58.1 critères 1 et 7 — a shared submodule is read from the main repository', () => {
  it(
    'critère 7: the preparation of a fresh copy links each path of grillhouse.partage to the same path of the main repository, marked skip-worktree',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(git(copie, 'ls-files', '-v', '--', 'vendor/natif')).toMatch(/^S vendor\/natif$/m);
      // What the copy reads is the main repository's submodule, its untracked file included.
      expect(existsSync(path.join(copie, 'vendor/natif/principal-non-suivi.txt'))).toBe(true);
    },
    LONG
  );
  it(
    'critère 1: a prepared copy reads the main repository’s submodule at its usual path, and its build sees it',
    () => {
      const m = mondePartage();
      // The main repository's submodule is checked out at v2; HEAD references v1.
      git(m.principalNatif, 'checkout', '-q', m.commits[1] ?? '');
      const copie = m.copieFraiche('demo-1');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      const b = m.construire(copie);
      expect(b.status, b.stderr).toBe(0);
      expect(m.vus()).toEqual(['v2']);
    },
    LONG
  );
  it(
    'critère 1: a reused integration copy whose submodule was set gets the link once main declares it shared',
    () => {
      const m = mondePartage({ partage: null });
      const copie = m.copieFraiche('integration');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(false);
      expect(m.natifDe(copie)).toBe('v1');
      const pkgPath = path.join(m.repo, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet;
      writeFileSync(pkgPath, JSON.stringify({ ...pkg, grillhouse: { partage: ['vendor/natif'] } }));
      git(m.repo, 'commit', '-qm', 'partage déclaré', '--', 'package.json');
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.etat(copie).complet).toBe('');
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 2 — git status of the copy does not report the shared submodule', () => {
  it(
    'critère 2: git status of a prepared copy stays silent, even when the main repository’s submodule carries work',
    () => {
      const m = mondePartage();
      writeFileSync(path.join(m.principalNatif, 'natif.txt'), 'modifié dans le principal\n');
      const copie = m.copieFraiche('muette');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.etat(copie)).toEqual({ status: '', complet: '' });
      expect(git(copie, 'diff', '--stat')).toBe('');
    },
    LONG
  );
  it(
    'critère 2: the guard lets through a copy whose shared submodule is linked, and the reused copy builds again',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('demo-1');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.construire(copie).status).toBe(0);
      const g = m.garder(copie);
      expect(g.status, g.stderr).toBe(0);
      // Reused as lancer.sh reuses the agent copy: the guard, the move onto HEAD, the preparation.
      const r = m.avancerCommeLAgent(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      const b = m.construire(copie);
      expect(b.status, b.stderr).toBe(0);
      expect(m.vus()).toEqual(['v1', 'v1']);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 3 — a write into a shared submodule from an agent copy fails', () => {
  // The agent's session is a script of the repository, run inside the real envelope: it reads the
  // shared submodule, then tries to write into it and into the copy.
  it.runIf(canWrap)(
    'critère 3: inside the envelope, the agent reads the shared submodule and its write into it fails; its write into the copy succeeds',
    () => {
      const m = mondePartage();
      writeFileSync(
        path.join(m.repo, 'agent.sh'),
        `#!/bin/sh
lu=$(cat vendor/natif/natif.txt 2>/dev/null || echo illisible)
if echo agent > vendor/natif/agent.txt 2>/dev/null; then s=ok; else s=refus; fi
if echo agent > copie-agent.txt 2>/dev/null; then c=ok; else c=refus; fi
echo "agent $s $c $lu" >> ecritures.log
`,
        { mode: 0o755 }
      );
      git(m.repo, 'add', 'agent.sh');
      git(m.repo, 'commit', '-qm', 'agent');
      const consigne = path.join(m.bin, 'consigne.txt');
      // A home of its own: the session state is read and written there, never in the real one.
      const maison = mkdtempSync(path.join(ESSAIS, 'maison-'));
      mkdirSync(path.join(maison, '.claude/projects'), { recursive: true });
      writeFileSync(path.join(maison, '.claude/settings.json'), '{}');
      writeFileSync(path.join(maison, '.claude.json'), '{}');
      const r = spawnSync('bash', [LANCER, 'demo-1', 'developpeur', 'packages/a', consigne], {
        cwd: m.repo,
        encoding: 'utf8',
        env: {
          ...ENV_SCRIPTS,
          HOME: maison,
          PATH: `${m.bin}:${process.env.PATH}`,
          CLAUDE_BIN: path.join(m.copies.agent, 'agent.sh'),
        },
      });
      expect(r.status, r.stderr + readFileSync(`${m.copies.agent}.log`, 'utf8')).toBe(0);
      expect(m.ecrituresDe(m.copies.agent)).toEqual(['agent refus ok v1']);
      expect(m.intrus()).toEqual([]);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 4 — a submodule not declared shared keeps the behaviour of 3uv.52', () => {
  it(
    'critère 4: with vendor/natif shared and vendor/autre not, the copy links vendor/natif and sets its own vendor/autre at the commit of HEAD',
    () => {
      const m = mondePartage({ autre: true });
      // The main repository's vendor/autre is moved to a2; HEAD references a1.
      git(path.join(m.repo, 'vendor/autre'), 'checkout', '-q', m.autreCommits[1] ?? '');
      const copie = m.copieFraiche('melange');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      const autre = path.join(copie, 'vendor/autre');
      expect(lstatSync(autre).isSymbolicLink()).toBe(false);
      expect(readFileSync(path.join(autre, 'autre.txt'), 'utf8')).toBe('a1\n');
      expect(git(autre, 'rev-parse', 'HEAD').trim()).toBe(m.autreCommits[0]);
      expect(git(path.join(m.repo, 'vendor/autre'), 'rev-parse', 'HEAD').trim()).toBe(
        m.autreCommits[1]
      );
      expect(m.etat(copie).complet).toBe('');
    },
    LONG
  );
  it(
    'critère 4: a copy whose shared submodule was linked sets its own submodule at the commit of HEAD once main no longer declares it shared',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('demo-1');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      git(m.principalNatif, 'checkout', '-q', m.commits[1] ?? '');
      const pkgPath = path.join(m.repo, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet;
      delete pkg.grillhouse;
      writeFileSync(pkgPath, JSON.stringify(pkg));
      git(m.repo, 'commit', '-qm', 'partage retiré', '--', 'package.json');
      const r = m.avancerCommeLAgent(copie);
      expect(r.status, r.stderr).toBe(0);
      const sous = path.join(copie, 'vendor/natif');
      expect(lstatSync(sous).isSymbolicLink()).toBe(false);
      expect(m.natifDe(copie)).toBe('v1');
      expect(git(copie, 'ls-files', '-v', '--', 'vendor/natif')).toMatch(/^H vendor\/natif$/m);
      expect(m.etat(copie).complet).toBe('');
      // The main repository's submodule is left as it was.
      expect(git(m.principalNatif, 'rev-parse', 'HEAD').trim()).toBe(m.commits[1]);
      expect(existsSync(m.nonSuivi)).toBe(true);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 5 — removing a copy never touches the main repository’s submodule', () => {
  // The main repository's submodule as the supervisor sees it: its commit, its files, its state.
  const principal = (m: ReturnType<typeof mondePartage>) => ({
    commit: git(m.principalNatif, 'rev-parse', 'HEAD'),
    status: git(m.principalNatif, 'status', '--porcelain', '--untracked-files=all'),
    fichiers: readdirSync(m.principalNatif)
      .filter(f => f !== '.git')
      .sort()
      .map(f => `${f}=${readFileSync(path.join(m.principalNatif, f), 'utf8')}`),
  });
  for (const jetable of [false, true]) {
    it(
      `critère 5: retirer-copie.sh${jetable ? ' --jetable' : ''} removes a copy that links the shared submodule, and the main repository’s submodule stays intact`,
      () => {
        const m = mondePartage();
        const copie = m.copieFraiche('demo-1');
        expect(m.poser(copie).status).toBe(0);
        expect(m.lit(copie)).toBe(true);
        const avant = principal(m);
        const r = spawnSync('bash', [RETIRER, ...(jetable ? ['--jetable'] : []), copie], {
          cwd: m.repo,
          encoding: 'utf8',
          env: ENV_SCRIPTS,
        });
        expect(r.status, r.stderr).toBe(0);
        expect(existsSync(copie)).toBe(false);
        expect(principal(m)).toEqual(avant);
        expect(avant.fichiers).toContain('principal-non-suivi.txt=travail du principal\n');
      },
      LONG
    );
  }
});

describe('grillhouse-3uv.58.1 critère 8 — the integration and the night play the project’s commands with the shared submodule read-only', () => {
  it.runIf(canWrap)(
    'critère 8: in the integration, installation, build, tests and guards fail to write into the shared submodule and write into their copy',
    () => {
      const m = mondePartage({ ecritures: true });
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.lit(m.copies.integration)).toBe(true);
      const vues = m.ecrituresDe(m.copies.integration);
      for (const e of ['installation', 'construction', 'tests', 'gardes']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, vues.join('\n')).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(m.intrus()).toEqual([]);
    },
    LONG
  );
  it.runIf(canWrap)(
    'critère 8: in the night, installation, build, tests and the project’s night script fail to write into the shared submodule and write into their copy',
    () => {
      const m = mondePartage({ ecritures: true });
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.lit(m.copies.nuit)).toBe(true);
      const vues = m.ecrituresDe(m.copies.nuit);
      for (const e of ['installation', 'construction', 'tests', 'nuit']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, vues.join('\n')).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(m.intrus()).toEqual([]);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 9 — the preparation never enters a shared submodule', () => {
  it(
    'critère 9: preparing a copy neither moves the main repository’s submodule nor removes its untracked file',
    () => {
      const m = mondePartage();
      git(m.principalNatif, 'checkout', '-q', m.commits[1] ?? '');
      const copie = m.copieFraiche('sans-entrer');
      expect(m.poser(copie).status).toBe(0);
      // A second preparation of the same copy, its link in place.
      expect(m.poser(copie).status).toBe(0);
      expect(git(m.principalNatif, 'rev-parse', 'HEAD').trim()).toBe(m.commits[1]);
      expect(existsSync(m.nonSuivi)).toBe(true);
      expect(m.natifDe(copie)).toBe('v2');
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 10 — when moving a copy forward changes the shared submodule’s commit, the next preparation puts the link back', () => {
  it(
    'critère 10: a reused agent copy, moved forward as lancer.sh moves it onto a commit that moves the shared submodule, links it again and git status stays silent',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('demo-1');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      m.avancerNatif();
      const r = m.avancerCommeLAgent(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.etat(copie)).toEqual({ status: '', complet: '' });
      expect(m.construire(copie).status).toBe(0);
      expect(m.vus()).toEqual(['v2']);
    },
    LONG
  );
  it(
    'critère 10: a reused integration copy, put as the integration puts it on a commit that moves the shared submodule, links it again and git status stays silent',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('integration');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      m.avancerNatif();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.etat(copie)).toEqual({ status: '', complet: '' });
      expect(m.construire(copie).status).toBe(0);
      expect(m.vus()).toEqual(['v2']);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 11 — a malformed grillhouse.partage, or a path that is not a submodule, stops the preparation', () => {
  // Each faulty declaration, and the part of its value the first line of the refusal cites (null:
  // the key alone is required, the value having no printable token of its own).
  const fautives: { cas: string; partage: unknown; cite: string | null }[] = [
    { cas: 'a string, not a list', partage: 'vendor/natif', cite: 'vendor/natif' },
    { cas: 'an object, not a list', partage: { chemin: 'vendor/natif' }, cite: 'vendor/natif' },
    { cas: 'an empty path', partage: [''], cite: null },
    { cas: 'an element that is not a string', partage: [42], cite: '42' },
    { cas: 'an absolute path', partage: ['/vendor/natif'], cite: '/vendor/natif' },
    { cas: 'a path that leaves the repository', partage: ['../dehors'], cite: '../dehors' },
    {
      cas: 'a path that leaves the repository through its middle',
      partage: ['vendor/../../dehors'],
      cite: 'vendor/../../dehors',
    },
    {
      cas: 'a tracked folder that is not a submodule',
      partage: ['packages/a'],
      cite: 'packages/a',
    },
    { cas: 'an unknown path', partage: ['vendor/inconnu'], cite: 'vendor/inconnu' },
    {
      cas: 'a valid path next to an unknown one',
      partage: ['vendor/natif', 'vendor/inconnu'],
      cite: 'vendor/inconnu',
    },
  ];
  for (const f of fautives) {
    it(
      `critère 11: ${f.cas} — the preparation refuses, exit 1, its first line cites grillhouse.partage, and nothing is set`,
      () => {
        const m = mondePartage({ partage: f.partage, autre: true });
        const copie = m.copieFraiche('mal-formee');
        const r = m.poser(copie);
        expect(r.status, r.stderr).toBe(1);
        const premiere = r.stderr.split('\n')[0] ?? '';
        expect(premiere).toContain('grillhouse.partage');
        if (f.cite !== null) {
          expect(premiere).toContain(f.cite);
        }
        // Nothing is set: neither the shared candidate nor the other submodule.
        const natif = path.join(copie, 'vendor/natif');
        expect(lstatSync(natif).isSymbolicLink()).toBe(false);
        expect(readdirSync(natif)).toEqual([]);
        expect(readdirSync(path.join(copie, 'vendor/autre'))).toEqual([]);
      },
      LONG
    );
  }
  for (const [cas, partage] of [
    ['an absent key', null],
    ['an empty list', []],
  ] as const) {
    it(
      `critère 11: ${cas} shares nothing — each submodule is set in the copy at the commit of HEAD`,
      () => {
        const m = mondePartage({ partage, autre: true });
        git(m.principalNatif, 'checkout', '-q', m.commits[1] ?? '');
        const copie = m.copieFraiche('rien-de-partage');
        const r = m.poser(copie);
        expect(r.status, r.stderr).toBe(0);
        expect(lstatSync(path.join(copie, 'vendor/natif')).isSymbolicLink()).toBe(false);
        expect(m.natifDe(copie)).toBe('v1');
        expect(readFileSync(path.join(copie, 'vendor/autre/autre.txt'), 'utf8')).toBe('a1\n');
      },
      LONG
    );
  }
});

describe('grillhouse-3uv.58.1 critère 12 — a shared submodule absent or not initialized in the main repository stops the preparation', () => {
  // The main repository's submodule not initialized (an empty folder, as after a clone without
  // --recurse-submodules), or its folder absent.
  const etats = {
    'not initialized': (dir: string) => {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir);
    },
    absent: (dir: string) => rmSync(dir, { recursive: true, force: true }),
  };
  for (const [cas, defaire] of Object.entries(etats)) {
    it(
      `critère 12: ${cas} in the main repository — the preparation refuses, exit 1, its first line names it, and never sets it in the copy`,
      () => {
        const m = mondePartage();
        const copie = m.copieFraiche('sans-principal');
        defaire(m.principalNatif);
        const r = m.poser(copie);
        expect(r.status, r.stderr).toBe(1);
        expect(r.stderr.split('\n')[0]).toContain('vendor/natif');
        // No fallback: the copy holds no submodule of its own at that path.
        const natif = path.join(copie, 'vendor/natif');
        expect(existsSync(path.join(natif, 'natif.txt'))).toBe(false);
        expect(existsSync(path.join(natif, '.git'))).toBe(false);
      },
      LONG
    );
  }
  it(
    'critère 12: the integration refuses the lot, naming the shared submodule, and no command of the project runs',
    () => {
      const m = mondePartage();
      etats['not initialized'](m.principalNatif);
      const tete = git(m.repo, 'rev-parse', 'HEAD');
      const r = m.integrer();
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/⛔[^\n]*vendor\/natif/);
      expect(m.vus()).toEqual([]);
      expect(git(m.repo, 'rev-parse', 'HEAD')).toBe(tete);
      expect(existsSync(path.join(m.copies.integration, 'vendor/natif/.git'))).toBe(false);
    },
    LONG
  );
});

// A PATH where bwrap is not found: each folder of the PATH that holds a bwrap is replaced by a
// folder of links to its other programs.
function pathSansBwrap(): string {
  return (process.env.PATH ?? '')
    .split(':')
    .filter(d => d !== '')
    .map(d => {
      if (!existsSync(path.join(d, 'bwrap'))) {
        return d;
      }
      const miroir = mkdtempSync(path.join(ESSAIS, 'sans-bwrap-'));
      for (const f of readdirSync(d)) {
        if (f !== 'bwrap') {
          symlinkSync(path.join(d, f), path.join(miroir, f));
        }
      }
      return miroir;
    })
    .join(':');
}
// A bwrap the machine refuses: found, and failing as when its namespaces are denied.
function pathBwrapRefuse(): string {
  const d = mkdtempSync(path.join(ESSAIS, 'bwrap-refuse-'));
  writeFileSync(
    path.join(d, 'bwrap'),
    '#!/bin/sh\necho "bwrap: setting up uid map: Permission denied" >&2\nexit 1\n',
    { mode: 0o755 }
  );
  return `${d}:${process.env.PATH ?? ''}`;
}

describe('grillhouse-3uv.58.1 critère 13 — without a possible mount, a declared shared submodule stops the integration and the night', () => {
  const machines = { 'bwrap absent': pathSansBwrap, 'bwrap refused': pathBwrapRefuse };
  for (const [cas, chemin] of Object.entries(machines)) {
    it(
      `critère 13: ${cas} — the integration refuses the lot and says so, no command of the project runs`,
      () => {
        const m = mondePartage();
        const tete = git(m.repo, 'rev-parse', 'HEAD');
        const r = m.integrer({ PATH: `${m.bin}:${chemin()}` });
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stdout).toMatch(/⛔[^\n]*(bwrap|montage)/i);
        expect(m.vus()).toEqual([]);
        expect(git(m.repo, 'rev-parse', 'HEAD')).toBe(tete);
      },
      LONG
    );
    it(
      `critère 13: ${cas} — the night turns red and says so, no command of the project runs`,
      () => {
        const m = mondePartage();
        const r = m.nuit({ PATH: `${m.bin}:${chemin()}` });
        expect(r.status, m.journalNuit()).not.toBe(0);
        expect(m.journalNuit()).toMatch(/bwrap|montage/i);
        expect(m.journalNuit()).not.toMatch(/✓ vert/);
        expect(m.vus()).toEqual([]);
      },
      LONG
    );
  }
  it(
    'critère 13: bwrap absent and nothing declared shared — the integration commits and the night plays green, as before',
    () => {
      const m = mondePartage({ partage: null });
      const ailleurs = { PATH: `${m.bin}:${pathSansBwrap()}` };
      const i = m.integrer(ailleurs);
      expect(i.status, i.stdout + i.stderr).toBe(0);
      expect(i.stdout).toMatch(/✓ commit/);
      const n = m.nuit(ailleurs);
      expect(n.status, m.journalNuit()).toBe(0);
      expect(m.journalNuit()).toMatch(/✓ vert/);
    },
    LONG * 2
  );
});

describe('grillhouse-3uv.58.1 critère 14 — a submodule nested in a shared submodule belongs to the main repository', () => {
  it(
    'critère 14: preparing a copy, then preparing it again, neither sets nor cleans the nested submodule of the main repository',
    () => {
      const m = mondePartage({ imbrique: true });
      // The main repository's nested submodule: moved to a commit of its own, a tracked file
      // edited, an untracked file — the supervisor's work.
      const profond = path.join(m.principalNatif, 'profond');
      writeFileSync(path.join(profond, 'profond.txt'), 'p2\n');
      git(profond, 'commit', '-qam', 'p2');
      const p2 = git(profond, 'rev-parse', 'HEAD').trim();
      writeFileSync(path.join(profond, 'profond.txt'), 'en cours\n');
      const nonSuiviProfond = path.join(profond, 'profond-non-suivi.txt');
      writeFileSync(nonSuiviProfond, 'travail du principal\n');
      const copie = m.copieFraiche('imbrique');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.poser(copie).status).toBe(0);
      expect(git(profond, 'rev-parse', 'HEAD').trim()).toBe(p2);
      expect(readFileSync(path.join(profond, 'profond.txt'), 'utf8')).toBe('en cours\n');
      expect(existsSync(nonSuiviProfond)).toBe(true);
      // The copy reads the nested submodule as the main repository holds it.
      expect(readFileSync(path.join(copie, 'vendor/natif/profond/profond.txt'), 'utf8')).toBe(
        'en cours\n'
      );
      expect(m.etat(copie)).toEqual({ status: '', complet: '' });
    },
    LONG
  );
  it(
    'critère 14: a copy already linked (as a first preparation leaves it) is prepared again without entering the nested submodule of the main repository',
    () => {
      const m = mondePartage({ imbrique: true });
      const profond = path.join(m.principalNatif, 'profond');
      const nonSuiviProfond = path.join(profond, 'profond-non-suivi.txt');
      writeFileSync(nonSuiviProfond, 'travail du principal\n');
      writeFileSync(path.join(profond, 'profond.txt'), 'en cours\n');
      // The state the voie of critère 7 leaves: the link, marked skip-worktree.
      const copie = m.copieFraiche('deja-liee');
      rmSync(path.join(copie, 'vendor/natif'), { recursive: true, force: true });
      symlinkSync(m.principalNatif, path.join(copie, 'vendor/natif'));
      git(copie, 'update-index', '--skip-worktree', 'vendor/natif');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(existsSync(nonSuiviProfond)).toBe(true);
      expect(readFileSync(path.join(profond, 'profond.txt'), 'utf8')).toBe('en cours\n');
      expect(existsSync(m.nonSuivi)).toBe(true);
      expect(m.lit(copie)).toBe(true);
    },
    LONG
  );
});

// The pre-commit hook of the test repository: a command of the project that the commit of the
// integration plays, in the copy; it tries to write into the shared submodule and into the copy.
const poserCrochet = (m: ReturnType<typeof mondePartage>) =>
  writeFileSync(
    path.join(m.repo, '.git/hooks/pre-commit'),
    '#!/bin/sh\nnode ecrire.mjs crochet\nexit 0\n',
    { mode: 0o755 }
  );

// lancer.sh on the copy of the world, with a home of its own (the session state is read and
// written there, never in the real one) and the PATH given.
const lancerChez = (m: ReturnType<typeof mondePartage>, chemin = process.env.PATH ?? '') => {
  const maison = mkdtempSync(path.join(ESSAIS, 'maison-'));
  mkdirSync(path.join(maison, '.claude/projects'), { recursive: true });
  writeFileSync(path.join(maison, '.claude/settings.json'), '{}');
  writeFileSync(path.join(maison, '.claude.json'), '{}');
  return spawnSync(
    'bash',
    [LANCER, 'demo-1', 'developpeur', 'packages/a', path.join(m.bin, 'consigne.txt')],
    {
      cwd: m.repo,
      encoding: 'utf8',
      env: { ...ENV_SCRIPTS, HOME: maison, PATH: `${m.bin}:${chemin}`, CLAUDE_BIN: 'true' },
    }
  );
};

describe('grillhouse-3uv.58.1 critère 15 — every command of the project the frame plays in a linked copy runs under the read-only mount', () => {
  it.runIf(canWrap)(
    'critère 15: the preparation of the agent copy (installation, build, before the envelope) fails to write into the shared submodule and writes into its copy',
    () => {
      const m = mondePartage({ ecritures: true });
      const r = lancerChez(m);
      expect(r.status, r.stderr + readFileSync(`${m.copies.agent}.log`, 'utf8')).toBe(0);
      expect(m.lit(m.copies.agent)).toBe(true);
      const vues = m.ecrituresDe(m.copies.agent);
      for (const e of ['installation', 'construction']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, vues.join('\n')).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(m.intrus()).toEqual([]);
    },
    LONG
  );
  for (const [cas, chemin] of Object.entries({
    'bwrap absent': pathSansBwrap,
    'bwrap refused': pathBwrapRefuse,
  })) {
    it(
      `critère 15: ${cas} — the agent copy is refused, CODE_COPIE, its log saying so, no installation or build runs`,
      () => {
        const m = mondePartage();
        const r = lancerChez(m, chemin());
        const journal = readFileSync(`${m.copies.agent}.log`, 'utf8');
        expect(r.status, r.stderr + journal).toBe(CODE_COPIE);
        expect(journal).toMatch(/bwrap|montage/i);
        expect(m.vus()).toEqual([]);
      },
      LONG
    );
  }
  it.runIf(canWrap)(
    'critère 15: the hook of the integration’s commit fails to write into the shared submodule and writes into its copy',
    () => {
      const m = mondePartage({ ecritures: true });
      poserCrochet(m);
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      const vues = m.ecrituresDe(m.copies.integration);
      expect(
        vues.filter(l => l.startsWith('crochet ')),
        vues.join('\n')
      ).toHaveLength(1);
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(m.intrus()).toEqual([]);
      expect(existsSync(path.join(m.principalNatif, 'crochet.txt'))).toBe(false);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 16 — the mount covers each shared submodule the preparation linked, whatever the declaration read afterwards', () => {
  it.runIf(canWrap)(
    'critère 16: an integration whose lot removes grillhouse.partage, its build writing into the shared submodule — the write fails or the lot is refused, the main repository’s submodule intact',
    () => {
      const m = mondePartage({ ecritures: true });
      // The lot: the package.json of HEAD without grillhouse.partage, the rest unchanged.
      const pkgPath = path.join(m.repo, 'package.json');
      const avant = readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(avant) as Paquet;
      delete pkg.grillhouse?.partage;
      writeFileSync(pkgPath, JSON.stringify(pkg));
      const retrait = path.join(m.bin, 'retrait.patch');
      writeFileSync(retrait, git(m.repo, 'diff', '--', 'package.json'));
      writeFileSync(pkgPath, avant);
      const tete = git(m.repo, 'rev-parse', 'HEAD');
      const r = spawnSync(
        'node',
        [INTEGRER, '--ticket', 'demo-1', '--code', retrait, '--message', path.join(m.bin, 'msg')],
        {
          cwd: m.repo,
          encoding: 'utf8',
          env: { ...ENV_SCRIPTS, PATH: `${m.bin}:${process.env.PATH}` },
        }
      );
      const vues = m.ecrituresDe(m.copies.integration);
      expect(m.intrus(), r.stdout + r.stderr + vues.join('\n')).toEqual([]);
      if (r.status === 0) {
        // Committed: every command, after the lot too, failed to write into the shared submodule.
        expect(
          vues.filter(l => l.startsWith('construction ')).length,
          vues.join('\n')
        ).toBeGreaterThan(1);
        expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      } else {
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stdout).toMatch(/⛔/);
        expect(git(m.repo, 'rev-parse', 'HEAD')).toBe(tete);
      }
    },
    LONG
  );
});

// A command of the project that moves the shared submodule: `git reset --soft` of vendor/natif to
// its v2, and an empty commit in the submodule nested in it; it notes « deplacer-<step> <outcome of
// the reset> <outcome of the commit> » in the copy's ecritures.log, and always exits 0.
const PARTAGE_DEPLACEMENT = (cible: string) => `import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const etape = process.argv[2];
const essai = args => (spawnSync('git', args, { stdio: 'ignore' }).status === 0 ? 'ok' : 'refus');
const reset = essai(['-C', 'vendor/natif', 'reset', '-q', '--soft', ${JSON.stringify(cible)}]);
const commit = essai(['-C', 'vendor/natif/profond', 'commit', '-q', '--allow-empty', '-m', etape]);
fs.appendFileSync('ecritures.log', ['deplacer-' + etape, reset, commit].join(' ') + '\\n');
`;

describe('grillhouse-3uv.58.1 critère 17 — the mount covers the git repository of each shared submodule, nested ones included', () => {
  // The world of critère 8 with a nested submodule, whose build and tests also try to move the
  // shared submodule.
  const mondeDeplace = () => {
    const m = mondePartage({ ecritures: true, imbrique: true });
    writeFileSync(path.join(m.repo, 'deplacer.mjs'), PARTAGE_DEPLACEMENT(m.commits[1] ?? ''));
    const pkgPath = path.join(m.repo, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet & {
      scripts: Record<string, string>;
    };
    pkg.scripts.build += ' && node deplacer.mjs construction';
    pkg.scripts.test += ' && node deplacer.mjs tests';
    writeFileSync(pkgPath, JSON.stringify(pkg));
    git(m.repo, 'add', '.');
    git(m.repo, 'commit', '-qm', 'déplacer');
    return { ...m, profond: path.join(m.principalNatif, 'profond') };
  };
  const deplacements = (vues: string[]) => vues.filter(l => l.startsWith('deplacer-'));
  it.runIf(canWrap)(
    'critère 17: in the integration, a build that moves the shared submodule’s HEAD (reset) or commits in its nested submodule fails, and their commits in the main repository stay',
    () => {
      const m = mondeDeplace();
      const natif = git(m.principalNatif, 'rev-parse', 'HEAD').trim();
      const profond = git(m.profond, 'rev-parse', 'HEAD').trim();
      expect(natif).toBe(m.commits[0]);
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const vues = deplacements(m.ecrituresDe(m.copies.integration));
      expect(vues.length, vues.join('\n')).toBeGreaterThan(0);
      expect(
        vues.filter(l => !/^\S+ refus refus$/.test(l)),
        vues.join('\n')
      ).toEqual([]);
      expect(git(m.principalNatif, 'rev-parse', 'HEAD').trim()).toBe(natif);
      expect(git(m.profond, 'rev-parse', 'HEAD').trim()).toBe(profond);
      // The main repository still sees its submodule at the commit it references.
      expect(git(m.repo, 'submodule', 'status', '--', 'vendor/natif')).toMatch(/^ /);
    },
    LONG
  );
  it.runIf(canWrap)(
    'critère 17: in the night, a build and tests that move the shared submodule’s HEAD (reset) or commit in its nested submodule fail, and their commits in the main repository stay',
    () => {
      const m = mondeDeplace();
      const natif = git(m.principalNatif, 'rev-parse', 'HEAD').trim();
      const profond = git(m.profond, 'rev-parse', 'HEAD').trim();
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      const vues = deplacements(m.ecrituresDe(m.copies.nuit));
      for (const e of ['construction', 'tests']) {
        expect(vues.filter(l => l.startsWith(`deplacer-${e} `)).length, vues.join('\n')).toBe(1);
      }
      expect(
        vues.filter(l => !/^\S+ refus refus$/.test(l)),
        vues.join('\n')
      ).toEqual([]);
      expect(git(m.principalNatif, 'rev-parse', 'HEAD').trim()).toBe(natif);
      expect(git(m.profond, 'rev-parse', 'HEAD').trim()).toBe(profond);
      // The main repository still sees its submodule at the commit it references.
      expect(git(m.repo, 'submodule', 'status', '--', 'vendor/natif')).toMatch(/^ /);
    },
    LONG
  );
});

// `monter` played on a copy, from the copy, with the list its pose printed (`--partages`, the one
// way the frame calls it): the command tries to write into the shared submodule (by the copy's
// link), into the main repository's .git, and into the copy, and prints
// « <outcome in the submodule> <outcome in .git> <outcome in the copy> ».
const ESSAI_MONTE = `const fs = require('node:fs');
const essai = f => { try { fs.writeFileSync(f, 'monte\\n'); return 'ok'; } catch (e) { return e.code ?? 'refus'; } };
console.log([essai('vendor/natif/monte.txt'), essai(process.argv[1]), essai('copie-monte.txt')].join(' '));`;
const essaiMonte = (m: ReturnType<typeof mondePartage>) => [
  'node',
  '-e',
  ESSAI_MONTE,
  path.join(m.repo, '.git/monte.txt'),
];
const monterDans = (m: ReturnType<typeof mondePartage>, copie: string, partages: string) =>
  spawnSync('bash', [POSE, 'monter', copie, '--partages', partages, ...essaiMonte(m)], {
    cwd: copie,
    encoding: 'utf8',
    env: ENV_SCRIPTS,
  });

describe('grillhouse-3uv.58.1 critère 18 — the mount finds a shared submodule by its link, not by a mark of the index', () => {
  // Commands of the project that rewrite the copy's index and drop the « ignored in the copy » mark.
  const reecritures = {
    'git read-tree HEAD': ['read-tree', 'HEAD'],
    'git update-index --no-skip-worktree': ['update-index', '--no-skip-worktree', 'vendor/natif'],
  };
  for (const [cas, args] of Object.entries(reecritures)) {
    it.runIf(canWrap)(
      `critère 18: after ${cas} in a linked copy, a command under the mount fails to write into the shared submodule, the main repository’s submodule intact`,
      () => {
        const m = mondePartage();
        const copie = m.copieFraiche('reecrite');
        const p = m.poser(copie);
        expect(p.status, p.stderr).toBe(0);
        expect(m.lit(copie)).toBe(true);
        git(copie, ...args);
        // The mark is gone, the link stays.
        expect(git(copie, 'ls-files', '-v', '--', 'vendor/natif')).not.toMatch(/^S /m);
        expect(m.lit(copie)).toBe(true);
        const commit = git(m.principalNatif, 'rev-parse', 'HEAD');
        const r = monterDans(m, copie, p.stdout);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout.trim()).toMatch(/^(?!ok )\S+ \S+ ok$/);
        expect(existsSync(path.join(m.principalNatif, 'monte.txt'))).toBe(false);
        expect(existsSync(m.nonSuivi)).toBe(true);
        expect(git(m.principalNatif, 'rev-parse', 'HEAD')).toBe(commit);
      },
      LONG
    );
  }
  it.runIf(canWrap)(
    'critère 18: in the integration, a build that runs git read-tree HEAD leaves the following commands (tests, guards) unable to write into the shared submodule',
    () => {
      const m = mondePartage({ ecritures: true });
      const pkgPath = path.join(m.repo, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet & {
        scripts: Record<string, string>;
      };
      pkg.scripts.build = `git read-tree HEAD && ${pkg.scripts.build}`;
      writeFileSync(pkgPath, JSON.stringify(pkg));
      git(m.repo, 'add', '.');
      git(m.repo, 'commit', '-qm', 'read-tree');
      const r = m.integrer();
      const vues = m.ecrituresDe(m.copies.integration);
      expect(m.intrus(), r.stdout + r.stderr + vues.join('\n')).toEqual([]);
      for (const e of ['tests', 'gardes']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, vues.join('\n')).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(existsSync(m.nonSuivi)).toBe(true);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 19 — a linked shared submodule not initialized in the main repository at the mount stops it', () => {
  // Undone between the preparation and the mount: deinit by git, or an empty folder in its place.
  const etats = {
    'git submodule deinit': (m: ReturnType<typeof mondePartage>) =>
      git(m.repo, 'submodule', 'deinit', '-q', '-f', '--', 'vendor/natif'),
    'an empty folder': (m: ReturnType<typeof mondePartage>) => {
      rmSync(m.principalNatif, { recursive: true, force: true });
      mkdirSync(m.principalNatif);
    },
  };
  for (const [cas, defaire] of Object.entries(etats)) {
    it.runIf(canWrap)(
      `critère 19: ${cas} after the preparation — the mount refuses, exit 1, its first line names the submodule, the command does not play, the main repository’s .git untouched`,
      () => {
        const m = mondePartage();
        const copie = m.copieFraiche('desinit');
        const p = m.poser(copie);
        expect(p.status, p.stderr).toBe(0);
        expect(m.lit(copie)).toBe(true);
        defaire(m);
        expect(existsSync(path.join(m.principalNatif, '.git'))).toBe(false);
        const r = monterDans(m, copie, p.stdout);
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stderr.split('\n')[0]).toContain('vendor/natif');
        expect(r.stdout).toBe('');
        expect(existsSync(path.join(copie, 'copie-monte.txt'))).toBe(false);
        expect(existsSync(path.join(m.repo, '.git/monte.txt'))).toBe(false);
      },
      LONG
    );
  }
});

describe('grillhouse-3uv.58.1 critère 20 — the mount takes its shared submodules from the list of the pose only', () => {
  // Without `--partages`, the mount would have to read the copy (its .gitmodules) to find them.
  const copies = {
    'a linked copy': (m: ReturnType<typeof mondePartage>) => {
      const copie = m.copieFraiche('sans-liste');
      const p = m.poser(copie);
      expect(p.status, p.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      return copie;
    },
    'a linked copy whose .gitmodules is emptied': (m: ReturnType<typeof mondePartage>) => {
      const copie = m.copieFraiche('sans-liste-vide');
      const p = m.poser(copie);
      expect(p.status, p.stderr).toBe(0);
      writeFileSync(path.join(copie, '.gitmodules'), '');
      return copie;
    },
    'a fresh copy, not prepared': (m: ReturnType<typeof mondePartage>) =>
      m.copieFraiche('sans-liste-fraiche'),
  };
  for (const [cas, preparer] of Object.entries(copies)) {
    it(
      `critère 20: a call of the mount without --partages on ${cas} — refused as a malformed call (usage, exit 2), the command does not play`,
      () => {
        const m = mondePartage();
        const copie = preparer(m);
        const r = spawnSync('bash', [POSE, 'monter', copie, ...essaiMonte(m)], {
          cwd: copie,
          encoding: 'utf8',
          env: ENV_SCRIPTS,
        });
        expect(r.status, r.stdout + r.stderr).toBe(2);
        expect(r.stderr.split('\n')[0]).toMatch(/^usage: /);
        expect(r.stdout).toBe('');
        expect(existsSync(path.join(copie, 'copie-monte.txt'))).toBe(false);
        expect(existsSync(path.join(m.principalNatif, 'monte.txt'))).toBe(false);
        expect(existsSync(path.join(m.repo, '.git/monte.txt'))).toBe(false);
      },
      LONG
    );
  }
});

// Ways a lot or a command of the project rewrites the .gitmodules of the copy after the preparation.
// The lot: a patch on .gitmodules, built in the main tree then undone there. The command: a shell
// line run before the build (`node -e …` empties it; `sed` moves the path, then commits it in the copy).
const VIDER_GITMODULES = `node -e "require('node:fs').writeFileSync('.gitmodules', '')"`;
const DEPLACER_GITMODULES = `sed -i 's#path = vendor/natif#path = vendor/ailleurs#' .gitmodules`;
const lotsGitmodules: Record<string, (texte: string) => string | null> = {
  'empties .gitmodules': () => '',
  'deletes .gitmodules': () => null,
  'changes the path of the shared submodule in .gitmodules': texte =>
    texte.replace('path = vendor/natif', 'path = vendor/ailleurs'),
};
const commandesGitmodules: Record<string, string> = {
  'empties .gitmodules': VIDER_GITMODULES,
  'changes the path of the shared submodule in .gitmodules': DEPLACER_GITMODULES,
  'changes the path in .gitmodules and commits it in the copy': `${DEPLACER_GITMODULES} && git -c user.name=t -c user.email=t@t commit -q --no-verify --allow-empty -m deplace -- .gitmodules`,
};
// The world of the mount, its build rewriting .gitmodules first by `commande`.
const mondeReecrit = (commande: string, script = 'build') => {
  const m = mondePartage({ ecritures: true });
  const pkgPath = path.join(m.repo, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet & {
    scripts: Record<string, string>;
  };
  pkg.scripts[script] = `${commande} && ${pkg.scripts[script]}`;
  writeFileSync(pkgPath, JSON.stringify(pkg));
  git(m.repo, 'add', '.');
  git(m.repo, 'commit', '-qm', 'gitmodules réécrit');
  return m;
};

describe('grillhouse-3uv.58.1 critère 20 — the mount reads nothing the copy can rewrite during a lot to find the shared submodules', () => {
  for (const [cas, reecrire] of Object.entries(lotsGitmodules)) {
    it.runIf(canWrap)(
      `critère 20: an integration whose lot ${cas}, its build writing into the shared submodule — the write fails or the lot is refused, the main repository’s submodule intact`,
      () => {
        const m = mondePartage({ ecritures: true });
        const gm = path.join(m.repo, '.gitmodules');
        const avant = readFileSync(gm, 'utf8');
        const apres = reecrire(avant);
        if (apres === null) {
          rmSync(gm);
        } else {
          writeFileSync(gm, apres);
        }
        const patch = path.join(m.bin, 'gitmodules.patch');
        writeFileSync(patch, git(m.repo, 'diff', '--', '.gitmodules'));
        writeFileSync(gm, avant);
        expect(git(m.repo, 'status', '--porcelain', '--', '.gitmodules')).toBe('');
        const tete = git(m.repo, 'rev-parse', 'HEAD');
        const commit = git(m.principalNatif, 'rev-parse', 'HEAD');
        const r = spawnSync(
          'node',
          [INTEGRER, '--ticket', 'demo-1', '--code', patch, '--message', path.join(m.bin, 'msg')],
          {
            cwd: m.repo,
            encoding: 'utf8',
            env: { ...ENV_SCRIPTS, PATH: `${m.bin}:${process.env.PATH}` },
          }
        );
        const vues = m.ecrituresDe(m.copies.integration);
        const dit = r.stdout + r.stderr + vues.join('\n');
        expect(m.intrus(), dit).toEqual([]);
        expect(existsSync(m.nonSuivi)).toBe(true);
        expect(git(m.principalNatif, 'rev-parse', 'HEAD')).toBe(commit);
        if (r.status === 0) {
          // Committed: every command, after the lot too, failed to write into the shared submodule.
          expect(vues.filter(l => l.startsWith('construction ')).length, dit).toBeGreaterThan(1);
          expect(ecrituresFautives(vues), dit).toEqual([]);
        } else {
          expect(r.status, dit).toBe(1);
          expect(r.stdout).toMatch(/⛔/);
          expect(git(m.repo, 'rev-parse', 'HEAD')).toBe(tete);
          expect(ecrituresFautives(vues), dit).toEqual([]);
        }
      },
      LONG
    );
  }
  for (const [cas, commande] of Object.entries(commandesGitmodules)) {
    it.runIf(canWrap)(
      `critère 20: in the integration, a build that ${cas} leaves the following commands (tests, guards) unable to write into the shared submodule, the main repository’s submodule intact`,
      () => {
        const m = mondeReecrit(commande);
        const commit = git(m.principalNatif, 'rev-parse', 'HEAD');
        const r = m.integrer();
        const vues = m.ecrituresDe(m.copies.integration);
        const dit = r.stdout + r.stderr + vues.join('\n');
        expect(m.intrus(), dit).toEqual([]);
        for (const e of ['tests', 'gardes']) {
          expect(vues.filter(l => l.startsWith(`${e} `)).length, dit).toBeGreaterThan(0);
        }
        expect(ecrituresFautives(vues), dit).toEqual([]);
        expect(existsSync(m.nonSuivi)).toBe(true);
        expect(git(m.principalNatif, 'rev-parse', 'HEAD')).toBe(commit);
      },
      LONG
    );
  }
  it.runIf(canWrap)(
    'critère 20: in the night, a build that empties .gitmodules leaves the tests and the night script unable to write into the shared submodule',
    () => {
      const m = mondeReecrit(VIDER_GITMODULES);
      m.nuit();
      const vues = m.ecrituresDe(m.copies.nuit);
      const dit = m.journalNuit() + vues.join('\n');
      expect(m.intrus(), dit).toEqual([]);
      for (const e of ['tests', 'nuit']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, dit).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), dit).toEqual([]);
      expect(existsSync(m.nonSuivi)).toBe(true);
    },
    LONG
  );
  it.runIf(canWrap)(
    'critère 20: in the agent copy, an installation that empties .gitmodules leaves its build unable to write into the shared submodule',
    () => {
      const m = mondeReecrit(VIDER_GITMODULES, 'postinstall');
      const r = lancerChez(m);
      const vues = m.ecrituresDe(m.copies.agent);
      const journal = existsSync(`${m.copies.agent}.log`)
        ? readFileSync(`${m.copies.agent}.log`, 'utf8')
        : '';
      const dit = r.stderr + journal + vues.join('\n');
      expect(m.intrus(), dit).toEqual([]);
      expect(vues.filter(l => l.startsWith('construction ')).length, dit).toBeGreaterThan(0);
      expect(ecrituresFautives(vues), dit).toEqual([]);
      expect(existsSync(m.nonSuivi)).toBe(true);
    },
    LONG
  );
});

// grillhouse-3uv.69: the address a copy sets a submodule from. git's model (git-submodule(1),
// « init »): the url of .gitmodules is copied into the repository's configuration only when
// `submodule.<name>.url` is missing there; the local configuration always wins. A copy made by
// `git worktree add` shares the configuration of the main repository: the pose sets each submodule
// from the address the main repository uses today — its `submodule.<name>.url`, else the url of
// .gitmodules — even in a reused copy whose submodule was first cloned from another address, and
// it never writes the main repository's configuration.
//
// The world: A, the submodule's repository of `monde` (v1, v2), named by .gitmodules; B, a clone
// of A. Each then gets a commit the other lacks: `a3` in A, `b3` in B (natif.txt holds its name).
// `referencer` makes the main repository reference one of them at vendor/natif; a copy can set it
// only from the repository that holds it.
type Depot = 'A' | 'B';
function adresses<M extends ReturnType<typeof monde>>(m: M) {
  const principalNatif = path.join(m.repo, 'vendor/natif');
  const A = git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url').trim();
  const B = mkdtempSync(path.join(ESSAIS, 'natif-b-'));
  git(ESSAIS, 'clone', '-q', A, B);
  const exclusifs = {} as Record<Depot, string>;
  for (const [nom, depot] of [
    ['B', B],
    ['A', A],
  ] as const) {
    writeFileSync(path.join(depot, 'natif.txt'), `${nom.toLowerCase()}3\n`);
    git(depot, 'commit', '-qam', `${nom.toLowerCase()}3`);
    exclusifs[nom] = git(depot, 'rev-parse', 'HEAD').trim();
  }
  const depots: Record<Depot, string> = { A, B };
  const configPrincipale = path.join(m.repo, '.git/config');
  // The main repository's local address of vendor/natif: set (a path or a file:// URL) or removed.
  // Removing an address already absent is no fault: `git config --unset` exits 5 for a missing key.
  const adresseLocale = (url: string | null) => {
    if (url === null) {
      const r = spawnSync(
        'git',
        ['-C', m.repo, 'config', '--unset', 'submodule.vendor/natif.url'],
        {
          encoding: 'utf8',
        }
      );
      if (r.status !== 0 && r.status !== 5) {
        throw new Error(`git config --unset: ${r.status} ${r.stderr}`);
      }
    } else {
      git(m.repo, 'config', 'submodule.vendor/natif.url', url);
    }
  };
  // The main repository references the commit only `depot` holds, in a commit of its own.
  const referencer = (depot: Depot) => {
    git(principalNatif, 'fetch', '-q', depots[depot], exclusifs[depot]);
    git(principalNatif, 'checkout', '-q', exclusifs[depot]);
    git(m.repo, 'add', 'vendor/natif');
    git(m.repo, 'commit', '-qm', `natif ${depot.toLowerCase()}3`);
  };
  // .gitmodules names another address, in a commit (`git submodule set-url` writes the
  // configuration too: the file alone is rewritten here).
  const gitmodulesVers = (url: string) => {
    git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url', url);
    git(m.repo, 'add', '.gitmodules');
    git(m.repo, 'commit', '-qm', 'gitmodules');
  };
  const lireConfig = () => readFileSync(configPrincipale, 'utf8');
  const sousModulesConfig = () =>
    gitScripts(m.repo, 'config', '--local', '--get-regexp', '^submodule\\.').stdout;
  return {
    ...m,
    A,
    B,
    depots,
    principalNatif,
    adresseLocale,
    referencer,
    gitmodulesVers,
    lireConfig,
    sousModulesConfig,
  };
}
// A repository that does not exist: a name under the mkdtemp root that no test creates.
const ABSENT = path.join(ESSAIS, 'depot-absent');

describe('grillhouse-3uv.69 critères 1 et 4 — a fresh copy sets the submodule from the main repository’s submodule.<name>.url', () => {
  it(
    'critère 4: .gitmodules names A, which lacks the commit; the local configuration names B, which holds it: the pose succeeds',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.adresseLocale(m.B);
      m.referencer('B');
      const copie = m.copieFraiche('fraiche');
      const config = m.lireConfig();
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('b3');
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 1: .gitmodules names a repository that does not exist; the local configuration names A: the pose succeeds',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.gitmodulesVers(ABSENT);
      m.referencer('A');
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('a3');
    },
    LONG
  );
});

describe('grillhouse-3uv.69 critère 2 — without a local address, the url of .gitmodules serves', () => {
  it(
    'critère 2: no submodule.<name>.url in the main repository: a fresh copy sets the submodule from .gitmodules',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.referencer('A');
      m.adresseLocale(null);
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('a3');
    },
    LONG
  );
});

describe('grillhouse-3uv.69 critère 3 — a local address in the configuration stays accepted', () => {
  for (const forme of ['chemin', 'file'] as const) {
    it(
      `critère 3: a local address given as ${forme === 'chemin' ? 'a path' : 'a file:// URL'} in the configuration sets the submodule in a fresh copy`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        m.adresseLocale(forme === 'chemin' ? m.B : `file://${m.B}`);
        m.referencer('B');
        const copie = m.copieFraiche('fraiche');
        const r = m.poser(copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('b3');
      },
      LONG
    );
  }
});

describe('grillhouse-3uv.69 critère 5 — the header of the preparation says where the address comes from', () => {
  it('critère 5: the header names submodule.<name>.url of the main repository’s configuration, and .gitmodules without it', () => {
    // The header: the comment lines after the shebang; its items start with « # - ».
    const lignes = readFileSync(POSE, 'utf8').split('\n').slice(1);
    const entete = lignes
      .slice(
        0,
        lignes.findIndex(l => !l.startsWith('#'))
      )
      .join('\n');
    const items = entete.split(/\n# - /);
    const item = items.find(i => /submodule\.<[^>]+>\.url/.test(i)) ?? '';
    expect(item, entete).toMatch(/submodule\.<[^>]+>\.url/);
    expect(item).toMatch(/main repository/);
    expect(item).toMatch(/\.gitmodules/);
  });
});

describe('grillhouse-3uv.69 critère 6 — a reused copy sets the submodule from the address the main repository uses today', () => {
  // A copy that does not get ready is removed and created again by the integration and the night
  // (scripts/integration/rejeu.mjs, scripts/nuit.sh): a mark in its node_modules, which their
  // cleaning keeps, says the reused copy itself was set.
  const marquer = (copie: string) => {
    const f = path.join(copie, 'node_modules/.copie-reutilisee');
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, '');
    return f;
  };
  // The three callers, each on a copy it created then reuses: the local address moves from A to
  // B, and main references b3, which only B holds.
  it(
    'critère 6: the reused integration copy, after the local address moves from A to B',
    () => {
      const m = adresses(monde());
      expect(m.integrer().status).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('v1');
      const marque = marquer(m.copies.integration);
      m.adresseLocale(m.B);
      m.referencer('B');
      const avant = m.sousModulesConfig();
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('b3');
      expect(m.vus().at(-1)).toBe('b3');
      expect(m.sousModulesConfig()).toBe(avant);
      expect(existsSync(marque), 'the integration copy was removed and created again').toBe(true);
    },
    LONG
  );
  it(
    'critère 6: the reused agent copy, after the local address moves from A to B',
    () => {
      const m = adresses(monde());
      m.lancer();
      expect(m.natifDe(m.copies.agent)).toBe('v1');
      m.adresseLocale(m.B);
      m.referencer('B');
      const avant = m.sousModulesConfig();
      const r = m.lancer();
      expect(r.status, r.stderr).not.toBe(CODE_COPIE);
      expect(m.natifDe(m.copies.agent)).toBe('b3');
      expect(m.vus().at(-1)).toBe('b3');
      expect(m.sousModulesConfig()).toBe(avant);
    },
    LONG
  );
  it(
    'critère 6: the reused night copy, after the local address moves from A to B',
    () => {
      const m = adresses(monde());
      expect(m.nuit().status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('v1');
      const marque = marquer(m.copies.nuit);
      m.adresseLocale(m.B);
      m.referencer('B');
      const avant = m.sousModulesConfig();
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('b3');
      expect(m.vus().at(-1)).toBe('b3');
      expect(m.sousModulesConfig()).toBe(avant);
      expect(existsSync(marque), 'the night copy was removed and created again').toBe(true);
    },
    LONG
  );

  // The preparation alone, on a copy first set from one address, then moved forward as its
  // caller moves it.
  const avancees = ['avancerCommeLIntegration', 'avancerCommeLAgent'] as const;
  for (const avancer of avancees) {
    const qui = avancer === 'avancerCommeLAgent' ? 'agent' : 'integration';
    it(
      `critère 6 (${qui}): the local address moves back from B to A, and main references a3, which only A holds`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        m.adresseLocale(m.B);
        const copie = m.copieFraiche('reutilisee');
        expect(m.poser(copie).status).toBe(0);
        m.adresseLocale(m.A);
        m.referencer('A');
        const config = m.lireConfig();
        const r = m[avancer](copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('a3');
        expect(m.lireConfig()).toBe(config);
      },
      LONG
    );
    it(
      `critère 6 (${qui}): the local address moves to a file:// URL of B, and main references b3`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        const copie = m.copieFraiche('reutilisee');
        expect(m.poser(copie).status).toBe(0);
        m.adresseLocale(`file://${m.B}`);
        m.referencer('B');
        const config = m.lireConfig();
        const r = m[avancer](copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('b3');
        expect(m.lireConfig()).toBe(config);
      },
      LONG
    );
    it(
      `critère 6 (${qui}): the local address B is removed, .gitmodules names A, and main references a3: the pose takes A and writes no address`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        m.adresseLocale(m.B);
        const copie = m.copieFraiche('reutilisee');
        expect(m.poser(copie).status).toBe(0);
        m.referencer('A');
        m.adresseLocale(null);
        const config = m.lireConfig();
        const r = m[avancer](copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('a3');
        expect(m.lireConfig()).toBe(config);
      },
      LONG
    );
    it(
      `critère 6 (${qui}): without a local address, .gitmodules moves from A to B, and main references b3`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        m.adresseLocale(null);
        const copie = m.copieFraiche('reutilisee');
        expect(m.poser(copie).status).toBe(0);
        m.adresseLocale(null);
        m.gitmodulesVers(m.B);
        m.referencer('B');
        const config = m.lireConfig();
        const r = m[avancer](copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('b3');
        expect(m.lireConfig()).toBe(config);
      },
      LONG
    );
  }

  it(
    'critère 6: the local address stays B while .gitmodules moves to a repository that does not exist: the reused copy still sets b3 from B',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.adresseLocale(m.B);
      const copie = m.copieFraiche('reutilisee');
      expect(m.poser(copie).status).toBe(0);
      m.gitmodulesVers(ABSENT);
      m.referencer('B');
      const config = m.lireConfig();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('b3');
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 6: without a local address, the pose of a fresh copy writes no address into the main repository’s configuration',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.adresseLocale(null);
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
});

describe('grillhouse-3uv.69 critère 6 — a url of .gitmodules relative to the superproject, without a local address', () => {
  // git resolves a relative url against the superproject (its origin remote, else its working
  // tree): the main repository resolves `../natif-…` next to its own folder. A copy lives under
  // .claude/worktrees/: the address it uses is the one the main repository uses, not the same url
  // resolved from the copy's folder.
  it(
    'critère 6: .gitmodules names ../<A>, the main repository has no submodule.<name>.url: a fresh copy sets v1 from the address the main repository uses, and writes no address',
    () => {
      const m = mondePartage({ partage: null, adresse: 'relative' });
      const url = git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url').trim();
      expect(url).toMatch(/^\.\.\//);
      // `git submodule add` wrote the resolved address into the configuration: removed.
      git(m.repo, 'config', '--unset', 'submodule.vendor/natif.url');
      const config = readFileSync(path.join(m.repo, '.git/config'), 'utf8');
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(readFileSync(path.join(m.repo, '.git/config'), 'utf8')).toBe(config);
    },
    LONG
  );
  it(
    'critère 6 (integration): the same, on a reused copy moved forward to v2',
    () => {
      const m = mondePartage({ partage: null, adresse: 'relative' });
      git(m.repo, 'config', '--unset', 'submodule.vendor/natif.url');
      const config = readFileSync(path.join(m.repo, '.git/config'), 'utf8');
      const copie = m.copieFraiche('reutilisee');
      const premiere = m.poser(copie);
      expect(premiere.status, premiere.stderr).toBe(0);
      m.avancerNatif();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v2');
      expect(readFileSync(path.join(m.repo, '.git/config'), 'utf8')).toBe(config);
    },
    LONG
  );
});

// grillhouse-3uv.69 critère 7: a relative url (`./`, `../`), of the configuration or of
// .gitmodules, is resolved by git's rule for the main repository — against the url of the remote
// its current branch follows, else origin, else its folder, with git's cut for a host:path
// address. The expected address is never written by hand: `ecrite` copies the main repository
// into a disposable folder, gives its .gitmodules the relative url, removes its local address and
// reads what `git submodule init` writes there.
//
// A non-local address (host:path, ssh) cannot be fetched here: an ssh of the test records the
// arguments git hands it, then fails. The address a pose uses is measured by that record, set
// against the record of `git ls-remote <expected address>`.
function mondeRelatif() {
  const m = mondePartage({ partage: null });
  const A = git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url').trim();
  gitScripts(m.repo, 'config', '--unset', 'submodule.vendor/natif.url');
  const branche = git(m.repo, 'symbolic-ref', '--short', 'HEAD').trim();
  // A remote url of the main repository, `<folder>/principal.git`; `natif` puts a bare clone of
  // A at `<folder>/<natif>` (`principal.git/natif.git` for a `./` url).
  const distant = (natif?: string) => {
    const dossier = mkdtempSync(path.join(ESSAIS, 'distant-'));
    if (natif) {
      git(ESSAIS, 'clone', '-q', '--bare', A, path.join(dossier, natif));
    }
    return path.join(dossier, 'principal.git');
  };
  const remote = (nom: string, url: string) => git(m.repo, 'remote', 'add', nom, url);
  const suivre = (nom: string) => git(m.repo, 'config', `branch.${branche}.remote`, nom);
  const gitmodulesVers = (url: string) => {
    git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url', url);
    git(m.repo, 'add', '.gitmodules');
    git(m.repo, 'commit', '-qm', 'gitmodules');
  };
  const adresseLocale = (url: string) => git(m.repo, 'config', 'submodule.vendor/natif.url', url);
  // `git submodule init` for the relative url `url`, in a disposable copy of the main repository.
  const init = (url: string) => {
    const temoin = path.join(mkdtempSync(path.join(ESSAIS, 'temoin-')), 'principal');
    cpSync(m.repo, temoin, {
      recursive: true,
      filter: src => !/\/\.claude\/worktrees(\/|$)|\/\.git\/worktrees(\/|$)/.test(src),
    });
    git(temoin, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url', url);
    gitScripts(temoin, 'config', '--unset', 'submodule.vendor/natif.url');
    const r = gitScripts(temoin, 'submodule', 'init', '-q', '--', 'vendor/natif');
    const ecrite = gitScripts(temoin, 'config', '--get', 'submodule.vendor/natif.url');
    return { status: r.status, stderr: r.stderr, url: ecrite.stdout.trim() };
  };
  // What `git submodule init` writes in the main repository for the relative url `url`.
  const ecrite = (url: string) => {
    const r = init(url);
    expect(r.status, r.stderr).toBe(0);
    return r.url;
  };
  const journalSsh = path.join(m.bin, 'ssh.log');
  const ssh = path.join(m.bin, 'ssh-essai');
  writeFileSync(
    ssh,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(journalSsh)}\nexit 128\n`,
    {
      mode: 0o755,
    }
  );
  const ENV_SSH = { ...ENV_SCRIPTS, GIT_SSH_COMMAND: ssh, GIT_SSH_VARIANT: 'simple' };
  const dernierSsh = () =>
    existsSync(journalSsh)
      ? (readFileSync(journalSsh, 'utf8').trim().split('\n').at(-1) ?? '')
      : '';
  const poserSsh = (copie: string) =>
    spawnSync('bash', [POSE, 'pose', copie], { encoding: 'utf8', env: ENV_SSH });
  // What the test ssh receives when git reaches `url`.
  const sshPour = (url: string) => {
    spawnSync('git', ['ls-remote', url], { encoding: 'utf8', env: ENV_SSH });
    return dernierSsh();
  };
  const remoteDe = (copie: string) =>
    git(path.join(copie, 'vendor/natif'), 'remote', 'get-url', 'origin').trim();
  const lireConfig = () => readFileSync(path.join(m.repo, '.git/config'), 'utf8');
  return {
    ...m,
    A,
    distant,
    remote,
    suivre,
    gitmodulesVers,
    adresseLocale,
    init,
    ecrite,
    dernierSsh,
    poserSsh,
    sshPour,
    remoteDe,
    lireConfig,
  };
}

describe('grillhouse-3uv.69 critère 7 — a relative url is resolved by git’s rule for the main repository', () => {
  it(
    'critère 7: an origin given as a path, .gitmodules names ../natif.git: the copy sets v1 from the address git submodule init writes',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant('natif.git'));
      m.gitmodulesVers('../natif.git');
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: an origin given as a path, the local configuration names ../natif.git and .gitmodules a repository that does not exist',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant('natif.git'));
      m.gitmodulesVers(ABSENT);
      m.adresseLocale('../natif.git');
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: a ./ url, against an origin given as a path',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant('principal.git/natif.git'));
      m.gitmodulesVers('./natif.git');
      const attendue = m.ecrite('./natif.git');
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
    },
    LONG
  );
  it(
    'critère 7: the current branch follows upstream, origin exists too: a fresh copy resolves against upstream',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant());
      m.remote('upstream', m.distant('natif.git'));
      m.suivre('upstream');
      m.gitmodulesVers('../natif.git');
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7 (integration): the current branch follows upstream, on a reused copy first set from A: its submodule moves to upstream’s address',
    () => {
      const m = mondeRelatif();
      const copie = m.copieFraiche('reutilisee');
      expect(m.poser(copie).status).toBe(0);
      m.remote('origin', m.distant('natif.git'));
      m.remote('upstream', m.distant('natif.git'));
      m.suivre('upstream');
      m.gitmodulesVers('../natif.git');
      m.avancerNatif();
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v2');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: an origin host:repo.git, .gitmodules names ../natif.git: the pose reaches the address git submodule init writes',
    () => {
      const m = mondeRelatif();
      m.remote('origin', 'hote.invalid:repo.git');
      m.gitmodulesVers('../natif.git');
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poserSsh(copie);
      const vu = m.dernierSsh();
      expect(vu, r.stderr).not.toBe('');
      expect(vu, `${attendue}\n${r.stderr}`).toBe(m.sshPour(attendue));
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: an origin user@host:org/repo.git, .gitmodules names ../../x.git: the pose reaches the address git submodule init writes',
    () => {
      const m = mondeRelatif();
      m.remote('origin', 'git@hote.invalid:org/repo.git');
      m.gitmodulesVers('../../x.git');
      const attendue = m.ecrite('../../x.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poserSsh(copie);
      const vu = m.dernierSsh();
      expect(vu, r.stderr).not.toBe('');
      expect(vu, `${attendue}\n${r.stderr}`).toBe(m.sshPour(attendue));
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
});

describe('grillhouse-3uv.69 critère 1 — a submodule whose path holds a space is set from the main repository’s address', () => {
  it(
    'critère 1: vendor/mon natif, set first from A; the local address moves to B and main references b3: the reused copy sets b3 from B',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      const chemin = 'vendor/mon natif';
      const nom = chemin;
      // The submodule at a path with a space, from A, at v1; vendor/natif stays as the world has it.
      git(m.repo, 'submodule', 'add', '-q', m.A, chemin);
      git(path.join(m.repo, chemin), 'checkout', '-q', m.commits[0] ?? '');
      git(m.repo, 'add', '.');
      git(m.repo, 'commit', '-qm', 'mon natif');
      const copie = m.copieFraiche('reutilisee');
      const premiere = m.poser(copie);
      expect(premiere.status, premiere.stderr).toBe(0);
      expect(readFileSync(path.join(copie, chemin, 'natif.txt'), 'utf8').trim()).toBe('v1');
      git(m.repo, 'config', `submodule.${nom}.url`, m.B);
      const principal = path.join(m.repo, chemin);
      git(principal, 'fetch', '-q', m.B, 'HEAD');
      git(principal, 'checkout', '-q', 'FETCH_HEAD');
      git(m.repo, 'add', '.');
      git(m.repo, 'commit', '-qm', 'mon natif b3');
      const config = m.lireConfig();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(path.join(copie, chemin, 'natif.txt'), 'utf8').trim()).toBe('b3');
      expect(git(path.join(copie, chemin), 'remote', 'get-url', 'origin').trim()).toBe(m.B);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
});

describe('grillhouse-3uv.69 — moving the remote of a submodule set in the copy is a command of the pose: its failure stops it', () => {
  it(
    'its remote cannot be moved (the copy’s submodule has no origin remote): the pose stops, exit 1, naming the submodule',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      const copie = m.copieFraiche('reutilisee');
      expect(m.poser(copie).status).toBe(0);
      m.adresseLocale(m.B);
      m.avancerNatif();
      // v2 is already in the copy's submodule: setting it fetches nothing, only origin moves.
      git(path.join(copie, 'vendor/natif'), 'remote', 'rename', 'origin', 'amont');
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(1);
      expect(r.stderr).toMatch(/vendor\/natif/);
    },
    LONG
  );
});

// grillhouse-3uv.69 critère 7 (second rendu du relecteur): a remote url that is a local path not
// absolute (`upstream.git`, `../up/…`) is, for git, relative to the main repository's folder, and
// need not exist; git writes the resolved url as is (`natif.git`, `../up/natif.git`), which a clone
// in the main repository reads from its folder. The copy uses that same repository: the url git
// writes, taken from the main repository's folder. Where git itself refuses the url, the pose
// refuses it too, before setting anything (critère 6: the pose never writes the main repository's
// configuration).
describe('grillhouse-3uv.69 critère 7 — a remote given as a relative local path is resolved from the main repository’s folder, as git does', () => {
  it(
    'critère 7: an origin upstream.git, .gitmodules names ../natif.git: the copy sets v1 from <main repository>/<what git writes>, and writes no address',
    () => {
      const m = mondeRelatif();
      m.remote('origin', 'upstream.git');
      m.gitmodulesVers('../natif.git');
      const attendue = m.ecrite('../natif.git');
      git(ESSAIS, 'clone', '-q', '--bare', m.A, path.resolve(m.repo, attendue));
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(path.resolve(m.repo, attendue));
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: an origin ../<folder>/absent/repo.git whose folder does not exist, .gitmodules names ../../natif.git: the copy sets v1 from <main repository>/<what git writes>',
    () => {
      const m = mondeRelatif();
      const dossier = mkdtempSync(path.join(ESSAIS, 'up-'));
      const base = path.relative(m.repo, path.join(dossier, 'absent', 'repo.git'));
      expect(base).toMatch(/^\.\.\//);
      expect(existsSync(path.join(dossier, 'absent'))).toBe(false);
      m.remote('origin', base);
      m.gitmodulesVers('../../natif.git');
      const attendue = m.ecrite('../../natif.git');
      git(ESSAIS, 'clone', '-q', '--bare', m.A, path.resolve(m.repo, attendue));
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(path.resolve(m.repo, attendue));
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: a url ending in « / » (../natif.git/), against an origin given as a path: the copy uses the url git writes, without the « / »',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant('natif.git'));
      m.gitmodulesVers('../natif.git/');
      const attendue = m.ecrite('../natif.git/');
      expect(attendue).not.toMatch(/\/$/);
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critères 6 et 7: the current branch follows upstream (upstream.git), .gitmodules names ../../natif.git, which git refuses for the main repository: the pose stops, exit 1, naming the submodule, and the main repository’s configuration is unchanged',
    () => {
      const m = mondeRelatif();
      // origin holds the repository the url reaches from it: a resolution against origin (the
      // remote of a detached copy) would succeed, and write its url.
      m.remote('origin', m.distant('natif.git'));
      m.remote('upstream', 'upstream.git');
      m.suivre('upstream');
      m.gitmodulesVers('../../natif.git');
      // git itself refuses this url for the main repository: it writes nothing.
      const parGit = m.init('../../natif.git');
      expect(parGit.status, parGit.stderr).not.toBe(0);
      expect(parGit.url).toBe('');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(1);
      expect(r.stderr).toMatch(/vendor\/natif/);
      expect(m.lireConfig(), r.stderr).toBe(config);
      expect(existsSync(path.join(copie, 'vendor/natif/.git')), r.stderr).toBe(false);
    },
    LONG
  );
});
