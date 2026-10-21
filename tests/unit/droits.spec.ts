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
import { AUTEUR_FIXE, optionsDuRole, ROLES } from '../../scripts/droits.mjs';
import { refusDeCommande } from '../../scripts/verrous/commande.mjs';

const RACINE = path.resolve(__dirname, '../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'droits-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Reglages = {
  permissions: { allow: string[]; deny: string[] };
  autoMemoryEnabled: boolean;
  disableBundledSkills: boolean;
  skillOverrides: Record<string, string>;
  enabledPlugins: Record<string, boolean>;
  hooks?: { PreToolUse?: { matcher: string; hooks: { command: string }[] }[] };
};

// The value that follows <flag> in <args>.
const valeur = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
const reglagesDe = (args: string[]) => JSON.parse(valeur(args, '--settings')) as Reglages;
const mcpDe = (args: string[]) =>
  JSON.parse(valeur(args, '--mcp-config')) as { mcpServers: Record<string, { command: string }> };

// The session of <role> on the ticket demo-1 of the frame's own repository.
const ETAT = '/depot/.claude/worktrees/demo-1.circuit.json';
const JOURNAL = '/depot/.claude/worktrees/demo-1.log';
const options = (role: string, racine = RACINE) =>
  optionsDuRole(role, {
    racine,
    copie: racine,
    ticket: 'demo-1',
    etat: ETAT,
    journal: JOURNAL,
    preuves: '/depot/.claude/worktrees/demo-1.preuve-*.md',
    // A home without plugins: the servers come from the project alone.
    home: path.join(ESSAIS, 'vide'),
  });

// The commands a skill names: each span of code, or line of a block of code, that opens on a
// command of the shell, or names a tool of the index. A placeholder `<…>` stands for one word.
const COMMANDE =
  /^(bd|npm|npx|git|node|bash|codegraph|grep|tail|head|sed|cat|python3?|perl|vitest)( |$)/;
const OUTILS_DE_L_INDEX: Record<string, string> = {
  rtfm_search: 'mcp__rtfm__rtfm_search',
  rtfm_expand: 'mcp__rtfm__rtfm_expand',
  codegraph_explore: 'mcp__codegraph__codegraph_explore',
};
function demandees(role: string): string[] {
  const dossier = path.join(RACINE, '.claude/skills', role);
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
        .replace(/<[^<>]*>/g, 'x')
        .replace(/\s+/g, ' ')
        .trim();
      if (OUTILS_DE_L_INDEX[c]) {
        out.add(OUTILS_DE_L_INDEX[c]);
      } else if (COMMANDE.test(c)) {
        out.add(c);
      }
    }
  }
  return [...out];
}

