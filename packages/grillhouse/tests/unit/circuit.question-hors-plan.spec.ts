// La question d'un arrêt hors-plan nomme le fichier écrit hors du plan et le paquet qui le porte :
// sur sa première ligne (celle que le fait et le commentaire gardent), avec la commande exacte.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { monter } from '../../scripts/circuit.mjs';
import { seanceLancee } from '../../scripts/seances.mjs';

const lancee = seanceLancee as (ctx: object, role: string, r: object) => void;
const monte = monter as (ctx: object, a: Record<string, unknown>) => number;

const marque = (rel: string, paquet: string) =>
  `⛔ hors-plan — ${rel} est dans ${paquet}, hors des paquets du plan (packages/autre) : ta séance s'arrête là, et le superviseur étend le plan ou refuse l'écriture.`;

interface Effet {
  genre: string;
  texte?: string;
  etat?: { question?: { fait: string; question: string; piece: string } };
}

// Joue l'arrêt de la séance, monté au superviseur : ce que le ticket et le panneau en gardent.
function arretMonte(horsPlan: string) {
  // Ce que le crochet range à côté de sa phrase : le chemin, le paquet, la racine.
  const m = / — (.+?) est dans (.+?), hors des paquets/.exec(horsPlan)!;
  const ecriture = { chemin: m[1], paquet: m[2], racine: m[2] === 'la racine du dépôt' };
  const ctx = {
    rendus: [] as Effet[],
    paquets: ['packages/autre'],
    ticket: 'x-1',
    journal: '/nonexistent',
  };
  let arret: Record<string, unknown> | undefined;
  try {
    lancee(ctx, 'testwriter', { horsPlan, ecriture });
  } catch (e) {
    arret = e as Record<string, unknown>;
  }
  const ecrit = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  monte(ctx, { code: 2, nom: arret!.nom, ...arret, etat: {} });
  const stderr = ecrit.mock.calls.map(c => String(c[0])).join('');
  const etat = ctx.rendus.find(e => e.genre === 'etat')!.etat!.question!;
  const commentaire = ctx.rendus.find(e => e.genre === 'commentaire')!.texte!;
  return { fait: etat.fait, question: etat.question, commentaire, stderr };
}

afterEach(() => vi.restoreAllMocks());

describe('la question d’un arrêt hors-plan sur un fichier que tient un paquet', () => {
  const rel = 'mods/grillhouse/skills/questionneur/SKILL.md';

  it('dit sur sa première ligne le chemin écrit et le paquet qui le porte', () => {
    const { fait } = arretMonte(marque(rel, 'packages/grillhouse'));
    expect(fait).toContain(`${rel} est dans packages/grillhouse`);
  });

  it('ne laisse ni le fait ni le commentaire finir sur « : » suivi de rien', () => {
    const { fait, commentaire } = arretMonte(marque(rel, 'packages/grillhouse'));
    expect(fait.trim().endsWith(':')).toBe(false);
    expect(commentaire).toContain(`${rel} est dans packages/grillhouse`);
    expect(commentaire).not.toMatch(/ — [^\n]*: \s*—/);
  });

  it('porte le chemin et le paquet au commentaire du ticket et à la question du panneau, sans renvoyer au journal', () => {
    const { commentaire, stderr, question } = arretMonte(marque(rel, 'packages/grillhouse'));
    for (const texte of [commentaire, stderr]) {
      expect(texte).toContain(rel);
      expect(texte).toContain('packages/grillhouse');
    }
    expect(question).not.toMatch(/journal/i);
  });

  it('propose la commande exacte --etendre avec le chemin du paquet', () => {
    const { question, commentaire, stderr } = arretMonte(marque(rel, 'packages/grillhouse'));
    expect(question).toContain('--etendre packages/grillhouse');
    expect(commentaire).toContain('--etendre packages/grillhouse');
    expect(stderr).toContain('--etendre packages/grillhouse');
  });

  it('nomme un autre fichier et un autre paquet avec leur propre commande', () => {
    const { fait, question } = arretMonte(marque('packages/web/src/a.ts', 'packages/web'));
    expect(fait).toContain('packages/web/src/a.ts est dans packages/web');
    expect(question).toContain('--etendre packages/web');
    expect(question).not.toContain('--etendre packages/grillhouse');
  });
});

describe('la question d’un arrêt hors-plan sur un fichier que aucun paquet ne tient', () => {
  const rel = 'package.json';

  it('nomme le fichier et la racine du dépôt sur sa première ligne', () => {
    const { fait } = arretMonte(marque(rel, 'la racine du dépôt'));
    expect(fait).toContain(`${rel} est dans la racine du dépôt`);
    expect(fait.trim().endsWith(':')).toBe(false);
  });

  it('ne propose aucun --etendre et offre seulement de refuser l’écriture par --reprendre', () => {
    const { question, commentaire } = arretMonte(marque(rel, 'la racine du dépôt'));
    for (const texte of [question, commentaire]) {
      expect(texte).not.toContain('--etendre');
    }
    expect(question).toContain('--reprendre');
  });
});
