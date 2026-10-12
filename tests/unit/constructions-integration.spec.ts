// grillhouse-3uv.67, critères 16, 4 and 10 at the integration and the queue: the build of the
// replay (scripts/integration/rejeu.mjs, `construire`) goes through the one entry point
// (scripts/integration/constructions.mjs): each package whose fingerprint is in the store is
// restored, the others are built, in order, and the root's build never runs in a packages project.
// The trial project is the integration's (./integration-essai.ts) with the packages of
// ./constructions-essai.ts; each build appends its name to <repo>.builds.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  arbre,
  depot,
  fichiersPaquets,
  fichiersUnique,
  scriptsDuCadre,
} from './constructions-essai.js';
import { chantier } from './integration-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'constructions-integration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 180_000;

// The integration's trial project holding the packages project in the place of its components:
// its suites and guards stay the trial's (they read no build), its root build only says it ran.
function chantierPaquets() {
  const m = chantier(ESSAIS);
  const pkg = JSON.parse(readFileSync(path.join(m.repo, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  // Without a lock file: the replay would install the dependencies of the copy (npm ci).
  const { 'package-lock.json': _verrou, ...fichiers } = fichiersPaquets();
  const racine = JSON.parse(fichiers['package.json']!) as { scripts: Record<string, string> };
  fichiers['package.json'] = JSON.stringify(
    { ...racine, scripts: { ...pkg.scripts, ...racine.scripts } },
    null,
    2
  );
  // The trial's src/a, src/b and src/c leave: a component is named by its directory, and they
  // would bear the names of packages/a, packages/b and packages/c.
  m.poser(
    {
      ...scriptsDuCadre(),
      ...fichiers,
      'src/a/index.ts': null,
      'src/b/index.ts': null,
      'src/c/index.ts': null,
    },
    'paquets'
  );
  const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const builds = () => lire(`${m.repo}.builds`).split('\n').filter(Boolean);
  const buildsDe = (faire: () => unknown) => {
    const avant = builds().length;
    faire();
    return builds().slice(avant);
  };
  return { ...m, builds, buildsDe };
}

describe('critère 16 — the integration builds through the entry point', () => {
  it(
    'critère 16: an integration builds main once per package, then only the packages its lot changes; the next integration on the same main restores main',
    () => {
      const m = chantierPaquets();
      m.ticket('demo-1', { 'packages/c/src/y.ts': 'export const y = 1;\n' });
      const premiere = m.buildsDe(() => m.livrer('demo-1'));
      expect([...premiere].sort()).toEqual(['a', 'b', 'c', 'c', 'e', 'f']);
      m.ticket('demo-2', { 'packages/e/src/z.ts': 'export const z = 1;\n' });
      expect(m.buildsDe(() => m.livrer('demo-2'))).toEqual(['e']);
    },
    LONG
  );
  it(
    "critère 10: at the integration, the root's build of a packages project never runs",
    () => {
      const m = chantierPaquets();
      m.ticket('demo-1', { 'packages/a/src/y.ts': 'export const y = 1;\n' });
      m.livrer('demo-1');
      expect(m.builds()).not.toContain('racine');
    },
    LONG
  );
  it(
    'critère 16: the queue replaying a branch on a main that moved restores the builds its integration and the previous one stored, building nothing',
    () => {
      const m = chantierPaquets();
      m.ticket('demo-1', { 'packages/c/src/y.ts': 'export const y = 1;\n' });
      m.ticket('demo-2', { 'packages/e/src/z.ts': 'export const z = 1;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      const faits = m.buildsDe(() => {
        const r = m.file();
        expect(r.status, r.stdout + r.stderr).toBe(0);
      });
      expect(m.sujets()[0]).toBe('feat: lot (demo-2)');
      expect(faits).toEqual([]);
    },
    LONG
  );
});

// The preparation of an agent's copy (scripts/enveloppe/lancer.sh) on a project without packages
// whose content is already stored: the copy is made from main as it is committed.
describe("critère 26 — the preparation of an agent's copy builds through the entry point", () => {
  it(
    "critère 26: an agent's copy whose content is already in the store restores its build without building",
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      d.commiter({ '.claude/agents/testeur.md': '---\nname: testeur\n---\n' });
      expect(d.buildsDe(() => expect(d.passage().status).toBe(0))).toEqual(['racine']);
      const consigne = path.join(mkdtempSync(path.join(ESSAIS, 'consigne-')), 'consigne.txt');
      writeFileSync(consigne, 'TON TICKET : demo-1 — un sujet.');
      const copie = path.join(d.repo, '.claude/worktrees/demo-1');
      const lancer = path.join(d.repo, 'scripts/enveloppe/lancer.sh');
      const faits = d.buildsDe(() =>
        spawnSync('bash', [lancer, 'demo-1', 'testeur', 'src/a', consigne], {
          cwd: d.repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CLAUDE_BIN: 'true',
            HOME: mkdtempSync(path.join(ESSAIS, 'home-')),
            PRINCIPAL: d.repo,
            FORCER: '',
          },
          timeout: 120_000,
        })
      );
      expect(faits, readFileSync(`${copie}.log`, 'utf8')).toEqual([]);
      expect(arbre(path.join(copie, 'dist'))).toEqual(arbre(path.join(d.repo, 'dist')));
    },
    LONG
  );
});
