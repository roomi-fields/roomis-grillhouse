// grillhouse-3uv.89, L2: each role session the circuit launches receives its rights and its context
// from one source (scripts/droits.mjs): its rights drawn from the commands its skill names, the
// user's own configuration left out (instructions, hooks, skills of the account, servers), the
// automatic memory off, the servers of the index alone for a role that uses it, its own skill alone,
// and the role's locks in its settings. Witness: BPScript 320.3, 47 refused calls, ~50 k tokens of
// context before the first word, the skills of every installed plugin listed, the user's global
// instructions to commit and push, the frontmatter locks of the copies never run.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { AUTEUR_FIXE, optionsDuRole, ROLES } from '../../scripts/droits.mjs';
import type { Langage } from '../../scripts/jointure.js';
import typescript from '../../scripts/langages/typescript/index.mjs';
import { couvre } from '@roomi-fields/grillhouse-matiere/test-fixtures';

const RACINE = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'droits-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Reglages = {
  permissions: { allow: string[]; deny: string[] };
  autoMemoryEnabled: boolean;
  disableBundledSkills: boolean;
  skillOverrides: Record<string, string>;
  enabledPlugins: Record<string, boolean>;
  env?: Record<string, string>;
  hooks?: { PreToolUse?: { matcher: string; hooks: { command: string }[] }[] };
};

// The value that follows <flag> in <args>.
const valeur = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
const reglagesDe = (args: string[]) => JSON.parse(valeur(args, '--settings')) as Reglages;
const mcpDe = (args: string[]) =>
  JSON.parse(valeur(args, '--mcp-config')) as { mcpServers: Record<string, { command: string }> };

// The session of <role> on the ticket demo-1 of the frame's own repository.
const JOURNAL = '/depot/.claude/worktrees/demo-1.log';
const options = (role: string, racine = RACINE) =>
  optionsDuRole(role, {
    racine,
    copie: racine,
    ticket: 'demo-1',
    // A home without plugins: the servers come from the project alone.
    home: path.join(ESSAIS, 'vide'),
  });

// The commands a skill names, in their written form (grillhouse-3uv.92.7, critère 4): each span of
// code, or line of a block of code, that opens on a command of the shell, or names a tool of the
// index. A placeholder `<…>` takes the value a session gives it (COMPLETER): the copy, the ticket,
// the files of the circuit by their absolute paths, a text of several lines; any other, one word.
const COMMANDE =
  /^(bd|npm|npx|git|node|bash|codegraph|grep|tail|head|sed|cat|python3?|perl|vitest)( |$)/;
