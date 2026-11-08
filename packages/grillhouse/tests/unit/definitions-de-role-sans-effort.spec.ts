// The role definitions (mods/grillhouse/agents/*.md) fix no effort: the effort stays adaptive, so
// the front matter of a definition carries no `effort:` key.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const AGENTS = path.resolve(__dirname, '../../../../mods/grillhouse/agents');

const DEFINITIONS = readdirSync(AGENTS).filter(nom => nom.endsWith('.md'));

// The front matter: the lines between the first two `---` lines.
function enTete(texte: string): string[] {
  const lignes = texte.split('\n');
  if (lignes[0].trim() !== '---') {
    return [];
  }
  const fin = lignes.indexOf('---', 1);
  return lignes.slice(1, fin === -1 ? lignes.length : fin);
}

describe('definitions de role', () => {
  it('le dossier des roles porte les cinq definitions', () => {
    expect(DEFINITIONS.sort()).toEqual([
      'developpeur.md',
      'explorateur.md',
      'questionneur.md',
      'relecteur.md',
      'testwriter.md',
    ]);
  });

  it.each(DEFINITIONS)('%s ne fixe aucun effort', nom => {
    const cles = enTete(readFileSync(path.join(AGENTS, nom), 'utf8')).map(
      l => /^([A-Za-z_-]+)\s*:/.exec(l)?.[1]
    );
    expect(cles).not.toContain('effort');
  });
});
