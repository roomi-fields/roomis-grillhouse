import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import {
  ARRETS,
  CODE_JUSTE,
  DESCRIPTION,
  ECRIT_ROUGE,
  circuitEssai,
  ecrire,
  json,
  sortie,
} from './circuit-essai.js';

// The circuit replays only what changed (grillhouse-3uv.89, L3), as Bazel plays the targets a
// change affects (`rdeps`), Turborepo the packages changed since a commit and their dependents
// (`--filter=...[<base>]`), and Gerrit has the next review read the difference between two patch
// sets, the votes kept. Witness: BPScript 320.3 (2026-10-20), whose three rounds of review played
// every component again and the whole final pass each time (210 min), whose second review read
// the whole lot again, whose finding for a developpeur was lost when the proof of its component
// had no red, and whose components already proven played their testwriter and proof again after a
// component entered the title (29 min, 4,22 $).
// The trial repository and its stand-ins: ./circuit-essai.ts, here with a third package,
// `060-sheet`, which depends on no other (`030-binder` depends on `000-forms`).

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-rejeu-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  BEADS,
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
// The reviewer's sheet RENDU whose findings go each to its agent (`<rôle> <composant>`).
const rendu = (...constats: [string, string, string][]) =>
  `fiche '${JSON.stringify({
    verdict: 'RENDU',
    constats: constats.map(([agent, titre, corps]) => {
      const [role, composant] = agent.split(' ');
      return { titre, genre: 'bloquant', regle: 'critère 1', role, composant, corps };
    }),
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

  it('after a RENDU, plays the components its findings name, then the final pass restricted to what the fix touches and its dependents, and the whole pass once before the integration', () => {
    const id = 'demo-rejeu-rendu';
    ticket(id, TROIS);
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, 'developpeur-4', `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu.'\n`);
    scenario(
      id,
      'relecteur-1',
      rendu(['developpeur 000-forms', 'packages/forms/src/index.mjs', 'mesure de 0 doit rendre 0.'])
    );
    scenario(id, 'relecteur-2', accepte);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // Forms' developpeur again; binder, which no finding names, plays nothing: the final pass
    // judges it.
    expect(ordre(id)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      'testwriter packages/binder',
      'developpeur packages/binder',
      'testwriter packages/sheet',
      'developpeur packages/sheet',
      'relecteur',
      'developpeur packages/forms',
      'relecteur',
    ]);
    const rendus = historique(id).findIndex(([, e]) => e === 'relecture');
    expect(historique(id).slice(rendus)).toEqual([
      ['packages/sheet', 'relecture'],
      ['packages/forms', 'developpeur'],
      ['packages/forms', 'controles'],
      ['packages/sheet', 'controles'],
      ['packages/sheet', 'relecture'],
      ['packages/sheet', 'controles'],
      ['packages/sheet', 'integration'],
      ['packages/sheet', 'file'],
    ]);
    // A component's checks play its own packages: forms' at its two rounds, binder's once.
    const c = commandes(id);
    expect(c.filter(x => x === 'npm test -- packages/forms')).toHaveLength(2);
    expect(c.filter(x => x === 'npm test -- packages/binder')).toHaveLength(1);
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
    expect(restreinte).toContain('000-forms:test:vitest');
    expect(restreinte).toContain('030-binder:test:vitest');
    expect(restreinte).not.toContain('060-sheet:test:vitest');
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
      expect.stringMatching(
        /^Circuit · packages\/sheet · relecture : ACCEPTÉ ; la passe finale entière/
      )
    );
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  // BPScript 325 (BP 320.4, n° 12): on a RENDU naming 000, 030, 040 and 995, 000's developpeur sent
  // his red to his testwriter, and the findings of 030, 040 and 995 were skipped.
  it('keeps, at a developpeur sending to a testwriter during a RENDU, the findings of the other components, each played after it', () => {
    const id = 'demo-rejeu-renvoi';
    ticket(id, TROIS);
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'relecteur-1',
      rendu(
        ['developpeur 000-forms', 'packages/forms/src/index.mjs', 'mesure de 0 doit rendre 0.'],
        ['developpeur 060-sheet', 'packages/sheet/src/index.mjs', 'mesure de 1 doit rendre 2.']
      )
    );
    // Forms' developpeur sends his red to forms' testwriter, whose tests the code already passes.
    scenario(
      id,
      'developpeur-4',
      `printf '// essai\\n' >> $c/src/index.mjs
passation 'Le rouge qui reste est dans les tests de forms.'
fiche '{"statut":"BLOQUÉ","raison":"le test attend un autre type.","renvoi":{"role":"testwriter","composant":"000-forms"}}'
`
    );
    scenario(
      id,
      'testwriter-4',
      `cat > $c/test/zero.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure de 0 rend 0', () => { expect(mesure(0)).toBe(0); });
EOF
passation 'Le cas 0 testé.'
fiche '{"statut":"FAIT","verts_attendus":[{"fichier":"packages/forms/test/zero.test.mjs","test":"critère 1 — mesure de 0 rend 0","raison":"le code livré le tient"},{"fichier":"packages/forms/test/mesure.test.mjs","test":"critère 1 — mesure rend le double","raison":"livré avant le rendu"}]}'
`
    );
    scenario(id, 'developpeur-5', `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu.'\n`);
    scenario(id, 'developpeur-6', `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu.'\n`);
    scenario(id, 'relecteur-2', accepte);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id).slice(7)).toEqual([
      'developpeur packages/forms',
      'testwriter packages/forms',
      'developpeur packages/forms',
      'developpeur packages/sheet',
      'relecteur',
    ]);
    // Each developpeur receives the finding that names him.
    expect(essai(id, 'developpeur-5.prompt')).toContain('mesure de 0 doit rendre 0.');
    expect(essai(id, 'developpeur-6.prompt')).toContain('mesure de 1 doit rendre 2.');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('has the next review read the difference of the lot since the review before, and its findings, never the whole lot', () => {
    const id = 'demo-rejeu-relecture';
    ticket(id, TROIS);
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, 'developpeur-4', `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu.'\n`);
    scenario(
      id,
      'relecteur-1',
      rendu(['developpeur 000-forms', 'packages/forms/src/index.mjs', 'mesure de 0 doit rendre 0.'])
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
    expect(premiere).toContain('packages/binder/test/mesure.test.mjs');
    const consigne = essai(id, 'relecteur-2.prompt');
    const [lot1, lot2] = lotsRelus(id);
    // The difference between the two patch sets, which the review reads in the copy.
    expect(consigne).toContain(`git diff ${lot1} ${lot2}`);
    // The files it reads: those the fix changed, not the lot that did not move.
    const lots = /LOTS À LIRE : ([^\n]*)/.exec(consigne)?.[1] ?? '';
    expect(lots).toContain('packages/forms/src/index.mjs');
    expect(lots).not.toContain('mesure.test.mjs');
    expect(lots).not.toContain('packages/binder');
    // The findings of the review before, with their recipients, which it judges lifted or not.
    expect(consigne).toMatch(
      /LA RELECTURE D'AVANT : [^\n]*\n[\s\S]*### Constat 1 — packages\/forms\/src\/index\.mjs\nBloquant : critère 1\nAgent : developpeur 000-forms\nmesure de 0 doit rendre 0\./
    );
    expect(consigne).not.toContain('{{');
    // Its verdict at the ticket names each finding before it, lifted or not.
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^ACCEPTÉ\n\n## Constats d'avant\n\n- packages\/forms\/src\/index\.mjs : levé — mesure\(0\) rend 0\./
      )
    );
  });

  it('launches the developpeur a finding names even when the proof of its component has no red', () => {
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
        ['testwriter 000-forms', 'packages/forms/test/mesure.test.mjs', 'Le cas 0 manque.'],
        ['developpeur 000-forms', 'packages/forms/src/index.mjs:1', 'Le commentaire manque.']
      )
    );
    scenario(id, 'relecteur-2', accepte);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'developpeur')).toBe(2);
    const rendus = historique(id).findIndex(([, e]) => e === 'relecture');
    expect(historique(id).slice(rendus, rendus + 5)).toEqual([
      ['packages/forms', 'relecture'],
      ['packages/forms', 'testwriter'],
      ['packages/forms', 'preuve'],
      ['packages/forms', 'developpeur'],
      ['packages/forms', 'controles'],
    ]);
    // Each agent receives the findings of its own role.
    expect(essai(id, 'developpeur-2.prompt')).toContain('Le commentaire manque.');
    expect(essai(id, 'developpeur-2.prompt')).not.toContain('Le cas 0 manque.');
    expect(essai(id, 'testwriter-2.prompt')).toContain('Le cas 0 manque.');
    expect(essai(id, 'testwriter-2.prompt')).not.toContain('Le commentaire manque.');
    expect(gitRepo('show', 'main:packages/forms/src/index.mjs')).toContain('// mesure : le double');
  });

  it('plays only the checks of a component already proven when a component enters the title before it', () => {
    const id = 'demo-rejeu-titre';
    ticket(id, '030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // Binder's code needs forms to follow it: the final pass is red in forms, out of the title.
    scenario(
      id,
      'developpeur-1',
      `${CODE_JUSTE}echo rouge > $c/garde-rouge.txt\npassation 'Code de binder écrit.'\n`
    );
    scenario(
      id,
      'developpeur-2',
      `${CODE_JUSTE}printf '// accordé\\n' >> $c/src/index.mjs\npassation 'Forms accordé.'\n`
    );
    const r1 = circuit([id]);
    expect(r1.status, `${sortie(r1)}\n${etat(id)?.rapport ?? ''}`).toBe(ARRETS.controles);
    // The supervisor adds forms to the title, before binder, and plays it from its testwriter.
    ecrire(
      path.join(BEADS, `${id}.json`),
      json([{ id, title: `${id} — La mesure — 000-forms, 030-binder`, description: DESCRIPTION }])
    );
    const r2 = circuit([
      id,
      '--depuis',
      'testwriter',
      '000-forms',
      '--contexte',
      'La mesure de forms suit le classeur.',
    ]);
    expect(r2.status, sortie(r2)).toBe(0);
    // Binder, proven and delivered before, plays neither its testwriter nor its proof again.
    expect(ordre(id)).toEqual([
      'testwriter packages/binder',
      'developpeur packages/binder',
      'testwriter packages/forms',
      'developpeur packages/forms',
      'relecteur',
    ]);
    expect(
      historique(id).filter(([c, e]) => c === 'packages/binder' && e === 'preuve')
    ).toHaveLength(1);
    expect(etat(id)?.atteints.sort()).toEqual(['packages/binder', 'packages/forms']);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('judges at the checks of a component only its packages and the findings on its files: a finding on another one waits for the final pass', () => {
    const id = 'demo-rejeu-gardes';
    ticket(id, TROIS);
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    // Binder's code makes the guard red on a file of forms.
    scenario(
      id,
      'developpeur-2',
      `${CODE_JUSTE}echo rouge > $c/garde-rouge.txt\npassation 'Code de binder écrit.'\n`
    );
    scenario(id, 'developpeur-3', `${CODE_JUSTE}passation 'Code de sheet écrit.'\n`);
    scenario(
      id,
      'developpeur-4',
      `printf '// accordé\\n' >> $c/src/index.mjs\npassation 'Forms accordé.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      'testwriter packages/binder',
      'developpeur packages/binder',
      'testwriter packages/sheet',
      'developpeur packages/sheet',
      'developpeur packages/forms',
      'relecteur',
    ]);
    const binder = commentaires(id).filter(t =>
      t.startsWith('Circuit · packages/binder · controles')
    );
    expect(binder).toHaveLength(1);
    expect(binder[0]).toMatch(/^Circuit · packages\/binder · controles : verts : /);
    expect(binder[0]).toContain('laissés à la passe finale, 1 rouge(s)');
    // Its checks play binder's packages, not forms'.
    expect(binder[0]).not.toContain('npm test -- packages/forms');
    expect(essai(id, 'developpeur-4.prompt')).toContain('packages/forms/src/index.mjs:1');
  });
});
