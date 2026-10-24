import { spawn } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, CIRCUIT, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the sessions of the
// agents, relaunched, stopped (« controles », « sans-livraison », « sans-fiche », « bloqué »)
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
  ordre,
  commentaires,
  historique,
} = circuitEssai(ESSAIS);

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  describe('a red check, then a resumption', () => {
    const id = 'demo-controles';
    it('relaunches the developpeur, the third time on the strong model, then stops at « controles »', () => {
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
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
        raison: 'controles',
        code: ARRETS.controles,
        finale: false,
      });
      expect(historique(id).at(-1)).toBe('controles');
    });
    it("--reprendre starts again at the step of the state, with the supervisor's context", () => {
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id, '--reprendre', '--contexte', 'Le superviseur a tranché : le double.']);
      expect(r.status, sortie(r)).toBe(0);
      expect(sessions(id, 'testwriter')).toBe(1);
      expect(sessions(id, 'developpeur')).toBe(4);
      expect(essai(id, 'developpeur-4.prompt')).toContain(
        'CONTEXTE : Le superviseur a tranché : le double.'
      );
      expect(args(id, 'developpeur', 4)).not.toContain('--model');
      expect(etat(id)?.etape).toBe('integre');
    });
  });

  it('stops at « sans-livraison » after a developpeur session that changes no file of the plan', () => {
    const id = 'demo-sans-livraison';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // Its handover says it delivered; only the files of the plan count.
    scenario(id, 'developpeur', "passation 'Code écrit.'\n");
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(sessions(id, 'testwriter')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'developpeur',
      raison: 'sans-livraison',
      code: ARRETS['sans-livraison'],
    });
    expect(e?.rapport).toContain('packages/forms, packages/binder');
    expect(e?.rapport).toContain('passation');
    expect(historique(id).at(-1)).toBe('developpeur');
    const arret = commentaires(id)
      .filter(t => t.includes(' : arrêt '))
      .pop();
    expect(arret).toContain('sans-livraison');
    expect(arret).toContain('packages/forms');
  });

  describe('a developpeur whose sheet sends the red to the testwriter', () => {
    // A red left in the tests of the lot: his sheet sends it to the testwriter.
    const renvoi = `printf '// essai\\n' >> $c/src/index.mjs
passation 'Le rouge qui reste est dans les tests de forms : le test attend un autre type.'
fiche '{"statut":"BLOQUÉ","raison":"le test attend un autre type.","renvoi":{"role":"testwriter"}}'
`;
    it('relaunches the testwriter, then the proof and the developpeur, without relaunching the developpeur on that red, the gesture said', () => {
      const id = 'demo-renvoi-testwriter';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', renvoi);
      scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual([
        'testwriter',
        'developpeur',
        'testwriter',
        'developpeur',
        'relecteur',
      ]);
      // The testwriter receives the developpeur's handover as its report.
      expect(essai(id, 'testwriter-2.prompt')).toContain(
        'Le rouge qui reste est dans les tests de forms'
      );
      expect(essai(id, 'testwriter-2.prompt')).toContain('REPRISE : oui');
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(/^Circuit · developpeur : .*renvoie le rouge au testwriter/)
      );
      // The gesture and its rule, at the ticket (grillhouse-3uv.95.4).
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(/^Circuit · geste : renvoi-au-testwriter → .*\(règle : /)
      );
      expect(historique(id).slice(0, 5)).toEqual([
        'testwriter',
        'preuve',
        'developpeur',
        'testwriter',
        'preuve',
      ]);
      expect(etat(id)?.etape).toBe('integre');
    });

    it('stops at « sans-livraison » on the same renvoi twice in a row, without green checks between', () => {
      const id = 'demo-renvoi-repete';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', renvoi);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
      expect(sessions(id, 'testwriter')).toBe(2);
      expect(sessions(id, 'developpeur')).toBe(2);
      const e = etat(id);
      expect(e).toMatchObject({
        etape: 'developpeur',
        raison: 'sans-livraison',
        code: ARRETS['sans-livraison'],
      });
      expect(e?.rapport).toContain('deuxième fois de suite au testwriter');
    });
  });

  it('sends a resumed developpeur that changes nothing of a delivered plan to the checks', () => {
    const id = 'demo-reprise-livree';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    // The code is written, the sheet never, even resumed: the circuit stops at « sans-fiche ».
    scenario(id, 'developpeur-1', `${CODE_JUSTE}sans_fiche\n`);
    scenario(id, 'developpeur-2', 'sans_fiche\n');
    const r1 = circuit([id]);
    expect(r1.status, sortie(r1)).toBe(ARRETS['sans-fiche']);
    // The resumed developpeur finds its lot delivered and changes nothing.
    scenario(id, 'developpeur-3', "passation 'Le lot est complet.'\n");
    const r2 = circuit([id, '--reprendre']);
    expect(r2.status, sortie(r2)).toBe(0);
    expect(historique(id)).toContain('controles');
  });

  it('resumes a session without a sheet once, then stops at « sans-fiche »', () => {
    const id = 'demo-passation';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}sans_fiche\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-fiche']);
    expect(sessions(id, 'testwriter')).toBe(2);
    expect(etat(id)).toMatchObject({ etape: 'testwriter', raison: 'sans-fiche' });
  });

  it('reads the handover of a ticket whose comments pass 1 MiB', () => {
    const id = 'demo-passation-longue';
    ticket(id, '000-forms');
    // The comments of a long ticket, past the default output of a child process.
    appendFileSync(
      path.join(BEADS, `${id}.comments.jsonl`),
      `${JSON.stringify({ author: 'testwriter', text: 'x'.repeat(1_200_000) })}\n`
    );
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    const r = circuit([id]);
    expect(sessions(id, 'testwriter'), sortie(r)).toBe(1);
    expect(etat(id)).toMatchObject({ etape: 'developpeur' });
  });

  it('stops a session whose transcript stands still past the delay, at « bloqué »', () => {
    const id = 'demo-bloque';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}echo 'le testwriter réfléchit'\nsleep 301\n`);
    const debut = Date.now();
    // A delay well past what the session's preparation takes on a loaded machine, well short of
    // the session's own sleep.
    const r = circuit([id], { GRILLHOUSE_CIRCUIT_IMMOBILE_MS: '15000' });
    expect(r.status, sortie(r)).toBe(ARRETS['bloqué']);
    expect(Date.now() - debut).toBeLessThan(120_000);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'testwriter', raison: 'bloqué', code: ARRETS['bloqué'] });
    // The last lines of the log come with the stop.
    expect(e?.rapport).toContain('le testwriter réfléchit');
    expect(historique(id).at(-1)).toBe('testwriter');
    expect(
      commentaires(id)
        .filter(t => t.includes(' : arrêt '))
        .pop()
    ).toContain(e?.journal);
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
      'testwriter-1',
      `${ECRIT_ROUGE}sleep 8\npassation 'Tests écrits.'\ndate +%s%N > "$e/testwriter-1.fin"\n`
    );
    scenario(id, 'testwriter-2', `date +%s%N > "$e/testwriter-2.debut"\npassation 'Reprise.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The caller and the circuit share a group, which the caller's death takes down at once.
    const appelant = spawn('node', [CIRCUIT, id], {
      cwd: REPO,
      env: ENV,
      detached: true,
      stdio: 'ignore',
    });
    const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 600 && sessions(id, 'testwriter') < 1; i++) {
      await attendre(100);
    }
    await attendre(1_000);
    process.kill(-(appelant.pid as number), 'SIGKILL');
    const laisse = etat(id);
    expect(laisse).toMatchObject({ etape: 'testwriter', code: null });
    expect(typeof laisse?.seance).toBe('number');
    const r = circuit([id, '--reprendre']);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(2);
    expect(BigInt(essai(id, 'testwriter-2.debut').trim())).toBeGreaterThan(
      BigInt(essai(id, 'testwriter-1.fin').trim())
    );
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0, seance: null });
  });
});
