#!/usr/bin/env node
// The rights and the context of each role session the circuit launches, from one source (ROLES):
// the testwriter and the developpeur in the envelope of their plan (scripts/enveloppe/lancer.sh),
// the explorateur, the questionneur and the reviewer out of it (scripts/circuit.mjs). As a task of CI receives its
// rights from its steps and runs on an image of its own, not on the workstation of its author
// (GitHub Actions `permissions:` per job, the hermetic actions of Bazel), a session receives the
// rights the commands of its skill name, and the context its work reads.
//
//   npx grillhouse droits <rôle> --racine <arbre principal> --copie <copie> --ticket <ticket>
//
// prints the options of claude for that session, one per line (`optionsDuRole`):
//
// - `--setting-sources project,local`: the user's own configuration stays out (their CLAUDE.md,
//   their hooks, the skills of their account, their servers, their environment); the project's
//   settings and charter, and the frame's plugin it enables (agents, skills, common charter,
//   hooks), stay in.
// - `--settings <json>` (the settings of the role, on the command line: no file the session could
//   change): its permissions (`allow`, the commands its skill names, and the reading of its
//   skill's files, references included, and of the METACADRE.md its skill names, in the frame's
//   plugin as installed for the copy, else for the project, by `Read` and `ls` and with no writing; `deny`, the change of its
//   author at the ticket, AUTEUR_FIXE, for a role that writes the editing by script, the test
//   tool run directly and the reading again of the ticket its instruction carries, and for a role
//   that writes nothing at the ticket, the explorateur and the questionneur, every write of bd,
//   ECRIRE_AU_TICKET); the
//   automatic memory off; the skills of Claude Code off (`disableBundledSkills`, and the few it keeps,
//   INTEGREES), and the project's own skills (`.claude/skills/` of the copy) off
//   (`skillOverrides`); every plugin the project enables off (`enabledPlugins`: their skills,
//   hooks and servers are not the role's), save the frame's (`grillhouse@…`), which carries the
//   role's agent, its skills and the frame's hooks: Claude Code applies no `skillOverrides` to the
//   skills of a plugin, and the role's agent preloads its own (`skills` of its definition);
//   the background tasks off (`env`, SANS_TACHE_DE_FOND: a role waits in the foreground for what
//   it launches, and its session ends with its sheet); for a role that writes, its locks as hooks (PreToolUse: verrous/verrou.mjs on the tools of
//   writing, verrous/commande.mjs on Bash), since the hooks of an agent's definition do not run in
//   a folder Claude Code has not trusted, as the copy of a ticket.
// - `--tools <list>`: the tools its work uses; Edit and Write for a role that writes alone, the
//   tool search for a role whose index Claude Code defers.
// - `--strict-mcp-config --mcp-config <json>`: the servers of the index (codegraph, rtfm) for a
//   role that uses it, read in the project's `.mcp.json` and in the manifests of the plugins it
//   enables, at their installed path (`~/.claude/plugins/installed_plugins.json`, the project's
//   entry first, else the user's); none for the others.
//
// The skills' commands and the permissions answer one another: tests/unit/droits.spec.ts fails on a
// command a skill names that no permission covers, and on a permission no command names.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { langageDe } from './langages.mjs';

