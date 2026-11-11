import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lireSarif, RESULTATS } from '../../scripts/resultats.mjs';

// A night test: a real guard of the frame, run as a process on a trial project, notes « to
// inscribe » when the guards of the base (GRILLHOUSE_GARDES_DE_LA_BASE) do not hold it.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dette-neuve-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const BASE = 'GRILLHOUSE_GARDES_DE_LA_BASE';
const GARDE = path.resolve(__dirname, '../../scripts/langages/typescript/consommateurs.mjs');
type Constat = { garde: string; fichier: string; regle: string; genre: string; trouve?: number };

describe('le constat d’une garde que le lot ajoute', () => {
  it('is noted by a real guard of the frame the base does not hold, and refused as before', () => {
    const dir = mkdtempSync(path.join(ESSAIS, 'depot-'));
    for (const [rel, texte] of Object.entries({
      'packages/b/package.json': '{"name":"@d/b"}',
      'packages/b/src/index.ts': 'export const duree = 1;\n',
      'packages/b/docs/INTERFACE.md': '# b\n\nB.\n',
      'packages/a/package.json': '{"name":"@d/a"}',
      'packages/a/src/index.ts': "import { duree } from '@d/b';\n",
    })) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), texte);
    }
    const lancer = (base: string[]) => {
      const resultats = path.join(dir, `resultats-${base.length}`);
      const env = {
        ...process.env,
        [RESULTATS as string]: resultats,
        [BASE]: JSON.stringify(base),
      };
      delete env.GRILLHOUSE_DETTE;
      const r = spawnSync('node', [GARDE], { cwd: dir, encoding: 'utf8', env });
      const lus = (lireSarif(resultats) as { constats: Constat[] }).constats;
      return { status: r.status, inscrire: lus.filter(k => k.genre === 'a-inscrire') };
    };
    const neuve = lancer(['autre']);
    expect(neuve.status).toBe(1);
    expect(neuve.inscrire).toEqual([
      expect.objectContaining({
        garde: 'consommateurs',
        fichier: 'packages/b/docs/INTERFACE.md',
        regle: 'usage-non-declare',
        trouve: 1,
      }),
    ]);
    const deMain = lancer(['autre', 'consommateurs']);
    expect(deMain.status).toBe(1);
    expect(deMain.inscrire).toEqual([]);
  });
});
