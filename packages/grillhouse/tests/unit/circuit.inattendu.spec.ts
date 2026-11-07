// grillhouse-f24: an unexpected error or an unreadable manifest ends the circuit on a written stop,
// never in silence (scripts/circuit.mjs, scripts/etapes.mjs). As a scheduler does not die of a job
// (Zuul, Buildbot, GitLab CI: a job's error is a written « error » result with its log), the
// circuit ends every unexpected exception on the stop « inattendu » (state `code` and `raison`,
// a question to the supervisor with the message, the stack, the step and the command that
// resumes); and the reading of the copy right after a session of the testwriter or the developpeur,
// when the module of the language no longer reads its components (cargo metadata red), is a red
// handed back to that agent, as a red build, not a stop.
// Witness: SyntHub SH-13y.6.8 under 0.29.0 (2026-11-02): `pyo3-build-config.workspace = true`
// without the root entry; the process died, the state of the circuit stayed at
// `etape=developpeur, raison=null, code=null`, and `--reprendre` died at once in the same reading.
//
// The cases use the fake cargo of ./langages/cargo/faux-cargo.ts, which refuses a dependency
// `.workspace = true` that the root does not declare, as cargo does (code 101). An act that fails
// on the workflow of the ticket, its stop « inattendu » and its question awaited, is
// tests/temporal/circuit.spec.ts.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as circuit from '../../scripts/circuit.mjs';
import * as transitions from '../../scripts/transitions.mjs';
import { ARRETS, MONTEES, boucle as boucleDeLEtape, monteeDe } from '../../scripts/etapes.mjs';
import module from '../../scripts/langages/cargo/index.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

interface Ctx {
  ticket: string;
  copie: string;
}
interface Rouge {
  rapport: string;
}
interface Arret {
  code: number;
  nom: string;
  rapport: string;
  piece: string | null;
  question: string;
}
interface Suite {
  etape?: string;
  tentative?: number;
  arret?: string;
}
const rougeDeLecture = circuit.rougeDeLecture as (ctx: Ctx) => Rouge | null;
const suiteDuRougeDeLecture = transitions.suiteDuRougeDeLecture as (
  role: string,
  tentative: number
) => Suite;
const arretInattendu = circuit.arretInattendu as (
  ctx: Ctx,
  erreur: unknown,
  etape: string
) => Arret;
const boucle = boucleDeLEtape as (nom: string) => { max: number };
const cargo = module as unknown as { composants: (racine: string) => unknown };

const ARCHITECTURE_DU_PAQUET = path.resolve(__dirname, '../../docs/ARCHITECTURE.md');
const TICKET = 'essai-1';
const LIGNE_DE_CARGO = '`dependency.pyo3-build-config` was not found in `workspace.dependencies`';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-inattendu-'));
const JOURNAL = path.join(ESSAIS, 'journal');
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
});
afterAll(() => restaurer());
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A workspace of cargo of one crate, `service`: its root declares `[workspace.dependencies]` or
// not, and the crate asks `pyo3-build-config.workspace = true`, as SH-13y.6.8's developpeur wrote it.
function projet(nom: string, racineDeclare: boolean): string {
  const dir = mkdtempSync(path.join(ESSAIS, `${nom}-`));
  const fichiers: Record<string, string> = {
    'docs/ARCHITECTURE.md': architecture(['cargo']),
    'Cargo.toml': `[workspace]\nmembers = ["crates/*"]\n${
      racineDeclare ? '\n[workspace.dependencies]\npyo3-build-config = "0.22"\n' : ''
    }`,
    'crates/service/Cargo.toml':
      '[package]\nname = "service"\nversion = "0.1.0"\nedition = "2021"\n\n' +
      '[dependencies]\npyo3-build-config.workspace = true\n',
    'crates/service/src/lib.rs': '',
  };
  for (const [rel, texte] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), texte);
  }
  return dir;
}

