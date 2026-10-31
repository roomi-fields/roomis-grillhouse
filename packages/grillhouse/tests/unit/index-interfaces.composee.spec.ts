// grillhouse-akd — the index of the interfaces of a project of several languages is one generated
// file of the core (scripts/index-interfaces.mjs): each module gives the entries of its
// interfaces (`entreesDeLIndex`), and the core assembles them in the order of their paths, the
// root's once, under one check, so that the checks of two modules no longer contradict each other.
// A trial repository of two languages, cargo (the fake cargo, ./langages/cargo/faux-cargo.ts) and
// typescript.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCRIPT, SORTIE } from '../../scripts/index-interfaces.mjs';
import { langageDe } from '../../scripts/langages.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'index-interfaces-compose-'));
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => restaurer());
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// A project of Rust (the crate moteur) and of TypeScript (the package site), each its interface,
// and the root's.
function deuxLangages() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    racine,
    'package.json',
    JSON.stringify({
      name: 'p',
      private: true,
      workspaces: ['packages/*'],
      grillhouse: { langages: ['cargo', 'typescript'] },
    })
  );
  ecrire(racine, 'Cargo.toml', '[workspace]\nmembers = ["moteur"]\n');
  ecrire(racine, 'moteur/Cargo.toml', '[package]\nname = "moteur"\nversion = "0.1.0"\n');
  ecrire(racine, 'moteur/src/lib.rs', '');
  ecrire(racine, 'moteur/docs/INTERFACE.md', '# moteur — le moteur\n\nRend le son. Vite.\n');
  ecrire(racine, 'packages/site/package.json', JSON.stringify({ name: 'site' }));
  ecrire(racine, 'packages/site/docs/INTERFACE.md', '# site\n\nLe catalogue du navigateur.\n');
  ecrire(racine, 'docs/INTERFACE.md', '# Le projet\n\nDeux langages.\n');
  return racine;
}

const lancer = (racine: string, ...args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd: racine, encoding: 'utf8' });
const lire = (racine: string) => readFileSync(path.join(racine, SORTIE), 'utf8');

describe('grillhouse-akd — un seul index des interfaces pour un projet de deux langages', () => {
  it('the core writes one index: each module’s entries, in the order of their paths, the root’s once', () => {
    const racine = deuxLangages();
    expect(lancer(racine).status).toBe(0);
    const index = lire(racine);
    const tetes = index.split('\n').filter(l => l.startsWith('## '));
    expect(tetes).toEqual(['## (racine) — Le projet', '## moteur — le moteur', '## site']);
    expect(index).toContain('Rend le son. (`moteur/docs/INTERFACE.md`)');
    expect(index).toContain('Le catalogue du navigateur. (`packages/site/docs/INTERFACE.md`)');
    expect(index.startsWith('# Index des interfaces\n')).toBe(true);
  });

  it('one check: green once written, red, named, when an interface changes', () => {
    const racine = deuxLangages();
    lancer(racine);
    expect(lancer(racine, '--verifier').status).toBe(0);
    const [engendre] = langageDe(racine)
      .fichiersEngendres(racine)
      .filter(e => e.fichiers.includes(SORTIE));
    expect(engendre.verifier(racine)).toEqual([]);
    ecrire(racine, 'packages/site/docs/INTERFACE.md', '# site\n\nUn autre catalogue.\n');
    const r = lancer(racine, '--verifier');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(SORTIE);
    expect(engendre.verifier(racine).map(k => k.fichier)).toEqual([SORTIE]);
  });

  it('the project’s guards hold the core’s check alone, no module’s', () => {
    const racine = deuxLangages();
    const index = langageDe(racine)
      .gardes(racine)
      .filter(g => path.basename(g[0]).startsWith('index-'));
    expect(index).toEqual([[SCRIPT, '--verifier']]);
    expect(langageDe(racine).commandes(racine)['index-interfaces']).toEqual({
      script: SCRIPT,
      args: [],
    });
  });

  it('--publie asks the modules and leaves the index as it is', () => {
    const racine = deuxLangages();
    lancer(racine);
    const avant = lire(racine);
    const r = lancer(racine, '--publie', 'packages/site');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## Ce que les composants d'avant publient");
    expect(lire(racine)).toBe(avant);
  });
});
