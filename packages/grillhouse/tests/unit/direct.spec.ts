// La commande du direct (`npx grillhouse direct <ticket>`, scripts/direct.mjs), voie de secours du
// moteur : un agent lancé dans une copie à lui, puis la relecture de son lot, et rien d'autre ; les
// paquets du direct, la panne exigée et écrite au ticket, la prise du ticket, le refus d'un circuit
// vivant, rien demandé à l'arbitre, le choix entre démarrage et relance, la consigne du relecteur, le
// verrou de la copie.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Client } from '@temporalio/client';
import { afterAll, describe, expect, it } from 'vitest';
import { ClientNonConstruit, ServeurMuet } from '../../scripts/circuits-du-serveur.mjs';
import * as travail from '../../scripts/enveloppe/travail-de-la-copie.mjs';
import { prendreUnePart, prendreUnePlace } from '../../scripts/places-de-la-machine.mjs';
import { consigne } from '../../scripts/seances.mjs';
import { lireLesCircuits } from '../../src/temporal/circuit/client.js';
import { idDuCircuit } from '../../src/temporal/circuit/contrat.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'direct-secours-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecritPar = (
  travail as unknown as {
    ecritPar: (
      role: string,
      estUnTest: (f: string) => unknown
    ) => ((f: string) => boolean) | undefined;
  }
).ecritPar;

// Le module est chargé à l'exécution : tant qu'il manque, chaque test échoue seul, nommé.
type Git = (...a: string[]) => { status: number; stdout: string; stderr: string };
interface Direct {
  consigneDuRelecteurDuDirect: (valeurs: Record<string, string>) => string;
  decisionDuDirect: (
    fiches: object[],
    lot: string
  ) => { action: string; constats?: { titre: string }[]; rendus?: number };
  deverrouillerLaCopie: (copie: string, git: Git) => void;
  lancerLeDirect: (o: { id: string; ticket: object; panne?: string; ports: object }) => Promise<{
    verdict?: string;
    copie?: string;
    constats?: { titre: string }[];
    arret?: boolean;
  }>;
  lireLesOptions: (argv: string[]) => {
    id: string;
    panne?: string | null;
    paquets: string[];
    deverrouiller: boolean;
  } | null;
  planDuDirect: (o: {
    id: string;
    titre: string;
    options?: string[];
    resoudre: (nom: string) => string;
  }) => { sujet: string; plan: string[] };
  rapportDuConflit: (fichiers: string[]) => string;
  verrouillerLaCopie: (copie: string, git: Git) => void;
}
const {
  consigneDuRelecteurDuDirect,
  decisionDuDirect,
  deverrouillerLaCopie,
  lancerLeDirect,
  lireLesOptions,
  planDuDirect,
  rapportDuConflit,
  verrouillerLaCopie,
} = (await import('../../scripts/direct.mjs').catch(() => ({}))) as unknown as Direct;

// Un composant se résout comme le circuit le résout : son nom ou son chemin, sinon un chemin du dépôt.
const CONNUS: Record<string, string> = {
  grillhouse: 'packages/grillhouse',
  'grillhouse-matiere': 'packages/grillhouse-matiere',
  'packages/a': 'packages/a',
  'packages/b': 'packages/b',
  docs: 'docs',
};
const resoudre = (nom: string) => {
  if (!(nom in CONNUS)) {
    throw new Error(
      `le composant « ${nom} » du titre ne nomme ni un paquet ni un chemin du dépôt.`
    );
  }
  return CONNUS[nom];
};

