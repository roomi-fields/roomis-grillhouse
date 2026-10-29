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
} from '../../../../scripts/langages/typescript/migrations/0.24.6-lignes-mal-formees.mjs';

// grillhouse-wwr critère 3: from 0.24.6 the guard of the consumers refuses a line of a
// `## Consommateurs` section that is no list of names (BPScript 990-corpus/docs/INTERFACE.md:289,
// at 0.24.5). As the update of 0.24.4 names its unused names, the update names each such line
// beyond the debt, and the command that inscribes them.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-lignes-mal-formees-'));
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
  // grillhouse-3dr.2.3: a project of TypeScript declares its language.
  'package.json': '{"name":"p","grillhouse":{"langages":["typescript"],"version":"0.24.5"}}',
  'packages/b/package.json': '{"name":"@demo/b"}',
  'packages/a/package.json': '{"name":"@demo/a"}',
  'packages/c/package.json': '{"name":"@demo/c"}',
  'packages/a/src/index.ts': "import { duree } from '@demo/b';",
};
const PROSE = '- `c` : le script lit `duree` à l’exécution';
const PERIME = {
  ...BASE,
  'packages/b/docs/INTERFACE.md': INTERFACE(`- \`a\` : duree\n${PROSE}`),
};
const LIGNES = [
  `packages/b/docs/INTERFACE.md § Consommateurs : « ${PROSE} » n'est pas une liste de noms`,
  'la garde des consommateurs refuse désormais ces lignes (1 en tout) : `npm run grillhouse:dette:inscrire` les inscrit dans grillhouse-dette.json, la dette connue du projet, ou chaque ligne s’écrit en liste de noms (- `consommateur` : nom, nom)',
];

describe('migration 0.24.6 — the lines of consumers that are no list of names', () => {
  it('is the migration of 0.24.6, « lignes de consommateurs mal formées »', () => {
    expect(version).toBe('0.24.6');
    expect(nom).toBe('lignes de consommateurs mal formées');
  });

  it('critère 3 — names each line the guard refuses, and the command that inscribes the debt', () => {
    expect(restes(projet(PERIME))).toEqual(LIGNES);
  });

  it('critère 3 — the update of a project at 0.24.5 reports them', () => {
    expect(restesAuProjet(projet(PERIME), '0.24.5')).toContainEqual({
      version: '0.24.6',
      nom: 'lignes de consommateurs mal formées',
      lignes: LIGNES,
    });
  });

  it('critère 3 — writes nothing, and says nothing once the debt holds them or the line is a list', () => {
    const p = projet(PERIME);
    const avant = readdirSync(p);
    expect(migrer(p)).toEqual([]);
    expect(readdirSync(p)).toEqual(avant);
    const dette = {
      consommateurs: {
        'packages/b/docs/INTERFACE.md': { 'ligne-mal-formee': { count: 1 } },
      },
    };
    expect(restes(projet({ ...PERIME, 'grillhouse-dette.json': JSON.stringify(dette) }))).toEqual(
      []
    );
    const propre = projet({
      ...BASE,
      'packages/b/docs/INTERFACE.md': INTERFACE('- `a` : duree'),
    });
    expect(restes(propre)).toEqual([]);
  });
});
