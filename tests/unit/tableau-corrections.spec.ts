// The small corrections of the board (grillhouse-3uv.44). A measure of time never goes back: a
// turn runs from its first to its last event by their dates, whatever their order in the file,
// and an event dated before the one above it never takes time away. The time of a transcript is
// the union of its turns, ordered by date; its start, end and last incoming message are read by
// date too. Only the three origins open a
// turn, and the interruption mark is the whole text of a message. The board reads a long
// transcript where it stopped, its reading kept in its cache. The catch-up of the register holds
// a silent sub-agent whose last call awaits its answer as running, as the board does
// (grillhouse-3uv.49, critère 13). Each open night ticket raises its own red alert, its subject
// followed by its number.
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { aRattraper, ligne } from '../../scripts/registre.mjs';
import { assembler, lignes, lireTranscription, lireVivant } from '../../scripts/tableau.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-corrections-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = '/depot';
const SEC = 1000;
const MIN = 60 * SEC;
const l = (o: object) => JSON.stringify(o);
const at = (hms: string) => `2026-10-07T${hms.length === 5 ? `${hms}:00` : hms}Z`;
const ms = (hms: string) => Date.parse(at(hms));

// The lines of a transcript.
let n = 0;
const humain = (t: string, texte = 'Reprends le lot.') =>
  l({ type: 'user', timestamp: at(t), origin: { kind: 'human' }, message: { content: texte } });
const invite = (t: string, ticket = 'demo-5') =>
  l({ type: 'user', timestamp: at(t), message: { content: `TON TICKET : ${ticket} — le lot` } });
const reponse = (t: string, jetons = 10, id = `m${++n}`) =>
  l({
    type: 'assistant',
    timestamp: at(t),
    message: { id, usage: { input_tokens: jetons, output_tokens: 0 } },
  });
const piece = (t: string) =>
  l({ type: 'attachment', timestamp: at(t), attachment: { type: 'file', filename: 'lot.patch' } });
const systeme = (t: string) => l({ type: 'system', timestamp: at(t), content: 'fin' });
const origine = (t: string, origin: object) =>
  l({
    type: 'user',
    timestamp: at(t),
    origin,
    message: { content: 'Un message venu d’ailleurs.' },
  });
const texteEnListe = (t: string, ...textes: string[]) =>
  l({
    type: 'user',
    timestamp: at(t),
    message: { content: textes.map(text => ({ type: 'text', text })) },
  });
const transcription = (...lignesDuFichier: string[]) => lignesDuFichier.join('\n');
const lire = (...lignesDuFichier: string[]) =>
  lireTranscription(transcription(...lignesDuFichier)) as {
    travail: number;
    tours: [number, number][];
    jetons: number;
    premier: number | null;
    dernier: number | null;
    entre: number | null;
  };
const MARQUE = '[Request interrupted by user]';

describe('3uv.44 critère 1 : no turn lasts less than nothing; an event dated before the one above it never takes time away', () => {
  it('3uv.44 critère 1 : the witness — an attachment dated before the incoming message above it leaves no negative turn, and no time taken away', () => {
    const avant = [humain('14:30'), reponse('14:35'), humain('14:41:29')];
    const apres = [humain('14:50'), reponse('14:55')];
    const avec = lire(...avant, piece('14:36:16'), ...apres);
    const sans = lire(...avant, ...apres);
    expect(avec.tours.filter(([debut, fin]) => fin < debut)).toEqual([]);
    expect(avec.travail).toBeGreaterThanOrEqual(sans.travail);
  });

  it('3uv.44 critère 1 : the register line of a last turn whose every event is dated before its message holds no negative turn, nor less time', () => {
    const SESSION = {
      hook_event_name: 'SessionEnd',
      transcript_path: '/t.jsonl',
      session_id: 's1',
    };
    const debut = [invite('09:00'), reponse('09:40'), humain('10:00')];
    const avec = ligne(
      SESSION,
      lireTranscription(transcription(...debut, reponse('09:59'), piece('09:58'))),
      RACINE
    ) as { travail: number; tours: [number, number][] };
    const sans = ligne(SESSION, lireTranscription(transcription(...debut)), RACINE) as {
      travail: number;
    };
    expect(avec.tours.filter(([d, f]) => f < d)).toEqual([]);
    expect(avec.travail).toBeGreaterThanOrEqual(sans.travail);
  });
});

