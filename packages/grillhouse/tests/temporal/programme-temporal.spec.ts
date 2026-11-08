// The helper of the night tests that names the program `temporal`: the variable TEMPORAL when it
// names an existing program, else the pinned program already laid down under the cache of the
// home, else a failure naming the variable and the command that lays it down.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EPINGLE } from '../../src/temporal/installation.js';
import { dossier, programmeTemporal } from './essai.js';

const avant = { HOME: process.env.HOME, TEMPORAL: process.env.TEMPORAL };
beforeEach(() => {
  delete process.env.TEMPORAL;
});
afterEach(() => {
  for (const [k, v] of Object.entries(avant)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

// A program of trial at <chemin>.
function programme(chemin: string): string {
  mkdirSync(path.dirname(chemin), { recursive: true });
  writeFileSync(chemin, '#!/bin/sh\n');
  chmodSync(chemin, 0o755);
  return chemin;
}

describe('the program temporal named by the helper of the night tests', () => {
  it('is the variable TEMPORAL when it names an existing program', () => {
    const maison = dossier('maison');
    process.env.HOME = maison;
    programme(path.join(maison, '.cache/grillhouse/temporal', EPINGLE.version, 'temporal'));
    const p = programme(path.join(dossier('variable'), 'temporal'));
    process.env.TEMPORAL = p;
    expect(programmeTemporal()).toBe(p);
  });

  it('is the pinned program already laid down under the cache of the home, the variable absent', () => {
    const maison = dossier('maison');
    process.env.HOME = maison;
    const pose = programme(
      path.join(maison, '.cache/grillhouse/temporal', EPINGLE.version, 'temporal')
    );
    expect(programmeTemporal()).toBe(pose);
  });

  it('is the pinned program laid down when the variable names a program that does not exist', () => {
    const maison = dossier('maison');
    process.env.HOME = maison;
    const pose = programme(
      path.join(maison, '.cache/grillhouse/temporal', EPINGLE.version, 'temporal')
    );
    process.env.TEMPORAL = path.join(maison, 'nulle-part/temporal');
    expect(programmeTemporal()).toBe(pose);
  });

  it('fails naming the variable and the command that lays the program down, without either', () => {
    process.env.HOME = dossier('maison');
    expect(() => programmeTemporal()).toThrow(/TEMPORAL/);
    expect(() => programmeTemporal()).toThrow('npx grillhouse temporal installer --programme-seul');
    expect(() => programmeTemporal()).not.toThrow(/grillhouse\.outils/);
  });
});
