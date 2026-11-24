// The command of a mechanical plan plays on the working tree: the envelope mounts the git directory
// of the copy read-only (machine.md), so `git mv` cannot write its index there. The plan that names
// a git command is refused, with the equivalent; the commit of the circuit records the tree.
// Witness: BPScript 0.49.1, ticket bp-mono-vbwf.320.6.2.17.1, `git mv` refused at 1.1.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lireFiche } from '../../scripts/resultats.mjs';
import * as reponses from '../../scripts/reponses-du-circuit.mjs';
import * as transitions from '../../scripts/transitions.mjs';

const ESSAIS = mkdtempSync(join(tmpdir(), 'commande-du-plan-sans-git-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const PLAN = { criteres: [], paquets: ['packages/a'], questions: [] };
const plan = (commande: string) =>
  JSON.stringify({
    type: 'result',
    session_id: 's',
    structured_output: { ...PLAN, sorte: { genre: 'mécanique', raison: 'un renommage', commande } },
  });

describe('la commande du plan d’un ticket mécanique n’appelle pas git', () => {
  it.each([
    'git mv a b',
    'cd x && git mv a b',
    'mkdir d; git add .',
    'echo a|git apply',
    '(git rm a)',
    'git -C . mv a b',
  ])('refuse « %s » au plan, avec l’équivalent', commande => {
    const lu = lireFiche('explorateur', plan(commande)) as { erreur?: string };
    expect(lu.erreur).toMatch(/sorte\.commande/);
    expect(lu.erreur).toMatch(/appelle git/);
    expect(lu.erreur).toMatch(/mv au lieu de git mv/);
  });

  it.each(['mv a b', 'npx eslint --fix .', 'sed -i s/a/b/ digit.txt', 'node scripts/legit.mjs'])(
    'garde « %s »',
    commande => {
      expect(lireFiche('explorateur', plan(commande))).toHaveProperty('fiche');
    }
  );

  it('refuse la commande de la bascule --mecanique qui appelle git', () => {
    const E = transitions as unknown as Record<string, string>;
    const r = (reponses.reponseMecanique as (o: object) => { refus?: string; suivant?: unknown })({
      etat: { etape: E.PREUVE, raison: 'preuve' },
      sorte: { genre: 'comportement', raison: 'plan', comportement: 'changé' },
      commande: 'git mv a b',
      contexte: 'un renommage',
    });
    expect(r.refus).toMatch(/appelle git/);
    expect(r.suivant).toBeUndefined();
  });
});

describe('le commit du circuit prend un déplacement fait par mv comme un renommage', () => {
  it('git détecte le renommage d’un fichier déplacé sans git', () => {
    const dossier = mkdtempSync(join(ESSAIS, 'renommage-'));
    {
      const git = (...a: string[]) =>
        execFileSync('git', ['-C', dossier, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
          encoding: 'utf8',
        });
      git('init', '-q');
      mkdirSync(join(dossier, 'src'));
      writeFileSync(join(dossier, 'src', 'vieux.ts'), 'export const a = 1;\n'.repeat(20));
      git('add', '-A');
      git('commit', '-q', '-m', 'un');
      renameSync(join(dossier, 'src', 'vieux.ts'), join(dossier, 'src', 'neuf.ts'));
      git('add', '-A');
      expect(git('status', '--porcelain')).toMatch(/^R {2}src\/vieux\.ts -> src\/neuf\.ts/m);
    }
  });
});
