import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { arbitrageTranche, estArbitrage } from '../../scripts/consommateurs-arbitres.mjs';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the regulator's
// arbitrage is written by its sheet (grillhouse-3uv.92.7, critère 1). What it settles alone (its
// `arbitrage`, with its source) and the criterion it adds (`critere`) are fields of its sheet; the
// circuit writes the arbitrage at the ticket, where scripts/consommateurs-arbitres.mjs reads it,
// and adds the criterion, numbered, at the end of the description; the regulator writes nothing at
// the ticket itself. Witness: BPScript 320.4, `bd comments add` of a multi-line arbitrage refused
// twice in three (a line opening on `#`), one MONTE and 9 min of the supervisor's wait.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-arbitrage-');
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
  commentaires,
} = circuitEssai(ESSAIS);

const REGULATEUR = 'regulateur';
// A developpeur session that changes no file: the circuit stops at « sans-livraison ».
const RIEN = "passation 'Rien à écrire.'\n";
// A scenario's sheet, its quotes escaped for the shell.
const fiche = (f: Record<string, unknown>) =>
  `fiche '${JSON.stringify(f).replaceAll("'", "'\\''")}'\n`;
const description = (id: string) =>
  (JSON.parse(readFileSync(path.join(BEADS, `${id}.json`), 'utf8')) as { description: string }[])[0]
    .description;
const ARBITRAGE =
  '`binder` lit `duree` : la lettre du critère 1 le couvre.\n\n### Verdict — tranché — la lettre du critère 1';
const CRITERE = '`mesure(0)` rend 0.';
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;

describe.runIf(canWrap)(
  "critère 1 — the regulator's arbitrage is written by its sheet",
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('the circuit writes the arbitrage of its sheet at the ticket, which consommateurs-arbitres reads as settled, and adds its criterion, numbered, to the description; the regulator holds no right to write at the ticket', () => {
      const id = 'demo-arbitrage-par-fiche';
      ticket(id, '000-forms');
      scenario(id, 'testwriter-1', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', RIEN);
      scenario(
        id,
        REGULATEUR,
        fiche({
          decision: 'RELANCE --depuis',
          depuis: [{ role: 'testwriter', composant: '000-forms', contexte: 'Teste le critère 2.' }],
          arbitrage: ARBITRAGE,
          critere: CRITERE,
        })
      );
      scenario(id, 'testwriter-2', `passation 'Critère 2 testé.'\n`);
      scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(sessions(id, REGULATEUR)).toBe(1);
      // The arbitrage at the ticket, written by the circuit, where the guard reads it settled.
      const tous = commentaires(id).map(text => ({ text }));
      const arbitrage = tous.find(c => estArbitrage(c.text));
      expect(arbitrage?.text).toBe(
        `Circuit · packages/forms · regulateur : arbitrage — ${ARBITRAGE}`
      );
      expect(arbitrageTranche(tous, arbitrage!)).toBe(true);
      // The criterion at the end of the description, numbered after the last one.
      expect(description(id).trimEnd().split('\n').at(-1)).toBe(`2. ${CRITERE}`);
      expect(essai(id, 'testwriter-2.prompt')).toContain(`2. ${CRITERE}`);
      // The regulator's session may not write at the ticket.
      const { deny } = (
        JSON.parse(valeur(args(id, REGULATEUR, 1), '--settings') ?? '{}') as {
          permissions: { deny: string[] };
        }
      ).permissions;
      expect(deny).toEqual(expect.arrayContaining(['Bash(bd comments add*)', 'Bash(bd update*)']));
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });

    it('refuses a sheet whose criterion does not go to the testwriter first, and writes neither its arbitrage nor its criterion', () => {
      const id = 'demo-arbitrage-critere-refuse';
      ticket(id, '000-forms');
      scenario(id, 'testwriter-1', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', RIEN);
      const refusee = fiche({
        decision: 'RELANCE --reprendre',
        contexte: 'Écris le double.',
        arbitrage: ARBITRAGE,
        critere: CRITERE,
      });
      scenario(id, `${REGULATEUR}-1`, refusee);
      scenario(id, `${REGULATEUR}-2`, refusee);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
      expect(sessions(id, REGULATEUR)).toBe(2);
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /regulateur : décision refusée — un critère ajouté part au testwriter/
        )
      );
      expect(commentaires(id).filter(t => estArbitrage(t))).toEqual([]);
      expect(description(id)).not.toContain(CRITERE);
    });
  }
);
