// The index of the code enters the envelope of a role that the rights give it (charter, « L'index
// d'abord »), as a sandbox mounts read-only the tools its configuration gives a process
// (bubblewrap --ro-bind): the program of codegraph and its home, from the rights alone, and a
// program missing from the machine is named, never left out in silence. No real envelope is run.
import { describe, expect, it } from 'vitest';
import { ROLES } from '../../scripts/droits.mjs';
import { cheminsDeLIndex, montagesDeLaSeance } from '../../scripts/enveloppe/enveloppe.mjs';

const SEANCE = {
  cacheNpm: '/h/.npm',
  claude: '/h/.claude',
  projet: '/h/.claude/projects/-wt',
  etatJetable: '/t/claude.json',
  scratchpads: '/tmp/claude-1/-wt',
};
const PRESENTS = new Set(['/h/.local/bin/codegraph', '/h/.codegraph']);
const existe = (p: string) => PRESENTS.has(p);

describe('the index of the code in the envelope of a role', () => {
  it('gives the program and the home of codegraph to every role whose rights hold the index', () => {
    for (const [role, droits] of Object.entries(ROLES) as [string, { index?: boolean }][]) {
      if (!droits.index) {
        continue;
      }
      const { chemins, manquants } = cheminsDeLIndex({ role, maison: '/h', existe });
      expect(chemins, role).toEqual(['/h/.local/bin/codegraph', '/h/.codegraph']);
      expect(manquants, role).toEqual([]);
    }
  });

  it('gives no path and names no missing program to an unknown role, nor without a role', () => {
    for (const role of ['role-inconnu', undefined]) {
      // On a machine that has codegraph, then on one that lacks it.
      for (const present of [existe, () => false]) {
        expect(cheminsDeLIndex({ role, maison: '/h', existe: present }), String(role)).toEqual({
          chemins: [],
          manquants: [],
        });
      }
    }
  });

  it('names the program that the machine lacks', () => {
    const r = cheminsDeLIndex({ role: 'direct', maison: '/h', existe: () => false });
    expect(r.chemins).toEqual([]);
    expect(r.manquants).toEqual(['codegraph']);
  });

  it('mounts the paths of the index read-only, after the declared paths of the home', () => {
    const montages = montagesDeLaSeance({ ...SEANCE, index: ['/h/.codegraph'] });
    const m = montages.find((x: { chemin: string }) => x.chemin === '/h/.codegraph');
    expect(m).toEqual({ chemin: '/h/.codegraph', ecriture: false });
    expect(
      montagesDeLaSeance(SEANCE).some((x: { chemin: string }) => x.chemin === '/h/.codegraph')
    ).toBe(false);
  });
});
