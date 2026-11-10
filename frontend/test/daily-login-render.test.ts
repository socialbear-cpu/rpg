import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DailyLoginAdminCard } from '../src/features/daily-login/daily-login-admin-card.js';
import { DailyLoginCard } from '../src/features/daily-login/daily-login-card.js';
import type { DailyLoginOwnerCalendar, DailyLoginSystemView } from '../src/api.js';

const systemId = '30000000-0000-4000-8000-000000000001';
const characterId = '50000000-0000-4000-8000-000000000001';
const itemId = '40000000-0000-4000-8000-000000000001';

const systemView: DailyLoginSystemView = {
  system: {
    id: systemId,
    name: 'Sistema A',
    is_active: true,
    daily_login_timezone: 'America/Sao_Paulo',
    daily_login_rewards_enabled: true,
  },
  is_owner: true,
  can_manage: true,
  characters: [{ id: characterId, character_name: 'Aventureira', game_system_id: systemId }],
  today: {
    status: 'available',
    weekday: 2,
    local_date: '2026-11-10',
    timezone: 'America/Sao_Paulo',
    reward: { weekday: 2, item_id: itemId, item_name: 'Poção', quantity: 3 },
    claim: null,
  },
};

const ownerCalendar: DailyLoginOwnerCalendar = {
  system: systemView.system,
  is_active: true,
  items: [{ id: itemId, name: 'Poção' }],
  rewards: Array.from({ length: 7 }, (_, index) => ({
    weekday: index + 1, item_id: itemId, item_name: 'Poção', quantity: index + 1,
  })),
};

describe('daily login player card', () => {
  it('shows today’s system reward, eligible character, and claim action', () => {
    const html = renderToStaticMarkup(createElement(DailyLoginCard, {
      systems: [systemView],
      loading: false,
      claimingSystemId: null,
      message: null,
      messageIsError: false,
      onClaim: vi.fn(),
    }));
    expect(html).toContain('Recompensa de hoje');
    expect(html).toContain('Poção');
    expect(html).toContain('3 unidades');
    expect(html).toContain('Aventureira');
    expect(html).toContain('Resgatar recompensa');
  });

  it('explains when the account has no eligible system character', () => {
    const html = renderToStaticMarkup(createElement(DailyLoginCard, {
      systems: [], loading: false, claimingSystemId: null, message: null,
      messageIsError: false, onClaim: vi.fn(),
    }));
    expect(html).toContain('Nenhum sistema com personagem ativo disponível para resgate.');
  });
});

describe('daily login owner card', () => {
  it('renders all seven weekdays and the existing item catalog for the owner', () => {
    const html = renderToStaticMarkup(createElement(DailyLoginAdminCard, {
      systems: [systemView],
      selectedSystemId: systemId,
      calendar: ownerCalendar,
      loading: false,
      saving: false,
      message: null,
      messageIsError: false,
      onSystemChange: vi.fn(),
      onRewardChange: vi.fn(),
      onActiveChange: vi.fn(),
      onSave: vi.fn(),
    }));
    expect(html).toContain('Gerenciar recompensas diárias');
    expect(html).toContain('Segunda-feira');
    expect(html).toContain('Domingo');
    expect(html).toContain('Poção');
    expect(html).toContain('Salvar calendário');
  });
});
