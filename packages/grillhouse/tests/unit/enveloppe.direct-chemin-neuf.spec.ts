// A package born of a direct ticket, seen from the envelope (scripts/enveloppe/enveloppe.mjs,
// circuit.md §3.4): `jugerComposant` and `plan` accept a new path for the role `direct` alone,
// `preparerLesSorties` creates it before the mounts, and `plan` mounts it alone in writing. A test
// of size medium: a trial git repository with a base commit; bwrap is not launched.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../scripts/jointure.js';
import {
  jugerComposant,
  plan,
  preparerLesSorties,
  sortiesDuLangage,
} from '../../scripts/enveloppe/enveloppe.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'enveloppe-chemin-neuf-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const { sorties } = sortiesDuLangage((typescript as unknown as Langage).sorties, {
  maison: '/h',
  principal: '/main',
});
const PAQUETS = [{ dossier: 'packages/a', pkg: { name: 'a' } }];

// A copy of one package `a` and a file `scripts/outil.mjs` at its root, all committed.
function copie(): string {
  const c = mkdtempSync(path.join(ESSAIS, 'copie-'));
  mkdirSync(path.join(c, 'packages/a'), { recursive: true });
  mkdirSync(path.join(c, 'scripts'));
  writeFileSync(path.join(c, 'packages/a/package.json'), '{"name":"a"}\n');
  writeFileSync(path.join(c, 'scripts/outil.mjs'), 'export const un = 1;\n');
  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['config', 'user.email', 'essai@example.com'],
    ['config', 'user.name', 'essai'],
    ['add', '-A'],
    ['commit', '-q', '-m', 'base'],
  ]) {
    const r = spawnSync('git', ['-C', c, ...args], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
  }
  return c;
}

const preparer = (c: string, paquets: string[], role: string) =>
  preparerLesSorties({
    copie: c,
    paquets,
    paquetsDeLaCopie: PAQUETS,
    matieres: [],
    role,
    sorties,
  });
const planDe = (c: string, paquets: string[], role: string) =>
  plan(
    { trees: [], copie: c, paquets, role, paquetsDeLaCopie: PAQUETS, sorties },
    { existe: existsSync }
  );
// The paths of the copy `c` that the arguments of bwrap mount in writing.
const ecritsDansLaCopie = (args: string[], c: string) =>
  args.flatMap((a, i) => {
    const chemin = args[i + 1] ?? '';
    return a === '--bind' && (chemin === c || chemin.startsWith(`${c}/`)) ? [chemin] : [];
  });

describe('le jugement d’un composant au chemin neuf', () => {
  const absent = { existe: () => false };
  const juger = (composant: string, neuf: boolean) =>
    jugerComposant({ depot: '/depot', composant, paquets: PAQUETS, neuf }, absent);

  it('accepte un chemin neuf pour une séance de l’agent direct', () => {
    expect(juger('packages/neuf', true)).toBeNull();
  });

  it('le refuse à tout autre rôle', () => {
    expect(juger('packages/neuf', false)).toMatch(/n'existe pas/);
  });

  it.each(['neuf', '@essai/neuf', '../dehors/neuf'])(
    'refuse %s à l’agent direct aussi',
    composant => {
      expect(juger(composant, true)).not.toBeNull();
    }
  );
});

describe('l’enveloppe d’un plan au chemin neuf', () => {
  it('crée le chemin neuf d’un direct avant les montages', () => {
    const c = copie();
    preparer(c, ['packages/neuf'], 'direct');
    expect(statSync(path.join(c, 'packages/neuf')).isDirectory()).toBe(true);
  });

  it.each(['developpeur', 'testwriter'])('ne le crée pas pour le rôle %s', role => {
    const c = copie();
    preparer(c, ['packages/neuf'], role);
    expect(existsSync(path.join(c, 'packages/neuf'))).toBe(false);
  });

  it('laisse tel quel un composant qui est un fichier existant', () => {
    const c = copie();
    preparer(c, ['scripts/outil.mjs'], 'direct');
    expect(readFileSync(path.join(c, 'scripts/outil.mjs'), 'utf8')).toBe('export const un = 1;\n');
    const r = planDe(c, ['scripts/outil.mjs'], 'direct');
    expect(r.refus).toBeUndefined();
    // A file no package holds writes the root, as any existing path of the root does.
    expect(ecritsDansLaCopie(r.args ?? [], c)).toContain(c);
  });

  it('monte le chemin neuf seul en écriture, la copie en lecture seule', () => {
    const c = copie();
    preparer(c, ['packages/neuf'], 'direct');
    mkdirSync(path.join(c, 'packages/neuf'), { recursive: true });
    const args = planDe(c, ['packages/neuf'], 'direct').args ?? [];
    const neuf = path.join(c, 'packages/neuf');
    expect(args.join('\0')).toContain(['--ro-bind', c, c].join('\0'));
    const ecrits = ecritsDansLaCopie(args, c);
    expect(ecrits).toContain(neuf);
    // The other writable mounts of the copy are the outputs of the language, never code.
    expect(ecrits).not.toContain(c);
    expect(ecrits).not.toContain(path.join(c, 'packages/a'));
    expect(ecrits).not.toContain(path.join(c, 'scripts'));
  });

  it('refuse le plan d’un autre rôle sur un chemin neuf', () => {
    const r = planDe(copie(), ['packages/neuf'], 'developpeur');
    expect(r.refus).toMatch(/n'existe pas/);
  });

  it('accepte le plan d’un direct sur un chemin neuf pas encore créé', () => {
    expect(planDe(copie(), ['packages/neuf'], 'direct').refus).toBeUndefined();
  });
});
