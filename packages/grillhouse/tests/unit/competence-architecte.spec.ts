// @lit mods/grillhouse/charte.md mods/grillhouse/skills/architecte/** mods/grillhouse/skills/pitmaster/SKILL.md
// The plugin carries the skill of the architect with its example of an architecture document, the
// charter carries the two rules that send a tension to it, and the supervisor's skill names it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DEPOT = path.resolve(__dirname, '../../../..');
const COMPETENCE = 'mods/grillhouse/skills/architecte';
const EXEMPLE = 'references/exemple-d-architecture.md';
// A text on one line, as a reader meets it whatever its wrapping.
const lire = (rel: string) => readFileSync(path.join(DEPOT, rel), 'utf8').replace(/\s+/g, ' ');

const TENSION =
  "**Une tension avec l'architecture monte, elle ne se résout pas dans le ticket** : le créateur " +
  "du ticket, ou l'explorateur au plan, qui ne trouve aucun paragraphe, ou en trouve un que le " +
  "travail contredit, s'arrête et monte au superviseur. Le superviseur charge la compétence " +
  "`architecte`, instruit la décision (l'existant, les options, leurs compromis) et la porte au " +
  "responsable, qui tranche. Ainsi aucun ticket ne décide de l'architecture.";
const DOCUMENT_PRESCRIPTIF =
  '**Un document prescriptif change sur décision seule** : après la décision du responsable, un ' +
  'agent architecte met le document en conformité, et le responsable relit son lot ; le relecteur ' +
  'rend tout autre lot qui modifie un document prescriptif. Ainsi le document reste la décision, ' +
  'et non la trace du code.';

describe('the skill of the architect', () => {
  it('names its example of an architecture document among its own files', () => {
    expect(existsSync(path.join(DEPOT, COMPETENCE, EXEMPLE))).toBe(true);
    const competence = lire(`${COMPETENCE}/SKILL.md`);
    expect(competence).toContain(`Un exemple abouti : \`${EXEMPLE}\``);
    // The example is read in the plugin: the skill names no file of another repository.
    expect(competence).not.toContain("`docs/ARCHITECTURE.md` d'osc-bridge");
  });

  it('its example says in its first line where it comes from and that it is an example', () => {
    const [enTete] = readFileSync(path.join(DEPOT, COMPETENCE, EXEMPLE), 'utf8').split('\n');
    expect(enTete).toMatch(/exemple/i);
    expect(enTete).toContain('osc-bridge');
  });

  it('the charter carries the two rules that send a tension to it, after « Tous les agents jugent sur le plan »', () => {
    const charte = lire('mods/grillhouse/charte.md');
    const plan = charte.indexOf('**Tous les agents jugent sur le plan**');
    const tension = charte.indexOf(TENSION);
    const prescriptif = charte.indexOf(DOCUMENT_PRESCRIPTIF);
    expect(plan).toBeGreaterThan(-1);
    expect(tension).toBeGreaterThan(plan);
    expect(prescriptif).toBeGreaterThan(tension);
    expect(charte.indexOf('**Un fait repris se relit à sa pièce**')).toBeGreaterThan(prescriptif);
  });

  it('the supervisor’s skill names it under its name in the plugin', () => {
    expect(lire('mods/grillhouse/skills/pitmaster/SKILL.md')).toContain('grillhouse:architecte');
  });
});
