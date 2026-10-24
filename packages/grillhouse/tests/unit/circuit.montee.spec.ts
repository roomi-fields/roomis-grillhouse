import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, lire, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs), grillhouse-3uv.95.4, criterion 2: a stop no
// gesture settles puts the circuit in « question », a montée to the supervisor; the supervisor
// answers by a command of the circuit, as the approver of a CI's manual job: `--reprendre` (its
// context with it), `--etendre <paquet>` (the plan gains that package, the provider first, then the
// step under way resumes, grillhouse-3uv.95.6), or `--arreter`; and carries to the owner what is
// his.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  BEADS,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  etat,
  ordre,
  commentaires,
} = circuitEssai(ESSAIS);

const HORS_PLAN = `echo "⛔ hors-plan — packages/forms/src/index.mjs est dans packages/forms" > "$TMPDIR/hors-plan"\n`;
const titre = (id: string) =>
  (JSON.parse(lire(path.join(BEADS, `${id}.json`))) as { title: string }[])[0].title;
const question = (id: string) =>
  (etat(id) as unknown as { question: { arret: string } | null } | null)?.question ?? null;

describe.runIf(canWrap)(
  'the supervisor answers a montée by a command of the circuit',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('--etendre adds the package to the plan, its provider before its reader, and the circuit resumes the step under way on the whole plan, the question as its context', () => {
      const id = 'demo-montee-etendre';
      ticket(id, '030-binder');
      scenario(id, 'testwriter-1', HORS_PLAN);
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r1 = circuit([id]);
      expect(r1.status, sortie(r1)).toBe(ARRETS['hors-plan']);
      expect(question(id)).toMatchObject({ arret: 'hors-plan' });
      const r2 = circuit([id, '--etendre', '000-forms']);
      expect(r2.status, sortie(r2)).toBe(0);
      // binder depends on forms: the provider first.
      expect(titre(id)).toBe(`${id} — La mesure — 000-forms, 030-binder`);
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(/^Circuit · plan : le superviseur étend le plan à 000-forms/)
      );
      // The step under way, the testwriter's, resumes once on the plan extended.
      expect(ordre(id)).toEqual(['testwriter', 'testwriter', 'developpeur', 'relecteur']);
      expect(essai(id, 'testwriter-2.paquets')).toBe('packages/forms:packages/binder');
      expect(essai(id, 'testwriter-2.prompt')).toMatch(/CONTEXTE : .*hors du plan/);
      // grillhouse-3uv.95.5: the plan the supervisor extends has passed, written and questioned once.
      expect(sessions(id, 'explorateur')).toBe(1);
      expect(sessions(id, 'questionneur')).toBe(1);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
      expect(question(id)).toBeNull();
    });

    it('--reprendre resumes the stopped step, its context on the line CONTEXTE, the question lifted', () => {
      const id = 'demo-montee-reprendre';
      ticket(id, '000-forms');
      scenario(id, 'testwriter-1', HORS_PLAN);
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r1 = circuit([id]);
      expect(r1.status, sortie(r1)).toBe(ARRETS['hors-plan']);
      const r2 = circuit([id, '--reprendre', '--contexte', 'Écris dans le plan seul.']);
      expect(r2.status, sortie(r2)).toBe(0);
      expect(sessions(id, 'testwriter')).toBe(2);
      expect(essai(id, 'testwriter-2.prompt')).toContain('CONTEXTE : Écris dans le plan seul.');
      expect(question(id)).toBeNull();
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });

    it('--arreter ends the circuit on the supervisor’s word, the question lifted, its motive kept and said at the ticket', () => {
      const id = 'demo-montee-arreter';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', HORS_PLAN);
      const r1 = circuit([id]);
      expect(r1.status, sortie(r1)).toBe(ARRETS['hors-plan']);
      const r2 = circuit([id, '--arreter', '--contexte', 'Le ticket change de plan.']);
      expect(r2.status, sortie(r2)).toBe(0);
      expect(sessions(id, 'testwriter')).toBe(1);
      expect(etat(id)).toMatchObject({
        raison: 'arrete',
        code: null,
        rapport: 'Le superviseur arrête le circuit : Le ticket change de plan.',
      });
      expect(question(id)).toBeNull();
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /^Circuit · arret : le superviseur arrête le circuit : Le ticket change de plan\.$/
        )
      );
    });

    it('--etendre and --arreter go alone, and --etendre names a package of the repository', () => {
      const id = 'demo-montee-usage';
      ticket(id, '000-forms');
      expect(circuit([id, '--arreter', '--reprendre']).status).toBe(2);
      expect(circuit([id, '--etendre', '030-binder', '--reprendre']).status).toBe(2);
      expect(circuit([id, '--etendre']).status).toBe(2);
      const r = circuit([id, '--etendre', '999-absent']);
      expect(r.status).toBe(2);
      expect(sortie(r)).toContain('999-absent');
    });

    it('--reponse and --decision are no options of the circuit any more', () => {
      const id = 'demo-montee-anciennes';
      ticket(id, '000-forms');
      for (const option of ['--reponse', '--decision']) {
        const r = circuit([id, option, 'oui']);
        expect(r.status, option).toBe(2);
        expect(sortie(r), option).toContain(`option inconnue : ${option}`);
      }
    });
  }
);