describe('3uv.44 critère 2 : a turn runs from its first to its last event by their dates, whatever their order in the file', () => {
  it('3uv.44 critère 2 : an attachment written after a later answer leaves the turn ending at that answer', () => {
    const lu = lire(
      humain('10:00'),
      reponse('10:10'),
      piece('10:05'),
      humain('11:00'),
      reponse('11:05')
    );
    expect(lu.tours).toEqual([
      [ms('10:00'), ms('10:10')],
      [ms('11:00'), ms('11:05')],
    ]);
    expect(lu.travail).toBe(15 * MIN);
  });

  it('3uv.44 critère 2 : a transcript of one turn whose last line is not its latest event runs to its latest event', () => {
    const lu = lire(systeme('09:00'), reponse('09:20'), reponse('09:10'));
    expect(lu.tours).toEqual([[ms('09:00'), ms('09:20')]]);
    expect(lu.travail).toBe(20 * MIN);
  });
});

describe('3uv.44 critère 8 : the time of a transcript is the union of its turns, ordered by date: no instant counts twice', () => {
  it('3uv.44 critère 8 : an incoming message dated before the end of the turn above opens a turn that overlaps it; the overlap counts once', () => {
    const lu = lire(humain('10:00'), reponse('10:20'), humain('10:10'), reponse('10:30'));
    expect(lu.tours).toEqual([
      [ms('10:00'), ms('10:20')],
      [ms('10:10'), ms('10:30')],
    ]);
    expect(lu.travail).toBe(30 * MIN);
  });

  it('3uv.44 critère 8 : a turn held whole inside the turn above adds no time', () => {
    const lu = lire(humain('10:00'), reponse('10:30'), humain('10:05'), reponse('10:10'));
    expect(lu.tours).toEqual([
      [ms('10:00'), ms('10:30')],
      [ms('10:05'), ms('10:10')],
    ]);
    expect(lu.travail).toBe(30 * MIN);
  });

  it('3uv.44 critère 8 : a turn dated wholly before the turn above, apart from it, counts whole', () => {
    const lu = lire(humain('11:00'), reponse('11:10'), humain('10:00'), reponse('10:05'));
    expect(lu.tours).toEqual([
      [ms('11:00'), ms('11:10')],
      [ms('10:00'), ms('10:05')],
    ]);
    expect(lu.travail).toBe(15 * MIN);
  });

  it('3uv.44 critère 8 : the turns are joined ordered by date — a third turn overlapping the first, not the second, counts once', () => {
    const lu = lire(
      humain('10:00'),
      reponse('10:30'),
      humain('11:00'),
      reponse('11:10'),
      humain('10:20'),
      reponse('10:40')
    );
    expect(lu.tours).toEqual([
      [ms('10:00'), ms('10:30')],
      [ms('11:00'), ms('11:10')],
      [ms('10:20'), ms('10:40')],
    ]);
    expect(lu.travail).toBe(50 * MIN);
  });

  it("3uv.44 critère 8 : the board's time of the day joins the turns too, from midnight", () => {
    const SESSION = {
      hook_event_name: 'SessionEnd',
      transcript_path: '/t.jsonl',
      session_id: 's8',
    };
    const r = ligne(
      SESSION,
      lireTranscription(
        transcription(
          invite('10:00', 'demo-5'),
          reponse('10:20'),
          humain('10:10'),
          reponse('10:30')
        )
      ),
      RACINE
    ) as { tours: [number, number][] };
    const t = assembler({
      tous: [{ id: 'demo-5', title: '5 — Le lot — tableau', status: 'in_progress', priority: 1 }],
      prefix: 'demo',
      registre: [r],
      vivants: [],
      maintenant: ms('12:00'),
      jour: ms('10:15'),
    }) as { global: { jour: { travail: number } } };
    expect(t.global.jour.travail).toBe(15 * MIN);
  });
});

