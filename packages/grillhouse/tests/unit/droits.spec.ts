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
const ETAT = '/depot/.claude/worktrees/demo-1.circuit.json';
const JOURNAL = '/depot/.claude/worktrees/demo-1.log';
const options = (role: string, racine = RACINE) =>
  optionsDuRole(role, {
    racine,
    copie: racine,
    ticket: 'demo-1',
    journal: JOURNAL,
    preuves: '/depot/.claude/worktrees/demo-1.preuve-*.md',
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
  etat: ETAT,
  journal: JOURNAL,
  motif: '"FAIL"',
  lignes: '40',
  n: '5',
  texte: '"Ce qui est fait.\n\nCe qui reste."',
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
  return new RegExp(`^${corps}${final ? '( .*)?' : ''}$`, 's').test(appel);
}
// The calls a command of the skill makes: the command, and for `codegraph explore` the tool of the
// index too.
const appels = (c: string) =>
  c.startsWith('codegraph explore') ? [c, 'mcp__codegraph__codegraph_explore'] : [c];

// The simple commands of <c>: split where the shell chains them (`;`, `&&`, `||`, `|`, a new
// line), out of quotes.
function simples(c: string): string[] {
  const out: string[] = [];
  let courant = '';
  let quote: string | null = null;
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      courant += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      courant += ch;
    } else if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && c[i + 1] === '&')) {
      if (c[i + 1] === ch) {
        i++;
      }
      out.push(courant.trim());
      courant = '';
    } else {
      courant += ch;
    }
  }
  out.push(courant.trim());
  return out.filter(Boolean);
}
// A command Claude Code lets through without a rule: one that only reads, in the working directory
// or in a file a rule `Read(…)` permits. `git -C <dossier> …` is none: in BPScript 320.4,
// `git -C <copie> status` is refused without a rule, and `git status` passes.
const LECTURE = /^(grep|tail|head|cat|cut|wc|sed -n|git (diff|log|show|status|ls-files|grep))( |$)/;
// Whether the absolute path <p> lies in the directory <dossier>.
const dans = (p: string, dossier: string) => p === dossier || p.startsWith(`${dossier}/`);
const echapper = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
// The refusal Claude Code gives the command <c>, run in <cwd> under the settings <reglages> in the
// mode `dontAsk` (the circuit's), or null when it lets it through. Its rules are those BPScript
// 320.4 measured on the refused calls of its sessions (the analysis of 320.4, refus.py): each
// simple command of a chain is judged alone; an argument in quotes with a line that opens on `#`,
// or an escaped backquote, asks for an approval, refused (`bd comments add` 2 times in 3); a `cd`
// out of the working directory (2 times); a read whose path holds a variable (`$L`, 2 times), or
// a path out of the working directory that no `Read(…)` permits; a command neither permitted nor
// a read.
function refusReel(c: string, reglages: Reglages, cwd = COPIE): string | null {
  const { allow, deny } = reglages.permissions;
  const lectures = allow
    .map(r => /^Read\(\/(\/.*)\)$/.exec(r)?.[1])
    .filter((g): g is string => Boolean(g))
    .map(g => new RegExp(`^${g.split('*').map(echapper).join('[^/]*')}$`));
  const citations = [...c.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map(m => m[1] ?? m[2]);
  if (citations.some(q => /\n\s*#/.test(q))) {
    return `${c} : une ligne en # dans un argument`;
  }
  if (citations.some(q => q.includes('\\`'))) {
    return `${c} : un accent grave échappé`;
  }
  for (const s of simples(c)) {
    if (deny.some(r => couvre(r, s))) {
      return `${s} : refusée par une règle`;
    }
    if (/^cd( |$)/.test(s)) {
      if (!dans(path.resolve(cwd, s.slice(3).trim() || '/'), cwd)) {
        return `${s} : cd hors du dossier de travail`;
      }
      continue;
    }
    if (allow.some(r => couvre(r, s))) {
      continue;
    }
    if (!LECTURE.test(s)) {
      return `${s} : sans règle`;
    }
    const chemins = s
      .split(' ')
      .slice(1)
      .filter(m => !m.startsWith('-') && !/^["']/.test(m) && /[/$]/.test(m));
    for (const m of chemins) {
      if (m.includes('$')) {
        return `${s} : une variable dans le chemin`;
      }
      const p = path.resolve(cwd, m);
      if (!dans(p, cwd) && !lectures.some(g => g.test(p))) {
        return `${s} : ${p} hors du dossier de travail, sans Read`;
      }
    }
  }
  return null;
}

describe('L2 — the rights of each role are drawn from its skill', () => {
  for (const role of Object.keys(ROLES)) {
    it(`${role}: each command its skill names passes its real rights in its written form (critère 4)`, () => {
      const reglages = reglagesDe(options(role));
      const demandes = demandees(role);
      expect(demandes.length, role).toBeGreaterThan(0);
      const refusees = demandes.flatMap(c => {
        const pourquoi = c.startsWith('mcp__')
          ? reglages.permissions.allow.includes(c)
            ? null
            : `${c} : sans règle`
          : refusReel(c, reglages);
        return pourquoi ? [pourquoi] : [];
      });
      expect(refusees, `${role} : commandes nommées et refusées`).toEqual([]);
      const index = demandes
        .filter(c => c.startsWith('codegraph explore'))
        .filter(() => !reglages.permissions.allow.includes('mcp__codegraph__codegraph_explore'));
      expect(index, `${role} : codegraph explore sans son outil`).toEqual([]);
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

// grillhouse-3uv.92.7, critère 4: the judgement of the real rights, measured on the forms that
// BPScript 320.4 saw refused and passed, each time on the same rights.
describe('3uv.92.7 — the real rights refuse and pass the forms BPScript 320.4 measured', () => {
  it('refuses the forms refused in 320.4', () => {
    const testwriter = reglagesDe(options('testwriter'));
    const regulateur = reglagesDe(options('regulateur'));
    const questionneur = reglagesDe(options('questionneur'));
    // A multi-line comment with a line in `#`, under a rule that permits `bd comments add`.
    expect(
      refusReel(
        'bd comments add demo-1 "## Arbitrage du régulateur\n\nLa ligne.\n### Verdict — tranché"',
        testwriter
      )
    ).toMatch(/ligne en #/);
    expect(refusReel('bd comments add demo-1 "Le champ \\`a\\`."', testwriter)).toMatch(
      /accent grave/
    );
    // git -C without a rule; a cd out of the copy; a variable in the path of a read.
    expect(refusReel(`git -C ${COPIE} status --short`, questionneur)).toMatch(/sans règle/);
    expect(refusReel('cd /depot/.claude/worktrees; grep -n FAIL demo-1.log', regulateur)).toMatch(
      /cd hors/
    );
    expect(refusReel(`L=${JOURNAL}; grep -n FAIL $L`, regulateur)).not.toBeNull();
    expect(refusReel('grep -n FAIL /depot/.claude/worktrees/autre.log', regulateur)).toMatch(
      /hors du dossier/
    );
  });

  it('passes the forms passed in 320.4', () => {
    const regulateur = reglagesDe(options('regulateur'));
    const relecteur = reglagesDe(options('relecteur'));
    const testwriter = reglagesDe(options('testwriter'));
    expect(refusReel(`tail -n 25 ${JOURNAL} | cut -c1-400`, regulateur)).toBeNull();
    expect(refusReel(`grep -n "FAIL" ${JOURNAL} | tail -n 30`, regulateur)).toBeNull();
    expect(refusReel('git status --short | head -30', regulateur)).toBeNull();
    expect(refusReel(`git -C ${COPIE} diff HEAD -- packages/a/src/x.ts`, relecteur)).toBeNull();
    expect(refusReel('bd comments add demo-1 "Testwriter : tests écrits."', testwriter)).toBeNull();
  });
});

// grillhouse-3uv.92.7, critère 3: the reads of git the regulator and the reviewer need, in the copy
// (BPScript 320.4: 6 refusals for the regulator, `git -C … status` for the reviewer), are in their
// rights, and their skills name them.
describe('3uv.92.7 — the regulator and the reviewer read git in the copy', () => {
  const LECTURES_GIT = [
    `git -C ${COPIE} status --short`,
    `git -C ${COPIE} diff HEAD -- packages/a`,
    `git -C ${COPIE} log --oneline -n 5`,
    `git -C ${COPIE} ls-files packages/a`,
    `git -C ${COPIE} grep -n FAIL -- packages`,
  ];
  for (const role of ['regulateur', 'relecteur']) {
    it(`${role}: git -C <copie> status, diff, log, ls-files and grep pass its real rights, and its skill names each`, () => {
      const reglages = reglagesDe(options(role));
      expect(LECTURES_GIT.map(c => refusReel(c, reglages)).filter(Boolean), role).toEqual([]);
      const nommees = demandees(role);
      for (const verbe of ['status', 'diff', 'log', 'ls-files', 'grep']) {
        expect(
          nommees.some(c => c.startsWith(`git -C ${COPIE} ${verbe}`)),
          `${role} : git -C <copie> ${verbe}`
        ).toBe(true);
      }
    });
  }

  it("the regulator's instruction promises the reads its rights hold, and no write at the ticket", () => {
    const consigne = readFileSync(
      path.join(RACINE, '.claude/skills/pitmaster/references/consigne-agent.md'),
      'utf8'
    );
    const gabarit =
      /## Régulateur, sur un arrêt[\s\S]*?```text\n([\s\S]*?)```/.exec(consigne)?.[1] ?? '';
    const promesse = /Hors de tes commandes \(([^)]*)\)/.exec(gabarit)?.[1] ?? '';
    expect(promesse).toMatch(/`git -C <copie>/);
    expect(promesse).not.toMatch(/commentaire au ticket|critère ajouté/);
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
      'npx grillhouse ticket demo-1 a b c decouverte',
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

  it("lets the regulator read the ticket's log and its proofs, by their absolute paths, and the circuit's state by its command alone", () => {
    const { allow, deny } = reglagesDe(options('regulateur')).permissions;
    expect(allow).toEqual(
      expect.arrayContaining([
        `Read(/${JOURNAL})`,
        'Read(//depot/.claude/worktrees/demo-1.preuve-*.md)',
      ])
    );
    expect(allow).not.toContain(`Read(/${ETAT})`);
    // It writes nothing at the ticket: the circuit writes its arbitrage and its criterion, from its
    // sheet (critère 1).
    for (const c of ['bd comments add demo-1 x', 'bd update demo-1 -d x']) {
      expect(
        deny.some(r => couvre(r, c)),
        c
      ).toBe(true);
    }
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
      ).toEqual([`"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" verrou ${role}`]);
      const commande = avant.find(h => h.matcher === 'Bash');
      expect(
        commande?.hooks.map(h => h.command),
        role
      ).toEqual(['"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" commande']);
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
        path.join(RACINE, 'packages/grillhouse/scripts/droits.mjs'),
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
      });
    }
  });

  it('criterion 2: the skill of every role of the circuit says it waits in the foreground for what it launches', () => {
    for (const role of Object.keys(ROLES)) {
      const competence = readFileSync(
        path.join(RACINE, '.claude/skills', role, 'SKILL.md'),
        'utf8'
      ).replace(/\s+/g, ' ');
      expect(competence, role).toMatch(
        /\*\*(Tu attends au premier plan ce que tu lances|J'attends au premier plan ce que je lance)\*\*/
      );
    }
  });
});
