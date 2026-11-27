// La règle des rôles se juge sur le lot, à la fin de la séance (document de la machine, §5.5) : ce
// qu'une séance crée, modifie ou supprime, par tout outil, dans la copie ou l'arbre où elle tourne.
// Le lot d'un auteur qui sort de la règle de son rôle revient sur sa fiche
// (`horsRole`, `{ fichiers, rapport }`) ; un rôle qui n'écrit pas est repris une fois, puis le
// circuit s'arrête sur « sans-fiche ». Les séances sont jouées par les substituts du monde d'essai,
// dont les commandes écrivent dans un dépôt git : des tests moyens.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as seances from '../../scripts/seances.mjs';
import { monde, type Monde } from './seance-d-essai.js';

interface HorsRole {
  fichiers: string[];
  rapport: string;
}
interface Fiche {
  statut?: string;
  horsRole?: HorsRole | null;
}
const seance = seances.seance as (
  ctx: object,
  role: string,
  options: object
) => Promise<{ fiche: Fiche }>;
const jusquALaFiche = seances.jusquALaFiche as (
  ctx: object,
  role: string,
  texte: string,
  options: object
) => Promise<Record<string, unknown>>;

const FAIT = { statut: 'FAIT' };
const AUCUNE = { issue: 'AUCUNE' };
const CODE = 'packages/forms/src/index.mjs';
const TEST = 'packages/forms/tests/mesure.spec.ts';

// The command that writes &lt;texte&gt; in the file &lt;rel&gt; of the folder the session works in.
const ecrit = (rel: string, texte = 'export const neuf = 1;\n') =>
  `mkdir -p ${path.posix.dirname(rel)} && printf '%s' '${texte}' > ${rel}`;
const MANIFESTE = (champs: object) =>
  JSON.stringify({
    name: '000-forms',
    type: 'module',
    scripts: { 'test:unit': 'vitest run' },
    ...champs,
  });

let numero = 0;
// One session of &lt;role&gt; in the world &lt;m&gt;, which plays &lt;commandes&gt; before its sheet &lt;fiche&gt;.
async function auteur(m: Monde, role: string, commandes: string | null, fiche: object = FAIT) {
  if (commandes) {
    m.geste(commandes, m.appels() + 1);
  }
  m.fiche(fiche);
  return jouerLActe(m, role, `s-${++numero}`);
}
// The act of the circuit that plays the session <id> of <role>, with the options <activite> of its
// attempt: the sheet it returns.
async function jouerLActe(m: Monde, role: string, id: string, activite: object = {}) {
  const { fiche: rendue } = await m.jouer(() =>
    seance(m.ctx, role, {
      tentative: 1,
      derniere: false,
      seanceId: id,
      reprise: null,
      rapport: null,
      constats: [],
      lectures: { lots: () => [], references: () => [] },
      retenir: () => {},
      ...activite,
    })
  );
  return rendue;
}
const fautifs = (f: Fiche) => [...(f.horsRole?.fichiers ?? [])].sort();

