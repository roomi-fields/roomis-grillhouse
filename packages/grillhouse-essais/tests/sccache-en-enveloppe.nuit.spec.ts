import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE, enProcessus } from './cadre.js';

// Witness: OSC Bridge, OB-p58, under Grillhouse 0.26.0 (2026-10-31). In the envelope of an agent,
// every build of cargo stopped on « sccache: error: path must be shorter than SUN_LEN »
// (target/grillhouse/osc-bridge-build.log). sccache 0.19.0 starts its server by binding a socket
// under TMPDIR (`<TMPDIR>/sccacheXXXXXX/sock`, src/commands.rs, `run_server_process`); in the
// envelope, TMPDIR is the session's working directory, and the pass of tests opens its base under
// it: past the 108 bytes of a socket's path. The commands of the module cargo start the copy's
// server themselves, under /tmp, before cargo runs.

const ENVELOPPE = path.join(CADRE, 'scripts/enveloppe/enveloppe.mjs');
const COMMANDES = path.join(CADRE, 'scripts/langages/cargo/commandes.mjs');
const dossierDeTravail = enProcessus<string>('scripts/enveloppe/enveloppe.mjs', 'dossierDeTravail');
const avecSccache = enProcessus<NodeJS.ProcessEnv>(
  'scripts/langages/cargo/sccache.mjs',
  'avecSccache'
);
const demarrerLeServeur = enProcessus<null>(
  'scripts/langages/cargo/sccache.mjs',
  'demarrerLeServeur'
);

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-sccache-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// A project of Rust and its agent copy, `.claude/worktrees/demo-1`.
function depot() {
  const repo = path.join(ESSAIS, 'depot');
  const copie = path.join(repo, '.claude/worktrees/demo-1');
  ecrire(repo, 'package.json', '{ "name": "essai", "grillhouse": { "langages": ["cargo"] } }\n');
  ecrire(repo, 'Cargo.toml', '[package]\nname = "essai"\nversion = "0.1.0"\nedition = "2021"\n');
  ecrire(repo, 'src/lib.rs', 'pub fn un() -> u32 { 1 }\n');
  ecrire(repo, '.gitignore', 'target/\n');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'init');
  git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
  return copie;
}

// The answer of `cargo metadata --no-deps` for the trial in the working directory, which the
// envelope reads before the session (its crates).
const METADATA = [
  'if [ "$1" = metadata ]; then',
  '  id="path+file://$PWD#essai@0.1.0"',
  `  printf '{"packages":[{"name":"essai","id":"%s","manifest_path":"%s/Cargo.toml","dependencies":[],"targets":[{"kind":["lib"],"name":"essai","src_path":"%s/src/lib.rs","doctest":true}],"metadata":null}],"workspace_members":["%s"],"workspace_root":"%s","target_directory":"%s/target","metadata":null,"resolve":null,"version":1}' "$id" "$PWD" "$PWD" "$id" "$PWD" "$PWD"`,
  '  exit 0',
  'fi',
].join('\n');

// A fake cargo and a fake sccache: each call under `$JOURNAL` adds to it its name, its arguments,
// its temporary directory, its server's socket and its namespace of processes.
function faux() {
  const dossier = path.join(ESSAIS, 'faux');
  const ligne = (nom: string) =>
    [
      '#!/bin/sh',
      ...(nom === 'cargo' ? [METADATA] : []),
      `[ -n "$JOURNAL" ] && printf '%s\\n' "${nom} $* TMPDIR=$TMPDIR UDS=$SCCACHE_SERVER_UDS NS=$(readlink /proc/self/ns/pid)" >> "$JOURNAL"`,
      'exit 0',
      '',
    ].join('\n');
  for (const nom of ['cargo', 'sccache']) {
    ecrire(dossier, nom, ligne(nom));
    chmodSync(path.join(dossier, nom), 0o755);
  }
  return dossier;
}

type Appel = { appel: string; tmpdir: string; socket: string; espace: string };
const lire = (journal: string): Appel[] =>
  readFileSync(journal, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const [appel, reste] = l.split(' TMPDIR=');
      const [tmpdir, apres] = reste.split(' UDS=');
      const [socket, espace] = apres.split(' NS=');
      return { appel, tmpdir, socket, espace };
    });

