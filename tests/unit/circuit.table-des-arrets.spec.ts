import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import {
  sortie,
  ecrire,
  json,
  ARRETS,
  CODE_JUSTE,
  DESCRIPTION,
  ECRIT_ROUGE,
  circuitEssai,
} from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the written policy of
// its stops (grillhouse-3uv.89, L4), as the bounded retries of Zuul and of GitHub's merge queue,
// and an admission control of the regulator's decision, checked on the state before it is applied.
// The table of the stops (scripts/etapes.mjs) gives each kind of stop its gesture: the circuit
// applies a mechanical one itself, with no regulator, and launches the regulator only for what
// the table does not settle. Witness: BPScript 320.3 (2026-10-20), 22 decisions of the regulator,
// 11 that a mechanical rule would have taken, 5 relaunches identical to the one before, 5 wrong
// on the substance (a developpeur before his testwriter, a MONTE on a false fact).
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
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
  args,
  etat,
  ordre,
  commentaires,
} = circuitEssai(ESSAIS);

const REGULATEUR = 'regulateur';
// A developpeur session that changes no file: the circuit stops at « sans-livraison ».
const RIEN = "passation 'Rien à écrire.'\n";
// A regulator's scenario that ends on the sheet <decision>, after the shell lines <avant>.
const regulateur = (decision: Record<string, unknown>, avant = '') =>
  `${avant}fiche '${JSON.stringify(decision)}'\n`;
const depuis = (role: string, composant: string, contexte: string) => ({
  decision: 'RELANCE --depuis',
  depuis: { role, composant },
  contexte,
});
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
// The lines of the table of the stops at the ticket, which the circuit writes under the step
// « arbitrage ».
const arbitrages = (id: string) => commentaires(id).filter(t => / · arbitrage : /.test(t));
const refus = (id: string) =>
  commentaires(id).filter(t => / · regulateur : décision refusée — /.test(t));

