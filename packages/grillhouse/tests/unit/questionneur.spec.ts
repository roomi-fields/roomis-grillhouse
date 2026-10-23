// grillhouse-3uv.89.1 (L9): the questionneur, a role agent that asks and decides nothing, as
// Amazon's bar raiser, the challenge and response of a cockpit, the devil's advocate of a design
// review: a look that did not write the proposal. No list of questions is set for it: the frame
// (the métacadre, the charter, « Comment on arbitre » of the project) and the ticket orient it, as
// the owner asks his questions by intuition where a proposal seems unclear to him. Its texts are
// checked here; its reading in the circuit, by tests/unit/circuit.questionneur.spec.ts.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
const lire = (f: string) => readFileSync(path.join(RACINE, f), 'utf8');
const GABARIT = 'mods/grillhouse/skills/pitmaster/references/consigne-agent.md';
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
  // grillhouse-3uv.95.4: it reads the plan once, with no answer of an author to read.
  it('a template of its own, for its one reading of the plan', () => {
    expect(duQuestionneur().map(b => b.titre)).toEqual([
      'Questionneur, sur le plan (rempli par le circuit)',
    ]);
    expect(duQuestionneur()[0].texte).toContain('une seule fois');
  });

  it('critère 4 — carries the proposal and the frame that orients it: the métacadre, « Comment on arbitre », « Ce qui monte au superviseur », the ticket and the survey', () => {
    const [premier] = duQuestionneur();
    for (const champ of [
      'proposition',
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
    const d = lire('mods/grillhouse/agents/questionneur.md');
    expect(d).toMatch(/^name: questionneur$/m);
    expect(d).toMatch(/^disallowedTools: Write, Edit, MultiEdit, NotebookEdit$/m);
    expect(d).toMatch(/charge ta compétence `questionneur`/);
  });

  it('its skill sets no list of questions either', () => {
    const c = lire('mods/grillhouse/skills/questionneur/SKILL.md');
    expect(c).toMatch(/^name: questionneur$/m);
    expect(c).not.toMatch(QUESTION_IMPOSEE);
  });

  it('the frame’s plugin carries its agent and skill to a project, its tests staying in Grillhouse', () => {
    expect(existsSync(path.join(RACINE, 'mods/grillhouse/agents/questionneur.md'))).toBe(true);
    expect(existsSync(path.join(RACINE, 'mods/grillhouse/skills/questionneur/SKILL.md'))).toBe(
      true
    );
    expect(existsSync(path.resolve(__dirname, 'circuit.questionneur.spec.ts'))).toBe(true);
  });

  it('critère 6 — the supervisor has his plan questioned before he gives it to the owner, and answers in his own session', () => {
    const p = lire('mods/grillhouse/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(p).toMatch(/sous-agent `questionneur`/);
    expect(p).toMatch(/avant de le rendre au responsable/);
  });

  // grillhouse-3uv.84.8: the circuit of a ticket lives in the supervisor's skill.
  it('the supervisor’s skill names the questionneur at its step, 1.2, which it reads once', () => {
    const c = lire('mods/grillhouse/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(c).toContain('1.2 Questionnement, le `questionneur`, qui lit le plan une seule fois');
  });
});
