// @equipee: l'enveloppe bwrap, un serveur Temporal
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import {
  sortie,
  ecrire,
  ecrireTurbo,
  json,
  ARRETS,
  CODE_JUSTE,
  BASE,
  circuitEssai,
} from './circuit-essai.js';

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
  // that a reader out of the title reads; its test turned red only at the integration's `npm run
  // verifier`, the final pass playing the packages of the title alone. The package declares the
  // directory (`grillhouse.lit`), which brings it into the final pass, and its test the files it
  // reads (`// @lit`, grillhouse-44b.17), which plays it in that targeted pass (grillhouse-44b.15).
  // grillhouse-3uv.190: the red of the reader lies in its test file alone, so the plan extends to
  // the tests of the reader, without a stop, and the testwriter is relaunched. The stand-in lifts
  // nothing, and the circuit stops at « controles » once his three relaunches are spent. The
  // relaunches come in turn from the final pass and from the checks restricted to the red file,
  // which follow a proof that finds it red; between the two final passes the checks of the
  // whole plan, which play its packages and not the reader, are green, and do not start the count
  // again.
  it('plays npm run verifier at the final pass, extends the plan to the red tests of a reader package out of the plan, and stops at « controles » once the testwriter has not lifted them', () => {
    const id = 'demo-finale-hors-titre';
    const copie = ticket(id, '000-forms');
    // 020-loader reads `libraries/` at the root, whose files are all `.bp`; HEAD holds it green.
    const loader = path.join(copie, 'packages/loader');
    ecrire(
      path.join(loader, 'package.json'),
      json({
        name: '020-loader',
        type: 'module',
        scripts: { 'test:unit': 'vitest run' },
        grillhouse: { lit: ['libraries'] },
      })
    );
    ecrire(
      path.join(loader, 'vitest.config.mjs'),
      `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
    );
    ecrire(
      path.join(loader, 'test/bibliotheques.test.mjs'),
      `// @lit libraries/**
import { readdirSync } from 'node:fs';
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
    // The relaunches of the testwriter, bounded (RELANCES_TESTWRITER + 1 of scripts/transitions.mjs).
    expect(sessions(id, 'testwriter')).toBe(3);
    // The steps, in their order: the checks of the plan green then the final pass red (relaunch
    // 1); the proof red in the file of the reader, then the checks restricted to it, red (relaunch
    // 2); the proof without a red, the checks of the plan green, the final pass red (relaunch 3);
    // the proof red, the checks restricted to the file red: the bound, and the stop.
    expect(historique(id)).toEqual([
      'developpeur',
      'controles',
      'controles',
      'testwriter',
      'preuve',
      'controles',
      'testwriter',
      'preuve',
      'controles',
      'controles',
      'testwriter',
      'preuve',
      'controles',
    ]);
    // The stop stands at the checks restricted to the red file of the reader, not at the final
    // pass: its state and the heading of its report say so.
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'controles',
      finale: false,
      raison: 'controles',
      code: ARRETS.controles,
      reprise: { fichiers: ['packages/loader/test/bibliotheques.test.mjs'] },
    });
    expect(e?.rapport).toMatch(
      /^Contrôles du plan, ses tests et ses paquets, ses gardes dans son enveloppe : rouge : 1 rouge\(s\) — npm test -- packages\/loader\/test\/bibliotheques\.test\.mjs \(code 1\)\./
    );
    expect(e?.rapport).not.toContain('sur la copie entière');
    // The red named from the reports, with its package, never the end of the log.
    expect(e?.rapport).toContain(
      '- 020-loader : test packages/loader/test/bibliotheques.test.mjs › '
    );
    expect(e?.rapport).not.toContain('$ npm run verifier\n');
    expect(e?.rapport).toContain('chaque fichier est une bibliothèque .bp');
    const dits = commentaires(id);
    // The final pass played npm run verifier out of the plan's packages alone: on the band of the
    // lot, with the reader that declares it reads what the lot changes.
    const finales = dits.filter(t => t.includes('npm run verifier -- --filter=...['));
    expect(finales.length).toBeGreaterThan(0);
    for (const t of finales) {
      expect(t).toContain('--filter=...020-loader --filter=//');
      expect(t).toContain(
        'le rouge nomme packages/loader/test/bibliotheques.test.mjs : testwriter relancé'
      );
    }
    // The extension said once at the ticket, with its piece: the package stays out of the title.
    const extensions = dits.filter(t =>
      t.includes('le circuit étend le plan aux tests de packages/loader')
    );
    expect(extensions).toHaveLength(1);
    expect(extensions[0]).toContain(
      "packages/loader : packages/loader/test/bibliotheques.test.mjs ; hors du titre du plan, que le plan n'a pas écarté"
    );
    expect(extensions[0]).toContain("ils n'entrent pas au titre (packages/forms)");
    expect(e?.paquets).toEqual(['packages/forms']);
    // Stopped before the review, the red named in the comment of the stop.
    expect(historique(id)).not.toContain('relecture');
    const arret = dits.filter(t => t.includes(' : arrêt ')).pop();
    expect(arret).toContain('arrêt controles');
    expect(arret).toContain('packages/loader/test/bibliotheques.test.mjs');
    // The question carries the stop's reds read in the structured results as its piece, each with
    // its package.
    const q = etat(id)?.question;
    expect(q?.piece).toContain(
      '- 020-loader : test packages/loader/test/bibliotheques.test.mjs › '
    );
    expect(q?.qui).toBe('superviseur');
  });
});
