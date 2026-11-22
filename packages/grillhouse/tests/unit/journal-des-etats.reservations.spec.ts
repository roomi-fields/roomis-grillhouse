/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// Le journal des états enregistre chaque réservation prise et rendue (cœurs, mémoire, qui) : une
// question sur les parts à un instant se rejoue du seul journal, et `grillhouse journal` l'affiche.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { journal } from '../../scripts/journal.mjs';
import {
  ecrireLaTrace,
  lireLeJournal,
  reservationsOuvertes,
  traceDesPlaces,
} from '../../scripts/journal-des-etats.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'journal-reservations-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
function projet(): string {
  const racine = path.join(ESSAIS, `p${++n}`);
  execFileSync('git', ['init', '-q', racine]);
  return racine;
}
const A = { coeurs: 3, memoireGo: 4, qui: 'demo-1 testwriter' };
const B = { coeurs: 2, memoireGo: 1.5, qui: 'demo-2 passe' };
const ts = (h: string) => `2026-11-22T${h}:00.000+01:00`;
const ecrire = (racine: string, h: string, evenement: string, place: string, r: object, t = 'x') =>
  ecrireLaTrace(
    racine,
    {
      ...traceDesPlaces({ evenement, ticket: t, place, reservation: r }),
      ts: ts(h),
    },
    { dire: () => {} }
  );

describe('les réservations de places au journal', () => {
  it('écrit la réservation (cœurs, mémoire, qui) à la place prise et rendue', () => {
    const racine = projet();
    ecrire(racine, '10:00', 'prise', 'p1', A, 'demo-1');
    ecrire(racine, '10:30', 'rendue', 'p1', A, 'demo-1');
    const l = lireLeJournal(racine).lignes;
    expect(l.map((x: any) => [x.etape, x.place, x.reservation])).toEqual([
      ['prise', 'p1', A],
      ['rendue', 'p1', A],
    ]);
  });

  it('relit du seul journal les réservations ouvertes à un instant', () => {
    const racine = projet();
    ecrire(racine, '10:00', 'prise', 'p1', A, 'demo-1');
    ecrire(racine, '10:10', 'prise', 'p2', B, 'demo-2');
    ecrire(racine, '10:30', 'rendue', 'p1', A, 'demo-1');
    const lignes = lireLeJournal(racine).lignes;
    const ouvertes = (h: string) =>
      reservationsOuvertes(lignes, ts(h)).map((r: any) => [r.place, r.coeurs, r.memoireGo, r.qui]);
    expect(ouvertes('09:59')).toEqual([]);
    expect(ouvertes('10:05')).toEqual([['p1', 3, 4, 'demo-1 testwriter']]);
    expect(ouvertes('10:20')).toEqual([
      ['p1', 3, 4, 'demo-1 testwriter'],
      ['p2', 2, 1.5, 'demo-2 passe'],
    ]);
    expect(ouvertes('10:30')).toEqual([['p2', 2, 1.5, 'demo-2 passe']]);
    expect(ouvertes('11:00')).toEqual([['p2', 2, 1.5, 'demo-2 passe']]);
  });

  it("l'affiche dans `grillhouse journal`", () => {
    const racine = projet();
    ecrire(racine, '10:00', 'prise', 'p1', A, 'demo-1');
    const sortie: string[] = [];
    expect(journal([], { racine, out: t => sortie.push(t) })).toBe(0);
    const ligne = sortie.find(l => l.includes('prise')) ?? '';
    expect(ligne).toContain('place p1');
    expect(ligne).toContain('3 cœurs');
    expect(ligne).toContain('4 Go');
    expect(ligne).toContain('demo-1 testwriter');
  });
});
