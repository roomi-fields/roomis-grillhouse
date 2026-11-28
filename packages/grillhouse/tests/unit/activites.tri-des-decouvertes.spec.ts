// The tri of the discoveries at the end of a ticket (scripts/activites.mjs, `trier`): none filed, no
// session and nothing written; a sheet that conforms, each verdict written at the ticket of its
// discovery, its labels set, an a-porter or a non-confirmee reopened; a sheet missing a discovery,
// asked again once, then the discoveries left as they are, said at the ticket. Claude is a program
// of trial that prints the sheet it is told to; the effects the tri emits are gathered in the
// context, as the workflow of a ticket gathers them.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lireLEntree } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tri-des-decouvertes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Effet {
  genre: string;
  ticket?: string;
  texte?: string;
  debut?: string;
  etiquettes?: string[];
  entree?: { etape?: string; tri?: Record<string, unknown>; decouverte?: object };
  ecritures?: { decouverte: string; rouvre: boolean }[];
}
const trier = activites.trier as (ctx: object) => Promise<void>;

const sortie = (fiche: unknown) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    session_id: 'abc',
    structured_output: fiche,
  });

const environnement = { ...process.env };
beforeEach(() => {
  process.env.GRILLHOUSE_REGISTRE = path.join(ESSAIS, 'registre.jsonl');
});
afterEach(() => {
  for (const k of ['CLAUDE_BIN', 'GRILLHOUSE_REGISTRE']) {
    if (environnement[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = environnement[k];
    }
  }
});

// A context whose ticket filed the discoveries <sujets> (as `demo-1.1`, `demo-1.2`…), and a claude
// that prints <fiche> at each call; `appels` counts the calls of bd.
function contexte(sujets: string[], fiche: unknown) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'essai-'));
  // What the stand-in and the circuit write lies out of the main tree: the lot of the session of
  // the tri, judged on that tree, stays empty.
  const dehors = mkdtempSync(path.join(ESSAIS, 'dehors-'));
  const faux = path.join(dossier, 'claude');
  // What the session sees: its directory, its arguments, its instruction.
  const vu = path.join(dehors, 'vu');
  mkdirSync(vu);
  writeFileSync(
    faux,
    `#!/bin/sh\npwd > '${vu}/pwd'\nprintf '%s\\n' "$@" > '${vu}/args'\ncat > '${vu}/prompt'\ncat <<'FICHE'\n${sortie(fiche)}\nFICHE\n`
  );
  // The piece of a verdict is read in the copy: the line it names.
  mkdirSync(path.join(dossier, 'packages/forms/src'), { recursive: true });
  writeFileSync(
    path.join(dossier, 'packages/forms/src/index.mjs'),
    'export const mesure = x => 2 * x;\n'
  );
  chmodSync(faux, 0o755);
  // The main tree holds the commit the queue integrated for the ticket.
  const git = (...a: string[]) => {
    const r = spawnSync('git', ['-C', dossier, ...a], { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(`git ${a.join(' ')} : ${r.stderr}`);
    }
    return r.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'essai@example.com');
  git('config', 'user.name', 'essai');
  git('add', 'packages');
  git('commit', '-q', '-m', 'feat(forms): La mesure (demo-1)');
  const integre = git('log', '-1', '--format=%h');
  process.env.CLAUDE_BIN = faux;
  const appels: string[][] = [];
  const ctx = {
    racine: dossier,
    // The copy of the ticket is gone: the queue removed it at the closure.
    copie: path.join(dossier, 'copie-retiree'),
    ticket: 'demo-1',
    sujet: 'La mesure',
    paquets: ['.'],
    tmp: path.join(dehors, 'tmp'),
    journal: path.join(dehors, 'journal'),
    fiches: path.join(dehors, 'fiches.jsonl'),
    transcriptions: path.join(dehors, 'transcriptions'),
    immobileMs: 60_000,
    rendus: [
      ...sujets.map((sujet, i) => ({
        genre: 'fiche',
        entree: { role: 'circuit', decouverte: { id: `demo-1.${i + 1}`, sujet } },
      })),
    ] as Effet[],
    bd: (...a: string[]) => {
      appels.push(a);
      return {
        status: 0,
        stdout: JSON.stringify([{ close_reason: `intégré : ${integre}` }]),
        stderr: '',
      };
    },
  };
  return { ctx, appels, vu, dossier, integre };
}
const lignes = (v: Record<string, unknown>[]) => ({ verdicts: v });
const porter = (n: number) => ({
  decouverte: `demo-1.${n}`,
  verdict: 'a-porter',
  texte: 'mesure(0) rend 0.',
  piece: 'packages/forms/src/index.mjs:1 rend 2 * x.',
});
const doublon = (n: number) => ({ decouverte: `demo-1.${n}`, verdict: 'doublon', texte: 'de x' });
const effets = (ctx: { rendus: Effet[] }, genre: string) =>
  ctx.rendus.filter(e => e.genre === genre);

