import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnSyncReturns,
} from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inscrireEntree } from '../../scripts/integration/file-attente.mjs';

// The trial harness of the integration and of its queue (grillhouse-3uv.63): a repository with
// a fake Beads that keeps the state of its tickets, a bare remote `origin`, the frame's real
// scripts, and the tickets' copies made as the launcher makes them (branch agent/<ticket> from
// main's HEAD, the lot as local work in it).

export const INTEGRER_SCRIPT = path.resolve(__dirname, '../../scripts/integration/integrer.mjs');
const INTEGRER = INTEGRER_SCRIPT;
export const FILE = path.resolve(__dirname, '../../scripts/integration/file.mjs');
const RETIRER = path.resolve(__dirname, '../../scripts/retirer-copie.sh');
const LANCER = path.resolve(__dirname, '../../scripts/enveloppe/lancer.sh');

// The envelope as the launcher's tests stand it in: it runs the command after `--` in the copy,
// without any sandbox; the trial repository holds it at the launcher's path.
const ENVELOPPE_NUE = `import { spawnSync } from 'node:child_process';
const a = process.argv.slice(2);
const i = a.indexOf('--');
const r = spawnSync(a[i + 1], a.slice(i + 2), { cwd: a[0], stdio: 'inherit' });
process.exit(r.status ?? 1);
`;

