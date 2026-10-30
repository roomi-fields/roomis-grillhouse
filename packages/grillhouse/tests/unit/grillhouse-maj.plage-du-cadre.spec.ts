// grillhouse-49r — the update brings the frame's range up in every manifest of the project, as
// `npm install <pkg>@<version> --workspaces`, Renovate and syncpack align every declaration of a
// dependency of the workspace. Witness: BPScript at 0.25.1 (bp-mono-vbwf.322.15), whose packages
// declared "@roomi-fields/grillhouse": "^0.24.0" in their devDependencies: npm kept a copy 0.24.15
// under each packages/*/node_modules, where the entry ./vitest-config/duree does not resolve.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  alignerLaPlageDuCadre,
  miseAJour,
  rapport,
} from '../../scripts/langages/typescript/mise-a-jour.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-maj-plage-du-cadre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const CADRE = '@roomi-fields/grillhouse';
type Pkg = {
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

// A project of <manifestes> (directory → package.json), its root's read back as the core gives it.
function projet(manifestes: Record<string, Pkg>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [dossier, pkg] of Object.entries(manifestes)) {
    mkdirSync(path.join(racine, dossier), { recursive: true });
    writeFileSync(path.join(racine, dossier, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return racine;
}
const lire = (racine: string, dossier: string) =>
  JSON.parse(readFileSync(path.join(racine, dossier, 'package.json'), 'utf8')) as Pkg;

describe('grillhouse-49r — la mise à jour monte la plage du cadre dans chaque manifeste', () => {
  it('the share of typescript brings the ranges up before it declares the frame in a tested package', () => {
    const racine = projet({
      '.': { workspaces: ['packages/*'], devDependencies: { [CADRE]: '^0.24.0' } },
      'packages/a': { devDependencies: { [CADRE]: '^0.24.0' } },
      'packages/b': { dependencies: { [CADRE]: '^0.24.0' } },
      'packages/teste': {},
    });
    const p = lire(racine, '.');
    const source = mkdtempSync(path.join(ESSAIS, 'source-'));
    const part = miseAJour((_r, c) => c.nom === 'teste').appliquer(racine, {
      p,
      modele: {},
      source,
      version: '0.25.1',
    });
    expect(p.devDependencies?.[CADRE]).toBe('^0.25.1');
    expect(lire(racine, 'packages/a').devDependencies?.[CADRE]).toBe('^0.25.1');
    expect(lire(racine, 'packages/b').dependencies?.[CADRE]).toBe('^0.25.1');
    expect(lire(racine, 'packages/teste').devDependencies?.[CADRE]).toBe('^0.25.1');
    // The tested package receives the root's range already brought up: it is no manifest brought up.
    expect(part.bilan.plageDuCadre).toEqual({
      plage: '^0.25.1',
      manifestes: ['package.json', 'packages/a/package.json', 'packages/b/package.json'],
    });
    expect(part.lignes.join('\n')).toContain('Plage du cadre');
    expect(part.installer).toBe(true);
  });

  it('two packages at ^0.24.0 pass to ^<version>, the root too; the report names each manifest', () => {
    const racine = projet({
      '.': { workspaces: ['packages/*'], devDependencies: { [CADRE]: '^0.24.0' } },
      'packages/a': { devDependencies: { [CADRE]: '^0.24.0', vitest: '^3.2.4' } },
      'packages/b': { dependencies: { [CADRE]: '^0.24.0' } },
    });
    const p = lire(racine, '.');
    const bilan = alignerLaPlageDuCadre(racine, p, '0.25.1');
    expect(p.devDependencies?.[CADRE]).toBe('^0.25.1');
    expect(lire(racine, 'packages/a').devDependencies).toEqual({
      [CADRE]: '^0.25.1',
      vitest: '^3.2.4',
    });
    expect(lire(racine, 'packages/b').dependencies?.[CADRE]).toBe('^0.25.1');
    expect(bilan).toEqual({
      plage: '^0.25.1',
      manifestes: ['package.json', 'packages/a/package.json', 'packages/b/package.json'],
    });
    const lignes = rapport({ plageDuCadre: bilan }).join('\n');
    for (const m of bilan!.manifestes) {
      expect(lignes).toContain(m);
    }
    expect(lignes).toContain('^0.25.1');
  });

  it('a range that already covers the version stays, and nothing changes', () => {
    const racine = projet({
      '.': { workspaces: ['packages/*'], devDependencies: { [CADRE]: '^0.25.0' } },
      'packages/a': { devDependencies: { [CADRE]: '>=0.24.0' } },
    });
    const avant = readFileSync(path.join(racine, 'packages/a/package.json'), 'utf8');
    const p = lire(racine, '.');
    expect(alignerLaPlageDuCadre(racine, p, '0.25.1')).toBeNull();
    expect(p.devDependencies?.[CADRE]).toBe('^0.25.0');
    expect(readFileSync(path.join(racine, 'packages/a/package.json'), 'utf8')).toBe(avant);
  });

  it('a range above the version, or one that is no range of versions, stays', () => {
    const racine = projet({
      '.': { workspaces: ['packages/*'] },
      'packages/a': { devDependencies: { [CADRE]: '^0.26.0' } },
      'packages/b': { devDependencies: { [CADRE]: 'file:../grillhouse' } },
    });
    expect(alignerLaPlageDuCadre(racine, lire(racine, '.'), '0.25.1')).toBeNull();
    expect(lire(racine, 'packages/a').devDependencies?.[CADRE]).toBe('^0.26.0');
    expect(lire(racine, 'packages/b').devDependencies?.[CADRE]).toBe('file:../grillhouse');
  });

  it('a project without workspaces: its root alone is brought up', () => {
    const racine = projet({ '.': { devDependencies: { [CADRE]: '~0.24.3' } } });
    const p = lire(racine, '.');
    expect(alignerLaPlageDuCadre(racine, p, '0.25.1')).toEqual({
      plage: '^0.25.1',
      manifestes: ['package.json'],
    });
    expect(p.devDependencies?.[CADRE]).toBe('^0.25.1');
  });
});
