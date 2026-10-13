// grillhouse-3uv.75.1: one command launches the tests (charte, « Une matière, une adresse »):
// `npm test`, `npm test -- <files>` for a targeted run, through the frame's launcher with its cache
// (scripts/integration/suites-vitest.mjs). `integration:suites` is gone with its callers (charte,
// « Un remplacement supprime le remplacé »): the integration, the queue, the night and the
// continuous integration call `npm test`, the integration with its scopes (the touched components
// and those downstream, the root, --tous, the test files of the lot). The day plays neither the
// time budget benches nor the night tests.
//
// The runs play `npm test` in a git repository of trial whose frame is this repository's
// (./tests-en-cache-essai.ts).
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEPOT, FICHIERS, JOUR, projetCache, tries, voir } from './tests-en-cache-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-en-cache-appels-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 120_000;
const LANCEUR = 'scripts/integration/suites-vitest.mjs';
const pkgDuDepot = () =>
  JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
// The header of a script: its comment lines before the first import.
const entete = (rel: string) => readFileSync(path.join(DEPOT, rel), 'utf8').split(/^import /m)[0];

// Every file under <rel> of the repository, relative to it, out of node_modules, .git, dist and
// the copies of the tickets.
function fichiersSous(rel: string): string[] {
  const out: string[] = [];
  const walk = (r: string) => {
    const abs = path.join(DEPOT, r);
    if (!existsSync(abs)) {
      return;
    }
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', 'worktrees', 'coverage'].includes(e.name)) {
        continue;
      }
      const p = r ? `${r}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(p);
      } else if (e.isFile()) {
        out.push(p);
      }
    }
  };
  walk(rel);
  return out;
}

describe('critère 1 — npm test passes through the launcher with its cache; npm test -- <files> plays the named files alone', () => {
  it('critère 1: the test script of the repository runs the launcher, and no script integration:suites remains', () => {
    const { scripts } = pkgDuDepot();
    expect(scripts.test).toBe(`node ${LANCEUR}`);
    expect(scripts).not.toHaveProperty('integration:suites');
  });
  it(
    'critère 1: npm test plays every test file of the day, each once, in one run',
    () => {
      const p = projetCache(ESSAIS);
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues.length, voir(r)).toBe(JOUR.length);
      expect(tries(r.joues), voir(r)).toEqual(tries(JOUR));
    },
    LONG
  );
  it(
    'critère 1: npm test -- <files> plays the named files alone, whatever component holds them',
    () => {
      const p = projetCache(ESSAIS);
      const r = p.npmTest([FICHIERS.libre, FICHIERS.a]);
      expect(r.status, voir(r)).toBe(0);
      expect(tries(r.joues), voir(r)).toEqual(tries(['libre', 'a']));
    },
    LONG
  );
  it('critère 1: no script, workflow or manifest of the repository calls integration:suites; the CI calls npm test', () => {
    const lieux = [
      'package.json',
      ...fichiersSous('scripts'),
      ...fichiersSous('.github'),
      ...fichiersSous('templates'),
    ];
    const nommant = lieux.filter(f =>
      readFileSync(path.join(DEPOT, f), 'utf8').includes('integration:suites')
    );
    expect(nommant).toEqual([]);
    expect(readFileSync(path.join(DEPOT, '.github/workflows/ci.yml'), 'utf8')).toMatch(
      /run:\s*npm test\b/
    );
  });
});

describe('critère 9 — the scopes of the integration stay, now played file by file', () => {
  it(
    'critère 9: the scope of a component plays its tests and the tests that import it, directly or by ricochet, and not the others',
    () => {
      const p = projetCache(ESSAIS);
      const r = p.npmTest(['src/a']);
      expect(r.status, voir(r)).toBe(0);
      for (const nom of ['a', 'direct', 'ricochet']) {
        expect(r.joues, `${nom}\n${voir(r)}`).toContain(nom);
      }
      for (const nom of ['seul', 'libre']) {
        expect(r.joues, `${nom}\n${voir(r)}`).not.toContain(nom);
      }
    },
    LONG
  );
  it(
    'critère 9: --racine plays the test files outside every component, and none of a component',
    () => {
      const p = projetCache(ESSAIS);
      const r = p.npmTest(['--racine']);
      expect(r.status, voir(r)).toBe(0);
      expect(tries(r.joues), voir(r)).toEqual(tries(['direct', 'ricochet', 'seul', 'libre']));
    },
    LONG
  );
  it(
    'critère 9: --tous plays every test file of the day',
    () => {
      const p = projetCache(ESSAIS);
      const r = p.npmTest(['--tous']);
      expect(r.status, voir(r)).toBe(0);
      expect(tries(r.joues), voir(r)).toEqual(tries(JOUR));
    },
    LONG
  );
  it(
    'critère 9: the failing tests of a run are named by file and test in ROUGES, and its exit code is not 0',
    () => {
      const p = projetCache(ESSAIS);
      const r = p.npmTest(['src/a'], { ROUGIR: 'direct,a' });
      expect(r.status, voir(r)).not.toBe(0);
      expect(tries(r.rouges), voir(r)).toEqual(
        tries([`${FICHIERS.a} > a`, `${FICHIERS.direct} > direct`])
      );
    },
    LONG
  );
});

describe('critère 11 — the time budget benches and the night tests stay out of the day', () => {
  it(
    'critère 11: npm test and its scopes play neither the bench nor the night test, FORCER=1 included',
    () => {
      const p = projetCache(ESSAIS);
      for (const args of [[], ['--tous'], ['--racine']]) {
        const r = p.npmTest(args, { FORCER: '1' });
        expect(r.status, `${args.join(' ')}\n${voir(r)}`).toBe(0);
        expect(r.joues, `${args.join(' ')}\n${voir(r)}`).not.toContain('banc');
        expect(r.joues, `${args.join(' ')}\n${voir(r)}`).not.toContain('nuit');
      }
    },
    LONG
  );
});

describe('critère 13 — the texts that describe the launch of the tests say npm test', () => {
  it('critère 13: the header of the launcher says npm test and npm test -- <files>, and no longer integration:suites nor --tests', () => {
    const t = entete(LANCEUR);
    expect(t).toMatch(/npm test\b/);
    expect(t).toMatch(/npm test -- /);
    expect(t).not.toMatch(/integration:suites/);
    expect(t).not.toMatch(/--tests\b/);
  });
  it('critère 13: the headers of the replay, the integration, the queue and the night name no integration:suites', () => {
    for (const f of [
      'scripts/integration/rejeu.mjs',
      'scripts/integration/integrer.mjs',
      'scripts/integration/file.mjs',
      'scripts/integration/traces.mjs',
    ]) {
      expect(entete(f), f).not.toMatch(/integration:suites/);
    }
    expect(readFileSync(path.join(DEPOT, 'scripts/nuit.sh'), 'utf8')).not.toMatch(
      /integration:suites/
    );
  });
  it('critère 13: the line of the launcher in STRUCTURE.md says npm test', () => {
    const lignes = readFileSync(path.join(DEPOT, 'STRUCTURE.md'), 'utf8')
      .split('\n')
      .filter(l => /suites-vitest\.mjs/.test(l));
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) {
      expect(l).toMatch(/npm test/);
      expect(l).not.toMatch(/integration:suites/);
    }
  });
  it('critère 13: the commands of the template’s CLAUDE.md name the targeted run npm test -- <files>', () => {
    expect(readFileSync(path.join(DEPOT, 'CLAUDE.md'), 'utf8')).toMatch(/npm test -- /);
  });
  it('critère 13: no document of the repository names integration:suites, the history of CHANGELOG.md aside', () => {
    const docs = fichiersSous('')
      .filter(f => f.endsWith('.md'))
      .filter(f => f !== 'CHANGELOG.md');
    const nommant = docs.filter(f =>
      readFileSync(path.join(DEPOT, f), 'utf8').includes('integration:suites')
    );
    expect(nommant).toEqual([]);
  });
});

// grillhouse-3uv.65 critère 23, kept from the suites' traces: the root paths a project's suites
// read are its own declaration.
describe('3uv.65 critère 23 — a project created or updated by the frame does not receive grillhouse.lusParLesSuites', () => {
  const declaration = (pkg: string) =>
    (JSON.parse(readFileSync(pkg, 'utf8')) as { grillhouse?: { lusParLesSuites?: unknown } })
      .grillhouse?.lusParLesSuites;
  it(
    'critère 23: npm run new (scripts/new-project.sh) writes a package.json without the template’s lusParLesSuites',
    () => {
      // A template whose package.json declares its paths, scripts/setup.sh stood in by git init.
      const gabarit = mkdtempSync(path.join(ESSAIS, 'gabarit-'));
      const ecrire = (rel: string, contenu: string, mode = 0o644) => {
        mkdirSync(path.dirname(path.join(gabarit, rel)), { recursive: true });
        writeFileSync(path.join(gabarit, rel), contenu, { mode });
      };
      ecrire(
        'package.json',
        JSON.stringify({
          name: 'gabarit',
          private: true,
          scripts: { new: 'bash scripts/new-project.sh', test: `node ${LANCEUR}` },
          grillhouse: { lusParLesSuites: ['scripts', 'vitest.config.ts'] },
        })
      );
      cpSync(
        path.join(DEPOT, 'scripts/new-project.sh'),
        path.join(gabarit, 'scripts/new-project.sh')
      );
      ecrire('scripts/setup.sh', 'git -C "$(dirname "$0")/.." init -q\n', 0o755);
      ecrire('scripts/outil.mjs', 'export const o = 1;\n');
      ecrire('templates/README.md', '# Projet\n');
      const dest = path.join(mkdtempSync(path.join(ESSAIS, 'nouveau-')), 'projet');
      const r = spawnSync('bash', [path.join(gabarit, 'scripts/new-project.sh'), dest, 'np'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@t',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@t',
        },
        timeout: 60_000,
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(existsSync(path.join(dest, 'scripts/outil.mjs'))).toBe(true);
      expect(declaration(path.join(dest, 'package.json'))).toBeUndefined();
    },
    LONG
  );
  // A project whose package.json is <pkg>, updated from a frame whose package.json declares
  // scripts read by its suites; the project's declaration after the update.
  const mettreAJourDepuisCadre = async (pkg: Record<string, unknown>) => {
    const { mettreAJour } = await import('../../scripts/grillhouse-maj.mjs');
    const source = mkdtempSync(path.join(ESSAIS, 'cadre-'));
    mkdirSync(path.join(source, '.claude/grillhouse'), { recursive: true });
    writeFileSync(path.join(source, '.claude/grillhouse/fichiers.txt'), 'METACADRE.md\n');
    writeFileSync(path.join(source, 'METACADRE.md'), 'meta');
    writeFileSync(
      path.join(source, 'package.json'),
      JSON.stringify({ name: 'cadre', grillhouse: { lusParLesSuites: ['scripts'] } })
    );
    const projet = mkdtempSync(path.join(ESSAIS, 'installe-'));
    writeFileSync(path.join(projet, 'package.json'), JSON.stringify(pkg));
    mettreAJour(projet, source, 'essai');
    return declaration(path.join(projet, 'package.json'));
  };
  it('critère 23 (garde): the update (grillhouse:maj) does not write the frame’s lusParLesSuites into the project', async () => {
    expect(await mettreAJourDepuisCadre({ name: 'p' })).toBeUndefined();
  });
  it('critère 23 (garde): the update keeps the project’s own lusParLesSuites as it is', async () => {
    expect(
      await mettreAJourDepuisCadre({ name: 'p', grillhouse: { lusParLesSuites: ['corpus'] } })
    ).toEqual(['corpus']);
  });
});
