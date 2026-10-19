// The conduct around the circuit of a ticket (scripts/circuit.mjs), decided by the owner on
// 2026-10-17 (grill, Q10 and Q2): the supervisor launches the circuit in the background, its end
// waking him; a chef de chantier comes only on a stop (a code other than 0 and 75). Since
// grillhouse-3uv.85, the circuit launches the chef's session itself and applies its decision; the
// supervisor relaunches it only with the owner's answer (`--reponse`). The wait by slices
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

describe('Q10 — the supervisor launches the circuit, a chef de chantier, a session of the circuit, settles a stop', () => {
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

  it('critère 8 — the supervisor launches the circuit once, relaunches --reponse after the owner answers, and launches no chef sub-agent', () => {
    const pitmaster = lire('.claude/skills/pitmaster/SKILL.md').replace(/\s+/g, ' ');
    expect(pitmaster).toMatch(
      /`node scripts\/circuit\.mjs <ticket>`, que je lance une fois, en arrière-plan/
    );
    expect(pitmaster).toMatch(/75 \(`a-repasser`[^)]*\) ne lance aucun chef/);
    expect(pitmaster).toMatch(/`node scripts\/circuit\.mjs <ticket> --reponse "<sa réponse>"`/);
    expect(pitmaster).toMatch(/`question`/);
    expect(pitmaster).not.toMatch(/subagent_type: chef-de-chantier/);
    expect(pitmaster).not.toMatch(/Un arrêt part à un chef de chantier neuf/);
    expect(pitmaster).not.toMatch(/SendMessage|par message à son identifiant/);
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

  it('critère 8 — the chef de chantier renders its decision as its final answer and launches no circuit', () => {
    const brut = lire('.claude/skills/chef-de-chantier/SKILL.md');
    const chef = brut.replace(/\s+/g, ' ');
    for (const forme of [
      '`RELANCE --reprendre`',
      '`RELANCE --depuis <testeur|developpeur> <composant>`',
      '`CONTEXTE : <texte>`',
      '`MONTE : <question>`',
    ]) {
      expect(chef).toContain(forme);
    }
    expect(chef).toMatch(/Ma décision est ma réponse finale/);
    expect(chef).not.toMatch(/Relancer, puis finir/);
    expect(chef).not.toMatch(/run_in_background|en veille|arrière-plan/);
    // The skill prescribes no command of the circuit: the circuit applies the decision.
    expect(brut).not.toMatch(/`node scripts\/circuit\.mjs/);
    for (const f of [
      '.claude/agents/chef-de-chantier.md',
      '.claude/skills/chef-de-chantier/SKILL.md',
    ]) {
      expect(description(f), f).not.toMatch(/relance le circuit|relancer le circuit/);
    }
  });

  it('critère 8 — the header of the circuit says the circuit launches the chef, the code question and --reponse', () => {
    const tete = lire('scripts/circuit.mjs')
      .split('\nimport ')[0]
      .replace(/^\/\/ ?/gm, '')
      .replace(/\s+/g, ' ');
    expect(tete).toMatch(/The supervisor runs it once, in the background, and its end wakes him/);
    expect(tete).toMatch(/the circuit launches a session of the chef de chantier itself/);
    expect(tete).toMatch(/question/);
    expect(tete).toMatch(/--reponse/);
    expect(tete).not.toMatch(/fresh chef de chantier on the stop/);
    expect(tete).not.toMatch(/The chef de chantier runs it in the background/);
    expect(tete).not.toMatch(/his session stays parked/);
  });

  it('critère 8 — the README says the circuit launches the chef, the code question and --reponse', () => {
    const readme = lire('README.md').replace(/\s+/g, ' ');
    expect(readme).toMatch(
      /the circuit itself opens a session of the site manager \(`chef-de-chantier`\)/
    );
    expect(readme).toMatch(/`question`/);
    expect(readme).toMatch(/--reponse/);
  });
});
