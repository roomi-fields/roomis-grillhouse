import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { RACINE, enProcessus } from './cadre.js';

const mettreAJour = enProcessus<Record<string, unknown>>(
  'scripts/grillhouse-maj.mjs',
  'mettreAJour'
);

// The frame's pre-push hook refuses a push of a project that still carries the retired key
// `grillhouse.poussee`, by its name, and keeps its one refusal of a tree no pass judged; the night
// pushes nothing (it notes its last green). The update of the frame (scripts/grillhouse-maj.mjs)
// places the hook in a project, its Beads section kept.
//
// Each project below is a git repository whose hooks live in `.beads/hooks` (core.hooksPath), with
// the pre-push Beads writes, brought to the frame of this repository by the update. Its remote,
// `origin`, is a local bare repository. A fake Beads records its calls and the standard input of
// each, and exits with the code written in BD_CODE (0 without it).

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'pre-push-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = RACINE;
// The tree <arbre> kept as judged in the repository <racine>, in a process of its own.
const garderLArbreJuge = enProcessus<void>('scripts/arbres-juges.mjs', 'garderLArbreJuge');
const NUIT = path.join(DEPOT, 'packages/grillhouse/scripts/nuit.sh');

// The Beads section of the pre-push hook, markers included, as Beads 1.2.2 writes it.
const SECTION_BEADS = (() => {
  const texte = readFileSync(path.join(DEPOT, '.beads/hooks/pre-push'), 'utf8');
  const m =
    /# --- BEGIN BEADS INTEGRATION v1\.2\.2 ---\n[\s\S]*?# --- END BEADS INTEGRATION v1\.2\.2 ---\n/.exec(
      texte
    );
  if (!m) {
    throw new Error('the Beads section of .beads/hooks/pre-push is missing');
  }
  return m[0];
})();
const PRE_PUSH_BEADS = `#!/usr/bin/env sh\n${SECTION_BEADS}`;

// The environment of a command a human runs: without the night's mark.
const sansNuit = (bin: string) => {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.GRILLHOUSE_NUIT;
  return env;
};

