// A file left with the marks of a conflict never closes a copy, as git refuses to record an unmerged
// path and pre-commit's check-merge-conflict a file that carries a marker: the sheet FAIT of a
// session is refused while a file of its role carries marks, and a launch the launcher refuses on a
// conflict in the other role's files goes to that role first (scripts/seances.mjs, `seance`).
// Witness: SyntHub SH-ae6.10.32 under 0.47.1, a developpeur's sheet accepted with « <<<<<<< ours »
// left in site/pages/site.py, then two launches of the testwriter refused, the stop « lancement »
// twice, until a gesture by hand in the copy.
//
// Each case plays the real git in a repository of trial and a launcher of trial (GRILLHOUSE_LANCEUR)
// that refuses the testwriter while src/a.txt carries marks, as lancer.sh refuses a role that
// writes none of the files in conflict.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as travail from '../../scripts/enveloppe/travail-de-la-copie.mjs';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'conflit-au-lancement-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const seance = seances.seance as (ctx: object, role: string, options: object) => Promise<unknown>;
const marquesRestantes = (
  travail as unknown as { marquesRestantes: (copie: string, suspects?: string[]) => string[] }
).marquesRestantes;

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
const lignes = (deuxieme: string) => `l1\n${deuxieme}\nl3\nl4\nl5\nl6\nl7\n`;
const CODE = 'src/a.txt';
const estUnTest = (f: string) => f.startsWith('tests/');
// The piece of a sheet BLOQUÉ or BESOIN: a line of the file in conflict.
const PIECE = `${CODE}:1 la première ligne du fichier en conflit.`;

// The repository of trial, the copy of demo-1 in conflict with main on src/a.txt (the developpeur's
// file), and the launcher of trial: it refuses the testwriter while src/a.txt carries marks, or
// every testwriter with <refus>; the developpeur resolves src/a.txt from its launch number <resout>,
// puts it in the index as it is with <indexe>, leaves the index as HEAD has it from its second
// launch with <remet> (as the advance of the copy does), and ends on the sheet <fiche>; <lots>, the
// tests of the lot the copy holds.
function essai({
  resout = 1,
  refus = false,
  indexe = false,
  remet = false,
  fiche = { statut: 'FAIT' } as object,
  lots = [] as string[],
} = {}) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  mkdirSync(path.join(racine, 'src'));
  mkdirSync(path.join(racine, 'tests'));
  writeFileSync(path.join(racine, CODE), lignes('l2'));
  writeFileSync(path.join(racine, 'tests/a.test.txt'), 't\n');
  writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
  // The judgment of a session's lot reads the language of the package it changes.
  declarerLeLangage(racine);
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  writeFileSync(path.join(racine, CODE), lignes('MAIN'));
  git(racine, 'commit', '-qam', 'main');
  writeFileSync(path.join(copie, CODE), lignes('COPIE'));
  const avance = travail.avancer(copie, git(racine, 'rev-parse', 'HEAD')) as { ok: boolean };
  expect(avance.ok).toBe(false);
  expect(readFileSync(path.join(copie, CODE), 'utf8')).toMatch(/^<<<<<<< /m);
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  const compte = path.join(tmp, 'lancements');
  const lanceur = path.join(tmp, 'lancer.sh');
  writeFileSync(
    lanceur,
    [
      '#!/bin/sh',
      `echo "$*" >> ${compte}`,
      'role=$(echo "$*" | awk \'{print $(NF-2)}\')',
      'id=$(echo "$*" | sed -n \'s/.*--\\(seance\\|reprise\\) \\([^ ]*\\).*/\\2/p\')',
      `if [ "$role" = testwriter ] && { [ ${refus ? 1 : 0} -eq 1 ] || grep -q '^<<<<<<< ' ${copie}/${CODE}; }; then echo "la copie garde des conflits" >&2; exit 3; fi`,
      `r=${tmp}/seances/$id`,
      'mkdir -p $r',
      `mkdir -p ${tmp}/transcriptions; echo '{}' > ${tmp}/transcriptions/$id.jsonl`,
      `if [ "$role" = developpeur ] && [ $(grep -c " developpeur " ${compte}) -ge ${resout} ]; then printf 'resolu\n' > ${copie}/${CODE}; fi`,
      `if [ "$role" = developpeur ] && [ ${indexe ? 1 : 0} -eq 1 ]; then git -C ${copie} add -- ${CODE}; fi`,
      `if [ "$role" = developpeur ] && [ ${remet ? 1 : 0} -eq 1 ] && [ $(grep -c " developpeur " ${compte}) -ge 2 ]; then git -C ${copie} reset -q; fi`,
      `if [ "$role" = developpeur ]; then cat ${tmp}/fiche-du-developpeur.json > $r/resultat.json; else echo '{"structured_output":{"statut":"FAIT"}}' > $r/resultat.json; fi`,
      'echo 0 > $r/fin',
      '',
    ].join('\n')
  );
  chmodSync(lanceur, 0o755);
  writeFileSync(
    path.join(tmp, 'fiche-du-developpeur.json'),
    JSON.stringify({ structured_output: fiche })
  );
  // The signs of life of the launches, in their order.
  const signes: { seanceId: string; lancement: string }[] = [];
  const ctx: Record<string, unknown> = {
    racine,
    copie,
    ticket: 'demo-1',
    sujet: 'essai',
    paquets: ['.'],
    tmp,
    journal: path.join(tmp, 'journal'),
    fiches: path.join(tmp, 'fiches.jsonl'),
    transcriptions: path.join(tmp, 'transcriptions'),
    immobileMs: 60_000,
    bd: () => ({ status: 0, stdout: '[{}]', stderr: '' }),
  };
  const lancements = () => {
    try {
      return readFileSync(compte, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => l.split(' ').at(-3));
    } catch {
      return [];
    }
  };
  // The instruction of the launch number <n> (the last argument of the launcher).
  const consigne = (n: number) => {
    const l = readFileSync(compte, 'utf8').split('\n').filter(Boolean)[n - 1];
    return readFileSync(l.split(' ').at(-1) as string, 'utf8');
  };
  const jouer = async (role: string, options: object = {}) => {
    const avant = process.env.GRILLHOUSE_LANCEUR;
    process.env.GRILLHOUSE_LANCEUR = lanceur;
    try {
      return (await seance(ctx, role, {
        tentative: 1,
        derniere: false,
        seanceId: `seance-${role}`,
        constats: [],
        lectures: { lots: () => lots, references: () => [] },
        prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
        signeDeVie: (vie: { seanceId: string; lancement: string } | null) => {
          if (vie) {
            signes.push(vie);
          }
        },
        estUnTest,
        ...options,
      })) as { fiche: unknown };
    } finally {
      if (avant === undefined) {
        delete process.env.GRILLHOUSE_LANCEUR;
      } else {
        process.env.GRILLHOUSE_LANCEUR = avant;
      }
    }
  };
  return { ctx, copie, lancements, consigne, jouer, signes };
}

