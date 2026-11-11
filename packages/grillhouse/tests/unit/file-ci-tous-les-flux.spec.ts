// The queue judges a commit on every workflow that runs on a push to its branch, as GitHub's merge
// queue and bors judge a commit on all its checks, not on the first (scripts/integration/file.mjs):
// `fluxDuCommit` gives each expected workflow its path and its name, `lireLesPassagesDeLaCI` reads
// every run of the commit at once and rates them together. Nothing is kept from one reading to the
// next: each reading lists the runs of the commit again.
//
// The history is a trial repository read by git (no origin); the GitHub CLI is a stand-in in the
// process answering `gh run list` (the runs with their workflow name) and `gh run view <id>`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  conclureLaCI,
  fluxDuCommit,
  lireLesPassagesDeLaCI,
} from '../../scripts/integration/file.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-ci-tous-les-flux-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const BRANCHE = 'agent/demo-1';
type Reponse = { status: number; stdout: string; stderr: string };
const repondre = (stdout = '', status = 0): Reponse => ({ status, stdout, stderr: '' });

type Passage = { databaseId: number; status: string; conclusion: string; workflowName: string };
type Scenario = {
  runs: Passage[];
  // The successive views of each run (`gh run view <id> --json status,conclusion,jobs`), the last
  // one repeated.
  vues?: Record<string, object[]>;
  url?: string;
  log?: string;
};

const fini = (conclusion: string) => ({ status: 'completed', conclusion, jobs: [] });
const enCours = { status: 'in_progress', conclusion: '', jobs: [] };
const passage = (id: number, workflowName: string, conclusion: string | null): Passage => ({
  databaseId: id,
  workflowName,
  status: conclusion === null ? 'in_progress' : 'completed',
  conclusion: conclusion ?? '',
});
// The runs and views of a scenario where each run is as its list says.
const scenario = (runs: Passage[]): Scenario => ({
  runs,
  vues: Object.fromEntries(
    runs.map(r => [String(r.databaseId), [r.status === 'completed' ? fini(r.conclusion) : enCours]])
  ),
});

function github(s: Scenario) {
  const appels: string[] = [];
  const vus = new Map<string, number>();
  const gh = (args: string[]): Reponse => {
    appels.push(args.join(' '));
    if (args[0] === 'run' && args[1] === 'list') {
      return repondre(JSON.stringify(s.runs));
    }
    if (args[1] === 'view' && args.includes('status,conclusion,jobs')) {
      const id = args[2]!;
      const n = (vus.get(id) ?? 0) + 1;
      vus.set(id, n);
      const vues = s.vues?.[id] ?? [];
      return repondre(JSON.stringify(vues[Math.min(n, vues.length) - 1] ?? {}));
    }
    if (args[1] === 'view' && args.includes('--log-failed')) {
      return repondre(s.log ?? '');
    }
    if (args[1] === 'view') {
      return repondre(`${s.url ?? ''}\n`);
    }
    return repondre('', 1);
  };
  return { gh, appels };
}

const DEPOTS: string[] = [];
// A repository whose commit holds the workflows <fichiers> (name → text of the file), its sha.
function depot(fichiers: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  DEPOTS.push(racine);
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  writeFileSync(path.join(racine, 'package.json'), '{}\n');
  mkdirSync(path.join(racine, '.github', 'workflows'), { recursive: true });
  for (const [nom, texte] of Object.entries(fichiers)) {
    writeFileSync(path.join(racine, '.github', 'workflows', nom), texte);
  }
  git('add', '-A');
  git('commit', '-qm', 'ci');
  return { racine, sha: git('rev-parse', 'HEAD') };
}

const flux = (nom: string | null) => `${nom === null ? '' : `name: ${nom}\n`}on: push\njobs: {}\n`;
const DEUX = { 'a.yml': flux('Tests'), 'b.yml': flux('Deploy hosted server') };

function outils(racine: string, s: Scenario) {
  const g = github(s);
  const bd: string[][] = [];
  return {
    o: {
      racine,
      principale: 'main',
      bd: (...a: string[]) => {
        bd.push(a);
        return repondre();
      },
      gh: g.gh,
      dire: () => {},
      avancement: null,
    },
    gh: g.appels,
    bd,
  };
}