describe('les paquets d’un direct sont les composants du titre, complétés par une option', () => {
  it('lit les composants après le dernier « — » du titre', () => {
    const r = planDuDirect({
      id: 'demo-9',
      titre: '9 — Le sujet — grillhouse, grillhouse-matiere',
      resoudre,
    });
    expect(r.sujet).toBe('Le sujet');
    expect(r.plan).toEqual(['packages/grillhouse', 'packages/grillhouse-matiere']);
  });

  it('ajoute les paquets de l’option, une fois chacun', () => {
    const r = planDuDirect({
      id: 'demo-9',
      titre: '9 — Le sujet — packages/a',
      options: ['packages/b', 'packages/a'],
      resoudre,
    });
    expect(r.plan).toEqual(['packages/a', 'packages/b']);
  });

  it('un titre sans composant et une option : l’option fait le plan', () => {
    const r = planDuDirect({
      id: 'demo-9',
      titre: 'Un titre sans composants',
      options: ['packages/b'],
      resoudre,
    });
    expect(r.plan).toEqual(['packages/b']);
  });

  it('sans aucun paquet, refuse en nommant le titre', () => {
    expect(() =>
      planDuDirect({ id: 'demo-9', titre: 'Un titre sans composants', resoudre })
    ).toThrow(/Un titre sans composants/);
  });

  it('un chemin qu’aucun paquet ne tient est admis comme chemin du plan', () => {
    const r = planDuDirect({ id: 'demo-9', titre: '9 — Des données — docs', resoudre });
    expect(r.plan).toEqual(['docs']);
  });

  it('un composant inconnu est refusé, nommé', () => {
    expect(() => planDuDirect({ id: 'demo-9', titre: '9 — Le sujet — fantome', resoudre })).toThrow(
      /fantome/
    );
  });
});

// La fiche d'une relecture, telle que le circuit la garde pour son lot.
const fiche = (lot: string, verdict: 'ACCEPTÉ' | 'RENDU', constats: object[] = []) => ({
  date: '2026-11-22T10:00:00Z',
  role: 'relecteur',
  lot,
  fiche: { verdict, constats },
});
const bloquant = (titre: string) => ({ titre, genre: 'bloquant', corps: 'c', piece: 'p' });
const remarque = (titre: string) => ({ titre, genre: 'remarque', corps: 'c', piece: 'p' });

describe('la commande décide entre démarrage et relance sur les fiches du relecteur de la copie', () => {
  it('sans aucune fiche, elle démarre', () => {
    expect(decisionDuDirect([], 'lot-1')).toMatchObject({ action: 'demarrer' });
  });

  it('sans fiche pour le lot courant, elle démarre, même si un lot d’avant a été accepté', () => {
    expect(decisionDuDirect([fiche('lot-0', 'ACCEPTÉ')], 'lot-1')).toMatchObject({
      action: 'demarrer',
    });
  });

  it('les fiches d’un autre rôle ne comptent pas', () => {
    const autre = { ...fiche('lot-1', 'RENDU', [bloquant('x')]), role: 'developpeur' };
    expect(decisionDuDirect([autre], 'lot-1')).toMatchObject({ action: 'demarrer' });
  });

  it('avec un verdict RENDU sur le lot courant, elle relance l’agent avec les constats bloquants ouverts', () => {
    const d = decisionDuDirect(
      [fiche('lot-1', 'RENDU', [bloquant('Un défaut sans test'), remarque('Un nom')])],
      'lot-1'
    );
    expect(d.action).toBe('relancer');
    expect((d.constats as { titre: string }[]).map(c => c.titre)).toEqual(['Un défaut sans test']);
  });

  it('un lot déjà accepté ne relance rien : elle rend le verdict', () => {
    expect(decisionDuDirect([fiche('lot-1', 'ACCEPTÉ')], 'lot-1')).toMatchObject({
      action: 'accepte',
    });
  });

  it('après trois RENDU, elle s’arrête et remonte au superviseur', () => {
    const rendus = [1, 2, 3].map(n => fiche(`lot-${n}`, 'RENDU', [bloquant(`c${n}`)]));
    expect(decisionDuDirect(rendus, 'lot-3')).toMatchObject({ action: 'arreter', rendus: 3 });
  });

  it('deux RENDU relancent encore ; un ACCEPTÉ remet le compte à zéro', () => {
    const deux = [1, 2].map(n => fiche(`lot-${n}`, 'RENDU', [bloquant(`c${n}`)]));
    expect(decisionDuDirect(deux, 'lot-2')).toMatchObject({ action: 'relancer' });
    const remis = [...deux, fiche('lot-3', 'ACCEPTÉ'), fiche('lot-4', 'RENDU', [bloquant('d')])];
    expect(decisionDuDirect(remis, 'lot-4')).toMatchObject({ action: 'relancer' });
  });
});

