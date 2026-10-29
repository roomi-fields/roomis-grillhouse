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
import { mettreAJour } from '../../scripts/grillhouse-maj.mjs';

// grillhouse-3uv.59: the frame's pre-push hook refuses every push to the branch named by
// `grillhouse.poussee.nuit` that does not come from the night; scripts/nuit.sh makes itself known
// to the hook by an environment variable it alone sets for its push. The update of the frame
// (scripts/grillhouse-maj.mjs) places the hook in a project, its Beads section kept.
//
// Each project below is a git repository whose hooks live in `.beads/hooks` (core.hooksPath), with
// the pre-push Beads writes, brought to the frame of this repository by the update. Its remote,
// `origin`, is a local bare repository. A fake Beads records its calls and the standard input of
// each, and exits with the code written in BD_CODE (0 without it).

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'pre-push-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
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
    `#!/bin/sh\necho "$@" >> ${appels}\ncase "$1 $2 $3" in\n  "config get issue_prefix") echo demo; exit 0;;\nesac\ncase "$1" in\n  hooks) cat >> ${entrees}; exit "$(cat ${bin}/BD_CODE 2>/dev/null || echo 0)";;\n  list) echo '[]';;\n  create) echo demo-12;;\nesac\nexit 0\n`,
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
  // The night runs from the project's own scripts, as in a project the frame installed.
  cpSync(path.dirname(NUIT), path.join(repo, 'packages/grillhouse/scripts'), { recursive: true });
  // The frame's package installed, as npm links it: the hook calls its `grillhouse hook pre-push`
  // (grillhouse-3uv.84.5).
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
    // grillhouse-3dr.2.3: a project of TypeScript declares its language.
    pkg.grillhouse = { langages: ['typescript'], ...(grillhouse as object) };
  }
  writeFileSync(path.join(repo, 'package.json'), JSON.stringify(pkg, null, 2));
  writeFileSync(path.join(repo, 't.mjs'), "console.log('tout vert');\n");
  writeFileSync(path.join(repo, '.gitignore'), '.claude/worktrees/\nnode_modules/\n');
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
    appels: () => lire(appels),
    entrees: () => lire(entrees),
  };
}

// The refusal line: it says that only the night pushes this branch, after its green.
const ligneDeRefus = (sortie: string) =>
  sortie.split('\n').some(l => /seule la nuit/i.test(l) && /vert/i.test(l));

describe('grillhouse-3uv.59 critère 1 — a push to the night branch is refused outside the night', () => {
  it('critère 1: with poussee.nuit = main, git push origin HEAD:main is refused, main unchanged', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const r = p.pousser('HEAD:main');
    expect(r.status, r.stderr).not.toBe(0);
    expect(p.ref('main')).toBe(p.base);
    expect(ligneDeRefus(r.stderr), r.stderr).toBe(true);
  });
  it('critère 1: another branch, with a slash, named by its full ref, is refused the same way', () => {
    const p = projet({
      integration: 'impactes',
      poussee: { commit: 'main', nuit: 'deploiement/nuit' },
    });
    const r = p.pousser('HEAD:refs/heads/deploiement/nuit');
    expect(r.status, r.stderr).not.toBe(0);
    expect(p.ref('deploiement/nuit')).toBe(p.base);
    expect(ligneDeRefus(r.stderr), r.stderr).toBe(true);
  });
  it('critère 1: pushing the local branch of the same name (git push origin main) is refused', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const r = p.pousser('main');
    expect(r.status, r.stderr).not.toBe(0);
    expect(p.ref('main')).toBe(p.base);
    expect(ligneDeRefus(r.stderr), r.stderr).toBe(true);
  });
});

describe('grillhouse-3uv.59 critère 2 — the push of scripts/nuit.sh passes', () => {
  it('critère 2: a green night pushes its commit onto poussee.nuit through the hook', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const r = p.nuit();
    expect(r.status, p.journal()).toBe(0);
    expect(p.ref('main')).toBe(p.tete);
    expect(p.journal()).toMatch(/✓ poussée/);
    expect(p.appels()).not.toMatch(/^create/m);
    // The hook ran on the night's push: its Beads section was called.
    expect(p.appels()).toMatch(/^hooks run pre-push origin /m);
  });
  it('critère 2: another night branch, with a slash, receives the night commit too', () => {
    const p = projet({ poussee: { commit: 'main', nuit: 'deploiement/nuit' } });
    expect(p.nuit().status, p.journal()).toBe(0);
    expect(p.ref('deploiement/nuit')).toBe(p.tete);
    expect(p.ref('main')).toBe(p.base);
  });
});

