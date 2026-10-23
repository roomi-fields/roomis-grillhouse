import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import {
  ARRETS,
  CODE_JUSTE,
  DESCRIPTION,
  ECRIT_ROUGE,
  circuitEssai,
  ecrire,
  json,
  sortie,
} from './circuit-essai.js';

// grillhouse-3uv.89, L6 — the components fixed at the opening. Before the testwriter of its first
// component, the circuit surveys the components the ticket's Architecture and criteria reach
// (scripts/composants-affectes.mjs): one the title does not name stops it at once, before any
// session, at « composants-manquants », the missing components at the head of its report; the
// supervisor extends the plan (`--etendre`, tests/unit/circuit.montee.spec.ts), or admits it out of
// the title (`composants-affectes <ticket> --admettre <composant> --raison <texte>`), written at the
// ticket, then resumes (grillhouse-3uv.95.4). Witness: BPScript 320.3 (2026-10-20), where 040-checker
// and 020-loader joined the title on the way, each by a stop that went up to the supervisor.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-composants-affectes-');
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
  etat,
  ordre,
  commentaires,
} = circuitEssai(ESSAIS);
const COMPOSANTS_AFFECTES = path.resolve(__dirname, '../../scripts/composants-affectes.mjs');

// A ticket whose title names forms alone, and whose criterion names binder.
function ticketSansBinder(id: string) {
  ticket(id, '000-forms');
  ecrire(
    path.join(BEADS, `${id}.json`),
    json([
      {
        id,
        title: `${id} — La mesure — 000-forms`,
        description: `${DESCRIPTION}\n2. 030-binder lit la mesure, inchangé.\n`,
      },
    ])
  );
}

describe.runIf(canWrap)('the components fixed at the opening', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('stops before any session when the criteria name a component the title misses', () => {
    const id = 'demo-manquant';
    ticketSansBinder(id);
    const r = circuit([id]);
    expect(ARRETS['composants-manquants']).toBeDefined();
    expect(r.status, sortie(r)).toBe(ARRETS['composants-manquants']);
    // No session ran.
    expect(essai(id, 'ordre')).toBe('');
    const e = etat(id);
    expect(e).toMatchObject({
      raison: 'composants-manquants',
      code: ARRETS['composants-manquants'],
      etape: 'testwriter',
      composant: 'packages/forms',
    });
    expect(String(e?.rapport).split('\n')[0]).toBe('Composants manquants au titre : 030-binder.');
    expect(
      commentaires(id).some(t =>
        t.startsWith('Circuit · packages/forms · question : composants-manquants à ')
      )
    ).toBe(true);
  });

  it("lets pass the supervisor's admission out of the title, written at the ticket, then runs the circuit on --reprendre", () => {
    const id = 'demo-reponse';
    ticketSansBinder(id);
    expect(circuit([id]).status).toBe(ARRETS['composants-manquants']);
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const a = spawnSync(
      'node',
      [
        COMPOSANTS_AFFECTES,
        id,
        '--admettre',
        '030-binder',
        '--raison',
        'binder lit la mesure sans changer.',
      ],
      { cwd: REPO, env: ENV, encoding: 'utf8' }
    );
    expect(a.status, a.stderr).toBe(0);
    const r = circuit([id, '--reprendre']);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      'relecteur',
    ]);
    expect(commentaires(id)).toContain(
      'Composants · 030-binder admis hors du titre : binder lit la mesure sans changer.'
    );
    // The answer is kept beside the copy, for the runs after it.
    expect(existsSync(path.join(REPO, '.claude/worktrees', `${id}.composants.json`))).toBe(true);
  });
});
