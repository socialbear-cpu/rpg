import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../src/features/characters/characters.css', import.meta.url), 'utf8');
const lobbyStyles = styles.split('/* Character lobby')[1] ?? '';

describe('character home responsive layout', () => {
  it('does not reserve grid areas for the removed placeholder rooms', () => {
    expect(lobbyStyles).not.toMatch(/grid-template-areas\s*:/);
    expect(lobbyStyles).not.toMatch(/grid-area\s*:/);
  });

  it('keeps the disabled matchmaking panel compact on desktop', () => {
    const desktopBlock = lobbyStyles.match(/\.lobby-matchmaking\s*\{([^}]*)\}/)?.[1] ?? '';
    const minHeight = desktopBlock.match(/min-height:\s*(\d+)px/)?.[1];
    expect(Number(minHeight)).toBeLessThanOrEqual(130);
  });

  it('keeps the single character-record action usable on small screens', () => {
    expect(lobbyStyles).toMatch(/\.lobby-character-record-action\s*\{[^}]*width:\s*100%/s);
  });
});
