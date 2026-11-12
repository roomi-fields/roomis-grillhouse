// @poste: l'enveloppe bwrap, un serveur Temporal
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CODE_JUSTE, ECRIT_ROUGE, circuitEssai, lire } from './circuit-essai.js';
import { dormir, ouvrirLeBanc } from './temporal-essai.js';

// The rehearsal of the scheduler under Temporal from end to end, on the bench
// of ./temporal-essai.ts (a server and a worker of their own) and a trial repository whose main is
// pushed to a bare `origin`, with a CI a fake gh answers. The queue of the tickets of the project
// (`ticketsDuProjet`) starts the circuit of a ticket labelled `circuit`; the workflow of the ticket
// carries it through its sessions, its passes and the queue of the project (5.2, its CI), to its
// integration; the wait of the questions (`superviseur --attendre`) and the board
// (`circuitsDuServeur`) read the server as a session of supervision does; the supervisor answers a
// stop by the frame's built client. The cases: the nominal one, a stop then its answer, the server
// killed during a wait, a red CI that goes up, and a 75 played again by its timer; the worker
// killed during a session is ./circuit.temporal.nuit.spec.ts's, on the same bench. The places of
// the machine are taken on the server of the trial.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-repetition-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const essai = circuitEssai(ESSAIS, { banc: false });
const { BEADS, REPO, revenirAuDebut, ticket, scenario, ordre, ci, sessions, journal } = essai;

// Until the lock of the wait of the questions names a live process: a wait launched listens.
const attendreQuUneAttenteEcoute = async () => {
  const verrou = path.join(REPO, '.claude', 'worktrees', 'attente-des-questions.lock');
  for (let i = 0; i < 300; i++) {
    try {
      const pid = Number(/^(\d+)/.exec(readFileSync(verrou, 'utf8'))?.[1]);
      if (pid && process.kill(pid, 0)) {
        return;
      }
    } catch {
      // no lock yet, or its process gone
    }
    await dormir(100);
  }
  throw new Error(`aucune attente des questions n'écoute : ${verrou}`);
};

// The status of the ticket <id> in the stand-in Beads.
const statutDuTicket = (id: string) =>
  (JSON.parse(lire(path.join(BEADS, `${id}.json`)) || '[{}]') as { status?: string }[])[0]?.status;

// A scenario whose first session of <role> stops on a need, its question to the supervisor, and
// whose next one does the work <travail>.
const besoinPuis = (id: string, role: string, travail: string) => {
  scenario(
    id,
    `${role}-1`,
    `fiche '{"statut":"BESOIN","question":"Quelle valeur la mesure rend-elle ?","piece":"packages/forms/src/index.mjs:1"}'\n`
  );
  scenario(id, `${role}-2`, travail);
};
const TESTS = `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`;
const CODE = `${CODE_JUSTE}passation 'Code écrit.'\n`;

// The package's test script at 75 for as many runs as its file `repasser` counts, as the machine
// loaded makes `npm run verifier` give back (./circuit.gestes.nuit.spec.ts).
const A_75 = (n: number) =>
  `cat > $c/repasser.mjs <<'EOF'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync('repasser')) {
  const n = Number(readFileSync('repasser', 'utf8'));
  if (n <= 1) rmSync('repasser');
  else writeFileSync('repasser', String(n - 1));
  console.log('⏱ à repasser (code 75)');
  process.exit(75);
}
process.exit(spawnSync('vitest', ['run'], { stdio: 'inherit' }).status ?? 1);
EOF
printf '${n}' > $c/repasser
node -e "const f='$c/package.json';const p=JSON.parse(require('fs').readFileSync(f,'utf8'));p.scripts['test:unit']='node repasser.mjs';require('fs').writeFileSync(f,JSON.stringify(p,null,2))"
`;

