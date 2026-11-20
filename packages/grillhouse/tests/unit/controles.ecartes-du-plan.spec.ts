// Un composant que le plan a écarté du relevé reste vérifié par le circuit (`ctx.ecartes`, les
// dossiers des écartés) : ses tests jouent aux contrôles de 3.1 après les paquets du plan, son rouge
// compte comme du plan (jamais « hors du plan du ticket ») et le circuit l'étend au plan
// (`ecartesRouges`). Joué sur un espace cargo d'essai (ws-core et ws-app jouent des tests, ws-outil
// n'en joue pas), contre un faux cargo et un faux npm qui journalise ses commandes.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import exemples from '../../scripts/langages/cargo/exemples.mjs';
import * as ticketDuCircuit from '../../scripts/ticket-du-circuit.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

interface Rouge {
  texte: string;
  dansLePlan: boolean;
  paquet: string | null;
  horsTitre: string | null;
}
interface Controles {
  rouge: boolean;
  auDeveloppeur: boolean;
  horsTitre: string[];
  ecartesRouges: string[];
  tous: Rouge[];
}
const controles = activites.controles as (ctx: object, finale: boolean) => Controles;
const commandesDuPlan = activites.commandesDuPlan as (
  ctx: object,
  liste: object[],
  seuls?: string[] | null
) => { args: string[] }[];
const portesDuRouge = activites.portesDuRouge as (
  ctx: object,
  lieux: { fichier: string }[]
) => { tests: string[]; code: string[] };
const composantsDe = (ticketDuCircuit as unknown as { composantsDe: (r: string) => object[] })
  .composantsDe;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-ecartes-'));
let restaurer = () => {};
let espace: string;
let journalNpm: string;
const avant = { PATH: process.env.PATH };
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  espace = (exemples.preparer(ESSAIS) as { depots: { espace: string } }).depots.espace;
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  journalNpm = path.join(ESSAIS, 'journal-npm');
  const npm = path.join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(process.env.FAUX_NPM_JOURNAL, process.argv.slice(2).join(' ') + '\\n');
const d = process.env.GRILLHOUSE_RESULTATS;
const s = JSON.parse(process.env.FAUX_NPM_RESULTATS || '{}');
if (d && s.taches) {
  fs.mkdirSync(path.join(d, 'cargo'), { recursive: true });
  fs.writeFileSync(path.join(d, 'cargo', 'run.json'), JSON.stringify({ taches: s.taches, cibles: {} }));
}
process.exit(Number(process.env.FAUX_NPM_CODE || 1));
`
  );
  chmodSync(npm, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
  process.env.FAUX_NPM_JOURNAL = journalNpm;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => {
  process.env.PATH = avant.PATH;
  delete process.env.FAUX_NPM_JOURNAL;
  delete process.env.FAUX_NPM_RESULTATS;
  delete process.env.FAUX_NPM_CODE;
  restaurer();
});

const tache = (paquet: string, dossier: string) => ({
  tache: `${paquet}#nextest`,
  paquet,
  dossier,
  script: 'nextest',
  tests: true,
  code: 1,
  cache: null,
  journal: null,
});

function contexte(paquets: string[], ecartes: string[]) {
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  return {
    racine: espace,
    copie: espace,
    ticket: 'demo-1',
    paquets,
    ecartes,
    tmp,
    journal: path.join(tmp, 'journal'),
    fiches: path.join(tmp, 'fiches.jsonl'),
    base: { dossier: tmp },
  };
}

function jouer(paquets: string[], ecartes: string[], taches: object[], finale: boolean) {
  process.env.FAUX_NPM_CODE = '1';
  process.env.FAUX_NPM_RESULTATS = JSON.stringify({ taches });
  return controles(contexte(paquets, ecartes), finale);
}

const commandes = (paquets: string[], ecartes: string[], seuls: string[] | null = null) =>
  commandesDuPlan(contexte(paquets, ecartes), composantsDe(espace), seuls).map(c => c.args);

