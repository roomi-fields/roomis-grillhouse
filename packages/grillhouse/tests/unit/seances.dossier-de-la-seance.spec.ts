// The temporary directory of a session out of the envelope (scripts/seances.mjs `lancer`: the
// explorateur, the questionneur, the reviewer): a base of a pass (scripts/mesure/base-de-passe.mjs)
// of its own, empty when it starts, removed when it ends, as GitHub Actions gives each job a new
// runner and Bazel each action its TEST_TMPDIR. Claude is a stand-in (CLAUDE_BIN) that records what
// it receives. The session of the envelope, opened by the launcher on a trial project, is the
// night's (packages/grillhouse-essais/tests/temporaire.nuit.spec.ts).
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { signalerGroupe } from '../../scripts/mesure-de-la-machine.mjs';
import * as seances from '../../scripts/seances.mjs';
import { monde, type Monde } from './seance-d-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dossier-de-la-seance-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
// The temporary directory of the test itself, which a session must not receive.
const DEHORS = path.dirname(ESSAIS);

const lancer = seances.lancer as (
  ctx: object,
  role: string,
  consigne: string,
  options: object
) => Promise<{ seance: number | null }>;

const HORS_ENVELOPPE = ['explorateur', 'questionneur', 'relecteur'];
const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
async function jusqua(condition: () => boolean, ms = 8_000) {
  const fin = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > fin) {
      throw new Error('la condition ne vient pas');
    }
    await attendre(50);
  }
}

// What the stand-in of one session saw.
interface Vu {
  tmpdir: string;
  tmp: string;
  temp: string;
  claudeTmpdir: string;
  contenu: string;
  proprietaire: { pid?: number };
  /** The processes above the stand-in, its parent first. */
  ancetres: number[];
  consigne: string;
}

// A stand-in for claude of its own: it records in a folder of its own its temporary directory, what
// it holds at its start, the owner of its base and its ancestors, writes there as a session does,
// then ends as &lt;fin&gt; says. Under the temporary directory of the test itself (the circuit's), it
// writes nothing there.
function espion(fin = 'exit 0') {
  const d = mkdtempSync(path.join(ESSAIS, 'espion-'));
  const faux = path.join(d, 'claude');
  writeFileSync(
    faux,
    `#!/bin/bash
d=${d}
cat > $d/consigne
printf '%s\\n' "$TMPDIR" "$TMP" "$TEMP" "\${CLAUDE_CODE_TMPDIR-}" > $d/env
if [ "$TMPDIR" != "${DEHORS}" ]; then
  ls -A "$TMPDIR" > $d/contenu
  cat "$TMPDIR/../.grillhouse-base" > $d/proprietaire
  echo reste > "$TMPDIR/reste"
  mkdir -p "$TMPDIR/sous/dossier"
fi
p=$PPID
while [ "$p" -gt 1 ]; do echo $p; p=$(awk '/^PPid/{print $2}' /proc/$p/status); done > $d/ancetres
touch $d/pret
${fin}
`
  );
  chmodSync(faux, 0o755);
  const lire = (f: string) =>
    existsSync(path.join(d, f)) ? readFileSync(path.join(d, f), 'utf8') : '';
  return {
    faux,
    pret: () => existsSync(path.join(d, 'pret')),
    vu: (): Vu => {
      const [dossier = '', tmp = '', temp = '', claudeTmpdir = ''] = lire('env').split('\n');
      return {
        tmpdir: dossier,
        tmp,
        temp,
        claudeTmpdir,
        contenu: lire('contenu'),
        proprietaire: JSON.parse(lire('proprietaire') || '{}') as { pid?: number },
        ancetres: lire('ancetres').split('\n').filter(Boolean).map(Number),
        consigne: lire('consigne'),
      };
    },
  };
}

let numero = 0;
// One session of &lt;role&gt; out of the envelope, claude stood in by &lt;faux&gt;.
function jouer(m: Monde, faux: string, role: string, options: object = {}) {
  const id = `seance-${++numero}`;
  return m.jouer(() => {
    process.env.CLAUDE_BIN = faux;
    return lancer(m.ctx, role, 'TON TICKET : demo-1\n', {
      horsEnveloppe: true,
      session: ['--session-id', id],
      evenement: id,
      ...options,
    });
  });
}

