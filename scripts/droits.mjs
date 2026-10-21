#!/usr/bin/env node
// The rights and the context of each role session the circuit launches, from one source (ROLES):
// the testeur and the developpeur in the envelope of their component (scripts/enveloppe/lancer.sh),
// the reviewer, the regulator, the questionneur and the technical referent out of it
// (scripts/circuit.mjs). As a task of CI receives its
// rights from its steps and runs on an image of its own, not on the workstation of its author
// (GitHub Actions `permissions:` per job, the hermetic actions of Bazel), a session receives the
// rights the commands of its skill name, and the context its work reads.
//
//   node scripts/droits.mjs <rôle> --racine <arbre principal> --copie <copie> --ticket <ticket>
//                           [--etat <fichier> --journal <fichier> --preuves <motif>]
//
// prints the options of claude for that session, one per line (`optionsDuRole`):
//
// - `--setting-sources project,local`: the user's own configuration stays out (their CLAUDE.md,
//   their hooks, the skills of their account, their servers, their environment); the project's
//   agents, skills, charter and hooks stay in.
// - `--settings <json>` (the settings of the role, on the command line: no file the session could
//   change): its permissions (`allow`, the commands its skill names; `deny`, the change of its
//   author at the ticket, AUTEUR_FIXE, for a role that writes the editing by script, the test
//   tool run directly and the reading again of the ticket its instruction carries, and for a role
//   that writes nothing at the ticket, the questionneur, every write of bd, ECRIRE_AU_TICKET); the
//   automatic memory off; the skills of Claude Code off (`disableBundledSkills`, and the few it keeps,
//   INTEGREES), every skill of the project but the role's off (`skillOverrides`), every plugin
//   the project enables off (`enabledPlugins`: their skills, hooks and servers are not the role's);
//   for a role that writes, its locks as hooks (PreToolUse: verrous/verrou.mjs on the tools of
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
  'Bash(bash scripts/ticket.sh*)',
];
const TEST_DIRECT = [
  'Bash(vitest*)',
  'Bash(npx vitest*)',
  'Bash(npx * vitest*)',
  'Bash(npm exec vitest*)',
  'Bash(npm exec * vitest*)',
  'Bash(node_modules/.bin/vitest*)',
];
// The skills Claude Code keeps listed when its own are off (`disableBundledSkills`), measured on
// Claude Code 2.1.305.
const INTEGREES = ['design', 'doctor', 'plugin-authoring'];
// The servers of the index (charter, « L'index d'abord »).
const INDEX = ['codegraph', 'rtfm'];
// The tools of every role, and of a role that writes.
const LIRE = ['Bash', 'Read', 'Skill'];
const ECRIRE = ['Edit', 'Write'];

// Each role the circuit launches: whether it writes (files, `ecrit`; the ticket, unless
// `ecritAuTicket` is false), whether it uses the index, the skills it
// loads (its own, and those its skill names, « Compétence `<nom>` »), and the commands its skill
// names (`.claude/skills/<rôle>/`), as permission rules.
export const ROLES = {
  testeur: {
    ecrit: true,
    competences: ['testeur', 'mesure'],
    commandes: ['Bash(bd update * --claim)', 'Bash(bd comments add *)', 'Bash(npm test *)'],
  },
  developpeur: {
    ecrit: true,
    competences: ['developpeur', 'mesure', 'redacteur'],
    commandes: [
      'Bash(bd update * --claim)',
      'Bash(bd update * --notes*)',
      'Bash(bd comments add *)',
      'Bash(git -C * status*)',
      'Bash(git -C * diff*)',
      'Bash(npm test *)',
      'Bash(npm run api*)',
    ],
  },
  relecteur: {
    index: true,
    competences: ['relecteur'],
    commandes: [
      'Bash(git -C * diff *)',
      'Bash(node scripts/index-interfaces.mjs --publie *)',
      'Bash(npm test *)',
      'Bash(npm run verifier -- --gardes*)',
      'Bash(codegraph explore *)',
      'mcp__codegraph__codegraph_explore',
      'mcp__rtfm__rtfm_search',
    ],
  },
  regulateur: {
    // The files its instruction names: the circuit's state, the ticket's log, its proofs.
    lit: ['etat', 'journal', 'preuves'],
    competences: ['regulateur'],
    commandes: [
      'Bash(bd show *)',
      'Bash(bd comments *)',
      'Bash(bd search *)',
      'Bash(bd update * -d *)',
    ],
  },
  // It asks, and decides nothing: it reads the proposal its instruction carries and the code by
  // the index; the circuit writes its questions at the ticket.
  questionneur: {
    index: true,
    ecritAuTicket: false,
    competences: ['questionneur'],
    commandes: [
      'Bash(codegraph explore *)',
      'mcp__codegraph__codegraph_explore',
      'mcp__rtfm__rtfm_search',
    ],
  },
  // On the questions to a plan, it answers for the plan; the circuit writes its changes to the
  // ticket and its answers at the ticket.
  'referent-technique': {
    index: true,
    competences: ['referent-technique'],
    commandes: [
      'Bash(bd show *)',
      'Bash(bd comments add *)',
      'Bash(bash scripts/ticket.sh *)',
      'Bash(codegraph explore *)',
      'mcp__codegraph__codegraph_explore',
      'mcp__rtfm__rtfm_search',
    ],
  },
};

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

