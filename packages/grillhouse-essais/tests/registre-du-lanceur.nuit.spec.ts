// @poste: l'enveloppe bwrap
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { projetDuLanceur } from './enveloppe-essai.js';
import { temporaireDuFichier } from './temporaire-du-fichier.js';
import { RACINE, copierLesScripts } from './cadre.js';

// The launcher run by a test with no trial home writes the end-of-session line (registre.mjs
// --copie, run outside the envelope in the environment the test gives it) in the trial register
// the base configuration names, never in the workstation's.
// The launcher needs a repository under the home: the envelope hides the temp directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-registre-lanceur-');
const REPO = path.join(ESSAIS, 'depot');
const POSTE = path.join(userInfo().homedir, '.claude', 'grillhouse', 'registre.jsonl');
const LAUNCHER = path.join(RACINE, 'packages/grillhouse/scripts/enveloppe/lancer.sh');
const SCRIPT = path.join(RACINE, 'packages/grillhouse/scripts/enveloppe/enveloppe.mjs');
const FAUX = path.join(REPO, 'faux-claude.sh');
// The project directory of the copy, where the stand-in leaves its transcript (under the real home,
// which the test removes at the end).
const COPIE = path.join(REPO, '.claude/worktrees/demo-registre');
const PROJET = path.join(
  userInfo().homedir,
  '.claude',
  'projects',
  COPIE.replace(/[^A-Za-z0-9]/g, '-')
);
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => rmSync(PROJET, { recursive: true, force: true }));
temporaireDuFichier();

const taille = (f: string) => (existsSync(f) ? statSync(f).size : 0);

// The envelope as a test repository holds it: enveloppe.mjs and every module it imports.
function installerEnveloppe(repo: string) {
  const vus = new Set<string>();
  const suivre = (fichier: string) => {
    if (vus.has(fichier)) {
      return;
    }
    vus.add(fichier);
    const cible = path.join(repo, path.relative(RACINE, fichier));
    mkdirSync(path.dirname(cible), { recursive: true });
    execFileSync('cp', [fichier, cible]);
    const source = readFileSync(fichier, 'utf8');
    for (const [, spec] of source.matchAll(
      /^\s*(?:import|export)\b[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm
    )) {
      suivre(path.resolve(path.dirname(fichier), spec));
    }
  };
  suivre(SCRIPT);
}

describe.runIf(canWrap)('the launcher run with no trial home and the register', () => {
  it('writes the line of the session in the trial register and leaves the workstation register as it was', () => {
    mkdirSync(path.join(REPO, 'packages/a/src'), { recursive: true });
    mkdirSync(path.join(REPO, '.claude/agents'), { recursive: true });
    writeFileSync(path.join(REPO, 'packages/a/src/a.ts'), 'a');
    writeFileSync(
      path.join(REPO, '.claude/agents/developpeur.md'),
      '---\nname: developpeur\nmodel: sonnet\neffort: medium\n---\n'
    );
    projetDuLanceur(REPO);
    installerEnveloppe(REPO);
    copierLesScripts(['registre.mjs'], path.join(REPO, 'scripts'));
    // A stand-in for claude that leaves a transcript in the project directory of its copy.
    writeFileSync(
      FAUX,
      [
        '#!/bin/bash',
        'd="$HOME/.claude/projects/$(pwd | sed "s/[^A-Za-z0-9]/-/g")"',
        'd="${d%-packages-a}"',
        'mkdir -p "$d"',
        'printf \'%s\\n\' \'{"type":"user","timestamp":"2026-10-14T10:00:00Z","message":{"content":"TON TICKET : demo-registre — x"}}\' \'{"type":"assistant","timestamp":"2026-10-14T10:01:00Z","message":{"id":"m","usage":{"input_tokens":5,"output_tokens":5}}}\' > "$d/s-registre.jsonl"',
        'cat > /dev/null',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );
    execFileSync('git', ['init', '-q', REPO]);
    execFileSync('git', ['-C', REPO, 'add', '.']);
    execFileSync('git', [
      '-C',
      REPO,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-qm',
      'i',
    ]);
    const consigne = path.join(REPO, 'demo-registre.txt');
    writeFileSync(consigne, 'TON TICKET : demo-registre — un sujet.');

    const registreDEssai = process.env.GRILLHOUSE_REGISTRE;
    expect(registreDEssai, 'la configuration de base nomme un registre d’essai').toBeTruthy();
    const avantPoste = taille(POSTE);
    const avantEssai = taille(registreDEssai as string);

    const r = spawnSync(
      'bash',
      [LAUNCHER, 'demo-registre', 'developpeur', 'packages/a', consigne],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env, CLAUDE_BIN: FAUX } }
    );
    expect(r.status, r.stderr).toBe(0);

    expect(taille(POSTE)).toBe(avantPoste);
    const lignes = readFileSync(registreDEssai as string, 'utf8')
      .split('\n')
      .filter(Boolean);
    expect(taille(registreDEssai as string)).toBeGreaterThan(avantEssai);
    expect(lignes.map(l => (JSON.parse(l) as { agent: string }).agent)).toContain('s-registre');
  }, 180_000);
});
