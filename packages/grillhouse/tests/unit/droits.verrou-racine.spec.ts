// grillhouse-44b.4.1, critère 5: the command of the write lock that the settings of a session
// declare is the `node_modules/.bin/grillhouse` of the main tree (`racine` of the rights'
// context), never the copy's; a project whose copy is the root keeps today's command.
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { describe, expect, it } from 'vitest';
import { optionsDuRole } from '../../scripts/droits.mjs';
import { dossier } from './outil-essai.js';

type Reglages = {
  hooks?: { PreToolUse?: { matcher: string; hooks: { command: string }[] }[] };
};

const ECRITURE = 'Write|Edit|MultiEdit|NotebookEdit';

// A project that declares its language, in a trial folder.
function projet(nom: string) {
  const d = dossier(nom);
  declarerLesLangages(d);
  return d;
}

function commandesDuVerrou(role: string, racine: string, copie: string) {
  const args = optionsDuRole(role, {
    racine,
    copie,
    ticket: 'demo-1',
    home: path.join(dossier('maison'), 'vide'),
  });
  const reglages = JSON.parse(args[args.indexOf('--settings') + 1]) as Reglages;
  return (reglages.hooks?.PreToolUse ?? [])
    .filter(h => h.matcher === ECRITURE)
    .flatMap(h => h.hooks.map(c => c.command));
}

describe('grillhouse-44b.4.1, critère 5 — la commande du verrou vise le cadre de l’arbre principal', () => {
  it.each(['testwriter', 'developpeur'])(
    'critère 5 : %s — une copie distincte de la racine : la commande est celle de la racine',
    role => {
      const racine = projet('principal');
      const commandes = commandesDuVerrou(role, racine, projet('copie'));
      expect(commandes).toHaveLength(1);
      expect(commandes[0]).toContain(`"${racine}/node_modules/.bin/grillhouse" verrou ${role}`);
    }
  );

  it('critère 5 : une autre racine, une autre commande — jamais le node_modules de la copie', () => {
    const racine = projet('autre-principal');
    const copie = projet('autre-copie');
    const [commande] = commandesDuVerrou('testwriter', racine, copie);
    expect(commande).toContain(`"${racine}/node_modules/.bin/grillhouse" verrou testwriter`);
    expect(commande).not.toContain(copie);
    expect(commande).not.toContain('CLAUDE_PROJECT_DIR');
  });

  it.each(['testwriter', 'developpeur'])(
    'critère 5 : %s — la copie est la racine : la commande reste celle d’aujourd’hui',
    role => {
      const racine = projet('seul');
      const commandes = commandesDuVerrou(role, racine, racine);
      expect(commandes).toHaveLength(1);
      expect(commandes[0]).toContain(
        `"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" verrou ${role}`
      );
    }
  );
});
