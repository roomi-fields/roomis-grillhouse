import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { texteDuVerdict } from '../../scripts/circuit.mjs';
import { lire, sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the review, its
// verdicts ACCEPTÉ and RENDU, and the integration.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  REPO,
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
  historique,
} = circuitEssai(ESSAIS);

// The rules that refuse an agent the change of its author at the ticket: bd's `--actor`,
// `-a`/`--author`, and the variable BEADS_ACTOR.
const AUTEUR_FIXE = [
  'Bash(bd *--actor*)',
  'Bash(bd *--author*)',
  'Bash(bd * -a*)',
  'Bash(*BEADS_ACTOR*)',
];
// The permissions of the settings the arguments <a> of a session carry (`--settings`,
// scripts/droits.mjs).
const permissions = (a: string[]) =>
  (
    JSON.parse(a[a.indexOf('--settings') + 1] ?? '{}') as {
      permissions?: { allow: string[]; deny: string[] };
    }
  ).permissions ?? { allow: [], deny: [] };
// The rules that refuse the session a call.
const refusees = (a: string[]) => permissions(a).deny;

// The entries of the integration's queue: the branches in their order of arrival.
const enFile = () => {
  const d = path.join(REPO, '.git/file-integration');
  return existsSync(d)
    ? readdirSync(d)
        .sort()
        .map(
          f => (JSON.parse(readFileSync(path.join(d, f), 'utf8')) as { branche: string }).branche
        )
    : [];
};
const ticketDe = (id: string) =>
  (JSON.parse(lire(path.join(BEADS, `${id}.json`))) as { status?: string }[])[0];

// After the final pass, the circuit launches the reviewer, out of the envelope, from the second
// template (Q6). ACCEPTÉ: the circuit builds the lot from the copy and integrates it, which puts
// the branch in the queue (Q7, Q13). RENDU: the reviewer's sheet names the agent of each finding
// (`role`); the circuit goes straight to that agent, for the whole ticket (grillhouse-3uv.95.6),
// then the final pass and the reviewer; a finding without a valid agent stops at
// « relecture-arret », and so does the third RENDU. The circuit
// writes the verdict at the ticket, for the human, from the sheet.
describe('the verdict the circuit writes at the ticket from the reviewer’s sheet', () => {
  it('opens on its word, each blocking finding under its heading with what it holds and its recipient or its criterion, then the remarks and the deviations', () => {
    expect(
      texteDuVerdict({
        verdict: 'RENDU',
        constats: [
          {
            titre: 'scripts/garde.mjs',
            genre: 'bloquant',
            regle: 'critère 1',
            role: 'developpeur',
            corps: 'Preuve : x.',
            piece: 'scripts/garde.mjs:3',
          },
          {
            titre: 'Un nom',
            genre: 'remarque',
            corps: 'un nom à revoir',
            piece: 'packages/forms/src/x.mjs:9',
          },
          {
            titre: 'packages/forms/src/forms.ts',
            genre: 'bloquant',
            regle: 'critère 2',
            critere_en_cause: '2',
            corps: 'Preuve : y.',
            piece: '$ npm test -- packages/forms\n1 failed',
          },
        ],
        ecarts: [{ sujet: 'ancien.test.mjs', texte: 'en quarantaine, demo-suite le referme' }],
      })
    ).toBe(
      [
        'RENDU',
        '',
        '### Constat 1 — scripts/garde.mjs',
        'Bloquant : critère 1',
        'Agent : developpeur',
        'Preuve : x.',
        'Pièce : scripts/garde.mjs:3',
        '',
        '### Constat 2 — packages/forms/src/forms.ts',
        'Bloquant : critère 2',
        'Critère en cause : 2',
        'Preuve : y.',
        'Pièce : $ npm test -- packages/forms\n1 failed',
        '',
        '## Remarques',
        '',
        '- Un nom — un nom à revoir (packages/forms/src/x.mjs:9)',
        '',
        '## Écarts à nommer au commit',
        '',
        '- ancien.test.mjs : en quarantaine, demo-suite le referme',
      ].join('\n')
    );
    expect(texteDuVerdict({ verdict: 'ACCEPTÉ' })).toBe('ACCEPTÉ');
  });

  it('names, after a bounded review, each finding before it lifted or not, with its proof (grillhouse-3uv.89, L3)', () => {
    expect(
      texteDuVerdict({
        verdict: 'ACCEPTÉ',
        suivi: [
          { titre: 'packages/forms/src/index.mjs', etat: 'levé', preuve: 'mesure(0) rend 0.' },
        ],
      })
    ).toBe(
      [
        'ACCEPTÉ',
        '',
        "## Constats d'avant",
        '',
        '- packages/forms/src/index.mjs : levé — mesure(0) rend 0.',
      ].join('\n')
    );
  });
});

