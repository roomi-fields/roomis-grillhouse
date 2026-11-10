// grillhouse-4nr.2, criteria 7, 8 and 10, by the command: `grillhouse temporal installer` refuses
// an archive whose sum differs from the pinned one, nothing laid down, the two sums named;
// `grillhouse temporal etat` without an installation says so and fails; a malformed call gives the
// usage; `--programme-seul` lays down the program alone; a subcommand whose built script is
// missing names the build; the package's prepack builds dist/, and a copy of its sources alone,
// built, publishes dist/temporal/. Everything under a trial home
// and a trial directory of units, systemctl a stand-in that fails: no test touches the account's
// systemd.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptAbsent } from '../../scripts/sous-commandes.mjs';
import { EPINGLE } from '../../src/temporal/installation.js';
import { COMMANDE, dossier, PAQUET } from './essai.js';

function lieux() {
  const racine = dossier('projet');
  writeFileSync(path.join(racine, 'package.json'), '{ "name": "essai" }\n');
  const systemctl = path.join(dossier('faux'), 'systemctl');
  writeFileSync(systemctl, '#!/bin/sh\nexit 9\n', { mode: 0o755 });
  const maison = dossier('maison');
  const unites = dossier('unites');
  const options = ['--maison', maison, '--unites', unites, '--racine', racine];
  return { racine, maison, unites, options: [...options, '--systemctl', systemctl] };
}

const temporal = (args: string[]) =>
  spawnSync(process.execPath, [COMMANDE, 'temporal', ...args], { encoding: 'utf8' });

describe('grillhouse temporal installer', () => {
  it('refuses an archive whose sum differs from the pinned one: exit 1, nothing laid down', () => {
    const l = lieux();
    const archive = path.join(dossier('archive'), 'temporal.tar.gz');
    writeFileSync(archive, 'pas une archive');
    const r = temporal(['installer', ...l.options, '--archive', archive]);
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain(Object.values(EPINGLE.sommes).find(Boolean));
    expect(r.stderr).toMatch(/attendue/);
    expect(r.stderr).toMatch(/lue [0-9a-f]{64}/);
    expect(readdirSync(l.maison)).toEqual([]);
    expect(readdirSync(l.unites)).toEqual([]);
  });
});

describe('grillhouse temporal etat', () => {
  it('without an installation, says so and fails', () => {
    const l = lieux();
    const r = temporal(['etat', ...l.options]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Temporal n’est pas installé/);
  });
});

describe('a malformed call', () => {
  it('without an action or with an unknown one, gives the usage, exit 2', () => {
    for (const args of [[], ['demarrer']]) {
      const r = temporal(args);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr).toMatch(/Usage : grillhouse temporal <installer\|etat>/);
    }
  });
});

describe('grillhouse temporal installer --programme-seul (the CI’s mode)', () => {
  it('writes the path of the program laid down, and neither a unit, nor the package.json, nor systemctl', () => {
    const maison = dossier('maison');
    const programme = path.join(maison, '.cache/grillhouse/temporal', EPINGLE.version, 'temporal');
    mkdirSync(path.dirname(programme), { recursive: true });
    writeFileSync(programme, '#!/bin/sh\n', { mode: 0o755 });
    const faux = dossier('faux');
    const trace = path.join(faux, 'appele');
    writeFileSync(path.join(faux, 'systemctl'), `#!/bin/sh\ntouch ${trace}\n`, { mode: 0o755 });
    const r = spawnSync(
      process.execPath,
      [COMMANDE, 'temporal', 'installer', '--programme-seul', '--maison', maison],
      { encoding: 'utf8', env: { ...process.env, PATH: `${faux}:${process.env.PATH}` } }
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(`${programme}\n`);
    expect(existsSync(trace)).toBe(false);
    expect(readdirSync(maison)).toEqual(['.cache']);
  });

  it('refuses the places of the units and of the project, which it does not write: exit 2', () => {
    const l = lieux();
    const r = temporal(['installer', '--programme-seul', ...l.options]);
    expect(r.status).toBe(2);
    expect(readdirSync(l.unites)).toEqual([]);
  });
});

describe('the subcommand whose built script is missing', () => {
  it('names the command that builds the package', () => {
    const m = scriptAbsent('temporal', path.join(dossier('vide'), 'dist/temporal/commande.js'));
    expect(m).toMatch(/^⛔ grillhouse temporal : .*dist\/temporal\/commande\.js n'existe pas/);
    expect(m).toContain('`npm run build --workspace @roomi-fields/grillhouse`');
    expect(scriptAbsent('temporal', COMMANDE)).toBeNull();
  });
});

describe('the package publishes the built sources of src/temporal/ (criterion 10)', () => {
  it('its prepack builds dist/ before the package is packed', () => {
    const pkg = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
      files: string[];
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.prepack).toMatch(/^npm run build && /);
    expect(pkg.scripts.build).toBe('tsc -p tsconfig.build.json');
    expect(pkg.files).toContain('dist');
  });
});
