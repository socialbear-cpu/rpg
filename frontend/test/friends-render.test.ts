import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FriendsPage } from '../src/features/social/friends-page.js';
import { InviteFriendControl } from '../src/features/social/invite-friend-control.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

describe('friends social screens', () => {
  it('renders username search, friend queues, and invitation sections without email', () => {
    const html = renderToStaticMarkup(createElement(FriendsPage));
    expect(html).toContain('Buscar pelo nick');
    expect(html).toContain('Meus amigos');
    expect(html).toContain('Pedidos de amizade');
    expect(html).toContain('Aprovações como dono');
    expect(html).toContain('Convites para você');
    expect(html).not.toContain('email');
    expect(html).not.toContain('e-mail');
  });

  it('offers a contextual invite action for an RPG destination', () => {
    const html = renderToStaticMarkup(createElement(InviteFriendControl, { systemId: '82000000-0000-4000-8000-000000000001' }));
    expect(html).toContain('Convidar amigo');
  });
});
