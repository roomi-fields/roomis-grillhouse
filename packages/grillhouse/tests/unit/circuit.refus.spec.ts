import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts), grillhouse-kgx.4: as a
// merge queue (GitHub merge queue, bors, Zuul) sends a lot back to its author with the log of the
// integration's check, and lets it pass again only with a change, `--depuis developpeur` after a
// refusal of the integration gives the developpeur that refusal as the red to lift, and a session
// so launched that changes nothing on the lot refused does not go to the checks of the copy, green
// (BP 320.37: three times « FAIT » without a file changed, the gesture rien-a-livrer, the checks of
// the copy green, the integration red again); as bors retries a lot, `--reprendre` plays the
// integration again on the same lot (BP 320.16, 320.16.2: a refusal of the load or of main).
// The trial repository and its stand-ins: ./circuit-essai.ts (its project's guard is red in the
// integration copy alone while the main tree holds `.beads/essai/integration/rouge`, out of
// Turborepo's cache, so that the integration plays it again); each file of the circuit's tests
// builds its own, in a trial directory of its own.

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
  journal,
  commentaires,
} = circuitEssai(ESSAIS, { gardesSansCache: true });

// The red the integration copy alone sees, set and lifted (the trial's guard).
const MARQUE = path.join(BEADS, 'essai', 'integration', 'rouge');
const rougeALIntegration = () => {
  mkdirSync(path.dirname(MARQUE), { recursive: true });
  writeFileSync(MARQUE, 'oui\n');
};
const leverLeRouge = () => rmSync(MARQUE, { force: true });
const ROUGE = 'la mesure lit un chemin que seule l’intégration voit.';
// The developpeur's code, right in the copy; his correction of the refusal; a session that changes
// no file.
const CODE = `${CODE_JUSTE}passation 'Code écrit.'\n`;
const ACCORDE = `printf '// accordé\\n' >> $c/src/index.mjs\npassation 'Refus levé.'\n`;
const RIEN = "passation 'Rien à écrire : les contrôles de ma copie sont verts.'\n";
// The instruction of a refusal of the integration, the red to lift.
const REFUS = /L’intégration refuse ce lot : son refus, ci-dessous, est le rouge à lever/;
const integrations = (id: string) =>
  journal(id)
    .split('\n')
    .filter(l => l.startsWith('$ node ') && l.includes('integrer.mjs')).length;
const gestes = (id: string) => commentaires(id).filter(t => /^Circuit · geste : /.test(t));
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

  // Criterion 1.
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

  // Criterion 2.
  it('a session so launched that changes nothing on the lot refused is relaunched once with the refusal, then stops at sans-livraison', () => {
    const id = 'demo-refus-rien';
    refuse(id);
    scenario(id, 'developpeur-2', RIEN);
    scenario(id, 'developpeur-3', RIEN);
    const r = circuit([id, '--depuis', 'developpeur', '--contexte', 'des chemins absolus']);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, 'developpeur')).toBe(3);
    // The fresh session, then the relaunch: each carries the refusal.
    for (const n of [2, 3]) {
      const consigne = essai(id, `developpeur-${n}.prompt`);
      expect(consigne).toMatch(REFUS);
      expect(consigne).toContain(ROUGE);
    }
    expect(essai(id, 'developpeur-3.prompt')).toContain(
      'CE QUI A CHANGÉ : l’intégration refuse ton lot, et ta séance n’a changé aucun fichier du plan'
    );
    // Neither the gesture rien-a-livrer nor the integration again on the same lot.
    expect(gestes(id).filter(g => g.includes('rien-a-livrer'))).toEqual([]);
    expect(integrations(id)).toBe(1);
    expect(etat(id)).toMatchObject({
      etape: 'developpeur',
      raison: 'sans-livraison',
      code: ARRETS['sans-livraison'],
    });
    const q = (etat(id) as unknown as { question: { arret: string; piece: string } }).question;
    expect(q.arret).toBe('sans-livraison');
    expect(q.piece).toContain(ROUGE);
  });

  // Criterion 3.
  it('a --reprendre plays the integration again on the same lot, no developpeur launched', () => {
    const id = 'demo-refus-reprendre';
    refuse(id);
    leverLeRouge();
    const r = circuit([id, '--reprendre']);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(integrations(id)).toBe(2);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});
