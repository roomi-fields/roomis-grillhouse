// grillhouse-3uv.95.3 — the enclosure of writing: an agent reads the whole copy, and writes only in
// the packages its plan names, as the module boundaries of Nx and the visibility of Bazel refuse
// a dependency while the code stays readable, and as a sandbox opens in writing only what it binds
// (`bwrap --ro-bind / --bind`). Witness: BPScript 320.9, where the reading enclosure (emptied
// directories, neighbours shown in part) caused most of the losses, while the writing enclosure
// and the guards held the architecture.
// Each case reads the plan of the envelope, the arguments of bwrap, on a disk described; bwrap
// itself and the lock of the agent in a repository of trial are the night's
// (packages/grillhouse-essais/tests/enveloppe.enceinte.nuit.spec.ts).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { montagesDeLaSeance, plan } from '../../scripts/enveloppe/enveloppe.mjs';
import {
  ecritsDuPlan,
  ecrireLaListe as ecrireLaListeNue,
  paquetsDeLEnveloppe,
  VARIABLE as VARIABLE_NUE,
} from '../../scripts/enveloppe/paquets-du-plan.mjs';
import { aVerifier } from '../../scripts/langages/typescript/interfaces-contre-code.mjs';

const VARIABLE = VARIABLE_NUE as string;
const ecrireLaListe = (paquets: string[]) => ecrireLaListeNue(paquets) as string;
const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
// A disk that holds the paths <presents>.
const disque = (presents: string[]) => {
  const ici = new Set(presents);
  return { existe: (p: string) => ici.has(p) };
};

const DE_LA_COPIE = [
  { dossier: 'packages/a', pkg: { name: 'a' }, hors: false },
  { dossier: 'packages/b', pkg: { name: 'b' }, hors: false },
  { dossier: 'packages/c', pkg: { name: 'c' }, hors: false },
  { dossier: 'packages/m', pkg: { name: 'm' }, hors: false },
];
const PRESENTS = [
  '/wt/packages/a',
  '/wt/packages/b',
  '/wt/packages/c',
  '/wt/packages/m',
  '/wt/packages/a/src',
  '/wt/.git',
  '/wt/.turbo',
  '/wt/.codegraph',
  '/wt/.rtfm',
  '/main/.codegraph',
  '/main/.beads',
  '/main/.turbo/cache',
  '/h/.claude',
];
const enceinteBrute = ({ paquets = ['packages/a', 'packages/b'], role = 'developpeur' } = {}) =>
  plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      paquets,
      role,
      matieres: ['packages/m'],
      magasins: ['/main/.turbo/cache'],
      // The outputs of TypeScript proper to the session (grillhouse-pkl.5: its module's).
      sorties: { ecrites: [], propres: ['.turbo', 'node_modules/.vite'] },
      paquetsDeLaCopie: DE_LA_COPIE,
      montages: montagesDeLaSeance({
        cacheNpm: '/h/.npm',
        claude: '/h/.claude',
        projet: '/h/.claude/projects/-wt',
        etatJetable: '/t/claude.json',
        scratchpads: '/tmp/claude-1/-wt',
      }),
    },
    disque(PRESENTS)
  );
// The plan, its arguments empty when it refuses.
const enceinte = (o?: { paquets?: string[]; role?: string }) => {
  const r = enceinteBrute(o);
  return { refus: r.refus, args: r.args ?? [] };
};