describe('les fichiers d’une copie qui portent encore les marques d’un conflit', () => {
  it('names a file unmerged that carries marks, one put in the index with them, and a suspect the index no longer says in conflict; not a resolved one', () => {
    const e = essai();
    expect(marquesRestantes(e.copie)).toEqual([CODE]);
    git(e.copie, 'add', '--', CODE);
    expect(marquesRestantes(e.copie)).toEqual([CODE]);
    git(e.copie, 'reset', '-q');
    expect(marquesRestantes(e.copie)).toEqual([]);
    expect(marquesRestantes(e.copie, [CODE, 'tests/a.test.txt'])).toEqual([CODE]);
    writeFileSync(path.join(e.copie, CODE), 'resolu\n');
    expect(marquesRestantes(e.copie, [CODE])).toEqual([]);
  });
});

describe('la fiche d’une séance dont un fichier porte encore une marque de conflit est refusée', () => {
  it('the sheet FAIT is refused, the session resumed once with the file named, and its sheet kept once the marks are gone', async () => {
    const e = essai({ resout: 2 });
    const r = await e.jouer('developpeur');
    expect(r.fiche).toMatchObject({ statut: 'FAIT' });
    expect(e.lancements()).toEqual(['developpeur', 'developpeur']);
    expect(e.consigne(2)).toContain(CODE);
    expect(e.consigne(2)).toMatch(/marques? de conflit/);
  });

  it('the first instruction names the files of the role still in conflict', async () => {
    const e = essai({ resout: 1 });
    await e.jouer('developpeur');
    expect(e.lancements()).toEqual(['developpeur']);
    expect(e.consigne(1)).toContain(CODE);
    expect(e.consigne(1)).toMatch(/marques? de conflit/);
  });

  it('marks left twice stop the circuit « sans-fiche », the file named', async () => {
    const e = essai({ resout: 99 });
    await expect(e.jouer('developpeur')).rejects.toMatchObject({
      nom: 'sans-fiche',
      rapport: expect.stringContaining(CODE) as unknown,
    });
    expect(e.lancements()).toEqual(['developpeur', 'developpeur']);
  });
});

describe('un lancement refusé sur un conflit va d’abord au rôle qui écrit le fichier', () => {
  it('the testwriter refused on the developpeur’s file: the developpeur’s session first, its file named, then the testwriter’s', async () => {
    const e = essai({ resout: 1 });
    const r = await e.jouer('testwriter');
    expect(r.fiche).toMatchObject({ statut: 'FAIT' });
    expect(e.lancements()).toEqual(['testwriter', 'developpeur', 'testwriter']);
    expect(e.consigne(2)).toContain(CODE);
    expect(e.consigne(2)).toMatch(/marques? de conflit/);
  });

  it('a launch still refused after the other role’s session stops « lancement », without a loop', async () => {
    const e = essai({ resout: 1, refus: true });
    await expect(e.jouer('testwriter')).rejects.toMatchObject({ nom: 'lancement' });
    expect(e.lancements()).toEqual(['testwriter', 'developpeur', 'testwriter']);
  });

  it('a launch refused on a copy without marks stops « lancement » as before', async () => {
    const e = essai({ refus: true });
    writeFileSync(path.join(e.copie, CODE), 'resolu\n');
    await expect(e.jouer('testwriter')).rejects.toMatchObject({ nom: 'lancement' });
    expect(e.lancements()).toEqual(['testwriter']);
  });
});

