// The remote cache of Turborepo read from the poste (docs/ARCHITECTURE.md, « Le cache distant de
// Turborepo »): the commands of the module of the language (`tests`, `verifier`, the night's
// `npm run verifier`, the circuit's passes) run under the variables of the file of the poste the
// module names, `~/.config/grillhouse/turbo-cache.env`, the cache read alone
// (`TURBO_CACHE=local:rw,remote:r`); without the file nothing changes, a CI that names its own
// server keeps it, and the session of an agent, whose home and environment the envelope declares,
// gets neither the file nor its variables.
//
// Small tests: the functions imported, a home of trial on the disk, no process started.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { composer } from '../../scripts/composition-des-langages.mjs';
import { environnementDeLaSeance, montagesDeLaSeance } from '../../scripts/enveloppe/enveloppe.mjs';
import {
  avecLeFichierDuPoste,
  configurationDuPoste,
  variablesDuTexte,
} from '../../scripts/fichier-du-poste.mjs';
import cargo from '../../scripts/langages/cargo/index.mjs';
import python from '../../scripts/langages/python/index.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';
import { environnementDe } from '../../scripts/sous-commandes.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'environnement-du-poste-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The four variables of the file of trial, none of them real.
const FICHIER = [
  '# le serveur du cache distant',
  'TURBO_API=https://cache.example',
  'export TURBO_TEAM="equipe"',
  "TURBO_TOKEN='jeton'",
  'TURBO_REMOTE_CACHE_SIGNATURE_KEY=cle',
  '',
].join('\n');
const VARIABLES = {
  TURBO_API: 'https://cache.example',
  TURBO_TEAM: 'equipe',
  TURBO_TOKEN: 'jeton',
  TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'cle',
};
const LECTURE_SEULE = { ...VARIABLES, TURBO_CACHE: 'local:rw,remote:r' };

// A home of trial <nom>, holding the file of the remote cache when <avecFichier>.
function maison(nom: string, avecFichier = true): string {
  const dir = path.join(ESSAIS, nom);
  mkdirSync(path.join(dir, '.config', 'grillhouse'), { recursive: true });
  if (avecFichier) {
    writeFileSync(path.join(dir, '.config', 'grillhouse', 'turbo-cache.env'), FICHIER);
  }
  return dir;
}

// A project of trial <nom>, its language TypeScript.
function projet(nom: string): string {
  const dir = path.join(ESSAIS, nom);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: nom, private: true }));
  declarerLesLangages(dir);
  return dir;
}

describe('the file of the poste', () => {
  it('lies under $XDG_CONFIG_HOME/grillhouse, else under ~/.config/grillhouse, else nowhere', () => {
    expect(configurationDuPoste({ XDG_CONFIG_HOME: '/x', HOME: '/h' })).toBe('/x/grillhouse');
    expect(configurationDuPoste({ HOME: '/h' })).toBe('/h/.config/grillhouse');
    expect(configurationDuPoste({ PATH: '/bin' })).toBeNull();
  });

  it('reads one variable per line, export and quotes taken off, comments and other lines passed over', () => {
    expect(variablesDuTexte(FICHIER)).toEqual(VARIABLES);
    expect(variablesDuTexte('pas une variable\n=vide\n1A=x\nA=\n')).toEqual({ A: '' });
  });

  it('adds its variables then the additions to the environment', () => {
    const lus: string[] = [];
    const env = avecLeFichierDuPoste(
      { HOME: '/h', PATH: '/bin' },
      { fichier: 'f.env', ajouts: { B: '2' }, lire: f => (lus.push(f), 'A=1\n') }
    );
    expect(env).toEqual({ HOME: '/h', PATH: '/bin', A: '1', B: '2' });
    expect(lus).toEqual(['/h/.config/grillhouse/f.env']);
  });

  it('leaves the environment as it is when it names one of its variables, empty included', () => {
    const lire = () => 'A=1\nC=3\n';
    for (const env of [
      { HOME: '/h', C: '' },
      { HOME: '/h', A: 'autre' },
    ]) {
      expect(avecLeFichierDuPoste(env, { fichier: 'f.env', ajouts: { B: '2' }, lire })).toBe(env);
    }
  });

  it('leaves the environment as it is without the file, or with a file without variables', () => {
    const env = { HOME: '/h' };
    expect(avecLeFichierDuPoste(env, { fichier: 'f.env', lire: () => null })).toBe(env);
    expect(avecLeFichierDuPoste(env, { fichier: 'f.env', lire: () => '# rien\n' })).toBe(env);
    const sansMaison = { PATH: '/bin' };
    expect(avecLeFichierDuPoste(sansMaison, { fichier: 'f.env', lire: () => 'A=1' })).toBe(
      sansMaison
    );
  });
});

describe('each module of language reads the remote cache of Turborepo from the poste, read-only', () => {
  const avec = maison('avec');
  const sans = maison('sans', false);

  it.each([
    ['typescript', typescript],
    ['cargo', cargo],
    ['python', python],
  ])('%s', (_, module) => {
    expect(module.environnementDuPoste({ HOME: avec })).toEqual({ HOME: avec, ...LECTURE_SEULE });
    expect(module.environnementDuPoste({ HOME: sans })).toEqual({ HOME: sans });
    // A CI names its server, written on a push, absent on a fork: the file of the poste stays out.
    const ci = { HOME: avec, TURBO_API: '', TURBO_TOKEN: '', TURBO_CACHE: 'local:rw' };
    expect(module.environnementDuPoste(ci)).toEqual(ci);
  });

  it('the composition of several languages applies it once', () => {
    const compose = composer([typescript, cargo]);
    expect(compose.environnementDuPoste({ HOME: avec })).toEqual({
      HOME: avec,
      ...LECTURE_SEULE,
    });
  });
});

describe('the commands of the module run under it, those of the core do not', () => {
  const avec = maison('commandes');
  const dir = projet('projet');

  it('`tests` and `verifier` read the cache; a subcommand of the core keeps its environment', () => {
    for (const nom of ['tests', 'verifier']) {
      expect(environnementDe(nom, dir, { HOME: avec }), nom).toEqual({
        HOME: avec,
        ...LECTURE_SEULE,
      });
    }
    expect(environnementDe('tableau', dir, { HOME: avec })).toEqual({ HOME: avec });
  });
});

describe('the session of an agent reads no remote cache', () => {
  it('gets none of its variables, and no mount of the file', () => {
    const env = environnementDeLaSeance(
      { HOME: '/h', PATH: '/bin', ...LECTURE_SEULE },
      { cacheNpm: '/h/.npm', paquets: ['packages/a'], travail: '/tmp/t' }
    ) as Record<string, string>;
    expect(Object.keys(env).filter(k => k.startsWith('TURBO_'))).toEqual([]);
    const montages = montagesDeLaSeance({
      cacheNpm: '/h/.npm',
      claude: '/h/.claude',
      projet: '/h/.claude/projects/-wt',
      etatJetable: '/t/claude.json',
      scratchpads: '/tmp/claude-1/-wt',
      outils: {},
    }) as { chemin: string }[];
    expect(montages.map(m => m.chemin).filter(c => c.includes('.config/grillhouse'))).toEqual([]);
  });
});
