// Un test que HEAD tient et que le lot rougit, dans un paquet du plan que le lot ne touche pas : les
// contrôles du plan (`controles`, scripts/activites.mjs) jouent chaque paquet du plan en entier, et
// son rouge va au développeur, qui répare le lecteur. Témoin : BPScript (bp-mono-vbwf.320.2.2.1.5),
// le fournisseur change un type et le test du lecteur, vert à HEAD, rougit. Joué devant un faux npm.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { copieEssai, type Ctx } from './preuve-essai.js';

interface Rouge {
  texte: string;
  dansLePlan: boolean;
  paquet: string | null;
}
const controles = activites.controles as (
  ctx: Ctx & { ecartes: string[] },
  finale: boolean
) => { rouge: boolean; auDeveloppeur: boolean; tous: Rouge[] };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-rouge-existant-'));
const avant = { PATH: process.env.PATH };
const journalNpm = path.join(ESSAIS, 'journal-npm');
beforeAll(() => {
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(process.env.FAUX_NPM_JOURNAL, process.argv.slice(2).join(' ') + '\\n');
const d = process.env.GRILLHOUSE_RESULTATS;
if (d && process.env.FAUX_NPM_RAPPORT) {
  fs.mkdirSync(path.join(d, 'vitest'), { recursive: true });
  fs.writeFileSync(path.join(d, 'vitest', 'rapport.json'), process.env.FAUX_NPM_RAPPORT);
}
process.exit(Number(process.env.FAUX_NPM_CODE || 0));
`
  );
  chmodSync(npm, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
  process.env.FAUX_NPM_JOURNAL = journalNpm;
});
afterAll(() => {
  process.env.PATH = avant.PATH;
  delete process.env.FAUX_NPM_JOURNAL;
  delete process.env.FAUX_NPM_RAPPORT;
  delete process.env.FAUX_NPM_CODE;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LECTEUR = 'packages/binder/test/lecteur.test.mjs';

// A copy of forms (the lot's, a code file changed) and binder (the reader HEAD holds, untouched),
// both in the plan and both playing tests.
function copie() {
  const ctx = copieEssai(ESSAIS, {
    'packages/forms/src/index.mjs': 'export const mesure = x => 2 * x;\n',
  });
  declarerLesLangages(ctx.copie, {
    'packages/forms': 'typescript',
    'packages/binder': 'typescript',
  });
  for (const [dossier, nom] of [
    ['forms', '000-forms'],
    ['binder', '030-binder'],
  ]) {
    mkdirSync(path.join(ctx.copie, 'packages', dossier), { recursive: true });
    writeFileSync(
      path.join(ctx.copie, 'packages', dossier, 'package.json'),
      JSON.stringify({ name: nom, type: 'module', scripts: { 'test:unit': 'vitest run' } })
    );
  }
  mkdirSync(path.join(ctx.copie, 'packages/binder/test'), { recursive: true });
  writeFileSync(path.join(ctx.copie, LECTEUR), '// le lecteur que HEAD tient\n');
  return { ...ctx, paquets: ['packages/forms', 'packages/binder'], ecartes: [] };
}

const rapport = (c: Ctx) =>
  JSON.stringify({
    testResults: [
      {
        name: path.join(c.copie, LECTEUR),
        status: 'failed',
        message: '',
        assertionResults: [
          {
            title: 'lecteur — lit rend sa valeur',
            fullName: 'lecteur — lit rend sa valeur',
            status: 'failed',
            failureMessages: ['attendu 2, reçu 4'],
          },
        ],
      },
    ],
  });

describe('les contrôles du plan devant un test que le lot rougit sans toucher son paquet', () => {
  it('jouent le paquet du plan en entier, et son rouge va au développeur, dans le plan', () => {
    const c = copie();
    process.env.FAUX_NPM_RAPPORT = rapport(c);
    process.env.FAUX_NPM_CODE = '1';
    const r = controles(c, false);
    expect(readFileSync(journalNpm, 'utf8')).toContain('test -- packages/binder\n');
    expect(r.rouge).toBe(true);
    expect(r.auDeveloppeur).toBe(true);
    expect(r.tous).toHaveLength(1);
    expect(r.tous[0]!.texte).toContain(`${LECTEUR} › lecteur — lit rend sa valeur`);
    expect(r.tous[0]!.texte).toContain('attendu 2, reçu 4');
    expect(r.tous[0]!.dansLePlan).toBe(true);
    expect(r.tous[0]!.paquet).toBe('030-binder');
  });

  it('ne rendent aucun rouge quand le lecteur reste vert', () => {
    const c = copie();
    process.env.FAUX_NPM_RAPPORT = '';
    process.env.FAUX_NPM_CODE = '0';
    const r = controles(c, false);
    expect(r.auDeveloppeur).toBe(false);
    expect(r.tous).toEqual([]);
  });
});