describe('3uv.44 critère 9 : the start, the end and the last incoming message of a transcript are read by date', () => {
  it('3uv.44 critère 9 : the start is the oldest date, the end the latest, whatever the order of the lines', () => {
    const lu = lire(humain('10:00'), piece('09:55'), reponse('10:30'), piece('10:20'));
    expect(lu.premier).toBe(ms('09:55'));
    expect(lu.dernier).toBe(ms('10:30'));
  });

  it('3uv.44 critère 9 : the last incoming message is the latest incoming one by date, not the last in the file', () => {
    const lu = lire(
      humain('10:00'),
      reponse('10:05'),
      humain('11:00'),
      reponse('11:05'),
      origine('10:50', { kind: 'task-notification' }),
      reponse('11:06')
    );
    expect(lu.entre).toBe(ms('11:00'));
  });

  it('3uv.44 critère 9 : the register line starts at the oldest date and ends at the latest', () => {
    const SESSION = {
      hook_event_name: 'SessionEnd',
      transcript_path: '/t.jsonl',
      session_id: 's9',
    };
    const r = ligne(
      SESSION,
      lireTranscription(
        transcription(invite('10:00'), piece('09:55'), reponse('10:30'), piece('10:20'))
      ),
      RACINE
    ) as { debut: string; fin: string };
    expect(r.debut).toBe(at('09:55:00.000'));
    expect(r.fin).toBe(at('10:30:00.000'));
  });

  it('3uv.44 critère 9 : a reading resumed on lines dated earlier keeps the oldest start and the latest incoming message', () => {
    const home = nouveauHome();
    const f = session(
      home,
      's1',
      `${transcription(invite('10:00'), humain('10:30'), reponse('10:35'))}\n`
    );
    let cache: Record<string, unknown> = {};
    vivants(home, cache);
    cache = parFichier(cache);
    appendFileSync(f, `${transcription(piece('09:50'), humain('10:20'), reponse('10:36'))}\n`);
    const v = vivants(home, cache).find(x => x.agent === 's1');
    expect(v?.depuis).toBe(ms('09:50'));
    expect(v?.entre).toBe(ms('10:30'));
  });

  it('3uv.44 critère 9 : an agent whose last line is dated before its latest answer stays finished after its end is written', () => {
    const SESSION = {
      hook_event_name: 'SessionEnd',
      transcript_path: '/t.jsonl',
      session_id: 's9',
    };
    const texte = transcription(
      invite('10:00', 'demo-5'),
      reponse('10:10'),
      humain('10:25'),
      reponse('10:30'),
      piece('10:20')
    );
    const r = ligne(SESSION, lireTranscription(texte), RACINE) as { fin: string };
    const lu = lireTranscription(texte) as {
      entre: number | null;
      jetons: number;
      travail: number;
      tours: [number, number][];
    };
    const t = assembler({
      tous: [{ id: 'demo-5', title: '5 — Le lot — tableau', status: 'in_progress', priority: 1 }],
      prefix: 'demo',
      registre: [r],
      vivants: [
        {
          agent: 's9',
          ticket: 'demo-5',
          role: 'testeur',
          ligne: false,
          depuis: ms('10:00'),
          entre: lu.entre,
          jetons: lu.jetons,
          travail: lu.travail,
          tours: lu.tours,
        },
      ],
      maintenant: ms('10:31'),
      jour: ms('00:00'),
    }) as { agents: { enCours: { id: string }[] }[] };
    expect(t.agents.flatMap(b => b.enCours.map(x => x.id))).toEqual([]);
    expect(r.fin).toBe(at('10:30:00.000'));
  });
});

describe('3uv.44 critère 3 : an origin out of the three opens no turn', () => {
  it('3uv.44 critère 3 : a message of an unknown origin after a turn opens none: the turn runs to its next event', () => {
    expect(
      lire(
        humain('10:00'),
        reponse('10:05'),
        origine('10:30', { kind: 'inconnue' }),
        reponse('10:32')
      ).tours
    ).toEqual([[ms('10:00'), ms('10:32')]]);
  });

  it('3uv.44 critère 3 : an origin without its kind opens no turn either', () => {
    expect(
      lire(humain('10:00'), reponse('10:05'), origine('10:30', {}), reponse('10:32')).tours
    ).toEqual([[ms('10:00'), ms('10:32')]]);
  });
});

