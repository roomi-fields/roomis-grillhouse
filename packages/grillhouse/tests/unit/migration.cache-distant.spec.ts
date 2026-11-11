// The migration of 0.33.0 (scripts/migrations/0.33.0-cache-distant.mjs): the remote cache of
// Turborepo is shared between the CI and the poste; the migration changes no file, and tells a
// project whose turbo.json does not sign the artifacts how to plug a server.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import { migrer, nom, restes, version } from '../../scripts/migrations/0.33.0-cache-distant.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-cache-distant-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project whose root holds <fichier> with <texte>, or no turbo.json.
function projet(fichier: string | null, texte = '') {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(p, 'package.json'), '{"name":"p"}\n');
  if (fichier !== null) {
    writeFileSync(path.join(p, fichier), texte);
  }
  return p;
}
const SANS = '{ "tasks": {} }\n';
const SIGNE = '{ "remoteCache": { "signature": true }, "tasks": {} }\n';

describe('migration 0.33.0 — the remote cache of Turborepo', () => {
  it('is in the list of the migrations', () => {
    expect(MIGRATIONS.some(m => m.version === version && m.nom === nom)).toBe(true);
    expect(version).toBe('0.33.0');
  });

  it('changes no file of the project', () => {
    const p = projet('turbo.json', SANS);
    expect(migrer()).toEqual([]);
    expect(readFileSync(path.join(p, 'turbo.json'), 'utf8')).toBe(SANS);
  });

  it('tells a project that does not sign how to plug a server, in the CI and on the poste', () => {
    for (const p of [projet('turbo.json', SANS), projet(null)]) {
      const lignes = restes(p);
      expect(lignes).toHaveLength(1);
      for (const mot of [
        'TURBO_API',
        'TURBO_TEAM',
        'TURBO_TOKEN',
        'TURBO_REMOTE_CACHE_SIGNATURE_KEY',
        '"signature": true',
        '~/.config/grillhouse/turbo-cache.env',
      ]) {
        expect(lignes[0]).toContain(mot);
      }
    }
  });

  it('leaves nothing to a project whose turbo.json or turbo.jsonc signs', () => {
    expect(restes(projet('turbo.json', SIGNE))).toEqual([]);
    expect(restes(projet('turbo.jsonc', `// le cadre\n${SIGNE}`))).toEqual([]);
  });
});
