// The test files of a runner that writes no report test by test, read from the lines it prints:
// `claude plugin test`, which plays the tests of a plugin (packages/grillhouse/docs/architecture/tests.md
// §3.3), which the verdict of the module reads (./verdict.mjs). As Bazel judges a test target that
// writes no test.xml by its exit code and its log, a task of such a runner is judged by both. The
// lines:
//
//   <file, from the folder of the package>:
//   (pass) <full name of the test> [<duration>]
//   (fail) <full name of the test> [<duration>]
//     <message, indented>
//   (fail) the file did not load
//     <reason, indented>
//   Ran <n> tests across <m> files. [<duration>]
import path from 'node:path';

const FICHIER = /^(\S.*\.(?:test|spec)\.[cm]?[jt]sx?):$/;
const TEST = /^\((pass|fail|skip|todo)\) (.*?)(?: \[[\d.]+(?:ms|s)\])?$/;
const BILAN = /^Ran \d+ tests? across \d+ files?\./;
const NON_CHARGE = 'the file did not load';
const ETATS = { pass: 'passed', fail: 'failed', skip: 'skipped', todo: 'todo' };

/**
 * The reports of the test files the lines &lt;texte&gt; of a task name, its package in the folder
 * &lt;dossier&gt; (absolute), its exit code &lt;code&gt;: a file the runner did not load is failed, without a
 * test, its reason its message. None when the lines prove nothing: the runner stopped before its
 * last line, or a red code that no line explains.
 * @param {string} texte
 * @param {{ dossier: string, code: number }} tache
 * @returns {import('../../jointure.js').RapportDeTest[]}
 */
export function rapportsAuxLignes(texte, { dossier, code }) {
  const rapports = [];
  let rapport = null;
  // What the indented lines that follow explain: the failed test, or the file not loaded.
  let explique = null;
  let fini = false;
  for (const ligne of texte.split(/\r?\n/)) {
    const fichier = FICHIER.exec(ligne);
    const test = rapport && TEST.exec(ligne);
    if (fichier) {
      rapport = {
        fichier: path.join(dossier, fichier[1]),
        etat: 'passed',
        message: '',
        tests: [],
      };
      rapports.push(rapport);
      explique = null;
    } else if (test) {
      const [, etat, nom] = test;
      explique = null;
      if (etat === 'fail') {
        rapport.etat = 'failed';
      }
      if (etat === 'fail' && nom === NON_CHARGE) {
        explique = rapport;
      } else {
        const t = { titre: nom.split(' > ').at(-1), nom, etat: ETATS[etat], message: '' };
        rapport.tests.push(t);
        explique = etat === 'fail' ? t : null;
      }
    } else if (BILAN.test(ligne)) {
      fini = true;
      rapport = null;
      explique = null;
    } else if (explique && /^\s/.test(ligne)) {
      explique.message += `${explique.message ? '\n' : ''}${ligne.trim()}`;
    } else {
      explique = null;
    }
  }
  const expliquee = code === 0 || rapports.some(r => r.etat === 'failed');
  return fini && expliquee ? rapports : [];
}