describe('3uv.44 critère 4 : the interruption mark is the whole text of a message, never a fragment of it', () => {
  it('3uv.44 critère 4 : a message whose first text is the mark, followed by another text, is an incoming message', () => {
    expect(
      lire(
        humain('10:00'),
        reponse('10:05'),
        texteEnListe('12:00', MARQUE, 'Reprends autrement.'),
        reponse('12:06')
      ).tours
    ).toEqual([
      [ms('10:00'), ms('10:05')],
      [ms('12:00'), ms('12:06')],
    ]);
  });

  it('3uv.44 critère 4 : a message whose text starts with the mark and goes on is an incoming message', () => {
    expect(
      lire(
        humain('10:00'),
        reponse('10:05'),
        l({ type: 'user', timestamp: at('12:00'), message: { content: `${MARQUE}\nReprends.` } }),
        reponse('12:06')
      ).tours
    ).toEqual([
      [ms('10:00'), ms('10:05')],
      [ms('12:00'), ms('12:06')],
    ]);
  });

  it('3uv.44 critère 4 : the mark alone, written in two texts, stays the mark and opens no turn', () => {
    expect(
      lire(
        humain('10:00'),
        reponse('10:05'),
        texteEnListe('10:20', '[Request interrupted', ' by user]'),
        reponse('10:22')
      ).tours
    ).toEqual([[ms('10:00'), ms('10:22')]]);
  });
});

// A home with a session of the project, its transcript `texte` written now.
const nouveauHome = () => mkdtempSync(path.join(ESSAIS, 'home-'));
const propre = (home: string) => {
  const d = path.join(home, '.claude/projects/-depot');
  mkdirSync(d, { recursive: true });
  return d;
};
const session = (home: string, id: string, texte: string) => {
  const f = path.join(propre(home), `${id}.jsonl`);
  writeFileSync(f, texte);
  return f;
};
interface Vivant {
  agent: string;
  ticket: string | null;
  role: string | null;
  depuis: number;
  entre: number | null;
  jetons: number;
  travail: number;
  tours: [number, number][];
}
// The board's reading of `home` now, with `cache`; the cache goes through JSON as the board's file.
const vivants = (home: string, cache: Record<string, unknown>, maintenant = Date.now()) =>
  lireVivant({ racine: RACINE, home, prefix: 'demo', maintenant, ps: '', cache }) as Vivant[];
const parFichier = (cache: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(cache)) as Record<string, unknown>;
const mesure = (v: Vivant | undefined) =>
  v && { depuis: v.depuis, entre: v.entre, jetons: v.jetons, travail: v.travail, tours: v.tours };
// A line blanked in place: the same number of bytes, spaces only.
const effacer = (f: string, ligneDuFichier: string) => {
  const avant = readFileSync(f, 'utf8');
  expect(avant).toContain(ligneDuFichier);
  writeFileSync(f, avant.replace(ligneDuFichier, ' '.repeat(Buffer.byteLength(ligneDuFichier))));
};

