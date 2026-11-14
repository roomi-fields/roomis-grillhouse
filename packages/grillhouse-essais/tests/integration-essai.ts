import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnSyncReturns,
} from 'node:child_process';
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { CADRE, RACINE } from './cadre.js';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { ouvrirLeBanc, type Banc } from './temporal-essai.js';

// The trial harness of the integration and of its queue (grillhouse-3uv.63): a repository with
// a fake Beads that keeps the state of its tickets, a bare remote `origin`, the frame's real
// scripts, and the tickets' copies made as the launcher makes them (branch agent/<ticket> from
// main's HEAD, the lot as local work in it).

export const INTEGRER_SCRIPT = path.join(CADRE, 'scripts/integration/integrer.mjs');
const INTEGRER = INTEGRER_SCRIPT;
// The frame's worker, and the play of the queue of a trial on the server of the file.
const TRAVAILLEUR = path.join(CADRE, 'dist/temporal/travailleur.js');
const JOUER_LA_FILE = path.join(__dirname, 'jouer-la-file.mjs');

// The server of Temporal the queues of the file's trials play on (`serveurDeLaFile`), and the
// workers of their trials, each its own, stopped at the file's end.
let serveurDeLaFile: Banc | null = null;
const travailleurs: ChildProcess[] = [];

/**
 * Opens, before the tests of the file that calls it, the server of Temporal its trials' queues
 * play on (./temporal-essai.ts), and closes it at its end, the workers of the trials with it.
 */
export function serveurDeLaFileDIntegration(ESSAIS: string) {
  beforeAll(async () => {
    const vide = mkdtempSync(path.join(ESSAIS, 'serveur-'));
    serveurDeLaFile = await ouvrirLeBanc(
      ESSAIS,
      { REPO: vide, ENV: { ...process.env }, journal: () => '' },
      'file'
    );
  }, 120_000);
  afterAll(async () => {
    for (const t of travailleurs) {
      t.kill('SIGKILL');
    }
    await serveurDeLaFile?.fermer([]);
  }, 120_000);
}
const RETIRER = path.join(CADRE, 'scripts/retirer-copie.sh');
const LANCER = path.join(CADRE, 'scripts/enveloppe/lancer.sh');

// The envelope as the launcher's tests stand it in: run, it runs the command after `--` in the
// copy, without any sandbox; imported, it gives what the frame's envelope exports. A copy of the
// frame's scripts holds it beside the launcher.
const ENVELOPPE_NUE = `export * from '${path.join(CADRE, 'scripts/enveloppe/enveloppe.mjs')}';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--');
  const r = spawnSync(a[i + 1], a.slice(i + 2), { cwd: a[0], stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
}
`;

