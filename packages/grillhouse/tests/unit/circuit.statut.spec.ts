import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the status of the
// sheet that ends a session of the testwriter and the developpeur (`statut`: FAIT, BLOQUÉ with its
// `raison`, BESOIN with its `question`), which the circuit reads. Witness: BPScript (320.2.4.5.1,
// si61.8), where a developpeur was relaunched up to three times on a red he could not lift (in the
// tests, the shared test material, a file out of his envelope, a decision out of his role), then
// the circuit stopped at « sans-livraison » and a session had to find out why. A BLOQUÉ without a
// sending and a BESOIN stop the circuit at once, at « hors-portee » and « besoin », a question for
// the supervisor (grillhouse-3uv.95.4), the reviewer's for the owner; a BLOQUÉ with its `renvoi` to
// the testwriter is the sending to the testwriter; FAIT keeps the circuit going.
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

// The question of the circuit's state (scripts/circuit.mjs).
const question = (id: string) =>
  (etat(id) as unknown as { question: Record<string, string> | null } | null)?.question ?? null;

describe.runIf(canWrap)('the status of a sheet', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('a developpeur BLOQUÉ without a recipient stops the circuit at « hors-portee » after one session, its reason in the report, a question for the supervisor', () => {
    const id = 'demo-statut-bloque';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // The session changes a file of its plan: the status, not the delivery, decides.
    scenario(
      id,
      'developpeur',
      `printf '// essai\\n' >> $c/src/index.mjs
passation 'Le rouge vient de la matière de test partagée, hors de mon enveloppe.'
fiche '{"statut":"BLOQUÉ","piece":"packages/forms/src/index.mjs:1","raison":"la matière de test partagée attend un autre type."}'
`
    );
    const r = circuit([id]);
    expect(ARRETS['hors-portee']).toBeDefined();
    expect(r.status, sortie(r)).toBe(ARRETS['hors-portee']);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'developpeur',
      raison: 'hors-portee',
      code: ARRETS['hors-portee'],
    });
    expect(e?.rapport).toContain('la matière de test partagée attend un autre type.');
    expect(historique(id)).not.toContain('controles');
    // No session follows: the stop goes up, its reason as its fact.
    expect(ordre(id)).toEqual(['testwriter', 'developpeur']);
    expect(question(id)).toMatchObject({ arret: 'hors-portee', qui: 'superviseur' });
    expect(question(id)?.fait).toContain('la matière de test partagée attend un autre type.');
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(/^Circuit · question : hors-portee à 3 Code — /)
    );
  });

  it('a developpeur BESOIN stops the circuit at « besoin » after one session, its question in the report, a question for the supervisor', () => {
    const id = 'demo-statut-besoin';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur',
      `passation 'Le critère ne dit pas la valeur.'\nfiche '{"statut":"BESOIN","piece":"packages/forms/src/index.mjs:1","question":"la mesure rend-elle le double ou le triple ?"}'\n`
    );
    const r = circuit([id]);
    expect(ARRETS.besoin).toBeDefined();
    expect(r.status, sortie(r)).toBe(ARRETS.besoin);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'developpeur', raison: 'besoin', code: ARRETS.besoin });
    expect(e?.rapport).toContain('la mesure rend-elle le double ou le triple ?');
    expect(ordre(id)).toHaveLength(2);
    expect(question(id)).toMatchObject({ arret: 'besoin', qui: 'superviseur' });
    expect(question(id)?.fait).toContain('la mesure rend-elle le double ou le triple ?');
  });

  // grillhouse-3uv.89 L7, witness BPScript 320.3: a word a project's vocabulary guard flagged went
  // up to the supervisor, then the owner, 2 h 30 late; the owner: « c'est l'agent qui inspecte
  // les résultats des tests qui doit faire ça », the reviewer. Only a real word of the language
  // written in the code goes up, by the reviewer's `question`: the circuit stops before the commit.
  it('a reviewer’s sheet with a `question` stops the circuit at « besoin » before the integration, its question in the report, for the owner', () => {
    const id = 'demo-statut-relecteur';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'relecteur',
      `fiche '{"verdict":"ACCEPTÉ","piece":"packages/forms/src/index.mjs:1","question":"le mot double, en dur dans src/index.mjs:1, est-il un mot du langage ?"}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.besoin);
    expect(sessions(id, 'relecteur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'relecture', raison: 'besoin', code: ARRETS.besoin });
    expect(e?.rapport).toContain('le mot double, en dur dans src/index.mjs:1');
    expect(historique(id)).not.toContain('integration');
    expect(ordre(id).at(-1)).toBe('relecteur');
    expect(question(id)).toMatchObject({ arret: 'besoin', qui: 'responsable' });
    expect(question(id)?.fait).toContain('le mot double, en dur');
  });

  it('the answer to the reviewer’s question, by --reprendre --contexte, reaches the next reviewer, in its CONTEXTE', () => {
    const id = 'demo-statut-relecteur-reponse';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'relecteur-1',
      `fiche '{"verdict":"ACCEPTÉ","piece":"packages/forms/src/index.mjs:1","question":"le mot double est-il un mot du langage ?"}'\n`
    );
    scenario(id, 'relecteur-2', `fiche '{"verdict":"ACCEPTÉ"}'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.besoin);
    const s = circuit([
      id,
      '--reprendre',
      '--contexte',
      'le responsable : double est un mot du domaine, il reste',
    ]);
    expect(s.status, sortie(s)).toBe(0);
    expect(essai(id, 'relecteur-1.prompt')).toContain('CONTEXTE : aucun');
    expect(essai(id, 'relecteur-2.prompt')).toContain(
      'CONTEXTE : le responsable : double est un mot du domaine, il reste'
    );
    expect(etat(id)).toMatchObject({ etape: 'integre' });
  });

  it('a testwriter BESOIN stops the circuit at « besoin » before its proof', () => {
    const id = 'demo-statut-testwriter';
    ticket(id, '000-forms');
    scenario(
      id,
      'testwriter',
      `passation 'Aucun test écrit.'\nfiche '{"statut":"BESOIN","piece":"packages/forms/src/index.mjs:1","question":"le critère 1 vaut-il pour une valeur négative ?"}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.besoin);
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(historique(id)).not.toContain('preuve');
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'testwriter', raison: 'besoin' });
    expect(e?.rapport).toContain('le critère 1 vaut-il pour une valeur négative ?');
  });

  it('a developpeur BLOQUÉ whose sheet sends the red to the testwriter sends it to the testwriter', () => {
    const id = 'demo-statut-renvoi';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur-1',
      `passation 'Le rouge qui reste est dans les tests de forms.'
fiche '{"statut":"BLOQUÉ","piece":"packages/forms/src/index.mjs:1","raison":"le test attend un autre type.","renvoi":{"role":"testwriter"}}'
`
    );
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testwriter',
      'developpeur',
      'testwriter',
      'developpeur',
      'relecteur',
    ]);
    expect(essai(id, 'testwriter-2.prompt')).toContain(
      'Le rouge qui reste est dans les tests de forms'
    );
  });

  it('FAIT keeps the circuit going: a delivery goes to the checks, none stops at « sans-livraison »', () => {
    const id = 'demo-statut-fait';
    ticket(id, '000-forms');
    scenario(
      id,
      'testwriter',
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
