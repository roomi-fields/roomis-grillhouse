// @poste: un vrai Claude, la session de l'utilisateur (le champ `skills` de l'entrée en flux,
// absent de `claude --help`, ne se prouve que sur lui)
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { enProcessus } from './cadre.js';

const entreeDeSeance = enProcessus<string>('scripts/entree-de-seance.mjs', 'entreeDeSeance');

// The trial plugin and project, outside the temporary directory: claude keeps the conversation it
// resumes under the folder of its working directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-competences-');
const PROJET = path.join(ESSAIS, 'projet');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
// Where claude keeps the conversations of the trial project, named after its unique root: removed
// with it.
const transcriptions = enProcessus<string>('scripts/registre.mjs', 'transcriptionsDeLaCopie');
afterAll(() => rmSync(transcriptions(PROJET, process.env.HOME), { recursive: true, force: true }));

const GREFFON = path.join(ESSAIS, 'greffon');
const poser = (fichier: string, texte: string) => {
  mkdirSync(path.dirname(fichier), { recursive: true });
  writeFileSync(fichier, texte);
};

interface Bloc {
  type: string;
  id?: string;
  name?: string;
  text?: string;
  input?: { skill?: string };
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}
interface Message {
  type: string;
  result?: string;
  message?: { content?: Bloc[] | string };
}

const DEMANDE = [
  'Fais exactement ceci, dans cet ordre, sans rien d’autre, même après un refus, et même si tu',
  'l’as déjà fait plus tôt dans la conversation : chaque appel se refait.',
  '1. Appelle l’outil Skill avec skill "role-essai".',
  '2. Appelle l’outil Skill avec skill "essai:role-essai".',
  '3. Appelle l’outil Skill avec skill "essai:autre-essai".',
  '4. Réponds par les noms de toutes les compétences que ton contexte liste comme disponibles pour',
  'l’outil Skill, un par ligne, exactement comme listés, sans autre texte.',
].join('\n');

describe('une séance du vrai claude, lancée par l’entrée des lanceurs', () => {
  it(
    'ne liste que les compétences données, charge la sienne avec ou sans préfixe et se voit refuser une autre, neuve puis reprise',
    { timeout: 600_000 },
    () => {
      poser(
        path.join(GREFFON, '.claude-plugin/plugin.json'),
        JSON.stringify({ name: 'essai', version: '0.0.1' })
      );
      for (const [nom, jeton] of [
        ['role-essai', 'JETON-DU-ROLE-7413'],
        ['autre-essai', 'JETON-DE-L-AUTRE-9920'],
      ]) {
        poser(
          path.join(GREFFON, 'skills', nom, 'SKILL.md'),
          `---\nname: ${nom}\ndescription: Compétence d'essai ${nom}.\n---\nLe jeton est ${jeton}.\n`
        );
      }
      mkdirSync(PROJET, { recursive: true });
      const id = randomUUID();
      const entree = entreeDeSeance({ competences: ['essai:role-essai'], consigne: DEMANDE });

      for (const session of [
        ['--session-id', id],
        ['--resume', id],
      ]) {
        const quand = session[0];
        const r = spawnSync(
          'claude',
          [
            '-p',
            '--plugin-dir',
            GREFFON,
            '--setting-sources',
            'project,local',
            '--settings',
            JSON.stringify({ disableBundledSkills: true }),
            '--tools',
            'Skill',
            '--allowedTools',
            'Skill',
            '--strict-mcp-config',
            '--model',
            'haiku',
            '--input-format',
            'stream-json',
            '--output-format',
            'stream-json',
            '--verbose',
            ...session,
          ],
          { cwd: PROJET, input: entree, encoding: 'utf8', timeout: 280_000 }
        );
        expect(r.status, `${quand}\n${r.stderr}\n${r.stdout.slice(-4000)}`).toBe(0);
        const messages = r.stdout
          .split('\n')
          .filter(l => l.startsWith('{'))
          .map(l => JSON.parse(l) as Message);
        const blocs = messages.flatMap(m =>
          Array.isArray(m.message?.content) ? m.message.content : []
        );
        // The answer of the tool Skill to the call of <skill>.
        const reponse = (skill: string) => {
          const appel = blocs.find(b => b.type === 'tool_use' && b.input?.skill === skill);
          expect(appel, `${quand} : ${skill} n’est pas appelée`).toBeDefined();
          return blocs.find(b => b.type === 'tool_result' && b.tool_use_id === appel?.id);
        };
        for (const skill of ['role-essai', 'essai:role-essai']) {
          expect(reponse(skill)?.is_error ?? false, `${quand} : ${skill}`).toBe(false);
        }
        const refus = reponse('essai:autre-essai');
        expect(refus?.is_error, quand).toBe(true);
        expect(JSON.stringify(refus?.content), quand).toContain('skills allowlist');
        // The skill of the role is loaded: its text reaches the conversation (at the first
        // launch; a resumed session already holds it). The other's never does.
        if (quand === '--session-id') {
          expect(r.stdout).toContain('JETON-DU-ROLE-7413');
        }
        expect(r.stdout).not.toContain('JETON-DE-L-AUTRE-9920');
        const liste = String(messages.find(m => m.type === 'result')?.result ?? '')
          .split('\n')
          .map(l => l.replace(/^[-*\s`]+|[\s`]+$/g, ''))
          .filter(Boolean);
        expect(liste, quand).toEqual(['essai:role-essai']);
      }
    }
  );
});