// The installed path of the plugin <nom> for the project <racine>: its entry for the project
// first, else the user's.
function cheminDuGreffon(nom, racine, home) {
  const entrees =
    lireJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'))?.plugins?.[nom] ?? [];
  const e =
    entrees.find(x => x.projectPath === racine) ?? entrees.find(x => x.scope === 'user') ?? null;
  return e?.installPath ?? null;
}

// The servers of the index: the project's `.mcp.json`, then the manifests of the plugins it enables.
function serveursDeLIndex(racine, home) {
  const out = {};
  const projet = lireJson(path.join(racine, '.mcp.json'))?.mcpServers ?? {};
  for (const n of INDEX) if (projet[n]) out[n] = projet[n];
  for (const greffon of greffonsDuProjet(racine)) {
    const dossier = cheminDuGreffon(greffon, racine, home);
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

// The settings of the session of <role>, for the ticket <ticket>, its copy <copie> (where its
// skills are read) and the main tree <racine>; `lit` names the files the regulator reads.
function reglagesDuRole(role, { racine, copie = racine, ticket, etat, journal, preuves }) {
  const r = ROLES[role];
  if (!r) throw new Error(`rôle sans droits : ${role}`);
  const fichiers = { etat, journal, preuves };
  // An absolute path of the machine opens on `//`.
  const lectures = (r.lit ?? []).filter(k => fichiers[k]).map(k => `Read(/${fichiers[k]})`);
  const deny = [...AUTEUR_FIXE, ...(r.ecritAuTicket === false ? ECRIRE_AU_TICKET : [])];
  if (r.ecrit) {
    deny.push(...ECRIRE_PAR_SCRIPT, ...TEST_DIRECT);
    // The ticket its instruction carries, its description, notes and last handover.
    for (const lecture of ['show', 'comments']) {
      deny.push(`Bash(bd ${lecture} ${ticket})`, `Bash(bd ${lecture} ${ticket} *)`);
    }
  }
  const competences = path.join(copie, '.claude', 'skills');
  const autres = [
    ...INTEGREES,
    ...(existsSync(competences)
      ? readdirSync(competences, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
      : []),
  ].filter(s => !r.competences.includes(s));
  const reglages = {
    permissions: { allow: [...r.commandes, ...lectures], deny },
    autoMemoryEnabled: false,
    disableBundledSkills: true,
    skillOverrides: Object.fromEntries(autres.map(s => [s, 'off'])),
    enabledPlugins: Object.fromEntries(greffonsDuProjet(racine).map(g => [g, false])),
  };
  if (r.ecrit) {
    reglages.hooks = {
      PreToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit|NotebookEdit',
          hooks: [
            {
              type: 'command',
              command: `node "$CLAUDE_PROJECT_DIR/scripts/verrous/verrou.mjs" ${role}`,
            },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/scripts/verrous/commande.mjs"' },
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
    JSON.stringify(reglagesDuRole(role, contexte)),
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
    if (
      !['racine', 'copie', 'ticket', 'etat', 'journal', 'preuves'].includes(cle) ||
      i + 1 >= reste.length
    ) {
      process.stderr.write(
        `usage : droits.mjs <rôle> --racine <r> --copie <c> --ticket <t> [--etat <f> --journal <f> --preuves <m>]\n`
      );
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
