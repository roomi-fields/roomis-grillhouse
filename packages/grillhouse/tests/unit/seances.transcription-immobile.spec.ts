// A session whose transcript stands still past the delay stops at « bloqué » (scripts/seances.mjs,
// `seanceLancee`): the report names the role and the delay, and ends on the last lines of the
// ticket's log, which come with the stop. The watching itself, which kills the group of a session
// that stands still, is proved by `jouerLeGroupe` (tests/unit/seances.spec.ts).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'seances-immobile-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const lancee = seances.seanceLancee as (ctx: object, role: string, r: object) => unknown;

function arretDe(immobileMs: number, journal: string) {
  const f = path.join(ESSAIS, `journal-${immobileMs}-${journal.length}`);
  writeFileSync(f, journal);
  try {
    lancee({ immobileMs, journal: f, paquets: ['.'], transcriptions: ESSAIS }, 'testwriter', {
      bloque: true,
      seance: null,
      code: null,
    });
  } catch (e) {
    return e as { nom: string; rapport: string };
  }
  throw new Error('aucun arrêt');
}

describe('une séance dont la transcription n’a pas bougé', () => {
  it('arrête à « bloqué », le rôle et le délai en minutes dans le rapport', () => {
    const a = arretDe(15 * 60_000, 'le testwriter réfléchit\n');
    expect(a.nom).toBe('bloqué');
    expect(a.rapport).toContain(
      "La transcription de la séance du testwriter n'a pas bougé en 15 min"
    );
  });

  it('dit le délai en millisecondes quand il ne fait pas une minute', () => {
    expect(arretDe(15_000, 'x\n').rapport).toContain("n'a pas bougé en 15000 ms");
  });

  it('porte avec l’arrêt les dernières lignes du journal, 40 au plus', () => {
    const journal = `${Array.from({ length: 60 }, (_v, i) => `ligne ${i + 1}`).join('\n')}\n`;
    const a = arretDe(20 * 60_000, journal);
    expect(a.rapport).toContain('Les dernières lignes du journal :');
    expect(a.rapport).toContain('ligne 60');
    expect(a.rapport).toContain('ligne 22');
    expect(a.rapport).not.toContain('ligne 21\n');
  });

  it('une séance qui n’est pas bloquée ne s’arrête pas', () => {
    expect(
      lancee(
        { immobileMs: 1000, journal: path.join(ESSAIS, 'absent'), paquets: ['.'] },
        'testwriter',
        {
          seance: 0,
          code: 0,
        }
      )
    ).toBeUndefined();
  });
});
