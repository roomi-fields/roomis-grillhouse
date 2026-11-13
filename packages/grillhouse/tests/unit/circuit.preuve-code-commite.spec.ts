// La preuve du rouge s'abstient aussi quand le code du développeur est déjà commité sur la branche
// de la copie, en avance sur main, ou quand la fiche du développeur manque : le code de la copie est
// la vérité terrain, pas seulement `git status` ni la fiche. Un lot neuf dont le code n'est pas dans
// la copie exige toujours son rouge.
// Témoin : grillhouse-3ax (2026-11-09), travail complet et tests verts, la preuve refusait « 0 rouge »
// sous `--reprendre`, `--depuis developpeur` et `--depuis testwriter`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import * as circuit from '../../scripts/circuit.mjs';

interface Ctx {
  fiches: string;
  paquets: string[];
  copie: string;
  journal: string;
}
const codeDejaPresent = (circuit as Record<string, unknown>).codeDejaPresent as (
  ctx: Ctx
) => boolean;
const preuve = activites.preuve as (
  ctx: Ctx,
  o: { mesure: { cle: string; runs: unknown[] } }
) => { ok: boolean; rouges: number; texte: string };
// The key of the last measure of the copy <c>: its fingerprint and the files of the day of its lot.
const cleDuLot = (c: Parameters<typeof activites.testsDuLot>[0]) =>
  activites.cleDeLaMesure(c, activites.separerLesFichiersDuJour(c, activites.testsDuLot(c)).jour);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preuve-code-commite-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const alea = () => Math.random().toString(36).slice(2);

// A copy whose branch `main` holds the initial files; then the branch of the copy, which commits the
// production file when <commite> is set (ahead of main). <roles> are the sessions of the sheets;
// <fiches> false leaves the sheets file absent.
function copie(roles: string[], commite: boolean, fiches = true): Ctx {
  const dossier = path.join(ESSAIS, `copie-${alea()}`);
  mkdirSync(dossier);
  const git = (...a: string[]) =>
    spawnSync('git', ['-C', dossier, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  declarerLeLangage(dossier);
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', 'départ');
  git('checkout', '-q', '-b', 'agent/essai');
  if (commite) {
    writeFileSync(path.join(dossier, 'production.mjs'), 'export const x = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'le code du développeur');
  }
  const f = path.join(ESSAIS, `${alea()}.fiches.jsonl`);
  if (fiches) {
    writeFileSync(
      f,
      roles.map(role => `${JSON.stringify({ role, fiche: { statut: 'FAIT' } })}\n`).join('')
    );
  }
  return { fiches: f, paquets: ['packages/a'], copie: dossier, journal: path.join(ESSAIS, 'j') };
}

describe('le signe « le code est déjà dans la copie » sur du code commité', () => {
  it('is raised when the production code is committed on the copy’s branch ahead of main', () => {
    expect(codeDejaPresent(copie(['testwriter', 'developpeur'], true))).toBe(true);
  });

  it('is raised for the committed code even when the sheet of the developpeur is absent', () => {
    expect(codeDejaPresent(copie(['testwriter'], true))).toBe(true);
    expect(codeDejaPresent(copie([], true, false))).toBe(true);
  });

  it('is not raised when the copy holds no code ahead of main', () => {
    expect(codeDejaPresent(copie(['testwriter', 'developpeur'], false))).toBe(false);
    expect(codeDejaPresent(copie(['testwriter'], false))).toBe(false);
  });
});

describe('la preuve rejouée sur une copie dont le code est commité', () => {
  const rejouer = (c: Ctx) => preuve(c, { mesure: { cle: cleDuLot(c), runs: [] } });

  it('passes with no red and says the code is there when it is committed ahead of main', () => {
    const r = rejouer(copie(['explorateur', 'testwriter', 'developpeur'], true));
    expect(r.ok).toBe(true);
    expect(r.rouges).toBe(0);
    expect(r.texte).toContain('Le code du développeur est déjà dans la copie');
  });

  it('passes with no red when the code is committed and the sheet of the developpeur is lost', () => {
    const r = rejouer(copie(['explorateur', 'testwriter'], true));
    expect(r.ok).toBe(true);
    expect(r.texte).toContain('Le code du développeur est déjà dans la copie');
  });

  it('still demands its red from a new lot whose code is not in the copy', () => {
    const r = rejouer(copie(['explorateur', 'testwriter'], false));
    expect(r.ok).toBe(false);
    expect(r.texte).not.toContain('Le code du développeur est déjà dans la copie');
  });
});

// A measure is kept for the files it measured: the same tree measured on other files (a version
// that sets other files aside, grillhouse-2vl) is played again.
describe('la clé de la mesure de la preuve', () => {
  it('names the files it measures: the same tree on other files is another measure', () => {
    const c = copie(['explorateur', 'testwriter'], false);
    const avec = activites.cleDeLaMesure(c, ['a.test.ts', 'mods/b.test.ts']);
    expect(activites.cleDeLaMesure(c, ['a.test.ts', 'mods/b.test.ts'])).toBe(avec);
    expect(activites.cleDeLaMesure(c, ['a.test.ts'])).not.toBe(avec);
    expect(activites.cleDeLaMesure(c, [])).not.toBe(avec);
  });
});
