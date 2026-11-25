// The launcher of the envelope (scripts/enveloppe/lancer.sh) writes nothing of its own in the
// temporary directory of the session, as a job of GitHub Actions finds the runner's files in
// RUNNER_TEMP, never in its workspace: its files lie beside that directory, in the base it owns,
// and go when it ends. The launch is played to the envelope, no repository mounted: stand-ins of
// the preparation of the copy and of the envelope list the directory, the latter reading the
// prompt on its standard input.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
import { cheminSysteme, declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';

const LANCER = path.resolve(import.meta.dirname, '../../scripts/enveloppe/lancer.sh');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temporaire-du-lanceur-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));
const executable = (fichier: string, texte: string) => {
  writeFileSync(fichier, texte);
  chmodSync(fichier, 0o755);
};

// A launch on the copy of a ticket that exists, every tool that would touch a repository stood
// in: git answers where the main tree is and its commit; node plays the real one, but for the
// preparation of the copy, the readings of the copy, and the envelope.
function lancement() {
  const sorties = unDossier('sorties');
  const bin = unDossier('bin');
  const dans = unDossier('dans');
  const r = unDossier('projet');
  const copie = path.join(r, '.claude/worktrees/t-1');
  mkdirSync(copie, { recursive: true });
  mkdirSync(path.join(r, '.git'));
  declarerLesLangages(copie);
  executable(
    path.join(bin, 'git'),
    `#!/bin/sh
case "$*" in
  *--git-common-dir*) echo '${r}/.git' ;;
  *) echo 0000000 ;;
esac
`
  );
  executable(
    path.join(bin, 'node'),
    `#!/bin/sh
case "$1 $2" in
  */travail-de-la-copie.mjs\\ preparer) ls -A "$TMPDIR" > '${sorties}/preparation'; exit 0 ;;
  */grillhouse.mjs\\ index-interfaces | */droits.mjs\\ *) exit 0 ;;
  */enveloppe.mjs\\ *)
    ls -A "$TMPDIR" > '${sorties}/seance'
    printf '%s' "$TMPDIR" > '${sorties}/tmpdir'
    readlink /proc/self/fd/0 > '${sorties}/entree'
    cat > '${sorties}/prompt'
    exit 0 ;;
  */registre.mjs\\ *) exit 0 ;;
esac
exec '${process.execPath}' "$@"
`
  );
  const consigne = path.join(r, 'consigne.md');
  writeFileSync(consigne, 'TON TICKET : t-1\n');
  const x = spawnSync('bash', [LANCER, 't-1', 'testwriter', '.', consigne], {
    cwd: r,
    env: { PATH: cheminSysteme(bin), HOME: unDossier('maison'), TMPDIR: dans },
    encoding: 'utf8',
    timeout: 120_000,
  });
  const lire = (f: string) => readFileSync(path.join(sorties, f), 'utf8').trim();
  return { x, dans, lire };
}

describe('the launcher leaves nothing in the temporary directory of the session', () => {
  it('its files lie beside that directory, which stays empty, and go at its end', () => {
    const l = lancement();
    expect(l.x.status, l.x.stderr).toBe(0);
    expect(l.lire('preparation')).toBe('');
    expect(l.lire('seance')).toBe('');
    expect(l.lire('prompt')).toContain('TON TICKET : t-1');
    const base = path.dirname(l.lire('tmpdir'));
    expect(path.dirname(l.lire('entree'))).toBe(base);
    expect(readdirSync(l.dans)).toEqual([]);
  }, 150_000);
});
