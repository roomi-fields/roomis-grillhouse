// grillhouse-4id: the tools of the project (`grillhouse.outils` of its package.json, `{ "<VARIABLE>":
// "<chemin>" }`), as Bazel declares the environment of an action (--action_env): the circuit's
// passes, `npm run verifier` and the night play with these variables, taken from the key, even when
// their launcher does not hold them; a faulty key is refused by its name before any work, and so is
// a tool that would undo the envelope. The envelope's side (its mounts and the session's
// environment) is enveloppe.outils.spec.ts, the circuit's circuit.outils.spec.ts; the runs of the
// circuit, the night, the command of the key and `grillhouse verifier` are the night's
// (packages/grillhouse-essais/tests/outils.nuit.spec.ts).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import {
  avecLesOutils,
  empreinteDeLOutil,
  empreintesDe,
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
    expect(lireOutils({}, disque())).toEqual({ outils: {}, contenu: [], fautes: [] });
    expect(lireOutils(avec(null), disque())).toEqual({ outils: {}, contenu: [], fautes: [] });
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

describe('a tool declared by its content', () => {
  const lire = (outils: unknown, ...presents: string[]) =>
    lireOutils(avec(outils), disque(...presents));
  it('reads the long form like the short one, and lists the variables hashed by content', () => {
    const r = lire(
      { X_OUTIL: { chemin: '/opt/x', contenu: true }, Y_OUTIL: '/opt/y' },
      '/opt/x',
      '/opt/y'
    );
    expect(r.fautes).toEqual([]);
    expect(r.outils).toEqual({ X_OUTIL: '/opt/x', Y_OUTIL: '/opt/y' });
    expect(r.contenu).toEqual(['X_OUTIL']);
  });
  it('resolves ~ of the long form from the home', () => {
    const r = lire({ X_OUTIL: { chemin: '~/.cache/py', contenu: true } }, '/h/.cache/py');
    expect(r.outils).toEqual({ X_OUTIL: '/h/.cache/py' });
    expect(r.contenu).toEqual(['X_OUTIL']);
  });
  it('keeps the short form unhashed, and `contenu: false` too', () => {
    const r = lire(
      { X_OUTIL: '/opt/x', Y_OUTIL: { chemin: '/opt/y', contenu: false } },
      '/opt/x',
      '/opt/y'
    );
    expect(r.fautes).toEqual([]);
    expect(r.contenu).toEqual([]);
  });
  it('refuses an unknown key of the long form, naming the variable and the key', () => {
    const f = lire({ X_OUTIL: { chemin: '/opt/x', contenu: true, hash: 1 } }, '/opt/x');
    expect(f.fautes.join('\n')).toContain('grillhouse.outils.X_OUTIL');
    expect(f.fautes.join('\n')).toContain('hash');
    expect(f.outils).toEqual({});
  });
  it('refuses a `contenu` that is not a boolean, naming the variable', () => {
    for (const contenu of ['oui', 1, null]) {
      const f = lire({ X_OUTIL: { chemin: '/opt/x', contenu } }, '/opt/x');
      expect(f.fautes.join('\n'), String(contenu)).toContain('grillhouse.outils.X_OUTIL');
      expect(f.fautes.join('\n'), String(contenu)).toContain('contenu');
      expect(f.outils).toEqual({});
    }
  });
  it('refuses a long form without `chemin`, or with a `chemin` that is not a string', () => {
    for (const v of [{ contenu: true }, { chemin: 3, contenu: true }]) {
      const f = lire({ X_OUTIL: v });
      expect(f.fautes.join('\n')).toContain('grillhouse.outils.X_OUTIL');
      expect(f.fautes.join('\n')).toContain('chemin');
    }
  });
  it('refuses a long form that is an array', () => {
    expect(lire({ X_OUTIL: ['/opt/x'] }, '/opt/x').fautes.join('\n')).toContain(
      'grillhouse.outils.X_OUTIL'
    );
  });
  it('applies the path checks to the long form: root, home, hidden directory, keyrings, absent', () => {
    const refus = (chemin: string) =>
      lireOutils(avec({ X_OUTIL: { chemin, contenu: true } }), {
        maison: '/m/h',
        existe: () => true,
      });
    for (const [v, nomme] of [
      ['/', '/'],
      ['~', '/m/h'],
      ['~/.ssh/cle', '/m/h/.ssh/cle'],
      ['~/.local/share/keyrings', '/m/h/.local/share/keyrings'],
    ]) {
      const r = refus(v);
      expect(r.outils, v).toEqual({});
      expect(r.fautes.join('\n'), v).toContain('grillhouse.outils.X_OUTIL');
      expect(r.fautes.join('\n'), v).toContain(nomme);
    }
    const absent = lire({ X_OUTIL: { chemin: '~/absent', contenu: true } });
    expect(absent.fautes.join('\n')).toContain('/h/absent');
    expect(absent.outils).toEqual({});
  });
});

