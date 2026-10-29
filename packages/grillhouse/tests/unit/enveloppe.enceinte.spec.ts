// grillhouse-3uv.95.3 — the enclosure of writing: an agent reads the whole copy, and writes only in
// the packages its plan names, as the module boundaries of Nx and the visibility of Bazel refuse
// a dependency while the code stays readable, and as a sandbox opens in writing only what it binds
// (`bwrap --ro-bind / --bind`). Witness: BPScript 320.9, where the reading enclosure (emptied
// directories, neighbours shown in part) caused most of the losses, while the writing enclosure
// and the guards held the architecture.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { CODE_REFUS } from '../../scripts/enveloppe/codes.mjs';
import { montagesDeLaSeance, plan } from '../../scripts/enveloppe/enveloppe.mjs';
import {
  ecritsDuPlan,
  ecrireLaListe as ecrireLaListeNue,
  paquetsDeLEnveloppe,
  VARIABLE as VARIABLE_NUE,
} from '../../scripts/enveloppe/paquets-du-plan.mjs';
import { aVerifier } from '../../scripts/langages/typescript/interfaces-contre-code.mjs';
import { LANGAGE, SCRIPT, enveloppeEssai } from './enveloppe-essai.js';

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
const enceinte = ({ paquets = ['packages/a', 'packages/b'], role = 'developpeur' } = {}) =>
  plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      paquets,
      role,
      matieres: ['packages/m'],
      magasins: ['/main/.turbo/cache'],
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

// The real envelope replaces /tmp with an empty directory: its repositories live outside it.
const ESSAIS = racineSousLaMaison('grillhouse-essais-enceinte-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('grillhouse-3uv.95.3 — les composants que juge une garde dans l’enveloppe', () => {
  const { essai } = enveloppeEssai(ESSAIS);
  const repo = essai('composants-');
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

describe.runIf(canWrap)('grillhouse-3uv.95.3 — l’enceinte sur le disque', () => {
  const { essai } = enveloppeEssai(ESSAIS);
  const repo = essai('enceinte-');
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    writeFileSync(path.join(repo, f), t);
  };
  ecrire(
    'package.json',
    JSON.stringify({ name: 'essai', workspaces: ['packages/*'], grillhouse: LANGAGE })
  );
  for (const n of ['a', 'b', 'c']) {
    ecrire(`packages/${n}/package.json`, JSON.stringify({ name: n }));
    ecrire(`packages/${n}/src/${n}.ts`, `source-${n}`);
  }
  ecrire('.beads/config.yaml', '');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'init');
  const copie = path.join(repo, '.claude/worktrees/demo-1');
  git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
  // An index of the copy, as codegraph and rtfm keep one.
  mkdirSync(path.join(copie, '.codegraph'));
  writeFileSync(path.join(copie, '.codegraph/index.db'), 'index');
  const home = essai('home-');
  mkdirSync(path.join(home, '.claude/projects'), { recursive: true });

  const run = (shell: string, paquets = 'packages/a:packages/b') =>
    spawnSync('node', [SCRIPT, copie, paquets, 'developpeur', '--', 'bash', '-c', shell], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, LC_ALL: 'C' },
    });

  it('critère 1 — l’agent lit toute la copie : le code d’un paquet hors du plan et l’index', () => {
    const r = run('cat packages/c/src/c.ts .codegraph/index.db');
    expect(r.stdout, r.stderr).toBe('source-cindex');
  });

  it('critère 1 — l’agent écrit chaque paquet du plan, et la base des tickets', () => {
    const r = run(`touch packages/a/src/x.ts packages/b/src/x.ts ${repo}/.beads/x`);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(copie, 'packages/b/src/x.ts'))).toBe(true);
  });

  it('critère 2 — une écriture hors des paquets du plan échoue au montage : un autre paquet, la racine, .git', () => {
    for (const f of ['packages/c/src/c.ts', 'racine.txt', '.git']) {
      const r = run(`echo x >> ${f}`);
      expect(r.status, f).not.toBe(0);
      expect(r.stderr, f).toContain('Read-only file system');
    }
    expect(readFileSync(path.join(copie, 'packages/c/src/c.ts'), 'utf8')).toBe('source-c');
  });

  it('critère 3 — la séance reçoit la liste dans GRILLHOUSE_ENVELOPPE', () => {
    expect(run('printenv GRILLHOUSE_ENVELOPPE').stdout.trim()).toBe('packages/a:packages/b');
  });

  it('critère 1 — refuse un chemin du plan qui n’existe pas', () => {
    const r = run('true', 'packages/a:packages/z');
    expect(r.status).toBe(CODE_REFUS);
    expect(r.stderr).toContain('Le composant');
  });
});