const OUTILS_DE_L_INDEX: Record<string, string> = {
  rtfm_search: 'mcp__rtfm__rtfm_search',
  rtfm_expand: 'mcp__rtfm__rtfm_expand',
  codegraph_explore: 'mcp__codegraph__codegraph_explore',
};
// The copy of the ticket demo-1, where the session runs.
const COPIE = '/depot/.claude/worktrees/demo-1';
const COMPLETER: Record<string, string> = {
  copie: COPIE,
  ticket: 'demo-1',
  journal: JOURNAL,
  motif: '"FAIL"',
  lignes: '40',
  n: '5',
  texte: '"Ce qui est fait.\n\nCe qui reste."',
};
function demandees(role: string): string[] {
  const dossier = path.join(RACINE, 'mods/grillhouse/skills', role);
  const refs = path.join(dossier, 'references');
  const fichiers = [
    path.join(dossier, 'SKILL.md'),
    ...(() => {
      try {
        return readdirSync(refs)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join(refs, f));
      } catch {
        return [];
      }
    })(),
  ];
  const out = new Set<string>();
  for (const f of fichiers) {
    const texte = readFileSync(f, 'utf8');
    const blocs = [...texte.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].flatMap(m => m[1].split('\n'));
    const sansBlocs = texte.replace(/```[\s\S]*?```/g, '');
    const spans = [...sansBlocs.matchAll(/`([^`]+)`/g)].map(m => m[1]);
    for (const brut of [...spans, ...blocs]) {
      const c = brut
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/<([^<>]*)>/g, (_, nom: string) => COMPLETER[nom.trim()] ?? 'x');
      if (OUTILS_DE_L_INDEX[c]) {
        out.add(OUTILS_DE_L_INDEX[c]);
      } else if (COMMANDE.test(c)) {
        out.add(c);
      }
    }
  }
  return [...out];
}

const dans = (p: string, dossier: string) => p === dossier || p.startsWith(`${dossier}/`);
const echapper = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
// The absolute paths the rules `Read(//…)` of <allow> permit, as Claude Code matches them (the
// globs of gitignore): `**` any depth, `*` within one name.
const lectures = (allow: string[]) =>
  allow
    .map(r => /^Read\(\/(\/.*)\)$/.exec(r)?.[1])
    .filter((g): g is string => Boolean(g))
    .map(
      g =>
        new RegExp(
          `^${g
            .split('**')
            .map(p => p.split('*').map(echapper).join('[^/]*'))
            .join('.*')}$`
        )
    );
// Whether the tool Read reads the absolute path <p> without a prompt, under <reglages>, in <cwd>.
const litSansInvite = (p: string, reglages: Reglages, cwd = COPIE) =>
  dans(p, cwd) || lectures(reglages.permissions.allow).some(g => g.test(p));
describe('L2 — the author of a session at the ticket', () => {
  it('no role may change the author of its comments at the ticket', () => {
    for (const role of Object.keys(ROLES)) {
      expect(reglagesDe(options(role)).permissions.deny, role).toEqual(
        expect.arrayContaining(AUTEUR_FIXE)
      );
    }
    expect(AUTEUR_FIXE).toEqual([
      'Bash(bd *--actor*)',
      'Bash(bd *--author*)',
      'Bash(bd * -a*)',
      'Bash(*BEADS_ACTOR*)',
    ]);
  });
});

describe('L2 — what a role that writes may not run', () => {
  const INTERDITS = [
    'npx vitest run',
    'npx --no-install vitest run x',
    'vitest run',
    'node_modules/.bin/vitest run',
    'npm exec vitest run',
    'npm exec -- vitest run',
    // Turborepo, which plays the test tool (grillhouse-982.5).
    'turbo run test:unit',
    'npx turbo run test:unit --filter=a',
    'npx --no-install turbo run test',
    'npm exec turbo run test',
    'npm exec -- turbo run test',
    'node_modules/.bin/turbo run test',
    // The ticket its instruction carries, read again.
    'bd show demo-1',
    'bd show demo-1 --json',
    'bd comments demo-1',
    'bd comments demo-1 --json',
  ];
  for (const role of ['testwriter', 'developpeur']) {
    it(`${role}: the test tool run directly and its ticket read again are refused`, () => {
      const { deny } = reglagesDe(options(role)).permissions;
      const passent = INTERDITS.filter(c => !deny.some(r => couvre(r, c)));
      expect(passent, role).toEqual([]);
      // Its own comment at the ticket, and the reads of another ticket, stay open.
      // The commands the frame plays its tests by stay open too.
      for (const c of [
        'bd comments add demo-1 x',
        'bd show demo-2',
        'npm test -- packages/a',
        'npm run test:forcer -- packages/a',
        'npm run verifier',
        'npm run verifier -- --gardes',
        'npx grillhouse turbo-des-paquets --ecrire',
      ]) {
        expect(
          deny.some(r => couvre(r, c)),
          `${role} : ${c}`
        ).toBe(false);
      }
    });
  }

  // grillhouse-pkl.5, criterion 2: the test tool run directly is the language's, which its module
  // names (`droits`, scripts/jointure.d.ts): a project of cargo refuses cargo's runner, and names
  // neither Vitest nor Turborepo; a project of TypeScript keeps the rules it had.
  it('pkl.5 critère 2: the rules of TypeScript stay the same, and are its module’s', () => {
    expect((typescript as unknown as Langage).droits).toEqual([
      'Bash(vitest*)',
      'Bash(npx vitest*)',
      'Bash(npx * vitest*)',
      'Bash(npm exec vitest*)',
      'Bash(npm exec * vitest*)',
      'Bash(node_modules/.bin/vitest*)',
      'Bash(turbo *)',
      'Bash(npx turbo *)',
      'Bash(npx * turbo *)',
      'Bash(npm exec turbo *)',
      'Bash(npm exec * turbo *)',
      'Bash(node_modules/.bin/turbo *)',
    ]);
    for (const role of ['testwriter', 'developpeur']) {
      const { deny } = reglagesDe(options(role)).permissions;
      for (const r of (typescript as unknown as Langage).droits) {
        expect(deny, `${role} : ${r}`).toContain(r);
      }
    }
  });

  it('pkl.5 critère 2: a project of cargo refuses cargo’s test runner, and names neither vitest nor turbo', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'cargo-'));
    writeFileSync(path.join(projet, 'package.json'), JSON.stringify({ name: 'p' }));
    declarerLesLangages(projet, ['cargo']);
    for (const role of ['testwriter', 'developpeur']) {
      const { deny } = reglagesDe(options(role, projet)).permissions;
      expect(
        deny.filter(r => /vitest|turbo/i.test(r)),
        role
      ).toEqual([]);
      for (const c of ['cargo test', 'cargo test -p a', 'cargo nextest run -p a']) {
        expect(
          deny.some(r => couvre(r, c)),
          `${role} : ${c}`
        ).toBe(true);
      }
      for (const c of ['npm test -- crates/a', 'npx grillhouse typer', 'cargo check']) {
        expect(
          deny.some(r => couvre(r, c)),
          `${role} : ${c}`
        ).toBe(false);
      }
    }
  });

  it('the testwriter and the developpeur no longer read their ticket by bd: their instruction carries it', () => {
    for (const role of ['testwriter', 'developpeur']) {
      const relit = /^bd (show|comments)( (?!add\b)|$)/;
      expect(
        demandees(role).filter(c => relit.test(c)),
        role
      ).toEqual([]);
    }
  });
});

