// The stop of an agent of a team with an unread message (scripts/messages-non-lus.mjs), on a trial
// home: its teams under .claude/teams (config.json, inboxes/<nom>.json) and the meta file of a
// sub-agent's transcript, as Claude Code writes them.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { boiteDe, messagesNonLus } from '../../scripts/messages-non-lus.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'messages-non-lus-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SEANCE = '198ebe81-587b-47b5-be3e-00b1f0afce60';
const EQUIPE = 'session-198ebe81';

const ecrire = (f: string, contenu: unknown) => {
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};

type Message = { from: string; text: string; summary?: string; msg_id: string; read: boolean };
const message = (msg_id: string, text: string, read = false, from = 'team-lead'): Message => ({
  from,
  text,
  summary: `résumé ${msg_id}`,
  msg_id,
  read,
});

// A trial home with the lead's team, its member <nom> and its box <boite>; the transcript of the
// session and the meta file of the sub-agent <agentId>, which names <nom> in the team.
function maison(nom: string, boite: Message[] | string | null) {
  const m = mkdtempSync(path.join(ESSAIS, 'maison-'));
  const equipe = path.join(m, '.claude', 'teams', EQUIPE);
  ecrire(path.join(equipe, 'config.json'), {
    name: EQUIPE,
    leadSessionId: SEANCE,
    members: [
      { name: 'team-lead', agentId: `team-lead@${EQUIPE}`, backendType: 'in-process' },
      { name: nom, agentId: `${nom}@${EQUIPE}`, backendType: 'in-process' },
    ],
  });
  if (boite !== null) {
    ecrire(path.join(equipe, 'inboxes', `${nom}.json`), boite);
  }
  const transcription = path.join(m, '.claude', 'projects', 'p', `${SEANCE}.jsonl`);
  ecrire(transcription, '');
  const agentId = `a${nom}-33af8b5db9647881`;
  ecrire(
    path.join(m, '.claude', 'projects', 'p', SEANCE, 'subagents', `agent-${agentId}.meta.json`),
    {
      agentType: nom,
      name: nom,
      taskKind: 'in_process_teammate',
      teamName: EQUIPE,
    }
  );
  return {
    m,
    boite: path.join(equipe, 'inboxes', `${nom}.json`),
    arret: {
      session_id: SEANCE,
      transcript_path: transcription,
      hook_event_name: 'SubagentStop',
      stop_hook_active: false,
      agent_id: agentId,
      agent_type: nom,
    },
    inactif: {
      session_id: SEANCE,
      transcript_path: transcription,
      hook_event_name: 'TeammateIdle',
      teammate_name: nom,
      team_name: EQUIPE,
    },
  };
}

describe('an agent with an unread message does not stop', () => {
  it('blocks the stop of a sub-agent with the text and the sender of each unread message', () => {
    const e = maison('panneau-file', [
      message('m1', 'Déjà lu.', true),
      message('m2', 'Garde le CHANGELOG en anglais.'),
      message('m3', 'Relance le second commit.', false, 'explo-file'),
    ]);
    const raison = messagesNonLus(e.arret, { maison: e.m });
    expect(raison).toMatch(/^Ne t'arrête pas : 2 messages non lus/);
    expect(raison).toContain('## De team-lead — résumé m2\nGarde le CHANGELOG en anglais.');
    expect(raison).toContain('## De explo-file — résumé m3\nRelance le second commit.');
    expect(raison).not.toContain('Déjà lu.');
  });

  it('blocks a teammate about to go idle, its team found by the session of its lead', () => {
    const e = maison('messages', [message('m1', 'Lis le ticket.')]);
    expect(messagesNonLus({ ...e.inactif, team_name: undefined }, { maison: e.m })).toContain(
      '## De team-lead — résumé m1\nLis le ticket.'
    );
  });

  it('blocks an agent that its team no longer lists among its members, its box still there', () => {
    const e = maison('messages', [message('m1', 'Reviens.')]);
    ecrire(path.join(e.m, '.claude', 'teams', EQUIPE, 'config.json'), {
      name: EQUIPE,
      leadSessionId: SEANCE,
      members: [{ name: 'team-lead', agentId: `team-lead@${EQUIPE}` }],
    });
    expect(messagesNonLus(e.arret, { maison: e.m })).toContain('Reviens.');
  });

  it('finds the box of an agent named by its agent_type when its meta file is absent', () => {
    const e = maison('messages', []);
    expect(
      boiteDe({ ...e.arret, agent_id: 'ainconnu-1', transcript_path: undefined }, { maison: e.m })
    ).toEqual({
      equipe: EQUIPE,
      nom: 'messages',
      fichier: e.boite,
    });
  });
});

describe('the stop passes as it is without an unread message or a readable box', () => {
  it('passes when every message is read', () => {
    const e = maison('messages', [message('m1', 'Lu.', true)]);
    expect(messagesNonLus(e.arret, { maison: e.m })).toBeNull();
  });

  it('passes when the box is absent, unreadable or no array', () => {
    for (const boite of [null, '{ pas du json', '{"read":false}']) {
      const e = maison('messages', boite);
      expect(messagesNonLus(e.arret, { maison: e.m }), String(boite)).toBeNull();
    }
  });

  it('passes for a sub-agent of no team and for a name without a box in the team', () => {
    const e = maison('messages', [message('m1', 'Pour messages.')]);
    expect(
      messagesNonLus(
        { session_id: 'autre-seance', hook_event_name: 'SubagentStop', agent_type: 'Explore' },
        { maison: e.m }
      )
    ).toBeNull();
    expect(messagesNonLus({ ...e.inactif, teammate_name: 'Explore' }, { maison: e.m })).toBeNull();
  });

  it('passes when the teams cannot be read', () => {
    const vide = mkdtempSync(path.join(ESSAIS, 'vide-'));
    expect(
      messagesNonLus({ session_id: SEANCE, teammate_name: 'messages' }, { maison: vide })
    ).toBeNull();
  });
});

describe('a message blocks the stop once', () => {
  it('lets the second stop pass for the same message, and blocks again for a new one alone', () => {
    const e = maison('messages', [message('m1', 'Premier.')]);
    expect(messagesNonLus(e.arret, { maison: e.m })).toContain('Premier.');
    expect(messagesNonLus({ ...e.arret, stop_hook_active: true }, { maison: e.m })).toBeNull();
    expect(messagesNonLus(e.inactif, { maison: e.m })).toBeNull();
    ecrire(e.boite, [message('m1', 'Premier.'), message('m2', 'Second.')]);
    const raison = messagesNonLus({ ...e.arret, stop_hook_active: true }, { maison: e.m });
    expect(raison).toMatch(/^Ne t'arrête pas : un message non lu/);
    expect(raison).toContain('Second.');
    expect(raison).not.toContain('Premier.');
  });
});

describe('the hook never writes the box', () => {
  it('leaves the box byte for byte as Claude Code wrote it', () => {
    const e = maison('messages', [message('m1', 'Un.'), message('m2', 'Deux.', true)]);
    const avant = readFileSync(e.boite, 'utf8');
    messagesNonLus(e.arret, { maison: e.m });
    messagesNonLus(e.arret, { maison: e.m });
    expect(readFileSync(e.boite, 'utf8')).toBe(avant);
  });
});
