import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { git, LONG, POSE, sousModulesEssai } from './sous-modules-essai.js';
import { valeursDe } from './cadre.js';

const { CODE_COPIE } = valeursDe('scripts/enveloppe/codes.mjs', ['CODE_COPIE']) as {
  CODE_COPIE: number;
};

// grillhouse-3uv.69: the address a copy sets each submodule from, the main repository's
// submodule.<name>.url, the url of .gitmodules, relative urls and remotes. The preparation of the
// copies: sous-modules.nuit.spec.ts.
// The worlds of trial and the frame's scripts they run: ./sous-modules-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'sous-modules-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { ENV_SCRIPTS, gitScripts, monde, mondePartage } = sousModulesEssai(ESSAIS);

// grillhouse-3uv.69: the address a copy sets a submodule from. git's model (git-submodule(1),
// « init »): the url of .gitmodules is copied into the repository's configuration only when
// `submodule.<name>.url` is missing there; the local configuration always wins. A copy made by
// `git worktree add` shares the configuration of the main repository: the pose sets each submodule
// from the address the main repository uses today — its `submodule.<name>.url`, else the url of
// .gitmodules — even in a reused copy whose submodule was first cloned from another address, and
// it never writes the main repository's configuration.
//
// The world: A, the submodule's repository of `monde` (v1, v2), named by .gitmodules; B, a clone
// of A. Each then gets a commit the other lacks: `a3` in A, `b3` in B (natif.txt holds its name).
// `referencer` makes the main repository reference one of them at vendor/natif; a copy can set it
// only from the repository that holds it.
type Depot = 'A' | 'B';
function adresses<M extends ReturnType<typeof monde>>(m: M) {
  const principalNatif = path.join(m.repo, 'vendor/natif');
  const A = git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url').trim();
  const B = mkdtempSync(path.join(ESSAIS, 'natif-b-'));
  git(ESSAIS, 'clone', '-q', A, B);
  const exclusifs = {} as Record<Depot, string>;
  for (const [nom, depot] of [
    ['B', B],
    ['A', A],
  ] as const) {
    writeFileSync(path.join(depot, 'natif.txt'), `${nom.toLowerCase()}3\n`);
    git(depot, 'commit', '-qam', `${nom.toLowerCase()}3`);
    exclusifs[nom] = git(depot, 'rev-parse', 'HEAD').trim();
  }
  const depots: Record<Depot, string> = { A, B };
  const configPrincipale = path.join(m.repo, '.git/config');
  // The main repository's local address of vendor/natif: set (a path or a file:// URL) or removed.
  // Removing an address already absent is no fault: `git config --unset` exits 5 for a missing key.
  const adresseLocale = (url: string | null) => {
    if (url === null) {
      const r = spawnSync(
        'git',
        ['-C', m.repo, 'config', '--unset', 'submodule.vendor/natif.url'],
        {
          encoding: 'utf8',
        }
      );
      if (r.status !== 0 && r.status !== 5) {
        throw new Error(`git config --unset: ${r.status} ${r.stderr}`);
      }
    } else {
      git(m.repo, 'config', 'submodule.vendor/natif.url', url);
    }
  };
  // The main repository references the commit only `depot` holds, in a commit of its own.
  const referencer = (depot: Depot) => {
    git(principalNatif, 'fetch', '-q', depots[depot], exclusifs[depot]);
    git(principalNatif, 'checkout', '-q', exclusifs[depot]);
    git(m.repo, 'add', 'vendor/natif');
    git(m.repo, 'commit', '-qm', `natif ${depot.toLowerCase()}3`);
  };
  // .gitmodules names another address, in a commit (`git submodule set-url` writes the
  // configuration too: the file alone is rewritten here).
  const gitmodulesVers = (url: string) => {
    git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url', url);
    git(m.repo, 'add', '.gitmodules');
    git(m.repo, 'commit', '-qm', 'gitmodules');
  };
  const lireConfig = () => readFileSync(configPrincipale, 'utf8');
  const sousModulesConfig = () =>
    gitScripts(m.repo, 'config', '--local', '--get-regexp', '^submodule\\.').stdout;
  return {
    ...m,
    A,
    B,
    depots,
    principalNatif,
    adresseLocale,
    referencer,
    gitmodulesVers,
    lireConfig,
    sousModulesConfig,
  };
}
// A repository that does not exist: a name under the mkdtemp root that no test creates.
const ABSENT = path.join(ESSAIS, 'depot-absent');

