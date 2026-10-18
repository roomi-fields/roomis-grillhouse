// The conduct around the circuit of a ticket (scripts/circuit.mjs), decided by the owner on
// 2026-10-17 (grill, Q10 and Q2): the supervisor launches the circuit in the background, its end
// waking him; a fresh chef de chantier comes only on a stop (a code other than 0 and 75), settles
// it, runs the circuit again in the background and ends with it. The wait by slices
// (the script `ATTENDRE` names) is gone, with its callers: no session waits for a verdict at a ticket.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../..');
const lire = (rel: string) => readFileSync(path.join(RACINE, rel), 'utf8');
// The name of the removed script, written in two parts so that this file does not cite it.
const ATTENDRE = ['attendre', 'sh'].join('.');
// The frontmatter's description of a skill or an agent.
const description = (rel: string) => /^description:\s*(.*)$/m.exec(lire(rel))?.[1] ?? '';

describe('Q2 — the wait by slices is gone, with its callers', () => {
  it('the script is removed', () => {
    expect(existsSync(path.join(RACINE, 'scripts', ATTENDRE))).toBe(false);
  });

  it('no file of the repository calls it or describes it; the list of the frame only removes it', () => {
    const r = spawnSync('git', ['-C', RACINE, 'ls-files', '-z'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const citent = r.stdout
      .split('\0')
      .filter(f => f && !f.startsWith('.beads/') && !f.startsWith('pitmaster/'))
      .filter(f => existsSync(path.join(RACINE, f)))
      .filter(f => {
        const lignes = lire(f).split('\n');
        return lignes.some(
          l =>
            l.includes(ATTENDRE) && !(f === '.claude/grillhouse/fichiers.txt' && l.startsWith('- '))
        );
      });
    expect(citent).toEqual([]);
    expect(lire('.claude/grillhouse/fichiers.txt').split('\n')).toContain(`- scripts/${ATTENDRE}`);
  });
});

describe('Q10 — the supervisor launches the circuit, a chef de chantier settles a stop', () => {
  it('the charter names role 0 as the chef who settles a stop of the circuit', () => {
    const charte = lire('.claude/grillhouse/charte.md');
    expect(charte).toMatch(/0 `chef-de-chantier`, qui tranche un arrêt du circuit d'un ticket/);
    expect(charte).not.toMatch(/qui mène un ticket de sa prise à son commit/);
  });

  it('the charter says the circuit, launched by the supervisor, launches one agent per component', () => {
    const charte = lire('.claude/grillhouse/charte.md').replace(/\s+/g, ' ');
    expect(charte).toMatch(
      /le circuit \(`scripts\/circuit\.mjs`\), que lance le superviseur, lance un agent par composant/
    );
    expect(charte).not.toMatch(/le chef de chantier lance un agent par composant/);
  });

  it('the supervisor launches the circuit in the background, and a fresh chef only on a stop other than 0 and 75', () => {
    const pitmaster = lire('.claude/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(pitmaster).toMatch(
      /`node scripts\/circuit\.mjs <ticket>`, que je lance en arrière-plan/
    );
    expect(pitmaster).toMatch(/75 \(`a-repasser`[^)]*\) ne lance aucun chef/);
    expect(pitmaster).toMatch(/Un arrêt part à un chef de chantier neuf/);
    expect(pitmaster).not.toMatch(/Un chef de chantier par ticket/);
  });

  it('the agent and the skill of the chef de chantier describe his new role', () => {
    for (const f of [
      '.claude/agents/chef-de-chantier.md',
      '.claude/skills/chef-de-chantier/SKILL.md',
    ]) {
      const d = description(f);
      expect(d, f).toMatch(/arrêt du circuit/);
      expect(d, f).not.toMatch(/de la prise au commit/);
    }
  });

  it("the chef de chantier launches the circuit as it is, its code the task's", () => {
    const chef = lire('.claude/skills/chef-de-chantier/SKILL.md').replace(/\s+/g, ' ');
    expect(chef).toMatch(/\*\*La commande part telle quelle\*\*/);
    expect(chef).toMatch(/sans redirection ni `; echo`/);
    expect(chef).toMatch(/le code de la tâche est le sien/);
    // Every circuit command the skill prescribes carries neither a redirection nor a chained echo.
    for (const [commande] of chef.matchAll(/`node scripts\/circuit\.mjs[^`]*`/g)) {
      expect(commande).not.toMatch(/\s\d?>|;\s*echo|&&/);
    }
  });

  it('the header of the circuit says who launches it and whom its end wakes', () => {
    const tete = lire('scripts/circuit.mjs')
      .split('\nimport ')[0]
      .replace(/^\/\/ ?/gm, '')
      .replace(/\s+/g, ' ');
    expect(tete).toMatch(/The supervisor runs it in the background, and its end wakes him/);
    expect(tete).toMatch(/fresh chef de chantier on the stop/);
    expect(tete).not.toMatch(/The chef de chantier runs it in the background/);
  });
});
