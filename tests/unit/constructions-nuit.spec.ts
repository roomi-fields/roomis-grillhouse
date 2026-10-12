// grillhouse-3uv.67, critères 7, 16 and 17 at the night: the night (scripts/nuit.sh) builds once,
// through the one entry point (scripts/integration/constructions.mjs) under FORCER=1: it reads
// nothing from the store, builds everything, writes again what it builds, and its guards and
// suites do not build behind it. The trial project holds the frame's scripts, a list of guards
// with a build step as every project of the frame has (`grillhouse:gardes`, played by `pretest`),
// and the projects of ./constructions-essai.ts; each build appends its name to <repo>.builds.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  arbre,
  depot,
  fichiersPaquets,
  fichiersUnique,
  type Depot,
  type Fichiers,
} from './constructions-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'constructions-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 120_000;

// A guard or the tests of the trial: each appends <nom> to <repo>.joues; with <lit>, it refuses
// while the file <lit> (the build's output) is absent.
const etape = (nom: string, lit?: string) => `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.joues', '${nom}\\n');
${lit ? `if (!fs.existsSync('${lit}')) { console.error('${nom} : ${lit} absent'); process.exit(1); }` : ''}
`;

// <fichiers> with the guards and tests of the night: g1 before the build step, g2 after it
// (it reads <sortie>), the tests reading <sortie> too; without a lock file, which would make the
// night install the dependencies of its copy (npm ci).
function avecLaNuit(tous: Fichiers, sortie: string): Fichiers {
  const { 'package-lock.json': _verrou, ...fichiers } = tous;
  const pkg = JSON.parse(fichiers['package.json']!) as {
    scripts: Record<string, string>;
  };
  pkg.scripts = {
    ...pkg.scripts,
    test: 'node t.mjs',
    pretest: 'npm run --silent grillhouse:gardes',
    'grillhouse:gardes': 'node g1.mjs && npm run --silent --if-present build && node g2.mjs',
    'integration:gardes': 'node scripts/integration/gardes.mjs',
  };
  return {
    ...fichiers,
    'package.json': JSON.stringify(pkg, null, 2),
    'g1.mjs': etape('g1'),
    'g2.mjs': etape('g2', sortie),
    't.mjs': etape('t', sortie),
  };
}

function nuitDe(fichiers: Fichiers, sortie: string) {
  return nuitSur(depot(ESSAIS, avecLaNuit(fichiers, sortie)));
}

// The night of the trial repository <d>.
function nuitSur(d: Depot) {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  spawnSync('sh', ['-c', `printf '#!/bin/sh\\necho demo-12\\n' > ${bin}/bd && chmod +x ${bin}/bd`]);
  const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const journal = () => {
    const dossier = path.join(d.commun, 'nuit');
    const f = existsSync(dossier)
      ? spawnSync('ls', [dossier], { encoding: 'utf8' })
          .stdout.split('\n')
          .find(x => x.endsWith('.log'))
      : undefined;
    return f ? lire(path.join(dossier, f)) : '';
  };
  const nuit = () =>
    spawnSync('bash', [path.join(d.repo, 'scripts/nuit.sh')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PRINCIPAL: d.repo, FORCER: '' },
      timeout: 120_000,
    });
  const joues = () => lire(`${d.repo}.joues`).split('\n').filter(Boolean);
  const copie = path.join(d.repo, '.claude/worktrees/nuit');
  return { ...d, nuit, journal, joues, copie };
}

describe('critère 17 — the night builds once, through the entry point: its guards and suites do not build again', () => {
  it(
    'critère 17: a project without packages: the night builds its root once, and plays every guard and its tests',
    () => {
      const n = nuitDe(fichiersUnique(), 'dist/index.js');
      const faits = n.buildsDe(() => expect(n.nuit().status, n.journal()).toBe(0));
      expect(faits).toEqual(['racine']);
      expect(n.joues()).toEqual(['g1', 'g2', 't']);
    },
    LONG
  );
  it(
    "critère 17 et 16: a packages project: the night builds each package once, never the root's build, and plays every guard and its tests",
    () => {
      const n = nuitDe(
        fichiersPaquets('node scripts/integration/constructions.mjs'),
        'packages/c/dist/index.js'
      );
      const faits = n.buildsDe(() => expect(n.nuit().status, n.journal()).toBe(0));
      expect([...faits].sort()).toEqual(['a', 'b', 'c', 'e', 'f']);
      expect(n.joues()).toEqual(['g1', 'g2', 't']);
    },
    LONG
  );
});

describe('critère 27 — the night skips only the build of the pretest: a pretest that does something else plays whole', () => {
  it(
    'critère 27: a pretest that runs a step of its own before the guards plays whole at the night: that step, the guards, then the tests',
    () => {
      const tous = avecLaNuit(fichiersUnique(), 'dist/index.js');
      const pkg = JSON.parse(tous['package.json']!) as { scripts: Record<string, string> };
      pkg.scripts.pretest = 'node pre.mjs && npm run --silent grillhouse:gardes';
      const d = depot(ESSAIS, {
        ...tous,
        'package.json': JSON.stringify(pkg, null, 2),
        'pre.mjs': etape('pre'),
      });
      const n = nuitSur(d);
      expect(n.nuit().status, n.journal()).toBe(0);
      expect(n.joues()).toEqual(['pre', 'g1', 'g2', 't']);
    },
    LONG
  );
});

describe('critère 7 — the night builds everything without reading the store, and writes again what it builds', () => {
  it(
    'critère 7: a second night on the same commit builds again, though the store holds the build',
    () => {
      const n = nuitDe(fichiersUnique(), 'dist/index.js');
      expect(n.nuit().status, n.journal()).toBe(0);
      const faits = n.buildsDe(() => expect(n.nuit().status, n.journal()).toBe(0));
      expect(faits).toEqual(['racine']);
    },
    LONG
  );
  it(
    "critère 7: the night writes the store again: a file foreign to the build leaves the entry, and the main tree then restores the night's build",
    () => {
      const n = nuitDe(fichiersUnique(), 'dist/index.js');
      expect(n.nuit().status, n.journal()).toBe(0);
      const e = n.entree('', n.copie);
      n.ecrire('etranger.js', 'pas de la construction\n', e);
      expect(n.nuit().status, n.journal()).toBe(0);
      expect(arbre(e)).toEqual(arbre(path.join(n.copie, 'dist')));
      expect(n.buildsDe(() => expect(n.passage().status).toBe(0))).toEqual([]);
      expect(arbre(path.join(n.repo, 'dist'))).toEqual(arbre(e));
    },
    LONG
  );
});
