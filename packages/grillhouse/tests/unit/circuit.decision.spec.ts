import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import {
  sortie,
  ARRETS,
  CIRCUIT,
  CODE_JUSTE,
  DESCRIPTION,
  ECRIT_ROUGE,
  circuitEssai,
} from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): a decision of the
// owner given in session, out of any stop « question », enters the plan by the path of an answer
// (grillhouse-3uv.91.7, after grillhouse-3uv.91.1): `--decision` has the technical referent pour
// it into the plan, the circuit writes it and the questionneur questions it; a circuit running on
// the ticket stops first, as GitLab CI cancels a pipeline a new one makes redundant; then the
// circuit resumes where it was, and plays again the components the plan changed reaches alone.
// Witness: BPScript 325, where Romain's decision, given to the supervisor at 13:53 out of any
// stop, stayed in his conversation and a comment, never in the plan (~15 min).
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-decision-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  BEADS,
  REPO,
  ENV,
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

const QUESTIONNEUR = 'questionneur';
const REFERENT = 'referent-technique';
const DECISION = 'Le responsable : la mesure de null est null.';
const CRITERE = '2. Dans packages/forms, `mesure(null)` rend null.';
const BESOIN = `passation 'Une question.'\nfiche '{"statut":"BESOIN","question":"que rend mesure de 0 ?"}'\n`;
// A scenario's sheet, its quotes escaped for the shell.
const fiche = (f: Record<string, unknown>) =>
  `fiche '${JSON.stringify(f).replaceAll("'", "'\\''")}'\n`;
const description = (id: string) =>
  (JSON.parse(readFileSync(path.join(BEADS, `${id}.json`), 'utf8')) as { description: string }[])[0]
    .description;
const lire = (f: string) =>
  readFileSync(path.resolve(__dirname, '../../../..', f), 'utf8').replace(/\s+/g, ' ');
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
// Whether the process group <groupe> still exists.
const groupeVivant = (groupe: number) => {
  try {
    process.kill(-groupe, 0);
    return true;
  } catch {
    return false;
  }
};