// The variable in which bd reads the author of a comment (`bd --help`: « default: $BEADS_ACTOR,
// git user.name, $USER »).
const ACTEUR = 'BEADS_ACTOR';
// The rules that refuse a session the change of its author at the ticket: bd's options `--actor`
// and `-a`/`--author`, and the variable itself.
export const AUTEUR_FIXE = [
  'Bash(bd *--actor*)',
  'Bash(bd *--author*)',
  'Bash(bd * -a*)',
  `Bash(*${ACTEUR}*)`,
];
// What a role that writes may not run: a file is edited by its tools of writing, which its lock
// judges, and the tests run by `npm test` (charter, « Les tests se lancent par npm test »).
const ECRIRE_PAR_SCRIPT = [
  'Bash(python *)',
  'Bash(python3 *)',
  'Bash(sed -i*)',
  'Bash(sed * -i*)',
  'Bash(perl -i*)',
  'Bash(perl -pi*)',
  'Bash(perl * -i*)',
  'Bash(perl * -pi*)',
];
// What a role that writes nothing at the ticket may not run: the circuit writes its exchange there,
// from its sheet.
const ECRIRE_AU_TICKET = [
  'Bash(bd comments add*)',
  'Bash(bd update*)',
  'Bash(bd create*)',
  'Bash(bd close*)',
  'Bash(bd reopen*)',
  'Bash(bd delete*)',
  'Bash(npx grillhouse ticket*)',
];
// The variable that turns off the background tasks of Claude Code (the Bash tool's
// `run_in_background`, the background agents): `claude -p` waits for them before it ends, so a
// session ends with its sheet only without them.
const SANS_TACHE_DE_FOND = { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' };

// The reads of git in the copy, by its path (`git -C <copie> …`), which Claude Code does not let
// through without a rule, as it does `git status` in the working directory.
const LIRE_GIT = [
  'Bash(git -C * status*)',
  'Bash(git -C * diff*)',
  'Bash(git -C * log*)',
  'Bash(git -C * ls-files*)',
  'Bash(git -C * grep*)',
];
// The skills Claude Code keeps listed when its own are off (`disableBundledSkills`), measured on
// Claude Code 2.1.305.
const INTEGREES = ['design', 'doctor', 'plugin-authoring'];
// The frame's plugin, by the start of its identifier (`grillhouse@<place de marché>`).
const GREFFON_DU_CADRE = 'grillhouse@';
// The servers of the index (charter, « L'index d'abord »).
const INDEX = ['codegraph', 'rtfm'];
// The reads of the index by a role that writes: codegraph for the calls, rtfm for the search and
// the reading of a result whole.
const LIRE_L_INDEX = [
  'Bash(codegraph explore *)',
  'mcp__codegraph__codegraph_explore',
  'mcp__rtfm__rtfm_search',
  'mcp__rtfm__rtfm_expand',
];
// The tools of every role, and of a role that writes.
const LIRE = ['Bash', 'Read', 'Skill'];
const ECRIRE = ['Edit', 'Write'];

// Each role the circuit launches: whether it writes (files, `ecrit`; the ticket, unless
// `ecritAuTicket` is false), whether it uses the index, whether its skill names the frame's
// METACADRE.md (`metacadre`, read at the root of the plugin installed), and the commands its skill
// names (the frame's plugin, `mods/grillhouse/skills/<rôle>/`), as permission rules.
export const ROLES = {
  // It writes no file and nothing at the ticket: it surveys the components and reads the code by
  // the index, and ends on the plan in its sheet, which the circuit writes at the ticket. At the
  // tri of the discoveries, it reads each one and its parent, the commit of main and its history
  // (`git show`, `git log`, in its working directory, the main tree, or by `git -C`), and builds
  // a package before it judges an error of types of its export; no pass (grillhouse-0yu.5). Its
  // instruction of the tri lists these commands (`commandesPermises`, grillhouse-6ve).
  explorateur: {
    metacadre: true,
    index: true,
    ecritAuTicket: false,
    commandes: [
      'Bash(bd show *)',
      'Bash(bd comments *)',
      'Bash(git show *)',
      'Bash(git log *)',
      'Bash(git -C * show *)',
      'Bash(git -C * log *)',
      'Bash(npx grillhouse composants-affectes *)',
      'Bash(npm run build -- --filter=*)',
      'Bash(codegraph explore *)',
      'mcp__codegraph__codegraph_explore',
      'mcp__rtfm__rtfm_search',
    ],
  },
  // It writes the tests of the whole ticket, in the envelope of its plan, and reads the whole copy
  // by the index (charter, « L'index d'abord »).
  testwriter: {
    metacadre: true,
    ecrit: true,
    index: true,
    commandes: [
      'Bash(bd update * --claim)',
      'Bash(bd comments add *)',
      'Bash(npm test *)',
      // The removal of a file of its tests, by a script of its temporary directory.
      'Bash(node $TMPDIR/*)',
      ...LIRE_L_INDEX,
    ],
  },
  // It writes the code of the whole ticket, in the envelope of its plan, and reads the whole copy
  // by the index.
  developpeur: {
    metacadre: true,
    ecrit: true,
    index: true,
    commandes: [
      'Bash(bd update * --claim)',
      'Bash(bd update * --notes*)',
      'Bash(bd comments add *)',
      'Bash(git -C * status*)',
      'Bash(git -C * diff*)',
      'Bash(npm test *)',
      'Bash(npm run api*)',
      ...LIRE_L_INDEX,
    ],
  },
  relecteur: {
    metacadre: true,
    index: true,
    commandes: [
      ...LIRE_GIT,
      'Bash(npx grillhouse index-interfaces --publie *)',
      'Bash(npm test *)',
      'Bash(npm run verifier -- --gardes*)',
      'Bash(codegraph explore *)',
      'mcp__codegraph__codegraph_explore',
      'mcp__rtfm__rtfm_search',
    ],
  },
  // It asks, and decides nothing: it reads the proposal its instruction carries and the code by
  // the index; the circuit writes its questions at the ticket.
  questionneur: {
    index: true,
    ecritAuTicket: false,
    commandes: [
      'Bash(codegraph explore *)',
      'mcp__codegraph__codegraph_explore',
      'mcp__rtfm__rtfm_search',
    ],
  },
};

// The commands the rights of <role> permit (ROLES.<role>.commandes), one line each, in Markdown, as
// the help of a tool lists its commands: a rule of Bash as its command, `…` for its wildcard; a
// tool by its name. Its instruction carries them, so that it names no command its rights refuse.
/** @param {keyof typeof ROLES} role @returns {string} */
export function commandesPermises(role) {
  return ROLES[role].commandes
    .map(r => {
      const bash = /^Bash\((.*)\)$/.exec(r);
      return bash
        ? `- \`${bash[1].replaceAll('*', '…')}\``
        : `- l'outil \`${r.split('__').at(-1)}\``;
    })
    .join('\n');
}

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The plugins the project enables, in its settings and its local settings.
function greffonsDuProjet(racine) {
  const actifs = new Set();
  for (const f of ['settings.json', 'settings.local.json']) {
    const p = lireJson(path.join(racine, '.claude', f))?.enabledPlugins ?? {};
    for (const [nom, actif] of Object.entries(p)) if (actif) actifs.add(nom);
  }
  return [...actifs].sort();
}

// The installed path of the plugin <nom> for the projects <projets>: the entry of the first that
// has one, else the user's.
function cheminDuGreffon(nom, projets, home) {
  const entrees =
    lireJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'))?.plugins?.[nom] ?? [];
  const e =
    projets.map(p => entrees.find(x => x.projectPath === p)).find(Boolean) ??
    entrees.find(x => x.scope === 'user') ??
    null;
  return e?.installPath ?? null;
}

// The reading of the skill of <role> (SKILL.md and its references/) in the frame's plugin, as
// installed for the copy where the session runs, else for the project, and of the plugin's
// METACADRE.md alone for a role whose skill names it: rules `Read(//…)`, which let through the
// tool Read and `ls` of those folders, and write nothing (measured on Claude Code in `dontAsk`).
// Narrower than a folder of work (`--add-dir`), which would open the whole plugin; none when the
// plugin is not installed.
function lireSaCompetence(role, { racine, copie, home }) {
  const cadre = greffonsDuProjet(racine).find(g => g.startsWith(GREFFON_DU_CADRE));
  const dossier = cadre && cheminDuGreffon(cadre, [copie, racine], home);
  if (!dossier) {
    return [];
  }
  return [
    `Read(/${path.join(dossier, 'skills', role)}/**)`,
    ...(ROLES[role].metacadre ? [`Read(/${path.join(dossier, 'METACADRE.md')})`] : []),
  ];
}

// The servers of the index: the project's `.mcp.json`, then the manifests of the plugins it enables.
function serveursDeLIndex(racine, home) {
  const out = {};
  const projet = lireJson(path.join(racine, '.mcp.json'))?.mcpServers ?? {};
  for (const n of INDEX) if (projet[n]) out[n] = projet[n];
  for (const greffon of greffonsDuProjet(racine)) {
    const dossier = cheminDuGreffon(greffon, [racine], home);
    if (!dossier) continue;
    const serveurs =
      lireJson(path.join(dossier, '.claude-plugin', 'plugin.json'))?.mcpServers ??
      lireJson(path.join(dossier, '.mcp.json'))?.mcpServers ??
      {};
    for (const n of INDEX) {
      if (out[n] || !serveurs[n]) continue;
      out[n] = JSON.parse(JSON.stringify(serveurs[n]).replaceAll('${CLAUDE_PLUGIN_ROOT}', dossier));
    }
  }
  return out;
}

// The settings of the session of <role>, for the ticket <ticket>, its copy <copie> (where the
// project's own skills are read) and the main tree <racine>; <home> holds the plugins installed.
function reglagesDuRole(role, { racine, copie = racine, ticket, home }) {
  const r = ROLES[role];
  if (!r) throw new Error(`rôle sans droits : ${role}`);
  const deny = [...AUTEUR_FIXE, ...(r.ecritAuTicket === false ? ECRIRE_AU_TICKET : [])];
  if (r.ecrit) {
    // The test tool run directly (charter, « Aucun agent ne lance l'outil de test directement »),
    // as the module of the copy's language names it: `npm test` and `npm run verifier` play it.
    deny.push(...ECRIRE_PAR_SCRIPT, ...langageDe(copie).droits);
    // The ticket its instruction carries, its description, notes and last handover.
    for (const lecture of ['show', 'comments']) {
      deny.push(`Bash(bd ${lecture} ${ticket})`, `Bash(bd ${lecture} ${ticket} *)`);
    }
  }
  const propres = path.join(copie, '.claude', 'skills');
  const autres = [
    ...INTEGREES,
    ...(existsSync(propres)
      ? readdirSync(propres, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
      : []),
  ];
  const reglages = {
    permissions: {
      allow: [...r.commandes, ...lireSaCompetence(role, { racine, copie, home })],
      deny,
    },
    autoMemoryEnabled: false,
    disableBundledSkills: true,
    skillOverrides: Object.fromEntries(autres.map(s => [s, 'off'])),
    enabledPlugins: Object.fromEntries(
      greffonsDuProjet(racine)
        .filter(g => !g.startsWith(GREFFON_DU_CADRE))
        .map(g => [g, false])
    ),
    env: SANS_TACHE_DE_FOND,
  };
  if (r.ecrit) {
    reglages.hooks = {
      PreToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit|NotebookEdit',
          hooks: [
            {
              type: 'command',
              command: `"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" verrou ${role}`,
            },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" commande',
            },
          ],
        },
      ],
    };
  }
  return reglages;
}

