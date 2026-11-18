// The installation of the account's Temporal (`grillhouse temporal installer`): the program
// `temporal` at its pinned version, its archive checked against its pinned sum, laid down under
// ~/.cache/grillhouse/temporal/<version>/temporal; the units of the account's systemd (the server,
// the worker of the project, the worker of the machine), each started again by systemd; the
// worker's unit gets `Environment=TEMPORAL=<the program laid down>`, the package.json untouched.
//
// - The pin (EPINGLE) is the version of the program and the SHA-256 of the archive of each
//   platform, as its release publishes them (checksums.txt); an archive whose sum differs is
//   refused before anything is laid down, the expected and the read sums named.
// - The server is Temporal's development server (`temporal server start-dev`), on the loopback
//   only, its state in a file of the machine (~/.local/share/grillhouse/temporal/temporal.db), the
//   frame's search attributes registered, its web interface on Temporal's port plus 1000. Under
//   load it takes the processor first (`CPUWeight=1000` against the workers' 100, no cap) and opens
//   its database in WAL with a normal synchronous write (`--sqlite-pragma`). Its namespace
//   `default` keeps a closed workflow 7 days (RETENTION), set at each start of the unit once the
//   server answers (`temporal operator namespace update --retention`), where start-dev gives 24 h:
//   a circuit stopped for more than 7 days reopens by `--depuis`.
// - Applying the server's unit (its text changed, or the program newly laid down) asks the server
//   for the circuits in flight before any writing; when there is one (`circuitsEnVol`; a server
//   that does not answer has none), the server's unit alone is deferred to a later run, the
//   circuits named in the report (`serveurDiffere`), the program laid down and the workers' units
//   applied all the same; otherwise it stops the server, compacts
//   its database (`compacterLaBase`, `VACUUM` by the runtime's `node:sqlite`) and starts it again,
//   and the report says the sizes before and after. A failed compaction starts the server again and
//   refuses the installation by its name, the unit not recorded as applied.
// - Each worker runs the frame's worker (dist/temporal/travailleur.js) on its task queue:
//   `grillhouse-projet-<projet>` for the project's, `grillhouse-machine` for the machine's. A
//   project that names its version of the frame (`grillhouse.outil`, scripts/aiguillage.mjs) runs
//   the worker of that published version, installed under the cache of the home
//   (~/.cache/grillhouse/outil/<version>/) when absent, as the circuit's command does; another, its
//   own version (its node_modules/@roomi-fields/grillhouse), else this package.
// - Every refusal comes before any writing (the archive, an account's tool, a fault of
//   `grillhouse.outils`, a published version without a worker), but the published version
//   itself: it is laid down in its cache before its refusal, which reads it there.
// - A unit of systemd starts with a bare PATH: each worker's unit names the PATH of the account's
//   tools a circuit runs (node, npm, claude, bd, gh), found in the installer's PATH, and the tools
//   of the project (`grillhouse.outils`), each its variable; a tool of the account not found is
//   refused by its name before anything is written.
// - Played again on an installation up to date, it changes nothing: the program of the pinned
//   version is not downloaded again, a unit and the package.json are written only when they
//   differ, and systemd is told only of what it has not applied yet (daemon-reload, enable,
//   restart of those units). What systemd applied is kept apart from what is written: the sum of
//   each unit's text once systemctl succeeded (~/.local/state/grillhouse/temporal/
//   unites-appliquees.json), so that a systemctl that failed is played again at the next run.
// - An account holds several projects: the server and the worker of the machine are the account's,
//   a project's worker is the project's. An installation keeps the sums applied for the units of
//   the other projects. The unit of the machine belongs to the project that wrote it, which
//   answers for its whole text; another project takes it only to raise it to a later version of
//   the frame (`textesDuProjet`).
// - `poserLeProgramme` lays down the program alone, no unit, no package.json, no systemd: the mode
//   `--programme-seul` of the command, by which the night gets the pinned program as a user does.
// - The home, the directory of the units and the project are parameters (`lieuxDe`), as systemctl,
//   the download, the published version and the account's tools are: a test installs under a
//   trial home, never in the account's systemd.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cacheDesOutils,
  installer as installerLOutil,
  versionDeLOutil,
} from '../../scripts/aiguillage.mjs';
import { trouverDansLePath } from '../../scripts/commandes-du-path.mjs';
import { langagesDe } from '../../scripts/langages.mjs';
import { lireOutils } from '../../scripts/outils-cles.mjs';
import { ATTRIBUTS_DE_RECHERCHE } from './attributs.js';

