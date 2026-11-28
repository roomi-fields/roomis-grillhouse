// @lit mods/grillhouse/charte.md mods/grillhouse/charte/** mods/grillhouse/skills/pitmaster/SKILL.md
// La charte et la compétence du superviseur disent qui écrit un direct : l'agent que lance la commande
// du cadre, jamais le superviseur.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireLaCharte } from './charte-entiere.js';

const DEPOT = path.resolve(__dirname, '../../../..');
const lire = (rel: string) => readFileSync(path.join(DEPOT, rel), 'utf8').replace(/\s+/g, ' ');

describe('la charte et la compétence du superviseur disent qui écrit un direct', () => {
  it('la charte nomme la commande du direct à la voie hors du circuit', () => {
    const charte = lireLaCharte().entiere.replace(/\s+/g, ' ');
    expect(charte).toContain('npx grillhouse direct');
    expect(charte).toMatch(/hors du circuit[^]*npx grillhouse direct/);
  });

  it('la charte dit que le superviseur n’écrit pas le code d’un direct', () => {
    expect(lireLaCharte().entiere.replace(/\s+/g, ' ')).toMatch(
      /(superviseur n['’]écrit (ni|pas|jamais)|aucune écriture du superviseur|le superviseur ne l['’]écrit)/i
    );
  });

  it('la compétence du superviseur lance un direct par la commande, puis relit, vérifie, commite', () => {
    const pitmaster = lire('mods/grillhouse/skills/pitmaster/SKILL.md');
    expect(pitmaster).toContain('npx grillhouse direct');
    expect(pitmaster).toMatch(/npx grillhouse direct[^]*(vérification complète|verifier)/);
  });
});
