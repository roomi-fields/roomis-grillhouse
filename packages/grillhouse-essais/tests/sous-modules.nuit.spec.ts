import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { git, LANCER, SCRIPTS, INTEGRER, LONG, sousModulesEssai } from './sous-modules-essai.js';
import { RACINE, valeursDe } from './cadre.js';

const { CODE_COPIE } = valeursDe('scripts/enveloppe/codes.mjs', ['CODE_COPIE']) as {
  CODE_COPIE: number;
};

// grillhouse-3uv.29: the working copies set their submodules. Three places create a working copy
// — the integration copy (scripts/integration/integrer.mjs, step 4), the agent copy
// (scripts/enveloppe/lancer.sh) and the night copy (scripts/nuit.sh) — and one preparation, called
// by the three, sets the submodules at the commit the superproject references, before any
// installation or build (actions/checkout `submodules: recursive`, `git submodule update --init
// --recursive`).
//
// This file: the preparation of each copy (grillhouse-3uv.29) and a submodule at a local address
// (grillhouse-3uv.52). The shared submodules (grillhouse-3uv.58.1) are tested in
// sous-modules.partage and sous-modules.montage, the addresses of the submodules
// (grillhouse-3uv.69) in sous-modules.adresses.
// The worlds of trial and the frame's scripts they run: ./sous-modules-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'sous-modules-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { CONFIG_GLOBALE, gitScripts, monde } = sousModulesEssai(ESSAIS);

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