describe('le lot d’un testwriter qui touche du code rend son étape, chaque fichier fautif nommé', () => {
  it('un fichier de code écrit par un script est nommé, son fichier de test ne l’est pas', async () => {
    const m = monde({ copie: true });
    const f = await auteur(m, 'testwriter', `${ecrit(CODE)}\n${ecrit(TEST)}`);
    expect(fautifs(f)).toEqual([CODE]);
    expect(f.horsRole?.rapport).toContain(CODE);
    expect(f.horsRole?.rapport).not.toContain(TEST);
  });

  it('plusieurs fichiers fautifs sont tous nommés, un fichier supprimé et un fichier de la racine compris', async () => {
    const m = monde({ copie: true });
    const f = await auteur(
      m,
      'testwriter',
      `rm ${CODE}\n${ecrit('notes.md')}\n${ecrit('packages/binder/src/autre.mjs')}`
    );
    expect(fautifs(f)).toEqual(['notes.md', 'packages/binder/src/autre.mjs', CODE].sort());
  });

  it('une partie d’un manifeste hors de celle de ses tests est nommée avec le manifeste', async () => {
    const m = monde({ copie: true });
    const f = await auteur(
      m,
      'testwriter',
      ecrit(
        'packages/forms/package.json',
        MANIFESTE({ dependencies: { x: '1.0.0' }, devDependencies: { y: '1.0.0' } })
      )
    );
    expect(fautifs(f)).toEqual(['packages/forms/package.json']);
    expect(f.horsRole?.rapport).toContain('packages/forms/package.json');
    expect(f.horsRole?.rapport).toMatch(/\bdependencies\b/);
    expect(f.horsRole?.rapport).not.toContain('devDependencies');
  });

  it('ses tests, la part de test d’un manifeste et le fichier de verrou des versions passent', async () => {
    const m = monde({ copie: true });
    const f = await auteur(
      m,
      'testwriter',
      [
        ecrit(TEST),
        ecrit('packages/forms/package.json', MANIFESTE({ devDependencies: { y: '1.0.0' } })),
        ecrit('package-lock.json', '{}'),
      ].join('\n')
    );
    expect(f.horsRole ?? null).toBeNull();
  });

  it('dans un paquet lecteur étendu à ses tests, seuls les fichiers de test passent', async () => {
    const m = monde({ copie: true });
    m.ctx.testsEtendus = ['packages/binder'];
    const f = await auteur(
      m,
      'testwriter',
      [
        ecrit('packages/binder/tests/lecteur.spec.ts'),
        ecrit('packages/binder/src/index.mjs'),
        ecrit(
          'packages/binder/package.json',
          JSON.stringify({
            name: '030-binder',
            type: 'module',
            scripts: { 'test:unit': 'vitest run' },
            devDependencies: { y: '1.0.0' },
          })
        ),
      ].join('\n')
    );
    expect(fautifs(f)).toEqual(['packages/binder/package.json', 'packages/binder/src/index.mjs']);
  });
});

describe('le lot d’un développeur qui touche un test rend son étape, les fichiers fautifs nommés', () => {
  it('un fichier de test modifié par un script est nommé, son code ne l’est pas', async () => {
    const m = monde({ copie: true });
    const f = await auteur(m, 'developpeur', `${ecrit(CODE)}\n${ecrit(TEST)}`);
    expect(fautifs(f)).toEqual([TEST]);
    expect(f.horsRole?.rapport).toContain(TEST);
  });

  it('un lot de code seul passe', async () => {
    const m = monde({ copie: true });
    const f = await auteur(m, 'developpeur', ecrit(CODE));
    expect(f.horsRole ?? null).toBeNull();
  });

  it('le lot de l’agent direct, tests et code, n’est pas jugé', async () => {
    const m = monde({ copie: true });
    const f = await auteur(m, 'direct', `${ecrit(CODE)}\n${ecrit(TEST)}`);
    expect(f.horsRole ?? null).toBeNull();
  });
});

describe('le lot d’une séance est ce qu’elle change, comparé sur le contenu', () => {
  it('un fichier que la séance commite reste dans son lot', async () => {
    const m = monde({ copie: true });
    const f = await auteur(
      m,
      'testwriter',
      `${ecrit(CODE)}\ngit add -A\ngit commit -q -m de-la-seance`
    );
    expect(fautifs(f)).toEqual([CODE]);
  });

  it('.beads/ et les fichiers ignorés par git en sont écartés', async () => {
    const m = monde({ copie: true });
    const f = await auteur(
      m,
      'testwriter',
      [
        ecrit('.beads/issues.jsonl', '{}'),
        ecrit('.claude/worktrees/ignore.txt', 'x'),
        ecrit(CODE),
      ].join('\n')
    );
    expect(fautifs(f)).toEqual([CODE]);
  });

  it('ce que la copie porte déjà au départ de la séance n’y est pas', async () => {
    const m = monde({ copie: true });
    writeFileSync(path.join(m.ctx.copie, CODE), 'export const mesure = x => 2 * x;\n');
    const f = await auteur(m, 'testwriter', ecrit(TEST));
    expect(f.horsRole ?? null).toBeNull();
  });

  it('un fichier suivi déjà changé au départ, que la séance change encore, y est', async () => {
    const m = monde({ copie: true });
    writeFileSync(path.join(m.ctx.copie, CODE), 'export const mesure = x => 2 * x;\n');
    const f = await auteur(m, 'testwriter', ecrit(CODE));
    expect(fautifs(f)).toEqual([CODE]);
  });
});

