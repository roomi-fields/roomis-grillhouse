// Le lieu d'un rouge des contrôles (`controles`, scripts/activites.mjs) : un rouge que rien ne
// situe est dans le plan quand le plan nomme « . », qui couvre tout le dépôt, et hors du plan
// sans `horsTitre` sinon ; un rouge dont le paquet est connu garde son paquet. Joué sur un espace
// cargo d'essai, contre un faux cargo et un faux npm dont les résultats sont ceux d'une passe.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import exemples from '../../scripts/langages/cargo/exemples.mjs';
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
  tous: Rouge[];
}
const controles = activites.controles as (ctx: object, finale: boolean) => Controles;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-sans-lieu-'));
let restaurer = () => {};
let espace: string;
let bin: string;
const avant = { PATH: process.env.PATH };
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  espace = (exemples.preparer(ESSAIS) as { depots: { espace: string } }).depots.espace;
  // Un faux npm : il écrit dans le dossier de résultats de la passe ce que FAUX_NPM_RESULTATS
  // décrit (`{ taches, sarif }`), puis rend le code 1.
  bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const d = process.env.GRILLHOUSE_RESULTATS;
const s = JSON.parse(process.env.FAUX_NPM_RESULTATS || '{}');
if (d && s.taches) {
  fs.mkdirSync(path.join(d, 'cargo'), { recursive: true });
  fs.writeFileSync(path.join(d, 'cargo', 'run.json'), JSON.stringify({ taches: s.taches, cibles: {} }));
}
if (d && s.sarif) {
  fs.mkdirSync(path.join(d, 'sarif'), { recursive: true });
  fs.writeFileSync(path.join(d, 'sarif', 'garde.sarif'), JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'garde-essai' } }, results: s.sarif }] }));
}
process.exit(1);
`
  );
  chmodSync(npm, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => {
  process.env.PATH = avant.PATH;
  delete process.env.FAUX_NPM_RESULTATS;
  restaurer();
});

const tache = (paquet: string, dossier: string, script = 'nextest') => ({
  tache: `${paquet}#${script}`,
  paquet,
  dossier,
  script,
  tests: script === 'nextest',
  code: 1,
  cache: null,
  journal: null,
});

// Joue les contrôles du plan <paquets>, le faux npm rendant <resultats>.
function jouer(paquets: string[], resultats: object) {
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  process.env.FAUX_NPM_RESULTATS = JSON.stringify(resultats);
  const ctx = {
    racine: espace,
    copie: espace,
    ticket: 'demo-1',
    paquets,
    tmp,
    journal: path.join(tmp, 'journal'),
    fiches: path.join(tmp, 'fiches.jsonl'),
    base: { dossier: tmp },
  };
  return controles(ctx, true);
}

describe('un rouge que rien ne situe, sous un plan qui nomme « . »', () => {
  it('la commande rouge sans résultat est dans le plan et va au développeur', () => {
    const c = jouer(['.'], {});
    expect(c.tous).toHaveLength(1);
    expect(c.tous[0]).toMatchObject({ dansLePlan: true, horsTitre: null });
    expect(c.auDeveloppeur).toBe(true);
    expect(c.horsTitre).toEqual([]);
  });

  it('la tâche rouge dont le paquet n’est pas dans la liste est dans le plan', () => {
    const c = jouer(['.'], { taches: [tache('inconnu', 'crates/inconnu')] });
    expect(c.tous).toHaveLength(1);
    expect(c.tous[0]).toMatchObject({ dansLePlan: true, paquet: null, horsTitre: null });
    expect(c.auDeveloppeur).toBe(true);
  });

  it('le constat de garde sans fichier est dans le plan', () => {
    const c = jouer(['.'], {
      sarif: [
        { ruleId: 'garde-essai', level: 'error', message: { text: 'un défaut sans fichier' } },
      ],
    });
    expect(c.tous.map(r => [r.dansLePlan, r.horsTitre])).toEqual([[true, null]]);
    expect(c.auDeveloppeur).toBe(true);
  });
});

describe('un rouge que rien ne situe, sous un plan qui ne nomme pas « . »', () => {
  it('la commande rouge sans résultat reste hors du plan sans horsTitre', () => {
    const c = jouer(['crates/core'], {});
    expect(c.tous.map(r => [r.dansLePlan, r.horsTitre])).toEqual([[false, null]]);
    expect(c.auDeveloppeur).toBe(false);
    expect(c.horsTitre).toEqual([]);
  });

  it('la tâche rouge dont le paquet n’est pas dans la liste reste hors du plan sans horsTitre', () => {
    const c = jouer(['crates/core'], { taches: [tache('inconnu', 'crates/inconnu')] });
    expect(c.tous.map(r => [r.dansLePlan, r.horsTitre])).toEqual([[false, null]]);
    expect(c.auDeveloppeur).toBe(false);
  });

  it('le constat de garde sans fichier reste hors du plan sans horsTitre', () => {
    const c = jouer(['crates/core'], {
      sarif: [{ ruleId: 'garde-essai', level: 'error', message: { text: 'sans fichier' } }],
    });
    expect(c.tous.map(r => [r.dansLePlan, r.horsTitre])).toEqual([[false, null]]);
  });

  it('un rouge dont le paquet est connu mais absent du plan garde ce paquet en horsTitre', () => {
    const c = jouer(['crates/core'], { taches: [tache('ws-app', 'crates/app')] });
    expect(c.tous.map(r => [r.dansLePlan, r.paquet, r.horsTitre])).toEqual([
      [false, 'ws-app', 'ws-app'],
    ]);
    expect(c.horsTitre).toEqual(['ws-app']);
    expect(c.auDeveloppeur).toBe(false);
  });

  it('un rouge dont le paquet est au plan va au développeur', () => {
    const c = jouer(['crates/app'], { taches: [tache('ws-app', 'crates/app')] });
    expect(c.tous.map(r => [r.dansLePlan, r.paquet, r.horsTitre])).toEqual([
      [true, 'ws-app', null],
    ]);
    expect(c.auDeveloppeur).toBe(true);
  });
});
