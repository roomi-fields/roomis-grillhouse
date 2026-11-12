// The testwriter skill teaches the decomposition of a behaviour along the pyramid of sizes, and the
// testwriter's rights let it play the size guard on its batch before it hands back its sheet.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLES } from '../../scripts/droits.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const COMPETENCE = readFileSync(
  path.join(RACINE, 'mods/grillhouse/skills/testwriter/SKILL.md'),
  'utf8'
);
const COMMANDE = 'npx grillhouse tailles-des-tests';

const commandesNues = (role: keyof typeof ROLES) =>
  ROLES[role].commandes
    .map((r: string) => /^Bash\((.*)\)$/.exec(r)?.[1])
    .filter((c): c is string => Boolean(c));

describe('the testwriter skill: decomposition along the pyramid', () => {
  it('teaches proving the logic small, by the interface of a module called in its process, with no process launched nor repository mounted', () => {
    expect(COMPETENCE).toMatch(/décompos/i);
    expect(COMPETENCE).toMatch(/sans (lancer de )?processus/i);
    expect(COMPETENCE).toMatch(/dépôt monté|sans (monter (de|un) )?dépôt/i);
  });

  it('isolates the real launch in a night test, only when the plan prescribes it', () => {
    expect(COMPETENCE).toMatch(/lancement réel/i);
    expect(COMPETENCE).toMatch(/\*\.nuit\.test\./);
    expect(COMPETENCE).toMatch(/seulement (quand|si) le plan/i);
  });

  it('takes the choice of the interface from the plan or the INTERFACE.md of the package, and ends on BESOIN when none publishes the behaviour', () => {
    expect(COMPETENCE).toMatch(/interface[^.]*(plan|INTERFACE\.md)[^.]*publi/i);
    expect(COMPETENCE).toMatch(/aucune interface publiée[^.]*BESOIN/i);
    expect(COMPETENCE).toMatch(/n'invente pas la structure/i);
  });

  it('asks to play the size guard on the batch before handing back the sheet', () => {
    expect(COMPETENCE).toContain(`\`${COMMANDE}\``);
    expect(COMPETENCE).toMatch(/avant de rendre/i);
  });

  it('has the testwriter decompose a refused big day test itself, and return FAIT only on a batch without new finding', () => {
    expect(COMPETENCE).toMatch(/décompose[^.]*lui-même|lui-même[^.]*décompos/i);
    expect(COMPETENCE).toMatch(/FAIT[^.]*(sans constat neuf)/i);
  });

  it('illustrates with a hook that lists the circuits waiting: the function that lists and formats is tested small, the launch of the hook is at most a night test', () => {
    expect(COMPETENCE).toMatch(/crochet/i);
    expect(COMPETENCE).toMatch(/circuits? en attente/i);
    expect(COMPETENCE).toMatch(/au plus un test de nuit/i);
  });
});

describe('the testwriter rights: the size guard', () => {
  it('permit the size guard without a wildcard, on the command itself and by env -C', () => {
    const nues = commandesNues('testwriter');
    expect(nues).toContain(COMMANDE);
    expect(nues).toContain(`env -C * ${COMMANDE}`);
    expect(nues.filter(c => c.includes('tailles-des-tests'))).toEqual([
      COMMANDE,
      `env -C * ${COMMANDE}`,
    ]);
  });

  it('give no other role the size guard', () => {
    for (const role of Object.keys(ROLES) as (keyof typeof ROLES)[]) {
      if (role === 'testwriter') {
        continue;
      }
      expect(
        commandesNues(role).filter(c => c.includes('tailles-des-tests')),
        role
      ).toEqual([]);
    }
  });
});
