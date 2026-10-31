import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { restesAuProjet } from '../../../../scripts/migrations.mjs';
import {
  migrer,
  nom,
  restes,
  version,
} from '../../../../scripts/langages/typescript/migrations/0.24.4-noms-declares-inutilises.mjs';

// grillhouse-5m1.2 critère 1: from 0.24.4 the guard of the consumers refuses a declared name that
// no code of its consumer uses. BPScript holds 26 such names on 11 lines of 4 interfaces: without
// a word at its update, its main would turn red at the next pass. The update names each line and
// the command that inscribes them in the known debt, once, at the passage of the rule.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-noms-declares-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const projet = (fichiers: Record<string, string>) => {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    writeFileSync(path.join(p, f), t);
  }
  return p;
};
const INTERFACE = (consommateurs: string) =>
  `# b\n\nB rend les durées.\n\n## duree\n\nRend une durée.\n\n## Consommateurs\n\n${consommateurs}\n`;
const BASE = {
  // grillhouse-ca7: a project of TypeScript declares its language in its architecture.
  'package.json': '{"name":"p","grillhouse":{"version":"0.24.3"}}',
  'docs/ARCHITECTURE.md': '| Composant | Langage |\n| --- | --- |\n| `.` | typescript |\n',
  'packages/b/package.json': '{"name":"@demo/b"}',
  'packages/a/package.json': '{"name":"@demo/a"}',
  'packages/c/package.json': '{"name":"@demo/c"}',
  'packages/a/src/index.ts': "import { duree } from '@demo/b';",
  'packages/c/src/index.ts': "import { duree } from '@demo/b';",
};
const PERIME = {
  ...BASE,
  'packages/b/docs/INTERFACE.md': INTERFACE('- `a` : duree, tempo, rythme\n- `c` : duree, mesure'),
};
const LIGNES = [
  "packages/b/docs/INTERFACE.md § Consommateurs, `a` : tempo, rythme, qu'aucun code de a n'utilise",
  "packages/b/docs/INTERFACE.md § Consommateurs, `c` : mesure, qu'aucun code de c n'utilise",
  'la garde des consommateurs refuse désormais ces 3 noms : `npm run grillhouse:dette:inscrire` les inscrit dans grillhouse-dette.json, la dette connue du projet, ou chaque nom sort de sa ligne',
];

describe('migration 0.24.4 — the declared names no consumer uses', () => {
  it('is the migration of 0.24.4, « noms déclarés inutilisés »', () => {
    expect(version).toBe('0.24.4');
    expect(nom).toBe('noms déclarés inutilisés');
  });

  it('critère 1 — names each line the new rule refuses, and the command that inscribes the debt', () => {
    expect(restes(projet(PERIME))).toEqual(LIGNES);
  });

  it('critère 1 — the update of a project at 0.24.3 reports them', () => {
    expect(restesAuProjet(projet(PERIME), '0.24.3')).toContainEqual({
      version: '0.24.4',
      nom: 'noms déclarés inutilisés',
      lignes: LIGNES,
    });
  });

  it('critère 1 — writes nothing, and says nothing once the debt holds them or the names are gone', () => {
    const p = projet(PERIME);
    const avant = readdirSync(p);
    expect(migrer(p)).toEqual([]);
    expect(readdirSync(p)).toEqual(avant);
    const dette = {
      consommateurs: {
        'packages/b/docs/INTERFACE.md': { 'declare-non-utilise': { count: 3 } },
      },
    };
    expect(restes(projet({ ...PERIME, 'grillhouse-dette.json': JSON.stringify(dette) }))).toEqual(
      []
    );
    const propre = projet({
      ...BASE,
      'packages/b/docs/INTERFACE.md': INTERFACE('- `a` : duree\n- `c` : duree'),
    });
    expect(restes(propre)).toEqual([]);
  });
});
