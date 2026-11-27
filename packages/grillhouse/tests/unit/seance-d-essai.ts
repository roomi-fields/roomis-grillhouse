import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { composantsLisibles } from '../../scripts/ticket-du-circuit.mjs';
import { resoudreComposant } from '../../scripts/depart-du-ticket.mjs';
import { poserLeFauxProgramme } from './faux-programme.js';

// The trial world of the sessions of the circuit played small: a trial git repository of two
// packages (`000-forms`, `030-binder`), the context of a circuit whose effects are gathered
// (`rendus`) instead of written, a stand-in for claude (`CLAUDE_BIN`, the sessions out of the
// envelope: the explorateur, the questionneur, the reviewer) and one for the launcher
// (`GRILLHOUSE_LANCEUR`, the sessions of the envelope: the testwriter, the developpeur). Each
// stand-in keeps, for its n-th call, its arguments (`args-<n>`, NUL-separated) and the
// instruction it received (`prompt-<n>`), writes the transcript of its session as claude does
// (`<id>.jsonl` among the transcripts of the copy), and answers with the sheet `fiche-<n>` the
// test wrote, none when it wrote none.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'seance-d-essai-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Effet {
  genre: string;
  [cle: string]: unknown;
}
interface Contexte {
  racine: string;
  copie: string;
  ticket: string;
  sujet: string;
  paquets: string[];
  tmp: string;
  journal: string;
  fiches: string;
  transcriptions: string;
  immobileMs: number;
  contexte?: string;
  rendus: Effet[];
  courant?: { question?: { piece: string }; raison?: string };
  bd: (...a: string[]) => { status: number; stdout: string; stderr: string };
  resoudre: (nom: string) => string;
  [cle: string]: unknown;
}

export const DESCRIPTION = [
  '## Architecture',
  '',
  'La mesure vit dans chaque composant.',
  '',
  "## Critères d'acceptation",
  '',
  '1. `mesure` rend le double de sa valeur.',
].join('\n');
const TITRE = 'demo-1 — La mesure — 000-forms';

const CHARTE = [
  '# Essai',
  '',
  '## Comment on arbitre',
  '',
  'Un tableur mûr calcule chaque mesure une fois.',
  '',
  '## Ce qui monte au superviseur',
  '',
  'Le format publié de la mesure.',
  '',
  '## Commandes',
  '',
  'npm test',
  '',
].join('\n');

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
};
const ecrire = (dossier: string, rel: string, texte: string) => {
  mkdirSync(path.dirname(path.join(dossier, rel)), { recursive: true });
  writeFileSync(path.join(dossier, rel), texte);
};

export interface Monde {
  ctx: Contexte;
  /** Writes the sheet the n-th call of the stand-ins answers (the next one, in order). */
  fiche: (fiche: object | string) => void;
  /**
   * The shell commands the session of the n-th call plays before its sheet (the next one, in
   * order), in the folder it works in: the ticket's copy for a session of the envelope, its working
   * directory for a session out of it.
   */
  geste: (commandes: string, rang?: number) => void;
  /**
   * What the stand-in for the launcher does at the n-th call before the session: it plays
   * <commandes> in the ticket's copy, as the preparation of the copy, then writes the tree the copy
   * holds to `avant` in the folder of the session, as lancer.sh does.
   */
  preparation: (commandes: string, rang: number) => void;
  /** A commit of main, which writes <texte> in the file <rel> while the ticket's copy lives. */
  surMain: (rel: string, texte: string) => void;
  /** Writes the passations and the ticket as bd shows them. */
  ticket: (t: { description?: string; notes?: string; titre?: string }) => void;
  passations: (c: { author: string; text: string }[]) => void;
  /** The instruction the n-th call received. */
  prompt: (n: number) => string;
  /** The arguments of the n-th call. */
  args: (n: number) => string[];
  appels: () => number;
  /** Plays <f> with the stand-ins in place of claude and of the launcher. */
  jouer: <T>(f: () => Promise<T>) => Promise<T>;
  /** The comments the circuit emitted, their text. */
  commentaires: () => string[];
  /** The effect `plan` last emitted, with the title and the description it writes. */
  planEcrit: () => { titre: string | null; description: string | null } | undefined;
}

