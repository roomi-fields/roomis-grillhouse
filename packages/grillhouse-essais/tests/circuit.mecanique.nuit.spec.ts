import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, ARRETS, CODE_JUSTE, circuitEssai, lire } from './circuit-essai.js';

// A gesture without new behaviour leaves the circuit of code (grillhouse-sos), as Google's
// large-scale changes (Rosie, ClangMR) let a tool make the change that a verification and a review
// judge: the explorateur's plan says the ticket mechanical, with its reason and its command; the
// circuit skips the testwriter, the proof and the developpeur, the explorateur plays the command in
// the copy (1.1), then the checks, the final pass, the review and the queue. Under a plan
// « comportement inchangé », every green of the proof is expected, and a proof without a red goes
// to the checks with no developpeur. Witnesses: BPScript 320.16 (38 tools moved by mv, 117
// comments), 320.40.1 (an unused variable, 4 sessions), si61.8 (a threshold 77 → 95).
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-mecanique-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  REPO,
  BEADS,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  sessions,
  etat,
  ordre,
  commentaires,
} = circuitEssai(ESSAIS);

// The sheet of the plan of the explorateur, on the package of forms, with its sort.
const plan = (sorte: object) =>
  `fiche '${JSON.stringify({ criteres: [], paquets: ['000-forms'], questions: [], sorte })}'\n`;
const MECANIQUE = {
  genre: 'mécanique',
  raison: 'le code de la mesure se réécrit par sa commande, sans comportement neuf',
  commande: 'printf … > packages/forms/src/index.mjs',
};
const gestes = (id: string) => commentaires(id).filter(t => /^Circuit · geste : /.test(t));
const description = (id: string) =>
  (JSON.parse(lire(path.join(BEADS, `${id}.json`))) as { description: string }[])[0].description;

describe.runIf(canWrap)('a mechanical ticket goes by its command', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('critères 1 et 2 — the explorateur plays the command in the copy, then the checks, the review and the queue: no testwriter, no developpeur', () => {
    const id = 'demo-meca';
    ticket(id, '000-forms');
    scenario(id, 'explorateur-1', plan(MECANIQUE));
    scenario(id, 'explorateur-2', `${CODE_JUSTE}fiche '{"statut":"FAIT"}'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id, { plan: true })).toEqual([
      'explorateur',
      'questionneur',
      'explorateur',
      'relecteur',
    ]);
    expect(sessions(id, 'testwriter')).toBe(0);
    expect(sessions(id, 'developpeur')).toBe(0);
    expect(gestes(id)).toEqual([expect.stringMatching(/^Circuit · geste : mecanique → /)]);
    expect(description(id)).toContain(`## Sorte\n\nmécanique — ${MECANIQUE.raison}`);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    expect(lire(path.join(REPO, 'packages/forms/src/index.mjs'))).toContain('2 * x');
  });

  // The relecteur of 2c54260: the answer to the questionneur, its sheet without `sorte`, lost the
  // sort, and the ticket went the whole circuit in silence.
  it('critère 1 — the sort survives the explorateur’s answer to the questionneur', () => {
    const id = 'demo-meca-question';
    ticket(id, '000-forms');
    scenario(id, 'explorateur-1', plan(MECANIQUE));
    scenario(
      id,
      'questionneur',
      `fiche '${JSON.stringify({
        issue: 'QUESTIONS',
        questions: [
          {
            question: 'La commande touche-t-elle un autre paquet ?',
            vise: 'flou',
            piece: 'ticket, § Architecture : la mesure vit dans chaque composant.',
          },
        ],
      })}'\n`
    );
    scenario(
      id,
      'explorateur-2',
      `fiche '${JSON.stringify({
        criteres: [],
        paquets: ['000-forms'],
        questions: [],
        reponses: [{ numero: '1', reponse: 'GARDE', texte: 'elle ne touche que forms.' }],
      })}'\n`
    );
    scenario(id, 'explorateur-3', `${CODE_JUSTE}fiche '{"statut":"FAIT"}'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(0);
    expect(sessions(id, 'developpeur')).toBe(0);
    expect(gestes(id)).toEqual([expect.stringMatching(/^Circuit · geste : mecanique → /)]);
    expect(description(id)).toContain(`## Sorte\n\nmécanique — ${MECANIQUE.raison}`);
  });

  it('critère 2 — a red of the checks on the lot of the command goes up to the supervisor, no developpeur launched', () => {
    const id = 'demo-meca-rouge';
    ticket(id, '000-forms');
    scenario(id, 'explorateur-1', plan(MECANIQUE));
    scenario(
      id,
      'explorateur-2',
      `printf 'export const mesure = x => String(x);\\n' > $c/src/index.mjs\nfiche '{"statut":"FAIT"}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    expect(sessions(id, 'developpeur')).toBe(0);
    expect(etat(id)).toMatchObject({ raison: 'controles' });
  });

  it('critère 4 — a plan without its sort goes the whole circuit', () => {
    const id = 'demo-meca-sans';
    ticket(id, '000-forms');
    scenario(
      id,
      'explorateur-1',
      `fiche '${JSON.stringify({ criteres: [], paquets: ['000-forms'], questions: [] })}'\n`
    );
    scenario(id, 'testwriter', "passation 'Rien à écrire.'\n");
    const r = circuit([id]);
    expect(sessions(id, 'testwriter'), sortie(r)).toBeGreaterThan(0);
    expect(gestes(id).filter(g => g.includes('mecanique'))).toEqual([]);
  });

  it('critère 3 — under « comportement inchangé », a green test without its expected green passes the proof, then the developpeur works the lot, the checks and the review', () => {
    const id = 'demo-inchange';
    ticket(id, '000-forms');
    scenario(
      id,
      'explorateur-1',
      plan({ genre: 'comportement', raison: 'un test de plus', comportement: 'inchangé' })
    );
    scenario(
      id,
      'testwriter',
      `mkdir -p $c/test
cat > $c/test/encore.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend un nombre', () => { expect(typeof mesure(3)).toBe('number'); });
EOF
passation 'Un test de plus, vert.'\n`
    );
    // The reorganisation: the code of the measure rewritten, its behaviour unchanged.
    scenario(
      id,
      'developpeur',
      `printf 'export const mesure = x => {\\n  return x;\\n};\\n' > $c/src/index.mjs\npassation 'Réorganisé.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    expect(commentaires(id).join('\n')).toContain(
      'aucun rouge : le plan dit « comportement inchangé », au développeur'
    );
  });
});
