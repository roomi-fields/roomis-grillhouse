// The conduct around the circuit of a ticket (scripts/circuit.mjs), decided by the owner on
// 2026-10-17 (grill, Q10 and Q2): the supervisor launches the circuit in the background, its end
// waking him. Since grillhouse-3uv.95.4, the circuit makes the mechanical gestures itself and every
// other stop goes up to the supervisor as a question, which he answers by a command of the circuit
// (`--reprendre`, `--depuis`, `--etendre`, `--arreter`). The wait by slices
// (the script `ATTENDRE` names) is gone, with its callers: no session waits for a verdict at a ticket.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
const lire = (rel: string) => readFileSync(path.join(RACINE, rel), 'utf8');
// The name of the removed script, written in two parts so that this file does not cite it.
const ATTENDRE = ['attendre', 'sh'].join('.');

describe('Q2 — the wait by slices is gone, with its callers', () => {
  it('the script is removed', () => {
    expect(existsSync(path.join(RACINE, 'packages/grillhouse/scripts', ATTENDRE))).toBe(false);
  });

  it('no file of the repository calls it or describes it', () => {
    const r = spawnSync('git', ['-C', RACINE, 'ls-files', '-z'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const citent = r.stdout
      .split('\0')
      .filter(f => f && !f.startsWith('.beads/') && !f.startsWith('pitmaster/'))
      .filter(f => existsSync(path.join(RACINE, f)))
      .filter(f => {
        const lignes = lire(f).split('\n');
        return lignes.some(l => l.includes(ATTENDRE));
      });
    expect(citent).toEqual([]);
  });
});

// grillhouse-3uv.95.4: as a CI applies its rules alone and calls a person only for what no rule
// settles, the circuit makes the mechanical gestures and sends every other stop to the supervisor.
describe('Q10 — the supervisor launches the circuit, which makes the gestures and sends him its questions', () => {
  // Romain, 2026-10-21: the questioning is « Questionnement »; grillhouse-3uv.95.5: the plan is
  // step 1, « 1 Plan », the explorateur's and the questionneur's, in every text that names it.
  it('the texts name the step « 1 Plan »', () => {
    for (const f of [
      'mods/grillhouse/skills/pitmaster/SKILL.md',
      'mods/grillhouse/skills/questionneur/SKILL.md',
      'README.md',
      'docs/agents/issue-tracker.md',
    ]) {
      const texte = lire(f).replace(/\s+/g, ' ');
      expect(texte, f).toContain('1 Plan');
      expect(texte, f).not.toContain('1.2 Questionnement');
      expect(texte, f).not.toContain('Questionnement du plan');
    }
  });

  // grillhouse-3uv.84.8: the circuit of a ticket lives in the supervisor's skill, which the charter
  // sums up.
  it('the supervisor’s skill says the circuit makes the mechanical gestures that the list of the steps writes', () => {
    const charte = lire('mods/grillhouse/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(charte).toMatch(/Le circuit fait les gestes mécaniques/);
    expect(charte).toMatch(/`GESTES` de `packages\/grillhouse\/scripts\/etapes\.mjs`/);
    expect(charte).not.toMatch(/qui mène un ticket de sa prise à son commit/);
  });

  it('the supervisor’s skill says the circuit, launched by the supervisor, launches one agent per component', () => {
    const charte = lire('mods/grillhouse/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(charte).toMatch(
      /le circuit \(`packages\/grillhouse\/scripts\/circuit\.mjs`\), que lance le superviseur, lance un agent par composant/
    );
  });

  it('the supervisor launches the circuit once and answers a question by a command of the circuit', () => {
    const pitmaster = lire('mods/grillhouse/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(pitmaster).toMatch(
      /`npx grillhouse circuit <ticket>`, que je lance une fois, en arrière-plan/
    );
    for (const commande of ['`--reprendre`', '`--etendre <composant>`', '`--arreter`']) {
      expect(pitmaster).toContain(commande);
    }
    expect(pitmaster).toMatch(/`question`/);
    expect(pitmaster).not.toMatch(/--reponse|--decision/);
    expect(pitmaster).not.toMatch(/SendMessage|par message à son identifiant/);
  });

  it('the header of the circuit says the gestures, the question and the commands of the supervisor', () => {
    const tete = lire('packages/grillhouse/scripts/circuit.mjs')
      .split('\nimport ')[0]
      .replace(/^\/\/ ?/gm, '')
      .replace(/\s+/g, ' ');
    expect(tete).toMatch(/The supervisor runs it once, in the background, and its end wakes him/);
    expect(tete).toMatch(/the circuit makes the mechanical gestures itself, with no session/);
    expect(tete).toMatch(/every other stop goes up to the supervisor/);
    for (const commande of ['--reprendre', '--depuis', '--etendre <composant>', '--arreter']) {
      expect(tete).toContain(commande);
    }
    expect(tete).not.toMatch(/--reponse|--decision/);
    expect(tete).not.toMatch(/his session stays parked/);
  });

  it('the README says the gestures, the question and the commands of the supervisor', () => {
    const readme = lire('README.md').replace(/\s+/g, ' ');
    expect(readme).toMatch(/the circuit makes the mechanical gestures itself, with no session/);
    expect(readme).toMatch(/Every other stop ends the circuit on a question for the supervisor/);
    expect(readme).toMatch(/`--etendre <composant>`/);
    expect(readme).toMatch(/`--arreter`/);
    expect(readme).not.toMatch(/--reponse|--decision/);
  });
});

// The texts of the agents the circuit launches, on what it reads of their sheets (2026-10-19, from
// BPScript's runs; grillhouse-3uv.89, L1): a test the testwriter adapts carries its expected green in
// its first sheet; a developpeur sends a red left in the tests of a component to its testwriter.
describe('the sheets the circuit reads', () => {
  const testwriter = lire('mods/grillhouse/skills/testwriter/SKILL.md').replace(/\s+/g, ' ');
  const developpeur = lire('mods/grillhouse/skills/developpeur/SKILL.md').replace(/\s+/g, ' ');
  // The first template, the testwriter's and the developpeur's instruction.
  const premier = /```text\n([\s\S]*?)\n```/
    .exec(lire('mods/grillhouse/skills/pitmaster/references/consigne-agent.md'))?.[1]
    .replace(/\s+/g, ' ');

  it('each green test before the code goes into `verts_attendus`: its file from the root, its full name, its reason', () => {
    for (const [nom, texte] of [
      ['testwriter', testwriter],
      ['consigne', premier ?? ''],
    ]) {
      expect(texte, nom).toContain('`verts_attendus`');
      expect(texte, nom).toMatch(/son nom complet tel que le rapport de la preuve l'écrit/);
    }
    expect(testwriter).toMatch(/adaptes? à un nom ou un type changé/);
    expect(testwriter).toMatch(/première fiche/);
  });

  // Witness: BPScript (vbwf.320.2.4.5.1, 2026-10-20): up to 14 KB of « vert attendu » per handover,
  // one per test, most with the same reason; nine sessions of the testwriter only added these lines.
  it('a test file HEAD holds, adapted, all its tests green for one reason, takes one expected green for the file', () => {
    for (const [nom, texte] of [
      ['testwriter', testwriter],
      ['consigne', premier ?? ''],
    ]) {
      expect(texte, nom).toMatch(/fichier de tests que HEAD tient/);
      expect(texte, nom).toMatch(/fichier neuf/);
      expect(texte, nom).toMatch(/n'excuse(nt)? aucun rouge/);
    }
  });

  it('a developpeur whose remaining red lies in the tests of a component sends it by `renvoi`', () => {
    for (const [nom, texte] of [
      ['developpeur', developpeur],
      ['consigne', premier ?? ''],
    ]) {
      expect(texte, nom).toContain('`renvoi`');
      expect(texte, nom).toContain('`ecarts`');
    }
  });

  // Witness: BPScript (320.2.4.5.1, si61.8), a developpeur relaunched up to three times on a red
  // out of his reach: his sheet carries a status the circuit reads.
  it('the sheet of the testwriter and the developpeur carries its status, FAIT, BLOQUÉ with its reason, BESOIN with its question', () => {
    for (const [nom, texte] of [
      ['testwriter', testwriter],
      ['developpeur', developpeur],
      ['consigne', premier ?? ''],
    ]) {
      expect(texte, nom).toContain('`statut`');
      for (const forme of ['FAIT', 'BLOQUÉ', '`raison`', 'BESOIN', '`question`']) {
        expect(texte, nom).toContain(forme);
      }
      expect(texte, nom).not.toMatch(/STATUT :|Agent : testwriter|vert attendu :/);
    }
  });

  // Witness: BPScript (320.2.4.5.1), a type changed in 000-forms broke the shared test material,
  // which only the testwriter writes: the developpeurs of the components after it ran on that red
  // for nothing.
  it('a testwriter whose ticket changes a type or a name of his component migrates, in the same session, the shared test material and the tests of the title that read it', () => {
    for (const [nom, texte] of [
      ['testwriter', testwriter],
      ['consigne', premier ?? ''],
    ]) {
      expect(texte, nom).toMatch(/change un type ou un nom de ton composant/);
      expect(texte, nom).toMatch(
        /tu migres aussi, dans la même séance, la matière de test partagée qui le lit/
      );
    }
  });
});

// Witness: BPScript (320.2.4.5.1), the circuit wrote a question for the owner that was the
// supervisor's, who settles alone what is his and carries to the owner only what is the owner's;
// since grillhouse-3uv.95.4 the question names who must answer it.
describe('a question goes up to the supervisor, who answers it or carries it to the owner', () => {
  it('the header of the circuit sends the question to the supervisor, who carries to the owner what is his', () => {
    const tete = lire('packages/grillhouse/scripts/circuit.mjs')
      .split('\nimport ')[0]
      .replace(/^\/\/ ?/gm, '')
      .replace(/\s+/g, ' ');
    expect(tete).toMatch(/and who must answer it/);
    expect(tete).toMatch(/carries to the owner what is his \(`qui` responsable\)/);
    expect(tete).not.toMatch(/question for the owner/);
  });

  it('the README names who must answer the question', () => {
    const readme = lire('README.md').replace(/\s+/g, ' ');
    expect(readme).toMatch(/the question and who must answer it \(`superviseur`, or `responsable`/);
    expect(readme).toMatch(/carries to the owner what is his/);
  });

  it('the supervisor’s skill: he answers what is his, carries to the owner what is the owner’s', () => {
    const texte = lire('mods/grillhouse/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(texte).toMatch(/le cadre du ticket, un arbitrage/);
    expect(texte).toMatch(/le fonctionnel et ce que la charte lui garde/);
    expect(texte).toMatch(/qui doit répondre, `superviseur` ou `responsable`/);
  });
});

// Witness: BPScript (vbwf.320.2.4.5.1, si61.8, 2026-10-20): the developpeur's final report went to
// the log alone, the circuit reading the ticket; the hours of a handover are the register's
// (scripts/registre.mjs), which no agent declares; the testwriter « warned the supervisor » with no
// means to in the circuit. Since grillhouse-3uv.89 (L1), the final answer is the sheet.
describe('the texts ask no writing without a reader', () => {
  const plat = (rel: string) => lire(rel).replace(/\s+/g, ' ');
  const testwriter = plat('mods/grillhouse/skills/testwriter/SKILL.md');
  const developpeur = plat('mods/grillhouse/skills/developpeur/SKILL.md');
  const blocs = [
    ...lire('mods/grillhouse/skills/pitmaster/references/consigne-agent.md').matchAll(
      /```text\n([\s\S]*?)\n```/g
    ),
  ].map(m => m[1].replace(/\s+/g, ' '));

  it('no skill, nor the conventions of the tracker, asks for the hours of a handover or a final report', () => {
    for (const [nom, texte] of [
      ['developpeur', developpeur],
      ['testwriter', testwriter],
      ['issue-tracker', plat('docs/agents/issue-tracker.md')],
      ['pitmaster', plat('mods/grillhouse/skills/pitmaster/SKILL.md')],
      ['tour', plat('mods/grillhouse/skills/pitmaster/references/tour.md')],
    ]) {
      expect(texte, nom).not.toMatch(/heures|clock time|rapport final/i);
    }
  });

  it('the session of each role the circuit leads ends on its sheet; no text asks the final answer « passation au ticket »', () => {
    for (const [nom, texte] of [
      ['testwriter', testwriter],
      ['developpeur', developpeur],
      ['relecteur', plat('mods/grillhouse/skills/relecteur/SKILL.md')],
      ['consigne 1', blocs[0]],
      ['consigne 4', blocs[3]],
    ]) {
      expect(texte, nom).toMatch(/[Tt]a séance finit sur ta fiche|est ma fiche|est ta fiche/);
    }
    for (const [nom, texte] of [
      ['testwriter', testwriter],
      ['developpeur', developpeur],
      ['issue-tracker', plat('docs/agents/issue-tracker.md')],
      ...blocs.map((b, i) => [`consigne ${i + 1}`, b]),
    ]) {
      expect(texte, nom).not.toMatch(/réponse finale tient en une ligne|« passation au ticket »/);
    }
  });

  it('the testwriter asks his question by his sheet, not by warning the supervisor', () => {
    expect(testwriter).not.toMatch(/tu préviens le superviseur/);
    const fin = testwriter.slice(testwriter.indexOf('## La fin'));
    expect(fin).toContain('BESOIN');
    expect(fin).toContain('`question`');
  });

  it('each discovery of an agent the circuit leads goes into its sheet, which the circuit files', () => {
    for (const [nom, texte] of [
      ['testwriter', testwriter],
      ['developpeur', developpeur],
      ['relecteur', plat('mods/grillhouse/skills/relecteur/SKILL.md')],
    ]) {
      expect(texte, nom).toContain('`decouvertes`');
      expect(texte, nom).not.toMatch(
        /npx grillhouse ticket <id> <sujet> <composants> <corps> decouverte/
      );
    }
  });
});

// grillhouse-3uv.89 L7, witnesses BPScript 320.3: the commit 106c32c named none of the deviations
// its criterion 15 required, the reviewer having written them as « remarques » under an ACCEPTÉ;
// a word the project's vocabulary guard flagged went up to the supervisor, then the owner, 2 h 30
// late (the owner: « c'est l'agent qui inspecte les résultats des tests qui doit faire ça »); the
// reviewer's session was refused the reading of the ticket's children it tried for its discovery.
describe('L7 — the reviewer reviews the commit message and ranges the flagged words', () => {
  const relecteur = lire('mods/grillhouse/skills/relecteur/SKILL.md').replace(/\s+/g, ' ');

  it('a deviation a criterion requires at the commit goes into `ecarts`, never into a remark', () => {
    expect(relecteur).toMatch(/critère qui exige qu'un écart se nomme au commit/);
    expect(relecteur).toMatch(/entre dans tes `ecarts`, jamais dans une remarque/);
  });

  it('each word a vocabulary guard of the project flags is ranged by the reviewer: a legitimate use to the project’s register in the lot, only a real word of the language up, by `question`', () => {
    expect(relecteur).toMatch(/une garde de vocabulaire du projet/);
    expect(relecteur).toMatch(/registre des exceptions du projet, dans le lot/);
    expect(relecteur).toMatch(/constat adressé à l'agent qui l'écrit/);
    expect(relecteur).toMatch(/seul un vrai mot du langage écrit en dur monte au responsable/);
    expect(relecteur).toContain('`question`');
    // The guard and its register are the project's: the frame names neither.
    expect(relecteur).not.toMatch(/BPScript|Cast\.types|mots-de-librairie/);
  });

  it('the reviewer neither looks for nor files a ticket: the circuit files the discoveries of its sheet', () => {
    expect(relecteur).toMatch(/Tu ne cherches ni ne crées aucun ticket/);
    expect(relecteur).not.toMatch(/`bd (children|list|create)/);
  });
});

// grillhouse-3uv.91.2, witness BPScript 325: the reviewer required that the frozen v1 packages stay
// dated dependencies with a bench; the owner: « non car la V1 ne change pas elle est gelée ».
// 18 min lost, ~38 with what followed. As Conventional Comments mark a comment blocking or not,
// and as Google's review guide asks for nothing the change does not need, a finding blocks only
// on a criterion of the plan or a rule of the frame, and the rule of the real need applies to it.
describe('3uv.91.2 — a finding of the reviewer blocks or remarks', () => {
  const relecteur = lire('mods/grillhouse/skills/relecteur/SKILL.md').replace(/\s+/g, ' ');

  it('a blocking finding holds a criterion of the plan or a rule of the frame, which it names; any other is a remark', () => {
    expect(relecteur).toMatch(
      /Un constat bloquant tient un critère du plan ou une règle du cadre\*\*, que son champ `regle` nomme/
    );
    expect(relecteur).toMatch(/tout autre constat est une remarque \(`genre` `remarque`\)/);
    expect(relecteur).toMatch(/Seuls les constats bloquants rendent le lot/);
  });

  it('the rule of the real need applies to the reviewer’s own findings', () => {
    expect(relecteur).toMatch(
      /Un constat répond à un besoin réel de l'usage actuel ; un cas seulement possible n'en devient pas un constat bloquant/
    );
  });

  it('the skill no longer names the list of remarks the sheet dropped', () => {
    expect(relecteur).not.toMatch(/`remarques`/);
  });
});
