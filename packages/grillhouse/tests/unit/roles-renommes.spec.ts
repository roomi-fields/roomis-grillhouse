// grillhouse-3uv.88: the agent `arbitre` became the `referent-technique`, the agent
// `chef-de-chantier` the `regulateur`, without an alias of the former names; the agent `testeur` is
// now the `testwriter` (Romain, 2026-10-21), under the same rule. grillhouse-3uv.95.4 (decision 3
// of 3uv.95): the regulator and the technical referent are removed, the circuit making the
// mechanical gestures and a real question going up to the supervisor. The frame's plugin
// (mods/grillhouse/, grillhouse-3uv.84.2) and its package carry none of these names.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
const ANCIENS = ['arbitre', 'chef-de-chantier', 'testeur', 'regulateur', 'referent-technique'];

describe('the roles of the frame under their names alone', () => {
  it('the plugin carries the agents and skills of the circuit', () => {
    for (const role of ['explorateur', 'questionneur', 'testwriter', 'developpeur', 'relecteur']) {
      expect(existsSync(path.join(RACINE, `mods/grillhouse/agents/${role}.md`)), role).toBe(true);
      expect(existsSync(path.join(RACINE, `mods/grillhouse/skills/${role}/SKILL.md`)), role).toBe(
        true
      );
    }
  });

  it('the plugin carries no former nor removed agent or skill', () => {
    for (const ancien of ANCIENS) {
      expect(existsSync(path.join(RACINE, `mods/grillhouse/agents/${ancien}.md`)), ancien).toBe(
        false
      );
      expect(existsSync(path.join(RACINE, `mods/grillhouse/skills/${ancien}`)), ancien).toBe(false);
    }
  });
});
