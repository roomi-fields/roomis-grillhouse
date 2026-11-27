#!/usr/bin/env node
// The write lock of a session out of the envelope: a PreToolUse hook of the frame's plugin
// (hooks/hooks.json, `npx grillhouse verrou-hors-enveloppe`), which runs in every session of a
// project that installs the frame. It reads the hook's JSON on stdin and refuses, exit code 2 and
// its reason on stderr, the write of the code or the tests of a package by a session that is no
// agent of the frame under its envelope: the supervisor, the person who starts Claude Code by hand,
// a session that lost its variable of envelope (`GRILLHOUSE_ENVELOPPE`, refusal by default).
// Architecture: docs/architecture/machine.md (§3.3, §5.5 « Les verrous dans la séance »).
//
// - A write of a document (a `.md` file) passes: the documents of a package (CADRE.md,
//   INTERFACE.md, ARCHITECTURE.md, CHANGELOG, the skills and the charter of `mods/grillhouse`) and
//   those of the root (CLAUDE.md, docs/, the configuration) stay the supervisor's.
// - What a package holds is read as its lock reads it (`paquetQuiTient`, the components of the
//   module of the language); `mods/grillhouse`, the frame's plugin, is one too. A file of the root
//   of the repository passes.
// - A path under the temporary directory of the session passes, and so does any tool that writes
//   nothing. A session under its envelope is judged by its role's lock (verrou.mjs).
// - The reason names the direct circuit (a ticket labelled `direct`, which goes by the queue), and
//   the rescue command `npx grillhouse direct <ticket> --panne <texte>` for a failure of the engine
//   alone.
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { paquetQuiTient, paquetsDuLangage, paquetsDeLEnveloppe } from '../enveloppe/paquets-du-plan.mjs';
import { langageDeLaCopie } from '../langages.mjs';
import { racineDe } from './verrou.mjs';

const OUTILS_D_ECRITURE = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
// The frame's own code, a package though no table of components lists it.
const CADRE = 'mods/grillhouse';

const sous = (rel, dossier) => rel === dossier || rel.startsWith(`${dossier}/`);

/**
 * The refusal of the write <input> of a session out of the envelope, or null when it passes.
 * @param {{ tool_name?: string, tool_input?: Record<string, string>, cwd?: string }} input
 * @param {{ env?: Record<string, string | undefined>, tmp?: string }} [options]
 * @returns {string | null}
 */
export function refusDeLEcritureHorsEnveloppe(
  input,
  { env = process.env, tmp = tmpdir() } = {}
) {
  if (!OUTILS_D_ECRITURE.has(input.tool_name ?? '') || paquetsDeLEnveloppe(env)) {
    return null;
  }
  const brut = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!brut) {
    return null;
  }
  const fichier = path.resolve(input.cwd ?? process.cwd(), brut);
  const dansTmp = path.relative(path.resolve(tmp), fichier);
  if (dansTmp !== '' && !dansTmp.startsWith('..') && !path.isAbsolute(dansTmp)) {
    return null;
  }
  if (fichier.endsWith('.md')) {
    return null;
  }
  const copie = racineDe(fichier);
  if (!copie) {
    return null;
  }
  const rel = path.relative(copie, fichier);
  const tenant = sous(rel, CADRE)
    ? CADRE
    : paquetQuiTient(rel, paquetsDuLangage(langageDeLaCopie(copie), copie));
  if (tenant === '.') {
    return null;
  }
  return `⛔ ${rel} est du code ou un test du paquet ${tenant} : une séance hors enveloppe (le superviseur, une séance lancée à la main, une séance qui a perdu sa variable d'enveloppe) n'écrit ni le code ni les tests d'un paquet. Ce travail passe par le circuit direct : un ticket étiqueté \`direct\`, qui part par la file, un agent l'écrit dans une copie à lui et un relecteur le relit. Pour une panne du moteur seulement, la voie de secours le mène : \`npx grillhouse direct <ticket> --panne <texte>\`. Les documents restent écrits ici.`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // A hook that throws exits 1, which Claude Code lets pass: an input or a project the lock cannot
  // judge is refused (a firewall's rule), its reason said.
  try {
    const raison = refusDeLEcritureHorsEnveloppe(JSON.parse(readFileSync(0, 'utf8')));
    if (raison) {
      process.stderr.write(`${raison}\n`);
      process.exitCode = 2;
    }
  } catch (e) {
    process.stderr.write(`⛔ verrou hors enveloppe : ${e.message} (écriture refusée)\n`);
    process.exitCode = 2;
  }
}
