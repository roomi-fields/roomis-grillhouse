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
//   frame's search attributes registered, its web interface on Temporal's port plus 1000. Its
//   namespace `default` keeps a closed workflow 30 days (RETENTION), set at each start of the
//   unit once the server answers (`temporal operator namespace update --retention`), where
//   start-dev gives 24 h: a circuit stopped on a Friday reopens from its state on the Monday.
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
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cacheDesOutils,
  installer as installerLOutil,
  versionDeLOutil,
} from '../../scripts/aiguillage.mjs';
import { trouverDansLePath } from '../../scripts/commandes-du-path.mjs';
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
/** How long the server keeps a closed workflow: 30 days. */
const RETENTION = '720h';
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
      [`ExecStart=${serveur.map(arg).join(' ')}`, `ExecStartPost=/bin/sh -c ${arg(retenir)}`]
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
export function travailleurDe(racine: string, outil: (version: string) => string): string {
  const version = versionDeLOutil(racine);
  if (version !== null) {
    const f = path.join(outil(version), 'node_modules/@roomi-fields/grillhouse', TRAVAILLEUR);
    if (!existsSync(f)) {
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
 * <trouver> finds, then the system's; a tool not found refused by its name.
 */
export function cheminDesUnites(node: string, trouver: (nom: string) => string | null): string {
  const dossiers = [path.dirname(node)];
  for (const nom of OUTILS_DU_COMPTE) {
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
}: OptionsDInstallation): Promise<RapportDInstallation> {
  const { donnees, appliquees: fichierDesAppliquees } = cheminsDe(lieux, epingle.version);
  // Every refusal before any writing: the archive, the account's tools, the project's tools , then the worker of the published version, which lays that
  // version down in its cache first.
  const { programme, contenu } = await obtenirLeProgramme({ lieux, epingle, plateforme, obtenir });
  const chemin = cheminDesUnites(node, trouver);
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
  const leTravailleur = travailleur ?? travailleurDe(lieux.racine, outil);
  const pose = contenu !== null;
  if (contenu) {
    poser(contenu, programme);
  }
  mkdirSync(path.dirname(donnees), { recursive: true });
  const textes = textesDesUnites(lieux, {
    version: epingle.version,
    node,
    travailleur: leTravailleur,
    chemin,
    outils,
  });
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
  const deja = lireLesAppliquees(fichierDesAppliquees);
  const enAttente = Object.keys(textes).filter(n => deja[n] !== sommeDe(textes[n]!));
  const appliquees = pose ? unitesDe(lieux.racine) : enAttente;
  if (appliquees.length) {
    systemd(systemctl, ['daemon-reload']);
    systemd(systemctl, ['enable', ...unitesDe(lieux.racine)]);
    systemd(systemctl, ['restart', ...appliquees]);
    mkdirSync(path.dirname(fichierDesAppliquees), { recursive: true });
    const sommes = Object.fromEntries(Object.entries(textes).map(([n, t]) => [n, sommeDe(t)]));
    writeFileSync(fichierDesAppliquees, `${JSON.stringify(sommes, null, 2)}\n`);
  }
  return {
    programme,
    pose,
    unites,
    appliquees,
    change: pose || unites.length > 0 || appliquees.length > 0,
  };
}