describe('grillhouse-3uv.59 critère 3 — without the key, or towards another branch, nothing changes', () => {
  const sansCle: [string, unknown][] = [
    ['without a grillhouse section', undefined],
    ['without poussee', { integration: 'impactes' }],
    ['with poussee but no nuit', { poussee: { commit: 'main' } }],
    ['with a null poussee.nuit', { poussee: { commit: 'main', nuit: null } }],
  ];
  for (const [cas, cle] of sansCle) {
    it(`critère 3: ${cas}, git push origin HEAD:main passes`, () => {
      const p = projet(cle);
      const r = p.pousser('HEAD:main');
      expect(r.status, r.stderr).toBe(0);
      expect(p.ref('main')).toBe(p.tete);
    });
  }
  it('critère 3: with poussee.nuit = main, a push to another branch passes', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const r = p.pousser('HEAD:travail');
    expect(r.status, r.stderr).toBe(0);
    expect(p.ref('travail')).toBe(p.tete);
    expect(p.ref('main')).toBe(p.base);
  });
  it('critère 3: with poussee.nuit = deploiement/nuit, a push to main passes', () => {
    const p = projet({ poussee: { nuit: 'deploiement/nuit' } });
    const r = p.pousser('HEAD:main');
    expect(r.status, r.stderr).toBe(0);
    expect(p.ref('main')).toBe(p.tete);
  });
});

describe('grillhouse-3uv.59 critère 4 — the hook keeps what it does for Beads', () => {
  it('critère 4: an allowed push calls bd hooks run pre-push with the remote and the pushed refs', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const r = p.pousser('HEAD:travail');
    expect(r.status, r.stderr).toBe(0);
    expect(p.appels()).toMatch(new RegExp(`^hooks run pre-push origin ${p.bare}$`, 'm'));
    expect(p.entrees()).toBe(`HEAD ${p.tete} refs/heads/travail ${p.base}\n`);
  });
  it('critère 4: a push Beads refuses stays refused, the key declared or not', () => {
    for (const cle of [{ poussee: { nuit: 'main' } }, undefined]) {
      const p = projet(cle);
      writeFileSync(path.join(p.bin, 'BD_CODE'), '1');
      const r = p.pousser('HEAD:travail');
      expect(r.status, r.stderr).not.toBe(0);
      expect(p.ref('travail')).toBe(p.base);
    }
  });
});

describe('grillhouse-3uv.59 critère 5 — the update of the frame places the hook', () => {
  it('critère 5: after the update, the effective pre-push keeps its Beads section and carries the guard', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const crochet = path.join(p.repo, '.beads/hooks/pre-push');
    const texte = readFileSync(crochet, 'utf8');
    expect(texte.split(SECTION_BEADS).length - 1).toBe(1);
    expect(texte.startsWith('#!')).toBe(true);
    expect(statSync(crochet).mode & 0o111).toBe(0o111);
    // It carries the guard: the push it now refuses is the one critère 1 names.
    const r = p.pousser('HEAD:main');
    expect(r.status, r.stderr).not.toBe(0);
    expect(ligneDeRefus(r.stderr), r.stderr).toBe(true);
  });
});

describe('grillhouse-3uv.59 critère 6 — several refs or a deletion towards the night branch', () => {
  it('critère 6: a push of several refs, one to the night branch, is refused whole; deleting the night branch is refused', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const r = p.pousser('HEAD:travail', 'HEAD:main');
    expect(r.status, r.stderr).not.toBe(0);
    expect(p.ref('travail')).toBe(p.base);
    expect(p.ref('main')).toBe(p.base);
    expect(ligneDeRefus(r.stderr), r.stderr).toBe(true);
    const s = p.pousser(':main');
    expect(s.status, s.stderr).not.toBe(0);
    expect(p.ref('main')).toBe(p.base);
    expect(ligneDeRefus(s.stderr), s.stderr).toBe(true);
  });
});

