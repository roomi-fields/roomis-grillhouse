// @equipee: l'enveloppe bwrap, un lanceur, un claude de remplacement (aucun vrai Claude, aucun token)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { RACINE } from './cadre.js';
import { SCRIPT, projetDuLanceur } from './enveloppe-essai.js';
import { temporaireDuFichier } from './temporaire-du-fichier.js';

// Ticket grillhouse-3uv.46: the circuit names an explicit model for every session (scripts/seances.mjs:
// Sonnet for the testwriter and the developpeur, Opus for the developpeur's last session), so a
// session never runs without one. The launcher forwards that model to the claude command as --model
// (scripts/enveloppe/lancer.sh, « [ -z "$modele" ] || surcharge+=(--model "$modele") »). The proof
// reads the --model the launcher passes for each imposed model, recorded by a stand-in (CLAUDE_BIN
// replaces claude): no real session, no token. Which model the circuit names for each session is a
// day test of its own, packages/grillhouse/tests/unit/seances.modeles.spec.ts.
const ESSAIS = racineSousLaMaison('grillhouse-essais-lancer-nuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
// The temporary directory of this file, under which the launcher opens each ticket's own.
temporaireDuFichier();

const LAUNCHER = path.join(RACINE, 'packages/grillhouse/scripts/enveloppe/lancer.sh');

// The stand-in claude: it records the model the launcher passes it (--model) in the plan's package
// (the agent's copy is read-only at its root under the envelope; the plan's packages are writable,
// GRILLHOUSE_ENVELOPPE joins them by `:`), then answers as the developpeur with a FAIT sheet so the
// launcher ends green. It launches nothing and reaches no network, so the night plays it without a token.
const FAUX_CLAUDE = `#!/bin/bash
prec= modele= format=
for a in "$@"; do
  [ "$prec" = --model ] && modele=$a
  [ "$prec" = --output-format ] && format=$a
  prec=$a
done
paquet=$(printf '%s' "$GRILLHOUSE_ENVELOPPE" | cut -d: -f1)
printf '%s' "$modele" > "$paquet/.modele-vu"
cat > /dev/null
[ "$format" = json ] && printf '%s\\n' '{"type":"result","subtype":"success","is_error":false,"session_id":"x","result":"ok","structured_output":{"statut":"FAIT"}}'
exit 0
`;

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

// Vitest runs no hook of a file whose tests are all skipped: the root goes at once then.
const actif = canWrap;
if (!actif) {
  rmSync(ESSAIS, { recursive: true, force: true });
}

describe.runIf(actif)('le lanceur passe le modèle à la commande claude', () => {
  // The developpeur's definition sets sonnet; the override asks for haiku. The repository is a
  // project the launcher prepares: its language declared, Turborepo the trial's stand-in.
  const repo = path.join(ESSAIS, 'depot');
  beforeAll(() => {
    mkdirSync(path.join(repo, 'packages/a'), { recursive: true });
    mkdirSync(path.join(repo, '.claude/agents'), { recursive: true });
    writeFileSync(path.join(repo, 'packages/a/a.ts'), 'a');
    writeFileSync(
      path.join(repo, '.claude/agents/developpeur.md'),
      '---\nname: developpeur\ndescription: essai\nmodel: sonnet\neffort: low\n---\nRéponds en un mot.\n'
    );
    writeFileSync(path.join(repo, 'faux-claude.sh'), FAUX_CLAUDE, { mode: 0o755 });
    projetDuLanceur(repo);
    installerEnveloppe(repo);
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['-C', repo, 'add', '.']);
    execFileSync('git', [
      '-C',
      repo,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-qm',
      'i',
    ]);
  });

  // The model the launcher passes to the claude command on ticket <ticket>, read from what the
  // stand-in recorded in the plan's package (packages/a); no real session is launched.
  const modele = (ticket: string, options: string[]): string => {
    const consigne = path.join(repo, `${ticket}.txt`);
    writeFileSync(consigne, `TON TICKET : ${ticket} — réponds seulement : OK.`);
    const copie = path.join(repo, '.claude/worktrees', ticket);
    const r = spawnSync(
      'bash',
      [LAUNCHER, ...options, ticket, 'developpeur', 'packages/a', consigne],
      {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_BIN: path.join(repo, 'faux-claude.sh') },
        timeout: 120000,
      }
    );
    expect(
      r.status,
      `${r.stderr}\n${existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : ''}`
    ).toBe(0);
    return readFileSync(path.join(copie, 'packages/a', '.modele-vu'), 'utf8');
  };

  // Le circuit impose Sonnet et Opus ; haiku vaut pour tout autre modèle que le responsable nomme.
  // Le lanceur passe chacun comme --model, par-dessus le modèle de la définition du rôle.
  for (const m of ['sonnet', 'opus', 'haiku']) {
    it(`--modele ${m} fait passer --model ${m} à la commande claude`, () => {
      expect(modele(`demo-${m}`, ['--modele', m])).toBe(m);
    });
  }
});
