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
//   skills of their account, their servers, their environment; of their settings, the settings of
//   the role carry the output style alone, below); the project's settings and
//   charter, and the frame's plugin it enables (agents, skills, common charter, hooks), stay in.
//   Claude Code loads the user's charter (`~/.claude/CLAUDE.md`) whatever the sources, so the
//   settings of the role exclude it by its path (`claudeMdExcludes`), and the envelope does not
//   mount it. The common charter is cut by public: its core, `charte.md`, which each session loads,
//   imports one module per public (`charte/<module>.md`, MODULES_DE_LA_CHARTE); the settings of the
//   role exclude each module the role does not apply (`modules`, ROLES) by the same key, wherever
//   the charter is read, the package installed or the frame's source.
// - `--settings <json>` (the settings of the role, on the command line: no file the session could
//   change): its permissions (`allow`, every command of `Bash`, the tools of the index for a role
//   that uses it, and the reading of its skill's files, references included, of those of the
//   debugging skill for a role whose skill loads it (`debogage`), and of the METACADRE.md its
//   skill names, in the frame's plugin as installed for the copy, else for the project, by `Read`
//   and `ls` and with no writing; `deny`, the change of its author at the ticket, AUTEUR_FIXE,
//   for a role whose instruction carries its ticket the reading of it again, for a role that
//   writes the test tool run directly, and for a role that writes nothing at the ticket every write
//   of bd, ECRIRE_AU_TICKET); no hook; the
//   automatic memory off; the skills of Claude Code off (`disableBundledSkills`); every plugin the
//   project enables off (`enabledPlugins`: their skills, hooks and servers are not the role's),
//   save the frame's (`grillhouse@…`), which carries the role's agent, its skills and the frame's
//   hooks; the background tasks off and Code Mode on (`env`, ENV_DES_SEANCES: a role waits in the
//   foreground for what it launches, and its session ends with its sheet; `claude -p` gets Code
//   Mode, the REPL, only from this block), and, in the same block, the prompt cache forced to five
//   minutes for a role that takes it (`cacheCinqMinutes`, ROLES; CINQ_MINUTES_DE_CACHE); no line of
//   attribution of commit or pull request
//   (`attribution`, both empty, whatever the project and the user choose: a role commits nothing);
//   the output style the user chooses (`outputStyle` of `<home>/.claude/settings.json`), left out
//   when they choose none, and when a settings file of the project chooses one (`settings.json`
//   of the copy, `settings.local.json` of the main tree or of the copy), which the command line
//   would override. The name of the style alone goes: a style the session cannot resolve (a file
//   of `~/.claude/output-styles`, a plugin it does not load) does not apply.
// - The skills the session lists and may load are no option: they go on its standard input
//   (`competencesDuRole`, scripts/entree-de-seance.mjs), the one list no setting can bound for the
//   skills of a plugin.
// - `--tools <list>`: the tools its work uses; Edit and Write for a role that writes alone, the
//   tool search for a role whose index Claude Code defers.
// - `--strict-mcp-config --mcp-config <json>`: the servers of the index (codegraph, rtfm) for a
//   role that uses it, read in the project's `.mcp.json` and in the manifests of the plugins it
//   enables, at their installed path (`~/.claude/plugins/installed_plugins.json`, the project's
//   entry first, else the user's); a project's entry whose command is the bare name of the program
//   a plugin ships runs that program; none for the others.
import { readFileSync } from 'node:fs';
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
// The variable the env block adds for a role whose prompt cache lasts five minutes
// (`cacheCinqMinutes`, ROLES): the explorateur, the questionneur, the testwriter and the relecteur,
// whose turns mostly follow each other within five minutes, and a cache write kept five minutes
// costs 1.25 times an input, against 2 times for one hour. The developpeur and the direct often
// wait longer (tests, builds) and would lose by it (simulated: developpeur −3.6 %, direct
// −11.9 %): they keep Claude Code's default, one hour on the subscription.
const CINQ_MINUTES_DE_CACHE = { FORCE_PROMPT_CACHING_5M: '1' };

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

// The modules of the common charter (`charte/<module>.md`, beside `charte.md`), and the folders
// that hold the charter: the package installed in a project, the frame's source in its repository.
const MODULES_DE_LA_CHARTE = ['superviseur', 'plan', 'preuve', 'tests'];
const DOSSIERS_DE_LA_CHARTE = ['node_modules/@roomi-fields/grillhouse', 'mods/grillhouse'];

