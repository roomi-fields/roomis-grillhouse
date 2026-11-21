// The defect ticket of a red CI of main, opened by the supervisor's reading as well as by the queue
// (scripts/ci-de-main.mjs `ouvrirLeDefautDeMain`, scripts/superviseur.mjs `ciDeMainDe`), as TAP and
// the Chromium sheriff open the bug of a red tree once, whoever sees it.
//
// Medium tests: a repository of trial, a stand-in `bd` found on the PATH as the project's own and
// run in the project's root, and gh given as a stand-in in the process.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as ciDeMain from '../../scripts/ci-de-main.mjs';
import * as superviseur from '../../scripts/superviseur.mjs';
import { journalDe, poserLeFauxBd, ticketsDe } from './faux-bd.js';

type Reponse = { status: number; stdout: string; stderr: string };
type Alerte = { cle: string; texte: string } | null | undefined;

const { ciDeMainDe } = superviseur as unknown as {
  ciDeMainDe: (racine: string, o?: { gh?: (a: string[]) => Reponse }) => Alerte;
};
const { ciDeMainGardee } = ciDeMain as unknown as {
  ciDeMainGardee: (racine: string, o?: { gh?: (a: string[]) => Reponse }) => unknown;
};

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ci-de-main-releve-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let etat: string;
let racine: string;
const ENV_AVANT = { ...process.env };

beforeEach(() => {
  racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  const faux = poserLeFauxBd(ESSAIS);
  etat = faux.etat;
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  mkdirSync(path.join(racine, '.github', 'workflows'), { recursive: true });
  writeFileSync(path.join(racine, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
  git('remote', 'add', 'origin', 'https://example.invalid/x.git');
  git('add', '-A');
  git('commit', '-qm', 'base');
  process.env.PATH = `${faux.bin}${path.delimiter}${ENV_AVANT.PATH}`;
  process.env.BD_ETAT = etat;
  delete process.env.BD_REFUSE;
  delete process.env.BD_MUET;
  delete process.env.BD_LENT;
});
afterEach(() => {
  process.env = { ...ENV_AVANT };
});

const tickets = () => ticketsDe(etat);
const creations = () => journalDe(etat).filter(a => a.cmd === 'create');
const oublier = () =>
  rmSync(path.join(racine, '.claude', 'worktrees', 'ci-de-main-lue.json'), { force: true });

const passage = (id: number, conclusion: string, flux = 'Machine vierge') => ({
  databaseId: id,
  status: 'completed',
  conclusion,
  workflowName: flux,
  headSha: 'b'.repeat(40),
});
const gh = (passages: unknown[]) => () => ({
  status: 0,
  stdout: JSON.stringify(passages),
  stderr: '',
});
const rouge = (id = 4242) => gh([passage(id, 'failure'), passage(id - 100, 'success')]);
const TITRE = (id = 4242) => `CI de main rouge — Machine vierge, passage ${id}`;

describe('le relevé du superviseur et le ticket de défaut d’une CI de main rouge', () => {
  it('opens the defect ticket under a-valider in the project it reads, and the alert names it', () => {
    const a = ciDeMainDe(racine, { gh: rouge() });
    expect(tickets()).toHaveLength(1);
    expect(tickets()[0]).toMatchObject({ title: TITRE(), labels: ['a-valider'] });
    expect(tickets()[0]!.description).toContain('bbbbbbb');
    expect(a!.texte).toContain(tickets()[0]!.id);
    for (const c of journalDe(etat)) {
      expect(realpathSync(c.cwd)).toBe(realpathSync(racine));
    }
  });

  it('a second reading of the same red pass opens no second ticket and names the same one', () => {
    const a = ciDeMainDe(racine, { gh: rouge() });
    const b = ciDeMainDe(racine, { gh: rouge() });
    expect(creations()).toHaveLength(1);
    expect(b!.texte).toContain(tickets()[0]!.id);
    expect(b!.cle).toBe(a!.cle);
  });

  it('names the ticket that already holds the pass, closed, without opening another', () => {
    writeFileSync(
      path.join(etat, 'tickets.json'),
      JSON.stringify([
        { id: 'demo-7', title: TITRE(), status: 'closed', labels: ['a-valider'], description: '' },
      ])
    );
    const a = ciDeMainDe(racine, { gh: rouge() });
    expect(creations()).toEqual([]);
    expect(a!.texte).toContain('demo-7');
  });

  it('opens another ticket for another red pass', () => {
    ciDeMainDe(racine, { gh: rouge(4242) });
    oublier();
    ciDeMainDe(racine, { gh: rouge(4343) });
    expect(tickets().map(t => t.title)).toEqual([TITRE(4242), TITRE(4343)]);
  });

  it('opens no ticket for a green or a CI not read', () => {
    expect(ciDeMainDe(racine, { gh: gh([passage(9, 'success')]) })).toBeNull();
    oublier();
    expect(
      ciDeMainDe(racine, { gh: () => ({ status: 1, stdout: '', stderr: 'HTTP 401' }) })
    ).toMatchObject({ cle: 'non-lue' });
    expect(journalDe(etat)).toEqual([]);
  });

  it('reading the board opens no ticket: only the supervisor’s reading and the queue write', () => {
    expect(ciDeMainGardee(racine, { gh: rouge() })).toMatchObject({ etat: 'rouge' });
    expect(journalDe(etat)).toEqual([]);
  });

  it('a creation Beads refuses keeps the alert, which says no ticket could be opened, and why', () => {
    process.env.BD_REFUSE = '1';
    const a = ciDeMainDe(racine, { gh: rouge() })!;
    expect(a.texte).toContain('base verrouillée');
    expect(a.texte).toMatch(/pas pu s.ouvrir/);
    expect(tickets()).toEqual([]);
  });

  it('retries the opening at each reading while Beads refuses, then gives the alert with the ticket', () => {
    process.env.BD_REFUSE = '1';
    const sans1 = ciDeMainDe(racine, { gh: rouge() })!;
    const sans2 = ciDeMainDe(racine, { gh: rouge() })!;
    expect(creations()).toHaveLength(2);
    expect(sans2.cle).toBe(sans1.cle);
    delete process.env.BD_REFUSE;
    const avec = ciDeMainDe(racine, { gh: rouge() })!;
    expect(tickets()).toHaveLength(1);
    expect(avec.texte).toContain(tickets()[0]!.id);
    expect(avec.cle).not.toBe(sans1.cle);
  });

  it('a ticket created with no number read is told open, and the next reading finds it by its title', () => {
    process.env.BD_MUET = '1';
    const a = ciDeMainDe(racine, { gh: rouge() })!;
    expect(a.texte).toMatch(/ticket/);
    expect(a.texte).not.toContain('demo-');
    delete process.env.BD_MUET;
    const b = ciDeMainDe(racine, { gh: rouge() })!;
    expect(creations()).toHaveLength(1);
    expect(b.texte).toContain(tickets()[0]!.id);
  });
});
