// The alerts of the board for a question that waits for the supervisor (grillhouse-d4n.7): one
// alert per circuit stopped on a question to the supervisor, in the tone of that wait whatever its
// length, how many minutes it has waited (from the `depuis` of the file of the stops gone up);
// one red alert « à corriger », distinct, when such a circuit stands while no wait lives; and
// `attenteVivante`, which reads the lock of the wait and the process it names. Time is the board's
// own injected `maintenant`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembler, attenteVivante } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-10-18T12:00:00Z');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-attente-superviseur-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Alerte {
  etat: string;
  ton: string;
  texte: string;
}
interface Board {
  alertes: Alerte[];
}

const T = (id: string) => ({
  id,
  title: `${id.slice(5)} — Le sujet de ${id} — packages/demo`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-10-18T11:30:00Z',
  labels: ['circuit'],
});
const arrete = (ticket: string) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question: 'Quel paquet lève ce rouge ?',
    qui: 'superviseur',
    numero: 1,
  });
const cle = (ticket: string) => `${ticket}:run-${ticket}:1:controles`;

const plateau = (
  circuits: object[],
  remontees: { cle: string; depuis: number }[],
  extra: { attenteVivante?: boolean } = {}
) =>
  assembler({
    tous: circuits.map(c => T((c as { ticket: string }).ticket)),
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits,
    remontees,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 24 * 60 * MIN,
    ...extra,
  } as Parameters<typeof assembler>[0]) as Board;

const attentes = (t: Board) => t.alertes.filter(a => /attend le superviseur/.test(a.texte));
const filets = (t: Board) => t.alertes.filter(a => /à corriger/i.test(a.texte));

describe('the alert of a circuit that waits for the supervisor', () => {
  it('is in the tone of a wait for the supervisor and says how many minutes the circuit has waited', () => {
    const t = plateau([arrete('demo-1')], [{ cle: cle('demo-1'), depuis: MAINTENANT - 7 * MIN }]);
    expect(attentes(t)).toHaveLength(1);
    expect(attentes(t)[0]).toMatchObject({ etat: 'attendLeSuperviseur', ton: 'attention' });
    expect(attentes(t)[0]!.texte).toMatch(/^1 .*depuis 7 min/);
  });

  it('counts from its own `depuis`, one alert per circuit', () => {
    const t = plateau(
      [arrete('demo-1'), arrete('demo-2')],
      [
        { cle: cle('demo-1'), depuis: MAINTENANT - 2 * MIN },
        { cle: cle('demo-2'), depuis: MAINTENANT - 4 * MIN },
      ]
    );
    expect(attentes(t).map(a => a.texte.match(/depuis (\d+) min/)?.[1])).toEqual(['2', '4']);
  });

  it('keeps the tone of attention however long the circuit has waited', () => {
    const entree = (min: number) => [{ cle: cle('demo-1'), depuis: MAINTENANT - min * MIN }];
    for (const min of [1, 10.5, 600]) {
      expect(attentes(plateau([arrete('demo-1')], entree(min)))[0]!.ton).toBe('attention');
    }
  });

  it('falls once the circuit has left its stop', () => {
    const entree = [{ cle: cle('demo-1'), depuis: MAINTENANT - 7 * MIN }];
    const t = plateau([circuitLu('demo-1', { etape: 'controles', vivant: true })], entree);
    expect(attentes(t)).toEqual([]);
  });

  it('is not raised for a stop that another question has replaced', () => {
    const t = plateau(
      [{ ...arrete('demo-1'), numero: 2 }],
      [{ cle: cle('demo-1'), depuis: MAINTENANT - 7 * MIN }]
    );
    expect(attentes(t)).toEqual([]);
  });
});

describe('the alert « à corriger » of a question with no live wait', () => {
  const entree = [{ cle: cle('demo-1'), depuis: MAINTENANT - 1 * MIN }];

  it('is one red alert, distinct from the alert of the wait', () => {
    const t = plateau([arrete('demo-1')], entree, { attenteVivante: false });
    expect(filets(t)).toHaveLength(1);
    expect(filets(t)[0]!.ton).toBe('alerte');
    expect(filets(t)[0]!.texte).toMatch(/aucune attente/i);
    expect(attentes(t)).toHaveLength(1);
    expect(attentes(t)[0]).not.toBe(filets(t)[0]);
  });

  it('stays one alert however many circuits wait', () => {
    const t = plateau([arrete('demo-1'), arrete('demo-2')], entree, { attenteVivante: false });
    expect(filets(t)).toHaveLength(1);
  });

  it('falls as soon as a wait lives', () => {
    expect(filets(plateau([arrete('demo-1')], entree, { attenteVivante: true }))).toEqual([]);
  });

  it('is not raised when no circuit waits for the supervisor', () => {
    const t = plateau([circuitLu('demo-1', { etape: 'controles', vivant: true })], [], {
      attenteVivante: false,
    });
    expect(filets(t)).toEqual([]);
  });
});

describe('a wait is alive when the lock names a process that lives', () => {
  const racineAvecVerrou = (contenu: string | null) => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
    if (contenu !== null) {
      writeFileSync(
        path.join(racine, '.claude', 'worktrees', 'attente-des-questions.lock'),
        contenu
      );
    }
    return racine;
  };

  it('a lock that names a living process: alive', () => {
    expect(attenteVivante(racineAvecVerrou(`${process.pid}\n`))).toBe(true);
  });

  it('a lock left by a dead process: not alive', () => {
    const mort = spawnSync(process.execPath, ['-e', '0']).pid;
    expect(attenteVivante(racineAvecVerrou(`${mort}\n`))).toBe(false);
  });

  it('no lock: not alive', () => {
    expect(attenteVivante(racineAvecVerrou(null))).toBe(false);
  });
});
