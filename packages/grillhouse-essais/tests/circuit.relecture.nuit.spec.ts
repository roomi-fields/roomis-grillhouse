// @equipee: l'enveloppe bwrap, un serveur Temporal
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { lire, sortie, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.*.spec.ts), the one whole run of
// its review and its integration: the reviewer, out of the envelope, from the second template; its
// ACCEPTÉ; the lot built from the copy, committed on agent/<ticket>, the branch in the queue, the
// ticket closed, the bilan after the queue's line, the totals of the passes. Each rule of the
// review (the verdict, the findings sent back, the stops, the conformity of each element) is proven
// small, in tests/unit of the package grillhouse; this file keeps the run that joins them.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  REPO,
  BEADS,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  args,
  etat,
  ordre,
  gitRepo,
  commentaires,
  historique,
  tous,
  banc,
  travailleurAvec,
} = circuitEssai(ESSAIS);
// The register of the trial, which the acts of the worker read to write the bilan.
const REGISTRE = path.join(ESSAIS, 'registre.jsonl');
if (canWrap) {
  beforeAll(() => travailleurAvec({ GRILLHOUSE_REGISTRE: REGISTRE }), 120_000);
}

// The permissions of the settings the arguments <a> of a session carry (`--settings`,
// scripts/droits.mjs).
const permissions = (a: string[]) =>
  (
    JSON.parse(a[a.indexOf('--settings') + 1] ?? '{}') as {
      permissions?: { allow: string[]; deny: string[] };
    }
  ).permissions ?? { allow: [], deny: [] };

// The tickets in the queue of integration, as its workflow gives them (`file:<racine>`).
const enFile = () => banc().laFile();
const ticketDe = (id: string) =>
  (JSON.parse(lire(path.join(BEADS, `${id}.json`))) as { status?: string }[])[0];

describe.runIf(canWrap)('the review and the integration', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('ACCEPTÉ leads to the integration: one commit on agent/<ticket>, the branch in the queue, the ticket closed, the bilan after the queue’s line, the totals of the passes kept', () => {
    const id = 'demo-accepte';
    const totaux = path.join(REPO, '.git', 'grillhouse', 'avancement.json');
    rmSync(totaux, { force: true });
    const copie = ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    // The reviewer's session: claude in the ticket's copy, out of the envelope, on its role.
    expect(essai(id, 'relecteur-1.pwd').trim()).toBe(copie);
    const a = args(id, 'relecteur', 1);
    expect(a[a.indexOf('--agent') + 1]).toBe('relecteur');
    expect(a[a.indexOf('--model') + 1]).toBe('sonnet');
    // Without a prompt, it may run every command its skill runs: a refused one leaves no verdict.
    expect(a[a.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    // Its rights are the commands its skill names (scripts/droits.mjs, tests/unit/droits.spec.ts):
    // the reads of the lot, the targeted tests, the guards, the index; not the ticket, whose
    // criteria it reads in the claims file at the step its skill sets.
    const { allow } = permissions(a);
    for (const regle of [
      'Bash(git -C * diff*)',
      'Bash(npm test *)',
      'Bash(npm run verifier -- --gardes*)',
      'Bash(npx grillhouse index-interfaces --publie *)',
      'Bash(codegraph explore *)',
      'mcp__rtfm__rtfm_search',
    ]) {
      expect(allow).toContain(regle);
    }
    expect(allow.filter(r => /^Bash\(bd (show|comments)/.test(r))).toEqual([]);
    expect(a[a.indexOf('--setting-sources') + 1]).toBe('project,local');
    expect(a).toContain('--strict-mcp-config');
    // Its instruction: the second template, the lot and the circuit's reports; the criteria are in
    // the claims file alone (tests/unit/circuit.consigne.spec.ts).
    const consigne = essai(id, 'relecteur-1.prompt');
    expect(consigne).toContain(`Tu es le relecteur du dépôt ${REPO}.`);
    expect(consigne).toContain(`TON TICKET : ${id} — La mesure`);
    expect(consigne).not.toContain('1. `mesure` rend le double de sa valeur.');
    expect(consigne).toContain('le lot de tests : packages/forms/test/mesure.test.mjs');
    expect(consigne).toContain('le lot de code : packages/forms/src/index.mjs');
    expect(consigne).toContain('Circuit · preuve');
    // The final pass on the band of the lot, never the whole repository (grillhouse-44b.13).
    expect(consigne).toMatch(
      /controles : verts : npm run verifier -- --filter=\.\.\.\[[0-9a-f]+\.\.\.[0-9a-f]+\] --filter=\/\/\./
    );
    expect(consigne).not.toContain('{{');
    // The claims file: the description, in a folder the session may read.
    const affirmations = /LE FICHIER D'AFFIRMATIONS, [^:]*: (\S+)/.exec(consigne)?.[1] ?? '';
    expect(path.basename(affirmations)).toBe('affirmations.md');
    expect(a[a.indexOf('--add-dir') + 1]).toBe(path.dirname(affirmations));
    // The integration: the commit holds the testwriter's lot and the developpeur's, under the
    // message the circuit writes; the copy is gone; the queue brings it onto main and closes the
    // ticket.
    const commit = gitRepo('show', '--name-only', '--format=%s', 'main');
    expect(commit.split('\n').filter(Boolean)).toEqual([
      `feat(000-forms): La mesure (${id})`,
      'packages/forms/src/index.mjs',
      'packages/forms/test/mesure.test.mjs',
    ]);
    expect(gitRepo('log', '-1', '--format=%B', 'main')).toContain('Co-Authored-By: Claude');
    expect(existsSync(copie)).toBe(false);
    expect(enFile()).toEqual([]);
    expect(gitRepo('branch', '--list', `agent/${id}`)).toBe('');
    expect(historique(id).slice(-3)).toEqual(['relecture', 'integration', 'file']);
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(/^Circuit · integration : .*la branche est en file\.$/)
    );
    // The ticket closed by the queue once the CI of its branch is green, main pushed to origin.
    expect(ticketDe(id)).toMatchObject({ status: 'closed' });
    expect(commentaires(id).at(-1)).toMatch(/^Circuit · file : intégré : /);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    // The bilan closes the history: it comes after the queue's line, which closed the ticket, and
    // it is the one bilan of the ticket (its text: tests/unit/bilan.spec.ts).
    const liste = tous(id);
    const bilans = liste.filter(c => /^Circuit · bilan :/.test(c.text));
    expect(bilans).toHaveLength(1);
    expect(bilans[0]?.author).toBe('circuit');
    expect(liste.at(-1)).toBe(bilans[0]);
    expect(liste.findIndex(c => /^Circuit · file : intégré : /.test(c.text))).toBeLessThan(
      liste.length - 1
    );
    // Each automatic pass kept its total at its end, under its kind (scripts/avancement.mjs): the
    // proof, the checks of the plan and the final pass counted their files; the integration
    // verifies nothing on the machine, so it keeps none.
    const { passes } = JSON.parse(readFileSync(totaux, 'utf8')) as {
      passes: Record<string, number>;
    };
    const total = (debut: string) =>
      Math.max(
        0,
        ...Object.entries(passes)
          .filter(([k]) => k.startsWith(debut))
          .map(([, n]) => n)
      );
    expect(total('preuve ')).toBeGreaterThan(0);
    expect(total('controles ')).toBeGreaterThan(0);
    expect(total('passe finale ')).toBeGreaterThan(0);
    expect(passes).not.toHaveProperty('integration');
  });
});
