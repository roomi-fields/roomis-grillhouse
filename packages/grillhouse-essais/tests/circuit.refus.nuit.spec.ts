// @equipee: l'enveloppe bwrap, un serveur Temporal
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts), grillhouse-kgx.4: as a
// merge queue (GitHub merge queue, bors, Zuul) sends a lot back to its author with the log of the
// integration's check, `--depuis developpeur` after a refusal of the integration gives the
// developpeur that refusal as the red to lift (BP 320.37: three times « FAIT » without a file
// changed, the checks of the copy green, the integration red again). The one journey that stays
// whole in the night: the real integration refuses in the copy, its real output reaches the
// developpeur's instruction, then the integration passes. The rules of the start after a refusal,
// of the session that changes nothing and of `--reprendre` are proved small
// (tests/unit/transitions.depart-renvoi-extension.spec.ts, transitions.spec.ts).
// The trial repository and its stand-ins: ./circuit-essai.ts (the command of one of its project's
// generated files fails in the integration copy alone while the main tree holds
// `.beads/essai/integration/rouge`, `refusALIntegration`); each file of the circuit's tests builds
// its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { BEADS, revenirAuDebut, ticket, scenario, circuit, essai, sessions, etat, journal } =
  circuitEssai(ESSAIS, { refusALIntegration: true });

// The red the integration copy alone sees, set and lifted (the trial's generated file).
const MARQUE = path.join(BEADS, 'essai', 'integration', 'rouge');
const rougeALIntegration = () => {
  mkdirSync(path.dirname(MARQUE), { recursive: true });
  writeFileSync(MARQUE, 'oui\n');
};
const leverLeRouge = () => rmSync(MARQUE, { force: true });
const ROUGE = 'la mesure lit un chemin que seule l’intégration voit.';
// The developpeur's code, right in the copy; his correction of the refusal.
const CODE = `${CODE_JUSTE}passation 'Code écrit.'\n`;
const ACCORDE = `printf '// accordé\\n' >> $c/src/index.mjs\npassation 'Refus levé.'\n`;
// The instruction of a refusal of the integration, the red to lift.
const REFUS = /L’intégration refuse ce lot : son refus, ci-dessous, est le rouge à lever/;
const integrations = (id: string) =>
  journal(id)
    .split('\n')
    .filter(l => l.startsWith('$ node ') && l.includes('integrer.mjs')).length;
// A ticket whose lot the integration refuses: its first run, stopped at « integration ».
const refuse = (id: string) => {
  ticket(id, '000-forms, 030-binder');
  scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
  scenario(id, 'developpeur-1', CODE);
  rougeALIntegration();
  const r = circuit([id]);
  expect(r.status, sortie(r)).toBe(ARRETS.integration);
  expect(etat(id)).toMatchObject({ raison: 'integration' });
};

describe.runIf(canWrap)('after a refusal of the integration', { timeout: 300_000 }, () => {
  afterEach(() => {
    leverLeRouge();
    revenirAuDebut();
  });

  it('a --depuis developpeur gives the developpeur the output of the refusal as the red to lift', () => {
    const id = 'demo-refus-depuis';
    refuse(id);
    scenario(id, 'developpeur-2', ACCORDE);
    const r = circuit([id, '--depuis', 'developpeur', '--contexte', 'des chemins absolus']);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'developpeur')).toBe(2);
    const consigne = essai(id, 'developpeur-2.prompt');
    expect(consigne).toMatch(REFUS);
    expect(consigne).toContain(ROUGE);
    expect(integrations(id)).toBe(2);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});
