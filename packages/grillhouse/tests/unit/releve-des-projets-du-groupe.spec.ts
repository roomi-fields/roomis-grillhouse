// One reading of the greffon over the projects of a group (`releverPourLeGreffon`,
// scripts/superviseur.mjs): each project's new questions reach the session at that reading, however
// many stopped circuits the project holds, and a fault in a neighbour's reading costs the other
// projects nothing. The circuits are injected; `bd` is a stub on the PATH with the cost of the real
// one: its `show` of many tickets overruns the time the reading gives it and answers nothing,
// its `list` answers at once. The clock is faked, with no real wait.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { marquerLues, releverPourLeGreffon } from '../../scripts/superviseur.mjs';
import { circuitLu } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'releve-des-projets-du-groupe-'));
const MIN = 60_000;
const T0 = new Date('2026-11-20T10:00:00Z').getTime();

// The tickets of a project are in its file `bd-tickets.json`, read from the folder `bd` runs in.
// Measured on a real project, `bd show` takes about 9 s for the first ticket and 1.5 s for each
// next one: beyond 15 tickets it overruns 30 s, so it ends with nothing written.
const BD = `#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const [commande, ...args] = process.argv.slice(2);
let tickets = [];
try {
  tickets = JSON.parse(readFileSync('bd-tickets.json', 'utf8'));
} catch {}
if (commande === 'show') {
  const ids = args.filter(a => !a.startsWith('-'));
  if (ids.length > 15) process.exit(1);
  console.log(JSON.stringify(tickets.filter(t => ids.includes(t.id))));
} else if (commande === 'list') {
  console.log(JSON.stringify(tickets.filter(t => args.includes('--all') || t.status !== 'closed')));
} else {
  console.log('[]');
}
`;

