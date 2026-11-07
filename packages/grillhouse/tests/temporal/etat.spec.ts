// grillhouse-4nr.2, criterion 8, without a process: the state of the service says, for the
// server, the worker of the project and the worker of the machine, whether each runs (systemctl
// --user is-active, a stand-in here), the version of the program laid down, and whether the server
// answers; without an installation, it says what is missing, and the command fails.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { etat, texteDeLEtat } from '../../src/temporal/etat.js';
import {
  cheminsDe,
  EPINGLE,
  lieuxDe,
  UNITE_DE_LA_MACHINE,
  UNITE_DU_SERVEUR,
  uniteDuProjet,
} from '../../src/temporal/installation.js';
import { dossier } from './essai.js';

function lieux() {
  const racine = dossier('projet');
  writeFileSync(path.join(racine, 'package.json'), '{ "name": "essai" }\n');
  return lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
}

// systemctl's stand-in: `is-active <unit>` says `active` for the units of <actives>.
const systemctl = (actives: string[]) => (args: string[]) => {
  const actif = args[0] === 'is-active' && actives.includes(args[1]!);
  return { status: actif ? 0 : 3, stdout: actif ? 'active\n' : 'inactive\n', stderr: '' };
};

describe('the state without an installation', () => {
  it('says the program and the units are missing, and is not installed', async () => {
    const l = lieux();
    const e = await etat({
      lieux: l,
      systemctl: systemctl([]),
      versionDe: () => null,
      joindre: () => Promise.resolve(false),
    });
    expect(e.installe).toBe(false);
    expect(e.manques).toEqual([
      cheminsDe(l, EPINGLE.version).programme,
      ...[UNITE_DU_SERVEUR, uniteDuProjet(l.racine), UNITE_DE_LA_MACHINE].map(u =>
        path.join(l.unites, u)
      ),
    ]);
    expect(texteDeLEtat(e)).toMatch(/^Temporal n’est pas installé/);
  });
});

describe('the state of an installation', () => {
  it('says for each service whether it runs, the version of the program and the server answering', async () => {
    const l = lieux();
    const { programme } = cheminsDe(l, EPINGLE.version);
    mkdirSync(path.dirname(programme), { recursive: true });
    writeFileSync(programme, '');
    for (const u of [UNITE_DU_SERVEUR, uniteDuProjet(l.racine), UNITE_DE_LA_MACHINE]) {
      writeFileSync(path.join(l.unites, u), '');
    }
    const e = await etat({
      lieux: l,
      systemctl: systemctl([UNITE_DU_SERVEUR, UNITE_DE_LA_MACHINE]),
      versionDe: p => (p === programme ? '1.9.1' : null),
      joindre: () => Promise.resolve(true),
    });
    expect(e.installe).toBe(true);
    expect(e.programme).toEqual({ chemin: programme, version: '1.9.1' });
    expect(e.services).toEqual([
      { role: 'serveur', unite: UNITE_DU_SERVEUR, actif: true },
      { role: 'travailleur du projet', unite: uniteDuProjet(l.racine), actif: false },
      { role: 'travailleur de la machine', unite: UNITE_DE_LA_MACHINE, actif: true },
    ]);
    expect(e.joignable).toBe(true);
    const t = texteDeLEtat(e);
    expect(t).toContain('temporal 1.9.1');
    expect(t).toMatch(/serveur .*: tourne/);
    expect(t).toMatch(/travailleur du projet .*: arrêté/);
    expect(t).toMatch(/travailleur de la machine .*: tourne/);
    expect(t).toContain('le serveur répond\n');
  });

  it('installed, a server that does not answer is said by the delay of its reading', async () => {
    const l = lieux();
    const { programme } = cheminsDe(l, EPINGLE.version);
    mkdirSync(path.dirname(programme), { recursive: true });
    writeFileSync(programme, '');
    for (const u of [UNITE_DU_SERVEUR, uniteDuProjet(l.racine), UNITE_DE_LA_MACHINE]) {
      writeFileSync(path.join(l.unites, u), '');
    }
    const e = await etat({
      lieux: l,
      systemctl: systemctl([]),
      versionDe: () => '1.9.1',
      joindre: () => Promise.resolve(false),
    });
    expect(e.joignable).toBe(false);
    const t = texteDeLEtat(e);
    expect(t).toContain('Temporal ne répond pas en 2 s\n');
    expect(t).not.toContain('le serveur répond');
  });
});
