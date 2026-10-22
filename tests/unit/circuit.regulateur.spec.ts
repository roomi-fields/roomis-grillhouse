import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the regulator
// on a stop (grillhouse-3uv.85). On a stop other than 0 and 75, the circuit launches a session of
// the regulator itself, out of the envelope, in the ticket's copy; the regulator's sheet is its
// decision, which the circuit writes at the ticket and applies: RELANCE starts the circuit again
// in the same process, MONTE ends it on the stop « question », the regulator's session kept in the
// state, which `--reponse "<texte>"` resumes with the supervisor's answer.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  REPO,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  args,
  etat,
  ordre,
  commandes,
  commentaires,
} = circuitEssai(ESSAIS);

const REGULATEUR = 'regulateur';
// A developpeur session that changes no file: the circuit stops at « sans-livraison ».
const RIEN = "passation 'Rien à écrire.'\n";
// A regulator's scenario: it keeps the state of the circuit as its session sees it, then ends on
// the sheet <decision>, or on none.
const regulateur = (decision: Record<string, unknown> | null) =>
  `cp "$racine/.claude/worktrees/$ticket.circuit.json" "$e/etat-regulateur-$n.json"\n${
    decision ? `fiche '${JSON.stringify(decision)}'` : 'sans_fiche'
  }\n`;
