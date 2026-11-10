import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const frontendManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: { dev: string; build: string };
};

describe('workspace scripts', () => {
  it('builds the shared backend package before starting Next.js in development', () => {
    expect(frontendManifest.scripts.dev).toBe('npm run build --workspace @rpg/backend --prefix .. && next dev');
  });
});
