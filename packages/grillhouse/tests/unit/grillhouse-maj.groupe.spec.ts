/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// `grillhouse maj` pose, dans la configuration de Beads de chaque projet, les projets externes
// (`external_projects.<nom>`) que déclare son groupe (`grillhouse.groupe` du package.json) : les
// autres projets du groupe, chacun par son nom et son chemin absolu. La montée joue Beads par
// l'option `bd(args, cwd)` (un `{ status, stdout, stderr }`), `config get` rendant la valeur, ou
// « <clé> (not set in config.yaml) » quand elle manque ; `bilan.projetsExternes` nomme ceux qu'elle
// a posés. Rejouée sur un groupe déjà posé, elle ne pose rien. Un groupe mal formé est refusé,
// nommé par sa clé, avant tout travail.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { afterAll, describe, expect, it } from 'vitest';
import { mettreAJour } from '../../scripts/grillhouse-maj.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-maj-groupe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');

// Un projet de TypeScript dont `grillhouse.groupe` vaut <groupe> (absent quand undefined).
function projet(nom: string, groupe?: unknown) {
  const racine = path.join(ESSAIS, nom);
  mkdirSync(racine, { recursive: true });
  writeFileSync(
    path.join(racine, 'package.json'),
    `${JSON.stringify({ name: nom, ...(groupe === undefined ? {} : { grillhouse: { groupe } }) })}\n`
  );
  declarerLesLangages(racine);
  return racine;
}

// Un Beads de substitution : la configuration de chaque projet, et chaque appel gardé.
function beads() {
  const config = new Map<string, Map<string, string>>();
  const appels: Array<{ args: string[]; cwd: string }> = [];
  const bd = (args: string[], cwd: string) => {
    appels.push({ args, cwd });
    const c = config.get(cwd) ?? config.set(cwd, new Map()).get(cwd)!;
    if (args[0] === 'config' && args[1] === 'set') {
      c.set(args[2], args[3]);
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'config' && args[1] === 'get') {
      const v = c.get(args[2]);
      return { status: 0, stdout: v ?? `${args[2]} (not set in config.yaml)\n`, stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  const poses = (cwd: string) => Object.fromEntries(config.get(cwd) ?? []);
  const ecritures = () => appels.filter(a => a.args[0] === 'config' && a.args[1] === 'set');
  return { bd, poses, ecritures, appels };
}

describe('la montée pose les projets externes depuis la déclaration du groupe', () => {
  it('chaque projet reçoit les autres projets de son groupe, par nom et chemin absolu', () => {
    const sh = projet('synthub');
    const ob = projet('osc-bridge');
    const osd = projet('osd');
    const liste = [sh, ob, osd];
    for (const [nom, racine] of [
      ['synthub', sh],
      ['osc-bridge', ob],
      ['osd', osd],
    ]) {
      writeFileSync(
        path.join(racine, 'package.json'),
        `${JSON.stringify({ name: nom, grillhouse: { groupe: liste } })}\n`
      );
    }
    const b = beads();
    const bilan = mettreAJour(sh, DEPOT, { bd: b.bd });
    mettreAJour(ob, DEPOT, { bd: b.bd });
    expect(b.poses(sh)).toEqual({
      'external_projects.osc-bridge': ob,
      'external_projects.osd': osd,
    });
    expect(b.poses(ob)).toEqual({
      'external_projects.synthub': sh,
      'external_projects.osd': osd,
    });
    expect([...bilan.projetsExternes].sort()).toEqual(['osc-bridge', 'osd']);
  });

  it('rejouée sur un groupe déjà posé, la montée ne change rien', () => {
    const sh = projet('synthub-2');
    const ob = projet('osc-bridge-2');
    writeFileSync(
      path.join(sh, 'package.json'),
      `${JSON.stringify({ name: 'sh', grillhouse: { groupe: [sh, ob] } })}\n`
    );
    const b = beads();
    mettreAJour(sh, DEPOT, { bd: b.bd });
    expect(b.ecritures().length).toBeGreaterThan(0);
    const avant = b.ecritures().length;
    const bilan = mettreAJour(sh, DEPOT, { bd: b.bd });
    expect(b.ecritures().length).toBe(avant);
    expect(bilan.projetsExternes).toEqual([]);
  });

  it('un chemin du groupe qui change est reposé', () => {
    const sh = projet('synthub-3');
    const ob = projet('osc-bridge-3');
    const ob2 = projet('osc-bridge-3-bis');
    const ecrire = (liste: string[]) =>
      writeFileSync(
        path.join(sh, 'package.json'),
        `${JSON.stringify({ name: 'sh', grillhouse: { groupe: liste } })}\n`
      );
    const b = beads();
    ecrire([sh, ob]);
    mettreAJour(sh, DEPOT, { bd: b.bd });
    ecrire([sh, ob2]);
    mettreAJour(sh, DEPOT, { bd: b.bd });
    expect(b.poses(sh)['external_projects.osc-bridge-3-bis']).toBe(ob2);
  });

  it('un projet sans groupe ne pose rien et ne joue aucun Beads', () => {
    const seul = projet('seul');
    const b = beads();
    const bilan = mettreAJour(seul, DEPOT, { bd: b.bd });
    expect(b.appels).toEqual([]);
    expect(bilan.projetsExternes).toEqual([]);
  });
});

describe('un groupe mal déclaré est refusé par son nom avant tout travail', () => {
  it.each([
    ['un chemin absent', (_: string) => ['/chemin/qui/n/existe/pas']],
    ['un doublon', (sh: string) => [sh, sh]],
    ['une clé mal formée', () => 'osc-bridge'],
  ])('%s : la montée échoue en nommant grillhouse.groupe, sans rien écrire', (_nom, groupe) => {
    const sh = projet(`refus-${_nom.replaceAll(' ', '-')}`);
    const declare = groupe(sh);
    writeFileSync(
      path.join(sh, 'package.json'),
      `${JSON.stringify({ name: 'sh', grillhouse: { groupe: declare } })}\n`
    );
    const avant = readFileSync(path.join(sh, 'package.json'), 'utf8');
    const b = beads();
    expect(() => mettreAJour(sh, DEPOT, { bd: b.bd })).toThrow(/grillhouse\.groupe/);
    expect(b.appels).toEqual([]);
    expect(readFileSync(path.join(sh, 'package.json'), 'utf8')).toBe(avant);
  });
});
