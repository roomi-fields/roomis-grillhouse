// Le bilan d'un ticket donne le premier tour de chaque séance que le circuit a lancée : l'entrée, le
// cache écrit et le cache lu de la première réponse d'un modèle, lus dans sa transcription sous
// ~/.claude/projects (scripts/bilan.mjs), et leur moyenne par rôle au commentaire « bilan ».
// Données d'essai : les foyers (un par essai) et le registre sont sous la racine d'essai, jamais
// ceux du poste.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The home of the trial in course, set before the module under test is imported.
const foyer = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async importOriginal => {
  const os = await importOriginal<typeof import('node:os') & { default: object }>();
  const homedir = () => foyer.dir;
  return { ...os, homedir, default: { ...os.default, homedir } };
});

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'bilan-premier-tour-'));
const REGISTRE = path.join(ESSAIS, 'registre.jsonl');
const TICKET = 'demo-7';
const T0 = Date.parse('2026-10-20T10:00:00Z');
const iso = (minute: number) => new Date(T0 + minute * 60_000).toISOString();

let ecrireLeBilan: (racine: string, ticket: string, fin: object | null) => string;

beforeAll(async () => {
  // The address of the register is fixed at the import of bilan.mjs.
  vi.stubEnv('GRILLHOUSE_REGISTRE', REGISTRE);
  vi.stubEnv('HOME', path.join(ESSAIS, 'foyer'));
  foyer.dir = path.join(ESSAIS, 'foyer');
  ({ ecrireLeBilan } = await import('../../scripts/bilan.mjs'));
});
afterAll(() => {
  vi.unstubAllEnvs();
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Tour {
  seance: string;
  role: string;
  entree?: number;
  cacheEcrit?: number;
  cacheLu?: number;
}
interface Bilan {
  premiersTours: Tour[];
  seances: { total: number; parRole: Record<string, number>; horsCircuit: { total: number } };
  jetons: number;
  cache: number;
  cout: number;
}

// The transcript lines Claude Code writes.
const consigne = (texte = `TON TICKET : ${TICKET}`) => ({
  type: 'user',
  timestamp: iso(0),
  message: { role: 'user', content: texte },
});
const reponse = (
  id: string,
  [entree, ecrit, lu]: number[],
  { model = 'claude-sonnet-5-5', minute = 1 } = {}
) => ({
  type: 'assistant',
  timestamp: iso(minute),
  message: {
    id,
    model,
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    usage: {
      input_tokens: entree,
      cache_creation_input_tokens: ecrit,
      cache_read_input_tokens: lu,
      output_tokens: 999,
    },
  },
});
const synthetique = (minute = 1) =>
  reponse(`synthetique-${minute}`, [0, 0, 0], { model: '<synthetic>', minute });

// A project of trial: its main tree, and its own foyer with its folders of transcripts, so that the
// search of a session by its identifier meets the transcripts of this trial alone.
const projet = (nom: string) => {
  const racine = path.join(ESSAIS, nom);
  const dossier = path.join(racine, '.claude', 'worktrees');
  mkdirSync(dossier, { recursive: true });
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify({ name: nom }));
  const enTirets = (p: string) => p.replace(/[^A-Za-z0-9]/g, '-');
  foyer.dir = path.join(ESSAIS, 'foyers', nom);
  const projets = path.join(foyer.dir, '.claude', 'projects');
  const dansLaCopie = path.join(projets, enTirets(path.join(dossier, TICKET)));
  const dansLArbre = path.join(projets, enTirets(racine));
  const transcription = (seance: string, lignes: (object | string)[], ou = dansLaCopie) => {
    mkdirSync(ou, { recursive: true });
    const f = path.join(ou, `${seance}.jsonl`);
    writeFileSync(
      f,
      lignes.map(l => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n'
    );
    return f;
  };
  // The launches the circuit kept, `[rôle, séance]`.
  const lancer = (lancements: [string, string][]) =>
    writeFileSync(
      path.join(dossier, `${TICKET}.fiches.jsonl`),
      lancements
        .map(([role, seance], i) =>
          JSON.stringify({ date: iso(i), role: 'circuit', lancement: { role, seance } })
        )
        .join('\n') + '\n'
    );
  // The sessions the register of finished agents holds, `[rôle, agent]`.
  const registre = (agents: [string, string][]) =>
    writeFileSync(
      REGISTRE,
      agents
        .map(([role, agent], i) =>
          JSON.stringify({
            projet: racine,
            agent,
            ticket: TICKET,
            role,
            debut: iso(i),
            fin: iso(i + 1),
            travail: 60_000,
            tours: [[T0 + i * 60_000, T0 + (i + 1) * 60_000]],
            jetons: 1000,
            cache: 10_000,
            cout: 0.5,
          })
        )
        .join('\n') + '\n'
    );
  registre([]);
  const ecrire = () => {
    const texte = ecrireLeBilan(racine, TICKET, null);
    const b = JSON.parse(readFileSync(path.join(dossier, `${TICKET}.bilan.json`), 'utf8')) as Bilan;
    return { texte, b };
  };
  return { transcription, lancer, registre, ecrire, dansLArbre };
};

const tourDe = (b: Bilan, seance: string) => b.premiersTours.filter(t => t.seance === seance);
const lignesDuPremierTour = (texte: string) =>
  texte.split('\n').filter(l => /premier tour/i.test(l));

describe('le premier tour de chaque séance au bilan.json', () => {
  it('donne l’entrée, le cache écrit et le cache lu de la première réponse d’un modèle, avec la séance et son rôle', () => {
    const p = projet('nominal');
    p.lancer([['testwriter', 's1']]);
    p.registre([['testwriter', 's1']]);
    p.transcription('s1', [
      consigne(),
      reponse('m1', [12, 30_000, 4000]),
      reponse('m2', [7, 500, 34_000], { minute: 2 }),
    ]);
    expect(p.ecrire().b.premiersTours).toEqual([
      { seance: 's1', role: 'testwriter', entree: 12, cacheEcrit: 30_000, cacheLu: 4000 },
    ]);
  });

  it('ne compte ni un message <synthetic>, ni une ligne coupée, ni la reprise de la séance', () => {
    const p = projet('synthetique');
    p.lancer([['developpeur', 's1']]);
    p.transcription('s1', [
      consigne(),
      '{ "type": "assistant", "message": ',
      synthetique(),
      reponse('m1', [3, 200, 100], { minute: 2 }),
      reponse('m1', [3, 200, 100], { minute: 2 }),
      synthetique(10),
      consigne('Reprends.'),
      reponse('m2', [9, 900, 9000], { minute: 11 }),
    ]);
    expect(p.ecrire().b.premiersTours).toEqual([
      { seance: 's1', role: 'developpeur', entree: 3, cacheEcrit: 200, cacheLu: 100 },
    ]);
  });

  it('lit la première réponse loin dans la transcription, après une consigne de plus d’un mégaoctet', () => {
    const p = projet('longue');
    p.lancer([['relecteur', 's1']]);
    p.transcription('s1', [consigne('é'.repeat(1_500_000)), reponse('m1', [5, 6, 7])]);
    expect(tourDe(p.ecrire().b, 's1')).toEqual([
      { seance: 's1', role: 'relecteur', entree: 5, cacheEcrit: 6, cacheLu: 7 },
    ]);
  });

  it('garde un zéro que la première réponse dit', () => {
    const p = projet('zero');
    p.lancer([['testwriter', 's1']]);
    p.transcription('s1', [consigne(), reponse('m1', [8, 40_000, 0])]);
    expect(p.ecrire().b.premiersTours).toEqual([
      { seance: 's1', role: 'testwriter', entree: 8, cacheEcrit: 40_000, cacheLu: 0 },
    ]);
  });

  it('trouve la transcription par l’identifiant, dans la copie du ticket comme dans l’arbre principal', () => {
    const p = projet('deux-dossiers');
    p.lancer([
      ['testwriter', 'copie-1'],
      ['explorateur', 'arbre-1'],
    ]);
    p.transcription('copie-1', [consigne(), reponse('m1', [1, 2, 3])]);
    p.transcription('arbre-1', [consigne(), reponse('m2', [4, 5, 6])], p.dansLArbre);
    const { b } = p.ecrire();
    expect(tourDe(b, 'copie-1')).toEqual([
      { seance: 'copie-1', role: 'testwriter', entree: 1, cacheEcrit: 2, cacheLu: 3 },
    ]);
    expect(tourDe(b, 'arbre-1')).toEqual([
      { seance: 'arbre-1', role: 'explorateur', entree: 4, cacheEcrit: 5, cacheLu: 6 },
    ]);
  });

  it('porte une seule entrée par identifiant lancé, avec ou sans ligne au registre, sans aucune séance hors circuit', () => {
    const p = projet('lancements');
    p.lancer([
      ['testwriter', 'avec'],
      ['developpeur', 'sans-registre'],
      ['testwriter', 'avec'],
    ]);
    p.registre([
      ['testwriter', 'avec'],
      ['relecteur', 'hors'],
    ]);
    p.transcription('avec', [consigne(), reponse('m1', [1, 2, 3])]);
    p.transcription('sans-registre', [consigne(), reponse('m2', [4, 5, 6])]);
    p.transcription('hors', [consigne(), reponse('m3', [7, 8, 9])], p.dansLArbre);
    const { b } = p.ecrire();
    expect(b.premiersTours).toHaveLength(2);
    expect(b.premiersTours).toEqual(
      expect.arrayContaining([
        { seance: 'avec', role: 'testwriter', entree: 1, cacheEcrit: 2, cacheLu: 3 },
        { seance: 'sans-registre', role: 'developpeur', entree: 4, cacheEcrit: 5, cacheLu: 6 },
      ])
    );
    // The other figures stay those of the register.
    expect(b.seances).toMatchObject({
      total: 1,
      parRole: { testwriter: 1 },
      horsCircuit: { total: 1 },
    });
    expect(b.jetons).toBe(1000);
    expect(b.cache).toBe(10_000);
    expect(b.cout).toBeCloseTo(0.5);
  });

  it('garde l’identifiant et le rôle, sans aucun nombre, d’une séance sans transcription ou sans usage lisible, et s’écrit', () => {
    const p = projet('non-mesurees');
    p.lancer([
      ['testwriter', 'absente'],
      ['developpeur', 'synthetique-seule'],
      ['relecteur', 'sans-usage'],
    ]);
    p.transcription('synthetique-seule', [consigne(), synthetique()]);
    p.transcription('sans-usage', [
      consigne(),
      { type: 'assistant', timestamp: iso(1), message: { id: 'm1', model: 'claude-sonnet-5-5' } },
    ]);
    const { b, texte } = p.ecrire();
    expect(b.premiersTours).toHaveLength(3);
    expect(b.premiersTours).toEqual(
      expect.arrayContaining([
        { seance: 'absente', role: 'testwriter' },
        { seance: 'synthetique-seule', role: 'developpeur' },
        { seance: 'sans-usage', role: 'relecteur' },
      ])
    );
    expect(lignesDuPremierTour(texte)).toEqual([]);
  });

  it('ne reprend aucun nombre du bilan écrit avant quand la transcription a disparu', () => {
    const p = projet('disparue');
    p.lancer([['testwriter', 's1']]);
    const f = p.transcription('s1', [consigne(), reponse('m1', [1, 2, 3])]);
    expect(p.ecrire().b.premiersTours).toEqual([
      { seance: 's1', role: 'testwriter', entree: 1, cacheEcrit: 2, cacheLu: 3 },
    ]);
    rmSync(f);
    const { b, texte } = p.ecrire();
    expect(b.premiersTours).toEqual([{ seance: 's1', role: 'testwriter' }]);
    expect(lignesDuPremierTour(texte)).toEqual([]);
  });
});

describe('la moyenne du premier tour par rôle au commentaire « bilan »', () => {
  it('donne par rôle mesuré, dans l’ordre des étapes, les moyennes en jetons entiers et le nombre de séances mesurées', () => {
    const p = projet('moyennes');
    p.lancer([
      ['relecteur', 'r1'],
      ['developpeur', 'd1'],
      ['testwriter', 't1'],
      ['testwriter', 't2'],
      ['testwriter', 't3'],
      ['testwriter', 't-non-mesuree'],
      ['explorateur', 'e-non-mesuree'],
    ]);
    p.transcription('r1', [consigne(), reponse('r1', [50, 60, 70])]);
    p.transcription('d1', [consigne(), reponse('d1', [5, 31_000, 7])]);
    p.transcription('t1', [consigne(), reponse('t1', [10, 30_000, 100])]);
    p.transcription('t2', [consigne(), reponse('t2', [11, 30_001, 100])]);
    // The means 10,67, 30 000,67 and 100,67, rounded.
    p.transcription('t3', [consigne(), reponse('t3', [11, 30_001, 102])]);
    expect(lignesDuPremierTour(p.ecrire().texte)).toEqual([
      'Premier tour, moyenne par rôle en jetons (entrée, cache écrit, cache lu) : testwriter 11, 30001, 101 (3 séances) ; développeur 5, 31000, 7 (1 séance) ; relecteur 50, 60, 70 (1 séance).',
    ]);
  });
});
