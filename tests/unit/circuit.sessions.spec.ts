import { spawn } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, CIRCUIT, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the sessions of the
// agents, relaunched, stopped (« controles », « sans-livraison », « sans-passation », « bloqué »)
// and resumed.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  REPO,
  BEADS,
  revenirAuDebut,
  ticket,
  scenario,
  ENV,
  circuit,
  essai,
  sessions,
  args,
  etat,
  commentaires,
  historique,
} = circuitEssai(ESSAIS);

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  describe('a red check, then a resumption', () => {
    const id = 'demo-controles';
    it('relaunches the developpeur, the third time on the strong model, then stops at « controles »', () => {
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
      // Each session changes a file of forms, never the code that the test waits for.
      scenario(
        id,
        'developpeur',
        `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\npassation 'Un essai.'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.controles);
      expect(sessions(id, 'developpeur')).toBe(3);
      for (const n of [1, 2]) {
        expect(args(id, 'developpeur', n)).not.toContain('--model');
      }
      const fort = args(id, 'developpeur', 3);
      expect(fort[fort.indexOf('--model') + 1]).toBe('opus');
      expect(fort[fort.indexOf('--effort') + 1]).toBe('high');
      // The relaunched developpeur receives the output of the red check.
      expect(essai(id, 'developpeur-2.prompt')).toContain('critère 1 — mesure rend le double');
      expect(etat(id)).toMatchObject({
        etape: 'controles',
        composant: 'packages/forms',
        raison: 'controles',
        code: ARRETS.controles,
      });
      expect(historique(id).at(-1)).toEqual(['packages/forms', 'controles']);
    });
    it("--reprendre starts again at the step and component of the state, with the chef's context", () => {
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id, '--reprendre', '--contexte', 'Le chef a tranché : le double.']);
      expect(r.status, sortie(r)).toBe(0);
      expect(sessions(id, 'testeur')).toBe(1);
      expect(sessions(id, 'developpeur')).toBe(4);
      expect(essai(id, 'developpeur-4.prompt')).toContain(
        'CONTEXTE : Le chef a tranché : le double.'
      );
      expect(args(id, 'developpeur', 4)).not.toContain('--model');
      expect(etat(id)?.etape).toBe('integre');
    });
  });

  it('stops at « sans-livraison » after a developpeur session that changes no file of its component', () => {
    const id = 'demo-sans-livraison';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // Its handover says it delivered; only the files of the component count.
    scenario(id, 'developpeur', "passation 'Code écrit.'\n");
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(sessions(id, 'testeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'developpeur',
      composant: 'packages/forms',
      raison: 'sans-livraison',
      code: ARRETS['sans-livraison'],
    });
    expect(e?.rapport).toContain('packages/forms');
    expect(e?.rapport).toContain('passation');
    expect(historique(id).at(-1)).toEqual(['packages/forms', 'developpeur']);
    expect(commentaires(id).at(-1)).toContain('sans-livraison');
    expect(commentaires(id).at(-1)).toContain('packages/forms');
  });

  it('relaunches a session without handover once, then stops at « sans-passation »', () => {
    const id = 'demo-passation';
    ticket(id, '000-forms');
    scenario(id, 'testeur', ECRIT_ROUGE);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-passation']);
    expect(sessions(id, 'testeur')).toBe(2);
    expect(etat(id)).toMatchObject({ etape: 'testeur', raison: 'sans-passation' });
  });

  it('reads the handover of a ticket whose comments pass 1 MiB', () => {
    const id = 'demo-passation-longue';
    ticket(id, '000-forms');
    // The comments of a long ticket, past the default output of a child process.
    appendFileSync(
      path.join(BEADS, `${id}.comments.jsonl`),
      `${JSON.stringify({ author: 'testeur', text: 'x'.repeat(1_200_000) })}\n`
    );
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    const r = circuit([id]);
    expect(sessions(id, 'testeur'), sortie(r)).toBe(1);
    expect(etat(id)).toMatchObject({ etape: 'developpeur' });
  });

  it('stops a session whose transcript stands still past the delay, at « bloqué »', () => {
    const id = 'demo-bloque';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}echo 'le testeur réfléchit'\nsleep 301\n`);
    const debut = Date.now();
    // A delay well past what the session's preparation takes on a loaded machine, well short of
    // the session's own sleep.
    const r = circuit([id], { GRILLHOUSE_CIRCUIT_IMMOBILE_MS: '15000' });
    expect(r.status, sortie(r)).toBe(ARRETS['bloqué']);
    expect(Date.now() - debut).toBeLessThan(120_000);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'testeur', raison: 'bloqué', code: ARRETS['bloqué'] });
    // The last lines of the log come with the stop.
    expect(e?.rapport).toContain('le testeur réfléchit');
    expect(historique(id).at(-1)).toEqual(['packages/forms', 'testeur']);
    expect(commentaires(id).at(-1)).toContain(e?.journal);
    // The session is gone with its launcher's group.
    const lignes = readdirSync('/proc')
      .filter(p => /^\d+$/.test(p))
      .map(p => {
        try {
          return readFileSync(`/proc/${p}/cmdline`, 'utf8').split('\0').join(' ');
        } catch {
          return '';
        }
      });
    expect(lignes.filter(l => l.startsWith('sleep 301'))).toEqual([]);
  });
});

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  it('resumes after the death of its caller, once the session it left has ended', async () => {
    const id = 'demo-mort';
    ticket(id, '000-forms');
    scenario(
      id,
      'testeur-1',
      `${ECRIT_ROUGE}sleep 8\npassation 'Tests écrits.'\ndate +%s%N > "$e/testeur-1.fin"\n`
    );
    scenario(id, 'testeur-2', `date +%s%N > "$e/testeur-2.debut"\npassation 'Reprise.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The caller and the circuit share a group, which the caller's death takes down at once.
    const appelant = spawn('node', [CIRCUIT, id], {
      cwd: REPO,
      env: ENV,
      detached: true,
      stdio: 'ignore',
    });
    const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 600 && sessions(id, 'testeur') < 1; i++) {
      await attendre(100);
    }
    await attendre(1_000);
    process.kill(-(appelant.pid as number), 'SIGKILL');
    const laisse = etat(id);
    expect(laisse).toMatchObject({ etape: 'testeur', composant: 'packages/forms', code: null });
    expect(typeof laisse?.seance).toBe('number');
    const r = circuit([id, '--reprendre']);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testeur')).toBe(2);
    expect(BigInt(essai(id, 'testeur-2.debut').trim())).toBeGreaterThan(
      BigInt(essai(id, 'testeur-1.fin').trim())
    );
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0, seance: null });
  });
});
