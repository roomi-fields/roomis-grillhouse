// @equipee: l'enveloppe bwrap
// The temporary directory of a session of the envelope, as GitHub Actions gives each job a new
// runner and Bazel each action its TEST_TMPDIR: the launcher (scripts/enveloppe/lancer.sh) opens a
// base of a pass (scripts/mesure/base-de-passe.mjs) of its own, removes it at its end, even
// interrupted, and the next session sweeps the one of a launcher killed. The removal of the
// finished copies (scripts/copies-finies.mjs) treats no directory of a ticket. A session out of the
// envelope is the day's (packages/grillhouse/tests/unit/seances.dossier-de-la-seance.spec.ts).
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE } from './cadre.js';

const LANCER = path.join(CADRE, 'scripts/enveloppe/lancer.sh');
const COPIES = path.join(CADRE, 'scripts/retirer-les-copies-finies.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temporaire-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 60_000;
const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));
const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
async function jusqua(condition: () => boolean, ms = 30_000) {
  const fin = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > fin) {
      throw new Error('la condition ne vient pas');
    }
    await attendre(50);
  }
}

// The environment of a child: this one, without what Vitest and the frame set for themselves.
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS' && !k.startsWith('GRILLHOUSE_')
  )
) as Record<string, string>;

const git = (r: string, ...a: string[]) => {
  const x = spawnSync('git', ['-C', r, ...a], { encoding: 'utf8' });
  if (x.status !== 0) {
    throw new Error(x.stderr);
  }
};

// A trial repository the launcher judges and begins to prepare: its language declared, an
// instruction of its ticket; its hook post-checkout, which `git worktree add` runs while the
// launcher prepares the copy, writes to <trace> the TMPDIR, TMP and TEMP it receives, then the
// owner of that directory's base, writes a file there, then waits.
function depot(trace: string) {
  const r = unDossier('depot');
  git(r, 'init', '-q', '-b', 'main');
  git(r, 'config', 'user.email', 'essai@example.com');
  git(r, 'config', 'user.name', 'essai');
  declarerLesLangages(r);
  writeFileSync(path.join(r, '.gitignore'), '.claude/\n');
  git(r, 'add', '-A');
  git(r, 'commit', '-q', '-m', 'base');
  const crochet = path.join(r, '.git', 'hooks', 'post-checkout');
  writeFileSync(
    crochet,
    `#!/bin/sh
printf '%s %s %s\\n' "$TMPDIR" "$TMP" "$TEMP" > ${JSON.stringify(trace)}.tmp
cat "$TMPDIR/../.grillhouse-base" >> ${JSON.stringify(trace)}.tmp 2>/dev/null
echo ecrit > "$TMPDIR/ecrit"
mv ${JSON.stringify(trace)}.tmp ${JSON.stringify(trace)}
exec sleep 30
`
  );
  chmodSync(crochet, 0o755);
  const consigne = path.join(r, 'consigne.md');
  writeFileSync(consigne, 'TON TICKET : t-1\n');
  return { r, consigne };
}

// A launch of the launcher, stopped in the preparation of its copy, its temporary directory
// <dans>: the process, its end, and what the hook saw.
async function lancement(dans: string) {
  const trace = path.join(unDossier('trace'), 'temporaire');
  const { r, consigne } = depot(trace);
  const p = spawn('bash', [LANCER, 't-1', 'testwriter', '.', consigne], {
    cwd: r,
    env: { ...ENV, TMPDIR: dans },
    detached: true,
    stdio: 'ignore',
  });
  const fin = new Promise(ok => p.on('exit', ok));
  await jusqua(() => existsSync(trace));
  const [variables = '', proprio = ''] = readFileSync(trace, 'utf8').split('\n');
  const [dossier = '', tmp, temp] = variables.split(' ');
  return {
    p,
    fin,
    dossier,
    tmp,
    temp,
    proprietaire: JSON.parse(proprio || '{}') as { pid?: number },
    arreter: async (signal: NodeJS.Signals) => {
      process.kill(-(p.pid ?? 0), signal);
      await fin;
    },
  };
}

describe('a session of the envelope has a temporary directory of its own', () => {
  it(
    'the preparation of its copy writes in a base of the pass under TMPDIR, TMP and TEMP, owned by the launcher, removed when the launch is interrupted',
    async () => {
      const dans = unDossier('lanceur');
      const l = await lancement(dans);
      try {
        expect([l.tmp, l.temp]).toEqual([l.dossier, l.dossier]);
        expect(path.basename(l.dossier)).toBe('t');
        const base = path.dirname(l.dossier);
        expect(path.dirname(base)).toBe(dans);
        expect(path.basename(base)).toMatch(/^grillhouse-/);
        expect(path.basename(base)).not.toMatch(/^grillhouse-ticket-/);
        expect(l.proprietaire.pid).toBe(l.p.pid);
      } finally {
        await l.arreter('SIGTERM');
      }
      expect(existsSync(path.dirname(l.dossier))).toBe(false);
    },
    LONG
  );

  it(
    'the directory of a launcher killed is swept by the next session, which has another',
    async () => {
      const dans = unDossier('tue');
      const tue = await lancement(dans);
      await tue.arreter('SIGKILL');
      const suivant = await lancement(dans);
      try {
        expect(suivant.dossier).not.toBe(tue.dossier);
        expect(existsSync(path.dirname(tue.dossier))).toBe(false);
        expect(readdirSync(suivant.dossier)).toEqual(['ecrit']);
      } finally {
        await suivant.arreter('SIGTERM');
      }
    },
    LONG
  );
});

describe('the removal of the finished copies treats no temporary directory of a ticket', () => {
  it(
    'leaves the directory a ticket left, closed or not, and says nothing of it',
    () => {
      const dans = unDossier('copies');
      const r = unDossier('depot-copies');
      git(r, 'init', '-q', '-b', 'main');
      const bin = unDossier('bin');
      writeFileSync(
        path.join(bin, 'bd'),
        `#!/bin/sh\ncase "$*" in *closed*) echo '[{"id":"demo-1"}]' ;; *) echo '[]' ;; esac\n`
      );
      chmodSync(path.join(bin, 'bd'), 0o755);
      const ancien = path.join(dans, 'grillhouse-ticket-demo-1');
      mkdirSync(path.join(ancien, 't'), { recursive: true });
      writeFileSync(path.join(ancien, '.grillhouse-base'), '{"ticket":"demo-1"}\n');
      const x = spawnSync(process.execPath, [COPIES], {
        cwd: r,
        encoding: 'utf8',
        env: { ...ENV, TMPDIR: dans, PATH: `${bin}${path.delimiter}${ENV.PATH ?? ''}` },
      });
      expect(x.status, x.stderr).toBe(0);
      expect(x.stdout).not.toContain('dossier temporaire');
      expect(existsSync(ancien)).toBe(true);
    },
    LONG
  );
});