// The fake Beads: the tickets live in <bin>/etat.json ({ id: { id, status, labels, comments,
// close_reason } }, in creation order); every call is appended to <bin>/appels, one per line.
// It answers show, comments (and comments add, each under its author: BEADS_ACTOR, else git's
// user `t`, as bd writes it), update (--add-label, --remove-label, --status,
// --claim), label add/remove, close (--reason), reopen, list (--label, --status, --all) and
// any other call succeeds silently (the prefix is read in `.beads/config.yaml`, never here).
const FAUX_BD = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const ici = path.dirname(fs.realpathSync(process.argv[1]));
const etatF = path.join(ici, 'etat.json');
const etat = JSON.parse(fs.readFileSync(etatF, 'utf8'));
const a = process.argv.slice(2);
fs.appendFileSync(path.join(ici, 'appels'), a.join(' ') + '\\n');
const sauver = () => fs.writeFileSync(etatF, JSON.stringify(etat, null, 2));
const out = v => process.stdout.write(JSON.stringify(v) + '\\n');
const ticket = id => {
  if (!etat[id]) { process.stderr.write('Error: no issue found matching ' + id + '\\n'); process.exit(1); }
  return etat[id];
};
// Splits the arguments into positionals and options; an option takes the next word as its
// value, unless it carries it (--x=v) or is a known flag.
const FLAGS = new Set(['--json', '--claim', '--all', '--force', '-f', '--quiet', '-q']);
const lire = args => {
  const pos = []; const opts = [];
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w.startsWith('-') && w.length > 1) {
      const eq = w.indexOf('=');
      if (eq > 0) opts.push([w.slice(0, eq), w.slice(eq + 1)]);
      else if (FLAGS.has(w)) opts.push([w, true]);
      else { opts.push([w, args[i + 1]]); i++; }
    } else pos.push(w);
  }
  return { pos, opts };
};
const [cmd, ...reste] = a;
if (cmd === 'show') { const { pos } = lire(reste); out(pos.map(ticket)); process.exit(0); }
if (cmd === 'comments') {
  if (reste[0] === 'add') {
    const { pos, opts } = lire(reste.slice(1));
    const fichier = opts.find(([k]) => k === '-f' || k === '--file');
    const t = ticket(pos[0]);
    const texte = fichier && typeof fichier[1] === 'string' ? fs.readFileSync(fichier[1], 'utf8') : pos.slice(1).join(' ');
    t.comments.push({ author: process.env.BEADS_ACTOR || 't', text: texte });
    sauver(); process.exit(0);
  }
  const { pos } = lire(reste);
  out(ticket(pos[0]).comments); process.exit(0);
}
if (cmd === 'update') {
  const { pos, opts } = lire(reste);
  for (const id of pos) {
    const t = ticket(id);
    for (const [k, v] of opts) {
      if (k === '--add-label') for (const l of String(v).split(',')) { if (!t.labels.includes(l)) t.labels.push(l); }
      if (k === '--remove-label') for (const l of String(v).split(',')) t.labels = t.labels.filter(x => x !== l);
      if (k === '--set-labels') t.labels = String(v).split(',');
      if (k === '-s' || k === '--status') t.status = v;
      if (k === '--claim') t.status = 'in_progress';
    }
  }
  sauver(); process.exit(0);
}
if (cmd === 'label' && (reste[0] === 'add' || reste[0] === 'remove')) {
  const { pos } = lire(reste.slice(1));
  const l = pos.at(-1);
  for (const id of pos.slice(0, -1)) {
    const t = ticket(id);
    if (reste[0] === 'add') { if (!t.labels.includes(l)) t.labels.push(l); }
    else t.labels = t.labels.filter(x => x !== l);
  }
  sauver(); process.exit(0);
}
if (cmd === 'close') {
  const { pos, opts } = lire(reste);
  const r = opts.find(([k]) => k === '-r' || k === '--reason');
  for (const id of pos) { const t = ticket(id); t.status = 'closed'; t.close_reason = r ? r[1] : ''; }
  sauver(); process.exit(0);
}
if (cmd === 'reopen') {
  const { pos, opts } = lire(reste);
  const r = opts.find(([k]) => k === '-r' || k === '--reason');
  for (const id of pos) { const t = ticket(id); t.status = 'open'; if (r) t.comments.push({ text: r[1] }); }
  sauver(); process.exit(0);
}
if (cmd === 'list') {
  const { opts } = lire(reste);
  const labels = opts.filter(([k]) => k === '-l' || k === '--label').flatMap(([, v]) => String(v).split(','));
  const statut = opts.find(([k]) => k === '-s' || k === '--status');
  const tous = opts.some(([k]) => k === '--all');
  out(Object.values(etat).filter(t =>
    labels.every(l => t.labels.includes(l)) &&
    (statut ? t.status === statut[1] : tous || t.status !== 'closed')));
  process.exit(0);
}
process.exit(0);
`;

// The suites of the trial project: each call appends « [<arguments>] » to <PRINCIPAL>.suites,
// and fails the tests named by ROUGES_FORCES, plus, for each rule of REGLES.json
// ([{ si: [<path>, …], rouge: <test name> }]), the test it names when every path it lists exists;
// each failing test is written « ✗ <name> » on the output, and any one makes the exit code 1.
const SUITES = `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.suites', '[' + process.argv.slice(2).join(' ') + ']');
let r = fs.existsSync('ROUGES_FORCES') ? fs.readFileSync('ROUGES_FORCES', 'utf8') : '';
const regles = fs.existsSync('REGLES.json') ? JSON.parse(fs.readFileSync('REGLES.json', 'utf8')) : [];
for (const g of regles) if (g.si.every(p => fs.existsSync(p))) r += g.rouge + '\\n';
for (const n of r.split('\\n').filter(Boolean)) console.log('✗ ' + n);
process.exit(r ? 1 : 0);
`;

// The guards of the trial project: each call appends « g » to <PRINCIPAL>.gardes, and they refuse
// while GARDE_ROUGE exists.
const GARDES = `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.gardes', 'g');
process.exit(fs.existsSync('GARDE_ROUGE') ? 1 : 0);
`;

// The checks of the trial project, as the frame's `npm run verifier` plays them (Turborepo: the
// build, then the guards and the tests): its `build` script when it has one, its guards, then its
// suites, one exit code.
const TEST = 'npm run --silent --if-present build && node gardes.mjs && node suites.mjs';

// The trial's stand-in for Turborepo, the local package `outils/turbo` of the trial project (its
// `turbo` binary, which `npm install` links into node_modules/.bin): `turbo run <task>` runs the
// project's npm script <task> when it has one, as Turborepo skips a task without a script; its plan
// (`--dry=json`) holds no task.
const TURBO_FAUX = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const [commande, tache] = process.argv.slice(2);
if (commande !== 'run' || !tache) process.exit(2);
if (process.argv.includes('--dry=json')) {
  process.stdout.write('{"tasks":[]}');
  process.exit(0);
}
const r = spawnSync('npm', ['run', '--silent', '--if-present', tache], { stdio: 'inherit' });
process.exit(r.status ?? 1);
`;
const TURBO_PAQUET = JSON.stringify({
  name: 'turbo',
  version: '0.0.0',
  bin: { turbo: 'turbo.mjs' },
});

