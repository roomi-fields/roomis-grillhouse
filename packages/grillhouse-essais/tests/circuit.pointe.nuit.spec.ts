import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, ARRETS, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// grillhouse-527: a resumption of the circuit (scripts/circuit.mjs, `avantLaPasse`) prepares the
// copy on the tip of main before it plays the checks again, by the one preparation of a copy
// (scripts/enveloppe/travail-de-la-copie.mjs, `preparer`), as a merge queue plays its checks on
// the branch set on the tip of main. Witness: OSC Bridge, SH-cgi.8.2 (2026-11-01), a final pass
// and its resumption red on two reds main had lifted in 65a1f5b, the copy still on bc721aa.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-pointe-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { REPO, revenirAuDebut, ticket, scenario, circuit, sessions, etat, journal, gitRepo } =
  circuitEssai(ESSAIS);

const IDS = ['demo-pointe-reprise', 'demo-pointe-conflit'];

// A commit on the main of the trial that writes <contenu> in packages/forms/src/index.mjs.
function surMain(contenu: string) {
  writeFileSync(path.join(REPO, 'packages/forms/src/index.mjs'), contenu);
  gitRepo('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'main corrige');
  return gitRepo('rev-parse', 'HEAD').trim();
}

// The ticket <id> stopped at 3.1 on red checks: the testwriter's red test, then three sessions of
// the developpeur, each writing <code> (never the double) and changing a file of the plan.
const UN_TOUR = `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\n`;
function arreteAuxControles(id: string, code = '') {
  const copie = ticket(id, '000-forms');
  scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
  scenario(id, 'developpeur', `${code}${UN_TOUR}passation 'Un essai.'\n`);
  const r = circuit([id]);
  expect(r.status, sortie(r)).toBe(ARRETS.controles);
  expect(etat(id)).toMatchObject({ etape: 'controles', finale: false });
  expect(sessions(id, 'developpeur')).toBe(3);
  return copie;
}

describe.runIf(canWrap)(
  'grillhouse-527 — a resumption prepares the copy on the tip of main before the checks',
  { timeout: 600_000 },
  () => {
    afterEach(revenirAuDebut);
    // The temporary directory of each ticket, which its sessions get and which outlives them
    // (scripts/mesure/base-de-passe.mjs, `ouvrirBaseDuTicket`), goes with the test.
    afterEach(() => {
      for (const id of IDS) {
        rmSync(path.join(tmpdir(), `grillhouse-ticket-${id}`), { recursive: true, force: true });
      }
    });

    it('critère 1: a copy behind main, resumed at 3.1, moves forward before its checks, which main’s fix turns green', () => {
      const id = 'demo-pointe-reprise';
      const copie = arreteAuxControles(id);
      const main = surMain('export const mesure = x => 2 * x;\n');
      const r = circuit([id, '--reprendre']);
      expect(r.status, sortie(r)).toBe(0);
      // No developpeur relaunched: the checks were green on the copy moved forward.
      expect(sessions(id, 'developpeur')).toBe(3);
      expect(journal(id)).toContain('la copie avance sur la pointe de main avant la passe.');
      expect(journal(id)).toContain(`travail-de-la-copie.mjs preparer ${copie} ${main}`);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });

    it('critère 3: a copy in conflict with main stops the resumption at « lancement », its question naming the file', () => {
      const id = 'demo-pointe-conflit';
      const copie = arreteAuxControles(
        id,
        `printf 'export const mesure = x => 3 * x;\\n' > $c/src/index.mjs\n`
      );
      surMain('export const mesure = x => 2 * x;\n');
      const r = circuit([id, '--reprendre']);
      expect(r.status, sortie(r)).toBe(ARRETS.lancement);
      expect(sessions(id, 'developpeur')).toBe(3);
      const e = etat(id);
      expect(e).toMatchObject({ etape: 'controles', raison: 'lancement', code: ARRETS.lancement });
      expect(e?.question?.piece).toMatch(/^ {2}packages\/forms\/src\/index\.mjs$/m);
      expect(e?.question?.question).toContain(copie);
      expect(e?.question?.question).toContain(`npx grillhouse circuit ${id} --reprendre`);
    });
  }
);
