// The stand-in of Beads for the tests of the defect ticket of a red CI of main: an executable
// `bd` put in a directory of the PATH. `list` gives the tickets of <BD_ETAT>/tickets.json, `create`
// waits <BD_LENT> ms, then appends a ticket and writes its number (nothing when <BD_MUET> is set),
// or refuses when <BD_REFUSE> is set; each call is journaled with its working directory.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { poserLeFauxProgramme } from './faux-programme.js';

const FAUX_BD = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.BD_ETAT;
const f = path.join(dir, 'tickets.json');
const lire = () => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []);
const [cmd, ...args] = process.argv.slice(2);
fs.appendFileSync(path.join(dir, 'journal.jsonl'), JSON.stringify({ cmd, args, cwd: process.cwd() }) + '\\n');
if (cmd === 'list' || cmd === 'search') {
  process.stdout.write(JSON.stringify(lire()));
} else if (cmd === 'create') {
  if (process.env.BD_REFUSE) {
    process.stderr.write('bd : base verrouillée\\n');
    process.exit(1);
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.BD_LENT || 0));
  const l = lire();
  const flag = n => args[args.indexOf(n) + 1];
  const id = 'demo-' + (100 + l.length);
  l.push({ id, title: args[0], status: 'open', labels: [flag('--labels')], description: flag('--description') });
  fs.writeFileSync(f, JSON.stringify(l));
  if (!process.env.BD_MUET) process.stdout.write(id + '\\n');
}
`;

export type Ticket = {
  id: string;
  title: string;
  status: string;
  labels: string[];
  description: string;
};
export type Appel = { cmd: string; args: string[]; cwd: string };

/** Puts the stand-in `bd` in a new directory under <sous> and a new state directory; both named. */
export function poserLeFauxBd(sous: string): { bin: string; etat: string } {
  const bin = mkdtempSync(path.join(sous, 'bin-'));
  const etat = mkdtempSync(path.join(sous, 'etat-'));
  poserLeFauxProgramme(path.join(bin, 'bd'), FAUX_BD);
  return { bin, etat };
}

/** The tickets the stand-in holds in the state directory <etat>. */
export const ticketsDe = (etat: string): Ticket[] =>
  existsSync(path.join(etat, 'tickets.json'))
    ? (JSON.parse(readFileSync(path.join(etat, 'tickets.json'), 'utf8')) as Ticket[])
    : [];

/** The calls the stand-in received, in order. */
export const journalDe = (etat: string): Appel[] =>
  existsSync(path.join(etat, 'journal.jsonl'))
    ? readFileSync(path.join(etat, 'journal.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(l => JSON.parse(l) as Appel)
    : [];