// Writes the trial's stand-in for Turborepo under <repo>/outils/turbo, its binary executable as npm
// leaves a linked one, so an install changes nothing git tracks.
export function installerFauxTurbo(repo: string) {
  mkdirSync(path.join(repo, 'outils/turbo'), { recursive: true });
  writeFileSync(path.join(repo, 'outils/turbo/package.json'), TURBO_PAQUET);
  writeFileSync(path.join(repo, 'outils/turbo/turbo.mjs'), TURBO_FAUX);
  chmodSync(path.join(repo, 'outils/turbo/turbo.mjs'), 0o755);
}

export interface Fichiers {
  [rel: string]: string | null;
}

// A ticket of the fake Beads.
export interface Ticket {
  id: string;
  status: string;
  labels: string[];
  comments: { text: string; author?: string }[];
  close_reason: string | null;
}

export interface Resultat {
  status: number | null;
  stdout: string;
  stderr: string;
}

// The name GitHub gives the workflow of a trial project (`workflowName` of `gh run list`): its
// `.github/workflows/ci.yml` has no `name`, so GitHub names it by its path.
export const FLUX_DE_L_ESSAI = '.github/workflows/ci.yml';

// The fake GitHub CLI: its answers come from <bin>/gh.json ({ runs, vues, url, log, avancement,
// bouger }: the runs `gh run list` gives, the successive views of the run `gh run view <id> --json
// status,conclusion,jobs` gives, the last one repeated, the address and the failed log `gh run
// view` gives); without the file, one run (1) of the commit, completed green: a trial project
// carries a CI on every push, and the queue judges each branch by it; every call is appended to <bin>/gh-appels, one per line,
// and, with a progress directory (`avancement`), the record of the CI it holds then to
// <bin>/gh-avancement. With `bouger` (a repository), its first view of a run commits « main
// bouge » on the main of that repository, once: main moves while the CI runs.
export const FAUX_GH = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const ici = path.dirname(fs.realpathSync(process.argv[1]));
const a = process.argv.slice(2);
fs.appendFileSync(path.join(ici, 'gh-appels'), a.join(' ') + '\\n');
const f = path.join(ici, 'gh.json');
const vert = { status: 'completed', conclusion: 'success', jobs: [] };
const s = fs.existsSync(f)
  ? JSON.parse(fs.readFileSync(f, 'utf8'))
  : {
      runs: [{ databaseId: 1, status: 'completed', conclusion: 'success', workflowName: ${JSON.stringify(FLUX_DE_L_ESSAI)} }],
      vues: [vert],
    };
