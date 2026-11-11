// The mark of the Node a project's dependencies were installed under (scripts/abi-des-dependances.mjs):
// written by a complete installation (`npm ci`), compared with the current Node by the night,
// which installs again on a gap, and by the session start, which names a known gap under
// « Manque » with `npm ci`. Small tests: files under a temporary directory.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MARQUE,
  ecartDesDependances,
  ligneDuManque,
  marquerApresInstallation,
  marquerLesDependances,
} from '../../scripts/abi-des-dependances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'abi-des-dependances-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project of trial, with node_modules unless <sansDependances>, its mark <marque> when given.
const projet = (o: { sansDependances?: boolean; marque?: string } = {}) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (!o.sansDependances) {
    mkdirSync(path.join(racine, 'node_modules'));
  }
  if (o.marque !== undefined) {
    writeFileSync(path.join(racine, MARQUE), `${o.marque}\n`);
  }
  return racine;
};

describe('the Node a project’s dependencies were installed under', () => {
  it('the mark holds the binary interface of the Node that installed them', () => {
    const racine = projet();
    marquerLesDependances(racine, '147');
    expect(readFileSync(path.join(racine, MARQUE), 'utf8').trim()).toBe('147');
    expect(ecartDesDependances(racine, '147')).toBeNull();
  });

  it('the current Node’s interface is the default mark', () => {
    const racine = projet();
    marquerLesDependances(racine);
    expect(ecartDesDependances(racine)).toBeNull();
  });

  it('dependencies marked under another Node are a gap that names their interface', () => {
    expect(ecartDesDependances(projet({ marque: '127' }), '147')).toEqual({ marquee: '127' });
  });

  it('dependencies without a mark are a gap of unknown interface', () => {
    expect(ecartDesDependances(projet(), '147')).toEqual({ marquee: null });
  });

  it('a project without node_modules has no gap', () => {
    expect(ecartDesDependances(projet({ sansDependances: true }), '147')).toBeNull();
  });
});

describe('the mark after an installation', () => {
  it('npm ci writes the mark of its Node', () => {
    const racine = projet();
    expect(marquerApresInstallation(racine, { npm_command: 'ci' }, '147')).toBe(true);
    expect(ecartDesDependances(racine, '147')).toBeNull();
  });

  it('npm install leaves the mark of the last complete installation', () => {
    const racine = projet({ marque: '127' });
    expect(marquerApresInstallation(racine, { npm_command: 'install' }, '147')).toBe(false);
    expect(ecartDesDependances(racine, '147')).toEqual({ marquee: '127' });
  });

  it('a run out of npm writes nothing', () => {
    const racine = projet();
    expect(marquerApresInstallation(racine, {}, '147')).toBe(false);
    expect(ecartDesDependances(racine, '147')).toEqual({ marquee: null });
  });
});

describe('the line « Manque » of the session start', () => {
  it('names both versions and the command npm ci for dependencies of another Node', () => {
    const ligne = ligneDuManque(projet({ marque: '127' }), '147', 'v26.13.0');
    expect(ligne).toContain('v26.13.0');
    expect(ligne).toContain('interface binaire 147');
    expect(ligne).toContain('interface binaire 127');
    expect(ligne).toContain('`npm ci`');
  });

  it('says nothing for dependencies of the current Node', () => {
    expect(ligneDuManque(projet({ marque: '147' }), '147', 'v26.13.0')).toBeNull();
  });

  it('says nothing without a mark, nor without node_modules', () => {
    expect(ligneDuManque(projet(), '147', 'v26.13.0')).toBeNull();
    expect(ligneDuManque(projet({ sansDependances: true }), '147', 'v26.13.0')).toBeNull();
  });
});
