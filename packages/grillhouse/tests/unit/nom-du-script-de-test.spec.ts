// grillhouse-pkl.2, criterion 3 — the script of the tests has one name, `test:unit`, the same for
// every language (decision 4 of the epic grillhouse-pkl, Romain's word of 2026-10-29). Its former
// name, `test:vitest`, stays only where the migrations rewrite the projects of each version
// (scripts/migrations/), and in the history of the changes (CHANGELOG.md): every package.json of
// the repository, the templates and the documentation (each Markdown file, the skills included)
// name the new one alone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const DEPOT = path.resolve(__dirname, '../../../..');
const ANCIEN = 'test:vitest';
const HISTOIRE = ['packages/grillhouse/scripts/migrations/', 'CHANGELOG.md'];
const SURVEILLES = /(?:^|\/)package\.json$|^templates\/|\.md$/;

// The lines of <racine> that name the former script, out of the history: `fichier:ligne`.
const anciens = (racine: string): string[] =>
  execFileSync('git', ['-C', racine, 'ls-files', '-co', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(f => f && SURVEILLES.test(f) && !HISTOIRE.some(h => f.startsWith(h)))
    .flatMap(f => {
      let texte: string;
      try {
        texte = readFileSync(path.join(racine, f), 'utf8');
      } catch {
        return [];
      }
      return texte.split('\n').flatMap((l, i) => (l.includes(ANCIEN) ? [`${f}:${i + 1}`] : []));
    });

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nom-du-script-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('grillhouse-pkl.2 — le nom neutre du script de test', () => {
  it('no package.json, template or document of the repository names test:vitest, out of the migrations', () => {
    expect(anciens(DEPOT)).toEqual([]);
  });

  it('a trial file that names it is found; the migrations and the history are not read', () => {
    const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
    execFileSync('git', ['-C', r, 'init', '-q']);
    const ecrire = (rel: string, texte: string) => {
      mkdirSync(path.dirname(path.join(r, rel)), { recursive: true });
      writeFileSync(path.join(r, rel), texte);
    };
    ecrire('packages/a/package.json', `{ "scripts": { "${ANCIEN}": "vitest run" } }\n`);
    ecrire('mods/x/skills/y/SKILL.md', `Un script \`${ANCIEN}\`.\n`);
    ecrire('templates/turbo/paquets.json', `{ "tasks": { "${ANCIEN}": {} } }\n`);
    ecrire('packages/grillhouse/scripts/migrations/0.25.0-x.mjs', `'${ANCIEN}';\n`);
    ecrire('CHANGELOG.md', `- \`${ANCIEN}\` devient \`test:unit\`.\n`);
    ecrire('packages/a/src/index.ts', `export const x = '${ANCIEN}';\n`);
    expect(anciens(r).sort()).toEqual([
      'mods/x/skills/y/SKILL.md:1',
      'packages/a/package.json:1',
      'templates/turbo/paquets.json:1',
    ]);
  });
});