describe('grillhouse-3uv.69 critères 1 et 4 — a fresh copy sets the submodule from the main repository’s submodule.<name>.url', () => {
  it(
    'critère 4: .gitmodules names A, which lacks the commit; the local configuration names B, which holds it: the pose succeeds',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.adresseLocale(m.B);
      m.referencer('B');
      const copie = m.copieFraiche('fraiche');
      const config = m.lireConfig();
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('b3');
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 1: .gitmodules names a repository that does not exist; the local configuration names A: the pose succeeds',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.gitmodulesVers(ABSENT);
      m.referencer('A');
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('a3');
    },
    LONG
  );
});

describe('grillhouse-3uv.69 critère 2 — without a local address, the url of .gitmodules serves', () => {
  it(
    'critère 2: no submodule.<name>.url in the main repository: a fresh copy sets the submodule from .gitmodules',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.referencer('A');
      m.adresseLocale(null);
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('a3');
    },
    LONG
  );
});

describe('grillhouse-3uv.69 critère 3 — a local address in the configuration stays accepted', () => {
  for (const forme of ['chemin', 'file'] as const) {
    it(
      `critère 3: a local address given as ${forme === 'chemin' ? 'a path' : 'a file:// URL'} in the configuration sets the submodule in a fresh copy`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        m.adresseLocale(forme === 'chemin' ? m.B : `file://${m.B}`);
        m.referencer('B');
        const copie = m.copieFraiche('fraiche');
        const r = m.poser(copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('b3');
      },
      LONG
    );
  }
});

