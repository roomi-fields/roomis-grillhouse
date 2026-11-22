// Les contrôles (`controles`, scripts/activites.mjs) devant un paquet lecteur — écarté du relevé ou
// hors du titre — dont les tests rougissent : quand chaque lieu rouge du paquet est un fichier de
// test, le relevé le nomme dans `testsLecteurs` (ses dossiers) et ne le compte ni hors du titre ni
// parmi les écartés rouges ; un lieu qui est un fichier de code garde le paquet hors du plan comme
// avant. Joué contre un faux npm, sur une copie de deux paquets (forms, du plan, et lecteur).
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { copieEssai, type Ctx } from './preuve-essai.js';

type Essai = Ctx & { ecartes: string[] };
interface Lieu {
  fichier: string | null;
}
interface Releve {
  rouge: boolean;
  auDeveloppeur: boolean;
  horsTitre: string[];
  ecartesRouges: string[];
  testsLecteurs: string[];
  lieux: Lieu[];
}
const controles = activites.controles as (ctx: Essai, finale: boolean) => Releve;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-tests-lecteur-'));
const avant = { PATH: process.env.PATH };
beforeAll(() => {
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const d = process.env.GRILLHOUSE_RESULTATS;
if (d && process.env.FAUX_NPM_RAPPORT) {
  fs.mkdirSync(path.join(d, 'vitest'), { recursive: true });
  fs.writeFileSync(path.join(d, 'vitest', 'rapport.json'), process.env.FAUX_NPM_RAPPORT);
}
process.exit(Number(process.env.FAUX_NPM_CODE || 0));
`
  );
  chmodSync(npm, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
});
afterAll(() => {
  process.env.PATH = avant.PATH;
  delete process.env.FAUX_NPM_RAPPORT;
  delete process.env.FAUX_NPM_CODE;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const TEST = 'packages/lecteur/tests/lecteur.test.mjs';
const AUTRE_TEST = 'packages/lecteur/tests/autre.test.mjs';
const CODE = 'packages/lecteur/src/lecteur.mjs';

// Une copie où forms est au plan, lecteur un paquet que le plan n'a pas, écarté du relevé si
// <ecartes>.
function copie(ecartes: string[]): Essai {
  const ctx = copieEssai(ESSAIS);
  declarerLesLangages(ctx.copie, {
    'packages/forms': 'typescript',
    'packages/lecteur': 'typescript',
  });
  for (const [nom, dossier] of [
    ['000-forms', 'packages/forms'],
    ['010-lecteur', 'packages/lecteur'],
  ]) {
    mkdirSync(path.join(ctx.copie, dossier, 'tests'), { recursive: true });
    mkdirSync(path.join(ctx.copie, dossier, 'src'), { recursive: true });
    writeFileSync(
      path.join(ctx.copie, dossier, 'package.json'),
      JSON.stringify({ name: nom, type: 'module', scripts: { 'test:unit': 'vitest run' } })
    );
  }
  for (const f of [TEST, AUTRE_TEST, CODE]) {
    writeFileSync(path.join(ctx.copie, f), '// HEAD\n');
  }
  const git = (...a: string[]) =>
    spawnSync('git', ['-C', ctx.copie, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('add', '-A');
  git('commit', '-q', '-m', 'le lecteur');
  return { ...ctx, paquets: ['packages/forms'], ecartes };
}

// Le rapport de Vitest où chaque fichier de <rouges> a un test rouge.
const rapport = (c: Ctx, rouges: string[]) =>
  JSON.stringify({
    testResults: rouges.map(fichier => ({
      name: path.join(c.copie, fichier),
      status: 'failed',
      message: '',
      assertionResults: [
        {
          title: 'lit le type',
          fullName: 'le lecteur lit le type',
          status: 'failed',
          failureMessages: ['TypeError: le type a changé'],
        },
      ],
    })),
  });

function jouer(c: Essai, rouges: string[], finale = true) {
  process.env.FAUX_NPM_RAPPORT = rapport(c, rouges);
  process.env.FAUX_NPM_CODE = '1';
  return controles(c, finale);
}

describe.each([
  ['écarté du relevé', ['packages/lecteur']],
  ['hors du titre', []],
])('un lecteur %s dont des tests rougissent', (_nom, ecartes) => {
  it('dont chaque lieu rouge est un fichier de test : le relevé le nomme, sans arrêt ni écarté rouge', () => {
    const c = copie(ecartes);
    const r = jouer(c, [TEST, AUTRE_TEST]);
    expect(r.testsLecteurs).toEqual(['packages/lecteur']);
    expect(r.horsTitre).toEqual([]);
    expect(r.ecartesRouges).toEqual([]);
    expect(r.auDeveloppeur).toBe(true);
  });

  it('aux contrôles de 3.1 comme à la passe finale', () => {
    const c = copie(ecartes);
    expect(jouer(c, [TEST], false).testsLecteurs).toEqual(['packages/lecteur']);
  });

  it('dont un lieu rouge est un fichier de code : rien n’est étendu, le paquet reste hors du plan', () => {
    const c = copie(ecartes);
    const r = jouer(c, [TEST, CODE]);
    expect(r.testsLecteurs).toEqual([]);
    if (ecartes.length) {
      expect(r.ecartesRouges).toEqual(['packages/lecteur']);
    } else {
      expect(r.horsTitre).toEqual(['010-lecteur']);
    }
  });

  it('dont le seul lieu rouge est un fichier de code : rien n’est étendu', () => {
    const c = copie(ecartes);
    expect(jouer(c, [CODE]).testsLecteurs).toEqual([]);
  });
});

describe('un lecteur déjà étendu aux tests (`ctx.testsEtendus`, ses dossiers)', () => {
  it('n’est plus nommé : ses tests rouges comptent comme du plan, sans nouvelle extension', () => {
    const c = { ...copie([]), testsEtendus: ['packages/lecteur'] };
    const r = jouer(c, [TEST]);
    expect(r.testsLecteurs).toEqual([]);
    expect(r.horsTitre).toEqual([]);
    expect(r.ecartesRouges).toEqual([]);
    expect(r.auDeveloppeur).toBe(true);
  });

  it('son code rouge reste hors du plan, le circuit ne l’étend pas', () => {
    const c = { ...copie([]), testsEtendus: ['packages/lecteur'] };
    const r = jouer(c, [CODE]);
    expect(r.testsLecteurs).toEqual([]);
    expect(r.horsTitre).toEqual(['010-lecteur']);
  });
});

describe('un paquet du plan rouge ne nomme aucun lecteur à étendre aux tests', () => {
  it('le rouge d’un fichier de test du plan laisse la liste vide', () => {
    const c = copie([]);
    const r = jouer(c, ['packages/forms/tests/forms.test.mjs']);
    expect(r.testsLecteurs).toEqual([]);
  });

  it('un lecteur de tests rouges et un paquet hors du plan de code rouge : les tests entrent, le code reste dehors', () => {
    const c = copie([]);
    mkdirSync(path.join(c.copie, 'packages/code/src'), { recursive: true });
    writeFileSync(
      path.join(c.copie, 'packages/code/package.json'),
      JSON.stringify({ name: '020-code', type: 'module' })
    );
    declarerLesLangages(c.copie, {
      'packages/forms': 'typescript',
      'packages/lecteur': 'typescript',
      'packages/code': 'typescript',
    });
    const r = jouer(c, [TEST, 'packages/code/src/code.mjs']);
    expect(r.testsLecteurs).toEqual(['packages/lecteur']);
    expect(r.horsTitre).toEqual(['020-code']);
  });
});
