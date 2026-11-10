/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// La sous-commande `grillhouse journal [--depuis <ISO>] [--jusqu-a <ISO>] [--ticket <id>]`
// (scripts/journal.mjs) rend la chronologie du journal d'états d'un projet, et, pour voir la
// concurrence réelle au fil du temps, l'ensemble des tickets en travail à chaque instant, contre le
// plafond des circuits (`grillhouse.circuits`) : une file qui travaille un ticket quand le plafond
// en permet deux saute aux yeux. Un ticket est en travail de la ligne `lance` de la file à sa ligne
// `termine`, que le circuit attende ou non une réponse (il tient alors sa place dans le plafond).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// Les modules se chargent à l'appel : s'ils manquent, chaque test échoue seul.
const charger = (f: string): any =>
  createRequire(path.join(__dirname, 'x.cjs'))(path.resolve(__dirname, '../../scripts', f));
const dossierDuJournal = (...a: any[]) => charger('journal-des-etats.mjs').dossierDuJournal(...a);
const ensemblesEnTravail = (...a: any[]) =>
  charger('journal-des-etats.mjs').ensemblesEnTravail(...a);
const journal = (...a: any[]) => charger('journal.mjs').journal(...a);
import { SOUS_COMMANDES } from '../../scripts/sous-commandes.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'journal-commande-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
function projet(circuits?: number): string {
  const racine = path.join(ESSAIS, `p${++n}`);
  mkdirSync(racine);
  execFileSync('git', ['init', '-q', racine]);
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify(circuits === undefined ? {} : { grillhouse: { circuits } })
  );
  return racine;
}
const F = (ts: string, ticket: string, etape: 'lance' | 'termine') => ({
  ts,
  genre: 'file',
  ticket,
  etape,
  boucle: null,
  place: null,
  raison: '',
});
const C = (ts: string, ticket: string, etape: string, raison = '') => ({
  ts,
  genre: 'circuit',
  ticket,
  etape,
  boucle: null,
  place: null,
  raison,
});
function ecrire(racine: string, date: string, lignes: (object | string)[]) {
  const d = dossierDuJournal(racine);
  mkdirSync(d, { recursive: true });
  writeFileSync(
    path.join(d, `${date}.jsonl`),
    lignes.map(l => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n'
  );
}
function lancer(racine: string, argv: string[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  const code = journal(argv, {
    racine,
    out: (t: string) => out.push(t),
    err: (t: string) => err.push(t),
  });
  return { code, sortie: out.join('\n'), erreur: err.join('\n') };
}

// Deux circuits qui se chevauchent, puis un seul, sur un plafond de deux.
const SIMULE = [
  F('2026-11-09T10:00:00+01:00', 'd-1', 'lance'),
  C('2026-11-09T10:00:05+01:00', 'd-1', '1'),
  F('2026-11-09T10:10:00+01:00', 'd-2', 'lance'),
  C('2026-11-09T10:20:00+01:00', 'd-1', '3'),
  F('2026-11-09T10:30:00+01:00', 'd-1', 'termine'),
  C('2026-11-09T10:40:00+01:00', 'd-2', '4'),
  F('2026-11-09T11:00:00+01:00', 'd-2', 'termine'),
];

describe('l’ensemble des tickets en travail à chaque instant', () => {
  it('reconstruit l’ensemble à chaque lancement et chaque fin de circuit', () => {
    expect(ensemblesEnTravail(SIMULE)).toEqual([
      { ts: '2026-11-09T10:00:00+01:00', enTravail: ['d-1'] },
      { ts: '2026-11-09T10:10:00+01:00', enTravail: ['d-1', 'd-2'] },
      { ts: '2026-11-09T10:30:00+01:00', enTravail: ['d-2'] },
      { ts: '2026-11-09T11:00:00+01:00', enTravail: [] },
    ]);
  });

  it('les lignes d’étape d’un circuit ne changent pas l’ensemble', () => {
    const r = ensemblesEnTravail([
      F('2026-11-09T10:00:00+01:00', 'd-1', 'lance'),
      C('2026-11-09T10:01:00+01:00', 'd-1', '2'),
      C('2026-11-09T10:02:00+01:00', 'd-1', '3', 'controles'),
    ]);
    expect(r).toEqual([{ ts: '2026-11-09T10:00:00+01:00', enTravail: ['d-1'] }]);
  });

  it('un ticket lancé deux fois sans fin entre les deux compte une fois', () => {
    const r = ensemblesEnTravail([
      F('2026-11-09T10:00:00+01:00', 'd-1', 'lance'),
      F('2026-11-09T10:05:00+01:00', 'd-1', 'lance'),
    ]);
    expect(r.at(-1)?.enTravail).toEqual(['d-1']);
  });

  it('suit l’ordre des instants, pas celui des lignes', () => {
    const r = ensemblesEnTravail([
      F('2026-11-09T10:30:00+01:00', 'd-1', 'termine'),
      F('2026-11-09T10:00:00+01:00', 'd-1', 'lance'),
    ]);
    expect(r.map(e => e.enTravail)).toEqual([['d-1'], []]);
  });

  it('sans ligne, rend un ensemble vide de lignes', () => {
    expect(ensemblesEnTravail([])).toEqual([]);
  });
});

describe('la sous-commande journal', () => {
  it('est une sous-commande du cadre, jouée par scripts/journal.mjs', () => {
    expect(SOUS_COMMANDES.journal).toBe('journal.mjs');
  });

  it('rend les lignes dans l’ordre de leur horodatage', () => {
    const racine = projet(2);
    ecrire(racine, '2026-11-09', [...SIMULE].reverse());
    const { code, sortie } = lancer(racine);
    expect(code).toBe(0);
    const a = sortie.indexOf('10:00:05');
    const b = sortie.indexOf('10:20:00');
    const c = sortie.indexOf('10:40:00');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('rend visible la concurrence : à chaque instant les tickets en travail contre le plafond', () => {
    const racine = projet(2);
    ecrire(racine, '2026-11-09', SIMULE);
    const { sortie } = lancer(racine);
    const lignes = sortie.split('\n');
    const un = lignes.find(l => /en travail 1\/2/.test(l) && l.includes('d-1'));
    const deux = lignes.find(
      l => /en travail 2\/2/.test(l) && l.includes('d-1') && l.includes('d-2')
    );
    const zero = lignes.find(l => /en travail 0\/2/.test(l));
    expect(un).toBeDefined();
    expect(deux).toBeDefined();
    expect(zero).toBeDefined();
    // Le seul ticket en travail alors que le plafond en permet deux : sa ligne vient avant les deux.
    expect(sortie.indexOf(un as string)).toBeLessThan(sortie.indexOf(deux as string));
  });

  it('le plafond est un circuit quand le réglage manque', () => {
    const racine = projet();
    ecrire(racine, '2026-11-09', SIMULE.slice(0, 1));
    expect(lancer(racine).sortie).toMatch(/en travail 1\/1.*d-1/);
  });

  it('borne la plage par --depuis et --jusqu-a, bornes comprises', () => {
    const racine = projet(2);
    ecrire(racine, '2026-11-09', SIMULE);
    const { code, sortie } = lancer(racine, [
      '--depuis',
      '2026-11-09T10:20:00+01:00',
      '--jusqu-a',
      '2026-11-09T10:40:00+01:00',
    ]);
    expect(code).toBe(0);
    expect(sortie).toContain('10:20:00');
    expect(sortie).toContain('10:40:00');
    expect(sortie).not.toContain('10:00:05');
    expect(sortie).not.toContain('11:00:00');
  });

  it('--ticket ne rend que les lignes de ce ticket', () => {
    const racine = projet(2);
    ecrire(racine, '2026-11-09', SIMULE);
    const { code, sortie } = lancer(racine, ['--ticket', 'd-2']);
    expect(code).toBe(0);
    expect(sortie).toContain('10:40:00');
    expect(sortie).not.toContain('10:20:00');
  });

  it('ignore sans échouer une ligne illisible', () => {
    const racine = projet(2);
    ecrire(racine, '2026-11-09', [SIMULE[0], 'pas du json', SIMULE[1]]);
    const { code, sortie } = lancer(racine);
    expect(code).toBe(0);
    expect(sortie).toContain('10:00:05');
  });

  it('sans journal, le dit et sort vert', () => {
    const { code, sortie, erreur } = lancer(projet(2));
    expect(code).toBe(0);
    expect(`${sortie}${erreur}`).toMatch(/aucun journal/i);
  });

  it('sans ligne dans la plage, le dit et sort vert', () => {
    const racine = projet(2);
    ecrire(racine, '2026-11-09', SIMULE);
    const { code, sortie, erreur } = lancer(racine, ['--depuis', '2027-01-01T00:00:00+01:00']);
    expect(code).toBe(0);
    expect(`${sortie}${erreur}`).toMatch(/aucune ligne/i);
  });

  it('refuse une option inconnue ou une date illisible par le code 2', () => {
    const racine = projet(2);
    expect(lancer(racine, ['--hier']).code).toBe(2);
    const r = lancer(racine, ['--depuis', 'demain matin']);
    expect(r.code).toBe(2);
    expect(r.erreur).toMatch(/--depuis/);
  });
});
