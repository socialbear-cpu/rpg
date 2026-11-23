import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesPopup } from '../src/features/messages/messages-popup';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

describe('messages popup', () => {
  it('places messages and group creation inside a labeled dialog, without a nested page', () => {
    const html = renderToStaticMarkup(createElement(MessagesPopup, { open: true, onClose: vi.fn() }));
    expect(html).toContain('<dialog');
    expect(html).toContain('messages-popup');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('>Mensagens</h2>');
    expect(html).toContain('aria-label="Fechar"');
    expect(html).toContain('Novo grupo');
    expect(html).not.toContain('<main');
    expect(html).not.toContain('class="app-header"');
  });
  it('retains the message panel while the native dialog is closed', () => {
    const html = renderToStaticMarkup(createElement(MessagesPopup, { open: false, onClose: vi.fn() }));
    expect(html).toContain('class="messages-panel"');
    expect(html).not.toMatch(/<dialog[^>]*\sopen(?:=|\s|>)/);
  });
});