// Under a progress directory, the record of the CI it holds at each call, one per line.
try {
  const ci = path.join(s.avancement, 'taches', 'etapes-de-la-ci.json');
  fs.appendFileSync(path.join(ici, 'gh-avancement'), fs.readFileSync(ci, 'utf8').trim() + '\\n');
} catch {}
const marque = path.join(ici, 'gh-bouge');
if (s.bouger && a[1] === 'view' && a.includes('status,conclusion,jobs') && !fs.existsSync(marque)) {
  fs.writeFileSync(marque, '');
  require('node:child_process').execFileSync('git', ['-C', s.bouger, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'main bouge']);
}
if (a[0] === 'run' && a[1] === 'list') process.stdout.write(JSON.stringify(s.runs ?? []));
else if (a[0] === 'run' && a[1] === 'view' && a.includes('status,conclusion,jobs')) {
  const n = fs.readFileSync(path.join(ici, 'gh-appels'), 'utf8').split('\\n').filter(l => l.includes('status,conclusion,jobs')).length;
  const vues = s.vues ?? [];
  process.stdout.write(JSON.stringify(vues[Math.min(n, vues.length) - 1] ?? {}));
}
else if (a[0] === 'run' && a[1] === 'view' && a.includes('--log-failed')) process.stdout.write(s.log ?? '');
else if (a[0] === 'run' && a[1] === 'view') process.stdout.write((s.url ?? '') + '\\n');
else process.exit(1);
`;

// A project under <essais> whose components are src/a, src/b and src/c, a CI on every push
// (`.github/workflows/ci.yml`, which the fake gh answers green), its main pushed to a bare
// remote `origin`. <pkg> is merged into its package.json (the `grillhouse` section, for example).
export function chantier(essais: string, pkg: Record<string, unknown> = {}) {
  const repo = mkdtempSync(path.join(essais, 'chantier-'));
  const bin = mkdtempSync(path.join(essais, 'bin-'));
  const distant = mkdtempSync(path.join(essais, 'distant-'));
  writeFileSync(path.join(bin, 'bd'), FAUX_BD, { mode: 0o755 });
  writeFileSync(path.join(bin, 'gh'), FAUX_GH, { mode: 0o755 });
  writeFileSync(path.join(bin, 'etat.json'), '{}');
  writeFileSync(path.join(bin, 'appels'), '');
  // The environment of the scripts: this process's, without what Vitest set for itself, so that a
  // project of trial tested by Vitest runs it as a project does (grillhouse-3uv.75.1).
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    ),
    PATH: `${bin}:${process.env.PATH}`,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    PRINCIPAL: repo,
    // The queue looks for the run of the CI once, and reads it again at once: the fake gh answers
    // at once.
    GRILLHOUSE_CI_RECHERCHE_MS: '0',
    GRILLHOUSE_CI_PAS_MS: '0',
  };
  const gitDans = (dir: string, ...a: string[]) =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  const git = (...a: string[]) => gitDans(repo, ...a);
  const ecrire = (dir: string, rel: string, contenu: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), contenu);
  };
  ecrire(
    repo,
    'package.json',
    JSON.stringify(
      {
        ...pkg,
        scripts: { verifier: TEST },
        devDependencies: { turbo: 'file:outils/turbo' },
      },
      null,
      2
    )
  );
  // grillhouse-ca7: a project of TypeScript declares its language in its architecture.
  declarerLesLangages(repo);
  ecrire(repo, 'suites.mjs', SUITES);
  ecrire(repo, 'gardes.mjs', GARDES);
  installerFauxTurbo(repo);
  for (const c of ['a', 'b', 'c']) {
    ecrire(repo, `src/${c}/index.ts`, `export const ${c} = 0;\n`);
  }
  ecrire(repo, '.beads/config.yaml', 'issue-prefix: "demo"\n');
  ecrire(repo, '.gitignore', '.claude/worktrees/\nnode_modules\n.cache-outils/\n');
  ecrire(repo, '.github/workflows/ci.yml', 'on: push\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', distant]);
  git('remote', 'add', 'origin', distant);
  git('push', '-q', 'origin', 'main');

  // Commits <fichiers> on main, as another delivery or the supervisor would.
  const poser = (fichiers: Fichiers, message = 'pose') => {
    for (const [rel, contenu] of Object.entries(fichiers)) {
      if (contenu === null) {
        git('rm', '-q', rel);
      } else {
        ecrire(repo, rel, contenu);
        git('add', rel);
      }
    }
    git('commit', '-q', '-m', message);
  };

  const copieDe = (id: string) => path.join(repo, '.claude/worktrees', id);
  const lots = new Map<string, { tests: string | null; code: string | null; message: string }>();

  const lireEtat = () =>
    JSON.parse(readFileSync(path.join(bin, 'etat.json'), 'utf8')) as Record<string, Ticket>;
  const ecrireEtat = (etat: Record<string, Ticket>) =>
    writeFileSync(path.join(bin, 'etat.json'), JSON.stringify(etat, null, 2));
  // Opens <id> in Beads with the reviewer's ACCEPTÉ, without any copy.
  const inscrire = (id: string) => {
    const etat = lireEtat();
    etat[id] = {
      id,
      status: 'in_progress',
      labels: [],
      comments: [{ author: 'relecteur', text: 'ACCEPTÉ' }],
      close_reason: null,
    };
    ecrireEtat(etat);
  };
  // The reviewer's ACCEPTÉ again on <id>, as after a new review.
  const accepter = (id: string) => {
    const etat = lireEtat();
    etat[id].comments.push({ author: 'relecteur', text: 'ACCEPTÉ' });
    ecrireEtat(etat);
  };
  // True when <rel> goes to the tests lot: a test file, or any file under a test folder (the
  // frame's rule, scripts/langages/typescript/regle-des-tests.mjs).
  const duTestwriter = (rel: string) =>
    /\.(spec|test)\.[cm]?[jt]s$/.test(rel) ||
    rel
      .split('/')
      .slice(0, -1)
      .some(d => d === 'test' || d === 'tests' || d === '__tests__');
  // Opens <id> in Beads with the reviewer's ACCEPTÉ, creates its copy as the launcher does, and
  // writes <fichiers> there as the agents' local work; its lots are the patches of those files,
  // its message « feat: lot (<id>) ».
  const ticket = (id: string, fichiers: Fichiers, message = `feat: lot (${id})`) => {
    inscrire(id);
    const copie = copieDe(id);
    git('worktree', 'add', '-q', '-b', `agent/${id}`, copie, 'HEAD');
    let tests = '';
    let code = '';
    for (const [rel, contenu] of Object.entries(fichiers)) {
      const neuf = !existsSync(path.join(copie, rel));
      if (contenu === null) {
        gitDans(copie, 'rm', '-q', rel);
      } else {
        ecrire(copie, rel, contenu);
      }
      const diff = neuf
        ? spawnSync('git', ['-C', copie, 'diff', '--no-index', '/dev/null', rel], {
            encoding: 'utf8',
          }).stdout
        : contenu === null
          ? gitDans(copie, 'diff', '--cached', '--', rel)
          : gitDans(copie, 'diff', '--', rel);
      if (duTestwriter(rel)) {
        tests += diff;
      } else {
        code += diff;
      }
    }
    enregistrer(id, tests, code, message);
    return copie;
  };

  // Records <id>'s lots: the patches <tests> and <code> (empty: none) and the message.
  const enregistrer = (id: string, tests: string, code: string, message: string) => {
    const dir = mkdtempSync(path.join(bin, `${id}-`));
    const ecrireLot = (nom: string, texte: string) => {
      if (!texte) {
        return null;
      }
      writeFileSync(path.join(dir, nom), texte);
      return path.join(dir, nom);
    };
    writeFileSync(path.join(dir, 'msg'), `${message}\n`);
    lots.set(id, {
      tests: ecrireLot('tests.patch', tests),
      code: ecrireLot('code.patch', code),
      message: path.join(dir, 'msg'),
    });
  };

  // The lots of <id> made again from its copy's local work on <fichiers>, as the agents make
  // their patches without writing the index: each file against HEAD, a new one against nothing.
  const relots = (id: string, fichiers: string[], message = `feat: lot (${id})`) => {
    const copie = copieDe(id);
    let tests = '';
    let code = '';
    for (const rel of fichiers) {
      const suivi = spawnSync('git', ['-C', copie, 'cat-file', '-e', `HEAD:${rel}`]).status === 0;
      const diff = suivi
        ? gitDans(copie, 'diff', 'HEAD', '--', rel)
        : spawnSync('git', ['-C', copie, 'diff', '--no-index', '/dev/null', rel], {
            encoding: 'utf8',
          }).stdout;
      if (duTestwriter(rel)) {
        tests += diff;
      } else {
        code += diff;
      }
    }
    enregistrer(id, tests, code, message);
  };

  // <id> as the queue leaves a branch it sent back (grillhouse-3uv.63 critères 5 et 18): its lot
  // committed on agent/<id> over the base its copy was made from, its copy removed, its ticket
  // open. The commit is made here, by the test, in the place of the integration.
  const renvoyer = (id: string) => {
    const copie = copieDe(id);
    gitDans(copie, 'add', '-A');
    gitDans(copie, 'commit', '-q', '-F', lots.get(id)!.message);
    const x = retirer(id);
    if (x.status !== 0) {
      throw new Error(`retirer ${id} : ${x.stderr}`);
    }
    const etat = lireEtat();
    etat[id].status = 'open';
    etat[id].comments.push({ text: 'Sorti de la file : conflit.' });
    ecrireEtat(etat);
  };

  // The relaunch of <id> by the frame's launcher, role developpeur on src/a, the envelope stood
  // in by ENVELOPPE_NUE in a copy of the frame's package under <bin>/cadre (its scripts, beside
  // which the launcher finds its envelope, its command, by which it runs a command of the module of
  // the language, its package.json and the tools a project installs beside it, apart from the
  // stand-ins of <bin>) and claude by a script
  // that records the session in <bin>/sessions.
  const cadre = path.join(bin, 'cadre');
  const lanceur = path.join(cadre, 'scripts/enveloppe/lancer.sh');
  // The temporary directory of the launches of this site, as Bazel gives each test its
  // TEST_TMPDIR: the launcher opens there the temporary directory of each ticket
  // (scripts/mesure/base-de-passe.mjs, `ouvrirBaseDuTicket`), never in one a neighbour file shares;
  // it goes with the trial root of the file.
  const temporaire = mkdtempSync(path.join(bin, 'tmp-'));
  const lancer = (id: string): SpawnSyncReturns<string> => {
    if (!existsSync(lanceur)) {
      const scripts = path.dirname(path.dirname(LANCER));
      cpSync(scripts, path.join(cadre, 'scripts'), { recursive: true });
      cpSync(path.join(scripts, '../bin'), path.join(cadre, 'bin'), { recursive: true });
      cpSync(path.join(scripts, '../package.json'), path.join(cadre, 'package.json'));
      // The tools a project of TypeScript installs beside the package (its optional peers,
      // jsonc-parser that the module typescript imports, Turborepo), as npm resolves them.
      symlinkSync(path.join(RACINE, 'node_modules'), path.join(cadre, 'node_modules'), 'dir');
      writeFileSync(path.join(cadre, 'scripts/enveloppe/enveloppe.mjs'), ENVELOPPE_NUE);
      writeFileSync(
        path.join(bin, 'claude'),
        `#!/bin/sh\necho "$(pwd)" >> ${path.join(bin, 'sessions')}\n`,
        { mode: 0o755 }
      );
    }
    const consigne = path.join(bin, `${id}.consigne`);
    writeFileSync(consigne, `TON TICKET : ${id} — relancé.`);
    const home = mkdtempSync(path.join(bin, 'home-'));
    return spawnSync('bash', [lanceur, id, 'developpeur', 'src/a', consigne], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...env,
        CLAUDE_BIN: path.join(bin, 'claude'),
        HOME: home,
        TMPDIR: temporaire,
        TMP: temporaire,
        TEMP: temporaire,
      },
      timeout: 120_000,
    });
  };
  // The sessions the launcher started, by the directory each ran in.
  const sessions = () => lireF(path.join(bin, 'sessions')).trim().split('\n').filter(Boolean);

  // The arguments of the integration of <id>'s lots, the script excluded.
  const argsIntegrer = (id: string, extra: string[] = []) => {
    const l = lots.get(id)!;
    return [
      '--ticket',
      id,
      ...(l.tests ? ['--tests', l.tests] : []),
      ...(l.code ? ['--code', l.code] : []),
      '--message',
      l.message,
      ...extra,
    ];
  };
  // The integration of <id>'s lots, as the circuit runs it from the main tree.
  // The tickets in their order of arrival in the queue: as the circuit sends its branch once the
  // integration committed it.
  const arrivees: string[] = [];
  const arriver = (id: string) => {
    arrivees.splice(0, arrivees.length, ...arrivees.filter(a => a !== id), id);
  };
  const integrer = (id: string, ...extra: string[]): SpawnSyncReturns<string> => {
    const r = spawnSync('node', [INTEGRER, ...argsIntegrer(id, extra)], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });
    if (r.status === 0) {
      arriver(id);
    }
    return r;
  };
  // The same, without waiting: two integrations run side by side.
  const integrerEnFond = (id: string) =>
    lancerEnFond('node', [INTEGRER, ...argsIntegrer(id)]).then(r => {
      if (r.status === 0) {
        arriver(id);
      }
      return r;
    });
  const lancerEnFond = (cmd: string, args: string[]) =>
    new Promise<Resultat>(resolve => {
      const p = spawn(cmd, args, { cwd: repo, env });
      let stdout = '';
      let stderr = '';
      p.stdout.on('data', d => (stdout += d));
      p.stderr.on('data', d => (stderr += d));
      p.on('close', status => resolve({ status, stdout, stderr }));
    });
  // The integration of <id>, not waited for: its process, and its end.
  const integrerProcessus = (id: string): { p: ChildProcess; fin: Promise<Resultat> } => {
    const p = spawn('node', [INTEGRER, ...argsIntegrer(id)], { cwd: repo, env });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', d => (stdout += d));
    p.stderr.on('data', d => (stderr += d));
    const fin = new Promise<Resultat>(resolve =>
      p.on('close', status => {
        if (status === 0) {
          arriver(id);
        }
        resolve({ status, stdout, stderr });
      })
    );
    return { p, fin };
  };
  // The removal of the ticket's copy by the frame's script, without --jetable.
  const retirer = (id: string) =>
    spawnSync('bash', [RETIRER, copieDe(id)], { cwd: repo, encoding: 'utf8' });
  // A finished ticket handed to the queue: integrated, its copy removed by the integration itself
  // (grillhouse-3uv.63 critère 15).
  const livrer = (id: string, ...extra: string[]) => {
    const r = integrer(id, ...extra);
    if (r.status !== 0) {
      throw new Error(`integrer ${id} : ${r.stdout}${r.stderr}`);
    }
    if (existsSync(copieDe(id))) {
      throw new Error(`integrer ${id} : la copie ${copieDe(id)} reste en place`);
    }
    return r;
  };
  // The worker of the trial, on a task queue of its own, its output in its log; started once.
  const tache = `essai-${path.basename(repo)}`;
  const journalDuTravailleur = path.join(bin, 'travailleur.log');
  let travailleur: ChildProcess | null = null;
  const leTravailleur = () => {
    if (!serveurDeLaFile) {
      throw new Error(
        "le serveur de la file n'est pas ouvert : le fichier appelle serveurDeLaFileDIntegration."
      );
    }
    if (travailleur) {
      return serveurDeLaFile.env;
    }
    writeFileSync(journalDuTravailleur, '');
    const sortie = openSync(journalDuTravailleur, 'a');
    const p = spawn(process.execPath, [TRAVAILLEUR, '--file', tache], {
      env: { ...env, TEMPORAL_ADDRESS: serveurDeLaFile.adresse },
      stdio: ['ignore', sortie, sortie],
    });
    closeSync(sortie);
    travailleurs.push(p);
    travailleur = p;
    return serveurDeLaFile.env;
  };
  // The queue played as the circuits of its tickets send it their branches: each ticket the
  // integration left labelled `en-file` enters, in its order of arrival, and the call returns once
  // the queue gave each its issue and stands idle; what the worker wrote meanwhile is its output.
  const file = (): SpawnSyncReturns<string> => {
    const envServeur = leTravailleur();
    const etat = JSON.parse(readFileSync(path.join(bin, 'etat.json'), 'utf8')) as Record<
      string,
      Ticket
    >;
    const enFile = Object.values(etat)
      .filter(t => t.labels?.includes('en-file'))
      .map(t => t.id);
    const ordre = [
      ...arrivees.filter(a => enFile.includes(a)),
      ...enFile.filter(e => !arrivees.includes(e)),
    ];
    const avant = lireF(journalDuTravailleur).length;
    const r = spawnSync(
      process.execPath,
      [JOUER_LA_FILE, CADRE, repo, tache, journalDuTravailleur, ...ordre],
      {
        encoding: 'utf8',
        env: { ...env, TEMPORAL_ADDRESS: envServeur.TEMPORAL_ADDRESS },
        timeout: 660_000,
      }
    );
    return { ...r, stdout: `${lireF(journalDuTravailleur).slice(avant)}${r.stdout}` };
  };

  const lireF = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const bd = (id: string): Ticket =>
    (JSON.parse(readFileSync(path.join(bin, 'etat.json'), 'utf8')) as Record<string, Ticket>)[id];
  // The subjects of <ref>'s history, newest first.
  const sujets = (ref = 'main') => git('log', '--format=%s', ref).trim().split('\n');
  const sha = (ref: string) => git('rev-parse', ref).trim();
  const existe = (ref: string) =>
    spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', ref]).status === 0;
  const distantSha = (branche: string) =>
    spawnSync('git', ['-C', distant, 'rev-parse', '--verify', '-q', `refs/heads/${branche}`], {
      encoding: 'utf8',
    }).stdout.trim();
  // The suites and guards calls so far.
  const suites = () => lireF(`${repo}.suites`);
  const gardes = () => lireF(`${repo}.gardes`);

  return {
    repo,
    bin,
    distant,
    env,
    git,
    gitDans,
    poser,
    copieDe,
    ticket,
    inscrire,
    accepter,
    relots,
    renvoyer,
    lancer,
    sessions,
    argsIntegrer,
    integrer,
    integrerEnFond,
    integrerProcessus,
    lancerEnFond,
    retirer,
    livrer,
    arriver,
    file,
    bd,
    sujets,
    sha,
    existe,
    distantSha,
    suites,
    gardes,
    appels: () => lireF(path.join(bin, 'appels')),
  };
}

