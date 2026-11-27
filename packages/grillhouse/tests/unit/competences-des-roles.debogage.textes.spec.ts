// The texts by which the developpeur, the direct and the explorateur load the debugging skill of
// the plugin, before any fix, under the rules of their role. Each rule is read in the sections of
// the role's skill that name the debugging skill, so that a sentence written elsewhere in the skill
// does not answer for it.
//
// @lit mods/grillhouse/skills/developpeur/SKILL.md mods/grillhouse/skills/direct/SKILL.md mods/grillhouse/skills/explorateur/SKILL.md
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DEPOT = path.resolve(__dirname, '../../../..');
const APPEL = 'grillhouse:systematic-debugging';

// The sections (one per `## ` title) of the skill of <role> that name the debugging skill, each on
// one line, as a reader meets it whatever its wrapping; the script's dot does not end a sentence.
const sections = (role: string) =>
  readFileSync(path.join(DEPOT, 'mods/grillhouse/skills', role, 'SKILL.md'), 'utf8')
    .split(/\n(?=## )/)
    .filter(s => s.includes(APPEL))
    .map(s => s.replace(/\s+/g, ' ').replaceAll('find-polluter.sh', 'find-polluter'));
const consigne = (role: string) => sections(role).join(' ');

const ROLES_QUI_DEBOGUENT = ['developpeur', 'direct', 'explorateur'];

describe('the roles that load the debugging skill', () => {
  it.each(ROLES_QUI_DEBOGUENT)('the %s names it, and loads it before any fix', role => {
    const t = consigne(role);
    expect(t).toContain(APPEL);
    expect(t).toMatch(/avant (tout|toute|de|d’|d')[^.]*(correctif|correction|corriger|verdict)/i);
    expect(t).toMatch(/rouge/i);
    expect(t).toMatch(/défaut/i);
  });

  it.each(ROLES_QUI_DEBOGUENT)('the rules of the %s come before the method', role => {
    expect(consigne(role)).toMatch(/\b(priment|prime|l'emportent|l’emportent)\b/i);
  });

  it.each(ROLES_QUI_DEBOGUENT)(
    'where the method turns to the human partner, the %s goes up to the supervisor by its sheet',
    role => {
      const t = consigne(role);
      expect(t).toMatch(/human partner/i);
      expect(t).toMatch(/superviseur/i);
      expect(t).toMatch(/fiche/i);
    }
  );

  it.each(ROLES_QUI_DEBOGUENT)(
    'a gesture the rights or the charter refuse is neither run nor got round by the %s',
    role => {
      const t = consigne(role);
      expect(t).toMatch(/droits/i);
      expect(t).toMatch(/charte/i);
      expect(t).toMatch(/refus/i);
      expect(t).toMatch(/contourn/i);
      expect(t).toMatch(/lecture/i);
      expect(t).toMatch(/index/i);
    }
  );

  it.each(ROLES_QUI_DEBOGUENT)('the %s is told that find-polluter.sh is not run', role => {
    expect(consigne(role)).toMatch(
      /(\b(aucun|jamais|ne)\b[^.]*find-polluter|find-polluter[^.]*\b(jamais|aucun|ne)\b)/i
    );
  });

  it.each(['developpeur', 'direct'])(
    'the %s searches the cause by targeted tests and a temporary instrumentation of the plan',
    role => {
      const t = consigne(role);
      expect(t).toContain('npm test -- <');
      expect(t).toMatch(/instrumentation temporaire|temporaire[^.]*instrumentation/i);
      expect(t).toMatch(/paquets du plan/i);
      expect(t).toMatch(/retir[^.]*avant[^.]*fiche|avant[^.]*fiche[^.]*retir/i);
    }
  );

  it.each(['developpeur', 'direct'])(
    'the %s loads it before a red its batch does not lift, the final pass included',
    role => {
      const t = consigne(role);
      expect(t).toMatch(/lève/i);
      expect(t).toMatch(/passe finale/i);
    }
  );

  it('the developpeur writes no test: the testwriter writes the one that reproduces, and its red before the code is no defect', () => {
    const t = consigne('developpeur');
    expect(t).toMatch(/(aucun test|n'écris(?: pas)? de test|n’écris(?: pas)? de test)/i);
    expect(t).toMatch(/testwriter/i);
    expect(t).toMatch(/rouge[^.]*avant le code/i);
  });

  it('the direct writes the test that reproduces itself', () => {
    expect(consigne('direct')).toMatch(
      /(toi-même|lui-même|tu (l')?écris)[^.]*test|test[^.]*(toi-même|lui-même|que tu écris|tu l'écris|tu l’écris)/i
    );
  });

  it('the explorateur stops at the search of the cause, writing nothing', () => {
    const t = consigne('explorateur');
    expect(t).toMatch(/cause/i);
    expect(t).toMatch(/(sans rien écrire|n'écris rien|n’écris rien|n'écrit rien|n’écrit rien)/i);
  });

  describe('the two moments of the explorateur', () => {
    const moment = (titre: string) => sections('explorateur').find(s => s.startsWith(titre));

    it('loads it at the plan of a defect ticket, a red night included, before naming a fix', () => {
      const plan = moment('## Dans le circuit : le plan');
      expect(plan).toBeDefined();
      expect(plan).toMatch(/`nuit`/);
      expect(plan).toMatch(/avant[^.]*(correctif|correction|verdict)/i);
    });

    it('loads it at the triage of a discovery that reports a defect, reading only and running no test', () => {
      const tri = moment('## Dans le circuit : le tri des découvertes');
      expect(tri).toBeDefined();
      expect(tri).toMatch(/lecture seule/i);
      expect(tri).toMatch(/(sans (lancer (de |aucun )?)?test|(aucun|pas de) test)/i);
    });
  });
});
