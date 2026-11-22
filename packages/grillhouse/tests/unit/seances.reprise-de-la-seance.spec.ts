// A relaunch of an agent on its step resumes its session (scripts/seances.mjs, `seance`). The first
// session of an agent carries an id the circuit keeps (`retenir`); its relaunch on the same step,
// the last attempt aside, resumes it (`--reprise` of the launcher, claude's `--resume`) with the
// short instruction; the last attempt is a fresh and whole session. A resumed session whose sheet
// is refused is asked again once of that same session, with the reason; a resumption that ends in
// error falls back on a fresh and whole session. The launcher here is a program of trial
// (GRILLHOUSE_LANCEUR, in place of lancer.sh) that writes its arguments and its instruction, then
// ranges the sheet of its call.
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

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'seances-reprise-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const seance = seances.seance as (
  ctx: object,
  role: string,
  options: object
) => Promise<{ fiche: Record<string, unknown> | null }>;

const ENTIERE = 'LE TICKET, sa description et ses critères';
const COURTE = 'TA SÉANCE REPRISE';
const FAIT = { statut: 'FAIT' };

interface Appel {
  args: string[];
  consigne: string;
}
// The launcher: its call n writes `args-n` and `prompt-n`, and ranges `fiche-n` as the sheet of the
// session (none for a session without), its exit code `code-n` (0 by default).
const LANCEUR = (dossier: string) => `#!/bin/bash
d=${dossier}/appels
n=$(( $(cat $d/n 2>/dev/null || echo 0) + 1 )); echo $n > $d/n
echo "$*" > $d/args-$n
cp "\${@: -1}" $d/consigne-$n
id=$(echo "$*" | sed -n 's/.*--\\(seance\\|reprise\\) \\([^ ]*\\).*/\\2/p')
r=${dossier}/seances/$id
mkdir -p $r
if [ -f $d/fiche-$n ]; then echo "{\\"structured_output\\": $(cat $d/fiche-$n)}" > $r/resultat.json; fi
echo "$(cat $d/code-$n 2>/dev/null || echo 0)" > $r/fin
`;

// One call of `seance` for <role> with the launcher's sheets <fiches> (a sheet, or a code of
// failure); the calls the launcher got, the effects the call emitted and what it kept to resume.
async function jouer(
  role: string,
  options: object,
  fiches: (object | number)[],
  { description = 'Le critère 1 : la mesure rend le double.', constats = [] as object[] } = {}
) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'seance-'));
  mkdirSync(path.join(dossier, 'appels'));
  const copie = path.join(dossier, 'copie');
  mkdirSync(path.join(copie, 'packages/forms/src'), { recursive: true });
  writeFileSync(
    path.join(copie, 'packages/forms/src/index.mjs'),
    'export const mesure = x => x;\n'
  );
  fiches.forEach((f, i) => {
    if (typeof f === 'number') {
      writeFileSync(path.join(dossier, 'appels', `code-${i + 1}`), `${f}\n`);
    } else {
      writeFileSync(path.join(dossier, 'appels', `fiche-${i + 1}`), JSON.stringify(f));
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
      stdout: cmd === 'show' ? JSON.stringify([{ description, title: 't' }]) : '[]',
      stderr: '',
    }),
  };
  const retenu: unknown[] = [];
  const avant = process.env.GRILLHOUSE_LANCEUR;
  process.env.GRILLHOUSE_LANCEUR = lanceur;
  let rendu;
  try {
    rendu = await seance(ctx, role, {
      tentative: 1,
      derniere: false,
      seanceId: 'neuve-1',
      reprise: null,
      rapport: 'Le rapport des contrôles.',
      constats,
      lectures: { lots: () => [], references: () => [] },
      retenir: (r: unknown) => retenu.push(r),
      prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
      ...options,
    });
  } finally {
    if (avant === undefined) {
      delete process.env.GRILLHOUSE_LANCEUR;
    } else {
      process.env.GRILLHOUSE_LANCEUR = avant;
    }
  }
  const appels = readdirSync(path.join(dossier, 'appels'))
    .filter(f => f.startsWith('args-'))
    .map(f => f.slice('args-'.length))
    .sort()
    .map((n): Appel => ({
      args: readLigne(path.join(dossier, 'appels', `args-${n}`))
        .trim()
        .split(/\s+/),
      consigne: readLigne(path.join(dossier, 'appels', `consigne-${n}`)),
    }));
  const commentaires = ctx.rendus.filter(e => e.genre === 'commentaire').map(e => e.texte ?? '');
  return { rendu, appels, retenu, commentaires };
}
function readLigne(f: string) {
  return readFileSync(f, 'utf8');
}
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
const REPRISE = { agent: 'developpeur', seance: 'premiere-1' };