describe('3uv.44 critère 5 : the board reads a transcript where it stopped, its reading kept in its cache', () => {
  it('3uv.44 critère 5 : after lines are appended, the board reads only them: a line it read before, since blanked in place, still counts', () => {
    const home = nouveauHome();
    const premiere = reponse('10:05', 10, 'm-avant');
    const f = session(home, 's1', `${transcription(invite('10:00'), premiere)}\n`);
    let cache: Record<string, unknown> = {};
    expect(vivants(home, cache).find(v => v.agent === 's1')?.jetons).toBe(10);
    cache = parFichier(cache);
    effacer(f, premiere);
    appendFileSync(f, `${reponse('10:20', 5, 'm-apres')}\n`);
    const v = vivants(home, cache).find(x => x.agent === 's1');
    expect(v?.jetons).toBe(15);
    expect(v?.tours).toEqual([[ms('10:00'), ms('10:20')]]);
  });

  it('3uv.44 critère 5 : a reading resumed at any line gives the measures of a whole reading', () => {
    const toutes = [
      invite('10:00'),
      reponse('10:10', 10, 'r1'),
      piece('10:05'),
      reponse('10:12', 10, 'r1'),
      humain('11:00'),
      reponse('11:05', 7, 'r2'),
      origine('11:20', { kind: 'coordinator' }),
      texteEnListe('12:00', MARQUE),
      humain('13:00'),
      reponse('13:04', 3, 'r3'),
    ];
    const entier = nouveauHome();
    session(entier, 's1', `${transcription(...toutes)}\n`);
    const attendu = mesure(vivants(entier, {}).find(v => v.agent === 's1'));
    expect(attendu?.jetons).toBe(20);
    for (let k = 1; k < toutes.length; k++) {
      const home = nouveauHome();
      const f = session(home, 's1', `${transcription(...toutes.slice(0, k))}\n`);
      let cache: Record<string, unknown> = {};
      vivants(home, cache);
      cache = parFichier(cache);
      appendFileSync(f, `${transcription(...toutes.slice(k))}\n`);
      expect([k, mesure(vivants(home, cache).find(v => v.agent === 's1'))]).toEqual([k, attendu]);
    }
  });

  it('3uv.44 critère 5 : a last line written in two times counts once, when it is whole', () => {
    const home = nouveauHome();
    const fin = reponse('10:20', 5, 'm-coupee');
    const coupe = 30;
    const f = session(
      home,
      's1',
      `${transcription(invite('10:00'), reponse('10:05'))}\n${fin.slice(0, coupe)}`
    );
    let cache: Record<string, unknown> = {};
    expect(vivants(home, cache).find(v => v.agent === 's1')?.jetons).toBe(10);
    cache = parFichier(cache);
    appendFileSync(f, `${fin.slice(coupe)}\n`);
    const v = vivants(home, cache).find(x => x.agent === 's1');
    expect(v?.jetons).toBe(15);
    expect(v?.tours).toEqual([[ms('10:00'), ms('10:20')]]);
  });

  it('3uv.44 critère 5 : an answer read before and written again after the append counts once', () => {
    const home = nouveauHome();
    const f = session(
      home,
      's1',
      `${transcription(invite('10:00'), reponse('10:05', 10, 'm-deux-fois'))}\n`
    );
    let cache: Record<string, unknown> = {};
    vivants(home, cache);
    cache = parFichier(cache);
    appendFileSync(
      f,
      `${transcription(reponse('10:06', 10, 'm-deux-fois'), reponse('10:07', 4))}\n`
    );
    expect(vivants(home, cache).find(v => v.agent === 's1')?.jetons).toBe(14);
  });

  it('3uv.44 critère 5 : a transcript rewritten shorter is read again from its start', () => {
    const home = nouveauHome();
    const f = session(
      home,
      's1',
      `${transcription(invite('10:00'), reponse('10:05', 10), reponse('10:06', 10), reponse('10:07', 10))}\n`
    );
    let cache: Record<string, unknown> = {};
    expect(vivants(home, cache).find(v => v.agent === 's1')?.jetons).toBe(30);
    cache = parFichier(cache);
    writeFileSync(f, `${transcription(invite('11:00'), reponse('11:02', 3))}\n`);
    const v = vivants(home, cache).find(x => x.agent === 's1');
    expect(v?.jetons).toBe(3);
    expect(v?.tours).toEqual([[ms('11:00'), ms('11:02')]]);
  });

  it("3uv.44 critère 5 : the manager's transcript a sub-agent takes its ticket from is read where it stopped too", () => {
    const home = nouveauHome();
    const sous = path.join(propre(home), 'sess', 'subagents');
    mkdirSync(sous, { recursive: true });
    const prompt = invite('08:00', 'demo-9');
    const chef = path.join(sous, 'agent-c1.jsonl');
    writeFileSync(chef, `${transcription(prompt, reponse('08:05'))}\n`);
    writeFileSync(path.join(sous, 'agent-c1.meta.json'), l({ agentType: 'chef-de-chantier' }));
    const muet = path.join(sous, 'agent-e1.jsonl');
    writeFileSync(
      muet,
      `${transcription(l({ type: 'user', timestamp: at('08:10'), message: { content: 'Cherche les appelants.' } }), reponse('08:11'))}\n`
    );
    writeFileSync(
      path.join(sous, 'agent-e1.meta.json'),
      l({ agentType: 'Explore', parentAgentId: 'c1' })
    );
    let cache: Record<string, unknown> = {};
    expect(vivants(home, cache).find(v => v.agent === 'e1')?.ticket).toBe('demo-9');
    cache = parFichier(cache);
    effacer(chef, prompt);
    appendFileSync(chef, `${reponse('08:20')}\n`);
    appendFileSync(muet, `${reponse('08:21')}\n`);
    expect(vivants(home, cache).find(v => v.agent === 'e1')?.ticket).toBe('demo-9');
  });
});

