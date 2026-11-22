// @equipee: l'enveloppe bwrap, un serveur Temporal
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import {
  DESCRIPTION,
  CODE_JUSTE,
  circuitEssai,
  ecrire,
  json,
  lire,
  sortie,
} from './circuit-essai.js';
import { CADRE } from './cadre.js';

// The regeneration of the project’s references (step 4.2 of scripts/etapes.mjs), as `rustc --bless`,
// `jest -u` and `cargo insta accept`: the one whole journey the night keeps, from the red of a
// reference to the lot on main. Each rule of the regeneration is proved small, by the interface of
// its function (packages/grillhouse/tests/unit/activites.regenerer.spec.ts,
// activites.references-des-rouges.spec.ts, activites.les-references.spec.ts,
// activites.rouges-de.spec.ts, transitions.spec.ts).
// Witness: BPScript 320.4 (n° 9, 45 min): the fingerprint of the output and the ceiling of the words
// count the whole copy, which no envelope shows; they alone made the final passes red, and the
// supervisor regenerated them by hand.
//
// The trial: a reference at the root, `reference.txt`, the measure of 2; a guard of the project
// judges it (its finding on `reference.txt`, a file no package of the plan holds), and
// `node regenerer.mjs` writes it again. The ticket doubles the measure: the reference is red at
// the final pass alone.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-references-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  REPO,
  BEADS,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  entrees,
  ordre,
  commandes,
  gitRepo,
} = circuitEssai(ESSAIS);

const RESULTATS = path.join(CADRE, 'scripts/resultats.mjs');
const NOM = 'la référence de la mesure';
const REGENERER = 'node regenerer.mjs';
// The one preparation of the copy on the tip of main, which the circuit plays before each pass
// that judges the lot, after a regeneration too: its line in the ticket's log.
const PREPARATION: unknown = expect.stringMatching(
  /^node \S+\/scripts\/enveloppe\/travail-de-la-copie\.mjs preparer \S+ [0-9a-f]{40}$/
);
// The final pass, as the circuit plays it: `npm run verifier` on the band of the lot, from its
// base to its top, and the root's tasks, never the whole repository.
const BANDE = /^npm run verifier -- --filter=\.\.\.\[[0-9a-f]+\.\.\.[0-9a-f]+\] --filter=\/\/$/;
const PASSE_FINALE: unknown = expect.stringMatching(BANDE);
const estLaPasse = (x: string) => BANDE.test(x);

// The reference of the trial on main, the project's guard judging it beside the trial's own,
// declared in the package.json (`grillhouse.references`).
function laReference() {
  const pkg = JSON.parse(lire(path.join(REPO, 'package.json'))) as {
    scripts: Record<string, string>;
    grillhouse?: object;
  };
  pkg.scripts.gardes = 'node garde.mjs && node garde-reference.mjs';
  pkg.grillhouse = {
    ...pkg.grillhouse,
    references: [{ nom: NOM, commande: REGENERER, fichiers: ['reference.txt'] }],
  };
  ecrire(path.join(REPO, 'package.json'), json(pkg));
  ecrire(path.join(REPO, 'reference.txt'), '2\n');
  ecrire(
    path.join(REPO, 'regenerer.mjs'),
    `import { writeFileSync } from 'node:fs';
import { mesure } from './packages/forms/src/index.mjs';
writeFileSync('reference.txt', mesure(2) + '\\n');
`
  );
  ecrire(
    path.join(REPO, 'garde-reference.mjs'),
    `import { readFileSync } from 'node:fs';
import { ecrireSarif } from ${JSON.stringify(RESULTATS)};
import { mesure } from './packages/forms/src/index.mjs';
const lu = readFileSync('reference.txt', 'utf8').trim();
const attendu = String(mesure(2));
if (lu !== attendu) {
  const message = 'la référence dit ' + lu + ', la mesure ' + attendu + '.';
  console.log('⛔ reference.txt:1 — ' + message);
  ecrireSarif({ garde: 'reference', constats: [{ fichier: 'reference.txt', ligne: 1, message }] });
  process.exit(1);
}
ecrireSarif({ garde: 'reference', constats: [] });
`
  );
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', REPO, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('add', '-A');
  git('commit', '-qm', 'la référence');
}

// A ticket on 000-forms whose description is <description>, its test of the double written in its
// copy, its developpeur writing the double: the run starts at that developpeur.
function leTicket(id: string, description: string) {
  const copie = ticket(id, '000-forms');
  ecrire(
    path.join(BEADS, `${id}.json`),
    json([{ id, title: `${id} — La mesure — 000-forms`, description }])
  );
  ecrire(
    path.join(copie, 'packages/forms/test/mesure.test.mjs'),
    `import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('mesure rend le double', () => { expect(mesure(2)).toBe(4); });
`
  );
  scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
  return copie;
}
const lancer = (id: string) => circuit([id, '--depuis', 'developpeur', '--contexte', 'Le double.']);

describe.runIf(canWrap)(
  'the regeneration of the references, the whole journey',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    // A reference the lot changes is regenerated without a word of the plan, as a genrule of Bazel
    // writes its output again without a request. Witness: BPScript 320.3.2.1 (12:08:52, stop 23):
    // the ceiling of the words of 000-forms lowered from 546 to 542, a mechanical gesture, stopped
    // because the plan named neither the ceiling nor its file.
    it('regenerates a reference the plan names nowhere, plays the final pass after it, and the lot carries it to the reviewer and the commit', () => {
      const id = 'demo-references-regeneree';
      laReference();
      leTicket(id, DESCRIPTION);
      expect(DESCRIPTION).not.toContain('reference.txt');
      expect(DESCRIPTION.toLowerCase()).not.toContain(NOM);
      const r = lancer(id);
      expect(r.status, sortie(r)).toBe(0);
      expect(entrees(id).some(x => x.arret === 'references')).toBe(false);
      // The red of the reference goes to no developpeur: the step regenerates it.
      expect(ordre(id)).toEqual(['developpeur', 'relecteur']);
      const c = commandes(id);
      const regeneration = c.indexOf(REGENERER);
      expect(regeneration, c.join('\n')).toBeGreaterThan(0);
      // Before it, the checks of the plan, which see the red; after it, the preparation of the
      // copy, then the final pass, on the band of the lot.
      expect(c.slice(0, regeneration).some(estLaPasse)).toBe(false);
      expect(c.slice(regeneration + 1, regeneration + 3)).toEqual([PREPARATION, PASSE_FINALE]);
      // The step leaves its result with the circuit's, its report naming the reference and its file.
      const e = entrees(id).find(x => x.etape === 'references') as
        { rapport?: string; resultat?: { regenerees?: string[] } } | undefined;
      expect(e?.rapport).toContain(NOM);
      expect(e?.rapport).toContain('reference.txt');
      expect(e?.resultat?.regenerees).toEqual([NOM]);
      // The reviewer receives the regenerated file in the lot, and the step's report.
      const consigne = essai(id, 'relecteur-1.prompt');
      expect(consigne).toMatch(/le lot de code : [^\n;]*reference\.txt/);
      expect(consigne).toContain(REGENERER);
      // The lot on main carries the reference regenerated.
      expect(gitRepo('show', 'main:reference.txt')).toBe('4\n');
    });
  }
);
