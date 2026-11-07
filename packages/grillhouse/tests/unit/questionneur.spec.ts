// grillhouse-3uv.89.1 (L9): the questionneur, a role agent that asks and decides nothing, as
// Amazon's bar raiser, the challenge and response of a cockpit, the devil's advocate of a design
// review: a look that did not write the proposal. No list of questions is set for it: the frame
// (the métacadre, the charter, « Comment on arbitre » of the project) and the ticket orient it, as
// the owner asks his questions by intuition where a proposal seems unclear to him. Its texts are
// checked here; its reading in the circuit, at night, by
// packages/grillhouse-essais/tests/circuit.plan.nuit.spec.ts.
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

describe('the questionneur’s instruction', () => {
  // grillhouse-3uv.95.4: it reads the plan once, with no answer of an author to read.
  it('a template of its own, for its one reading of the plan', () => {
    expect(duQuestionneur().map(b => b.titre)).toEqual([
      'Questionneur, sur le plan (rempli par le circuit)',
    ]);
  });

  // grillhouse-3uv.95.5: the circuit plays no survey of the components again; the plan the
  // explorateur wrote carries it.
  it('critère 4 — carries the proposal and the frame that orients it: the métacadre, « Comment on arbitre », « Ce qui monte au superviseur » and the ticket', () => {
    const [premier] = duQuestionneur();
    for (const champ of ['proposition', 'metacadre', 'arbitrer', 'monte', 'description']) {
      expect(premier.texte, champ).toContain(`{{${champ}}}`);
    }
    expect(premier.texte).not.toContain('{{releve}}');
  });
});

describe('the questionneur, a role agent', () => {
  it('critère 3 — its definition writes nothing and loads its skill on its first turn', () => {
    const d = lire('mods/grillhouse/agents/questionneur.md');
    expect(d).toMatch(/^name: questionneur$/m);
    expect(d).toMatch(/^disallowedTools: Write, Edit, MultiEdit, NotebookEdit$/m);
  });

  it('its skill is named questionneur', () => {
    const c = lire('mods/grillhouse/skills/questionneur/SKILL.md');
    expect(c).toMatch(/^name: questionneur$/m);
  });

  it('the frame’s plugin carries its agent and skill to a project, its tests staying in Grillhouse', () => {
    expect(existsSync(path.join(RACINE, 'mods/grillhouse/agents/questionneur.md'))).toBe(true);
    expect(existsSync(path.join(RACINE, 'mods/grillhouse/skills/questionneur/SKILL.md'))).toBe(
      true
    );
    expect(
      existsSync(path.join(RACINE, 'packages/grillhouse-essais/tests/circuit.plan.nuit.spec.ts'))
    ).toBe(true);
  });
});
