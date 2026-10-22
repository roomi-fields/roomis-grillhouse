// Ticket grillhouse-3uv.93: the trials live under the base of their pass, removed at its end and
// swept when orphan (scripts/vitest-config/base-de-passe.mjs), as Bazel gives each test its
// temporary directory (TEST_TMPDIR) under the base of its run and cleans the sandboxes a killed
// run leaves.
// Witness (2026-10-22): /tmp full at 100 % of its files (1 044 112 of 1 048 576), a command
// failed; 1 912 trial directories over 2 h old removed by hand (`trace-`, `lectures-` from the
// tests of BPScript's corpus; `circuit-`, `integration-`, `enveloppe-`… from the frame's tests
// and circuit), and 18 835 directories of /tmp/claude-1000 that the envelope of a test's trial
// copies left, Claude Code's scratchpads root hard-wired to /tmp.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dossierDeTravail } from '../../scripts/enveloppe/enveloppe.mjs';
import { ouvrirBase } from '../../scripts/vitest-config/base-de-passe.mjs';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { CIRCUIT, circuitEssai } from './circuit-essai.js';

const DEPOT = path.resolve(__dirname, '../..');
const RACINE = path.resolve(DEPOT, '../..');
const MODULE = path.join(DEPOT, 'scripts/vitest-config/base-de-passe.mjs');
const BASE = path.join(DEPOT, 'scripts/vitest-config/base.mjs');
const VITEST = path.join(RACINE, 'node_modules/vitest/vitest.mjs');
const INTEGRER = path.join(DEPOT, 'scripts/integration/integrer.mjs');
const ESSAI_DE_PROJET = path.join(__dirname, 'base-de-passe.essai.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'base-de-passe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
// The circuit's trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS_CIRCUIT = racineSousLaMaison('grillhouse-essais-base-de-passe-');
afterAll(() => rmSync(ESSAIS_CIRCUIT, { recursive: true, force: true }));
const LONG = 120_000;

// The environment of a process the test plays: this one's, without what Vitest set for itself.
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS' && !k.startsWith('GRILLHOUSE_')
  )
);

const noms = (dans: string, prefixe: string) =>
  readdirSync(dans).filter(n => n.startsWith(prefixe));

