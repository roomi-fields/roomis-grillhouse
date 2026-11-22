// La preuve du rouge (`preuve`, scripts/activites.mjs) sur la mesure de ses tests : ce que la fiche
// du testwriter nomme (`portent_le_travail`) est un défaut s'il est vert avant le code, ce qu'elle
// ne nomme pas est accepté, un rouge reste un rouge, ce que main tient déjà vert (le registre des
// résultats) n'a rien à prouver, un fichier qui ne se charge pas ne prouve rien. Les cas jouent sur
// une mesure donnée à la preuve ; deux cas jouent la mesure elle-même (`mesureDeLaPreuve`) devant un
// faux npm.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  copieEssai,
  ficheNommant,
  mesureDe,
  preuve,
  registre,
  resultatDe,
  run,
  unTest,
  type Ctx,
} from './preuve-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preuve-mesure-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const FORME = 'forme.test.mjs';
const ANCIEN = 'ancien.test.mjs';
const NOMBRE = 'critère 1 — mesure rend un nombre';
const DOUBLE = 'critère 1 — mesure rend le double';
const lot = (...fichiers: string[]) =>
  Object.fromEntries(fichiers.map(f => [f, `// ${f}, du lot\n`]));

// The proof of the lot <c> whose file <fichier> played <tests>.
const jouer = (c: Ctx, fichier: string, tests: ReturnType<typeof unTest>[], code = 1) =>
  preuve(c, { mesure: mesureDe(c, [run(fichier, [resultatDe(c, fichier, tests)], code)]) });

describe('un vert avant le code que la fiche ne nomme pas', () => {
  it('est accepté sans raison, listé sous « Verts non nommés », le rouge portant la preuve', () => {
    const c = copieEssai(ESSAIS, lot(FORME), [{ role: 'testwriter', fiche: { statut: 'FAIT' } }]);
    const r = jouer(c, FORME, [unTest(DOUBLE, 'failed', 'attendu 4'), unTest(NOMBRE)]);
    expect(r.ok).toBe(true);
    expect(r.rouges).toBe(1);
    expect(r.texte).toContain('Verts non nommés (acceptés sans justification) (1) :');
    expect(r.texte).toContain(`- ${FORME} › ${NOMBRE}`);
    expect(r.texte).not.toContain('Tests qui portent le travail, verts avant le code');
  });
});

describe('un vert avant le code que la fiche nomme dans portent_le_travail', () => {
  it('est un défaut : la preuve est refusée, sous « Tests qui portent le travail, verts avant le code »', () => {
    const c = copieEssai(ESSAIS, lot(FORME), [ficheNommant([{ fichier: FORME, test: NOMBRE }])]);
    const r = jouer(c, FORME, [unTest(DOUBLE, 'failed', 'attendu 4'), unTest(NOMBRE)]);
    expect(r.ok).toBe(false);
    expect(r.resultat.sans).toBe(1);
    expect(r.texte).toContain('Tests qui portent le travail, verts avant le code (1) :');
    expect(r.texte).toContain(`- ${FORME} › ${NOMBRE}`);
    expect(r.texte).not.toContain('Verts non nommés');
  });

  it('est un défaut pour chaque vert d’un fichier que la fiche nomme entier, sans test', () => {
    const c = copieEssai(ESSAIS, lot(FORME), [ficheNommant([{ fichier: FORME }])]);
    const r = jouer(c, FORME, [unTest(DOUBLE, 'failed', 'attendu 4'), unTest(NOMBRE)]);
    expect(r.ok).toBe(false);
    expect(r.texte).toContain('Tests qui portent le travail, verts avant le code (1) :');
    expect(r.texte).toContain(`- ${FORME} › ${NOMBRE}`);
  });

  it('refuse le lot qui mêle un rouge et un vert nommé : le vert nommé est le défaut', () => {
    const c = copieEssai(ESSAIS, lot(FORME, ANCIEN), [
      ficheNommant([{ fichier: FORME, test: NOMBRE }]),
    ]);
    const r = preuve(c, {
      mesure: mesureDe(c, [
        {
          ...run(FORME, [
            resultatDe(c, FORME, [unTest(DOUBLE, 'failed', 'attendu 4'), unTest(NOMBRE)]),
            resultatDe(c, ANCIEN, [unTest('adapté — mesure rend un nombre')]),
          ]),
          groupe: [FORME, ANCIEN],
        },
      ]),
    });
    expect(r.ok).toBe(false);
    expect(r.rouges).toBe(1);
    expect(r.texte).toContain(`- ${FORME} › ${NOMBRE}`);
  });
});

