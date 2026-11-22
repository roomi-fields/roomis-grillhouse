// What the checks of the plan judge (scripts/activites.mjs, `controles`, 3.1): only the packages of
// the plan. A red in a package out of the plan is not the developpeur's: the checks stay green
// for his lot, say that they leave it to the final pass, and name it in their report, which the
// final pass then sends up when it still sees it. Played on a trial cargo workspace (ws-core and
// ws-app play tests), against a fake cargo and a fake npm that notes its commands.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import exemples from '../../scripts/langages/cargo/exemples.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

interface Controles {
  rouge: boolean;
  auDeveloppeur: boolean;
  horsTitre: string[];
  resume: string;
  texte: string;
  rouges: { paquet: string; texte: string }[];
  tous: { dansLePlan: boolean; horsTitre: string | null }[];
}
const controles = activites.controles as (ctx: object, finale: boolean) => Controles;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-hors-plan-'));
let restaurer = () => {};
let espace: string;
const avant = { PATH: process.env.PATH };
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  espace = (exemples.preparer(ESSAIS) as { depots: { espace: string } }).depots.espace;
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const d = process.env.GRILLHOUSE_RESULTATS;
const s = JSON.parse(process.env.FAUX_NPM_RESULTATS || '{}');
if (d && s.taches) {
  fs.mkdirSync(path.join(d, 'cargo'), { recursive: true });
  fs.writeFileSync(path.join(d, 'cargo', 'run.json'), JSON.stringify({ taches: s.taches, cibles: {} }));
}
process.exit(Number(process.env.FAUX_NPM_CODE || 1));
`
  );
  chmodSync(npm, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => {
  process.env.PATH = avant.PATH;
  delete process.env.FAUX_NPM_RESULTATS;
  delete process.env.FAUX_NPM_CODE;
  restaurer();
});

const tache = (paquet: string, dossier: string) => ({
  tache: `${paquet}#nextest`,
  paquet,
  dossier,
  script: 'nextest',
  tests: true,
  code: 1,
  cache: null,
  journal: null,
});

function jouer(paquets: string[], taches: object[], finale: boolean) {
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  process.env.FAUX_NPM_CODE = '1';
  process.env.FAUX_NPM_RESULTATS = JSON.stringify({ taches });
  return controles(
    {
      racine: espace,
      copie: espace,
      ticket: 'demo-1',
      paquets,
      ecartes: [],
      tmp,
      journal: path.join(tmp, 'journal'),
      fiches: path.join(tmp, 'fiches.jsonl'),
      base: { dossier: tmp },
    },
    finale
  );
}

describe('un rouge hors du plan aux contrôles du plan', () => {
  let c: Controles;
  beforeAll(() => {
    c = jouer(['crates/core'], [tache('ws-app', 'crates/app')], false);
  });

  it('ne rend pas le lot rouge : aucun rouge du plan, rien pour le développeur', () => {
    expect(c.rouge).toBe(false);
    expect(c.auDeveloppeur).toBe(false);
    expect(c.rouges).toEqual([]);
  });

  it('dit dans son résumé qu’il laisse le rouge à la passe finale', () => {
    expect(c.resume).toContain('laissés à la passe finale, 1 rouge(s) hors du plan');
    expect(c.resume.startsWith('verts')).toBe(true);
  });

  it('le nomme dans le rapport, sous « Laissés à la passe finale »', () => {
    expect(c.texte).toContain('Laissés à la passe finale (1) :');
  });

  it('un rouge du plan, à côté, reste le sien et le rouge hors du plan reste laissé', () => {
    const mixte = jouer(
      ['crates/core'],
      [tache('ws-core', 'crates/core'), tache('ws-app', 'crates/app')],
      false
    );
    expect(mixte.rouge).toBe(true);
    expect(mixte.auDeveloppeur).toBe(true);
    expect(mixte.rouges).toHaveLength(1);
    expect(mixte.texte).toContain('Laissés à la passe finale (1) :');
  });
});

describe('le même rouge hors du plan à la passe finale', () => {
  it('rend le lot rouge, le paquet nommé hors du titre : la passe finale le monte', () => {
    const c = jouer(['crates/core'], [tache('ws-app', 'crates/app')], true);
    expect(c.rouge).toBe(true);
    expect(c.auDeveloppeur).toBe(false);
    expect(c.horsTitre).toEqual(['ws-app']);
  });
});
