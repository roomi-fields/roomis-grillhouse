// `npx grillhouse temporaire`: in a session the frame launched, the temporary directory that its
// TMPDIR names; anywhere else, or with an argument, the code 2, saying so, and nothing made. The
// session is one out of the envelope (scripts/seances.mjs `lancer`), claude stood in by a script
// that runs the command.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ouvrirBase } from '../../scripts/mesure/base-de-passe.mjs';
import * as seances from '../../scripts/seances.mjs';

const BIN = path.resolve(import.meta.dirname, '../../bin/grillhouse.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'commande-temporaire-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
// The temporary directory of the test itself, which a session must not receive.
const DEHORS = path.dirname(ESSAIS);

const lancer = seances.lancer as (
  ctx: object,
  role: string,
  consigne: string,
  options: object
) => Promise<unknown>;

// This environment without what Vitest and a session of the frame set: that of the supervisor.
const HORS_SEANCE = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) =>
      !k.startsWith('VITEST') &&
      !k.startsWith('GRILLHOUSE_') &&
      k !== 'NODE_OPTIONS' &&
      k !== 'BEADS_ACTOR'
  )
);

// The command run out of any session, its temporary directory &lt;dans&gt;.
const horsSeance = (dans: string, args: string[] = []) =>
  spawnSync(process.execPath, [BIN, 'temporaire', ...args], {
    cwd: ESSAIS,
    encoding: 'utf8',
    env: { ...HORS_SEANCE, TMPDIR: dans, TMP: dans, TEMP: dans },
  });

describe('grillhouse temporaire in a session the frame launched', () => {
  // The session runs the command, without argument then with one; each run keeps its output, its
  // errors and its code.
  async function dansUneSeance() {
    const d = mkdtempSync(path.join(ESSAIS, 'seance-'));
    const faux = path.join(d, 'claude');
    writeFileSync(
      faux,
      `#!/bin/bash
cat > /dev/null
d=${d}
echo "$TMPDIR" > $d/tmpdir
"${process.execPath}" "${BIN}" temporaire > $d/sortie 2> $d/erreurs; echo $? > $d/code
if [ "$TMPDIR" != "${DEHORS}" ]; then
  "${process.execPath}" "${BIN}" temporaire demo-1 > $d/sortie-ticket 2> $d/erreurs-ticket; echo $? > $d/code-ticket
  find "$TMPDIR" "$TMPDIR/../.." -mindepth 1 -maxdepth 1 -printf '%f\n' > $d/apres
fi
`
    );
    chmodSync(faux, 0o755);
    // The context of a circuit, as far as a session out of the envelope reads it: its copy, which
    // is no repository, and its working files.
    const ctx = {
      racine: d,
      copie: d,
      ticket: 'demo-1',
      paquets: [],
      tmp: d,
      journal: path.join(d, 'journal'),
      fiches: path.join(d, 'fiches.jsonl'),
      transcriptions: path.join(d, 'transcriptions'),
      immobileMs: 60_000,
      essaiDeLActe: 1,
      rendus: [],
    };
    const essai = {
      CLAUDE_BIN: faux,
      GRILLHOUSE_REGISTRE: path.join(d, 'registre.jsonl'),
      GRILLHOUSE_PLACE_TENUE: 'essai',
      ANTHROPIC_API_KEY: 'essai',
    };
    const avant = Object.keys(essai).map(k => [k, process.env[k]] as const);
    Object.assign(process.env, essai);
    try {
      await lancer(ctx, 'explorateur', 'TON TICKET : demo-1\n', {
        horsEnveloppe: true,
        session: ['--session-id', 'seance-commande'],
        evenement: 'commande',
      });
    } finally {
      for (const [k, v] of avant) {
        if (v === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = v;
        }
      }
    }
    return (f: string) => readFileSync(path.join(d, f), 'utf8');
  }

  it('writes, without argument, the directory that the session’s TMPDIR names', async () => {
    const lire = await dansUneSeance();
    expect(lire('code').trim(), lire('erreurs')).toBe('0');
    expect(lire('sortie')).toBe(lire('tmpdir'));
  });

  it('refuses an argument, a ticket’s id included, and makes nothing', async () => {
    const lire = await dansUneSeance();
    expect(lire('code-ticket').trim()).toBe('2');
    expect(lire('sortie-ticket')).toBe('');
    expect(lire('erreurs-ticket')).not.toBe('');
    expect(lire('apres').split('\n')).not.toContain('grillhouse-ticket-demo-1');
  });
});

describe('grillhouse temporaire out of a session the frame launched', () => {
  it.each([[[]], [['demo-1']]])(
    'ends at 2 with the arguments %j, says it is about a session, and makes nothing',
    args => {
      const dans = mkdtempSync(path.join(ESSAIS, 'superviseur-'));
      const r = horsSeance(dans, args);
      expect(r.status, r.stdout).toBe(2);
      expect(r.stdout).toBe('');
      expect(r.stderr).toMatch(/séance/);
      expect(readdirSync(dans)).toEqual([]);
    }
  );

  it('takes the directory of a pass for no session', () => {
    const passe = ouvrirBase('verification', { dans: mkdtempSync(path.join(ESSAIS, 'passe-')) });
    const r = horsSeance(passe.dossier);
    expect(r.status, r.stdout).toBe(2);
    expect(r.stderr).toMatch(/séance/);
    expect(readdirSync(passe.dossier)).toEqual([]);
    passe.fermer();
  });
});