describe('le tri des découvertes en fin de ticket', () => {
  it('un ticket sans découverte ne lance aucune séance et n’écrit rien', async () => {
    const { ctx, appels } = contexte([], lignes([]));
    await trier(ctx);
    expect(appels).toEqual([]);
    expect(ctx.rendus).toEqual([]);
  });

  it('une fiche qui conforme écrit chaque verdict au ticket de sa découverte, ses étiquettes, et rouvre l’a-porter', async () => {
    const { ctx } = contexte(
      ['La mesure de zéro', 'Le nom'],
      lignes([porter(1), { decouverte: 'demo-1.2', verdict: 'sans-suite', texte: 'hypothétique.' }])
    );
    await trier(ctx);
    expect(
      effets(ctx, 'commentaire')
        .filter(e => e.ticket !== 'demo-1')
        .map(e => [e.ticket, e.texte])
    ).toEqual([
      [
        'demo-1.1',
        'Circuit · tri : a-porter — mesure(0) rend 0. (packages/forms/src/index.mjs:1 rend 2 * x.) ; rouverte sous a-valider, pour le responsable.',
      ],
      ['demo-1.2', 'Circuit · tri : sans-suite — hypothétique.'],
    ]);
    expect(effets(ctx, 'etiquettes').map(e => [e.ticket, e.etiquettes])).toEqual([
      ['demo-1.1', ['a-porter', 'a-valider']],
      ['demo-1.2', ['sans-suite']],
    ]);
    expect(effets(ctx, 'reouverture').map(e => e.ticket)).toEqual(['demo-1.1']);
    expect(effets(ctx, 'resume-du-tri')[0]?.debut).toBe(
      'Circuit · tri : 2 découvertes triées — 1 sans-suite, 1 a-porter'
    );
    expect(effets(ctx, 'fiche').find(e => e.entree?.etape === 'tri')?.entree?.tri).toEqual({
      decouvertes: 2,
      conforme: true,
      verdicts: { 'sans-suite': 1, 'a-porter': 1 },
    });
  });

  it('la séance du tri part de l’arbre principal, sur le commit que la file a intégré, avec toute commande, aucune écriture au ticket, et sous le schéma du tri', async () => {
    const { ctx, vu, dossier, integre } = contexte(['La mesure de zéro'], lignes([doublon(1)]));
    await trier(ctx);
    expect(realpathSync(readFileSync(path.join(vu, 'pwd'), 'utf8').trim())).toBe(
      realpathSync(dossier)
    );
    const args = readFileSync(path.join(vu, 'args'), 'utf8').split('\n');
    const valeur = (option: string) => args[args.indexOf(option) + 1];
    expect(valeur('--agent')).toBe('explorateur');
    expect(valeur('--model')).toBe('sonnet');
    expect(JSON.parse(valeur('--json-schema') ?? 'null')).toMatchObject({
      properties: { verdicts: expect.anything() as unknown },
    });
    const { permissions } = JSON.parse(valeur('--settings') ?? '{}') as {
      permissions: { allow: string[]; deny: string[] };
    };
    expect(permissions.allow).toContain('Bash');
    expect(permissions.deny).toContain('Bash(bd comments add*)');
    const recu = readFileSync(path.join(vu, 'prompt'), 'utf8');
    const prompt = lireLEntree(recu)?.consigne ?? recu;
    expect(prompt).toContain('demo-1.1 — La mesure de zéro');
    expect(prompt).toContain(`SON COMMIT SUR MAIN : ${integre} feat(forms): La mesure (demo-1)`);
  });

  it('une fiche sans ligne pour une découverte laisse les découvertes telles quelles et le dit au ticket', async () => {
    const { ctx } = contexte(['La mesure de zéro', 'La mesure négative'], lignes([doublon(1)]));
    await trier(ctx);
    for (const genre of ['etiquettes', 'reouverture', 'resume-du-tri']) {
      expect(effets(ctx, genre), genre).toEqual([]);
    }
    expect(
      effets(ctx, 'commentaire')
        .map(e => e.texte)
        .filter(t => t?.startsWith('Circuit · tri'))
    ).toEqual([
      expect.stringMatching(
        /^Circuit · tri : le tri ne rend pas de fiche conforme \(.*sans ligne pour demo-1\.2.*\) : les 2 découvertes restent telles quelles ; l'intégration tient\.$/
      ),
    ]);
    expect(effets(ctx, 'fiche').find(e => e.entree?.etape === 'tri')?.entree?.tri).toEqual({
      decouvertes: 2,
      conforme: false,
      verdicts: {},
    });
  });
});
