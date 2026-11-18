// La part tenue par le système (scripts/passe-de-la-machine.mjs) : le groupe de contrôle d'une passe se
// construit par une ligne de commande pure (`systemd-run --user --scope`, un poids de processeur et
// un plafond de mémoire tirés de la part, aucun plafond dur de processeur), l'indisponibilité du
// système se détecte par une fonction, « joue sans part tenue » se dit une fois par passe.
import { describe, expect, it } from 'vitest';
import {
  commandeDuGroupe,
  direUneFois,
  groupeIndisponible,
  lancementSousPart,
} from '../../scripts/passe-de-la-machine.mjs';

const GO = 1024 ** 3;
const part = (coeurs: number, memoireGo: number) => ({ coeurs, memoire: memoireGo * GO });

describe('la ligne de commande du groupe de contrôle', () => {
  it('lance la commande dans un scope du gestionnaire de l’utilisateur', () => {
    const l = commandeDuGroupe({ part: part(4, 8), cmd: 'npm', args: ['run', 'verifier'] });
    expect(l.cmd).toBe('systemd-run');
    expect(l.args.slice(0, 2)).toEqual(['--user', '--scope']);
  });

  it('garde la commande de la passe entière à la fin, après --', () => {
    const l = commandeDuGroupe({ part: part(4, 8), cmd: 'npm', args: ['run', 'verifier'] });
    const i = l.args.indexOf('--');
    expect(i).toBeGreaterThan(1);
    expect(l.args.slice(i + 1)).toEqual(['npm', 'run', 'verifier']);
  });

  it('tire le plafond de mémoire de la part, en octets', () => {
    const l = commandeDuGroupe({ part: part(4, 8), cmd: 'x', args: [] });
    expect(l.args).toContain(`MemoryMax=${8 * GO}`);
  });

  it('tire le poids de processeur de la part : le double de cœurs pèse le double', () => {
    const poids = (coeurs: number) => {
      const l = commandeDuGroupe({ part: part(coeurs, 8), cmd: 'x', args: [] });
      const p = l.args.find(a => a.startsWith('CPUWeight='));
      return Number(p?.slice('CPUWeight='.length));
    };
    expect(poids(4)).toBeGreaterThan(0);
    expect(poids(8)).toBe(2 * poids(4));
  });

  it('ne met aucun plafond dur de processeur', () => {
    const l = commandeDuGroupe({ part: part(4, 8), cmd: 'x', args: [] });
    expect(l.args.join(' ')).not.toMatch(/CPUQuota/i);
  });
});

describe('le lancement d’une passe sous sa part', () => {
  const env = { PATH: '/bin', GRILLHOUSE_TRAVAILLEURS: '99' };

  it('donne à ses outils le nombre de processus de sa part', () => {
    const l = lancementSousPart({
      part: part(6, 8),
      cmd: 'npm',
      args: ['test'],
      env,
      groupe: true,
    });
    expect(l.env.GRILLHOUSE_TRAVAILLEURS).toBe('6');
    expect(l.env.PATH).toBe('/bin');
  });

  it('joue dans son groupe quand le système le permet', () => {
    const l = lancementSousPart({
      part: part(6, 8),
      cmd: 'npm',
      args: ['test'],
      env,
      groupe: true,
    });
    expect(l.cmd).toBe('systemd-run');
    expect(l.args.slice(-2)).toEqual(['npm', 'test']);
  });

  it('joue sans groupe quand le système ne le permet pas, la commande intacte', () => {
    const l = lancementSousPart({
      part: part(6, 8),
      cmd: 'npm',
      args: ['test'],
      env,
      groupe: false,
    });
    expect(l.cmd).toBe('npm');
    expect(l.args).toEqual(['test']);
    expect(l.env.GRILLHOUSE_TRAVAILLEURS).toBe('6');
  });
});

describe('l’indisponibilité du système', () => {
  it('la commande d’un agent, dans son enveloppe, joue sans groupe et le dit', () => {
    const r = groupeIndisponible({
      env: { GRILLHOUSE_ENVELOPPE: 'packages/a' },
      sonde: () => true,
    });
    expect(r).toMatch(/enveloppe/);
  });

  it('sans gestionnaire de groupes de l’utilisateur, joue sans groupe et le dit', () => {
    const r = groupeIndisponible({ env: {}, sonde: () => false });
    expect(typeof r).toBe('string');
    expect(r).not.toBe('');
  });

  it('hors enveloppe et avec un gestionnaire, le groupe est disponible', () => {
    expect(groupeIndisponible({ env: {}, sonde: () => true })).toBeNull();
  });

  it('dans l’enveloppe, la sonde du système n’est pas même interrogée', () => {
    let sondes = 0;
    groupeIndisponible({
      env: { GRILLHOUSE_ENVELOPPE: 'packages/a' },
      sonde: () => {
        sondes += 1;
        return true;
      },
    });
    expect(sondes).toBe(0);
  });
});

describe('le dire une seule fois', () => {
  it('« joue sans part tenue » se dit une seule fois par passe', () => {
    const dit: string[] = [];
    const dire = direUneFois(l => dit.push(l));
    dire('joue sans part tenue : dans l’enveloppe d’un agent');
    dire('joue sans part tenue : dans l’enveloppe d’un agent');
    expect(dit).toEqual(['joue sans part tenue : dans l’enveloppe d’un agent']);
  });

  it('chaque passe a son propre dire', () => {
    const dit: string[] = [];
    const a = direUneFois(l => dit.push(l));
    const b = direUneFois(l => dit.push(l));
    a('x');
    b('x');
    expect(dit).toHaveLength(2);
  });
});