describe('un fichier fautif reste nommé tant qu’il n’est pas revenu à son état d’avant la séance qui l’a changé', () => {
  it('une séance relancée qui n’y touche pas ne le fait pas passer', async () => {
    const m = monde({ copie: true });
    await auteur(m, 'testwriter', ecrit(CODE));
    const encore = await auteur(m, 'testwriter', ecrit(TEST));
    expect(fautifs(encore)).toEqual([CODE]);
    const sansRien = await auteur(m, 'testwriter', null);
    expect(fautifs(sansRien)).toEqual([CODE]);
  });

  it('le retour du fichier à son état d’avant le fait passer', async () => {
    const m = monde({ copie: true });
    await auteur(m, 'testwriter', ecrit(CODE));
    const rendu = await auteur(m, 'testwriter', `git checkout -q HEAD -- ${CODE}`);
    expect(rendu.horsRole ?? null).toBeNull();
  });

  it('le retour est à l’état d’avant la séance, non à celui du dernier commit', async () => {
    const m = monde({ copie: true });
    const avant = 'export const mesure = x => 2 * x;\n';
    writeFileSync(path.join(m.ctx.copie, CODE), avant);
    await auteur(m, 'testwriter', ecrit(CODE));
    const aHead = await auteur(m, 'testwriter', `git checkout -q HEAD -- ${CODE}`);
    expect(fautifs(aHead)).toEqual([CODE]);
    const rendu = await auteur(m, 'testwriter', ecrit(CODE, avant));
    expect(rendu.horsRole ?? null).toBeNull();
  });
});

describe('ce que la préparation de la copie ou un commit de main apporte hors de la séance n’est pas dans son lot', () => {
  it('un test que la préparation change avant la séance n’est pas dans le lot du développeur', async () => {
    const m = monde({ copie: true });
    m.preparation(ecrit(TEST), 1);
    const f = await auteur(m, 'developpeur', ecrit(CODE));
    expect(f.horsRole ?? null).toBeNull();
  });

  it('seul ce que la séance change après la préparation est nommé', async () => {
    const m = monde({ copie: true });
    m.preparation(ecrit(CODE), 1);
    const f = await auteur(m, 'testwriter', ecrit('packages/binder/src/index.mjs'));
    expect(fautifs(f)).toEqual(['packages/binder/src/index.mjs']);
  });

  const DE_MAIN = 'export const deMain = 1;\n';
  it('un fichier fautif que l’avance de la copie ramène à l’état de main, changé par main, passe', async () => {
    const m = monde({ copie: true });
    const fautive = await auteur(m, 'developpeur', ecrit(TEST));
    expect(fautifs(fautive)).toEqual([TEST]);
    m.surMain(TEST, DE_MAIN);
    m.preparation(`git checkout -q main -- ${TEST}`, m.appels() + 1);
    const apres = await auteur(m, 'developpeur', ecrit(CODE));
    expect(apres.horsRole ?? null).toBeNull();
  });

  it('un fichier fautif que main change reste nommé tant que la copie n’en porte pas l’état de main', async () => {
    const m = monde({ copie: true });
    await auteur(m, 'developpeur', ecrit(TEST));
    m.surMain(TEST, DE_MAIN);
    const apres = await auteur(m, 'developpeur', null);
    expect(fautifs(apres)).toEqual([TEST]);
  });
});

