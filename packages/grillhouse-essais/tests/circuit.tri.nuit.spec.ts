// @poste: l'enveloppe bwrap, un serveur Temporal
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';
import { enProcessus } from './cadre.js';

const schemaDeFiche = enProcessus<unknown>('scripts/resultats.mjs', 'schemaDeFiche');

// The tri of the discoveries at the end of a ticket, as Chromium and Mozilla give each new report a
// verdict before it is filed. After the queue brings the lot onto main, the circuit launches the
// explorateur (Sonnet, out of the envelope, with the rights of reading) on the discoveries the
// sheets of the ticket filed; its sheet gives each one its verdict and its piece: traitee, doublon,
// sans-suite, a-porter or non-confirmee. Each verdict is written at the ticket of its discovery,
// its label set there; an a-porter or a non-confirmee reopens under `a-valider`.
// This file keeps the one whole run: the queue closes the ticket, its reason names the commit, the
// session of the tri leaves on main with its options, the verdicts are written, the bilan counts
// them. Each rule of the tri is proven small, in tests/unit of the package grillhouse
// (activites.tri-des-decouvertes.spec.ts, effets.spec.ts, droits.spec.ts, resultats.spec.ts).
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-tri-');
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
  entrees,
  bilans,
  commentaires,
} = circuitEssai(ESSAIS);

// The value that follows <option> in the arguments of a session.
const valeur = (a: string[], option: string) => a[a.indexOf(option) + 1];
// A ticket of the stand-in bd: its status, its labels, its comments' texts.
const leTicket = (id: string) =>
  (
    JSON.parse(readFileSync(path.join(BEADS, `${id}.json`), 'utf8')) as {
      status: string;
      labels: string[];
      close_reason?: string;
    }[]
  )[0];
const sesCommentaires = (id: string) => {
  try {
    return readFileSync(path.join(BEADS, `${id}.comments.jsonl`), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => (JSON.parse(l) as { text: string }).text);
  } catch {
    return [];
  }
};
// The developpeur's scenario, its code right, its sheet carrying the discoveries <sujets>.
const avecDecouvertes = (...sujets: string[]) =>
  `${CODE_JUSTE}passation 'Code écrit.'\nfiche '${JSON.stringify({
    statut: 'FAIT',
    decouvertes: sujets.map(sujet => ({
      sujet,
      corps: `${sujet} : packages/forms/src/index.mjs:1`,
    })),
  })}'\n`;

describe.runIf(canWrap)(
  'the tri of the discoveries at the end of a ticket',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('after the queue, the explorateur sorts each discovery; each verdict at its ticket, its label set, an a-porter and a non-confirmee reopened under a-valider', () => {
      const id = 'demo-tri';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(
        id,
        'developpeur',
        avecDecouvertes('La mesure de zéro', 'La mesure négative', 'Le nom de la mesure')
      );
      // The lot is on main when the tri plays: its piece reads the code there.
      scenario(
        id,
        'explorateur-2',
        `git log --oneline -1 > "$e/tri.main"\nfiche '${JSON.stringify({
          verdicts: [
            {
              decouverte: `${id}.1`,
              verdict: 'a-porter',
              texte: 'mesure(0) rend 0, que le classeur divise.',
              piece: 'packages/forms/src/index.mjs:1 rend 2 * x.',
            },
            {
              decouverte: `${id}.2`,
              verdict: 'non-confirmee',
              texte: 'Que rend mesure(-1) ? Une sonde par l’entrée construite le dirait.',
            },
            {
              decouverte: `${id}.3`,
              verdict: 'sans-suite',
              texte: 'hypothétique : aucun usage ne lit ce nom.',
            },
          ],
        })}'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
      expect(leTicket(id).status).toBe('closed');
      // One session of the tri, the explorateur's, after the queue, on the lot on main.
      expect(sessions(id, 'explorateur')).toBe(2);
      expect(essai(id, 'tri.main')).toContain(id);
      const a = args(id, 'explorateur', 2);
      expect(valeur(a, '--agent')).toBe('explorateur');
      expect(valeur(a, '--model')).toBe('sonnet');
      expect(JSON.parse(valeur(a, '--json-schema'))).toEqual(schemaDeFiche('tri'));
      const prompt = essai(id, 'explorateur-2.prompt');
      for (const n of [1, 2, 3]) {
        expect(prompt).toContain(`${id}.${n}`);
      }
      expect(prompt).toContain('La mesure négative');
      // The commit the queue integrated for this ticket, the one its closure names.
      const integre = String(leTicket(id).close_reason).replace('intégré : ', '');
      expect(integre).toMatch(/^[0-9a-f]{7}$/);
      expect(prompt).toContain(`SON COMMIT SUR MAIN : ${integre} `);
      // The rights of reading, the build of a package among them.
      const reglages = JSON.parse(valeur(a, '--settings')) as {
        permissions: { allow: string[]; deny: string[] };
      };
      expect(reglages.permissions.allow).toContain('Bash(npm run build -- --filter=*)');
      expect(reglages.permissions.deny).toContain('Bash(bd comments add*)');
      // Each verdict at the ticket of its discovery, its label set there.
      const [porter, nonConfirmee, sansSuite] = [1, 2, 3].map(n => `${id}.${n}`);
      expect(leTicket(porter).labels).toEqual(
        expect.arrayContaining(['decouverte', 'a-porter', 'a-valider'])
      );
      expect(sesCommentaires(porter)).toContainEqual(
        expect.stringMatching(
          /^Circuit · tri : a-porter — mesure\(0\) rend 0, que le classeur divise\. \(packages\/forms\/src\/index\.mjs:1 rend 2 \* x\.\)/
        )
      );
      // An a-porter and a non-confirmee reopen under a-valider; the others stay closed.
      expect(leTicket(porter).status).toBe('open');
      expect(leTicket(nonConfirmee).status).toBe('open');
      expect(leTicket(nonConfirmee).labels).toEqual(
        expect.arrayContaining(['non-confirmee', 'a-valider'])
      );
      expect(leTicket(sansSuite).status).toBe('closed');
      expect(leTicket(sansSuite).labels).toContain('sans-suite');
      expect(leTicket(sansSuite).labels).not.toContain('a-valider');
      expect(sesCommentaires(sansSuite)).toContainEqual(
        expect.stringContaining('sans-suite — hypothétique : aucun usage ne lit ce nom.')
      );
      // The question a non-confirmee lacks is written at its ticket.
      expect(sesCommentaires(nonConfirmee)).toContainEqual(
        expect.stringContaining('non-confirmee — Que rend mesure(-1) ?')
      );
      // At the ticket, the tri in one line; its end kept with the circuit's results.
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(/^Circuit · tri : 3 découvertes triées/)
      );
      expect(entrees(id)).toContainEqual(
        expect.objectContaining({
          etape: 'tri',
          tri: {
            decouvertes: 3,
            conforme: true,
            verdicts: { 'sans-suite': 1, 'a-porter': 1, 'non-confirmee': 1 },
          },
        })
      );
      // The bilan counts the session of the tri and its verdicts.
      expect(bilans(id).at(-1)?.text).toContain(
        '- tri des découvertes : 1 séance, 3 découvertes (1 sans-suite, 1 a-porter, 1 non-confirmee)'
      );
    });
  }
);