describe('les flux attendus du commit : leur chemin et leur nom', () => {
  it('a workflow with a name key is named by it, its path beside', () => {
    const d = depot({ 'ci.yml': flux('Tests') });
    expect(fluxDuCommit(d.racine, d.sha, BRANCHE)).toEqual([
      { chemin: '.github/workflows/ci.yml', nom: 'Tests' },
    ]);
  });

  it('a workflow without a name key is named by its path, as GitHub names it', () => {
    const d = depot({ 'ci.yml': flux(null) });
    expect(fluxDuCommit(d.racine, d.sha, BRANCHE)).toEqual([
      { chemin: '.github/workflows/ci.yml', nom: '.github/workflows/ci.yml' },
    ]);
  });

  it('a workflow whose YAML cannot be read is named by its path and still counts as one that runs', () => {
    const d = depot({ 'casse.yml': 'name: [Tests\non: {{{\n' });
    expect(fluxDuCommit(d.racine, d.sha, BRANCHE)).toEqual([
      { chemin: '.github/workflows/casse.yml', nom: '.github/workflows/casse.yml' },
    ]);
  });

  it('the workflows come in the order of the files of their directory, the ones that do not run on the branch left out', () => {
    const d = depot({
      'c.yaml': flux('Docs'),
      'b.yml': 'name: Main seul\non:\n  push:\n    branches: [main]\n',
      'a.yml': flux('Tests'),
      'lisez-moi.md': '# pas un flux\n',
    });
    expect(fluxDuCommit(d.racine, d.sha, BRANCHE)).toEqual([
      { chemin: '.github/workflows/a.yml', nom: 'Tests' },
      { chemin: '.github/workflows/c.yaml', nom: 'Docs' },
    ]);
  });

  it('a commit without a workflows directory expects none', () => {
    const d = depot({});
    expect(fluxDuCommit(d.racine, d.sha, BRANCHE)).toEqual([]);
  });
});

