// grillhouse-3uv.95.3 — the enclosure of writing: an agent reads the whole copy, and writes only in
// the packages its plan names. The chain, played at night: bwrap itself, and the lock of the agent
// (scripts/verrous/verrou.mjs), each in a repository of trial; the plan of the envelope is the
// day's (packages/grillhouse/tests/unit/enveloppe.enceinte.spec.ts).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  canWrap,
  enveloppeEssai,
  LANGAGE,
  racineSousLaMaison,
} from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE, valeursDe } from './cadre.js';
import { SCRIPT } from './enveloppe-essai.js';

// The exit code of a refusal and the variable of the plan, read in a process of their own.
const { CODE_REFUS } = valeursDe('scripts/enveloppe/codes.mjs', ['CODE_REFUS']) as {
  CODE_REFUS: number;
};
const { VARIABLE } = valeursDe('scripts/enveloppe/paquets-du-plan.mjs', ['VARIABLE']) as {
  VARIABLE: string;
};

// The real envelope replaces /tmp with an empty directory: its repositories live outside it.
const ESSAIS = racineSousLaMaison('grillhouse-essais-enceinte-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe.runIf(canWrap)('grillhouse-3uv.95.3 — l’enceinte sur le disque', () => {
  const { essai } = enveloppeEssai(ESSAIS);
  const repo = essai('enceinte-');
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    writeFileSync(path.join(repo, f), t);
  };
  ecrire(
    'package.json',
    JSON.stringify({ name: 'essai', workspaces: ['packages/*'], grillhouse: LANGAGE })
  );
  for (const n of ['a', 'b', 'c']) {
    ecrire(`packages/${n}/package.json`, JSON.stringify({ name: n }));
    ecrire(`packages/${n}/src/${n}.ts`, `source-${n}`);
  }
  ecrire('.beads/config.yaml', '');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'init');
  const copie = path.join(repo, '.claude/worktrees/demo-1');
  git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
  // An index of the copy, as codegraph and rtfm keep one.
  mkdirSync(path.join(copie, '.codegraph'));
  writeFileSync(path.join(copie, '.codegraph/index.db'), 'index');
  const home = essai('home-');
  mkdirSync(path.join(home, '.claude/projects'), { recursive: true });

  const run = (shell: string, paquets = 'packages/a:packages/b') =>
    spawnSync('node', [SCRIPT, copie, paquets, 'developpeur', '--', 'bash', '-c', shell], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, LC_ALL: 'C' },
    });

  it('critère 1 — l’agent lit toute la copie : le code d’un paquet hors du plan et l’index', () => {
    const r = run('cat packages/c/src/c.ts .codegraph/index.db');
    expect(r.stdout, r.stderr).toBe('source-cindex');
  });

  it('critère 1 — l’agent écrit chaque paquet du plan, et la base des tickets', () => {
    const r = run(`touch packages/a/src/x.ts packages/b/src/x.ts ${repo}/.beads/x`);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(copie, 'packages/b/src/x.ts'))).toBe(true);
  });

  it('critère 2 — une écriture hors des paquets du plan échoue au montage : un autre paquet, la racine, .git', () => {
    for (const f of ['packages/c/src/c.ts', 'racine.txt', '.git']) {
      const r = run(`echo x >> ${f}`);
      expect(r.status, f).not.toBe(0);
      expect(r.stderr, f).toContain('Read-only file system');
    }
    expect(readFileSync(path.join(copie, 'packages/c/src/c.ts'), 'utf8')).toBe('source-c');
  });

  it('critère 3 — la séance reçoit la liste dans GRILLHOUSE_ENVELOPPE', () => {
    expect(run('printenv GRILLHOUSE_ENVELOPPE').stdout.trim()).toBe('packages/a:packages/b');
  });

  it('critère 1 — refuse un chemin du plan qui n’existe pas', () => {
    const r = run('true', 'packages/a:packages/z');
    expect(r.status).toBe(CODE_REFUS);
    expect(r.stderr).toContain('Le composant');
  });
});

// The lock of the agent (scripts/verrous/verrou.mjs), a hook of its session, reads the plan in the
// envelope's variable: a write out of the plan's packages stops the session, as Claude Code's
// `continue: false` ends it, with the package named, and leaves its mark in the session's working
// directory, which the launcher hands to the circuit.
const VERROU = path.join(CADRE, 'scripts/verrous/verrou.mjs');
describe('grillhouse-3uv.95.3 — le crochet de l’agent et le plan', () => {
  const { essai } = enveloppeEssai(ESSAIS);
  const repo = essai('crochet-');
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    writeFileSync(path.join(repo, f), t);
  };
  ecrire(
    'package.json',
    JSON.stringify({ name: 'essai', workspaces: ['packages/*'], grillhouse: LANGAGE })
  );
  for (const n of ['a', 'b', 'c']) {
    ecrire(`packages/${n}/package.json`, JSON.stringify({ name: n }));
  }
  spawnSync('git', ['init', '-q'], { cwd: repo });
  const ecrireAvec = (role: string, rel: string, liste: string | null) => {
    const tmp = essai('tmp-');
    const env: Record<string, string | undefined> = { ...process.env, TMPDIR: tmp };
    delete env[VARIABLE];
    if (liste !== null) {
      env[VARIABLE] = liste;
    }
    const input = {
      tool_name: 'Write',
      tool_input: { file_path: path.join(repo, rel), content: 'x' },
      cwd: repo,
    };
    const r = spawnSync('node', [VERROU, role], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      env,
    });
    const marque = path.join(tmp, 'hors-plan');
    return { ...r, marque: existsSync(marque) ? readFileSync(marque, 'utf8') : null };
  };

  it('critère 2 — une écriture hors des paquets du plan arrête la séance, le paquet nommé', () => {
    const r = ecrireAvec('testwriter', 'packages/c/test/x.test.ts', 'packages/a:packages/b');
    expect(r.status, r.stderr).toBe(0);
    const sortie = JSON.parse(r.stdout) as {
      continue: boolean;
      stopReason: string;
      hookSpecificOutput: Record<string, string>;
    };
    expect(sortie.continue).toBe(false);
    expect(sortie.stopReason).toContain('hors-plan');
    expect(sortie.stopReason).toContain('packages/c');
    expect(sortie.hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
    });
    expect(r.marque).toBe(sortie.stopReason);
  });

  it('critère 2 — une écriture dans un paquet du plan suit la règle de son rôle, sans arrêt', () => {
    const r = ecrireAvec('testwriter', 'packages/b/test/x.test.ts', 'packages/a:packages/b');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.marque).toBeNull();
    const code = ecrireAvec('testwriter', 'packages/b/src/x.ts', 'packages/a:packages/b');
    expect(code.status).toBe(2);
    expect(code.marque).toBeNull();
  });

  it('critère 2 — hors de l’enveloppe, aucun plan ne borne l’écriture', () => {
    const r = ecrireAvec('testwriter', 'packages/c/test/x.test.ts', null);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('');
  });
});
