// grillhouse-3uv.34, critères 4 and 5: the night tests, a category beside the time budget benches
// (`*.budget.test.*`). A night test is a file `*.nuit.test.*` or `*.nuit.spec.*`: `npm test` and
// the integration of the day leave it out, the night (scripts/nuit.sh) plays it. The day keeps a
// fast guard against a fixed path shared between sessions (critère 2), played by `npm test`.
//
// Each case plays the real configuration of the repository (its package.json, its Vitest
// configuration, its scripts) in a project of trial whose test files append their name to TRACE.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
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
import { mettreAJour } from '../../scripts/grillhouse-maj.mjs';

// The trial directories of this run live in one root, removed at its end (critère 2).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-de-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../..');
const NUIT_RE = /\.nuit\.(test|spec)\.(c|m)?[jt]sx?$/;
const BUDGET_RE = /\.budget\.(test|spec)\.(c|m)?[jt]sx?$/;

// A test file that appends its name to TRACE, and fails when `rouge`.
const essai = (nom: string, rouge = false) =>
  `import { appendFileSync } from 'node:fs';\nimport { test } from 'vitest';\n` +
  `test('${nom}', () => {\n  appendFileSync(process.env.TRACE, '${nom}\\n');\n` +
  (rouge ? `  throw new Error('rouge');\n` : '') +
  `});\n`;

// The files of trial: two day tests, night tests of each form and depth.
const JOUR = ['tests/jour.spec.ts', 'tests/profond/jour.test.ts'];
const NUITS = [
  'tests/a.nuit.test.ts',
  'tests/b.nuit.spec.ts',
  'tests/profond/c.nuit.test.ts',
  'tests/d.nuit.test.mjs',
];

// The dependencies of the repository, linked one by one so that Vitest writes its cache in the
// project of trial.
function lierDependances(repo: string) {
  mkdirSync(path.join(repo, 'node_modules'));
  for (const e of readdirSync(path.join(DEPOT, 'node_modules'))) {
    if (e !== '.vite' && e !== '.vitest') {
      symlinkSync(path.join(DEPOT, 'node_modules', e), path.join(repo, 'node_modules', e));
    }
  }
}

// A project of trial, its frame installed by the update of the frame (critère 9): by default the
// package.json of the repository (its guards of pretest and its build, which check the repository
// itself, left out, and its section `grillhouse` with them: the key `grillhouse.nuit` is the
// project's, critère 8) and its day configuration of Vitest; `pkg` replaces that package.json and
// `fichiers` adds or replaces files. `nuits: false` leaves the night tests out.
function projet(
  enPlus: Record<string, string> = {},
  o: {
    pkg?: Record<string, unknown>;
    nuits?: boolean;
    jourVitest?: boolean;
    dependances?: boolean;
  } = {}
) {
  const repo = mkdtempSync(path.join(ESSAIS, 'projet-'));
  let pkg = o.pkg;
  if (!pkg) {
    const depot = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
      grillhouse?: unknown;
    };
    for (const s of ['pretest', 'build', 'prepare']) {
      delete depot.scripts[s];
    }
    delete depot.grillhouse;
    pkg = depot;
  }
  writeFileSync(path.join(repo, 'package.json'), JSON.stringify(pkg, null, 2));
  if (o.jourVitest !== false) {
    for (const f of readdirSync(DEPOT)) {
      if (/^vitest\.config\.(c|m)?[jt]s$/.test(f)) {
        cpSync(path.join(DEPOT, f), path.join(repo, f));
      }
    }
  }
  // The project of trial proves the night, not the controls of the frame (grillhouse-3uv.55,
  // critère 8): of its pretest it keeps after the update what it held before.
  const pretest = (pkg.scripts as Record<string, string> | undefined)?.pretest;
  mettreAJour(repo, DEPOT, 'essai');
  const installe = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  if (installe.scripts) {
    if (pretest === undefined) {
      delete installe.scripts.pretest;
    } else {
      installe.scripts.pretest = pretest;
    }
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify(installe, null, 2));
  }
  if (o.dependances !== false) {
    lierDependances(repo);
  }
  const fichiers: Record<string, string> = {};
  for (const f of [...JOUR, ...(o.nuits === false ? [] : NUITS)]) {
    fichiers[f] = essai(path.basename(f));
  }
  Object.assign(fichiers, enPlus);
  for (const [f, contenu] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    writeFileSync(path.join(repo, f), contenu);
  }
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const trace = path.join(bin, 'trace');
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    ),
    TRACE: trace,
    PATH: `${bin}:${process.env.PATH}`,
  };
  const lancer = (cmd: string, args: string[]) =>
    spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', env, timeout: 120_000 });
  const lignes = () =>
    existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
  const joues = () => [...lignes()].sort();
  return { repo, bin, env, lancer, lignes, joues };
}

