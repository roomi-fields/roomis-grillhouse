// grillhouse-xv9: an agent's temporary directory lives the time of its ticket, as the owner
// amended criterion 1 (2026-11-01): the launcher gives the session of the envelope the ticket's
// directory (scripts/mesure/base-de-passe.mjs, `ouvrirBaseDuTicket`), kept from one session and one
// resumption to the next; the removal of the finished copies (scripts/copies-finies.mjs) removes it
// once the ticket is closed, and only then, frozen or not, as a retention policy fixed in advance.
// The rest is the day's (packages/grillhouse/tests/unit/dossier-temporaire.spec.ts).
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
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
import { CADRE, enProcessus } from './cadre.js';

const LANCER = path.join(CADRE, 'scripts/enveloppe/lancer.sh');
const COPIES = path.join(CADRE, 'scripts/retirer-les-copies-finies.mjs');
const ouvrirBaseDuTicket = enProcessus<{ base: string; dossier: string }>(
  'scripts/mesure/base-de-passe.mjs',
  'ouvrirBaseDuTicket'
);
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temporaire-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 60_000;
const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));
const noms = (dans: string, prefixe: string) =>
  readdirSync(dans).filter(n => n.startsWith(prefixe));
const proprietaire = (base: string) =>
  JSON.parse(readFileSync(path.join(base, '.grillhouse-base'), 'utf8')) as Record<string, unknown>;
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
// launcher prepares the copy, writes the TMPDIR, TMP and TEMP it receives to <trace>, then waits.
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
    `#!/bin/sh\nprintf '%s %s %s\\n' "$TMPDIR" "$TMP" "$TEMP" > ${JSON.stringify(trace)}\nexec sleep 30\n`
  );
  chmodSync(crochet, 0o755);
  const consigne = path.join(r, 'consigne.md');
  writeFileSync(consigne, 'TON TICKET : t-1\n');
  return { r, consigne };
}

describe('grillhouse-xv9, critère 1 — la séance d’un agent reçoit le dossier temporaire de son ticket', () => {
  it(
    "the ticket's directory is the session's TMPDIR, TMP and TEMP, and stays once the launch ends, for the next session",
    async () => {
      const dans = unDossier('lanceur');
      const trace = path.join(unDossier('trace'), 'temporaire');
      const { r, consigne } = depot(trace);
      const p = spawn('bash', [LANCER, 't-1', 'testwriter', '.', consigne], {
        cwd: r,
        env: { ...ENV, TMPDIR: dans },
        detached: true,
        stdio: 'ignore',
      });
      const fin = new Promise(ok => p.on('exit', ok));
      await jusqua(() => existsSync(trace) && readFileSync(trace, 'utf8').endsWith('\n'));
      const t = path.join(dans, 'grillhouse-ticket-t-1', 't');
      expect(readFileSync(trace, 'utf8').trim()).toBe(`${t} ${t} ${t}`);
      expect(proprietaire(path.dirname(t))).toEqual({ ticket: 't-1' });
      writeFileSync(path.join(t, 'refait'), '');
      process.kill(-(p.pid ?? 0), 'SIGTERM');
      await fin;
      expect(existsSync(path.join(t, 'refait'))).toBe(true);
    },
    LONG
  );
});

describe('grillhouse-xv9, critère 2 — le dossier temporaire d’un ticket fermé part avec ses copies finies', () => {
  it(
    'the removal of the finished copies removes the base of each closed ticket, and keeps every other, frozen or not',
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
      // demo-2 is open, or frozen: its directory stays as long as it is not closed.
      ouvrirBaseDuTicket('demo-1', { dans });
      ouvrirBaseDuTicket('demo-2', { dans });
      const x = spawnSync(process.execPath, [COPIES], {
        cwd: r,
        encoding: 'utf8',
        env: { ...ENV, TMPDIR: dans, PATH: `${bin}${path.delimiter}${ENV.PATH ?? ''}` },
      });
      expect(x.status, x.stderr).toBe(0);
      expect(x.stdout).toContain('✓ dossier temporaire du ticket demo-1 retiré.');
      expect(noms(dans, 'grillhouse-ticket-')).toEqual(['grillhouse-ticket-demo-2']);
    },
    LONG
  );
});
