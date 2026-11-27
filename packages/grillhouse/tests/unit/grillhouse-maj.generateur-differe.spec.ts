// La mise à jour d'un projet ne se sert d'un outil qu'elle déclare qu'une fois installé, comme
// `nx migrate` installe avant de jouer les migrations : le générateur du graphe, qui importe
// jsonc-parser, attend que le projet l'ait. La commande du projet est un substitut en shell qui
// note ce qu'on lui demande et échoue comme Node quand le générateur ne trouve pas son outil.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { mettreAJour, regenerer } from '../../scripts/grillhouse-maj.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'maj-generateur-differe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const GRAPHE = 'turbo-des-paquets --ecrire';
const COMMANDE_DU_GRAPHE = `npx grillhouse ${GRAPHE}`;
const INDEX = 'docs/agents/index-des-interfaces.md';
const OUTIL = 'node_modules/jsonc-parser/package.json';

const fichier = (racine: string, f: string, texte: string, mode?: number) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte, { mode });
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

const MANIFESTES = {
  cargo: ['Cargo.toml', '[package]\nname = "noyau"\nversion = "0.1.0"\n'],
  python: ['pyproject.toml', '[project]\nname = "noyau"\nversion = "0.1.0"\n'],
  c: ['CMakeLists.txt', 'project(noyau C)\n'],
} as const;
type Langage = keyof typeof MANIFESTES;

const substitut = (corps = '') => `#!/bin/sh
echo "$*" >> commandes-jouees
if [ "$1" = turbo-des-paquets ] && [ ! -f ${OUTIL} ]; then
  echo "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'jsonc-parser'" >&2
  exit 1
fi
${corps}`;

// Un projet d'un seul langage, à un paquet `noyau`, sans jsonc-parser installé.
function depot(langage: Langage, { paquets = true, commande = true } = {}): string {
  const r = mkdtempSync(path.join(ESSAIS, `${langage}-`));
  fichier(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      ...(paquets ? { workspaces: ['noyau'] } : {}),
      packageManager: 'npm@10.9.8',
    })
  );
  fichier(
    r,
    'docs/ARCHITECTURE.md',
    `# Architecture\n\n| Composant | Dépôt | Responsabilité | Langage |\n|---|---|---|---|\n| \`noyau\` | P | le noyau | ${langage} |\n`
  );
  fichier(r, 'noyau/package.json', json({ name: 'noyau', private: true }));
  fichier(r, `noyau/${MANIFESTES[langage][0]}`, MANIFESTES[langage][1]);
  if (commande) {
    fichier(r, 'node_modules/.bin/grillhouse', substitut(), 0o755);
  }
  return r;
}

const jouees = (r: string): string[] => {
  const f = path.join(r, 'commandes-jouees');
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
};

// La seule ligne rendue pour le générateur différé : les deux gestes dans leur ordre, sans trace.
function attendreLeReport(lignes: string[]) {
  expect(lignes).toHaveLength(1);
  expect(lignes[0]).toMatch(/npm install[\s\S]*npx grillhouse turbo-des-paquets --ecrire/);
  expect(lignes[0]).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find|\bENOENT\b|\n\s+at /);
}

describe.each(['cargo', 'python', 'c'] as const)(
  'la mise à jour d’un projet %s sans jsonc-parser',
  langage => {
    it('diffère le générateur du graphe au premier passage et au suivant, sans installation', () => {
      const r = depot(langage);
      const premier = mettreAJour(r, DEPOT);
      expect(premier.dependances).toContain('jsonc-parser');
      attendreLeReport(regenerer(r));
      const second = mettreAJour(r, DEPOT);
      expect(second.dependances).not.toContain('jsonc-parser');
      attendreLeReport(regenerer(r));
      expect(jouees(r)).not.toContain(GRAPHE);
    });

    it('le diffère aussi quand le projet n’a pas encore la commande grillhouse', () => {
      const r = depot(langage, { commande: false });
      mettreAJour(r, DEPOT);
      attendreLeReport(regenerer(r));
    });

    it('le diffère pour un projet que `init` ou `paquet` crée', () => {
      const r = depot(langage);
      mettreAJour(r, DEPOT);
      const lignes = regenerer(r, { tous: true, langage });
      expect(lignes.filter(l => l.includes(COMMANDE_DU_GRAPHE))).toHaveLength(1);
      expect(lignes.join('\n')).not.toContain('ERR_MODULE_NOT_FOUND');
      expect(jouees(r)).toEqual(['index-interfaces']);
    });

    it('tient pour absent un dossier jsonc-parser sans package.json', () => {
      const r = depot(langage);
      mkdirSync(path.join(r, 'node_modules/jsonc-parser'), { recursive: true });
      attendreLeReport(regenerer(r));
      expect(jouees(r)).toEqual([]);
    });

    it('lance comme d’habitude un générateur qui n’a besoin d’aucun outil absent', () => {
      const r = depot(langage);
      fichier(r, INDEX, '# Index\n');
      mettreAJour(r, DEPOT);
      attendreLeReport(regenerer(r));
      expect(jouees(r)).toEqual(['index-interfaces']);
    });

    it('lance le générateur du graphe dès que jsonc-parser est installé, le reste à installer', () => {
      const r = depot(langage);
      fichier(r, INDEX, '# Index\n');
      const bilan = mettreAJour(r, DEPOT);
      expect(bilan.dependances).toContain('turbo');
      regenerer(r);
      fichier(r, OUTIL, json({ name: 'jsonc-parser' }));
      expect(regenerer(r)).toEqual([]);
      expect(jouees(r).slice(-2).sort()).toEqual(['index-interfaces', GRAPHE]);
    });

    it('rend la ligne d’échec habituelle, avec sa cause, d’un générateur qui échoue outil installé', () => {
      const r = depot(langage);
      fichier(r, OUTIL, json({ name: 'jsonc-parser' }));
      fichier(
        r,
        'node_modules/.bin/grillhouse',
        substitut('echo "turbo.json refusé" >&2\nexit 1\n'),
        0o755
      );
      const lignes = regenerer(r);
      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toContain(COMMANDE_DU_GRAPHE);
      expect(lignes[0]).toContain('turbo.json refusé');
    });
  }
);

describe('la mise à jour d’un projet sans paquets ni jsonc-parser', () => {
  it('ne lance ni n’annonce le générateur du graphe', () => {
    const r = depot('cargo', { paquets: false });
    expect(regenerer(r)).toEqual([]);
    expect(jouees(r)).toEqual([]);
  });
});
