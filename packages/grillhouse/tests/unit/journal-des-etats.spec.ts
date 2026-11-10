/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// Le journal d'états horodaté d'un projet (scripts/journal-des-etats.mjs) : une ligne JSONL datée
// par changement d'état (circuit, file, places), un segment par date locale sous le dossier git
// commun, lu en chronologie, borné par un nettoyage qui retire des segments entiers. Comme le
// journal d'un ordonnanceur : une ligne entière d'un seul append, sans verrou, qui ne retarde jamais
// ce qu'elle trace.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// Le module se charge à l'appel : s'il manque, chaque test échoue seul, au lieu du fichier entier.
const MODULE = path.resolve(__dirname, '../../scripts/journal-des-etats.mjs');
const charger = (): any => createRequire(path.join(__dirname, 'x.cjs'))(MODULE);
const dossierDuJournal = (...a: any[]) => charger().dossierDuJournal(...a);
const ecrireLaTrace = (...a: any[]) => charger().ecrireLaTrace(...a);
const heureLocale = (...a: any[]) => charger().heureLocale(...a);
const lireLeJournal = (...a: any[]) => charger().lireLeJournal(...a);
const nettoyerLeJournal = (...a: any[]) => charger().nettoyerLeJournal(...a);
const traceDeLaFile = (...a: any[]) => charger().traceDeLaFile(...a);
const traceDesPlaces = (...a: any[]) => charger().traceDesPlaces(...a);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'journal-des-etats-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
// Un projet d'essai : un dépôt git, dont le dossier commun porte le journal.
function projet(): string {
  const racine = path.join(ESSAIS, `p${++n}`);
  mkdirSync(racine);
  execFileSync('git', ['init', '-q', racine]);
  return racine;
}
// Un segment écrit à la main : `<date>.jsonl`, une ligne par entrée (une chaîne reste telle quelle).
function segment(racine: string, date: string, lignes: (object | string)[]) {
  const d = dossierDuJournal(racine);
  mkdirSync(d, { recursive: true });
  const f = path.join(d, `${date}.jsonl`);
  writeFileSync(
    f,
    lignes.map(l => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n'
  );
  return f;
}
const L = (ts: string, ticket: string, extra: object = {}) => ({
  ts,
  genre: 'circuit',
  ticket,
  etape: '2',
  boucle: null,
  place: null,
  raison: '',
  ...extra,
});
const segments = (racine: string) =>
  existsSync(dossierDuJournal(racine)) ? readdirSync(dossierDuJournal(racine)).sort() : [];
const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

describe('une trace écrite : une ligne datée dans le segment de la date locale', () => {
  it('écrit une ligne { ts, genre, ticket, etape, boucle, place, raison } sous le dossier git commun', () => {
    const racine = projet();
    ecrireLaTrace(racine, {
      genre: 'circuit',
      ticket: 'd-1',
      etape: '3',
      boucle: 2,
      place: 'p-7',
      raison: 'controles',
    });
    const [nom] = segments(racine);
    expect(nom).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/);
    expect(dossierDuJournal(racine).startsWith(path.join(racine, '.git'))).toBe(true);
    const ligne = JSON.parse(readFileSync(path.join(dossierDuJournal(racine), nom), 'utf8'));
    expect(ligne).toEqual({
      ts: expect.stringMatching(ISO_LOCAL),
      genre: 'circuit',
      ticket: 'd-1',
      etape: '3',
      boucle: 2,
      place: 'p-7',
      raison: 'controles',
    });
  });

  it('date la ligne en ISO 8601 avec le décalage local, et nomme le segment de cette date locale', () => {
    const racine = projet();
    const maintenant = new Date('2026-11-09T23:30:15.250Z');
    ecrireLaTrace(racine, { genre: 'file', ticket: 'd-1', etape: 'lance' }, { maintenant });
    const [nom] = segments(racine);
    const ligne = JSON.parse(readFileSync(path.join(dossierDuJournal(racine), nom), 'utf8'));
    expect(ligne.ts).toBe(heureLocale(maintenant));
    expect(ligne.ts).toMatch(ISO_LOCAL);
    expect(new Date(ligne.ts).getTime()).toBe(maintenant.getTime());
    expect(nom).toBe(`${ligne.ts.slice(0, 10)}.jsonl`);
  });

  it('une transition normale a une raison vide, les champs absents sont vides', () => {
    const racine = projet();
    ecrireLaTrace(racine, { genre: 'circuit', ticket: 'd-1', etape: '2' });
    const [nom] = segments(racine);
    const ligne = JSON.parse(readFileSync(path.join(dossierDuJournal(racine), nom), 'utf8'));
    expect(ligne.raison).toBe('');
    expect(ligne.boucle).toBeNull();
    expect(ligne.place).toBeNull();
  });

  it('ajoute les lignes à la suite, une par écriture, jamais une réécriture', () => {
    const racine = projet();
    for (let i = 0; i < 30; i++) {
      ecrireLaTrace(racine, { genre: 'circuit', ticket: `d-${i}`, etape: '2' });
    }
    const [nom] = segments(racine);
    expect(segments(racine)).toHaveLength(1);
    const lignes = readFileSync(path.join(dossierDuJournal(racine), nom), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
    expect(lignes.map(l => l.ticket)).toEqual(Array.from({ length: 30 }, (_, i) => `d-${i}`));
  });

  it('un segment par date locale : deux jours, deux fichiers', () => {
    const racine = projet();
    ecrireLaTrace(
      racine,
      { genre: 'circuit', ticket: 'd-1', etape: '2' },
      { maintenant: new Date('2026-11-01T12:00:00Z') }
    );
    ecrireLaTrace(
      racine,
      { genre: 'circuit', ticket: 'd-1', etape: '3' },
      { maintenant: new Date('2026-11-03T12:00:00Z') }
    );
    expect(segments(racine)).toEqual(['2026-11-01.jsonl', '2026-11-03.jsonl']);
  });

  it('tronque la raison pour que la ligne entière tienne sous 4096 octets', () => {
    const racine = projet();
    ecrireLaTrace(racine, {
      genre: 'places',
      ticket: 'd-1',
      etape: 'attente',
      raison: 'é'.repeat(10_000),
    });
    const [nom] = segments(racine);
    const brut = readFileSync(path.join(dossierDuJournal(racine), nom));
    expect(brut.length).toBeLessThanOrEqual(4096);
    expect(brut.at(-1)).toBe(0x0a);
    const ligne = JSON.parse(brut.toString('utf8'));
    expect(ligne.ticket).toBe('d-1');
    expect(ligne.raison.length).toBeGreaterThan(0);
    expect(ligne.raison.length).toBeLessThan(10_000);
    expect(ligne.raison).not.toContain('�');
  });

  it('une raison courte reste entière', () => {
    const racine = projet();
    ecrireLaTrace(racine, { genre: 'circuit', ticket: 'd-1', etape: '2', raison: 'controles' });
    const [nom] = segments(racine);
    expect(JSON.parse(readFileSync(path.join(dossierDuJournal(racine), nom), 'utf8')).raison).toBe(
      'controles'
    );
  });

  it('ne laisse aucun verrou ni fichier d’attente à côté des segments', () => {
    const racine = projet();
    ecrireLaTrace(racine, { genre: 'circuit', ticket: 'd-1', etape: '2' });
    ecrireLaTrace(racine, { genre: 'circuit', ticket: 'd-2', etape: '2' });
    expect(segments(racine).every(s => /\.jsonl$/.test(s))).toBe(true);
  });

  it('deux écritures simultanées donnent deux lignes entières', async () => {
    const racine = projet();
    const gros = 'x'.repeat(3000);
    await Promise.all([
      Promise.resolve().then(() =>
        ecrireLaTrace(racine, { genre: 'circuit', ticket: 'a', etape: '2', raison: gros })
      ),
      Promise.resolve().then(() =>
        ecrireLaTrace(racine, { genre: 'circuit', ticket: 'b', etape: '2', raison: gros })
      ),
    ]);
    const [nom] = segments(racine);
    const lignes = readFileSync(path.join(dossierDuJournal(racine), nom), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
    expect(lignes.map(l => l.ticket).sort()).toEqual(['a', 'b']);
  });
});

describe('une trace qui ne s’écrit pas laisse celui qu’elle trace continuer', () => {
  it('ne lève pas, rend un échec, et le dit une seule fois', () => {
    const racine = path.join(ESSAIS, 'absent', 'nulle-part');
    const dits: string[] = [];
    const options = { dire: (m: string) => dits.push(m) };
    const a = ecrireLaTrace(racine, { genre: 'file', ticket: 'd-1', etape: 'lance' }, options);
    const b = ecrireLaTrace(racine, { genre: 'file', ticket: 'd-2', etape: 'lance' }, options);
    expect(a.ecrit).toBe(false);
    expect(b.ecrit).toBe(false);
    expect(dits).toHaveLength(1);
    expect(dits[0]).toMatch(/journal/i);
  });

  it('une écriture réussie rend ecrit vrai et ne dit rien', () => {
    const racine = projet();
    const dits: string[] = [];
    const r = ecrireLaTrace(
      racine,
      { genre: 'file', ticket: 'd-1', etape: 'lance' },
      { dire: (m: string) => dits.push(m) }
    );
    expect(r.ecrit).toBe(true);
    expect(dits).toEqual([]);
  });
});

describe('les lignes de la file et des places', () => {
  it('la file trace un circuit lancé ou terminé', () => {
    expect(traceDeLaFile({ ticket: 'd-1', evenement: 'lance' })).toMatchObject({
      genre: 'file',
      ticket: 'd-1',
      etape: 'lance',
      raison: '',
    });
    expect(traceDeLaFile({ ticket: 'd-1', evenement: 'termine' })).toMatchObject({
      genre: 'file',
      ticket: 'd-1',
      etape: 'termine',
    });
  });

  it('les places tracent une place prise, rendue ou mise en attente, avec la raison dite', () => {
    expect(traceDesPlaces({ evenement: 'prise', ticket: 'd-1', place: 'p-1' })).toMatchObject({
      genre: 'places',
      ticket: 'd-1',
      etape: 'prise',
      place: 'p-1',
      raison: '',
    });
    expect(traceDesPlaces({ evenement: 'rendue', ticket: 'd-1', place: 'p-1' })).toMatchObject({
      genre: 'places',
      etape: 'rendue',
      place: 'p-1',
    });
    expect(
      traceDesPlaces({
        evenement: 'attente',
        ticket: 'd-2',
        raison: 'attente de place : 3 prises sur 3',
      })
    ).toMatchObject({
      genre: 'places',
      ticket: 'd-2',
      etape: 'attente',
      raison: 'attente de place : 3 prises sur 3',
    });
  });

  it('une ligne de la file ou des places s’écrit comme une autre, au journal', () => {
    const racine = projet();
    ecrireLaTrace(racine, traceDeLaFile({ ticket: 'd-1', evenement: 'lance' }));
    ecrireLaTrace(racine, traceDesPlaces({ evenement: 'prise', ticket: 'd-1', place: 'p-1' }));
    const genres = lireLeJournal(racine, {}).lignes.map((l: { genre: string }) => l.genre);
    expect(genres).toEqual(['file', 'places']);
  });
});

describe('la lecture du journal sur une plage de temps', () => {
  it('rend les lignes de tous les segments dans l’ordre de leur horodatage', () => {
    const racine = projet();
    segment(racine, '2026-11-10', [
      L('2026-11-10T09:00:00+01:00', 'd-3'),
      L('2026-11-10T08:00:00+01:00', 'd-2'),
    ]);
    segment(racine, '2026-11-09', [
      L('2026-11-09T18:00:00+01:00', 'd-1'),
      L('2026-11-09T07:00:00+01:00', 'd-0'),
    ]);
    const { lignes } = lireLeJournal(racine, {});
    expect(lignes.map((l: { ticket: string }) => l.ticket)).toEqual(['d-0', 'd-1', 'd-2', 'd-3']);
  });

  it('les bornes --depuis et --jusqu-a comprises, comparées en instants', () => {
    const racine = projet();
    segment(racine, '2026-11-09', [
      L('2026-11-09T10:00:00+01:00', 'avant'),
      L('2026-11-09T11:00:00+01:00', 'debut'),
      L('2026-11-09T12:00:00+01:00', 'milieu'),
      L('2026-11-09T13:00:00+01:00', 'fin'),
      L('2026-11-09T14:00:00+01:00', 'apres'),
    ]);
    const { lignes } = lireLeJournal(racine, {
      depuis: '2026-11-09T11:00:00+01:00',
      jusquA: '2026-11-09T13:00:00+01:00',
    });
    expect(lignes.map((l: { ticket: string }) => l.ticket)).toEqual(['debut', 'milieu', 'fin']);
    // La même borne dite dans un autre décalage est le même instant.
    const autre = lireLeJournal(racine, {
      depuis: '2026-11-09T10:00:00+00:00',
      jusquA: '2026-11-09T12:00:00Z',
    });
    expect(autre.lignes.map((l: { ticket: string }) => l.ticket)).toEqual([
      'debut',
      'milieu',
      'fin',
    ]);
  });

  it('une borne seule borne un côté', () => {
    const racine = projet();
    segment(racine, '2026-11-09', [
      L('2026-11-09T10:00:00+01:00', 'a'),
      L('2026-11-09T12:00:00+01:00', 'b'),
    ]);
    expect(
      lireLeJournal(racine, { depuis: '2026-11-09T11:00:00+01:00' }).lignes.map(
        (l: { ticket: string }) => l.ticket
      )
    ).toEqual(['b']);
    expect(
      lireLeJournal(racine, { jusquA: '2026-11-09T11:00:00+01:00' }).lignes.map(
        (l: { ticket: string }) => l.ticket
      )
    ).toEqual(['a']);
  });

  it('ne garde que les lignes du ticket demandé', () => {
    const racine = projet();
    segment(racine, '2026-11-09', [
      L('2026-11-09T10:00:00+01:00', 'd-1'),
      L('2026-11-09T10:01:00+01:00', 'd-2'),
      L('2026-11-09T10:02:00+01:00', 'd-1', { etape: '3' }),
    ]);
    const { lignes } = lireLeJournal(racine, { ticket: 'd-1' });
    expect(lignes.map((l: { etape: string }) => l.etape)).toEqual(['2', '3']);
  });

  it('ignore sans échouer une ligne illisible', () => {
    const racine = projet();
    segment(racine, '2026-11-09', [
      L('2026-11-09T10:00:00+01:00', 'a'),
      '{ la ligne est tronquée',
      '',
      '[1, 2]',
      L('2026-11-09T10:05:00+01:00', 'b'),
    ]);
    const { lignes } = lireLeJournal(racine, {});
    expect(lignes.map((l: { ticket: string }) => l.ticket)).toEqual(['a', 'b']);
  });

  it('sans journal, rend aucune ligne sans lever', () => {
    expect(lireLeJournal(projet(), {}).lignes).toEqual([]);
  });
});

describe('le nettoyage du journal retire des segments entiers', () => {
  const MAINTENANT = new Date('2026-11-10T12:00:00+01:00');

  it('les bornes sont 14 jours et 50 Mo', () => {
    expect(charger().AGE_MAX_JOURS).toBe(14);
    expect(charger().TAILLE_MAX).toBe(50 * 1024 * 1024);
  });

  it('retire les segments plus vieux que la borne d’âge, garde les autres', () => {
    const racine = projet();
    segment(racine, '2026-10-01', [L('2026-10-01T10:00:00+02:00', 'vieux')]);
    segment(racine, '2026-10-20', [L('2026-10-20T10:00:00+02:00', 'vieux')]);
    segment(racine, '2026-10-30', [L('2026-10-30T10:00:00+01:00', 'recent')]);
    segment(racine, '2026-11-10', [L('2026-11-10T10:00:00+01:00', 'jour')]);
    const r = nettoyerLeJournal(racine, { maintenant: MAINTENANT });
    expect(segments(racine)).toEqual(['2026-10-30.jsonl', '2026-11-10.jsonl']);
    expect(r.retires.sort()).toEqual(['2026-10-01.jsonl', '2026-10-20.jsonl']);
  });

  it('au-delà de la borne de taille, retire les plus anciens d’abord', () => {
    const racine = projet();
    const ligne = L('2026-11-05T10:00:00+01:00', 'x', { raison: 'r'.repeat(40) });
    for (const j of ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
      segment(racine, j, [ligne]);
    }
    const taille = statSync(path.join(dossierDuJournal(racine), '2026-11-08.jsonl')).size;
    nettoyerLeJournal(racine, { maintenant: MAINTENANT, tailleMax: taille * 2 + 1 });
    expect(segments(racine)).toEqual(['2026-11-07.jsonl', '2026-11-08.jsonl']);
  });

  it('sous les deux bornes, ne retire rien', () => {
    const racine = projet();
    segment(racine, '2026-11-09', [L('2026-11-09T10:00:00+01:00', 'a')]);
    const r = nettoyerLeJournal(racine, { maintenant: MAINTENANT });
    expect(r.retires).toEqual([]);
    expect(segments(racine)).toEqual(['2026-11-09.jsonl']);
  });

  it('ne réécrit aucun segment gardé : ni son contenu ni sa date de modification', () => {
    const racine = projet();
    segment(racine, '2026-10-01', [L('2026-10-01T10:00:00+02:00', 'vieux')]);
    const f = segment(racine, '2026-11-10', [L('2026-11-10T10:00:00+01:00', 'jour')]);
    const passe = new Date('2026-11-10T10:30:00+01:00');
    utimesSync(f, passe, passe);
    const avant = readFileSync(f, 'utf8');
    nettoyerLeJournal(racine, { maintenant: MAINTENANT });
    expect(readFileSync(f, 'utf8')).toBe(avant);
    expect(statSync(f).mtimeMs).toBe(passe.getTime());
  });

  it('une ligne écrite pendant le nettoyage n’est pas perdue : le segment du jour reste', () => {
    const racine = projet();
    segment(racine, '2026-10-01', [L('2026-10-01T10:00:00+02:00', 'vieux')]);
    ecrireLaTrace(
      racine,
      { genre: 'circuit', ticket: 'd-9', etape: '2' },
      { maintenant: MAINTENANT }
    );
    nettoyerLeJournal(racine, { maintenant: MAINTENANT });
    expect(lireLeJournal(racine, {}).lignes.map((l: { ticket: string }) => l.ticket)).toEqual([
      'd-9',
    ]);
  });

  it('ne touche pas au journal d’un autre projet', () => {
    const a = projet();
    const b = projet();
    segment(a, '2026-10-01', [L('2026-10-01T10:00:00+02:00', 'vieux')]);
    segment(b, '2026-10-01', [L('2026-10-01T10:00:00+02:00', 'vieux')]);
    nettoyerLeJournal(a, { maintenant: MAINTENANT });
    expect(segments(a)).toEqual([]);
    expect(segments(b)).toEqual(['2026-10-01.jsonl']);
  });

  it('sans journal, ne lève pas', () => {
    expect(nettoyerLeJournal(projet(), { maintenant: MAINTENANT }).retires).toEqual([]);
  });
});