export type Chantier = ReturnType<typeof chantier>;

// Tracked files of <m>'s main that a build of the project could hard-link (grillhouse-3uv.73).
const LIES_CONTENUS = {
  'src/a/donnees.txt': 'un\ndeux\ntrois\n',
  'src/a/tests/fixture.txt': 'f1\nf2\n',
};
export function poserLies(m: Chantier) {
  m.poser(LIES_CONTENUS, 'fichiers liés');
}

// The state of the dependencies of the trial project: its workspaces (directory → package name,
// version 1.0.0) and the version of its external dependency `ext-lib`, a local archive
// vendor/ext-lib-<version>.tgz (1.0.0 and 2.0.0 exist), so `npm ci` needs no registry.
interface EtatDependances {
  espaces: Record<string, string>;
  externe: string;
}

// The trial project of the integration with dependencies (grillhouse-3uv.74): workspaces src/a and
// src/b, ext-lib 1.0.0 and its lock file, committed on main. npm runs offline, on a cache of its
// own. `espaces` replaces the workspaces of the initial state (directory → package name); `motifs` is
// the root's `workspaces` field, the patterns npm reads, by default the directories of the state.
export function chantierDependances(
  essais: string,
  {
    espaces: espacesInitiaux = { 'src/a': 'a', 'src/b': 'b' },
    motifs,
  }: { espaces?: Record<string, string>; motifs?: string[] } = {}
) {
  const vendor = mkdtempSync(path.join(essais, 'vendor-'));
  const cache = mkdtempSync(path.join(essais, 'cache-npm-'));
  const npmCles = {
    npm_config_cache: cache,
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
  };
  const npmEnv = { ...process.env, ...npmCles };
  for (const version of ['1.0.0', '2.0.0']) {
    const src = mkdtempSync(path.join(essais, 'ext-lib-'));
    writeFileSync(
      path.join(src, 'package.json'),
      JSON.stringify({ name: 'ext-lib', version, main: 'index.js' })
    );
    declarerLesLangages(src);
    writeFileSync(path.join(src, 'index.js'), `module.exports = '${version}';\n`);
    execFileSync('npm', ['pack', '--silent', '--pack-destination', vendor, src], { env: npmEnv });
  }
  const m = chantier(essais);
  Object.assign(m.env, npmCles);
  const scripts = (
    JSON.parse(readFileSync(path.join(m.repo, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    }
  ).scripts;
  const manifeste = ({ espaces, externe }: EtatDependances) =>
    JSON.stringify(
      {
        name: 'essai',
        private: true,
        workspaces: motifs ?? Object.keys(espaces),
        dependencies: { 'ext-lib': `file:vendor/ext-lib-${externe}.tgz` },
        scripts,
      },
      null,
      2
    );
  const espace = (nom: string) => JSON.stringify({ name: nom, version: '1.0.0' }, null, 2);
  // The files of the state <etat>: package.json, each workspace's package.json and the lock file
  // npm writes for them.
  const fichiers = (etat: EtatDependances): Fichiers => {
    const dir = mkdtempSync(path.join(essais, 'verrou-'));
    const out: Fichiers = { 'package.json': manifeste(etat) };
    for (const [d, nom] of Object.entries(etat.espaces)) {
      out[`${d}/package.json`] = espace(nom);
    }
    for (const [rel, contenu] of Object.entries(out)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), contenu!);
    }
    execFileSync('cp', ['-r', vendor, path.join(dir, 'vendor')]);
    execFileSync(
      'npm',
      ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--silent'],
      { cwd: dir, env: npmEnv }
    );
    out['package-lock.json'] = readFileSync(path.join(dir, 'package-lock.json'), 'utf8');
    return out;
  };
  const initial: EtatDependances = { espaces: espacesInitiaux, externe: '1.0.0' };
  execFileSync('cp', ['-r', vendor, path.join(m.repo, 'vendor')]);
  m.git('add', 'vendor');
  m.poser(fichiers(initial), 'dépendances');
  // The files of a lot that installs nowhere: its manifest and lock file name an archive absent
  // from the repository and from npm's cache, so `npm ci` empties node_modules, then fails.
  const introuvable = (): Fichiers => {
    const f = fichiers({ ...initial, externe: '2.0.0' });
    const absent = (t: string) =>
      t
        .replaceAll('ext-lib-2.0.0.tgz', 'ext-lib-9.9.9.tgz')
        .replace(/"integrity": "[^"]*"/g, '"integrity": "sha512-absente"');
    return {
      'package.json': absent(f['package.json']!),
      'package-lock.json': absent(f['package-lock.json']!),
    };
  };
  // The packages the node_modules of the copy <nom> (`integration`, `file`) holds, name → version
  // (null for a folder without one, a scope such as `@essai`): what its install put there.
  const installes = (nom: string) => {
    const dossier = path.join(m.repo, '.claude/worktrees', nom, 'node_modules');
    const presents: Record<string, string | null> = {};
    for (const n of existsSync(dossier) ? readdirSync(dossier) : []) {
      if (n.startsWith('.')) {
        continue;
      }
      const pj = path.join(dossier, n, 'package.json');
      presents[n] = existsSync(pj)
        ? ((JSON.parse(readFileSync(pj, 'utf8')) as { version?: string }).version ?? null)
        : null;
    }
    return presents;
  };
  // A mark in the node_modules of the copy <nom> (`integration`, `file`): `npm ci` empties
  // node_modules, so the mark says whether it ran since it was posed.
  const marque = (nom: string) =>
    path.join(m.repo, '.claude/worktrees', nom, 'node_modules/.marque');
  const poserMarque = (nom: string) => writeFileSync(marque(nom), 'posée\n');
  const marquee = (nom: string) => existsSync(marque(nom));
  // <id> waiting in the queue, in the place of its integration: its lot committed on agent/<id>
  // over the base its copy was made from, its copy removed, its ticket labelled `en-file`, its
  // branch at the end of the queue. The queue alone replays it.
  const enFile = (id: string) => {
    const copie = m.copieDe(id);
    m.gitDans(copie, 'add', '-A');
    m.gitDans(copie, 'commit', '-q', '-m', `feat: lot (${id})`);
    const x = m.retirer(id);
    if (x.status !== 0) {
      throw new Error(`retirer ${id} : ${x.stderr}`);
    }
    execFileSync('bd', ['update', id, '--add-label', 'en-file'], { env: m.env });
    m.arriver(id);
  };
  return {
    ...m,
    initial,
    fichiers,
    introuvable,
    installes,
    poserMarque,
    marquee,
    enFile,
  };
}