describe('une relance reprend la séance du même agent, la dernière exceptée', () => {
  it('le développeur relancé sur des contrôles rouges reprend sa première séance, l’instruction courte', async () => {
    const { appels, retenu } = await jouer('developpeur', { tentative: 2, reprise: REPRISE }, [
      FAIT,
    ]);
    expect(appels).toHaveLength(1);
    expect(valeur(appels[0].args, '--reprise')).toBe('premiere-1');
    expect(appels[0].args).not.toContain('--seance');
    const courte = appels[0].consigne;
    expect(courte).toContain(COURTE);
    expect(courte).not.toContain(ENTIERE);
    expect(courte).toContain('TON TICKET : demo-1');
    expect(courte).toContain('TON PLAN : packages/forms');
    expect(courte).toContain('Le rapport des contrôles.');
    expect(courte).toContain('les contrôles, joués après ta séance, sont rouges');
    expect(courte).toContain('Ta séance finit sur ta fiche');
    expect(courte).not.toContain("## Ce que les composants d'avant publient");
    expect(retenu).toEqual([]);
  });

  it('le testwriter relancé sur une preuve refusée reprend sa séance, la preuve nommée dans l’instruction', async () => {
    const { appels } = await jouer(
      'testwriter',
      {
        tentative: 2,
        reprise: { agent: 'testwriter', seance: 'tw-1' },
        rapport:
          'Tests qui portent le travail, verts avant le code : critère 1 — mesure rend un nombre',
      },
      [FAIT]
    );
    expect(valeur(appels[0].args, '--reprise')).toBe('tw-1');
    expect(appels[0].consigne).toContain(COURTE);
    expect(appels[0].consigne).toContain(
      'la preuve du rouge, jouée après ta séance, refuse ton lot'
    );
    expect(appels[0].consigne).toContain('Tests qui portent le travail, verts avant le code');
  });

  it('la dernière séance est neuve et entière, sous un id neuf que le circuit garde, sur le modèle fort', async () => {
    const { appels, retenu } = await jouer(
      'developpeur',
      { tentative: 3, derniere: true, fort: true, reprise: REPRISE, seanceId: 'derniere-3' },
      [FAIT]
    );
    expect(valeur(appels[0].args, '--seance')).toBe('derniere-3');
    expect(appels[0].args).not.toContain('--reprise');
    expect(valeur(appels[0].args, '--modele')).toBe('opus');
    expect(appels[0].consigne).toContain(ENTIERE);
    expect(retenu).toEqual([{ agent: 'developpeur', seance: 'derniere-3' }]);
  });

  it('la première séance d’un agent est neuve, sous l’id que le circuit garde pour la reprendre', async () => {
    const { appels, retenu } = await jouer('developpeur', { tentative: 1, seanceId: 'un-1' }, [
      FAIT,
    ]);
    expect(valeur(appels[0].args, '--seance')).toBe('un-1');
    expect(appels[0].consigne).toContain(ENTIERE);
    expect(retenu).toEqual([{ agent: 'developpeur', seance: 'un-1' }]);
  });

  it('la séance gardée d’un autre agent n’est pas reprise : une séance neuve et entière', async () => {
    const { appels } = await jouer(
      'developpeur',
      { tentative: 2, reprise: { agent: 'testwriter', seance: 'tw-1' }, seanceId: 'dev-2' },
      [FAIT]
    );
    expect(valeur(appels[0].args, '--seance')).toBe('dev-2');
    expect(appels[0].consigne).toContain(ENTIERE);
  });

  it('une reprise qui finit en erreur retombe sur une séance neuve et entière, dite au ticket', async () => {
    const { appels, commentaires, rendu } = await jouer(
      'developpeur',
      { tentative: 2, reprise: REPRISE, seanceId: 'neuve-2' },
      [1, FAIT],
      { description: 'Le critère 1 : la mesure rend le double.' }
    );
    expect(appels).toHaveLength(2);
    expect(valeur(appels[0].args, '--reprise')).toBe('premiere-1');
    expect(valeur(appels[1].args, '--seance')).toBe('neuve-2');
    expect(appels[1].args).not.toContain('--reprise');
    expect(appels[1].consigne).toContain(ENTIERE);
    expect(appels[1].consigne).toContain('Le critère 1 : la mesure rend le double.');
    expect(commentaires).toContainEqual(
      expect.stringMatching(
        /^Circuit · developpeur : reprise de la séance premiere-1 finie en erreur : séance neuve et entière\./
      )
    );
    expect(rendu.fiche).toMatchObject({ statut: 'FAIT' });
  });

  it('une séance reprise dont la fiche est refusée est redemandée une fois à la même séance, avec la raison', async () => {
    const fiche = (piece: string) => ({
      statut: 'BESOIN',
      question: 'la garde demande un arbitrage : trancher isHeadLayer ?',
      piece,
    });
    const { appels, commentaires, rendu } = await jouer(
      'developpeur',
      { tentative: 2, reprise: REPRISE },
      [fiche('packages/forms/src/native.ts:234'), fiche('packages/forms/src/index.mjs:1')]
    );
    expect(appels).toHaveLength(2);
    expect(valeur(appels[0].args, '--reprise')).toBe('premiere-1');
    expect(valeur(appels[1].args, '--reprise')).toBe('premiere-1');
    expect(appels[1].args).not.toContain('--seance');
    expect(appels[1].consigne).not.toContain(ENTIERE);
    expect(appels[1].consigne).toContain(
      'piece : packages/forms/src/native.ts:234 introuvable dans la copie'
    );
    expect(commentaires).toContainEqual(
      expect.stringMatching(/^Circuit · developpeur : séance finie sans fiche conforme/)
    );
    expect(commentaires).not.toContainEqual(expect.stringMatching(/séance neuve et entière/));
    expect(rendu.fiche).toMatchObject({ statut: 'BESOIN' });
  });
});
