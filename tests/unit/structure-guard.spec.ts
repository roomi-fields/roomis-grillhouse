import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Ticket grillhouse-3uv.31, critère 5: the structure guard (UserPromptSubmit hook) knows « étage »
// and « étages », with or without the accent, as structure nouns, as it knows « couche »: a message
// asking a structure decision about them is reminded that it goes through the grill.
const GARDE = path.resolve(__dirname, '../../scripts/structure-guard.sh');
const rappel = (prompt: string) => {
  const r = spawnSync('bash', [GARDE], { input: JSON.stringify({ prompt }), encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.includes('## Décision de structure');
};

describe('the structure guard and its structure nouns', () => {
  it('critère 5 — « couche », the reference: a decision about it is reminded', () => {
    expect(rappel('faut-il découper cette couche ?')).toBe(true);
  });
  it('critère 5 — « étage » and « étages », with the accent, are structure nouns', () => {
    expect(rappel('faut-il découper cet étage ?')).toBe(true);
    expect(rappel('on sépare les deux étages du compilateur')).toBe(true);
    expect(rappel('doit-on fusionner les étages natif et web ?')).toBe(true);
  });
  it('critère 5 — « etage » and « etages », without the accent, are structure nouns', () => {
    expect(rappel('faut-il scinder cet etage ?')).toBe(true);
    expect(rappel('should we merge the etages')).toBe(true);
    expect(rappel('extraire un etage de rendu')).toBe(true);
  });
  it('critère 5 — « étage » without a decision stays silent, as « couche » does', () => {
    expect(rappel('le deuxième étage compile le natif')).toBe(false);
    expect(rappel('la couche réseau compile')).toBe(false);
  });
});

// grillhouse-3uv.89, L2: the guard speaks to the supervisor; the instruction of a role agent
// (`claude --agent <rôle>`, whose input names it, `agent_type`, a role the project defines) is a
// ticket's, whose structure is decided. Witness: BPScript 320.3, a developer told by its instruction
// to load the grill.
describe('the structure guard and the sessions of a role', () => {
  const projet = path.resolve(__dirname, '../..');
  const pour = (agent_type: string) =>
    spawnSync('bash', [GARDE], {
      input: JSON.stringify({ prompt: 'faut-il découper ce paquet ?', agent_type }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projet },
    }).stdout;
  it('stays silent for a role agent of the project', () => {
    expect(pour('developpeur')).toBe('');
  });
  it('still reminds a session of an agent the project does not define', () => {
    expect(pour('Explore')).toContain('## Décision de structure');
  });
});