describe('grillhouse-3uv.59 critère 7 — the update places the guard where git reads the hooks', () => {
  it('critère 7: without core.hooksPath, or without pre-push, the update creates the effective hook, executable, config unchanged', () => {
    const cas = [
      { opts: { hooksPath: false, prePush: false }, crochet: '.git/hooks/pre-push' },
      { opts: { hooksPath: true, prePush: false }, crochet: '.beads/hooks/pre-push' },
    ];
    for (const { opts, crochet } of cas) {
      const p = projet({ poussee: { nuit: 'main' } }, opts);
      expect(p.configApres).toBe(p.configAvant);
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
});

describe('grillhouse-3uv.59 critère 8 — a replayed update changes nothing', () => {
  it('critère 8: after two more updates the hook is identical, its guard present once', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const crochet = path.join(p.repo, '.beads/hooks/pre-push');
    const premier = readFileSync(crochet, 'utf8');
    mettreAJour(p.repo, DEPOT);
    mettreAJour(p.repo, DEPOT);
    const texte = readFileSync(crochet, 'utf8');
    expect(texte).toBe(premier);
    // Outside the Beads section, no line of the frame appears twice.
    const hors = texte
      .split(SECTION_BEADS)
      .join('')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l !== '' && !l.startsWith('#'));
    expect(new Set(hors).size, hors.join('\n')).toBe(hors.length);
    const r = p.pousser('HEAD:main');
    expect(r.status, r.stderr).not.toBe(0);
    expect(ligneDeRefus(r.stderr), r.stderr).toBe(true);
  });
});

describe('grillhouse-3uv.59 critère 9 — the guard reads the key as written in the working tree', () => {
  const ecrire = (repo: string, grillhouse: unknown) =>
    writeFileSync(
      path.join(repo, 'package.json'),
      JSON.stringify({ name: 'p', scripts: { test: 'node t.mjs' }, grillhouse }, null, 2)
    );
  it('critère 9: the working tree package.json decides, and an invalid value refuses the push with a line citing the key', () => {
    // The key written in the working tree only: the push to main is refused.
    const a = projet(undefined);
    ecrire(a.repo, { poussee: { nuit: 'main' } });
    const ra = a.pousser('HEAD:main');
    expect(ra.status, ra.stderr).not.toBe(0);
    expect(a.ref('main')).toBe(a.base);
    // The key removed from the working tree only: the push to main passes.
    const b = projet({ poussee: { nuit: 'main' } });
    ecrire(b.repo, { integration: 'impactes' });
    const rb = b.pousser('HEAD:main');
    expect(rb.status, rb.stderr).toBe(0);
    expect(b.ref('main')).toBe(b.tete);
    // Invalid values refuse any push, here to another branch, with a line that cites the key.
    const invalides: [unknown, RegExp][] = [
      [{ poussee: 'main' }, /grillhouse\.poussee\b/],
      [{ poussee: ['main'] }, /grillhouse\.poussee\b/],
      [{ poussee: { nuit: '' } }, /grillhouse\.poussee\.nuit/],
      [{ poussee: { nuit: '   ' } }, /grillhouse\.poussee\.nuit/],
      [{ poussee: { nuit: 3 } }, /grillhouse\.poussee\.nuit/],
      [{ poussee: { nuit: { branche: 'main' } } }, /grillhouse\.poussee\.nuit/],
    ];
    for (const [cle, citee] of invalides) {
      const p = projet(cle);
      const r = p.pousser('HEAD:travail');
      expect(r.status, `${JSON.stringify(cle)}\n${r.stderr}`).not.toBe(0);
      expect(p.ref('travail')).toBe(p.base);
      expect(r.stderr, JSON.stringify(cle)).toMatch(citee);
    }
  });
});

describe('grillhouse-3uv.59 critère 10 — the guard watches origin only', () => {
  it('critère 10: with poussee.nuit = main, a push to main on another remote passes, origin stays refused', () => {
    const p = projet({ poussee: { nuit: 'main' } });
    const fourche = mkdtempSync(path.join(ESSAIS, 'fourche-'));
    execFileSync('git', ['init', '-q', '--bare', fourche]);
    p.git('remote', 'add', 'fourche', fourche);
    p.git('push', '-q', '--no-verify', 'fourche', `${p.base}:refs/heads/main`);
    const r = p.pousserVers('fourche', 'HEAD:main');
    expect(r.status, r.stderr).toBe(0);
    expect(p.git('--git-dir', fourche, 'rev-parse', 'refs/heads/main').trim()).toBe(p.tete);
    const o = p.pousser('HEAD:main');
    expect(o.status, o.stderr).not.toBe(0);
    expect(p.ref('main')).toBe(p.base);
  });
});
