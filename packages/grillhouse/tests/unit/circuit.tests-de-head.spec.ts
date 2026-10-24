import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ecrire, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the tests HEAD
// already holds, in the proof and at the checks.
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
  gitRepo,
  commentaires,
} = circuitEssai(ESSAIS);

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  // A reader of forms that HEAD already holds, green there: `lit` of binder renders the value
  // `mesure` of forms gives, and its test expects the value itself. The double of the forms lot
  // turns it red; LECTEUR_JUSTE is binder's repair. The reader is committed on the trial's main,
  // where the integration applies the lot, for the time of <essai> alone: the tests after it start
  // from the main without it.
  const avecLecteur = (essai: () => void) => {
    const avant = gitRepo('rev-parse', 'HEAD').trim();
    ecrire(
      path.join(REPO, 'packages/binder/src/lecteur.mjs'),
      "import { mesure } from '../../forms/src/index.mjs';\nexport const lit = x => mesure(x);\n"
    );
    ecrire(
      path.join(REPO, 'packages/binder/test/lecteur.test.mjs'),
      `import { expect, it } from 'vitest';
import { lit } from '../src/lecteur.mjs';
it('lecteur — lit rend sa valeur', () => { expect(lit(2)).toBe(2); });
`
    );
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', REPO, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('add', 'packages/binder/src/lecteur.mjs', 'packages/binder/test/lecteur.test.mjs');
    git('commit', '-qm', 'lecteur');
    try {
      essai();
    } finally {
      git('reset', '-q', '--hard', avant);
    }
  };
  const LECTEUR_JUSTE = `printf "import { mesure } from '../../forms/src/index.mjs';\\nexport const lit = x => mesure(x) / 2;\\n" > $c/../binder/src/lecteur.mjs\n`;

  // Witness: BPScript (bp-mono-vbwf.320.2.2.1.5). The provider changes a type; tests the readers
  // already held, green at HEAD, turn red. In the one session of the ticket's developpeur
  // (grillhouse-3uv.95.6), the checks of the plan play every package of it, the reader's whole:
  // its red goes back to the developpeur, who repairs the reader.
  it('takes a test HEAD holds that the lot turns red, in a package of the plan the lot does not touch, for a red of the checks', () =>
    avecLecteur(() => {
      const id = 'demo-rouge-existant';
      ticket(id, '000-forms, 030-binder');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
      scenario(id, 'developpeur-2', `${LECTEUR_JUSTE}passation 'Lecteur réparé.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'developpeur', 'relecteur']);
      const consigne = essai(id, 'developpeur-2.prompt');
      expect(consigne).toContain('Contrôles du plan');
      expect(consigne).toContain('Tes rouges (');
      expect(consigne).toContain('packages/binder/test/lecteur.test.mjs');
      expect(consigne).toContain('lit rend sa valeur');
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0, finale: true });
    }));
});

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  it('fails the proof without a file of the lot nor a red, the greens HEAD holds not counted', () => {
    const id = 'demo-rien';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', "passation 'Rien écrit.'\n");
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'testwriter')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(0);
    const relance = essai(id, 'testwriter-2.prompt');
    expect(relance).toContain('Aucun fichier de test du lot dans le plan');
    expect(relance).toContain('0 rouge(s)');
    expect(relance).not.toContain('ancien — mesure rend un nombre');
  });

  it('proves only the tests the lot adds or changes, not those HEAD already holds', () => {
    const id = 'demo-anciens';
    const copie = ticket(id, '000-forms');
    scenario(
      id,
      'testwriter',
      `cat >> $c/test/ancien.test.mjs <<'EOF'
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
EOF
passation 'Test ajouté, rouge.'
`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(1);
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · preuve'));
    expect(preuve).toContain('1 rouge(s)');
    expect(preuve).toContain('0 vert(s) sans vert attendu');
    expect(preuve).not.toContain('› ancien — mesure rend un nombre');
    // The version of HEAD it played leaves nothing in the lot: the commit holds the two files.
    expect(existsSync(copie)).toBe(false);
    const commit = gitRepo('show', '--name-status', '--format=', 'main');
    expect(commit.split('\n').filter(Boolean).sort()).toEqual(
      ['M\tpackages/forms/src/index.mjs', 'M\tpackages/forms/test/ancien.test.mjs'].sort()
    );
  });
});
