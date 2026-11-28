// The settings of a role's session leave out the modules of the common charter the role does not
// apply (`claudeMdExcludes`, which Claude Code matches against the absolute path of each file it
// loads, an imported one too), wherever the charter is read: from the package installed or from the
// frame's source, in the copy or in the main tree, whose CLAUDE.md a copy under it also loads.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { optionsDuRole, ROLES } from '../../scripts/droits.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'droits-charte-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MODULES = ['superviseur', 'plan', 'preuve', 'tests'];
// The modules each role receives.
const RECUS: Record<string, string[]> = {
  explorateur: ['plan', 'preuve'],
  questionneur: ['plan', 'preuve'],
  testwriter: ['preuve', 'tests'],
  developpeur: [],
  direct: ['preuve', 'tests'],
  relecteur: ['plan', 'preuve', 'tests'],
};
// Where a project, then the frame's own repository, hold the charter.
const DOSSIERS = ['node_modules/@roomi-fields/grillhouse', 'mods/grillhouse'];

const racine = path.join(ESSAIS, 'projet');
const copie = path.join(racine, '.claude/worktrees/demo-1');
const maison = path.join(ESSAIS, 'maison');
mkdirSync(copie, { recursive: true });
writeFileSync(path.join(copie, 'package.json'), JSON.stringify({ name: 'p' }));
declarerLesLangages(copie);

function exclusions(role: string): string[] {
  const args = optionsDuRole(role, { racine, copie, ticket: 'demo-1', home: maison });
  const reglages = JSON.parse(args[args.indexOf('--settings') + 1]!) as {
    claudeMdExcludes: string[];
  };
  return reglages.claudeMdExcludes;
}

// Whether an entry excludes the file <f>: its path, or a pattern that matches it, folders whose
// name starts with a dot included, as Claude Code matches them (picomatch, `dot: true`).
const sansPoint = (s: string) => s.replaceAll('/.', '/_');
const exclut = (entrees: string[], f: string) =>
  entrees.some(e => e === f || path.matchesGlob(sansPoint(f), sansPoint(e)));

describe('the settings of a role leave out the modules of the charter it does not apply', () => {
  it('every role the circuit launches, the direct included, has its modules', () => {
    expect(Object.keys(ROLES).sort()).toEqual(Object.keys(RECUS).sort());
  });

  describe.each(Object.keys(RECUS))('the %s', role => {
    const ecartes = MODULES.filter(m => !RECUS[role]!.includes(m));
    const fichiers = (module: string) =>
      [copie, racine].flatMap(arbre =>
        DOSSIERS.map(d => path.join(arbre, d, 'charte', `${module}.md`))
      );

    it(`excludes ${ecartes.join(', ')}, wherever the charter is read`, () => {
      const entrees = exclusions(role);
      for (const f of ecartes.flatMap(fichiers)) {
        expect(exclut(entrees, f), f).toBe(true);
      }
    });

    it('keeps the modules it applies, the core, the charter of the project and its own files', () => {
      const entrees = exclusions(role);
      const gardes = [
        ...RECUS[role]!.flatMap(fichiers),
        ...[copie, racine].flatMap(arbre => [
          path.join(arbre, 'CLAUDE.md'),
          ...DOSSIERS.map(d => path.join(arbre, d, 'charte.md')),
          path.join(arbre, 'docs/charte/plan.md'),
        ]),
      ];
      for (const f of gardes) {
        expect(exclut(entrees, f), f).toBe(false);
      }
      expect(exclut(entrees, path.join(maison, '.claude/CLAUDE.md'))).toBe(true);
    });
  });
});