// The lock of the agent (scripts/verrous/verrou.mjs), a hook of its session, reads the plan in the
// envelope's variable: a write out of the plan's packages stops the session, as Claude Code's
// `continue: false` ends it, with the package named, and leaves its mark in the session's working
// directory, which the launcher hands to the circuit.
const VERROU = path.resolve(__dirname, '../../scripts/verrous/verrou.mjs');
describe('grillhouse-3uv.95.3 — le crochet de l’agent et le plan', () => {
  const { essai } = enveloppeEssai(ESSAIS);
  const repo = essai('crochet-');
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    writeFileSync(path.join(repo, f), t);
  };
  ecrire(
    'package.json',
    JSON.stringify({ name: 'essai', workspaces: ['packages/*'], grillhouse: LANGAGE })
  );
  for (const n of ['a', 'b', 'c']) {
    ecrire(`packages/${n}/package.json`, JSON.stringify({ name: n }));
  }
  spawnSync('git', ['init', '-q'], { cwd: repo });
  const ecrireAvec = (role: string, rel: string, liste: string | null) => {
    const tmp = essai('tmp-');
    const env: Record<string, string | undefined> = { ...process.env, TMPDIR: tmp };
    delete env[VARIABLE];
    if (liste !== null) {
      env[VARIABLE] = liste;
    }
    const input = {
      tool_name: 'Write',
      tool_input: { file_path: path.join(repo, rel), content: 'x' },
      cwd: repo,
    };
    const r = spawnSync('node', [VERROU, role], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      env,
    });
    const marque = path.join(tmp, 'hors-plan');
    return { ...r, marque: existsSync(marque) ? readFileSync(marque, 'utf8') : null };
  };

  it('critère 2 — une écriture hors des paquets du plan arrête la séance, le paquet nommé', () => {
    const r = ecrireAvec('testwriter', 'packages/c/test/x.test.ts', 'packages/a:packages/b');
    expect(r.status, r.stderr).toBe(0);
    const sortie = JSON.parse(r.stdout) as {
      continue: boolean;
      stopReason: string;
      hookSpecificOutput: Record<string, string>;
    };
    expect(sortie.continue).toBe(false);
    expect(sortie.stopReason).toContain('hors-plan');
    expect(sortie.stopReason).toContain('packages/c');
    expect(sortie.hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
    });
    expect(r.marque).toBe(sortie.stopReason);
  });

  it('critère 2 — une écriture dans un paquet du plan suit la règle de son rôle, sans arrêt', () => {
    const r = ecrireAvec('testwriter', 'packages/b/test/x.test.ts', 'packages/a:packages/b');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.marque).toBeNull();
    const code = ecrireAvec('testwriter', 'packages/b/src/x.ts', 'packages/a:packages/b');
    expect(code.status).toBe(2);
    expect(code.marque).toBeNull();
  });

  it('critère 2 — hors de l’enveloppe, aucun plan ne borne l’écriture', () => {
    const r = ecrireAvec('testwriter', 'packages/c/test/x.test.ts', null);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('');
  });
});
