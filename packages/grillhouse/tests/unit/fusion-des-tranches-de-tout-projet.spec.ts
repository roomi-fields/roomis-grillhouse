// The merge of the tranches of a pass exists in every project (`grillhouse fusion-des-tranches`,
// the last step of the frame's ci.yml and nuit.yml): the module of a language that writes reports
// of its tranches describes it (typescript: Vitest's blobs and the files of each part), and a
// project none of whose modules describes it (cargo alone, python alone, c alone) has it all the
// same, by the composed command, which finds no module to play and is green: nextest splits by
// itself and writes no report to merge, pytest and CTest play in the first tranche alone, and a
// red of theirs is the red of its tranche's job.
//
// Small tests: the table of the subcommands and the composed command, by import; no process runs.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { jouer } from '../../scripts/commandes-composees.mjs';
import type { Langage } from '../../scripts/jointure.js';
import { langagesDe } from '../../scripts/langages.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';
import { commandeDe, sousCommandes } from '../../scripts/sous-commandes.mjs';

const FUSION = 'fusion-des-tranches';
const COMPOSEES = path.resolve(__dirname, '../../scripts/commandes-composees.mjs');
const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'fusion-de-tout-projet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project whose one language is <langage>, declared for its folder « moteur ».
function projet(langage: string) {
  const racine = mkdtempSync(path.join(ESSAIS, `${langage}-`));
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify({ name: 'p', private: true }));
  declarerLesLangages(racine, { moteur: langage });
  return racine;
}

describe.each(['cargo', 'python', 'c'])('in a project of %s alone', langage => {
  it('the merge of the tranches is a subcommand, the composed command by its name', () => {
    const racine = projet(langage);
    expect(langagesDe(racine).map(m => m.nom)).toEqual([langage]);
    expect(Object.keys(sousCommandes(racine))).toContain(FUSION);
    expect(commandeDe(FUSION, racine)).toEqual({ script: COMPOSEES, args: [FUSION] });
  });

  it('no module has a report to merge: nothing plays, green, said in one line', () => {
    const racine = projet(langage);
    const dites: string[] = [];
    expect(jouer(FUSION, [], { racine, dire: l => dites.push(l) })).toBe(0);
    expect(dites).toHaveLength(1);
    expect(dites[0]).toContain(FUSION);
    expect(dites[0]).toContain('rien à jouer');
  });
});

describe('in a project of several languages without typescript (cargo and python)', () => {
  // Two folders, one per language.
  function projetMixte() {
    const racine = mkdtempSync(path.join(ESSAIS, 'mixte-'));
    writeFileSync(path.join(racine, 'package.json'), JSON.stringify({ name: 'p', private: true }));
    declarerLesLangages(racine, { moteur: 'cargo', outils: 'python' });
    return racine;
  }

  it('the merge of the tranches is a subcommand, the composed command by its name', () => {
    const racine = projetMixte();
    expect(langagesDe(racine).map(m => m.nom)).toEqual(['cargo', 'python']);
    expect(Object.keys(sousCommandes(racine))).toContain(FUSION);
    expect(commandeDe(FUSION, racine)).toEqual({ script: COMPOSEES, args: [FUSION] });
  });

  it('no module has a report to merge: nothing plays, green, said in one line', () => {
    const racine = projetMixte();
    const dites: string[] = [];
    expect(jouer(FUSION, [], { racine, dire: l => dites.push(l) })).toBe(0);
    expect(dites).toHaveLength(1);
    expect(dites[0]).toContain(FUSION);
    expect(dites[0]).toContain('rien à jouer');
  });
});

describe('in a project of typescript', () => {
  it('the merge of the tranches stays the command of the module, its own script', () => {
    const c = (typescript as unknown as Langage).commandes(DEPOT)[FUSION];
    expect(path.basename(c?.script ?? '')).toBe('tranches.mjs');
    expect(commandeDe(FUSION, DEPOT)).toEqual(c);
  });
});

describe('a command no project has', () => {
  it('stays unknown, in a project of cargo alone as elsewhere', () => {
    expect(commandeDe('inconnue', projet('cargo'))).toBeNull();
    expect(commandeDe('inconnue', DEPOT)).toBeNull();
  });
});
