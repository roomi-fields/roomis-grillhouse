// Tous les outils pour tous les rôles (document de la machine, §3.2 et §5.5) : aucune séance de
// rôle ne déclare de crochet qui lise ses commandes ou ses écritures ; ses permissions laissent
// passer toute commande, avec ou sans enveloppe, les seuls refus écrits au document gardés.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTEUR_FIXE, optionsDuRole, ROLES } from '../../scripts/droits.mjs';
import { SOUS_COMMANDES } from '../../scripts/sous-commandes.mjs';

const PAQUET = path.resolve(__dirname, '../..');
const RACINE = path.resolve(PAQUET, '../..');
const options = (role: string) =>
  optionsDuRole(role, {
    racine: RACINE,
    copie: RACINE,
    ticket: 'demo-1',
    home: '/nonexistent',
  });
const valeur = (a: string[], drapeau: string) => a[a.indexOf(drapeau) + 1];
const reglages = (role: string) =>
  JSON.parse(valeur(options(role), '--settings')) as {
    hooks?: unknown;
    permissions: { allow: string[]; deny: string[] };
  };
// A rule of Bash against a command, `*` any run of characters.
const couvre = (regle: string, commande: string) => {
  if (regle === 'Bash') {
    return true;
  }
  const bash = /^Bash\((.*)\)$/.exec(regle);
  return (
    bash !== null &&
    new RegExp(
      `^${bash[1]
        .split('*')
        .map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`
    ).test(commande)
  );
};
const refusee = (role: string, commande: string) =>
  reglages(role).permissions.deny.some(r => couvre(r, commande));

const ROLES_DU_CADRE = Object.keys(ROLES);
const COMMANDES = [
  'python script.py',
  'python3 -c 1',
  'sed -i s/a/b/ packages/a/src/x.ts',
  'perl -i -pe s/a/b/ f.ts',
  'echo x > packages/a/src/x.ts',
  'sqlite3 base.db .tables',
  'duckdb base.duckdb',
  'psql -c select',
  'mariadb -e select',
  'jq . f.json | tee sortie.json',
];

describe('les permissions de chaque rôle laissent passer toute commande', () => {
  it.each(ROLES_DU_CADRE)('%s : Bash entier est permis', role => {
    const { allow } = reglages(role).permissions;
    expect(allow.some(r => r === 'Bash' || r === 'Bash(*)')).toBe(true);
  });

  it.each(ROLES_DU_CADRE)(
    '%s : ni interpréteur, ni édition, ni client de base n’est refusé',
    role => {
      expect(COMMANDES.filter(c => refusee(role, c))).toEqual([]);
    }
  );

  it.each(ROLES_DU_CADRE)('%s : aucun crochet ne lit ses commandes ni ses écritures', role => {
    expect(reglages(role).hooks).toBeUndefined();
  });
});

describe('les refus du document de la machine restent', () => {
  it.each(ROLES_DU_CADRE)('%s : le changement d’auteur au ticket', role => {
    expect(reglages(role).permissions.deny).toEqual(expect.arrayContaining(AUTEUR_FIXE));
  });

  it.each(['testwriter', 'developpeur', 'direct', 'relecteur'])(
    '%s : la relecture de son propre ticket',
    role => {
      for (const c of ['bd show demo-1', 'bd comments demo-1', 'bd show demo-1 --json']) {
        expect(refusee(role, c), c).toBe(true);
      }
      expect(refusee(role, 'bd show demo-2')).toBe(false);
    }
  );

  it.each(['explorateur', 'questionneur', 'relecteur'])(
    '%s, qui n’écrit pas au ticket : toute écriture de bd, et ni Edit ni Write',
    role => {
      for (const c of ['bd comments add demo-2 x', 'bd update demo-2 -d x', 'bd create x']) {
        expect(refusee(role, c), c).toBe(true);
      }
      expect(valeur(options(role), '--tools').split(',')).not.toEqual(
        expect.arrayContaining(['Edit'])
      );
      expect(valeur(options(role), '--tools')).not.toMatch(/Edit|Write/);
    }
  );

  it.each(['testwriter', 'developpeur', 'direct'])(
    '%s : l’outil de test lancé directement',
    role => {
      for (const c of ['npx vitest run', 'vitest run', 'turbo run test']) {
        expect(refusee(role, c), c).toBe(true);
      }
      expect(refusee(role, 'npm test -- packages/a')).toBe(false);
    }
  );
});

const sousCommandes = () => Object.keys(SOUS_COMMANDES);

describe('les verrous de séance sont retirés, le verrou hors enveloppe reste', () => {
  it.each(['verrou', 'commande'])('la sous-commande « %s » n’existe plus', nom => {
    expect(sousCommandes()).not.toContain(nom);
  });

  it.each(['verrous/verrou.mjs', 'verrous/commande.mjs'])('le script %s n’existe plus', rel => {
    expect(existsSync(path.join(PAQUET, 'scripts', rel))).toBe(false);
  });

  it('le verrou hors enveloppe garde sa sous-commande', () => {
    expect(sousCommandes()).toContain('verrou-hors-enveloppe');
  });

  it('la consigne du tri ne liste plus de commandes permises', () => {
    const gabarit = readFileSync(
      path.join(RACINE, 'mods/grillhouse/skills/pitmaster/references/consigne-agent.md'),
      'utf8'
    );
    expect(gabarit).not.toContain('{{commandes}}');
  });
});
