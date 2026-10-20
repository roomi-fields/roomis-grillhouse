import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the order of the
// components and their steps, and the proof of the testeur's red.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  REPO,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  etat,
  ordre,
  commentaires,
  historique,
} = circuitEssai(ESSAIS);

const ECRIT_VERT = `cat > $c/test/forme.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend un nombre', () => { expect(typeof mesure(1)).toBe('number'); });
EOF
`;
const ECRIT_CASSE = `cat > $c/test/casse.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { absent } from '../src/absent.mjs';
it('critère 1 — absent rend 1', () => { expect(absent()).toBe(1); });
EOF
`;

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  it('passes each component of the title, provider first: testeur, proof, developpeur, checks', () => {
    const id = 'demo-ordre';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    const etapes = ['testeur', 'preuve', 'developpeur', 'controles'];
    expect(historique(id)).toEqual([
      ...etapes.map(e => ['packages/forms', e]),
      ...etapes.map(e => ['packages/binder', e]),
      ['packages/binder', 'relecture'],
      ['packages/binder', 'integration'],
      ['packages/binder', 'file'],
    ]);
    // The proof is written at the ticket: the red tests.
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · packages/forms · preuve'));
    expect(preuve).toContain('critère 1 — mesure rend le double');
    // The state: relecture, every field written.
    const e = etat(id);
    expect(Object.keys(e ?? {}).sort()).toEqual(
      [
        'atteint',
        'chef',
        'code',
        'composant',
        'dernier',
        'etape',
        'finale',
        'journal',
        'mene',
        'raison',
        'rapport',
        'renvois',
        'reprise',
        'seance',
        'tentative',
      ].sort()
    );
    expect(e?.etape).toBe('integre');
    expect(e?.code).toBe(0);
    // The final pass green carried every component to green checks.
    expect(e?.atteint).toBe('packages/binder');
    expect(e?.journal).toBe(path.join(REPO, '.claude/worktrees', `${id}.log`));
    // The instruction the circuit writes: its ticket, its component, the criteria, the proof of
    // the step before and the last handover.
    const consigne = essai(id, 'developpeur-1.prompt');
    expect(consigne).toContain(`TON TICKET : ${id}`);
    expect(consigne).toContain('TON COMPOSANT : packages/forms');
    expect(consigne).toContain('1. `mesure` rend le double de sa valeur.');
    expect(consigne).toContain('critère 1 — mesure rend le double');
    expect(consigne).toContain('Tests écrits, rouges.');
    expect(essai(id, 'testeur-1.prompt')).toContain('TON COMPOSANT : packages/forms');
    expect(essai(id, 'testeur-2.prompt')).toContain('TON COMPOSANT : packages/binder');
  });

  it('sends a green test without its line « vert attendu » back to the testeur', () => {
    const id = 'demo-vert';
    ticket(id, '000-forms');
    scenario(id, 'testeur-1', `${ECRIT_ROUGE}${ECRIT_VERT}passation 'Tests écrits.'\n`);
    scenario(
      id,
      'testeur-2',
      "passation 'vert attendu : critère 1 — mesure rend un nombre — la forme est déjà juste'\n"
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testeur')).toBe(2);
    const relance = essai(id, 'testeur-2.prompt');
    expect(relance).toContain('critère 1 — mesure rend un nombre');
    expect(relance).toContain('vert attendu');
    // The proof at the ticket names its whole report, which holds the justified green and its
    // reason; the ticket does not.
    const preuves = commentaires(id).filter(t => t.startsWith('Circuit · packages/forms · preuve'));
    expect(preuves.at(-1)).not.toContain('la forme est déjà juste');
    const complet = /Le rapport entier, avec les verts justifiés et leurs raisons : (\S+)/.exec(
      preuves.at(-1) ?? ''
    )?.[1];
    expect(complet).toMatch(new RegExp(`/\\.claude/worktrees/${id}\\.preuve-\\d+\\.md$`));
    expect(readFileSync(complet ?? '', 'utf8')).toContain('la forme est déjà juste');
  });

  it('relaunches the testeur twice at most, then stops at « preuve »', () => {
    const id = 'demo-preuve';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}${ECRIT_VERT}passation 'Tests écrits.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'testeur')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(0);
    expect(etat(id)).toMatchObject({
      etape: 'preuve',
      composant: 'packages/forms',
      raison: 'preuve',
    });
    expect(historique(id).at(-1)).toEqual(['packages/forms', 'preuve']);
  });

  it('takes a test file that does not load for no proof', () => {
    const id = 'demo-casse';
    ticket(id, '000-forms');
    scenario(id, 'testeur-1', `${ECRIT_ROUGE}${ECRIT_CASSE}passation 'Tests écrits.'\n`);
    scenario(id, 'testeur-2', `rm $c/test/casse.test.mjs\npassation 'Fichier cassé retiré.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testeur')).toBe(2);
    const relance = essai(id, 'testeur-2.prompt');
    expect(relance).toContain('packages/forms/test/casse.test.mjs');
    expect(relance).toContain('ne se charge pas');
  });
});
