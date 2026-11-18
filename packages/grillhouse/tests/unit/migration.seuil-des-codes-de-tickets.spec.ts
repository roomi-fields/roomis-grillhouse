import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';

// The threshold of Beads that keeps the codes of the tickets at three characters
// (`max_collision_prob`, 0.99) is set by the update in each project, once, and never overrides
// a value the project chose. Beads is a stand-in on the PATH that keeps its keys in
// `.beads/valeurs` and fails, as `bd` does, where there is no store.
// The module is loaded by each test, so that its absence is a red test, not a file that fails to load.
const charger = () => import('../../scripts/migrations/0.44.0-seuil-des-codes-de-tickets.mjs');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-seuil-codes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const BD = `#!/bin/sh
[ -d .beads ] || { echo "Error: no beads database found" >&2; exit 1; }
f=.beads/valeurs
touch "$f"
if [ "$1" = config ] && [ "$2" = get ]; then
  v=$(grep "^$3=" "$f" | head -n 1 | cut -d= -f2-)
  if [ -n "$v" ]; then echo "$v"; else echo "$3 (not set)"; fi
  exit 0
fi
if [ "$1" = config ] && [ "$2" = set ]; then
  grep -v "^$3=" "$f" > "$f.tmp"; echo "$3=$4" >> "$f.tmp"; mv "$f.tmp" "$f"
  exit 0
fi
exit 0
`;

let chemin = '';
beforeEach(() => {
  chemin = process.env.PATH ?? '';
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'bd'), BD);
  chmodSync(path.join(bin, 'bd'), 0o755);
  process.env.PATH = `${bin}${path.delimiter}${chemin}`;
});
afterEach(() => {
  process.env.PATH = chemin;
});

function projet(valeur?: string, avecStore = true) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(p, 'package.json'), '{"name":"p"}\n');
  if (avecStore) {
    mkdirSync(path.join(p, '.beads'));
    writeFileSync(
      path.join(p, '.beads', 'valeurs'),
      valeur === undefined ? '' : `max_collision_prob=${valeur}\n`
    );
  }
  return p;
}
const valeurs = (p: string) => readFileSync(path.join(p, '.beads', 'valeurs'), 'utf8');
const texte = (lignes: unknown[]) =>
  lignes.map(l => (typeof l === 'string' ? l : JSON.stringify(l)));

describe('migration — max_collision_prob is set to 0.99 in Beads', () => {
  it('is in the list of the migrations, after the version of the package that precedes it', async () => {
    const { nom, version } = await charger();
    expect(MIGRATIONS.some(m => m.version === version && m.nom === nom)).toBe(true);
    const [maj, min, cor] = version.split('.').map(Number);
    expect(maj * 1e6 + min * 1e3 + cor).toBeGreaterThan(43_002);
  });

  it('sets the threshold in a project that has none and says so', async () => {
    const { migrer } = await charger();
    const p = projet();
    const lignes = migrer(p);
    expect(valeurs(p)).toContain('max_collision_prob=0.99');
    expect(lignes).toHaveLength(1);
    const [ligne] = texte(lignes);
    expect(ligne).toContain('max_collision_prob');
    expect(ligne).toContain('0.99');
  });

  it('a second pass changes nothing and reports nothing', async () => {
    const { migrer } = await charger();
    const p = projet();
    migrer(p);
    const apres = valeurs(p);
    expect(migrer(p)).toEqual([]);
    expect(valeurs(p)).toBe(apres);
  });

  it('does not touch a project that already has 0.99 and reports nothing', async () => {
    const { migrer } = await charger();
    const p = projet('0.99');
    const avant = valeurs(p);
    expect(migrer(p)).toEqual([]);
    expect(valeurs(p)).toBe(avant);
  });

  it('keeps another value and names it with the command that aligns it, as a plain line', async () => {
    const { migrer } = await charger();
    const p = projet('0.5');
    const lignes = migrer(p);
    expect(valeurs(p)).toBe('max_collision_prob=0.5\n');
    expect(lignes).toEqual([
      "Beads : max_collision_prob vaut 0.5, gardé (le cadre pose 0.99 ; pour l'aligner : bd config set max_collision_prob 0.99)",
    ]);
  });

  it('names the kept value whatever it is', async () => {
    const { migrer } = await charger();
    const p = projet('0.9');
    const [ligne] = texte(migrer(p));
    expect(ligne).toContain('max_collision_prob vaut 0.9, gardé');
    expect(valeurs(p)).toBe('max_collision_prob=0.9\n');
  });

  it('does not fail and sets nothing when the project has no store, and says so', async () => {
    const { migrer } = await charger();
    const p = projet(undefined, false);
    let lignes: unknown[] = [];
    expect(() => {
      lignes = migrer(p);
    }).not.toThrow();
    expect(existsSync(path.join(p, '.beads'))).toBe(false);
    expect(lignes).toHaveLength(1);
    expect(texte(lignes)[0]).toContain('max_collision_prob');
    expect(typeof lignes[0]).toBe('string');
  });

  it('does not fail and sets nothing when bd is not on the PATH, and says so', async () => {
    const { migrer } = await charger();
    const p = projet();
    process.env.PATH = mkdtempSync(path.join(ESSAIS, 'vide-'));
    let lignes: unknown[] = [];
    expect(() => {
      lignes = migrer(p);
    }).not.toThrow();
    expect(valeurs(p)).toBe('');
    expect(lignes).toHaveLength(1);
    expect(texte(lignes)[0]).toContain('max_collision_prob');
    expect(typeof lignes[0]).toBe('string');
  });
});
