// A path of `grillhouse.groupe` that leads to no project of the frame (a package.json that
// declares @roomi-fields/grillhouse) is signalled, its key and the path named: by the reading of
// the key (`signalementsDuGroupe`) and by an alert of the board.
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { signalementsDuGroupe } from '../../scripts/groupe-cles.mjs';
import { tableau } from '../../scripts/tableau.mjs';
import { aucunCircuit } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'groupe-signale-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

const ecrirePaquet = (d: string, paquet: object) => {
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, 'package.json'), JSON.stringify(paquet));
};
const DU_CADRE = { devDependencies: { '@roomi-fields/grillhouse': '^0.50.0' } };

// A project `osc-bridge` whose group is <groupe>, beside the project of the frame `synthhub` and
// a folder `autre` that is none.
function voisinage(groupe: unknown) {
  const base = mkdtempSync(path.join(ESSAIS, 'voisinage-'));
  const racine = path.join(base, 'osc-bridge');
  ecrirePaquet(racine, { ...DU_CADRE, grillhouse: { groupe } });
  ecrirePaquet(path.join(base, 'synthhub'), DU_CADRE);
  ecrirePaquet(path.join(base, 'autre'), { name: 'autre' });
  return { base, racine };
}

describe('the paths of the group that lead to no project of the frame', () => {
  it('none while every path leads to one', () => {
    expect(signalementsDuGroupe(voisinage(['.', '../synthhub']).racine)).toEqual([]);
  });

  it('a neighbour renamed since the key was written is signalled', () => {
    const { base, racine } = voisinage(['.', '../synthhub']);
    renameSync(path.join(base, 'synthhub'), path.join(base, 'synthub-server'));
    expect(signalementsDuGroupe(racine)).toEqual([
      { cle: 'grillhouse.groupe[1]', valeur: '"../synthhub"', motif: 'sans-projet', ignore: true },
    ]);
  });

  it('a folder that is no project of the frame is signalled, the group still read', () => {
    expect(signalementsDuGroupe(voisinage(['.', '../autre']).racine)).toEqual([
      { cle: 'grillhouse.groupe[1]', valeur: '"../autre"', motif: 'sans-projet', ignore: false },
    ]);
  });

  it('every faulty entry at once, each with its motive', () => {
    const { racine } = voisinage(['../absent', '../autre', '../synthhub', '../synthhub']);
    expect(signalementsDuGroupe(racine).map(s => [s.cle, s.motif])).toEqual([
      ['grillhouse.groupe[0]', 'sans-projet'],
      ['grillhouse.groupe[1]', 'sans-projet'],
      ['grillhouse.groupe[3]', 'refusee'],
    ]);
  });

  it('nothing without the key', () => {
    expect(signalementsDuGroupe(voisinage(undefined).racine)).toEqual([]);
  });
});

describe('the board signals them', () => {
  const alertes = async (racine: string, projets: string[] = []) => {
    const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
    writeFileSync(path.join(bin, 'bd'), "#!/bin/sh\necho '[]'\n", { mode: 0o755 });
    writeFileSync(path.join(bin, 'registre.jsonl'), '');
    vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
    vi.stubEnv('GRILLHOUSE_REGISTRE', path.join(bin, 'registre.jsonl'));
    const t = (await tableau(racine, {
      home: mkdtempSync(path.join(ESSAIS, 'home-')),
      projets,
      circuitsDe: aucunCircuit,
      nuitDe: () => Promise.resolve(null),
      ciDeMainDe: () => Promise.resolve(null),
    })) as unknown as { lignes: { texte: string }[] };
    return t.lignes.map(l => l.texte);
  };

  it('an alert names the key, and the path on the line below', async () => {
    const lignes = await alertes(voisinage(['.', '../synthub-absent']).racine);
    const i = lignes.findIndex(l => l.startsWith('⚠ grillhouse.groupe[1] : sans projet du cadre'));
    expect(i, lignes.join('\n')).toBeGreaterThan(-1);
    expect(lignes[i + 1]).toBe('  "../synthub-absent"');
  });

  it('a long path is cut by its head, its end kept', async () => {
    const long = `/absent/${'x'.repeat(80)}/synthhub`;
    const lignes = await alertes(voisinage([long]).racine);
    const ligne = lignes.find(l => l.endsWith('/synthhub"'));
    expect(ligne, lignes.join('\n')).toMatch(/^ {2}…x+\/synthhub"$/);
    expect(ligne!.length).toBeLessThanOrEqual(52);
  });

  it('on a board of several projects, the project at fault is named', async () => {
    const sain = voisinage(['.']).racine;
    const fautif = voisinage(['../absent']).racine;
    const lignes = await alertes(sain, [fautif]);
    const trouvees = lignes.filter(l => l.includes('grillhouse.groupe['));
    expect(trouvees, lignes.join('\n')).toHaveLength(1);
    expect(trouvees[0]).toMatch(/^⚠ \[[^\]]+\] grillhouse\.groupe\[0\]/);
  });

  it('no alert while the group is sound', async () => {
    const lignes = await alertes(voisinage(['.', '../synthhub']).racine);
    expect(lignes.join('\n')).not.toContain('grillhouse.groupe');
  });
});
