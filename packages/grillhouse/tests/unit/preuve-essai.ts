// The trial copy of the tests of the proof of the red and of the builds: a git repository of the
// language of trial (`.` its one package), a lot of test files left untracked in it, the sheets of
// the testwriter, and the reports of Vitest a measure of the proof holds. Each caller gives the
// trial directory it creates and removes (`mkdtempSync` under the temporary directory).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { etatDuDepot } from '../../scripts/etat-du-depot.mjs';
import { garderLeRegistre } from '../../scripts/registre-des-resultats.mjs';

export interface Ctx {
  copie: string;
  racine: string;
  ticket: string;
  paquets: string[];
  tmp: string;
  journal: string;
  fiches: string;
  base: { dossier: string };
  sorte?: { comportement: string };
}

export interface Test {
  titre: string;
  nom: string;
  etat: 'passed' | 'failed';
  message: string;
}
export interface Resultat {
  fichier: string;
  etat: 'passed' | 'failed';
  message: string;
  tests: Test[];
}
export interface Run {
  groupe: string[];
  entier: boolean;
  code: number;
  resultats: Resultat[];
  constructions: { nom: string; erreur: string }[];
  attente?: boolean;
  raison?: string | null;
  commande?: string;
}
export interface Preuve {
  ok: boolean;
  rouges: number;
  texte: string;
  resume: string;
  mesure: { cle: string; runs: Run[] } | null;
  resultat: { casses: number; justifies: number; sans: number; anciens: number };
  aRepasser?: boolean;
  attente?: boolean;
}

export const preuve = activites.preuve as unknown as (
  ctx: Ctx,
  o?: { mesure?: { cle: string; runs: Run[] } | null }
) => Preuve;

/** A passed or failed test, its title and its full name given. */
export const unTest = (nom: string, etat: 'passed' | 'failed' = 'passed', message = ''): Test => ({
  titre: nom.split(' › ').at(-1)!,
  nom: nom.replace(' › ', ' '),
  etat,
  message,
});

/** The result of the file <fichier> of the copy <c>, with its tests. */
export const resultatDe = (c: Ctx, fichier: string, tests: Test[], message = ''): Resultat => ({
  fichier: path.join(c.copie, fichier),
  etat:
    tests.some(t => t.etat === 'failed') || (tests.length === 0 && message) ? 'failed' : 'passed',
  message,
  tests,
});

/**
 * A trial copy under <essais>: git repository with its branch `main` (the language declared and
 * `ancien.test.mjs` committed), then <lot> written untracked (the test files of the lot), the
 * sheets <fiches> (each `{ role, fiche }`) in their file.
 */
export function copieEssai(
  essais: string,
  lot: Record<string, string> = {},
  fiches: { role: string; fiche: Record<string, unknown> }[] = [],
  sorte?: { comportement: string }
): Ctx {
  const tmp = mkdtempSync(path.join(essais, 'ticket-'));
  const copie = path.join(realpathSync(mkdtempSync(path.join(essais, 'copie-'))));
  const git = (...a: string[]) =>
    spawnSync('git', ['-C', copie, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  declarerLeLangage(copie);
  writeFileSync(path.join(copie, 'ancien.test.mjs'), '// un test que main tient\n');
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'départ');
  for (const [f, texte] of Object.entries(lot)) {
    mkdirSync(path.dirname(path.join(copie, f)), { recursive: true });
    writeFileSync(path.join(copie, f), texte);
  }
  const lesFiches = path.join(tmp, 'fiches.jsonl');
  writeFileSync(lesFiches, fiches.map(f => `${JSON.stringify(f)}\n`).join(''));
  return {
    copie,
    racine: copie,
    ticket: 'demo-1',
    paquets: ['.'],
    tmp,
    journal: path.join(tmp, 'journal'),
    fiches: lesFiches,
    base: { dossier: tmp },
    ...(sorte ? { sorte } : {}),
  };
}

/** The sheet of a testwriter that names <portent> in `portent_le_travail`. */
export const ficheNommant = (portent: { fichier: string; test?: string }[]) => ({
  role: 'testwriter',
  fiche: { statut: 'FAIT', portent_le_travail: portent },
});

/** The key of the measure of the files of the day of the lot of <c>. */
const cleDuLot = (c: Ctx) =>
  activites.cleDeLaMesure(c, activites.separerLesFichiersDuJour(c, activites.testsDuLot(c)).jour);

/** One run of the measure for the lot file <fichier>, its results those of <resultats>. */
export const run = (fichier: string, resultats: Resultat[], code = 0): Run => ({
  groupe: [fichier],
  entier: false,
  code,
  resultats,
  constructions: [],
});

/** The measure of the lot of <c> that <runs> make, as the proof keeps it from a pass to the next. */
export const mesureDe = (c: Ctx, runs: Run[]) => ({ cle: cleDuLot(c), runs });

/** Keeps as the registry of results of <c> the passed tests of <rapports>, as main holds them. */
export const registre = (c: Ctx, rapports: Resultat[]) =>
  garderLeRegistre(etatDuDepot(c.copie), rapports);
