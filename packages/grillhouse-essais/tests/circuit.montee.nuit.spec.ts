// @equipee: l'enveloppe bwrap, un serveur Temporal
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import {
  sortie,
  lire,
  ARRETS,
  CODE_JUSTE,
  ECRIT_ROUGE,
  TA_TACHE,
  circuitEssai,
  ecrire,
} from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs), grillhouse-3uv.95.4, criterion 2: a stop no
// gesture settles puts the circuit in « question », a montée to the supervisor; the supervisor
// answers by a command of the circuit, as the approver of a CI's manual job: `--reprendre` (its
// context with it), `--etendre <paquet>` (the plan gains that package, the provider first, then the
// step under way resumes, grillhouse-3uv.95.6), or `--arreter`; and carries to the owner what is
// his.
//
// This file keeps the one journey of the answer that goes through every part: a real montée for a file out of
// the plan, the answer `--etendre` by the command, the circuit reopened and the session resumed with
// the plan extended, up to the envelope of the session. Each rule of the answers is proved small:
// the options of the command (tests/unit/circuit.appel-refus.spec.ts), the answers refused
// (tests/unit/circuit.reponses-refusees.spec.ts), the stop on the supervisor's word
// (tests/unit/circuit.arret-du-superviseur.spec.ts), the montée of a stop
// (tests/unit/circuit.arrets-des-controles.spec.ts, tests/unit/seances.besoin-hors-plan.spec.ts).
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  REPO,
  BEADS,
  gitRepo,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  etat,
  ordre,
  commentaires,
} = circuitEssai(ESSAIS);

const MANQUE = `fiche '{"statut":"BESOIN","question":"Il me manque packages/forms.","piece":"ticket, critère 1","manque":"packages/forms/src/index.mjs"}'\n`;
const titre = (id: string) =>
  (JSON.parse(lire(path.join(BEADS, `${id}.json`))) as { title: string }[])[0].title;
const question = (id: string) =>
  (etat(id) as unknown as { question: { arret: string } | null } | null)?.question ?? null;

describe.runIf(canWrap)(
  'the supervisor answers a montée by a command of the circuit',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('--etendre adds the package to the plan, its provider before its reader, and the circuit resumes the step under way on the whole plan, the question as its context', () => {
      const id = 'demo-montee-etendre';
      // binder reads forms by its code: the module typescript orders the plan by the imports, never
      // by the manifests of npm (grillhouse-x7c.1).
      ecrire(
        path.join(REPO, 'packages/binder/src/index.mjs'),
        "import '../../forms/src/index.mjs';\nexport const mesure = x => x;\n"
      );
      gitRepo('add', '-A');
      gitRepo('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'binder lit forms');
      ticket(id, '030-binder');
      scenario(id, 'testwriter-1', MANQUE);
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r1 = circuit([id]);
      expect(r1.status, sortie(r1)).toBe(ARRETS.besoin);
      expect(question(id)).toMatchObject({ arret: 'besoin' });
      const r2 = circuit([id, '--etendre', '000-forms']);
      expect(r2.status, sortie(r2)).toBe(0);
      // binder depends on forms: the provider first.
      expect(titre(id)).toBe(`${id} — La mesure — 000-forms, 030-binder`);
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(/^Circuit · plan : le superviseur étend le plan à 000-forms/)
      );
      // The step under way, the testwriter's, resumes once on the plan extended.
      expect(ordre(id)).toEqual(['testwriter', 'testwriter', 'developpeur', 'relecteur']);
      expect(essai(id, 'testwriter-2.paquets')).toBe('packages/forms:packages/binder');
      expect(essai(id, 'testwriter-2.prompt')).toMatch(
        new RegExp(`${TA_TACHE}Le superviseur a étendu le plan à 000-forms`)
      );
      // grillhouse-3uv.95.5: the plan the supervisor extends has passed, written and questioned once.
      expect(sessions(id, 'explorateur')).toBe(1);
      expect(sessions(id, 'questionneur')).toBe(1);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
      expect(question(id)).toBeNull();
    });
  }
);