describe.runIf(canWrap)(
  'the scheduler under Temporal, rehearsed from end to end',
  // Each test's deadline stands above the sum of its waits (QUESTION_MS and FIN_MS of
  // ./temporal-essai.ts): two questions and an end at most, the server restarted between.
  { timeout: 1_800_000 },
  () => {
    afterEach(revenirAuDebut);

    it('the queue of the tickets starts the circuit, which ends integrated through its CI; no question wakes the supervisor', async () => {
      const id = 'demo-repetition';
      ticket(id, '000-forms', { labels: ['circuit'] });
      scenario(id, 'testwriter', TESTS);
      scenario(id, 'developpeur', CODE);
      ci('success');
      const banc = await ouvrirLeBanc(ESSAIS, essai, id);
      try {
        const attente = banc.attendreLesQuestions();
        banc.demarrerLesTickets();
        // The board names the circuit while it runs.
        let vu = false;
        for (let i = 0; i < 300 && !vu; i++) {
          vu = banc.circuits().some(c => c.ticket === id && c.vivant);
          if (!vu) {
            await dormir(1000);
          }
        }
        expect(vu, 'le tableau ne montre pas le circuit qui tourne').toBe(true);
        await banc.attendreLaFin(id);
        expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
        expect(statutDuTicket(id)).toBe('closed');
        // Integrated, the circuit leaves the board; the wait ends on the integration alone, no
        // question in its batch (it ends on each batch, grillhouse-d4n.9).
        expect(banc.circuits().map(c => c.ticket)).not.toContain(id);
        const fin = await attente.fin;
        expect(fin).toContain(`- ${id} est intégré`);
        expect(fin, 'l’attente des questions a rendu une question').not.toContain('## Question');
      } finally {
        await banc.fermer([id]);
      }
    });

    it('a stop on a question wakes the wait once; the answer resumes it, and the ticket ends integrated', async () => {
      const id = 'demo-repetition-reprise';
      ticket(id, '000-forms');
      besoinPuis(id, 'testwriter', TESTS);
      scenario(id, 'developpeur', CODE);
      ci('success');
      const banc = await ouvrirLeBanc(ESSAIS, essai, id);
      try {
        const attente = banc.attendreLesQuestions();
        banc.demarrerLeCircuit(id);
        await banc.attendreLaQuestion(id);
        const reveil = await attente.lot;
        expect(reveil).toContain(`- ${id}, à `);
        expect(reveil).toContain('Quelle valeur la mesure rend-elle ?');
        // The wait ends on its batch (grillhouse-d4n.9), and the supervisor launches it again;
        // while that one listens, another is refused.
        expect(await attente.fin).toContain('Quelle valeur la mesure rend-elle ?');
        const seconde = banc.attendreLesQuestions();
        await attendreQuUneAttenteEcoute();
        expect(await banc.attendreLesQuestions().fin).toContain('une seule à la fois');
        expect(banc.reprendre(id, 'Le double.')).toBe('repris');
        await banc.attendreLaFin(id);
        expect(sessions(id, 'testwriter')).toBe(2);
        // The question went up once: the next wait gives the integration, not the question again.
        const fin = await seconde.fin;
        expect(fin).toContain(`- ${id} est intégré`);
        expect(fin).not.toContain('Quelle valeur la mesure rend-elle ?');
      } finally {
        await banc.fermer([id]);
      }
    });

    it('the server killed during the wait for an answer, then started again: the answer is taken, and the ticket ends', async () => {
      const id = 'demo-repetition-serveur';
      ticket(id, '000-forms');
      besoinPuis(id, 'testwriter', TESTS);
      scenario(id, 'developpeur', CODE);
      ci('success');
      const banc = await ouvrirLeBanc(ESSAIS, essai, id);
      try {
        banc.demarrerLeCircuit(id);
        await banc.attendreLaQuestion(id);
        await banc.redemarrerLeServeur();
        // The workflow waits for its answer again once the worker reaches the restarted server.
        await banc.attendreLaQuestion(id);
        expect(banc.reprendre(id)).toBe('repris');
        await banc.attendreLaFin(id);
        expect(sessions(id, 'testwriter')).toBe(2);
      } finally {
        await banc.fermer([id]);
      }
    });

    it('a red CI goes up to the supervisor at 5.2, its ticket reopened, the wait woken', async () => {
      const id = 'demo-repetition-ci';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', TESTS);
      scenario(id, 'developpeur', CODE);
      ci('failure');
      const banc = await ouvrirLeBanc(ESSAIS, essai, id);
      try {
        const attente = banc.attendreLesQuestions();
        banc.demarrerLeCircuit(id);
        const v = await banc.attendreLaQuestion(id);
        expect(v.texte, banc.pieces(id)).toMatch(/"etape":\s*"file"/);
        const reveil = await attente.lot;
        expect(reveil).toContain(`- ${id}, à 5.2`);
        expect(statutDuTicket(id)).toBe('open');
      } finally {
        await banc.fermer([id]);
      }
    });

    it('a 75 is played again by its timer, no answer, and the ticket ends integrated', async () => {
      const id = 'demo-repetition-75';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', TESTS);
      scenario(id, 'developpeur', `${CODE_JUSTE}${A_75(2)}passation 'Code écrit.'\n`);
      ci('success');
      const banc = await ouvrirLeBanc(ESSAIS, essai, id);
      try {
        banc.demarrerLeCircuit(id);
        await banc.attendreLaFin(id);
        // The events of every run of the workflow, a Continue-As-New included: `workflow show`
        // reads one run.
        const liste = banc.cli(
          'workflow',
          'list',
          '--query',
          `WorkflowId = '${banc.workflow(id)}'`,
          '--output',
          'json'
        ).stdout;
        const runs = [...new Set([...liste.matchAll(/"runId":\s*"([^"]+)"/g)].map(m => m[1]!))];
        expect(runs.length, liste).toBeGreaterThan(0);
        const evenements = runs.flatMap(
          run =>
            (
              JSON.parse(
                banc.cli(
                  'workflow',
                  'show',
                  '--workflow-id',
                  banc.workflow(id),
                  '--run-id',
                  run,
                  '--output',
                  'json'
                ).stdout
              ) as { events: Record<string, unknown>[] }
            ).events
        );
        const type = (e: Record<string, unknown>) => String(e.eventType);
        // The steps the workflow published, and nothing else: the value of the field <cle> (the
        // memo's `etape`, the search attribute GrillhouseEtape) in an event that modifies its
        // properties, decoded from the base64 the CLI writes. The state's memo (`etat`) and the
        // activities' inputs and outputs, which may name « a-repasser » too, are not read.
        const valeurs = (x: unknown, cle: string): unknown[] =>
          Array.isArray(x)
            ? x.flatMap(v => valeurs(v, cle))
            : x && typeof x === 'object'
              ? Object.entries(x).flatMap(([k, v]) =>
                  k === cle &&
                  v &&
                  typeof v === 'object' &&
                  typeof (v as { data?: unknown }).data === 'string'
                    ? [
                        JSON.parse(
                          Buffer.from((v as { data: string }).data, 'base64').toString('utf8')
                        ) as unknown,
                      ]
                    : valeurs(v, cle)
                )
              : [];
        const etapes = evenements
          .filter(e =>
            /PROPERTIES_MODIFIED|PropertiesModified|UPSERT_WORKFLOW_SEARCH_ATTRIBUTES|UpsertWorkflowSearchAttributes/i.test(
              type(e)
            )
          )
          .flatMap(e => [...valeurs(e, 'etape'), ...valeurs(e, 'GrillhouseEtape')]);
        // The stop « a-repasser » published as the step; then its timer fired, and no answer came.
        expect(etapes, journal(id)).toContain('a-repasser');
        const types = evenements.map(type);
        expect(
          types.some(t => /TIMER_FIRED|TimerFired/i.test(t)),
          types.join('\n')
        ).toBe(true);
        expect(types.some(t => /UPDATE_ACCEPTED|UpdateAccepted/i.test(t))).toBe(false);
        expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
      } finally {
        await banc.fermer([id]);
      }
    });
  }
);