// The catch-up's trial: a home whose sub-agents and sessions last moved some time before
// `MAINTENANT`, each with its last tool call answered or awaiting.
const MAINTENANT = Math.floor(Date.now() / SEC) * SEC;
const enAppel = (ticket: string, attend: boolean) =>
  transcription(
    invite('08:00', ticket),
    l({
      type: 'assistant',
      timestamp: at('08:01'),
      message: {
        id: `m-${++n}`,
        content: [
          { type: 'tool_use', id: `toolu_${n}`, name: 'Bash', input: { command: 'npm test' } },
        ],
        usage: { input_tokens: 6, output_tokens: 4 },
      },
    }),
    ...(attend
      ? []
      : [
          l({
            type: 'user',
            timestamp: at('08:02'),
            message: {
              content: [{ type: 'tool_result', tool_use_id: `toolu_${n}`, content: 'ok' }],
            },
          }),
        ])
  );
const bouge = (f: string, silence: number) => {
  const quand = (MAINTENANT - silence) / SEC;
  utimesSync(f, quand, quand);
};
const sousAgentDe = (home: string, id: string, attend: boolean, silence: number) => {
  const sous = path.join(propre(home), 'sess', 'subagents');
  mkdirSync(sous, { recursive: true });
  const f = path.join(sous, `agent-${id}.jsonl`);
  writeFileSync(f, enAppel('demo-9', attend));
  writeFileSync(path.join(sous, `agent-${id}.meta.json`), l({ agentType: 'relecteur' }));
  bouge(f, silence);
};
const sessionDe = (home: string, id: string, attend: boolean, silence: number) =>
  bouge(session(home, id, enAppel('demo-9', attend)), silence);
const rattrapes = (home: string, connus: string[] = []) =>
  (
    aRattraper(RACINE, home, new Set(connus), MAINTENANT) as {
      agent_id?: string;
      session_id?: string;
    }[]
  )
    .map(x => x.agent_id ?? x.session_id)
    .sort();

describe('3uv.44 critère 6 : the catch-up holds a silent sub-agent whose last call awaits its answer as running (3uv.49 critère 13)', () => {
  it('3uv.44 critère 6 : the witness — a sub-agent silent 5 minutes in the middle of a call is not written finished', () => {
    const home = nouveauHome();
    sessionDe(home, 'sess', false, 60 * MIN);
    sousAgentDe(home, 'i1', true, 5 * MIN);
    expect(rattrapes(home)).toEqual(['sess']);
  });

  it('3uv.44 critère 6 : the 30-minute bound — a sub-agent silent 31 minutes in the middle of a call is written finished', () => {
    const home = nouveauHome();
    sessionDe(home, 'sess', false, 60 * MIN);
    sousAgentDe(home, 'i2', true, 31 * MIN);
    expect(rattrapes(home)).toEqual(['i2', 'sess']);
  });

  it('3uv.44 critère 6 : a session keeps the 2-minute rule alone: silent 5 minutes in the middle of a call, it is written finished', () => {
    const home = nouveauHome();
    sessionDe(home, 's5', true, 5 * MIN);
    expect(rattrapes(home)).toEqual(['s5']);
  });

  it('3uv.44 critère 6 : the catch-up writes finished exactly the agents the board does not show running, at every bound', () => {
    const home = nouveauHome();
    sessionDe(home, 'sess', false, 60 * MIN);
    const cas: [string, boolean, number][] = [
      ['a-1min', false, 1 * MIN],
      ['b-2min-pile', false, 2 * MIN],
      ['c-5min-attend', true, 5 * MIN],
      ['d-5min-repondu', false, 5 * MIN],
      ['e-29min-attend', true, 29 * MIN],
      ['f-30min-pile-attend', true, 30 * MIN],
      ['g-31min-attend', true, 31 * MIN],
    ];
    for (const [id, attend, silence] of cas) {
      sousAgentDe(home, id, attend, silence);
    }
    sessionDe(home, 's-1min', true, 1 * MIN);
    sessionDe(home, 's-5min-attend', true, 5 * MIN);
    const tournent = new Set(vivants(home, {}, MAINTENANT).map(v => v.agent));
    const tous = [...cas.map(([id]) => id), 'sess', 's-1min', 's-5min-attend'];
    expect(rattrapes(home)).toEqual(tous.filter(id => !tournent.has(id)).sort());
    expect(rattrapes(home)).toEqual(
      expect.arrayContaining(['d-5min-repondu', 'g-31min-attend', 's-5min-attend'])
    );
    expect(rattrapes(home)).not.toContain('c-5min-attend');
    expect(rattrapes(home)).not.toContain('e-29min-attend');
  });
});

