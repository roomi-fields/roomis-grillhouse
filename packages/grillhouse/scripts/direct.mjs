#!/usr/bin/env node
// The direct, the command of rescue of the frame (circuit.md §5.8, « La voie de secours »; the
// direct circuit of the target is circuit.md §9.1, chantier 2): a ticket led out of the circuit is written by an agent in a
// copy of its own, then read by the reviewer, and the command stops there. As a fix of the tooling
// outside a merge queue is still written by an author other than its reviewer and verified before
// it lands (the « tree closer fix » of Chromium, the stage0 of rustc fixed outside bors), the
// supervisor never writes it: it reads the lot, plays the full verification, commits, advances main
// and pushes.
//
//   npx grillhouse direct <ticket> [--paquet <chemin>]… [--contexte <texte>]
//   npx grillhouse direct <ticket> --deverrouiller
//
// - The ticket carries the label `direct`. Its packages are the components of its title, as the
//   circuit writes them (« numéro — sujet — composant, composant »), completed by each `--paquet`;
//   without any, the command refuses, naming the title. A path no package holds (the skeleton of a
//   package, data) is a path of the plan, written in the copy; a direct of the frame itself writes
//   in its copy, never in the installed version.
// - No plan, no proof of the red, no checks, no queue: the session of the agent `direct` (tests
//   and code together, rights of its own, scripts/droits.mjs), then the session of the reviewer on
//   its lot (`relire` of scripts/activites.mjs, with its instruction made for a direct). It writes
//   the verdict and the address of the copy.
// - It starts or resumes by the sheets of the reviewer kept for the copy (`decisionDuDirect`): no
//   sheet for the lot as it stands, it starts; a verdict RENDU, it resumes the agent with the
//   open findings; an ACCEPTÉ lot, it gives its verdict again; three RENDU in a row, it stops and
//   goes up to the supervisor, as the circuit does.
// - The copy it creates is locked by git (`git worktree lock`), which the cleaning of the circuit
//   respects while the copy holds a lot identical to main; `--deverrouiller` lifts it once the lot is
//   on main.
//
// Exit code: 0 for an ACCEPTÉ lot, 1 for a RENDU lot (the same command resumes the agent), 2 for a
// usage fault or a refusal, 3 for a stop that goes up to the supervisor.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ecritPar, preparer } from './enveloppe/travail-de-la-copie.mjs';
import { prendreUnePlace, VARIABLE_TENUE } from './places-de-la-machine.mjs';
import { bloquantsDeLaFiche } from './resultats.mjs';
import { consigneDuRelecteurDUnLotDirect } from './seances.mjs';

// The RENDU verdicts in a row that stop the command, as the circuit stops its third.
const RENDUS_MAX = 3;

// What the rescue command alone says of its lot to the reviewer.
const PROPRE_A_LA_VOIE_DE_SECOURS =
  'Ce lot est mené hors du circuit, par la voie de secours `npx grillhouse direct`.';

/**
 * The instruction of the reviewer of a lot of the rescue command: that of a direct lot
 * (`consigneDuRelecteurDUnLotDirect`), with what the command alone says of it.
 * @param {Record<string, string>} valeurs
 * @returns {string}
 */
export function consigneDuRelecteurDuDirect(valeurs) {
  return consigneDuRelecteurDUnLotDirect(valeurs, PROPRE_A_LA_VOIE_DE_SECOURS);
}

/**
 * The subject and the plan of a direct: the components of the title <titre> of the ticket <id>
 * after its last « — », separated by commas, then the paths of <options>, each once, each resolved
 * by <resoudre> (a name or a path, else it throws); a title without components and no option are
 * refused, the title named.
 * @param {{ id: string, titre: string, options?: string[], resoudre: (nom: string) => string }} o
 * @returns {{ sujet: string, plan: string[] }}
 */
export function planDuDirect({ id, titre, options = [], resoudre }) {
  const parts = String(titre ?? '').split(' — ');
  const nomme = parts.length > 1 ? parts.at(-1).split(',') : [];
  const plan = [
    ...new Set([...nomme, ...options].map(c => c.trim()).filter(Boolean).map(resoudre)),
  ];
  if (!plan.length) {
    throw new Error(
      `Le ticket ${id} n'a aucun paquet : son titre « ${titre} » ne nomme pas ses composants (« numéro — sujet — composant, composant »), et aucun --paquet n'en ajoute.`
    );
  }
  return { sujet: parts.length > 2 ? parts.slice(1, -1).join(' — ') : parts[0], plan };
}

