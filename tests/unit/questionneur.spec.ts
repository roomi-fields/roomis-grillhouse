// grillhouse-3uv.89.1 (L9): the questionneur, a role agent that asks and decides nothing, as
// Amazon's bar raiser, the challenge and response of a cockpit, the devil's advocate of a design
// review: a look that did not write the proposal. No list of questions is set for it: the frame
// (the métacadre, the charter, « Comment on arbitre » of the project) and the ticket orient it, as
// the owner asks his questions by intuition where a proposal seems unclear to him. Its texts are
// checked here; its rounds in the circuit, by tests/unit/circuit.questionneur.spec.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../..');
const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');
const GABARIT = '.claude/skills/pitmaster/references/consigne-agent.md';
// The blocks of instruction of the template, in their order, with the heading above each.
const blocs = () => {
  const texte = lire(GABARIT);
  return [...texte.matchAll(/\n## ([^\n]+)\n+```text\n([\s\S]*?)\n```/g)].map(m => ({
    titre: m[1],
    texte: m[2],
  }));
};
const duQuestionneur = () => blocs().filter(b => b.titre.startsWith('Questionneur'));
// A line that sets a question: an item of a list, or a numbered line, that ends on « ? ».
const QUESTION_IMPOSEE = /^\s*(?:[-*•]|\d+[.)])\s.*\?\s*$/m;

describe('the questionneur’s instruction', () => {
  it('a template of its own, for its first round and for the answer it reads', () => {
    expect(duQuestionneur().map(b => b.titre)).toEqual([
      'Questionneur, sur une proposition (rempli par le circuit)',
      'Questionneur, sur la réponse de l’auteur (rempli par le circuit)',
    ]);
  });

  it('critère 4 — carries the proposal and the frame that orients it: the métacadre, « Comment on arbitre », « Ce qui monte au superviseur », the ticket and the survey', () => {
    const [premier] = duQuestionneur();
    for (const champ of [
      'proposition',
      'auteur',
      'metacadre',
      'arbitrer',
      'monte',
      'description',
      'releve',
    ]) {
      expect(premier.texte, champ).toContain(`{{${champ}}}`);
    }
    expect(premier.texte).toContain('CLAUDE.md');
  });

  it('critère 4 — sets no list of questions', () => {
    for (const b of duQuestionneur()) {
      expect(b.texte, b.titre).not.toMatch(QUESTION_IMPOSEE);
    }
    expect('- Pourquoi pas la référence mûre ?').toMatch(QUESTION_IMPOSEE);
  });
});

describe('the questionneur, a role agent', () => {
  it('critère 3 — its definition writes nothing and loads its skill on its first turn', () => {
    const d = lire('.claude/agents/questionneur.md');
    expect(d).toMatch(/^name: questionneur$/m);
    expect(d).toMatch(/^disallowedTools: Write, Edit, MultiEdit, NotebookEdit$/m);
    expect(d).toMatch(/charge ta compétence `questionneur`/);
  });

  it('its skill sets no list of questions either', () => {
    const c = lire('.claude/skills/questionneur/SKILL.md');
    expect(c).toMatch(/^name: questionneur$/m);
    expect(c).not.toMatch(QUESTION_IMPOSEE);
  });

  it('the frame’s files carry its agent and skill to a project, its tests staying in Grillhouse', () => {
    const f = lire('.claude/grillhouse/fichiers.txt').split('\n');
    expect(f).toContain('.claude/skills/questionneur/');
    expect(f).toContain('- tests/unit/circuit.questionneur.spec.ts');
    expect(f).toContain('- tests/unit/questionneur.spec.ts');
  });

  it('critère 6 — the supervisor has his plan questioned before he gives it to the owner, and answers in his own session', () => {
    const p = lire('.claude/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(p).toMatch(/sous-agent `questionneur`/);
    expect(p).toMatch(/avant de le rendre au responsable/);
  });

  it('the common charter names the questionneur at its steps, 1.2 and the arbitrage of a stop', () => {
    const c = lire('.claude/grillhouse/charte.md').replace(/\s+/g, ' ');
    expect(c).toContain('1.2 Questionnement, le `questionneur`');
    expect(c).toContain('le `questionneur` questionne sa décision');
  });
});
