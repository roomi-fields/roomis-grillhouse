// The guard of the structured results (grillhouse-3uv.89, L1): the circuit of a ticket
// (scripts/circuit.mjs) decides on structured results only — the end-of-session sheet of each agent,
// the summary of Turborepo, the JSON reports of Vitest, the SARIF of the guards — and never reads a
// comment, an answer of an agent or a log by a regular expression. Witness: BPScript 320.3
// (2026-10-20), where the line « Agent : testwriter » read only at the start of a line, the notice ⚠
// of a guard not set aside, the last 60 lines of a log and the form of « vert attendu » cost
// relaunches and hid the real red.
//
// Each regular expression of the circuit is listed below with what it reads: none reads a comment,
// an answer or a log. A new one fails this test until it is listed, with what it reads.
//
// The bilan of a ticket (scripts/bilan.mjs, L8) reads the same structured results the circuit
// keeps (L3): the sheets and the outcomes of `<ticket>.fiches.jsonl`, the register, the authors and
// times of the comments, never their text. It holds no regular expression.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const CIRCUIT = path.resolve(__dirname, '../../scripts/circuit.mjs');
const source = readFileSync(CIRCUIT, 'utf8');
const BILAN = path.resolve(__dirname, '../../scripts/bilan.mjs');
const bilan = readFileSync(BILAN, 'utf8');

// The regular expressions the circuit may hold, each with what it reads.
const PERMISES: Record<string, string> = {
  '/```text\\n([\\s\\S]*?)\\n```/g': 'les blocs de consigne du gabarit, un fichier du cadre',
  '/\\{\\{(\\w+)\\}\\}/g': 'les champs d’un gabarit de consigne',
  '/\\.(test|spec)(\\.[cm]?[jt]sx?)$/': 'le nom d’un fichier de test, pour sa version de HEAD',
  '/\\.circuit-avant\\.(test|spec)\\./': 'le nom d’un fichier de test, la version de HEAD',
};

// Every regular expression of <texte>: its literals, and each `RegExp(…)` construction.
function expressions(texte: string) {
  const f = ts.createSourceFile('circuit.mjs', texte, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const voir = (n: ts.Node) => {
    if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      out.push(n.getText());
    }
    if (
      (ts.isNewExpression(n) || ts.isCallExpression(n)) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'RegExp'
    ) {
      out.push(`RegExp(${n.arguments?.map(a => a.getText()).join(', ') ?? ''})`);
    }
    ts.forEachChild(n, voir);
  };
  voir(f);
  return out;
}

describe('the circuit decides on structured results, never on free text', () => {
  it('each regular expression of the circuit is one listed, none reading a comment, an answer or a log', () => {
    const hors = expressions(source).filter(e => !(e in PERMISES));
    expect(hors).toEqual([]);
  });

  it('the guard sees a regular expression added to the circuit', () => {
    expect(expressions(`${source}\nconst x = /^STATUT\\s*:/m;\n`)).toContain('/^STATUT\\s*:/m');
    expect(expressions('const y = new RegExp(`^${a}`);')).toEqual(['RegExp(`^${a}`)']);
  });

  it('the circuit reads no verdict by its first word (verdictDe, VERDICT), but the reviewer’s sheet', () => {
    expect(source).not.toMatch(/\bverdictDe\b|\bVERDICT\b/);
  });

  it('the circuit holds none of the forms of free text it read before: the status line, « vert attendu », Turborepo’s line « Failed: », the notices ⚠️ and ℹ️ set aside', () => {
    for (const forme of ['STATUT :', 'vert attendu :', 'Failed:', "includes('⚠", "includes('ℹ"]) {
      const lignes = source
        .split('\n')
        .filter(l => !l.trimStart().startsWith('//'))
        .filter(l => l.includes(forme));
      expect(lignes, forme).toEqual([]);
    }
  });

  it('the bilan holds no regular expression and reads no text of a comment, nor the lines « Circuit · … »', () => {
    expect(expressions(bilan)).toEqual([]);
    const code = bilan
      .split('\n')
      .filter(l => !l.trimStart().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/\.text\b/);
    expect(code).not.toContain('Circuit · ');
  });
});
