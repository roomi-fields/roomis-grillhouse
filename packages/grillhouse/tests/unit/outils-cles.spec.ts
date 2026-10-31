// grillhouse-4id: the tools of the project (`grillhouse.outils` of its package.json, `{ "<VARIABLE>":
// "<chemin>" }`), as Bazel declares the environment of an action (--action_env): the circuit's
// passes, `npm run verifier` and the night play with these variables, taken from the key, even when
// their launcher does not hold them; a faulty key is refused by its name before any work, and so is
// a tool that would undo the envelope. The envelope's side (its mounts and the session's
// environment) is enveloppe.outils.spec.ts, the circuit's circuit.outils.spec.ts; the runs of the
// circuit, the night, the command of the key and `grillhouse verifier` are the night's
// (packages/grillhouse-essais/tests/outils.nuit.spec.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import {
  avecLesOutils,
  exportsDesOutils,
  lireOutils,
  outilsDe,
} from '../../scripts/outils-cles.mjs';
import { environnementDe } from '../../scripts/sous-commandes.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'outils-cles-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A disk where only <presents> exist, the home /h.
const disque = (...presents: string[]) => ({
  maison: '/h',
  existe: (p: string) => presents.includes(p),
});
const avec = (outils: unknown) => ({ grillhouse: { outils } });

// A project of trial <nom> whose package.json declares <outils>, its language TypeScript.
function projet(nom: string, outils: unknown): string {
  const dir = path.join(ESSAIS, nom);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: nom, private: true, grillhouse: { outils } })
  );
  declarerLesLangages(dir);
  return dir;
}

describe('critère 1 — the reading of grillhouse.outils', () => {
  it('gives each variable its path, ~ resolved from the home', () => {
    const { outils, fautes } = lireOutils(
      avec({ X_OUTIL: '~/.cache/outil', Y_OUTIL: '/opt/y' }),
      disque('/h/.cache/outil', '/opt/y')
    );
    expect(fautes).toEqual([]);
    expect(outils).toEqual({ X_OUTIL: '/h/.cache/outil', Y_OUTIL: '/opt/y' });
  });
  it('gives nothing without the key, or with null', () => {
    expect(lireOutils({}, disque())).toEqual({ outils: {}, fautes: [] });
    expect(lireOutils(avec(null), disque())).toEqual({ outils: {}, fautes: [] });
  });
});

describe('critère 3 — a faulty key is refused by its name', () => {
  const fautes = (outils: unknown, ...presents: string[]) =>
    lireOutils(avec(outils), disque(...presents)).fautes.join('\n');
  it('refuses a key that is not an object', () => {
    expect(fautes(['/opt/y'])).toContain('grillhouse.outils');
    expect(fautes('/opt/y')).toContain('grillhouse.outils');
  });
  it('refuses a value that is not a string, naming its variable', () => {
    const f = fautes({ X_OUTIL: 3 });
    expect(f).toContain('grillhouse.outils.X_OUTIL');
    expect(f).toContain('3');
  });
  it('refuses an invalid variable name, naming it', () => {
    expect(fautes({ 'X-OUTIL': '/opt/y' }, '/opt/y')).toContain('X-OUTIL');
    expect(fautes({ '1X': '/opt/y' }, '/opt/y')).toContain('1X');
  });
  it('refuses a path neither absolute nor under ~', () => {
    expect(fautes({ X_OUTIL: 'opt/y' }, 'opt/y')).toContain('grillhouse.outils.X_OUTIL');
  });
  it('refuses a path that does not exist, naming it resolved', () => {
    const f = fautes({ X_OUTIL: '~/absent' });
    expect(f).toContain('grillhouse.outils.X_OUTIL');
    expect(f).toContain('/h/absent');
  });
  it('gives no variable when the key is faulty', () => {
    expect(lireOutils(avec({ X_OUTIL: '/opt/y', Y: 3 }), disque('/opt/y')).outils).toEqual({});
  });
});

