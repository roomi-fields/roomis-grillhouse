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

// grillhouse-3uv.89, L6 — the components fixed at the opening. Before the testeur of its first
// component, the circuit surveys the components the ticket's Architecture and criteria reach
// (scripts/composants-affectes.mjs): one the title does not name stops it at once, before any
// session, at « composants-manquants », the missing components at the head of its report; the
// supervisor adds it to the title, or answers why it stays out (`--reponse`), which the circuit
// writes at the ticket and lets pass. Witness: BPScript 320.3 (2026-10-20), where 040-checker
// and 020-loader joined the title on the way, each by a stop that went up to the supervisor.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-composants-affectes-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { BEADS, REPO, revenirAuDebut, ticket, scenario, circuit, essai, etat, ordre, commentaires } =
  circuitEssai(ESSAIS);

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
    // No session ran: neither a testeur nor a regulator.
    expect(essai(id, 'ordre')).toBe('');
    const e = etat(id);
    expect(e).toMatchObject({
      raison: 'composants-manquants',
      code: ARRETS['composants-manquants'],
      etape: 'testeur',
      composant: 'packages/forms',
    });
    expect(String(e?.rapport).split('\n')[0]).toBe('Composants manquants au titre : 030-binder.');
    expect(
      commentaires(id).some(t =>
        t.startsWith('Circuit · packages/forms · composants : arrêt composants-manquants')
      )
    ).toBe(true);
  });

  it("lets pass the supervisor's answer, written at the ticket, then runs the circuit", () => {
    const id = 'demo-reponse';
    ticketSansBinder(id);
    expect(circuit([id]).status).toBe(ARRETS['composants-manquants']);
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id, '--reponse', 'binder lit la mesure sans changer.']);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'relecteur',
    ]);
    expect(commentaires(id)).toContain(
      'Circuit · packages/forms · composants : 030-binder hors du titre, réponse du superviseur : binder lit la mesure sans changer.'
    );
    // The answer is kept beside the copy, for the runs after it.
    expect(existsSync(path.join(REPO, '.claude/worktrees', `${id}.composants.json`))).toBe(true);
  });
});
