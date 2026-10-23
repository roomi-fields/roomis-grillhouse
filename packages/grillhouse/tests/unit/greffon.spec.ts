// grillhouse-3uv.84.2: the frame's plugin, grillhouse@roomi-fields (mods/grillhouse/, whose root
// the package is since grillhouse-3uv.84.7), carries the skills, the agents, the hooks of
// Claude Code and the common charter, as a plugin of Claude Code carries the components of a tool.
// A project holds no copy of them; each hook calls `grillhouse <sous-commande>` of the project's
// package, and the charter reaches each session by the hook of the session's start.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SOUS_COMMANDES } from '../../bin/grillhouse.mjs';
import * as maj from '../../scripts/grillhouse-maj.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const GREFFON = path.join(DEPOT, 'mods/grillhouse');
const CROCHET = path.join(GREFFON, 'hooks/crochet.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'greffon-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const lire = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
// The common charter as the hooks write it: the plugin's root resolved (grillhouse-3uv.84.7).
const CHARTE = lire('mods/grillhouse/charte.md').replaceAll('${CLAUDE_PLUGIN_ROOT}', GREFFON);

const COMPETENCES = [
  'developpeur',
  'explorateur',
  'grill',
  'mesure',
  'pitmaster',
  'questionneur',
  'redacteur',
  'referent-technique',
  'regulateur',
  'release',
  'relecteur',
  'testwriter',
];
const AGENTS = [
  'developpeur',
  'explorateur',
  'questionneur',
  'referent-technique',
  'regulateur',
  'relecteur',
  'testwriter',
];

// The frontmatter of a Markdown file, as « key: value » lines and lists of « - item ».
const enTete = (texte: string) => /^---\n([\s\S]*?)\n---\n/.exec(texte)?.[1] ?? '';

describe('critère 1 — the plugin carries the skills and the agents of the frame', () => {
  it('each skill of the frame is a skill of the plugin, mods/grillhouse/skills/<nom>/SKILL.md', () => {
    const presentes = readdirSync(path.join(GREFFON, 'skills')).sort();
    expect(presentes).toEqual(COMPETENCES);
    for (const nom of COMPETENCES) {
      expect(enTete(lire(`mods/grillhouse/skills/${nom}/SKILL.md`)), nom).toMatch(
        new RegExp(`^name: ${nom}$`, 'm')
      );
    }
  });

  it('each agent of the frame is an agent of the plugin, its skills named in the plugin (grillhouse:<nom>)', () => {
    const presents = readdirSync(path.join(GREFFON, 'agents'))
      .map(f => f.replace(/\.md$/, ''))
      .sort();
    expect(presents).toEqual(AGENTS);
    for (const role of AGENTS) {
      const t = enTete(lire(`mods/grillhouse/agents/${role}.md`));
      expect(t, role).toMatch(new RegExp(`^name: ${role}$`, 'm'));
      const skills = [...t.matchAll(/^ {2}- (\S+)$/gm)].map(m => m[1]);
      expect(skills.length, role).toBeGreaterThan(0);
      for (const s of skills) {
        expect(s, role).toMatch(/^grillhouse:/);
        expect(COMPETENCES, `${role} : ${s}`).toContain(s.replace(/^grillhouse:/, ''));
      }
    }
  });

  it('the repository and the template of a project hold no copy of them', () => {
    for (const f of [
      '.claude/skills',
      '.claude/agents',
      'templates/projet/.claude/skills',
      'templates/projet/.claude/agents',
    ]) {
      expect(existsSync(path.join(DEPOT, f)), f).toBe(false);
    }
  });

  it('no script of the package looks for an agent under .claude/agents', () => {
    const r = spawnSync(
      'git',
      [
        '-C',
        DEPOT,
        'grep',
        '-l',
        '.claude/agents',
        '--',
        'packages/grillhouse/bin',
        'packages/grillhouse/scripts',
      ],
      {
        encoding: 'utf8',
      }
    );
    expect(r.stdout.split('\n').filter(Boolean)).toEqual([]);
  });
});

// The hooks of the plugin, as hooks/hooks.json declares them.
type Crochet = { type: string; command: string };
type Groupe = { matcher?: string; hooks: Crochet[] };
const declaration = () =>
  JSON.parse(lire('mods/grillhouse/hooks/hooks.json')) as {
    modules: string[];
    hooks: Record<string, Groupe[]>;
  };
const APPEL = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/crochet\.mjs" ([a-z-]+)$/;

// A trial project: its package.json declares the package; with `paquet`, its command
// (node_modules/.bin/grillhouse) is a stand-in that writes its arguments and its input, then exits
// with the code `GRILLHOUSE_CODE` names.
function projet(paquet: boolean) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    p,
    'package.json',
    JSON.stringify({ name: 'p', devDependencies: { '@roomi-fields/grillhouse': '*' } })
  );
  if (paquet) {
    ecrire(
      p,
      'node_modules/.bin/grillhouse',
      '#!/usr/bin/env bash\necho "grillhouse $*"\necho "entrée : $(cat)"\nexit "${GRILLHOUSE_CODE:-0}"\n'
    );
    chmodSync(path.join(p, 'node_modules/.bin/grillhouse'), 0o755);
  }
  return p;
}
const crochet = (p: string, sous: string, entree = '{"hook_event_name":"x"}', code = '0') =>
  spawnSync(process.execPath, [CROCHET, sous], {
    encoding: 'utf8',
    input: entree,
    env: {
      PATH: process.env.PATH,
      CLAUDE_PROJECT_DIR: p,
      CLAUDE_PLUGIN_ROOT: GREFFON,
      GRILLHOUSE_CODE: code,
    },
  });