beforeAll(() => {
  const bin = path.join(ESSAIS, 'bin');
  mkdirSync(bin);
  const bd = path.join(bin, 'bd');
  writeFileSync(bd, BD);
  chmodSync(bd, 0o755);
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`);
});
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: T0 }));
afterEach(() => vi.useRealTimers());
afterAll(() => vi.unstubAllEnvs());
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository carrying <pkg>, its lock of the supervisor holding <verrou> (none when null).
const depot = (pkg: object = {}, verrou: string | null = null) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const r = spawnSync('git', ['init', '-q'], { cwd: racine });
  if (r.status !== 0) {
    throw new Error('git init');
  }
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify(pkg));
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  if (verrou !== null) {
    writeFileSync(path.join(racine, '.git', 'grillhouse-superviseur.lock'), `${verrou}\n`);
  }
  return racine;
};

type Circuit = ReturnType<typeof circuitLu>;
const question = (ticket: string): Circuit =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question: `Quelle réponse pour ${ticket} ?`,
    qui: 'superviseur',
    run: `run-${ticket}`,
    numero: 1,
  });
// A circuit ended without its issue, long ago.
const sansIssue = (ticket: string) => circuitLu(ticket, { interrompu: true, sansIssue: true });
// A circuit integrated at <fin>.
const integre = (ticket: string, fin: number) =>
  circuitLu(ticket, { etape: 'integre', code: 0, arret: 'arrete', integre: true, fin });
const noms = (prefixe: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefixe}-${i + 1}`);

// A group: the session's own project, whose lock names the session, and a neighbour per entry of
// <voisins>. <circuits> gives each root its circuits, read again at each reading.
const groupe = (voisins: { pkg?: object; verrou?: string | null }[], pkgDeSoi: object = {}) => {
  const soi = depot(pkgDeSoi, `${process.ppid}:jeton-de-soi`);
  const racines = voisins.map(v => depot(v.pkg, v.verrou ?? null));
  writeFileSync(
    path.join(soi, 'package.json'),
    JSON.stringify({
      ...pkgDeSoi,
      grillhouse: {
        ...(pkgDeSoi as { grillhouse?: object }).grillhouse,
        groupe: [soi, ...racines],
      },
    })
  );
  const circuits = new Map<string, Circuit[]>();
  const tickets = (racine: string, liste: object[]) =>
    writeFileSync(path.join(racine, 'bd-tickets.json'), JSON.stringify(liste));
  // The project at <racine> holds these circuits, its Beads these tickets: open ones for <ouverts>,
  // closed ones for <fermes>.
  const remplir = (
    racine: string,
    lus: Circuit[],
    { fermes = [], reportes = [] }: { fermes?: string[]; reportes?: string[] } = {}
  ) => {
    circuits.set(racine, lus);
    tickets(
      racine,
      lus.map(c => ({
        id: c.ticket,
        status: fermes.includes(c.ticket) ? 'closed' : 'in_progress',
        ...(reportes.includes(c.ticket) ? { defer_until: '2027-06-01T00:00:00Z' } : {}),
      }))
    );
  };
  const relever = () =>
    releverPourLeGreffon(soi, {
      env: {},
      circuitsDe: (racine: string) => Promise.resolve(circuits.get(racine) ?? []),
    });
  const lues = () => {
    for (const racine of [soi, ...racines]) {
      marquerLues(racine, { lueA: Date.now(), envoyeesAvant: Date.now() });
    }
  };
  return { soi, voisins: racines, remplir, relever, lues };
};
// The ids the message names as questions, whatever their order.
const questionsDe = (texte: string) =>
  [...texte.matchAll(/Question · (\S+) · /g)].map(m => m[1]).sort();

describe('a new question of a project of the group reaches the session at the next reading', () => {
  it('gives the new questions of a neighbour that holds many circuits of closed tickets', async () => {
    const g = groupe([{}]);
    const [voisin] = g.voisins as [string];
    const vieux = noms('vieux', 30);
    const neuves = noms('neuve', 4);
    g.remplir(voisin, [...vieux.map(sansIssue), ...neuves.map(question)], { fermes: vieux });
    expect(questionsDe(await g.relever())).toEqual(neuves);
  });

  it('gives the new questions of the project of the session that holds many circuits of closed tickets', async () => {
    const g = groupe([]);
    const vieux = noms('vieux', 30);
    g.remplir(g.soi, [...vieux.map(sansIssue), question('neuve-1')], { fermes: vieux });
    expect(questionsDe(await g.relever())).toEqual(['neuve-1']);
  });

  it('gives every question when many wait at once, in the same reading as the ends of circuits', async () => {
    const g = groupe([{}]);
    const [voisin] = g.voisins as [string];
    const neuves = noms('neuve', 30);
    // The first reading dates the ends from itself.
    g.remplir(voisin, []);
    await g.relever();
    vi.setSystemTime(T0 + MIN);
    g.remplir(voisin, [...neuves.map(question), integre('fini-1', T0 + MIN)]);
    const texte = await g.relever();
    expect(questionsDe(texte)).toEqual([...neuves].sort());
    expect(texte).toContain('Intégré · fini-1');
  });

  it('gives a question that appears after others went up, the circuits of closed tickets still standing', async () => {
    const g = groupe([{}]);
    const [voisin] = g.voisins as [string];
    const vieux = noms('vieux', 30);
    const premieres = noms('premiere', 2);
    const debout = [...vieux.map(sansIssue), ...premieres.map(question)];
    g.remplir(voisin, debout, { fermes: vieux });
    expect(questionsDe(await g.relever())).toEqual(premieres);
    g.lues();
    vi.setSystemTime(T0 + MIN);
    g.remplir(voisin, [...debout, question('seconde-1')], { fermes: vieux });
    expect(questionsDe(await g.relever())).toEqual(['seconde-1']);
  });

  it('keeps silent the deferred and the closed tickets among many', async () => {
    const g = groupe([{}]);
    const [voisin] = g.voisins as [string];
    const vieux = noms('vieux', 30);
    g.remplir(voisin, [...vieux.map(sansIssue), question('neuve-1'), question('plus-tard-1')], {
      fermes: vieux,
      reportes: ['plus-tard-1'],
    });
    expect(questionsDe(await g.relever())).toEqual(['neuve-1']);
  });
});

describe("a fault in a neighbour's reading costs the other projects of the group nothing", () => {
  type Faute = Error & { texte: string };
  const fauteDe = (lecture: Promise<string>) =>
    lecture.then(
      texte => {
        throw new Error(`the reading gave no fault: ${JSON.stringify(texte)}`);
      },
      (e: unknown) => e as Faute
    );
  // The file of the stops gone up cannot be written: a folder stands at its path.
  const casserLeSuivi = (racine: string) =>
    mkdirSync(path.join(racine, '.claude', 'worktrees', 'questions-remontees.json', 'plein'), {
      recursive: true,
    });
  const fautif = { pkg: { grillhouse: { rappel: 0 } } };

  it('throws naming the neighbour and its faulty interval, the message of the others in its text', async () => {
    const g = groupe([fautif, {}]);
    const [mauvais, bon] = g.voisins as [string, string];
    g.remplir(g.soi, [question('demo-1')]);
    g.remplir(mauvais, [question('mauvais-1')]);
    g.remplir(bon, [question('bon-1')]);
    const faute = await fauteDe(g.relever());
    expect(faute.message).toContain(path.basename(mauvais));
    expect(faute.message).toMatch(/grillhouse\.rappel.*0/);
    expect(faute.message).not.toContain(path.basename(bon));
    expect(questionsDe(faute.texte)).toEqual(['bon-1', 'demo-1']);
    expect(faute.texte).toContain(`→ env -C ${bon} npx grillhouse circuit bon-1 <réponse>`);
    expect(faute.texte).not.toContain('grillhouse.rappel');
    expect(faute.texte).not.toContain(path.basename(mauvais));
  });

  it('throws naming the neighbour whose follow-up cannot be held, the message of the others in its text', async () => {
    const g = groupe([{}, {}]);
    const [mauvais, bon] = g.voisins as [string, string];
    casserLeSuivi(mauvais);
    g.remplir(g.soi, [question('demo-1')]);
    g.remplir(mauvais, [question('mauvais-1')]);
    g.remplir(bon, [question('bon-1')]);
    const faute = await fauteDe(g.relever());
    expect(faute.message).toContain(path.basename(mauvais));
    expect(faute.message).toMatch(/EISDIR|ENOTEMPTY|directory/);
    expect(questionsDe(faute.texte)).toEqual(['bon-1', 'demo-1']);
    expect(faute.texte).not.toContain('EISDIR');
  });

  it('names each neighbour at fault', async () => {
    const g = groupe([fautif, {}, {}]);
    const [premier, second, bon] = g.voisins as [string, string, string];
    casserLeSuivi(second);
    g.remplir(premier, [question('premier-1')]);
    g.remplir(second, [question('second-1')]);
    g.remplir(bon, [question('bon-1')]);
    const faute = await fauteDe(g.relever());
    expect(faute.message).toContain(path.basename(premier));
    expect(faute.message).toContain(path.basename(second));
    expect(questionsDe(faute.texte)).toEqual(['bon-1']);
  });

  it('carries an empty text when the other projects have nothing to say', async () => {
    const g = groupe([fautif]);
    const faute = await fauteDe(g.relever());
    expect(faute.message).toContain(path.basename(g.voisins[0] as string));
    expect(faute.texte).toBe('');
  });
});