// The instruction of the tri (grillhouse-6ve): what proves a verdict.
describe('6ve — the instruction of the tri', () => {
  // The eighth block of the templates, the explorateur's on the tri.
  const gabarit = () =>
    [
      ...readFileSync(
        path.join(RACINE, 'mods/grillhouse/skills/pitmaster/references/consigne-agent.md'),
        'utf8'
      ).matchAll(/```text\n([\s\S]*?)\n```/g),
    ][7][1];

  it('critère 3 — the instruction of the tri says a piece file:line suffices to an a-porter or a traitee, and that no test nor pass runs', () => {
    const t = gabarit().replace(/\s+/g, ' ');
    expect(t).toMatch(/fichier:ligne[^.]*suffit/);
    expect(t).toMatch(/aucun test ni aucune passe/);
  });
});

describe("L2 — the context of a role's session", () => {
  it('leaves out the configuration of the user: only the project and its local settings are read, the automatic memory is off', () => {
    for (const role of Object.keys(ROLES)) {
      const a = options(role);
      expect(valeur(a, '--setting-sources'), role).toBe('project,local');
      expect(reglagesDe(a).autoMemoryEnabled, role).toBe(false);
      expect(reglagesDe(a).disableBundledSkills, role).toBe(true);
    }
  });

  it("excludes the user's own charter from every role, whatever the setting sources", () => {
    for (const role of Object.keys(ROLES)) {
      const maison = path.join(ESSAIS, 'vide');
      expect(
        reglagesDe(options(role)) as unknown as { claudeMdExcludes: string[] },
        role
      ).toMatchObject({
        claudeMdExcludes: [path.join(maison, '.claude', 'CLAUDE.md')],
      });
    }
  });

  // grillhouse-3uv.84.2: the skills of the frame are its plugin's, which Claude Code's
  // `skillOverrides` does not reach; the role's agent preloads its own.
  it("turns off the project's own skills and the built-in ones Claude Code keeps, for every role", () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'propres-'));
    mkdirSync(path.join(projet, '.claude/skills/propre'), { recursive: true });
    writeFileSync(path.join(projet, '.claude/skills/propre/SKILL.md'), '---\nname: propre\n---\n');
    writeFileSync(path.join(projet, 'package.json'), JSON.stringify({ name: 'p' }));
    declarerLesLangages(projet);
    for (const role of Object.keys(ROLES)) {
      const { skillOverrides } = reglagesDe(options(role, projet));
      expect(skillOverrides, role).toEqual({
        design: 'off',
        doctor: 'off',
        'plugin-authoring': 'off',
        propre: 'off',
      });
    }
  });

  it("turns off every plugin the project enables but the frame's, which carries the role's agent, its skills and the hooks of the frame", () => {
    const projet = (
      JSON.parse(readFileSync(path.join(RACINE, '.claude/settings.json'), 'utf8')) as {
        enabledPlugins: Record<string, boolean>;
      }
    ).enabledPlugins;
    expect(Object.keys(projet)).toContain('grillhouse@roomi-fields');
    for (const role of Object.keys(ROLES)) {
      const { enabledPlugins } = reglagesDe(options(role));
      expect(enabledPlugins, role).not.toHaveProperty('grillhouse@roomi-fields');
      for (const p of Object.keys(projet).filter(p => p !== 'grillhouse@roomi-fields')) {
        expect(enabledPlugins[p], `${role} : ${p}`).toBe(false);
      }
    }
  });

  it("finds each role's agent in the frame's plugin, which preloads its skill", () => {
    for (const role of Object.keys(ROLES)) {
      const definition = readFileSync(
        path.join(RACINE, `mods/grillhouse/agents/${role}.md`),
        'utf8'
      );
      expect(definition, role).toMatch(new RegExp(`^skills:\\n  - grillhouse:${role}$`, 'm'));
    }
  });

  // grillhouse-3uv.95.6 (the supervisor's review of 95.3): in the envelope, the testwriter and the
  // developpeur see the whole copy, index included; the charter says « l'index d'abord ».
  it('keeps the servers of the index for every role, each of which reads the whole repository, and no other server', () => {
    for (const role of Object.keys(ROLES)) {
      const r = options(role);
      expect(r, role).toContain('--strict-mcp-config');
      expect(Object.keys(mcpDe(r).mcpServers).sort(), role).toEqual(['codegraph']);
      expect(mcpDe(r).mcpServers.codegraph.command, role).toBe('codegraph');
    }
  });

  it('grillhouse-3uv.95.6: the testwriter and the developpeur read by the index, codegraph and rtfm, and their skills say so', () => {
    for (const role of ['testwriter', 'developpeur']) {
      const { allow } = reglagesDe(options(role)).permissions;
      expect(allow, role).toEqual(
        expect.arrayContaining([
          'mcp__codegraph__codegraph_explore',
          'mcp__rtfm__rtfm_search',
          'mcp__rtfm__rtfm_expand',
        ])
      );
      expect(demandees(role), role).toEqual(
        expect.arrayContaining([
          'mcp__codegraph__codegraph_explore',
          'mcp__rtfm__rtfm_search',
          'mcp__rtfm__rtfm_expand',
        ])
      );
      expect(
        demandees(role).some(c => c.startsWith('codegraph explore ')),
        role
      ).toBe(true);
    }
  });

  it("gives rtfm to the reviewer from the plugin the project enables, at the plugin's installed path", () => {
    // A project that enables rtfm, and a home where the plugin is installed for the user.
    const depot = path.join(ESSAIS, 'depot');
    const home = path.join(ESSAIS, 'home');
    const plugin = path.join(home, '.claude/plugins/cache/roomi-fields/rtfm/9.9.9');
    mkdirSync(path.join(depot, '.claude'), { recursive: true });
    mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
    writeFileSync(
      path.join(depot, '.claude/settings.json'),
      JSON.stringify({ enabledPlugins: { 'rtfm@roomi-fields': true } })
    );
    writeFileSync(
      path.join(plugin, '.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'rtfm',
        mcpServers: {
          rtfm: {
            command: '${CLAUDE_PLUGIN_ROOT}/bin/rtfm-serve',
            env: { RTFM_DB: '.rtfm/library.db' },
          },
        },
      })
    );
    writeFileSync(
      path.join(home, '.claude/plugins/installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'rtfm@roomi-fields': [
            { scope: 'local', projectPath: '/ailleurs', installPath: '/ailleurs/rtfm' },
            { scope: 'user', installPath: plugin },
          ],
        },
      })
    );
    const a = optionsDuRole('relecteur', {
      racine: depot,
      copie: depot,
      ticket: 'demo-1',
      home,
    });
    expect(mcpDe(a).mcpServers).toEqual({
      rtfm: { command: `${plugin}/bin/rtfm-serve`, env: { RTFM_DB: '.rtfm/library.db' } },
    });
    expect(reglagesDe(a).enabledPlugins['rtfm@roomi-fields']).toBe(false);
  });

  it('offers each role the tools its work needs: the reviewer and the questionneur write nothing', () => {
    const outils = (role: string) => valeur(options(role), '--tools').split(',');
    for (const role of ['testwriter', 'developpeur']) {
      expect(outils(role), role).toEqual(
        expect.arrayContaining(['Bash', 'Read', 'Edit', 'Write', 'Skill'])
      );
    }
    for (const role of ['relecteur', 'questionneur']) {
      expect(outils(role), role).toEqual(expect.arrayContaining(['Bash', 'Read', 'Skill']));
      expect(
        outils(role).filter(o => /Edit|Write/.test(o)),
        role
      ).toEqual([]);
    }
    // The tool search serves the servers of the index, whose tools Claude Code defers.
    for (const role of Object.keys(ROLES)) {
      expect(outils(role), role).toContain('ToolSearch');
    }
    for (const role of Object.keys(ROLES)) {
      expect(
        outils(role).filter(o => /^(Agent|Workflow|WebFetch|WebSearch)$/.test(o)),
        role
      ).toEqual([]);
    }
  });

  it('prints the options of a session for the launcher, one per line', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(
      'node',
      [
        path.join(RACINE, 'packages/grillhouse/scripts/droits.mjs'),
        'developpeur',
        '--racine',
        RACINE,
        '--copie',
        RACINE,
        '--ticket',
        'demo-1',
      ],
      // The same home without plugins as `options`: the servers of the index come from the
      // project alone.
      { encoding: 'utf8', env: { ...process.env, HOME: path.join(ESSAIS, 'vide') } }
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n').slice(0, -1)).toEqual(options('developpeur'));
  });
});

