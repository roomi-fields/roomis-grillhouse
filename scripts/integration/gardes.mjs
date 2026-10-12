#!/usr/bin/env node
// The guards of an integration: `integration:gardes` in package.json. It plays the controls of
// `grillhouse:gardes`, the one list of them, in their order, without its build step: the
// integration builds the project once, after the lots (scripts/integration/rejeu.mjs, as soon as a
// suite or a control that follows the build step in the list reads the build), and plays every
// control, none is left out. Exit code: the first control that refuses, else 0.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const estConstruction = etape => /^npm run .*\bbuild$/.test(etape);

// The steps of `grillhouse:gardes` split in the controls before the build step and those after it
// (`lisentLaConstruction`: those that read the build); `null` when the project has no such list.
export function etapesDesGardes(scripts) {
  const liste = scripts?.['grillhouse:gardes'];
  if (typeof liste !== 'string') return null;
  const etapes = liste.split('&&').map(e => e.trim());
  const i = etapes.findIndex(estConstruction);
  return {
    etapes: etapes.filter(e => !estConstruction(e)),
    lisentLaConstruction: i < 0 ? [] : etapes.slice(i + 1),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scripts = JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
  ).scripts;
  const gardes = etapesDesGardes(scripts);
  if (!gardes) {
    process.stderr.write("⛔ package.json n'a pas de script grillhouse:gardes.\n");
    process.exit(1);
  }
  for (const etape of gardes.etapes) {
    const r = spawnSync('sh', ['-c', etape], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
