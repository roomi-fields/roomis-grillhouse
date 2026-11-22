// Le verrou de la séance hors enveloppe (le superviseur, l'humain qui lance Claude Code à la main,
// une séance qui a perdu sa variable d'enveloppe) : il refuse le code et les tests d'un paquet, par
// défaut, et nomme la commande du direct ; les documents restent écrits.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { SOUS_COMMANDES } from '../../scripts/sous-commandes.mjs';
// Chargé à l'exécution : tant que le module manque, chaque test échoue seul, nommé.
const { refusDeLEcritureHorsEnveloppe } =
  (await import('../../scripts/verrous/ecriture-hors-enveloppe.mjs').catch(
    () => ({})
  )) as unknown as {
    refusDeLEcritureHorsEnveloppe: (
      input: object,
      options: { env: Record<string, string>; tmp: string }
    ) => string | null;
  };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-hors-enveloppe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const SCRATCH = '/scratch';

const repo = mkdtempSync(path.join(ESSAIS, 'depot-'));
writeFileSync(
  path.join(repo, 'package.json'),
  JSON.stringify({ name: 'racine', private: true, workspaces: ['packages/*'] })
);
declarerLesLangages(repo);
for (const p of ['a', 'b']) {
  mkdirSync(path.join(repo, 'packages', p), { recursive: true });
  writeFileSync(path.join(repo, 'packages', p, 'package.json'), JSON.stringify({ name: p }));
}
spawnSync('git', ['init', '-q'], { cwd: repo });

const ecriture = (rel: string, outil = 'Write') => ({
  tool_name: outil,
  tool_input: { file_path: path.join(repo, rel), content: 'x' },
  cwd: repo,
});
const refus = (rel: string, env: Record<string, string> = {}, outil = 'Write') =>
  refusDeLEcritureHorsEnveloppe(ecriture(rel, outil), { env, tmp: SCRATCH });

describe('la séance hors enveloppe n’écrit ni code ni test d’un paquet', () => {
  it.each([
    'packages/a/src/index.ts',
    'packages/a/tests/unit/x.spec.ts',
    'packages/b/package.json',
    'packages/a/scripts/x.mjs',
  ])('refuse %s et nomme la commande du direct', rel => {
    expect(refus(rel)).toContain('npx grillhouse direct <ticket>');
  });

  it('refuse chaque outil d’écriture : Write, Edit, MultiEdit, NotebookEdit', () => {
    for (const outil of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      expect(refus('packages/a/src/index.ts', {}, outil), outil).toContain('direct');
    }
  });

  it('refuse le code du cadre sous mods/grillhouse', () => {
    expect(refus('mods/grillhouse/hooks/crochet.mjs')).toContain('npx grillhouse direct');
  });

  it('refuse une séance dont la variable d’enveloppe est vide', () => {
    expect(refus('packages/a/src/index.ts', { GRILLHOUSE_ENVELOPPE: '' })).toContain('direct');
  });
});

describe('les documents restent écrits par la séance hors enveloppe', () => {
  it.each([
    'packages/a/docs/CADRE.md',
    'packages/a/docs/INTERFACE.md',
    'packages/a/docs/ARCHITECTURE.md',
    'packages/a/CHANGELOG.md',
    'mods/grillhouse/charte.md',
    'mods/grillhouse/skills/pitmaster/SKILL.md',
    'CLAUDE.md',
    'docs/ARCHITECTURE.md',
    'package.json',
  ])('laisse écrire %s', rel => {
    expect(refus(rel)).toBeNull();
  });
});

describe('ce que le verrou hors enveloppe laisse passer', () => {
  it('une séance en enveloppe : son verrou de rôle juge', () => {
    expect(refus('packages/a/src/index.ts', { GRILLHOUSE_ENVELOPPE: 'packages/a' })).toBeNull();
  });

  it('le dossier temporaire de la séance', () => {
    const r = refusDeLEcritureHorsEnveloppe(
      { tool_name: 'Write', tool_input: { file_path: '/scratch/x.ts', content: 'x' }, cwd: repo },
      { env: {}, tmp: SCRATCH }
    );
    expect(r).toBeNull();
  });

  it('un outil qui n’écrit pas', () => {
    const r = refusDeLEcritureHorsEnveloppe(
      { tool_name: 'Read', tool_input: { file_path: path.join(repo, 'packages/a/src/x.ts') } },
      { env: {}, tmp: SCRATCH }
    );
    expect(r).toBeNull();
  });
});

describe('le verrou hors enveloppe est un crochet du greffon du cadre', () => {
  it('la table des sous-commandes le porte', () => {
    expect(SOUS_COMMANDES).toHaveProperty('verrou-hors-enveloppe');
  });

  it('le greffon le joue avant chaque outil d’écriture', () => {
    const crochets = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../../mods/grillhouse/hooks/hooks.json'), 'utf8')
    ) as { hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] } };
    const entree = crochets.hooks.PreToolUse.find(h =>
      h.hooks.some(k => /verrou-hors-enveloppe/.test(k.command))
    );
    expect(entree?.matcher).toMatch(/Write/);
    expect(entree?.matcher).toMatch(/Edit/);
  });
});
