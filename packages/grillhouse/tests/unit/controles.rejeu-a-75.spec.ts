// Une commande des contrôles du plan qui rend 75 (`controles`, scripts/activites.mjs) est rejouée
// une fois, le geste `rejeu` consigné sous son nom, aucune séance lancée ; encore à 75 au second
// tour, le résultat reste « à repasser », que le circuit finit à 75 ; la passe finale ne rejoue pas.
// Joué devant un faux npm dont chaque appel rend le code suivant de sa liste (`FAUX_NPM_CODES`).
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { copieEssai, type Ctx } from './preuve-essai.js';

type Plan = Ctx & { ecartes: string[]; rendus: { genre: string; texte?: string }[] };
const controles = activites.controles as (
  ctx: Plan,
  finale: boolean
) => { rouge: boolean; aRepasser: boolean; resume: string };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-rejeu-'));
const avant = { PATH: process.env.PATH };
const journalNpm = path.join(ESSAIS, 'journal-npm');
const compteur = path.join(ESSAIS, 'compteur');
beforeAll(() => {
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.FAUX_NPM_JOURNAL, process.argv.slice(2).join(' ') + '\\n');
const n = fs.existsSync(process.env.FAUX_NPM_COMPTEUR)
  ? Number(fs.readFileSync(process.env.FAUX_NPM_COMPTEUR, 'utf8'))
  : 0;
fs.writeFileSync(process.env.FAUX_NPM_COMPTEUR, String(n + 1));
const codes = process.env.FAUX_NPM_CODES.split(',').map(Number);
process.exit(codes[Math.min(n, codes.length - 1)]);
`
  );
  chmodSync(npm, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
  process.env.FAUX_NPM_JOURNAL = journalNpm;
  process.env.FAUX_NPM_COMPTEUR = compteur;
});
afterEach(() => {
  rmSync(journalNpm, { force: true });
  rmSync(compteur, { force: true });
});
afterAll(() => {
  process.env.PATH = avant.PATH;
  delete process.env.FAUX_NPM_JOURNAL;
  delete process.env.FAUX_NPM_COMPTEUR;
  delete process.env.FAUX_NPM_CODES;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

/** Une copie dont le plan est le seul paquet forms, qui joue des tests : une commande des contrôles. */
function copie(): Plan {
  const ctx = copieEssai(ESSAIS, {
    'packages/forms/src/index.mjs': 'export const mesure = x => 2 * x;\n',
  });
  declarerLesLangages(ctx.copie, { 'packages/forms': 'typescript' });
  mkdirSync(path.join(ctx.copie, 'packages', 'forms'), { recursive: true });
  writeFileSync(
    path.join(ctx.copie, 'packages', 'forms', 'package.json'),
    JSON.stringify({ name: '000-forms', type: 'module', scripts: { 'test:unit': 'vitest run' } })
  );
  return { ...ctx, paquets: ['packages/forms'], ecartes: [], rendus: [] };
}

const appels = () => readFileSync(journalNpm, 'utf8').split('\n').filter(Boolean);
const gestes = (c: Plan) =>
  c.rendus.filter(e => e.genre === 'commentaire' && /Circuit · geste : /.test(e.texte ?? ''));

describe('une commande des contrôles du plan qui rend 75', () => {
  it('est jouée une seconde fois, vert au second tour, le geste « rejeu » consigné une fois avec sa règle', () => {
    process.env.FAUX_NPM_CODES = '75,0';
    const c = copie();
    const r = controles(c, false);
    expect(appels()).toHaveLength(2);
    expect(appels()[1]).toBe(appels()[0]);
    expect(r.rouge).toBe(false);
    expect(r.aRepasser).toBe(false);
    expect(gestes(c)).toHaveLength(1);
    expect(gestes(c)[0]!.texte).toMatch(
      /^Circuit · geste : rejeu → la commande joue une seconde fois \(règle : une commande des contrôles hors de la passe finale à 75 rejoue une fois avant l’arrêt\)$/
    );
    expect(readFileSync(c.journal, 'utf8')).toContain(
      'geste : rejeu → la commande joue une seconde fois'
    );
  });

  it('encore à 75 au second tour : jouée deux fois seulement, le résultat reste « à repasser »', () => {
    process.env.FAUX_NPM_CODES = '75,75';
    const c = copie();
    const r = controles(c, false);
    expect(appels()).toHaveLength(2);
    expect(r.aRepasser).toBe(true);
    expect(r.rouge).toBe(false);
    expect(r.resume).toMatch(/^à repasser : /);
    expect(gestes(c)).toHaveLength(1);
  });

  it('vert du premier tour : aucun rejeu, aucun geste', () => {
    process.env.FAUX_NPM_CODES = '0';
    const c = copie();
    controles(c, false);
    expect(appels()).toHaveLength(1);
    expect(gestes(c)).toEqual([]);
  });

  it('à la passe finale : jouée une fois, jamais rejouée, le 75 de verifier reste final', () => {
    process.env.FAUX_NPM_CODES = '75,0';
    const c = copie();
    const r = controles(c, true);
    expect(appels()).toHaveLength(1);
    expect(appels()[0]).toContain('run verifier');
    expect(r.aRepasser).toBe(true);
    expect(gestes(c)).toEqual([]);
  });
});
