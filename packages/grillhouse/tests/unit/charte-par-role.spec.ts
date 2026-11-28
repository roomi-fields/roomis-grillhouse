// The common charter is cut by public: charte.md holds the core, every session's, and imports one
// module per public (mods/grillhouse/charte/<module>.md). The table below is the attribution the
// responsible has validated; droits.modules-de-la-charte.spec.ts says which role receives which.
//
// @lit mods/grillhouse/charte.md mods/grillhouse/charte/** mods/grillhouse/skills/**
// @lit packages/grillhouse/docs/architecture/machine.md
// @lit packages/grillhouse/docs/architecture/circuit.md .claude/settings.json
// @lit templates/projet/.claude/settings.json
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ELEMENTS_DU_GREFFON } from '../../scripts/cadre.mjs';
import { importsDeLaCharte, lireLaCharte } from './charte-entiere.js';

const DEPOT = path.resolve(__dirname, '../../../..');
const GREFFON = path.join(DEPOT, 'mods/grillhouse');
const lire = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');
const plat = (t: string) => t.replace(/\s+/g, ' ');

// The paragraphs of each module, by their title.
const MODULES: Record<string, string[]> = {
  superviseur: [
    'Le greffon pousse les questions des circuits à la séance du superviseur, et la réponse les acquitte',
    'Un ticket ouvert naît du mot du responsable',
    'Un ticket de données suit le chemin de données du projet',
    "Un ticket prend l'une de trois voies",
    "Le superviseur n'écrit pas le code d'un direct",
    'La file directe se tient comme la file des tickets',
    'Un paquet naît hors du circuit, en quatre temps',
  ],
  plan: [
    "Une tension avec l'architecture monte, elle ne se résout pas dans le ticket",
    'Un ticket de réalisation nomme ses composants',
    'Un ticket prend le circuit court quand aucun test honnête ne peut rougir avant son lot',
    'Une décision de structure passe par le grill',
    'Un geste transverse, un seul ticket',
  ],
  preuve: ['Le rouge prouve le travail du ticket', "La taille d'un test suit la pyramide"],
  tests: [
    "Un test porte le nom du comportement qu'il prouve",
    'Une mesure de temps joue la nuit',
    'Un test qui exige de la charge joue la nuit',
    'Un test vit dans un fichier à lui',
    "Un crate Rust a un seul exécutable de tests d'intégration par moment",
  ],
};
// The core's paragraphs that carry a title.
const NOYAU = [
  'Le circuit fait les gestes, une vraie question monte',
  "Un agent qui a la réponse l'applique",
  'Tous les agents jugent sur le plan',
  'Un document prescriptif change sur décision seule',
  'Un fait repris se relit à sa pièce',
  'Un projet a plusieurs langages, un paquet un seul',
  "Le langage d'un paquet se décide à la conception",
  'Une matière, une adresse',
  'Un changement de comportement corrige ses textes',
  'Les composants suivent un modèle commun',
  "Une dette connue s'inscrit et se gèle",
  "Un flux de la CI déclare les paquets qu'il exerce, le relecteur le lit",
  'Un fichier engendré se construit',
  'Un remplacement supprime le remplacé',
  "Une règle retirée emporte ce qu'elle seule tenait",
  'Un mécanisme se re-dérive, il ne se rapièce pas',
  "L'ancien chemin qu'une exécution en vol porte encore se retire à son tour",
  'Un commentaire dit ce que la chose est',
  'Des commandes sans invite',
  'Les tests se lancent par `npm test`',
  'Les tests ne laissent rien dans le dossier temporaire',
  'Un fichier temporaire meurt avec son propriétaire',
  'Main reste vert',
  "L'index d'abord",
  "Tout se lit, le plan s'écrit",
];
// The core's paragraphs without a title, by their first words.
const SANS_TITRE = [
  'Les règles que tout agent applique',
  "Une décision vit dans le document qu'elle règle.",
  "Une règle s'écrit selon le métacadre",
  'Une chose du cadre porte un seul mot',
  'Une décision ou une question se tranche par les questions',
  '`bd ready`, `bd update <id> --claim`',
  'Un ticket parcourt les étapes de son circuit',
  'Tickets : Beads (`bd`)',
  "Une compétence du cadre s'appelle avec son préfixe",
  'Réponses en français',
];
const CHARGE = 'personne ne fabrique de charge';

// The titles that open a paragraph or an item of <texte>, in bold.
const titres = (texte: string) =>
  texte
    .split(/\n(?=- )|\n\s*\n/)
    .map(p => ({ p, m: /^\s*(?:- )?(?:⛔ )?\*\*([^*]+)\*\*/.exec(p) }))
    .filter(x => x.m)
    .map(x => ({ titre: plat(x.m![1]!), paragraphe: plat(x.p) }));
const nombre = (texte: string, morceau: string) => plat(texte).split(morceau).length - 1;

describe('the common charter imports one module per public', () => {
  const { noyau } = lireLaCharte();
  const importes = importsDeLaCharte(noyau).sort();

  it('charte.md imports each module by a relative path', () => {
    expect(importes).toEqual(
      Object.keys(MODULES)
        .map(m => `charte/${m}.md`)
        .sort()
    );
  });

  it('every file of the folder of the modules is imported, and every import names a file', () => {
    const dossier = path.join(GREFFON, 'charte');
    const fichiers = existsSync(dossier) ? readdirSync(dossier).map(f => `charte/${f}`) : [];
    expect(fichiers.length).toBeGreaterThan(0);
    expect(fichiers.sort()).toEqual(importes);
  });

  it('the package publishes the folder of the modules, where charte.md imports them from', () => {
    const { files } = JSON.parse(lire('packages/grillhouse/package.json')) as { files: string[] };
    expect(importes.length).toBeGreaterThan(0);
    for (const f of importes) {
      const entree = f.split('/')[0]!;
      expect(ELEMENTS_DU_GREFFON, f).toContain(entree);
      expect(files, f).toContain(entree);
    }
  });
});