describe('la consigne du relecteur d’un direct exige un test qui reproduit un défaut corrigé', () => {
  const valeurs = {
    depot: '/depot',
    ticket: 'demo-9',
    sujet: 'Le sujet',
    paquets: 'packages/a',
    reprise: 'non',
    lots: 'le lot',
    precedente: '',
    affirmations: '',
    elements: '',
    flux: '',
    rapports: 'aucun',
    contexte: '',
  };

  it('dit qu’un défaut corrigé porte un test qui le reproduit', () => {
    expect(consigneDuRelecteurDuDirect(valeurs)).toMatch(/défaut corrigé[^.]*test[^.]*reprodui/i);
  });

  it('dit que la preuve du rouge n’est pas jouée', () => {
    expect(consigneDuRelecteurDuDirect(valeurs)).toMatch(/preuve du rouge[^.]*pas jouée/i);
  });

  it('garde la consigne du relecteur du circuit, sans cette exigence pour lui', () => {
    expect(consigneDuRelecteurDuDirect(valeurs)).toContain(consigne(valeurs, 1).trim());
    expect(consigne(valeurs, 1)).not.toMatch(/preuve du rouge[^.]*pas jouée/i);
  });

  it('dit le lot mené par la voie de secours, et non plus hors du circuit', () => {
    const texte = consigneDuRelecteurDuDirect(valeurs);
    expect(texte).toMatch(/voie de secours/);
    expect(texte).not.toMatch(/hors du circuit/);
  });
});

describe('la copie d’un direct est verrouillée par git', () => {
  it('verrouille la copie qu’elle crée, avec sa raison', () => {
    const appels: string[][] = [];
    verrouillerLaCopie('/depot/.claude/worktrees/demo-9', (...a: string[]) => {
      appels.push(a);
      return { status: 0, stdout: '', stderr: '' };
    });
    expect(appels).toHaveLength(1);
    expect(appels[0].slice(0, 2)).toEqual(['worktree', 'lock']);
    expect(appels[0]).toContain('--reason');
    expect(appels[0].at(-1)).toBe('/depot/.claude/worktrees/demo-9');
  });

  it('une copie déjà verrouillée ne fait pas échouer la commande, git répondant en français', () => {
    const copie = '/depot/.claude/worktrees/demo-9';
    const appels: string[][] = [];
    expect(() =>
      verrouillerLaCopie(copie, (...a: string[]) => {
        appels.push(a);
        return a[1] === 'lock'
          ? { status: 128, stdout: '', stderr: `fatal: « ${copie} » est déjà verrouillé` }
          : {
              status: 0,
              stdout: `worktree /depot\nHEAD abc\nbranch refs/heads/main\n\nworktree ${copie}\nHEAD abc\nbranch refs/heads/agent/demo-9\nlocked copie d'un ticket direct\n`,
              stderr: '',
            };
      })
    ).not.toThrow();
    expect(appels.at(-1)).toEqual(['worktree', 'list', '--porcelain']);
  });

  it('un refus de git sur une copie qu’aucun verrou ne tient reste une faute', () => {
    const copie = '/depot/.claude/worktrees/demo-9';
    expect(() =>
      verrouillerLaCopie(copie, (...a: string[]) =>
        a[1] === 'lock'
          ? { status: 128, stdout: '', stderr: 'fatal: autre chose' }
          : { status: 0, stdout: `worktree ${copie}\nHEAD abc\n`, stderr: '' }
      )
    ).toThrow(/ne se verrouille pas/);
  });

  it('la déverrouille quand le lot est sur main', () => {
    const appels: string[][] = [];
    deverrouillerLaCopie('/depot/.claude/worktrees/demo-9', (...a: string[]) => {
      appels.push(a);
      return { status: 0, stdout: '', stderr: '' };
    });
    expect(appels).toEqual([['worktree', 'unlock', '/depot/.claude/worktrees/demo-9']]);
  });
});

