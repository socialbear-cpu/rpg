import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DailyLoginSystemView, TradeCharacter, TradeInventoryStack, TradeOffer } from '../src/api.js';
import { TradingCardView } from '../src/features/trading/trading-card.js';

const systemId = '33000000-0000-4000-8000-000000000001';
const ownerCharacterId = '53000000-0000-4000-8000-000000000001';
const partnerCharacterId = '53000000-0000-4000-8000-000000000002';
const otherOwnerCharacterId = '53000000-0000-4000-8000-000000000003';
const offerId = '73000000-0000-4000-8000-000000000001';
const itemId = '43000000-0000-4000-8000-000000000001';
const system: DailyLoginSystemView = {
  system: { id: systemId, name: 'Sistema A', is_active: true, daily_login_timezone: 'UTC', daily_login_rewards_enabled: false },
  is_owner: false, can_manage: false,
  characters: [{ id: ownerCharacterId, character_name: 'Aventureira', game_system_id: systemId }],
  today: null,
};
const characters: TradeCharacter[] = [
  { id: ownerCharacterId, character_name: 'Aventureira', owner_display_name: 'Jogadora A', is_mine: true },
  { id: partnerCharacterId, character_name: 'Guardião', owner_display_name: 'Jogador B', is_mine: false },
  { id: otherOwnerCharacterId, character_name: 'Curandeira', owner_display_name: 'Jogadora A', is_mine: true },
];
const senderStacks: TradeInventoryStack[] = [
  { stack_id: '63000000-0000-4000-8000-000000000001', item_id: itemId, item_name: 'Espada curta', quantity: 2, metadata: { encantamento: 'fogo' } },
  { stack_id: '63000000-0000-4000-8000-000000000002', item_id: itemId, item_name: 'Espada curta', quantity: 1, metadata: { encantamento: 'gelo' } },
];
const recipientStacks: TradeInventoryStack[] = [
  { stack_id: '63000000-0000-4000-8000-000000000003', item_id: '43000000-0000-4000-8000-000000000002', item_name: 'Poção', quantity: 3, metadata: {} },
];
const offer: TradeOffer = {
  id: offerId,
  game_system_id: systemId,
  status: 'pending',
  created_at: '2026-11-11T12:00:00Z',
  expires_at: '2026-11-25T12:00:00Z',
  responded_at: null,
  countered_from_offer_id: null,
  sender_character: { id: partnerCharacterId, character_name: 'Guardião', owner_display_name: 'Jogador B' },
  recipient_character: { id: ownerCharacterId, character_name: 'Aventureira', owner_display_name: 'Jogadora A' },
  sender_lines: [{ stack_id: recipientStacks[0]!.stack_id, item_id: recipientStacks[0]!.item_id, item_name: 'Poção', quantity: 1, metadata: {} }],
  recipient_lines: [],
};

function renderView(overrides: Partial<Parameters<typeof TradingCardView>[0]> = {}) {
  return renderToStaticMarkup(createElement(TradingCardView, {
    systems: [system], selectedSystemId: systemId, characters,
    senderCharacterId: ownerCharacterId, recipientCharacterId: partnerCharacterId,
    senderStacks, recipientStacks, senderSelection: {}, recipientSelection: {},
    offers: [], box: 'incoming', loading: false, submitting: false,
    message: null, messageIsError: false, counterOfferId: null,
    onSystemChange: vi.fn(), onSenderCharacterChange: vi.fn(), onRecipientCharacterChange: vi.fn(),
    onSenderQuantityChange: vi.fn(), onRecipientQuantityChange: vi.fn(), onSubmitComposer: vi.fn(),
    onBoxChange: vi.fn(), onRespond: vi.fn(), onStartCounter: vi.fn(), onCancelCounter: vi.fn(), onCancel: vi.fn(),
    ...overrides,
  }));
}

describe('trading card', () => {
  it('shows both trade sides and keeps different item characteristics in separate stacks', () => {
    const html = renderView();
    expect(html).toContain('Criar oferta de troca');
    expect(html).toContain('Você oferece');
    expect(html).toContain('Você pede em troca');
    expect(html).toContain('encantamento: fogo');
    expect(html).toContain('encantamento: gelo');
    expect(html).toContain('Espada curta');
    expect(html).toContain('Poção');
  });

  it('allows a gift with one empty side and disables submission when both sides are empty', () => {
    const gift = renderView({ senderSelection: { [senderStacks[0]!.stack_id]: 1 } });
    expect(gift).toContain('Enviar oferta');
    expect(gift).not.toMatch(/<button[^>]*disabled=""[^>]*>Enviar oferta/);
    const empty = renderView();
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>Enviar oferta/);
  });

  it('shows accept, decline, and counter actions on incoming offers', () => {
    const html = renderView({ offers: [offer], box: 'incoming' });
    expect(html).toContain('Jogador B');
    expect(html).toContain('Aceitar');
    expect(html).toContain('Recusar');
    expect(html).toContain('Contrapropor');
  });

  it('shows cancellation for sent offers and keeps history read-only', () => {
    const sent = renderView({ offers: [offer], box: 'sent' });
    expect(sent).toContain('Cancelar oferta');
    const history = renderView({ offers: [{ ...offer, status: 'accepted' }], box: 'history' });
    expect(history).toContain('Aceita');
    expect(history).not.toContain('Aceitar');
    expect(history).not.toContain('Cancelar oferta');
  });

  it('explains when an item changed and the offer became invalid', () => {
    const html = renderView({ offers: [{ ...offer, status: 'invalidated' }], box: 'history' });
    expect(html).toContain('Oferta indisponível');
    expect(html).toContain('Um ou mais itens mudaram');
  });
});
