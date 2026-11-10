// `grillhouse newday`: sets the day's marker of the project to now (scripts/tableau.mjs,
// `poserLeRepere`). FAITS AUJOURD'HUI and the board's « rejetés » and « validés » cases then count
// only since it, while « new » and « →check » stay (grillhouse-3uv.96). The mod's command
// /grillhouse:newday runs it.
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