// The base of the session whose temporary directory is &lt;dossier&gt;, judged: a base of the frame, of
// its own, whose directory `t` the session writes in.
function base(vu: Vu): string {
  expect(vu.tmpdir).not.toBe(DEHORS);
  expect(path.basename(vu.tmpdir)).toBe('t');
  const b = path.dirname(vu.tmpdir);
  expect(path.basename(b)).toMatch(/^grillhouse-/);
  expect(path.basename(b)).not.toMatch(/^grillhouse-ticket-/);
  return b;
}

describe('a session out of the envelope has a temporary directory of its own', () => {
  it.each(HORS_ENVELOPPE)(
    'the %s starts in an empty directory that TMPDIR, TMP and TEMP name, removed at its end with what it wrote',
    async role => {
      const e = espion();
      const r = await jouer(monde(), e.faux, role);
      expect(r.seance).toBe(0);
      const vu = e.vu();
      const b = base(vu);
      expect([vu.tmp, vu.temp]).toEqual([vu.tmpdir, vu.tmpdir]);
      expect(vu.contenu).toBe('');
      expect(existsSync(b)).toBe(false);
    }
  );

  it('the next session of the ticket starts in another directory, empty', async () => {
    const m = monde();
    const [une, deux] = [espion(), espion()];
    await jouer(m, une.faux, 'explorateur');
    await jouer(m, deux.faux, 'explorateur');
    expect(base(deux.vu())).not.toBe(base(une.vu()));
    expect(deux.vu().contenu).toBe('');
  });

  it('its owner is a process that carries the session, never the circuit, so that it outlives a dead circuit', async () => {
    const e = espion();
    await jouer(monde(), e.faux, 'relecteur');
    const { proprietaire, ancetres } = e.vu();
    const sousLeCircuit = ancetres.slice(0, ancetres.indexOf(process.pid));
    expect(sousLeCircuit.length).toBeGreaterThan(0);
    expect(sousLeCircuit).toContain(proprietaire.pid);
  });

  it('a session that ends in error loses its directory too', async () => {
    const e = espion('exit 3');
    const r = await jouer(monde(), e.faux, 'questionneur');
    expect(r.seance).toBe(3);
    expect(existsSync(base(e.vu()))).toBe(false);
  });

  it('a session cancelled loses its directory', async () => {
    const e = espion('exec sleep 30');
    const annulation = new AbortController();
    const jeu = jouer(monde(), e.faux, 'explorateur', { annulation: annulation.signal }).catch(
      (x: Error) => x.name
    );
    await jusqua(e.pret);
    annulation.abort();
    expect(await jeu).toBe('SeanceAnnulee');
    const b = base(e.vu());
    await jusqua(() => !existsSync(b));
  });

  it('the directory of a session whose processes are killed is swept by the next session', async () => {
    const m = monde();
    const tuee = espion('exec sleep 30');
    let groupe = 0;
    const jeu = jouer(m, tuee.faux, 'explorateur', {
      signeDeVie: (v: { pid: number } | null) => {
        groupe = v?.pid ?? groupe;
      },
    });
    await jusqua(tuee.pret);
    signalerGroupe(groupe, 'SIGKILL');
    await jeu;
    const b = base(tuee.vu());
    const suivante = espion();
    await jouer(m, suivante.faux, 'explorateur');
    expect(existsSync(b)).toBe(false);
  });

  it('a CLAUDE_CODE_TMPDIR of the poste does not take the session’s scratchpads out of its directory', async () => {
    const duPoste = mkdtempSync(path.join(ESSAIS, 'du-poste-'));
    const avant = process.env.CLAUDE_CODE_TMPDIR;
    process.env.CLAUDE_CODE_TMPDIR = duPoste;
    const e = espion();
    try {
      await jouer(monde(), e.faux, 'explorateur');
    } finally {
      if (avant === undefined) {
        delete process.env.CLAUDE_CODE_TMPDIR;
      } else {
        process.env.CLAUDE_CODE_TMPDIR = avant;
      }
    }
    const vu = e.vu();
    base(vu);
    // Claude Code writes under CLAUDE_CODE_TMPDIR, else under the temporary directory that TMPDIR names.
    const choisi = vu.claudeTmpdir || vu.tmpdir;
    expect(path.relative(vu.tmpdir, choisi).startsWith('..'), choisi).toBe(false);
  });

  it('receives no section « Ton dossier de travail »', async () => {
    const e = espion();
    await jouer(monde(), e.faux, 'relecteur');
    expect(e.vu().consigne).toBe('TON TICKET : demo-1\n');
  });
});
