import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { creerLeTicket, PERIME_MS, principal, USAGE, VERROU } from '../../scripts/ticket.mjs';
import { lacherVerrou, prendreVerrou } from '../../scripts/verrou-de-fichier.mjs';

// The creation of a ticket by the frame's command (scripts/ticket.mjs) is played again without a
// second ticket: its key is the mother and the title. Beads is a stand-in that keeps its tickets
// in memory and answers as bd does.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ticket-creation-rejouable-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterEach(() => vi.useRealTimers());

type Ticket = {
  id: string;
  title: string;
  description?: string;
  status: string;
  labels: string[];
  parent: string;
};
type Demande = Parameters<typeof creerLeTicket>[0];
type Reponse = { status: number; stdout: string; stderr: string };

// A project whose tickets bear the prefix « demo ».
function projet(config: string | null = 'issue-prefix: "demo"\n') {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (config !== null) {
    mkdirSync(path.join(racine, '.beads'));
    writeFileSync(path.join(racine, '.beads/config.yaml'), config);
  }
  return racine;
}

// A Beads of trial holding <tickets>: its calls, and what it answers to each.
function magasin(tickets: Ticket[] = [], pannes: Record<string, string> = {}) {
  const appels: string[][] = [];
  const ok = (stdout = ''): Reponse => ({ status: 0, stdout, stderr: '' });
  const apres = (a: string[], option: string) => a[a.indexOf(option) + 1]!;
  const bd = (a: string[]): Promise<Reponse> => {
    appels.push(a);
    const panne = pannes[a[0]!];
    if (panne !== undefined) {
      return Promise.resolve({ status: 1, stdout: '', stderr: panne });
    }
    const t = tickets.find(x => x.id === a[1]);
    switch (a[0]) {
      case 'list':
        return Promise.resolve(
          ok(JSON.stringify(tickets.filter(x => x.parent === apres(a, '--parent'))))
        );
      case 'create': {
        const parent = apres(a, '--parent');
        const id = `${parent}.${tickets.filter(x => x.parent === parent).length + 1}`;
        const description = a.includes('-d')
          ? apres(a, '-d')
          : readFileSync(apres(a, '--body-file'), 'utf8');
        tickets.push({
          id,
          title: a[1]!,
          description,
          status: 'open',
          labels: [apres(a, '-l')],
          parent,
        });
        return Promise.resolve(ok(`${id}\n`));
      }
      case 'update':
        t!.title = apres(a, '--title');
        return Promise.resolve(ok());
      case 'close':
        t!.status = 'closed';
        return Promise.resolve(ok());
      default:
        return Promise.resolve({ status: 1, stdout: '', stderr: `unknown command ${a[0]}` });
    }
  };
  return { tickets, appels, bd, faits: () => appels.map(a => a[0]) };
}

const DEMANDE: Demande = {
  mere: 'demo-320',
  sujet: 'Publie la scène',
  composants: '020-loader, 050-emitter',
  corps: 'le corps',
};

// The creation of <demande> in <m>, and what it said.
async function creer(m: ReturnType<typeof magasin>, demande: Demande = DEMANDE) {
  const dits: string[] = [];
  const rendu = await creerLeTicket(demande, {
    racine: projet(),
    bd: m.bd,
    dire: (l: string) => dits.push(l),
  });
  return { rendu, dits };
}

describe('the first creation of a ticket', () => {
  it('reads the children of the mother, creates the ticket, then titles it by its number', async () => {
    const m = magasin();
    const { rendu, dits } = await creer(m);
    expect(rendu).toEqual({ id: 'demo-320.1', cree: true });
    expect(m.appels).toEqual([
      ['list', '--parent', 'demo-320', '--all', '--limit', '0', '--json'],
      [
        'create',
        'Publie la scène',
        '--parent',
        'demo-320',
        '--no-inherit-labels',
        '-t',
        'task',
        '-l',
        'a-valider',
        '-d',
        'le corps',
        '--silent',
      ],
      ['update', 'demo-320.1', '--title', '320.1 — Publie la scène — 020-loader, 050-emitter'],
    ]);
    expect(dits).toEqual([]);
  });

  it('reads a body « @file » from that file, and closes a discovery once created', async () => {
    const m = magasin();
    const corps = path.join(mkdtempSync(path.join(ESSAIS, 'corps-')), 'corps.md');
    writeFileSync(corps, 'le corps du fichier\n');
    await creer(m, { ...DEMANDE, corps: `@${corps}`, etiquette: 'decouverte' });
    const creation = m.appels.find(a => a[0] === 'create')!;
    expect(creation.slice(-3)).toEqual(['--body-file', corps, '--silent']);
    expect(creation).toContain('decouverte');
    expect(m.appels.at(-1)).toEqual(['close', 'demo-320.1', '-r', 'découverte consignée']);
  });

  it('an empty label is the default one, « a-valider »', async () => {
    const m = magasin();
    await creer(m, { ...DEMANDE, etiquette: '' });
    expect(m.tickets[0]!.labels).toEqual(['a-valider']);
  });
});

