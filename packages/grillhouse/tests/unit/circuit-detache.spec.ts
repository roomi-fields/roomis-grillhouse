// A circuit outlives the session that launched it (grillhouse-mwz): it runs detached from it, in a
// unit of its own when the user's systemd answers; its launch gives the hand back once the run's
// state names it (grillhouse-pq6, as `systemctl start` returns once its unit has started), and
// `npx grillhouse circuit <ticket> --rattacher` waits for the circuit its state names and ends on
// its stop, as the server of Bazel outlives its client.
// Witness: on 2026-11-01, systemd-oomd killed the scope of the tmux pane of BPScript's supervisor
// (12:56:17, 94 processes), the circuits bp-mono-vbwf.320.11 and 320.7.11 with it, though they
// were daemons apart from the session's tree; and SyntHub's SH-br0.1 stopped 27 s after a relaunch
// of its session, with no one left to read its question.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { rattacher } from '../../scripts/circuit.mjs';
import { systemdUtilisateur } from '../../scripts/demon.mjs';
import { leMemeVivant } from '../../scripts/mesure/base-de-passe.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-detache-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEMON = path.resolve(__dirname, '../../scripts/demon.mjs');
const BASE = path.resolve(__dirname, '../../scripts/mesure/base-de-passe.mjs');
// A run as the circuit's, short, on the ticket <ticket>, in a unit named after it: its state <etat>
// named by its process, a wait of <attente> ms, then its
// stop on a question for the supervisor, written in its state as scripts/circuit.mjs writes it,
// and its code, 14.
const FAUX = path.join(ESSAIS, 'faux-circuit.mjs');
writeFileSync(
  FAUX,
  `import { writeFileSync } from 'node:fs';
import { executerEnDemon, rendreLaMain } from ${JSON.stringify(DEMON)};
import { departDe } from ${JSON.stringify(BASE)};
const main = async ([, etat, attente]) => {
  const e = { etape: 'controles', tentative: 2, code: null, raison: null, question: null,
    processus: process.pid, depart: departDe(process.pid) };
  writeFileSync(etat, JSON.stringify(e));
  rendreLaMain('▶ Circuit de ' + process.argv[2] + ' lancé, détaché\\n');
  await new Promise(r => setTimeout(r, Number(attente)));
  writeFileSync(etat, JSON.stringify({ ...e, code: 14, raison: 'controles',
    question: { arret: 'controles', fait: 'Le test reste rouge.', piece: 'x.spec.ts:3',
      question: 'Quel paquet lève ce rouge ?', qui: 'superviseur' } }));
  process.stderr.write('⛔ la question du circuit\\n');
  return 14;
};
process.exitCode = await executerEnDemon(import.meta.filename, process.argv.slice(2), main, {
  unite: 'grillhouse-circuit-' + process.argv[2],
});
`
);

const attendre = async (vrai: () => boolean, ms = 10_000) => {
  const limite = Date.now() + ms;
  while (!vrai()) {
    if (Date.now() > limite) {
      throw new Error('délai dépassé');
    }
    await new Promise(r => setTimeout(r, 50));
  }
};
const lireEtat = (f: string) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as { processus: number; depart: string };
  } catch {
    return null;
  }
};

// The circuit launched as the supervisor launches it: its client, which gives the hand back once
// the run's state names it (grillhouse-pq6), its code and error output, the state and the
// circuit's process.
const lancer = async (ticket: string, attente: number) => {
  const etat = path.join(ESSAIS, `${ticket}.circuit.json`);
  const client = spawn('node', [FAUX, ticket, etat, String(attente)], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let erreurs = '';
  client.stderr.on('data', d => {
    erreurs += String(d);
  });
  const code = await new Promise<number | null>(r => client.on('close', r));
  const { processus, depart } = lireEtat(etat)!;
  return { client, code, erreurs, etat, processus, depart };
};
// The circuit's process <processus> killed as systemd kills a unit, and the directory of its
// output removed, which the daemon's own exit removes once its caller is gone: the directory its
// role names in its environment (the variable of scripts/demon.mjs).
const tuerLeCircuit = (processus: number) => {
  const role = readFileSync(`/proc/${processus}/environ`, 'utf8')
    .split('\0')
    .find(v => v.startsWith('GRILLHOUSE_CIRCUIT_DETACHE='));
  process.kill(processus, 'SIGKILL');
  if (role) {
    const { dossier } = JSON.parse(role.slice(role.indexOf('=') + 1)) as { dossier: string };
    rmSync(dossier, { recursive: true, force: true });
  }
};
const sortie = () => {
  const lu = { texte: '' };
  return {
    lu,
    erreurs: {
      write: (s: string) => {
        lu.texte += s;
        return true;
      },
    },
  };
};

describe('a circuit detached from its session', { timeout: 60_000 }, () => {
  it('grillhouse-pq6 — its launch gives the hand back at once, the circuit going on, and its stop reads by --rattacher', async () => {
    const {
      client,
      code: lance,
      erreurs: dit,
      etat,
      processus,
      depart,
    } = await lancer('demo-1', 2000);
    expect(lance).toBe(0);
    expect(dit).toBe('▶ Circuit de demo-1 lancé, détaché\n');
    expect(processus).not.toBe(client.pid);
    expect(leMemeVivant(processus, depart)).toBe(true);
    const { lu, erreurs } = sortie();
    const code = Number(await rattacher({ ticket: 'demo-1', etat, pas: 50, erreurs }));
    expect(code).toBe(14);
    expect(leMemeVivant(processus, depart)).toBe(false);
    expect(lu.texte).toContain('⛔ Circuit de demo-1 : question au superviseur (controles');
    expect(lu.texte).toContain('`npx grillhouse circuit demo-1 --reprendre`');
  });

  it('grillhouse-mwz critère 2 — a circuit dead without a stop written ends --rattacher on the command that resumes it', async () => {
    const { etat, processus, depart } = await lancer('demo-2', 30_000);
    tuerLeCircuit(processus);
    await attendre(() => !leMemeVivant(processus, depart));
    const { lu, erreurs } = sortie();
    const code = Number(await rattacher({ ticket: 'demo-2', etat, pas: 50, erreurs }));
    expect(code).toBe(1);
    expect(lu.texte).toContain('sans état final');
    expect(lu.texte).toContain('`npx grillhouse circuit demo-2 --reprendre`');
  });

  it.skipIf(!systemdUtilisateur())(
    'grillhouse-mwz critère 1 — runs in a unit of its own, out of the group of control of its caller',
    async () => {
      const { processus, depart } = await lancer('demo-3', 30_000);
      try {
        const groupe = readFileSync(`/proc/${processus}/cgroup`, 'utf8');
        expect(groupe).not.toBe(readFileSync('/proc/self/cgroup', 'utf8'));
        expect(groupe).toMatch(/grillhouse-circuit-demo-3-\d+\.scope/);
      } finally {
        if (leMemeVivant(processus, depart)) {
          tuerLeCircuit(processus);
        }
      }
    }
  );
});
