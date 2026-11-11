// The journal of the ticket (`<copie>.log`, next to the copy) is a piece of a sheet.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lireFiche } from '../../scripts/resultats.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'resultats-journal-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const sortie = (structured: unknown) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: 'abc',
    result: 'fini',
    structured_output: structured,
  });
const besoin = (piece: string) => ({ statut: 'BESOIN', question: 'Que rend x ?', piece });

// A copy `<ESSAIS>/<nom>` and its journal `<ESSAIS>/<nom>.log`, five lines long.
function monter(nom: string, dansLaCopie?: string) {
  const copie = path.join(ESSAIS, nom);
  mkdirSync(path.join(copie, 'src'), { recursive: true });
  writeFileSync(path.join(copie, 'src/x.ts'), 'un\ndeux\n');
  if (dansLaCopie !== undefined) {
    writeFileSync(path.join(copie, `${nom}.log`), dansLaCopie);
  }
  writeFileSync(`${copie}.log`, 'a\nb\nc\nd\ne\n');
  writeFileSync(path.join(ESSAIS, 'autre-ticket.log'), 'a\nb\nc\nd\ne\n');
  const lu = (piece: string) => lireFiche('developpeur', sortie(besoin(piece)), { copie });
  return { copie, lu };
}

describe('the journal of the ticket as a piece', () => {
  it('a line of the journal is found by its absolute path as the circuit gives it', () => {
    const { copie, lu } = monter('grillhouse-aaa');
    expect(lu(`${copie}.log:3`).erreur).toBeUndefined();
    expect(lu(`${copie}.log:2-5 le rouge.`).erreur).toBeUndefined();
    expect(lu(`\`${copie}.log:5\`.`).erreur).toBeUndefined();
  });

  it('a line of the journal is found by the name of the copy and .log', () => {
    const { lu } = monter('grillhouse-bbb');
    expect(lu('grillhouse-bbb.log:1').erreur).toBeUndefined();
    expect(lu('grillhouse-bbb.log:5').erreur).toBeUndefined();
  });

  it('a line past the end of the journal stays refused, named', () => {
    const { copie, lu } = monter('grillhouse-ccc');
    expect(lu('grillhouse-ccc.log:6').erreur).toMatch(
      /piece : grillhouse-ccc\.log:6 introuvable dans la copie/
    );
    expect(lu(`${copie}.log:3-9`).erreur).toMatch(/introuvable dans la copie/);
  });

  it('a piece out of the copy that is not the journal of this ticket stays refused, named', () => {
    const { copie, lu } = monter('grillhouse-ddd');
    expect(lu('autre-ticket.log:1').erreur).toMatch(
      /piece : autre-ticket\.log:1 introuvable dans la copie/
    );
    expect(lu(`${path.join(ESSAIS, 'autre-ticket.log')}:1`).erreur).toMatch(
      /introuvable dans la copie/
    );
    expect(lu('../autre-ticket.log:1').erreur).toMatch(/introuvable dans la copie/);
    expect(lu('../grillhouse-ddd.log:1').erreur).toMatch(/introuvable dans la copie/);
    expect(lu(`${copie}/../autre-ticket.log:1`).erreur).toMatch(/introuvable dans la copie/);
    expect(lu('/etc/hostname:1').erreur).toMatch(/introuvable dans la copie/);
  });

  it('a file of the copy named like the journal is judged as that file, not as the journal', () => {
    const { lu } = monter('grillhouse-eee', 'seule\nligne\n');
    expect(lu('grillhouse-eee.log:2').erreur).toBeUndefined();
    // The journal has five lines, the file of the copy two.
    expect(lu('grillhouse-eee.log:4').erreur).toMatch(
      /introuvable dans la copie : le fichier a 2 lignes/
    );
  });

  it('the content of the line is not checked', () => {
    const { lu } = monter('grillhouse-fff');
    expect(lu('grillhouse-fff.log:1 dit tout autre chose que « a ».').erreur).toBeUndefined();
  });
});