describe('critère 2 — the plugin carries the hooks of the frame, each calling grillhouse <sous-commande>', () => {
  it('hooks.json keeps the mod and declares the hooks of the frame, each through crochet.mjs', () => {
    const d = declaration();
    expect(d.modules).toEqual(['./register.tsx']);
    const appels = Object.fromEntries(
      Object.entries(d.hooks).map(([ev, groupes]) => [
        ev,
        groupes.map(g => ({
          matcher: g.matcher,
          sous: g.hooks.map(h => APPEL.exec(h.command)?.[1] ?? h.command),
        })),
      ])
    );
    expect(appels).toEqual({
      SessionStart: [{ matcher: undefined, sous: ['session-start'] }],
      SubagentStart: [{ matcher: undefined, sous: ['subagent-start'] }],
      UserPromptSubmit: [{ matcher: undefined, sous: ['structure-guard'] }],
      PreToolUse: [{ matcher: 'Agent|Task', sous: ['ticket-du-sous-agent'] }],
      SubagentStop: [{ matcher: undefined, sous: ['registre'] }],
      SessionEnd: [{ matcher: undefined, sous: ['registre'] }],
    });
    for (const sous of ['session-start', 'structure-guard', 'ticket-du-sous-agent', 'registre']) {
      expect(Object.keys(SOUS_COMMANDES), sous).toContain(sous);
    }
  });

  it('the settings of the repository declare no hook of the frame: the plugin carries them, run once', () => {
    const reglages = JSON.parse(lire('.claude/settings.json')) as { hooks?: object };
    expect(reglages).not.toHaveProperty('hooks');
  });

  it('without the package, the session start says « lance npm install », after the charter', () => {
    const r = crochet(projet(false), 'session-start');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.startsWith(CHARTE)).toBe(true);
    expect(r.stdout.slice(CHARTE.length)).toMatch(/lance `npm install`/);
  });

  it('without the package, the other hooks exit without effect', () => {
    for (const sous of ['structure-guard', 'ticket-du-sous-agent', 'registre']) {
      const r = crochet(projet(false), sous);
      expect(r.status, sous).toBe(0);
      expect(`${r.stdout}${r.stderr}`, sous).toBe('');
    }
  });

  it('with the package, each hook runs grillhouse <sous-commande> on its input, its output and its code passed on', () => {
    const p = projet(true);
    for (const sous of ['structure-guard', 'ticket-du-sous-agent', 'registre']) {
      const r = crochet(p, sous, '{"prompt":"x"}', '2');
      expect(r.status, sous).toBe(2);
      expect(r.stdout, sous).toBe(`grillhouse ${sous}\nentrée : {"prompt":"x"}\n`);
    }
    const r = crochet(p, 'session-start', '{"source":"startup"}');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(`${CHARTE}\ngrillhouse session-start\nentrée : {"source":"startup"}\n`);
  });
});

