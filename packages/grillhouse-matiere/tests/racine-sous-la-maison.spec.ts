import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { racineSousLaMaison } from '../src/machine.js';

// The owner of a trial directory under the home (docs/INTERFACE.md, `racineSousLaMaison`): the file
// `.grillhouse-base` names the pass, its process, its start and its PID namespace.
const proprietaire = (dossier: string) =>
  JSON.parse(readFileSync(path.join(dossier, '.grillhouse-base'), 'utf8')) as Record<
    string,
    unknown
  >;

// The start of a process, field 22 of /proc/<pid>/stat (after the command).
const departDe = (pid: number) => {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
};

describe('racineSousLaMaison, propriétaire du dossier d’essai', () => {
  let travail: string;
  let tmpdirAvant: string | undefined;

  beforeEach(() => {
    travail = mkdtempSync(path.join(tmpdir(), 'racine-maison-'));
    tmpdirAvant = process.env.TMPDIR;
  });
  afterEach(() => {
    if (tmpdirAvant === undefined) {
      delete process.env.TMPDIR;
    } else {
      process.env.TMPDIR = tmpdirAvant;
    }
    rmSync(travail, { recursive: true, force: true });
  });

  it('un dossier sans base de passe nomme le processus courant, son départ et son espace', () => {
    process.env.TMPDIR = path.join(travail, 'sans-base');
    mkdirSync(process.env.TMPDIR);
    const dossier = racineSousLaMaison('grillhouse-essais-', path.join(travail, 'maison'));
    expect(proprietaire(dossier)).toEqual({
      pid: process.pid,
      depart: departDe(process.pid),
      espace: readlinkSync('/proc/self/ns/pid'),
    });
  });

  it('un dossier nomme la passe du dossier de base que TMPDIR désigne, non le processus courant', () => {
    const base = path.join(travail, 'grillhouse-tests-AAAAAA');
    mkdirSync(path.join(base, 't'), { recursive: true });
    const passe = { pid: 424242, depart: '987654', espace: 'pid:[4026531836]' };
    writeFileSync(path.join(base, '.grillhouse-base'), `${JSON.stringify(passe)}\n`);
    process.env.TMPDIR = path.join(base, 't');
    const dossier = racineSousLaMaison('grillhouse-essais-', path.join(travail, 'maison'));
    expect(proprietaire(dossier)).toEqual(passe);
  });

  it('deux passes concurrentes ont des dossiers qui nomment chacune la leur', () => {
    const passes = ['A', 'B'].map((lettre, i) => {
      const base = path.join(travail, `grillhouse-tests-${lettre}`);
      mkdirSync(path.join(base, 't'), { recursive: true });
      const passe = { pid: 5000 + i, depart: String(100 + i), espace: 'pid:[1]' };
      writeFileSync(path.join(base, '.grillhouse-base'), `${JSON.stringify(passe)}\n`);
      return { base, passe };
    });
    const maison = path.join(travail, 'maison');
    const dossiers = passes.map(({ base }) => {
      process.env.TMPDIR = path.join(base, 't');
      return racineSousLaMaison('grillhouse-essais-', maison);
    });
    expect(dossiers.map(proprietaire)).toEqual(passes.map(p => p.passe));
  });

  it('le dossier garde son nom <prefixe>XXXXXX sous ~/.cache de la maison', () => {
    process.env.TMPDIR = travail;
    const maison = path.join(travail, 'maison');
    const dossier = racineSousLaMaison('grillhouse-essais-', maison);
    expect(path.dirname(dossier)).toBe(path.join(maison, '.cache'));
    expect(path.basename(dossier)).toMatch(/^grillhouse-essais-[A-Za-z0-9]{6}$/);
  });
});
