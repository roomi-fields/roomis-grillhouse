import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { schemaDeFiche } from '../../scripts/resultats.mjs';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts) on structured results
// (grillhouse-3uv.89, L1): each session ends on its sheet, which claude writes in its JSON result
// (`--output-format json --json-schema`, `structured_output`), and the checks read the summaries
// of Turborepo, the reports of Vitest and the SARIF of the guards, never their output.
// Witness: BPScript 320.3 (2026-10-20): 8 relaunches of a testwriter for the form of a line « vert
// attendu », the red of a guard given to the component under way, and the last 60 lines of a log
// that hid the real red from the agent who had to lift it.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
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
  etat,
  ordre,
  gitRepo,
  auteurs,
  commentaires,
} = circuitEssai(ESSAIS);

// The value that follows <option> in the arguments of a session.
const valeur = (a: string[], option: string) => a[a.indexOf(option) + 1];
// The report a resumed session receives, after its heading.
const rapportNeuf = (prompt: string) =>
  prompt.split('LE RAPPORT NEUF, mesuré par le circuit :')[1] ?? '';

describe.runIf(canWrap)('the sheet that ends a session', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('each session receives the schema of its role’s sheet and claude’s JSON output', () => {
    const id = 'demo-fiche-schema';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    for (const role of ['testwriter', 'developpeur', 'relecteur']) {
      const a = args(id, role, 1);
      expect(valeur(a, '--output-format'), role).toBe('json');
      expect(JSON.parse(valeur(a, '--json-schema')), role).toEqual(schemaDeFiche(role));
    }
  });

  it('a session that ends without a sheet is resumed once, the same session, the short instruction naming what lacks; then the circuit goes on', () => {
    const id = 'demo-fiche-reprise';
    ticket(id, '000-forms');
    scenario(id, 'testwriter-1', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\nsans_fiche\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(2);
    expect(valeur(args(id, 'testwriter', 2), '--resume')).toBe(
      valeur(args(id, 'testwriter', 1), '--session-id')
    );
    const prompt = essai(id, 'testwriter-2.prompt');
    expect(prompt).toContain('sans fiche conforme');
    expect(prompt).toContain('structured_output');
    expect(prompt.length).toBeLessThan(essai(id, 'testwriter-1.prompt').length / 2);
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^Circuit · packages\/forms · testwriter : séance finie sans fiche conforme/
      )
    );
  });

  it('a sheet out of its schema is resumed once, its fault named', () => {
    const id = 'demo-fiche-non-conforme';
    ticket(id, '000-forms');
    scenario(id, 'testwriter-1', `${ECRIT_ROUGE}fiche '{"statut":"PEUT-ÊTRE"}'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const prompt = essai(id, 'testwriter-2.prompt');
    expect(prompt).toContain('statut');
    expect(prompt).toContain('PEUT-ÊTRE');
  });

  it('twice without a sheet: the circuit stops at « sans-fiche », a question for the supervisor', () => {
    const id = 'demo-sans-fiche';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\nsans_fiche\n`);
    const r = circuit([id]);
    expect(ARRETS['sans-fiche']).toBeDefined();
    expect(r.status, sortie(r)).toBe(ARRETS['sans-fiche']);
    expect(sessions(id, 'testwriter')).toBe(2);
    expect(etat(id)).toMatchObject({ etape: 'testwriter', raison: 'sans-fiche' });
    expect(ordre(id)).toHaveLength(2);
    expect(etat(id)?.question).toMatchObject({ arret: 'sans-fiche', qui: 'superviseur' });
  });

  it('the handover at the ticket decides nothing: a status line in it is not read', () => {
    const id = 'demo-fiche-passation';
    ticket(id, '000-forms');
    scenario(
      id,
      'testwriter',
      `${ECRIT_ROUGE}passation 'Tests écrits.\nSTATUT : BESOIN — une question écrite au ticket seulement.'\n`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(etat(id)).toMatchObject({ etape: 'integre' });
  });

  it('each discovery of a sheet is filed by the circuit, closed under the ticket, labelled decouverte', () => {
    const id = 'demo-fiche-decouverte';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur',
      `${CODE_JUSTE}passation 'Code écrit.'\nfiche '{"statut":"FAIT","decouvertes":[{"sujet":"La mesure de zéro","corps":"mesure(0) rend 0 : packages/forms/src/index.mjs:1"}]}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const [t] = JSON.parse(readFileSync(path.join(BEADS, `${id}.1.json`), 'utf8')) as {
      title: string;
      status: string;
      labels: string[];
      description: string;
    }[];
    expect(t.title).toContain('La mesure de zéro');
    expect(t.title).toContain('000-forms');
    expect(t.status).toBe('closed');
    expect(t.labels).toContain('decouverte');
    expect(t.description).toContain('mesure(0) rend 0');
  });

  it('the body of the commit names the criteria of the plan, then each deviation of the sheets once, with its last value', () => {
    const id = 'demo-fiche-ecarts';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur',
      `${CODE_JUSTE}passation 'Code écrit.'\nfiche '{"statut":"FAIT","ecarts":[{"sujet":"La mesure des négatifs","texte":"bornée à zéro"},{"sujet":"ancien.test.mjs","texte":"en quarantaine, demo-suite le referme"}]}'\n`
    );
    scenario(
      id,
      'relecteur',
      `fiche '{"verdict":"ACCEPTÉ","ecarts":[{"sujet":"La mesure des négatifs","texte":"non bornée, voulu par le critère 1"}]}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const message = gitRepo('log', '-1', '--format=%B', 'main');
    expect(message).toContain('1. `mesure` rend le double de sa valeur.');
    expect(message).toContain(
      'La mesure des négatifs : non bornée, voulu par le critère 1\n\nancien.test.mjs : en quarantaine, demo-suite le referme'
    );
    expect(message).not.toContain('bornée à zéro');
  });

  it('the reviewer’s verdict is written at the ticket by the circuit, from its sheet, under the reviewer’s author', () => {
    const id = 'demo-fiche-verdict';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'relecteur',
      `fiche '{"verdict":"ACCEPTÉ","constats":[{"titre":"packages/forms/src/index.mjs:1","genre":"remarque","corps":"le nom de la mesure pourrait dire le double"}]}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const verdict = auteurs(id).find(c => c.author === 'relecteur');
    expect(verdict?.text).toMatch(/^ACCEPTÉ\n/);
    expect(verdict?.text).toContain(
      '## Remarques\n\n- packages/forms/src/index.mjs:1 — le nom de la mesure pourrait dire le double'
    );
  });
});

describe.runIf(canWrap)('the checks read the structured results', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('the report a developpeur receives names its reds first, test, file and message, read from the reports, without the end of the log', () => {
    const id = 'demo-rapport-en-tete';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur-1',
      `printf '// essai\\n' >> $c/src/index.mjs\npassation 'Un essai.'\n`
    );
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const rapport = rapportNeuf(essai(id, 'developpeur-2.prompt'));
    const lignes = rapport.trim().split('\n');
    // Forms is the last component of the run: its checks are the final pass.
    expect(lignes[0]).toMatch(/^Contrôles de la passe finale.* : rouge : 1 rouge\(s\) — /);
    const tete = lignes.indexOf('Tes rouges (1) :');
    expect(tete).toBeGreaterThan(0);
    expect(lignes[tete + 1]).toMatch(
      /^- test packages\/forms\/test\/mesure\.test\.mjs › critère 1 — mesure rend le double — .*expected 2 to be 4/
    );
    // Nothing of Turborepo's output: no prefixed line of a task, no summary of the run.
    expect(rapport).not.toMatch(/test:vitest:|Tasks:|Cached:/);
  });

  it('a red guard of the project without SARIF at a component’s checks is not that component’s: it waits for the final pass, where no component owns it', () => {
    const id = 'demo-garde-globale';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // Forms' code is right; its guard file makes the project's guard red, naming a file of forms
    // in its output only.
    scenario(
      id,
      'developpeur-1',
      `${CODE_JUSTE}touch $c/garde-globale.txt\npassation 'Code de forms écrit.'\n`
    );
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code de binder écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    // Forms' developpeur is not relaunched on it: binder's circuit runs, then the final pass.
    expect(ordre(id).slice(0, 4)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      'testwriter packages/binder',
      'developpeur packages/binder',
    ]);
    expect(sessions(id, 'developpeur')).toBe(2);
    const formes = commentaires(id).find(t =>
      t.startsWith('Circuit · packages/forms · controles :')
    );
    expect(formes).toContain('laissés à la passe finale');
    const e = etat(id);
    expect(e).toMatchObject({
      etape: 'controles',
      composant: 'packages/binder',
      raison: 'controles',
    });
    expect(e?.rapport).toContain('Aucun composant du ticket');
    expect(e?.rapport).toContain('//#gardes');
  });
});