// The circuit run in the background, as the supervisor runs it: its end, with its code or its
// signal. The test's event loop stays free, so that a child killed is reaped.
function enFond(a: string[]) {
  const p = spawn('node', [CIRCUIT, ...a], {
    cwd: REPO,
    env: ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  p.stdout.on('data', d => (stdout += String(d)));
  p.stderr.on('data', d => (stderr += String(d)));
  const fin = new Promise<{
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>(resolve => p.on('close', (status, signal) => resolve({ status, signal, stdout, stderr })));
  return { pid: p.pid ?? 0, fin };
}

// The first run of the ticket <id>, forms then binder: forms is carried through, and the
// developpeur of binder asks a question (BESOIN), which no regulator settles (it gives no sheet):
// the circuit stops at « besoin », at binder's developpeur.
function jusquAuBesoin(id: string) {
  ticket(id, '000-forms, 030-binder');
  scenario(id, 'testwriter-1', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
  scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
  scenario(id, 'testwriter-2', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
  scenario(id, 'developpeur-2', BESOIN);
  const r = circuit([id]);
  expect(r.status, sortie(r)).toBe(ARRETS.besoin);
  expect(etat(id)).toMatchObject({ etape: 'developpeur', composant: 'packages/binder' });
  return ordre(id, { questionneur: true }).length;
}

describe.runIf(canWrap)(
  'a decision of the owner given in session enters the plan, the circuit stopped then resumed',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('critères 1 et 2 — --decision, out of any stop « question », goes to the référent technique, the plan written and questioned; the circuit resumes where it was and plays again the components the plan changed reaches alone', () => {
      const id = 'demo-decision-au-plan';
      const avant = jusquAuBesoin(id);
      const questionneurs = sessions(id, QUESTIONNEUR);
      const plan = `${DESCRIPTION}\n${CRITERE}`;
      scenario(
        id,
        REFERENT,
        fiche({
          reponses: [{ question: 'aucune', choix: 'CHANGE', texte: `Un critère 2 : ${CRITERE}` }],
          description: plan,
        })
      );
      // forms, which the plan changed reaches, plays again from its testwriter: a red on null.
      scenario(
        id,
        'testwriter-3',
        `cat > $c/test/nul.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 2 — mesure de null est null', () => { expect(mesure(null)).toBe(null); });
EOF
passation 'Test du critère 2, rouge.'
${fiche({
  statut: 'FAIT',
  verts_attendus: [
    {
      fichier: 'packages/forms/test/mesure.test.mjs',
      test: 'critère 1 — mesure rend le double',
      raison: 'le critère 1 est déjà tenu',
    },
  ],
})}`
      );
      scenario(
        id,
        'developpeur-3',
        `printf 'export const mesure = x => (x === null ? null : 2 * x);\\n' > $c/src/index.mjs\npassation 'Code écrit.'\n`
      );
      // binder resumes at its developpeur, where it was.
      scenario(id, 'developpeur-4', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id, '--decision', DECISION]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id, { questionneur: true }).slice(avant)).toEqual([
        REFERENT,
        QUESTIONNEUR,
        'testwriter packages/forms',
        'developpeur packages/forms',
        'developpeur packages/binder',
        'relecteur',
      ]);
      // The referent reads the decision and the plan; the circuit writes the plan it gives.
      const consigne = essai(id, `${REFERENT}-1.prompt`);
      expect(consigne).toContain(DECISION);
      expect(consigne).toContain('`mesure` rend le double de sa valeur.');
      expect(description(id)).toBe(plan);
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /^Circuit · packages\/binder · questionnement : la décision du responsable entre dans le plan/
        )
      );
      // The questionneur questions the plan changed.
      expect(sessions(id, QUESTIONNEUR)).toBe(questionneurs + 1);
      expect(essai(id, `${QUESTIONNEUR}-${questionneurs + 1}.prompt`)).toContain(CRITERE);
      // The testwriter played again reads the plan; its context carries no decision.
      const testwriter = essai(id, 'testwriter-3.prompt');
      expect(testwriter).toContain('TON COMPOSANT : packages/forms');
      expect(testwriter).toContain(CRITERE);
      expect(testwriter).not.toContain(DECISION);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });

    it('critère 3 — a decision with no effect on the plan is said at the ticket, and the circuit resumes as it was', () => {
      const id = 'demo-decision-sans-effet';
      const avant = jusquAuBesoin(id);
      const questionneurs = sessions(id, QUESTIONNEUR);
      // The referent's default sheet keeps the plan; binder's developpeur asks again.
      scenario(id, 'developpeur-3', BESOIN);
      const r = circuit([id, '--decision', DECISION]);
      expect(r.status, sortie(r)).toBe(ARRETS.besoin);
      expect(ordre(id, { questionneur: true }).slice(avant, avant + 2)).toEqual([
        REFERENT,
        'developpeur packages/binder',
      ]);
      expect(sessions(id, QUESTIONNEUR)).toBe(questionneurs);
      expect(description(id)).toBe(DESCRIPTION);
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /^Circuit · packages\/binder · questionnement : la décision du responsable ne change pas le plan/
        )
      );
    });

    it('critère 2 — a circuit running on the ticket stops first, its session with it, then the circuit resumes where it was', async () => {
      const id = 'demo-decision-circuit-en-cours';
      ticket(id, '000-forms');
      // The first testwriter's session runs long; the second asks a question, which ends the run.
      scenario(id, 'testwriter-1', `sleep 120\n${ECRIT_ROUGE}`);
      scenario(id, 'testwriter-2', BESOIN);
      const premier = enFond([id]);
      let groupe = 0;
      for (let i = 0; i < 600 && !groupe; i++) {
        await pause(200);
        const e = etat(id);
        if (e?.etape === 'testwriter' && e.seance && sessions(id, 'testwriter') === 1) {
          groupe = e.seance;
        }
      }
      expect(groupe, 'la séance du premier testwriter tourne').toBeGreaterThan(0);
      const decision = enFond([id, '--decision', DECISION]);
      const r = await decision.fin;
      expect(r.status, sortie(r)).toBe(ARRETS.besoin);
      // The running circuit and its session are stopped before the decision enters the plan.
      const p = await premier.fin;
      expect(p.status === null ? p.signal : p.status, sortie(p)).not.toBe(0);
      expect(groupeVivant(groupe)).toBe(false);
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          new RegExp(
            `^Circuit · packages/forms · decision : le circuit en cours \\(processus ${premier.pid}\\) s'arrête`
          )
        )
      );
      expect(ordre(id)).toEqual([
        'testwriter packages/forms',
        REFERENT,
        'testwriter packages/forms',
        'regulateur',
        'regulateur',
      ]);
    });

    it('critère 4 — the supervisor’s skill says every decision of the owner on a ticket goes by the circuit’s command, never by a relaunch’s context nor a comment alone', () => {
      const pitmaster = lire('.claude/skills/pitmaster/SKILL.md');
      expect(pitmaster).toMatch(
        /toute décision du responsable sur un ticket passe par le circuit/i
      );
      expect(pitmaster).toMatch(/--decision "<sa décision>"/);
      expect(pitmaster).toMatch(/jamais par le contexte d.une relance ni par un commentaire seul/i);
    });
  }
);
