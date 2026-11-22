// @poste: l'enveloppe bwrap, un serveur Temporal
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CODE_JUSTE, ECRIT_ROUGE, circuitEssai, sortie } from './circuit-essai.js';

// The plan of a ticket, step 1 of its circuit, as an RFC: its author writes it after surveying what
// exists, a review reads it once, the author answers once, and what stays open goes to who decides.
// The explorateur, launched by the circuit out of the envelope, writes the plan in its sheet (its
// criteria, the packages to touch, its open questions), which the circuit writes at the ticket: the
// packages end its title, the list the envelope of every later session writes. This test keeps the
// whole path with the real explorateur session, title and description written by bd; the rules of
// the plan (the questions, the packages, the description, the fingerprint) are proved small in
// packages/grillhouse/tests/unit/circuit.plan-par-ses-pas.spec.ts.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-plan-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  BEADS,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  args,
  commentaires,
  ordre,
} = circuitEssai(ESSAIS);

const EXPLORATEUR = 'explorateur';
const QUESTIONNEUR = 'questionneur';
// A scenario's sheet, its quotes escaped for the shell.
const fiche = (f: Record<string, unknown>) =>
  `fiche '${JSON.stringify(f).replaceAll("'", "'\\''")}'\n`;
// The plan of the trial tickets as an explorateur writes it in its sheet: the criteria it adds to
// those the ticket holds.
const plan = (o: Record<string, unknown> = {}) => ({
  criteres: [],
  paquets: ['000-forms'],
  questions: [],
  ...o,
});
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
// The ticket as the stand-in bd holds it.
const leTicket = (id: string) =>
  (
    JSON.parse(readFileSync(path.join(BEADS, `${id}.json`), 'utf8')) as {
      title: string;
      description: string;
    }[]
  )[0];
// The lines of the plan and of its questioning at the ticket.
const echange = (id: string) => commentaires(id).filter(t => / · (plan|questionnement) : /.test(t));

describe.runIf(canWrap)('the plan, step 1 of the circuit', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('critère 1 — the explorateur writes the plan: its criteria and packages at the ticket, the packages the list the envelope writes', () => {
    const id = 'demo-plan-ecrit';
    ticket(id, '000-forms');
    scenario(
      id,
      EXPLORATEUR,
      fiche(
        plan({
          criteres: ['030-binder lit le double.'],
          paquets: ['000-forms', '030-binder'],
        })
      )
    );
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // One session of its own, out of the envelope, before any testwriter.
    expect(sessions(id, EXPLORATEUR)).toBe(1);
    const a = args(id, EXPLORATEUR, 1);
    expect(a.slice(0, 3)).toEqual(['-p', '--agent', EXPLORATEUR]);
    expect(valeur(a, '--session-id')).toBeTruthy();
    expect(essai(id, `${EXPLORATEUR}-1.paquets`)).toBe('');
    // Its instruction carries the ticket and the survey it leans on.
    const c = essai(id, `${EXPLORATEUR}-1.prompt`);
    expect(c).toContain(`TON TICKET : ${id}`);
    expect(c).toContain('1. `mesure` rend le double de sa valeur.');
    expect(c).toContain(`npx grillhouse composants-affectes ${id}`);
    // The circuit writes the plan at the ticket: the packages in the title, the criteria in the
    // description, the rest of it kept.
    const t = leTicket(id);
    expect(t.title).toBe(`${id} — La mesure — 000-forms, 030-binder`);
    expect(t.description).toContain('La mesure vit dans chaque composant.');
    expect(t.description).toContain(
      "## Critères d'acceptation\n\n1. `mesure` rend le double de sa valeur.\n2. 030-binder lit le double."
    );
    expect(echange(id)[0]).toMatch(/^Circuit · plan : /);
    // The questionneur reads the plan the explorateur wrote: its title with its packages, its
    // criterion added.
    const q = essai(id, `${QUESTIONNEUR}-1.prompt`);
    expect(q).toContain(`« ${id} — La mesure — 000-forms, 030-binder »`);
    expect(q).toContain('2. 030-binder lit le double.');
    // The packages of the plan are the list the envelope of each session writes.
    expect(essai(id, 'testwriter-1.paquets')).toBe(
      ['packages/forms', 'packages/binder'].join(path.delimiter)
    );
    // One testwriter and one developpeur for the whole plan.
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
  });
});