const noms = (fichiers: string[]) => fichiers.map(f => path.basename(f)).sort();
const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`.slice(-3000);

describe('critère 4 — npm test leaves the night tests out', () => {
  it('critère 4: npm test plays the day tests and no night test, at any depth and in any form', () => {
    const p = projet();
    const r = p.lancer('npm', ['run', 'test', '--ignore-scripts']);
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).toEqual(noms(JOUR));
  }, 120_000);
  it('critère 4: a red night test leaves npm test green', () => {
    const p = projet({ 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) });
    const r = p.lancer('npm', ['run', 'test', '--ignore-scripts']);
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).not.toContain('e.nuit.test.ts');
  }, 120_000);
  it('critère 4: a file whose name only holds « nuit » stays a day test, played by npm test', () => {
    const p = projet({
      'tests/nuit.spec.ts': essai('nuit.spec.ts'),
      'tests/la-nuit.test.ts': essai('la-nuit.test.ts'),
    });
    const r = p.lancer('npm', ['run', 'test', '--ignore-scripts']);
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).toEqual(noms([...JOUR, 'nuit.spec.ts', 'la-nuit.test.ts']));
  }, 120_000);
});

// grillhouse-3uv.75.1: the integration of the day launches the tests by `npm test -- <scope>`.
describe('critère 4 — the integration of the day leaves the night tests out', () => {
  const npmTest = (...portee: string[]) => ['test', '--ignore-scripts', '--', ...portee];
  it('critère 4: npm test -- --tous plays the day tests and no night test', () => {
    const p = projet();
    const r = p.lancer('npm', npmTest('--tous'));
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).toEqual(noms(JOUR));
  }, 120_000);
  it('critère 4: npm test -- --racine plays the day tests outside every component and none of the night tests', () => {
    const p = projet();
    const r = p.lancer('npm', npmTest('--racine'));
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).toEqual(noms(JOUR));
  }, 120_000);
  it('critère 4: a red night test leaves the integration of the day green, and unnamed in its reds', () => {
    const p = projet({ 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) });
    const rouges = path.join(p.bin, 'rouges');
    for (const portee of ['--tous', '--racine']) {
      const r = spawnSync('npm', npmTest(portee), {
        cwd: p.repo,
        encoding: 'utf8',
        env: { ...p.env, ROUGES: rouges },
        timeout: 120_000,
      });
      expect(r.status, `${portee}\n${sortie(r)}`).toBe(0);
      expect(existsSync(rouges) ? readFileSync(rouges, 'utf8') : '').not.toMatch(/nuit/);
    }
  }, 240_000);
});

// The night in a repository of trial, as tests/unit/nuit.spec.ts plays it: a fake Beads records
// its calls.
function nuitDe(p: ReturnType<typeof projet>) {
  writeFileSync(path.join(p.bin, 'bd'), `#!/bin/sh\necho "$@" >> ${p.bin}/appels\n`, {
    mode: 0o755,
  });
  writeFileSync(path.join(p.repo, '.gitignore'), 'node_modules\n.claude/worktrees/\n');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', p.repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'base');
  const r = p.lancer('bash', [path.join(p.repo, 'scripts/nuit.sh')]);
  const dossier = path.join(p.repo, '.git', 'nuit');
  const journal = existsSync(dossier)
    ? readdirSync(dossier)
        .filter(f => f.endsWith('.log'))
        .map(f => readFileSync(path.join(dossier, f), 'utf8'))
        .join('\n')
    : '';
  const vert = path.join(dossier, 'dernier-vert');
  const dernierVert = existsSync(vert) ? readFileSync(vert, 'utf8').trim() : '';
  const tete = git('rev-parse', 'HEAD').trim();
  return { status: r.status, journal: journal.slice(-3000), dernierVert, tete };
}

