// @poste: l'enveloppe bwrap, un serveur Temporal
import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';
import { dormir, ouvrirLeBanc, type Banc } from './temporal-essai.js';

// grillhouse-4nr.6, criterion 1 (and grillhouse-4nr.6.2, criterion 4, the worker killed during a
// session): the workflow of a ticket under Temporal (src/temporal/circuit/),
// its acts the circuit's own (scripts/faits-du-circuit.mjs), carries a ticket of trial from its
// plan to its integration, as `npx grillhouse circuit` does (circuit.preuve.nuit.spec.ts), on the
// bench of ./temporal-essai.ts: the pinned program TEMPORAL as its server, on a free port and a
// database of its own, and the frame's worker started by its built code, its temporary files under
// the trial's directory. The test waits for the workflow's end, reading it every 2 s: a question
// that goes up fails it at once, and its deadline fails it with the state and the question of the
// workflow (its query and its memo) and the end of the ticket's log. At its end, green or red, the
// circuit stops on the supervisor's word (its session killed), then the worker ends, then the
// server: nothing outlives the test. The worker killed during a session is also criterion 3 of
// grillhouse-4nr.11, the rehearsal (./repetition.temporal.nuit.spec.ts), on the same bench.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-temporal-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const essai = circuitEssai(ESSAIS, { banc: false });
const { REPO, revenirAuDebut, ticket, scenario, ordre, commentaires, essai: lu, sessions } = essai;

// Each test waits for its circuit's end (FIN_MS of ./temporal-essai.ts) after what it plays while
// the circuit runs (up to 12 min for the purge): its deadline stands above their sum.
describe.runIf(canWrap)('the workflow of a ticket under Temporal', { timeout: 1_800_000 }, () => {
  afterEach(revenirAuDebut);

  it('carries the ticket from its plan to its integration, the circuit’s own acts as its activities', async () => {
    const id = 'demo-temporal';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const { historique } = await mener(id);
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · preuve'));
    expect(preuve).toContain('critère 1 — mesure rend le double');
    // grillhouse-4nr.6.3: the plan in two steps, each the act `plan` in an activity of its own,
    // the explorateur's, then the questionneur's, which ends it.
    expect(historique.match(/"name":\s*"jouerUnPasDuPlan"/g)).toHaveLength(2);
  });

  // The circuit stopped on the supervisor's word during the developpeur's session, then its
  // workflow purged from the server (its retention passed): the server holds no state of it, and
  // `--depuis developpeur` alone reopens it, a new workflow with no state (grillhouse-4nr.12, Q2):
  // the developpeur plays again on the lot the testwriter left, and the ticket ends, with one
  // testwriter session.
  it('stopped, then purged from the server: --depuis reopens it with no state, and the ticket ends', async () => {
    const id = 'demo-temporal-purge';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur',
      `date +%s%N >> "$e/developpeur.debut"\nsleep 15\n${CODE_JUSTE}passation 'Code écrit.'\n`
    );
    await mener(
      id,
      async ({ cli, statut: statutDe, workflow: wf, file }) => {
        const workflow = wf(id);
        const statut = () => statutDe(workflow);
        for (let i = 0; i < 1500 && !lu(id, 'developpeur.debut'); i++) {
          await dormir(200);
        }
        expect(lu(id, 'developpeur.debut'), 'la séance du développeur ne commence pas').not.toBe(
          ''
        );
        cli(
          'workflow',
          'signal',
          '--workflow-id',
          workflow,
          '--name',
          'arreter',
          '--input',
          'null'
        );
        for (let i = 0; i < 120 && statut() === 'RUNNING'; i++) {
          await dormir(1000);
        }
        const fin = cli('workflow', 'result', '--workflow-id', workflow, '--output', 'json');
        expect(fin.stdout).toContain('"raison": "arrete"');
        const purge = cli('workflow', 'delete', '--workflow-id', workflow, '--yes');
        expect(purge.status, purge.stderr).toBe(0);
        for (let i = 0; i < 300 && statut() !== '?'; i++) {
          await dormir(1000);
        }
        expect(statut(), 'le déroulé arrêté n’est pas purgé').toBe('?');
        const reprise = cli(
          'workflow',
          'start',
          '--type',
          'circuitDuTicket',
          '--task-queue',
          file,
          '--workflow-id',
          workflow,
          '--input',
          JSON.stringify({
            racine: REPO,
            ticket: id,
            repasserMs: 5000,
            reprise: { genre: 'depuis', role: 'developpeur', contexte: 'Reprends le code.' },
          })
        );
        expect(reprise.status, reprise.stderr).toBe(0);
      },
      null
    );
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(ordre(id).at(-1)).toBe('relecteur');
  });

  // grillhouse-4nr.6.2, criterion 4: the worker killed while the developpeur's session runs; the
  // next worker plays the attempt again, which waits for the group the session left, takes the
  // result it ranged, and the ticket ends, with one developpeur session.
  it('the worker dies during a session: the next one takes its result, and the ticket ends', async () => {
    const id = 'demo-temporal-mort';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur',
      `date +%s%N > "$e/developpeur.debut"\nsleep 15\n${CODE_JUSTE}passation 'Code écrit.'\n`
    );
    await mener(id, async ({ couperLeTravailleur }) => {
      for (let i = 0; i < 1500 && !lu(id, 'developpeur.debut'); i++) {
        await dormir(200);
      }
      expect(lu(id, 'developpeur.debut'), 'la séance du développeur ne commence pas').not.toBe('');
      await dormir(3000);
      await couperLeTravailleur();
    });
    expect(sessions(id, 'developpeur')).toBe(1);
  });

  // The ticket <id> carried by the workflow of its circuit to its end, on a bench of its own
  // (./temporal-essai.ts); <pendant> plays while it runs, and may kill the worker
  // (`couperLeTravailleur`) or speak to the server (`cli`, `statut`, `workflow`). It ends
  // integrated, the order of its sessions <ordreAttendu> (the circuit's, null when the test reads
  // it itself); its history, as the CLI writes it.
  async function mener(
    id: string,
    pendant?: (banc: Banc) => Promise<void>,
    ordreAttendu: string[] | null = ['testwriter', 'developpeur', 'relecteur']
  ): Promise<{ historique: string }> {
    const banc = await ouvrirLeBanc(ESSAIS, essai, id);
    try {
      banc.demarrerLeCircuit(id);
      await pendant?.(banc);
      await banc.attendreLaFin(id);
      if (ordreAttendu) {
        expect(ordre(id)).toEqual(ordreAttendu);
      }
      return {
        historique: banc.cli(
          'workflow',
          'show',
          '--workflow-id',
          banc.workflow(id),
          '--output',
          'json'
        ).stdout,
      };
    } finally {
      await banc.fermer([id]);
    }
  }
});
