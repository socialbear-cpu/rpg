import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const frontendManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: { dev: string; build: string };
};

describe('workspace scripts', () => {
  it('lets Vercel run the Next.js service without building the backend package into it', () => {
    expect(frontendManifest.scripts.dev).toBe('next dev');
    expect(frontendManifest.scripts.build).toBe('next build --webpack');
  });
});
