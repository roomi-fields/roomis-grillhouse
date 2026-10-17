// `scripts/consommateurs-arbitres.mjs`: a line of a `## Consommateurs` section that a lot changes
// enters with a settled arbitrage at its ticket, which names its consumer. Decided by the owner on
// 2026-10-17 (grill, Q7): the integrateur's judgement « un consommateur nouveau a son arbitrage »
// becomes a guard of the frame.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { GARDES_DU_CADRE } from '../../scripts/gardes-du-cadre.mjs';

const DEPOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(DEPOT, 'scripts/consommateurs-arbitres.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'consommateurs-arbitres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The stand-in for bd: `bd comments <id> --json` prints `.beads/<id>.comments.json` of the
// directory it runs in, and records each call in `.beads/appels`.
const FAUX_BD = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const b = path.join(process.cwd(), '.beads');
fs.mkdirSync(b, { recursive: true });
fs.appendFileSync(path.join(b, 'appels'), process.argv.slice(2).join(' ') + '\\n');
const [cmd, id] = process.argv.slice(2);
const f = path.join(b, id + '.comments.json');
if (cmd !== 'comments' || !fs.existsSync(f)) process.exit(1);
process.stdout.write(fs.readFileSync(f, 'utf8'));
`;
const BIN = path.join(ESSAIS, 'bin');
mkdirSync(BIN, { recursive: true });
writeFileSync(path.join(BIN, 'bd'), FAUX_BD, { mode: 0o755 });

const interfaceDe = (lignes: string[]) =>
  ['# a', '', 'Le composant a.', '', '## Consommateurs', '', ...lignes, ''].join('\n');

// A repository whose package `a` declares `b` as consumer at HEAD; then, on <branche>, the working
// tree adds <neuves> to that section. The main tree holds the comments <comments> of demo-1.
function depot(branche: string, neuves: string[], comments?: { text: string }[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const ecrire = (rel: string, texte: string) => {
    mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    writeFileSync(path.join(racine, rel), texte);
  };
  ecrire('packages/a/package.json', JSON.stringify({ name: '@demo/a' }));
  ecrire('packages/a/docs/INTERFACE.md', interfaceDe(['- `b` : duree']));
  ecrire('.gitignore', '.beads/\n');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'init');
  if (branche !== 'main') git('checkout', '-q', '-b', branche);
  ecrire('packages/a/docs/INTERFACE.md', interfaceDe(['- `b` : duree', ...neuves]));
  if (comments) ecrire('.beads/demo-1.comments.json', JSON.stringify(comments));
  return racine;
}

const jouer = (racine: string) =>
  spawnSync(process.execPath, [SCRIPT], {
    cwd: racine,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${BIN}${path.delimiter}${process.env.PATH ?? ''}`,
      GRILLHOUSE_DETTE: '',
      GRILLHOUSE_ENVELOPPE: '',
    },
  });

const TRANCHE = '## Arbitrage — `c` lit duree\n\n### Verdict — tranché — la spécification';

describe('consommateurs-arbitres — a changed Consommateurs line has its settled arbitrage', () => {
  it('refuses a line the lot adds without arbitrage, at its interface, naming the consumer', () => {
    const r = jouer(depot('agent/demo-1', ['- `c` : duree'], []));
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('packages/a/docs/INTERFACE.md § Consommateurs');
    expect(r.stderr).toContain('- `c` : duree');
    expect(r.stderr).toContain('demo-1');
    expect(r.stderr).toContain('`c`');
  });

  it('passes the line with a settled « Arbitrage » at the ticket that names its consumer', () => {
    const r = jouer(depot('agent/demo-1', ['- `c` : duree'], [{ text: TRANCHE }]));
    expect(r.status, r.stderr).toBe(0);
  });

  it('refuses the line when its arbitrage is not settled', () => {
    const r = jouer(
      depot(
        'agent/demo-1',
        ['- `c` : duree'],
        [{ text: '## Arbitrage — `c` lit duree\n\nÀ voir.' }]
      )
    );
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('change sans arbitrage tranché');
  });

  it('passes the line when the owner answered the arbitrage', () => {
    const r = jouer(
      depot(
        'agent/demo-1',
        ['- `c` : duree'],
        [{ text: '## Arbitrage — `c` lit duree' }, { text: '## Réponse du responsable\n\nOui.' }]
      )
    );
    expect(r.status, r.stderr).toBe(0);
  });

  it('judges nothing out of a branch agent/…, and calls no bd', () => {
    const racine = depot('main', ['- `c` : duree']);
    const r = jouer(racine);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(racine, '.beads/appels'))).toBe(false);
  });

  it('calls no bd when no line changes', () => {
    const racine = depot('agent/demo-1', []);
    expect(jouer(racine).status).toBe(0);
    expect(existsSync(path.join(racine, '.beads/appels'))).toBe(false);
  });

  it('refuses when the comments of the ticket cannot be read', () => {
    const r = jouer(depot('agent/demo-1', ['- `c` : duree']));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ne se lisent pas');
  });

  it('the guard is among the frame’s guards', () => {
    expect(GARDES_DU_CADRE).toContainEqual(['scripts/consommateurs-arbitres.mjs']);
  });
});
