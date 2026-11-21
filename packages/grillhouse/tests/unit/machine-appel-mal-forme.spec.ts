import { describe, expect, it, vi } from 'vitest';
import { jouer } from '../../scripts/machine.mjs';

// A malformed call is refused before the server is read: exit code 2, nothing said on the output.
describe('the machine command refuses a malformed call', () => {
  const appels: [string, string | undefined, string[]][] = [
    ['without a mode', undefined, []],
    ['an unknown mode', 'vider', []],
    ['an argument other than --attendre', 'fermer', ['--vite']],
    ['--attendre on the reopening', 'rouvrir', ['--attendre']],
  ];
  for (const [titre, mode, args] of appels) {
    it(`exits with 2 on ${titre}, without reading the machine`, async () => {
      const dire = vi.fn();
      const ecrire = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const code = await jouer(mode, args, { env: {}, dire });
        expect(code).toBe(2);
        expect(dire).not.toHaveBeenCalled();
        expect(String(ecrire.mock.calls[0]?.[0])).toContain('usage');
      } finally {
        ecrire.mockRestore();
      }
    });
  }
});