describe('a creation played again, same mother and same title', () => {
  it('creates no second ticket: it returns the existing one and says so', async () => {
    const m = magasin();
    await creer(m);
    m.appels.length = 0;
    const { rendu, dits } = await creer(m);
    expect(rendu).toEqual({ id: 'demo-320.1', cree: false });
    expect(m.faits()).toEqual(['list']);
    expect(m.tickets).toHaveLength(1);
    expect(dits.join('\n')).toMatch(/demo-320\.1 existe déjà sous demo-320/);
    expect(dits.join('\n')).toMatch(/aucun ticket créé/);
  });

  // A store that holds the ticket of DEMANDE, closed, under the label <label>.
  const ferme = (label: string) =>
    magasin([
      {
        id: 'demo-320.4',
        title: '320.4 — Publie la scène — 020-loader, 050-emitter',
        status: 'closed',
        labels: [label],
        parent: 'demo-320',
      },
    ]);

  it('a closed ticket of the same title is no obstacle: a defect that comes back gets a new ticket', async () => {
    const m = ferme('a-valider');
    const { rendu, dits } = await creer(m);
    expect(rendu).toEqual({ id: 'demo-320.2', cree: true });
    expect(m.faits()).toEqual(['list', 'create', 'update']);
    expect(m.tickets[0]!.status).toBe('closed');
    expect(dits).toEqual([]);
  });

  it('a discovery, created closed, is found closed: none created', async () => {
    const m = ferme('decouverte');
    const { rendu } = await creer(m, { ...DEMANDE, etiquette: 'decouverte' });
    expect(rendu).toEqual({ id: 'demo-320.4', cree: false });
    expect(m.faits()).toEqual(['list']);
  });

  // A store that holds a ticket under the bare subject of DEMANDE, its body <description>.
  const nu = (description: string) =>
    magasin([
      {
        id: 'demo-320.7',
        title: 'Publie la scène',
        description,
        status: 'open',
        labels: ['a-valider'],
        parent: 'demo-320',
      },
    ]);

  it('finishes a creation stopped before its title: the ticket of the bare subject and of the same body is titled, none created', async () => {
    const m = nu('le corps\n');
    const { rendu } = await creer(m);
    expect(rendu).toEqual({ id: 'demo-320.7', cree: false });
    expect(m.faits()).toEqual(['list', 'update']);
    expect(m.tickets[0]!.title).toBe('320.7 — Publie la scène — 020-loader, 050-emitter');
  });

  it('finishes it too when the body is a file: the text of the file is the one compared', async () => {
    const corps = path.join(mkdtempSync(path.join(ESSAIS, 'corps-')), 'corps.md');
    writeFileSync(corps, 'le corps du fichier\n');
    const m = nu('le corps du fichier');
    const { rendu } = await creer(m, { ...DEMANDE, corps: `@${corps}` });
    expect(rendu).toEqual({ id: 'demo-320.7', cree: false });
  });

  it('a ticket of the bare subject with another body is someone else’s: left as it is, a new one created', async () => {
    const m = nu('un autre corps');
    const { rendu } = await creer(m);
    expect(rendu).toEqual({ id: 'demo-320.2', cree: true });
    expect(m.tickets[0]!.title).toBe('Publie la scène');
  });

  it('finishes a discovery stopped before its closure, and closes no ticket that is not a discovery', async () => {
    const titre = '320.2 — Publie la scène — 020-loader, 050-emitter';
    const ouverte = (labels: string[]) =>
      magasin([{ id: 'demo-320.2', title: titre, status: 'open', labels, parent: 'demo-320' }]);
    const decouverte = ouverte(['decouverte']);
    await creer(decouverte, { ...DEMANDE, etiquette: 'decouverte' });
    expect(decouverte.faits()).toEqual(['list', 'close']);
    const autre = ouverte(['a-valider']);
    await creer(autre, { ...DEMANDE, etiquette: 'decouverte' });
    expect(autre.faits()).toEqual(['list']);
    expect(autre.tickets[0]!.status).toBe('open');
  });

  it('another title under the same mother, or the same title under another mother, is a new ticket', async () => {
    const m = magasin();
    await creer(m);
    const autreSujet = await creer(m, { ...DEMANDE, sujet: 'Publie la table' });
    const autresComposants = await creer(m, { ...DEMANDE, composants: '020-loader' });
    const autreMere = await creer(m, { ...DEMANDE, mere: 'demo-321' });
    expect(autreSujet.rendu).toEqual({ id: 'demo-320.2', cree: true });
    expect(autresComposants.rendu).toEqual({ id: 'demo-320.3', cree: true });
    expect(autreMere.rendu).toEqual({ id: 'demo-321.1', cree: true });
  });
});

