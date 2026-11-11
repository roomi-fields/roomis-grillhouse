// @poste: l'enveloppe bwrap, un serveur Temporal
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { lire, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the steps it leads
// itself, with no agent (the proof, the checks, the final pass, the integration and the queue),
// each written to the register at its end, as a session's line (role `circuit`, its ticket, its
// start, end and working time, no tokens), so the board counts them in the ticket's working time
// (BPScript si61.8: 33 min of 47 counted nowhere). The step under way names its start in the
// state (`mene`), which the test reads from the server while the circuit runs.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { REPO, ticket, scenario, circuitJusquALaFin, travailleurAvec, journal, etat } =
  circuitEssai(ESSAIS);
// The register of the trial, which the acts of the worker write.
const REGISTRE = path.join(ESSAIS, 'registre.jsonl');
if (canWrap) {
  beforeAll(() => travailleurAvec({ GRILLHOUSE_REGISTRE: REGISTRE }), 120_000);
}
const attendre = (ms: number) => new Promise(ok => setTimeout(ok, ms));

interface Ligne {
  projet: string;
  agent: string;
  ticket: string;
  role: string;
  etape: string;
  debut: string;
  fin: string;
  travail: number;
  tours: [number, number][];
  jetons: number;
}

describe.runIf(canWrap)('the steps the circuit leads itself', { timeout: 300_000 }, () => {
  it('writes a register line for each: the proof, the checks, the integration and the queue', async () => {
    const id = 'demo-registre';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The start of the proof its state names while it plays, read from the server until the end.
    let fini = false;
    const fin = circuitJusquALaFin([id]).fin.then(c => {
      fini = true;
      return c;
    });
    let menee: string | null | undefined;
    while (!fini) {
      const e = etat(id) as { etape?: string; mene?: string | null } | null;
      if (e?.etape === 'preuve' && menee === undefined) {
        menee = e.mene ?? null;
      }
      await attendre(200);
    }
    expect(await fin, journal(id).slice(-4000)).toBe(0);
    const lignes = lire(REGISTRE)
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as Ligne);
    const duCircuit = lignes.filter(l => l.role === 'circuit');
    // The checks of the plan, then the final pass: two steps `controles`, each one for the ticket.
    expect(duCircuit.map(l => l.etape)).toEqual([
      'preuve',
      'controles',
      'controles',
      'integration',
      'file',
    ]);
    const agents = new Set<string>();
    for (const l of duCircuit) {
      const debut = Date.parse(l.debut);
      const fin = Date.parse(l.fin);
      expect(l).toMatchObject({
        projet: REPO,
        ticket: id,
        jetons: 0,
        travail: fin - debut,
        tours: [[debut, fin]],
      });
      expect(fin).toBeGreaterThanOrEqual(debut);
      expect(l).not.toHaveProperty('composant');
      agents.add(l.agent);
    }
    // One line per step: the board keeps an agent's latest line.
    expect(agents.size).toBe(duCircuit.length);
    // The steps follow one another: each starts after the one before it ended.
    for (let i = 1; i < duCircuit.length; i++) {
      expect(Date.parse(duCircuit[i].debut)).toBeGreaterThanOrEqual(
        Date.parse(duCircuit[i - 1].fin)
      );
    }
    // During the proof, its state names the start of the step it leads.
    expect(menee).toBe(duCircuit[0].debut);
    // At its end, no step under way.
    expect(etat(id)).toMatchObject({ etape: 'integre', mene: null });
  });
});
