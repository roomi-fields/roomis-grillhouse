import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnSyncReturns,
} from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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
  const env = {
    ...process.env,
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
          'integration:suites': 'node suites.mjs',
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
      if (/\.(spec|test)\.[cm]?[jt]s$/.test(rel)) {
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
      if (/\.(spec|test)\.[cm]?[jt]s$/.test(rel)) {
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