describe.runIf(canWrap)('the review and the integration', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  // The reviewer's sheet RENDU whose one finding goes to <role> (none when null), or puts the
  // criterion <critere> in question.
  const rendu = (role: string | null, constat = 'mesure de 0 doit rendre 0.', critere?: string) => {
    const fiche = {
      verdict: 'RENDU',
      constats: [
        {
          titre: 'packages/forms/src/index.mjs',
          genre: 'bloquant',
          regle: 'critère 1',
          ...(role ? { role } : {}),
          corps: constat,
          piece: 'packages/forms/src/index.mjs:1',
          ...(critere ? { critere_en_cause: critere } : {}),
        },
      ],
    };
    return `fiche '${JSON.stringify(fiche)}'\n`;
  };
  const accepte = `fiche '{"verdict":"ACCEPTÉ"}'\n`;

  it('ACCEPTÉ leads to the integration: one commit on agent/<ticket>, the branch in the queue', () => {
    const id = 'demo-accepte';
    const copie = ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    // The reviewer's session: claude in the ticket's copy, out of the envelope, on its role.
    expect(essai(id, 'relecteur-1.pwd').trim()).toBe(copie);
    const a = args(id, 'relecteur', 1);
    expect(a[a.indexOf('--agent') + 1]).toBe('relecteur');
    expect(a[a.indexOf('--model') + 1]).toBe('opus');
    // Without a prompt, it may run every command its skill runs: a refused one leaves no verdict.
    expect(a[a.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    // Its rights are the commands its skill names (scripts/droits.mjs, tests/unit/droits.spec.ts):
    // the reads of the lot, the targeted tests, the guards, the index; not the ticket, whose
    // criteria it reads in the claims file at the step its skill sets.
    const { allow } = permissions(a);
    for (const regle of [
      'Bash(git -C * diff*)',
      'Bash(npm test *)',
      'Bash(npm run verifier -- --gardes*)',
      'Bash(npx grillhouse index-interfaces --publie *)',
      'Bash(codegraph explore *)',
      'mcp__rtfm__rtfm_search',
    ]) {
      expect(allow).toContain(regle);
    }
    expect(allow.filter(r => /^Bash\(bd (show|comments)/.test(r))).toEqual([]);
    expect(a[a.indexOf('--setting-sources') + 1]).toBe('project,local');
    expect(a).toContain('--strict-mcp-config');
    // Its instruction: the second template, the lot and the circuit's reports; the criteria are in
    // the claims file alone (tests/unit/circuit.consigne.spec.ts).
    const consigne = essai(id, 'relecteur-1.prompt');
    expect(consigne).toContain(`Tu es le relecteur du dépôt ${REPO}.`);
    expect(consigne).toContain(`TON TICKET : ${id} — La mesure`);
    expect(consigne).not.toContain('1. `mesure` rend le double de sa valeur.');
    expect(consigne).toContain('le lot de tests : packages/forms/test/mesure.test.mjs');
    expect(consigne).toContain('le lot de code : packages/forms/src/index.mjs');
    expect(consigne).toContain('Circuit · preuve');
    expect(consigne).toContain('controles : verts : npm run verifier.');
    expect(consigne).not.toContain('{{');
    // The claims file: the description, in a folder the session may read.
    const affirmations = /LE FICHIER D'AFFIRMATIONS, [^:]*: (\S+)/.exec(consigne)?.[1] ?? '';
    expect(path.basename(affirmations)).toBe('affirmations.md');
    expect(a[a.indexOf('--add-dir') + 1]).toBe(path.dirname(affirmations));
    // The integration: the commit holds the testwriter's lot and the developpeur's, under the
    // message the circuit writes; the copy is gone; the queue brings it onto main and closes the
    // ticket.
    const commit = gitRepo('show', '--name-only', '--format=%s', 'main');
    expect(commit.split('\n').filter(Boolean)).toEqual([
      `feat(000-forms): La mesure (${id})`,
      'packages/forms/src/index.mjs',
      'packages/forms/test/mesure.test.mjs',
    ]);
    expect(gitRepo('log', '-1', '--format=%B', 'main')).toContain('Co-Authored-By: Claude');
    expect(existsSync(copie)).toBe(false);
    expect(enFile()).toEqual([]);
    expect(gitRepo('branch', '--list', `agent/${id}`)).toBe('');
    expect(historique(id).slice(-3)).toEqual(['relecture', 'integration', 'file']);
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(/^Circuit · integration : .*la branche est en file\.$/)
    );
    // The ticket closed by the queue; the trial has no origin, so main is not pushed.
    expect(ticketDe(id)).toMatchObject({ status: 'closed' });
    expect(commentaires(id).at(-1)).toMatch(/^Circuit · file : intégré : /);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('each session writes at the ticket under its role (BEADS_ACTOR), the circuit under « circuit », the verdict under « relecteur », and none may change its author', () => {
    const id = 'demo-auteurs';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // Each session receives the author of its role, in the envelope and out of it.
    expect(essai(id, 'testwriter-1.acteur')).toBe('testwriter');
    expect(essai(id, 'developpeur-1.acteur')).toBe('developpeur');
    expect(essai(id, 'relecteur-1.acteur')).toBe('relecteur');
    // Its rights refuse bd's options of author and the variable.
    for (const role of ['testwriter', 'developpeur', 'relecteur']) {
      expect(refusees(args(id, role, 1)), role).toEqual(expect.arrayContaining(AUTEUR_FIXE));
    }
    const liste = auteurs(id);
    expect(liste.find(c => c.text === 'Tests écrits, rouges.')?.author).toBe('testwriter');
    expect(liste.find(c => c.text === 'Code écrit.')?.author).toBe('developpeur');
    expect(liste.find(c => c.text.startsWith('ACCEPTÉ'))?.author).toBe('relecteur');
    const duCircuit = liste.filter(c => c.text.startsWith('Circuit · '));
    expect(duCircuit.length).toBeGreaterThan(0);
    expect(duCircuit.filter(c => c.author !== 'circuit')).toEqual([]);
  });

  it("an agent's handover that opens on RENDU counts as no review: two RENDU, then ACCEPTÉ, to the queue", () => {
    const id = 'demo-passation-rendu';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    // Each handover of the developpeur opens on the word RENDU, as in BPScript 320.2.4.5.1.
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'RENDU 000-forms — code écrit.'\n`);
    scenario(
      id,
      'developpeur',
      `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\npassation 'RENDU 000-forms — constat traité.'\n`
    );
    scenario(id, 'relecteur-1', rendu('developpeur'));
    scenario(id, 'relecteur-2', rendu('developpeur'));
    scenario(id, 'relecteur-3', accepte);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'relecteur')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(3);
    const rendus = commentaires(id).filter(t => /^Circuit · relecture : RENDU/.test(t));
    expect(rendus.map(t => /\(relecture (\d+)\)/.exec(t)?.[1])).toEqual(['1', '2']);
    expect(essai(id, 'relecteur-2.prompt')).toContain('REPRISE : oui : 1 relecture(s)');
    expect(ticketDe(id)).toMatchObject({ status: 'closed' });
  });

  it('critère 2 — RENDU, a finding for the developpeur, goes straight to him, then the final pass and the review, to the queue', () => {
    const id = 'demo-rendu-dev';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'developpeur-2',
      `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu traité.'\n`
    );
    scenario(id, 'relecteur-1', rendu('developpeur'));
    scenario(id, 'relecteur-2', accepte);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // The verdict, written by the circuit from the reviewer's sheet, is at the ticket on several
    // lines.
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^RENDU\n\n### Constat 1 — packages\/forms\/src\/index\.mjs\nBloquant : critère 1\nAgent : /
      )
    );
    // The developpeur of the ticket again, no testwriter.
    expect(ordre(id)).toEqual([
      'testwriter',
      'developpeur',
      'relecteur',
      'developpeur',
      'relecteur',
    ]);
    const consigne = essai(id, 'developpeur-2.prompt');
    expect(consigne).toContain('TON PLAN : packages/forms, packages/binder');
    expect(consigne).toMatch(
      /LES CONSTATS DU RELECTEUR QUI RESTENT OUVERTS[^\n]*\n\n### Constat 1/
    );
    expect(consigne).toContain('mesure de 0 doit rendre 0.');
    expect(consigne).toContain('REPRISE : oui');
    expect(essai(id, 'relecteur-2.prompt')).toContain('REPRISE : oui');
    // Then the final pass restricted to what the fix changes, the review, and the whole final
    // pass once, on the lot accepted, before the integration.
    const rendus = historique(id).indexOf('relecture');
    expect(historique(id).slice(rendus)).toEqual([
      'relecture',
      'developpeur',
      'controles',
      'controles',
      'relecture',
      'controles',
      'integration',
      'file',
    ]);
    expect(gitRepo('show', 'main:packages/forms/src/index.mjs')).toContain('// rendu');
    expect(ticketDe(id)).toMatchObject({ status: 'closed' });
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  // grillhouse-3uv.91.2, witness BPScript 325: a finding on a case the owner ruled out sent the
  // lot back to the testwriter, then the developpeur, 18 min (~38 with what followed).
  it('RENDU sends back its blocking findings alone: a remark reaches no agent, only the ticket', () => {
    const id = 'demo-rendu-remarque';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'developpeur-2',
      `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu traité.'\n`
    );
    const fiche = {
      verdict: 'RENDU',
      constats: [
        {
          titre: 'packages/forms/src/index.mjs:1',
          genre: 'bloquant',
          regle: 'critère 1',
          role: 'developpeur',
          corps: 'mesure de 0 doit rendre 0.',
          piece: 'packages/forms/src/index.mjs:1',
        },
        {
          titre: 'packages/forms/test/mesure.test.mjs:2',
          genre: 'remarque',
          role: 'testwriter',
          corps: 'un paquet gelé pourrait changer un jour.',
          piece: 'packages/forms/test/mesure.test.mjs:2',
        },
      ],
    };
    scenario(id, 'relecteur-1', `fiche '${JSON.stringify(fiche)}'\n`);
    scenario(id, 'relecteur-2', accepte);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    // The blocking finding relaunches its developpeur; the remark relaunches no testwriter.
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(sessions(id, 'developpeur')).toBe(2);
    const consigne = essai(id, 'developpeur-2.prompt');
    expect(consigne).toContain('mesure de 0 doit rendre 0.');
    expect(consigne).not.toContain('un paquet gelé pourrait changer un jour.');
    // The next review follows the blocking finding alone.
    expect(essai(id, 'relecteur-2.prompt')).not.toContain('un paquet gelé');
    // The remark is written at the ticket, with the verdict.
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^RENDU\n[\s\S]*## Remarques\n\n- packages\/forms\/test\/mesure\.test\.mjs:2 — un paquet gelé pourrait changer un jour\./
      )
    );
    expect(ticketDe(id)).toMatchObject({ status: 'closed' });
  });

  it('RENDU, a finding for the testwriter, relaunches the testwriter, the proof, the developpeur, the checks', () => {
    const id = 'demo-rendu-testwriter';
    ticket(id, '000-forms');
    scenario(id, 'testwriter-1', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The testwriter adds the case the reviewer found; the test already green is justified.
    scenario(
      id,
      'testwriter-2',
      `cat > $c/test/echelle.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import * as m from '../src/index.mjs';
it('critère 2 — echelle rend le triple', () => { expect(m.echelle?.(2)).toBe(6); });
EOF
passation 'Echelle testée.'
fiche '{"statut":"FAIT","verts_attendus":[{"fichier":"packages/forms/test/mesure.test.mjs","test":"critère 1 — mesure rend le double","raison":"livré avant le rendu"}]}'
`
    );
    scenario(
      id,
      'developpeur-2',
      `printf 'export const echelle = x => 3 * x;\\n' >> $c/src/index.mjs\npassation 'Echelle écrite.'\n`
    );
    scenario(id, 'relecteur-1', rendu('testwriter', 'echelle manque.'));
    scenario(id, 'relecteur-2', accepte);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(2);
    expect(sessions(id, 'developpeur')).toBe(2);
    expect(essai(id, 'testwriter-2.prompt')).toContain('echelle manque.');
    expect(historique(id).slice(-10)).toEqual([
      'relecture',
      'testwriter',
      'preuve',
      'developpeur',
      'controles',
      'controles',
      'relecture',
      'controles',
      'integration',
      'file',
    ]);
    const preuve = commentaires(id).filter(t => t.startsWith('Circuit · preuve'));
    expect(preuve.at(-1)).toContain('critère 2 — echelle rend le triple');
  });

  it('stops at « relecture-arret » (16) on a finding without a valid agent, or on a criterion', () => {
    const id = 'demo-rendu-sans-destinataire';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(id, 'relecteur-1', rendu(null));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(16);
    expect(ARRETS['relecture-arret']).toBe(16);
    expect(sessions(id, 'developpeur')).toBe(1);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'relecture', raison: 'relecture-arret', code: 16 });
    expect(e?.rapport).toContain("n'a pas de destinataire valide");
    expect(e?.question).toMatchObject({ arret: 'relecture-arret', qui: 'superviseur' });
    expect(enFile()).not.toContain(`agent/${id}`);
    // Resumed, the reviewer puts a criterion itself in question: a stop again.
    scenario(id, 'relecteur-2', rendu('developpeur', 'le double contredit la spec.', '1'));
    const r2 = circuit([id, '--reprendre']);
    expect(r2.status, sortie(r2)).toBe(16);
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(etat(id)?.rapport).toContain('met en cause un critère');
  });

  it('stops at « relecture-arret » at the third RENDU', () => {
    const id = 'demo-trois-rendus';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'developpeur',
      `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\npassation 'Un tour.'\n`
    );
    scenario(id, 'relecteur', rendu('developpeur'));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(16);
    expect(sessions(id, 'relecteur')).toBe(3);
    expect(sessions(id, 'developpeur')).toBe(3);
    // Each round is a first developpeur session: none on the strong model.
    for (const n of [2, 3]) {
      expect(args(id, 'developpeur', n)).not.toContain('--model');
    }
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'relecture', raison: 'relecture-arret', code: 16 });
    expect(e?.rapport).toContain('3 relectures ont rendu le lot');
    expect(enFile()).not.toContain(`agent/${id}`);
  });
});