describe('a creation Beads does not answer', () => {
  it('creates nothing when the children of the mother cannot be read, and names the reason', async () => {
    const m = magasin([], { list: 'Error: database is locked' });
    await expect(creer(m)).rejects.toThrow(/bd list.*database is locked/);
    expect(m.faits()).toEqual(['list']);
  });

  it.each(['', '{', 'null'])(
    'creates nothing when the reading answers « %s », no list',
    async stdout => {
      const m = magasin();
      const bd = (a: string[]) =>
        a[0] === 'list' ? Promise.resolve({ status: 0, stdout, stderr: '' }) : m.bd(a);
      await expect(
        creerLeTicket(DEMANDE, { racine: projet(), bd, dire: () => {} })
      ).rejects.toThrow(/bd list/);
      expect(m.faits()).toEqual([]);
    }
  );

  it('names the step that fails', async () => {
    const m = magasin([], { create: 'Error: parent issue demo-320 not found' });
    await expect(creer(m)).rejects.toThrow(/bd create.*parent issue demo-320 not found/);
  });

  it('reads the prefix of the project before any call of Beads', async () => {
    const m = magasin();
    await expect(
      creerLeTicket(DEMANDE, { racine: projet('# issue-prefix: ""\n'), bd: m.bd, dire: () => {} })
    ).rejects.toThrow(/n'a pas la clé `issue-prefix`/);
    expect(m.appels).toEqual([]);
  });
});

describe('a creation that lasts says what it waits for', () => {
  // A Beads whose reading answers when <repondre> is called.
  function lent() {
    const m = magasin();
    let repondre = () => {};
    const bd = (a: string[]) =>
      a[0] === 'list'
        ? new Promise<Reponse>(resolve => {
            repondre = () => resolve({ status: 0, stdout: '[]', stderr: '' });
          })
        : m.bd(a);
    return { m, bd, repondre: () => repondre() };
  }

  it('past its threshold, it names the call of Beads it waits for and for how long, then again at each step', async () => {
    vi.useFakeTimers();
    const { bd, repondre } = lent();
    const dits: string[] = [];
    const creation = creerLeTicket(DEMANDE, {
      racine: projet(),
      bd,
      dire: (l: string) => dits.push(l),
      seuilMs: 5_000,
      pasMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(dits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(dits).toHaveLength(1);
    expect(dits[0]).toMatch(/attend la réponse de bd \(list\) depuis 5 s/);
    expect(dits[0]).toMatch(/un processus à la fois/);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(dits).toHaveLength(2);
    expect(dits[1]).toMatch(/bd \(list\) depuis 15 s/);
    repondre();
    await expect(creation).resolves.toEqual({ id: 'demo-320.1', cree: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(dits).toHaveLength(2);
  });

  it('says nothing when Beads answers before the threshold', async () => {
    vi.useFakeTimers();
    const { bd, repondre } = lent();
    const dits: string[] = [];
    const creation = creerLeTicket(DEMANDE, {
      racine: projet(),
      bd,
      dire: (l: string) => dits.push(l),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    repondre();
    await creation;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(dits).toEqual([]);
  });
});

describe('two creations of the same ticket at once', () => {
  // A Beads that takes <ms> to answer each call.
  function lentDe(ms: number) {
    const m = magasin();
    const bd = async (a: string[]) => {
      await new Promise(resolve => setTimeout(resolve, ms));
      return m.bd(a);
    };
    return { m, bd };
  }

  it('the one launched while the first still runs waits for it, then returns its ticket: one ticket created', async () => {
    const { m, bd } = lentDe(30);
    const racine = projet();
    const dits: string[] = [];
    const options = { racine, bd, dire: (l: string) => dits.push(l) };
    const [premiere, seconde] = await Promise.all([
      creerLeTicket(DEMANDE, options),
      creerLeTicket(DEMANDE, options),
    ]);
    expect(premiere).toEqual({ id: 'demo-320.1', cree: true });
    expect(seconde).toEqual({ id: 'demo-320.1', cree: false });
    expect(m.tickets).toHaveLength(1);
    expect(m.faits()).toEqual(['list', 'create', 'update', 'list']);
    expect(existsSync(path.join(racine, VERROU))).toBe(false);
  });

  it('while another creation holds the lock, it calls no Beads and says what it waits for', async () => {
    vi.useFakeTimers();
    const m = magasin();
    const racine = projet();
    const verrou = path.join(racine, VERROU);
    expect(prendreVerrou(verrou, { attendre: false, perime: PERIME_MS })).toBe(true);
    const dits: string[] = [];
    const creation = creerLeTicket(DEMANDE, {
      racine,
      bd: m.bd,
      dire: (l: string) => dits.push(l),
    });
    await vi.advanceTimersByTimeAsync(5_200);
    expect(m.appels).toEqual([]);
    expect(dits).toHaveLength(1);
    expect(dits[0]).toMatch(/attend la fin d’une autre création de ticket du projet depuis 5 s/);
    lacherVerrou(verrou);
    await vi.advanceTimersByTimeAsync(200);
    await expect(creation).resolves.toEqual({ id: 'demo-320.1', cree: true });
  });

  it('the lock is the one of the main tree: a creation launched from a copy waits for the one of the main tree', async () => {
    const principal_ = projet();
    const git = (...a: string[]) => {
      const r = spawnSync('git', ['-C', principal_, ...a], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
    };
    git('init', '-q');
    git('add', '.beads/config.yaml');
    git('-c', 'user.name=essai', '-c', 'user.email=essai@exemple.test', 'commit', '-q', '-m', 'x');
    const copie = path.join(mkdtempSync(path.join(ESSAIS, 'copie-')), 'copie');
    git('worktree', 'add', '-q', copie);
    const verrou = path.join(principal_, VERROU);
    expect(prendreVerrou(verrou, { attendre: false, perime: PERIME_MS })).toBe(true);
    const m = magasin();
    const creation = creerLeTicket(DEMANDE, { racine: copie, bd: m.bd, dire: () => {} });
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(m.appels).toEqual([]);
    lacherVerrou(verrou);
    await expect(creation).resolves.toEqual({ id: 'demo-320.1', cree: true });
    expect(existsSync(path.join(copie, VERROU))).toBe(false);
  });

  // The lock of the project at <racine> as another session left it <age> ms ago, its process
  // number <pid>.
  function laisse(racine: string, pid: number, age: number) {
    const verrou = path.join(racine, VERROU);
    writeFileSync(verrou, `${pid}:une-autre-seance`);
    const date = new Date(Date.now() - age);
    utimesSync(verrou, date, date);
    return verrou;
  }

  it('a lock older than five minutes is abandoned, whatever process it names: the creation takes it over', async () => {
    const racine = projet();
    laisse(racine, process.pid, PERIME_MS + 60_000);
    const m = magasin();
    await expect(creerLeTicket(DEMANDE, { racine, bd: m.bd, dire: () => {} })).resolves.toEqual({
      id: 'demo-320.1',
      cree: true,
    });
    expect(existsSync(path.join(racine, VERROU))).toBe(false);
  });

  it('a recent lock is held, even by a process number that means nothing here', async () => {
    const racine = projet();
    const verrou = laisse(racine, 2 ** 22 + 1, 1_000);
    const m = magasin();
    const creation = creerLeTicket(DEMANDE, { racine, bd: m.bd, dire: () => {} });
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(m.appels).toEqual([]);
    rmSync(verrou);
    await expect(creation).resolves.toEqual({ id: 'demo-320.1', cree: true });
  });

  it('the lock is written again after each call of Beads: a creation Beads makes wait is not taken for an abandoned one', async () => {
    const racine = projet();
    const verrou = path.join(racine, VERROU);
    const m = magasin();
    const ages: number[] = [];
    const bd = (a: string[]) => {
      if (a[0] === 'list') {
        // The call of the reading lasted four minutes.
        const date = new Date(Date.now() - 4 * 60_000);
        utimesSync(verrou, date, date);
      } else {
        ages.push(Date.now() - statSync(verrou).mtimeMs);
      }
      return m.bd(a);
    };
    await creerLeTicket(DEMANDE, { racine, bd, dire: () => {} });
    expect(m.faits()).toEqual(['list', 'create', 'update']);
    expect(ages).toHaveLength(2);
    expect(Math.max(...ages)).toBeLessThan(60_000);
  });

  it.each(['SIGTERM', 'SIGINT'])(
    'cut by %s while it holds the lock, the command releases it, stops listening, and sends itself the signal again',
    async signal => {
      const racine = projet();
      const m = magasin();
      const signaux = new EventEmitter();
      const renvoyes: { signal: string; ecoutes: number }[] = [];
      let repondre = () => {};
      const bd = (a: string[]) =>
        a[0] === 'list'
          ? new Promise<Reponse>(resolve => {
              repondre = () => resolve({ status: 0, stdout: '[]', stderr: '' });
            })
          : m.bd(a);
      const creation = creerLeTicket(DEMANDE, {
        racine,
        bd,
        dire: () => {},
        signaux,
        renvoyer: (s: string) =>
          renvoyes.push({
            signal: s,
            ecoutes: signaux.listenerCount('SIGTERM') + signaux.listenerCount('SIGINT'),
          }),
      });
      await vi.waitFor(() => expect(existsSync(path.join(racine, VERROU))).toBe(true));
      signaux.emit(signal);
      expect(existsSync(path.join(racine, VERROU))).toBe(false);
      expect(renvoyes).toEqual([{ signal, ecoutes: 0 }]);
      repondre();
      await creation;
      expect(signaux.listenerCount(signal)).toBe(0);
    }
  );

  it('a creation that fails releases the lock', async () => {
    const racine = projet();
    const m = magasin([], { list: 'Error: database is locked' });
    await expect(creerLeTicket(DEMANDE, { racine, bd: m.bd, dire: () => {} })).rejects.toThrow(
      /bd list/
    );
    expect(existsSync(path.join(racine, VERROU))).toBe(false);
  });
});

describe('the command « grillhouse ticket »', () => {
  // The command played with <argv> against <m>: its exit code, its output and what it said.
  async function jouer(argv: string[], m = magasin(), racine = projet()) {
    const sortie: string[] = [];
    const dits: string[] = [];
    const code = await principal(argv, {
      racine,
      bd: m.bd,
      sortie: (l: string) => sortie.push(l),
      dire: (l: string) => dits.push(l),
    });
    return { code, sortie: sortie.join(''), dits: dits.join(''), m };
  }
  const ARGV = ['demo-320', 'Publie la scène', '020-loader, 050-emitter', 'le corps'];

  it('prints the id of the ticket alone on its output, created or found', async () => {
    const premier = await jouer(ARGV);
    expect(premier).toMatchObject({ code: 0, sortie: 'demo-320.1\n', dits: '' });
    const rejoue = await jouer(ARGV, premier.m);
    expect(rejoue.code).toBe(0);
    expect(rejoue.sortie).toBe('demo-320.1\n');
    expect(rejoue.dits).toMatch(/demo-320\.1 existe déjà/);
    expect(premier.m.tickets).toHaveLength(1);
  });

  it('with fewer than four arguments, gives its usage, exit code 2, and calls no Beads', async () => {
    const r = await jouer(ARGV.slice(0, 3));
    expect(r.code).toBe(2);
    expect(r.dits).toBe(USAGE);
    expect(r.sortie).toBe('');
    expect(r.m.appels).toEqual([]);
  });

  it('a failure of Beads is exit code 1, its reason said, nothing printed', async () => {
    const r = await jouer(ARGV, magasin([], { create: 'Error: parent issue demo-320 not found' }));
    expect(r.code).toBe(1);
    expect(r.dits).toMatch(/parent issue demo-320 not found/);
    expect(r.sortie).toBe('');
  });

  it('without the file of Beads, names it, exit code 1, no ticket created', async () => {
    const r = await jouer(ARGV, magasin(), projet(null));
    expect(r.code).toBe(1);
    expect(r.dits).toContain('.beads/config.yaml manque');
    expect(r.m.appels).toEqual([]);
  });
});
