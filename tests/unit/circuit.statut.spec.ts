import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the status of the
// sheet that ends a session of the testeur and the developpeur (`statut`: FAIT, BLOQUÉ with its
// `raison`, BESOIN with its `question`), which the circuit reads. Witness: BPScript (320.2.4.5.1,
// si61.8), where a developpeur was relaunched up to three times on a red he could not lift (in the
// tests, the shared test material, a file out of his envelope, a decision out of his role), then
// the circuit stopped at « sans-livraison » and a regulator had to find out why. A BLOQUÉ without a
// sending and a BESOIN stop the circuit at once, at « hors-portee » and « besoin », the regulator
// launched on them; a BLOQUÉ with its `renvoi` to `testeur <composant>` is the sending to the
// testeur; FAIT keeps the circuit going.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  etat,
  ordre,
  commentaires,
  historique,
} = circuitEssai(ESSAIS);

const REGULATEUR = 'regulateur';

describe.runIf(canWrap)('the status of a sheet', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('a developpeur BLOQUÉ without a recipient stops the circuit at « hors-portee » after one session, its reason in the report, the regulateur launched on it', () => {
    const id = 'demo-statut-bloque';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // The session changes a file of its component: the status, not the delivery, decides.
    scenario(
      id,
      'developpeur',
      `printf '// essai\\n' >> $c/src/index.mjs
passation 'Le rouge vient de la matière de test partagée, hors de mon enveloppe.'
fiche '{"statut":"BLOQUÉ","raison":"la matière de test partagée attend un autre type."}'
`
    );
    const r = circuit([id]);
    expect(ARRETS['hors-portee']).toBeDefined();
    expect(r.status, sortie(r)).toBe(ARRETS['hors-portee']);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'developpeur',
      composant: 'packages/forms',
      raison: 'hors-portee',
      code: ARRETS['hors-portee'],
    });
    expect(e?.rapport).toContain('la matière de test partagée attend un autre type.');
    expect(historique(id)).not.toContainEqual(['packages/forms', 'controles']);
    // The regulator is launched on the stop, its reason in its instruction.
    expect(ordre(id).slice(0, 3)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      REGULATEUR,
    ]);
    const consigne = essai(id, `${REGULATEUR}-1.prompt`);
    expect(consigne).toContain(`hors-portee (code ${ARRETS['hors-portee']})`);
    expect(consigne).toContain('la matière de test partagée attend un autre type.');
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(/^Circuit · packages\/forms · developpeur : arrêt hors-portee — /)
    );
  });

  it('a developpeur BESOIN stops the circuit at « besoin » after one session, its question in the report, the regulateur launched on it', () => {
    const id = 'demo-statut-besoin';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur',
      `passation 'Le critère ne dit pas la valeur.'\nfiche '{"statut":"BESOIN","question":"la mesure rend-elle le double ou le triple ?"}'\n`
    );
    const r = circuit([id]);
    expect(ARRETS.besoin).toBeDefined();
    expect(r.status, sortie(r)).toBe(ARRETS.besoin);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'developpeur', raison: 'besoin', code: ARRETS.besoin });
    expect(e?.rapport).toContain('la mesure rend-elle le double ou le triple ?');
    expect(ordre(id)[2]).toBe(REGULATEUR);
    expect(essai(id, `${REGULATEUR}-1.prompt`)).toContain(`besoin (code ${ARRETS.besoin})`);
    expect(essai(id, `${REGULATEUR}-1.prompt`)).toContain(
      'la mesure rend-elle le double ou le triple ?'
    );
  });

  it('a testeur BESOIN stops the circuit at « besoin » before its proof', () => {
    const id = 'demo-statut-testeur';
    ticket(id, '000-forms');
    scenario(
      id,
      'testeur',
      `passation 'Aucun test écrit.'\nfiche '{"statut":"BESOIN","question":"le critère 1 vaut-il pour une valeur négative ?"}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.besoin);
    expect(sessions(id, 'testeur')).toBe(1);
    expect(historique(id)).not.toContainEqual(['packages/forms', 'preuve']);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'testeur', raison: 'besoin' });
    expect(e?.rapport).toContain('le critère 1 vaut-il pour une valeur négative ?');
  });

  it('a developpeur BLOQUÉ whose sheet sends the red to `testeur <composant>` sends it to that testeur', () => {
    const id = 'demo-statut-renvoi';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur-1',
      `passation 'Le rouge qui reste est dans les tests de forms.'
fiche '{"statut":"BLOQUÉ","raison":"le test attend un autre type.","renvoi":{"role":"testeur","composant":"000-forms"}}'
`
    );
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/forms',
      'developpeur packages/forms',
      'relecteur',
    ]);
    expect(essai(id, 'testeur-2.prompt')).toContain(
      'Le rouge qui reste est dans les tests de forms'
    );
  });

  it('FAIT keeps the circuit going: a delivery goes to the checks, none stops at « sans-livraison »', () => {
    const id = 'demo-statut-fait';
    ticket(id, '000-forms');
    scenario(
      id,
      'testeur',
      `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\nfiche '{"statut":"FAIT"}'\n`
    );
    scenario(id, 'developpeur-1', `passation 'Rien écrit.'\nfiche '{"statut":"FAIT"}'\n`);
    const r1 = circuit([id]);
    expect(r1.status, sortie(r1)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, 'developpeur')).toBe(1);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r2 = circuit([id, '--reprendre']);
    expect(r2.status, sortie(r2)).toBe(0);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});