describe('une lecture juge tous les passages du commit ensemble', () => {
  it('green only when every expected workflow has a green run, its run the first workflow’s', () => {
    const d = depot(DEUX);
    const { o } = outils(
      d.racine,
      scenario([passage(9, 'Deploy hosted server', 'success'), passage(5, 'Tests', 'success')])
    );
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'verte',
      passage: '5',
    });
  });

  it('one workflow green and the other still running: the CI goes on, each workflow with its run', () => {
    const d = depot(DEUX);
    const { o } = outils(
      d.racine,
      scenario([passage(5, 'Tests', 'success'), passage(9, 'Deploy hosted server', null)])
    );
    const l = lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE }) as {
      etat: string;
      flux: { nom: string; passage: string | null; fini: boolean }[];
    };
    expect(l.etat).toBe('en-cours');
    expect(l.flux).toEqual([
      { nom: 'Tests', passage: '5', fini: true },
      { nom: 'Deploy hosted server', passage: '9', fini: false },
    ]);
  });

  it('a workflow with no run yet is looked for: its run null, not finished', () => {
    const d = depot(DEUX);
    const { o } = outils(d.racine, scenario([passage(5, 'Tests', 'success')]));
    const l = lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE }) as {
      etat: string;
      flux: { nom: string; passage: string | null; fini: boolean }[];
    };
    expect(l.etat).toBe('en-cours');
    expect(l.flux).toEqual([
      { nom: 'Tests', passage: '5', fini: true },
      { nom: 'Deploy hosted server', passage: null, fini: false },
    ]);
  });

  it('a red run of a workflow after the first is red whatever the first says', () => {
    const d = depot(DEUX);
    const { o } = outils(
      d.racine,
      scenario([passage(5, 'Tests', 'success'), passage(9, 'Deploy hosted server', 'failure')])
    );
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'rouge',
      passage: '9',
      flux: 'Deploy hosted server',
    });
  });

  it('red at once while the other runs are still running or not even started', () => {
    const d = depot({ ...DEUX, 'c.yml': flux('Docs') });
    const { o } = outils(
      d.racine,
      scenario([passage(9, 'Deploy hosted server', 'failure'), passage(5, 'Tests', null)])
    );
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'rouge',
      passage: '9',
    });
  });

  it('several red runs in one reading: the first workflow in the order of the files, whatever the order of gh', () => {
    const d = depot(DEUX);
    const { o } = outils(
      d.racine,
      scenario([passage(9, 'Deploy hosted server', 'failure'), passage(5, 'Tests', 'timed_out')])
    );
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'rouge',
      passage: '5',
      flux: 'Tests',
    });
  });

  it('any conclusion but success is red: cancelled, skipped, startup_failure', () => {
    for (const conclusion of ['cancelled', 'skipped', 'startup_failure', 'neutral']) {
      const d = depot({ 'a.yml': flux('Tests') });
      const { o } = outils(d.racine, scenario([passage(5, 'Tests', conclusion)]));
      expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
        etat: 'rouge',
        passage: '5',
      });
    }
  });

  it('a run whose name is no expected workflow’s does not count, red or not', () => {
    const d = depot({ 'a.yml': flux('Tests') });
    const { o } = outils(
      d.racine,
      scenario([
        passage(77, 'Pages build and deployment', 'failure'),
        passage(5, 'Tests', 'success'),
      ])
    );
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'verte',
      passage: '5',
    });
  });

  it('only runs of other names: the expected workflow is still looked for', () => {
    const d = depot({ 'a.yml': flux('Tests') });
    const { o } = outils(d.racine, scenario([passage(77, 'Autre', 'success')]));
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'en-cours',
      flux: [{ nom: 'Tests', passage: null, fini: false }],
    });
  });

  it('several runs of one name: the latest decides, in whatever order gh lists them', () => {
    for (const runs of [
      [passage(8, 'Tests', 'success'), passage(3, 'Tests', 'failure')],
      [passage(3, 'Tests', 'failure'), passage(8, 'Tests', 'success')],
    ]) {
      const d = depot({ 'a.yml': flux('Tests') });
      const { o } = outils(d.racine, scenario(runs));
      expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
        etat: 'verte',
        passage: '8',
      });
    }
    const d = depot({ 'a.yml': flux('Tests') });
    const { o } = outils(
      d.racine,
      scenario([passage(3, 'Tests', 'success'), passage(8, 'Tests', 'failure')])
    );
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'rouge',
      passage: '8',
    });
  });

  it('several workflows of one name count for one: one run of that name is enough', () => {
    const d = depot({ 'a.yml': flux('CI'), 'b.yml': flux('CI') });
    const { o } = outils(d.racine, scenario([passage(5, 'CI', 'success')]));
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'verte',
      passage: '5',
    });
  });

  it('a workflow without a name key is joined to its run by its path', () => {
    const d = depot({ 'ci.yml': flux(null) });
    const { o } = outils(d.racine, scenario([passage(5, '.github/workflows/ci.yml', 'success')]));
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'verte',
      passage: '5',
    });
  });

  it('a commit with no expected workflow stays without CI, no run looked for', () => {
    const d = depot({ 'main.yml': 'name: Main\non:\n  push:\n    branches: [main]\n' });
    const { o, gh } = outils(d.racine, scenario([]));
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toEqual({ etat: 'sans-ci' });
    expect(gh).toEqual([]);
  });

  it('a commit with one expected workflow is read as before: its run listed on the branch, then viewed at its current attempt', () => {
    const d = depot({ 'ci.yml': flux('Tests') });
    const { o, gh } = outils(d.racine, scenario([passage(41, 'Tests', 'success')]));
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'verte',
      passage: '41',
    });
    expect(gh[0]).toContain(`run list --commit ${d.sha} --branch ${BRANCHE} --json`);
    expect(gh[0]).toContain('workflowName');
    expect(gh.slice(1)).toEqual(['run view 41 --json status,conclusion,jobs']);
    expect(gh.join('\n')).not.toContain('--attempt');
  });

  it('a commit with one expected workflow and no run yet: looked for, the run null', () => {
    const d = depot({ 'ci.yml': flux('Tests') });
    const { o } = outils(d.racine, scenario([]));
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'en-cours',
      flux: [{ nom: 'Tests', passage: null, fini: false }],
    });
  });

  it('gh absent, refusing or unreadable: the CI is not read, with the reason', () => {
    const d = depot({ 'ci.yml': flux('Tests') });
    const sans = outils(d.racine, scenario([]));
    sans.o.gh = () => ({ status: 1, stdout: '', stderr: 'HTTP 401' }) as never;
    const lue = (o: typeof sans.o): { etat: string; raison: string } =>
      lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE }) as unknown as {
        etat: string;
        raison: string;
      };
    const r1 = lue(sans.o);
    expect(r1.etat).toBe('non-lue');
    expect(r1.raison).toContain('HTTP 401');
    const illisible = outils(d.racine, scenario([]));
    illisible.o.gh = () => repondre('pas du json') as never;
    const r2 = lue(illisible.o);
    expect(r2.etat).toBe('non-lue');
    expect(r2.raison).toContain('illisible');
    const absent = outils(d.racine, scenario([]));
    absent.o.gh = () =>
      ({ error: { code: 'ENOENT' }, status: null, stdout: '', stderr: '' }) as never;
    const r3 = lue(absent.o);
    expect(r3.etat).toBe('non-lue');
    expect(r3.raison).toContain('ENOENT');
  });
});