// La racine du dépôt d'essai, et l'identifiant du déroulé de son ticket.
const RACINE = '/depot';
const DEROULE = idDuCircuit(RACINE, 'demo-9');

// Un déroulé tel que le serveur le liste.
interface Deroule {
  ticket: string;
  statut: string;
  question?: boolean;
}
// Les circuits tels que `lireLesCircuits` les publie, depuis les déroulés `deroules` du serveur.
const circuitsLus = (deroules: Deroule[]) => {
  let appel = 0;
  const client = {
    workflow: {
      list: () => {
        const premier = appel++ === 0;
        return (async function* () {
          await Promise.resolve();
          for (const [rang, d] of premier ? deroules.entries() : []) {
            yield {
              workflowId: idDuCircuit(RACINE, d.ticket),
              runId: String(rang),
              startTime: new Date(rang),
              ...(d.statut === 'RUNNING' ? {} : { closeTime: new Date(rang + 1) }),
              status: { name: d.statut },
              memo: {
                etape: 'developpeur',
                ...(d.question
                  ? { question: { arret: 'besoin', qui: 'superviseur', question: 'Laquelle ?' } }
                  : {}),
              },
            };
          }
        })();
      },
    },
  } as unknown as Client;
  return lireLesCircuits(client, RACINE);
};

// Un commentaire du ticket, tel que `bd comments` le donne.
interface Commentaire {
  author: string;
  text: string;
}

// Les ports de la commande, essayés : ce qu'elle lance et écrit, dans l'ordre.
function ports(
  fiches: object[],
  verdicts: ('ACCEPTÉ' | 'RENDU')[] = ['ACCEPTÉ'],
  enConflit: string[] = []
) {
  const journal: string[] = [];
  const lancees: { role: string; constats: unknown[]; conflits?: string[] }[] = [];
  const commentaires: Commentaire[] = [];
  return {
    journal,
    lancees,
    commentaires,
    ports: {
      // Les circuits du dépôt, lus au serveur.
      circuits: (): Promise<unknown[]> => circuitsLus([]),
      // L'identifiant du déroulé du ticket au serveur.
      deroule: () => DEROULE,
      // La prise du ticket (`in_progress`).
      prendre: () => {
        journal.push('prendre');
      },
      commentaires: () => [...commentaires],
      commenter: (texte: string) => {
        journal.push('commenter');
        commentaires.push({ author: 'superviseur', text: texte });
      },
      copie: () => {
        journal.push('copie');
        return '/depot/.claude/worktrees/demo-9';
      },
      verrouiller: () => journal.push('verrouiller'),
      fiches: () => fiches,
      lot: () => 'lot-1',
      resoudre,
      // L'avance de la copie sur main : les fichiers que le travail de la copie trouve en conflit.
      avancer: () => ({ fichiers: enConflit }),
      seance: (
        role: string,
        o: { constats?: unknown[]; paquets: string[]; conflits?: string[] }
      ) => {
        journal.push(`seance:${role}`);
        lancees.push({ role, constats: o.constats ?? [], conflits: o.conflits });
        return { statut: 'FAIT' };
      },
      // La relecture écrit elle-même son verdict au ticket, comme `relire` (scripts/activites.mjs).
      relecture: () => {
        journal.push('relecture');
        const verdict = verdicts.shift() ?? 'ACCEPTÉ';
        commentaires.push({ author: 'relecteur', text: `${verdict}\n` });
        return {
          verdict,
          constats: verdict === 'RENDU' ? [bloquant('Un constat')] : [],
        };
      },
    },
  };
}
const ticket = (labels: string[], status = 'open', title = '9 — Le sujet — packages/a') => ({
  id: 'demo-9',
  title,
  status,
  labels,
});
const PANNE = 'la file d’intégration ne répond plus';
const lancer = (
  p: ReturnType<typeof ports>,
  o: { ticket?: object; panne?: string | undefined } = {}
) =>
  lancerLeDirect({
    id: 'demo-9',
    ticket: o.ticket ?? ticket(['direct']),
    panne: 'panne' in o ? o.panne : PANNE,
    ports: p.ports,
  });