describe('grillhouse-3uv.69 critère 5 — the header of the preparation says where the address comes from', () => {
  it('critère 5: the header names submodule.<name>.url of the main repository’s configuration, and .gitmodules without it', () => {
    // The header: the comment lines after the shebang; its items start with « # - ».
    const lignes = readFileSync(POSE, 'utf8').split('\n').slice(1);
    const entete = lignes
      .slice(
        0,
        lignes.findIndex(l => !l.startsWith('#'))
      )
      .join('\n');
    const items = entete.split(/\n# - /);
    const item = items.find(i => /submodule\.<[^>]+>\.url/.test(i)) ?? '';
    expect(item, entete).toMatch(/submodule\.<[^>]+>\.url/);
    expect(item).toMatch(/main repository/);
    expect(item).toMatch(/\.gitmodules/);
  });
});

describe('grillhouse-3uv.69 critère 6 — a reused copy sets the submodule from the address the main repository uses today', () => {
  // A copy that does not get ready is removed and created again by the integration and the night
  // (scripts/integration/rejeu.mjs, scripts/nuit.sh): a mark in its node_modules, which their
  // cleaning keeps, says the reused copy itself was set.
  const marquer = (copie: string) => {
    const f = path.join(copie, 'node_modules/.copie-reutilisee');
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, '');
    return f;
  };
  // The three callers, each on a copy it created then reuses: the local address moves from A to
  // B, and main references b3, which only B holds.
  it(
    'critère 6: the reused integration copy, after the local address moves from A to B',
    () => {
      const m = adresses(monde());
      expect(m.integrer().status).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('v1');
      const marque = marquer(m.copies.integration);
      m.adresseLocale(m.B);
      m.referencer('B');
      const avant = m.sousModulesConfig();
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.natifDe(m.copies.integration)).toBe('b3');
      expect(m.vus().at(-1)).toBe('b3');
      expect(m.sousModulesConfig()).toBe(avant);
      expect(existsSync(marque), 'the integration copy was removed and created again').toBe(true);
    },
    LONG
  );
  it(
    'critère 6: the reused agent copy, after the local address moves from A to B',
    () => {
      const m = adresses(monde());
      m.lancer();
      expect(m.natifDe(m.copies.agent)).toBe('v1');
      m.adresseLocale(m.B);
      m.referencer('B');
      const avant = m.sousModulesConfig();
      const r = m.lancer();
      expect(r.status, r.stderr).not.toBe(CODE_COPIE);
      expect(m.natifDe(m.copies.agent)).toBe('b3');
      expect(m.vus().at(-1)).toBe('b3');
      expect(m.sousModulesConfig()).toBe(avant);
    },
    LONG
  );
  it(
    'critère 6: the reused night copy, after the local address moves from A to B',
    () => {
      const m = adresses(monde());
      expect(m.nuit().status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('v1');
      const marque = marquer(m.copies.nuit);
      m.adresseLocale(m.B);
      m.referencer('B');
      const avant = m.sousModulesConfig();
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.natifDe(m.copies.nuit)).toBe('b3');
      expect(m.vus().at(-1)).toBe('b3');
      expect(m.sousModulesConfig()).toBe(avant);
      expect(existsSync(marque), 'the night copy was removed and created again').toBe(true);
    },
    LONG
  );

  // The preparation alone, on a copy first set from one address, then moved forward as its
  // caller moves it.
  const avancees = ['avancerCommeLIntegration', 'avancerCommeLAgent'] as const;
  for (const avancer of avancees) {
    const qui = avancer === 'avancerCommeLAgent' ? 'agent' : 'integration';
    it(
      `critère 6 (${qui}): the local address moves back from B to A, and main references a3, which only A holds`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        m.adresseLocale(m.B);
        const copie = m.copieFraiche('reutilisee');
        expect(m.poser(copie).status).toBe(0);
        m.adresseLocale(m.A);
        m.referencer('A');
        const config = m.lireConfig();
        const r = m[avancer](copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('a3');
        expect(m.lireConfig()).toBe(config);
      },
      LONG
    );
    it(
      `critère 6 (${qui}): the local address moves to a file:// URL of B, and main references b3`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        const copie = m.copieFraiche('reutilisee');
        expect(m.poser(copie).status).toBe(0);
        m.adresseLocale(`file://${m.B}`);
        m.referencer('B');
        const config = m.lireConfig();
        const r = m[avancer](copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('b3');
        expect(m.lireConfig()).toBe(config);
      },
      LONG
    );
    it(
      `critère 6 (${qui}): the local address B is removed, .gitmodules names A, and main references a3: the pose takes A and writes no address`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        m.adresseLocale(m.B);
        const copie = m.copieFraiche('reutilisee');
        expect(m.poser(copie).status).toBe(0);
        m.referencer('A');
        m.adresseLocale(null);
        const config = m.lireConfig();
        const r = m[avancer](copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('a3');
        expect(m.lireConfig()).toBe(config);
      },
      LONG
    );
    it(
      `critère 6 (${qui}): without a local address, .gitmodules moves from A to B, and main references b3`,
      () => {
        const m = adresses(mondePartage({ partage: null }));
        m.adresseLocale(null);
        const copie = m.copieFraiche('reutilisee');
        expect(m.poser(copie).status).toBe(0);
        m.adresseLocale(null);
        m.gitmodulesVers(m.B);
        m.referencer('B');
        const config = m.lireConfig();
        const r = m[avancer](copie);
        expect(r.status, r.stderr).toBe(0);
        expect(m.natifDe(copie)).toBe('b3');
        expect(m.lireConfig()).toBe(config);
      },
      LONG
    );
  }

  it(
    'critère 6: the local address stays B while .gitmodules moves to a repository that does not exist: the reused copy still sets b3 from B',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.adresseLocale(m.B);
      const copie = m.copieFraiche('reutilisee');
      expect(m.poser(copie).status).toBe(0);
      m.gitmodulesVers(ABSENT);
      m.referencer('B');
      const config = m.lireConfig();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('b3');
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 6: without a local address, the pose of a fresh copy writes no address into the main repository’s configuration',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      m.adresseLocale(null);
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
});