// The options of claude for the session of <role> (the header's list); <home> holds the plugins
// installed.
export function optionsDuRole(role, contexte) {
  const { racine, home = os.homedir() } = contexte;
  const r = ROLES[role];
  const serveurs = r?.index ? serveursDeLIndex(racine, home) : {};
  const outils = [...LIRE, ...(r?.ecrit ? ECRIRE : []), ...(r?.index ? ['ToolSearch'] : [])];
  return [
    '--setting-sources',
    'project,local',
    '--settings',
    JSON.stringify(reglagesDuRole(role, { ...contexte, home })),
    '--tools',
    outils.join(','),
    '--strict-mcp-config',
    '--mcp-config',
    JSON.stringify({ mcpServers: serveurs }),
  ];
}

// The command's options for <argv>, written to stdout; its exit code.
function commande(argv) {
  const [role, ...reste] = argv;
  const o = {};
  for (let i = 0; i < reste.length; i += 2) {
    const cle = reste[i]?.replace(/^--/, '');
    if (!['racine', 'copie', 'ticket'].includes(cle) || i + 1 >= reste.length) {
      process.stderr.write(`usage : droits.mjs <rôle> --racine <r> --copie <c> --ticket <t>\n`);
      return 2;
    }
    o[cle] = reste[i + 1];
  }
  if (!ROLES[role] || !o.racine || !o.ticket) {
    process.stderr.write(
      `droits.mjs : rôle ${role ?? '(aucun)'} sans droits, ou racine et ticket absents.\n`
    );
    return 2;
  }
  process.stdout.write(`${optionsDuRole(role, o).join('\n')}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = commande(process.argv.slice(2));
}