// Each role the circuit launches: the modules of the common charter it applies (`modules`; the
// supervisor's is no role's), whether it writes (files, `ecrit`; the ticket, unless
// `ecritAuTicket` is false), whether its instruction carries its ticket (`porteSonTicket`),
// whether it uses the index, the rules of its commands (`commandes`), whether its skill names the
// frame's METACADRE.md (`metacadre`, read at the root of the plugin installed), whether its skill
// loads the debugging skill of the plugin (`debogage`, read with its neighbouring files), the other
// skills of the plugin its skill or the common charter ask it to load (`competences`), and whether
// its prompt cache lasts five minutes (`cacheCinqMinutes`).
export const ROLES = {
  // It writes no file and nothing at the ticket: it surveys the components and reads the code by
  // the index, and ends on the plan in its sheet, which the circuit writes at the ticket.
  explorateur: {
    cacheCinqMinutes: true,
    modules: ['plan', 'preuve'],
    metacadre: true,
    debogage: true,
    competences: ['mesure'],
    index: true,
    ecritAuTicket: false,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  // It writes the tests of the whole ticket, in the envelope of its plan.
  testwriter: {
    cacheCinqMinutes: true,
    modules: ['preuve', 'tests'],
    metacadre: true,
    competences: ['mesure'],
    ecrit: true,
    index: true,
    porteSonTicket: true,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  // It writes the code of the whole ticket, in the envelope of its plan.
  developpeur: {
    modules: [],
    metacadre: true,
    debogage: true,
    competences: ['mesure', 'redacteur', 'writing-for-agents'],
    ecrit: true,
    index: true,
    porteSonTicket: true,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  // The agent of a ticket led out of the circuit (`npx grillhouse direct`, scripts/direct.mjs): it
  // writes the tests and the code of the whole ticket together, in the envelope of its plan.
  direct: {
    modules: ['preuve', 'tests'],
    debogage: true,
    competences: ['mesure', 'redacteur', 'writing-for-agents'],
    ecrit: true,
    index: true,
    porteSonTicket: true,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  relecteur: {
    cacheCinqMinutes: true,
    modules: ['plan', 'preuve', 'tests'],
    metacadre: true,
    index: true,
    ecritAuTicket: false,
    porteSonTicket: true,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
  // It asks, and decides nothing: it reads the proposal its instruction carries and the code by
  // the index; the circuit writes its questions at the ticket.
  questionneur: {
    cacheCinqMinutes: true,
    modules: ['plan', 'preuve'],
    index: true,
    ecritAuTicket: false,
    commandes: TOUTE_COMMANDE_ET_L_INDEX,
  },
};

// The skills of the plugin <role> loads: its own, then the debugging skill for a role that debugs.
const competencesDeTravail = role => [
  role,
  ...(ROLES[role].debogage ? ['systematic-debugging'] : []),
];

/**
 * The skills a session of `role` lists and may load, qualified by the frame's plugin: its own, the
 * debugging skill for a role that debugs, and those its skill and the common charter ask of it.
 */
export function competencesDuRole(role) {
  if (!ROLES[role]) {
    throw new Error(`rôle sans droits : ${role}`);
  }
  return [...competencesDeTravail(role), ...(ROLES[role].competences ?? [])].map(
    c => `grillhouse:${c}`
  );
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
  return [
    ...competencesDeTravail(role).map(c => `Read(/${path.join(dossier, 'skills', c)}/**)`),
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

// The output style of the session, as the settings to add: the one the user chooses in <home>,
// none when a settings file of the project that the session reads chooses one (in a copy, Claude
// Code reads `settings.json` there, and `settings.local.json` at the main tree and there).
function styleDuPoste({ racine, copie, home }) {
  const style = (base, f) => lireJson(path.join(base, '.claude', f))?.outputStyle;
  const duProjet = [
    style(copie, 'settings.json'),
    style(racine, 'settings.local.json'),
    style(copie, 'settings.local.json'),
  ].some(s => s !== undefined);
  const duPoste = style(home, 'settings.json');
  return duPoste && !duProjet ? { outputStyle: duPoste } : {};
}

// What the session of the role <r> does not load of the charters: the user's own, by its path, and
// each module of the common charter the role does not apply, by a pattern that Claude Code matches
// against the absolute path of each file it loads, an imported one too.
function chartesExclues(r, home) {
  return [
    path.join(home, '.claude', 'CLAUDE.md'),
    ...MODULES_DE_LA_CHARTE.filter(m => !r.modules.includes(m)).flatMap(m =>
      DOSSIERS_DE_LA_CHARTE.map(d => `**/${d}/charte/${m}.md`)
    ),
  ];
}

// The settings of the session of <role>, for the ticket <ticket>, its copy <copie> (whose
// language names the test tool, and whose settings may choose the output style) and the main tree
// <racine>; <home> holds the plugins installed and the settings of the user.
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
  return {
    permissions: {
      allow: [...r.commandes, ...lireSaCompetence(role, { racine, copie, home })],
      deny,
    },
    autoMemoryEnabled: false,
    claudeMdExcludes: chartesExclues(r, home),
    disableBundledSkills: true,
    enabledPlugins: Object.fromEntries(
      greffonsDuProjet(racine)
        .filter(g => !g.startsWith(GREFFON_DU_CADRE))
        .map(g => [g, false])
    ),
    env: { ...ENV_DES_SEANCES, ...(r.cacheCinqMinutes ? CINQ_MINUTES_DE_CACHE : {}) },
    attribution: { commit: '', pr: '' },
    ...styleDuPoste({ racine, copie, home }),
  };
}

// The options of claude for the session of <role> (the header's list); <home> holds the plugins
// installed and the settings of the user.
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
