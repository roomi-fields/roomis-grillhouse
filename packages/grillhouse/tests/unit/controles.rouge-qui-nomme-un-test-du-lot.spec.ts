// The checks of the plan (`controles`, scripts/activites.mjs) before a test the lot does not
// change that fails on a test file of the lot: a guard written as a test, whose message names what
// it finds. The place of the red carries the test files of the lot its message names (`nommes`),
// from the root of the copy, and the testwriter carries them (`portesDuRouge`). Witness:
// grillhouse-3uv.171.4, the guard of the trial directories red on a new test file, sent to a
// developpeur who writes no test. Played before a fake npm.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { attribuerLeRouge as attribuer } from '../../scripts/reprise.mjs';
import { copieEssai, type Ctx } from './preuve-essai.js';

interface Lieu {
  fichier: string | null;
  gardes: string[];
  nommes?: string[];
}
type Essai = Ctx & { ecartes: string[] };
const controles = activites.controles as (
  ctx: Essai,
  finale: boolean
) => { rouge: boolean; lieux: Lieu[]; texte: string };
const portesDuRouge = activites.portesDuRouge as (
  ctx: Essai,
  lieux: Lieu[]
) => { tests: string[]; code: string[] };
const attribuerLeRouge = attribuer as unknown as (e: {
  lieux: Lieu[];
  portes: { tests: string[]; code: string[] };
}) => { etape: string | null; fichiers: string[] };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-rouge-qui-nomme-'));
const avant = { PATH: process.env.PATH };
beforeAll(() => {
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
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
});
afterAll(() => {
  process.env.PATH = avant.PATH;
  delete process.env.FAUX_NPM_RAPPORT;
  delete process.env.FAUX_NPM_CODE;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const GARDE = 'packages/forms/tests/garde.test.mjs';
const NEUF = 'packages/forms/tests/neuf.test.mjs';
const AUTRE = 'packages/forms/tests/autre.test.mjs';

// A copy of forms, in the plan: the guard HEAD holds, committed, and the new test file of the lot,
// left untracked.
function copie(): Essai {
  const ctx = copieEssai(ESSAIS);
  declarerLesLangages(ctx.copie, { 'packages/forms': 'typescript' });
  mkdirSync(path.join(ctx.copie, 'packages/forms/tests'), { recursive: true });
  writeFileSync(
    path.join(ctx.copie, 'packages/forms/package.json'),
    JSON.stringify({ name: '000-forms', type: 'module', scripts: { 'test:unit': 'vitest run' } })
  );
  writeFileSync(path.join(ctx.copie, GARDE), '// la garde que HEAD tient\n');
  const git = (...a: string[]) =>
    spawnSync('git', ['-C', ctx.copie, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('add', '-A');
  git('commit', '-q', '-m', 'la garde');
  writeFileSync(path.join(ctx.copie, NEUF), '// le test neuf du lot\n');
  return { ...ctx, paquets: ['packages/forms'], ecartes: [] };
}

// The report of Vitest where the test file <fichier> (the guard by default) fails on <message>.
const rapport = (c: Ctx, message: string, fichier = GARDE) =>
  JSON.stringify({
    testResults: [
      {
        name: path.join(c.copie, fichier),
        status: 'failed',
        message: '',
        assertionResults: [
          {
            title: 'chaque racine est retirée',
            fullName: 'la garde chaque racine est retirée',
            status: 'failed',
            failureMessages: [message],
          },
        ],
      },
    ],
  });

// The checks of the plan of <c> before the guard red on <message>.
function rouges(c: Essai, message: string) {
  process.env.FAUX_NPM_RAPPORT = rapport(c, message);
  process.env.FAUX_NPM_CODE = '1';
  return controles(c, false);
}

describe('les contrôles du plan devant un test hors du lot dont le message nomme un fichier de test du lot', () => {
  it('nomment ce fichier dans le lieu du rouge, depuis la racine, pour un chemin écrit depuis le paquet : le testwriter le porte', () => {
    const c = copie();
    const r = rouges(
      c,
      `tests/neuf.test.mjs:23: ESSAIS: expected [ Array(1) ] to deeply equal []\n    at ${path.join(c.copie, GARDE)}:347:21`
    );
    expect(r.rouge).toBe(true);
    expect(r.lieux).toHaveLength(1);
    expect(r.lieux[0]).toMatchObject({ fichier: GARDE, gardes: [], nommes: [NEUF] });
    // The first line of the message writes the path from the package: the report adds the file.
    expect(r.texte).toContain(`(il nomme ${NEUF})`);
    const portes = portesDuRouge(c, r.lieux);
    expect(portes).toEqual({ tests: [NEUF], code: [GARDE] });
    expect(attribuerLeRouge({ lieux: r.lieux, portes })).toMatchObject({ etape: 'testwriter' });
  });

  it('nomment ce fichier pour un chemin écrit depuis la racine, et le rapport des rouges le dit', () => {
    const c = copie();
    const r = rouges(c, `AssertionError: ${NEUF} garde sa racine d'essai`);
    expect(r.lieux[0]?.nommes).toEqual([NEUF]);
    expect(r.texte).toContain(NEUF);
  });

  it('ne nomment rien quand le message ne nomme aucun fichier de test du lot : le rouge reste au développeur', () => {
    const c = copie();
    const r = rouges(c, 'AssertionError: expected [ Array(1) ] to deeply equal []');
    expect(r.lieux[0]?.nommes ?? []).toEqual([]);
    const portes = portesDuRouge(c, r.lieux);
    expect(portes).toEqual({ tests: [], code: [GARDE] });
    expect(attribuerLeRouge({ lieux: r.lieux, portes })).toMatchObject({ etape: 'developpeur' });
  });

  it('ne lisent pas la pile de l’erreur : un fichier du lot qu’elle traverse n’est pas nommé', () => {
    const c = copie();
    const r = rouges(c, `Error: rouge\n    at aide (${path.join(c.copie, NEUF)}:3:1)`);
    expect(r.lieux[0]?.nommes ?? []).toEqual([]);
  });

  it('ne lisent pas le message d’un test du lot : celui qui nomme un autre test du lot reste au développeur', () => {
    const c = copie();
    writeFileSync(path.join(c.copie, AUTRE), '// un autre test neuf du lot\n');
    process.env.FAUX_NPM_RAPPORT = rapport(c, `AssertionError: ${AUTRE} rend 4`, NEUF);
    process.env.FAUX_NPM_CODE = '1';
    const r = controles(c, false);
    expect(r.lieux[0]).toMatchObject({ fichier: NEUF, gardes: [] });
    expect(r.lieux[0]?.nommes ?? []).toEqual([]);
    expect(r.texte).not.toContain('il nomme');
    expect(attribuerLeRouge({ lieux: r.lieux, portes: portesDuRouge(c, r.lieux) })).toMatchObject({
      etape: 'developpeur',
    });
  });

  it('ne prennent pas un autre fichier dont le nom finit pareil pour celui du lot', () => {
    const c = copie();
    const r = rouges(c, 'AssertionError: autres/tests/neuf.test.mjs garde sa racine');
    expect(r.lieux[0]?.nommes ?? []).toEqual([]);
  });
});
