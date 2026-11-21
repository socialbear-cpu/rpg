import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FriendsPage } from '../src/features/social/friends-page.js';
import { InviteFriendControl } from '../src/features/social/invite-friend-control.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

describe('friends social screens', () => {
  it('renders player discovery and accessible social sections without exposing email', () => {
    const html = renderToStaticMarkup(createElement(FriendsPage));
    expect(html).toContain('Buscar pelo nick');
    expect(html).toContain('Meus amigos');
    expect(html).toContain('Pedidos de amizade');
    expect(html).toContain('aria-label="Encontrar jogadores"');
    expect(html).toContain('Convites e aprovações');
    expect(html).toContain('aria-controls="friends-panel-friends"');
    expect(html).toContain('aria-labelledby="friends-tab-requests" hidden=""');
    expect(html).toContain('Carregando seus amigos');
    expect(html).toContain('Contagem indisponível');
    expect(html).not.toContain('Sua lista começa aqui');
    expect(html).not.toContain('email');
    expect(html).not.toContain('e-mail');
  });

  it('offers a contextual invite action for an RPG destination', () => {
    const html = renderToStaticMarkup(createElement(InviteFriendControl, { systemId: '82000000-0000-4000-8000-000000000001' }));
    expect(html).toContain('Convidar amigo');
  });
});
