// The rights and the context of each role session the circuit launches, from one source (ROLES):
// the testwriter and the developpeur in the envelope of their plan (scripts/enveloppe/lancer.sh),
// the explorateur, the questionneur and the reviewer out of it (scripts/circuit.mjs). A session
// has every tool its work uses and runs every command: what it writes is bounded by the mounts of
// its envelope and judged on its lot (scripts/seances.mjs), never by a rule on its commands.
// Architecture: docs/architecture/machine.md (§3.2, §5.5).
//
//   npx grillhouse droits <rôle> --racine <arbre principal> --copie <copie> --ticket <ticket>
//
// prints the options of claude for that session, one per line (`optionsDuRole`):
//
// - `--setting-sources project,local`: the user's own configuration stays out (their hooks, the
//   skills of their account, their servers, their environment); the project's settings and
//   charter, and the frame's plugin it enables (agents, skills, common charter, hooks), stay in.
//   Claude Code loads the user's charter (`~/.claude/CLAUDE.md`) whatever the sources, so the
//   settings of the role exclude it by its path (`claudeMdExcludes`), and the envelope does not
//   mount it.
// - `--settings <json>` (the settings of the role, on the command line: no file the session could
//   change): its permissions (`allow`, every command of `Bash`, the tools of the index for a role
//   that uses it, and the reading of its skill's files, references included, of those of the
//   debugging skill for a role whose skill loads it (`debogage`), and of the METACADRE.md its
//   skill names, in the frame's plugin as installed for the copy, else for the project, by `Read`
//   and `ls` and with no writing; `deny`, the change of its author at the ticket, AUTEUR_FIXE,
//   for a role whose instruction carries its ticket the reading of it again, for a role that
//   writes the test tool run directly, and for a role that writes nothing at the ticket every write
//   of bd, ECRIRE_AU_TICKET); no hook; the
//   automatic memory off; the skills of Claude Code off (`disableBundledSkills`, and the few it keeps,
//   INTEGREES), and the project's own skills (`.claude/skills/` of the copy) off
//   (`skillOverrides`); every plugin the project enables off (`enabledPlugins`: their skills,
//   hooks and servers are not the role's), save the frame's (`grillhouse@…`), which carries the
//   role's agent, its skills and the frame's hooks: Claude Code applies no `skillOverrides` to the
//   skills of a plugin, and the role's agent preloads its own (`skills` of its definition);
//   the background tasks off and Code Mode on (`env`, ENV_DES_SEANCES: a role waits in the
//   foreground for what it launches, and its session ends with its sheet; `claude -p` gets Code
//   Mode, the REPL, only from this block).
// - `--tools <list>`: the tools its work uses; Edit and Write for a role that writes alone, the
//   tool search for a role whose index Claude Code defers.
// - `--strict-mcp-config --mcp-config <json>`: the servers of the index (codegraph, rtfm) for a
//   role that uses it, read in the project's `.mcp.json` and in the manifests of the plugins it
//   enables, at their installed path (`~/.claude/plugins/installed_plugins.json`, the project's
//   entry first, else the user's); a project's entry whose command is the bare name of the program
//   a plugin ships runs that program; none for the others.
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
// The variables of the env block of every session. One turns off the background tasks of Claude
// Code (the Bash tool's `run_in_background`, the background agents): `claude -p` waits for them
// before it ends, so a session ends with its sheet only without them. The other turns on Code Mode
// (the REPL): `claude -p` gets it only from the env block of `--settings`; the hooks and the
// permissions of the role apply to the tools the REPL calls.
const ENV_DES_SEANCES = {
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
  CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1',
};

// The skills Claude Code keeps listed when its own are off (`disableBundledSkills`), measured on
// Claude Code 2.1.305.
const INTEGREES = ['design', 'doctor', 'plugin-authoring'];
// The frame's plugin, by the start of its identifier (`grillhouse@<place de marché>`).
const GREFFON_DU_CADRE = 'grillhouse@';
// The servers of the index (charter, « L'index d'abord »), and their tools of reading: codegraph
// for the calls, rtfm for the search and the reading of a result whole.
const INDEX = ['codegraph', 'rtfm'];
const LIRE_L_INDEX = [
  'Bash(codegraph explore *)',
  'mcp__codegraph__codegraph_explore',
  'mcp__rtfm__rtfm_search',
  'mcp__rtfm__rtfm_expand',
];
// The tools of every role, and of a role that writes.
const LIRE = ['Bash', 'Read', 'Skill'];
const ECRIRE = ['Edit', 'Write'];

// The rules that permit a role its commands, every one, and the tools of the index for a role that
// uses it.
const TOUTE_COMMANDE = ['Bash'];
const TOUTE_COMMANDE_ET_L_INDEX = [...TOUTE_COMMANDE, ...LIRE_L_INDEX];