describe('un acte rejoué ne fait pas passer un fichier fautif', () => {
  // The circuit dies once the session has ended, before it judges its lot: the place of the
  // machine, given back at that moment, throws.
  const MORT = {
    prendrePlace: () => ({
      env: {},
      rattacher: () => {},
      rendre: () => {
        throw new Error('le circuit meurt');
      },
    }),
  };
  // The attempt of Temporal that plays the act again, told the launch the dead one made last.
  const rejouer = (m: Monde, id: string) => {
    m.ctx.essaiDeLActe = 2;
    return jouerLActe(m, 'testwriter', id, {
      precedent: { lancement: 'lancement:neuve:1', seanceId: id },
    });
  };

  it('le résultat repris à la séance de l’essai mort porte le jugement de son lot', async () => {
    const m = monde({ copie: true });
    m.geste(ecrit(CODE), 1);
    m.fiche(FAIT);
    await expect(jouerLActe(m, 'testwriter', 'rejoue-1', MORT)).rejects.toThrow('le circuit meurt');
    const f = await rejouer(m, 'rejoue-1');
    expect(m.appels()).toBe(1);
    expect(fautifs(f)).toEqual([CODE]);
  });

  it('une séance morte sans résultat est jugée avant que l’essai rejoué en lance une neuve', async () => {
    const m = monde({ copie: true });
    m.preparation(':', 1);
    // The session writes, then dies without ranging a result.
    m.geste(`${ecrit(CODE)}\nexit 1`, 1);
    m.fiche(FAIT);
    await expect(jouerLActe(m, 'testwriter', 'rejoue-2', MORT)).rejects.toThrow('le circuit meurt');
    m.fiche(FAIT);
    const f = await rejouer(m, 'rejoue-2');
    expect(m.appels()).toBe(2);
    expect(fautifs(f)).toEqual([CODE]);
  });
});

// A session of a role that writes nothing, out of the envelope, whose calls play &lt;gestes&gt; in their
// order (null: nothing), each with a sheet that conforms.
async function lecteur(
  m: Monde,
  role: string,
  gestes: (string | null)[],
  options: object = {},
  fiche: object = AUCUNE
) {
  const depart = m.appels();
  gestes.forEach((g, i) => {
    if (g) {
      m.geste(g, depart + i + 1);
    }
    m.fiche(fiche);
  });
  const id = `l-${++numero}`;
  return m.jouer(() =>
    jusquALaFiche(m.ctx, role, 'TON TICKET : demo-1\n', {
      horsEnveloppe: true,
      id,
      evenement: id,
      ...options,
    })
  );
}
// A world whose ticket has no copy yet, as at the plan: its sessions run in the main tree.
function sansCopie(): Monde {
  const m = monde();
  m.ctx.copie = path.join(m.ctx.racine, '.claude/worktrees/demo-1');
  return m;
}
const arretDe = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as { nom: string; message: string };
  }
  return null;
};