describe('grillhouse-3uv.69 critère 6 — a url of .gitmodules relative to the superproject, without a local address', () => {
  // git resolves a relative url against the superproject (its origin remote, else its working
  // tree): the main repository resolves `../natif-…` next to its own folder. A copy lives under
  // .claude/worktrees/: the address it uses is the one the main repository uses, not the same url
  // resolved from the copy's folder.
  it(
    'critère 6: .gitmodules names ../<A>, the main repository has no submodule.<name>.url: a fresh copy sets v1 from the address the main repository uses, and writes no address',
    () => {
      const m = mondePartage({ partage: null, adresse: 'relative' });
      const url = git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url').trim();
      expect(url).toMatch(/^\.\.\//);
      // `git submodule add` wrote the resolved address into the configuration: removed.
      git(m.repo, 'config', '--unset', 'submodule.vendor/natif.url');
      const config = readFileSync(path.join(m.repo, '.git/config'), 'utf8');
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(readFileSync(path.join(m.repo, '.git/config'), 'utf8')).toBe(config);
    },
    LONG
  );
  it(
    'critère 6 (integration): the same, on a reused copy moved forward to v2',
    () => {
      const m = mondePartage({ partage: null, adresse: 'relative' });
      git(m.repo, 'config', '--unset', 'submodule.vendor/natif.url');
      const config = readFileSync(path.join(m.repo, '.git/config'), 'utf8');
      const copie = m.copieFraiche('reutilisee');
      const premiere = m.poser(copie);
      expect(premiere.status, premiere.stderr).toBe(0);
      m.avancerNatif();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v2');
      expect(readFileSync(path.join(m.repo, '.git/config'), 'utf8')).toBe(config);
    },
    LONG
  );
});

// grillhouse-3uv.69 critère 7: a relative url (`./`, `../`), of the configuration or of
// .gitmodules, is resolved by git's rule for the main repository — against the url of the remote
// its current branch follows, else origin, else its folder, with git's cut for a host:path
// address. The expected address is never written by hand: `ecrite` copies the main repository
// into a disposable folder, gives its .gitmodules the relative url, removes its local address and
// reads what `git submodule init` writes there.
//
// A non-local address (host:path, ssh) cannot be fetched here: an ssh of the test records the
// arguments git hands it, then fails. The address a pose uses is measured by that record, set
// against the record of `git ls-remote <expected address>`.
function mondeRelatif() {
  const m = mondePartage({ partage: null });
  const A = git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url').trim();
  gitScripts(m.repo, 'config', '--unset', 'submodule.vendor/natif.url');
  const branche = git(m.repo, 'symbolic-ref', '--short', 'HEAD').trim();
  // A remote url of the main repository, `<folder>/principal.git`; `natif` puts a bare clone of
  // A at `<folder>/<natif>` (`principal.git/natif.git` for a `./` url).
  const distant = (natif?: string) => {
    const dossier = mkdtempSync(path.join(ESSAIS, 'distant-'));
    if (natif) {
      git(ESSAIS, 'clone', '-q', '--bare', A, path.join(dossier, natif));
    }
    return path.join(dossier, 'principal.git');
  };
  const remote = (nom: string, url: string) => git(m.repo, 'remote', 'add', nom, url);
  const suivre = (nom: string) => git(m.repo, 'config', `branch.${branche}.remote`, nom);
  const gitmodulesVers = (url: string) => {
    git(m.repo, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url', url);
    git(m.repo, 'add', '.gitmodules');
    git(m.repo, 'commit', '-qm', 'gitmodules');
  };
  const adresseLocale = (url: string) => git(m.repo, 'config', 'submodule.vendor/natif.url', url);
  // `git submodule init` for the relative url `url`, in a disposable copy of the main repository.
  const init = (url: string) => {
    const temoin = path.join(mkdtempSync(path.join(ESSAIS, 'temoin-')), 'principal');
    cpSync(m.repo, temoin, {
      recursive: true,
      filter: src => !/\/\.claude\/worktrees(\/|$)|\/\.git\/worktrees(\/|$)/.test(src),
    });
    git(temoin, 'config', '-f', '.gitmodules', 'submodule.vendor/natif.url', url);
    gitScripts(temoin, 'config', '--unset', 'submodule.vendor/natif.url');
    const r = gitScripts(temoin, 'submodule', 'init', '-q', '--', 'vendor/natif');
    const ecrite = gitScripts(temoin, 'config', '--get', 'submodule.vendor/natif.url');
    return { status: r.status, stderr: r.stderr, url: ecrite.stdout.trim() };
  };
  // What `git submodule init` writes in the main repository for the relative url `url`.
  const ecrite = (url: string) => {
    const r = init(url);
    expect(r.status, r.stderr).toBe(0);
    return r.url;
  };
  const journalSsh = path.join(m.bin, 'ssh.log');
  const ssh = path.join(m.bin, 'ssh-essai');
  writeFileSync(
    ssh,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(journalSsh)}\nexit 128\n`,
    {
      mode: 0o755,
    }
  );
  const ENV_SSH = { ...ENV_SCRIPTS, GIT_SSH_COMMAND: ssh, GIT_SSH_VARIANT: 'simple' };
  const dernierSsh = () =>
    existsSync(journalSsh)
      ? (readFileSync(journalSsh, 'utf8').trim().split('\n').at(-1) ?? '')
      : '';
  const poserSsh = (copie: string) =>
    spawnSync('bash', [POSE, 'pose', copie], { encoding: 'utf8', env: ENV_SSH });
  // What the test ssh receives when git reaches `url`.
  const sshPour = (url: string) => {
    spawnSync('git', ['ls-remote', url], { encoding: 'utf8', env: ENV_SSH });
    return dernierSsh();
  };
  const remoteDe = (copie: string) =>
    git(path.join(copie, 'vendor/natif'), 'remote', 'get-url', 'origin').trim();
  const lireConfig = () => readFileSync(path.join(m.repo, '.git/config'), 'utf8');
  return {
    ...m,
    A,
    distant,
    remote,
    suivre,
    gitmodulesVers,
    adresseLocale,
    init,
    ecrite,
    dernierSsh,
    poserSsh,
    sshPour,
    remoteDe,
    lireConfig,
  };
}

describe('grillhouse-3uv.69 critère 7 — a relative url is resolved by git’s rule for the main repository', () => {
  it(
    'critère 7: an origin given as a path, .gitmodules names ../natif.git: the copy sets v1 from the address git submodule init writes',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant('natif.git'));
      m.gitmodulesVers('../natif.git');
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: an origin given as a path, the local configuration names ../natif.git and .gitmodules a repository that does not exist',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant('natif.git'));
      m.gitmodulesVers(ABSENT);
      m.adresseLocale('../natif.git');
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: a ./ url, against an origin given as a path',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant('principal.git/natif.git'));
      m.gitmodulesVers('./natif.git');
      const attendue = m.ecrite('./natif.git');
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
    },
    LONG
  );
  it(
    'critère 7: the current branch follows upstream, origin exists too: a fresh copy resolves against upstream',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant());
      m.remote('upstream', m.distant('natif.git'));
      m.suivre('upstream');
      m.gitmodulesVers('../natif.git');
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7 (integration): the current branch follows upstream, on a reused copy first set from A: its submodule moves to upstream’s address',
    () => {
      const m = mondeRelatif();
      const copie = m.copieFraiche('reutilisee');
      expect(m.poser(copie).status).toBe(0);
      m.remote('origin', m.distant('natif.git'));
      m.remote('upstream', m.distant('natif.git'));
      m.suivre('upstream');
      m.gitmodulesVers('../natif.git');
      m.avancerNatif();
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v2');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: an origin host:repo.git, .gitmodules names ../natif.git: the pose reaches the address git submodule init writes',
    () => {
      const m = mondeRelatif();
      m.remote('origin', 'hote.invalid:repo.git');
      m.gitmodulesVers('../natif.git');
      const attendue = m.ecrite('../natif.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poserSsh(copie);
      const vu = m.dernierSsh();
      expect(vu, r.stderr).not.toBe('');
      expect(vu, `${attendue}\n${r.stderr}`).toBe(m.sshPour(attendue));
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: an origin user@host:org/repo.git, .gitmodules names ../../x.git: the pose reaches the address git submodule init writes',
    () => {
      const m = mondeRelatif();
      m.remote('origin', 'git@hote.invalid:org/repo.git');
      m.gitmodulesVers('../../x.git');
      const attendue = m.ecrite('../../x.git');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poserSsh(copie);
      const vu = m.dernierSsh();
      expect(vu, r.stderr).not.toBe('');
      expect(vu, `${attendue}\n${r.stderr}`).toBe(m.sshPour(attendue));
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
});

describe('grillhouse-3uv.69 critère 1 — a submodule whose path holds a space is set from the main repository’s address', () => {
  it(
    'critère 1: vendor/mon natif, set first from A; the local address moves to B and main references b3: the reused copy sets b3 from B',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      const chemin = 'vendor/mon natif';
      const nom = chemin;
      // The submodule at a path with a space, from A, at v1; vendor/natif stays as the world has it.
      git(m.repo, 'submodule', 'add', '-q', m.A, chemin);
      git(path.join(m.repo, chemin), 'checkout', '-q', m.commits[0] ?? '');
      git(m.repo, 'add', '.');
      git(m.repo, 'commit', '-qm', 'mon natif');
      const copie = m.copieFraiche('reutilisee');
      const premiere = m.poser(copie);
      expect(premiere.status, premiere.stderr).toBe(0);
      expect(readFileSync(path.join(copie, chemin, 'natif.txt'), 'utf8').trim()).toBe('v1');
      git(m.repo, 'config', `submodule.${nom}.url`, m.B);
      const principal = path.join(m.repo, chemin);
      git(principal, 'fetch', '-q', m.B, 'HEAD');
      git(principal, 'checkout', '-q', 'FETCH_HEAD');
      git(m.repo, 'add', '.');
      git(m.repo, 'commit', '-qm', 'mon natif b3');
      const config = m.lireConfig();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(path.join(copie, chemin, 'natif.txt'), 'utf8').trim()).toBe('b3');
      expect(git(path.join(copie, chemin), 'remote', 'get-url', 'origin').trim()).toBe(m.B);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
});

describe('grillhouse-3uv.69 — moving the remote of a submodule set in the copy is a command of the pose: its failure stops it', () => {
  it(
    'its remote cannot be moved (the copy’s submodule has no origin remote): the pose stops, exit 1, naming the submodule',
    () => {
      const m = adresses(mondePartage({ partage: null }));
      const copie = m.copieFraiche('reutilisee');
      expect(m.poser(copie).status).toBe(0);
      m.adresseLocale(m.B);
      m.avancerNatif();
      // v2 is already in the copy's submodule: setting it fetches nothing, only origin moves.
      git(path.join(copie, 'vendor/natif'), 'remote', 'rename', 'origin', 'amont');
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(1);
      expect(r.stderr).toMatch(/vendor\/natif/);
    },
    LONG
  );
});

// grillhouse-3uv.69 critère 7 (second rendu du relecteur): a remote url that is a local path not
// absolute (`upstream.git`, `../up/…`) is, for git, relative to the main repository's folder, and
// need not exist; git writes the resolved url as is (`natif.git`, `../up/natif.git`), which a clone
// in the main repository reads from its folder. The copy uses that same repository: the url git
// writes, taken from the main repository's folder. Where git itself refuses the url, the pose
// refuses it too, before setting anything (critère 6: the pose never writes the main repository's
// configuration).
describe('grillhouse-3uv.69 critère 7 — a remote given as a relative local path is resolved from the main repository’s folder, as git does', () => {
  it(
    'critère 7: an origin upstream.git, .gitmodules names ../natif.git: the copy sets v1 from <main repository>/<what git writes>, and writes no address',
    () => {
      const m = mondeRelatif();
      m.remote('origin', 'upstream.git');
      m.gitmodulesVers('../natif.git');
      const attendue = m.ecrite('../natif.git');
      git(ESSAIS, 'clone', '-q', '--bare', m.A, path.resolve(m.repo, attendue));
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(path.resolve(m.repo, attendue));
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: an origin ../<folder>/absent/repo.git whose folder does not exist, .gitmodules names ../../natif.git: the copy sets v1 from <main repository>/<what git writes>',
    () => {
      const m = mondeRelatif();
      const dossier = mkdtempSync(path.join(ESSAIS, 'up-'));
      const base = path.relative(m.repo, path.join(dossier, 'absent', 'repo.git'));
      expect(base).toMatch(/^\.\.\//);
      expect(existsSync(path.join(dossier, 'absent'))).toBe(false);
      m.remote('origin', base);
      m.gitmodulesVers('../../natif.git');
      const attendue = m.ecrite('../../natif.git');
      git(ESSAIS, 'clone', '-q', '--bare', m.A, path.resolve(m.repo, attendue));
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(path.resolve(m.repo, attendue));
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critère 7: a url ending in « / » (../natif.git/), against an origin given as a path: the copy uses the url git writes, without the « / »',
    () => {
      const m = mondeRelatif();
      m.remote('origin', m.distant('natif.git'));
      m.gitmodulesVers('../natif.git/');
      const attendue = m.ecrite('../natif.git/');
      expect(attendue).not.toMatch(/\/$/);
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.natifDe(copie)).toBe('v1');
      expect(m.remoteDe(copie)).toBe(attendue);
      expect(m.lireConfig()).toBe(config);
    },
    LONG
  );
  it(
    'critères 6 et 7: the current branch follows upstream (upstream.git), .gitmodules names ../../natif.git, which git refuses for the main repository: the pose stops, exit 1, naming the submodule, and the main repository’s configuration is unchanged',
    () => {
      const m = mondeRelatif();
      // origin holds the repository the url reaches from it: a resolution against origin (the
      // remote of a detached copy) would succeed, and write its url.
      m.remote('origin', m.distant('natif.git'));
      m.remote('upstream', 'upstream.git');
      m.suivre('upstream');
      m.gitmodulesVers('../../natif.git');
      // git itself refuses this url for the main repository: it writes nothing.
      const parGit = m.init('../../natif.git');
      expect(parGit.status, parGit.stderr).not.toBe(0);
      expect(parGit.url).toBe('');
      const config = m.lireConfig();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(1);
      expect(r.stderr).toMatch(/vendor\/natif/);
      expect(m.lireConfig(), r.stderr).toBe(config);
      expect(existsSync(path.join(copie, 'vendor/natif/.git')), r.stderr).toBe(false);
    },
    LONG
  );
});