describe('les commandes des contrôles jouent les écartés après les paquets du plan', () => {
  it('un écarté qui joue des tests ajoute `npm test -- <paquet>` après le paquet du plan', () => {
    expect(commandes(['crates/core'], ['crates/app'])).toEqual([
      ['test', '--', 'crates/core'],
      ['test', '--', 'crates/app'],
    ]);
  });

  it('un écarté qui ne joue aucun test n’ajoute aucune commande', () => {
    expect(commandes(['crates/core'], ['crates/outil'])).toEqual([['test', '--', 'crates/core']]);
  });

  it('un écarté que le plan couvre déjà n’est pas rejoué deux fois', () => {
    expect(commandes(['crates/core'], ['crates/core'])).toEqual([['test', '--', 'crates/core']]);
  });

  it('un écarté que les tests nommés d’une reprise couvrent n’ajoute pas son paquet', () => {
    expect(commandes(['crates/core'], ['crates/app'], ['crates/app/tests/integ.rs'])).toEqual([
      ['test', '--', 'crates/app/tests/integ.rs'],
    ]);
  });

  it('un plan sans écarté joue les seuls paquets du plan', () => {
    expect(commandes(['crates/core'], [])).toEqual([['test', '--', 'crates/core']]);
  });
});

describe('les contrôles jouent toutes leurs commandes dans la même passe, un écarté rouge compris', () => {
  it('la commande du plan rouge n’empêche pas celle de l’écarté', () => {
    jouer(['crates/core'], ['crates/app'], [tache('ws-core', 'crates/core')], false);
    expect(readFileSync(journalNpm, 'utf8').trim().split('\n').slice(-2)).toEqual([
      'test -- crates/core',
      'test -- crates/app',
    ]);
  });
});

describe('un rouge d’un composant écarté compte comme du plan', () => {
  it.each([
    ['aux contrôles', false],
    ['à la passe finale', true],
  ])('%s : il va au développeur, sans « hors du plan », et nomme l’écarté', (_nom, finale) => {
    const c = jouer(['crates/core'], ['crates/app'], [tache('ws-app', 'crates/app')], finale);
    expect(c.tous.map(r => [r.dansLePlan, r.paquet, r.horsTitre])).toEqual([
      [true, 'ws-app', null],
    ]);
    expect(c.auDeveloppeur).toBe(true);
    expect(c.horsTitre).toEqual([]);
    expect(c.ecartesRouges).toEqual(['crates/app']);
  });

  it('un rouge d’un paquet du plan ne nomme aucun écarté', () => {
    const c = jouer(['crates/core'], ['crates/app'], [tache('ws-core', 'crates/core')], true);
    expect(c.ecartesRouges).toEqual([]);
    expect(c.auDeveloppeur).toBe(true);
  });

  it('un rouge d’un paquet que ni le plan ni les écartés ne nomment reste hors du plan', () => {
    const c = jouer(['crates/core'], ['crates/outil'], [tache('ws-app', 'crates/app')], true);
    expect(c.tous.map(r => [r.dansLePlan, r.horsTitre])).toEqual([[false, 'ws-app']]);
    expect(c.horsTitre).toEqual(['ws-app']);
    expect(c.ecartesRouges).toEqual([]);
    expect(c.auDeveloppeur).toBe(false);
  });

  it('un écarté rouge et un paquet inconnu rouge : l’écarté seul entre, l’autre reste hors du plan', () => {
    const c = jouer(
      ['crates/core'],
      ['crates/app'],
      [tache('ws-app', 'crates/app'), tache('ws-outil', 'crates/outil')],
      true
    );
    expect(c.ecartesRouges).toEqual(['crates/app']);
    expect(c.horsTitre).toEqual(['ws-outil']);
  });
});

describe('un fichier d’un composant écarté est du développeur', () => {
  it('le fichier d’un écarté est porté par le développeur, celui d’un inconnu par personne', () => {
    const portes = portesDuRouge(contexte(['crates/core'], ['crates/app']), [
      { fichier: 'crates/app/tests/integ.rs' },
      { fichier: 'crates/outil/src/lib.rs' },
    ]);
    expect(portes.code).toEqual(['crates/app/tests/integ.rs']);
    expect(portes.tests).toEqual([]);
  });
});
