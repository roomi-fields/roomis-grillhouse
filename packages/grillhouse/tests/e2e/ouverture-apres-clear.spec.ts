// The chain of the renewal of the session of supervision as it is launched (greffon.md, §5.1 and
// §5.2): the SessionStart hook hands the `source` of its input to the opening, and
// `grillhouse superviseur` plays --jalon, --question, --renouveler and --relever from its
// arguments. The project is a directory: `git` and `bd` are stubs on the PATH, and no Temporal
// server answers.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cheminSysteme, claudeSubstitut } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { seance } from '../../scripts/superviseur.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ouverture-apres-clear-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const SESSION = path.resolve(__dirname, '../../scripts/session-start.sh');
const SUPERVISEUR = path.resolve(__dirname, '../../scripts/superviseur.mjs');
const NOTE = '# Reprise\n\nLe lot demo-7 est à relire.\n';

// A project at the root of its repository, as the stub of `git` answers for it, and the session
// that runs its hook and its commands.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  const commun = path.join(racine, '.git');
  mkdirSync(commun);
  mkdirSync(path.join(racine, 'node_modules'));
  writeFileSync(path.join(racine, 'package.json'), '{}');
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(path.join(bin, 'bd'), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
  writeFileSync(
    path.join(bin, 'git'),
    `#!/bin/sh
[ "$1 $2 $3" = "-C ${racine} rev-parse" ] || exit 1
shift 4
for a in "$@"; do
  case "$a" in
    --git-dir | --git-common-dir) echo '${commun}' ;;
    *) exit 1 ;;
  esac
done
`,
    { mode: 0o755 }
  );
  const claude = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), {});
  const env = {
    PATH: cheminSysteme(bin, claude.bin),
    HOME: mkdtempSync(path.join(ESSAIS, 'maison-')),
    CLAUDE_PROJECT_DIR: racine,
    TEMPORAL_ADDRESS: '127.0.0.1:1',
  };
  const note = path.join(commun, 'grillhouse-reprise.md');
  // The SessionStart hook, given its input as Claude Code writes it.
  const ouvrir = (entree: object) => {
    const r = spawnSync('bash', [SESSION], {
      encoding: 'utf8',
      input: JSON.stringify(entree),
      env,
      timeout: 60_000,
    });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };
  // `grillhouse superviseur <args>`, played from `cwd`.
  const commande = (args: string[], cwd = racine) =>
    spawnSync(process.execPath, [SUPERVISEUR, ...args], {
      cwd,
      encoding: 'utf8',
      env,
      timeout: 60_000,
    });
  // A file to give to the command, holding `texte`.
  const fichier = (texte: string) => {
    const f = path.join(mkdtempSync(path.join(ESSAIS, 'texte-')), 'texte.md');
    writeFileSync(f, texte);
    return f;
  };
  // The session this test runs in holds the lock, as its hook and its commands see it.
  writeFileSync(path.join(commun, 'grillhouse-superviseur.lock'), `${seance(process.pid)}\n`);
  return { racine, note, ouvrir, commande, fichier };
}

describe('the SessionStart hook hands the source of its input to the opening of the supervisor', () => {
  it.each([
    ['its source alone', { source: 'clear' }],
    ['its source beside a type of agent that is no role', { agent_type: 'autre', source: 'clear' }],
  ])(
    'after a /clear, the session that holds the lock receives the note (input with %s)',
    (_, entree) => {
      const p = projet();
      writeFileSync(p.note, NOTE);
      const texte = p.ouvrir(entree);
      expect(texte).toContain('## Reprise de la supervision après un /clear');
      expect(texte).toContain('grillhouse:pitmaster');
      expect(texte).toContain('Le lot demo-7 est à relire.');
    },
    70_000
  );

  it('after a compaction, the session that holds the lock receives no note', () => {
    const p = projet();
    writeFileSync(p.note, NOTE);
    expect(p.ouvrir({ source: 'compact' })).not.toContain('Le lot demo-7 est à relire.');
  }, 70_000);
});

describe('grillhouse superviseur plays the renewal from its arguments', () => {
  // --renouveler <dossier> <arretA> <messageA>, played outside the project.
  const renouveler = (p: ReturnType<typeof projet>, arretA: number, messageA: number) => {
    const r = p.commande(['--renouveler', p.racine, String(arretA), String(messageA)], ESSAIS);
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };

  it('--jalon <file> writes the note, and --renouveler gives the message after a quiet Stop', () => {
    const p = projet();
    const r = p.commande(['--jalon', p.fichier(NOTE)]);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(p.note, 'utf8')).toBe(NOTE);
    const apres = Date.now() + 60_000;
    expect(renouveler(p, 0, 0)).toBe('');
    expect(renouveler(p, apres, 0)).toMatch(/Reprends la supervision/);
  }, 70_000);

  it('--renouveler gives nothing once a message of the owner is later than the milestone', () => {
    const p = projet();
    expect(p.commande(['--jalon', p.fichier(NOTE)]).status).toBe(0);
    const apres = Date.now() + 60_000;
    expect(renouveler(p, apres, apres)).toBe('');
  }, 70_000);

  it('--question <file> adds to the note and declares no milestone', () => {
    const p = projet();
    const r = p.commande(['--question', p.fichier('Au responsable : quel langage ?\n')]);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(p.note, 'utf8')).toContain('Au responsable : quel langage ?');
    expect(renouveler(p, Date.now() + 60_000, 0)).toBe('');
  }, 70_000);

  it.each(['--jalon', '--question'])(
    '%s without a readable file exits 2 with its reason, nothing written',
    option => {
      const p = projet();
      for (const args of [[option], [option, path.join(ESSAIS, 'absent.md')]]) {
        const r = p.commande(args);
        expect(r.status, r.stdout).toBe(2);
        expect(r.stderr).toContain(`${option} : `);
        expect(existsSync(p.note)).toBe(false);
      }
    },
    70_000
  );

  it('--relever <dossier> --compaction asks for the note and the milestone, and only then', () => {
    const p = projet();
    const sans = p.commande(['--relever', p.racine], ESSAIS);
    expect(sans.status, sans.stderr).toBe(0);
    expect(sans.stdout).toBe('');
    const avec = p.commande(['--relever', p.racine, '--compaction'], ESSAIS);
    expect(avec.status, avec.stderr).toBe(0);
    expect(avec.stdout).toContain('superviseur --jalon');
    expect(avec.stdout).toContain('compaction');
  }, 70_000);
});
