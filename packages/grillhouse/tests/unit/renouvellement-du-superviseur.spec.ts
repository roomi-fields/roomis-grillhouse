// The renewal of the session of supervision at a milestone (greffon.md, §5.1 and §5.2,
// scripts/superviseur.mjs): the session that holds the lock writes its one note of resumption and
// declares a milestone (`declarerLeJalon`, `ajouterLaQuestion`: `grillhouse superviseur --jalon`
// and `--question`), the reading of the renewal gives the message of resumption when it is due
// (`renouvellement`), the opening gives the note (`ouvertureDuSuperviseur`), and the reading for
// the greffon asks for the note after a compaction and once each night. The circuits are injected;
// `bd` is a stub on the PATH; the clock is faked, with no real wait.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ajouterLaQuestion,
  declarerLeJalon,
  marquerChezLeResponsable,
  ouvertureDuSuperviseur,
  releverPourLeGreffon,
  renouvellement,
  seance,
} from '../../scripts/superviseur.mjs';
import { cleDe } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'renouvellement-du-superviseur-'));
const TICKETS = path.join(ESSAIS, 'tickets.json');
const PANNE = path.join(ESSAIS, 'bd-en-panne');
const MIN = 60_000;
// A local time of the day `jour` of November 2026.
const heure = (jour: number, h: number, m = 0) => new Date(2026, 10, jour, h, m).getTime();
const MIDI = heure(20, 12);