const GESTES = /^(copie|verrouiller|prendre|commenter|seance:direct|relecture)$/;
const lancements = (journal: string[]) =>
  journal.filter(j => /^(copie|verrouiller|seance:direct|relecture)$/.test(j));
const ecritsDeLaPanne = (p: ReturnType<typeof ports>, panne = PANNE) =>
  p.commentaires.filter(c => c.text.includes(panne));

describe('la commande lance l’agent, puis le relecteur, et s’arrête', () => {
  it('sur un ticket direct, joue la copie verrouillée, l’agent direct, la relecture, dans cet ordre', async () => {
    const p = ports([]);
    const r = await lancer(p);
    expect(lancements(p.journal)).toEqual(['copie', 'verrouiller', 'seance:direct', 'relecture']);
    expect(r).toMatchObject({
      verdict: 'ACCEPTÉ',
      copie: '/depot/.claude/worktrees/demo-9',
    });
  });

  it('un conflit d’avance de la copie relance l’agent avec les fichiers en conflit, sans arrêt', async () => {
    const p = ports([], ['ACCEPTÉ'], ['packages/a/src/x.ts', 'packages/a/tests/x.spec.ts']);
    const r = await lancer(p);
    expect(r.arret).toBeUndefined();
    expect(p.lancees[0].conflits).toEqual(['packages/a/src/x.ts', 'packages/a/tests/x.spec.ts']);
    expect(p.journal).toContain('relecture');
    const rapport = rapportDuConflit(p.lancees[0].conflits ?? []);
    expect(rapport).toContain('packages/a/src/x.ts');
    expect(rapport).toContain('packages/a/tests/x.spec.ts');
  });

  it('l’agent du direct écrit tous les fichiers : la copie le lance sur un conflit de test ou de code', () => {
    const ecrit = ecritPar('direct', () => false);
    expect(ecrit?.('a/tests/x.spec.ts')).toBe(true);
    expect(ecrit?.('a/src/x.ts')).toBe(true);
  });

  it('ne joue ni plan, ni preuve du rouge, ni contrôles, ni file : seuls l’agent direct et le relecteur', async () => {
    const p = ports([]);
    await lancer(p);
    expect(p.lancees.map(l => l.role)).toEqual(['direct']);
    expect(p.journal.filter(j => !GESTES.test(j))).toEqual([]);
  });

  it('rend le verdict RENDU du relecteur et ses constats, sans relancer l’agent de lui-même', async () => {
    const p = ports([], ['RENDU']);
    const r = await lancer(p);
    expect(r.verdict).toBe('RENDU');
    expect((r.constats as { titre: string }[]).map(c => c.titre)).toEqual(['Un constat']);
    expect(p.lancees).toHaveLength(1);
  });

  it('relance l’agent avec les constats ouverts d’un lot rendu', async () => {
    const p = ports([fiche('lot-1', 'RENDU', [bloquant('Un défaut sans test')])]);
    await lancer(p);
    expect(p.lancees).toHaveLength(1);
    expect(p.lancees[0].role).toBe('direct');
    expect((p.lancees[0].constats as { titre: string }[]).map(c => c.titre)).toEqual([
      'Un défaut sans test',
    ]);
  });

  it('après trois RENDU, s’arrête sans lancer d’agent et remonte au superviseur', async () => {
    const rendus = [1, 2, 3].map(n => fiche(`lot-${n}`, 'RENDU', [bloquant(`c${n}`)]));
    const p = ports(rendus);
    p.ports.lot = () => 'lot-3';
    const r = await lancer(p);
    expect(r).toMatchObject({ arret: true });
    expect(p.lancees).toEqual([]);
    expect(p.journal).not.toContain('relecture');
  });

  it('un lot déjà accepté rend son verdict sans relancer ni relire', async () => {
    const p = ports([fiche('lot-1', 'ACCEPTÉ')]);
    const r = await lancer(p);
    expect(r.verdict).toBe('ACCEPTÉ');
    expect(p.lancees).toEqual([]);
    expect(p.journal).not.toContain('relecture');
  });
});