describe.runIf(canWrap)(
  'grillhouse-qmk, critère 1 — cargo compile à travers sccache dans une vraie enveloppe',
  { timeout: 120_000 },
  () => {
    const copie = depot();
    const home = path.join(ESSAIS, 'home');
    mkdirSync(path.join(home, '.claude'), { recursive: true });
    const PATH = [faux(), path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter);
    const ENV = { ...process.env, HOME: home, PATH };
    const travail = dossierDeTravail(copie);

    // `typer` of the module cargo in the copy, in the envelope or out of it: its code and the calls.
    const typer = (dedans: boolean) => {
      const journal = path.join(travail, dedans ? 'dedans' : 'dehors');
      mkdirSync(travail, { recursive: true });
      writeFileSync(journal, '');
      const shell = `JOURNAL='${journal}' exec node '${COMMANDES}' typer`;
      const r = dedans
        ? spawnSync('node', [ENVELOPPE, copie, '.', 'developpeur', '--', 'sh', '-c', shell], {
            encoding: 'utf8',
            env: ENV,
          })
        : spawnSync('sh', ['-c', shell], { cwd: copie, encoding: 'utf8', env: ENV });
      return { code: r.status, sortie: `${r.stdout}\n${r.stderr}`, appels: lire(journal) };
    };

    it('the server starts under /tmp, then cargo compiles under the session’s working directory, one socket for both', () => {
      const r = typer(true);
      expect(r.code, r.sortie).toBe(0);
      expect(r.appels.map(a => a.appel)).toEqual([
        'sccache --start-server',
        'cargo check --all-targets',
      ]);
      const [serveur, cargo] = r.appels;
      expect(serveur.tmpdir).toBe('/tmp');
      expect(cargo.tmpdir).toBe(travail);
      expect(serveur.socket).toMatch(/^\\x00grillhouse-sccache-[0-9a-f]{16}$/);
      expect(cargo.socket).toBe(serveur.socket);
    });

    it('the server is proper to the copy and to the envelope: out of it, another socket', () => {
      const dedans = typer(true).appels[0];
      const dehors = typer(false).appels[0];
      expect(dehors.appel).toBe('sccache --start-server');
      expect(dedans.espace).not.toBe(dehors.espace);
      expect(dedans.socket).not.toBe(dehors.socket);
    });
  }
);

const AVEC_SCCACHE =
  spawnSync('sccache', ['--version']).status === 0 && spawnSync('rustc', ['-vV']).status === 0;

describe.runIf(AVEC_SCCACHE)(
  'grillhouse-qmk, critère 1 — la cause, rejouée avec le vrai sccache',
  () => {
    // A temporary directory as long as the base of a pass under the working directory of a session
    // in OSC Bridge's copy (`/tmp/claude-1000/-home-romi-dev-mcp-osc-bridge--claude-worktrees-OB-p58/
    // travail/grillhouse-tests-XXXXXX/t`, 105 bytes).
    const LONG = path.join(ESSAIS, 'x'.repeat(60), 'y'.repeat(40));
    const racine = path.join(ESSAIS, 'copie-du-vrai');
    const env = (): NodeJS.ProcessEnv => ({
      ...avecSccache(racine, process.env),
      TMPDIR: LONG,
    });
    const arreter = () => spawnSync('sccache', ['--stop-server'], { env: env(), stdio: 'ignore' });
    afterAll(arreter);

    it('without a server, sccache refuses to start under the long directory; started by the frame, it compiles', () => {
      mkdirSync(LONG, { recursive: true });
      mkdirSync(racine, { recursive: true });
      arreter();
      const avant = spawnSync('sccache', ['rustc', '-vV'], { env: env(), encoding: 'utf8' });
      expect(avant.status).not.toBe(0);
      expect(avant.stderr).toContain('path must be shorter than SUN_LEN');
      demarrerLeServeur(racine, { ...process.env, TMPDIR: LONG });
      const apres = spawnSync('sccache', ['rustc', '-vV'], { env: env(), encoding: 'utf8' });
      expect(apres.status, apres.stderr).toBe(0);
      expect(apres.stdout).toContain('release:');
    });
  }
);
