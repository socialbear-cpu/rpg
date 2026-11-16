import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UsernameSetup } from '../src/features/profile/username-setup.js';

describe('first-access username setup', () => {
  it('asks for a unique, permanent nick and displays the @ prefix', () => {
    const html = renderToStaticMarkup(createElement(UsernameSetup, { onSubmit: vi.fn() }));

    expect(html).toContain('PRIMEIRO ACESSO');
    expect(html).toContain('id="username-setup-input"');
    expect(html).toContain('aria-hidden="true">@</span>');
    expect(html).toContain('Depois de escolher, você poderá trocar seu @ uma única vez.');
    expect(html).toContain('disabled="">Continuar</button>');
  });
});
