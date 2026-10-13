// The reporter of Vitest the launcher of the tests uses (scripts/integration/suites-vitest.mjs): it
// reports each test file apart, shortly after the file ends (Vitest sends the console output of the
// tests in batches, which arrive after the file's end), and all the files left when the run ends.
// For each file it prints a block on the
// standard output (the file's line, the console output of its tests, its failures as Vitest prints them: message, diff, code frame and stack) and appends
// one JSON line `{ fichier, rouges, sortie }` to the file named by RAPPORT_VITEST: the path of the
// file relative to the root, its failing tests by name (« <path> > <full name> »; a file that fails
// without a failing test, a collect error, is named by its path alone), and the printed block.
import { appendFileSync } from 'node:fs';
import { Console } from 'node:console';
import path from 'node:path';
import { Writable } from 'node:stream';

const ETATS_FINIS = new Set(['pass', 'fail', 'skip']);
const ATTENTE_DES_JOURNAUX = 400;

// The tests of a file or suite, in order.
function testsDe(tache) {
  return (tache.tasks ?? []).flatMap(t => (t.tasks ? testsDe(t) : [t]));
}

// The name of a test below its file: the names of its suites, then its own, joined by a space.
function nomDe(test) {
  const noms = [];
  for (let t = test; t && !t.filepath; t = t.suite) noms.unshift(t.name);
  return noms.join(' ');
}

// Writable that keeps what Vitest's logger writes to it.
class Collecteur extends Writable {
  texte = '';
  _write(morceau, _codage, suite) {
    this.texte += morceau.toString();
    suite();
  }
}

export default class Rapporteur {
  onInit(ctx) {
    this.ctx = ctx;
    this.racine = ctx.config.root;
    this.finis = new Set();
    this.attendus = new Map();
    this.consoles = new Map();
  }

  // Vitest's own printing of the errors of a test or of a file (message, diff, code frame, stack),
  // taken from its logger as it writes it for its default reporter.
  imprimerErreurs(erreurs, projet) {
    const logger = this.ctx.logger;
    const consoleAvant = logger.console;
    const collecteur = new Collecteur();
    logger.console = new Console({ stdout: collecteur, stderr: collecteur });
    try {
      for (const e of erreurs) logger.printError(e, { project: projet, fullStack: true });
    } finally {
      logger.console = consoleAvant;
    }
    return collecteur.texte.replace(/\n+$/, '');
  }

  rel(fichier) {
    return path.relative(this.racine, fichier.filepath).split(path.sep).join('/');
  }

  onUserConsoleLog(log) {
    const tache = log.taskId ? this.ctx.state.idMap.get(log.taskId) : undefined;
    const fichier = tache?.file ?? tache;
    if (!fichier?.filepath) {
      process.stdout.write(log.content);
      return;
    }
    const cle = fichier.id;
    const entete = `${log.type} | ${this.rel(fichier)}${tache.filepath ? '' : ` > ${nomDe(tache)}`}`;
    const bloc = `${entete}\n${log.content.replace(/\n?$/, '\n')}\n`;
    this.consoles.set(cle, (this.consoles.get(cle) ?? '') + bloc);
  }

  onTaskUpdate(paquets) {
    for (const [id] of paquets) {
      const tache = this.ctx.state.idMap.get(id);
      if (tache?.filepath && ETATS_FINIS.has(tache.result?.state) && !this.attendus.has(tache.id)) {
        this.attendus.set(
          tache.id,
          setTimeout(() => this.terminer(tache), ATTENTE_DES_JOURNAUX)
        );
      }
    }
  }

  onFinished(fichiers = [], erreurs = []) {
    for (const t of this.attendus.values()) clearTimeout(t);
    for (const f of fichiers) if (ETATS_FINIS.has(f.result?.state)) this.terminer(f);
    if (erreurs.length > 0) {
      this.ctx.logger.printUnhandledErrors(erreurs);
    }
  }

  // Prints the block of the finished <fichier> and appends its line to the report, once.
  terminer(fichier) {
    if (this.finis.has(fichier.id)) return;
    this.finis.add(fichier.id);
    const rel = this.rel(fichier);
    const tests = testsDe(fichier);
    const echecs = tests.filter(t => t.result?.state === 'fail');
    const rouges = echecs.map(t => `${rel} > ${nomDe(t)}`);
    if (fichier.result.state === 'fail' && rouges.length === 0) rouges.push(rel);
    const lignes = [
      `${rouges.length > 0 ? '❯' : '✓'} ${rel} (${tests.length} tests${echecs.length > 0 ? ` | ${echecs.length} failed` : ''})${typeof fichier.result.duration === 'number' ? ` ${Math.round(fichier.result.duration)}ms` : ''}`,
    ];
    const console_ = this.consoles.get(fichier.id);
    if (console_) lignes.push(console_.replace(/\n+$/, ''));
    const projet = this.ctx.getProjectByTaskId?.(fichier.id);
    for (const t of echecs) {
      lignes.push(`FAIL ${rel} > ${nomDe(t)}`);
      lignes.push(this.imprimerErreurs(t.result.errors ?? [], projet));
    }
    if (echecs.length === 0 && fichier.result.state === 'fail') {
      lignes.push(`FAIL ${rel}`);
      lignes.push(this.imprimerErreurs(fichier.result.errors ?? [], projet));
    }
    const sortie = `${lignes.join('\n')}\n`;
    process.stdout.write(sortie);
    if (process.env.RAPPORT_VITEST) {
      appendFileSync(
        process.env.RAPPORT_VITEST,
        `${JSON.stringify({ fichier: rel, rouges, sortie })}\n`
      );
    }
  }
}