describe('la commande prend le ticket avant sa première séance', () => {
  it('le ticket est pris avant la séance de l’agent direct', async () => {
    const p = ports([]);
    await lancer(p);
    expect(p.journal.filter(j => j === 'prendre')).toHaveLength(1);
    expect(p.journal.indexOf('prendre')).toBeLessThan(p.journal.indexOf('seance:direct'));
  });

  it('relancée sur le ticket qu’elle a déjà pris, elle repart sans refus', async () => {
    const p = ports([fiche('lot-1', 'RENDU', [bloquant('c')])]);
    await lancer(p, { ticket: ticket(['direct'], 'in_progress') });
    expect(p.lancees).toHaveLength(1);
    expect(p.journal).toContain('prendre');
  });
});

describe('la commande exige la panne du moteur qui la justifie', () => {
  it.each([
    ['absente', undefined],
    ['vide', ''],
    ['faite de blancs', '  \n '],
  ])('une panne %s est refusée avant tout travail, l’option nommée', async (_nom, panne) => {
    const p = ports([]);
    await expect(lancer(p, { panne })).rejects.toThrow(/--panne/);
    expect(p.journal).toEqual([]);
    expect(p.commentaires).toEqual([]);
  });

  it('la ligne de commande lit la panne avec les autres options', () => {
    expect(lireLesOptions(['demo-9', '--panne', PANNE, '--paquet', 'packages/b'])).toMatchObject({
      id: 'demo-9',
      panne: PANNE,
      paquets: ['packages/b'],
    });
  });

  it('l’option sans son texte est une faute d’usage', () => {
    expect(lireLesOptions(['demo-9', '--panne'])).toBeNull();
  });

  it('le déverrouillage de la copie ne l’exige pas', () => {
    expect(lireLesOptions(['demo-9', '--deverrouiller'])).toMatchObject({
      id: 'demo-9',
      deverrouiller: true,
    });
  });
});

describe('la commande écrit au ticket l’usage de la voie de secours', () => {
  it('écrit la panne avant la séance, puis la relecture son verdict', async () => {
    const p = ports([]);
    await lancer(p);
    expect(ecritsDeLaPanne(p)).toHaveLength(1);
    expect(ecritsDeLaPanne(p)[0].text).toMatch(/voie de secours/i);
    expect(p.journal.indexOf('commenter')).toBeGreaterThanOrEqual(0);
    expect(p.journal.indexOf('commenter')).toBeLessThan(p.journal.indexOf('seance:direct'));
    expect(p.commentaires.at(-1)).toMatchObject({ author: 'relecteur' });
  });

  it.each([
    ['un lot déjà accepté', [fiche('lot-1', 'ACCEPTÉ')]],
    [
      'un troisième lot rendu',
      [1, 2, 3].map(n => fiche(`lot-${n === 3 ? 1 : n + 10}`, 'RENDU', [bloquant(`c${n}`)])),
    ],
  ])('écrit la panne même sans aucune séance : %s', async (_nom, fiches) => {
    const p = ports(fiches);
    await lancer(p);
    expect(p.lancees).toEqual([]);
    expect(ecritsDeLaPanne(p)).toHaveLength(1);
  });

  it('la même panne relancée sur le même ticket ne s’écrit qu’une fois', async () => {
    const p = ports([], ['RENDU', 'ACCEPTÉ']);
    await lancer(p);
    await lancer(p, { ticket: ticket(['direct'], 'in_progress') });
    expect(ecritsDeLaPanne(p)).toHaveLength(1);
  });

  it('une autre panne sur le même ticket s’écrit à son tour', async () => {
    const p = ports([], ['RENDU', 'ACCEPTÉ']);
    await lancer(p);
    await lancer(p, { panne: 'le déroulé du circuit meurt à l’ouverture' });
    expect(ecritsDeLaPanne(p)).toHaveLength(1);
    expect(ecritsDeLaPanne(p, 'le déroulé du circuit meurt à l’ouverture')).toHaveLength(1);
  });

  it('chaque relecture jouée écrit son verdict une fois, un verdict rendu de nouveau ne se réécrit pas', async () => {
    const p = ports([], ['ACCEPTÉ']);
    await lancer(p);
    p.ports.fiches = () => [fiche('lot-1', 'ACCEPTÉ')];
    await lancer(p, { ticket: ticket(['direct'], 'in_progress') });
    expect(p.commentaires.filter(c => c.text.includes('ACCEPTÉ'))).toHaveLength(1);
  });
});