/**
 * What the command does on the sheets kept for the copy <fiches> (`{ role, lot, fiche }`, the
 * reviewer's carrying the lot it read) and the lot as it stands <lot>: `demarrer` without a sheet
 * of the reviewer for this lot; `accepte` for an ACCEPTÉ lot; `relancer` for a RENDU lot, with its
 * open blocking findings; `arreter` once the RENDU verdicts in a row since the last ACCEPTÉ reach
 * RENDUS_MAX.
 * @param {{ role: string, lot?: unknown, fiche: { verdict: string } }[]} fiches
 * @param {unknown} lot
 * @returns {{ action: 'demarrer' | 'accepte' | 'relancer' | 'arreter', constats?: object[], rendus?: number }}
 */
export function decisionDuDirect(fiches, lot) {
  const relectures = fiches.filter(e => e.role === 'relecteur');
  const courante = relectures.findLast(e => e.lot === lot);
  if (!courante) {
    return { action: 'demarrer' };
  }
  if (courante.fiche.verdict === 'ACCEPTÉ') {
    return { action: 'accepte' };
  }
  const apres = relectures.findLastIndex(e => e.fiche.verdict === 'ACCEPTÉ') + 1;
  const rendus = relectures.length - apres;
  const constats = bloquantsDeLaFiche(courante.fiche);
  return rendus >= RENDUS_MAX
    ? { action: 'arreter', rendus, constats }
    : { action: 'relancer', rendus, constats };
}

const RAISON_DU_VERROU = "copie d'un ticket direct : son lot n'est pas encore sur main";

/**
 * Whether git holds the copy <copie> locked, read on its stable output (`git worktree list
 * --porcelain`, a `locked` line in the block of the copy), never on a message git translates.
 * @param {string} copie
 * @param {(...args: string[]) => { status: number, stdout: string, stderr: string }} git
 */
function estVerrouillee(copie, git) {
  const r = git('worktree', 'list', '--porcelain');
  if (r.status !== 0) {
    return false;
  }
  const chemins = new Set([path.resolve(copie)]);
  if (existsSync(copie)) {
    chemins.add(realpathSync(copie));
  }
  return String(r.stdout)
    .split(/\n\s*\n/)
    .some(bloc => {
      const lignes = bloc.split('\n');
      const chemin = lignes.find(l => l.startsWith('worktree '))?.slice('worktree '.length);
      return (
        chemin !== undefined &&
        chemins.has(chemin) &&
        lignes.some(l => l === 'locked' || l.startsWith('locked '))
      );
    });
}

/**
 * Locks the copy <copie> against the cleaning of the circuit, which removes a copy identical to
 * main (`git worktree lock`, <git> its runner); a copy already locked stays so.
 * @param {string} copie
 * @param {(...args: string[]) => { status: number, stdout: string, stderr: string }} git
 */
export function verrouillerLaCopie(copie, git) {
  const r = git('worktree', 'lock', '--reason', RAISON_DU_VERROU, copie);
  if (r.status !== 0 && !estVerrouillee(copie, git)) {
    throw new Error(`la copie ${copie} ne se verrouille pas : ${r.stderr}`.trim());
  }
}

/**
 * Unlocks the copy <copie> once its lot is on main (`git worktree unlock`).
 * @param {string} copie
 * @param {(...args: string[]) => { status: number, stdout: string, stderr: string }} git
 */
export function deverrouillerLaCopie(copie, git) {
  const r = git('worktree', 'unlock', copie);
  if (r.status !== 0 && !/not locked/.test(r.stderr)) {
    throw new Error(`la copie ${copie} ne se déverrouille pas : ${r.stderr}`.trim());
  }
}

/**
 * The command: the agent, then the reviewer, and it stops. <ports> are what it launches
 * (`copie`, `verrouiller`, `avancer`, `fiches`, `lot`, `resoudre`, `seance`, `relecture`); <options> the paths
 * `--paquet` adds to the plan.
 * @param {{ id: string, ticket: { title?: string, labels?: string[] }, options?: string[], ports: any }} o
 * @returns {Promise<{ verdict?: string, copie?: string, constats?: object[], arret?: boolean, statut?: string, rendus?: number, fiche?: object }>}
 */
