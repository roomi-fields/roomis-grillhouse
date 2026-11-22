// A session is resumed only when claude holds its conversation (scripts/seances.mjs,
// `jusquALaFiche`). A session whose launch ends in error before claude opens its conversation
// leaves no transcript under its id: there is nothing to
// resume, and no sheet missed by the agent. Its relaunch is then a fresh launch, under the same
// id, with the whole instruction of its role, once, said at the ticket; the fresh session keeps
// its own resumption. The launcher here is a program of trial (GRILLHOUSE_LANCEUR, in place of
// lancer.sh) that writes its arguments and its instruction, the transcript of a session that ran,
// as claude does, then ranges the sheet of its call.
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'seances-introuvable-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const seance = seances.seance as (
  ctx: object,
  role: string,
  options: object
) => Promise<{ fiche: Record<string, unknown> | null }>;

const ENTIERE = 'LE TICKET, sa description et ses critères';
const FAIT: Appel = { fiche: { statut: 'FAIT' } };
const ID = 'ed43463f-fd06-4bb1-83ca-ff8610218c7c';
// What a call of the launcher does: the sheet it ranges, its exit code (0 by default), and
// whether it ends before claude opens a conversation, with no transcript of its session.
interface Appel {
  fiche?: object;
  code?: number;
  mort?: boolean;
}
// The launch ends in error before claude opens a conversation: no transcript of its session.
const MORT: Appel = { code: 1, mort: true };
// A session that ran and ended in error.
const ERREUR: Appel = { code: 1 };

// The launcher: its call n writes `args-n` and `consigne-n`, the transcript of its session
// unless `mort-n` is there, and ranges `fiche-n` as the sheet of the session (none without), its
// exit code `code-n` (0 by default).
const LANCEUR = (dossier: string) => `#!/bin/bash
d=${dossier}/appels
n=$(( $(cat $d/n 2>/dev/null || echo 0) + 1 )); echo $n > $d/n
echo "$*" > $d/args-$n
cp "\${@: -1}" $d/consigne-$n
id=$(echo "$*" | sed -n 's/.*--\\(seance\\|reprise\\) \\([^ ]*\\).*/\\2/p')
r=${dossier}/seances/$id
mkdir -p $r
if [ ! -f $d/mort-$n ]; then echo '{}' > ${dossier}/transcriptions/$id.jsonl; fi
if [ -f $d/fiche-$n ]; then echo "{\\"structured_output\\": $(cat $d/fiche-$n)}" > $r/resultat.json; fi
echo "$(cat $d/code-$n 2>/dev/null || echo 0)" > $r/fin
`;

// One call of `seance` for the developpeur, the launcher answering <reponses> in order: the
// calls it got, the comments the circuit emitted, and the sheet or the stop of the call.
async function jouer(reponses: Appel[]) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'seance-'));
  mkdirSync(path.join(dossier, 'appels'));
  const copie = path.join(dossier, 'copie');
  mkdirSync(path.join(copie, 'packages/forms/src'), { recursive: true });
  reponses.forEach((r, i) => {
    const ecrire = (nom: string, texte: string) =>
      writeFileSync(path.join(dossier, 'appels', `${nom}-${i + 1}`), texte);
    if (r.fiche) {
      ecrire('fiche', JSON.stringify(r.fiche));
    }
    if (r.code !== undefined) {
      ecrire('code', `${r.code}\n`);
    }
    if (r.mort) {
      ecrire('mort', '');
    }
  });
  const lanceur = path.join(dossier, 'lancer.sh');
  writeFileSync(lanceur, LANCEUR(dossier));
  chmodSync(lanceur, 0o755);
  const ctx = {
    racine: dossier,
    copie,
    ticket: 'demo-1',
    sujet: 'essai',
    paquets: ['packages/forms'],
    tmp: dossier,
    journal: path.join(dossier, 'journal'),
    fiches: path.join(dossier, 'fiches.jsonl'),
    transcriptions: path.join(dossier, 'transcriptions'),
    immobileMs: 60_000,
    essaiDeLActe: 1,
    rendus: [] as { genre: string; texte?: string }[],
    bd: (cmd: string) => ({
      status: 0,
      stdout:
        cmd === 'show' ? JSON.stringify([{ description: 'Le critère 1.', title: 't' }]) : '[]',
      stderr: '',
    }),
  };
  // The sessions of the ticket before this one wrote their transcripts.
  mkdirSync(ctx.transcriptions);
  writeFileSync(path.join(ctx.transcriptions, 'avant.jsonl'), '{}\n');
  const avant = process.env.GRILLHOUSE_LANCEUR;
  process.env.GRILLHOUSE_LANCEUR = lanceur;
  let rendu: { fiche: Record<string, unknown> | null } | null = null;
  let arret: { nom?: string; message?: string } | null = null;
  try {
    rendu = await seance(ctx, 'developpeur', {
      tentative: 1,
      derniere: false,
      seanceId: ID,
      reprise: null,
      rapport: 'aucun',
      constats: [],
      lectures: { lots: () => [], references: () => [] },
      retenir: () => {},
      prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
    });
  } catch (e) {
    arret = e as { nom?: string; message?: string };
  } finally {
    if (avant === undefined) {
      delete process.env.GRILLHOUSE_LANCEUR;
    } else {
      process.env.GRILLHOUSE_LANCEUR = avant;
    }
  }
  const lire = (f: string) => readFileSync(path.join(dossier, 'appels', f), 'utf8');
  const appels = readdirSync(path.join(dossier, 'appels'))
    .filter(f => f.startsWith('args-'))
    .map(f => Number(f.slice('args-'.length)))
    .sort((a, b) => a - b)
    .map(n => ({ args: lire(`args-${n}`).trim().split(/\s+/), consigne: lire(`consigne-${n}`) }));
  const commentaires = ctx.rendus.filter(e => e.genre === 'commentaire').map(e => e.texte ?? '');
  return { rendu, arret, appels, commentaires };
}
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;

