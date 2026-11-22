// L'extension du plan aux tests d'un paquet lecteur (le fait `etendreAuxTests`, que le circuit joue) :
// le plan du titre ne change pas, la liste `testsEtendus` se garde parmi les fiches du circuit
// (`testsEtendusDuPlan`) comme `etendus`, et la pièce au ticket dit le paquet, les fichiers de test
// rouges et la raison de l'écart que le rouge dément. Un plan réécrit ou repris la garde.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as circuit from '../../scripts/circuit.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'extension-tests-lecteur-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Effet = { genre: string; texte?: string } & Record<string, unknown>;
interface Ctx {
  ticket: string;
  racine: string;
  copie: string;
  fiches: string;
  rendus: Effet[];
  paquets: string[];
  ecartes: string[];
  testsEtendus?: string[];
  resoudre: (p: string) => string;
}
const lireLeFait = circuit.lireLeFait as (
  ctx: Ctx,
  fait: string,
  parametres: object,
  faits: object
) => Promise<unknown>;
const testsEtendusDuPlan = circuit.testsEtendusDuPlan as (ctx: Ctx, paquets: string[]) => string[];

const circuitFiche = (testsEtendus: string[]) => ({
  role: 'circuit',
  plan: { empreinte: 'e', testsEtendus },
});
const ecartes = (...composants: string[]) => ({
  role: 'explorateur',
  fiche: { ecartes: composants.map(composant => ({ composant, raison: 'inchangé' })) },
});

function ctx(fiches: object[], paquets = ['packages/a']): Ctx {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [rel, texte] of Object.entries({
    'package.json': JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }),
    'docs/ARCHITECTURE.md': architecture(),
    'packages/a/package.json': JSON.stringify({ name: '@essai/a' }),
    'packages/b/package.json': JSON.stringify({ name: '@essai/b' }),
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
    paquets,
    ecartes: [],
    resoudre: p => (p.startsWith('packages/') ? p : `packages/${p}`),
  };
}
const rouges = [
  { texte: 'lit le type — packages/b/tests/b.test.ts : TypeError', ecarte: 'packages/b' },
];

describe('le circuit étend le plan aux tests d’un lecteur, sa pièce au ticket', () => {
  it('garde le titre du plan : le paquet n’entre pas au plan, seuls ses tests entrent', async () => {
    const c = ctx([]);
    await lireLeFait(c, 'etendreAuxTests', { composants: ['packages/b'], rouges }, {});
    expect(c.paquets).toEqual(['packages/a']);
    expect(c.testsEtendus).toEqual(['packages/b']);
  });

  it('dit au ticket le paquet, ses fichiers de test rouges et, pour un écarté, la raison que le rouge dément', async () => {
    const c = ctx([ecartes('packages/b')]);
    c.ecartes = ['packages/b'];
    await lireLeFait(c, 'etendreAuxTests', { composants: ['packages/b'], rouges }, {});
    const texte = c.rendus.map(e => e.texte).join('\n');
    expect(texte).toContain('packages/b');
    expect(texte).toContain('packages/b/tests/b.test.ts');
    expect(texte).toContain('inchangé');
  });

  it('un lecteur hors du titre, que le plan n’a pas écarté, est dit sans raison d’écart', async () => {
    const c = ctx([]);
    await lireLeFait(c, 'etendreAuxTests', { composants: ['packages/b'], rouges }, {});
    const texte = c.rendus.map(e => e.texte).join('\n');
    expect(texte).toContain('packages/b');
    expect(texte).toContain('tests');
  });

  it('inscrit la liste parmi les fiches du circuit, que `testsEtendusDuPlan` relit', async () => {
    const c = ctx([]);
    await lireLeFait(c, 'etendreAuxTests', { composants: ['packages/b'], rouges }, {});
    const fiche = c.rendus.find(e => e.genre === 'fiche') as
      { entree?: { plan?: { testsEtendus?: string[] } } } | undefined;
    expect(fiche?.entree?.plan?.testsEtendus).toEqual(['packages/b']);
    expect(testsEtendusDuPlan(c, ['packages/a'])).toEqual(['packages/b']);
  });

  it('un paquet déjà étendu aux tests n’est pas étendu de nouveau', async () => {
    const c = ctx([circuitFiche(['packages/b'])]);
    c.testsEtendus = ['packages/b'];
    await lireLeFait(c, 'etendreAuxTests', { composants: ['packages/b'], rouges }, {});
    expect(c.rendus).toEqual([]);
  });
});

describe('un plan réécrit ou repris garde les tests étendus', () => {
  it('la liste des fiches du circuit revient telle quelle', () => {
    expect(testsEtendusDuPlan(ctx([circuitFiche(['packages/b'])]), ['packages/a'])).toEqual([
      'packages/b',
    ]);
  });

  it('un paquet que le nouveau plan tient lui-même sort de la liste', () => {
    expect(
      testsEtendusDuPlan(ctx([circuitFiche(['packages/b'])]), ['packages/a', 'packages/b'])
    ).toEqual([]);
  });

  it('sans extension aux tests, la liste est vide', () => {
    expect(testsEtendusDuPlan(ctx([]), ['packages/a'])).toEqual([]);
  });
});
