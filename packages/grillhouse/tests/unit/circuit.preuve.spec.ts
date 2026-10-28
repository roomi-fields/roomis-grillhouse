import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the order of its
// steps, and the proof of the testwriter's red.
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
  journal,
} = circuitEssai(ESSAIS);

// The commands the proof ran, in their order: the lines `$ …` of the log under a header of the
// step `preuve`.
const lancements = (id: string) => {
  let dans = false;
  const out: string[] = [];
  for (const l of journal(id).split('\n')) {
    if (l.startsWith('=== ')) {
      dans = l.endsWith(' · circuit · preuve ===');
    } else if (dans && l.startsWith('$ ')) {
      out.push(l.slice(2));
    }
  }
  return out;
};

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
  it('passes the ticket through its steps: testwriter, proof, developpeur, checks, final pass, review, integration', () => {
    const id = 'demo-ordre';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // A zone of its own, half an hour past the hour: the log says the local time of the machine.
    const r = circuit([id], { TZ: 'Asia/Kolkata' });
    expect(r.status, sortie(r)).toBe(0);
    // grillhouse-5m1.1, criterion 4. Witness: BP 320.3.2.1 (N8), the sessions' headers in local
    // time, the steps' in UTC. Every header of the log, a session's or a step's, says the local
    // time with its offset, as ISO 8601 writes it.
    const tetes = journal(id)
      .split('\n')
      .filter(l => l.startsWith('=== '));
    expect(tetes.some(l => l.includes(' · circuit · '))).toBe(true);
    expect(tetes.some(l => !l.includes(' · circuit · '))).toBe(true);
    for (const l of tetes) {
      expect(l).toMatch(/^=== \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+05:30 · /);
    }
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    expect(historique(id)).toEqual([
      'testwriter',
      'preuve',
      'developpeur',
      'controles',
      'controles',
      'relecture',
      'integration',
      'file',
    ]);
    // The proof is written at the ticket: the red tests.
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · preuve'));
    expect(preuve).toContain('critère 1 — mesure rend le double');
    // The state: every field written.
    const e = etat(id);
    expect(Object.keys(e ?? {}).sort()).toEqual(
      [
        'aRegenerer',
        'avancement',
        'boucles',
        'code',
        'constats',
        'depart',
        'etape',
        'finale',
        'journal',
        'mene',
        'paquets',
        'processus',
        'question',
        'questionnement',
        'raison',
        'rapport',
        'refus',
        'reprise',
        'seance',
        'tentative',
        'verifie',
      ].sort()
    );
    expect(e?.etape).toBe('integre');
    expect(e?.code).toBe(0);
    // The packages of the plan, which every session writes.
    expect(e?.paquets).toEqual(['packages/forms']);
    // The lot the whole final pass green played is the one the integration takes.
    expect(e?.verifie).toMatch(/^[0-9a-f]{40}$/);
    expect(e?.journal).toBe(path.join(REPO, '.claude/worktrees', `${id}.log`));
    // The instruction the circuit writes: its ticket, its plan, the criteria, the proof of the step
    // before and the last handover.
    const consigne = essai(id, 'developpeur-1.prompt');
    expect(consigne).toContain(`TON TICKET : ${id}`);
    expect(consigne).toContain('TON PLAN : packages/forms');
    expect(consigne).not.toContain('TON COMPOSANT');
    expect(consigne).toContain('1. `mesure` rend le double de sa valeur.');
    expect(consigne).toContain('critère 1 — mesure rend le double');
    expect(consigne).toContain('Tests écrits, rouges.');
    expect(essai(id, 'testwriter-1.prompt')).toContain('TON PLAN : packages/forms');
  });

  // Witness: BPScript (bp-mono-vbwf.325). The proof played every test of its package, 5.2 min,
  // where the new tests of the lot alone had to be seen red.
  it('plays at the proof the test files of the lot alone, not the packages of the plan', () => {
    const id = 'demo-preuve-du-lot';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(lancements(id)).toEqual(['npm test -- --force packages/forms/test/mesure.test.mjs']);
  });

  it('sends a green test no expected green of the testwriter’s sheet names back to the testwriter', () => {
    const id = 'demo-vert';
    ticket(id, '000-forms');
    scenario(id, 'testwriter-1', `${ECRIT_ROUGE}${ECRIT_VERT}passation 'Tests écrits.'\n`);
    scenario(
      id,
      'testwriter-2',
      `passation 'Vert justifié.'\nfiche '{"statut":"FAIT","verts_attendus":[{"fichier":"packages/forms/test/forme.test.mjs","test":"critère 1 — mesure rend un nombre","raison":"la forme est déjà juste"}]}'\n`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(2);
    const relance = essai(id, 'testwriter-2.prompt');
    expect(relance).toContain('critère 1 — mesure rend un nombre');
    expect(relance).toContain('vert attendu');
    // The second testwriter changes no file: his expected green is judged on the result of the
    // proof already played, which does not play again (witness: BPScript, bp-mono-vbwf.325).
    expect(lancements(id)).toHaveLength(1);
    // The proof at the ticket names its whole report, which holds the justified green and its
    // reason; the ticket does not.
    const preuves = commentaires(id).filter(t => t.startsWith('Circuit · preuve'));
    expect(preuves.at(-1)).not.toContain('la forme est déjà juste');
    const complet = /Le rapport entier, avec les verts justifiés et leurs raisons : (\S+)/.exec(
      preuves.at(-1) ?? ''
    )?.[1];
    expect(complet).toMatch(new RegExp(`/\\.claude/worktrees/${id}\\.preuve-\\d+\\.md$`));
    expect(readFileSync(complet ?? '', 'utf8')).toContain('la forme est déjà juste');
  });

  // grillhouse-j2m — the proof reads the full name of an expected green whatever the separator
  // between its group and its test, as Vitest prints it (« > ») and Jest and the report of the
  // proof (« › »). Witness: BPScript 320.3.2.1, the sheet of 11:45:03 refused (« 7 vert(s) sans
  // vert attendu ») for « the order of the cascade the library declares › critère 3 : … », the
  // report naming « the order of the cascade the library declares critère 3 : … ».
  it('grillhouse-j2m critère 5 — an expected green named with « › » or « > » between its group and its test justifies its test, at the first proof', () => {
    const id = 'demo-verts-separateurs';
    ticket(id, '000-forms');
    const groupes = `cat > $c/test/forme.test.mjs <<'EOF'
import { describe, expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
describe('la forme', () => {
  it('critère 1 — mesure rend un nombre', () => { expect(typeof mesure(1)).toBe('number'); });
});
describe('le signe', () => {
  it('critère 1 — mesure de zéro rend zéro', () => { expect(mesure(0)).toBe(0); });
});
EOF
`;
    const fiche = {
      statut: 'FAIT',
      verts_attendus: [
        {
          fichier: 'packages/forms/test/forme.test.mjs',
          test: 'la forme › critère 1 — mesure rend un nombre',
          raison: 'la forme est déjà juste',
        },
        {
          fichier: 'packages/forms/test/forme.test.mjs',
          test: 'le signe > critère 1 — mesure de zéro rend zéro',
          raison: 'zéro est déjà juste',
        },
      ],
    };
    scenario(
      id,
      'testwriter',
      `${ECRIT_ROUGE}${groupes}passation 'Tests écrits.'\nfiche '${JSON.stringify(fiche)}'\n`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(lancements(id)).toHaveLength(1);
    const preuves = commentaires(id).filter(t => t.startsWith('Circuit · preuve'));
    expect(preuves).toHaveLength(1);
    expect(preuves[0]).toContain('2 vert(s) justifié(s), 0 vert(s) sans vert attendu');
  });

  it('relaunches the testwriter twice at most, then stops at « preuve »', () => {
    const id = 'demo-preuve';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}${ECRIT_VERT}passation 'Tests écrits.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'testwriter')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(0);
    expect(etat(id)).toMatchObject({ etape: 'preuve', raison: 'preuve' });
    expect(historique(id).at(-1)).toBe('preuve');
  });

  it('takes a test file that does not load for no proof', () => {
    const id = 'demo-casse';
    ticket(id, '000-forms');
    scenario(id, 'testwriter-1', `${ECRIT_ROUGE}${ECRIT_CASSE}passation 'Tests écrits.'\n`);
    scenario(id, 'testwriter-2', `rm $c/test/casse.test.mjs\npassation 'Fichier cassé retiré.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(2);
    const relance = essai(id, 'testwriter-2.prompt');
    expect(relance).toContain('packages/forms/test/casse.test.mjs');
    expect(relance).toContain('ne se charge pas');
    // The second testwriter changes the lot: the proof plays it again.
    expect(lancements(id)).toHaveLength(2);
  });
});
