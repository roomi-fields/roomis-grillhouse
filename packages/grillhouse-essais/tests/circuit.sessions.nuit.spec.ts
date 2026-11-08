import { appendFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import {
  sortie,
  ARRETS,
  CODE_JUSTE,
  ECRIT_ROUGE,
  TA_TACHE,
  LANCE,
  circuitEssai,
} from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the sessions of the
// agents, relaunched, stopped (« controles », « sans-livraison », « sans-fiche », « bloqué »)
// and resumed.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  BEADS,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  circuitJusquALaFin,
  travailleurAvec,
  lancer,
  essai,
  sessions,
  args,
  etat,
  ordre,
  commentaires,
  historique,
  entrees,
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
        const a = args(id, 'developpeur', n);
        expect(a[a.indexOf('--model') + 1]).toBe('sonnet');
        expect(a).not.toContain('--effort');
      }
      const fort = args(id, 'developpeur', 3);
      expect(fort[fort.indexOf('--model') + 1]).toBe('opus');
      expect(fort).not.toContain('--effort');
      const testwriter = args(id, 'testwriter', 1);
      expect(testwriter[testwriter.indexOf('--model') + 1]).toBe('sonnet');
      expect(testwriter).not.toContain('--effort');
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
        `${TA_TACHE}Le superviseur a tranché : le double.`
      );
      const quatrieme = args(id, 'developpeur', 4);
      expect(quatrieme[quatrieme.indexOf('--model') + 1]).toBe('sonnet');
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
fiche '{"statut":"BLOQUÉ","piece":"packages/forms/src/index.mjs:1","raison":"le test attend un autre type.","renvoi":{"role":"testwriter"}}'
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
      // kgx.1 critère 2: no checks ran since the testwriter's session, none is carried.
      expect(essai(id, 'testwriter-2.prompt')).not.toContain(
        'La sortie rouge des derniers contrôles'
      );
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

    // A session that changes a file of forms, never the code the test waits for: red checks.
    const essaiRouge = `printf '// essai\\n' >> $c/src/index.mjs\npassation 'Un essai.'\n`;

    // grillhouse-kgx.1 (BP 320.37): a first sending before any check, then a second after checks
    // that named the guard's line word for word; the second stopped at « deuxième renvoi de suite »,
    // and the testwriter never received the line.
    it('kgx.1 critères 2 et 3 — a sending after red checks, the one before without any, relaunches the testwriter with their output', () => {
      const id = 'demo-renvoi-controles';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', renvoi);
      scenario(id, 'developpeur-2', essaiRouge);
      scenario(id, 'developpeur-3', renvoi);
      scenario(id, 'developpeur-4', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual([
        'testwriter',
        'developpeur',
        'testwriter',
        'developpeur',
        'developpeur',
        'testwriter',
        'developpeur',
        'relecteur',
      ]);
      // The first sending, before any check, carries none.
      expect(essai(id, 'testwriter-2.prompt')).not.toContain(
        'La sortie rouge des derniers contrôles'
      );
      const prompt = essai(id, 'testwriter-3.prompt');
      expect(prompt).toContain('Le rouge qui reste est dans les tests de forms');
      expect(prompt).toContain('La sortie rouge des derniers contrôles');
      // The red the checks named: the test and what it misses.
      expect(prompt).toContain('critère 1 — mesure rend le double');
    });

    it('kgx.1 critère 3 — the same red output of the checks on two sendings in a row stops at « sans-livraison »', () => {
      const id = 'demo-renvoi-meme-sortie';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', essaiRouge);
      scenario(id, 'developpeur-2', renvoi);
      scenario(id, 'developpeur-3', essaiRouge);
      scenario(id, 'developpeur-4', renvoi);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
      expect(sessions(id, 'testwriter')).toBe(2);
      expect(sessions(id, 'developpeur')).toBe(4);
      const e = etat(id);
      expect(e).toMatchObject({ etape: 'developpeur', raison: 'sans-livraison' });
      expect(e?.rapport).toContain('deuxième fois de suite au testwriter');
      expect(e?.rapport).toContain('même sortie rouge des contrôles');
    });

    // grillhouse-kgx.1: the output lived in the run alone; a resumption lost it. `--depuis` carries
    // the task of the agents of the lot, its `--contexte`.
    for (const reprise of [
      ['--reprendre'],
      ['--depuis', 'developpeur', '--contexte', 'Corrige le lot.'],
    ]) {
      it(`kgx.1 critère 4 — the red output of the last checks, written in the state, survives ${reprise[0]}`, () => {
        const id = `demo-renvoi-reprise${reprise[0].replace(/^--/, '-')}`;
        ticket(id, '000-forms');
        scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
        scenario(id, 'developpeur-1', essaiRouge);
        // Nothing to deliver, the checks red: the stop at « sans-livraison », at 3 Code.
        scenario(id, 'developpeur-2', "passation 'Rien de plus.'\n");
        const r1 = circuit([id]);
        expect(r1.status, sortie(r1)).toBe(ARRETS['sans-livraison']);
        expect(etat(id)).toMatchObject({ etape: 'developpeur', raison: 'sans-livraison' });
        const garde = etat(id) as unknown as { controlesRouges: string | null } | null;
        expect(garde?.controlesRouges).toContain('critère 1 — mesure rend le double');
        scenario(id, 'developpeur-3', renvoi);
        scenario(id, 'developpeur-4', `${CODE_JUSTE}passation 'Code écrit.'\n`);
        const r2 = circuit([id, ...reprise]);
        expect(r2.status, sortie(r2)).toBe(0);
        const prompt = essai(id, 'testwriter-2.prompt');
        expect(prompt).toContain('La sortie rouge des derniers contrôles');
        expect(prompt).toContain('critère 1 — mesure rend le double');
      });
    }

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
      // grillhouse-982.3: each session changed a file of the plan, which the bilan keeps as work.
      expect(entrees(id).filter(x => x.inchange)).toEqual([]);
    });

    // grillhouse-982.3: the bilan counts a developpeur without effect on what the circuit measures,
    // his session changing no file of the plan (`inchange`), whatever stop follows him.
    it('keeps that the developpeur changed nothing when it stops at « sans-livraison » on his second sending', () => {
      const id = 'demo-renvoi-inchange';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', renvoi);
      scenario(id, 'developpeur-2', renvoi.split('\n').slice(1).join('\n'));
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
      expect(entrees(id).filter(x => x.inchange)).toEqual([
        expect.objectContaining({ role: 'circuit', etape: 'developpeur', inchange: true }),
      ]);
    });

    // grillhouse-ybq.3 (BP 320.8): --etendre 990-corpus relaunched the developpeur, who stopped
    // again in 17 s, and not the testwriter his sending named.
    it('ybq.3 critère 3 — after a stop on a sending to the testwriter, --etendre relaunches the testwriter, the sending as his report', () => {
      const id = 'demo-renvoi-etendre';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', renvoi);
      const r1 = circuit([id]);
      expect(r1.status, sortie(r1)).toBe(ARRETS['sans-livraison']);
      scenario(id, 'developpeur-3', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r2 = circuit([id, '--etendre', '030-binder']);
      expect(r2.status, sortie(r2)).toBe(0);
      expect(ordre(id)).toEqual([
        'testwriter',
        'developpeur',
        'testwriter',
        'developpeur',
        'testwriter',
        'developpeur',
        'relecteur',
      ]);
      expect(essai(id, 'testwriter-3.prompt')).toContain('deuxième fois de suite au testwriter');
      expect(essai(id, 'testwriter-3.paquets')).toBe(
        ['packages/forms', 'packages/binder'].join(path.delimiter)
      );
      expect(etat(id)?.etape).toBe('integre');
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

  it('stops a session whose transcript stands still past the delay, at « bloqué »', async () => {
    const id = 'demo-bloque';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}echo 'le testwriter réfléchit'\nsleep 301\n`);
    const debut = Date.now();
    // A delay well past what the session's preparation takes on a loaded machine, well short of
    // the session's own sleep.
    await travailleurAvec({ GRILLHOUSE_CIRCUIT_IMMOBILE_MS: '15000' });
    const r = await (async () => {
      try {
        return circuit([id]);
      } finally {
        await travailleurAvec({});
      }
    })();
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

const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  // grillhouse-ybq.4, critère 2. Witness: BPScript 320.8 (17:10:43), the circuit, a background
  // command of the supervisor's session, died with it (« Background shell command didn't finish
  // before the previous session ended »), and was resumed by hand. Its workflow runs in the worker
  // of the project: the command gives the hand back at once, and nothing of the run lives in it.
  // The death of the worker itself: tests/circuit.temporal.nuit.spec.ts.
  it('`npx grillhouse circuit` gives the hand back at once, and the circuit goes on to its end without it', () => {
    const id = 'demo-appelant-mort';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}sleep 4\npassation 'Tests écrits.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.stdout, sortie(r)).toMatch(LANCE);
    expect(r.status, sortie(r)).toBe(0);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
  });

  it('refuses a second run of the ticket while its circuit runs, the first going on', async () => {
    const id = 'demo-deux-circuits';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}sleep 4\npassation 'Tests écrits.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const { fin } = circuitJusquALaFin([id]);
    for (let i = 0; i < 600 && sessions(id, 'testwriter') < 1; i++) {
      await attendre(100);
    }
    const r = lancer([id]);
    expect(r.status, sortie(r)).toBe(2);
    expect(r.stderr).toContain(`un circuit tourne déjà sur ${id}`);
    expect(await fin).toBe(0);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    expect(sessions(id, 'testwriter')).toBe(1);
  });
});