const reprendre = (contexte: string) => ({ decision: 'RELANCE --reprendre', contexte });
const etatVuParLeRegulateur = (id: string, n: number) =>
  JSON.parse(essai(id, `etat-regulateur-${n}.json`) || 'null') as {
    code: number | null;
    raison: string | null;
    regulateur: { seance: string } | null;
    boucles: Record<string, number> | null;
  } | null;
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe.runIf(canWrap)('the régulateur, a session of the circuit', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('critères 1, 2 et 3 — on a stop, the circuit launches the regulateur and applies its RELANCE --reprendre, CONTEXTE as --contexte, in the same process', () => {
    const id = 'demo-regulateur-reprendre';
    const copie = ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, REGULATEUR, regulateur(reprendre('Écris le double.')));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // Critère 1: one session of the regulator, out of the envelope, between the stop and the relaunch.
    expect(ordre(id)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      REGULATEUR,
      'developpeur packages/forms',
      'relecteur',
    ]);
    expect(essai(id, `${REGULATEUR}-1.pwd`).trim()).toBe(copie);
    const a = args(id, REGULATEUR, 1);
    expect(a.slice(0, 3)).toEqual(['-p', '--agent', REGULATEUR]);
    expect(valeur(a, '--model')).toBe('sonnet');
    expect(valeur(a, '--permission-mode')).toBe('dontAsk');
    expect(valeur(a, '--session-id')).toMatch(UUID);
    expect(a).toContain('--add-dir');
    const e = etat(id);
    // Its rights are the commands its skill names (scripts/droits.mjs, tests/unit/droits.spec.ts),
    // the summary of the circuit's state by its command, and the reads of the ticket's log and its
    // proofs (grillhouse-3uv.92.7).
    const { allow, deny } = (
      JSON.parse(valeur(a, '--settings')) as { permissions: { allow: string[]; deny: string[] } }
    ).permissions;
    for (const regle of [
      'Bash(bd comments *)',
      'Bash(bd search *)',
      'Bash(node scripts/etat-du-circuit.mjs *)',
      `Read(/${e?.journal})`,
    ]) {
      expect(allow).toContain(regle);
    }
    expect(allow).not.toContain(
      `Read(/${path.join(REPO, '.claude/worktrees', `${id}.circuit.json`)})`
    );
    // No right to write the code, nor to run the circuit or the tests: its tools write nothing; its
    // one script reads the state.
    expect(
      allow.filter(
        x => /^(Write|Edit)|node scripts|npm /.test(x) && !x.includes('etat-du-circuit.mjs')
      )
    ).toEqual([]);
    expect(
      valeur(a, '--tools')
        .split(',')
        .filter(o => /Edit|Write/.test(o))
    ).toEqual([]);
    // Its comments carry its role as their author, which it may not change.
    expect(essai(id, `${REGULATEUR}-1.acteur`)).toBe(REGULATEUR);
    const refus = deny;
    for (const regle of [
      'Bash(bd *--actor*)',
      'Bash(bd *--author*)',
      'Bash(bd * -a*)',
      'Bash(*BEADS_ACTOR*)',
    ]) {
      expect(refus).toContain(regle);
    }
    // Its instruction: the ticket, the stop's name and code, its step, component and reason, and
    // the paths of the state and the log.
    const consigne = essai(id, `${REGULATEUR}-1.prompt`);
    expect(consigne).toContain(`TON TICKET : ${id} — La mesure`);
    expect(consigne).toContain('sans-livraison');
    expect(consigne).toContain(`code ${ARRETS['sans-livraison']}`);
    expect(consigne).toContain("l'étape 2.3 Code du composant packages/forms");
    expect(consigne).toContain('packages/forms');
    expect(consigne).toContain('ne change aucun fichier de packages/forms');
    expect(consigne).toContain(path.join(REPO, '.claude/worktrees', `${id}.circuit.json`));
    expect(consigne).toContain(e?.journal);
    // While the regulator runs, the state holds the stop and the regulator's session.
    const vu = etatVuParLeRegulateur(id, 1);
    expect(vu).toMatchObject({ code: ARRETS['sans-livraison'], raison: 'sans-livraison' });
    expect(vu?.regulateur?.seance).toBe(valeur(a, '--session-id'));
    // The first pass of this stop at the arbitrage: the counter of its loop.
    expect(vu?.boucles).toEqual({ arret: 1 });
    // Critère 2: the decision at the ticket.
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(/^Circuit · packages\/forms · regulateur : RELANCE --reprendre/)
    );
    expect(commentaires(id).find(t => t.includes(' · regulateur : '))).toContain(
      'Écris le double.'
    );
    // Critère 3: the developpeur resumed with the context, and the circuit goes on to its end.
    expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : Écris le double.');
    expect(e).toMatchObject({ etape: 'integre', code: 0, regulateur: null });
  });

  it('critère 3 — RELANCE --depuis <étape> <composant> plays that component again from that step, the context on its line CONTEXTE', () => {
    const id = 'demo-regulateur-depuis';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      REGULATEUR,
      regulateur({
        decision: 'RELANCE --depuis',
        depuis: [
          { role: 'developpeur', composant: '000-forms', contexte: 'La mesure rend le double.' },
        ],
      })
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, REGULATEUR)).toBe(1);
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(sessions(id, 'developpeur')).toBe(2);
    expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : La mesure rend le double.');
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^Circuit · packages\/forms · regulateur : RELANCE --depuis developpeur/
      )
    );
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  // grillhouse-3uv.92.2, witness BPScript 320.4 (n° 11, 20 min): the red of the ceiling of 040,
  // visible from the first final pass, was relaunched only after the third, the regulator's sheet
  // carrying a single `depuis`; as GitLab's « Retry failed jobs », one decision relaunches each.
  it('critères 1 et 2 — one RELANCE --depuis relaunches several components, each from its step with its context, in the order of the title, then one final pass', () => {
    const id = 'demo-regulateur-depuis-plusieurs';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The sheet names binder before forms: the circuit plays them in the order of the title.
    scenario(
      id,
      REGULATEUR,
      regulateur({
        decision: 'RELANCE --depuis',
        depuis: [
          { role: 'testwriter', composant: '030-binder', contexte: 'Le classeur rend le double.' },
          { role: 'developpeur', composant: '000-forms', contexte: 'La mesure rend le double.' },
        ],
      })
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      REGULATEUR,
      'developpeur packages/forms',
      'testwriter packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    // Each agent of a component relaunched has its own context, and only its own.
    expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : La mesure rend le double.');
    expect(essai(id, 'developpeur-2.prompt')).not.toContain('Le classeur rend le double.');
    for (const f of ['testwriter-2.prompt', 'developpeur-3.prompt']) {
      expect(essai(id, f)).toContain('CONTEXTE : Le classeur rend le double.');
      expect(essai(id, f)).not.toContain('La mesure rend le double.');
    }
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^Circuit · packages\/forms · regulateur : RELANCE --depuis developpeur packages\/forms, testwriter packages\/binder/
      )
    );
    // One final pass, after both.
    expect(commandes(id).filter(c => /npm run verifier/.test(c))).toHaveLength(1);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('critère 3 — the admission judges each component of the decision: one out of the title, or a developpeur before his testwriter, refuses it whole', () => {
    const id = 'demo-regulateur-depuis-admission';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', RIEN);
    const forms = { role: 'developpeur', composant: '000-forms', contexte: 'Le double.' };
    scenario(
      id,
      `${REGULATEUR}-1`,
      regulateur({
        decision: 'RELANCE --depuis',
        depuis: [forms, { role: 'testwriter', composant: '999-absent', contexte: 'Le double.' }],
      })
    );
    scenario(
      id,
      `${REGULATEUR}-2`,
      regulateur({
        decision: 'RELANCE --depuis',
        depuis: [forms, { role: 'developpeur', composant: '030-binder', contexte: 'Le double.' }],
      })
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, REGULATEUR)).toBe(2);
    expect(sessions(id, 'developpeur')).toBe(1);
    const refus = commentaires(id).filter(t => / · regulateur : décision refusée — /.test(t));
    expect(refus).toHaveLength(2);
    expect(refus[0]).toContain('999-absent');
    expect(refus[1]).toContain('developpeur packages/binder');
    expect(refus[1]).toContain('testwriter');
  });

  describe('critères 4 et 5 — MONTE ends on « question », --reponse resumes the same session', () => {
    const id = 'demo-regulateur-question';

    it('critère 4 — MONTE ends the circuit on the code question, the question in its reason and at the ticket, the session in the state', () => {
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', RIEN);
      scenario(
        id,
        `${REGULATEUR}-1`,
        regulateur({ decision: 'MONTE', question: 'La mesure rend-elle le double ou le triple ?' })
      );
      const r = circuit([id]);
      expect(ARRETS.question).toBeDefined();
      expect(r.status, sortie(r)).toBe(ARRETS.question);
      // The question goes to the supervisor, who answers it or carries it to the owner.
      expect(r.stderr).toContain('question du régulateur au superviseur');
      const e = etat(id);
      expect(e).toMatchObject({
        etape: 'developpeur',
        composant: 'packages/forms',
        code: ARRETS.question,
        raison: 'question',
      });
      expect(e?.rapport).toContain('La mesure rend-elle le double ou le triple ?');
      expect(e?.regulateur?.seance).toBe(valeur(args(id, REGULATEUR, 1), '--session-id'));
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /^Circuit · packages\/forms · regulateur : MONTE : La mesure rend-elle le double ou le triple \?/
        )
      );
      expect(sessions(id, 'developpeur')).toBe(1);
    });

    it("critère 5 — --reponse resumes the regulateur's session with the supervisor's answer and applies its decision", () => {
      const seance = etat(id)?.regulateur?.seance;
      scenario(id, `${REGULATEUR}-2`, regulateur(reprendre('Écris le double.')));
      scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id, '--reponse', 'Le double.']);
      expect(r.status, sortie(r)).toBe(0);
      const a = args(id, REGULATEUR, 2);
      expect(valeur(a, '--resume')).toBe(seance);
      expect(a).not.toContain('--session-id');
      expect(valeur(a, '--model')).toBe('sonnet');
      expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain('Le double.');
      expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain('LA RÉPONSE DU SUPERVISEUR');
      expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : Écris le double.');
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });
  });

  it('critère 5 — --reponse without a regulateur session kept in the state is refused (usage)', () => {
    const id = 'demo-regulateur-sans-seance';
    ticket(id, '000-forms');
    const r = circuit([id, '--reponse', 'Le double.']);
    expect(r.status, sortie(r)).toBe(2);
    expect(r.stderr).toMatch(/séance du régulateur/);
    expect(sessions(id, REGULATEUR)).toBe(0);
  });

  it('critère 2 — the decision of its sheet is what the circuit writes at the ticket, its context with it, its answer in words left out', () => {
    const id = 'demo-regulateur-raisonnement';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      REGULATEUR,
      `echo 'Le développeur ne change rien. MONTE : rien de tel.'\n${regulateur(reprendre('Écris le double.'))}`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const decision = commentaires(id).find(t => t.includes(' · regulateur : '));
    expect(decision).toBe(
      'Circuit · packages/forms · regulateur : RELANCE --reprendre\nCONTEXTE : Écris le double.'
    );
    expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : Écris le double.');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it("a session without a sheet resumes the regulateur's session once, asking for its sheet, whose decision the circuit applies", () => {
    const id = 'demo-regulateur-redemande';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, `${REGULATEUR}-1`, regulateur(null));
    scenario(id, `${REGULATEUR}-2`, regulateur(reprendre('Écris le double.')));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, REGULATEUR)).toBe(2);
    expect(valeur(args(id, REGULATEUR, 2), '--resume')).toBe(
      valeur(args(id, REGULATEUR, 1), '--session-id')
    );
    expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain('sans fiche conforme');
    expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : Écris le double.');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it("critère 6 — twice no sheet, or a regulateur's session twice in error, ends on the original stop, why joined to its reason", () => {
    const id = 'demo-regulateur-illisible';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', RIEN);
    scenario(id, `${REGULATEUR}-1`, regulateur(null));
    scenario(id, `${REGULATEUR}-2`, regulateur(null));
    const r1 = circuit([id]);
    expect(r1.status, sortie(r1)).toBe(ARRETS['sans-livraison']);
    const e1 = etat(id);
    expect(e1).toMatchObject({ raison: 'sans-livraison', code: ARRETS['sans-livraison'] });
    expect(e1?.rapport).toContain('ne change aucun fichier de packages/forms');
    expect(e1?.rapport).toContain('LE RÉGULATEUR ne rend pas de décision');
    expect(e1?.rapport).toContain('structured_output');
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(sessions(id, REGULATEUR)).toBe(2);
    // A session that ends in error, resumed once, in error again: the same original stop; its
    // sheet does not count.
    scenario(id, REGULATEUR, `${regulateur(reprendre('Le double.'))}exit 3\n`);
    const r2 = circuit([id, '--depuis', 'developpeur', '000-forms', '--contexte', 'Le double.']);
    expect(r2.status, sortie(r2)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, REGULATEUR)).toBe(4);
    expect(sessions(id, 'developpeur')).toBe(2);
    expect(etat(id)?.rapport).toContain('code 3');
  });

  it('critère 7 — three RELANCE in a row on the same stop end the circuit on it, the three decisions in its reason, no fourth relaunch', () => {
    const id = 'demo-regulateur-trois';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', RIEN);
    // Each session leaves a trace in the copy, out of the component: the stop comes back, each
    // time on a copy that changed (the same stop with nothing new goes to the supervisor at once,
    // tests/unit/circuit.table-des-arrets.spec.ts).
    for (const n of [1, 2, 3]) {
      scenario(
        id,
        `${REGULATEUR}-${n}`,
        `touch note-${n}.txt\n` +
          regulateur({
            decision: 'RELANCE --depuis',
            depuis: [{ role: 'developpeur', composant: 'packages/forms', contexte: `essai ${n}.` }],
          })
      );
    }
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, REGULATEUR)).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(4);
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'developpeur',
      raison: 'sans-livraison',
      code: ARRETS['sans-livraison'],
    });
    for (const n of [1, 2, 3]) {
      expect(e?.rapport).toContain(`essai ${n}.`);
    }
    expect(
      readFileSync(path.join(REPO, '.claude/worktrees', `${id}.circuit.json`), 'utf8')
    ).toContain('RELANCE --depuis developpeur packages/forms');
  });
});