// The fake Beads: the tickets live in <bin>/etat.json ({ id: { id, status, labels, comments,
// close_reason } }, in creation order); every call is appended to <bin>/appels, one per line.
// It answers show, comments (and comments add), update (--add-label, --remove-label, --status,
// --claim), label add/remove, close (--reason), reopen, list (--label, --status, --all) and
// `config get issue_prefix` (demo); any other call succeeds silently.
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
if (cmd === 'config' && reste[0] === 'get') { process.stdout.write(reste[1] === 'issue_prefix' ? 'demo\\n' : '\\n'); process.exit(0); }
if (cmd === 'show') { const { pos } = lire(reste); out(pos.map(ticket)); process.exit(0); }
if (cmd === 'comments') {
  if (reste[0] === 'add') {
    const { pos, opts } = lire(reste.slice(1));
    const fichier = opts.find(([k]) => k === '-f' || k === '--file');
    const t = ticket(pos[0]);
    const texte = fichier && typeof fichier[1] === 'string' ? fs.readFileSync(fichier[1], 'utf8') : pos.slice(1).join(' ');
    t.comments.push({ text: texte });
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
// ([{ si: [<path>, …], rouge: <test name> }]), the test it names when every path it lists exists.
const SUITES = `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.suites', '[' + process.argv.slice(2).join(' ') + ']');
let r = fs.existsSync('ROUGES_FORCES') ? fs.readFileSync('ROUGES_FORCES', 'utf8') : '';
const regles = fs.existsSync('REGLES.json') ? JSON.parse(fs.readFileSync('REGLES.json', 'utf8')) : [];
for (const g of regles) if (g.si.every(p => fs.existsSync(p))) r += g.rouge + '\\n';
fs.writeFileSync(process.env.ROUGES, r);
process.exit(r ? 1 : 0);
`;

// The guards of the trial project: each call appends « g » to <PRINCIPAL>.gardes, and they refuse
// while GARDE_ROUGE exists.
const GARDES = `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.gardes', 'g');
process.exit(fs.existsSync('GARDE_ROUGE') ? 1 : 0);
`;

export interface Fichiers {
  [rel: string]: string | null;
}

// A ticket of the fake Beads.
export interface Ticket {
  id: string;
  status: string;
  labels: string[];
  comments: { text: string }[];
  close_reason: string | null;
}

export interface Resultat {
  status: number | null;
  stdout: string;
  stderr: string;
}

// A project under <essais> whose components are src/a, src/b and src/c, its main pushed to a bare
// remote `origin`. <pkg> is merged into its package.json (the `grillhouse` section, for example).
export function chantier(essais: string, pkg: Record<string, unknown> = {}) {
  const repo = mkdtempSync(path.join(essais, 'chantier-'));
  const bin = mkdtempSync(path.join(essais, 'bin-'));
  const distant = mkdtempSync(path.join(essais, 'distant-'));
  writeFileSync(path.join(bin, 'bd'), FAUX_BD, { mode: 0o755 });
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
        scripts: {
          test: 'node suites.mjs',
          'integration:gardes': 'node gardes.mjs',
        },
      },
      null,
      2
    )
  );
  ecrire(repo, 'suites.mjs', SUITES);
  ecrire(repo, 'gardes.mjs', GARDES);
  for (const c of ['a', 'b', 'c']) {
    ecrire(repo, `src/${c}/index.ts`, `export const ${c} = 0;\n`);
  }
  ecrire(repo, '.gitignore', '.claude/worktrees/\nnode_modules\n');
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
  // Opens <id> in Beads with the reviewer's ACCEPTÉ, without any copy: a ticket named second in
  // an integration of several tickets (grillhouse-3uv.63 critère 19).
  const inscrire = (id: string) => {
    const etat = lireEtat();
    etat[id] = {
      id,
      status: 'in_progress',
      labels: [],
      comments: [{ text: 'ACCEPTÉ' }],
      close_reason: null,
    };
    ecrireEtat(etat);
  };
  // The reviewer's ACCEPTÉ again on <id>, as after a new review.
  const accepter = (id: string) => {
    const etat = lireEtat();
    etat[id].comments.push({ text: 'ACCEPTÉ' });
    ecrireEtat(etat);
  };
  // True when <rel> goes to the tests lot: a test file, or any file under a test folder (the
  // frame's rule, scripts/verrous/verrou.mjs isTestFile).
  const duTesteur = (rel: string) =>
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
      if (duTesteur(rel)) {
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
      if (duTesteur(rel)) {
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
  // in by ENVELOPPE_NUE and claude by a script that records the session in <bin>/sessions.
  const lancer = (id: string): SpawnSyncReturns<string> => {
    const role = path.join(repo, '.claude/agents/developpeur.md');
    if (!existsSync(role)) {
      ecrire(repo, '.claude/agents/developpeur.md', '---\nname: developpeur\n---\n');
      ecrire(repo, 'scripts/enveloppe/enveloppe.mjs', ENVELOPPE_NUE);
      writeFileSync(
        path.join(bin, 'claude'),
        `#!/bin/sh\necho "$(pwd)" >> ${path.join(bin, 'sessions')}\n`,
        { mode: 0o755 }
      );
    }
    const consigne = path.join(bin, `${id}.consigne`);
    writeFileSync(consigne, `TON TICKET : ${id} — relancé.`);
    const home = mkdtempSync(path.join(bin, 'home-'));
    return spawnSync('bash', [LANCER, id, 'developpeur', 'src/a', consigne], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...env, CLAUDE_BIN: path.join(bin, 'claude'), HOME: home },
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
  // The integration of <id>'s lots, as the integrateur runs it from the main tree.
  const integrer = (id: string, ...extra: string[]): SpawnSyncReturns<string> =>
    spawnSync('node', [INTEGRER, ...argsIntegrer(id, extra)], { cwd: repo, encoding: 'utf8', env });
  // The same, without waiting: two integrations run side by side.
  const integrerEnFond = (id: string) => lancerEnFond('node', [INTEGRER, ...argsIntegrer(id)]);
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
      p.on('close', status => resolve({ status, stdout, stderr }))
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
  // The queue, as the integrateur launches it from the main tree.
  const file = (...args: string[]): SpawnSyncReturns<string> =>
    spawnSync('node', [FILE, ...args], { cwd: repo, encoding: 'utf8', env, timeout: 120_000 });

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

// The build of grillhouse-3uv.73, as BPScript's: it hard-links each file of LIES that exists into
// dist/ (fs.linkSync), which changes that tracked file's status-change time (ctime) after the copy
// wrote its index. It first waits for the clock to pass the second of the last status change of
// those files, so the change shows whatever precision git compares. It appends « lien » to
// <PRINCIPAL>.builds, and fails, after linking, while CONSTRUCTION_ROUGE exists.
const LIES = ['src/a/donnees.txt', 'src/a/tests/fixture.txt'];
const BUILD_LIENS = `import fs from 'node:fs';
import path from 'node:path';
const lies = ${JSON.stringify(LIES)}.filter(f => fs.existsSync(f));
const dernier = Math.max(0, ...lies.map(f => fs.statSync(f).ctimeMs));
const reste = (Math.floor(dernier / 1000) + 1) * 1000 + 20 - Date.now();
if (reste > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, reste);
for (const f of lies) {
  const cible = path.join('dist', f);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.linkSync(f, cible);
}
fs.appendFileSync(process.env.PRINCIPAL + '.builds', 'lien\\n');
process.exit(fs.existsSync('CONSTRUCTION_ROUGE') ? 1 : 0);
`;

// The files the build of grillhouse-3uv.73 links, committed on main of <m> without any build.
const LIES_CONTENUS = {
  'src/a/donnees.txt': 'un\ndeux\ntrois\n',
  'src/a/tests/fixture.txt': 'f1\nf2\n',
};
export function poserLies(m: Chantier) {
  m.poser(LIES_CONTENUS, 'fichiers liés');
}

// Commits on main of <m> the build of grillhouse-3uv.73 as the root's `build` script (the trial's
// components have none), the files it links, and dist/ ignored. Returns the builds so far.
export function construireParLiens(m: Chantier) {
  const pkg = JSON.parse(readFileSync(path.join(m.repo, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  m.poser(
    {
      'package.json': JSON.stringify(
        { ...pkg, scripts: { ...pkg.scripts, build: 'node build.mjs' } },
        null,
        2
      ),
      'build.mjs': BUILD_LIENS,
      '.gitignore': '.claude/worktrees/\nnode_modules\ndist/\n',
      ...LIES_CONTENUS,
    },
    'construction par liens'
  );
  const f = `${m.repo}.builds`;
  return () => (existsSync(f) ? readFileSync(f, 'utf8') : '').split('\n').filter(Boolean);
}

// The suites of grillhouse-3uv.73 critère 8: the trial's suites (SUITES), which first hard-link
// each file of LIES that exists to a name of their own and unlink it at once, after waiting for the
// clock to pass the second of the last status change of those files: the link changes the tracked
// file's ctime after the copy wrote its index, with no build. They append « lien » to
// <PRINCIPAL>.suites-liens on each call.
const SUITES_LIENS = SUITES.replace(
  "import fs from 'node:fs';\n",
  `import fs from 'node:fs';
const lies = ${JSON.stringify(LIES)}.filter(f => fs.existsSync(f));
const dernier = Math.max(0, ...lies.map(f => fs.statSync(f).ctimeMs));
const reste = (Math.floor(dernier / 1000) + 1) * 1000 + 20 - Date.now();
if (reste > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, reste);
for (const f of lies) {
  const cible = f + '.lien-' + process.pid;
  fs.linkSync(f, cible);
  fs.unlinkSync(cible);
}
fs.appendFileSync(process.env.PRINCIPAL + '.suites-liens', 'lien\\n');
`
);

// Commits on main of <m> the suites of grillhouse-3uv.73 critère 8 and the files they link, with
// no build. Returns the runs of those suites so far.
export function suitesParLiens(m: Chantier) {
  m.poser({ 'suites.mjs': SUITES_LIENS, ...LIES_CONTENUS }, 'suites par liens');
  const f = `${m.repo}.suites-liens`;
  return () => (existsSync(f) ? readFileSync(f, 'utf8') : '').split('\n').filter(Boolean);
}

// grillhouse-3uv.74: the dependencies of the replay's copy follow its lock file. The project's
// suites and guards read the dependencies (DEPENDANCES): for each package of package-lock.json,
// they resolve it by its name from the root and compare its version with the lock's; a package not
// found or at another version fails the suites (one failing test per package) and the guards. The
// suites also fail the tests named by ROUGES_FORCES, as the trial's suites (SUITES) do. Each
// call appends to <PRINCIPAL>.dependances one JSON line: the packages node_modules holds then, name
// → version (null for a package without one).
const DEPENDANCES = `import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
export function desaccords(qui) {
  const verrou = JSON.parse(fs.readFileSync('package-lock.json', 'utf8')).packages ?? {};
  const requerir = createRequire(path.resolve('package.json'));
  const faux = [];
  for (const [cle, e] of Object.entries(verrou)) {
    if (!cle.startsWith('node_modules/')) continue;
    const nom = cle.slice('node_modules/'.length);
    const attendu = e.link ? verrou[e.resolved]?.version : e.version;
    let vu = null;
    try {
      vu = JSON.parse(fs.readFileSync(requerir.resolve(nom + '/package.json'), 'utf8')).version;
    } catch {
      faux.push('dépendance introuvable : ' + nom);
      continue;
    }
    if (vu !== attendu) faux.push('dépendance ' + nom + ' : ' + vu + ' au lieu de ' + attendu);
  }
  const presents = {};
  const dossier = 'node_modules';
  for (const n of fs.existsSync(dossier) ? fs.readdirSync(dossier) : []) {
    if (n.startsWith('.')) continue;
    const pj = path.join(dossier, n, 'package.json');
    presents[n] = fs.existsSync(pj) ? (JSON.parse(fs.readFileSync(pj, 'utf8')).version ?? null) : null;
  }
  fs.appendFileSync(process.env.PRINCIPAL + '.dependances', JSON.stringify({ qui, presents }) + '\\n');
  return faux;
}
`;
const SUITES_DEPENDANCES = `import fs from 'node:fs';
import { desaccords } from './dependances.mjs';
fs.appendFileSync(process.env.PRINCIPAL + '.suites', '[' + process.argv.slice(2).join(' ') + ']');
let r = fs.existsSync('ROUGES_FORCES') ? fs.readFileSync('ROUGES_FORCES', 'utf8') : '';
r += desaccords('suites').map(n => n + '\\n').join('');
fs.writeFileSync(process.env.ROUGES, r);
process.exit(r ? 1 : 0);
`;
const GARDES_DEPENDANCES = `import fs from 'node:fs';
import { desaccords } from './dependances.mjs';
fs.appendFileSync(process.env.PRINCIPAL + '.gardes', 'g');
const faux = desaccords('gardes');
for (const f of faux) console.error(f);
process.exit(faux.length ? 1 : 0);
`;
// The build of the trial project with dependencies (`chantierDependances`, `construction`): it
// reads the dependencies as the guards do, fails on a package not found or at another version,
// and leaves no dist/, so every passage builds again.
const CONSTRUCTION_DEPENDANCES = `import { desaccords } from './dependances.mjs';
const faux = desaccords('construction');
for (const f of faux) console.error(f);
process.exit(faux.length ? 1 : 0);
`;

// The state of the dependencies of the trial project: its workspaces (directory → package name,
// version 1.0.0) and the version of its external dependency `ext-lib`, a local archive
// vendor/ext-lib-<version>.tgz (1.0.0 and 2.0.0 exist), so `npm ci` needs no registry.
interface EtatDependances {
  espaces: Record<string, string>;
  externe: string;
}

// The trial project of the integration with dependencies (grillhouse-3uv.74): workspaces src/a and
// src/b, ext-lib 1.0.0, its lock file, its suites and guards reading the dependencies, committed
// on main. npm runs offline, on a cache of its own. With `construction`, the root's `build` script
// reads the dependencies too (CONSTRUCTION_DEPENDANCES), in every manifest of the project.
// `espaces` replaces the workspaces of the initial state (directory → package name); `motifs` is
// the root's `workspaces` field, the patterns npm reads, by default the directories of the state.
export function chantierDependances(
  essais: string,
  {
    construction = false,
    espaces: espacesInitiaux = { 'src/a': 'a', 'src/b': 'b' },
    motifs,
  }: { construction?: boolean; espaces?: Record<string, string>; motifs?: string[] } = {}
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
  if (construction) {
    scripts.build = 'node construction.mjs';
  }
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
  m.poser(
    {
      ...fichiers(initial),
      'dependances.mjs': DEPENDANCES,
      'suites.mjs': SUITES_DEPENDANCES,
      'gardes.mjs': GARDES_DEPENDANCES,
      ...(construction ? { 'construction.mjs': CONSTRUCTION_DEPENDANCES } : {}),
    },
    'dépendances'
  );
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
  const lireF = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  // Each reading of the dependencies so far, in order: who read (construction, suites, gardes) and
  // the packages node_modules held.
  const lectures = () =>
    lireF(`${m.repo}.dependances`)
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { qui: string; presents: Record<string, string | null> });
  // The number of suites calls so far.
  const appelsSuites = () => (m.suites().match(/\[/g) ?? []).length;
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
    inscrireEntree(m.repo, `agent/${id}`, [id]);
  };
  return {
    ...m,
    initial,
    fichiers,
    introuvable,
    lectures,
    appelsSuites,
    poserMarque,
    marquee,
    enFile,
  };
}
