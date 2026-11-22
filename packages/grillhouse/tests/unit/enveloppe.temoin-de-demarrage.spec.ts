// The witness that the envelope started its command (scripts/enveloppe/enveloppe.mjs,
// `TEMOIN_DE_DEMARRAGE`): the command the envelope runs writes an empty file as its first gesture,
// in the session's working directory (its `TMPDIR`), before the session's own command. The
// launcher ranges it with the session's result, and the circuit tells by it a session that ended in
// error from a launch bwrap refused before the session (scripts/seances.mjs `seanceLancee`). The
// case plays what bwrap would run, without bwrap; the launcher that ranges the witness, and a
// launch the envelope refuses, are the night's
// (packages/grillhouse-essais/tests/enveloppe.lanceur.nuit.spec.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { TEMOIN_DE_DEMARRAGE, lancementDeLaSeance } from '../../scripts/enveloppe/enveloppe.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temoin-de-demarrage-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// What bwrap runs for <commande> in a session whose working directory is <travail>: the arguments
// of the launch after those of bwrap (none here), and the session's environment.
function dansLEnveloppe(travail: string, commande: string[]) {
  const lancement = lancementDeLaSeance({
    argsBwrap: [],
    commande,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    cacheNpm: path.join(ESSAIS, 'npm'),
    paquets: ['.'],
    travail,
  });
  expect(lancement.cmd).toBe('bwrap');
  return spawnSync(lancement.args[0] as string, lancement.args.slice(1), {
    env: lancement.env,
    encoding: 'utf8',
  });
}

describe('the command of the envelope leaves the witness of its start', () => {
  it('writes the witness in the working directory before the session’s command runs', () => {
    const travail = mkdtempSync(path.join(ESSAIS, 'travail-'));
    const vu = path.join(travail, 'vu');
    const r = dansLEnveloppe(travail, [
      '/bin/sh',
      '-c',
      `[ -e "$TMPDIR/${TEMOIN_DE_DEMARRAGE}" ] && echo oui > "${vu}"; exit 3`,
    ]);
    expect(r.status).toBe(3);
    expect(readFileSync(vu, 'utf8').trim()).toBe('oui');
    expect(existsSync(path.join(travail, TEMOIN_DE_DEMARRAGE))).toBe(true);
  });

  it('runs the session’s command all the same when the witness cannot be written', () => {
    const r = dansLEnveloppe(path.join(ESSAIS, 'absent'), ['/bin/sh', '-c', 'exit 4']);
    expect(r.status).toBe(4);
  });
});
