// The start of a session says each path of `grillhouse.groupe` that leads to no project of the
// frame, its key and the path named.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cheminSysteme,
  claudeSubstitut,
  configGit,
} from '@roomi-fields/grillhouse-matiere/test-fixtures';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ouverture-groupe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const SESSION = path.resolve(__dirname, '../../scripts/session-start.sh');

function ouvrir(groupe: string[]) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(
    path.join(p, 'package.json'),
    JSON.stringify({
      devDependencies: { '@roomi-fields/grillhouse': '^0.50.0' },
      grillhouse: { groupe },
    })
  );
  mkdirSync(path.join(p, 'node_modules'));
  const bd = mkdtempSync(path.join(ESSAIS, 'bd-'));
  writeFileSync(path.join(bd, 'bd'), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
  const claude = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), {});
  return spawnSync('bash', [SESSION], {
    encoding: 'utf8',
    env: {
      PATH: cheminSysteme(claude.bin, bd),
      HOME: mkdtempSync(path.join(ESSAIS, 'maison-')),
      CLAUDE_PROJECT_DIR: p,
      ...configGit(),
    },
    timeout: 60_000,
  });
}

describe('the start of a session signals a path of the group with no project of the frame', () => {
  it('one line names the key and the path', () => {
    const r = ouvrir(['.', '../synthhub-absent']);
    expect(r.status, r.stderr).toBe(0);
    const lignes = r.stdout.split('\n').filter(l => l.includes('grillhouse.groupe'));
    expect(lignes, r.stdout).toHaveLength(1);
    expect(lignes[0]).toContain('grillhouse.groupe[1] vaut "../synthhub-absent"');
    expect(lignes[0]).toContain('aucun projet du cadre');
  }, 70_000);

  it('says nothing of a sound group', () => {
    const r = ouvrir(['.']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('grillhouse.groupe');
  }, 70_000);
});
