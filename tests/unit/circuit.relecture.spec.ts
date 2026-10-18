import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { constats } from '../../scripts/circuit.mjs';
import { lire, sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the review, its
// verdicts ACCEPTÉ and RENDU, and the integration.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

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
  sessions,
  args,
  etat,
  ordre,
  gitRepo,
  commentaires,
  historique,
} = circuitEssai(ESSAIS);

// The entries of the integration's queue: the branches in their order of arrival.
const enFile = () => {
  const d = path.join(REPO, '.git/file-integration');
  return existsSync(d)
    ? readdirSync(d)
        .sort()
        .map(
          f => (JSON.parse(readFileSync(path.join(d, f), 'utf8')) as { branche: string }).branche
        )
    : [];
};
const ticketDe = (id: string) =>
  (JSON.parse(lire(path.join(BEADS, `${id}.json`))) as { status?: string }[])[0];

// After the final pass, the circuit launches the reviewer, out of the envelope, from the second
// template (Q6). ACCEPTÉ: the circuit builds the lot from the copy and integrates it, which puts
// the branch in the queue (Q7, Q13). RENDU: each finding names « Agent : <rôle> <composant> »; the
// circuit relaunches those agents from the first component named, the components after it pass
// again, then the final pass and the reviewer; a finding without a valid recipient stops at
// « relecture-arret », and so does the third RENDU.
describe('the findings of a verdict RENDU', () => {
  it('read the component of their line Agent, the root « . » included', () => {
    const verdict = [
      'RENDU',
      '### Constat 1 — scripts/garde.mjs',
      'Agent : developpeur .',
      '### Constat 2 — packages/forms/src/forms.ts',
      '- **Agent** : testeur `packages/forms`.',
    ].join('\n');
    expect(constats(verdict).map(c => [c.role, c.composant])).toEqual([
      ['developpeur', '.'],
      ['testeur', 'packages/forms'],
    ]);
  });
});

