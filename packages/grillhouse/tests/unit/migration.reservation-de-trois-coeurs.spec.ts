// The migration of 0.49.0 (scripts/migrations/0.49.0-reservation-de-trois-coeurs.mjs): a circuit
// reserves 3 cores, so `grillhouse.part.coeurs` 4 of a project's package.json becomes 3; any other
// value, a project without the key and a second pass are left as they are. It carries the version
// that brings the change, newer than the last one released: a project that recorded 0.48.0 plays it.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS, migrationsAJouer } from '../../scripts/migrations.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-reservation-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const NOM = 'reservation de trois coeurs';
const VERSION = '0.49.0';
const trouvee = (
  MIGRATIONS as { version: string; nom: string; migrer: (p: string) => unknown[] }[]
).find(m => m.nom === NOM && m.version === VERSION);
const migrer = (projet: string): unknown[] => {
  if (!trouvee) {
    throw new Error(`la migration « ${NOM} » de ${VERSION} manque à la liste des migrations`);
  }
  return trouvee.migrer(projet);
};

let n = 0;
interface Pkg {
  name?: string;
  grillhouse?: { part?: { coeurs?: number; memoireGo?: number }; circuits?: number };
}
const ecrire = (pkg: unknown): string => {
  n += 1;
  const dossier = mkdtempSync(path.join(ESSAIS, `p${n}-`));
  writeFileSync(path.join(dossier, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  return dossier;
};
const lire = (dossier: string): Pkg =>
  JSON.parse(readFileSync(path.join(dossier, 'package.json'), 'utf8')) as Pkg;

describe('la migration de la réservation de trois cœurs', () => {
  it('est à jouer pour un projet qui a enregistré 0.48.0, et ne l’est plus une fois 0.49.0 enregistrée', () => {
    const noms = (depuis: string): string[] =>
      (migrationsAJouer(depuis) as { nom: string }[]).map(m => m.nom);
    expect(noms('0.48.0')).toContain(NOM);
    expect(noms('0.49.0')).not.toContain(NOM);
  });

  it('passe grillhouse.part.coeurs de 4 à 3 et garde les autres clés', () => {
    const d = ecrire({ name: 'x', grillhouse: { part: { coeurs: 4, memoireGo: 6 }, circuits: 2 } });
    expect(migrer(d)).toHaveLength(1);
    const pkg = lire(d);
    expect(pkg.grillhouse.part).toEqual({ coeurs: 3, memoireGo: 6 });
    expect(pkg.grillhouse.circuits).toBe(2);
    expect(pkg.name).toBe('x');
  });

  it('laisse une autre valeur de coeurs', () => {
    const d = ecrire({ grillhouse: { part: { coeurs: 6 } } });
    expect(migrer(d)).toEqual([]);
    expect(lire(d).grillhouse.part.coeurs).toBe(6);
  });

  it('ne touche ni un projet sans la clé ni un projet sans package.json', () => {
    const d = ecrire({ grillhouse: { circuits: 2 } });
    expect(migrer(d)).toEqual([]);
    expect(lire(d)).toEqual({ grillhouse: { circuits: 2 } });
    expect(migrer(mkdtempSync(path.join(ESSAIS, 'vide-')))).toEqual([]);
  });

  it('ne change rien à la seconde passe', () => {
    const d = ecrire({ grillhouse: { part: { coeurs: 4 } } });
    migrer(d);
    const apres = readFileSync(path.join(d, 'package.json'), 'utf8');
    expect(migrer(d)).toEqual([]);
    expect(readFileSync(path.join(d, 'package.json'), 'utf8')).toBe(apres);
  });
});
