// The standard input of a role session of the circuit, as claude reads it under
// `--input-format stream-json`: the `initialize` request, whose `skills` bound the skills the
// session lists and may load, then the whole instruction as one message of the user.

/** What the standard input of a session carries. */
export interface EntreeLue {
  competences: string[];
  consigne: string;
}

interface Message {
  type?: string;
  request_id?: unknown;
  request?: { subtype?: string; skills?: unknown };
  message?: { role?: string; content?: unknown };
}

const texteDe = (contenu: unknown): string | null => {
  if (typeof contenu === 'string') {
    return contenu;
  }
  const blocs = Array.isArray(contenu) ? (contenu as { type?: string; text?: unknown }[]) : [];
  return blocs.length && blocs.every(b => b.type === 'text' && typeof b.text === 'string')
    ? blocs.map(b => b.text as string).join('')
    : null;
};

/**
 * The skills and the instruction of the input `brut`: null unless it is exactly those two messages,
 * one per line, each line ended.
 */
export function lireLEntree(brut: string): EntreeLue | null {
  if (!brut.endsWith('\n')) {
    return null;
  }
  let messages: Message[];
  try {
    messages = brut
      .slice(0, -1)
      .split('\n')
      .map(l => JSON.parse(l) as Message);
  } catch {
    return null;
  }
  const [ouverture, demande] = messages;
  const competences = ouverture?.request?.skills;
  const consigne = texteDe(demande?.message?.content);
  if (
    messages.length !== 2 ||
    ouverture.type !== 'control_request' ||
    typeof ouverture.request_id !== 'string' ||
    ouverture.request?.subtype !== 'initialize' ||
    !Array.isArray(competences) ||
    demande.type !== 'user' ||
    demande.message?.role !== 'user' ||
    consigne === null
  ) {
    return null;
  }
  return { competences: competences as string[], consigne };
}