// A base of <genre> in <dans> whose pass was killed: a process opens it, then dies by SIGKILL,
// never removing it. Its path.
function baseTuee(dans: string, genre: string): string {
  const avant = new Set(noms(dans, `grillhouse-${genre}-`));
  const r = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { ouvrirBase } from ${JSON.stringify(MODULE)};\nouvrirBase(${JSON.stringify(genre)}, { dans: ${JSON.stringify(dans)} });\nprocess.kill(process.pid, 'SIGKILL');`,
    ],
    { encoding: 'utf8' }
  );
  expect(r.signal, r.stderr).toBe('SIGKILL');
  const neuves = noms(dans, `grillhouse-${genre}-`).filter(n => !avant.has(n));
  expect(neuves).toHaveLength(1);
  return path.join(dans, neuves[0] ?? '');
}

describe('critères 3 et 5 — a pass sweeps the orphan bases and never touches a living one', () => {
  it('critère 5: the base of a killed pass is swept; a living base, a base being made and a trial directory stay', () => {
    const dans = mkdtempSync(path.join(ESSAIS, 'balayage-'));
    // The living base first: opening a base sweeps.
    const vivante = ouvrirBase('vivante', { dans });
    const orpheline = baseTuee(dans, 'tuee');
    // A directory of the prefix without an owner: a trial directory, or a base being made.
    const essai = path.join(dans, 'grillhouse-essai-x');
    mkdirSync(essai);
    expect(existsSync(orpheline)).toBe(true);

    const passe = ouvrirBase('passe', { dans });

    expect(existsSync(orpheline)).toBe(false);
    expect(existsSync(vivante.dossier)).toBe(true);
    expect(existsSync(essai)).toBe(true);
    expect(path.dirname(passe.dossier)).toBe(passe.base);
    expect(path.dirname(passe.base)).toBe(dans);
    expect(path.basename(passe.base)).toMatch(/^grillhouse-passe-/);
    expect(existsSync(passe.dossier)).toBe(true);
    passe.fermer();
    vivante.fermer();
    expect(existsSync(passe.base)).toBe(false);
    expect(existsSync(vivante.base)).toBe(false);
  });

  it.runIf(canWrap)(
    'critère 3: a pass in another PID namespace (an envelope) leaves a base whose owner lives outside it',
    () => {
      const dans = mkdtempSync(path.join(ESSAIS, 'espace-'));
      const vivante = ouvrirBase('vivante', { dans });
      const r = spawnSync(
        'bwrap',
        [
          '--dev-bind',
          '/',
          '/',
          '--unshare-pid',
          '--proc',
          '/proc',
          process.execPath,
          '--input-type=module',
          '-e',
          `import { ouvrirBase } from ${JSON.stringify(MODULE)};\nouvrirBase('dedans', { dans: ${JSON.stringify(dans)} }).fermer();`,
        ],
        { encoding: 'utf8' }
      );
      expect(r.status, r.stderr).toBe(0);
      expect(existsSync(vivante.dossier)).toBe(true);
      expect(noms(dans, 'grillhouse-dedans-')).toEqual([]);
      vivante.fermer();
    }
  );
});

// A trial project of the base configuration, in the pool of child processes (Vitest's default),
// which keeps the modules it transforms in Vitest's own temporary directory: its one test file is
// ./base-de-passe.essai.mjs, the code of a project's test as it stands.
function projet(): string {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  symlinkSync(path.join(RACINE, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  writeFileSync(
    path.join(r, 'package.json'),
    '{ "name": "essai", "private": true, "type": "module" }\n'
  );
  writeFileSync(
    path.join(r, 'vitest.config.mjs'),
    `import { mergeConfig } from 'vitest/config';\nimport base from ${JSON.stringify(BASE)};\nexport default mergeConfig(base, { test: { include: ['*.test.mjs'], pool: 'forks' } });\n`
  );
  writeFileSync(path.join(r, 'essai.test.mjs'), readFileSync(ESSAI_DE_PROJET, 'utf8'));
  return r;
}

// The directory <dans>, literal in a regular expression.
const motif = (dans: string) => dans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('critères 1, 2 et 6 — each run of Vitest gives its tests a directory of its base, removed at its end', () => {
  for (const [cas, rouge, code] of [
    ['green', false, 0],
    ['red', true, 1],
  ] as const) {
    it(
      `critères 1, 2 et 6: a ${cas} run: TMPDIR of the test is under the base of the run, which goes after it with the trial directory the test left`,
      () => {
        const dans = mkdtempSync(path.join(ESSAIS, 'vitest-'));
        const orpheline = baseTuee(dans, 'vitest');
        const sonde = path.join(ESSAIS, `sonde-${cas}.json`);
        const r = spawnSync(process.execPath, [VITEST, 'run'], {
          cwd: projet(),
          env: { ...ENV, TMPDIR: dans, SONDE: sonde, ...(rouge ? { ROUGE: '1' } : {}) },
          encoding: 'utf8',
        });
        expect(r.status, r.stdout + r.stderr).toBe(code);
        const env = JSON.parse(readFileSync(sonde, 'utf8')) as Record<string, string | undefined>;
        expect(env.TMPDIR).toMatch(new RegExp(`^${motif(dans)}/grillhouse-vitest-[^/]+/t$`));
        expect(existsSync(orpheline)).toBe(false);
        // Nothing stays: neither the base, nor the trial directory the test made and left in it.
        expect(readdirSync(dans)).toEqual([]);
      },
      LONG
    );
  }

  it(
    "critères 3, 6 et 7: a run killed leaves its base alone, with the test's trial directory and Vitest's own temporary directory (/tmp/<nanoid>/ssr) in it, which the next pass sweeps",
    async () => {
      const dans = mkdtempSync(path.join(ESSAIS, 'tue-'));
      const sonde = path.join(ESSAIS, 'sonde-tue.json');
      const vitest = spawn(process.execPath, [VITEST, 'run'], {
        cwd: projet(),
        env: { ...ENV, TMPDIR: dans, SONDE: sonde, ATTENDRE: '15000' },
        stdio: 'ignore',
      });
      const fin = new Promise(ok => vitest.on('exit', ok));
      for (let i = 0; i < 600 && !existsSync(sonde); i++) {
        await new Promise(ok => setTimeout(ok, 100));
      }
      expect(existsSync(sonde)).toBe(true);
      // The test makes its trial directory right after its probe.
      await new Promise(ok => setTimeout(ok, 500));
      vitest.kill('SIGKILL');
      await fin;
      // What the main process of Vitest and its test process wrote lives in the base, nothing
      // beside it.
      const restes = readdirSync(dans);
      expect(restes).toHaveLength(1);
      expect(restes[0]).toMatch(/^grillhouse-vitest-/);
      const t = path.join(dans, restes[0] ?? '', 't');
      const dedans = readdirSync(t);
      expect(dedans.some(n => n.startsWith('trace-'))).toBe(true);
      expect(dedans.filter(n => existsSync(path.join(t, n, 'ssr')))).toHaveLength(1);
      ouvrirBase('passe', { dans }).fermer();
      expect(readdirSync(dans)).toEqual([]);
    },
    LONG
  );
});

// Claude Code keeps its temporary directory under CLAUDE_CODE_TMPDIR, else Node's temporary
// directory (its code, 2.1.308): a claude a test launches writes under the base of the pass, and
// so does the envelope of a trial copy, which keeps the scratchpads where Claude Code keeps them.
describe('critère 8 — the scratchpads of an envelope lie where Claude Code keeps them, under the base of the pass', () => {
  const copie = '/depot/.claude/worktrees/demo-1';
  const enTirets = '-depot--claude-worktrees-demo-1';
  const uid = `claude-${process.getuid?.()}`;
  it('critère 8: under the temporary directory of the launch (TMPDIR), as Node reads it', () => {
    expect(dossierDeTravail(copie, { TMPDIR: '/base/t' })).toBe(
      path.join('/base/t', uid, enTirets, 'travail')
    );
    expect(dossierDeTravail(copie, {})).toBe(path.join('/tmp', uid, enTirets, 'travail'));
  });
  it("critère 8: under CLAUDE_CODE_TMPDIR when the launch names it, Claude Code's own variable", () => {
    expect(dossierDeTravail(copie, { TMPDIR: '/base/t', CLAUDE_CODE_TMPDIR: '/claude' })).toBe(
      path.join('/claude', uid, enTirets, 'travail')
    );
  });
});

describe('critère 4 — the working directory of an integration and of a circuit is a base', () => {
  it(
    'critère 4: an integration sweeps the orphan bases, leaves a living one, and removes its own at its end',
    () => {
      const dans = mkdtempSync(path.join(ESSAIS, 'integration-'));
      const vivante = ouvrirBase('vivante', { dans });
      const orpheline = baseTuee(dans, 'integration');
      const repo = mkdtempSync(path.join(ESSAIS, 'depot-'));
      expect(spawnSync('git', ['init', '-q', repo]).status).toBe(0);
      const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
      // A Beads that does not read: the integration stops at its first step, after its start.
      writeFileSync(path.join(bin, 'bd'), '#!/bin/sh\necho illisible >&2\nexit 1\n', {
        mode: 0o755,
      });
      const message = path.join(bin, 'message');
      writeFileSync(message, 'feat: x (demo-1)\n');
      const lot = path.join(bin, 'code.patch');
      writeFileSync(lot, '');
      const args = ['--ticket', 'demo-1', '--code', lot, '--message', message];
      const r = spawnSync(process.execPath, [INTEGRER, ...args], {
        cwd: repo,
        env: { ...ENV, TMPDIR: dans, PATH: `${bin}:${process.env.PATH}` },
        encoding: 'utf8',
      });
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain('illisible');
      expect(existsSync(orpheline)).toBe(false);
      expect(existsSync(vivante.dossier)).toBe(true);
      expect(noms(dans, 'grillhouse-integration-')).toEqual([]);
      vivante.fermer();
    },
    LONG
  );

  describe.runIf(canWrap)('the circuit', () => {
    const { REPO, ENV, ticket, circuit, scenario, etat, sessions } = circuitEssai(ESSAIS_CIRCUIT);
    it(
      'critère 4: a circuit sweeps the orphan bases, leaves a living one, and removes its own at its end',
      () => {
        const dans = mkdtempSync(path.join(ESSAIS, 'circuit-'));
        const vivante = ouvrirBase('vivante', { dans });
        const orpheline = baseTuee(dans, 'circuit');
        const id = 'demo-base';
        ticket(id, '000-forms');
        // A resumption without a state stops once the circuit has made its working directory.
        const r = circuit([id, '--reprendre'], { TMPDIR: dans });
        expect(r.status, r.stdout + r.stderr).toBe(2);
        expect(existsSync(orpheline)).toBe(false);
        expect(existsSync(vivante.dossier)).toBe(true);
        expect(noms(dans, 'grillhouse-circuit-')).toEqual([]);
        vivante.fermer();
      },
      LONG
    );

    // grillhouse-3uv.94: the working directory of the circuit lives as long as its ticket, as the
    // workspace of a pipeline of Jenkins or GitLab, cleaned at the end of the pipeline, never by a
    // neighbour. Witness (BP 325, 2026-10-22): a reviewer's session, out of the envelope, outlived
    // its killed circuit and lost the circuit's working directory when another pass swept it.
    it(
      'grillhouse-3uv.94 critères 1, 2, 4 et 5: a killed circuit, then a sweep, leave the working directory of the ticket, named after it; the circuit relaunched takes it up again, and the base of each run is swept',
      async () => {
        const dans = mkdtempSync(path.join(ESSAIS_CIRCUIT, 'tmp-'));
        const id = 'demo-travail';
        const copie = ticket(id, '000-forms');
        const travail = `${copie}.travail`;
        scenario(id, 'testwriter', 'sleep 120\n');
        const consignes = () =>
          (existsSync(travail) ? readdirSync(travail) : [])
            .map(n => /^consigne-(\d+)\.md$/.exec(n)?.[1])
            .filter((n): n is string => n !== undefined)
            .map(Number)
            .sort((a, b) => a - b);
        // A run of the circuit killed once its <n>-th testwriter's session runs, with that session.
        const tuer = async (n: number) => {
          const p = spawn('node', [CIRCUIT, id], {
            cwd: REPO,
            env: { ...ENV, TMPDIR: dans },
            stdio: 'ignore',
          });
          const fin = new Promise(ok => p.on('close', ok));
          let groupe = 0;
          for (let i = 0; i < 900 && !groupe; i++) {
            await new Promise(ok => setTimeout(ok, 200));
            const e = etat(id);
            if (e?.etape === 'testwriter' && e.seance && sessions(id, 'testwriter') === n) {
              groupe = e.seance;
            }
          }
          expect(groupe, `la séance du testwriter ${n} tourne`).toBeGreaterThan(0);
          p.kill('SIGKILL');
          await fin;
          try {
            process.kill(-groupe, 'SIGKILL');
          } catch {
            // The session already ended.
          }
        };

        await tuer(1);
        const premiers = consignes();
        expect(premiers.length).toBeGreaterThan(0);
        // Another pass opens its base: it sweeps the killed run's base, never the ticket's directory.
        ouvrirBase('balai', { dans }).fermer();
        expect(noms(dans, 'grillhouse-circuit-')).toEqual([]);
        expect(existsSync(travail)).toBe(true);
        expect(consignes()).toEqual(premiers);

        // The circuit relaunched writes in the same directory, after what the killed run left.
        await tuer(2);
        const ensuite = consignes();
        expect(ensuite).toEqual(expect.arrayContaining(premiers));
        expect(Math.max(...ensuite)).toBeGreaterThan(Math.max(...premiers));
        ouvrirBase('balai', { dans }).fermer();
        expect(noms(dans, 'grillhouse-circuit-')).toEqual([]);
        expect(existsSync(travail)).toBe(true);
      },
      LONG * 3
    );
  });
});

// The frame's scripts that make a temporary directory, as « file: name »: each one a `mkdtempSync`
// whose result a name holds (`const x = mkdtempSync(`, `x = mkdtempSync(`, `x ??= mkdtempSync(`).
function creations(): { fichier: string; nom: string; source: string }[] {
  const out: { fichier: string; nom: string; source: string }[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(DEPOT, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        parcourir(r);
      } else if (/\.m?js$/.test(e.name)) {
        const source = readFileSync(path.join(DEPOT, r), 'utf8');
        for (const m of source.matchAll(/(\w+) (?:\?\?)?= mkdtempSync\(/g)) {
          out.push({ fichier: r, nom: m[1] ?? '', source });
        }
      }
    }
  };
  parcourir('scripts');
  return out;
}

// The directories a script makes without removing them itself, each with its reason: the base,
// which `fermer` removes; the progress directory, which its caller removes (scripts/verifier.mjs)
// or which lives in the base of the circuit's run; the results of a pass of the circuit, in that
// base.
const HORS_DU_SCRIPT = new Set([
  'scripts/vitest-config/base-de-passe.mjs: base',
  'scripts/avancement.mjs: dossier',
  'scripts/circuit.mjs: dossier',
]);

describe('critère 9 — a script of the frame that makes a temporary directory removes it at its end', () => {
  it('critère 9: every directory a script makes, it removes (retirer-copie-, sous-modules-, pre-push-nuit-, grillhouse-maj-, nuit- are the roots of tests, which the base of the pass removes)', () => {
    const faites = creations();
    expect(faites.length).toBeGreaterThan(5);
    const restent = faites
      .filter(({ fichier, nom }) => !HORS_DU_SCRIPT.has(`${fichier}: ${nom}`))
      .filter(
        ({ nom, source }) => !source.includes(`rmSync(${nom}, { recursive: true, force: true })`)
      )
      .map(({ fichier, nom }) => `${fichier}: ${nom}`);
    expect(restent).toEqual([]);
    // The results and progress of the circuit's passes live in the base of its run, which it
    // removes at its end (grillhouse-3uv.94: its working directory is the ticket's).
    const circuit = readFileSync(path.join(DEPOT, 'scripts/circuit.mjs'), 'utf8');
    expect(circuit).toContain("mkdtempSync(path.join(ctx.base.dossier, 'resultats-'))");
    expect(circuit).toContain('dans: ctx.base.dossier');
    expect(circuit).toContain('ctx?.base.fermer();');
    // The progress directory of a pass of its own goes at the end of the pass.
    expect(readFileSync(path.join(DEPOT, 'scripts/verifier.mjs'), 'utf8')).toContain(
      'rmSync(dossier, { recursive: true, force: true })'
    );
  });
});
