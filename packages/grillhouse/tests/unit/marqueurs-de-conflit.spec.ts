// grillhouse-3uv.95.6: no text of the frame carries a marker of a merge conflict. Witness: the
// rebase of 3uv.95.6 on 3uv.95.7 committed `<<<<<<< HEAD` … `>>>>>>>` in the agents' templates
// (mods/grillhouse/skills/pitmaster/references/consigne-agent.md), which every session reads.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
// The markers git writes in a file it could not merge, each at the start of its line.
const MARQUEUR = /^(?:<{7} |={7}$|>{7} )/m;

// The files git tracks under <dossiers>, of the extensions <exts>.
const suivis = (dossiers: string[], exts: string[]) =>
  String(
    spawnSync('git', ['-C', RACINE, 'ls-files', '-z', '--', ...dossiers], { encoding: 'utf8' })
      .stdout ?? ''
  )
    .split('\0')
    .filter(f => f && exts.some(e => f.endsWith(e)) && existsSync(path.join(RACINE, f)));

describe('no marker of a merge conflict in the texts of the frame', () => {
  it('the marker is recognised at the start of a line, and only there', () => {
    expect(MARQUEUR.test('a\n<<<<<<< HEAD\nb')).toBe(true);
    expect(MARQUEUR.test('a\n=======\nb')).toBe(true);
    expect(MARQUEUR.test('>>>>>>> 506cd08 (feat)')).toBe(true);
    expect(MARQUEUR.test('a <<<<<<< b ======= c')).toBe(false);
    expect(MARQUEUR.test('========')).toBe(false);
  });

  it('no template, skill or agent of mods/grillhouse, nor a script or document of the package, carries one', () => {
    const fichiers = suivis(
      ['mods/grillhouse', 'packages/grillhouse/scripts', 'packages/grillhouse/docs', 'templates'],
      ['.md', '.mjs', '.ts', '.tsx', '.sh', '.json']
    );
    expect(fichiers.length).toBeGreaterThan(20);
    const porteurs = fichiers.filter(f =>
      MARQUEUR.test(readFileSync(path.join(RACINE, f), 'utf8'))
    );
    expect(porteurs).toEqual([]);
  });
});