describe('critère 4 — the night plays the night tests', () => {
  it('critère 4: the night plays every night test, and the day tests', () => {
    const p = projet();
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    for (const f of noms(NUITS)) {
      expect(p.joues(), n.journal).toContain(f);
    }
    for (const f of noms(JOUR)) {
      expect(p.joues(), n.journal).toContain(f);
    }
  }, 240_000);
  it('critère 4: a red night test turns the night red', () => {
    const p = projet({ 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(p.joues()).toContain('e.nuit.test.ts');
  }, 240_000);
});

// A script that appends `nom` to TRACE, for the package.json of a project of trial.
const noter = (nom: string, code = 0) =>
  `node -e "require('fs').appendFileSync(process.env.TRACE, '${nom}\\n'); process.exit(${code})"`;

// The package.json of the repository as projet() writes it, with `grillhouse` and scripts added.
function pkgDuDepot(grillhouse?: unknown, scripts: Record<string, string> = {}) {
  const pkg = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
    grillhouse?: unknown;
  };
  for (const s of ['pretest', 'build', 'prepare']) {
    delete pkg.scripts[s];
  }
  delete pkg.grillhouse;
  Object.assign(pkg.scripts, scripts);
  if (grillhouse !== undefined) {
    pkg.grillhouse = grillhouse;
  }
  return pkg;
}

// The positions of the names in the order of the trace.
const rangs = (lignes: string[], noms_: string[]) => noms_.map(n => lignes.indexOf(n));

// grillhouse-3uv.75.1 critères 11 and 17: the night launches `npm test` under FORCER=1, which plays
// neither the time budget benches nor the night tests; the night plays its benches itself, after
// `npm test`, even without a night test, and a red bench turns the night red.
describe('3uv.75.1 critères 11 et 17 — the day leaves the time budget benches out, the night plays them itself', () => {
  const BANC = 'tests/temps.budget.test.ts';
  it('critères 11 et 17: npm test plays no bench; the night of a project without night test plays its bench itself, once, after npm test, green', () => {
    const p = projet({ [BANC]: essai('temps.budget.test.ts') }, { nuits: false });
    const jour = p.lancer('npm', ['run', 'test', '--ignore-scripts']);
    expect(jour.status, sortie(jour)).toBe(0);
    expect(p.joues()).toEqual(noms(JOUR));
    const avant = p.lignes().length;
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    const l = p.lignes().slice(avant);
    expect(
      l.filter(x => x === 'temps.budget.test.ts'),
      `${l.join(', ')}\n${n.journal}`
    ).toHaveLength(1);
    const jourRangs = rangs(l, noms(JOUR));
    expect(jourRangs, `${l.join(', ')}\n${n.journal}`).not.toContain(-1);
    expect(Math.max(...jourRangs), l.join(', ')).toBeLessThan(l.indexOf('temps.budget.test.ts'));
  }, 240_000);
  it('critère 17: a red bench turns the night red, with or without night tests', () => {
    for (const nuits of [true, false]) {
      const p = projet({ [BANC]: essai('temps.budget.test.ts', true) }, { nuits });
      const n = nuitDe(p);
      expect(n.status, `nuits ${nuits}\n${n.journal}`).toBe(1);
      expect(n.dernierVert, `nuits ${nuits}`).toBe('');
      expect(p.lignes(), `nuits ${nuits}`).toContain('temps.budget.test.ts');
    }
  }, 480_000);
});

describe('critère 7 — scripts/nuit.sh plays the night tests itself', () => {
  it('critère 7: without the key grillhouse.nuit, the night plays every night test after the day tests', () => {
    const p = projet();
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    const l = p.lignes();
    const jour = rangs(l, noms(JOUR));
    const nuit = rangs(l, noms(NUITS));
    expect([...jour, ...nuit], `${l.join(', ')}\n${n.journal}`).not.toContain(-1);
    expect(Math.max(...jour), l.join(', ')).toBeLessThan(Math.min(...nuit));
  }, 240_000);
  it('critère 7: each night test is played once, by the night', () => {
    const p = projet();
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    for (const f of noms(NUITS)) {
      expect(
        p.lignes().filter(x => x === f),
        f
      ).toHaveLength(1);
    }
  }, 240_000);
  it('critère 7: a red npm test turns the night red before any night test', () => {
    const p = projet({ 'tests/f.spec.ts': essai('f.spec.ts', true) });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(n.dernierVert).toBe('');
    for (const f of noms(NUITS)) {
      expect(p.lignes()).not.toContain(f);
    }
  }, 240_000);
  it('critère 7: a red night test turns the night red, with no last green, without the key', () => {
    const p = projet({ 'tests/profond/e.nuit.spec.ts': essai('e.nuit.spec.ts', true) });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(n.dernierVert).toBe('');
    expect(p.lignes()).toContain('e.nuit.spec.ts');
  }, 240_000);
});

describe('critère 7 and 8 — the night tests, then the night script of the project', () => {
  it('critères 7 and 8: with the key, the night plays the day tests, the night tests, then the project script', () => {
    const p = projet(
      {},
      { pkg: pkgDuDepot({ nuit: 'nuit-projet' }, { 'nuit-projet': noter('projet') }) }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(n.dernierVert).toBe(n.tete);
    const l = p.lignes();
    const jour = rangs(l, noms(JOUR));
    const nuit = rangs(l, noms(NUITS));
    const projetRang = l.indexOf('projet');
    expect([...jour, ...nuit, projetRang], `${l.join(', ')}\n${n.journal}`).not.toContain(-1);
    expect(Math.max(...jour), l.join(', ')).toBeLessThan(Math.min(...nuit));
    expect(Math.max(...nuit), l.join(', ')).toBeLessThan(projetRang);
  }, 240_000);
  it('critère 8: a project script that plays no test leaves the night tests played', () => {
    const p = projet(
      { 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) },
      { pkg: pkgDuDepot({ nuit: 'nuit-projet' }, { 'nuit-projet': noter('projet') }) }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(p.lignes()).toContain('e.nuit.test.ts');
  }, 240_000);
});

describe('critère 11 — a red night test turns the night red without playing the project script', () => {
  const pkg = () => pkgDuDepot({ nuit: 'nuit-projet' }, { 'nuit-projet': noter('projet') });
  it('critère 11: a red night test, the project script declared: red, no last green, script not played', () => {
    const p = projet({ 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) }, { pkg: pkg() });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(n.dernierVert).toBe('');
    expect(p.lignes(), n.journal).toContain('e.nuit.test.ts');
    expect(p.lignes(), n.journal).not.toContain('projet');
  }, 240_000);
  it('critère 11: a red night spec deeper down, among green night tests: red, script not played', () => {
    const p = projet(
      { 'tests/profond/plus/e.nuit.spec.ts': essai('e.nuit.spec.ts', true) },
      { pkg: pkg() }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(p.lignes(), n.journal).toContain('e.nuit.spec.ts');
    expect(p.lignes(), n.journal).not.toContain('projet');
  }, 240_000);
});

describe("critère 8 — the key grillhouse.nuit stays the project's", () => {
  it('critère 8: the package.json of Grillhouse carries no key grillhouse.nuit', () => {
    const pkg = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
      grillhouse?: Record<string, unknown>;
    };
    expect(pkg.grillhouse?.nuit).toBeUndefined();
  });
});

describe('critère 9 — the night tests reach a project installed by the update of the frame', () => {
  // A project of its own: its package.json, its day configuration of Vitest that leaves the night
  // tests out, no file of Grillhouse but those the update of the frame installs.
  const propre = {
    name: 'projet-installe',
    type: 'module',
    scripts: { test: 'vitest run' },
  };
  const configJour =
    "import { defineConfig } from 'vitest/config';\n" +
    'export default defineConfig({ test: { include: ' +
    "['tests/**/*.{test,spec}.{ts,mjs}'], exclude: ['**/node_modules/**', '**/*.nuit.*'] } });\n";
  it('critère 9: the night of an installed project plays its night tests after its day tests', () => {
    const p = projet({ 'vitest.config.ts': configJour }, { pkg: propre, jourVitest: false });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    const l = p.lignes();
    const jour = rangs(l, noms(JOUR));
    const nuit = rangs(l, noms(NUITS));
    expect([...jour, ...nuit], `${l.join(', ')}\n${n.journal}`).not.toContain(-1);
    expect(Math.max(...jour), l.join(', ')).toBeLessThan(Math.min(...nuit));
  }, 240_000);
  it('critère 9: a red night test turns the night of an installed project red', () => {
    const p = projet(
      { 'vitest.config.ts': configJour, 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) },
      { pkg: propre, jourVitest: false }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(p.lignes()).toContain('e.nuit.test.ts');
  }, 240_000);
});

describe('critère 10 — a project without any night test keeps a green night', () => {
  it('critère 10: a Vitest project without night test: green, its day tests played', () => {
    const p = projet({}, { nuits: false });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(n.dernierVert).toBe(n.tete);
    expect(p.joues()).toEqual(noms(JOUR));
  }, 240_000);
  it('critère 10: a project without Vitest nor night test: green', () => {
    const p = projet(
      { 't.mjs': "import fs from 'node:fs';\nfs.appendFileSync(process.env.TRACE, 'jour\\n');\n" },
      {
        pkg: { name: 'sans-vitest', scripts: { test: 'node t.mjs' } },
        nuits: false,
        jourVitest: false,
        dependances: false,
      }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(n.dernierVert).toBe(n.tete);
    expect(p.lignes()).toEqual(['jour']);
  }, 240_000);
  it('critère 10: a project without night test, whose script of night is declared: green', () => {
    const p = projet(
      {},
      {
        nuits: false,
        pkg: pkgDuDepot({ nuit: 'nuit-projet' }, { 'nuit-projet': noter('projet') }),
      }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(p.lignes()).toContain('projet');
  }, 240_000);
});

// The test files of the repository, with their sources.
function testsDuDepot(): { f: string; s: string }[] {
  const out: { f: string; s: string }[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(DEPOT, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') {
          parcourir(r);
        }
      } else if (/\.(spec|test)\.(c|m)?[jt]sx?$/.test(e.name)) {
        out.push({ f: r, s: readFileSync(path.join(DEPOT, r), 'utf8') });
      }
    }
  };
  for (const racine of ['tests', 'src']) {
    if (existsSync(path.join(DEPOT, racine))) {
      parcourir(racine);
    }
  }
  return out;
}

const tenant = (motif: RegExp) =>
  testsDuDepot()
    .filter(({ f }) => f !== path.relative(DEPOT, __filename))
    .filter(({ s }) => motif.test(s));

describe('critère 4 — the test of critère 1 is a night test', () => {
  it('critère 4: the test of the two simultaneous runs lives in a night file, and only there', () => {
    const fichiers = tenant(/critère 1 — two simultaneous runs/).map(x => x.f);
    expect(fichiers.length).toBeGreaterThan(0);
    for (const f of fichiers) {
      expect(f).toMatch(NUIT_RE);
    }
  });
});

describe('critère 5 — by day, a fast test keeps the trial directories off a fixed shared path', () => {
  const gardes = () =>
    tenant(/critère 2 — no test names a fixed directory under the home/).map(x => x.f);
  it('critère 5: the guard of critère 2 lives in a day file, played by npm test', () => {
    const fichiers = gardes();
    expect(fichiers.length).toBeGreaterThan(0);
    for (const f of fichiers) {
      expect(f).not.toMatch(NUIT_RE);
      expect(f).not.toMatch(BUDGET_RE);
    }
  });
  it('critère 5: the file of the guard starts no process, so that it stays fast', () => {
    const fichiers = gardes();
    expect(fichiers.length).toBeGreaterThan(0);
    for (const f of fichiers) {
      const s = readFileSync(path.join(DEPOT, f), 'utf8');
      expect(s, f).not.toMatch(/node:child_process|\bspawn(Sync)?\(|\bexec(File)?(Sync)?\(/);
    }
  });
  it('critère 5: npm test plays the guard of critère 2', () => {
    const p = projet();
    for (const f of gardes()) {
      const cible = path.join(p.repo, f);
      mkdirSync(path.dirname(cible), { recursive: true });
      writeFileSync(cible, essai(path.basename(f)));
    }
    const r = p.lancer('npm', ['run', 'test', '--ignore-scripts']);
    expect(r.status, sortie(r)).toBe(0);
    for (const f of gardes()) {
      expect(p.joues()).toContain(path.basename(f));
    }
  }, 120_000);
});

describe('grillhouse-3uv.55 critère 8 — the project of trial stays without the controls of the frame', () => {
  // The pretest a project of trial holds once projet() has brought it to the frame.
  const pretestDe = (p: { repo: string }) =>
    (
      JSON.parse(readFileSync(path.join(p.repo, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>;
      }
    ).scripts?.pretest;
  it('critère 8: the package.json of the repository, its pretest left out, gets none back from the update', () => {
    expect(pretestDe(projet({}, { nuits: false, dependances: false }))).toBeUndefined();
  });
  it('critère 8: a project of its own without pretest gets none from the update', () => {
    const p = projet(
      {},
      {
        pkg: { name: 'propre', scripts: { test: 'vitest run' } },
        nuits: false,
        jourVitest: false,
        dependances: false,
      }
    );
    expect(pretestDe(p)).toBeUndefined();
  });
  it('critère 8: a project of trial with a pretest of its own keeps it as it was', () => {
    const p = projet(
      {},
      {
        pkg: { name: 'propre', scripts: { test: 'vitest run', pretest: 'node mien.mjs' } },
        nuits: false,
        jourVitest: false,
        dependances: false,
      }
    );
    expect(pretestDe(p)).toBe('node mien.mjs');
  });
});
