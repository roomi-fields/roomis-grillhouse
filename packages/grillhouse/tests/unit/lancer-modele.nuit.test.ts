import { execFileSync, spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';

// Ticket grillhouse-3uv.46, critère 3: a real session launched with --modele runs on the model
// asked, over the model of the role's definition; its transcript says so in the model field of
// its messages. A real claude answers, on the real home, so the night plays it.
const ESSAIS = racineSousLaMaison('grillhouse-essais-lancer-nuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.resolve(__dirname, '../../../..');
const LAUNCHER = path.join(RACINE, 'packages/grillhouse/scripts/enveloppe/lancer.sh');
const SCRIPT = path.join(RACINE, 'packages/grillhouse/scripts/enveloppe/enveloppe.mjs');
const projetsReels = path.join(userInfo().homedir, '.claude/projects');
const enTirets = (p: string) => p.replace(/[^A-Za-z0-9]/g, '-');
const ecrivable = (p: string) => {
  try {
    accessSync(p, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};
const connecte = (() => {
  const r = spawnSync('claude', ['auth', 'status'], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0 && r.stdout.includes('"loggedIn": true');
})();

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
const actif = canWrap && connecte && ecrivable(projetsReels);
if (!actif) {
  rmSync(ESSAIS, { recursive: true, force: true });
}

describe.runIf(actif)('critère 3 — the transcript of a real session', () => {
  // The developpeur's definition sets sonnet; the override asks for haiku.
  const repo = path.join(ESSAIS, 'depot');
  beforeAll(() => {
    mkdirSync(path.join(repo, 'packages/a'), { recursive: true });
    mkdirSync(path.join(repo, '.claude/agents'), { recursive: true });
    writeFileSync(path.join(repo, 'packages/a/a.ts'), 'a');
    writeFileSync(
      path.join(repo, '.claude/agents/developpeur.md'),
      '---\nname: developpeur\ndescription: essai\nmodel: sonnet\neffort: low\n---\nRéponds en un mot.\n'
    );
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

  const projets: string[] = [];
  afterAll(() => projets.forEach(p => rmSync(p, { recursive: true, force: true })));

  // One real session; the models of its assistant messages, read in its transcript.
  const modeles = (ticket: string, options: string[]) => {
    const consigne = path.join(repo, `${ticket}.txt`);
    writeFileSync(consigne, `TON TICKET : ${ticket} — réponds seulement : OK.`);
    const copie = path.join(repo, '.claude/worktrees', ticket);
    const projet = path.join(projetsReels, enTirets(copie));
    projets.push(projet);
    const r = spawnSync(
      'bash',
      [LAUNCHER, ...options, ticket, 'developpeur', 'packages/a', consigne],
      { cwd: repo, encoding: 'utf8', timeout: 300000 }
    );
    expect(
      r.status,
      `${r.stderr}\n${existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : ''}`
    ).toBe(0);
    const lignes = readdirSync(projet)
      .filter(f => f.endsWith('.jsonl'))
      .flatMap(f => readFileSync(path.join(projet, f), 'utf8').split('\n').filter(Boolean))
      .map(l => JSON.parse(l) as { type?: string; message?: { model?: string } });
    return lignes.filter(l => l.type === 'assistant').map(l => l.message?.model ?? '');
  };

  it('critère 3 — a session launched with --modele haiku runs on haiku, over the sonnet of the role', () => {
    const vus = modeles('demo-haiku', ['--modele', 'haiku']);
    expect(vus.length).toBeGreaterThan(0);
    for (const m of vus) {
      expect(m).toMatch(/haiku/);
    }
  }, 330000);

  it('critère 2 — a session launched without an option runs on the model of the role', () => {
    const vus = modeles('demo-role', []);
    expect(vus.length).toBeGreaterThan(0);
    for (const m of vus) {
      expect(m).toMatch(/sonnet/);
    }
  }, 330000);
});
