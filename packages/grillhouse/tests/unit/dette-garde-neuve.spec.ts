import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { abaisser, FICHIER, trancher } from '../../scripts/dette.mjs';
import { lireSarif, RESULTATS } from '../../scripts/resultats.mjs';

// The known debt of a guard the lot adds (scripts/dette.mjs): a guard absent from the guards of the
// lot's base (main) has its findings noted « to inscribe » beside its refusals, and the
// regeneration of the debt inscribes its whole section from those notes, as it lowers the other
// guards. A guard of main never gets a key or a higher count that way. The guards of the base are
// named to the run by the variable below, a JSON list of their names.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dette-neuve-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const BASE = 'GRILLHOUSE_GARDES_DE_LA_BASE';
const A_INSCRIRE = 'a-inscrire';

type Dette = Record<string, Record<string, Record<string, { count: number }>>>;
type Constat = {
  garde: string;
  fichier: string | null;
  regle: string | null;
  niveau: string;
  genre: string;
  trouve?: number;
};

const dossier = (prefixe: string) => mkdtempSync(path.join(ESSAIS, prefixe));
const c = (fichier: string, regle: string) => ({ fichier, regle, message: `${fichier} ${regle}` });
const lireDette = (dir: string) =>
  JSON.parse(readFileSync(path.join(dir, FICHIER), 'utf8')) as Dette;

// The notes « to inscribe » that <constats> of the guard <garde> write in a run whose base holds
// <base>, and the refusals the guard returns.
function jouer(garde: string, constats: ReturnType<typeof c>[], base: string[] | undefined) {
  const dir = dossier('depot-');
  const resultats = path.join(dir, 'resultats');
  const env: Record<string, string> = { [RESULTATS as string]: resultats };
  if (base) {
    env[BASE] = JSON.stringify(base);
  }
  const { refus } = (trancher as (...a: unknown[]) => { refus: ReturnType<typeof c>[] })(
    dir,
    garde,
    constats,
    undefined,
    env
  );
  const { constats: lus } = lireSarif(resultats) as { constats: Constat[] };
  return {
    refus,
    inscrire: lus.filter(k => k.genre === A_INSCRIRE),
    autres: lus.filter(k => k.genre !== A_INSCRIRE),
  };
}

describe('le constat d’une garde que le lot ajoute', () => {
  it('is a note to inscribe per file and rule, with its count, beside the refusal', () => {
    const constats = [c('a.ts', 'r'), c('a.ts', 'r'), c('a.ts', 's'), c('b.ts', 'r')];
    const j = jouer('neuve', constats, ['ancienne']);
    expect(j.refus).toEqual(constats);
    const cles = j.inscrire.map(k => [k.garde, k.fichier, k.regle, k.trouve, k.niveau]);
    expect(cles.sort()).toEqual([
      ['neuve', 'a.ts', 'r', 2, 'note'],
      ['neuve', 'a.ts', 's', 1, 'note'],
      ['neuve', 'b.ts', 'r', 1, 'note'],
    ]);
    expect(j.autres.filter(k => k.niveau === 'error')).toHaveLength(4);
  });

  it('is never noted for a guard the base holds, though it finds nothing or has no section', () => {
    const constats = [c('a.ts', 'r')];
    const deMain = jouer('ancienne', constats, ['ancienne', 'autre']);
    expect(deMain.inscrire).toEqual([]);
    expect(deMain.refus).toEqual(constats);
    expect(jouer('ancienne', [], ['ancienne']).inscrire).toEqual([]);
  });

  it('is never noted without a base to compare with, a project’s run', () => {
    expect(jouer('neuve', [c('a.ts', 'r')], undefined).inscrire).toEqual([]);
  });

  it('is not noted when the finding has no file or no rule: the guard refuses it every time', () => {
    const sansCle = { message: 'à régénérer' } as unknown as ReturnType<typeof c>;
    const j = jouer('neuve', [sansCle, c('a.ts', 'r')], ['ancienne']);
    expect(j.inscrire.map(k => k.fichier)).toEqual(['a.ts']);
    expect(j.refus).toHaveLength(2);
  });
});

describe('la régénération de la dette des gardes', () => {
  const NOTES = [
    { garde: 'neuve', fichier: 'a.ts', regle: 'r', trouve: 2, genre: A_INSCRIRE },
    { garde: 'neuve', fichier: 'b.ts', regle: 's', trouve: 1, genre: A_INSCRIRE },
    { garde: 'ancienne', fichier: 'x.ts', regle: 'r', trouve: 1, genre: 'a-elaguer' },
    { garde: 'ancienne', fichier: 'y.ts', regle: 'r', trouve: 0, genre: 'a-elaguer' },
    // A guard of main and a key it does not hold: never added, never raised.
    { garde: 'ancienne', fichier: 'neuf.ts', regle: 'r', trouve: 3 },
    { garde: 'ancienne', fichier: 'x.ts', regle: 'r', trouve: 9 },
    { garde: 'absente', fichier: 'z.ts', regle: 'r', trouve: 1, genre: 'a-elaguer' },
  ];

  it('inscribes the whole section of a new guard from its notes and lowers the others', () => {
    const dir = dossier('depot-');
    writeFileSync(
      path.join(dir, FICHIER),
      JSON.stringify({
        ancienne: { 'x.ts': { r: { count: 3 } }, 'y.ts': { r: { count: 1 } } },
      })
    );
    expect((abaisser as (d: string, n: object[]) => boolean)(dir, NOTES)).toBe(true);
    expect(lireDette(dir)).toEqual({
      ancienne: { 'x.ts': { r: { count: 1 } } },
      neuve: { 'a.ts': { r: { count: 2 } }, 'b.ts': { s: { count: 1 } } },
    });
  });

  it('inscribes a new guard in a project without debt file, and leaves a guard of main without key', () => {
    const dir = dossier('depot-');
    expect((abaisser as (d: string, n: object[]) => boolean)(dir, NOTES)).toBe(true);
    expect(lireDette(dir)).toEqual({
      neuve: { 'a.ts': { r: { count: 2 } }, 'b.ts': { s: { count: 1 } } },
    });
  });
});