describe('grillhouse-3uv.95.3 — le plan de l’enceinte', () => {
  it('critère 1 — monte la copie entière en lecture seule, puis en écriture les seuls paquets du plan', () => {
    const { args, refus } = enceinte();
    expect(refus).toBeUndefined();
    expect(pairs(args, '--ro-bind')).toContain('/wt');
    const ecrits = pairs(args, '--bind');
    expect(ecrits).toContain('/wt/packages/a');
    expect(ecrits).toContain('/wt/packages/b');
    expect(ecrits).not.toContain('/wt/packages/c');
    expect(ecrits).not.toContain('/wt');
    expect(args.lastIndexOf('/wt/packages/a')).toBeGreaterThan(args.indexOf('/wt'));
  });

  it('critère 1 — ne cache rien de la copie : aucun dossier vidé, index compris', () => {
    const { args } = enceinte();
    const vides = pairs(args, '--tmpfs');
    for (const d of [
      '/wt/packages',
      '/main/packages',
      '/wt/.codegraph',
      '/wt/.rtfm',
      '/main/.codegraph',
    ]) {
      expect(vides, d).not.toContain(d);
    }
    // What stays proper to the session: /dev/shm, /tmp, the home, and Turborepo's outputs at the root.
    expect(vides).toEqual(['/dev/shm', '/tmp', '/h', '/wt/.turbo']);
    expect(pairs(args, '--remount-ro')).toEqual(['/h']);
  });

  it('critère 1 — garde .git en lecture seule, .beads et le cache de Turborepo en écriture', () => {
    const { args } = enceinte();
    expect(pairs(args, '--ro-bind')).toContain('/wt/.git');
    expect(pairs(args, '--bind')).toContain('/main/.beads');
    expect(pairs(args, '--bind')).toContain('/main/.turbo/cache');
  });

  it('critère 1 — la matière de test partagée s’écrit par le seul testwriter, même au plan', () => {
    expect(pairs(enceinte({ role: 'testwriter' }).args, '--bind')).toContain('/wt/packages/m');
    const dev = enceinte({ paquets: ['packages/a', 'packages/m'] }).args;
    expect(dev.lastIndexOf('/wt/packages/m')).toBeGreaterThan(dev.indexOf('--bind'));
    expect(pairs(dev, '--ro-bind').at(-1)).toBe('/wt/packages/m');
  });

  it('critère 1 — un chemin du plan dans un paquet écrit ce paquet ; un chemin hors des paquets, la copie', () => {
    expect(ecritsDuPlan(['packages/a/src', 'packages/b'], DE_LA_COPIE)).toEqual([
      'packages/a',
      'packages/b',
    ]);
    expect(ecritsDuPlan(['scripts', 'packages/a'], DE_LA_COPIE)).toEqual(['.']);
    expect(ecritsDuPlan(['.'], DE_LA_COPIE)).toEqual(['.']);
    const { args } = enceinte({ paquets: ['packages/a/src'] });
    expect(pairs(args, '--bind')).toContain('/wt/packages/a');
  });

  it('critère 1 — refuse un plan vide, et un chemin du plan qui n’existe pas', () => {
    expect(enceinte({ paquets: [] }).refus).toMatch(/aucun paquet/);
    expect(enceinte({ paquets: ['packages/a', 'packages/z'] }).refus).toBe(
      "Le composant /wt/packages/z n'existe pas."
    );
  });
});

describe('grillhouse-3uv.95.3 — GRILLHOUSE_ENVELOPPE porte la liste', () => {
  it('critère 3 — la variable se lit comme une liste, absente hors de l’enveloppe', () => {
    const texte = ecrireLaListe(['packages/a', 'packages/b']);
    expect(paquetsDeLEnveloppe({ [VARIABLE]: texte })).toEqual(['packages/a', 'packages/b']);
    expect(paquetsDeLEnveloppe({ [VARIABLE]: 'packages/a' })).toEqual(['packages/a']);
    expect(paquetsDeLEnveloppe({})).toBeNull();
    expect(paquetsDeLEnveloppe({ [VARIABLE]: '' })).toBeNull();
  });
});

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'enveloppe-enceinte-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('grillhouse-3uv.95.3 — les composants que juge une garde dans l’enveloppe', () => {
  const repo = mkdtempSync(path.join(ESSAIS, 'composants-'));
  for (const n of ['a', 'b', 'c']) {
    mkdirSync(path.join(repo, 'packages', n, 'docs'), { recursive: true });
    writeFileSync(path.join(repo, 'packages', n, 'package.json'), JSON.stringify({ name: n }));
  }
  it('critère 3 — une garde juge chaque composant de la liste', () => {
    const env = { [VARIABLE]: ecrireLaListe(['packages/a', 'packages/c']) };
    expect(aVerifier(repo, env).map(c => path.basename(c.dir))).toEqual(['a', 'c']);
    expect(aVerifier(repo, {}).map(c => path.basename(c.dir))).toEqual(['a', 'b', 'c']);
  });
});
