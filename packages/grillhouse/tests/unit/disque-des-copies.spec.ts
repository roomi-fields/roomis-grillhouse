// Le disque des copies d'un projet (scripts/disque-des-copies.mjs) : la taille d'une copie mesurée
// une fois et gardée à côté d'elle ; la place qu'un départ demande, la plus grande copie gardée du
// projet, sinon la taille attendue de ses modules de langage, plus la marge de 4 Go de la charte ;
// et ce qui occupe le disque quand la place manque, les copies présentes avec leur taille, le
// ticket nommé.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  disqueDesCopies,
  mesurerLaCopie,
  taillesGardees,
} from '../../scripts/disque-des-copies.mjs';
import { dossier } from '../temporal/essai.js';

const GO = 1024 ** 3;

// Un projet d'essai dont les copies <copies> existent sous .claude/worktrees.
function projet(copies: string[] = []) {
  const racine = dossier('projet');
  for (const c of copies) {
    mkdirSync(path.join(racine, '.claude', 'worktrees', c), { recursive: true });
  }
  return racine;
}
const garder = (racine: string, ticket: string, octets: number) => {
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  writeFileSync(
    path.join(racine, '.claude', 'worktrees', `${ticket}.taille`),
    JSON.stringify({ octets, mesure: '2026-11-11T00:00:00Z' })
  );
};

describe('la taille d’une copie, mesurée une fois et gardée à côté d’elle', () => {
  it('la mesure écrit <ticket>.taille, que la lecture rend avec la copie présente', () => {
    const racine = projet(['d-1']);
    writeFileSync(path.join(racine, '.claude', 'worktrees', 'd-1', 'f'), 'x'.repeat(10_000));
    const octets = mesurerLaCopie(racine, 'd-1');
    expect(octets).toBeGreaterThanOrEqual(10_000);
    const garde = JSON.parse(
      readFileSync(path.join(racine, '.claude', 'worktrees', 'd-1.taille'), 'utf8')
    ) as { octets: number };
    expect(garde.octets).toBe(octets);
    expect(taillesGardees(racine)).toEqual([{ ticket: 'd-1', octets, presente: true }]);
  });

  it('sans copie, rien ne se mesure ni ne s’écrit', () => {
    const racine = projet();
    expect(mesurerLaCopie(racine, 'd-1')).toBeNull();
    expect(existsSync(path.join(racine, '.claude', 'worktrees', 'd-1.taille'))).toBe(false);
  });
});

describe('la place qu’un départ demande sur le disque des copies', () => {
  it('sans taille gardée, la taille attendue du module de langage le plus lourd, plus 4 Go', () => {
    const racine = projet();
    const ts = disqueDesCopies(racine, { libre: () => 100 * GO, tailles: () => [GO] });
    expect(ts.requis).toBe(5 * GO);
    const rust = disqueDesCopies(racine, {
      libre: () => 100 * GO,
      tailles: () => [GO, 8 * GO],
    });
    expect(rust.requis).toBe(12 * GO);
    expect(rust.raison).toBeNull();
  });

  it('la plus grande copie gardée du projet fait la taille attendue', () => {
    const racine = projet();
    garder(racine, 'd-1', 2 * GO);
    garder(racine, 'd-2', 3 * GO);
    const d = disqueDesCopies(racine, { libre: () => 100 * GO, tailles: () => [8 * GO] });
    expect(d.requis).toBe(7 * GO);
  });

  it('la place manque : la raison dit le disque et les copies en pause, leur ticket nommé', () => {
    const racine = projet(['d-1', 'd-2']);
    garder(racine, 'd-1', 2 * GO);
    garder(racine, 'd-2', 7 * GO);
    garder(racine, 'd-3', 1 * GO);
    const d = disqueDesCopies(racine, { libre: () => 5 * GO, tailles: () => [] });
    expect(d.occupe.map(c => c.ticket)).toEqual(['d-2', 'd-1']);
    expect(d.raison).toMatch(/5,0 Go libres, 11,0 Go requis/);
    expect(d.raison).toMatch(/copies en pause : d-2 7,0 Go, d-1 2,0 Go$/);
  });
});

describe('la taille attendue d’une copie, portée par chaque module de langage', () => {
  it('cargo attend 8 Go, typescript et python 1 Go', async () => {
    const { langage } = await import('../../scripts/langages.mjs');
    expect(['typescript', 'cargo', 'python'].map(n => langage(n).tailleDUneCopie)).toEqual([
      GO,
      8 * GO,
      GO,
    ]);
  });
});
