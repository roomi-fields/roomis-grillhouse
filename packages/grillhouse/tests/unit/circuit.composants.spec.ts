// The circuit resolves the components a ticket's title names by the join, as the envelope does
// (`paquetsDuLangage`, scripts/enveloppe/paquets-du-plan.mjs, grillhouse-pkl.5), never by the
// workspaces of npm (grillhouse-x7c).
// Witness: OSC Bridge, its first circuit under 0.25.3 (2026-10-30): `npx grillhouse circuit
// OB-vch.1.3` stopped on « le composant « osc-bridge » du titre ne nomme ni un paquet ni un chemin
// du dépôt. », osc-bridge being the workspace of cargo whose application is the root crate
// (`[workspace] members = ["."]`, `[package] name = "osc-bridge"`).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composantsDe, resoudreComposant } from '../../scripts/circuit.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-composants-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// Writes the files <fichiers> (path → text) under a new directory <nom> of the trials.
function depot(nom: string, fichiers: Record<string, string>): string {
  const racine = path.join(ESSAIS, nom);
  for (const [rel, texte] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    writeFileSync(path.join(racine, rel), texte);
  }
  return racine;
}

describe('grillhouse-x7c, critère 1 — un crate racine se résout par son nom', () => {
  let restaurer = () => {};
  let espace = '';
  beforeAll(() => {
    restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
    espace = depot('osc-bridge', {
      'package.json': JSON.stringify({ name: 'osc-bridge', grillhouse: { langages: ['cargo'] } }),
      'Cargo.toml':
        '[workspace]\nmembers = [".", "crates/aide"]\n\n[package]\nname = "osc-bridge"\nversion = "0.1.0"\nedition = "2021"\n',
      'src/main.rs': 'fn main() {}\n',
      'crates/aide/Cargo.toml': '[package]\nname = "aide"\nversion = "0.1.0"\nedition = "2021"\n',
      'crates/aide/src/lib.rs': 'pub fn aide() {}\n',
    });
  });
  afterAll(() => restaurer());

  it('the root crate is the component « . », named by its crate', () => {
    expect(composantsDe(espace)).toContainEqual({
      dossier: '.',
      pkg: { name: 'osc-bridge' },
      hors: false,
    });
  });

  it('the title « n — sujet — osc-bridge » resolves the component « . »', () => {
    expect(resoudreComposant(composantsDe(espace), espace, 'osc-bridge')).toBe('.');
  });

  it('a crate of crates/ resolves by its name or by its path', () => {
    const liste = composantsDe(espace);
    expect(resoudreComposant(liste, espace, 'aide')).toBe('crates/aide');
    expect(resoudreComposant(liste, espace, 'crates/aide/')).toBe('crates/aide');
  });

  it('a name no component bears and no path of the repository holds is refused', () => {
    const liste = composantsDe(espace);
    expect(() => {
      resoudreComposant(liste, espace, 'inconnu');
    }).toThrow('le composant « inconnu » du titre ne nomme ni un paquet ni un chemin du dépôt.');
  });
});

describe('grillhouse-x7c, critère 2 — un projet typescript résout ses composants comme avant', () => {
  const projet = depot('typescript', {
    'package.json': JSON.stringify({
      name: 'essai',
      workspaces: ['packages/*'],
      grillhouse: { langages: ['typescript'] },
    }),
    'packages/a/package.json': JSON.stringify({ name: '@essai/a' }),
    'packages/h/package.json': JSON.stringify({ name: '@essai/h' }),
    'docs/agents/hors-cadre.txt': 'h un outil à part\n',
    'scripts/outil.mjs': '',
  });

  it('its components are its packages, the one out of the frame marked', () => {
    const liste = composantsDe(projet);
    expect(liste).toContainEqual({ dossier: 'packages/a', pkg: { name: '@essai/a' }, hors: false });
    expect(liste).toContainEqual({ dossier: 'packages/h', pkg: { name: '@essai/h' }, hors: true });
  });

  it('a package resolves by its name or its path, a folder of the root by its path, « . » as itself', () => {
    const liste = composantsDe(projet);
    expect(resoudreComposant(liste, projet, '@essai/a')).toBe('packages/a');
    expect(resoudreComposant(liste, projet, 'packages/a/')).toBe('packages/a');
    expect(resoudreComposant(liste, projet, '@essai/h')).toBe('packages/h');
    expect(resoudreComposant(liste, projet, 'scripts')).toBe('scripts');
    expect(resoudreComposant(liste, projet, '.')).toBe('.');
  });
});
