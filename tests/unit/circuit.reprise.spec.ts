import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): a relaunch of an
// agent on its step resumes its session. The first session of an agent on a step carries a session
// id the circuit sets (`--session-id`), kept in the state (`reprise`); its relaunches on the same
// step and component (the testeur after a refused proof, the developpeur after red checks) resume
// it (`--resume`) with the short template of consigne-agent.md, save the last attempt, a fresh and
// whole session. A resumption that fails falls back on a fresh and whole session.
// The trial repository and its stand-ins: ./circuit-essai.ts (its claude keeps a session's
// transcript under its id, and fails a `--resume` it does not find); each file of the circuit's
// tests builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, sessions, args, etat, commentaires } =
  circuitEssai(ESSAIS);

const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// What tells the two templates apart: the whole instruction, the short one of a resumption.
const ENTIERE = 'LE TICKET, sa description et ses critères';
const COURTE = 'TA SÉANCE REPRISE';
// A test green on the code of today, no expected green of a sheet naming it: the proof refuses it.
const ECRIT_VERT = `cat > $c/test/forme.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend un nombre', () => { expect(typeof mesure(1)).toBe('number'); });
EOF
`;

describe.runIf(canWrap)(
  'a relaunch resumes the same session, save the last',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('the developpeur relaunched on red checks resumes its first session with the short template; the last attempt is fresh and whole', () => {
      const id = 'demo-reprise-dev';
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
      const [a1, a2, a3] = [1, 2, 3].map(n => args(id, 'developpeur', n));
      const premiere = valeur(a1, '--session-id');
      expect(premiere).toMatch(UUID);
      expect(a1).not.toContain('--resume');
      // The second session resumes the first, with the short template and the red checks.
      expect(valeur(a2, '--resume')).toBe(premiere);
      expect(a2).not.toContain('--session-id');
      expect(a2).not.toContain('--model');
      const courte = essai(id, 'developpeur-2.prompt');
      expect(courte).toContain(COURTE);
      expect(courte).not.toContain(ENTIERE);
      expect(courte).toContain(`TON TICKET : ${id}`);
      expect(courte).toContain('TON COMPOSANT : packages/forms');
      expect(courte).toContain('critère 1 — mesure rend le double');
      expect(courte).toContain('Ta séance finit sur ta fiche');
      // The resumption carries no section the launcher adds to a whole instruction.
      expect(courte).not.toContain("## Ce que les composants d'avant publient");
      // The last, on the strong model: a fresh session, its instruction whole.
      const derniere = valeur(a3, '--session-id');
      expect(derniere).toMatch(UUID);
      expect(derniere).not.toBe(premiere);
      expect(a3).not.toContain('--resume');
      expect(valeur(a3, '--model')).toBe('opus');
      expect(essai(id, 'developpeur-3.prompt')).toContain(ENTIERE);
      expect(etat(id)?.reprise).toEqual({ agent: 'developpeur packages/forms', seance: derniere });
    });

    it('a resumption that fails falls back on a fresh and whole session', () => {
      const id = 'demo-reprise-ratee';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
      // The first session's transcript is lost: claude does not find the session to resume.
      scenario(
        id,
        'developpeur-1',
        `touch $c/essai.txt\nrm -f "$d"/*.jsonl\npassation 'Un essai.'\n`
      );
      scenario(id, 'developpeur-3', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(sessions(id, 'developpeur')).toBe(3);
      const premiere = valeur(args(id, 'developpeur', 1), '--session-id');
      expect(valeur(args(id, 'developpeur', 2), '--resume')).toBe(premiere);
      const a3 = args(id, 'developpeur', 3);
      expect(valeur(a3, '--session-id')).toMatch(UUID);
      expect(valeur(a3, '--session-id')).not.toBe(premiere);
      expect(a3).not.toContain('--resume');
      expect(a3).not.toContain('--model');
      expect(essai(id, 'developpeur-3.prompt')).toContain(ENTIERE);
      expect(essai(id, 'developpeur-3.prompt')).toContain('critère 1 — mesure rend le double');
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /^Circuit · packages\/forms · developpeur : reprise de la séance .* séance neuve et entière/
        )
      );
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });

    it('the testeur relaunched after a refused proof resumes its first session; its last attempt is fresh and whole', () => {
      const id = 'demo-reprise-testeur';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}${ECRIT_VERT}passation 'Tests écrits.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.preuve);
      expect(sessions(id, 'testeur')).toBe(3);
      const [a1, a2, a3] = [1, 2, 3].map(n => args(id, 'testeur', n));
      const premiere = valeur(a1, '--session-id');
      expect(premiere).toMatch(UUID);
      expect(valeur(a2, '--resume')).toBe(premiere);
      expect(a2).not.toContain('--session-id');
      const courte = essai(id, 'testeur-2.prompt');
      expect(courte).toContain(COURTE);
      expect(courte).not.toContain(ENTIERE);
      // The proof's report: the green test without its line.
      expect(courte).toContain('critère 1 — mesure rend un nombre');
      expect(courte).toContain('vert attendu');
      const derniere = valeur(a3, '--session-id');
      expect(derniere).toMatch(UUID);
      expect(derniere).not.toBe(premiere);
      expect(a3).not.toContain('--resume');
      expect(essai(id, 'testeur-3.prompt')).toContain(ENTIERE);
    });
  }
);