// Each role the circuit launches: whether it writes (files, `ecrit`; the ticket, unless
// `ecritAuTicket` is false), whether its instruction carries its ticket (`porteSonTicket`),
// whether it uses the index, the rules of its commands (`commandes`), whether its skill names the frame's METACADRE.md (`metacadre`, read
// at the root of the plugin installed), and whether its skill loads the debugging skill of the
// plugin (`debogage`, read with its neighbouring files).
export const ROLES = {
  // It writes no file and nothing at the ticket: it surveys the components and reads the code by
  // the index, and ends on the plan in its sheet, which the circuit writes at the ticket.
  explorateur: {
    metacadre: true,
    debogage: true,
    index: true,
    ecritAuTicket: false,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  // It writes the tests of the whole ticket, in the envelope of its plan.
  testwriter: {
    metacadre: true,
    ecrit: true,
    index: true,
    porteSonTicket: true,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  // It writes the code of the whole ticket, in the envelope of its plan.
  developpeur: {
    metacadre: true,
    debogage: true,
    ecrit: true,
    index: true,
    porteSonTicket: true,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  // The agent of a ticket led out of the circuit (`npx grillhouse direct`, scripts/direct.mjs): it
  // writes the tests and the code of the whole ticket together, in the envelope of its plan.
  direct: {
    debogage: true,
    ecrit: true,
    index: true,
    porteSonTicket: true,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  relecteur: {
    metacadre: true,
    index: true,
    ecritAuTicket: false,
    porteSonTicket: true,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  // It asks, and decides nothing: it reads the proposal its instruction carries and the code by
  // the index; the circuit writes its questions at the ticket.
  questionneur: { index: true, ecritAuTicket: false, commandes: TOUTE_COMMANDE_ET_L_INDEX },
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
    for (const [nom, actif] of Object.entries(p)) {
      if (actif) {
        actifs.add(nom);
      }
    }
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
// installed for the copy where the session runs, else for the project, of the debugging skill for a
// role whose skill loads it (`debogage`), whose neighbouring files the tool Skill does not give,
// and of the plugin's METACADRE.md alone for a role whose skill names it: rules `Read(//…)`, which let through the
// tool Read and `ls` of those folders, and write nothing (measured on Claude Code in `dontAsk`).
// Narrower than a folder of work (`--add-dir`), which would open the whole plugin; none when the
// plugin is not installed.
function lireSaCompetence(role, { racine, copie, home }) {
  const cadre = greffonsDuProjet(racine).find(g => g.startsWith(GREFFON_DU_CADRE));
  const dossier = cadre && cheminDuGreffon(cadre, [copie, racine], home);
  if (!dossier) {
    return [];
  }
  const competences = [role, ...(ROLES[role].debogage ? ['systematic-debugging'] : [])];
  return [
    ...competences.map(c => `Read(/${path.join(dossier, 'skills', c)}/**)`),
    ...(ROLES[role].metacadre ? [`Read(/${path.join(dossier, 'METACADRE.md')})`] : []),
  ];
}

// The servers of the index: the project's `.mcp.json`, then the manifests of the plugins it enables.
// An entry of the project whose command is the bare name of the program a plugin ships runs that
// program, with the rest of the project's entry: the envelope mounts the plugin, and the PATH of a
// session does not hold its `bin/`.
function serveursDeLIndex(racine, home) {
  const out = {};
  const projet = lireJson(path.join(racine, '.mcp.json'))?.mcpServers ?? {};
  for (const n of INDEX) {
    if (projet[n]) {
      out[n] = projet[n];
    }
  }
  for (const greffon of greffonsDuProjet(racine)) {
    const dossier = cheminDuGreffon(greffon, [racine], home);
    if (!dossier) {
      continue;
    }
    const serveurs =
      lireJson(path.join(dossier, '.claude-plugin', 'plugin.json'))?.mcpServers ??
      lireJson(path.join(dossier, '.mcp.json'))?.mcpServers ??
      {};
    for (const n of INDEX) {
      if (!serveurs[n]) {
        continue;
      }
      const porte = JSON.parse(
        JSON.stringify(serveurs[n]).replaceAll('${CLAUDE_PLUGIN_ROOT}', dossier)
      );
      if (!out[n]) {
        out[n] = porte;
      } else if (out[n].command === path.basename(porte.command ?? '')) {
        out[n] = { ...out[n], command: porte.command };
      }
    }
  }
  return out;
}

// The settings of the session of <role>, for the ticket <ticket>, its copy <copie> (where the
// project's own skills are read) and the main tree <racine>; <home> holds the plugins installed.
function reglagesDuRole(role, { racine, copie = racine, ticket, home }) {
  const r = ROLES[role];
  if (!r) {
    throw new Error(`rôle sans droits : ${role}`);
  }
  const deny = [...AUTEUR_FIXE, ...(r.ecritAuTicket === false ? ECRIRE_AU_TICKET : [])];
  if (r.ecrit) {
    // The test tool run directly (charter, « Aucun agent ne lance l'outil de test directement »),
    // as the module of the copy's language names it: `npm test` and `npm run verifier` play it.
    deny.push(...langageDe(copie).droits);
  }
  if (r.porteSonTicket) {
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
  return {
    permissions: {
      allow: [...r.commandes, ...lireSaCompetence(role, { racine, copie, home })],
      deny,
    },
    autoMemoryEnabled: false,
    claudeMdExcludes: [path.join(home, '.claude', 'CLAUDE.md')],
    disableBundledSkills: true,
    skillOverrides: Object.fromEntries(autres.map(s => [s, 'off'])),
    enabledPlugins: Object.fromEntries(
      greffonsDuProjet(racine)
        .filter(g => !g.startsWith(GREFFON_DU_CADRE))
        .map(g => [g, false])
    ),
    env: ENV_DES_SEANCES,
  };
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