describe('critère 3 — the common charter reaches each session by the hook of its start', () => {
  it('a subagent receives the charter as its additional context', () => {
    const r = crochet(projet(false), 'subagent-start', '{"hook_event_name":"SubagentStart"}');
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: CHARTE },
    });
  });

  it('the charter of a project no longer imports the common charter', () => {
    expect(lire('CLAUDE.md')).not.toMatch(/@\.claude\/grillhouse\/charte\.md/);
    expect(existsSync(path.join(DEPOT, '.claude/grillhouse/charte.md'))).toBe(false);
  });
});

describe('critère 4 — the copy of the files, its list, its fingerprints and the merge of the settings are gone', () => {
  it('the list of the frame is gone, and the update exports neither its reading, nor the fingerprints, nor the merge', () => {
    expect(existsSync(path.join(DEPOT, '.claude/grillhouse/fichiers.txt'))).toBe(false);
    for (const nom of ['lireListe', 'fichiersDuCadre', 'fusionnerReglages', 'ecarts']) {
      expect(maj, nom).not.toHaveProperty(nom);
    }
  });

  it('the update copies no file, writes no fingerprints, and writes in the settings of Claude Code the status line and the plugin of the package alone (grillhouse-3uv.84.4 critère 6, grillhouse-3uv.84.7 critère 2)', () => {
    const p = mkdtempSync(path.join(ESSAIS, 'maj-'));
    ecrire(p, 'package.json', `${JSON.stringify({ name: 'p' }, null, 2)}\n`);
    ecrire(p, '.claude/settings.json', `${JSON.stringify({ model: 'opus' })}\n`);
    maj.mettreAJour(p, DEPOT);
    expect(JSON.parse(readFileSync(path.join(p, '.claude/settings.json'), 'utf8'))).toEqual({
      model: 'opus',
      statusLine: { type: 'command', command: maj.LIGNE_ETAT },
      enabledPlugins: { 'grillhouse@roomi-fields': true },
      extraKnownMarketplaces: {
        'roomi-fields': { source: { source: 'github', repo: 'roomi-fields/claude-plugins' } },
      },
    });
    for (const f of [
      '.claude/grillhouse',
      '.claude/skills',
      '.claude/agents',
      'METACADRE.md',
      'packages/grillhouse',
    ]) {
      expect(existsSync(path.join(p, f)), f).toBe(false);
    }
  });

  it('the drift of the copies is no longer measured: --ecarts is refused, as an unknown option', () => {
    const r = spawnSync(
      process.execPath,
      [path.join(DEPOT, 'packages/grillhouse/scripts/grillhouse-maj.mjs'), '--ecarts'],
      {
        encoding: 'utf8',
        cwd: mkdtempSync(path.join(ESSAIS, 'ecarts-')),
      }
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Usage/);
    expect(r.stderr).not.toMatch(/--ecarts/);
  });

  it('no script, test or text of the frame names the list or the fingerprints', () => {
    const r = spawnSync(
      'git',
      [
        '-C',
        DEPOT,
        'grep',
        '-lE',
        'fichiers\\.txt|empreintes\\.json',
        '--',
        'packages/grillhouse',
        'mods',
        'templates',
        'README.md',
        'CONTRIBUTING.md',
        'STRUCTURE.md',
        ':!packages/grillhouse/tests/unit/greffon.spec.ts',
      ],
      { encoding: 'utf8' }
    );
    expect(r.stdout.split('\n').filter(Boolean)).toEqual([]);
  });
});
