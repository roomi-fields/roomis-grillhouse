import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { ecrire as ecrireTurbo } from '../../scripts/turbo-des-paquets.mjs';
import {
  sortie,
  ecrire,
  json,
  ARRETS,
  CODE_JUSTE,
  ECRIT_ROUGE,
  BASE,
  circuitEssai,
} from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the final pass, its
// developpeur sessions counted together, and its npm run verifier.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  sessions,
  args,
  etat,
  ordre,
  commentaires,
  historique,
} = circuitEssai(ESSAIS);

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  it('counts the developpeur sessions of the final pass together: three, then « controles »', () => {
    const id = 'demo-ping-pong';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    scenario(
      id,
      'developpeur-2',
      `${CODE_JUSTE}touch $c/ping-pong.txt\npassation 'Code de binder écrit.'\n`
    );
    scenario(
      id,
      'developpeur',
      `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\npassation 'Un tour.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    // The final pass: binder's first session, forms', then binder's on the strong model.
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'developpeur packages/forms',
      'developpeur packages/binder',
      // The stop goes to a session of the chef de chantier, who answers nothing here, asked again
      // once.
      'chef-de-chantier',
      'chef-de-chantier',
    ]);
    const fort = args(id, 'developpeur', 4);
    expect(fort[fort.indexOf('--model') + 1]).toBe('opus');
    expect(args(id, 'developpeur', 3)).not.toContain('--model');
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'controles', raison: 'controles', finale: true });
    expect(e?.rapport).toContain('les deux composants se renvoient la mesure');
  });
});

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  // Witness: BPScript (bp-mono-vbwf.320.2.2.1.5). The lot adds a file to a directory of the root
  // that a reader out of the title reads (`grillhouse.lit`); its test turned red only at the
  // integration's `npm run verifier`, the final pass playing the packages of the title alone.
  it('plays npm run verifier at the final pass, and stops at « controles » on a red of a package out of the title', () => {
    const id = 'demo-finale-hors-titre';
    const copie = ticket(id, '000-forms');
    // 020-loader reads `libraries/` at the root, whose files are all `.bp`; HEAD holds it green.
    const loader = path.join(copie, 'packages/loader');
    ecrire(
      path.join(loader, 'package.json'),
      json({
        name: '020-loader',
        type: 'module',
        scripts: { 'test:vitest': 'vitest run' },
        grillhouse: { lit: ['libraries'] },
      })
    );
    ecrire(
      path.join(loader, 'vitest.config.mjs'),
      `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
    );
    ecrire(
      path.join(loader, 'test/bibliotheques.test.mjs'),
      `import { readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
it('bibliothèques — chaque fichier est une bibliothèque .bp', () => {
  const noms = readdirSync(new URL('../../../libraries', import.meta.url));
  expect(noms.filter(n => !n.endsWith('.bp'))).toEqual([]);
});
`
    );
    ecrire(path.join(copie, 'libraries/base.bp'), 'base\n');
    ecrireTurbo(copie);
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', copie, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('add', '-A');
    git('commit', '-qm', 'loader');
    // The lot: forms's test, and a file the loader refuses in `libraries/`.
    ecrire(
      path.join(copie, 'packages/forms/test/mesure.test.mjs'),
      `import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
`
    );
    ecrire(path.join(copie, 'libraries/notes.txt'), 'notes\n');
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    const r = circuit([
      id,
      '--depuis',
      'developpeur',
      '000-forms',
      '--contexte',
      'RENDU : le double.',
    ]);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'controles',
      composant: 'packages/forms',
      raison: 'controles',
      code: ARRETS.controles,
    });
    expect(e?.rapport).toContain('$ npm run verifier\n');
    // The report names where the final pass played: out of the envelope, on the whole copy.
    expect(e?.rapport).toContain(
      'Contrôles de la passe finale, hors enveloppe, sur la copie entière'
    );
    expect(e?.rapport).not.toContain('Contrôles du composant');
    expect(e?.rapport).toContain('020-loader');
    expect(e?.rapport).toContain('chaque fichier est une bibliothèque .bp');
    expect(e?.rapport).toContain('hors des composants du ticket (packages/forms)');
    expect(e?.rapport).toContain('La décision revient au chef de chantier');
    // Stopped before the review, the package named in the comment of the stop.
    expect(historique(id).map(([, etape]) => etape)).not.toContain('relecture');
    const arret = commentaires(id).at(-1);
    expect(arret).toContain('arrêt controles');
    expect(arret).toContain('020-loader');
  });
});