describe('the fingerprint of a tool is its content’s SHA-256', () => {
  const sha = (t: string | Buffer) => createHash('sha256').update(t).digest('hex');
  const neuf = (nom: string) => {
    const dir = path.join(ESSAIS, `empreinte-${nom}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  };
  it('of a file tool is the SHA-256 of its content, whatever its name or date', () => {
    const dir = neuf('fichier');
    const f = path.join(dir, 'python');
    writeFileSync(f, 'contenu du binaire');
    expect(empreinteDeLOutil(f)).toBe(sha('contenu du binaire'));
    const g = path.join(dir, 'autre-nom');
    copyFileSync(f, g);
    utimesSync(g, 1, 1);
    expect(empreinteDeLOutil(g)).toBe(sha('contenu du binaire'));
    writeFileSync(f, 'contenu changé');
    expect(empreinteDeLOutil(f)).toBe(sha('contenu changé'));
  });
  const arbre = (nom: string) => {
    const dir = neuf(nom);
    mkdirSync(path.join(dir, 'bin'), { recursive: true });
    mkdirSync(path.join(dir, 'lib', 'sous'), { recursive: true });
    writeFileSync(path.join(dir, 'bin', 'python'), 'binaire', { mode: 0o755 });
    writeFileSync(path.join(dir, 'lib', 'sous', 'm.py'), 'x = 1\n');
    symlinkSync('python', path.join(dir, 'bin', 'python3'));
    return dir;
  };
  it('of a directory tool is a SHA-256 hex digest that does not depend on where it lies', () => {
    const a = arbre('dossier-a');
    expect(empreinteDeLOutil(a)).toMatch(/^[0-9a-f]{64}$/);
    const b = path.join(ESSAIS, 'empreinte-dossier-copie', 'ailleurs');
    cpSync(a, b, { recursive: true, verbatimSymlinks: true });
    expect(empreinteDeLOutil(b)).toBe(empreinteDeLOutil(a));
  });
  it('of a directory keeps when only the dates are touched', () => {
    const a = arbre('dossier-dates');
    const avant = empreinteDeLOutil(a);
    utimesSync(path.join(a, 'lib', 'sous', 'm.py'), 5, 5);
    utimesSync(path.join(a, 'lib'), 7, 7);
    expect(empreinteDeLOutil(a)).toBe(avant);
  });
  it('of a directory changes with a file modified, added or removed', () => {
    const a = arbre('dossier-contenu');
    const base = empreinteDeLOutil(a);
    writeFileSync(path.join(a, 'lib', 'sous', 'm.py'), 'x = 2\n');
    const modifie = empreinteDeLOutil(a);
    expect(modifie).not.toBe(base);
    writeFileSync(path.join(a, 'lib', 'neuf.py'), '');
    const ajoute = empreinteDeLOutil(a);
    expect(ajoute).not.toBe(modifie);
    rmSync(path.join(a, 'lib', 'neuf.py'));
    expect(empreinteDeLOutil(a)).toBe(modifie);
    rmSync(path.join(a, 'lib', 'sous', 'm.py'));
    expect(empreinteDeLOutil(a)).not.toBe(modifie);
  });
  it('of a directory changes with the path of a file, and with its executable bit', () => {
    const a = arbre('dossier-chemin');
    const base = empreinteDeLOutil(a);
    chmodSync(path.join(a, 'bin', 'python'), 0o644);
    const sansX = empreinteDeLOutil(a);
    expect(sansX).not.toBe(base);
    chmodSync(path.join(a, 'bin', 'python'), 0o755);
    expect(empreinteDeLOutil(a)).toBe(base);
    const b = arbre('dossier-chemin-b');
    cpSync(path.join(b, 'lib', 'sous', 'm.py'), path.join(b, 'lib', 'm.py'));
    rmSync(path.join(b, 'lib', 'sous', 'm.py'));
    expect(empreinteDeLOutil(b)).not.toBe(base);
  });
  it('of a directory takes a link by its target’s text, never followed', () => {
    const a = arbre('dossier-lien');
    const base = empreinteDeLOutil(a);
    rmSync(path.join(a, 'bin', 'python3'));
    symlinkSync('../lib/sous/m.py', path.join(a, 'bin', 'python3'));
    const autre = empreinteDeLOutil(a);
    expect(autre).not.toBe(base);
    // The content of the target changing, the link unchanged, the digest follows the target file
    // only as a file of the tree; a link to the outside is not read.
    const dehors = path.join(ESSAIS, 'empreinte-dehors');
    writeFileSync(dehors, 'un');
    const b = neuf('dossier-lien-dehors');
    symlinkSync(dehors, path.join(b, 'lien'));
    const avant = empreinteDeLOutil(b);
    writeFileSync(dehors, 'deux');
    expect(empreinteDeLOutil(b)).toBe(avant);
  });
  it('of a directory leaves out the `__pycache__` directories, at any depth', () => {
    const a = arbre('dossier-pycache');
    const base = empreinteDeLOutil(a);
    mkdirSync(path.join(a, 'lib', '__pycache__'), { recursive: true });
    writeFileSync(path.join(a, 'lib', '__pycache__', 'm.cpython-312.pyc'), 'octets');
    mkdirSync(path.join(a, 'lib', 'sous', '__pycache__'), { recursive: true });
    writeFileSync(path.join(a, 'lib', 'sous', '__pycache__', 'x.pyc'), 'octets');
    expect(empreinteDeLOutil(a)).toBe(base);
    expect(readdirSync(path.join(a, 'lib'))).toContain('__pycache__');
  });
  it('of a directory does not mix the bytes of one file into another: the boundaries count', () => {
    const a = neuf('frontieres-a');
    writeFileSync(path.join(a, 'f1'), 'ab');
    writeFileSync(path.join(a, 'f2'), 'c');
    const b = neuf('frontieres-b');
    writeFileSync(path.join(b, 'f1'), 'a');
    writeFileSync(path.join(b, 'f2'), 'bc');
    expect(empreinteDeLOutil(a)).not.toBe(empreinteDeLOutil(b));
  });
  it('of a directory does not depend on the order the disk lists its entries', () => {
    const a = neuf('ordre-a');
    const b = neuf('ordre-b');
    for (const n of ['z', 'a', 'm', 'B']) {
      writeFileSync(path.join(a, n), n);
    }
    for (const n of ['B', 'm', 'a', 'z']) {
      writeFileSync(path.join(b, n), n);
    }
    expect(empreinteDeLOutil(a)).toBe(empreinteDeLOutil(b));
  });
  it('refuses an unreadable file, naming the tool', () => {
    if (process.getuid?.() === 0) {
      return;
    }
    const a = neuf('illisible');
    const f = path.join(a, 'secret');
    writeFileSync(f, 'x');
    chmodSync(f, 0o000);
    expect(() => empreinteDeLOutil(a)).toThrow(/secret/);
    expect(() => empreinteDeLOutil(f)).toThrow(/secret/);
  });
  it('refuses a special file (a socket), naming it', async () => {
    const a = neuf('special');
    const sock = path.join(a, 's.sock');
    const serveur = createServer();
    // A socket path holds 107 bytes at most: a longer temporary directory cannot bind one.
    const lie = await new Promise<boolean>(r => {
      serveur.once('error', () => r(false));
      serveur.listen(sock, () => r(true));
    });
    if (!lie) {
      return;
    }
    try {
      expect(() => empreinteDeLOutil(a)).toThrow(/s\.sock/);
    } finally {
      await new Promise(r => serveur.close(r));
    }
  });
});

describe('the fingerprints of the tools of a project', () => {
  it('gives `<VARIABLE>_EMPREINTE` for each tool hashed by content, none for a short form', () => {
    const haché = path.join(ESSAIS, 'outil-haché');
    const court = path.join(ESSAIS, 'outil-court');
    mkdirSync(haché, { recursive: true });
    mkdirSync(court, { recursive: true });
    writeFileSync(path.join(haché, 'f'), 'contenu');
    const dir = projet('empreintes', {
      X_OUTIL: { chemin: haché, contenu: true },
      Y_OUTIL: court,
    });
    expect(empreintesDe(dir)).toEqual({ X_OUTIL_EMPREINTE: empreinteDeLOutil(haché) });
    expect(empreintesDe(projet('empreintes-courtes', { Y_OUTIL: court }))).toEqual({});
    expect(empreintesDe(projet('empreintes-sans', null))).toEqual({});
  });
  it('changes with the content of the tool, and keeps without a change', () => {
    const outil = path.join(ESSAIS, 'outil-change');
    mkdirSync(outil, { recursive: true });
    writeFileSync(path.join(outil, 'f'), 'un');
    const dir = projet('empreintes-change', { X_OUTIL: { chemin: outil, contenu: true } });
    const avant = empreintesDe(dir);
    expect(empreintesDe(dir)).toEqual(avant);
    writeFileSync(path.join(outil, 'f'), 'deux');
    expect(empreintesDe(dir)).not.toEqual(avant);
  });
  it('refuses a hashed tool that is absent, naming its variable', () => {
    const dir = projet('empreintes-absent', {
      X_OUTIL: { chemin: '/nulle/part/outil', contenu: true },
    });
    expect(() => empreintesDe(dir)).toThrow(/grillhouse\.outils\.X_OUTIL/);
    expect(() => outilsDe(dir)).toThrow(/grillhouse\.outils\.X_OUTIL/);
  });
  it('refuses a hashed tool with an unreadable file, naming its variable', () => {
    if (process.getuid?.() === 0) {
      return;
    }
    const outil = path.join(ESSAIS, 'outil-illisible');
    mkdirSync(outil, { recursive: true });
    const f = path.join(outil, 'secret');
    writeFileSync(f, 'x');
    chmodSync(f, 0o000);
    const dir = projet('empreintes-illisible', { X_OUTIL: { chemin: outil, contenu: true } });
    expect(() => empreintesDe(dir)).toThrow(/grillhouse\.outils\.X_OUTIL/);
  });
  it('refuses a faulty long form, naming the key', () => {
    const dir = projet('empreintes-fautive', { X_OUTIL: { chemin: '/opt', contenu: 'oui' } });
    expect(() => empreintesDe(dir)).toThrow(/grillhouse\.outils\.X_OUTIL/);
  });
  it('gives each pass the fingerprint variable beside the tool’s', () => {
    const outil = path.join(ESSAIS, 'outil-passe');
    mkdirSync(outil, { recursive: true });
    writeFileSync(path.join(outil, 'f'), 'contenu');
    const dir = projet('empreintes-passe', { X_OUTIL: { chemin: outil, contenu: true } });
    const empreintes = empreintesDe(dir);
    expect(avecLesOutils(outilsDe(dir), { PATH: '/bin' }, empreintes)).toEqual({
      PATH: '/bin',
      X_OUTIL: outil,
      ...empreintes,
    });
    expect(
      avecLesOutils(outilsDe(dir), { X_OUTIL_EMPREINTE: 'périmée' }, empreintes).X_OUTIL_EMPREINTE
    ).toBe(empreintes.X_OUTIL_EMPREINTE);
    expect(environnementDe('verifier', dir, { PATH: '/bin' })).toEqual({
      PATH: '/bin',
      X_OUTIL: outil,
      ...empreintes,
    });
    for (const nom of ['tests', 'construire', 'typer']) {
      expect(environnementDe(nom, dir, { PATH: '/bin' }), nom).toMatchObject(empreintes);
    }
    expect(environnementDe('tableau', dir, { PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });
  it('gives no fingerprint variable to a tool of the short form', () => {
    const outil = path.join(ESSAIS, 'outil-passe-court');
    mkdirSync(outil, { recursive: true });
    const dir = projet('empreintes-passe-court', { X_OUTIL: outil });
    expect(Object.keys(environnementDe('verifier', dir, {}))).toEqual(['X_OUTIL']);
  });
  it('the night evaluates the fingerprint beside each hashed tool', () => {
    expect(exportsDesOutils({ X_OUTIL: '/opt/x' }, { X_OUTIL_EMPREINTE: 'abc123' })).toBe(
      "export X_OUTIL='/opt/x'\nexport X_OUTIL_EMPREINTE='abc123'\n"
    );
    expect(exportsDesOutils({ X_OUTIL: '/opt/x' })).toBe("export X_OUTIL='/opt/x'\n");
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
  it('every subcommand of the language module runs with the tools of the key, whatever its launcher holds', () => {
    const outil = path.join(ESSAIS, 'outil-l');
    mkdirSync(outil, { recursive: true });
    const dir = projet('langage', { X_OUTIL: outil });
    for (const nom of ['tests', 'construire', 'typer', 'tests-de-nuit']) {
      expect(environnementDe(nom, dir, { PATH: '/bin', X_OUTIL: '/ailleurs' }), nom).toEqual({
        PATH: '/bin',
        X_OUTIL: outil,
      });
    }
  });
  it('every subcommand of the language module refuses a faulty key, naming it', () => {
    const dir = projet('langage-fautive', { X_OUTIL: '/nulle/part/outil' });
    for (const nom of ['tests', 'construire', 'typer']) {
      expect(() => environnementDe(nom, dir, {}), nom).toThrow(
        /grillhouse\.outils\.X_OUTIL nomme \/nulle\/part\/outil/
      );
    }
  });
  it('a subcommand of the core keeps the environment of its launcher, without tools, even with a faulty key', () => {
    const dir = projet('noyau', { X_OUTIL: '/nulle/part/outil' });
    for (const nom of ['tableau', 'ticket', 'maj']) {
      expect(environnementDe(nom, dir, { PATH: '/bin' }), nom).toEqual({ PATH: '/bin' });
    }
  });
  it('`verifier` refuses a faulty key, naming it', () => {
    const dir = projet('verifier-fautive', { X_OUTIL: '/nulle/part/outil' });
    expect(() => environnementDe('verifier', dir, {})).toThrow(
      /grillhouse\.outils\.X_OUTIL nomme \/nulle\/part\/outil/
    );
  });
});