/** A platform the pin has an archive for, in the release's words. */
export type Plateforme = 'linux_amd64' | 'linux_arm64' | 'darwin_amd64' | 'darwin_arm64';

/** The version of the program `temporal` and the SHA-256 of the archive of each platform. */
export interface Epingle {
  version: string;
  sommes: Partial<Record<Plateforme, string>>;
}

/** The pin: temporal 1.9.1 (Server 1.32.0), its sums from the release's checksums.txt. */
export const EPINGLE: Epingle = {
  version: '1.9.1',
  sommes: {
    linux_amd64: '09a0326a51db84d02735e53542b9ebd8c4758daf47482a9ab0abce15844e60d5',
    linux_arm64: '6c57c352d52fc3df34412376fd9ba6f74b7e3ace8e426e6cba8600156d36a145',
    darwin_amd64: '48cdd6c84c56e27ae8e4d9a47052b89289a9c552dee029b49dd312c6fb72873f',
    darwin_arm64: '41e0425378fcb4fb5766340b97435e20fe47bbff2d7bf644ec2d51f7662b7c56',
  },
};

/** The port of the account's server, Temporal's, on the loopback. */
const PORT_DU_SERVEUR = 7233;
/** How long the server keeps a closed workflow: 7 days. */
const RETENTION = '168h';
/** The processor weight of the server's unit, above the passes' and the workers' (100). */
const POIDS_DU_SERVEUR = 1000;
/** The pragmas of SQLite the server opens its database with: WAL, the synchronous write WAL advises. */
const PRAGMAS_DU_SERVEUR = ['journal_mode=wal', 'synchronous=NORMAL'];
/** The account's tools a circuit runs, whose folders each worker's PATH names. */
const OUTILS_DU_COMPTE = ['node', 'npm', 'claude', 'bd', 'gh'] as const;
// The folders of the system, after the tools' own.
const PATH_DU_SYSTEME = ['/usr/local/bin', '/usr/bin', '/bin'];

/** The unit of the server. */
export const UNITE_DU_SERVEUR = 'grillhouse-temporal.service';
/** The unit of the worker of the machine. */
export const UNITE_DE_LA_MACHINE = 'grillhouse-travailleur-machine.service';
/** The task queue of the worker of the machine. */
export const FILE_DE_LA_MACHINE = 'grillhouse-machine';

/** The platform of Node's <platform> and <arch>; refused by its name when the pin has none. */
export function plateformeDe(
  platform: string = process.platform,
  arch: string = process.arch
): Plateforme {
  const os = { linux: 'linux', darwin: 'darwin' }[platform];
  const a = { x64: 'amd64', arm64: 'arm64' }[arch];
  if (!os || !a) {
    throw new Error(`temporal : aucune archive épinglée pour ${platform} ${arch}`);
  }
  return `${os}_${a}` as Plateforme;
}

/** The URL of the archive of <version> for <plateforme>, in the project's releases. */
export const urlDeLArchive = (version: string, plateforme: Plateforme): string =>
  `https://github.com/temporalio/cli/releases/download/v${version}/temporal_cli_${version}_${plateforme}.tar.gz`;

/** Where the installation lays down: the home, the directory of the units, the project. */
export interface Lieux {
  maison: string;
  unites: string;
  racine: string;
}

/** The places, each from the environment when absent: $HOME, its systemd/user, the cwd. */
export function lieuxDe(
  { maison, unites, racine }: Partial<Lieux> = {},
  env: Record<string, string | undefined> = process.env
): Lieux {
  const m = path.resolve(maison ?? env.HOME ?? os.homedir());
  return {
    maison: m,
    unites: path.resolve(unites ?? path.join(m, '.config/systemd/user')),
    racine: path.resolve(racine ?? process.cwd()),
  };
}

/** The program of <version> and the server's database file, under the home of <lieux>. */
export function cheminsDe(lieux: Lieux, version: string) {
  return {
    programme: path.join(lieux.maison, '.cache/grillhouse/temporal', version, 'temporal'),
    donnees: path.join(lieux.maison, '.local/share/grillhouse/temporal/temporal.db'),
    appliquees: path.join(lieux.maison, '.local/state/grillhouse/temporal/unites-appliquees.json'),
  };
}

