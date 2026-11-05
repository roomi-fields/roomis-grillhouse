// grillhouse-44b.4.1, critère 8: the lock command that the settings of a session declare
// (`reglagesDuRole`, via `optionsDuRole`) fails closed. Started as Claude Code starts it (`sh -c`,
// the JSON of an Edit on its standard input), it exits 2 and names the main tree and the missing
// command when the main tree has no `node_modules/.bin/grillhouse`; a missing command otherwise
// exits 127, which Claude Code reads as an error that does not block, and the write passes.
// A medium test: one local process per case.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { describe, expect, it } from 'vitest';
import { optionsDuRole } from '../../scripts/droits.mjs';
import { dossier } from './outil-essai.js';

type Reglages = {
  hooks?: { PreToolUse?: { matcher: string; hooks: { command: string }[] }[] };
};

function projet(nom: string) {
  const d = dossier(nom);
  declarerLesLangages(d);
  return d;
}

function commandeDuVerrou(role: string, racine: string, copie: string) {
  const args = optionsDuRole(role, {
    racine,
    copie,
    ticket: 'demo-1',
    home: path.join(dossier('maison'), 'vide'),
  });
  const reglages = JSON.parse(args[args.indexOf('--settings') + 1]) as Reglages;
  const [h] = (reglages.hooks?.PreToolUse ?? []).filter(
    x => x.matcher === 'Write|Edit|MultiEdit|NotebookEdit'
  );
  return h.hooks[0].command;
}

// The command, started by `sh -c` with the copy as project and working directory.
function lancer(commande: string, copie: string) {
  return spawnSync('sh', ['-c', commande], {
    cwd: copie,
    encoding: 'utf8',
    timeout: 60_000,
    input: JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: path.join(copie, 'packages/a/tests/x.spec.ts') },
      cwd: copie,
    }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: copie },
  });
}

describe('grillhouse-44b.4.1, critère 8 — la commande déclarée du verrou refuse quand le cadre de l’arbre principal manque', () => {
  it.each(['testwriter', 'developpeur'])(
    'critère 8 : %s — racine sans commande : code 2, l’arbre principal et la commande absente nommés',
    role => {
      const racine = projet('principal-sans-cadre');
      const copie = projet('copie');
      const r = lancer(commandeDuVerrou(role, racine, copie), copie);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('arbre principal');
      expect(r.stderr).toContain(`${racine}/node_modules/.bin/grillhouse`);
    }
  );

  it('critère 8 : une commande présente mais non exécutable est refusée de même, code 2', () => {
    const racine = projet('principal-non-executable');
    const copie = projet('copie-bis');
    mkdirSync(path.join(racine, 'node_modules/.bin'), { recursive: true });
    writeFileSync(path.join(racine, 'node_modules/.bin/grillhouse'), '#!/bin/sh\nexit 0\n');
    chmodSync(path.join(racine, 'node_modules/.bin/grillhouse'), 0o644);
    const r = lancer(commandeDuVerrou('testwriter', racine, copie), copie);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('arbre principal');
  });

  it('critère 8 (témoin) : racine avec la commande — elle est lancée avec `verrou <rôle>`, l’écriture du plan est acceptée', () => {
    const racine = projet('principal-avec-cadre');
    const copie = projet('copie-ter');
    const bin = path.join(racine, 'node_modules/.bin/grillhouse');
    mkdirSync(path.dirname(bin), { recursive: true });
    // Stands for the frame: accepts (exit 0) and says what it was asked.
    writeFileSync(bin, '#!/bin/sh\necho "lance: $*"\nexit 0\n');
    chmodSync(bin, 0o755);
    const r = lancer(commandeDuVerrou('testwriter', racine, copie), copie);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('lance: verrou testwriter');
    expect(r.stderr).toBe('');
  });
});
