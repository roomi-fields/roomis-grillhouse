import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai, sortie } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs) writes the ticket's bilan at each of its ends
// (grillhouse-3uv.89, L8): at « integre », and on a stop it hands to the supervisor, one short line
// of figures at the ticket, `Circuit · bilan : …` (scripts/bilan.mjs), and the bilan
// kept in the main tree, `.claude/worktrees/<ticket>.bilan.json`, which the next ticket's bilan
// compares itself with. The circuit keeps with its results the launch of each session it opens
// (`lancement`, its role and its session id) and each end of a run on a stop (`montee`), which the
// bilan reads (grillhouse-3uv.92.10).
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-bilan-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { REPO, revenirAuDebut, ticket, scenario, circuit, bilans, commentaires, entrees } =
  circuitEssai(ESSAIS);
const REGISTRE = path.join(ESSAIS, 'registre.jsonl');
const garde = (id: string) =>
  JSON.parse(readFileSync(path.join(REPO, '.claude/worktrees', `${id}.bilan.json`), 'utf8')) as {
    ticket: string;
    statut: string;
    etapes: Record<string, number>;
  };

describe.runIf(canWrap)('the bilan at the end of the circuit', { timeout: 300_000 }, () => {
  // Each test starts from the main of the trial, the bilans kept beside it.
  afterEach(revenirAuDebut);

  it('writes the bilan of an integrated lot, after the queue’s line, with no base before it', () => {
    const id = 'demo-bilan';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id], { GRILLHOUSE_REGISTRE: REGISTRE });
    expect(r.status, sortie(r)).toBe(0);
    const b = bilans(id);
    expect(b).toHaveLength(1);
    expect(b[0].author).toBe('circuit');
    expect(b[0].text).toMatch(
      /^Circuit · bilan : intégré en \d+ min ; \d+ min perdues \(\d+ %\) ; \d+ séances/
    );
    expect(b[0].text).toContain('- travail resté au lot : ');
    expect(b[0].text).toContain("Aucun bilan d'avant dans ce projet : pas de base.");
    // It closes the history: the queue's line comes before it.
    expect(commentaires(id).at(-1)).toMatch(/^Circuit · file : intégré : /);
    expect(garde(id)).toMatchObject({
      ticket: id,
      statut: 'intégré',
      etapes: { 'Preuve du rouge': 1, 'Passe finale': 1, Commit: 1 },
    });
    // Each session opened under the id the circuit set; no end on a stop.
    const e = entrees(id);
    const lancees = e.flatMap(x =>
      x.lancement ? [x.lancement as { role: string; seance: string }] : []
    );
    expect(lancees.map(x => x.role)).toEqual(
      expect.arrayContaining(['testwriter', 'developpeur', 'relecteur'])
    );
    for (const l of lancees) {
      expect(l.seance).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(e.some(x => x.montee)).toBe(false);
  });

  it('writes the bilan of a stop handed to the supervisor, compared with the bilan before', () => {
    const id = 'demo-bilan-arret';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // A developpeur who changes nothing: the stop goes up to the supervisor.
    scenario(id, 'developpeur', "passation 'Code écrit.'\n");
    const r = circuit([id], { GRILLHOUSE_REGISTRE: REGISTRE });
    expect(r.status, sortie(r)).toBe(ARRETS['sans-livraison']);
    const b = bilans(id);
    expect(b).toHaveLength(1);
    expect(b[0].text).toMatch(
      new RegExp(`^Circuit · bilan : arrêt sans-livraison \\(${ARRETS['sans-livraison']}\\) en `)
    );
    expect(b[0].text).toMatch(/^Arrêts : 1 sans-livraison\.$/m);
    expect(b[0].text).toMatch(/^Face au bilan de demo-bilan : mur \d+ → \d+ min, /m);
    expect(garde(id).statut).toBe(`arrêt sans-livraison (${ARRETS['sans-livraison']})`);
    // The end of the run on its stop, kept before the bilan that reads it.
    expect(entrees(id).filter(x => x.montee)).toEqual([
      expect.objectContaining({
        role: 'circuit',
        montee: { code: ARRETS['sans-livraison'], raison: 'sans-livraison', qui: 'superviseur' },
      }),
    ]);
  });
});
