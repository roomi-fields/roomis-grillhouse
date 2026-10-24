import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ecrire, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// grillhouse-3uv.95.6 (decision 6 of 3uv.95): the circuit of a ticket, as a merge request: one
// author of the tests and one of the code for the whole ticket, one CI on the whole, one review.
// Witness: BP 320.9, 16 components, each step played again for each, 118 min of green steps
// played again; and the finding « `exemplar` reste dans 040 », sent back by six reviews, lost at
// each relaunch. The trial repository and its stand-ins: ./circuit-essai.ts.

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
  args,
  etat,
  ordre,
  commentaires,
  historique,
} = circuitEssai(ESSAIS);

// What the one testwriter and the one developpeur of a ticket on forms and binder write: a red
// test, then the code, in each package of the plan.
const DANS_LE_PLAN = (script: string) =>
  `for c in packages/forms packages/binder; do\n${script}done\n`;

describe.runIf(canWrap)(
  'the circuit of a ticket, one session per agent',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('critère 1 — one testwriter and one developpeur carry the whole ticket, in the envelope of every package of its plan, its checks on the whole plan', () => {
      const id = 'demo-ticket';
      ticket(id, '000-forms, 030-binder');
      scenario(id, 'testwriter', `${DANS_LE_PLAN(ECRIT_ROUGE)}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${DANS_LE_PLAN(CODE_JUSTE)}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
      // Each session writes the whole plan, under the author of its role alone.
      for (const role of ['testwriter', 'developpeur']) {
        expect(essai(id, `${role}-1.paquets`), role).toBe('packages/forms:packages/binder');
        expect(essai(id, `${role}-1.acteur`), role).toBe(role);
      }
      // The proof plays every test of the lot; the checks, the tests and the packages of the plan,
      // its guards in the envelope of the whole plan; then the final pass, out of the envelope.
      const preuve = commentaires(id).find(t => t.startsWith('Circuit · preuve : '));
      expect(preuve).toContain('packages/forms/test/mesure.test.mjs');
      expect(preuve).toContain('packages/binder/test/mesure.test.mjs');
      const [controles, finale] = commentaires(id).filter(t =>
        t.startsWith('Circuit · controles : ')
      );
      expect(controles).toContain('npm test -- packages/binder');
      expect(controles).toContain('npm test -- packages/forms');
      expect(controles).toContain(
        'GRILLHOUSE_ENVELOPPE=packages/forms:packages/binder npm run gardes'
      );
      expect(finale).toContain('verts : npm run verifier');
      const gardes = essai(id, 'gardes').split('\n').slice(0, -1);
      expect(gardes[0]).toBe('packages/forms:packages/binder');
      expect(gardes.slice(1).every(g => g === '')).toBe(true);
      expect(historique(id)).toEqual([
        'testwriter',
        'preuve',
        'developpeur',
        'controles',
        'controles',
        'relecture',
        'integration',
        'file',
      ]);
      const e = etat(id);
      expect(e).toMatchObject({
        etape: 'integre',
        code: 0,
        paquets: ['packages/forms', 'packages/binder'],
      });
      for (const champ of ['composant', 'composants', 'dernier', 'renvois', 'atteints']) {
        expect(e, champ).not.toHaveProperty(champ);
      }
    });

    it('critère 1 — a red the final pass alone sees goes to the one developpeur; three sessions of the final pass, the last on the strong model, then « controles »', () => {
      const id = 'demo-ticket-finale';
      ticket(id, '000-forms, 030-binder');
      scenario(id, 'testwriter', `${DANS_LE_PLAN(ECRIT_ROUGE)}passation 'Tests écrits, rouges.'\n`);
      scenario(
        id,
        'developpeur-1',
        `${DANS_LE_PLAN(CODE_JUSTE)}touch packages/binder/garde-finale.txt\npassation 'Code écrit.'\n`
      );
      scenario(id, 'developpeur', `touch packages/binder/un-tour-$RANDOM\npassation 'Un tour.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.controles);
      expect(ordre(id)).toEqual([
        'testwriter',
        'developpeur',
        'developpeur',
        'developpeur',
        'developpeur',
      ]);
      // The developpeur relaunched by the final pass receives its red, which names its file.
      const consigne = essai(id, 'developpeur-2.prompt');
      expect(consigne).toContain('packages/forms/src/index.mjs:1');
      expect(consigne).toContain(
        'Contrôles de la passe finale, hors enveloppe, sur la copie entière'
      );
      const fort = args(id, 'developpeur', 4);
      expect(fort[fort.indexOf('--model') + 1]).toBe('opus');
      expect(args(id, 'developpeur', 3)).not.toContain('--model');
      expect(etat(id)).toMatchObject({ etape: 'controles', raison: 'controles', finale: true });
      expect(etat(id)?.question).toMatchObject({ arret: 'controles', qui: 'superviseur' });
    });

    // Witness: BP 320.9, C11 (rapport l. 411-418). The blocking finding « `exemplar` reste dans
    // 040 », role developpeur, sent back by the reviews 1 to 6: at each stop elsewhere, the relaunch
    // replaced the findings pending, and no proof launched the developpeur of 040 again.
    it('critère 2 — a finding of the reviewer stays open across every relaunch: a stop, then --depuis, still carry it to its agent, who is launched for it', () => {
      const id = 'demo-ticket-constats';
      ticket(id, '000-forms');
      scenario(id, 'testwriter-1', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      scenario(
        id,
        'relecteur-1',
        `fiche '${JSON.stringify({
          verdict: 'RENDU',
          constats: [
            {
              titre: 'packages/forms/src/index.mjs:1 — exemplar reste',
              genre: 'bloquant',
              regle: 'critère 1',
              role: 'developpeur',
              corps: 'exemplar reste dans forms.',
            },
            {
              titre: 'packages/forms/test/mesure.test.mjs:3 — le cas de zéro manque',
              genre: 'bloquant',
              regle: 'critère 1',
              role: 'testwriter',
              corps: 'Aucun test ne mesure zéro.',
            },
          ],
        })}'\n`
      );
      // The testwriter relaunched by the RENDU writes nothing: three proofs refused, the stop.
      scenario(id, 'testwriter', "passation 'Rien écrit.'\n");
      const r1 = circuit([id]);
      expect(r1.status, sortie(r1)).toBe(ARRETS.preuve);
      expect(ordre(id)).toEqual([
        'testwriter',
        'developpeur',
        'relecteur',
        'testwriter',
        'testwriter',
        'testwriter',
      ]);
      // Each relaunched testwriter receives its finding; the state keeps both, open.
      for (const n of [2, 3, 4]) {
        expect(essai(id, `testwriter-${n}.prompt`), `testwriter-${n}`).toContain(
          'le cas de zéro manque'
        );
      }
      expect(etat(id)?.constats.map(c => c.role)).toEqual(['developpeur', 'testwriter']);
      // The supervisor's answer: the testwriter again, whose tests are green before the code.
      scenario(
        id,
        'testwriter',
        `fiche '${JSON.stringify({
          statut: 'FAIT',
          verts_attendus: [
            {
              fichier: 'packages/forms/test/mesure.test.mjs',
              test: 'critère 1 — mesure rend le double',
              raison: 'le code rend déjà le double',
            },
          ],
        })}'\n`
      );
      scenario(id, 'relecteur', `fiche '{"verdict":"ACCEPTÉ"}'\n`);
      const r2 = circuit([id, '--depuis', 'testwriter', '--contexte', 'Le zéro est mesuré.']);
      expect(r2.status, sortie(r2)).toBe(0);
      expect(essai(id, 'testwriter-5.prompt')).toContain('le cas de zéro manque');
      // The proof has no red, and the finding still open launches the developpeur, who receives it.
      expect(ordre(id).slice(6)).toEqual(['testwriter', 'developpeur', 'relecteur']);
      expect(essai(id, 'developpeur-2.prompt')).toContain('exemplar reste dans forms.');
      expect(essai(id, 'developpeur-2.prompt')).not.toContain('le cas de zéro manque');
      // The review that accepts the lot closes the findings.
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0, constats: [] });
    });

    it('critère 2 — a finding goes straight to the agent it names: the developpeur, without a testwriter', () => {
      const id = 'demo-ticket-droit';
      ticket(id, '000-forms, 030-binder');
      scenario(id, 'testwriter', `${DANS_LE_PLAN(ECRIT_ROUGE)}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${DANS_LE_PLAN(CODE_JUSTE)}passation 'Code écrit.'\n`);
      scenario(
        id,
        'relecteur-1',
        `fiche '${JSON.stringify({
          verdict: 'RENDU',
          constats: [
            {
              titre: 'packages/binder/src/index.mjs:1 — un nom flou',
              genre: 'bloquant',
              regle: 'critère 1',
              role: 'developpeur',
              corps: 'Le nom ne dit pas la mesure.',
            },
          ],
        })}'\n`
      );
      scenario(id, 'relecteur', `fiche '{"verdict":"ACCEPTÉ"}'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual([
        'testwriter',
        'developpeur',
        'relecteur',
        'developpeur',
        'relecteur',
      ]);
      expect(essai(id, 'developpeur-2.prompt')).toContain('Le nom ne dit pas la mesure.');
    });

    // The findings carried from one RENDU to the next, as the threads of a review: a thread the
    // next review resolves closes, one it does not restate stays open, a new one opens.
    it('critère 2 — from one RENDU to the next, a finding lifted closes, one not restated stays open, a new one joins it', () => {
      const id = 'demo-ticket-deux-rendus';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      scenario(
        id,
        'developpeur-2',
        `printf '// A\\n' >> $c/src/index.mjs\npassation 'A traité.'\n`
      );
      // The third session asks a question: the circuit stops, the state keeps what stays open.
      scenario(
        id,
        'developpeur-3',
        `passation 'Une question.'\nfiche '{"statut":"BESOIN","question":"que rend mesure de 0 ?"}'\n`
      );
      const constat = (lettre: string) => ({
        titre: `packages/forms/src/index.mjs — constat ${lettre}`,
        genre: 'bloquant',
        regle: 'critère 1',
        role: 'developpeur',
        corps: `Le corps du constat ${lettre}.`,
      });
      scenario(
        id,
        'relecteur-1',
        `fiche '${JSON.stringify({ verdict: 'RENDU', constats: [constat('A'), constat('B')] })}'\n`
      );
      scenario(
        id,
        'relecteur-2',
        `fiche '${JSON.stringify({
          verdict: 'RENDU',
          suivi: [{ titre: constat('A').titre, etat: 'levé', preuve: 'A est traité.' }],
          constats: [constat('C')],
        })}'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.besoin);
      expect(ordre(id)).toEqual([
        'testwriter',
        'developpeur',
        'relecteur',
        'developpeur',
        'relecteur',
        'developpeur',
      ]);
      expect(etat(id)?.constats.map(c => c.titre)).toEqual([
        constat('B').titre,
        constat('C').titre,
      ]);
      const consigne = essai(id, 'developpeur-3.prompt');
      expect(consigne).toContain('Le corps du constat B.');
      expect(consigne).toContain('Le corps du constat C.');
      expect(consigne).not.toContain('Le corps du constat A.');
    });

    // Remarque A of the review of 3uv.95.6: a run that starts over, neither resumed nor from a
    // step, carries no finding of the runs before it.
    it('critère 2 — a run that starts over carries no finding open before it', () => {
      const id = 'demo-ticket-repart';
      ticket(id, '000-forms');
      scenario(id, 'testwriter-1', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      scenario(
        id,
        'relecteur-1',
        `fiche '${JSON.stringify({
          verdict: 'RENDU',
          constats: [
            {
              titre: 'packages/forms/test/mesure.test.mjs:3 — le cas de zéro manque',
              genre: 'bloquant',
              regle: 'critère 1',
              role: 'testwriter',
              corps: 'Aucun test ne mesure zéro.',
            },
          ],
        })}'\n`
      );
      scenario(id, 'testwriter', "passation 'Rien écrit.'\n");
      const r1 = circuit([id]);
      expect(r1.status, sortie(r1)).toBe(ARRETS.preuve);
      expect(etat(id)?.constats).toHaveLength(1);
      const r2 = circuit([id]);
      expect(r2.status, sortie(r2)).toBe(ARRETS.preuve);
      expect(essai(id, 'testwriter-5.prompt')).not.toContain('Aucun test ne mesure zéro.');
      expect(etat(id)?.constats).toEqual([]);
    });

    // Witness: BPScript (320.2.4.5.1), whose circuit stopped at the proof of its first component;
    // `--depuis developpeur spec` played only the checks of the nine components after it.
    it('critère 3 — --depuis names a step for the whole ticket: the developpeur, once, on every package of the plan', () => {
      const id = 'demo-ticket-depuis';
      ticket(id, '000-forms, 030-binder');
      for (const n of [1, 2, 3]) {
        scenario(id, `testwriter-${n}`, "passation 'Rien écrit.'\n");
      }
      const r1 = circuit([id]);
      expect(r1.status, sortie(r1)).toBe(ARRETS.preuve);
      const avec = circuit([id, '--depuis', 'developpeur', '000-forms', '--contexte', 'x']);
      expect(avec.status, sortie(avec)).toBe(2);
      expect(sortie(avec)).toContain('--depuis');
      scenario(id, 'developpeur', `${DANS_LE_PLAN(CODE_JUSTE)}passation 'Code écrit.'\n`);
      const r2 = circuit([
        id,
        '--depuis',
        'developpeur',
        '--contexte',
        'Le double, sans test neuf.',
      ]);
      expect(r2.status, sortie(r2)).toBe(0);
      expect(ordre(id)).toEqual([
        'testwriter',
        'testwriter',
        'testwriter',
        'developpeur',
        'relecteur',
      ]);
      expect(essai(id, 'developpeur-1.prompt')).toContain('CONTEXTE : Le double, sans test neuf.');
      expect(essai(id, 'developpeur-1.paquets')).toBe('packages/forms:packages/binder');
      expect(sessions(id, 'developpeur')).toBe(1);
    });

    it('launches the developpeur directly on a plan whose packages carry no test: no testwriter, no proof', () => {
      const id = 'demo-ticket-sans-tests';
      const copie = ticket(id, 'spec');
      // A plan of documentation alone: no package, so no script test:vitest.
      ecrire(path.join(copie, 'spec/mesure.md'), '# La mesure\n');
      scenario(
        id,
        'developpeur',
        `printf 'La mesure rend le double.\\n' >> spec/mesure.md\npassation 'Spécification écrite.'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual(['developpeur', 'relecteur']);
      expect(historique(id)).not.toContain('preuve');
      const ligne = commentaires(id).find(t => t.startsWith('Circuit · testwriter : '));
      expect(ligne).toContain('aucun test');
      expect(essai(id, 'developpeur-1.prompt')).toContain('ne porte aucun test');
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });

    it('a finding that names a component is out of the reviewer’s sheet: its schema refuses it', () => {
      const id = 'demo-ticket-schema';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      scenario(
        id,
        'relecteur',
        `fiche '${JSON.stringify({
          verdict: 'RENDU',
          constats: [
            {
              titre: 'x',
              genre: 'bloquant',
              regle: 'critère 1',
              role: 'developpeur',
              composant: '000-forms',
              corps: 'y',
            },
          ],
        })}'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS['sans-fiche']);
      expect(etat(id)?.rapport).toContain('composant : hors du schéma');
    });
  }
);
