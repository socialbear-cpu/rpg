import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DailyLoginSystemView, ExperienceSettings } from '../src/api.js';
import { ExperienceAdminCard } from '../src/features/experience/experience-admin-card.js';
import { addCustomExperienceSource, experienceSettingsAreValid } from '../src/features/experience/experience-model.js';
import { formatDailyLoginClaimSuccess } from '../src/features/daily-login/daily-login-messages.js';

const systemId = '30000000-0000-4000-8000-000000000001';
const system: DailyLoginSystemView = {
  system: { id: systemId, name: 'Sistema A', is_active: true, daily_login_timezone: 'UTC', daily_login_rewards_enabled: true },
  is_owner: true, can_manage: true, characters: [], today: null,
};
const settings: ExperienceSettings = {
  game_system_id: systemId,
  xp_per_level: 100,
  sources: [
    { id: 'a1000000-0000-4000-8000-000000000001', name: 'Login diário', source_type: 'daily_login', award_amount: 25, is_enabled: true },
    { id: 'a1000000-0000-4000-8000-000000000002', name: 'Missão', source_type: 'mission', award_amount: 0, is_enabled: false },
    { id: 'a1000000-0000-4000-8000-000000000003', name: 'Luta', source_type: 'fight', award_amount: 0, is_enabled: false },
    { id: 'a1000000-0000-4000-8000-000000000004', name: 'Treino', source_type: 'custom', award_amount: 10, is_enabled: true },
  ],
};

describe('experience settings model', () => {
  it('creates uniquely named custom sources that start disabled', () => {
    const sources = settings.sources.map(({ id: _id, ...source }) => source);
    const added = addCustomExperienceSource(sources);
    expect(added.at(-1)).toEqual({ name: 'Fonte personalizada', source_type: 'custom', award_amount: 0, is_enabled: false });
    expect(addCustomExperienceSource(added).at(-1)?.name).toBe('Fonte personalizada 2');
  });

  it('accepts the default built-in rules and rejects invalid thresholds or enabled zero-XP sources', () => {
    const input = { xp_per_level: settings.xp_per_level, sources: settings.sources.map(({ id: _id, ...source }) => source) };
    expect(experienceSettingsAreValid(input)).toBe(true);
    expect(experienceSettingsAreValid({ ...input, xp_per_level: 0 })).toBe(false);
    expect(experienceSettingsAreValid({
      ...input,
      sources: input.sources.map((source) => source.source_type === 'custom' ? { ...source, award_amount: 0 } : source),
    })).toBe(false);
  });

  it('rejects duplicate custom names regardless of case', () => {
    const input = { xp_per_level: 100, sources: settings.sources.map(({ id: _id, ...source }) => source) };
    const duplicate = [...input.sources, { name: 'treino', source_type: 'custom' as const, award_amount: 5, is_enabled: true }];
    expect(experienceSettingsAreValid({ ...input, sources: duplicate })).toBe(false);
  });
});

describe('experience owner card', () => {
  it('renders level threshold, source rules, custom-source action, and save controls', () => {
    const html = renderToStaticMarkup(createElement(ExperienceAdminCard, {
      systems: [system], selectedSystemId: systemId, settings, loading: false, saving: false,
      message: null, messageIsError: false, onSystemChange: vi.fn(), onXpPerLevelChange: vi.fn(),
      onSourceChange: vi.fn(), onAddCustomSource: vi.fn(), onRemoveCustomSource: vi.fn(), onSave: vi.fn(),
    }));
    expect(html).toContain('Configurar experiência e XP');
    expect(html).toContain('XP necessário por nível');
    expect(html).toContain('Login diário');
    expect(html).toContain('Missão');
    expect(html).toContain('Luta');
    expect(html).toContain('Treino');
    expect(html).toContain('Adicionar fonte personalizada');
    expect(html).toContain('Salvar configuração de XP');
  });
});

describe('daily login success message', () => {
  it('shows the XP amount when the owner enabled login XP', () => {
    expect(formatDailyLoginClaimSuccess({ quantity: 3, item_name: 'Poção', xp_awarded: 25 }))
      .toBe('3 unidades de Poção foram entregues ao personagem. +25 XP.');
  });

  it('keeps the claim message clear when no daily XP was awarded', () => {
    expect(formatDailyLoginClaimSuccess({ quantity: 1, item_name: 'Poção', xp_awarded: 0 }))
      .toBe('1 unidade de Poção foi entregue ao personagem.');
  });
});