beforeAll(() => {
  // A `bd` that gives the tickets of TICKETS, and fails while PANNE exists.
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const bd = path.join(bin, 'bd');
  writeFileSync(
    bd,
    `#!/bin/sh\n[ ! -f '${PANNE}' ] || exit 1\ncat '${TICKETS}' 2>/dev/null || echo '[]'\n`
  );
  chmodSync(bd, 0o755);
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`);
});
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: MIDI }));
afterEach(() => {
  vi.useRealTimers();
  rmSync(TICKETS, { force: true });
  rmSync(PANNE, { force: true });
});
afterAll(() => vi.unstubAllEnvs());
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  }
};

// The process that holds the lock: the session this test runs in.
const MOI = seance();
// A live process that is not above this one: another session.
const AUTRE = process.pid;
// The process above `pid`.
const parentDe = (pid: number) => {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
};

// A repository, a copy of work of it, and the lock of the supervisor naming `tenant`.
const depot = (tenant: number | null = MOI, pkg: object = {}) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q');
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify(pkg));
  git(racine, 'add', 'package.json');
  git(racine, 'commit', '-q', '-m', 'init');
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  const copie = path.join(racine, '.claude', 'worktrees', 'copie');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/copie', copie);
  const verrou = path.join(racine, '.git', 'grillhouse-superviseur.lock');
  const tenir = (pid: number) => writeFileSync(verrou, `${pid}\n`);
  if (tenant !== null) {
    tenir(tenant);
  }
  const note = path.join(racine, '.git', 'grillhouse-reprise.md');
  return { racine, copie, tenir, note };
};
// A file to give to the command, holding `texte`.
const fichier = (texte: string) => {
  const f = path.join(mkdtempSync(path.join(ESSAIS, 'texte-')), 'texte.md');
  writeFileSync(f, texte);
  return f;
};
const NOTE = '# Reprise\n\nLe lot demo-7 est à relire.\n';
const declarer = async (racine: string, texte = NOTE) =>
  expect(await declarerLeJalon(racine, fichier(texte), { env: {} })).toMatchObject({ code: 0 });
// The reading of the renewal, a quiet Stop at `arretA` and the owner's last message at `messageA`.
const du = async (racine: string, arretA: number, messageA = 0, env: Record<string, string> = {}) =>
  await renouvellement(racine, { arretA, messageA, env });

describe('the session that holds the lock declares a milestone with its note of resumption', () => {
  it('replaces the whole note, in the common git directory, by the text of the file, and exits 0', async () => {
    const { racine, note } = depot();
    await declarer(racine, 'une première note, longue\n');
    expect(readFileSync(note, 'utf8')).toBe('une première note, longue\n');
    await declarer(racine, NOTE);
    expect(readFileSync(note, 'utf8')).toBe(NOTE);
  });

  it('declares the milestone: the renewal is due after a quiet Stop', async () => {
    const { racine } = depot();
    await declarer(racine);
    expect(await du(racine, MIDI + MIN)).not.toBe('');
  });

  it('adds a question to the end of the note, which it creates when there is none, with no milestone', async () => {
    const { racine, note } = depot();
    const premiere = await ajouterLaQuestion(racine, fichier('Au responsable : le langage ?\n'), {
      env: {},
    });
    expect(premiere).toMatchObject({ code: 0 });
    expect(readFileSync(note, 'utf8')).toContain('Au responsable : le langage ?');
    expect(await ajouterLaQuestion(racine, fichier('Et le moteur ?\n'), { env: {} })).toMatchObject(
      { code: 0 }
    );
    const texte = readFileSync(note, 'utf8');
    expect(texte.indexOf('le langage ?')).toBeGreaterThanOrEqual(0);
    expect(texte.indexOf('Et le moteur ?')).toBeGreaterThan(texte.indexOf('le langage ?'));
    expect(await du(racine, MIDI + MIN)).toBe('');
  });

  it('keeps the note and the milestone as they were when a question is added after it', async () => {
    const { racine, note } = depot();
    await declarer(racine);
    vi.setSystemTime(MIDI + 2 * MIN);
    await ajouterLaQuestion(racine, fichier('Une question hors jalon ?\n'), { env: {} });
    expect(readFileSync(note, 'utf8').startsWith(NOTE)).toBe(true);
    // The Stop between the declaration and the question still renews: no milestone was declared since.
    expect(await du(racine, MIDI + MIN)).not.toBe('');
  });

  const gestes = [
    ['--jalon', declarerLeJalon],
    ['--question', ajouterLaQuestion],
  ] as const;
  for (const [option, geste] of gestes) {
    const refus: [
      string,
      () => ReturnType<typeof depot> & { dossier: string; f: string; env: object },
    ][] = [
      [
        'a file that is absent',
        () => {
          const d = depot();
          return { ...d, dossier: d.racine, f: path.join(ESSAIS, 'absent.md'), env: {} };
        },
      ],
      [
        'a file that is empty',
        () => {
          const d = depot();
          return { ...d, dossier: d.racine, f: fichier(''), env: {} };
        },
      ],
      [
        'a repository whose lock nobody holds',
        () => {
          const d = depot(null);
          return { ...d, dossier: d.racine, f: fichier(NOTE), env: {} };
        },
      ],
      [
        'a session that does not hold the lock',
        () => {
          const d = depot(AUTRE);
          return { ...d, dossier: d.racine, f: fichier(NOTE), env: {} };
        },
      ],
      [
        'the session of a role',
        () => {
          const d = depot();
          return { ...d, dossier: d.racine, f: fichier(NOTE), env: { BEADS_ACTOR: 'developpeur' } };
        },
      ],
      [
        'the copy of a ticket',
        () => {
          const d = depot();
          return { ...d, dossier: d.copie, f: fichier(NOTE), env: {} };
        },
      ],
    ];
    it.each(refus)(
      `refuses ${option} from %s: code 2, its reason, nothing written`,
      async (_, monter) => {
        const { racine, note, dossier, f, env } = monter();
        for (const avant of [null, 'la note d’avant\n']) {
          if (avant !== null) {
            writeFileSync(note, avant);
          }
          const r = await geste(dossier, f, { env: env as Record<string, string> });
          expect(r.code).toBe(2);
          expect(r.raison).toBeTruthy();
          expect(existsSync(note) ? readFileSync(note, 'utf8') : null).toBe(avant);
        }
        expect(await du(racine, MIDI + MIN)).toBe('');
      }
    );
  }
});

describe('the renewal is due only at a declared milestone, once the session is quiet', () => {
  it('is never due without a milestone', async () => {
    const { racine } = depot();
    expect(await du(racine, MIDI + MIN)).toBe('');
  });

  it('waits for a quiet Stop later than the declaration', async () => {
    const { racine } = depot();
    await declarer(racine);
    expect(await du(racine, 0)).toBe('');
    expect(await du(racine, MIDI - MIN)).toBe('');
    expect(await du(racine, MIDI + MIN)).not.toBe('');
  });

  it('waits for a quiet Stop later than the last declaration, which replaces the one before', async () => {
    const { racine } = depot();
    await declarer(racine);
    vi.setSystemTime(MIDI + 10 * MIN);
    await declarer(racine, 'une note réécrite\n');
    expect(await du(racine, MIDI + 5 * MIN)).toBe('');
    expect(await du(racine, MIDI + 11 * MIN)).not.toBe('');
  });

  it('gives a message of resumption that leaves the note to the opening', async () => {
    const { racine } = depot();
    await declarer(racine);
    const message = await du(racine, MIDI + MIN);
    expect(message).not.toBe('');
    expect(message).not.toContain('Le lot demo-7 est à relire.');
  });

  it('stays due while the context stands, so that a refused /clear is tried again', async () => {
    const { racine } = depot();
    await declarer(racine);
    expect(await du(racine, MIDI + MIN)).not.toBe('');
    vi.setSystemTime(MIDI + 2 * MIN);
    expect(await du(racine, MIDI + MIN)).not.toBe('');
  });

  it('is cancelled by a message of the owner later than the declaration', async () => {
    const { racine } = depot();
    await declarer(racine);
    expect(await du(racine, MIDI + 3 * MIN, MIDI + MIN)).toBe('');
    // A later quiet Stop changes nothing: the milestone stays cancelled.
    expect(await du(racine, MIDI + 10 * MIN, MIDI + MIN)).toBe('');
  });

  it('is not cancelled by a message of the owner earlier than the declaration', async () => {
    const { racine } = depot();
    await declarer(racine);
    expect(await du(racine, MIDI + MIN, MIDI - MIN)).not.toBe('');
  });

  it('is due again for a milestone declared anew after a cancellation', async () => {
    const { racine } = depot();
    await declarer(racine);
    expect(await du(racine, MIDI + 2 * MIN, MIDI + MIN)).toBe('');
    vi.setSystemTime(MIDI + 5 * MIN);
    await declarer(racine);
    expect(await du(racine, MIDI + 6 * MIN, MIDI + MIN)).not.toBe('');
  });

  it('gives nothing to a session without the lock, to a role and from a copy', async () => {
    const { racine, copie, tenir } = depot();
    await declarer(racine);
    expect(await du(copie, MIDI + MIN)).toBe('');
    expect(await du(racine, MIDI + MIN, 0, { BEADS_ACTOR: 'relecteur' })).toBe('');
    tenir(AUTRE);
    expect(await du(racine, MIDI + MIN)).toBe('');
  });

  it('renews nothing once the lock passed to another process', async () => {
    // The session that declares holds the lock by a process higher up; another takes it.
    const premier = parentDe(process.ppid);
    expect(premier).toBeGreaterThan(1);
    const { racine, tenir } = depot(premier);
    await declarer(racine);
    tenir(process.ppid);
    expect(await du(racine, MIDI + MIN)).toBe('');
  });
});

const ouvrir = (
  racine: string,
  source: string,
  circuits: ReturnType<typeof circuitLu>[] = [],
  env: Record<string, string> = {}
) => ouvertureDuSuperviseur(racine, { source, env, circuitsDe: () => Promise.resolve(circuits) });
const question = (ticket: string, c: Record<string, unknown> = {}) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question: `Quel paquet lève le rouge de ${ticket} ?`,
    qui: 'superviseur',
    run: `run-${ticket}`,
    numero: 1,
    ...c,
  });

describe('a milestone holds for the context that declared it alone', () => {
  for (const [cas, source] of [
    ['a /clear typed by hand', 'clear'],
    ['a relaunch of the session', 'startup'],
  ] as const) {
    it(`renews nothing after ${cas}`, async () => {
      const { racine } = depot();
      await declarer(racine);
      if (source === 'startup') {
        // The session that declared is gone: the new one takes its lock.
        rmSync(path.join(racine, '.git', 'grillhouse-superviseur.lock'));
      }
      vi.setSystemTime(MIDI + MIN);
      await ouvrir(racine, source);
      expect(await du(racine, MIDI + 2 * MIN)).toBe('');
    });
  }

  it('renews once for one milestone, and again for the next', async () => {
    const { racine } = depot();
    await declarer(racine);
    expect(await du(racine, MIDI + MIN)).not.toBe('');
    // The /clear of the renewal opens the next context.
    vi.setSystemTime(MIDI + 2 * MIN);
    await ouvrir(racine, 'clear');
    expect(await du(racine, MIDI + 3 * MIN)).toBe('');
    vi.setSystemTime(MIDI + 4 * MIN);
    await declarer(racine);
    expect(await du(racine, MIDI + 5 * MIN)).not.toBe('');
  });
});

describe('the opening of the session of supervision gives the note of resumption', () => {
  it('gives the note at the launch to the session that takes the lock', async () => {
    const { racine, note } = depot(null);
    writeFileSync(note, NOTE);
    const texte = await ouvrir(racine, 'startup');
    expect(texte).toContain('Le lot demo-7 est à relire.');
    expect(texte).toContain('## Les questions des circuits');
  });

  it('opens without a note as before, when none was written', async () => {
    const { racine } = depot(null);
    expect(await ouvrir(racine, 'startup')).toContain('## Les questions des circuits');
  });

  it('after a /clear, gives the note, the circuits and their questions, and names the skill to load', async () => {
    const { racine } = depot();
    await declarer(racine);
    const texte = await ouvrir(racine, 'clear', [
      question('demo-3'),
      circuitLu('demo-1', { etape: 'controles', vivant: true }),
    ]);
    expect(texte).toContain('Le lot demo-7 est à relire.');
    expect(texte).toContain('Quel paquet lève le rouge de demo-3 ?');
    expect(texte).toContain('- demo-1 tourne, à 3.1 Contrôles.');
    expect(texte).toContain('grillhouse:pitmaster');
    expect(texte).toMatch(/note de reprise/i);
    expect(texte).toMatch(/premier tour/i);
    // A sentence that speaks of a whole round of supervision says not to run one.
    for (const phrase of texte.split(/[.\n]/).filter(p => /tour complet/i.test(p))) {
      expect(phrase).toMatch(/aucun|sans|pas de|ne /i);
    }
  });

  it('after a /clear, asks to put the question to the owner again at the first turn, whatever opens it', async () => {
    const { racine } = depot();
    await declarer(racine);
    await ajouterLaQuestion(racine, fichier('Au responsable : quel langage ?\n'), { env: {} });
    const texte = await ouvrir(racine, 'clear');
    expect(texte).toContain('Au responsable : quel langage ?');
    expect(texte).toMatch(
      /(repose|repos|redemande|reprends)[^\n]*responsable|responsable[^\n]*(repose|repos|redemande)/i
    );
    expect(texte).toMatch(/premier tour/i);
  });

  it('after a /clear, gives the note to the holder of the lock without any milestone', async () => {
    const { racine, note } = depot();
    writeFileSync(note, NOTE);
    expect(await ouvrir(racine, 'clear')).toContain('Le lot demo-7 est à relire.');
  });

  it('after a /clear, marks read the questions it lists', async () => {
    const { racine } = depot();
    const circuits = [question('demo-3')];
    expect(await ouvrir(racine, 'clear', circuits)).toContain('demo-3');
    const relu = await releverPourLeGreffon(racine, {
      env: {},
      circuitsDe: () => Promise.resolve(circuits),
    });
    expect(relu).toBe('');
    const suivi = JSON.parse(
      readFileSync(path.join(racine, '.claude/worktrees/questions-remontees.json'), 'utf8')
    ) as { remontees: { lue?: number }[] };
    expect(suivi.remontees.map(r => r.lue)).toEqual([MIDI]);
  });

  it('after a compaction, gives the holder of the lock neither the questions nor the note', async () => {
    const { racine, note } = depot();
    writeFileSync(note, NOTE);
    expect(await ouvrir(racine, 'compact', [question('demo-3')])).toBe('');
  });

  it.each(['startup', 'clear', 'compact'])(
    'never gives the note to a session that does not hold the lock (%s)',
    async source => {
      const { racine, note } = depot(AUTRE);
      writeFileSync(note, NOTE);
      const texte = await ouvrir(racine, source);
      expect(texte).toContain('Un autre superviseur tient ce dépôt');
      expect(texte).not.toContain('Le lot demo-7 est à relire.');
    }
  );

  it('gives nothing to the session of a role, nor in a copy', async () => {
    const { racine, copie, note } = depot(null);
    writeFileSync(note, NOTE);
    expect(await ouvrir(racine, 'clear', [], { BEADS_ACTOR: 'relecteur' })).toBe('');
    expect(await ouvrir(copie, 'clear')).toBe('');
  });
});

// The request the reading submits: it names the command that declares a milestone.
const DEMANDE = /superviseur --jalon/;
const relever = (
  racine: string,
  o: {
    circuits?: ReturnType<typeof circuitLu>[];
    compaction?: boolean;
    env?: Record<string, string>;
  } = {}
) =>
  releverPourLeGreffon(racine, {
    env: o.env ?? {},
    circuitsDe: () => Promise.resolve(o.circuits ?? []),
    compaction: o.compaction,
  });

describe('after a compaction the reading asks the session to write its note and declare a milestone', () => {
  it('asks for the note and the milestone, by the command, and by day only after a compaction', async () => {
    const { racine } = depot();
    expect(await relever(racine)).toBe('');
    const texte = await relever(racine, { compaction: true });
    expect(texte).toMatch(DEMANDE);
    expect(texte).toMatch(/note/i);
  });

  it('asks it beside the questions that wait', async () => {
    const { racine } = depot();
    const texte = await relever(racine, { compaction: true, circuits: [question('demo-3')] });
    expect(texte).toContain('demo-3');
    expect(texte).toMatch(DEMANDE);
  });

  it('asks it even when the circuits do not read', async () => {
    const { racine } = depot();
    const texte = await releverPourLeGreffon(racine, {
      env: {},
      compaction: true,
      circuitsDe: () => Promise.reject(new Error('serveur muet')),
    });
    expect(texte).toMatch(DEMANDE);
  });

  it('asks it of the holder of the lock alone, not of another session, a role or a copy', async () => {
    const { racine, copie } = depot();
    expect(await relever(racine, { compaction: true })).toMatch(DEMANDE);
    expect(await relever(copie, { compaction: true })).toBe('');
    expect(await relever(racine, { compaction: true, env: { BEADS_ACTOR: 'testwriter' } })).toBe(
      ''
    );
    expect(await relever(depot(AUTRE).racine, { compaction: true })).toBe('');
    expect(await relever(depot(null).racine, { compaction: true })).toBe('');
  });
});

describe('once the night has started the reading asks once for the note and the milestone', () => {
  const a = (t: number) => vi.setSystemTime(t);

  it('asks from 23 h to 8 h without a setting, once for the night, and again the next night', async () => {
    const { racine } = depot();
    a(heure(20, 22, 59));
    expect(await relever(racine)).toBe('');
    a(heure(20, 23));
    expect(await relever(racine)).toMatch(DEMANDE);
    for (const t of [heure(20, 23, 1), heure(21, 2), heure(21, 7, 59)]) {
      a(t);
      expect(await relever(racine)).toBe('');
    }
    a(heure(21, 23, 5));
    expect(await relever(racine)).toMatch(DEMANDE);
  });

  it('asks a night already started at its first reading, and nothing once it has ended', async () => {
    const { racine } = depot();
    for (const t of [heure(20, 8), heure(20, 15)]) {
      a(t);
      expect(await relever(racine)).toBe('');
    }
    a(heure(21, 3));
    expect(await relever(racine)).toMatch(DEMANDE);
  });

  it('takes the start and the end of the key grillhouse.plageDeNuit', async () => {
    const { racine } = depot(MOI, { grillhouse: { plageDeNuit: { debut: 1, fin: 5 } } });
    for (const t of [heure(20, 23, 30), heure(21, 0, 59), heure(21, 5)]) {
      a(t);
      expect(await relever(racine)).toBe('');
    }
    a(heure(22, 1));
    expect(await relever(racine)).toMatch(DEMANDE);
  });

  it('does not ask again in the same night after a renewal or a relaunch', async () => {
    const { racine } = depot();
    a(heure(20, 23, 10));
    expect(await relever(racine)).toMatch(DEMANDE);
    await ouvrir(racine, 'clear');
    a(heure(20, 23, 20));
    expect(await relever(racine)).toBe('');
    rmSync(path.join(racine, '.git', 'grillhouse-superviseur.lock'));
    await ouvrir(racine, 'startup');
    a(heure(21, 1));
    expect(await relever(racine)).toBe('');
  });

  it('asks nothing while a question of a circuit waits for the supervisor, even read and not due', async () => {
    const { racine } = depot();
    const circuits = [question('demo-3')];
    a(heure(20, 23, 10));
    const premier = await relever(racine, { circuits });
    expect(premier).toContain('demo-3');
    expect(premier).not.toMatch(DEMANDE);
    a(heure(20, 23, 11));
    expect(await relever(racine, { circuits })).toBe('');
    a(heure(20, 23, 40));
    expect(await relever(racine)).toMatch(DEMANDE);
  });

  it('is not held by a question addressed to the owner', async () => {
    const { racine } = depot();
    a(heure(20, 23, 10));
    expect(
      await relever(racine, { circuits: [question('demo-3', { qui: 'responsable' })] })
    ).toMatch(DEMANDE);
  });

  it('is not held by a question carried to the owner', async () => {
    const { racine } = depot();
    const circuits = [question('demo-3')];
    a(heure(20, 15));
    expect(await relever(racine, { circuits })).toContain('demo-3');
    marquerChezLeResponsable(racine, { cle: cleDe(circuits[0]!), depuisA: heure(20, 16) });
    a(heure(20, 23, 10));
    expect(await relever(racine, { circuits })).toMatch(DEMANDE);
  });

  it('is not held by a question deferred to a later time', async () => {
    const { racine } = depot();
    writeFileSync(
      TICKETS,
      JSON.stringify([{ id: 'demo-3', status: 'open', defer_until: '2027-06-01T00:00:00Z' }])
    );
    a(heure(20, 23, 10));
    expect(await relever(racine, { circuits: [question('demo-3')] })).toMatch(DEMANDE);
  });

  it('puts the request off to the next period when the circuits do not read', async () => {
    const { racine } = depot();
    a(heure(20, 23, 10));
    const muet = await releverPourLeGreffon(racine, {
      env: {},
      circuitsDe: () => Promise.reject(new Error('serveur muet')),
    });
    expect(muet).toBe('');
    a(heure(20, 23, 11));
    expect(await relever(racine)).toMatch(DEMANDE);
  });

  it('puts the request off to the next period when the tickets do not read', async () => {
    const { racine } = depot();
    const circuits = [question('demo-3')];
    writeFileSync(PANNE, '');
    a(heure(20, 23, 10));
    expect(await relever(racine, { circuits })).toBe('');
    rmSync(PANNE);
    writeFileSync(TICKETS, JSON.stringify([{ id: 'demo-3', status: 'closed' }]));
    a(heure(20, 23, 11));
    expect(await relever(racine, { circuits })).toMatch(DEMANDE);
  });

  it('asks nothing of a session without the lock, of a role, or in a copy', async () => {
    const { racine, copie } = depot();
    a(heure(20, 23, 10));
    expect(await relever(copie)).toBe('');
    expect(await relever(racine, { env: { BEADS_ACTOR: 'testwriter' } })).toBe('');
    expect(await relever(depot(AUTRE).racine)).toBe('');
    // None of them counted for the night: the holder is still asked.
    expect(await relever(racine)).toMatch(DEMANDE);
  });
});