describe('une séance sans conversation à reprendre repart neuve', () => {
  it('le lancement finit en erreur avant que claude n’ouvre sa conversation : sa relance est un lancement neuf, sous son id, la consigne entière, dit au ticket', async () => {
    const { rendu, arret, appels, commentaires } = await jouer([MORT, FAIT]);
    expect(arret).toBeNull();
    expect(appels).toHaveLength(2);
    expect(valeur(appels[0].args, '--seance')).toBe(ID);
    expect(valeur(appels[1].args, '--seance')).toBe(ID);
    expect(appels[1].args).not.toContain('--reprise');
    expect(appels[1].consigne).toContain(ENTIERE);
    expect(appels[1].consigne).toBe(appels[0].consigne);
    expect(rendu?.fiche).toMatchObject({ statut: 'FAIT' });
    expect(commentaires).toContainEqual(
      `Circuit · developpeur : aucune conversation à reprendre sous la séance ${ID} : séance neuve et entière.`
    );
  });

  it('la séance repartie neuve garde sa reprise : sans fiche, elle est redemandée une fois à la même séance', async () => {
    const { rendu, arret, appels } = await jouer([MORT, { code: 0 }, FAIT]);
    expect(arret).toBeNull();
    expect(appels).toHaveLength(3);
    expect(valeur(appels[1].args, '--seance')).toBe(ID);
    expect(valeur(appels[2].args, '--reprise')).toBe(ID);
    expect(appels[2].consigne).not.toContain(ENTIERE);
    expect(appels[2].consigne).toContain('sans fiche conforme');
    expect(rendu?.fiche).toMatchObject({ statut: 'FAIT' });
  });

  it('une séance ne repart neuve qu’une fois : deux lancements morts, puis sa reprise, et l’arrêt « sans-fiche »', async () => {
    const { arret, appels } = await jouer([MORT, MORT, MORT, FAIT]);
    expect(appels).toHaveLength(3);
    expect(valeur(appels[1].args, '--seance')).toBe(ID);
    expect(valeur(appels[2].args, '--reprise')).toBe(ID);
    expect(arret?.nom).toBe('sans-fiche');
  });

  it('une séance qui a tourné et finit en erreur est reprise, la même : deux lancements, puis « sans-fiche »', async () => {
    const { arret, appels, commentaires } = await jouer([ERREUR, ERREUR, FAIT]);
    expect(appels).toHaveLength(2);
    expect(valeur(appels[1].args, '--reprise')).toBe(ID);
    expect(arret?.nom).toBe('sans-fiche');
    expect(commentaires).not.toContainEqual(expect.stringMatching(/séance neuve et entière/));
  });
});
