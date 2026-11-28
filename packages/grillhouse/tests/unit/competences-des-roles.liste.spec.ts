// The skills a session of each role lists, from one source (ROLES of scripts/droits.mjs): the
// role's own, the debugging skill for a role that debugs, and those its skill and the common
// charter ask of it; no skill and no agent definition of a role asks for one out of that list.
//
// @lit mods/grillhouse/skills/** mods/grillhouse/agents/**
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as droits from '../../scripts/droits.mjs';

const GREFFON = path.resolve(__dirname, '../../../../mods/grillhouse');
const ROLES = Object.keys(droits.ROLES);
const competencesDuRole = (role: string) =>
  (droits as unknown as { competencesDuRole: (r: string) => string[] }).competencesDuRole(role);

const nommees = (...noms: string[]) => noms.map(n => `grillhouse:${n}`).sort();
const ATTENDUES: Record<string, string[]> = {
  explorateur: nommees('explorateur', 'systematic-debugging', 'mesure'),
  testwriter: nommees('testwriter', 'mesure'),
  developpeur: nommees(
    'developpeur',
    'systematic-debugging',
    'mesure',
    'redacteur',
    'writing-for-agents'
  ),
  direct: nommees('direct', 'systematic-debugging', 'mesure', 'redacteur', 'writing-for-agents'),
  relecteur: nommees('relecteur'),
  questionneur: nommees('questionneur'),
};

// The skills of the plugin.
const COMPETENCES = readdirSync(path.join(GREFFON, 'skills'));

// The markdown files of the skill of <role>, and its agent definition.
function textesDuRole(role: string): string[] {
  const dossier = path.join(GREFFON, 'skills', role);
  const fichiers = readdirSync(dossier, { recursive: true })
    .map(String)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(dossier, f));
  const agent = path.join(GREFFON, 'agents', `${role}.md`);
  return [...fichiers, ...(existsSync(agent) ? [agent] : [])].map(f => readFileSync(f, 'utf8'));
}

// The skills of the plugin the texts of <role> name to be loaded: « compétence `x` », or the
// qualified name `grillhouse:x`.
function demandees(role: string): string[] {
  const trouvees = textesDuRole(role).flatMap(texte =>
    [...texte.matchAll(/(?:[Cc]ompétence\s+`(?:grillhouse:)?|grillhouse:)([a-z][a-z-]*)/g)].map(
      m => m[1]
    )
  );
  return [...new Set(trouvees)].filter(n => COMPETENCES.includes(n)).sort();
}

describe('la liste des compétences d’un rôle', () => {
  it.each(Object.keys(ATTENDUES))(
    'le %s liste sa compétence, le débogage s’il débogue, et celles que la sienne et la charte lui demandent, aucune autre',
    role => {
      expect([...competencesDuRole(role)].sort()).toEqual(ATTENDUES[role]);
    }
  );

  it('chaque rôle du circuit a sa liste, dont chaque nom est une compétence du greffon', () => {
    expect(Object.keys(ATTENDUES).sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      for (const nom of competencesDuRole(role)) {
        expect(COMPETENCES, `${role} : ${nom}`).toContain(nom.replace(/^grillhouse:/, ''));
      }
    }
  });

  it('aucune liste ne porte la compétence qui interroge le responsable', () => {
    for (const role of ROLES) {
      expect(competencesDuRole(role), role).not.toContain('grillhouse:grilling');
    }
  });

  it.each(ROLES)(
    'ni la compétence ni la définition d’agent du %s ne demande une compétence que sa liste refuse',
    role => {
      const liste = competencesDuRole(role);
      // The reading sees the requests the skills write.
      expect(demandees('developpeur')).toEqual(
        expect.arrayContaining(['mesure', 'redacteur', 'systematic-debugging'])
      );
      expect(demandees(role).filter(n => !liste.includes(`grillhouse:${n}`))).toEqual([]);
    }
  );
});
