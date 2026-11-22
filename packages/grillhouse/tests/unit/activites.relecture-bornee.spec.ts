// The instruction of the reviewer (scripts/activites.mjs, `relire`): the first review reads the whole
// lot and has « aucune » relecture d'avant; the next one reads the difference of the lot since the
// review before (`git diff <lot d'avant> <lot>`, in the copy), only the files that difference
// changes, and the findings still open, each with its recipient and its body, which it judges lifted
// or not. A test of size medium: the copy is a trial git repository, claude a program of trial that
// keeps the instruction it receives and gives the sheet of its call.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'activites-relecture-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Constat {
  titre: string;
  regle: string;
  role: string;
  corps: string;
  piece: string;
}
const relire = activites.relire as (
  ctx: object,
  options: { constats: Constat[] }
) => Promise<{ verdict: string; texte: string }>;

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
const ecrire = (dossier: string, rel: string, texte: string) => {
  mkdirSync(path.dirname(path.join(dossier, rel)), { recursive: true });
  writeFileSync(path.join(dossier, rel), texte);
};

// The repository of trial with the copy of demo-1, and the context of its circuit; claude of trial.
function monde() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  ecrire(racine, 'package.json', JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }));
  ecrire(racine, 'docs/ARCHITECTURE.md', architecture());
  ecrire(
    racine,
    'packages/forms/package.json',
    JSON.stringify({ name: '@essai/forms', scripts: { 'test:unit': 'vitest run' } })
  );
  ecrire(racine, 'packages/forms/src/index.mjs', 'export const mesure = x => x;\n');
  ecrire(racine, '.gitignore', '.claude/worktrees/\n');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  const faux = path.join(tmp, 'claude');
  const sorties = path.join(tmp, 'sorties');
  mkdirSync(sorties);
  writeFileSync(
    faux,
    `#!/bin/bash\nn=$(( $(ls ${sorties} | grep -c consigne) + 1 ))\ncat > ${sorties}/consigne-$n\nif [ -f ${sorties}/fiche-$n ]; then echo "{\\"structured_output\\": $(cat ${sorties}/fiche-$n)}"; fi\n`
  );
  chmodSync(faux, 0o755);
  const ctx = {
    racine,
    copie,
    ticket: 'demo-1',
    sujet: 'essai',
    paquets: ['packages/forms'],
    tmp,
    journal: path.join(tmp, 'journal'),
    fiches: path.join(tmp, 'fiches.jsonl'),
    transcriptions: path.join(tmp, 'transcriptions'),
    immobileMs: 60_000,
    essaiDeLActe: 1,
    bd: (cmd: string) => ({
      status: 0,
      stdout:
        cmd === 'show' ? JSON.stringify([{ description: 'Le critère 1.', title: 't' }]) : '[]',
      stderr: '',
    }),
  };
  return { ctx, sorties, copie, faux };
}

async function lire(m: ReturnType<typeof monde>, constats: Constat[], fiche: object) {
  const n = readdirSync(m.sorties).filter(f => f.startsWith('consigne')).length + 1;
  writeFileSync(path.join(m.sorties, `fiche-${n}`), JSON.stringify(fiche));
  const avant = {
    CLAUDE_BIN: process.env.CLAUDE_BIN,
    GRILLHOUSE_REGISTRE: process.env.GRILLHOUSE_REGISTRE,
  };
  process.env.CLAUDE_BIN = m.faux;
  process.env.GRILLHOUSE_REGISTRE = path.join(m.ctx.tmp, 'registre.jsonl');
  try {
    await relire(m.ctx, { constats });
  } finally {
    for (const [k, v] of Object.entries(avant)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
  return readFileSync(path.join(m.sorties, `consigne-${n}`), 'utf8');
}

const CONSTAT: Constat = {
  titre: 'packages/forms/src/index.mjs',
  regle: 'critère 1',
  role: 'developpeur',
  corps: 'mesure de 0 doit rendre 0.',
  piece: 'packages/forms/src/index.mjs:1',
};

describe('la consigne du relecteur sur un lot qu’il a déjà relu', () => {
  it('la première relecture lit le lot entier : aucune relecture d’avant, ses tests et son code listés', async () => {
    const m = monde();
    ecrire(m.copie, 'packages/forms/test/mesure.test.mjs', 'it("x", () => {});\n');
    ecrire(m.copie, 'packages/forms/src/index.mjs', 'export const mesure = x => 2 * x;\n');
    const consigne = await lire(m, [], { verdict: 'ACCEPTÉ' });
    expect(consigne).toContain("LA RELECTURE D'AVANT : aucune");
    expect(consigne).toContain('REPRISE : non');
    expect(consigne).toContain('packages/forms/test/mesure.test.mjs');
    expect(consigne).toContain('packages/forms/src/index.mjs');
    expect(consigne).not.toContain('{{');
  });

  it('la relecture suivante lit la différence depuis la précédente, les fichiers qu’elle change seuls', async () => {
    const m = monde();
    ecrire(m.copie, 'packages/forms/test/mesure.test.mjs', 'it("x", () => {});\n');
    ecrire(m.copie, 'packages/forms/src/index.mjs', 'export const mesure = x => 2 * x;\n');
    await lire(m, [], {
      verdict: 'RENDU',
      constats: [{ ...CONSTAT, genre: 'bloquant' }],
    });
    const lots = readFileSync(m.ctx.fiches, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { role: string; lot?: { commit: string } })
      .filter(e => e.role === 'relecteur')
      .map(e => e.lot?.commit);
    expect(lots).toHaveLength(1);
    // The developpeur fixes the finding: one file of the lot changes, the test does not.
    ecrire(
      m.copie,
      'packages/forms/src/index.mjs',
      'export const mesure = x => 2 * x;\n// rendu\n'
    );
    const consigne = await lire(m, [CONSTAT], {
      verdict: 'ACCEPTÉ',
      suivi: [{ titre: CONSTAT.titre, etat: 'levé', preuve: 'mesure(0) rend 0.' }],
    });
    const [dernierLot] = readFileSync(m.ctx.fiches, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { role: string; lot?: { commit: string } })
      .filter(e => e.role === 'relecteur')
      .map(e => e.lot?.commit)
      .reverse();
    expect(consigne).toContain(`git diff ${lots[0]} ${dernierLot}`);
    expect(consigne).toContain("REPRISE : oui : 1 relecture(s) d'avant ont rendu le lot");
    const aLire = /LOTS À LIRE : ([^\n]*)/.exec(consigne)?.[1] ?? '';
    expect(aLire).toContain('packages/forms/src/index.mjs');
    expect(aLire).not.toContain('mesure.test.mjs');
    expect(consigne).toMatch(
      /LA RELECTURE D'AVANT : [^\n]*\n[\s\S]*### Constat 1 — packages\/forms\/src\/index\.mjs\nBloquant : critère 1\nAgent : developpeur\nmesure de 0 doit rendre 0\./
    );
    expect(consigne).not.toContain('{{');
  });
});