describe('un fichier que la fiche nomme entier', () => {
  const ADAPTE = [
    unTest('adapté — mesure rend un nombre'),
    unTest('adapté — mesure rend un nombre fini'),
  ];

  it('rend défaut chacun de ses verts, même un fichier que main tient, dont les tests sont renommés', () => {
    const c = copieEssai(ESSAIS, lot(ANCIEN), [ficheNommant([{ fichier: ANCIEN }])]);
    const r = jouer(c, ANCIEN, ADAPTE, 0);
    expect(r.ok).toBe(false);
    expect(r.texte).toContain('Tests qui portent le travail, verts avant le code (2) :');
    expect(r.texte).toContain(`- ${ANCIEN} › adapté — mesure rend un nombre`);
    expect(r.texte).toContain(`- ${ANCIEN} › adapté — mesure rend un nombre fini`);
  });

  it('accepte sans raison le même fichier non nommé, mais sans rouge la preuve échoue', () => {
    const c = copieEssai(ESSAIS, lot(ANCIEN), [{ role: 'testwriter', fiche: { statut: 'FAIT' } }]);
    const r = jouer(c, ANCIEN, ADAPTE, 0);
    expect(r.ok).toBe(false);
    expect(r.texte).toContain('Verts non nommés (acceptés sans justification) (2) :');
    expect(r.texte).not.toContain('Tests qui portent le travail, verts avant le code');
  });

  it('laisse rouge un test rouge qu’il nomme : le fichier entier porte le travail', () => {
    const c = copieEssai(ESSAIS, lot(ANCIEN), [ficheNommant([{ fichier: ANCIEN, test: DOUBLE }])]);
    const r = jouer(c, ANCIEN, [...ADAPTE, unTest(DOUBLE, 'failed', 'attendu 4')]);
    expect(r.ok).toBe(true);
    expect(r.rouges).toBe(1);
    expect(r.texte).toContain(`- ${ANCIEN} › ${DOUBLE} —`);
    expect(r.texte).toContain('Verts non nommés (acceptés sans justification) (2) :');
  });
});

describe('un test rouge', () => {
  it('reste un rouge de la preuve, que la fiche le nomme ou non', () => {
    for (const fiches of [[], [ficheNommant([{ fichier: FORME, test: DOUBLE }])]]) {
      const c = copieEssai(ESSAIS, lot(FORME), fiches);
      const r = jouer(c, FORME, [unTest(DOUBLE, 'failed', 'attendu 4')]);
      expect(r.ok).toBe(true);
      expect(r.rouges).toBe(1);
      expect(r.texte).toContain(`- ${FORME} › ${DOUBLE} — attendu 4`);
      expect(r.resultat.sans).toBe(0);
    }
  });
});

describe('le nom complet d’un vert que la fiche nomme', () => {
  it('se lit pareil avec « › » ou « > » entre son groupe et son test', () => {
    const c = copieEssai(ESSAIS, lot(FORME), [
      ficheNommant([
        { fichier: FORME, test: `la forme › ${NOMBRE}` },
        { fichier: FORME, test: 'le signe > critère 1 — mesure de zéro rend zéro' },
      ]),
    ]);
    const r = jouer(c, FORME, [
      unTest(DOUBLE, 'failed', 'attendu 4'),
      unTest(`la forme › ${NOMBRE}`),
      unTest('le signe › critère 1 — mesure de zéro rend zéro'),
    ]);
    expect(r.ok).toBe(false);
    expect(r.resultat.sans).toBe(2);
    expect(r.texte).toContain('Tests qui portent le travail, verts avant le code (2) :');
  });

  it('se lit pareil avec un blanc seul, comme Vitest écrit le nom complet', () => {
    const c = copieEssai(ESSAIS, lot(FORME), [
      ficheNommant([{ fichier: FORME, test: `la forme ${NOMBRE}` }]),
    ]);
    const r = jouer(c, FORME, [
      unTest(DOUBLE, 'failed', 'attendu 4'),
      unTest(`la forme › ${NOMBRE}`),
    ]);
    expect(r.resultat.sans).toBe(1);
  });
});

describe('ce que main tient déjà vert, lu du registre des résultats', () => {
  const tenu = (c: Ctx) =>
    registre(c, [resultatDe(c, ANCIEN, [unTest('ancien — mesure rend un nombre')])]);

  it('n’est ni compté ni listé : seul le test ajouté au fichier est prouvé', () => {
    const c = copieEssai(ESSAIS, lot(ANCIEN), []);
    tenu(c);
    const r = jouer(c, ANCIEN, [
      unTest('ancien — mesure rend un nombre'),
      unTest(DOUBLE, 'failed', 'attendu 4'),
    ]);
    expect(r.ok).toBe(true);
    expect(r.rouges).toBe(1);
    expect(r.resultat.anciens).toBe(1);
    expect(r.resume).toContain('0 vert(s) non nommé(s)');
    expect(r.resume).toContain('1 test(s) vert(s) que HEAD tient déjà');
    expect(r.texte).not.toContain('› ancien — mesure rend un nombre');
  });

  it('n’est pas un défaut quand la fiche nomme le fichier entier : il n’a rien à prouver', () => {
    const c = copieEssai(ESSAIS, lot(ANCIEN), [ficheNommant([{ fichier: ANCIEN }])]);
    tenu(c);
    const r = jouer(c, ANCIEN, [
      unTest('ancien — mesure rend un nombre'),
      unTest(DOUBLE, 'failed', 'attendu 4'),
    ]);
    expect(r.ok).toBe(true);
    expect(r.resultat.sans).toBe(0);
  });

  it('ne suffit pas sans rouge : un lot qui ne fait que retrouver ce que main tient échoue', () => {
    const c = copieEssai(ESSAIS, lot(ANCIEN), []);
    tenu(c);
    const r = jouer(c, ANCIEN, [unTest('ancien — mesure rend un nombre')], 0);
    expect(r.ok).toBe(false);
    expect(r.resultat.anciens).toBe(1);
  });
});

