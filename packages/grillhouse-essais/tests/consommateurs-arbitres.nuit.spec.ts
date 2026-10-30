// Ticket grillhouse-3dr.3.7: the guard consommateurs-arbitres as it runs, a node process in a git
// repository on a branch agent/<ticket>, reading its interface at HEAD and calling bd (a stand-in
// on the PATH) from the main tree: its cases moved as they were from
// packages/grillhouse/tests/unit/langages/typescript/consommateurs-arbitres.spec.ts, where the
// judgement is tested by its interface, by day.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CADRE } from './cadre.js';

const SCRIPT = path.join(CADRE, 'scripts/langages/typescript/consommateurs-arbitres.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'consommateurs-arbitres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The stand-in for bd: `bd comments <id> --json` prints `.beads/<id>.comments.json` of the
// directory it runs in, `bd show <id> --json` its `.beads/<id>.json`, and each call is recorded in
// `.beads/appels`.
const FAUX_BD = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const b = path.join(process.cwd(), '.beads');
fs.mkdirSync(b, { recursive: true });
fs.appendFileSync(path.join(b, 'appels'), process.argv.slice(2).join(' ') + '\\n');
const [cmd, id] = process.argv.slice(2);
const f = path.join(b, id + (cmd === 'show' ? '.json' : '.comments.json'));
if (!['comments', 'show'].includes(cmd) || !fs.existsSync(f)) process.exit(1);
process.stdout.write(fs.readFileSync(f, 'utf8'));
`;
const BIN = path.join(ESSAIS, 'bin');
mkdirSync(BIN, { recursive: true });
writeFileSync(path.join(BIN, 'bd'), FAUX_BD, { mode: 0o755 });

const interfaceDe = (lignes: string[], genere: string[] = []) =>
  [
    '# a',
    '',
    'Le composant a.',
    '',
    '## Consommateurs',
    '',
    ...lignes,
    '',
    ...(genere.length ? ['<!-- généré: début -->', ...genere, '<!-- généré: fin -->', ''] : []),
  ].join('\n');

// A repository whose package <paquet> holds the interface <avant> at HEAD; then, on <branche>,
// the working tree holds <apres>. The main tree holds <ticket>, its <show> (the JSON of
// `bd show <ticket> --json`), and its comments <comments>.
function depotAvec(o: {
  branche: string;
  avant: string;
  apres: string;
  comments?: { text: string }[];
  show: unknown;
  ticket?: string;
  paquet?: string;
}) {
  const { ticket = 'demo-1', paquet = 'a' } = o;
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const ecrire = (rel: string, texte: string) => {
    mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    writeFileSync(path.join(racine, rel), texte);
  };
  ecrire(`packages/${paquet}/package.json`, JSON.stringify({ name: `@demo/${paquet}` }));
  ecrire(`packages/${paquet}/docs/INTERFACE.md`, o.avant);
  ecrire('.gitignore', '.beads/\n');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-qm', 'init');
  if (o.branche !== 'main') {
    git('checkout', '-q', '-b', o.branche);
  }
  ecrire(`packages/${paquet}/docs/INTERFACE.md`, o.apres);
  if (o.comments) {
    ecrire(`.beads/${ticket}.comments.json`, JSON.stringify(o.comments));
  }
  ecrire(`.beads/${ticket}.json`, JSON.stringify(o.show));
  return racine;
}

// A repository whose package `a` declares `b` as consumer at HEAD; then, on <branche>, the working
// tree adds <neuves> to that section. The main tree holds demo-1, its <description> (none by
// default), and its comments <comments>.
const depot = (
  branche: string,
  neuves: string[],
  comments?: { text: string }[],
  description = ''
) =>
  depotAvec({
    branche,
    avant: interfaceDe(['- `b` : duree']),
    apres: interfaceDe(['- `b` : duree', ...neuves]),
    comments,
    show: [{ id: 'demo-1', title: 'demo-1 — un sujet — a', description }],
  });

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

  it('judges nothing out of a branch agent/…, and calls no bd', () => {
    const racine = depot('main', ['- `c` : duree']);
    const r = jouer(racine);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(racine, '.beads/appels'))).toBe(false);
  });

  it('refuses when the comments of the ticket cannot be read', () => {
    const r = jouer(depot('agent/demo-1', ['- `c` : duree']));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ne se lisent pas');
  });

  it('passes a line the ticket’s plan names out of its Architecture: its title, « Noms publiés »', () => {
    const r = jouer(
      depotAvec({
        branche: 'agent/demo-1',
        avant: interfaceDe(['- `b` : duree']),
        apres: interfaceDe(['- `b` : duree', '- `c` : tempo']),
        comments: [],
        show: [
          {
            id: 'demo-1',
            title: 'demo-1 — un sujet — a, c',
            description:
              '## Architecture\n\nLes composants du titre.\n\n## Noms publiés\n\n`tempo`.',
          },
        ],
      })
    );
    expect(r.status, r.stderr).toBe(0);
  });
});
