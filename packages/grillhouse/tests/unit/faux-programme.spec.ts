// La pose d'un faux programme (./faux-programme.ts), que la matière de test lance aussitôt.
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { poserLeFauxProgramme } from './faux-programme.js';

const DOSSIER = mkdtempSync(path.join(tmpdir(), 'faux-programme-'));
afterAll(() => rmSync(DOSSIER, { recursive: true, force: true }));
const essai = () => mkdtempSync(path.join(DOSSIER, 'essai-'));

describe('le faux programme d’un essai', () => {
  it('se lance alors qu’un écrivain tient encore le fichier qu’il remplace, sans ETXTBSY', () => {
    const programme = path.join(essai(), 'programme');
    const ecrivain = openSync(programme, 'w', 0o755);
    try {
      poserLeFauxProgramme(programme, '#!/bin/sh\necho pose\n');
      expect(execFileSync(programme, { encoding: 'utf8' })).toBe('pose\n');
    } finally {
      closeSync(ecrivain);
    }
  });

  it('reçoit ses arguments et son nom, trouvé par un PATH réduit à son dossier', () => {
    const d = essai();
    poserLeFauxProgramme(path.join(d, 'outil'), '#!/bin/sh\necho "${0##*/}" "$@"\n');
    const lance = execFileSync('/bin/sh', ['-c', 'outil un "deux mots"'], {
      encoding: 'utf8',
      env: { PATH: d },
    });
    expect(lance).toBe('outil un deux mots\n');
  });

  it('suit l’interpréteur et son argument que nomme sa première ligne', () => {
    const programme = path.join(essai(), 'outil');
    poserLeFauxProgramme(programme, '#!/usr/bin/env node\nprocess.stdout.write("pose");\n');
    expect(execFileSync(programme, { encoding: 'utf8' })).toBe('pose');
  });

  it('prend son nouveau texte quand il est reposé', () => {
    const programme = path.join(essai(), 'outil');
    poserLeFauxProgramme(programme, '#!/bin/sh\necho avant\n');
    poserLeFauxProgramme(programme, '#!/bin/sh\necho apres\n');
    expect(execFileSync(programme, { encoding: 'utf8' })).toBe('apres\n');
  });
});