describe.runIf(canWrap)('the table of the stops', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  // A4, A6, A8-A10 of 320.3: the guard of the words of 030-binder given to the developpeurs of
  // 050, 130 and 900, who could change nothing (D5, D7, D9-D11).
  it('a red of another component goes to that component’s developpeur, never to the one under way, with no regulateur', () => {
    const id = 'demo-table-autre';
    const copie = ticket(id, '000-forms, 030-binder, spec');
    ecrire(path.join(copie, 'spec/mesure.md'), '# La mesure\n');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    scenario(
      id,
      'developpeur-2',
      `${CODE_JUSTE}echo rouge > $c/garde-rouge.txt\npassation 'Code de binder écrit.'\n`
    );
    scenario(
      id,
      'developpeur-3',
      `printf 'La mesure rend le double.\\n' >> $c/mesure.md\npassation 'Spécification écrite.'\n`
    );
    scenario(
      id,
      'developpeur-4',
      `printf '// accordé\\n' >> $c/src/index.mjs\npassation 'Forms accordé.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // No developpeur of binder nor of spec on the red of forms, and no regulateur.
    expect(ordre(id)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      'testwriter packages/binder',
      'developpeur packages/binder',
      'developpeur spec',
      'developpeur packages/forms',
      'relecteur',
    ]);
    const consigne = essai(id, 'developpeur-4.prompt');
    expect(consigne).toContain('TON COMPOSANT : packages/forms');
    expect(consigne).toContain('packages/forms/src/index.mjs:1');
    expect(commentaires(id).some(t => t.includes(' : arrêt '))).toBe(false);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  // A16 of 320.3: the guard consommateurs-arbitres asked for an arbitrage, which only the
  // regulator writes (D19, right); a finding of forms, judged at the final pass.
  it('a finding to settle goes to the regulateur, even in another component', () => {
    const id = 'demo-table-arbitrer';
    const copie = ticket(id, '000-forms, 030-binder, spec');
    ecrire(path.join(copie, 'spec/mesure.md'), '# La mesure\n');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    scenario(
      id,
      'developpeur-2',
      `${CODE_JUSTE}echo oui > $c/arbitrer.txt\npassation 'Code de binder écrit.'\n`
    );
    scenario(
      id,
      'developpeur-3',
      `printf 'La mesure rend le double.\\n' >> $c/mesure.md\npassation 'Spécification écrite.'\n`
    );
    scenario(id, REGULATEUR, regulateur({ decision: 'MONTE', question: 'Faut-il accorder ?' }));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.question);
    expect(ordre(id).slice(-2)).toEqual(['developpeur spec', REGULATEUR]);
    expect(essai(id, `${REGULATEUR}-1.prompt`)).toContain('la mesure attend un arbitrage.');
    expect(arbitrages(id)).toEqual([]);
  });

  // A8 → A9 of 320.3: `RELANCE --reprendre` without context, the same stop come back on the same
  // copy (D9); A11 → A13, the same red of the final pass three times (D13, D14).
  it('the same stop come back with nothing new, the copy and the ticket unchanged, ends the circuit on it, with no regulateur', () => {
    const id = 'demo-table-meme-arret';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', RIEN);
    scenario(id, REGULATEUR, regulateur(depuis('developpeur', '000-forms', 'Essai 1.')));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, REGULATEUR)).toBe(1);
    expect(sessions(id, 'developpeur')).toBe(2);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'developpeur', raison: 'sans-livraison', regulateur: null });
    expect(e?.rapport).toContain('sans fait nouveau');
    expect(e?.rapport).toContain('RELANCE --depuis developpeur packages/forms');
    expect(arbitrages(id)).toEqual([
      expect.stringMatching(
        /^Circuit · packages\/forms · arbitrage : meme-arret-sans-fait-nouveau → le superviseur/
      ),
    ]);
  });

  // A3 → D4 and A14 → D17 of 320.3: the supervisor put the provider in the title, and the
  // regulator, resumed on his answer, relaunched its testwriter. The answer goes into the plan
  // (tests/unit/circuit.reponse.spec.ts); the testwriter's report is the stop.
  it('on --reponse, a component the title gained since the question starts at its testwriter, the stop as its report, with no regulateur resumed', () => {
    const id = 'demo-table-composant-ajoute';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      REGULATEUR,
      regulateur({ decision: 'MONTE', question: 'Le classeur manque au titre.' })
    );
    const r1 = circuit([id]);
    expect(r1.status, sortie(r1)).toBe(ARRETS.question);
    // The supervisor adds the component to the title, then answers.
    ecrire(
      path.join(BEADS, `${id}.json`),
      json([{ id, title: `${id} — La mesure — 000-forms, 030-binder`, description: DESCRIPTION }])
    );
    const r2 = circuit([id, '--reponse', 'Le classeur rejoint le titre.']);
    expect(r2.status, sortie(r2)).toBe(0);
    expect(sessions(id, REGULATEUR)).toBe(1);
    // The technical referent pours the answer into the plan first, which it leaves as it is.
    expect(ordre(id).slice(0, 6)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      REGULATEUR,
      'referent-technique',
      'testwriter packages/binder',
      'developpeur packages/binder',
    ]);
    expect(essai(id, 'testwriter-2.prompt')).toContain('TON COMPOSANT : packages/binder');
    expect(essai(id, 'testwriter-2.prompt')).toContain('Le classeur manque au titre.');
    expect(essai(id, 'testwriter-2.prompt')).not.toContain('Le classeur rejoint le titre.');
    expect(arbitrages(id)).toEqual([
      expect.stringMatching(
        /^Circuit · packages\/forms · arbitrage : composant-ajoute → RELANCE --depuis testwriter packages\/binder/
      ),
    ]);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});

describe.runIf(canWrap)('the admission of the regulateur’s decision', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  // D1, D5, D7 of 320.3: a developpeur launched before his testwriter (A2, A5, A7).
  it('refuses a developpeur whose testwriter has not run, asks the same session again once with the reason, and applies the decision admitted', () => {
    const id = 'demo-admission-role';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, `${REGULATEUR}-1`, regulateur(depuis('developpeur', '030-binder', 'Le double.')));
    scenario(
      id,
      `${REGULATEUR}-2`,
      regulateur({ decision: 'RELANCE --reprendre', contexte: 'Écris le double.' })
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      REGULATEUR,
      REGULATEUR,
      'developpeur packages/forms',
      'testwriter packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    // The same session, asked again with the reason of the refusal.
    expect(valeur(args(id, REGULATEUR, 2), '--resume')).toBe(
      valeur(args(id, REGULATEUR, 1), '--session-id')
    );
    const redemande = essai(id, `${REGULATEUR}-2.prompt`);
    expect(redemande).toContain('LE CIRCUIT REFUSE TA DÉCISION');
    expect(redemande).toContain('packages/binder');
    expect(redemande).toContain('testwriter');
    expect(refus(id)).toEqual([
      expect.stringMatching(
        /^Circuit · packages\/forms · regulateur : décision refusée — .*binder/
      ),
    ]);
    expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : Écris le double.');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  // D11 of 320.3: a MONTE on « 995-tools hors de l'enveloppe de tout composant du titre », while
  // the title named it.
  it('refuses a component out of the title and a fact the state proves false; refused twice, the stop goes to the supervisor', () => {
    const id = 'demo-admission-faits';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', RIEN);
    scenario(id, `${REGULATEUR}-1`, regulateur(depuis('developpeur', '999-absent', 'Le double.')));
    scenario(
      id,
      `${REGULATEUR}-2`,
      regulateur({
        decision: 'MONTE',
        question: 'Le classeur est hors du titre : faut-il l’ajouter ?',
        faits: [{ sujet: 'hors-titre', composant: '030-binder' }],
      })
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    expect(sessions(id, REGULATEUR)).toBe(2);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({ raison: 'sans-livraison', regulateur: null });
    expect(e?.rapport).toContain('999-absent');
    expect(e?.rapport).toContain('hors-titre 030-binder');
    expect(refus(id)).toHaveLength(2);
    expect(commentaires(id).some(t => / · regulateur : MONTE/.test(t))).toBe(false);
  });

  it('after a criterion added to the description, admits only a relaunch from a testwriter', () => {
    const id = 'demo-admission-critere';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', RIEN);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The regulator adds a criterion, as its skill writes it (`bd update <id> -d`), then relaunches
    // the developpeur.
    const ajout = `d=$(cat <<'FIN'
${DESCRIPTION}
2. \`mesure(0)\` rend 0.
FIN
)
(cd "$racine" && bd update "$ticket" -d "$d")
`;
    scenario(
      id,
      `${REGULATEUR}-1`,
      regulateur({ decision: 'RELANCE --reprendre', contexte: 'Écris le double.' }, ajout)
    );
    scenario(
      id,
      `${REGULATEUR}-2`,
      regulateur(depuis('testwriter', '000-forms', 'Le critère 2 : mesure(0) rend 0.'))
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, REGULATEUR)).toBe(2);
    expect(sessions(id, 'testwriter')).toBe(2);
    expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain('critère');
    expect(essai(id, 'testwriter-2.prompt')).toContain('Le critère 2 : mesure(0) rend 0.');
    expect(ordre(id).slice(0, 5)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      REGULATEUR,
      REGULATEUR,
      'testwriter packages/forms',
    ]);
  });

  // D13, D14, D20, D21 of 320.3: the same RELANCE on the same stop, with no new fact.
  it('refuses a RELANCE identical to the one before on the same stop, without a new fact', () => {
    const id = 'demo-admission-identique';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', RIEN);
    scenario(id, 'developpeur-3', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The first session leaves a trace in the copy, out of the component: the stop that comes back
    // is the same, but not on the same copy.
    scenario(
      id,
      `${REGULATEUR}-1`,
      regulateur(depuis('developpeur', '000-forms', 'Écris le double.'), 'touch note.txt\n')
    );
    scenario(
      id,
      `${REGULATEUR}-2`,
      regulateur(depuis('developpeur', '000-forms', 'Écris le double.'))
    );
    scenario(
      id,
      `${REGULATEUR}-3`,
      regulateur(depuis('developpeur', '000-forms', 'mesure rend 2 * x.'))
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, REGULATEUR)).toBe(3);
    expect(valeur(args(id, REGULATEUR, 3), '--resume')).toBe(
      valeur(args(id, REGULATEUR, 2), '--session-id')
    );
    expect(essai(id, `${REGULATEUR}-3.prompt`)).toContain('la même RELANCE');
    expect(refus(id)).toHaveLength(1);
    expect(essai(id, 'developpeur-3.prompt')).toContain('mesure rend 2 * x.');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});
