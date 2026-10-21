// grillhouse-3uv.89, L2: a role that writes edits a file of the repository by its tools of writing
// (Write, Edit), which its lock judges, never by a redirection of the shell. Witness: BPScript
// 320.3, 36 edits by the shell for the developpeur and 25 for the testwriter, against 2 Write and 1
// Edit, a substitution that does not find its text passing in silence. A rule of Claude Code does
// not see a redirection (`Bash(* > *)` refuses nothing: Claude Code matches the command without
// it), and a session in its envelope runs without the check of writes: the lock of the commands
// (scripts/verrous/commande.mjs), a hook on Bash, reads them.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { refusDeCommande } from '../../scripts/verrous/commande.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/verrous/commande.mjs');
const COPIE = '/depot/.claude/worktrees/demo-1';
const TMP = '/travail/demo-1';
const bash = (command: string, cwd = COPIE) => ({
  tool_name: 'Bash',
  tool_input: { command },
  cwd,
});
const refus = (command: string, cwd?: string) => refusDeCommande(bash(command, cwd), { tmp: TMP });

describe('L2 — the lock of the commands of a role that writes', () => {
  it.each([
    "cat > packages/a/src/a.ts <<'EOF'\nexport const a = 1;\nEOF",
    'echo x > packages/a/src/a.ts',
    'echo x >packages/a/src/a.ts',
    'printf x >> README.md',
    'echo x 1> a.ts',
    'echo x &> a.log',
    'echo x >| a.ts',
    'echo x | tee packages/a/src/a.ts',
    'echo x | tee -a packages/a/src/a.ts > /dev/null',
    `echo x > ${COPIE}/a.ts`,
    'npm test -- a && echo fin > fin.txt',
    'echo x > "$HOME/a.ts"',
  ])('refuses a write to a file of the repository by the shell: %s', c => {
    expect(refus(c)).toMatch(/Write|Edit/);
  });

  it.each([
    'npm test -- packages/a 2>&1 | tail -40',
    'npm test -- packages/a > /dev/null 2>&1',
    'ls 2>/dev/null',
    `echo x > ${TMP}/passation.md`,
    'echo x > "$TMPDIR/passation.md"',
    'echo x > ${TMPDIR}/a.txt',
    `cat <<'EOF' > ${TMP}/p.md\nun texte > avec un chevron\nEOF`,
    'grep -n "a > b" packages/a/src/a.ts',
    "echo 'x >> y'",
    'test 1 -gt 0',
    'node -e "process.exit(1 > 0 ? 0 : 1)"',
    `echo x | tee ${TMP}/sortie.txt`,
    'git -C . diff >&2',
  ])('lets through what writes no file of the repository: %s', c => {
    expect(refus(c)).toBeNull();
  });

  it('judges a relative path from the working directory of the command', () => {
    expect(refus('echo x > sous/notes.md', TMP)).toBeNull();
    expect(refus('echo x > ../demo-1-notes.md', TMP)).not.toBeNull();
    expect(refus('echo x > notes.md', TMP)).toBeNull();
    expect(refus('echo x > notes.md', COPIE)).not.toBeNull();
  });

  it('runs as a hook: its refusal on the standard error, exit 2; any other tool or command, exit 0', () => {
    const r = (input: object) =>
      spawnSync('node', [SCRIPT], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        env: { ...process.env, TMPDIR: TMP },
      });
    const non = r(bash('echo x > packages/a/src/a.ts'));
    expect(non.status).toBe(2);
    expect(non.stderr).toMatch(/Write|Edit/);
    expect(r(bash('npm test -- packages/a 2>&1')).status).toBe(0);
    expect(r({ tool_name: 'Read', tool_input: { file_path: 'a' }, cwd: COPIE }).status).toBe(0);
    // A hook never stops the session on an input it cannot read.
    expect(spawnSync('node', [SCRIPT], { input: 'pas du json', encoding: 'utf8' }).status).toBe(0);
  });
});
