// The conduct around the circuit of a ticket (scripts/circuit.mjs), decided by the owner on
// 2026-10-17 (grill, Q10 and Q2): the supervisor launches the circuit in the background, its end
// waking him; a regulator comes only on a stop (a code other than 0 and 75). Since
// grillhouse-3uv.85, the circuit launches the regulator's session itself and applies its decision; the
// supervisor relaunches it only with the answer to a question (`--reponse`). The wait by slices
// (the script `ATTENDRE` names) is gone, with its callers: no session waits for a verdict at a ticket.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../..');
const lire = (rel: string) => readFileSync(path.join(RACINE, rel), 'utf8');
// The name of the removed script, written in two parts so that this file does not cite it.
const ATTENDRE = ['attendre', 'sh'].join('.');
// The frontmatter's description of a skill or an agent.
const description = (rel: string) => /^description:\s*(.*)$/m.exec(lire(rel))?.[1] ?? '';

describe('Q2 — the wait by slices is gone, with its callers', () => {
  it('the script is removed', () => {
    expect(existsSync(path.join(RACINE, 'scripts', ATTENDRE))).toBe(false);
  });

  it('no file of the repository calls it or describes it; the list of the frame only removes it', () => {
    const r = spawnSync('git', ['-C', RACINE, 'ls-files', '-z'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const citent = r.stdout
      .split('\0')
      .filter(f => f && !f.startsWith('.beads/') && !f.startsWith('pitmaster/'))
      .filter(f => existsSync(path.join(RACINE, f)))
      .filter(f => {
        const lignes = lire(f).split('\n');
        return lignes.some(
          l =>
            l.includes(ATTENDRE) && !(f === '.claude/grillhouse/fichiers.txt' && l.startsWith('- '))
        );
      });
    expect(citent).toEqual([]);
    expect(lire('.claude/grillhouse/fichiers.txt').split('\n')).toContain(`- scripts/${ATTENDRE}`);
  });
});

describe('Q10 — the supervisor launches the circuit, a régulateur, a session of the circuit, settles a stop', () => {
  it('the charter names the regulateur, at step 2, who settles a stop of the circuit', () => {
    const charte = lire('.claude/grillhouse/charte.md').replace(/\s+/g, ' ');
    expect(charte).toMatch(
      /2 Arbitrage, le `referent-technique` \([^)]*\) ou le `regulateur` \(un arrêt du circuit\)/
    );
    expect(charte).not.toMatch(/qui mène un ticket de sa prise à son commit/);
  });

  it('the charter says the circuit, launched by the supervisor, launches one agent per component', () => {
    const charte = lire('.claude/grillhouse/charte.md').replace(/\s+/g, ' ');
    expect(charte).toMatch(
      /le circuit \(`scripts\/circuit\.mjs`\), que lance le superviseur, lance un agent par composant/
    );
    expect(charte).not.toMatch(/le régulateur lance un agent par composant/);
  });

  it('critère 8 — the supervisor launches the circuit once, relaunches --reponse after the owner answers, and launches no regulateur sub-agent', () => {
    const pitmaster = lire('.claude/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(pitmaster).toMatch(
      /`node scripts\/circuit\.mjs <ticket>`, que je lance une fois, en arrière-plan/
    );
    expect(pitmaster).toMatch(/75 \(`a-repasser`[^)]*\) ne lance aucun régulateur/);
    expect(pitmaster).toMatch(/`node scripts\/circuit\.mjs <ticket> --reponse "<sa réponse>"`/);
    expect(pitmaster).toMatch(/`question`/);
    expect(pitmaster).not.toMatch(/subagent_type: regulateur/);
    expect(pitmaster).not.toMatch(/Un arrêt part à un régulateur neuf/);
    expect(pitmaster).not.toMatch(/SendMessage|par message à son identifiant/);
    expect(pitmaster).not.toMatch(/Un régulateur par ticket/);
  });

  it('the agent and the skill of the régulateur describe his new role', () => {
    for (const f of ['.claude/agents/regulateur.md', '.claude/skills/regulateur/SKILL.md']) {
      const d = description(f);
      expect(d, f).toMatch(/arrêt du circuit/);
      expect(d, f).not.toMatch(/de la prise au commit/);
    }
  });

  it('critère 8 — the régulateur renders its decision as its sheet and launches no circuit', () => {
    const brut = lire('.claude/skills/regulateur/SKILL.md');
    const regulateur = brut.replace(/\s+/g, ' ');
    for (const forme of [
      '`RELANCE --reprendre`',
      '`RELANCE --depuis`',
      '`depuis`',
      '`contexte`',
      '`MONTE`',
      '`question`',
    ]) {
      expect(regulateur).toContain(forme);
    }
    expect(regulateur).toMatch(/Ma décision est ma fiche/);
    expect(regulateur).not.toMatch(/Relancer, puis finir/);
    expect(regulateur).not.toMatch(/run_in_background|en veille|arrière-plan/);
    // The skill prescribes no command of the circuit: the circuit applies the decision.
    expect(brut).not.toMatch(/`node scripts\/circuit\.mjs/);
    for (const f of ['.claude/agents/regulateur.md', '.claude/skills/regulateur/SKILL.md']) {
      expect(description(f), f).not.toMatch(/relance le circuit|relancer le circuit/);
    }
  });

  it('critère 8 — the header of the circuit says the circuit launches the regulateur, the code question and --reponse', () => {
    const tete = lire('scripts/circuit.mjs')
      .split('\nimport ')[0]
      .replace(/^\/\/ ?/gm, '')
      .replace(/\s+/g, ' ');
    expect(tete).toMatch(/The supervisor runs it once, in the background, and its end wakes him/);
    expect(tete).toMatch(/the circuit launches a session of the regulator itself/);
    expect(tete).toMatch(/question/);
    expect(tete).toMatch(/--reponse/);
    expect(tete).not.toMatch(/fresh regulator on the stop/);
    expect(tete).not.toMatch(/The regulator runs it in the background/);
    expect(tete).not.toMatch(/his session stays parked/);
  });

  it('critère 8 — the README says the circuit launches the regulateur, the code question and --reponse', () => {
    const readme = lire('README.md').replace(/\s+/g, ' ');
    expect(readme).toMatch(/the circuit itself opens a session of the regulator \(`regulateur`\)/);
    expect(readme).toMatch(/`question`/);
    expect(readme).toMatch(/--reponse/);
  });
});

// The texts of the agents the circuit launches, on what it reads of their sheets (2026-10-19, from
// BPScript's runs; grillhouse-3uv.89, L1): a test the testeur adapts carries its expected green in
// its first sheet; a developpeur sends a red left in the tests of a component to its testeur.
describe('the sheets the circuit reads', () => {
  const testeur = lire('.claude/skills/testeur/SKILL.md').replace(/\s+/g, ' ');
  const developpeur = lire('.claude/skills/developpeur/SKILL.md').replace(/\s+/g, ' ');
  // The first template, the testeur's and the developpeur's instruction.
  const premier = /```text\n([\s\S]*?)\n```/
    .exec(lire('.claude/skills/pitmaster/references/consigne-agent.md'))?.[1]
    .replace(/\s+/g, ' ');

  it('each green test before the code goes into `verts_attendus`: its file from the root, its full name, its reason', () => {
    for (const [nom, texte] of [
      ['testeur', testeur],
      ['consigne', premier ?? ''],
    ]) {
      expect(texte, nom).toContain('`verts_attendus`');
      expect(texte, nom).toMatch(/son nom complet tel que le rapport de la preuve l'écrit/);
    }
    expect(testeur).toMatch(/adaptes? à un nom ou un type changé/);
    expect(testeur).toMatch(/première fiche/);
  });

  // Witness: BPScript (vbwf.320.2.4.5.1, 2026-10-20): up to 14 KB of « vert attendu » per handover,
  // one per test, most with the same reason; nine sessions of the testeur only added these lines.
  it('a test file HEAD holds, adapted, all its tests green for one reason, takes one expected green for the file', () => {
    for (const [nom, texte] of [
      ['testeur', testeur],
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
  it('the sheet of the testeur and the developpeur carries its status, FAIT, BLOQUÉ with its reason, BESOIN with its question', () => {
    for (const [nom, texte] of [
      ['testeur', testeur],
      ['developpeur', developpeur],
      ['consigne', premier ?? ''],
    ]) {
      expect(texte, nom).toContain('`statut`');
      for (const forme of ['FAIT', 'BLOQUÉ', '`raison`', 'BESOIN', '`question`']) {
        expect(texte, nom).toContain(forme);
      }
      expect(texte, nom).not.toMatch(/STATUT :|Agent : testeur|vert attendu :/);
    }
    const regulateur = lire('.claude/skills/regulateur/SKILL.md').replace(/\s+/g, ' ');
    expect(regulateur).toMatch(/`hors-portee` \(code 19\)/);
    expect(regulateur).toMatch(/`besoin` \(code 20\)/);
  });

  // Witness: BPScript (320.2.4.5.1), a type changed in 000-forms broke the shared test material,
  // which only the testeur writes: the developpeurs of the components after it ran on that red
  // for nothing.
  it('a testeur whose ticket changes a type or a name of his component migrates, in the same session, the shared test material and the tests of the title that read it', () => {
    for (const [nom, texte] of [
      ['testeur', testeur],
      ['consigne', premier ?? ''],
    ]) {
      expect(texte, nom).toMatch(/change un type ou un nom de ton composant/);
      expect(texte, nom).toMatch(
        /tu migres aussi, dans la même séance, la matière de test partagée qui le lit/
      );
    }
  });
});

// Witness: BPScript (320.2.4.5.1), the circuit wrote « question du regulator au
// responsable » on MONTE; both questions of that ticket were the supervisor's, who settles alone
// what is his and carries to the owner only what is the owner's.
describe('a question of the régulateur goes up to the supervisor, who answers it or carries it to the owner', () => {
  const blocs = [
    ...lire('.claude/skills/pitmaster/references/consigne-agent.md').matchAll(
      /```text\n([\s\S]*?)\n```/g
    ),
  ].map(m => m[1].replace(/\s+/g, ' '));

  it('the header of the circuit sends the question to the supervisor, who answers it or carries it to the owner', () => {
    const tete = lire('scripts/circuit.mjs')
      .split('\nimport ')[0]
      .replace(/^\/\/ ?/gm, '')
      .replace(/\s+/g, ' ');
    expect(tete).toMatch(/at « question » \(18\) the regulator's question goes to him/);
    expect(tete).toMatch(/he answers it himself, or carries it to the owner/);
    expect(tete).not.toMatch(/carries the regulator's question to the owner/);
    expect(tete).not.toMatch(/question for the owner/);
  });

  it('the stop of the circuit on MONTE names the supervisor, never the owner', () => {
    const code = lire('scripts/circuit.mjs');
    expect(code).toContain('question du régulateur au superviseur');
    expect(code).not.toContain('question du régulateur au responsable');
    expect(code).not.toContain('--reponse attend la réponse du responsable');
  });

  it('the README sends the question to the supervisor, who answers it or carries it to the owner', () => {
    const readme = lire('README.md').replace(/\s+/g, ' ');
    expect(readme).toMatch(
      /the supervisor answers the question himself, or carries it to the owner/
    );
    expect(readme).not.toMatch(/the supervisor carries the question to the owner/);
  });

  it('the skills of the supervisor and of the regulateur say the same: the supervisor answers what is his, carries to the owner what is the owner’s', () => {
    for (const f of ['.claude/skills/pitmaster/SKILL.md', '.claude/skills/regulateur/SKILL.md']) {
      const texte = lire(f).replace(/\s+/g, ' ');
      expect(texte, f).toMatch(/le cadre du ticket, un arbitrage/);
      expect(texte, f).toMatch(/le fonctionnel et ce que la charte lui garde/);
    }
    const regulateur = lire('.claude/skills/regulateur/SKILL.md').replace(/\s+/g, ' ');
    expect(regulateur).not.toMatch(
      /Le superviseur porte la question au responsable, et sa réponse/
    );
  });

  it("the regulateur's instructions on a stop and on the answer speak of the supervisor's answer, which may carry the owner's", () => {
    expect(blocs[2]).toMatch(/Une MONTE porte la question au superviseur/);
    expect(blocs[2]).not.toMatch(/Une MONTE porte la question au responsable/);
    expect(blocs[3]).toMatch(/LA RÉPONSE DU SUPERVISEUR à ta question/);
    expect(blocs[3]).toMatch(/celle du responsable qu'il porte/);
    expect(blocs[3]).not.toMatch(/RÉPONSE DU RESPONSABLE/);
  });
});

// Witness: BPScript (vbwf.320.2.4.5.1, si61.8, 2026-10-20): the developpeur's final report went to
// the log alone, the circuit reading the ticket; the hours of a handover are the register's
// (scripts/registre.mjs), which no agent declares; the testeur « warned the supervisor » with no
// means to in the circuit. Since grillhouse-3uv.89 (L1), the final answer is the sheet.
describe('the texts ask no writing without a reader', () => {
  const plat = (rel: string) => lire(rel).replace(/\s+/g, ' ');
  const testeur = plat('.claude/skills/testeur/SKILL.md');
  const developpeur = plat('.claude/skills/developpeur/SKILL.md');
  const blocs = [
    ...lire('.claude/skills/pitmaster/references/consigne-agent.md').matchAll(
      /```text\n([\s\S]*?)\n```/g
    ),
  ].map(m => m[1].replace(/\s+/g, ' '));

  it('no skill, nor the conventions of the tracker, asks for the hours of a handover or a final report', () => {
    for (const [nom, texte] of [
      ['developpeur', developpeur],
      ['testeur', testeur],
      ['issue-tracker', plat('docs/agents/issue-tracker.md')],
      ['pitmaster', plat('.claude/skills/pitmaster/SKILL.md')],
      ['tour', plat('.claude/skills/pitmaster/references/tour.md')],
    ]) {
      expect(texte, nom).not.toMatch(/heures|clock time|rapport final/i);
    }
  });

  it('the session of each role the circuit leads ends on its sheet; no text asks the final answer « passation au ticket »', () => {
    for (const [nom, texte] of [
      ['testeur', testeur],
      ['developpeur', developpeur],
      ['relecteur', plat('.claude/skills/relecteur/SKILL.md')],
      ['regulateur', plat('.claude/skills/regulateur/SKILL.md')],
      ['consigne 1', blocs[0]],
      ['consigne 6', blocs[5]],
    ]) {
      expect(texte, nom).toMatch(/[Tt]a séance finit sur ta fiche|est ma fiche|est ta fiche/);
    }
    for (const [nom, texte] of [
      ['testeur', testeur],
      ['developpeur', developpeur],
      ['issue-tracker', plat('docs/agents/issue-tracker.md')],
      ...blocs.map((b, i) => [`consigne ${i + 1}`, b]),
    ]) {
      expect(texte, nom).not.toMatch(/réponse finale tient en une ligne|« passation au ticket »/);
    }
  });

  it('the testeur asks his question by his sheet, not by warning the supervisor', () => {
    expect(testeur).not.toMatch(/tu préviens le superviseur/);
    const fin = testeur.slice(testeur.indexOf('## La fin'));
    expect(fin).toContain('BESOIN');
    expect(fin).toContain('`question`');
  });

  it('each discovery of an agent the circuit leads goes into its sheet, which the circuit files', () => {
    for (const [nom, texte] of [
      ['testeur', testeur],
      ['developpeur', developpeur],
      ['relecteur', plat('.claude/skills/relecteur/SKILL.md')],
      ['regulateur', plat('.claude/skills/regulateur/SKILL.md')],
    ]) {
      expect(texte, nom).toContain('`decouvertes`');
      expect(texte, nom).not.toMatch(
        /scripts\/ticket\.sh <id> <sujet> <composants> <corps> decouverte/
      );
    }
  });
});
