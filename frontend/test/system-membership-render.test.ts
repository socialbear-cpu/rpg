import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SystemMembershipCard, SystemMembershipError } from '../src/features/system-membership/system-membership-card.js';
import type { SystemMemberships } from '../src/api.js';

const memberships: SystemMemberships = {
  is_platform_admin: false,
  memberships: [
    { game_system_id: '36000000-0000-4000-8000-000000000001', game_system_name: 'Sistema A', role: 'owner' },
    { game_system_id: '36000000-0000-4000-8000-000000000002', game_system_name: 'Sistema B', role: 'mod' },
    { game_system_id: '36000000-0000-4000-8000-000000000003', game_system_name: 'Sistema C', role: 'user' },
  ],
};

describe('system membership card', () => {
  it('shows system roles and gives Owners controls to assign Mods', () => {
    const html = renderToStaticMarkup(createElement(SystemMembershipCard, {
      access: memberships,
      busy: false,
      message: null,
      messageIsError: false,
      onAssign: vi.fn(),
    }));
    expect(html).toContain('Sistema A');
    expect(html).toContain('Owner');
    expect(html).toContain('Sistema B');
    expect(html).toContain('Mod');
    expect(html).toContain('Sistema C');
    expect(html).toContain('User');
    expect(html).toContain('UUID do usuário');
    expect(html).toContain('Tornar moderador');
  });

  it('shows global Admin access and does not offer system changes to a basic User', () => {
    const html = renderToStaticMarkup(createElement(SystemMembershipCard, {
      access: { is_platform_admin: true, memberships: [{ ...memberships.memberships[2]! }] },
      busy: false,
      message: null,
      messageIsError: false,
      onAssign: vi.fn(),
    }));
    expect(html).toContain('Admin global');
    expect(html).not.toContain('UUID do usuário');
  });

  it('shows membership loading failures and offers a retry', () => {
    const html = renderToStaticMarkup(createElement(SystemMembershipError, {
      message: 'Falha ao carregar cargos.',
      onRetry: vi.fn(),
    }));
    expect(html).toContain('Falha ao carregar cargos.');
    expect(html).toContain('Tentar novamente');
    expect(html).toContain('role="alert"');
  });
});
