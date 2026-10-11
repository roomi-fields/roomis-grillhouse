// The waiting side of the integration, kept in git's common directory: the integration lock, the
// queue lock, and the queue's entries. The integration writes an entry when it commits a ticket on
// its branch; the queue (scripts/integration/file.mjs) reads them in their order of arrival.
//
// - A lock is a file holding the process number of its owner; a lock whose process is gone is
//   taken over. `prendreVerrou` waits for a live owner (`attendre`) or gives up at once.
// - An entry is one JSON file `<arrival>-<process>.json` under `file-integration/` holding the
//   branch and the tickets it carries; the name sorts in the order of arrival. One branch has one
//   entry: writing it again replaces the earlier one.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The git common directory of the repository at <racine>, absolute.
export function dossierCommun(racine) {
  return spawnSync(
    'git',
    ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8' }
  ).stdout.trim();
}

const attendreUnPeu = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function vivant(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// Takes the lock file <verrou>. Returns true once taken; with `attendre` false, returns false when a
// live process owns it. A lock being written (empty) counts as owned.
export function prendreVerrou(verrou, { attendre }) {
  for (;;) {
    try {
      writeFileSync(verrou, String(process.pid), { flag: 'wx' });
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let contenu = '';
    try {
      contenu = readFileSync(verrou, 'utf8').trim();
    } catch {
      continue;
    }
    const pid = Number(contenu);
    if (contenu && Number.isInteger(pid) && !vivant(pid)) {
      try {
        if (readFileSync(verrou, 'utf8').trim() === contenu) rmSync(verrou, { force: true });
      } catch {
        // the owner released it meanwhile: the next turn takes it
      }
      continue;
    }
    if (!attendre) return false;
    attendreUnPeu(200);
  }
}

export function lacherVerrou(verrou) {
  rmSync(verrou, { force: true });
}

const dossierEntrees = racine => path.join(dossierCommun(racine), 'file-integration');

// The entries waiting, in their order of arrival: { fichier, branche, tickets }.
export function lireEntrees(racine) {
  const dossier = dossierEntrees(racine);
  let noms = [];
  try {
    noms = readdirSync(dossier)
      .filter(n => n.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
  const entrees = [];
  for (const n of noms) {
    try {
      const e = JSON.parse(readFileSync(path.join(dossier, n), 'utf8'));
      entrees.push({ fichier: path.join(dossier, n), branche: e.branche, tickets: e.tickets });
    } catch {
      // an entry being written is read at the next turn
    }
  }
  return entrees;
}

// Puts the branch at the end of the queue, replacing its earlier entry.
export function inscrireEntree(racine, branche, tickets) {
  for (const e of lireEntrees(racine)) {
    if (e.branche === branche) rmSync(e.fichier, { force: true });
  }
  const dossier = dossierEntrees(racine);
  mkdirSync(dossier, { recursive: true });
  const arrivee = String(Date.now()).padStart(15, '0');
  const fichier = path.join(dossier, `${arrivee}-${String(process.pid).padStart(8, '0')}.json`);
  writeFileSync(fichier, JSON.stringify({ branche, tickets }), { flag: 'wx' });
}

export function retirerEntree(entree) {
  rmSync(entree.fichier, { force: true });
}