describe('grillhouse-f24, critère 5 — l’arrêt « inattendu » : son code, sa question', () => {
  it('has a code of its own, not shared with another stop, usage (2) nor « a-repasser » (75)', () => {
    const code = (ARRETS as Record<string, number>).inattendu;
    expect(Number.isInteger(code)).toBe(true);
    const autres = Object.entries(ARRETS)
      .filter(([nom]) => nom !== 'inattendu')
      .map(([, c]) => c);
    expect(autres).not.toContain(code);
    expect([0, 1, 2, 75]).not.toContain(code);
    expect(circuit.ARRETS).toBe(ARRETS);
  });

  it('goes up to the supervisor with a question of its own, naming the command that resumes', () => {
    const m = monteeDe('inattendu');
    expect(m).toMatchObject({ qui: 'superviseur' });
    expect(m?.question).toContain('--reprendre');
    expect(MONTEES).toHaveProperty('inattendu');
  });

  it('declares its text in the circuit’s documentation in the package', () => {
    expect(readFileSync(ARCHITECTURE_DU_PAQUET, 'utf8')).toContain('`inattendu`');
  });

  it('writes a stop whose question carries the message, the stack, the step and the command that resumes', () => {
    const erreur = new Error('boom : un module de langage a levé');
    const a = arretInattendu({ ticket: TICKET, copie: ESSAIS }, erreur, 'developpeur');
    expect(a).toMatchObject({ code: ARRETS.inattendu, nom: 'inattendu' });
    expect(a.question).toContain('boom : un module de langage a levé');
    expect(a.question).toContain(String(erreur.stack).split('\n')[1].trim());
    expect(a.question).toMatch(/développeur|developpeur/);
    expect(a.question).toContain(`npx grillhouse circuit ${TICKET} --reprendre`);
    expect(`${a.piece}\n${a.rapport}`).toContain('boom : un module de langage a levé');
  });

  it('names the step where it fell, whichever it is, and keeps the message of an error with no stack', () => {
    const a = arretInattendu({ ticket: 'autre-9', copie: ESSAIS }, 'chaîne levée', 'testwriter');
    expect(a.question).toContain('chaîne levée');
    expect(a.question).toMatch(/testwriter/);
    expect(a.question).toContain('npx grillhouse circuit autre-9 --reprendre');
    const b = arretInattendu({ ticket: 'autre-9', copie: ESSAIS }, new Error('x'), 'controles');
    expect(b.question).toMatch(/contrôles|controles/);
  });
});

describe('grillhouse-f24, critères 3, 8 et 9 — la lecture de la copie après la séance d’un agent', () => {
  it('critère 9: the module of the language itself still throws, the circuit catching at the common call', () => {
    const invalide = projet('module', false);
    expect(() => cargo.composants(invalide)).toThrow(LIGNE_DE_CARGO);
  });

  it('critère 4 et 8: a copy whose manifest is invalid is a red carrying the tool’s output as it gave it', () => {
    const invalide = projet('invalide', false);
    const rouge = rougeDeLecture({ ticket: TICKET, copie: invalide });
    expect(rouge).not.toBeNull();
    expect(rouge?.rapport).toContain(LIGNE_DE_CARGO);
    expect(rouge?.rapport).toContain('cargo metadata');
  });

  it('critère 3: a copy the module reads is no red', () => {
    const valide = projet('valide', true);
    expect(rougeDeLecture({ ticket: TICKET, copie: valide })).toBeNull();
  });

  it('critère 8: the red consumes an attempt of the testwriter, as a red build', () => {
    const max = boucle('tests').max;
    expect(suiteDuRougeDeLecture('testwriter', 1)).toEqual({ etape: 'testwriter', tentative: 2 });
    expect(suiteDuRougeDeLecture('testwriter', max - 1)).toEqual({
      etape: 'testwriter',
      tentative: max,
    });
  });

  it('critère 8: the red consumes an attempt of the developpeur, as a red build', () => {
    const max = boucle('code').max;
    expect(suiteDuRougeDeLecture('developpeur', 1)).toEqual({ etape: 'developpeur', tentative: 2 });
    expect(suiteDuRougeDeLecture('developpeur', max - 1)).toEqual({
      etape: 'developpeur',
      tentative: max,
    });
  });

  it('critère 8: attempts used up, the red goes up as the red checks do (« controles »), not « inattendu »', () => {
    expect(suiteDuRougeDeLecture('testwriter', boucle('tests').max)).toEqual({
      arret: 'controles',
    });
    expect(suiteDuRougeDeLecture('developpeur', boucle('code').max)).toEqual({
      arret: 'controles',
    });
  });
});