describe.runIf(canWrap)('the review and the integration', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  // A verdict RENDU whose one finding goes to <agent>.
  const rendu = (agent: string, constat = 'mesure de 0 doit rendre 0.') =>
    `verdict 'RENDU

### Constat 1 — packages/forms/src/index.mjs
Agent : ${agent}
${constat}
Règle : critère 1.'
`;

  it('ACCEPTÉ leads to the integration: one commit on agent/<ticket>, the branch in the queue', () => {
    const id = 'demo-accepte';
    const copie = ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'relecteur',
    ]);
    // The reviewer's session: claude in the ticket's copy, out of the envelope, on its role.
    expect(essai(id, 'relecteur-1.pwd').trim()).toBe(copie);
    const a = args(id, 'relecteur', 1);
    expect(a[a.indexOf('--agent') + 1]).toBe('relecteur');
    expect(a[a.indexOf('--model') + 1]).toBe('opus');
    // Without a prompt, it may run every command its skill runs: a refused one leaves no verdict.
    expect(a[a.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    for (const regle of [
      'Bash(git diff *)',
      'Bash(bd show *)',
      'Bash(bd comments *)',
      'Bash(npm test *)',
      'Bash(npm run verifier *)',
      'Bash(node scripts/*)',
      'Bash(codegraph *)',
      'mcp__plugin_rtfm_rtfm__rtfm_search',
    ]) {
      expect(a).toContain(regle);
    }
    // Its instruction: the second template, the criteria, the lot and the circuit's reports.
    const consigne = essai(id, 'relecteur-1.prompt');
    expect(consigne).toContain(`Tu es le relecteur du dépôt ${REPO}.`);
    expect(consigne).toContain(`TON TICKET : ${id} — La mesure`);
    expect(consigne).toContain('1. `mesure` rend le double de sa valeur.');
    expect(consigne).toContain('le lot de tests : packages/forms/test/mesure.test.mjs');
    expect(consigne).toContain('le lot de code : packages/forms/src/index.mjs');
    expect(consigne).toContain('Circuit · packages/forms · preuve');
    expect(consigne).toContain('controles : verts : npm run verifier.');
    expect(consigne).not.toContain('{{');
    // The claims file: the description, in a folder the session may read.
    const affirmations = /LE FICHIER D'AFFIRMATIONS, [^:]*: (\S+)/.exec(consigne)?.[1] ?? '';
    expect(path.basename(affirmations)).toBe('affirmations.md');
    expect(a[a.indexOf('--add-dir') + 1]).toBe(path.dirname(affirmations));
    // The integration: the commit holds the testeur's lot and the developpeur's, under the
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
    expect(historique(id).slice(-3)).toEqual([
      ['packages/forms', 'relecture'],
      ['packages/forms', 'integration'],
      ['packages/forms', 'file'],
    ]);
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^Circuit · packages\/forms · integration : .*la branche est en file\.$/
      )
    );
    // The ticket closed by the queue; the trial has no origin, so main is not pushed.
    expect(ticketDe(id)).toMatchObject({ status: 'closed' });
    expect(commentaires(id).at(-1)).toMatch(/^Circuit · packages\/forms · file : intégré : /);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('RENDU « Agent : developpeur <composant> » relaunches that developpeur, then the rest, to the queue', () => {
    const id = 'demo-rendu-dev';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'developpeur-3',
      `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu traité.'\n`
    );
    scenario(id, 'relecteur-1', rendu('developpeur 000-forms'));
    scenario(id, 'relecteur-2', "verdict 'ACCEPTÉ — le rendu est traité.'\n");
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // The verdict, the reviewer's final answer, is at the ticket whole, on several lines.
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(/^RENDU\n\n### Constat 1 — packages\/forms\/src\/index\.mjs\nAgent : /)
    );
    // Forms' developpeur again; binder, which no finding names, passes its checks again.
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
      'developpeur packages/forms',
      'relecteur',
    ]);
    const consigne = essai(id, 'developpeur-3.prompt');
    expect(consigne).toContain('TON COMPOSANT : packages/forms');
    expect(consigne).toMatch(/LE RAPPORT DE L'ÉTAPE D'AVANT[^\n]*\n\n### Constat 1/);
    expect(consigne).toContain('mesure de 0 doit rendre 0.');
    expect(consigne).toContain('REPRISE : oui');
    expect(essai(id, 'relecteur-2.prompt')).toContain('REPRISE : oui');
    const rendus = historique(id).findIndex(([, e]) => e === 'relecture');
    expect(historique(id).slice(rendus)).toEqual([
      ['packages/binder', 'relecture'],
      ['packages/forms', 'developpeur'],
      ['packages/forms', 'controles'],
      ['packages/binder', 'controles'],
      ['packages/binder', 'relecture'],
      ['packages/binder', 'integration'],
      ['packages/binder', 'file'],
    ]);
    expect(gitRepo('show', 'main:packages/forms/src/index.mjs')).toContain('// rendu');
    expect(ticketDe(id)).toMatchObject({ status: 'closed' });
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('RENDU « Agent : testeur <composant> » relaunches the testeur, the proof, the developpeur, the checks', () => {
    const id = 'demo-rendu-testeur';
    ticket(id, '000-forms');
    scenario(id, 'testeur-1', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The testeur adds the case the reviewer found; the test already green is justified.
    scenario(
      id,
      'testeur-2',
      `cat > $c/test/echelle.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import * as m from '../src/index.mjs';
it('critère 2 — echelle rend le triple', () => { expect(m.echelle?.(2)).toBe(6); });
EOF
passation 'vert attendu : critère 1 — mesure rend le double — livré avant le rendu'
`
    );
    scenario(
      id,
      'developpeur-2',
      `printf 'export const echelle = x => 3 * x;\\n' >> $c/src/index.mjs\npassation 'Echelle écrite.'\n`
    );
    scenario(id, 'relecteur-1', rendu('testeur packages/forms', 'echelle manque.'));
    scenario(id, 'relecteur-2', "verdict 'ACCEPTÉ'\n");
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testeur')).toBe(2);
    expect(sessions(id, 'developpeur')).toBe(2);
    expect(essai(id, 'testeur-2.prompt')).toContain('echelle manque.');
    expect(historique(id).slice(-8)).toEqual([
      ['packages/forms', 'relecture'],
      ['packages/forms', 'testeur'],
      ['packages/forms', 'preuve'],
      ['packages/forms', 'developpeur'],
      ['packages/forms', 'controles'],
      ['packages/forms', 'relecture'],
      ['packages/forms', 'integration'],
      ['packages/forms', 'file'],
    ]);
    const preuve = commentaires(id).filter(t => t.startsWith('Circuit · packages/forms · preuve'));
    expect(preuve.at(-1)).toContain('critère 2 — echelle rend le triple');
  });

  it('stops at « relecture-arret » (16) on a finding without a valid recipient, or on a criterion', () => {
    const id = 'demo-rendu-sans-destinataire';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, 'relecteur-1', rendu('chef packages/forms'));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(16);
    expect(ARRETS['relecture-arret']).toBe(16);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'relecture', raison: 'relecture-arret', code: 16 });
    expect(e?.rapport).toContain("n'a pas de destinataire valide");
    expect(e?.rapport).toContain('La décision revient au chef de chantier');
    expect(enFile()).not.toContain(`agent/${id}`);
    // Resumed, the reviewer puts a criterion itself in question: a stop again.
    scenario(
      id,
      'relecteur-2',
      rendu('developpeur packages/forms', 'Critère en cause : 1, le double contredit la spec.')
    );
    const r2 = circuit([id, '--reprendre']);
    expect(r2.status, sortie(r2)).toBe(16);
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(etat(id)?.rapport).toContain('met en cause un critère');
  });

  it('stops at « relecture-arret » at the third RENDU', () => {
    const id = 'demo-trois-rendus';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'developpeur',
      `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\npassation 'Un tour.'\n`
    );
    scenario(id, 'relecteur', rendu('developpeur 000-forms'));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(16);
    expect(sessions(id, 'relecteur')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(3);
    // Each round is a first developpeur session: none on the strong model.
    for (const n of [2, 3]) {
      expect(args(id, 'developpeur', n)).not.toContain('--model');
    }
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'relecture', raison: 'relecture-arret', code: 16 });
    expect(e?.rapport).toContain('3 relectures ont rendu le lot');
    expect(enFile()).not.toContain(`agent/${id}`);
  });
});
