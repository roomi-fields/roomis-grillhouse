// La preuve du rouge s'abstient quand le code du comportement est déjà dans la copie : ses tests
// sont verts parce que le code est là, aucun ne peut rougir. Le signe (`codeDejaPresent`) est la
// vérité terrain : une séance développeur dans les fiches ET un changement de production présent
// dans la copie — pas l'ordre des séances. Une séance du testwriter après celle du développeur (un
// RENDU) ne retire pas le code : le signe tient. `preuveReussie` le reçoit en option
// (`codePresent`), juste après `inchange`. Un lot dont le code n'est pas dans la copie reste refusé
// sans rouge.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import * as circuit from '../../scripts/circuit.mjs';
import * as transitions from '../../scripts/transitions.mjs';

interface Compte {
  fichiers: number;
  rouges: number;
  casses: number;
  nommes: number;
  nonNommes: number;
  anciens: number;
  misDeCote?: number;
}
const preuveReussie = activites.preuveReussie as (
  compte: Compte,
  options: { inchange: boolean; codePresent?: boolean }
) => boolean;
const codeDejaPresent = (circuit as Record<string, unknown>).codeDejaPresent as (ctx: {
  fiches: string;
  paquets: string[];
  copie: string;
}) => boolean;
const apresLaPreuve = transitions.apresLaPreuve as (o: {
  rouges: number;
  pourLeDeveloppeur: boolean;
  inchange: boolean;
}) => string;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preuve-code-present-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ctx = (roles: string[]) => {
  const fiches = path.join(ESSAIS, `${Math.random().toString(36).slice(2)}.fiches.jsonl`);
  writeFileSync(
    fiches,
    roles.map(role => `${JSON.stringify({ role, fiche: { statut: 'FAIT' } })}\n`).join('')
  );
  return { fiches, paquets: ['packages/a'] };
};

const vide: Compte = { fichiers: 0, rouges: 0, casses: 0, nommes: 0, nonNommes: 0, anciens: 0 };
const nomme: Compte = { ...vide, fichiers: 1, nommes: 3, nonNommes: 2 };
const sans = { inchange: false };
const avec = { inchange: false, codePresent: true };

describe('la preuve du rouge quand le code du développeur est déjà dans la copie', () => {
  it('passes with no red when the code is already there, even with the greens the sheet names', () => {
    expect(preuveReussie(vide, avec)).toBe(true);
    expect(preuveReussie(nomme, avec)).toBe(true);
    expect(preuveReussie({ ...vide, fichiers: 2, nonNommes: 36 }, avec)).toBe(true);
    expect(preuveReussie({ ...vide, fichiers: 1, anciens: 4, nommes: 1 }, avec)).toBe(true);
  });

  it('refuses a new lot with no red, whatever its greens, when no code is there', () => {
    expect(preuveReussie(vide, sans)).toBe(false);
    expect(preuveReussie(nomme, sans)).toBe(false);
    expect(preuveReussie({ ...vide, fichiers: 2, nonNommes: 36 }, sans)).toBe(false);
    expect(preuveReussie(nomme, { inchange: false, codePresent: false })).toBe(false);
  });

  it('refuses a broken file or a failed build even when the code is there', () => {
    expect(preuveReussie({ ...nomme, casses: 1 }, avec)).toBe(false);
    expect(preuveReussie({ ...vide, fichiers: 1, casses: 2 }, avec)).toBe(false);
  });

  it('keeps the verdict of a red when the code is there: the proof succeeds and the developpeur is run again', () => {
    expect(preuveReussie({ ...nomme, nommes: 0, rouges: 2 }, avec)).toBe(true);
    expect(preuveReussie({ ...nomme, nommes: 0, rouges: 2 }, sans)).toBe(true);
    expect(apresLaPreuve({ rouges: 2, pourLeDeveloppeur: false, inchange: false })).toBe(
      'developpeur'
    );
  });

  it('keeps passing under « comportement inchangé », with the code there or not', () => {
    expect(preuveReussie(nomme, { inchange: true, codePresent: true })).toBe(true);
    expect(preuveReussie(nomme, { inchange: true })).toBe(true);
    expect(preuveReussie({ ...nomme, casses: 1 }, { inchange: true, codePresent: true })).toBe(
      false
    );
  });

  it('still passes a lot of night tests alone, the code there or not', () => {
    expect(preuveReussie({ ...vide, misDeCote: 2 }, sans)).toBe(true);
    expect(preuveReussie({ ...vide, misDeCote: 2 }, avec)).toBe(true);
  });

  it('goes to the checks, not to the developpeur, after a proof that passes with no red and no open finding', () => {
    expect(apresLaPreuve({ rouges: 0, pourLeDeveloppeur: false, inchange: false })).toBe(
      'controles'
    );
  });
});

