// @poste: le vrai claude installé
// What a session of a role loads of the common charter, with the real claude: a trial project whose
// CLAUDE.md imports the charter from the package installed, the modules beside it, launched with the
// options of the testwriter (droits.mjs). The model's address is a local server that keeps what
// claude sends it: no call leaves the machine, and the proof is the context itself. Only the real
// claude proves that the exclusion of an imported file holds after an upgrade of Claude Code.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cheminSysteme, declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { RACINE } from './cadre.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'charte-par-role-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DROITS = path.join(RACINE, 'packages/grillhouse/scripts/droits.mjs');
const GREFFON = path.join(RACINE, 'mods/grillhouse');

// The answer of the model, a stream of one word, as the Messages API streams it.
const REPONSE = [
  {
    type: 'message_start',
    message: {
      id: 'msg_essai',
      type: 'message',
      role: 'assistant',
      model: 'essai',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'vu' } },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]
  .map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
  .join('');

// Every text of the JSON value <v>, joined.
const textes = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : v && typeof v === 'object'
      ? Object.values(v).map(textes).join('\n')
      : '';

// The context claude sends for a session of <role> in the project <projet>.
async function contexte(role: string, projet: string) {
  const maison = mkdtempSync(path.join(ESSAIS, 'maison-'));
  const env = {
    HOME: maison,
    PATH: `${path.dirname(execFileSync('which', ['claude'], { encoding: 'utf8' }).trim())}:${cheminSysteme()}`,
    TMPDIR: ESSAIS,
  };
  const options = execFileSync(
    process.execPath,
    [DROITS, role, '--racine', projet, '--copie', projet, '--ticket', 'essai-1'],
    { encoding: 'utf8', env }
  )
    .trimEnd()
    .split('\n');

  const recus: string[] = [];
  const serveur = createServer((requete, reponse) => {
    let corps = '';
    requete.on('data', d => (corps += String(d)));
    requete.on('end', () => {
      if (requete.url?.startsWith('/v1/messages') && !requete.url.includes('count_tokens')) {
        recus.push(textes(JSON.parse(corps)));
        reponse.writeHead(200, { 'content-type': 'text/event-stream' });
        reponse.end(REPONSE);
        return;
      }
      reponse.writeHead(200, { 'content-type': 'application/json' });
      reponse.end('{}');
    });
  });
  await new Promise<void>(r => serveur.listen(0, '127.0.0.1', r));
  const claude = spawn('claude', ['-p', 'bonjour', ...options], {
    cwd: projet,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
    env: {
      ...env,
      CLAUDE_CONFIG_DIR: path.join(maison, '.claude'),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`,
      ANTHROPIC_API_KEY: 'sk-ant-essai',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
  });
  let sortie = '';
  claude.stdout.on('data', d => (sortie += String(d)));
  claude.stderr.on('data', d => (sortie += String(d)));
  const code = await new Promise<number | null>(r => claude.on('close', r));
  serveur.closeAllConnections();
  serveur.close();
  expect(code, sortie).toBe(0);
  return recus.join('\n');
}

describe('a session of a role loads its part of the common charter, with the real claude', () => {
  it('receives the core and the modules its role keeps, and no text of a module its settings exclude', async () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    writeFileSync(path.join(projet, 'package.json'), JSON.stringify({ name: 'essai' }));
    declarerLesLangages(projet);
    writeFileSync(
      path.join(projet, 'CLAUDE.md'),
      '# Essai\n\nLes règles du cadre : @node_modules/@roomi-fields/grillhouse/charte.md\n'
    );
    const paquet = path.join(projet, 'node_modules/@roomi-fields/grillhouse');
    mkdirSync(paquet, { recursive: true });
    for (const f of ['charte.md', 'charte']) {
      if (existsSync(path.join(GREFFON, f))) {
        cpSync(path.join(GREFFON, f), path.join(paquet, f), { recursive: true });
      }
    }

    const recu = (await contexte('testwriter', projet)).replace(/\s+/g, ' ');

    // The core, and the modules of the proof and of the tests.
    expect(recu).toContain('**Un fait repris se relit à sa pièce**');
    expect(recu).toContain('**Le rouge prouve le travail du ticket**');
    expect(recu).toContain('**Une mesure de temps joue la nuit**');
    // Nothing of the modules of the supervisor and of the plan.
    expect(recu).not.toContain('**La file directe se tient comme la file des tickets**');
    expect(recu).not.toContain('**Un ticket de réalisation nomme ses composants**');
  }, 180_000);
});
