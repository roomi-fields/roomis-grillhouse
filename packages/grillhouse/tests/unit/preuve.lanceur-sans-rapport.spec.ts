// La preuve du rouge (`preuve`, scripts/activites.mjs) devant un lanceur sans rapport par test,
// `claude plugin test` : la tâche de tests se juge à son code de sortie et à ses lignes. Un faux npm
// écrit ce que laisse la passe, le résumé de Turborepo et le journal de la tâche, aux lignes du
// lanceur.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { langageDe } from '../../scripts/langages.mjs';
import { copieEssai, ficheNommant, preuve, type Ctx } from './preuve-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preuve-sans-rapport-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LOT = 'questions.test.mjs';
const NEUF = 'a reading beside a fault submits the text';
const VERT = 'an empty reading submits nothing';
const BILAN = [' 1 pass', ' 1 fail', 'Ran 2 tests across 2 files. [0.37s]'];
const ENTETE = ['', '> greffon@0.0.0 test:unit', '> claude plugin test .', '', ''];

const ROUGE = [
  'tests/ancien.test.ts:',
  '(pass) main holds this one [1.10ms]',
  '',
  `${LOT}:`,
  `(fail) ${NEUF} [155.30ms]`,
  '  AssertionError: expect(received).toHaveLength()',
  '  ',
  '  Expected: length 1',
  `(pass) ${VERT} [0.18ms]`,
  '',
];

describe('la preuve devant un lanceur sans rapport par test', () => {
  const bin = path.join(ESSAIS, 'bin');
  const avant = process.env.PATH;
  beforeAll(() => {
    mkdirSync(bin, { recursive: true });
    const npm = path.join(bin, 'npm');
    writeFileSync(
      npm,
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const d = process.env.GRILLHOUSE_RESULTATS;
const code = Number(process.env.FAUX_NPM_CODE);
fs.mkdirSync(path.join(d, 'turbo'), { recursive: true });
fs.mkdirSync('.turbo', { recursive: true });
fs.writeFileSync('.turbo/tests.log', process.env.FAUX_NPM_LIGNES);
fs.writeFileSync(path.join(d, 'turbo', 'run.json'), JSON.stringify({ tasks: [{
  taskId: 'essai#test:unit', package: 'essai', directory: '', task: 'test:unit',
  execution: { exitCode: code }, logFile: '.turbo/tests.log' }] }));
process.exit(code);
`
    );
    chmodSync(npm, 0o755);
    process.env.PATH = `${bin}${path.delimiter}${avant ?? ''}`;
  });
  afterAll(() => {
    process.env.PATH = avant;
    delete process.env.FAUX_NPM_LIGNES;
    delete process.env.FAUX_NPM_CODE;
  });

  const jouer = (
    lignes: string[],
    code = 1,
    c: Ctx = copieEssai(ESSAIS, { [LOT]: '// lot\n' })
  ) => {
    process.env.FAUX_NPM_LIGNES = [...ENTETE, ...lignes].join('\n');
    process.env.FAUX_NPM_CODE = String(code);
    return preuve(c);
  };

  it('tient pour un rouge du lot le test rouge d’un fichier qui se charge et joue', () => {
    const r = jouer([...ROUGE, ...BILAN]);
    expect(r.ok).toBe(true);
    expect(r.resultat.casses).toBe(0);
    expect(r.rouges).toBe(1);
    expect(r.texte).toContain(
      `- ${LOT} › ${NEUF} — AssertionError: expect(received).toHaveLength()`
    );
    expect(r.texte).toContain(`- ${LOT} › ${VERT}`);
  });

  it('refuse le vert que la fiche dit porter le travail, lu aux mêmes lignes', () => {
    const c = copieEssai(ESSAIS, { [LOT]: '// lot\n' }, [
      ficheNommant([{ fichier: LOT, test: VERT }]),
    ]);
    const r = jouer([...ROUGE, ...BILAN], 1, c);
    expect(r.ok).toBe(false);
    expect(r.resultat.sans).toBe(1);
  });

  it('refuse le fichier que le lanceur dit ne pas avoir chargé, avec sa raison', () => {
    const r = jouer([
      `${LOT}:`,
      '(fail) the file did not load',
      '  Unexpected end of file (line 2, column 19)',
      '',
      ' 0 pass',
      ' 1 fail',
      'Ran 1 test across 1 file. [0.02s]',
    ]);
    expect(r.ok).toBe(false);
    expect(r.resultat.casses).toBe(1);
    expect(r.texte).toContain(`- ${LOT} — ne se charge pas : Unexpected end of file`);
  });

  it('refuse le fichier non joué quand le lanceur s’arrête avant son bilan', () => {
    const r = jouer(ROUGE);
    expect(r.ok).toBe(false);
    expect(r.texte).toContain(`- ${LOT} — ne se charge pas : non joué (code 1)`);
  });

  it('rend ces rapports au verdict du langage, que tout lecteur d’une passe lit', () => {
    const c = copieEssai(ESSAIS, { [LOT]: '// lot\n' });
    const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    mkdirSync(path.join(dossier, 'turbo'));
    mkdirSync(path.join(c.copie, '.turbo'), { recursive: true });
    writeFileSync(path.join(c.copie, '.turbo', 'tests.log'), [...ROUGE, ...BILAN].join('\n'));
    writeFileSync(
      path.join(dossier, 'turbo', 'run.json'),
      JSON.stringify({
        tasks: [
          {
            taskId: 'essai#test:unit',
            package: 'essai',
            directory: '',
            task: 'test:unit',
            execution: { exitCode: 1 },
            logFile: '.turbo/tests.log',
          },
        ],
      })
    );
    const { rapports } = langageDe(c.copie).verdict(dossier, c.copie);
    expect(rapports.flatMap(r => r.tests.filter(t => t.etat === 'failed').map(t => t.nom))).toEqual(
      [NEUF]
    );
  });

  it('refuse le fichier quand le code est rouge et qu’aucune ligne ne dit un test rouge', () => {
    const r = jouer([`${LOT}:`, `(pass) ${VERT} [0.18ms]`, '', ...BILAN]);
    expect(r.ok).toBe(false);
    expect(r.texte).toContain(`- ${LOT} — ne se charge pas : non joué (code 1)`);
  });
});
