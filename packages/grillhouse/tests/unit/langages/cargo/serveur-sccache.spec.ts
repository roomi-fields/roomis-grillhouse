// The start of the server of sccache (scripts/langages/cargo/sccache.mjs, `demarrerLeServeur`):
// the server is judged reachable by what sccache answers (`--start-server`, then `--show-stats`
// under the same environment), and a refusal is one line carrying both outputs. The fake sccache
// of faux-cargo.ts answers by `FAUX_SCCACHE_SORTIES` and applies no rule of SUN_LEN.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { avecSccache, demarrerLeServeur } from '../../../../scripts/langages/cargo/sccache.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'serveur-sccache-'));
const JOURNAL = path.join(ESSAIS, 'journal');
const APPELS = path.join(ESSAIS, 'appels');
const MAISON = path.join(ESSAIS, 'maison');
// A temporary directory longer than the 108 bytes of a socket's path.
const LONG = path.join(ESSAIS, 'x'.repeat(60), 'y'.repeat(60), 'travail');
let restaurer = () => {};
let seul: string;
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
  seul = (exemples.preparer(ESSAIS) as { depots: { seul: string } }).depots.seul;
  mkdirSync(LONG, { recursive: true });
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());
beforeEach(() => {
  writeFileSync(APPELS, '');
  process.env.FAUX_SCCACHE_JOURNAL = APPELS;
  delete process.env.FAUX_SCCACHE_SORTIES;
});

const env = (en: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  RUSTC_WRAPPER: '',
  CARGO_BUILD_RUSTC_WRAPPER: '',
  CARGO_HOME: '',
  SCCACHE_DIR: '',
  SCCACHE_SERVER_UDS: '',
  XDG_CACHE_HOME: '',
  HOME: MAISON,
  TMPDIR: LONG,
  ...en,
});
const sorties = (o: object) => {
  process.env.FAUX_SCCACHE_SORTIES = JSON.stringify(o);
};
// The calls of the fake sccache, each `{ appel, tmpdir, socket }`.
const appels = () =>
  readFileSync(APPELS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const mots = l.split(' ');
      const cles = mots.filter(m => /^[A-Z_]+=/.test(m));
      const o = new Map(cles.map(x => [x.split('=')[0], x.slice(x.indexOf('=') + 1)]));
      return {
        appel: mots.filter(m => !cles.includes(m)).join(' '),
        tmpdir: o.get('TMPDIR') ?? '',
        socket: o.get('SCCACHE_SERVER_UDS') ?? '',
      };
    });

describe('avecSccache : le lanceur de rustc', () => {
  it('lance le client de sccache sous un dossier temporaire court, quand le TMPDIR de cargo dépasse les 108 octets d’un socket', () => {
    // A client cargo runs may start the server itself, binding a socket under its TMPDIR: the
    // wrapper must hand it the short one (« path must be shorter than SUN_LEN »).
    expect(LONG.length).toBeGreaterThan(108);
    const lanceur = avecSccache(seul, env()).RUSTC_WRAPPER as string;
    expect(path.isAbsolute(lanceur)).toBe(true);
    const r = spawnSync(lanceur, ['rustc', '-vV'], {
      env: { ...avecSccache(seul, env()), TMPDIR: LONG },
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    const [appel] = appels();
    expect(appel.appel).toBe('sccache rustc -vV');
    expect(appel.tmpdir).toBe('/tmp');
    expect(appel.socket).toBe(avecSccache(seul, env()).SCCACHE_SERVER_UDS);
  });
});

describe('demarrerLeServeur', () => {
  it('rend null quand le serveur répond, après l’avoir démarré puis interrogé sous le même environnement court', () => {
    expect(demarrerLeServeur(seul, env())).toBeNull();
    const a = appels();
    expect(a.map(x => x.appel)).toEqual(['sccache --start-server', 'sccache --show-stats']);
    const socket = avecSccache(seul, env()).SCCACHE_SERVER_UDS;
    expect(socket).toMatch(/^\\x00grillhouse-sccache-[0-9a-f]{16}$/);
    for (const x of a) {
      expect(x.tmpdir).toBe('/tmp');
      expect(x.socket).toBe(socket);
    }
  });

  it('rend null quand le démarrage échoue parce qu’un serveur tourne déjà et répond', () => {
    sorties({ '--start-server': { code: 2, stderr: 'Server is already running' } });
    expect(demarrerLeServeur(seul, env())).toBeNull();
  });

  it('rend une ligne qui nomme le démarrage du serveur sccache et porte les sorties du démarrage et de l’interrogation', () => {
    sorties({
      '--start-server': { code: 2, stdout: 'sortie-demarrage', stderr: 'erreur-demarrage' },
      '--show-stats': { code: 1, stdout: 'sortie-interrogation', stderr: 'erreur-interrogation' },
    });
    const ligne = demarrerLeServeur(seul, env());
    expect(typeof ligne).toBe('string');
    for (const dit of [
      'démarrage du serveur sccache',
      'sortie-demarrage',
      'erreur-demarrage',
      'sortie-interrogation',
      'erreur-interrogation',
    ]) {
      expect(ligne, dit).toContain(dit);
    }
  });

  it('rend une ligne quand le démarrage réussit et que l’interrogation échoue', () => {
    sorties({ '--show-stats': { code: 1, stderr: 'pas-joignable' } });
    const ligne = demarrerLeServeur(seul, env());
    expect(ligne).toContain('démarrage du serveur sccache');
    expect(ligne).toContain('pas-joignable');
  });

  it('juge le serveur par la sortie de sccache sous un dossier temporaire court, jamais par la longueur du dossier de la passe', () => {
    // A long TMPDIR for the run: the fake carries no rule of SUN_LEN, and the start is judged by
    // its answers alone.
    expect(demarrerLeServeur(seul, env({ TMPDIR: LONG }))).toBeNull();
    expect(appels().every(x => x.tmpdir === '/tmp')).toBe(true);
  });

  it('rend null sans appeler sccache quand le projet pose son propre lanceur', () => {
    sorties({
      '--start-server': { code: 2, stderr: 'refus' },
      '--show-stats': { code: 1, stderr: 'refus' },
    });
    expect(demarrerLeServeur(seul, env({ RUSTC_WRAPPER: 'mon-lanceur' }))).toBeNull();
    expect(appels()).toEqual([]);
  });
});