/** `copie`: the ticket's copy is a git worktree of its own (the reviewer's lot is read there). */
export function monde({ copie: avecCopie = false } = {}): Monde {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  ecrire(racine, 'package.json', JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }));
  ecrire(racine, 'docs/ARCHITECTURE.md', architecture());
  ecrire(racine, 'CLAUDE.md', CHARTE);
  ecrire(racine, '.beads/config.yaml', 'issue-prefix: demo\n');
  for (const [dossier, nom] of [
    ['forms', '000-forms'],
    ['binder', '030-binder'],
  ]) {
    ecrire(
      racine,
      `packages/${dossier}/package.json`,
      JSON.stringify({ name: nom, type: 'module', scripts: { 'test:unit': 'vitest run' } })
    );
    ecrire(racine, `packages/${dossier}/src/index.mjs`, 'export const mesure = x => x;\n');
  }
  ecrire(racine, '.gitignore', '.claude/worktrees/\n');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = avecCopie ? path.join(racine, '.claude/worktrees/demo-1') : racine;
  if (avecCopie) {
    git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  }

  const sorties = mkdtempSync(path.join(ESSAIS, 'sorties-'));
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  const lire = (f: string) => readFileSync(path.join(sorties, f), 'utf8');
  const nombre = (prefixe: string) =>
    readdirSync(sorties).filter(f => f.startsWith(prefixe)).length;
  const faux = path.join(sorties, 'claude');
  const lanceur = path.join(sorties, 'lancer.sh');
  poserLeFauxProgramme(
    faux,
    `#!/bin/bash
d=${sorties}
n=$(( $(ls $d | grep -c '^prompt-') + 1 ))
cat > $d/prompt-$n
printf '%s\\0' "$@" > $d/args-$n
if [ -f $d/geste-$n ]; then bash $d/geste-$n >&2 || exit 9; fi
avant=; for a in "$@"; do case "$avant" in --session-id|--resume) id=$a;; esac; avant=$a; done
mkdir -p ${tmp}/transcriptions; echo '{}' > ${tmp}/transcriptions/$id.jsonl
if [ -f $d/fiche-$n ]; then echo "{\\"type\\":\\"result\\",\\"session_id\\":\\"s\\",\\"structured_output\\": $(cat $d/fiche-$n)}"; fi
`
  );
  poserLeFauxProgramme(
    lanceur,
    `#!/bin/bash
d=${sorties}
n=$(( $(ls $d | grep -c '^prompt-') + 1 ))
printf '%s\\0' "$@" > $d/args-$n
for a in "$@"; do dernier=$a; done
cp "$dernier" $d/prompt-$n
id=$(echo "$*" | sed -n 's/.*--\\(seance\\|reprise\\) \\([^ ]*\\).*/\\2/p')
r=${tmp}/seances/$id
mkdir -p $r
if [ -f $d/preparation-$n ]; then
  (cd ${copie} && bash $d/preparation-$n >&2) || exit 9
  # The tree through an index of its own, in the form lancer.sh writes: { arbre, tete }.
  (cd ${copie} && export GIT_INDEX_FILE=$d/index-$n && cp "$(env -u GIT_INDEX_FILE git rev-parse --absolute-git-dir)/index" $GIT_INDEX_FILE && git add -A && printf '{"arbre":"%s","tete":"%s"}' "$(git write-tree)" "$(git rev-parse HEAD)") > $r/avant || exit 9
fi
if [ -f $d/geste-$n ]; then (cd ${copie} && bash $d/geste-$n >&2) || exit 9; fi
mkdir -p ${tmp}/transcriptions; echo '{}' > ${tmp}/transcriptions/$id.jsonl
if [ -f $d/fiche-$n ]; then echo "{\\"structured_output\\": $(cat $d/fiche-$n)}" > $r/resultat.json; else echo '{}' > $r/resultat.json; fi
echo 0 > $r/fin
`
  );

  let ticket = { description: DESCRIPTION, notes: '', titre: TITRE };
  let commentairesDuTicket: { author: string; text: string }[] = [];
  const base = racine;
  const ctx: Contexte = {
    racine,
    copie,
    ticket: 'demo-1',
    sujet: 'La mesure',
    paquets: ['packages/forms'],
    tmp,
    journal: path.join(tmp, 'journal'),
    fiches: path.join(tmp, 'fiches.jsonl'),
    transcriptions: path.join(tmp, 'transcriptions'),
    immobileMs: 60_000,
    essaiDeLActe: 1,
    rendus: [],
    bd: (cmd: string) => ({
      status: 0,
      stdout:
        cmd === 'show'
          ? JSON.stringify([
              {
                description: ticket.description,
                notes: ticket.notes,
                title: ticket.titre,
                labels: [],
              },
            ])
          : cmd === 'comments'
            ? JSON.stringify(commentairesDuTicket)
            : '[]',
      stderr: '',
    }),
    resoudre: (nom: string) => resoudreComposant(composantsLisibles(base), base, nom),
  };

  return {
    ctx,
    fiche: f =>
      writeFileSync(
        path.join(sorties, `fiche-${nombre('fiche-') + 1}`),
        typeof f === 'string' ? f : JSON.stringify(f)
      ),
    ticket: t => {
      // What the circuit emitted at the ticket is written there: the ticket as bd holds it now.
      ctx.rendus = ctx.rendus.filter(e => e.genre !== 'plan');
      ticket = { ...ticket, ...t };
    },
    geste: (commandes, rang) =>
      writeFileSync(
        path.join(sorties, `geste-${rang ?? nombre('geste-') + 1}`),
        `set -e\n${commandes}\n`
      ),
    preparation: (commandes, rang) =>
      writeFileSync(path.join(sorties, `preparation-${rang}`), `set -e\n${commandes}\n`),
    surMain: (rel, texte) => {
      ecrire(racine, rel, texte);
      git(racine, 'add', rel);
      git(racine, 'commit', '-q', '-m', 'de-main');
    },
    passations: c => {
      commentairesDuTicket = c;
    },
    prompt: n => lire(`prompt-${n}`),
    args: n => lire(`args-${n}`).split('\0').slice(0, -1),
    appels: () => nombre('prompt-'),
    commentaires: () => ctx.rendus.filter(e => e.genre === 'commentaire').map(e => String(e.texte)),
    planEcrit: () =>
      ctx.rendus.filter(e => e.genre === 'plan').at(-1) as
        { titre: string | null; description: string | null } | undefined,
    jouer: async f => {
      const avant = { ...process.env };
      Object.assign(process.env, {
        CLAUDE_BIN: faux,
        GRILLHOUSE_LANCEUR: lanceur,
        GRILLHOUSE_REGISTRE: path.join(tmp, 'registre.jsonl'),
        GRILLHOUSE_PLACE_TENUE: 'essai',
        ANTHROPIC_API_KEY: 'essai',
      });
      try {
        return await f();
      } finally {
        for (const k of [
          'CLAUDE_BIN',
          'GRILLHOUSE_LANCEUR',
          'GRILLHOUSE_REGISTRE',
          'GRILLHOUSE_PLACE_TENUE',
          'ANTHROPIC_API_KEY',
        ]) {
          if (avant[k] === undefined) {
            delete process.env[k];
          } else {
            process.env[k] = avant[k];
          }
        }
      }
    },
  };
}
