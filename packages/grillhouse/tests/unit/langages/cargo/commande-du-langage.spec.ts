// grillhouse-pkl.5 — the one point by which the launcher and the night play a step of the module
// of the project's language (scripts/commande-du-langage.mjs): the command runs when the module
// describes it; a project that declares no language, or whose module does not describe it, plays
// nothing, exit 0. Against the fake cargo (./faux-cargo.ts), whose journal lists the calls.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lancerDuLangage } from '../../../../scripts/commande-du-langage.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'commande-du-langage-'));
const JOURNAL = path.join(ESSAIS, 'journal');
let restaurer = () => {};
let seul = '';
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
  seul = (exemples.preparer(ESSAIS) as { depots: { seul: string } }).depots.seul;
  writeFileSync(
    path.join(seul, 'package.json'),
    JSON.stringify({ name: 'seul', grillhouse: { langages: ['cargo'] } })
  );
});
afterAll(() => {
  restaurer();
  rmSync(ESSAIS, { recursive: true, force: true });
});
beforeEach(() => writeFileSync(JOURNAL, ''));
const appels = () => readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean);

describe('grillhouse-pkl.5 — une commande du module, quand il la décrit', () => {
  it('runs a command the module describes, its code the command’s', () => {
    expect(lancerDuLangage('preparer', [], seul)).toBe(0);
    expect(appels()).toEqual(['fetch --locked']);
  });

  it('plays nothing for a command the module does not describe', () => {
    expect(lancerDuLangage('tests-de-nuit', [], seul)).toBe(0);
    expect(appels()).toEqual([]);
  });

  it('plays nothing in a project that declares no language', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'sans-langage-'));
    writeFileSync(path.join(projet, 'package.json'), JSON.stringify({ name: 'p' }));
    expect(lancerDuLangage('preparer', [], projet)).toBe(0);
    expect(appels()).toEqual([]);
  });
});
