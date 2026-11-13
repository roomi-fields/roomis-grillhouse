// grillhouse-61z: the verification plays every control of the CI, and the CI calls it alone
// (critère 2); the lint and the format check keep a cache under node_modules/.cache (critère 8).
// Witness: main's CI stayed red from 8f16106 to 83785bd on a lint the verification did not play.
// The build job (`npm run build`, `npm pack --dry-run`) stays in the CI of Grillhouse as the written
// exception to critère 2: it is the control of the publication of its package and plays no test. The
// CI of the project template has none: its job of the guards waits for the build of every package. The CI of Grillhouse plays the
// verification in several jobs (`--sans-tests`, then its tranches, `--tranche i/n`, merged by
// `grillhouse fusion-des-tranches`): each of its jobs but build calls the verification alone.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');
const lire = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');

type Etape = { name?: string; run?: string; uses?: string };
type Flux = { jobs: Record<string, { steps?: Etape[] }> };

const CIS = [
  ['the CI of Grillhouse', '.github/workflows/ci.yml'],
  ['the CI of the project template', 'templates/projet/.github/workflows/ci.yml'],
] as const;

// What a step of the test job may run besides the verification: the installation of the project
// and of the tools the verification plays (uv, the command claude); no test of the day plays the
// program temporal, which the night lays down.
const INSTALLATION = [
  /^npm ci$/,
  /^npm install -g @anthropic-ai\/claude-code@\d+\.\d+\.\d+$/,
  /^npx --no-install grillhouse binaires$/,
];
// The merge of the tranches of the verification, the one other command of a job of the
// verification.
const FUSION = 'npx --no-install grillhouse fusion-des-tranches';
const VERIFIER = /^npm run verifier( |$)/;
const CONTROLES = /format:check|lint|typecheck|\bbuild\b|\bnpm test\b|\bvitest\b|\btsc\b/;

describe('critère 2: the CI calls the verification alone', () => {
  for (const [titre, fichier] of CIS) {
    const jobs = (parse(lire(fichier)) as Flux).jobs;
    // The jobs of the verification: every job but build and judged, which finds a tree already
    // judged and plays no control.
    const verification = Object.entries(jobs).filter(([nom]) => !['build', 'judged'].includes(nom));
    const runs = (j: { steps?: Etape[] }) =>
      (j.steps ?? []).flatMap(e => (e.run ? [e.run.trim()] : []));
    const lancees = verification.flatMap(([, j]) => runs(j));

    it(`critère 2: ${titre} plays, after the installation, \`npm run verifier\` and nothing else`, () => {
      // The CI of Grillhouse gives the verification a base for a push (a step of its own, under
      // its condition): every run of the verification is `npm run verifier`, then its base after
      // the `--` separator, so npm hands the base to the script and not to itself.
      const verifs = lancees.filter(r => VERIFIER.test(r));
      expect(verifs.length).toBeGreaterThanOrEqual(1);
      for (const r of verifs) {
        expect(r).toMatch(
          /^npm run verifier( -- (--base \S+|--sans-tests))?$|^npm run verifier -- \$\{\{.*\}\}$/
        );
      }
      for (const [nom, j] of verification) {
        expect(runs(j).at(-1), nom).toMatch(
          /^npm run verifier|^npx --no-install grillhouse fusion-des-tranches$/
        );
      }
      for (const r of lancees.filter(l => !VERIFIER.test(l) && l !== FUSION)) {
        expect(
          INSTALLATION.some(re => re.test(r)),
          `étape de test hors installation : ${r}`
        ).toBe(true);
      }
    });

    it(`${titre} does not install the program temporal, which no test of the day plays`, () => {
      for (const r of lancees) {
        expect(r, r).not.toMatch(/temporal|TEMPORAL/);
      }
    });

    it(`critère 2: ${titre} plays no control by itself in its test job`, () => {
      for (const r of lancees.filter(l => !VERIFIER.test(l) && l !== FUSION)) {
        expect(r, r).not.toMatch(CONTROLES);
      }
    });

    if (fichier === 'templates/projet/.github/workflows/ci.yml') {
      it(`${titre} installs the binaries of the project's languages after npm ci, before each verification`, () => {
        const verifiants = verification.filter(([, j]) => runs(j).some(r => VERIFIER.test(r)));
        expect(verifiants.map(([nom]) => nom).sort()).toEqual(['gardes', 'tranches']);
        for (const [nom, j] of verifiants) {
          const r = runs(j);
          const binaires = r.indexOf('npx --no-install grillhouse binaires');
          expect(binaires, nom).toBeGreaterThan(r.indexOf('npm ci'));
          expect(binaires, nom).toBeLessThan(r.findIndex(l => VERIFIER.test(l)));
        }
      });

      it(`${titre} has no build job: its guards prove the build`, () => {
        expect(jobs.build).toBeUndefined();
      });
      continue;
    }

    it(`critère 2: ${titre} keeps the build job as the written exception, which plays no test`, () => {
      expect(jobs.build).toBeDefined();
      const duBuild = runs(jobs.build);
      expect(duBuild).toContain('npm run build --if-present');
      expect(duBuild.some(r => r.startsWith('npm pack --dry-run'))).toBe(true);
      for (const r of duBuild) {
        expect(r, r).not.toMatch(/format:check|lint|typecheck|verifier|\bnpm test\b|\bvitest\b/);
      }
    });
  }
});

const PROJETS = [
  ['the repository of Grillhouse', 'package.json', '.gitignore'],
  ['the project template', 'templates/projet/package.json', 'templates/projet/_gitignore'],
] as const;

describe('critère 8: lint and format:check keep a cache under node_modules/.cache', () => {
  for (const [titre, manifeste, ignore] of PROJETS) {
    const scripts = (JSON.parse(lire(manifeste)) as { scripts: Record<string, string> }).scripts;
    for (const nom of ['lint', 'format:check']) {
      it(`critère 8: ${titre}: the script ${nom} carries --cache and --cache-location under .cache-outils/`, () => {
        expect(scripts[nom]).toMatch(/(^|\s)--cache(\s|$)/);
        expect(scripts[nom]).toMatch(/--cache-location[ =]\S*\.cache-outils\//);
      });
    }

    it(`critère 8: ${titre}: git ignores .cache-outils, where the cache lives`, () => {
      expect(lire(ignore)).toMatch(/^\/?\.cache-outils\/?$/m);
    });
  }
});