// The board's alerts of a list of tickets.
interface Alerte {
  niveau: string;
  texte: string;
}
const nuit = (id: string, title: string, o: object = {}) => ({
  id,
  title,
  status: 'open',
  priority: 1,
  issue_type: 'bug',
  labels: ['nuit'],
  ...o,
});
const plateau = (tous: object[]) =>
  assembler({
    tous,
    prefix: 'demo',
    registre: [],
    vivants: [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 24 * 60 * MIN,
  }) as { alertes: Alerte[] };
const rouges = (tous: object[]) => plateau(tous).alertes.filter(a => a.niveau === 'rouge');
const ROUGE = nuit('demo-87', '87 — La nuit est rouge depuis abc1234 — parent');
const REFUSEE = nuit('demo-88', '88 — La poussée de la nuit est refusée sur def5678 — parent');

describe('3uv.44 critère 7 : each open night ticket raises its red alert, its subject followed by its number', () => {
  it('3uv.44 critère 7 : two open night tickets raise two red alerts, each its subject then its number', () => {
    const r = rouges([ROUGE, REFUSEE]);
    expect(r).toHaveLength(2);
    const de = (numero: string) => r.filter(a => a.texte.endsWith(numero));
    expect(de('87')).toHaveLength(1);
    expect(de('87')[0].texte.startsWith('La nuit est rouge depuis abc1234')).toBe(true);
    expect(de('88')).toHaveLength(1);
    expect(de('88')[0].texte.startsWith('La poussée de la nuit est refusée sur def5678')).toBe(
      true
    );
  });

  it('3uv.44 critère 7 : the refused push alone never shows « La nuit est rouge »', () => {
    const r = rouges([REFUSEE]);
    expect(r).toHaveLength(1);
    expect(r[0].texte).not.toContain('La nuit est rouge');
    expect(r[0].texte.startsWith('La poussée de la nuit est refusée sur def5678')).toBe(true);
    expect(r[0].texte.endsWith('88')).toBe(true);
  });

  it('3uv.44 critère 7 : a night ticket in progress raises its alert, a closed one none', () => {
    const r = rouges([
      { ...ROUGE, status: 'in_progress' },
      { ...REFUSEE, status: 'closed' },
    ]);
    expect(
      r.map(a => a.texte.startsWith('La nuit est rouge depuis abc1234') && a.texte.endsWith('87'))
    ).toEqual([true]);
  });

  it('3uv.44 critère 7 : a night ticket whose title is not « number — subject — component » shows its whole title, then its number', () => {
    const r = rouges([nuit('demo-90', 'Nuit rouge sur 1a2b3c4')]);
    expect(r).toHaveLength(1);
    expect(r[0].texte.startsWith('Nuit rouge sur 1a2b3c4')).toBe(true);
    expect(r[0].texte.endsWith('90')).toBe(true);
  });

  it('3uv.44 critère 7 : on the pane, a subject too long for the line is cut and its number stays whole', () => {
    const long = nuit(
      'demo-91',
      '91 — La poussée de la nuit est refusée sur 0123abc par le dépôt distant — parent'
    );
    const out = lignes(plateau([long]), 'depot') as { texte: string; ton?: string }[];
    const alerte = out.filter(x => x.ton === 'alerte');
    expect(alerte).toHaveLength(1);
    expect(alerte[0].texte.length).toBeLessThanOrEqual(52);
    expect(alerte[0].texte.startsWith('⚠ La poussée de la nuit')).toBe(true);
    expect(alerte[0].texte.endsWith('91')).toBe(true);
  });
});
