// A plan the explorateur writes again keeps the packages the supervisor gave the plan
// (`--etendre`): his word on the plan stands until he changes it.
// Witness: SyntHub SH-ae6.6.1 under 0.40.0: the supervisor extended the plan to « . » after a stop
// « hors-plan » on docs/ARCHITECTURE.md; the responsable then changed the description, the
// explorateur wrote the plan again (service, interface, synthhub-site), « . » gone, and the
// developpeur met the same file out of the plan: a second `--etendre .`, a session lost.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as circuit from '../../scripts/circuit.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'plan-garde-les-etendus-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Effet = { genre: string; texte?: string } & Record<string, unknown>;
interface Ctx {
  ticket: string;
  racine: string;
  copie: string;
  fiches: string;
  rendus: Effet[];
}
const avecLesEtendus = circuit.avecLesEtendus as (ctx: Ctx, paquets: string[]) => string[];

// A project of TypeScript whose package a imports its package b, and the context of demo-1 on it,
// its sheets <fiches> (one per line).
function ctx(fiches: object[]): Ctx {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [rel, texte] of Object.entries({
    'package.json': JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }),
    'docs/ARCHITECTURE.md': architecture(),
    'packages/a/package.json': JSON.stringify({
      name: '@essai/a',
      dependencies: { '@essai/b': '*' },
    }),
    'packages/a/src/index.ts': "import { b } from '@essai/b';\nexport const a = b;\n",
    'packages/b/package.json': JSON.stringify({ name: '@essai/b' }),
    'packages/b/src/index.ts': 'export const b = 1;\n',
    'fiches.jsonl': fiches.map(f => JSON.stringify(f)).join('\n'),
  })) {
    mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    writeFileSync(path.join(racine, rel), texte);
  }
  return {
    ticket: 'demo-1',
    racine,
    copie: racine,
    fiches: path.join(racine, 'fiches.jsonl'),
    rendus: [],
  };
}
const etendu = (...etendus: string[]) => ({ role: 'circuit', plan: { empreinte: 'e', etendus } });

describe('un plan réécrit garde les paquets que le superviseur lui a donnés', () => {
  it('a package the supervisor gave and the new plan leaves out comes back, said at the ticket', () => {
    const c = ctx([etendu('.')]);
    expect(avecLesEtendus(c, ['packages/a'])).toEqual(['packages/a', '.']);
    expect(c.rendus.map(e => e.texte)).toEqual([
      'Circuit · plan : le plan garde ., que le superviseur lui a donné (`--etendre`).',
    ]);
  });

  it('it comes back in its order: before the first package of the plan that reads it', () => {
    const c = ctx([etendu('packages/b')]);
    expect(avecLesEtendus(c, ['packages/a'])).toEqual(['packages/b', 'packages/a']);
  });

  it('a package the new plan already holds, and a plan no extension touched, stay as they are', () => {
    const tenu = ctx([etendu('packages/b'), etendu('packages/b', 'packages/a')]);
    expect(avecLesEtendus(tenu, ['packages/b', 'packages/a'])).toEqual([
      'packages/b',
      'packages/a',
    ]);
    expect(tenu.rendus).toEqual([]);
    const sans = ctx([
      { role: 'circuit', plan: { empreinte: 'e' } },
      { role: 'explorateur', fiche: {} },
    ]);
    expect(avecLesEtendus(sans, ['packages/a'])).toEqual(['packages/a']);
    expect(sans.rendus).toEqual([]);
  });
});