export async function lancerLeDirect({ id, ticket, options = [], ports }) {
  if (!(ticket.labels ?? []).includes('direct')) {
    throw new Error(
      `Le ticket ${id} n'est pas étiqueté direct : la commande ne mène que les tickets de la voie directe (charte, « Un ticket prend l'une de trois voies »).`
    );
  }
  const { plan } = planDuDirect({
    id,
    titre: ticket.title ?? '',
    options,
    resoudre: ports.resoudre,
  });
  const copie = ports.copie();
  ports.verrouiller(copie);
  const decision = decisionDuDirect(ports.fiches(), ports.lot());
  if (decision.action === 'accepte') {
    return { verdict: 'ACCEPTÉ', copie };
  }
  if (decision.action === 'arreter') {
    return {
      arret: true,
      verdict: 'RENDU',
      rendus: decision.rendus,
      constats: decision.constats,
      copie,
    };
  }
  const constats = decision.constats ?? [];
  // A direct holds a place of circuit of the machine, counted with the circuits, from its agent to
  // its review; given back at the end, whatever the end.
  const rendre = ports.place();
  try {
    // The copy moves onto main before the session: the files its work meets in conflict go to the
    // agent, who writes them all, as the author of a lot resolves his own rebase.
    const { fichiers = [] } = (await ports.avancer(copie)) ?? {};
    const fiche = await ports.seance('direct', { constats, paquets: plan, conflits: fichiers });
    if (fiche?.statut && fiche.statut !== 'FAIT') {
      return { arret: true, statut: fiche.statut, fiche, copie };
    }
    const relue = await ports.relecture({ constats });
    return { verdict: relue.verdict, constats: relue.constats ?? [], fiche: relue.fiche, copie };
  } finally {
    rendre();
  }
}

/**
 * What the agent of a direct reads of the files its work meets in conflict with main (« aucun »
 * without any).
 * @param {string[]} fichiers
 * @returns {string}
 */
export function rapportDuConflit(fichiers) {
  return fichiers.length
    ? `L'avance de la copie sur main a laissé ces fichiers en conflit avec ton travail : ${fichiers.join(', ')}. Les marques de conflit sont dans la copie (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`) : tu résous chaque fichier, marques retirées ; un fichier du lot gardé (\`grillhouse-travail.patch\`, dans le dossier git de la copie) se reprend à la main dans la copie.`
    : 'aucun';
}

// The task the agent of a direct reads at the head of its instruction.
const TACHE_DU_DIRECT =
  "Ce ticket est mené en direct, hors du circuit : tu écris ses tests et son code ensemble, dans les paquets de ton plan. Un défaut corrigé porte un test qui le reproduit. Aucune preuve du rouge ni aucun contrôle du circuit ne suit ta séance : un relecteur juge ton lot, puis le superviseur le vérifie. Les constats ci-dessous, s'il y en a, viennent de ce relecteur.";

// The ports of the command on the project at the working directory, the circuit's own sessions.
async function portsDuProjet(id, { contexteDuSuperviseur }) {
  const { contexte } = await import('./circuit.mjs');
  const { seance, idDeSeance } = await import('./seances.mjs');
  const { arbreDeLaCopie, relire } = await import('./activites.mjs');
  const { lesFiches } = await import('./ticket-du-circuit.mjs');
  const ctx = contexte({ ticket: id, arreter: true, contexte: contexteDuSuperviseur });
  const git = (...a) => spawnSync('git', ['-C', ctx.racine, ...a], { encoding: 'utf8' });
  const ouverts = constats =>
    constats.map(c => ({ titre: c.titre, regle: c.regle, role: 'direct', corps: c.corps, piece: c.piece }));
  return {
    ctx,
    git,
    ports: {
      resoudre: ctx.resoudre,
      copie: () => {
        if (!existsSync(ctx.copie)) {
          const branche = `agent/${id}`;
          const existe = git('rev-parse', '--verify', '-q', `refs/heads/${branche}`).status === 0;
          const r = existe
            ? (git('branch', '-q', '-f', branche, 'HEAD'),
              git('worktree', 'add', '-q', ctx.copie, branche))
            : git('worktree', 'add', '-q', '-b', branche, ctx.copie, 'HEAD');
          if (r.status !== 0) {
            throw new Error(`la copie ${ctx.copie} ne se crée pas : ${r.stderr}`.trim());
          }
        }
        return ctx.copie;
      },
      // The place of circuit the direct holds for its whole run: the sessions it launches then
      // hold nothing more (GRILLHOUSE_PLACE_TENUE), as under any place already held.
      place: () => {
        const p = prendreUnePlace({
          ticket: id,
          racine: ctx.racine,
          dire: l => process.stdout.write(`${l}\n`),
        });
        const avant = process.env[VARIABLE_TENUE];
        if (p.id) {
          process.env[VARIABLE_TENUE] = p.id;
        }
        return () => {
          if (avant === undefined) {
            delete process.env[VARIABLE_TENUE];
          } else {
            process.env[VARIABLE_TENUE] = avant;
          }
          p.rendre();
        };
      },
      verrouiller: copie => verrouillerLaCopie(copie, git),
      fiches: () =>
        lesFiches(ctx).map(e => (e.role === 'relecteur' ? { ...e, lot: e.lot?.arbre } : e)),
      lot: () => arbreDeLaCopie(ctx),
      // The advance of the copy onto the tip of main, as the launcher plays it: `{ fichiers }`, the
      // files in conflict or kept in the lot, which the agent of a direct writes (`ecritPar`).
      avancer: copie => {
        const tete = git('rev-parse', 'HEAD');
        if (tete.status !== 0) {
          return { fichiers: [] };
        }
        const r = preparer(copie, String(tete.stdout).trim(), {
          ecrit: ecritPar('direct', () => false),
          sortie: 1,
        });
        return { fichiers: [...(r.conflits ?? []), ...(r.enAttente ?? [])] };
      },
      seance: async (_role, { constats, paquets, conflits = [] }) => {
        ctx.paquets = paquets;
        ctx.contexte = ctx.contexteDuDirect;
        const r = await seance(ctx, 'direct', {
          tentative: 1,
          derniere: true,
          seanceId: idDeSeance(ctx, 'direct'),
          evenement: 'neuve',
          constats: ouverts(constats),
          rapport: conflits.length ? rapportDuConflit(conflits) : undefined,
          lectures: { lots: () => [], references: () => [] },
        });
        return r.fiche;
      },
      relecture: async ({ constats }) => {
        ctx.contexte = '';
        const r = await relire(ctx, {
          constats,
          consigneDuRelecteur: consigneDuRelecteurDuDirect,
        });
        return { verdict: r.verdict, fiche: r.fiche, constats: bloquantsDeLaFiche(r.fiche) };
      },
    },
  };
}

