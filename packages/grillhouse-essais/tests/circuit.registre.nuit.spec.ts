import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { lire, sortie, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the steps it leads
// itself, with no agent (the proof, the checks, the final pass, the integration and the queue),
// each written to the register at its end, as a session's line (role `circuit`, its ticket, its
// start, end and working time, no tokens), so the board counts them in the ticket's working time
// (BPScript si61.8: 33 min of 47 counted nowhere). The step under way names its start in the
// state (`mene`).
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { REPO, ticket, scenario, circuit, essai, etat } = circuitEssai(ESSAIS);

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

// The test the testwriter writes, red until the developpeur's code: each time it loads (the proof,
// the checks, the final pass), it copies the state of its circuit to the trial's folder of the
// ticket, so the test reads the state during a step the circuit leads.
const ROUGE_QUI_LIT_L_ETAT = `${ECRIT_ROUGE}cat >> $c/test/mesure.test.mjs <<'EOF'
import { appendFileSync, readFileSync } from 'node:fs';
const copie = new URL('../../../', import.meta.url).pathname.replace(/\\/$/, '');
const ticket = copie.split('/').pop();
const etat = readFileSync(copie + '.circuit.json', 'utf8');
appendFileSync(copie + '/../../../.beads/essai/' + ticket + '/etats', JSON.stringify(JSON.parse(etat)) + '\\n');
EOF
`;

describe.runIf(canWrap)('the steps the circuit leads itself', { timeout: 300_000 }, () => {
  it('writes a register line for each: the proof, the checks, the integration and the queue', () => {
    const id = 'demo-registre';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ROUGE_QUI_LIT_L_ETAT}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const registre = path.join(ESSAIS, 'registre.jsonl');
    const r = circuit([id], { GRILLHOUSE_REGISTRE: registre });
    expect(r.status, sortie(r)).toBe(0);
    const lignes = lire(registre)
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
    const etats = essai(id, 'etats')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { etape: string; mene: string | null });
    const preuve = etats.find(e => e.etape === 'preuve');
    expect(preuve?.mene).toBe(duCircuit[0].debut);
    // At its end, no step under way.
    expect(etat(id)).toMatchObject({ etape: 'integre', mene: null });
  });
});
