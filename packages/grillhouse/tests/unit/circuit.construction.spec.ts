import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { ecrire as ecrireTurbo } from '../../scripts/langages/typescript/turbo-des-paquets.mjs';
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

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): a failed build of a
// package of the plan, a red of the proof.
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

  it('takes the failed build of a package of the plan for its red, its tests for the checks', () => {
    const id = 'demo-construction';
    const copie = ticket(id, '030-binder');
    casserLaConstruction(copie, 'binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur',
      `${CODE_JUSTE}rm $c/casse\npassation 'Code écrit, binder construit.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · preuve'));
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
  // counted 0 red and its files « ne se charge pas ». The testwriter of the ticket writes the tests
  // of both readers; its one proof counts both builds.
  it('counts at the proof the failed build of each of two packages of the plan that test each other', () => {
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
    const lecteurs = ['binder', 'checker'];
    scenario(
      id,
      'testwriter',
      `${lecteurs.map(p => ECRIT_ROUGE.replaceAll('$c', `$c/../${p}`)).join('')}passation 'Tests écrits, rouges.'\n`
    );
    scenario(
      id,
      'developpeur',
      `${lecteurs.map(p => `${CODE_JUSTE.replaceAll('$c', `$c/../${p}`)}rm -f $c/../${p}/casse\n`).join('')}passation 'Code écrit.'\n`
    );
    const r = circuit([id]);
    expect(r.status, `${sortie(r)}\n${etat(id)?.rapport ?? ''}`).toBe(0);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    // The one proof of the ticket names both failed builds, each with its own log.
    const preuve = commentaires(id).find(t => t.startsWith('Circuit · preuve'));
    for (const nom of ['030-binder', '040-checker']) {
      expect(preuve).toContain(`construction de ${nom} — son journal : `);
    }
    expect(preuve).toContain('2 rouge(s)');
    expect(preuve).toContain('0 fichier(s) qui ne se charge(nt) pas');
    expect(preuve).toContain('src/x.ts(1,1): error TS2741');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('leaves the files of the plan broken when the build that fails lies out of it', () => {
    const id = 'demo-construction-ailleurs';
    const copie = ticket(id, '030-binder');
    casserLaConstruction(copie, 'forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'testwriter')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(0);
    const relance = essai(id, 'testwriter-3.prompt');
    expect(relance).toContain('packages/binder/test/mesure.test.mjs — ne se charge pas');
    expect(relance).not.toContain('construction de 000-forms');
    expect(relance).not.toContain('Rouges (');
    const arret = commentaires(id)
      .filter(t => t.includes(' · preuve : arrêt preuve'))
      .pop();
    expect(arret).toContain('1 fichier(s) qui ne se charge(nt) pas');
  });
});
