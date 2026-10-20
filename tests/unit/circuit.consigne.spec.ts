import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, CODE_JUSTE, DESCRIPTION, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): what the instruction
// of each session carries (.claude/skills/pitmaster/references/consigne-agent.md). Witness:
// BPScript (vbwf.320.2.4.5.1, si61.8, 2026-10-20), a developpeur of 050-emitter received as « the
// last handover » 14 KB of « vert attendu » of the testeur of 030-binder, and after a RENDU each
// agent the whole verdict, the findings of the other components included; the reviewer read the
// criteria at the head of its instruction, which its skill keeps for after its first passes; a
// criterion the regulator added to the description never reached the session after its RELANCE, nor did
// the ticket's notes.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, ordre } = circuitEssai(ESSAIS);

// The section « LA DERNIÈRE PASSATION » of an instruction: the text the circuit fills it with.
const passationDe = (consigne: string) =>
  /LA DERNIÈRE PASSATION[^\n]*\n\n([\s\S]*?)\n\nLe circuit joue/.exec(consigne)?.[1] ?? null;

describe.runIf(canWrap)('the instruction of a session', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it("carries as the last handover the one of the session's role on its component, the testeur's for a developpeur who has none yet, never another component's, nor the verdict", () => {
    const id = 'demo-consigne-passation';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur-1', `${ECRIT_ROUGE}passation 'Passation du testeur de forms.'\n`);
    scenario(id, 'testeur-2', `${ECRIT_ROUGE}passation 'Passation du testeur de binder.'\n`);
    // After the RENDU, the testeur of forms justifies its test, already green: no red, so no
    // developpeur of forms; the developpeur of binder comes right after him.
    scenario(
      id,
      'testeur-3',
      `passation 'Rendu de forms traité par son testeur.'\nfiche '{"statut":"FAIT","verts_attendus":[{"fichier":"packages/forms/test/mesure.test.mjs","test":"critère 1 — mesure rend le double","raison":"livré avant le rendu"}]}'\n`
    );
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms.'\n`);
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code de binder.'\n`);
    scenario(
      id,
      'developpeur-3',
      `printf '// rendu\\n' >> $c/src/index.mjs\npassation 'Rendu de binder traité.'\n`
    );
    scenario(
      id,
      'relecteur-1',
      `fiche '{"verdict":"RENDU","constats":[{"titre":"packages/forms/test/mesure.test.mjs","role":"testeur","composant":"000-forms","corps":"Constat adressé à forms."},{"titre":"packages/binder/src/index.mjs","role":"developpeur","composant":"030-binder","corps":"Constat adressé à binder."}]}'\n`
    );
    scenario(id, 'relecteur-2', `fiche '{"verdict":"ACCEPTÉ"}'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
      'testeur packages/forms',
      'developpeur packages/binder',
      'relecteur',
    ]);
    // A first session of each role: the testeur's, nothing before him on his component; the
    // developpeur's, the handover of the testeur of his component.
    expect(passationDe(essai(id, 'testeur-1.prompt'))).toBe('aucune');
    expect(passationDe(essai(id, 'developpeur-1.prompt'))).toBe('Passation du testeur de forms.');
    expect(passationDe(essai(id, 'testeur-2.prompt'))).toBe('aucune');
    expect(passationDe(essai(id, 'developpeur-2.prompt'))).toBe('Passation du testeur de binder.');
    // After the RENDU: each agent its own last handover on its component, its findings alone.
    const testeur = essai(id, 'testeur-3.prompt');
    expect(passationDe(testeur)).toBe('Passation du testeur de forms.');
    expect(testeur).toContain('Constat adressé à forms.');
    expect(testeur).not.toContain('Constat adressé à binder.');
    const developpeur = essai(id, 'developpeur-3.prompt');
    expect(developpeur).toContain('TON COMPOSANT : packages/binder');
    expect(passationDe(developpeur)).toBe('Code de binder.');
    expect(developpeur).toContain('Constat adressé à binder.');
    expect(developpeur).not.toContain('Constat adressé à forms.');
    expect(developpeur).not.toContain('Rendu de forms traité par son testeur.');
  });

  it("gives the reviewer the claims file, which holds the ticket's criteria, and not the criteria themselves", () => {
    const id = 'demo-consigne-relecteur';
    ticket(id, '000-forms');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // The reviewer keeps the claims file its instruction names, as its session sees it.
    scenario(
      id,
      'relecteur',
      `f=$(printf '%s\\n' "$prompt" | sed -n "s/^LE FICHIER D'AFFIRMATIONS, [^:]*: \\(.*\\)$/\\1/p")
cp "$f" "$e/affirmations-vues.md"
fiche '{"verdict":"ACCEPTÉ"}'
`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const consigne = essai(id, 'relecteur-1.prompt');
    expect(consigne).not.toContain('1. `mesure` rend le double de sa valeur.');
    expect(consigne).not.toContain("## Critères d'acceptation");
    expect(consigne).toMatch(/LE FICHIER D'AFFIRMATIONS, [^:\n]*: \S+affirmations\.md\n/);
    expect(essai(id, 'affirmations-vues.md')).toBe(DESCRIPTION);
  });

  it("carries the ticket's description as it is at the session's launch, and its notes when it has some", () => {
    const id = 'demo-consigne-description';
    ticket(id, '000-forms');
    // The testeur needs an answer: the circuit stops at « besoin », and the regulator adds the criterion
    // and the notes to the ticket before its RELANCE, in the same run of the circuit.
    scenario(
      id,
      'testeur-1',
      `passation 'Le cas de zéro manque.'\nfiche '{"statut":"BESOIN","question":"que rend mesure de 0 ?"}'\n`
    );
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const nouvelle = `${DESCRIPTION}\n2. \`mesure\` de 0 rend 0.`;
    scenario(
      id,
      'regulateur',
      `cat > "$e/description.md" <<'EOF'
${nouvelle}
EOF
(cd "$racine" && bd update "$ticket" -d "$(cat "$e/description.md")" --notes 'Fait : le double. Reste : le cas de zéro.')
fiche '{"decision":"RELANCE --reprendre"}'
`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'regulateur',
      'testeur packages/forms',
      'developpeur packages/forms',
      'relecteur',
    ]);
    const avant = essai(id, 'testeur-1.prompt');
    expect(avant).not.toContain('2. `mesure` de 0 rend 0.');
    expect(avant).not.toContain('LES NOTES DU TICKET');
    for (const f of ['testeur-2.prompt', 'developpeur-1.prompt']) {
      const consigne = essai(id, f);
      expect(consigne, f).toContain('2. `mesure` de 0 rend 0.');
      expect(consigne, f).toMatch(
        /LES NOTES DU TICKET[^\n]*\n\nFait : le double\. Reste : le cas de zéro\.\n/
      );
    }
  });
});