// A tool never undoes the envelope (the review of grillhouse-4id, constat 1): with "~", `--ro-bind
// ~ ~` brought the whole home back, credentials included, over `~/.claude` and the session's
// directory mounted in writing; with "/", over the emptied /tmp.
describe('constat 1 — a tool that would undo the envelope is refused, its variable and path named', () => {
  const refus = (v: string, montages: string[] = []) =>
    lireOutils(avec({ X_OUTIL: v }), { maison: '/m/h', existe: () => true, montages });
  const refuse = (v: string, chemin: string, montages: string[] = []) => {
    const { outils, fautes } = refus(v, montages);
    expect(outils, v).toEqual({});
    expect(fautes.join('\n'), v).toContain('grillhouse.outils.X_OUTIL');
    expect(fautes.join('\n'), v).toContain(chemin);
  };
  it('refuses the root', () => refuse('/', '/'));
  it('refuses the home, and a path that holds it', () => {
    refuse('~', '/m/h');
    refuse('/m/h', '/m/h');
    refuse('/m', '/m');
  });
  it('refuses a path that holds a mount of the envelope', () => {
    for (const m of ['/w/depot/.claude/worktrees/t', '/tmp', '/m/h/.claude', '/run/user/1']) {
      refuse(path.dirname(m), path.dirname(m), [m]);
      refuse(m, m, [m]);
    }
  });
  it('refuses a path under a hidden directory of the home where credentials live', () => {
    for (const v of [
      '~/.ssh',
      '~/.ssh/cle',
      '~/.gnupg',
      '~/.aws/outil',
      '~/.config/gh',
      '~/.npm',
    ]) {
      refuse(v, path.join('/m/h', v.slice(2)));
    }
  });
  it('refuses a path under the keyrings ~/.local/share/keyrings, or holding them', () => {
    for (const v of ['~/.local/share/keyrings', '~/.local/share/keyrings/login.keyring']) {
      refuse(v, path.join('/m/h', v.slice(2)));
    }
    refuse('~/.local/share', '/m/h/.local/share/keyrings');
    refuse('~/.local', '/m/h/.local/share/keyrings');
  });
  // The review of grillhouse-4id: the envelope mounts what a link leads to; a link
  // ~/.cache/x → ~/.ssh passed when only the path written was judged.
  it('refuses a link whose target the rules refuse, naming the target', () => {
    const lien = refus('~/.cache/x', []);
    expect(lien.fautes).toEqual([]);
    const { outils, fautes } = lireOutils(avec({ X_OUTIL: '~/.cache/x' }), {
      maison: '/m/h',
      existe: () => true,
      reel: p => (p === '/m/h/.cache/x' ? '/m/h/.ssh' : p),
    });
    expect(outils).toEqual({});
    expect(fautes.join('\n')).toContain('grillhouse.outils.X_OUTIL');
    expect(fautes.join('\n')).toContain('/m/h/.ssh');
    expect(fautes.join('\n')).toContain('/m/h/.cache/x');
  });
  it('follows a real link on disk to its target', () => {
    const maison = path.join(ESSAIS, 'maison');
    mkdirSync(path.join(maison, '.ssh'), { recursive: true });
    mkdirSync(path.join(maison, '.cache'), { recursive: true });
    symlinkSync(path.join(maison, '.ssh'), path.join(maison, '.cache', 'x'));
    const r = lireOutils(avec({ X_OUTIL: '~/.cache/x' }), { maison });
    expect(r.outils).toEqual({});
    expect(r.fautes.join('\n')).toContain(path.join(maison, '.ssh'));
  });
  it('accepts a path under ~/.local or ~/.cache, out of the home, or inside a mount', () => {
    for (const v of ['~/.cache/synthhub-python', '~/.local/bin/outil', '~/outils/x', '/opt/y']) {
      expect(refus(v, ['/tmp']).fautes, v).toEqual([]);
    }
    expect(refus('/tmp/outil', ['/tmp']).fautes).toEqual([]);
  });
  it('outilsDe refuses a path that holds the main tree, or /tmp', () => {
    const depot = projet('depot-contenu', { X_OUTIL: ESSAIS });
    expect(() => outilsDe(depot)).toThrow(/qui contient/);
    const tmp = projet('depot-tmp', { X_OUTIL: '/tmp' });
    expect(() => outilsDe(tmp)).toThrow(/grillhouse\.outils\.X_OUTIL nomme \/tmp/);
  });
});

describe('constat 1 — the key is the main tree’s, never a copy’s', () => {
  it('a copy reads the key of its main tree', () => {
    const outil = path.join(ESSAIS, 'outil-principal');
    const autre = path.join(ESSAIS, 'outil-copie');
    mkdirSync(outil, { recursive: true });
    mkdirSync(autre, { recursive: true });
    const principal = projet('principal', { X_OUTIL: outil });
    const depot = (...a: string[]) => {
      const r = spawnSync('git', ['-C', principal, ...a], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
    };
    depot('init', '-q');
    depot('add', 'package.json');
    depot('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'un');
    const copie = path.join(principal, '.claude', 'worktrees', 'c');
    depot('worktree', 'add', '-q', '--detach', copie);
    writeFileSync(
      path.join(copie, 'package.json'),
      JSON.stringify({ name: 'c', grillhouse: { outils: { X_OUTIL: autre, Y: autre } } })
    );
    expect(outilsDe(copie)).toEqual({ X_OUTIL: outil });
  });
});

describe('critère 2 — the passes play with the variables of the key', () => {
  it('adds them to an environment that does not hold them, the key winning', () => {
    const outil = path.join(ESSAIS, 'outil-a');
    mkdirSync(outil, { recursive: true });
    const outils = outilsDe(projet('passe', { X_OUTIL: outil }));
    expect(avecLesOutils(outils, { PATH: '/bin', X_OUTIL: '/ailleurs' })).toEqual({
      PATH: '/bin',
      X_OUTIL: outil,
    });
    expect(avecLesOutils(outils, { PATH: '/bin' })).toEqual({ PATH: '/bin', X_OUTIL: outil });
  });
  it('leaves the environment as it is without the key', () => {
    const dir = projet('sans', null);
    expect(avecLesOutils(outilsDe(dir), { PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });
  it('throws the faults of the key', () => {
    const dir = projet('fautive', { X_OUTIL: 3 });
    expect(() => outilsDe(dir)).toThrow(/grillhouse\.outils\.X_OUTIL/);
  });
  it('the night evaluates one export per tool, its path quoted for the shell', () => {
    expect(exportsDesOutils({ X_OUTIL: '/opt/x', Y: "/opt/l'outil" })).toBe(
      "export X_OUTIL='/opt/x'\nexport Y='/opt/l'\\''outil'\n"
    );
    expect(exportsDesOutils({})).toBe('');
  });
  it('`verifier` runs with the tools of the key, every other subcommand with its environment', () => {
    const outil = path.join(ESSAIS, 'outil-v');
    mkdirSync(outil, { recursive: true });
    const dir = projet('verifier', { X_OUTIL: outil });
    expect(environnementDe('verifier', dir, { PATH: '/bin' })).toEqual({
      PATH: '/bin',
      X_OUTIL: outil,
    });
    expect(environnementDe('tableau', dir, { PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });
  it('`verifier` refuses a faulty key, naming it', () => {
    const dir = projet('verifier-fautive', { X_OUTIL: '/nulle/part/outil' });
    expect(() => environnementDe('verifier', dir, {})).toThrow(
      /grillhouse\.outils\.X_OUTIL nomme \/nulle\/part\/outil/
    );
  });
});