describe('un rôle qui n’écrit pas laisse un lot vide, dans la copie comme dans l’arbre principal', () => {
  it.each([
    ['dans l’arbre principal', false],
    ['dans la copie', true],
  ])('un questionneur au lot vide %s ne se reprend pas', async (_ou, copie) => {
    const m = copie ? monde({ copie }) : sansCopie();
    await lecteur(m, 'questionneur', [null]);
    expect(m.appels()).toBe(1);
  });

  it('un questionneur qui écrit dans la copie est repris une fois, les fichiers nommés, puis « sans-fiche »', async () => {
    const m = monde({ copie: true });
    const arret = await arretDe(
      lecteur(m, 'questionneur', [`${ecrit(CODE)}\n${ecrit('notes.md')}`, null])
    );
    expect(arret?.nom).toBe('sans-fiche');
    expect(m.appels()).toBe(2);
    for (const f of [CODE, 'notes.md']) {
      expect(m.prompt(2)).toContain(f);
      expect(arret?.message).toContain(f);
    }
  });

  it('dans la copie, la reprise qui rend le fichier à son état d’avant passe', async () => {
    const m = monde({ copie: true });
    await lecteur(m, 'questionneur', [ecrit(CODE), `git checkout -q HEAD -- ${CODE}`]);
    expect(m.appels()).toBe(2);
  });

  it('dans l’arbre principal, la reprise passe quand rien n’y change pendant elle, les fichiers au commentaire du ticket', async () => {
    const m = sansCopie();
    await lecteur(m, 'explorateur', [ecrit(CODE), null], { fiche: 'geste' }, FAIT);
    expect(m.appels()).toBe(2);
    expect(m.prompt(2)).toContain(CODE);
    expect(m.prompt(2)).toMatch(/toi-même|elle-même/);
    expect(m.commentaires().join('\n')).toContain(CODE);
  });

  it('dans l’arbre principal, la reprise qui change encore un fichier arrête le circuit', async () => {
    const m = sansCopie();
    const arret = await arretDe(lecteur(m, 'questionneur', [ecrit(CODE), ecrit('notes.md')]));
    expect(arret?.nom).toBe('sans-fiche');
    expect(arret?.message).toContain('notes.md');
  });

  it('dans l’arbre principal, ce qui y était changé avant la séance, .beads/ et un commit entré pendant elle n’y comptent pas', async () => {
    const m = sansCopie();
    writeFileSync(path.join(m.ctx.racine, 'en-cours.md'), 'à un autre\n');
    await lecteur(m, 'questionneur', [
      [
        ecrit('.beads/issues.jsonl', '{}'),
        ecrit('packages/binder/src/entre.mjs'),
        'git add packages/binder/src/entre.mjs',
        'git commit -q -m entre-pendant-la-seance',
      ].join('\n'),
    ]);
    expect(m.appels()).toBe(1);
  });

  it('le lot de la commande du plan à l’étape 1.1, sous enveloppe, n’est pas jugé', async () => {
    const m = monde({ copie: true });
    m.geste(ecrit(CODE), 1);
    m.fiche(FAIT);
    await m.jouer(() =>
      jusquALaFiche(m.ctx, 'explorateur', 'TON TICKET : demo-1\n', {
        id: 'geste-1',
        evenement: 'geste',
        fiche: 'geste',
        objet: 'geste',
      })
    );
    expect(m.appels()).toBe(1);
  });
});

describe('le jugement du lot charge son code du cadre installé', () => {
  // The architecture of the copy no longer declares the language: its module does not load there.
  const CASSER = ecrit('docs/ARCHITECTURE.md', '# Sans composants\n');

  it('une copie dont le module de langage ne se charge plus se juge : le test passe, le code est nommé', async () => {
    const m = monde({ copie: true });
    const f = await auteur(m, 'testwriter', [CASSER, ecrit(TEST), ecrit(CODE)].join('\n'));
    expect(fautifs(f)).toEqual(['docs/ARCHITECTURE.md', CODE]);
  });

  it('quand ni le cadre installé ni la copie ne se chargent, l’étape ne passe pas, la version, les causes et l’arbre principal nommés', async () => {
    const m = monde({ copie: true });
    const casserLArbre = `printf '# Sans composants\\n' > ${m.ctx.racine}/docs/ARCHITECTURE.md`;
    const arret = await arretDe(
      auteur(m, 'testwriter', [CASSER, casserLArbre, ecrit(TEST)].join('\n'))
    );
    expect(arret).not.toBeNull();
    expect(arret?.message).toMatch(/version/i);
    expect(arret?.message).toContain(m.ctx.racine);
    expect(arret?.message).toMatch(/arbre principal/);
  });
});
