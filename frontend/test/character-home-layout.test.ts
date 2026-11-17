import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../src/features/characters/characters.css', import.meta.url), 'utf8');
const lobbyStyles = styles.split('/* Compact, configurable member lobby dashboard. */')[1] ?? '';

describe('character home responsive layout', () => {
  it('places rooms with the next session, then recent conversations with the market', () => {
    const defaultLayout = lobbyStyles.match(/\.lobby-rooms-default\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(defaultLayout).toMatch(/grid-template-areas:\s*'chat chat chat chat chat chat chat chat events events events events'\s*'recent recent recent recent recent recent store store store store store store'/);
    expect(lobbyStyles).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.lobby-rooms-default\s*\{[^}]*grid-template-areas:\s*none/);
  });

  it('stacks the three live summary cards on narrow screens', () => {
    expect(lobbyStyles).toMatch(/\.lobby-stats\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    expect(lobbyStyles).toMatch(/@media\s*\(max-width:\s*650px\)[\s\S]*?\.lobby-stats\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
});
