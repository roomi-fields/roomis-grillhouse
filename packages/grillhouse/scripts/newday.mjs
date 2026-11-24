// `grillhouse newday`: sets the day's marker of the project to now (scripts/tableau.mjs,
// `poserLeRepere`). FAITS AUJOURD'HUI and the board's « rejetés » and « validés » cases then count
// only since it, while « new » and « →check » stay. The mod's command /grillhouse:newday runs it
// (greffon.md, §4.1, the day's marker).
import { pathToFileURL } from 'node:url';
import { poserLeRepere } from './tableau.mjs';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    poserLeRepere(process.cwd());
    process.stdout.write(
      'Repère de journée posé à maintenant : FAITS AUJOURD’HUI et les cases « rejetés » et « validés » repartent de zéro.\n'
    );
  } catch (e) {
    process.stderr.write(`⛔ ${/** @type {Error} */ (e).message}\n`);
    process.exitCode = 1;
  }
}
