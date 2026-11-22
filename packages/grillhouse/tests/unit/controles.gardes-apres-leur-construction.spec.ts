// Aux contrôles du plan (3.1), une garde ne part pas avant la construction de ce qu'elle lit : la
// commande qui joue ce que les tâches de gardes attendent dans le graphe (`grillhouse construire
// --gardes`) précède les gardes du cadre et celles du projet, une fois, et ne joue pas dans un
// projet sans script de gardes. Joué sur l'espace cargo d'essai, contre le faux cargo.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import exemples from '../../scripts/langages/cargo/exemples.mjs';
import * as ticketDuCircuit from '../../scripts/ticket-du-circuit.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const commandesDuPlan = activites.commandesDuPlan as (
  ctx: object,
  liste: object[],
  seuls?: string[] | null
) => { args: string[]; env?: Record<string, string> }[];
const composantsDe = (ticketDuCircuit as unknown as { composantsDe: (r: string) => object[] })
  .composantsDe;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-gardes-construites-'));
let restaurer = () => {};
let espace: string;
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  espace = (exemples.preparer(ESSAIS) as { depots: { espace: string } }).depots.espace;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());

// La racine de l'espace d'essai porte les scripts <scripts>.
function poserLesScripts(scripts: Record<string, string>) {
  writeFileSync(
    path.join(espace, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, scripts })
  );
}

function commandes(seuls: string[] | null = null) {
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  const ctx = {
    racine: espace,
    copie: espace,
    ticket: 'demo-1',
    paquets: ['crates/core'],
    ecartes: [],
    tmp,
    journal: path.join(tmp, 'journal'),
    fiches: path.join(tmp, 'fiches.jsonl'),
    base: { dossier: tmp },
  };
  return commandesDuPlan(ctx, composantsDe(espace), seuls);
}

const CONSTRUCTION = ['exec', '--no', '--', 'grillhouse', 'construire', '--gardes'];

describe('aux contrôles, les gardes jouent après la construction de ce qu’elles lisent', () => {
  it('la construction que les gardes attendent précède les gardes du cadre et celles du projet', () => {
    poserLesScripts({ 'grillhouse:gardes': 'grillhouse gardes-du-cadre', gardes: 'node g.mjs' });
    expect(commandes().map(c => c.args)).toEqual([
      ['test', '--', 'crates/core'],
      CONSTRUCTION,
      ['run', 'grillhouse:gardes'],
      ['run', 'gardes'],
    ]);
  });

  it('la construction joue hors de l’enveloppe du plan, que seules les gardes reçoivent', () => {
    poserLesScripts({ 'grillhouse:gardes': 'grillhouse gardes-du-cadre', gardes: 'node g.mjs' });
    expect(commandes().map(c => Object.keys(c.env ?? {}))).toEqual([
      [],
      [],
      ['GRILLHOUSE_ENVELOPPE'],
      ['GRILLHOUSE_ENVELOPPE'],
    ]);
  });

  it('les gardes du projet seules attendent leur construction aussi', () => {
    poserLesScripts({ gardes: 'node g.mjs' });
    expect(commandes().map(c => c.args)).toEqual([
      ['test', '--', 'crates/core'],
      CONSTRUCTION,
      ['run', 'gardes'],
    ]);
  });

  it('une reprise sur des tests nommés construit avant ses gardes', () => {
    poserLesScripts({ gardes: 'node g.mjs' });
    expect(commandes(['crates/core/tests/integ.rs']).map(c => c.args)).toEqual([
      ['test', '--', 'crates/core/tests/integ.rs'],
      CONSTRUCTION,
      ['run', 'gardes'],
    ]);
  });

  it('un projet sans script de gardes ne construit rien pour elles', () => {
    poserLesScripts({});
    expect(commandes().map(c => c.args)).toEqual([['test', '--', 'crates/core']]);
  });
});