// Un refus : rien n'est pris, écrit ni lancé.
async function refuse(
  p: ReturnType<typeof ports>,
  motif: RegExp,
  o: Parameters<typeof lancer>[1] = {}
) {
  await expect(lancer(p, o)).rejects.toThrow(motif);
  expect(p.journal).toEqual([]);
  expect(p.commentaires).toEqual([]);
}

describe('un refus de la commande laisse le ticket tel qu’il était', () => {
  it('un ticket qui n’est pas étiqueté direct', async () => {
    await refuse(ports([]), /direct/, { ticket: ticket(['circuit']) });
  });

  it('un ticket sans aucun paquet à son plan', async () => {
    await refuse(ports([]), /Sans composants/, {
      ticket: ticket(['direct'], 'open', 'Sans composants'),
    });
  });

  it('un ticket fermé est refusé par son nom, sans être rouvert', async () => {
    await refuse(ports([]), /demo-9[^]*fermé/, { ticket: ticket(['direct'], 'closed') });
  });

  it.each([
    ['en cours', { ticket: 'demo-9', statut: 'RUNNING' }],
    ['arrêté sur une question', { ticket: 'demo-9', statut: 'RUNNING', question: true }],
  ])('un ticket dont un circuit vit sur le serveur, %s', async (_nom, deroule) => {
    const p = ports([]);
    p.ports.circuits = () => circuitsLus([deroule]);
    await refuse(p, /demo-9/);
  });

  it('le refus d’un circuit vivant nomme les gestes qui le finissent', async () => {
    const p = ports([]);
    p.ports.circuits = () => circuitsLus([{ ticket: 'demo-9', statut: 'RUNNING', question: true }]);
    const message = await lancer(p).then(
      () => '',
      (e: Error) => e.message
    );
    expect(message).toContain('npx grillhouse circuit demo-9 --arreter');
    expect(message).toContain('temporal workflow terminate');
    expect(message).toContain(DEROULE);
  });
});

describe('la commande passe un ticket sans circuit vivant', () => {
  it.each([
    ['sans déroulé', []],
    ['au déroulé fini', [{ ticket: 'demo-9', statut: 'COMPLETED' }]],
    ['au déroulé terminé au serveur', [{ ticket: 'demo-9', statut: 'TERMINATED' }]],
    [
      'au déroulé terminé pendant sa question',
      [{ ticket: 'demo-9', statut: 'TERMINATED', question: true }],
    ],
    ['au déroulé en échec', [{ ticket: 'demo-9', statut: 'FAILED' }]],
    ['quand seul le circuit d’un autre ticket vit', [{ ticket: 'demo-90', statut: 'RUNNING' }]],
  ])('un ticket %s', async (_nom, deroules) => {
    const p = ports([]);
    p.ports.circuits = () => circuitsLus(deroules);
    await lancer(p);
    expect(p.lancees).toHaveLength(1);
    expect(p.commentaires.map(c => c.text).join('\n')).not.toMatch(/pas pu vérifier/);
  });
});

