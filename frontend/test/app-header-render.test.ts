import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AppHeader } from '../src/features/shell/app-header.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

it('uses the new login identity as the default global brand', () => {
  const html = renderToStaticMarkup(createElement(AppHeader));
  expect(html).toContain('ᛒᛁᚠᚱᛟᛊᛏ');
  expect(html).toContain('aria-label="Bifrost RPG início"');
  expect(html).not.toContain('>BIFROST <em>');
  expect(html).toContain('aria-label="Notificações"');
});

it('keeps back links and contextual page actions together without removing account actions', () => {
  const html = renderToStaticMarkup(createElement(AppHeader, {
    activeItem: 'Amigos', backHref: '/dashboard', backLabel: 'Voltar aos sistemas',
    children: createElement('button', { type: 'button' }, 'Convidar amigo'),
  }));
  expect(html).toContain('class="app-header-context"');
  expect(html).toContain('href="/dashboard">← Voltar aos sistemas');
  expect(html).toContain('Convidar amigo');
  expect(html).toContain('href="/account-settings"');
  expect(html).toContain('Sair da conta');
  expect(html.match(/aria-current="page"/g)).toHaveLength(2);
});

it('puts character actions and sheet data in a dedicated menu, separate from the account', () => {
  const html = renderToStaticMarkup(createElement(AppHeader, {
    onOpenCharacterSheet: vi.fn(),
    onSwitchCharacter: vi.fn(),
    characterSheet: {
      systemName: 'Aether',
      character: { id: 'char-1', game_system_id: 'sys-1', character_name: 'Lyra', attributes: { origin: 'Guardião da ponte' }, status: 'active' },
      fields: [{ key: 'origin', label: 'Origem', type: 'short_text', position: 0, required: false, show_on_card: true }],
      experience: { character_id: 'char-1', game_system_id: 'sys-1', total_xp: 150, level: 2, xp_in_level: 50, xp_to_next_level: 50, history: [] },
    },
  }));
  expect(html).toContain('Lyra');
  expect(html).toContain('Guardião da ponte');
  expect(html).toContain('150 XP');
  expect(html).toContain('aria-valuenow="50"');
  expect(html).toContain('class="app-header-character-menu"');
  expect(html).toContain('Abrir ficha completa');
  expect(html).toContain('Trocar personagem');
  const accountMenu = html.match(/class="app-header-profile-popover"[\s\S]*?<\/details>/)?.[0] ?? '';
  expect(accountMenu).not.toContain('Lyra');
  expect(accountMenu).not.toContain('SUA FICHA');
});

it('groups social routes, keeps play direct, and leaves system creation on the dashboard', () => {
  const html = renderToStaticMarkup(createElement(AppHeader));
  expect(html).toContain('>Jogar</a>');
  expect(html).toContain('class="app-header-social"');
  expect(html).toContain('href="/friends"');
  expect(html).toContain('href="/trading"');
  expect(html).not.toContain('href="/dashboard/systems/new"');
  expect(html).not.toContain('class="app-header-character-menu"');
  expect(html).not.toContain('Selecione um personagem para ver a ficha completa aqui.');
});
