// Une séance d'agent est bornée en processeur comme une passe : son lancement (enveloppe.mjs
// `lancementDeLaSeance`) tient un groupe de contrôle à elle (`systemd-run --user --scope`), avec un
// plafond dur de processeur (`CPUQuota`) qui vaut les cœurs de la part du projet. Interfaces :
// `lancementDeLaSeance({ ..., part, sonde? })` -> { cmd, args, env, sansBorne } où `part` est
// { coeurs, memoire } (la part du projet) et `sansBorne` la raison pour laquelle la séance part sans
// groupe (null quand elle en a un) ; passe-de-la-machine.mjs `commandeDuGroupe({ part, cmd, args,
// plafond })`, `plafond: true` ajoutant le plafond dur de processeur.
import { describe, expect, it } from 'vitest';
import { lancementDeLaSeance } from '../../scripts/enveloppe/enveloppe.mjs';
import { commandeDuGroupe, groupeIndisponible } from '../../scripts/passe-de-la-machine.mjs';

const GO = 1024 ** 3;
const part = (coeurs: number, memoireGo = 8) => ({ coeurs, memoire: memoireGo * GO });
const COMMANDE = ['claude', '-p', '--agent', 'testwriter'];

const lancer = (o: { coeurs?: number; sonde?: () => boolean; sansPart?: boolean } = {}) =>
  lancementDeLaSeance({
    argsBwrap: ['--die-with-parent'],
    commande: COMMANDE,
    env: { PATH: '/bin', HOME: '/h', GRILLHOUSE_PLACES: '3' },
    cacheNpm: '/c',
    paquets: ['p'],
    travail: '/t',
    outils: {},
    ...(o.sansPart ? {} : { part: part(o.coeurs ?? 4) }),
    ...(o.sonde ? { sonde: o.sonde } : { sonde: () => true }),
  } as never) as unknown as {
    cmd: string;
    args: string[];
    env: Record<string, string>;
    sansBorne?: string | null;
  };

const quota = (args: string[]) => args.find(a => a.startsWith('CPUQuota='));

describe('le plafond dur de processeur du groupe de contrôle', () => {
  it('commandeDuGroupe pose un plafond de processeur égal aux cœurs de la part quand on le demande', () => {
    const l = commandeDuGroupe({ part: part(4), cmd: 'x', args: [], plafond: true } as never);
    expect(quota(l.args)).toBe('CPUQuota=400%');
  });

  it('commandeDuGroupe ne pose aucun plafond dur sans le demander (la passe garde son poids seul)', () => {
    const l = commandeDuGroupe({ part: part(4), cmd: 'x', args: [] });
    expect(quota(l.args)).toBeUndefined();
  });
});

describe('le groupe de contrôle lance sa commande telle qu’elle est écrite', () => {
  it('commandeDuGroupe coupe l’expansion des variables de systemd-run, avant la commande', () => {
    const l = commandeDuGroupe({ part: part(4), cmd: 'sh', args: ['-c', 'echo "${1-}"'] });
    const i = l.args.indexOf('--expand-environment=no');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(l.args.indexOf('--'));
    expect(l.args.at(-1)).toBe('echo "${1-}"');
  });

  it('le lancement d’une séance garde le script de l’enveloppe et ses « ${…} » sans expansion', () => {
    const l = lancer();
    expect(l.args.indexOf('--expand-environment=no')).toBeLessThan(l.args.indexOf('--'));
    expect(l.args.some(a => a.includes('${$1-}'))).toBe(true);
  });
});

describe('le lancement d’une séance d’agent sous la part du projet', () => {
  it('lance la séance dans un scope du gestionnaire de l’utilisateur', () => {
    const l = lancer();
    expect(l.cmd).toBe('systemd-run');
    expect(l.args.slice(0, 2)).toEqual(['--user', '--scope']);
  });

  it('plafonne le processeur de la séance aux cœurs de la part du projet', () => {
    expect(quota(lancer({ coeurs: 4 }).args)).toBe('CPUQuota=400%');
    expect(quota(lancer({ coeurs: 6 }).args)).toBe('CPUQuota=600%');
    expect(quota(lancer({ coeurs: 1 }).args)).toBe('CPUQuota=100%');
  });

  it('garde bwrap et la commande de la séance entiers après --', () => {
    const l = lancer();
    const i = l.args.indexOf('--');
    expect(i).toBeGreaterThan(1);
    expect(l.args[i + 1]).toBe('bwrap');
    expect(l.args.slice(-COMMANDE.length)).toEqual(COMMANDE);
  });

  it('garde l’environnement de la séance dans le groupe', () => {
    const l = lancer();
    expect(l.env.GRILLHOUSE_ENVELOPPE).toBe('p');
    expect(l.env.TMPDIR).toBe('/t');
  });

  it('dit qu’elle part bornée : aucune raison de partir sans borne', () => {
    expect(lancer().sansBorne).toBeNull();
  });

  it('sans gestionnaire de groupes joignable, la séance part sans borne et dit pourquoi', () => {
    const l = lancer({ sonde: () => false });
    expect(l.cmd).toBe('bwrap');
    expect(l.args[0]).toBe('--die-with-parent');
    expect(l.sansBorne).toMatch(/gestionnaire de groupes de contrôle/);
  });

  it('la fin de la séance retire son groupe : un scope de premier plan, sans survivre à son processus', () => {
    const l = lancer();
    expect(l.args).toContain('--scope');
    expect(l.args).not.toContain('--remain-after-exit');
  });
});

describe('une passe lancée par la séance reste dans le plafond de la séance', () => {
  it('dans l’enveloppe d’un agent, la passe joue sans groupe à elle', () => {
    const raison = groupeIndisponible({
      env: { GRILLHOUSE_ENVELOPPE: 'packages/a' },
      sonde: () => true,
    });
    expect(raison).toBe("dans l'enveloppe d'un agent");
  });
});
