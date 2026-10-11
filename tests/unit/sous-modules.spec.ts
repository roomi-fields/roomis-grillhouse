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
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap } from '../machine.js';
import { CODE_COPIE } from '../../scripts/enveloppe/codes.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'sous-modules-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.resolve(__dirname, '../..');
const SCRIPTS = path.join(RACINE, 'scripts');
const INTEGRER = path.join(SCRIPTS, 'integration/integrer.mjs');
const LANCER = path.join(SCRIPTS, 'enveloppe/lancer.sh');
const LONG = 60_000;

// The file protocol is refused to submodule commands by default; the test repositories live on
// disk, so every process of these tests allows it, as a project's own remote would be allowed.
const ENV_GIT = {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'protocol.file.allow',
  GIT_CONFIG_VALUE_0: 'always',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
const git = (dir: string, ...a: string[]) =>
  execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...ENV_GIT } });

// A repository whose build succeeds only when its submodule vendor/natif is set, and records what
// it saw; with a fake Beads (every ticket ACCEPTÉ, every list empty). The submodule has two
// commits, `v1` then `v2`; the superproject references `v1`, the older one, so a copy that takes the
// submodule's tip instead of the referenced commit is seen.
function monde(avecSousModule = true) {
  const repo = mkdtempSync(path.join(ESSAIS, 'sousmod-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in show) echo '[{"id":"demo-1","labels":[]}]';; comments) echo '[{"text":"ACCEPTÉ"}]';; list) echo '[]';; create) echo demo-12;; esac\n`,
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
        test: 'node build.mjs',
        'integration:suites': 'node suites.mjs',
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
  writeFileSync(
    path.join(repo, 'suites.mjs'),
    "import fs from 'node:fs';\nfs.writeFileSync(process.env.ROUGES, '');\n"
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
    for (const v of ['v1', 'v2']) {
      writeFileSync(path.join(natif, 'natif.txt'), `${v}\n`);
      git(natif, 'add', '.');
      git(natif, 'commit', '-qm', v);
      commits.push(git(natif, 'rev-parse', 'HEAD').trim());
    }
    git(repo, 'submodule', 'add', '-q', natif, 'vendor/natif');
    git(path.join(repo, 'vendor/natif'), 'checkout', '-q', commits[0] ?? '');
    git(repo, 'add', 'vendor/natif');
    git(repo, 'commit', '-qm', 'natif v1');
  }
  const env = { ...process.env, ...ENV_GIT, PATH: `${bin}:${process.env.PATH}` };

  // A lot that adds a document outside every component.
  let n = 0;
  const lot = () => {
    n += 1;
    const f = `note-${n}.md`;
    writeFileSync(path.join(repo, f), `note ${n}\n`);
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
  writeFileSync(message, 'docs: une note (demo-1)\n');
  const integrer = () =>
    spawnSync('node', [INTEGRER, '--ticket', 'demo-1', '--code', lot(), '--message', message], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });
  const nuit = () =>
    spawnSync('bash', [path.join(repo, 'scripts/nuit.sh')], { encoding: 'utf8', env });
  const journalNuit = () => {
    const d = path.join(repo, '.git/nuit');
    return readdirSync(d)
      .filter(f => f.endsWith('.log'))
      .map(f => readFileSync(path.join(d, f), 'utf8'))
      .join('');
  };
  const consigne = path.join(bin, 'consigne.txt');
  writeFileSync(consigne, 'TON TICKET : demo-1 — un sujet.');
  const lancer = () =>
    spawnSync('bash', [LANCER, 'demo-1', 'developpeur', 'packages/a', consigne], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...env, CLAUDE_BIN: 'true' },
    });
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
