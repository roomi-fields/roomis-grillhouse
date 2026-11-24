// La commande du direct (`npx grillhouse direct <ticket>`, scripts/direct.mjs) : un agent lancé dans
// une copie à lui, puis la relecture de son lot, et rien d'autre ; les paquets du direct, le choix
// entre démarrage et relance, la consigne du relecteur, le verrou de la copie.
import { describe, expect, it } from 'vitest';
import * as travail from '../../scripts/enveloppe/travail-de-la-copie.mjs';
import { consigne } from '../../scripts/seances.mjs';

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
  lancerLeDirect: (o: { id: string; ticket: object; ports: object }) => Promise<{
    verdict?: string;
    copie?: string;
    constats?: { titre: string }[];
    arret?: boolean;
  }>;
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

// Les ports de la commande, essayés : ce qu'elle lance, dans l'ordre.
function ports(
  fiches: object[],
  verdicts: ('ACCEPTÉ' | 'RENDU')[] = ['ACCEPTÉ'],
  enConflit: string[] = []
) {
  const journal: string[] = [];
  const lancees: { role: string; constats: unknown[]; conflits?: string[] }[] = [];
  const places: string[] = [];
  return {
    journal,
    lancees,
    places,
    ports: {
      // La place de circuit de la machine : prise au départ, rendue par la fonction rendue.
      place: () => {
        places.push('prise');
        return () => {
          places.push('rendue');
        };
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
      relecture: () => {
        journal.push('relecture');
        const verdict = verdicts.shift() ?? 'ACCEPTÉ';
        return {
          verdict,
          constats: verdict === 'RENDU' ? [bloquant('Un constat')] : [],
        };
      },
    },
  };
}
const ticket = (labels: string[]) => ({
  id: 'demo-9',
  title: '9 — Le sujet — packages/a',
  labels,
});

describe('la commande lance l’agent, puis le relecteur, et s’arrête', () => {
  it('sur un ticket direct, joue la copie verrouillée, l’agent direct, la relecture, dans cet ordre', async () => {
    const p = ports([]);
    const r = await lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: p.ports });
    expect(p.journal).toEqual(['copie', 'verrouiller', 'seance:direct', 'relecture']);
    expect(r).toMatchObject({
      verdict: 'ACCEPTÉ',
      copie: '/depot/.claude/worktrees/demo-9',
    });
  });

  it('un direct prend une place de circuit de la machine avant l’agent et la rend après la relecture', async () => {
    const p = ports([]);
    const journal: string[] = [];
    const place = p.ports.place;
    p.ports.place = () => {
      journal.push('place:prise');
      const rendre = place();
      return () => {
        journal.push('place:rendue');
        rendre();
      };
    };
    const seance = p.ports.seance;
    p.ports.seance = (...a: Parameters<typeof seance>) => {
      journal.push('seance');
      return seance(...a);
    };
    const relecture = p.ports.relecture;
    p.ports.relecture = () => {
      journal.push('relecture');
      return relecture();
    };
    await lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: p.ports });
    expect(journal).toEqual(['place:prise', 'seance', 'relecture', 'place:rendue']);
    expect(p.places).toEqual(['prise', 'rendue']);
  });

  it('un direct rend sa place quand l’agent s’arrête, ou que la séance échoue', async () => {
    const arret = ports([]);
    arret.ports.seance = () => ({ statut: 'BLOQUÉ' }) as never;
    await lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: arret.ports });
    expect(arret.places).toEqual(['prise', 'rendue']);

    const echec = ports([]);
    echec.ports.seance = () => {
      throw new Error('séance tombée');
    };
    await expect(
      lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: echec.ports })
    ).rejects.toThrow(/séance tombée/);
    expect(echec.places).toEqual(['prise', 'rendue']);
  });

  it('un conflit d’avance de la copie relance l’agent avec les fichiers en conflit, sans arrêt', async () => {
    const p = ports([], ['ACCEPTÉ'], ['packages/a/src/x.ts', 'packages/a/tests/x.spec.ts']);
    const r = await lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: p.ports });
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

  it('un ticket qui n’est pas direct ne prend aucune place', async () => {
    const p = ports([]);
    await expect(
      lancerLeDirect({ id: 'demo-9', ticket: ticket(['circuit']), ports: p.ports })
    ).rejects.toThrow();
    expect(p.places).toEqual([]);
  });

  it('ne joue ni plan, ni preuve du rouge, ni contrôles, ni file : seuls l’agent direct et le relecteur', async () => {
    const p = ports([]);
    await lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: p.ports });
    expect(p.lancees.map(l => l.role)).toEqual(['direct']);
    expect(p.journal.filter(j => !/^(copie|verrouiller|seance:direct|relecture)$/.test(j))).toEqual(
      []
    );
  });

  it('rend le verdict RENDU du relecteur et ses constats, sans relancer l’agent de lui-même', async () => {
    const p = ports([], ['RENDU']);
    const r = await lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: p.ports });
    expect(r.verdict).toBe('RENDU');
    expect((r.constats as { titre: string }[]).map(c => c.titre)).toEqual(['Un constat']);
    expect(p.lancees).toHaveLength(1);
  });

  it('refuse un ticket qui n’est pas étiqueté direct, sans rien lancer', async () => {
    const p = ports([]);
    await expect(
      lancerLeDirect({ id: 'demo-9', ticket: ticket(['circuit']), ports: p.ports })
    ).rejects.toThrow(/direct/);
    expect(p.journal).toEqual([]);
  });

  it('relance l’agent avec les constats ouverts d’un lot rendu', async () => {
    const p = ports([fiche('lot-1', 'RENDU', [bloquant('Un défaut sans test')])]);
    await lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: p.ports });
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
    const r = await lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: p.ports });
    expect(r).toMatchObject({ arret: true });
    expect(p.lancees).toEqual([]);
    expect(p.journal).not.toContain('relecture');
  });

  it('un lot déjà accepté rend son verdict sans relancer ni relire', async () => {
    const p = ports([fiche('lot-1', 'ACCEPTÉ')]);
    const r = await lancerLeDirect({ id: 'demo-9', ticket: ticket(['direct']), ports: p.ports });
    expect(r.verdict).toBe('ACCEPTÉ');
    expect(p.lancees).toEqual([]);
    expect(p.journal).not.toContain('relecture');
  });
});
