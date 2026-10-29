import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { ecrire as ecrireTurbo } from '../../scripts/langages/typescript/turbo-des-paquets.mjs';
import { sortie, ecrire, json, ARRETS, CODE_JUSTE, BASE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the final pass and its
// npm run verifier; its developpeur sessions counted together: tests/unit/circuit.ticket.spec.ts.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, sessions, etat, commentaires, historique } =
  circuitEssai(ESSAIS);

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  // Witness: BPScript (bp-mono-vbwf.320.2.2.1.5). The lot adds a file to a directory of the root
  // that a reader out of the title reads (`grillhouse.lit`); its test turned red only at the
  // integration's `npm run verifier`, the final pass playing the packages of the title alone.
  it('plays npm run verifier at the final pass, and stops at « controles » on a red of a package out of the plan', () => {
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
    const r = circuit([id, '--depuis', 'developpeur', '--contexte', 'RENDU : le double.']);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'controles',
      finale: true,
      raison: 'controles',
      code: ARRETS.controles,
    });
    // The red named from the reports, with its package, never the end of the log.
    expect(e?.rapport).toContain(
      '- 020-loader : test packages/loader/test/bibliotheques.test.mjs › '
    );
    expect(e?.rapport).not.toContain('$ npm run verifier\n');
    // The report names where the final pass played: out of the envelope, on the whole copy.
    expect(e?.rapport).toContain(
      'Contrôles de la passe finale, hors enveloppe, sur la copie entière'
    );
    expect(e?.rapport).not.toContain('Contrôles du plan');
    expect(e?.rapport).toContain('020-loader');
    expect(e?.rapport).toContain('chaque fichier est une bibliothèque .bp');
    expect(e?.rapport).toContain('hors du plan du ticket (packages/forms)');
    expect(e?.rapport).toContain('Le superviseur étend le plan à ce paquet (`--etendre`)');
    // Stopped before the review, the package named in the comment of the stop.
    expect(historique(id)).not.toContain('relecture');
    const arret = commentaires(id)
      .filter(t => t.includes(' : arrêt '))
      .pop();
    expect(arret).toContain('arrêt controles');
    expect(arret).toContain('020-loader');
    // The question carries the stop's reds read in the structured results as its piece, each with
    // its package, apart from its fact, which does not repeat them.
    const q = etat(id)?.question;
    expect(q?.piece).toContain(
      '- 020-loader : test packages/loader/test/bibliotheques.test.mjs › '
    );
    expect(q?.fait).toContain('hors du plan du ticket (packages/forms)');
    expect(q?.fait).not.toContain('bibliotheques.test.mjs');
  });
});