describe('la séance du détour vers l’autre rôle porte sa consigne, son identité et sa question', () => {
  it('its instruction names its files in its report, and says neither a green lot nor these files as the tests of the lot', async () => {
    const e = essai({ resout: 1, lots: ['tests/a.test.txt'] });
    await e.jouer('testwriter', { fichiers: ['tests/a.test.txt'] });
    expect(e.lancements()).toEqual(['testwriter', 'developpeur', 'testwriter']);
    const detour = e.consigne(2);
    expect(detour).toContain(CODE);
    expect(detour).toMatch(/marques? de conflit/);
    expect(detour).not.toContain('le reste du lot est vert');
    expect(detour).not.toContain(`déjà dans la copie : ${CODE}`);
    expect(detour).toContain('le lot de tests, déjà dans la copie : tests/a.test.txt');
  });

  it('an attempt played again after the detour launches the session of the role asked, not the sheet the detour ranged', async () => {
    const e = essai({ resout: 1 });
    await e.jouer('testwriter');
    expect(e.lancements()).toEqual(['testwriter', 'developpeur', 'testwriter']);
    // The attempt dies once the detour's session has ranged its result: its last sign of life.
    const duDetour = e.signes.filter(s => s.seanceId !== 'seance-testwriter').at(-1);
    expect(duDetour).toBeDefined();
    e.ctx.essaiDeLActe = 2;
    const r = await e.jouer('testwriter', { precedent: duDetour });
    expect(r.fiche).toMatchObject({ statut: 'FAIT' });
    expect(e.lancements().slice(3)).toEqual(['testwriter']);
  });

  it('the launches of the detour and those of the role asked carry two identities', async () => {
    const e = essai({ resout: 1 });
    await e.jouer('testwriter');
    const duRole = e.signes.filter(s => s.seanceId === 'seance-testwriter').map(s => s.lancement);
    const duDetour = e.signes.filter(s => s.seanceId !== 'seance-testwriter').map(s => s.lancement);
    expect(duDetour.length).toBeGreaterThan(0);
    expect(duRole.length).toBeGreaterThan(0);
    expect(duRole.filter(l => duDetour.includes(l))).toEqual([]);
  });

  it('a sheet BESOIN of the detour goes up « besoin » with its question, the role asked not relaunched', async () => {
    const question = 'Quelle version de src/a.txt garder, celle de main ou celle du lot ?';
    const e = essai({ fiche: { statut: 'BESOIN', question, piece: PIECE } });
    await expect(e.jouer('testwriter')).rejects.toMatchObject({
      nom: 'besoin',
      rapport: expect.stringContaining(question) as unknown,
      question: expect.stringContaining(question) as unknown,
    });
    expect(e.lancements()).toEqual(['testwriter', 'developpeur']);
  });

  it('a sheet BLOQUÉ of the detour goes up « hors-portee » with its reason, the role asked not relaunched', async () => {
    const raison = 'src/a.txt ne se résout pas sans le choix du responsable.';
    const e = essai({ fiche: { statut: 'BLOQUÉ', raison, piece: PIECE } });
    await expect(e.jouer('testwriter')).rejects.toMatchObject({
      nom: 'hors-portee',
      rapport: expect.stringContaining(raison) as unknown,
    });
    expect(e.lancements()).toEqual(['testwriter', 'developpeur']);
  });
});

describe('un fichier marqué que la séance met à l’index refuse encore sa fiche', () => {
  it('the sheet FAIT of a session that put its marked file in the index is refused, the file named', async () => {
    const e = essai({ resout: 2, indexe: true });
    const r = await e.jouer('developpeur');
    expect(r.fiche).toMatchObject({ statut: 'FAIT' });
    expect(e.lancements()).toEqual(['developpeur', 'developpeur']);
    expect(e.consigne(2)).toContain(CODE);
    expect(e.consigne(2)).toMatch(/marques? de conflit/);
  });

  it('a file seen with its marks stays looked at once the index is left as HEAD has it: the second sheet FAIT is refused too', async () => {
    const e = essai({ resout: 99, indexe: true, remet: true });
    await expect(e.jouer('developpeur')).rejects.toMatchObject({
      nom: 'sans-fiche',
      rapport: expect.stringContaining(CODE) as unknown,
    });
    expect(e.lancements()).toEqual(['developpeur', 'developpeur']);
    expect(git(e.copie, 'diff', '--cached', '--name-only')).toBe('');
  });
});