describe('le rejeu d’un passage rouge puis la reprise juge le dernier essai de chaque passage', () => {
  it('after the rerun of one failed run, a new reading lists every run again: the others stay green, the rerun one is judged at its last attempt', () => {
    const d = depot(DEUX);
    const s = scenario([
      passage(5, 'Tests', 'success'),
      passage(9, 'Deploy hosted server', 'failure'),
    ]);
    // `gh run view 9` answers its last attempt: red before the rerun, green after.
    s.vues!['9'] = [fini('failure'), fini('success')];
    const { o, gh } = outils(d.racine, s);
    const avant = lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE });
    expect(avant).toMatchObject({ etat: 'rouge', passage: '9' });
    // The list of the commit still gives the run 9 as listed; its view is its last attempt.
    s.runs[1] = passage(9, 'Deploy hosted server', 'success');
    const apres = lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE });
    expect(apres).toMatchObject({ etat: 'verte', passage: '5' });
    expect(gh.filter(l => l.startsWith('run list'))).toHaveLength(2);
    expect(gh.join('\n')).not.toContain('--attempt');
  });

  it('a reading takes nothing from the one before: the same arguments, a changed world, a changed verdict', () => {
    const d = depot({ 'a.yml': flux('Tests') });
    const s = scenario([passage(5, 'Tests', null)]);
    const { o } = outils(d.racine, s);
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'en-cours',
    });
    s.runs[0] = passage(5, 'Tests', 'success');
    s.vues!['5'] = [fini('success')];
    expect(lireLesPassagesDeLaCI(o, { sha: d.sha, branche: BRANCHE })).toMatchObject({
      etat: 'verte',
    });
  });
});

describe('le passage rouge de n’importe quel flux rouvre le ticket', () => {
  it('red: the comment gives the address, the end of the log and the rerun command of the red run', () => {
    const d = depot(DEUX);
    const { o, bd } = outils(d.racine, {
      runs: [],
      url: 'https://github.com/demo/demo/actions/runs/9',
      log: 'deploy\tSmoke test\tPOST /mcp → 401',
    });
    const comments: string[] = [];
    o.bd = ((...a: string[]) => {
      bd.push(a);
      if (a[0] === 'comments' && a[1] === 'add') {
        comments.push(a[3]!);
      }
      return repondre();
    }) as never;
    const r = conclureLaCI(o, {
      ticket: 'demo-1',
      sha: d.sha,
      branche: BRANCHE,
      verdict: 'rouge',
      passage: '9',
    }) as { issue: { etat: string; raison: string } };
    expect(r.issue.etat).toBe('rouvert');
    expect(r.issue.raison).toContain('https://github.com/demo/demo/actions/runs/9');
    expect(comments.at(-1)).toContain('https://github.com/demo/demo/actions/runs/9');
    expect(comments.at(-1)).toContain('POST /mcp → 401');
    expect(comments.at(-1)).toContain('gh run rerun 9 --failed');
    expect(bd).toContainEqual([
      'update',
      'demo-1',
      '--status',
      'open',
      '--remove-label',
      'en-file',
    ]);
  });
});
