// grillhouse-44b.4, décision 1 du responsable (option B, la référence de rust.mdx) — le module
// cargo publie des commandes par paquet, que les scripts build et typecheck du package.json d'un
// crate appellent : `construire <chemin>` (`cargo build -p <crate>`) et `typer <chemin>`
// (`cargo check -p <crate>`). `typer` sans chemin reste le contrôle de l'espace entier. Joué contre
// le faux cargo (./faux-cargo.ts), dont le journal liste les appels.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import module from '../../../../scripts/langages/cargo/index.mjs';
import { commandeDe } from '../../../../scripts/sous-commandes.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'cargo-par-paquet-'));
const JOURNAL = path.join(ESSAIS, 'journal');
let restaurer = () => {};
let espace: string;
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
  espace = (exemples.preparer(ESSAIS) as { depots: { espace: string } }).depots.espace;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());

function lancer(nom: string, args: string[], codes: object = {}) {
  writeFileSync(JOURNAL, '');
  const c = cargo.commandes(espace)[nom]!;
  const r = spawnSync(process.execPath, [c.script, ...c.args, ...args], {
    cwd: espace,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: path.join(ESSAIS, 'maison'),
      XDG_CACHE_HOME: '',
      GRILLHOUSE_RESULTATS: mkdtempSync(path.join(ESSAIS, 'resultats-')),
      FAUX_CARGO_CODES: JSON.stringify(codes),
    },
  });
  const appels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('metadata '))
    .map(l => l.replace(/--tool-config-file grillhouse:\S+ --profile grillhouse /, ''));
  return { code: r.status, stderr: r.stderr, appels };
}

describe('grillhouse-44b.4, décision 1 — les commandes par paquet du module cargo', () => {
  it('construire est une commande décrite du module, et le cadre la sert, comme typer, par son nom', () => {
    const c = cargo.commandes(espace);
    expect(c.construire).toEqual({ script: c.typer.script, args: ['construire'] });
    expect(commandeDe('construire', espace)).toEqual(c.construire);
    expect(commandeDe('typer', espace)).toEqual(c.typer);
  });

  it('construire <chemin> : cargo build -p du crate de ce dossier seul', () => {
    const r = lancer('construire', ['crates/core']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels).toEqual(['build -p ws-core']);
    expect(lancer('construire', ['crates/app']).appels).toEqual(['build -p ws-app']);
  });

  it('typer <chemin> : cargo check -p du crate de ce dossier seul', () => {
    const r = lancer('typer', ['crates/app']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.appels).toHaveLength(1);
    expect(r.appels[0]).toMatch(/^check -p ws-app\b/);
  });

  it('typer sans chemin garde le contrôle de l’espace entier', () => {
    expect(lancer('typer', []).appels).toEqual(['check --all-targets']);
  });

  it('un chemin qui n’est pas un crate est refusé par son nom, cargo jamais lancé', () => {
    for (const nom of ['construire', 'typer']) {
      const r = lancer(nom, ['docs']);
      expect(r.code, nom).toBe(2);
      expect(r.stderr, nom).toMatch(/docs/);
      expect(r.appels, nom).toEqual([]);
    }
  });

  it('un crate qui ne compile pas rend le code rouge', () => {
    expect(lancer('construire', ['crates/core'], { 'build ws-core': 101 }).code).not.toBe(0);
  });
});
