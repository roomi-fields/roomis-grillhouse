// The sonde's activity: it starts a process that does its steps one by one and says each on its
// standard output, and sends a sign of life to the server at each step (`heartbeat`, the steps
// done). When its worker dies, the server gives the activity again once its sign of life is late,
// and the new attempt starts its process from the last sign of life the server kept
// (`heartbeatDetails`). A cancellation (the worker stopping) ends the process.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Context } from '@temporalio/activity';
import type { ResultatDeLActivite, SigneDeVie } from './contrat.js';

// The process: from the step argv[1] to argv[2], one step every argv[3] ms, each said `fait <n>`;
// its reader gone (its worker killed), it ends at its next step.
const PROCESSUS = `
process.stdout.on('error', () => process.exit(1));
const [depuis, etapes, pause] = process.argv.slice(1).map(Number);
let i = depuis;
const pas = () => {
  if (i >= etapes) return;
  i += 1;
  process.stdout.write('fait ' + i + '\\n');
  setTimeout(pas, pause);
};
setTimeout(pas, pause);
`;

/** Runs the sonde's process for <etapes> steps, <pauseMs> ms apart, from its last sign of life. */
export async function lancerLaSonde({
  etapes,
  pauseMs,
}: {
  etapes: number;
  pauseMs: number;
}): Promise<ResultatDeLActivite> {
  const ctx = Context.current();
  const depuis = (ctx.info.heartbeatDetails as SigneDeVie | undefined)?.fait ?? 0;
  const enfant = spawn(
    process.execPath,
    ['-e', PROCESSUS, String(depuis), String(etapes), String(pauseMs)],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const arreter = () => enfant.kill('SIGTERM');
  ctx.cancellationSignal.addEventListener('abort', arreter);
  let fait = depuis;
  ctx.heartbeat({ fait } satisfies SigneDeVie);
  createInterface({ input: enfant.stdout }).on('line', l => {
    const m = /^fait (\d+)$/.exec(l);
    if (m) {
      fait = Number(m[1]);
      ctx.heartbeat({ fait } satisfies SigneDeVie);
    }
  });
  const code = await new Promise<number | null>((ok, ko) => {
    enfant.once('error', ko);
    enfant.once('close', ok);
  });
  ctx.cancellationSignal.removeEventListener('abort', arreter);
  if (ctx.cancellationSignal.aborted) {
    throw ctx.cancellationSignal.reason;
  }
  if (code !== 0) {
    throw new Error(`le processus de la sonde sort en ${code}`);
  }
  return { fait, depuis, tentative: ctx.info.attempt, pid: enfant.pid ?? 0 };
}