// The command's options for <argv>: the ticket, the paths added to the plan, the context, and the
// unlocking; or a usage fault.
function lireLesOptions(argv) {
  const o = { id: null, paquets: [], contexte: null, deverrouiller: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--paquet' || a === '--contexte') {
      if (i + 1 >= argv.length) {
        return null;
      }
      if (a === '--paquet') {
        o.paquets.push(argv[++i]);
      } else {
        o.contexte = argv[++i];
      }
    } else if (a === '--deverrouiller') {
      o.deverrouiller = true;
    } else if (!a.startsWith('--') && !o.id) {
      o.id = a;
    } else {
      return null;
    }
  }
  return o.id ? o : null;
}

const USAGE =
  'usage : npx grillhouse direct <ticket> [--paquet <chemin>]… [--contexte <texte>] | npx grillhouse direct <ticket> --deverrouiller\n';

// The command on <argv>: its exit code.
async function commande(argv) {
  const o = lireLesOptions(argv);
  if (!o) {
    process.stderr.write(USAGE);
    return 2;
  }
  const { ctx, ports, git } = await portsDuProjet(o.id, { contexteDuSuperviseur: '' });
  ctx.contexteDuDirect = o.contexte ? `${TACHE_DU_DIRECT}\n\n${o.contexte}` : TACHE_DU_DIRECT;
  if (o.deverrouiller) {
    deverrouillerLaCopie(ctx.copie, git);
    process.stdout.write(`copie déverrouillée : ${ctx.copie}\n`);
    return 0;
  }
  const show = ctx.bd('show', o.id, '--json');
  if (show.status !== 0) {
    process.stderr.write(`⛔ ticket ${o.id} illisible : ${show.stderr ?? ''}\n`);
    return 2;
  }
  const r = await lancerLeDirect({
    id: o.id,
    ticket: JSON.parse(show.stdout || '[]')[0] ?? {},
    options: o.paquets,
    ports,
  });
  const constats = (r.constats ?? [])
    .map(c => `- ${c.titre} : ${c.corps}${c.piece ? ` (${c.piece})` : ''}`)
    .join('\n');
  if (r.statut) {
    process.stdout.write(
      `L'agent du direct se déclare ${r.statut} : ${r.fiche.raison ?? r.fiche.question ?? ''}\ncopie : ${r.copie}\n`
    );
    return 3;
  }
  process.stdout.write(
    `verdict : ${r.verdict}${r.arret ? ` (${r.rendus} RENDU de suite : l'arrêt monte au superviseur)` : ''}\ncopie : ${r.copie}\n${constats ? `constats bloquants :\n${constats}\n` : ''}`
  );
  return r.arret ? 3 : r.verdict === 'ACCEPTÉ' ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await commande(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`⛔ ${e.message}\n`);
    process.exitCode = 2;
  }
}
