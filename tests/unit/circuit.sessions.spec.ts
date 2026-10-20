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
    it("--reprendre starts again at the step and component of the state, with the regulateur's context", () => {
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id, '--reprendre', '--contexte', 'Le regulateur a tranché : le double.']);
      expect(r.status, sortie(r)).toBe(0);
      expect(sessions(id, 'testeur')).toBe(1);
      expect(sessions(id, 'developpeur')).toBe(4);
      expect(essai(id, 'developpeur-4.prompt')).toContain(
        'CONTEXTE : Le regulateur a tranché : le double.'
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
    const arret = commentaires(id)
      .filter(t => t.includes(' : arrêt '))
      .pop();
    expect(arret).toContain('sans-livraison');
    expect(arret).toContain('packages/forms');
  });

  describe('a developpeur whose sheet sends the red to `testeur <composant>`', () => {
    // A red left in the tests of forms: his sheet sends it to forms' testeur.
    const renvoi = `printf '// essai\\n' >> $c/src/index.mjs
passation 'Le rouge qui reste est dans les tests de forms : le test attend un autre type.'
fiche '{"statut":"BLOQUÉ","raison":"le test attend un autre type.","renvoi":{"role":"testeur","composant":"000-forms"}}'
`;
    it('plays that component again from its testeur, without relaunching the developpeur nor a regulateur', () => {
      const id = 'demo-renvoi-testeur';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', renvoi);
      scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual([
        'testeur packages/forms',
        'developpeur packages/forms',
        'testeur packages/forms',
        'developpeur packages/forms',
        'relecteur',
      ]);
      // The testeur receives the developpeur's handover as its report.
      expect(essai(id, 'testeur-2.prompt')).toContain(
        'Le rouge qui reste est dans les tests de forms'
      );
      expect(essai(id, 'testeur-2.prompt')).toContain('REPRISE : oui');
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /^Circuit · packages\/forms · developpeur : .*testeur packages\/forms/
        )
      );
      expect(historique(id).slice(0, 5)).toEqual([
        ['packages/forms', 'testeur'],
        ['packages/forms', 'preuve'],
        ['packages/forms', 'developpeur'],
        ['packages/forms', 'testeur'],
        ['packages/forms', 'preuve'],
      ]);
      expect(etat(id)?.etape).toBe('integre');
    });

    it('then plays in full the components after it that the circuit has not reached yet', () => {
      const id = 'demo-renvoi-neufs';
      ticket(id, '000-forms, 030-binder');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', renvoi);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual([
        'testeur packages/forms',
        'developpeur packages/forms',
        'testeur packages/forms',
        'developpeur packages/forms',
        'testeur packages/binder',
        'developpeur packages/binder',
        'relecteur',
      ]);
    });

    it('stops at « sans-livraison » on the same renvoi twice in a row, without green checks between', () => {
      const id = 'demo-renvoi-repete';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', renvoi);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
      expect(sessions(id, 'testeur')).toBe(2);
      expect(sessions(id, 'developpeur')).toBe(2);
      const e = etat(id);
      expect(e).toMatchObject({
        etape: 'developpeur',
        composant: 'packages/forms',
        raison: 'sans-livraison',
        code: ARRETS['sans-livraison'],
      });
      expect(e?.rapport).toContain('testeur packages/forms');
    });
  });

  it('sends a resumed developpeur that changes nothing of a delivered component to the checks', () => {
    const id = 'demo-reprise-livree';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    // The code is written, the sheet never, even resumed: the circuit stops at « sans-fiche ».
    scenario(id, 'developpeur-1', `${CODE_JUSTE}sans_fiche\n`);
    scenario(id, 'developpeur-2', 'sans_fiche\n');
    const r1 = circuit([id]);
    expect(r1.status, sortie(r1)).toBe(ARRETS['sans-fiche']);
    // The resumed developpeur finds its lot delivered and changes nothing.
    scenario(id, 'developpeur-3', "passation 'Le lot est complet.'\n");
    const r2 = circuit([id, '--reprendre']);
    expect(r2.status, sortie(r2)).toBe(0);
    expect(historique(id)).toContainEqual(['packages/forms', 'controles']);
  });

  it('resumes a session without a sheet once, then stops at « sans-fiche »', () => {
    const id = 'demo-passation';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}sans_fiche\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-fiche']);
    expect(sessions(id, 'testeur')).toBe(2);
    expect(etat(id)).toMatchObject({ etape: 'testeur', raison: 'sans-fiche' });
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