describe('un fichier du lot qui ne se charge pas', () => {
  it('ne prouve rien : la preuve est refusée et nomme le fichier et son message', () => {
    const c = copieEssai(ESSAIS, lot(FORME), []);
    const r = preuve(c, {
      mesure: mesureDe(c, [
        run(FORME, [resultatDe(c, FORME, [], 'SyntaxError: Unexpected end of input')]),
      ]),
    });
    expect(r.ok).toBe(false);
    expect(r.resultat.casses).toBe(1);
    expect(r.texte).toContain('Fichiers qui ne prouvent rien (1) :');
    expect(r.texte).toContain(
      `- ${FORME} — ne se charge pas : SyntaxError: Unexpected end of input`
    );
  });

  it('reste refusé avec un rouge à côté : un fichier cassé n’est pas un rouge', () => {
    const c = copieEssai(ESSAIS, lot(FORME, 'casse.test.mjs'), []);
    const r = preuve(c, {
      mesure: mesureDe(c, [
        {
          ...run(FORME, [
            resultatDe(c, FORME, [unTest(DOUBLE, 'failed', 'attendu 4')]),
            resultatDe(c, 'casse.test.mjs', [], 'SyntaxError: accolade'),
          ]),
          groupe: [FORME, 'casse.test.mjs'],
        },
      ]),
    });
    expect(r.ok).toBe(false);
    expect(r.rouges).toBe(1);
    expect(r.resultat.casses).toBe(1);
  });
});

describe('la mesure de la preuve devant un faux npm', () => {
  const bin = path.join(ESSAIS, 'bin');
  const avant = { PATH: process.env.PATH };
  const journalNpm = path.join(ESSAIS, 'journal-npm');
  beforeAll(() => {
    mkdirSync(bin, { recursive: true });
    const npm = path.join(bin, 'npm');
    writeFileSync(
      npm,
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(process.env.FAUX_NPM_JOURNAL, process.argv.slice(2).join(' ') + '\\n');
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
    process.env.FAUX_NPM_JOURNAL = journalNpm;
  });
  afterAll(() => {
    process.env.PATH = avant.PATH;
    delete process.env.FAUX_NPM_JOURNAL;
    delete process.env.FAUX_NPM_RAPPORT;
    delete process.env.FAUX_NPM_CODE;
  });

  const rapport = (c: Ctx) =>
    JSON.stringify({
      testResults: [
        {
          name: path.join(c.copie, FORME),
          status: 'failed',
          message: '',
          assertionResults: [
            { title: DOUBLE, fullName: DOUBLE, status: 'failed', failureMessages: ['attendu 4'] },
          ],
        },
      ],
    });

  it('joue les seuls fichiers du lot de force, lit leur rapport, et ne rejoue pas la même mesure', () => {
    const c = copieEssai(ESSAIS, lot(FORME), []);
    process.env.FAUX_NPM_RAPPORT = rapport(c);
    process.env.FAUX_NPM_CODE = '1';
    const premiere = preuve(c);
    expect(premiere.ok).toBe(true);
    expect(premiere.rouges).toBe(1);
    expect(premiere.texte).toContain(`- ${FORME} › ${DOUBLE} — attendu 4`);
    expect(readFileSync(c.journal, 'utf8')).toContain(`$ npm test -- --force ${FORME}\n`);
    expect(readFileSync(journalNpm, 'utf8').trim().split('\n').at(-1)).toBe(
      `test -- --force ${FORME}`
    );

    const jouesAvant = readFileSync(c.journal, 'utf8').split('$ npm ').length;
    const seconde = preuve(c, { mesure: premiere.mesure });
    expect(seconde.rouges).toBe(1);
    expect(readFileSync(c.journal, 'utf8').split('$ npm ').length).toBe(jouesAvant);
  });

  it('rejoue la mesure quand le lot change de fichiers', () => {
    const c = copieEssai(ESSAIS, lot(FORME), []);
    process.env.FAUX_NPM_RAPPORT = rapport(c);
    process.env.FAUX_NPM_CODE = '1';
    const premiere = preuve(c);
    writeFileSync(path.join(c.copie, 'autre.test.mjs'), '// un fichier de plus\n');
    preuve(c, { mesure: premiere.mesure });
    const lancements = readFileSync(c.journal, 'utf8')
      .split('\n')
      .filter(l => l.startsWith('$ npm '));
    expect(lancements).toEqual([
      `$ npm test -- --force ${FORME}`,
      `$ npm test -- --force autre.test.mjs ${FORME}`,
    ]);
  });
});
