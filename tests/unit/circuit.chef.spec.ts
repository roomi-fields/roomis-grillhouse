import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the chef de chantier
// on a stop (grillhouse-3uv.85). On a stop other than 0 and 75, the circuit launches a session of
// the chef itself, out of the envelope, in the ticket's copy; the chef's final answer is its
// decision, which the circuit writes at the ticket and applies: RELANCE starts the circuit again
// in the same process, MONTE ends it on the stop « question », the chef's session kept in the
// state, which `--reponse "<texte>"` resumes with the owner's answer.
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

const CHEF = 'chef-de-chantier';
// A developpeur session that changes no file: the circuit stops at « sans-livraison ».
const RIEN = "passation 'Rien à écrire.'\n";
// A chef's scenario: it keeps the state of the circuit as its session sees it, then answers.
const chef = (reponse: string) =>
  `cp "$racine/.claude/worktrees/$ticket.circuit.json" "$e/etat-chef-$n.json"\ndecision '${reponse}'\n`;
const etatVuParLeChef = (id: string, n: number) =>
  JSON.parse(essai(id, `etat-chef-${n}.json`) || 'null') as {
    code: number | null;
    raison: string | null;
    chef: { seance: string } | null;
  } | null;
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe.runIf(canWrap)(
  'the chef de chantier, a session of the circuit',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('critères 1, 2 et 3 — on a stop, the circuit launches the chef and applies its RELANCE --reprendre, CONTEXTE as --contexte, in the same process', () => {
      const id = 'demo-chef-reprendre';
      const copie = ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', RIEN);
      scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      scenario(id, CHEF, chef('RELANCE --reprendre\nCONTEXTE : Écris le double.'));
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      // Critère 1: one session of the chef, out of the envelope, between the stop and the relaunch.
      expect(ordre(id)).toEqual([
        'testeur packages/forms',
        'developpeur packages/forms',
        CHEF,
        'developpeur packages/forms',
        'relecteur',
      ]);
      expect(essai(id, `${CHEF}-1.pwd`).trim()).toBe(copie);
      const a = args(id, CHEF, 1);
      expect(a.slice(0, 3)).toEqual(['-p', '--agent', CHEF]);
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
      // Its instruction: the ticket, the stop's name and code, its step, component and reason, and
      // the paths of the state and the log.
      const consigne = essai(id, `${CHEF}-1.prompt`);
      expect(consigne).toContain(`TON TICKET : ${id} — La mesure`);
      expect(consigne).toContain('sans-livraison');
      expect(consigne).toContain(`code ${ARRETS['sans-livraison']}`);
      expect(consigne).toContain("l'étape developpeur");
      expect(consigne).toContain('packages/forms');
      expect(consigne).toContain('ne change aucun fichier de packages/forms');
      expect(consigne).toContain(path.join(REPO, '.claude/worktrees', `${id}.circuit.json`));
      expect(consigne).toContain(e?.journal);
      // While the chef runs, the state holds the stop and the chef's session.
      const vu = etatVuParLeChef(id, 1);
      expect(vu).toMatchObject({ code: ARRETS['sans-livraison'], raison: 'sans-livraison' });
      expect(vu?.chef?.seance).toBe(valeur(a, '--session-id'));
      // Critère 2: the decision at the ticket.
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(/^Circuit · packages\/forms · chef : RELANCE --reprendre/)
      );
      expect(commentaires(id).find(t => t.includes(' · chef : '))).toContain('Écris le double.');
      // Critère 3: the developpeur resumed with the context, and the circuit goes on to its end.
      expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : Écris le double.');
      expect(e).toMatchObject({ etape: 'integre', code: 0, chef: null });
    });

    it('critère 3 — RELANCE --depuis <étape> <composant> plays that component again from that step, the context as its report', () => {
      const id = 'demo-chef-depuis';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', RIEN);
      scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      scenario(
        id,
        CHEF,
        chef('RELANCE --depuis developpeur 000-forms\nCONTEXTE : La mesure rend le double.')
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(sessions(id, CHEF)).toBe(1);
      expect(sessions(id, 'testeur')).toBe(1);
      expect(sessions(id, 'developpeur')).toBe(2);
      expect(essai(id, 'developpeur-2.prompt')).toContain('La mesure rend le double.');
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(/^Circuit · packages\/forms · chef : RELANCE --depuis developpeur/)
      );
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });

    describe('critères 4 et 5 — MONTE ends on « question », --reponse resumes the same session', () => {
      const id = 'demo-chef-question';

      it('critère 4 — MONTE ends the circuit on the code question, the question in its reason and at the ticket, the session in the state', () => {
        ticket(id, '000-forms');
        scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
        scenario(id, 'developpeur-1', RIEN);
        scenario(id, `${CHEF}-1`, chef('MONTE : La mesure rend-elle le double ou le triple ?'));
        const r = circuit([id]);
        expect(ARRETS.question).toBeDefined();
        expect(r.status, sortie(r)).toBe(ARRETS.question);
        const e = etat(id);
        expect(e).toMatchObject({
          etape: 'developpeur',
          composant: 'packages/forms',
          code: ARRETS.question,
          raison: 'question',
        });
        expect(e?.rapport).toContain('La mesure rend-elle le double ou le triple ?');
        expect(e?.chef?.seance).toBe(valeur(args(id, CHEF, 1), '--session-id'));
        expect(commentaires(id)).toContainEqual(
          expect.stringMatching(
            /^Circuit · packages\/forms · chef : MONTE : La mesure rend-elle le double ou le triple \?/
          )
        );
        expect(sessions(id, 'developpeur')).toBe(1);
      });

      it("critère 5 — --reponse resumes the chef's session with the owner's answer and applies its decision", () => {
        const seance = etat(id)?.chef?.seance;
        scenario(
          id,
          `${CHEF}-2`,
          chef('RELANCE --reprendre\nCONTEXTE : Le responsable dit : le double.')
        );
        scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
        const r = circuit([id, '--reponse', 'Le double.']);
        expect(r.status, sortie(r)).toBe(0);
        const a = args(id, CHEF, 2);
        expect(valeur(a, '--resume')).toBe(seance);
        expect(a).not.toContain('--session-id');
        expect(valeur(a, '--model')).toBe('sonnet');
        expect(essai(id, `${CHEF}-2.prompt`)).toContain('Le double.');
        expect(essai(id, 'developpeur-2.prompt')).toContain(
          'CONTEXTE : Le responsable dit : le double.'
        );
        expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
      });
    });

    it('critère 5 — --reponse without a chef session kept in the state is refused (usage)', () => {
      const id = 'demo-chef-sans-seance';
      ticket(id, '000-forms');
      const r = circuit([id, '--reponse', 'Le double.']);
      expect(r.status, sortie(r)).toBe(2);
      expect(r.stderr).toMatch(/séance du chef/);
      expect(sessions(id, CHEF)).toBe(0);
    });

    it("critère 6 — an answer in no form, or a chef's session in error, ends on the original stop, the answer joined to its reason", () => {
      const id = 'demo-chef-illisible';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', RIEN);
      scenario(id, `${CHEF}-1`, chef('Je relancerais bien le développeur.'));
      const r1 = circuit([id]);
      expect(r1.status, sortie(r1)).toBe(ARRETS['sans-livraison']);
      const e1 = etat(id);
      expect(e1).toMatchObject({ raison: 'sans-livraison', code: ARRETS['sans-livraison'] });
      expect(e1?.rapport).toContain('ne change aucun fichier de packages/forms');
      expect(e1?.rapport).toContain('Je relancerais bien le développeur.');
      expect(sessions(id, 'developpeur')).toBe(1);
      // A session that ends in error: the same original stop.
      scenario(id, `${CHEF}-2`, "decision 'RELANCE --reprendre'\nexit 3\n");
      const r2 = circuit([id, '--depuis', 'developpeur', '000-forms', '--contexte', 'Le double.']);
      expect(r2.status, sortie(r2)).toBe(ARRETS['sans-livraison']);
      expect(sessions(id, CHEF)).toBe(2);
      expect(sessions(id, 'developpeur')).toBe(2);
      expect(etat(id)?.rapport).toContain('code 3');
    });

    it('critère 7 — three RELANCE in a row on the same stop end the circuit on it, the three decisions in its reason, no fourth relaunch', () => {
      const id = 'demo-chef-trois';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', RIEN);
      for (const n of [1, 2, 3]) {
        scenario(
          id,
          `${CHEF}-${n}`,
          chef(`RELANCE --depuis developpeur packages/forms\nCONTEXTE : essai ${n}.`)
        );
      }
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
      expect(sessions(id, CHEF)).toBe(3);
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
  }
);
