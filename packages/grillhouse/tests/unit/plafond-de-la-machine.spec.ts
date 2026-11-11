// Le plafond des places de la machine (scripts/plafond-de-la-machine.mjs) : une configuration du
// poste, `~/.config/grillhouse/machine.env`, relue à chaque jugement par l'activité du déroulé de la
// machine (src/temporal/places/activites.ts), comme Buildkite lit le nombre de ses agents dans sa
// configuration ; l'environnement l'emporte ; 3 sans rien ; une valeur fautive refusée par son nom.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { plafondDe } from '../../scripts/plafond-de-la-machine.mjs';
import { plafondDeLaMachine } from '../../src/temporal/places/activites.js';
import { dossier } from '../temporal/essai.js';

// Un poste d'essai dont `machine.env` tient <texte> : son environnement.
function poste(texte: string) {
  const config = dossier('config');
  mkdirSync(path.join(config, 'grillhouse'));
  writeFileSync(path.join(config, 'grillhouse', 'machine.env'), texte);
  return { XDG_CONFIG_HOME: config };
}

const avant = { ...process.env };
afterEach(() => {
  process.env = { ...avant };
});

describe('le plafond des places, configuration du poste', () => {
  it('3 places sans fichier ni variable', () => {
    expect(plafondDe({})).toBe(3);
  });

  it('le fichier du poste règle le plafond', () => {
    expect(plafondDe(poste('GRILLHOUSE_PLACES=5\n'))).toBe(5);
  });

  it('la variable d’environnement l’emporte sur le fichier', () => {
    expect(plafondDe({ ...poste('GRILLHOUSE_PLACES=5\n'), GRILLHOUSE_PLACES: '2' })).toBe(2);
  });

  it.each(['abc', '0', '-2', '1.5', '3 places'])(
    'la valeur fautive « %s » est refusée par le nom de la variable',
    valeur => {
      expect(() => plafondDe({ GRILLHOUSE_PLACES: valeur })).toThrow(/GRILLHOUSE_PLACES/);
    }
  );

  it('une valeur fautive du fichier est refusée en nommant le fichier', () => {
    expect(() => plafondDe(poste('GRILLHOUSE_PLACES=beaucoup\n'))).toThrow(
      /GRILLHOUSE_PLACES vaut « beaucoup » dans .*machine\.env/
    );
  });
});

describe('l’activité du plafond relit le poste à chaque appel', () => {
  it('un plafond changé vaut à l’appel suivant', async () => {
    const env = poste('GRILLHOUSE_PLACES=4\n');
    delete process.env.GRILLHOUSE_PLACES;
    process.env.XDG_CONFIG_HOME = env.XDG_CONFIG_HOME;
    expect(await plafondDeLaMachine()).toEqual({ plafond: 4, faute: null });
    writeFileSync(
      path.join(env.XDG_CONFIG_HOME, 'grillhouse', 'machine.env'),
      'GRILLHOUSE_PLACES=6\n'
    );
    expect(await plafondDeLaMachine()).toEqual({ plafond: 6, faute: null });
  });

  it('une valeur fautive rend sa faute, par son nom, sans plafond', async () => {
    process.env.GRILLHOUSE_PLACES = 'zéro';
    const r = await plafondDeLaMachine();
    expect(r.plafond).toBeNull();
    expect(r.faute).toMatch(/GRILLHOUSE_PLACES/);
  });
});
