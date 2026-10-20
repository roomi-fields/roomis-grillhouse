import { readFileSync, rmSync } from 'node:fs';
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

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): a failed build, the
// red of the component whose package it builds.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, sessions, etat, ordre, commentaires } =
  circuitEssai(ESSAIS);

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  // A package whose build fails while its file `casse` exists, as tsc fails on a reader whose
  // provider's type gained a field.
  const casserLaConstruction = (copie: string, dossier: string) => {
    const p = path.join(copie, 'packages', dossier);
    const pkg = JSON.parse(readFileSync(path.join(p, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    ecrire(
      path.join(p, 'package.json'),
      json({ ...pkg, scripts: { ...pkg.scripts, build: 'node build.mjs' } })
    );
    ecrire(
      path.join(p, 'build.mjs'),
      `import { existsSync } from 'node:fs';
if (existsSync('casse')) {
  console.log("src/x.ts(1,1): error TS2741: Property 'champ' is missing in type 'Forme'.");
  process.exit(1);
}
`
    );
    ecrire(path.join(p, 'casse'), '');
  };

  it('takes the failed build of a package of the component for its red, its tests for the checks', () => {
    const id = 'demo-construction';
    const copie = ticket(id, '000-forms, 030-binder');
    casserLaConstruction(copie, 'binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}rm $c/casse\npassation 'Binder construit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · packages/binder · preuve'));
    expect(preuve).toContain('1 rouge(s)');
    expect(preuve).toContain('0 fichier(s) qui ne se charge(nt) pas');
    // The failed build named with its own log, whose beginning follows.
    expect(preuve).toContain('construction de 030-binder — son journal : ');
    expect(preuve).toContain("src/x.ts(1,1): error TS2741: Property 'champ' is missing");
    expect(preuve).toContain(
      'Les tests de 030-binder se jouent aux contrôles, après le développeur.'
    );
  });

  // Witness: BPScript (bp-mono-vbwf.320.2.2.1.5). 030-binder and 040-checker each hold the other
  // in their devDependencies for their tests; the lot of 000-forms breaks both builds. The proof
  // of 030-binder saw only the failed build of 040-checker, Turborepo having stopped at it, and
  // counted 0 red and its files « ne se charge pas ».
  it('counts the failed build of each of two components that test each other at its own proof', () => {
    const id = 'demo-construction-croisee';
    const copie = ticket(id, '000-forms, 030-binder, 040-checker');
    const checker = path.join(copie, 'packages/checker');
    ecrire(
      path.join(checker, 'package.json'),
      json({
        name: '040-checker',
        type: 'module',
        scripts: { 'test:vitest': 'vitest run' },
        dependencies: { '000-forms': '*' },
        devDependencies: { '030-binder': '*' },
      })
    );
    ecrire(path.join(checker, 'src/index.mjs'), 'export const mesure = x => x;\n');
    ecrire(
      path.join(checker, 'vitest.config.mjs'),
      `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
    );
    const binder = path.join(copie, 'packages/binder/package.json');
    ecrire(
      binder,
      json({
        ...JSON.parse(readFileSync(binder, 'utf8')),
        devDependencies: { '040-checker': '*' },
      })
    );
    casserLaConstruction(copie, 'binder');
    casserLaConstruction(copie, 'checker');
    // The build of binder fails after checker's, as in BPScript: a run that stops at the first
    // failure cancels it unreported.
    const construction = path.join(copie, 'packages/binder/build.mjs');
    ecrire(
      construction,
      `await new Promise(r => setTimeout(r, 2000));\n${readFileSync(construction, 'utf8')}`
    );
    ecrireTurbo(copie);
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}rm -f $c/casse\npassation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'testeur packages/checker',
      'developpeur packages/checker',
      'relecteur',
    ]);
    const etape = (composant: string, nom: string) =>
      commentaires(id).find(t => t.startsWith(`Circuit · packages/${composant} · ${nom}`));
    for (const [composant, nom] of [
      ['binder', '030-binder'],
      ['checker', '040-checker'],
    ]) {
      const preuve = etape(composant, 'preuve');
      expect(preuve).toContain('1 rouge(s)');
      expect(preuve).toContain('0 fichier(s) qui ne se charge(nt) pas');
      expect(preuve).toContain(`construction de ${nom} — son journal : `);
      expect(preuve).toContain('src/x.ts(1,1): error TS2741');
    }
    expect(etape('binder', 'preuve')).not.toContain('construction de 040-checker');
    // Binder built, its tests wait for the build of checker: a red of the component after.
    const controles = etape('binder', 'controles');
    expect(controles).toContain('laissés à la passe finale');
    expect(etape('checker', 'controles')).toContain('controles : verts : npm run verifier.');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('leaves the files of a component broken when the build that fails lies out of it', () => {
    const id = 'demo-construction-ailleurs';
    const copie = ticket(id, '030-binder');
    casserLaConstruction(copie, 'forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'testeur')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(0);
    const relance = essai(id, 'testeur-3.prompt');
    expect(relance).toContain('packages/binder/test/mesure.test.mjs — ne se charge pas');
    expect(relance).not.toContain('construction de 000-forms');
    expect(relance).not.toContain('Rouges (');
    const arret = commentaires(id)
      .filter(t => t.includes(' · preuve : arrêt preuve'))
      .pop();
    expect(arret).toContain('1 fichier(s) qui ne se charge(nt) pas');
  });
});
