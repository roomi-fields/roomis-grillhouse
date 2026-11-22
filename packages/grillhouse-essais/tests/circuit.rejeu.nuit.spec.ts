// @equipee: l'enveloppe bwrap, un serveur Temporal
import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CODE_JUSTE, ECRIT_ROUGE, circuitEssai, sortie } from './circuit-essai.js';

// The circuit replays only what changed (grillhouse-3uv.89, L3), as Bazel plays the targets a
// change affects (`rdeps`), Turborepo the packages changed since a commit and their dependents
// (`--filter=...[<base>]`), and Gerrit has the next review read the difference between two patch
// sets, the votes kept. Witness: BPScript 320.3 (2026-10-20), whose three rounds of review played
// every component again and the whole final pass each time (210 min). The one journey that stays
// whole in the night: the real Turborepo plays the final pass on the band of the lot, from its
// base, and leaves the package the lot does not touch out. The rules of the findings carried from
// one review to the next, of the review's instruction and of the checks of the plan are proved
// small (tests/unit of the package grillhouse: circuit.constats-d-un-rendu-a-l-autre.spec.ts,
// activites.relecture-bornee.spec.ts, controles.hors-du-plan-laisse-a-la-passe-finale.spec.ts).
// Every step is one for the whole ticket (grillhouse-3uv.95.6).
// The trial repository and its stand-ins: ./circuit-essai.ts, here with a third package,
// `060-sheet`, which depends on no other (`030-binder` depends on `000-forms`).

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-rejeu-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  etat,
  ordre,
  journal,
  commandes,
  entrees,
  gitRepo,
  historique,
  commentaires,
} = circuitEssai(ESSAIS, { feuille: true });

const TROIS = '000-forms, 030-binder, 060-sheet';
// The reviewer's sheet ACCEPTÉ after a RENDU, which judges each finding still open, by its
// <titres>, lifted (grillhouse-527.1.1).
const accepte = (...titres: string[]) =>
  `fiche '${JSON.stringify({
    verdict: 'ACCEPTÉ',
    suivi: titres.map(titre => ({ titre, etat: 'levé', preuve: 'la différence du lot.' })),
  })}'\n`;
// The reviewer's sheet RENDU whose findings go each to its agent.
const rendu = (...constats: [string, string, string][]) =>
  `fiche '${JSON.stringify({
    verdict: 'RENDU',
    constats: constats.map(([role, titre, corps]) => ({
      titre,
      genre: 'bloquant',
      regle: 'critère 1',
      role,
      corps,
      piece: 'packages/forms/src/index.mjs:1',
    })),
  })}'\n`;
// The lot each review read, kept by the circuit: the commit of its sheet's entry.
const lotsRelus = (id: string) =>
  entrees(id)
    .filter(e => e.role === 'relecteur')
    .map(e => (e.lot as { commit: string }).commit);
// The output of the command <commande> in the log: from its line to the next header.
const sortieDe = (id: string, commande: string) => {
  const j = journal(id);
  const debut = j.indexOf(`$ ${commande}`);
  if (debut < 0) {
    return '';
  }
  const fin = j.indexOf('\n=== ', debut);
  return j.slice(debut, fin < 0 ? undefined : fin);
};
const VERIFIER = /^npm run verifier(?: |$)/;
const RESTREINTE =
  /^npm run verifier -- --filter=\.\.\.\[([0-9a-f]{40})\.\.\.([0-9a-f]{40})\] --filter=\/\/$/;

describe.runIf(canWrap)('the circuit replays only what changed', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('after a RENDU, plays the developpeur its finding names, then each final pass on the band of the lot, from its base, never the whole repository', () => {
    const id = 'demo-rejeu-rendu';
    ticket(id, TROIS);
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, 'developpeur-2', `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu.'\n`);
    scenario(
      id,
      'relecteur-1',
      rendu(['developpeur', 'packages/forms/src/index.mjs', 'mesure de 0 doit rendre 0.'])
    );
    scenario(id, 'relecteur-2', accepte('packages/forms/src/index.mjs'));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // The developpeur of the ticket again, no testwriter.
    expect(ordre(id)).toEqual([
      'testwriter',
      'developpeur',
      'relecteur',
      'developpeur',
      'relecteur',
    ]);
    const rendus = historique(id).indexOf('relecture');
    expect(historique(id).slice(rendus)).toEqual([
      'relecture',
      'developpeur',
      'controles',
      'controles',
      'relecture',
      'integration',
      'file',
    ]);
    // The checks of the plan play each of its packages, at each of their two rounds.
    const c = commandes(id);
    for (const p of ['packages/forms', 'packages/binder', 'packages/sheet']) {
      expect(
        c.filter(x => x === `npm test -- ${p}`),
        p
      ).toHaveLength(2);
    }
    // Each final pass plays the band of the lot, from its base (the head of the copy) to its top,
    // never the whole repository, and never from the review before: the second verifies the lot the
    // review accepts, which goes to the integration without a third.
    const passes = c.filter(x => VERIFIER.test(x));
    expect(passes).toHaveLength(2);
    const bandes = passes.map(p => RESTREINTE.exec(p));
    for (const b of bandes) {
      expect(b).not.toBeNull();
    }
    const [lot1, lot2] = lotsRelus(id);
    const [, base] = bandes[0] ?? [];
    for (const b of bandes) {
      expect(b?.[1]).toBe(base);
    }
    expect(base).not.toBe(lot1);
    // The base is the head of the copy, an ancestor of the lot the first review read.
    gitRepo('merge-base', '--is-ancestor', base, lot1);
    const apres = bandes[1]?.[2] ?? '';
    expect(gitRepo('show', `${apres}:packages/forms/src/index.mjs`)).toContain('// rendu');
    // Turborepo plays forms and binder, which depends on it, and leaves sheet out.
    const restreinte = sortieDe(id, passes[1]);
    expect(restreinte).toContain('000-forms:test:unit');
    expect(restreinte).toContain('030-binder:test:unit');
    expect(restreinte).not.toContain('060-sheet:test:unit');
    // Each final pass keeps its outcome with the circuit's results.
    const finales = entrees(id).filter(
      e => e.role === 'circuit' && (e.resultat as { finale?: boolean } | undefined)?.finale
    );
    expect(finales.map(e => (e.resultat as { issue: string }).issue)).toEqual(['vert', 'vert']);
    // The lot each review read, a patch set the circuit keeps: the second on the first.
    expect(gitRepo('rev-parse', `${lot2}^`).trim()).toBe(lot1);
    expect(gitRepo('show', `${lot1}:packages/forms/src/index.mjs`)).not.toContain('// rendu');
    expect(gitRepo('show', `${lot2}:packages/forms/src/index.mjs`)).toContain('// rendu');
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(/^Circuit · relecture : ACCEPTÉ ; le lot va à l’intégration\./)
    );
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});
