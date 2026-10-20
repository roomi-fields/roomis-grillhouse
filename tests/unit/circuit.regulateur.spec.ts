import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the regulator
// on a stop (grillhouse-3uv.85). On a stop other than 0 and 75, the circuit launches a session of
// the regulator itself, out of the envelope, in the ticket's copy; the regulator's final answer is its
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
  commentaires,
} = circuitEssai(ESSAIS);

const REGULATEUR = 'regulateur';
// A developpeur session that changes no file: the circuit stops at « sans-livraison ».
const RIEN = "passation 'Rien à écrire.'\n";
// A regulator's scenario: it keeps the state of the circuit as its session sees it, then answers.
const regulateur = (reponse: string) =>
  `cp "$racine/.claude/worktrees/$ticket.circuit.json" "$e/etat-regulateur-$n.json"\ndecision '${reponse}'\n`;
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
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, REGULATEUR, regulateur('RELANCE --reprendre\nCONTEXTE : Écris le double.'));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // Critère 1: one session of the regulator, out of the envelope, between the stop and the relaunch.
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
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
    for (const regle of [
      'Bash(bd show *)',
      'Bash(bd comments *)',
      'Bash(bd search *)',
      'Bash(bd update * -d *)',
      'Bash(git diff *)',
      'Bash(git log *)',
      'Bash(git show *)',
      'Bash(git status *)',
      'Bash(codegraph *)',
      'mcp__plugin_rtfm_rtfm__rtfm_search',
      'mcp__plugin_rtfm_rtfm__rtfm_expand',
      `Read(/${path.join(REPO, '.claude/worktrees', `${id}.circuit.json`)})`,
      `Read(/${e?.journal})`,
    ]) {
      expect(a).toContain(regle);
    }
    // No right to write the code, nor to run the circuit or the tests.
    expect(a.filter(x => /^(Write|Edit)|node scripts|npm /.test(x))).toEqual([]);
    // Its comments carry its role as their author, which it may not change.
    expect(essai(id, `${REGULATEUR}-1.acteur`)).toBe(REGULATEUR);
    const refus = a.slice(a.indexOf('--disallowedTools') + 1);
    expect(a).toContain('--disallowedTools');
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
    expect(consigne).toContain("l'étape 5 Code du composant packages/forms");
    expect(consigne).toContain('packages/forms');
    expect(consigne).toContain('ne change aucun fichier de packages/forms');
    expect(consigne).toContain(path.join(REPO, '.claude/worktrees', `${id}.circuit.json`));
    expect(consigne).toContain(e?.journal);
    // While the regulator runs, the state holds the stop and the regulator's session.
    const vu = etatVuParLeRegulateur(id, 1);
    expect(vu).toMatchObject({ code: ARRETS['sans-livraison'], raison: 'sans-livraison' });
    expect(vu?.regulateur?.seance).toBe(valeur(a, '--session-id'));
    // The first pass of this stop at the arbitrage, step 2: the counter of its loop.
    expect(vu?.boucles).toEqual({ 2: 1 });
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

  it('critère 3 — RELANCE --depuis <étape> <composant> plays that component again from that step, the context as its report', () => {
    const id = 'demo-regulateur-depuis';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      REGULATEUR,
      regulateur('RELANCE --depuis developpeur 000-forms\nCONTEXTE : La mesure rend le double.')
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, REGULATEUR)).toBe(1);
    expect(sessions(id, 'testeur')).toBe(1);
    expect(sessions(id, 'developpeur')).toBe(2);
    expect(essai(id, 'developpeur-2.prompt')).toContain('La mesure rend le double.');
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^Circuit · packages\/forms · regulateur : RELANCE --depuis developpeur/
      )
    );
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  describe('critères 4 et 5 — MONTE ends on « question », --reponse resumes the same session', () => {
    const id = 'demo-regulateur-question';

    it('critère 4 — MONTE ends the circuit on the code question, the question in its reason and at the ticket, the session in the state', () => {
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', RIEN);
      scenario(
        id,
        `${REGULATEUR}-1`,
        regulateur('MONTE : La mesure rend-elle le double ou le triple ?')
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
      scenario(
        id,
        `${REGULATEUR}-2`,
        regulateur('RELANCE --reprendre\nCONTEXTE : Le responsable dit : le double.')
      );
      scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id, '--reponse', 'Le double.']);
      expect(r.status, sortie(r)).toBe(0);
      const a = args(id, REGULATEUR, 2);
      expect(valeur(a, '--resume')).toBe(seance);
      expect(a).not.toContain('--session-id');
      expect(valeur(a, '--model')).toBe('sonnet');
      expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain('Le double.');
      expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain('LA RÉPONSE DU SUPERVISEUR');
      expect(essai(id, 'developpeur-2.prompt')).toContain(
        'CONTEXTE : Le responsable dit : le double.'
      );
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

  it("critère 2 — a decision after the regulateur's reasoning is its decision, the reasoning left out", () => {
    const id = 'demo-regulateur-raisonnement';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      REGULATEUR,
      regulateur(
        'Le développeur ne change rien.\n\nLa mesure rend la valeur, le critère dit le double.\n\n**RELANCE --reprendre**\nCONTEXTE : Écris le double.'
      )
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const decision = commentaires(id).find(t => t.includes(' · regulateur : '));
    expect(decision).toMatch(/^Circuit · packages\/forms · regulateur : RELANCE --reprendre/);
    expect(decision).not.toContain('Le développeur ne change rien.');
    expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : Écris le double.');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it("an answer in no form resumes the regulateur's session once, asking for its decision, which the circuit applies", () => {
    const id = 'demo-regulateur-redemande';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, `${REGULATEUR}-1`, regulateur('Je relancerais bien le développeur.'));
    scenario(id, `${REGULATEUR}-2`, regulateur('RELANCE --reprendre\nCONTEXTE : Écris le double.'));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, REGULATEUR)).toBe(2);
    expect(valeur(args(id, REGULATEUR, 2), '--resume')).toBe(
      valeur(args(id, REGULATEUR, 1), '--session-id')
    );
    expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain('ne suit aucune forme de décision');
    expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : Écris le double.');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it("critère 6 — an answer in no form, or a regulateur's session in error, ends on the original stop, the answer joined to its reason", () => {
    const id = 'demo-regulateur-illisible';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', RIEN);
    scenario(id, `${REGULATEUR}-1`, regulateur('Je relancerais bien le développeur.'));
    scenario(id, `${REGULATEUR}-2`, regulateur('Toujours sans décision.'));
    const r1 = circuit([id]);
    expect(r1.status, sortie(r1)).toBe(ARRETS['sans-livraison']);
    const e1 = etat(id);
    expect(e1).toMatchObject({ raison: 'sans-livraison', code: ARRETS['sans-livraison'] });
    expect(e1?.rapport).toContain('ne change aucun fichier de packages/forms');
    expect(e1?.rapport).toContain('Toujours sans décision.');
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(sessions(id, REGULATEUR)).toBe(2);
    // A session that ends in error: the same original stop, the regulator not asked again.
    scenario(id, `${REGULATEUR}-3`, "decision 'RELANCE --reprendre'\nexit 3\n");
    const r2 = circuit([id, '--depuis', 'developpeur', '000-forms', '--contexte', 'Le double.']);
    expect(r2.status, sortie(r2)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, REGULATEUR)).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(2);
    expect(etat(id)?.rapport).toContain('code 3');
  });

  it('critère 7 — three RELANCE in a row on the same stop end the circuit on it, the three decisions in its reason, no fourth relaunch', () => {
    const id = 'demo-regulateur-trois';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', RIEN);
    for (const n of [1, 2, 3]) {
      scenario(
        id,
        `${REGULATEUR}-${n}`,
        regulateur(`RELANCE --depuis developpeur packages/forms\nCONTEXTE : essai ${n}.`)
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