describe('each paragraph of the common charter has one place, the core or a module', () => {
  const charte = lireLaCharte();

  it.each(Object.keys(MODULES))('the module %s holds exactly the paragraphs of its public', m => {
    expect(
      titres(charte.modules[m] ?? '')
        .map(t => t.titre)
        .sort()
    ).toEqual([...MODULES[m]!].sort());
  });

  it('the core holds exactly the other paragraphs that carry a title', () => {
    const portes = titres(charte.noyau)
      .filter(t => NOYAU.includes(t.titre) || !t.paragraphe.includes(CHARGE))
      .map(t => t.titre);
    expect(portes.sort()).toEqual([...NOYAU].sort());
  });

  it('the core holds each paragraph without a title', () => {
    for (const debut of SANS_TITRE) {
      expect(nombre(charte.noyau, debut), debut).toBe(1);
    }
  });

  it('the charter with its imports carries each paragraph once', () => {
    for (const t of [...NOYAU, ...Object.values(MODULES).flat()]) {
      expect(nombre(charte.entiere, `**${t}**`), t).toBe(1);
    }
    for (const debut of SANS_TITRE) {
      expect(nombre(charte.entiere, debut), debut).toBe(1);
    }
    expect(nombre(charte.entiere, '| Sorte |')).toBe(1);
    expect(nombre(charte.entiere, CHARGE)).toBe(1);
  });

  it('the table of the sorts of tests and its conclusion go with the proof of the red', () => {
    const preuve = plat(charte.modules.preuve ?? '');
    expect(preuve).toContain('| Sorte |');
    expect(preuve).toContain('Ainsi la preuve du rouge mesure le travail');
    expect(plat(charte.noyau)).not.toContain('| Sorte |');
  });

  it('the core says, with the tools, that nobody makes load by day and that a doubtful test is replayed by npm run test:forcer', () => {
    const outils = plat(charte.noyau.slice(charte.noyau.indexOf('## Outils')));
    expect(outils).toMatch(
      /[Dd]e jour, personne ne fabrique de charge[^.]*soupçonné instable se rejoue par `npm run test:forcer`/
    );
  });
});

describe('a skill of a role cites only paragraphs its role receives', () => {
  // The modules each role receives.
  const RECUS: Record<string, string[]> = {
    explorateur: ['plan', 'preuve'],
    questionneur: ['plan', 'preuve'],
    testwriter: ['preuve', 'tests'],
    developpeur: [],
    direct: ['preuve', 'tests'],
    relecteur: ['plan', 'preuve', 'tests'],
  };
  const fichiers = (dossier: string): string[] =>
    readdirSync(path.join(DEPOT, dossier), { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? fichiers(`${dossier}/${e.name}`) : [`${dossier}/${e.name}`]
    );

  it.each(Object.keys(RECUS))('the skill of the %s', role => {
    const hors = fichiers(`mods/grillhouse/skills/${role}`)
      .filter(f => f.endsWith('.md'))
      .flatMap(f => {
        const texte = plat(lire(f));
        // A citation: the title, or its start, between quotes, or the title in bold.
        const entreGuillemets = [...texte.matchAll(/« ([^»]{15,}?) »/g)].map(m => m[1]!);
        return Object.entries(MODULES)
          .filter(([m]) => !RECUS[role]!.includes(m))
          .flatMap(([m, liste]) =>
            liste
              .filter(t => texte.includes(`**${t}**`) || entreGuillemets.some(c => t.startsWith(c)))
              .map(t => `${f} : « ${t} » (module ${m})`)
          );
      });
    expect(hors).toEqual([]);
  });
});

describe('the supervisor and a session out of the circuit receive the whole charter', () => {
  it.each(['.claude/settings.json', 'templates/projet/.claude/settings.json'])(
    'the settings %s exclude no module of the charter',
    f => {
      const { claudeMdExcludes = [] } = JSON.parse(lire(f)) as { claudeMdExcludes?: string[] };
      expect(claudeMdExcludes.filter(e => e.includes('charte'))).toEqual([]);
    }
  );
});

describe('the documents of the mechanisms say which modules a role receives', () => {
  // The section <numero> of the document <f>, up to the next title.
  const section = (f: string, numero: string) => {
    const texte = lire(f);
    const debut = texte.indexOf(`### ${numero} `);
    expect(debut, `${f} §${numero}`).toBeGreaterThan(-1);
    const fin = texte.slice(debut + 4).search(/\n##+ /);
    return plat(texte.slice(debut, fin < 0 ? undefined : debut + 4 + fin));
  };

  it('the document of the machine (§3.2) names each module of the charter and the exclusion of the others', () => {
    const s = section('packages/grillhouse/docs/architecture/machine.md', '3.2');
    expect(s).toMatch(/modules? [^.]*charte|charte[^.]* modules?/);
    expect(s).toContain('claudeMdExcludes');
    for (const m of Object.keys(MODULES)) {
      expect(s, m).toMatch(new RegExp(`(\`|charte/)${m}(\\.md)?\``));
    }
  });

  it('the document of the circuit (§3.3) sends to it for the modules of the charter', () => {
    const s = section('packages/grillhouse/docs/architecture/circuit.md', '3.3');
    expect(s).toMatch(/modules? [^.]*charte|charte[^.]* modules?/);
    expect(s).toMatch(/§3\.2/);
  });
});