// Whether the permission rule <regle> covers the call <appel> (a command, or a tool's name), as
// Claude Code matches it: `*` any text, and a final ` *` also nothing.
function couvre(regle: string, appel: string): boolean {
  const m = /^Bash\((.*)\)$/.exec(regle);
  if (!m) {
    return regle === appel;
  }
  const motif = m[1];
  const final = motif.endsWith(' *');
  const corps = (final ? motif.slice(0, -2) : motif)
    .split('*')
    .map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${corps}${final ? '( .*)?' : ''}$`).test(appel);
}
// The calls a command of the skill makes: the command, and for `codegraph explore` the tool of the
// index too.
const appels = (c: string) =>
  c.startsWith('codegraph explore') ? [c, 'mcp__codegraph__codegraph_explore'] : [c];
// A read the session makes without a rule: a command that only reads, in its working directory or
// a file its rules let it read (Claude Code lets a read-only command through).
const LECTURE = /^(grep|tail|head|cat|sed -n|git (diff|log|show|status))( |$)/;

describe('L2 — the rights of each role are drawn from its skill', () => {
  for (const role of Object.keys(ROLES)) {
    it(`${role}: each command its skill names is permitted, and refused by none of its rules`, () => {
      const { allow, deny } = reglagesDe(options(role)).permissions;
      const demandes = demandees(role);
      expect(demandes.length, role).toBeGreaterThan(0);
      const sansRegle = demandes.filter(
        c => !LECTURE.test(c) && !appels(c).every(a => allow.some(r => couvre(r, a)))
      );
      expect(sansRegle, `${role} : commandes nommées, sans droit`).toEqual([]);
      const refusees = demandes.filter(c => appels(c).some(a => deny.some(r => couvre(r, a))));
      expect(refusees, `${role} : commandes nommées et refusées`).toEqual([]);
    });

    it(`${role}: each permission it holds answers a command its skill names`, () => {
      const { allow } = reglagesDe(options(role)).permissions;
      const demandes = demandees(role).flatMap(appels);
      // The reads of the files its instruction names (the regulator's state, log and proofs).
      const orphelines = allow.filter(
        r => !r.startsWith('Read(') && !demandes.some(c => couvre(r, c))
      );
      expect(orphelines, `${role} : droits que rien ne demande`).toEqual([]);
    });
  }

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
    'python3 - <<EOF',
    'python3 script.py',
    'python -c 1',
    'sed -i s/a/b/ f.ts',
    'sed -e s/a/b/ -i f.ts',
    'perl -i -pe s/a/b/ f.ts',
    'perl -pi -e s/a/b/ f.ts',
    'npx vitest run',
    'npx --no-install vitest run x',
    'vitest run',
    'node_modules/.bin/vitest run',
    'npm exec vitest run',
    'npm exec -- vitest run',
    // The ticket its instruction carries, read again.
    'bd show demo-1',
    'bd show demo-1 --json',
    'bd comments demo-1',
    'bd comments demo-1 --json',
  ];
  for (const role of ['testwriter', 'developpeur']) {
    it(`${role}: editing by script, the test tool run directly and its ticket read again are refused`, () => {
      const { deny } = reglagesDe(options(role)).permissions;
      const passent = INTERDITS.filter(c => !deny.some(r => couvre(r, c)));
      expect(passent, role).toEqual([]);
      // Its own comment at the ticket, and the reads of another ticket, stay open.
      for (const c of ['bd comments add demo-1 x', 'bd show demo-2', 'npm test -- packages/a']) {
        expect(
          deny.some(r => couvre(r, c)),
          `${role} : ${c}`
        ).toBe(false);
      }
    });
  }

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

// grillhouse-3uv.89.1 (L9): the questionneur asks and decides nothing; it writes no file and
// nothing at the ticket, which the circuit writes from its sheet.
describe('L9 — the questionneur reads, and writes nothing', () => {
  it('has no tool of writing, and every write at the ticket is refused', () => {
    const a = options('questionneur');
    const outils = valeur(a, '--tools').split(',');
    for (const o of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
      expect(outils, o).not.toContain(o);
    }
    const { deny } = reglagesDe(a).permissions;
    for (const c of [
      'bd comments add demo-1 x',
      'bd update demo-1 -d x',
      'bd update demo-1 --title x',
      'bd create x',
      'bd close demo-1',
      'bash scripts/ticket.sh demo-1 a b c decouverte',
    ]) {
      expect(
        deny.some(r => couvre(r, c)),
        c
      ).toBe(true);
    }
    expect(reglagesDe(a).hooks).toBeUndefined();
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

  it("lists the role's skills alone, its own and those its skill names: every other skill of the project is off", () => {
    const skills = readdirSync(path.join(RACINE, '.claude/skills'));
    for (const role of Object.keys(ROLES)) {
      const texte = readFileSync(path.join(RACINE, '.claude/skills', role, 'SKILL.md'), 'utf8');
      const nommees = [...texte.matchAll(/[Cc]ompétence `([a-z-]+)`/g)].map(m => m[1]);
      const siennes = new Set([role, ...nommees]);
      const { skillOverrides } = reglagesDe(options(role));
      for (const s of skills) {
        expect(skillOverrides[s], `${role} : ${s}`).toBe(siennes.has(s) ? undefined : 'off');
      }
    }
  });

  it("turns off every plugin the project enables: their skills, hooks and servers are not the role's", () => {
    const projet = (
      JSON.parse(readFileSync(path.join(RACINE, '.claude/settings.json'), 'utf8')) as {
        enabledPlugins: Record<string, boolean>;
      }
    ).enabledPlugins;
    for (const role of Object.keys(ROLES)) {
      const { enabledPlugins } = reglagesDe(options(role));
      for (const p of Object.keys(projet)) {
        expect(enabledPlugins[p], `${role} : ${p}`).toBe(false);
      }
    }
  });

  it('keeps the servers of the index for the roles that read the whole repository (the reviewer, the questionneur, the référent technique), and no other server for any role', () => {
    for (const role of ['relecteur', 'questionneur', 'referent-technique']) {
      const r = options(role);
      expect(r, role).toContain('--strict-mcp-config');
      expect(Object.keys(mcpDe(r).mcpServers).sort(), role).toEqual(['codegraph']);
      expect(mcpDe(r).mcpServers.codegraph.command, role).toBe('codegraph');
    }
    for (const role of ['testwriter', 'developpeur', 'regulateur']) {
      const a = options(role);
      expect(a, role).toContain('--strict-mcp-config');
      expect(mcpDe(a).mcpServers, role).toEqual({});
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

  it('offers each role the tools its work needs: the reviewer and the regulator write nothing', () => {
    const outils = (role: string) => valeur(options(role), '--tools').split(',');
    for (const role of ['testwriter', 'developpeur']) {
      expect(outils(role), role).toEqual(
        expect.arrayContaining(['Bash', 'Read', 'Edit', 'Write', 'Skill'])
      );
    }
    for (const role of ['relecteur', 'regulateur']) {
      expect(outils(role), role).toEqual(expect.arrayContaining(['Bash', 'Read', 'Skill']));
      expect(
        outils(role).filter(o => /Edit|Write/.test(o)),
        role
      ).toEqual([]);
    }
    // The tool search serves the servers of the index, whose tools Claude Code defers.
    expect(outils('relecteur')).toContain('ToolSearch');
    for (const role of ['testwriter', 'developpeur', 'regulateur']) {
      expect(outils(role), role).not.toContain('ToolSearch');
    }
    for (const role of Object.keys(ROLES)) {
      expect(
        outils(role).filter(o => /^(Agent|Workflow|WebFetch|WebSearch)$/.test(o)),
        role
      ).toEqual([]);
    }
  });

  it("lets the regulator read the circuit's state, the ticket's log and its proofs, by their absolute paths", () => {
    const { allow } = reglagesDe(options('regulateur')).permissions;
    expect(allow).toEqual(
      expect.arrayContaining([
        `Read(/${ETAT})`,
        `Read(/${JOURNAL})`,
        'Read(//depot/.claude/worktrees/demo-1.preuve-*.md)',
      ])
    );
    // Its skill reads the log in pieces, never whole.
    const demandes = demandees('regulateur');
    expect(demandes.some(c => /^grep /.test(c))).toBe(true);
    expect(demandes.some(c => /^tail /.test(c))).toBe(true);
  });

  it("carries the write locks of the testwriter and the developpeur in their settings, not in the agents' definitions", () => {
    for (const role of ['testwriter', 'developpeur']) {
      const avant = reglagesDe(options(role)).hooks?.PreToolUse ?? [];
      const ecriture = avant.find(h => h.matcher === 'Write|Edit|MultiEdit|NotebookEdit');
      expect(
        ecriture?.hooks.map(h => h.command),
        role
      ).toEqual([`node "$CLAUDE_PROJECT_DIR/scripts/verrous/verrou.mjs" ${role}`]);
      const commande = avant.find(h => h.matcher === 'Bash');
      expect(
        commande?.hooks.map(h => h.command),
        role
      ).toEqual(['node "$CLAUDE_PROJECT_DIR/scripts/verrous/commande.mjs"']);
      // The definition no longer holds the lock: a project's copy is a folder Claude Code has
      // not trusted, where the hooks of an agent's definition do not run.
      const definition = readFileSync(path.join(RACINE, `.claude/agents/${role}.md`), 'utf8');
      expect(definition, role).not.toMatch(/verrou\.mjs|hooks:/);
    }
    for (const role of ['relecteur', 'regulateur']) {
      expect(reglagesDe(options(role)).hooks, role).toBeUndefined();
    }
  });

  it('prints the options of a session for the launcher, one per line', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(
      'node',
      [
        path.join(RACINE, 'scripts/droits.mjs'),
        'developpeur',
        '--racine',
        RACINE,
        '--copie',
        RACINE,
        '--ticket',
        'demo-1',
      ],
      { encoding: 'utf8' }
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n').slice(0, -1)).toEqual(options('developpeur'));
  });
});

// grillhouse-3uv.91.6: a role holds the rights of what its skill asks, and the written rule
// prescribes no gesture its rights refuse. Witness: BPScript 325, at 14:29 the testwriter could not
// remove a test file (python3 refused three times, as the charter's `os.remove` asked); the same
// removal had passed at 14:02 by node. 2.5 min, a stop MONTE.
describe('3uv.91.6 — the testwriter removes a file of its tests', () => {
  const RETRAIT = 'node $TMPDIR/x.mjs';

  it('criterion 1: its skill names the removal by a node script of its temporary directory, which its rights permit and neither its rules nor its command lock refuse', () => {
    const competence = readFileSync(
      path.join(RACINE, '.claude/skills/testwriter/SKILL.md'),
      'utf8'
    );
    expect(demandees('testwriter')).toContain(RETRAIT);
    expect(competence).toMatch(/`rmSync`/);
    const { allow, deny } = reglagesDe(options('testwriter')).permissions;
    expect(allow.some(r => couvre(r, RETRAIT))).toBe(true);
    expect(deny.some(r => couvre(r, RETRAIT))).toBe(false);
    expect(
      refusDeCommande({
        tool_name: 'Bash',
        tool_input: { command: 'node $TMPDIR/retire.mjs' },
        cwd: RACINE,
      })
    ).toBeNull();
  });

  it('criterion 2: the common charter names that gesture for a removal, and no gesture the rights of a role that writes refuse', () => {
    const charte = readFileSync(path.join(RACINE, '.claude/grillhouse/charte.md'), 'utf8').replace(
      /\s+/g,
      ' '
    );
    const phrase = /une suppression passe par [^;]*;/.exec(charte)?.[0] ?? '';
    expect(phrase).toMatch(/script node/);
    expect(phrase).toMatch(/`rmSync`/);
    expect(phrase).not.toMatch(/os\.remove|python/);
    for (const role of ['testwriter', 'developpeur']) {
      const { deny } = reglagesDe(options(role)).permissions;
      expect(
        deny.some(r => couvre(r, RETRAIT)),
        role
      ).toBe(false);
    }
  });
});
