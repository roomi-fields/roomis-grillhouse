import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai, sortie } from './circuit-essai.js';

// The circuit replays only what changed (grillhouse-3uv.89, L3), as Bazel plays the targets a
// change affects (`rdeps`), Turborepo the packages changed since a commit and their dependents
// (`--filter=...[<base>]`), and Gerrit has the next review read the difference between two patch
// sets, the votes kept. Witness: BPScript 320.3 (2026-10-20), whose three rounds of review played
// every component again and the whole final pass each time (210 min), whose second review read
// the whole lot again, and whose finding for a developpeur was lost when the proof had no red.
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
  essai,
  sessions,
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
const accepte = `fiche '{"verdict":"ACCEPTÉ"}'\n`;
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

  it('after a RENDU, plays the developpeur its finding names, then the final pass restricted to what the fix touches and its dependents, and the whole pass once before the integration', () => {
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
    scenario(id, 'relecteur-2', accepte);
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
      'controles',
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
    // The final pass whole, then restricted to what changed since the lot the first review read,
    // then whole once, on the lot accepted, before the integration.
    const passes = c.filter(x => VERIFIER.test(x));
    expect(passes).toHaveLength(3);
    expect(passes[0]).toBe('npm run verifier');
    expect(passes[2]).toBe('npm run verifier');
    const [, avant, apres] = RESTREINTE.exec(passes[1]) ?? [];
    const [lot1, lot2] = lotsRelus(id);
    expect(avant).toBe(lot1);
    // The state of the copy at the pass, a commit on the lot the review read: Turborepo compares
    // the two.
    expect(gitRepo('rev-parse', `${apres}^`).trim()).toBe(lot1);
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
    expect(finales.map(e => (e.resultat as { issue: string }).issue)).toEqual([
      'vert',
      'vert',
      'vert',
    ]);
    // The lot each review read, a patch set the circuit keeps: the second on the first.
    expect(gitRepo('rev-parse', `${lot2}^`).trim()).toBe(lot1);
    expect(gitRepo('show', `${lot1}:packages/forms/src/index.mjs`)).not.toContain('// rendu');
    expect(gitRepo('show', `${lot2}:packages/forms/src/index.mjs`)).toContain('// rendu');
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(/^Circuit · relecture : ACCEPTÉ ; la passe finale entière/)
    );
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  // BPScript 325 (BP 320.4, n° 12): on a RENDU naming 000, 030, 040 and 995, 000's developpeur sent
  // his red to his testwriter, and the findings of 030, 040 and 995 were skipped.
  it('keeps, at a developpeur sending to the testwriter during a RENDU, every finding still open: the developpeur after it receives them all', () => {
    const id = 'demo-rejeu-renvoi';
    ticket(id, TROIS);
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'relecteur-1',
      rendu(
        ['developpeur', 'packages/forms/src/index.mjs', 'mesure de 0 doit rendre 0.'],
        ['developpeur', 'packages/sheet/src/index.mjs', 'mesure de 1 doit rendre 2.']
      )
    );
    // The developpeur sends his red to the testwriter, whose tests the code already passes.
    scenario(
      id,
      'developpeur-2',
      `printf '// essai\\n' >> $c/src/index.mjs
passation 'Le rouge qui reste est dans les tests de forms.'
fiche '{"statut":"BLOQUÉ","raison":"le test attend un autre type.","piece":"packages/forms/src/index.mjs:1","renvoi":{"role":"testwriter"}}'
`
    );
    scenario(
      id,
      'testwriter-2',
      `cat > $c/test/zero.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure de 0 rend 0', () => { expect(mesure(0)).toBe(0); });
EOF
passation 'Le cas 0 testé.'
fiche '{"statut":"FAIT","verts_attendus":[{"fichier":"packages/forms/test/zero.test.mjs","test":"critère 1 — mesure de 0 rend 0","raison":"le code livré le tient"},{"fichier":"packages/forms/test/mesure.test.mjs","test":"critère 1 — mesure rend le double","raison":"livré avant le rendu"}]}'
`
    );
    scenario(id, 'developpeur-3', `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu.'\n`);
    scenario(id, 'relecteur-2', accepte);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id).slice(3)).toEqual(['developpeur', 'testwriter', 'developpeur', 'relecteur']);
    // The developpeur after the sending receives both findings, still open.
    for (const constat of ['mesure de 0 doit rendre 0.', 'mesure de 1 doit rendre 2.']) {
      expect(essai(id, 'developpeur-3.prompt')).toContain(constat);
    }
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('has the next review read the difference of the lot since the review before, and its findings, never the whole lot', () => {
    const id = 'demo-rejeu-relecture';
    ticket(id, TROIS);
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, 'developpeur-2', `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu.'\n`);
    scenario(
      id,
      'relecteur-1',
      rendu(['developpeur', 'packages/forms/src/index.mjs', 'mesure de 0 doit rendre 0.'])
    );
    scenario(
      id,
      'relecteur-2',
      `fiche '${JSON.stringify({
        verdict: 'ACCEPTÉ',
        suivi: [
          { titre: 'packages/forms/src/index.mjs', etat: 'levé', preuve: 'mesure(0) rend 0.' },
        ],
      })}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const premiere = essai(id, 'relecteur-1.prompt');
    expect(premiere).toContain("LA RELECTURE D'AVANT : aucune");
    expect(premiere).toContain('packages/forms/test/mesure.test.mjs');
    const consigne = essai(id, 'relecteur-2.prompt');
    const [lot1, lot2] = lotsRelus(id);
    // The difference between the two patch sets, which the review reads in the copy.
    expect(consigne).toContain(`git diff ${lot1} ${lot2}`);
    // The files it reads: those the fix changed, not the lot that did not move.
    const lots = /LOTS À LIRE : ([^\n]*)/.exec(consigne)?.[1] ?? '';
    expect(lots).toContain('packages/forms/src/index.mjs');
    expect(lots).not.toContain('mesure.test.mjs');
    // The findings still open, with their agents, which it judges lifted or not.
    expect(consigne).toMatch(
      /LA RELECTURE D'AVANT : [^\n]*\n[\s\S]*### Constat 1 — packages\/forms\/src\/index\.mjs\nBloquant : critère 1\nAgent : developpeur\nmesure de 0 doit rendre 0\./
    );
    expect(consigne).not.toContain('{{');
    // Its verdict at the ticket names each finding before it, lifted or not.
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^ACCEPTÉ\n\n## Constats d'avant\n\n- packages\/forms\/src\/index\.mjs : levé — mesure\(0\) rend 0\./
      )
    );
  });

  it('launches the developpeur a finding names even when the proof has no red', () => {
    const id = 'demo-rejeu-constat';
    ticket(id, '000-forms');
    scenario(id, 'testwriter-1', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The testwriter adds a case the code already holds: the proof has no red.
    scenario(
      id,
      'testwriter-2',
      `cat > $c/test/zero.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure de 0 rend 0', () => { expect(mesure(0)).toBe(0); });
EOF
passation 'Le cas 0 testé.'
fiche '{"statut":"FAIT","verts_attendus":[{"fichier":"packages/forms/test/zero.test.mjs","test":"critère 1 — mesure de 0 rend 0","raison":"le code livré le tient"},{"fichier":"packages/forms/test/mesure.test.mjs","test":"critère 1 — mesure rend le double","raison":"livré avant le rendu"}]}'
`
    );
    scenario(
      id,
      'developpeur-2',
      `printf '// mesure : le double\\n' >> $c/src/index.mjs\npassation 'Commentaire écrit.'\n`
    );
    scenario(
      id,
      'relecteur-1',
      rendu(
        ['testwriter', 'packages/forms/test/mesure.test.mjs', 'Le cas 0 manque.'],
        ['developpeur', 'packages/forms/src/index.mjs:1', 'Le commentaire manque.']
      )
    );
    scenario(id, 'relecteur-2', accepte);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'developpeur')).toBe(2);
    const rendus = historique(id).indexOf('relecture');
    expect(historique(id).slice(rendus, rendus + 5)).toEqual([
      'relecture',
      'testwriter',
      'preuve',
      'developpeur',
      'controles',
    ]);
    // Each agent receives the findings of its own role.
    expect(essai(id, 'developpeur-2.prompt')).toContain('Le commentaire manque.');
    expect(essai(id, 'developpeur-2.prompt')).not.toContain('Le cas 0 manque.');
    expect(essai(id, 'testwriter-2.prompt')).toContain('Le cas 0 manque.');
    expect(essai(id, 'testwriter-2.prompt')).not.toContain('Le commentaire manque.');
    expect(gitRepo('show', 'main:packages/forms/src/index.mjs')).toContain('// mesure : le double');
  });

  it('judges at the checks of the plan only its packages: a finding on a file out of the plan waits for the final pass, which sends it up', () => {
    const id = 'demo-rejeu-gardes';
    ticket(id, '030-binder, 060-sheet');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // Binder's code makes the guard red on a file of forms, out of the plan.
    scenario(
      id,
      'developpeur',
      `${CODE_JUSTE}echo rouge > $c/garde-rouge.txt\npassation 'Code écrit.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur']);
    const controles = commentaires(id).filter(t => t.startsWith('Circuit · controles'));
    expect(controles[0]).toMatch(/^Circuit · controles : verts : /);
    expect(controles[0]).toContain('laissés à la passe finale, 1 rouge(s)');
    // Its checks play the plan's packages, not forms'.
    expect(controles[0]).not.toContain('npm test -- packages/forms');
    expect(etat(id)?.rapport).toContain('hors du plan du ticket');
    expect(etat(id)?.rapport).toContain('000-forms');
  });
});