describe('quand le serveur des circuits ne se lit pas, la commande continue et le dit au ticket', () => {
  it.each([
    ['muet', new ServeurMuet('127.0.0.1:7233', new Error('UNAVAILABLE'))],
    ['au client non construit', new ClientNonConstruit()],
  ])('un serveur %s', async (_nom, faute) => {
    const p = ports([]);
    p.ports.circuits = () => Promise.reject(faute);
    await lancer(p);
    expect(p.lancees).toHaveLength(1);
    expect(ecritsDeLaPanne(p)).toHaveLength(1);
    expect(p.commentaires.map(c => c.text).join('\n')).toMatch(
      /pas pu vérifier qu['’]aucun circuit ne vit/i
    );
    expect(p.journal.indexOf('commenter')).toBeLessThan(p.journal.indexOf('seance:direct'));
  });
});

const GO = 1024 ** 3;
// La machine d'essai d'une séance lancée sous l'environnement `env` : le serveur de ses places à une
// adresse que rien n'écoute, ses parts dans un dossier à elle, hors de la CI et de toute enveloppe.
function surLaMachineDEssai(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { CI: _ci, GRILLHOUSE_ENVELOPPE: _enveloppe, ...reste } = env;
  return {
    ...reste,
    GRILLHOUSE_PARTS_DE_LA_MACHINE: mkdtempSync(path.join(ESSAIS, 'parts-')),
    GRILLHOUSE_PLACES_D_ESSAI: '127.0.0.1:1',
    GRILLHOUSE_MESURE_D_ESSAI: JSON.stringify({
      coeurs: 12,
      charge: 0,
      memoireLibre: 64 * GO,
      memoireTotale: 64 * GO,
    }),
  };
}

// L'environnement sous lequel la commande lance chacune de ses séances, par son rôle.
async function environnementsDesSeances() {
  const MARQUES = ['GRILLHOUSE_PLACE_TENUE', 'GRILLHOUSE_PART_TENUE'];
  const avant = MARQUES.map(m => [m, process.env[m]] as const);
  MARQUES.forEach(m => delete process.env[m]);
  const vus: Record<string, NodeJS.ProcessEnv> = {};
  const p = ports([]);
  const { seance, relecture } = p.ports;
  p.ports.seance = (...a: Parameters<typeof seance>) => {
    vus.direct = { ...process.env };
    return seance(...a);
  };
  p.ports.relecture = () => {
    vus.relecteur = { ...process.env };
    return relecture();
  };
  const places: string[] = [];
  try {
    await lancer({
      ...p,
      ports: { ...p.ports, place: () => (places.push('prise'), () => {}) } as typeof p.ports,
    });
  } finally {
    for (const [m, v] of avant) {
      if (v === undefined) {
        delete process.env[m];
      } else {
        process.env[m] = v;
      }
    }
  }
  return { vus, places };
}

describe('la voie de secours ne demande rien à l’arbitre', () => {
  it('la commande ne prend aucune place', async () => {
    const { places } = await environnementsDesSeances();
    expect(places).toEqual([]);
  });

  it.each(['direct', 'relecteur'])(
    'la séance du rôle %s ne demande aucune place au serveur',
    async role => {
      const { vus } = await environnementsDesSeances();
      const place = prendreUnePlace({
        env: surLaMachineDEssai(vus[role]!),
        ticket: 'demo-9',
        borneMs: 0,
        dire: () => {},
      });
      expect(place.id).toBeNull();
    }
  );

  it('la séance de l’agent direct prend sa part du poste sans lire la fermeture de la machine', async () => {
    const { vus } = await environnementsDesSeances();
    let lectures = 0;
    const prise = prendreUnePart({
      env: surLaMachineDEssai(vus.direct!),
      racine: mkdtempSync(path.join(ESSAIS, 'copie-')),
      ticket: 'demo-9',
      sorte: 'séance direct',
      bornee: false,
      borneMs: 0,
      libre: () => Infinity,
      dire: () => {},
      lireLaReservation: () => {
        lectures++;
        return null;
      },
    });
    prise.rendre();
    expect(prise.id).not.toBeNull();
    expect(lectures).toBe(0);
  });
});