// The name of the project at <racine>, for a unit and a task queue: its package's name, else its
// directory's, in lower case letters, digits and dashes.
function nomDuProjet(racine: string): string {
  let nom = path.basename(racine);
  try {
    const n = (
      JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')) as { name?: unknown }
    ).name;
    if (typeof n === 'string' && n) {
      nom = n;
    }
  } catch {
    // no package.json: the directory's name
  }
  return nom
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The unit of the worker of the project at <racine>. */
export const uniteDuProjet = (racine: string): string =>
  `grillhouse-travailleur-${nomDuProjet(racine)}.service`;

/** The task queue of the worker of the project at <racine>. */
export const fileDuProjet = (racine: string): string => `grillhouse-projet-${nomDuProjet(racine)}`;

/** The three units, in their order: the server, the worker of the project, the machine's. */
export const unitesDe = (racine: string): string[] => [
  UNITE_DU_SERVEUR,
  uniteDuProjet(racine),
  UNITE_DE_LA_MACHINE,
];

// An argument of ExecStart, quoted as systemd reads it when it holds a space or a quote.
const arg = (s: string) => (/[\s"\\]/.test(s) ? `"${s.replace(/["\\]/g, c => `\\${c}`)}"` : s);

/**
 * What a worker's unit runs: Node and the frame's worker, under the PATH <chemin> and the tools of
 * the project <outils> (each its variable and its path).
 */
export interface Travail {
  version: string;
  node: string;
  travailleur: string;
  chemin: string;
  outils: Record<string, string>;
}

/** The text of each unit of the account, by its file's name. */
export function textesDesUnites(
  lieux: Lieux,
  { version, node, travailleur, chemin, outils }: Travail
) {
  const { programme, donnees } = cheminsDe(lieux, version);
  const serveur = [
    programme,
    'server',
    'start-dev',
    '--db-filename',
    donnees,
    ...PRAGMAS_DU_SERVEUR.flatMap(p => ['--sqlite-pragma', p]),
    '--ip',
    '127.0.0.1',
    '--port',
    String(PORT_DU_SERVEUR),
    '--ui-port',
    String(PORT_DU_SERVEUR + 1000),
    ...Object.entries(ATTRIBUTS_DE_RECHERCHE).flatMap(([k, t]) => [
      '--search-attribute',
      `${k}=${t}`,
    ]),
  ];
  // The retention set once the server answers, tried every second for 60 s; `$$` is systemd's `$`.
  const retenir = [
    'i=0; until',
    `'${programme}' operator namespace update --namespace default --retention ${RETENTION}`,
    `--address 127.0.0.1:${PORT_DU_SERVEUR} >/dev/null;`,
    'do i=$$((i+1)); [ $$i -ge 60 ] && exit 1; sleep 1; done',
  ].join(' ');
  const service = (description: string, lignes: string[], apres: string[] = []) =>
    [
      '[Unit]',
      `Description=${description}`,
      ...apres,
      '',
      '[Service]',
      ...lignes,
      'Restart=always',
      'RestartSec=5',
      '',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n');
  const apres = [`After=${UNITE_DU_SERVEUR}`, `Wants=${UNITE_DU_SERVEUR}`];
  const travailleurSur = (file: string) => [
    `WorkingDirectory=${arg(lieux.racine)}`,
    `Environment=TEMPORAL_ADDRESS=127.0.0.1:${PORT_DU_SERVEUR}`,
    `Environment=${arg(`PATH=${chemin}`)}`,
    ...Object.entries(outils).map(([k, v]) => `Environment=${arg(`${k}=${v}`)}`),
    `ExecStart=${[node, travailleur, '--file', file].map(arg).join(' ')}`,
  ];
  return {
    [UNITE_DU_SERVEUR]: service(
      `Grillhouse : le serveur Temporal du compte (temporal ${version})`,
      [
        `CPUWeight=${POIDS_DU_SERVEUR}`,
        `ExecStart=${serveur.map(arg).join(' ')}`,
        `ExecStartPost=/bin/sh -c ${arg(retenir)}`,
      ]
    ),
    [uniteDuProjet(lieux.racine)]: service(
      `Grillhouse : le travailleur du projet ${nomDuProjet(lieux.racine)}`,
      travailleurSur(fileDuProjet(lieux.racine)),
      apres
    ),
    [UNITE_DE_LA_MACHINE]: service(
      'Grillhouse : le travailleur de la machine',
      travailleurSur(FILE_DE_LA_MACHINE),
      apres
    ),
  } as Record<string, string>;
}

/** The package that runs: two levels above this module, in src/ as in dist/. */
const PAQUET = fileURLToPath(new URL('../..', import.meta.url));

const TRAVAILLEUR = 'dist/temporal/travailleur.js';

/**
 * The frame's worker of the project at <racine>: that of the published version it names, laid down
 * by <outil> (its folder), refused when that version carries none; else its own version of the
 * frame, else this one.
 */
export function travailleurDe(
  racine: string,
  outil: (version: string) => string,
  exiger = true
): string {
  const version = versionDeLOutil(racine);
  if (version !== null) {
    const f = path.join(outil(version), 'node_modules/@roomi-fields/grillhouse', TRAVAILLEUR);
    if (exiger && !existsSync(f)) {
      throw new Error(
        `temporal : @roomi-fields/grillhouse@${version}, la version que nomme grillhouse.outil, ne porte pas de travailleur (${TRAVAILLEUR}).`
      );
    }
    return f;
  }
  const local = path.join(racine, 'node_modules/@roomi-fields/grillhouse');
  return path.join(existsSync(local) ? realpathSync(local) : PAQUET, TRAVAILLEUR);
}

/**
 * The PATH of each worker's unit: the folder of Node <node>, then those of the account's tools
 * and of the <executables> of the languages <trouver> finds, then the system's; a program not
 * found refused by its name.
 */
export function cheminDesUnites(
  node: string,
  trouver: (nom: string) => string | null,
  executables: readonly string[]
): string {
  const dossiers = [path.dirname(node)];
  for (const nom of [...OUTILS_DU_COMPTE, ...executables]) {
    const f = trouver(nom);
    if (!f) {
      throw new Error(
        `temporal : l'outil ${nom} est introuvable dans PATH ; un circuit le lance, et l'unité de son travailleur le nomme.`
      );
    }
    dossiers.push(path.dirname(f));
  }
  return [...new Set([...dossiers, ...PATH_DU_SYSTEME])].join(':');
}

/** A call of `systemctl --user <args>`. */
export type Systemctl = (args: string[]) => {
  status: number | null;
  stdout: string;
  stderr: string;
};

/** The account's systemctl, by the program <programme>. */
export const systemctlDuCompte =
  (programme = 'systemctl'): Systemctl =>
  args => {
    const r = spawnSync(programme, ['--user', ...args], { encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? r.error?.message ?? '' };
  };

/** The refusal of an archive whose sum differs from the pinned one. */
export class SommeRefusee extends Error {
  constructor(
    readonly url: string,
    readonly attendue: string,
    readonly lue: string
  ) {
    super(
      `temporal : l'archive ${url} est refusée : somme attendue ${attendue}, lue ${lue} ; rien n'est posé.`
    );
    this.name = 'SommeRefusee';
  }
}

/** Downloads <url>, its redirections followed. */
async function telecharger(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`temporal : ${url} répond ${r.status}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

/** What laying the program down receives; each one but the places has its default. */
export interface OptionsDuProgramme {
  lieux: Lieux;
  epingle?: Epingle;
  plateforme?: Plateforme;
  obtenir?: (url: string) => Promise<Buffer>;
}

/** What the installation receives; each one but the places and systemctl has its default. */
export interface OptionsDInstallation extends OptionsDuProgramme {
  systemctl: Systemctl;
  node?: string;
  travailleur?: string;
  /**
   * Lays down the published version of the frame a project names: its folder, under the cache of
   * the home of the places by default.
   */
  outil?: (version: string) => string;
  /** The path of an account's tool, or null (`trouverDansLePath`). */
  trouver?: (nom: string) => string | null;
  /**
   * The tickets whose circuit runs on the server (`circuitDuTicket`, status Running); none when the
   * server does not answer (`circuitsEnVolDuServeur`).
   */
  circuitsEnVol?: () => string[];
  /** Compacts the database file <base> and gives its size before and after (`compacterLaBase`). */
  compacter?: (base: string) => Compactage;
}

/** The size of the database before and after its compaction, in bytes. */
export interface Compactage {
  avant: number;
  apres: number;
}

/** What the installation did. */
export interface RapportDInstallation {
  programme: string;
  /** Whether it laid the program down. */
  pose: boolean;
  /** The units it wrote. */
  unites: string[];
  /** The units systemd was told of (written now, or written before and never applied). */
  appliquees: string[];
  /** Whether anything changed. */
  change: boolean;
  /** The size of the database before and after its compaction; absent when it was not compacted. */
  compactage?: Compactage;
  /**
   * The circuits in flight that deferred the server's unit, which a later run
   * applies; absent when nothing deferred them.
   */
  serveurDiffere?: string[];
}

/**
 * Compacts the SQLite database <base> (`VACUUM`, by the runtime's `node:sqlite`, no tool of the
 * PATH), its journal folded into it first; its size before and after. SQLite's own message refuses
 * a file that is not a database.
 */
export function compacterLaBase(base: string): Compactage {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
    DatabaseSync: new (
      f: string,
      o: { enableDoubleQuotedStringLiterals: boolean }
    ) => { exec(sql: string): void; close(): void };
  };
  const avant = statSync(base).size;
  // Temporal's schema writes its JSON paths between double quotes (`"$.TemporalKeywordList02"`),
  // which the SQLite it is built with reads as strings; the runtime's SQLite reads them as columns
  // unless told otherwise, and VACUUM, which parses the schema again, fails on them.
  const db = new DatabaseSync(base, { enableDoubleQuotedStringLiterals: true });
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
  } finally {
    db.close();
  }
  return { avant, apres: statSync(base).size };
}

/**
 * The tickets whose circuit runs on the account's server: `temporal workflow list` of the program
 * <programme>, the workflows `circuitDuTicket` Running (their id `circuit:<racine>:<ticket>`). A
 * server that does not answer, or an answer that does not read, is no circuit in flight.
 */
function circuitsEnVolDuServeur(programme: string): string[] {
  const r = spawnSync(
    programme,
    [
      'workflow',
      'list',
      '--address',
      `127.0.0.1:${PORT_DU_SERVEUR}`,
      '--query',
      "WorkflowType='circuitDuTicket' AND ExecutionStatus='Running'",
      '--output',
      'json',
    ],
    { encoding: 'utf8', timeout: 30_000 }
  );
  if (r.status !== 0) {
    return [];
  }
  try {
    const lus = JSON.parse(r.stdout) as unknown;
    const ids = (Array.isArray(lus) ? lus : [])
      .map((w: { workflowId?: string; execution?: { workflowId?: string } }) =>
        String(w.workflowId ?? w.execution?.workflowId ?? '')
      )
      .filter(Boolean);
    return [...new Set(ids.map(id => id.slice(id.lastIndexOf(':') + 1)))].sort();
  } catch {
    return [];
  }
}

// Lays down the program `temporal` of the archive <contenu> as <programme>: extracted under a
// directory beside its own, then renamed into its own, so that a broken extraction lays nothing.
function poser(contenu: Buffer, programme: string) {
  const dossier = path.dirname(programme);
  const parent = path.dirname(dossier);
  mkdirSync(parent, { recursive: true });
  const tmp = mkdtempSync(path.join(parent, `.${path.basename(dossier)}-`));
  try {
    const archive = path.join(tmp, 'archive.tar.gz');
    writeFileSync(archive, contenu);
    const r = spawnSync('tar', ['-xzf', archive, '-C', tmp, 'temporal'], { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(`temporal : tar refuse l'archive : ${r.stderr ?? r.error?.message}`);
    }
    rmSync(archive);
    chmodSync(path.join(tmp, 'temporal'), 0o755);
    rmSync(dossier, { recursive: true, force: true });
    renameSync(tmp, dossier);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// systemctl <args>, refused by its output when it fails.
function systemd(systemctl: Systemctl, args: string[]) {
  const r = systemctl(args);
  if (r.status !== 0) {
    throw new Error(
      `temporal : systemctl --user ${args.join(' ')} échoue (${r.status}) : ${r.stderr.trim()}`
    );
  }
}

/**
 * The archive of the program `temporal` of the pin, checked against its pinned sum, nothing laid
 * down: its content, or null when the program lies at the places <lieux> already.
 */
async function obtenirLeProgramme({
  lieux,
  epingle = EPINGLE,
  plateforme = plateformeDe(),
  obtenir = telecharger,
}: OptionsDuProgramme): Promise<{ programme: string; contenu: Buffer | null }> {
  const { programme } = cheminsDe(lieux, epingle.version);
  if (existsSync(programme)) {
    return { programme, contenu: null };
  }
  const attendue = epingle.sommes[plateforme];
  if (!attendue) {
    throw new Error(`temporal : aucune somme épinglée pour ${plateforme}`);
  }
  const url = urlDeLArchive(epingle.version, plateforme);
  const contenu = await obtenir(url);
  const lue = createHash('sha256').update(contenu).digest('hex');
  if (lue !== attendue) {
    throw new SommeRefusee(url, attendue, lue);
  }
  return { programme, contenu };
}

/**
 * Lays down the program `temporal` of the pin at the places <lieux>, its archive checked against
 * its pinned sum, unless it lies there already; whether it laid it down.
 */
export async function poserLeProgramme(
  options: OptionsDuProgramme
): Promise<{ programme: string; pose: boolean }> {
  const { programme, contenu } = await obtenirLeProgramme(options);
  if (contenu) {
    poser(contenu, programme);
  }
  return { programme, pose: contenu !== null };
}

const sommeDe = (texte: string) => createHash('sha256').update(texte).digest('hex');

// The sum of each unit's text that systemd applied, from the file <f>; none without it.
function lireLesAppliquees(f: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

/** What `installer` writes, and what the detection compares. */
interface OptionsDesTextes {
  lieux: Lieux;
  epingle?: Epingle;
  node?: string;
  trouver?: (nom: string) => string | null;
  /** The frame's worker of the project, read once the tools are checked. */
  travailleur: () => string;
}

/**
 * The text of each unit `installer` writes for the places <lieux>: the one computation, played by
 * `installer` and by the detection of a stale worker. Every refusal of the tools (an account's
 * tool not found, a fault of `grillhouse.outils`) is thrown here, before any writing.
 */
function textesAttendus({
  lieux,
  epingle = EPINGLE,
  node = process.execPath,
  trouver = nom => trouverDansLePath(nom),
  travailleur,
}: OptionsDesTextes) {
  const { programme } = cheminsDe(lieux, epingle.version);
  const executables = langagesDe(lieux.racine).flatMap(m => m.executables);
  const chemin = cheminDesUnites(node, trouver, executables);
  const pkg = JSON.parse(readFileSync(path.join(lieux.racine, 'package.json'), 'utf8')) as {
    grillhouse?: { outils?: unknown };
  };
  // The tools as written, without a TEMPORAL key left in the package.json: the worker's unit takes
  // the program laid down. A faulty value is refused as it is written.
  const brut = pkg.grillhouse?.outils;
  const { outils: lus, fautes } = lireOutils(
    {
      ...pkg,
      grillhouse: {
        ...pkg.grillhouse,
        outils:
          brut !== null && typeof brut === 'object' && !Array.isArray(brut)
            ? Object.fromEntries(Object.entries(brut).filter(([k]) => k !== 'TEMPORAL'))
            : brut,
      },
    },
    { maison: lieux.maison, existe: p => existsSync(p) }
  );
  const outils = { ...lus, TEMPORAL: programme };
  if (fautes.length) {
    throw new Error(`temporal : ${fautes.join(' ; ')}`);
  }
  const textes = textesDesUnites(lieux, {
    version: epingle.version,
    node,
    travailleur: travailleur(),
    chemin,
    outils,
  });
  return { programme, textes };
}

// The frame's worker a unit's text <texte> runs: the argument of its ExecStart that ends with the
// worker's path, quoted or not; null without one.
function travailleurDeLUnite(texte: string): string | null {
  const ligne = texte.split('\n').find(l => l.startsWith('ExecStart='));
  for (const m of (ligne ?? '').matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)) {
    const a = m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]!;
    if (a.endsWith(TRAVAILLEUR)) {
      return a;
    }
  }
  return null;
}

// The version of the frame the worker <travailleur> belongs to: the version its package declares,
// else the folder of its published version in the cache of the home
// (`…/<version>/node_modules/@roomi-fields/grillhouse/…`); null when neither reads.
function versionDuTravailleur(travailleur: string): string | null {
  const paquet = path.resolve(travailleur, '../../..');
  const cache = `${path.sep}node_modules${path.sep}@roomi-fields${path.sep}grillhouse`;
  try {
    const v = (
      JSON.parse(readFileSync(path.join(paquet, 'package.json'), 'utf8')) as {
        version?: unknown;
      }
    ).version;
    if (typeof v === 'string' && v) {
      return v;
    }
  } catch {
    // no package.json: the folder of the published version
  }
  if (paquet.endsWith(cache)) {
    const v = path.basename(paquet.slice(0, -cache.length));
    return /^\d+\.\d+\.\d+/.test(v) ? v : null;
  }
  return null;
}

// Whether the version <a> is at least <b>: their three numbers compared in their order, then a
// version before a prerelease of the same numbers (semver: 1.0.0-rc.1 comes before 1.0.0).
function auMoins(a: string, b: string): boolean {
  const lue = (v: string) => {
    const [coeur = '', ...pre] = v.split('+')[0]!.split('-');
    return { n: coeur.split('.').map(x => Number.parseInt(x, 10) || 0), pre: pre.length > 0 };
  };
  const [x, y] = [lue(a), lue(b)];
  for (let i = 0; i < 3; i++) {
    if ((x.n[i] ?? 0) !== (y.n[i] ?? 0)) {
      return (x.n[i] ?? 0) > (y.n[i] ?? 0);
    }
  }
  return !x.pre || y.pre;
}

// The root of the project a worker's unit <texte> was written for: its WorkingDirectory; null
// without one.
function racineDeLUnite(texte: string): string | null {
  const ligne = texte.split('\n').find(l => l.startsWith('WorkingDirectory='));
  if (!ligne) {
    return null;
  }
  const v = ligne.slice('WorkingDirectory='.length);
  return /^".*"$/.test(v) ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v;
}

/**
 * The texts of <textes> the project at <lieux> answers for: its own units, and the unit of the
 * machine while that unit is its own. The worker of the machine is the account's, one for every
 * project, as one agent of a cluster serves every job; its unit belongs to the project that wrote
 * it (its WorkingDirectory), which answers for its whole text (Node, PATH, tools) and for what
 * systemd applied of it. Another project takes it only to raise it: when it plays an earlier
 * version of the frame than that project's, when its version does not read, or when the project
 * it belongs to is gone. So the worker of the machine plays the highest version a project of the
 * account installed, whatever the order of the installations.
 */
function textesDuProjet(lieux: Lieux, textes: Record<string, string>): Record<string, string> {
  const f = path.join(lieux.unites, UNITE_DE_LA_MACHINE);
  if (!existsSync(f)) {
    return textes;
  }
  const posee = readFileSync(f, 'utf8');
  const racine = racineDeLUnite(posee);
  if (racine === null || path.resolve(racine) === lieux.racine || !existsSync(racine)) {
    return textes;
  }
  const version = (texte: string) => {
    const t = travailleurDeLUnite(texte);
    return t === null ? null : versionDuTravailleur(t);
  };
  const [tenue, voulue] = [version(posee), version(textes[UNITE_DE_LA_MACHINE] ?? '')];
  if (tenue === null || voulue === null || !auMoins(tenue, voulue)) {
    return textes;
  }
  return Object.fromEntries(Object.entries(textes).filter(([n]) => n !== UNITE_DE_LA_MACHINE));
}

/**
 * Whether the worker the account runs is stale: the units applied by `installer` (the sums of
 * unites-appliquees.json) differ from the texts `installer` would write now, for the version
 * `grillhouse.outil` names (its worker deduced from its folder in the cache of the home, nothing
 * laid down) or, without the key, for the repository's. Without an applied state, false: the
 * initial deployment is not a rise. Any error of the computation (a tool not found) is stale, as
 * `installer` refuses it by its name. It plays nothing and writes nothing.
 */
export function travailleurPerime({
  lieux,
  epingle = EPINGLE,
  node,
  trouver,
}: {
  lieux: Lieux;
  epingle?: Epingle;
  node?: string;
  trouver?: (nom: string) => string | null;
}): boolean {
  const deja = lireLesAppliquees(cheminsDe(lieux, epingle.version).appliquees);
  if (Object.keys(deja).length === 0) {
    return false;
  }
  try {
    const { textes } = textesAttendus({
      lieux,
      epingle,
      node,
      trouver,
      travailleur: () =>
        travailleurDe(lieux.racine, v => path.join(cacheDesOutils(lieux.maison), v), false),
    });
    return Object.entries(textesDuProjet(lieux, textes)).some(([n, t]) => deja[n] !== sommeDe(t));
  } catch {
    return true;
  }
}

/** Installs the account's Temporal at the places <lieux> (see the header). */
export async function installer({
  lieux,
  systemctl,
  epingle = EPINGLE,
  plateforme = plateformeDe(),
  obtenir = telecharger,
  node = process.execPath,
  outil = v => installerLOutil(v, { cache: cacheDesOutils(lieux.maison) }).dossier,
  travailleur,
  trouver = nom => trouverDansLePath(nom),
  circuitsEnVol = () => circuitsEnVolDuServeur(cheminsDe(lieux, epingle.version).programme),
  compacter = compacterLaBase,
}: OptionsDInstallation): Promise<RapportDInstallation> {
  const { donnees, appliquees: fichierDesAppliquees } = cheminsDe(lieux, epingle.version);
  // Every refusal before any writing: the archive, the account's tools, the project's tools , then the worker of the published version, which lays that
  // version down in its cache first.
  const { programme, contenu } = await obtenirLeProgramme({ lieux, epingle, plateforme, obtenir });
  const { textes: tous } = textesAttendus({
    lieux,
    epingle,
    node,
    trouver,
    travailleur: () => travailleur ?? travailleurDe(lieux.racine, outil),
  });
  const duProjet = textesDuProjet(lieux, tous);
  const deja = lireLesAppliquees(fichierDesAppliquees);
  const enAttenteDe = (t: Record<string, string>) =>
    Object.keys(t).filter(n => deja[n] !== sommeDe(t[n]!));
  // The server's unit is applied when a program is laid down, or when it is still to apply.
  // Before any writing: a circuit in flight defers the server's unit alone (its stop, its
  // compaction), which a later run applies; the program is laid down all the same, in a directory
  // of its own version, and the workers' units, which name it, are applied, since neither stops
  // the server.
  const differe =
    contenu !== null || enAttenteDe(duProjet).includes(UNITE_DU_SERVEUR) ? circuitsEnVol() : [];
  const textes = differe.length
    ? Object.fromEntries(Object.entries(duProjet).filter(([n]) => n !== UNITE_DU_SERVEUR))
    : duProjet;
  const pose = contenu !== null;
  const enAttente = enAttenteDe(textes);
  const serveurApplique = (pose && differe.length === 0) || enAttente.includes(UNITE_DU_SERVEUR);
  if (contenu) {
    poser(contenu, programme);
  }
  mkdirSync(path.dirname(donnees), { recursive: true });
  const unites: string[] = [];
  for (const [nom, texte] of Object.entries(textes)) {
    const f = path.join(lieux.unites, nom);
    if (existsSync(f) && readFileSync(f, 'utf8') === texte) {
      continue;
    }
    mkdirSync(lieux.unites, { recursive: true });
    writeFileSync(f, texte);
    unites.push(nom);
  }
  // A program newly laid down starts again the units of this project, the machine's when it is
  // its own.
  const appliquees = pose ? Object.keys(textes) : enAttente;
  let compactage: Compactage | undefined;
  if (appliquees.length) {
    systemd(systemctl, ['daemon-reload']);
    systemd(systemctl, ['enable', ...unitesDe(lieux.racine).filter(n => appliquees.includes(n))]);
    if (serveurApplique) {
      // The server stopped, its database compacted, then every unit applied started again; without
      // a database file there is nothing to compact, and the server is not stopped.
      if (existsSync(donnees)) {
        systemd(systemctl, ['stop', UNITE_DU_SERVEUR]);
        try {
          compactage = compacter(donnees);
        } catch (e) {
          systemd(systemctl, ['start', UNITE_DU_SERVEUR]);
          throw new Error(
            `temporal : le compactage de la base ${donnees} échoue : ${e instanceof Error ? e.message : String(e)} ; le serveur est redémarré, l'unité sera appliquée au prochain passage.`,
            { cause: e }
          );
        }
      }
    }
    systemd(systemctl, ['restart', ...appliquees]);
    mkdirSync(path.dirname(fichierDesAppliquees), { recursive: true });
    // The sums of this project's units, beside those of the other projects of the account.
    const sommes = {
      ...deja,
      ...Object.fromEntries(Object.entries(textes).map(([n, t]) => [n, sommeDe(t)])),
    };
    writeFileSync(fichierDesAppliquees, `${JSON.stringify(sommes, null, 2)}\n`);
  }
  return {
    programme,
    pose,
    unites,
    appliquees,
    change: pose || unites.length > 0 || appliquees.length > 0 || differe.length > 0,
    ...(compactage ? { compactage } : {}),
    ...(differe.length ? { serveurDiffere: differe } : {}),
  };
}