// A copy of the trial language, its initial files committed, with a production file (one the
// testwriter does not write) left untracked when <production> is set — the developer's code present.
const copieAvec = (roles: string[], production: boolean) => {
  const copie = path.join(ESSAIS, `copie-${Math.random().toString(36).slice(2)}`);
  mkdirSync(copie);
  const git = (...a: string[]) =>
    spawnSync('git', ['-C', copie, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  declarerLeLangage(copie);
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', 'départ');
  if (production) {
    writeFileSync(path.join(copie, 'production.mjs'), 'export const x = 1;\n');
  }
  return { ...ctx(roles), copie, journal: path.join(ESSAIS, 'journal') };
};

describe('la preuve rejouée sur une copie qui porte ou non le code de production du développeur', () => {
  const preuve = activites.preuve as (
    ctx: { copie: string; fiches: string; paquets: string[]; journal: string },
    o: { mesure: { cle: string; runs: unknown[] } }
  ) => { ok: boolean; rouges: number; texte: string };
  const empreinte = activites.empreinte as (
    ctx: { copie: string; paquets: string[] },
    chemins: string[]
  ) => string;

  const rejouer = (roles: string[], production = false) => {
    const c = copieAvec(roles, production);
    return preuve(c, { mesure: { cle: empreinte(c, ['.']), runs: [] } });
  };

  it('passes and says the code is there when a developpeur ran and the production code is in the copy', () => {
    const r = rejouer(['explorateur', 'testwriter', 'developpeur'], true);
    expect(r.ok).toBe(true);
    expect(r.rouges).toBe(0);
    expect(r.texte).toContain('Le code du développeur est déjà dans la copie');
    expect(r.texte).not.toContain('rien ne prouve le rouge');
  });

  it('refuses a new lot with no developpeur since the testwriter, and does not say the code is there', () => {
    const r = rejouer(['explorateur', 'testwriter'], true);
    expect(r.ok).toBe(false);
    expect(r.texte).not.toContain('Le code du développeur est déjà dans la copie');
  });

  it('still recognises the code when a testwriter session follows the developpeur’s (a RENDU)', () => {
    const r = rejouer(['testwriter', 'developpeur', 'testwriter'], true);
    expect(r.ok).toBe(true);
    expect(r.texte).toContain('Le code du développeur est déjà dans la copie');
  });

  it('does not raise the sign when a developpeur ran but no production code is in the copy', () => {
    const r = rejouer(['explorateur', 'testwriter', 'developpeur'], false);
    expect(r.texte).not.toContain('Le code du développeur est déjà dans la copie');
  });
});

describe('le signe « le code est déjà dans la copie » = une séance développeur et du code de production présent', () => {
  it('is raised after a developpeur ran and the production code is in the copy', () => {
    expect(codeDejaPresent(copieAvec(['explorateur', 'testwriter', 'developpeur'], true))).toBe(
      true
    );
  });

  it('stays raised when a testwriter session follows the developpeur’s, the code still in the copy', () => {
    expect(codeDejaPresent(copieAvec(['testwriter', 'developpeur', 'testwriter'], true))).toBe(
      true
    );
  });

  it('is not raised without a developpeur session, whatever the copy holds', () => {
    expect(codeDejaPresent(copieAvec(['explorateur', 'testwriter'], true))).toBe(false);
    expect(codeDejaPresent(copieAvec([], true))).toBe(false);
  });

  it('is not raised when a developpeur ran but no production code is in the copy', () => {
    expect(codeDejaPresent(copieAvec(['explorateur', 'testwriter', 'developpeur'], false))).toBe(
      false
    );
  });
});