// grillhouse-3uv.92.6: a role's session ends with its sheet; it launches nothing in the
// background, which would hold it alive past its sheet (`claude -p` waits for its background
// tasks), as a job of GitLab ends with its main command. Witness: BPScript 320.4, a session's
// `until … sleep 5` launched in the background; its sheet given at 21:37:14, the session ended at
// 21:46:43, when the task reached its limit. 9.3 min.
describe('3uv.92.6 — a role session ends with its sheet, without a background task', () => {
  it("criterion 1: every role's settings turn off Claude Code's background tasks", () => {
    for (const role of Object.keys(ROLES)) {
      expect(reglagesDe(options(role)).env, role).toEqual({
        CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
        CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1',
      });
    }
  });

  it('criterion 2: the skill of every role of the circuit says it waits in the foreground for what it launches', () => {
    for (const role of Object.keys(ROLES)) {
      const competence = readFileSync(
        path.join(RACINE, 'mods/grillhouse/skills', role, 'SKILL.md'),
        'utf8'
      ).replace(/\s+/g, ' ');
      expect(competence, role).toMatch(
        /\*\*(Tu attends au premier plan ce que tu lances|J'attends au premier plan ce que je lance)\*\*/
      );
    }
  });
});

// grillhouse-9jr.2: each role reads the files of its own skill in the frame's installed plugin,
// out of the ticket's copy, as Claude Code gives a session the reading of its folders of work
// (`--add-dir`, `permissions.additionalDirectories`). Witness: BPScript bp-mono-vbwf.328, the
// reviewer refused Read on its skill's references/edge-case-hunter.md and verification-gap.md, and
// `ls` of that folder (permission_denials, bp-mono-vbwf.328.log:8529), files its skill tells it to
// follow to the letter.
describe('9jr.2 — each role reads the files of its skill', () => {
  // A project that enables the frame's plugin, its copy, and a home where the plugin is installed
  // for the copy and for the project, each at its own path.
  const depot = path.join(ESSAIS, 'cadre');
  const copie = path.join(depot, '.claude/worktrees/demo-1');
  const home = path.join(ESSAIS, 'home-cadre');
  const cache = path.join(home, '.claude/plugins/cache/roomi-fields/grillhouse');
  const installe = (entrees: object[]) => {
    // The copy declares its language, whose module names the test tool a writer may not run
    // (grillhouse-pkl.5).
    mkdirSync(copie, { recursive: true });
    writeFileSync(path.join(copie, 'package.json'), JSON.stringify({ name: 'p' }));
    declarerLesLangages(copie);
    mkdirSync(path.join(depot, '.claude'), { recursive: true });
    writeFileSync(
      path.join(depot, '.claude/settings.json'),
      JSON.stringify({ enabledPlugins: { 'grillhouse@roomi-fields': true } })
    );
    mkdirSync(path.join(home, '.claude/plugins'), { recursive: true });
    writeFileSync(
      path.join(home, '.claude/plugins/installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'grillhouse@roomi-fields': entrees } })
    );
  };
  const reglages = (role: string) =>
    reglagesDe(optionsDuRole(role, { racine: depot, copie, ticket: 'demo-1', home }));

  it('criterion 1: every role reads its own skill and its references, by Read and by ls, without a prompt; not the skill of another', () => {
    installe([
      { scope: 'local', projectPath: '/ailleurs', installPath: path.join(cache, '0.0.1') },
      { scope: 'local', projectPath: copie, installPath: path.join(cache, '9.9.9') },
      { scope: 'local', projectPath: depot, installPath: path.join(cache, '9.9.8') },
    ]);
    const roles = Object.keys(ROLES);
    for (const role of roles) {
      const r = reglages(role);
      const dossier = path.join(cache, '9.9.9/skills', role);
      for (const f of [
        path.join(dossier, 'SKILL.md'),
        path.join(dossier, 'references/edge-case-hunter.md'),
      ]) {
        expect(litSansInvite(f, r, copie), `${role} : ${f}`).toBe(true);
      }
      const autre = roles.find(x => x !== role) ?? '';
      expect(
        litSansInvite(path.join(cache, '9.9.9/skills', autre, 'SKILL.md'), r, copie),
        role
      ).toBe(false);
    }
  });

  it("criterion 1: the plugin is the copy's, where the session runs, else the project's", () => {
    installe([{ scope: 'local', projectPath: depot, installPath: path.join(cache, '9.9.8') }]);
    const r = reglages('relecteur');
    expect(litSansInvite(path.join(cache, '9.9.8/skills/relecteur/SKILL.md'), r, copie)).toBe(true);
  });

  // The roles that load the debugging skill of the plugin.
  const DEBOGUENT = ['developpeur', 'direct', 'explorateur'];
  const VOISINS_DU_DEBOGAGE = [
    'SKILL.md',
    'root-cause-tracing.md',
    'defense-in-depth.md',
    'condition-based-waiting.md',
    'condition-based-waiting-example.ts',
    'find-polluter.sh',
  ];

  it.each(DEBOGUENT)(
    'the %s reads every file of the debugging skill, by Read and by ls, without a prompt',
    role => {
      installe([{ scope: 'local', projectPath: copie, installPath: path.join(cache, '9.9.9') }]);
      const r = reglages(role);
      const dossier = path.join(cache, '9.9.9/skills/systematic-debugging');
      for (const f of VOISINS_DU_DEBOGAGE) {
        expect(litSansInvite(path.join(dossier, f), r, copie), f).toBe(true);
      }
    }
  );

  it.each(DEBOGUENT)('the debugging skill opens to the %s no other folder of the plugin', role => {
    installe([{ scope: 'local', projectPath: copie, installPath: path.join(cache, '9.9.9') }]);
    const r = reglages(role);
    const competences = path.join(cache, '9.9.9/skills');
    for (const f of [
      'grill/SKILL.md',
      'testwriter/SKILL.md',
      'systematic-debugging-bis/SKILL.md',
    ]) {
      expect(litSansInvite(path.join(competences, f), r, copie), f).toBe(false);
    }
  });

  it('a role that does not load the debugging skill does not read it', () => {
    installe([{ scope: 'local', projectPath: copie, installPath: path.join(cache, '9.9.9') }]);
    const autres = Object.keys(ROLES).filter(role => !DEBOGUENT.includes(role));
    expect(autres.sort()).toEqual(['questionneur', 'relecteur', 'testwriter']);
    for (const role of autres) {
      const f = path.join(cache, '9.9.9/skills/systematic-debugging/SKILL.md');
      expect(litSansInvite(f, reglages(role), copie), role).toBe(false);
    }
  });

  it('criterion 2: the right gives no writing, and adds no command', () => {
    installe([{ scope: 'local', projectPath: copie, installPath: path.join(cache, '9.9.9') }]);
    for (const role of Object.keys(ROLES)) {
      const { allow } = reglages(role).permissions;
      const neufs = allow.filter(a => !ROLES[role as keyof typeof ROLES].commandes.includes(a));
      expect(neufs.sort(), role).toEqual(
        [
          `Read(/${path.join(cache, '9.9.9/skills', role)}/**)`,
          ...(nommeLeMetacadre(role) ? [`Read(/${path.join(cache, '9.9.9/METACADRE.md')})`] : []),
          ...(DEBOGUENT.includes(role)
            ? [`Read(/${path.join(cache, '9.9.9/skills/systematic-debugging')}/**)`]
            : []),
        ].sort()
      );
      expect(
        allow.filter(a => /^(Edit|Write|MultiEdit|NotebookEdit)\(/.test(a)),
        role
      ).toEqual([]);
    }
  });

  // Criterion 3, found at the review of the lot: the skills of the reviewer, the explorateur, the
  // testwriter and the developpeur name `${CLAUDE_PLUGIN_ROOT}/METACADRE.md`, at the root of the
  // plugin, out of the folder of their skill.
  const nommeLeMetacadre = (role: string) =>
    readFileSync(path.join(RACINE, 'mods/grillhouse/skills', role, 'SKILL.md'), 'utf8').includes(
      '${CLAUDE_PLUGIN_ROOT}/METACADRE.md'
    );

  it('criterion 3: a role whose skill names the METACADRE.md of the plugin reads that file alone, not the root of the plugin', () => {
    installe([{ scope: 'local', projectPath: copie, installPath: path.join(cache, '9.9.9') }]);
    const nomment = Object.keys(ROLES).filter(nommeLeMetacadre);
    expect(nomment.sort()).toEqual(['developpeur', 'explorateur', 'relecteur', 'testwriter']);
    const racineDuGreffon = path.join(cache, '9.9.9');
    for (const role of Object.keys(ROLES)) {
      const r = reglages(role);
      expect(litSansInvite(path.join(racineDuGreffon, 'METACADRE.md'), r, copie), role).toBe(
        nommeLeMetacadre(role)
      );
      expect(litSansInvite(path.join(racineDuGreffon, 'charte.md'), r, copie), role).toBe(false);
    }
  });
});