// `hooksPath`: the project sets core.hooksPath to .beads/hooks; `prePush`: its pre-push exists,
// with the Beads section, before the update.
function projet(grillhouse: unknown, { hooksPath = true, prePush = true } = {}) {
  const branches = ['main', 'travail', 'deploiement/nuit'];
  const repo = mkdtempSync(path.join(ESSAIS, 'projet-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const appels = path.join(bin, 'appels');
  const entrees = path.join(bin, 'entrees');
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\necho "$@" >> ${appels}\ncase "$1" in\n  hooks) cat >> ${entrees}; exit "$(cat ${bin}/BD_CODE 2>/dev/null || echo 0)";;\n  list) echo '[]';;\n  create) echo demo-12;;\nesac\nexit 0\n`,
    { mode: 0o755 }
  );
  const env = sansNuit(bin);
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
      env,
    });
  git('init', '-q', '-b', 'main');
  if (hooksPath) {
    git('config', 'core.hooksPath', '.beads/hooks');
    mkdirSync(path.join(repo, '.beads/hooks'), { recursive: true });
    if (prePush) {
      writeFileSync(path.join(repo, '.beads/hooks/pre-push'), PRE_PUSH_BEADS, { mode: 0o755 });
    }
  } else if (prePush) {
    writeFileSync(path.join(repo, '.git/hooks/pre-push'), PRE_PUSH_BEADS, { mode: 0o755 });
  }
  // The night runs from the project's own scripts, as in a project the frame installed, its
  // package.json beside them as the package carries it (scripts/attente-de-la-machine.mjs reads its name).
  cpSync(path.dirname(NUIT), path.join(repo, 'packages/grillhouse/scripts'), { recursive: true });
  cpSync(
    path.join(path.dirname(NUIT), '../package.json'),
    path.join(repo, 'packages/grillhouse/package.json')
  );
  // The frame's package installed, as npm links it: the hook calls its `grillhouse hook pre-push`.
  mkdirSync(path.join(repo, 'node_modules/@roomi-fields'), { recursive: true });
  mkdirSync(path.join(repo, 'node_modules/.bin'), { recursive: true });
  symlinkSync(
    path.join(DEPOT, 'packages/grillhouse'),
    path.join(repo, 'node_modules/@roomi-fields/grillhouse')
  );
  symlinkSync(
    '../@roomi-fields/grillhouse/bin/grillhouse.mjs',
    path.join(repo, 'node_modules/.bin/grillhouse')
  );
  const configAvant = git('config', '--local', '--list');
  mettreAJour(repo, DEPOT);
  const configApres = git('config', '--local', '--list');
  const pkg: Record<string, unknown> = {
    name: 'p',
    scripts: { test: 'node t.mjs', verifier: 'node t.mjs' },
  };
  if (grillhouse !== undefined) {
    pkg.grillhouse = grillhouse;
    // A project of TypeScript declares its language in its architecture.
    declarerLesLangages(repo);
  }
  writeFileSync(path.join(repo, 'package.json'), JSON.stringify(pkg, null, 2));
  writeFileSync(path.join(repo, 't.mjs'), "console.log('tout vert');\n");
  writeFileSync(path.join(repo, '.gitignore'), '.claude/worktrees/\nnode_modules/\n');
  mkdirSync(path.join(repo, '.beads'), { recursive: true });
  writeFileSync(path.join(repo, '.beads/config.yaml'), 'issue-prefix: "demo"\n');
  git('add', '-A');
  git('commit', '-q', '--no-verify', '-m', 'base');
  const bare = mkdtempSync(path.join(ESSAIS, 'distant-'));
  execFileSync('git', ['init', '-q', '--bare', bare]);
  git('remote', 'add', 'origin', bare);
  const base = git('rev-parse', 'HEAD').trim();
  for (const b of branches) {
    git('push', '-q', '--no-verify', 'origin', `HEAD:refs/heads/${b}`);
  }
  writeFileSync(path.join(repo, 'suite'), '');
  git('add', 'suite');
  git('commit', '-q', '--no-verify', '-m', 'suite');
  const tete = git('rev-parse', 'HEAD').trim();
  // The tree of the head is judged, as a final pass or the verification of a lot keeps it
  // (scripts/arbres-juges.mjs): the hook lets a commit go to main on a judged tree alone.
  garderLArbreJuge(repo, git('rev-parse', 'HEAD^{tree}').trim());
  const ref = (b: string) =>
    spawnSync('git', ['--git-dir', bare, 'rev-parse', '--verify', '-q', `refs/heads/${b}`], {
      encoding: 'utf8',
    }).stdout.trim();
  // A push as a human runs it, hooks included.
  const pousserVers = (distant: string, ...refspecs: string[]) =>
    spawnSync('git', ['-C', repo, 'push', distant, ...refspecs], { encoding: 'utf8', env });
  const pousser = (...refspecs: string[]) => pousserVers('origin', ...refspecs);
  const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const nuit = () =>
    spawnSync('bash', [path.join(repo, 'packages/grillhouse/scripts/nuit.sh')], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });
  const journal = () => {
    const dossier = path.join(repo, '.git', 'nuit');
    const f = existsSync(dossier) ? readdirSync(dossier).find(x => x.endsWith('.log')) : undefined;
    return f ? lire(path.join(dossier, f)) : '';
  };
  const dernierVert = () => lire(path.join(repo, '.git', 'nuit', 'dernier-vert')).trim();
  return {
    repo,
    bin,
    git,
    configAvant,
    configApres,
    pousserVers,
    bare,
    base,
    tete,
    ref,
    pousser,
    nuit,
    journal,
    dernierVert,
    appels: () => lire(appels),
    entrees: () => lire(entrees),
  };
}

// The refusal line of the retired key: it cites the key and the gesture (remove it).
const ligneDeRefus = (sortie: string) =>
  sortie.split('\n').some(l => l.includes('grillhouse.poussee') && /retire/i.test(l));

const CLES_RETIREES: unknown[] = [
  { poussee: { nuit: 'main' } },
  { poussee: { commit: 'travail', nuit: 'deploiement/nuit' } },
  { poussee: { commit: 'main' } },
  { poussee: null },
  { poussee: 'main' },
  { poussee: { nuit: '' } },
];

describe('a project that carries grillhouse.poussee is refused by its name at the push', () => {
  it('refuses a push to main and to another branch, whatever the value, the refs unchanged', () => {
    for (const cle of CLES_RETIREES) {
      const p = projet(cle);
      for (const cible of ['HEAD:main', 'HEAD:travail', 'HEAD:refs/heads/deploiement/nuit']) {
        const r = p.pousser(cible);
        expect(r.status, `${JSON.stringify(cle)} ${cible}\n${r.stderr}`).not.toBe(0);
        expect(ligneDeRefus(r.stderr), r.stderr).toBe(true);
      }
      expect(p.ref('main')).toBe(p.base);
      expect(p.ref('travail')).toBe(p.base);
    }
  });

  it('says no longer that only the night pushes', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const r = p.pousser('HEAD:main');
    expect(r.stderr).not.toMatch(/seule la nuit/i);
  });

  it('reads the key as written in the working tree: removed there, the push passes', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    writeFileSync(
      path.join(p.repo, 'package.json'),
      JSON.stringify({ name: 'p', scripts: { test: 'node t.mjs' }, grillhouse: {} }, null, 2)
    );
    const r = p.pousser('HEAD:main');
    expect(r.status, r.stderr).toBe(0);
    expect(p.ref('main')).toBe(p.tete);
  });

  it('watches origin only', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const fourche = mkdtempSync(path.join(ESSAIS, 'fourche-'));
    execFileSync('git', ['init', '-q', '--bare', fourche]);
    p.git('remote', 'add', 'fourche', fourche);
    p.git('push', '-q', '--no-verify', 'fourche', `${p.base}:refs/heads/main`);
    const r = p.pousserVers('fourche', 'HEAD:main');
    expect(r.status, r.stderr).toBe(0);
    expect(p.git('--git-dir', fourche, 'rev-parse', 'refs/heads/main').trim()).toBe(p.tete);
  });
});

describe('a project without the key pushes a judged tree to main, any branch passes', () => {
  const sansCle: [string, unknown][] = [
    ['without a grillhouse section', undefined],
    ['with another key', { integration: 'impactes' }],
  ];
  for (const [cas, cle] of sansCle) {
    it(`${cas}, git push origin HEAD:main passes`, () => {
      const p = projet(cle);
      const r = p.pousser('HEAD:main');
      expect(r.status, r.stderr).toBe(0);
      expect(p.ref('main')).toBe(p.tete);
    });
  }
  it('a push to another branch passes, main unchanged', () => {
    const p = projet({ integration: 'impactes' });
    const r = p.pousser('HEAD:travail');
    expect(r.status, r.stderr).toBe(0);
    expect(p.ref('travail')).toBe(p.tete);
    expect(p.ref('main')).toBe(p.base);
  });
});

describe('the hook keeps what it does for Beads', () => {
  it('an allowed push calls bd hooks run pre-push with the remote and the pushed refs', () => {
    const p = projet({ integration: 'impactes' });
    const r = p.pousser('HEAD:travail');
    expect(r.status, r.stderr).toBe(0);
    expect(p.appels()).toMatch(new RegExp(`^hooks run pre-push origin ${p.bare}$`, 'm'));
    expect(p.entrees()).toBe(`HEAD ${p.tete} refs/heads/travail ${p.base}\n`);
  });
  it('a push Beads refuses stays refused', () => {
    const p = projet(undefined);
    writeFileSync(path.join(p.bin, 'BD_CODE'), '1');
    const r = p.pousser('HEAD:travail');
    expect(r.status, r.stderr).not.toBe(0);
    expect(p.ref('travail')).toBe(p.base);
  });
});

// The repository's configuration without the merge driver of the CHANGELOG, which the update
// writes with the hooks (scripts/fusion-du-changelog.mjs): the rest stays.
const sansLePilote = (config: string) =>
  config
    .split('\n')
    .filter(l => !l.startsWith('merge.grillhouse-changelog.'))
    .join('\n');

describe('the update of the frame places the hook where git reads it', () => {
  it('keeps the Beads section once, executable, and carries the guard of the retired key', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const crochet = path.join(p.repo, '.beads/hooks/pre-push');
    const texte = readFileSync(crochet, 'utf8');
    expect(texte.split(SECTION_BEADS).length - 1).toBe(1);
    expect(texte.startsWith('#!')).toBe(true);
    expect(statSync(crochet).mode & 0o111).toBe(0o111);
    const r = p.pousser('HEAD:main');
    expect(r.status, r.stderr).not.toBe(0);
    expect(ligneDeRefus(r.stderr), r.stderr).toBe(true);
  });

  it('without core.hooksPath, or without pre-push, creates the effective hook, config unchanged', () => {
    const cas = [
      { opts: { hooksPath: false, prePush: false }, crochet: '.git/hooks/pre-push' },
      { opts: { hooksPath: true, prePush: false }, crochet: '.beads/hooks/pre-push' },
    ];
    for (const { opts, crochet } of cas) {
      const p = projet({ poussee: { nuit: 'main' } }, opts);
      expect(sansLePilote(p.configApres)).toBe(p.configAvant);
      const f = path.join(p.repo, crochet);
      expect(existsSync(f), crochet).toBe(true);
      expect(readFileSync(f, 'utf8').startsWith('#!')).toBe(true);
      expect(statSync(f).mode & 0o111).toBe(0o111);
      const r = p.pousser('HEAD:main');
      expect(r.status, r.stderr).not.toBe(0);
      expect(p.ref('main')).toBe(p.base);
      expect(ligneDeRefus(r.stderr), r.stderr).toBe(true);
    }
  });

  it('a replayed update changes nothing, its guard present once', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const crochet = path.join(p.repo, '.beads/hooks/pre-push');
    const premier = readFileSync(crochet, 'utf8');
    mettreAJour(p.repo, DEPOT);
    mettreAJour(p.repo, DEPOT);
    const texte = readFileSync(crochet, 'utf8');
    expect(texte).toBe(premier);
    const hors = texte
      .split(SECTION_BEADS)
      .join('')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l !== '' && !l.startsWith('#'));
    expect(new Set(hors).size, hors.join('\n')).toBe(hors.length);
  });
});

describe('the night pushes nothing and notes its last green', () => {
  it('a green night leaves every remote branch where it was and writes the last green', () => {
    const p = projet({ integration: 'impactes' });
    const r = p.nuit();
    expect(r.status, p.journal()).toBe(0);
    expect(p.dernierVert()).toBe(p.tete);
    for (const b of ['main', 'travail', 'deploiement/nuit']) {
      expect(p.ref(b), b).toBe(p.base);
    }
    expect(p.journal()).not.toMatch(/poussée/);
    expect(p.appels()).not.toMatch(/^hooks run pre-push/m);
  });

  it('a night of a project that carries grillhouse.poussee is red before any work, citing the key', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const r = p.nuit();
    expect(r.status).toBe(1);
    expect(p.journal()).toMatch(/grillhouse\.poussee/);
    expect(p.dernierVert()).toBe('');
    expect(p.ref('main')).toBe(p.base);
  });
});
