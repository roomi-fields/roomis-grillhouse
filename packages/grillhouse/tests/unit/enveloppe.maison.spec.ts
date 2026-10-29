import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, hasBd, racineSousLaMaison } from '../machine.js';
import { SCRIPT, declarerLeLangage, enveloppeEssai } from './enveloppe-essai.js';

// The envelope of an agent (scripts/enveloppe/enveloppe.mjs, tests/unit/enveloppe.spec.ts): what
// it shows of the home and of the session, and only that.
// The trial harness: ./enveloppe-essai.ts.

// The real envelope, when this machine can build one. Its repositories live outside /tmp, which
// the envelope replaces with an empty directory, in a trial directory of this run alone.
const ESSAIS = racineSousLaMaison('grillhouse-essais-enveloppe-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { essai } = enveloppeEssai(ESSAIS);

// METACADRE intention 5, « des agents cadrés », and the arbitration of grillhouse-3uv.8: like
// Flatpak and the development containers, the envelope shows of the home and of the session
// directory ($XDG_RUNTIME_DIR, /run/user/<uid>) what it declares, and nothing else. It declares
// what the session needs: `~/.claude` and `~/.claude.json`, claude's binary and versions
// (`~/.local/bin/claude`, `~/.local/share/claude`), node and its tools (`~/.nvm`), `~/.gitconfig`,
// the npm cache, and the repository (main tree, its `.git`, `.beads`) with today's rights, the
// whole of it in sight. No socket of the session comes back.
describe.runIf(canWrap)(
  'the envelope shows of the home and the session only what it declares',
  () => {
    const home = essai('home-');
    // The repository lives in the home, as on the machine.
    const repo = path.join(home, 'dev/projet');
    mkdirSync(path.join(repo, 'packages/a/src'), { recursive: true });
    mkdirSync(path.join(repo, 'packages/b/src'), { recursive: true });
    writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'a');
    writeFileSync(path.join(repo, 'packages/b/src/b.ts'), 'code-of-b');
    writeFileSync(path.join(repo, 'LISEZMOI'), 'racine');
    declarerLeLangage(repo);
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    // A real tickets base, made by bd in this home when the machine has bd: it writes there its own
    // state (`~/.dolt`, `~/.beads`, `~/.config/bd`), which the session's bd reads to open the base.
    // Without bd, the directory of the base is made by hand: the test that reads and writes the
    // base through bd skips, the one that writes in its directory runs (grillhouse-3uv.50.1).
    if (hasBd) {
      execFileSync('bd', ['init', '-q', '--non-interactive', '-p', 'essai'], {
        cwd: repo,
        env: { ...process.env, HOME: home },
        stdio: 'pipe',
      });
    } else {
      mkdirSync(path.join(repo, '.beads'));
      writeFileSync(path.join(repo, '.beads/config.yaml'), '');
    }
    git('add', '.');
    git('commit', '-qm', 'init');
    const copie = path.join(repo, '.claude/worktrees/demo-1');
    git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
    const autre = path.join(repo, '.claude/worktrees/demo-2');
    git('worktree', 'add', '-q', '-b', 'agent/demo-2', autre);
    const copieRtfm = path.join(repo, '.claude/worktrees/demo-3');
    git('worktree', 'add', '-q', '-b', 'agent/demo-3', copieRtfm);
    // The indexes of the repository, as codegraph and rtfm make them in each tree they index (the
    // main tree, a copy), and their state in the home. demo-3 holds the index of rtfm alone.
    const INDEX: string[] = [];
    const indexer = (arbre: string, rels: string[]) => {
      for (const rel of rels) {
        const f = path.join(arbre, rel);
        mkdirSync(path.dirname(f), { recursive: true });
        writeFileSync(f, 'INDEX-of-the-repository code-of-b');
        INDEX.push(f);
      }
    };
    for (const arbre of [repo, copie, autre]) {
      indexer(arbre, ['.codegraph/codegraph.db', '.codegraph/sub/wal', '.rtfm/index.db']);
    }
    indexer(copieRtfm, ['.rtfm/index.db']);

    // Stores of secrets: those of the usual tools, those of rarer ones, and two whose names are
    // drawn at random, so that no list of the envelope can name them.
    const inconnu = `.${randomUUID()}`;
    const SECRETS: Record<string, string> = {
      '.ssh/id_ed25519': 'SECRET-ssh-key',
      '.config/gh/hosts.yml': 'SECRET-gh-token',
      '.npmrc': 'SECRET-npm-token',
      '.aws/credentials': 'SECRET-aws-key',
      '.gnupg/private-keys-v1.d/k.key': 'SECRET-gpg-key',
      '.netrc': 'SECRET-netrc',
      '.git-credentials': 'SECRET-git-credentials',
      '.config/git/credentials': 'SECRET-git-xdg-credentials',
      '.docker/config.json': 'SECRET-docker-auth',
      '.kube/config': 'SECRET-kube-token',
      '.ollama/id_ed25519': 'SECRET-ollama-key',
      '.config/restic/password': 'SECRET-restic-password',
      '.local/share/keyrings/login.keyring': 'SECRET-keyring',
      '.bash_history': 'SECRET-history',
      '.claude.json.bak': 'SECRET-claude-backup',
      // The state of codegraph and rtfm in the home: the envelope does not declare it.
      '.codegraph/daemons/sonde': 'SECRET-codegraph-state',
      '.rtfm/memory.db': 'SECRET-rtfm-state',
      // Beside the targets of the declared configurations a dotfiles manager links (below).
      'dotfiles/autre': 'SECRET-dotfiles-neighbour',
      'dotfiles/git/autre': 'SECRET-dotfiles-deep-neighbour',
      'stow/autre': 'SECRET-stow-neighbour',
      [`${inconnu}/token`]: 'SECRET-unnamed-store',
      [`.config/${randomUUID()}/auth.json`]: 'SECRET-unnamed-config',
    };
    // What the session reads to start and work: it comes back.
    const DECLARES: Record<string, string> = {
      '.claude/.credentials.json': 'claude-oauth',
      '.claude/settings.json': '{}',
      '.claude.json': '{"etat":1}',
      '.nvm/versions/node/v1/bin/marque': 'nvm',
      '.npm/_cacache/marque': 'cache',
    };
    for (const [rel, contenu] of Object.entries({ ...SECRETS, ...DECLARES })) {
      mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
      writeFileSync(path.join(home, rel), contenu);
    }
    // The launchers of the home are links, as on the machine: claude's to its binary; those of
    // codegraph, rtfm and a tool of node to a script of their package, which finds the package's
    // other files beside its own real path.
    const ecrire = (rel: string, contenu: string, mode = 0o644) => {
      mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
      writeFileSync(path.join(home, rel), contenu, { mode });
    };
    const lier = (rel: string, cible: string) => {
      mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
      symlinkSync(cible, path.join(home, rel));
    };
    const LANCEUR = '#!/bin/sh\ncat "$(dirname "$(readlink -f "$0")")/voisin"\n';
    ecrire('.local/share/claude/versions/1.0.0', '#!/bin/sh\necho claude-demarre\n', 0o755);
    lier('.local/bin/claude', path.join(home, '.local/share/claude/versions/1.0.0'));
    ecrire('.nvm/versions/node/v1/lib/node_modules/codegraph/shim.sh', LANCEUR, 0o755);
    ecrire('.nvm/versions/node/v1/lib/node_modules/codegraph/voisin', 'codegraph-voisin\n');
    lier('.nvm/versions/node/v1/bin/codegraph', '../lib/node_modules/codegraph/shim.sh');
    lier('.local/bin/codegraph', path.join(home, '.nvm/versions/node/v1/bin/codegraph'));
    ecrire('.local/share/pipx/venvs/rtfm/bin/rtfm', LANCEUR, 0o755);
    ecrire('.local/share/pipx/venvs/rtfm/bin/voisin', 'rtfm-voisin\n');
    lier('.local/bin/rtfm', path.join(home, '.local/share/pipx/venvs/rtfm/bin/rtfm'));
    ecrire('.nvm/versions/node/v1/lib/node_modules/outil/shim.sh', LANCEUR, 0o755);
    ecrire('.nvm/versions/node/v1/lib/node_modules/outil/voisin', 'outil-voisin\n');
    lier('.nvm/versions/node/v1/bin/outil', '../lib/node_modules/outil/shim.sh');
    // The git configurations are links a dotfiles manager keeps into directories of the home the
    // envelope does not declare: an absolute link, a relative one, and a link to a link.
    ecrire('dotfiles/gitconfig', '[user]\n\tname = t\n');
    lier('.gitconfig', path.join(home, 'dotfiles/gitconfig'));
    ecrire('dotfiles/git/ignore', '*.sonde\n');
    lier('.config/git/ignore', '../../dotfiles/git/ignore');
    ecrire('stow/attributes', '*.sonde diff\n');
    lier('dotfiles/lien-attributes', path.join(home, 'stow/attributes'));
    lier('.config/git/attributes', path.join(home, 'dotfiles/lien-attributes'));
    // The paths of the home the envelope declares, as prefixes; every file seen in the home falls
    // under one of them.
    const PREFIXES = [
      '.claude/',
      '.claude.json',
      '.gitconfig',
      '.local/bin/claude',
      '.local/share/claude/',
      '.nvm/',
      '.npm/',
      '.dolt/',
      '.beads/',
      '.config/bd/',
      '.config/git/ignore',
      '.config/git/attributes',
      'dotfiles/gitconfig',
      'dotfiles/git/ignore',
      'dotfiles/lien-attributes',
      'stow/attributes',
      'dev/projet/',
    ];

    // A session directory holding the sockets of the session (ssh agent, bus, gpg-agent) and a
    // file. A socket path is bound relative to its directory: the absolute one may pass the limit
    // of 108 signs.
    const session = essai('session-');
    const prise = (rel: string) => {
      const dir = path.join(session, path.dirname(rel));
      mkdirSync(dir, { recursive: true });
      execFileSync(
        'python3',
        [
          '-c',
          'import socket,sys; socket.socket(socket.AF_UNIX).bind(sys.argv[1])',
          path.basename(rel),
        ],
        { cwd: dir }
      );
      return path.join(session, rel);
    };
    const agentSsh = prise('keyring/ssh');
    const bus = prise('bus');
    prise('gnupg/S.gpg-agent');
    writeFileSync(path.join(session, 'SECRET-session-file'), 'SECRET-session');

    const env = (maison: string) => ({
      ...process.env,
      HOME: maison,
      XDG_RUNTIME_DIR: session,
      SSH_AUTH_SOCK: agentSsh,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${bus}`,
      npm_config_cache: path.join(maison, '.npm'),
    });
    const run = (shell: string, maison = home, dans = copie) =>
      spawnSync('node', [SCRIPT, dans, 'packages/a', 'developpeur', '--', 'bash', '-c', shell], {
        encoding: 'utf8',
        env: env(maison),
      });

    it('shows no store of the home it does not declare, named by a list or not', () => {
      for (const [rel, secret] of Object.entries(SECRETS)) {
        const r = run(`cat ~/${rel}; test -e ~/${rel}`);
        expect(r.stdout, rel).not.toContain(secret);
        expect(r.status, rel).not.toBe(0);
      }
      expect(run(`test -e ~/${inconnu}`).status).not.toBe(0);
    });
    it('lets no search of the home reach a secret', () => {
      const r = run('grep -rs SECRET ~ 2>/dev/null; true');
      expect(r.stdout).not.toMatch(/SECRET/);
    });
    it('holds in the home only the files of its declared paths', () => {
      const r = run('cd ~ && find . -type f -o -type l');
      const vus = r.stdout
        .split('\n')
        .filter(Boolean)
        .map(l => l.replace(/^\.\//, ''));
      expect(vus.length).toBeGreaterThan(0);
      const horsDeclares = vus.filter(f => !PREFIXES.some(p => f === p || f.startsWith(p)));
      expect(horsDeclares).toEqual([]);
    });
    it('keeps what claude needs to start: credentials, settings, global state, binary, versions', () => {
      expect(run('cat ~/.claude/.credentials.json').stdout).toBe('claude-oauth');
      expect(run('cat ~/.claude/settings.json').stdout).toBe('{}');
      expect(run('cat ~/.claude.json').stdout).toBe('{"etat":1}');
      expect(run('~/.local/bin/claude').stdout).toBe('claude-demarre\n');
    });
    it('keeps a tool of node reached through its link: its package finds its other files', () => {
      expect(run('PATH=~/.nvm/versions/node/v1/bin:$PATH outil').stdout).toBe('outil-voisin\n');
    });
    it('shows neither codegraph nor rtfm of the home: no launcher, no state, no environment', () => {
      for (const rel of [
        '.local/bin/codegraph',
        '.local/bin/rtfm',
        '.codegraph',
        '.rtfm',
        '.local/share/pipx',
      ]) {
        expect(run(`test -e ~/${rel} || test -L ~/${rel}`).status, rel).not.toBe(0);
      }
      expect(run('~/.local/bin/codegraph; ~/.local/bin/rtfm; true').stdout).toBe('');
    });
    // grillhouse-3uv.95.3: the whole repository is in sight, its indexes included: the main
    // tree's, the copy's and another copy's; what lies out of the copy stays read-only.
    it("shows every index of the repository: the main tree's, the copy's or another copy's", () => {
      for (const dans of [copie, copieRtfm]) {
        for (const f of INDEX) {
          expect(run(`cat ${f}`, home, dans).stdout, `${dans}: ${f}`).toBe(
            'INDEX-of-the-repository code-of-b'
          );
        }
      }
    });
    it('leaves whole on disk every index out of the copy', () => {
      run(`rm -rf ${INDEX.map(f => path.dirname(f)).join(' ')} 2>/dev/null; true`);
      for (const f of INDEX.filter(f => !f.startsWith(`${copie}/`))) {
        expect(readFileSync(f, 'utf8'), f).toBe('INDEX-of-the-repository code-of-b');
      }
    });
    // The envelope's contract: « Only these are written: the agent's copy ». A copy that holds an
    // index keeps its root written: a file is created, replaced and deleted there, a directory made.
    it('lets a copy that holds an index create, replace and delete a file of its root', () => {
      for (const dans of [copie, copieRtfm]) {
        const ecrit = run(
          'echo neuf > neuf.txt && printf remplace > t && mv t LISEZMOI && mkdir dossier-neuf' +
            ' && echo a > efface.txt && rm efface.txt && mv neuf.txt renomme.txt',
          home,
          dans
        );
        expect(ecrit.status, `${dans}: ${ecrit.stderr}`).toBe(0);
        expect(readFileSync(path.join(dans, 'renomme.txt'), 'utf8'), dans).toBe('neuf\n');
        expect(readFileSync(path.join(dans, 'LISEZMOI'), 'utf8'), dans).toBe('remplace');
        expect(existsSync(path.join(dans, 'dossier-neuf')), dans).toBe(true);
        expect(existsSync(path.join(dans, 'efface.txt')), dans).toBe(false);
        expect(existsSync(path.join(dans, 'neuf.txt')), dans).toBe(false);
        const efface = run('rm LISEZMOI renomme.txt && rmdir dossier-neuf', home, dans);
        expect(efface.status, `${dans}: ${efface.stderr}`).toBe(0);
        expect(existsSync(path.join(dans, 'LISEZMOI')), dans).toBe(false);
        expect(existsSync(path.join(dans, 'renomme.txt')), dans).toBe(false);
        writeFileSync(path.join(dans, 'LISEZMOI'), 'racine');
      }
    });
    // Needs the real bd: it opens the base with its own state (grillhouse-3uv.50.1).
    it.runIf(hasBd)(
      'lets bd read and write the tickets base of the main tree with its own state',
      () => {
        const cree = run('bd create "sonde de l\'enveloppe" --json');
        expect(cree.status, cree.stderr).toBe(0);
        const { id } = JSON.parse(cree.stdout) as { id: string };
        const lu = run(`bd show ${id} --json`);
        expect(lu.status, lu.stderr).toBe(0);
        expect(lu.stdout).toContain("sonde de l'enveloppe");
      }
    );
    it('keeps node and its tools, and the git configuration', () => {
      expect(run('cat ~/.nvm/versions/node/v1/bin/marque').stdout).toBe('nvm');
      expect(run('git config --global user.name').stdout.trim()).toBe('t');
    });
    // The rule of the links (enveloppe.mjs, `avecLiens`), as Flatpak exposes a link: a declared
    // path that is a link brings back its target, link by link, with the link's rights, and
    // nothing beside it.
    it('brings back the target of a declared configuration linked into an undeclared directory', () => {
      expect(run('git config --global user.name').stdout.trim()).toBe('t');
      expect(run('cat ~/.gitconfig').stdout).toBe('[user]\n\tname = t\n');
      expect(run('cat ~/.config/git/ignore').stdout).toBe('*.sonde\n');
      expect(run('cat ~/.config/git/attributes').stdout).toBe('*.sonde diff\n');
      expect(run('git check-ignore -q x.sonde').status).toBe(0);
    });
    it('shows nothing beside the target of a declared link, and keeps the link read-only', () => {
      for (const rel of ['dotfiles/autre', 'dotfiles/git/autre', 'stow/autre']) {
        expect(run(`test -e ~/${rel}`).status, rel).not.toBe(0);
      }
      expect(run('ls -A ~/dotfiles').stdout.split('\n').filter(Boolean).sort()).toEqual([
        'git',
        'gitconfig',
        'lien-attributes',
      ]);
      expect(run('echo x >> ~/.gitconfig').status).not.toBe(0);
      expect(run('echo x >> ~/.config/git/attributes').status).not.toBe(0);
      expect(readFileSync(path.join(home, 'dotfiles/gitconfig'), 'utf8')).toBe(
        '[user]\n\tname = t\n'
      );
      expect(readFileSync(path.join(home, 'stow/attributes'), 'utf8')).toBe('*.sonde diff\n');
    });
    it('lets the session write the npm cache', () => {
      expect(run('touch ~/.npm/ecrit').status).toBe(0);
      expect(existsSync(path.join(home, '.npm/ecrit'))).toBe(true);
    });
    it('keeps the repository of the home: the copy written, the main tree and its .git read', () => {
      expect(run('git status --short').status).toBe(0);
      expect(run(`cat ${repo}/LISEZMOI`).stdout).toBe('racine');
      expect(run('touch packages/a/src/nouveau.ts').status).toBe(0);
      expect(run(`touch ${repo}/x`).status).not.toBe(0);
      expect(run(`touch ${repo}/.git/x`).status).not.toBe(0);
      expect(run('cat packages/b/src/b.ts').stdout).toBe('code-of-b');
    });
    it('lets the session write the tickets base of the main tree in the home', () => {
      expect(run(`touch ${repo}/.beads/ecrit`).status).toBe(0);
      expect(existsSync(path.join(repo, '.beads/ecrit'))).toBe(true);
    });
    it('writes nothing to the home outside its declared paths', () => {
      run(
        'mkdir -p ~/.ssh; echo x > ~/.ssh/authorized_keys; echo x > ~/.npmrc; touch ~/neuf; true'
      );
      expect(existsSync(path.join(home, '.ssh/authorized_keys'))).toBe(false);
      expect(readFileSync(path.join(home, '.npmrc'), 'utf8')).toBe('SECRET-npm-token');
      expect(existsSync(path.join(home, 'neuf'))).toBe(false);
    });
    it('still launches in a home that holds none of the declared paths but ~/.claude', () => {
      const nu = essai('home-nu-');
      mkdirSync(path.join(nu, '.claude'));
      const r = run('echo ok', nu);
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('ok\n');
    });
    it('shows the session directory empty: no ssh agent, no bus, no gpg-agent', () => {
      expect(run('ls -A "$XDG_RUNTIME_DIR" 2>/dev/null; true').stdout).toBe('');
      expect(run('test -S "$SSH_AUTH_SOCK"').status).not.toBe(0);
      expect(run(`test -S ${bus}`).status).not.toBe(0);
      expect(run(`cat ${session}/SECRET-session-file`).stdout).not.toContain('SECRET');
    });
  }
);
