import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CampaignChatPanel } from '../src/features/campaign-chat/campaign-chat';

const rooms = [{
  id: '71000000-0000-4000-8000-000000000001',
  campaign_id: '61000000-0000-4000-8000-000000000001',
  campaign_name: 'A Floresta', name: 'Taverna', created_at: '2026-11-14T12:00:00.000Z',
}];
const messages = [{
  id: '81000000-0000-4000-8000-000000000001', room_id: rooms[0]!.id, campaign_id: rooms[0]!.campaign_id,
  character_id: '51000000-0000-4000-8000-000000000002', content: 'A missão começa!', created_at: '2026-11-14T12:00:00.000Z',
}];
const campaigns = [{ id: rooms[0]!.campaign_id, game_system_id: '31000000-0000-4000-8000-000000000001', name: 'A Floresta', can_create_room: false }];

describe('campaign chat panel', () => {
  it('shows campaign rooms and messages with a composer for the selected character', () => {
    const html = renderToStaticMarkup(createElement(CampaignChatPanel, {
      rooms, campaigns, selectedRoomId: rooms[0]!.id, messages, characterId: '51000000-0000-4000-8000-000000000001',
      content: '', newRoomName: '', newRoomCampaignId: '', loadingRooms: false, loadingMessages: false, loadingCampaigns: false, sending: false, creatingRoom: false, error: null,
      onSelectRoom: vi.fn(), onContentChange: vi.fn(), onSubmit: vi.fn(), onNewRoomNameChange: vi.fn(), onNewRoomCampaignChange: vi.fn(), onCreateRoom: vi.fn(),
    }));
    expect(html).toContain('A Floresta');
    expect(html).toContain('Taverna');
    expect(html).toContain('A missão começa!');
    expect(html).toContain('for="campaign-chat-message">Mensagem para Taverna</label>');
    expect(html).toContain('Enviar mensagem');
  });

  it('offers room creation for permitted campaigns even when they have no rooms yet', () => {
    const html = renderToStaticMarkup(createElement(CampaignChatPanel, {
      rooms: [], campaigns: [{ ...campaigns[0]!, can_create_room: true }], selectedRoomId: null, messages: [], characterId: '51000000-0000-4000-8000-000000000001',
      content: '', newRoomName: '', newRoomCampaignId: campaigns[0]!.id, loadingRooms: false, loadingMessages: false, loadingCampaigns: false, sending: false, creatingRoom: false, error: null,
      onSelectRoom: vi.fn(), onContentChange: vi.fn(), onSubmit: vi.fn(), onNewRoomNameChange: vi.fn(), onNewRoomCampaignChange: vi.fn(), onCreateRoom: vi.fn(),
    }));
    expect(html).toContain('A Floresta');
    expect(html).toContain('Criar sala');
    expect(html).toContain('Novo nome da sala');
  });

  it('does not show room creation controls for campaigns the caller cannot manage', () => {
    const html = renderToStaticMarkup(createElement(CampaignChatPanel, {
      rooms: [], campaigns: [{ ...campaigns[0]!, can_create_room: false }], selectedRoomId: null, messages: [],
      characterId: '51000000-0000-4000-8000-000000000001', content: '', newRoomName: '', newRoomCampaignId: '', loadingRooms: false,
      loadingMessages: false, loadingCampaigns: false, sending: false, creatingRoom: false, error: null,
      onSelectRoom: vi.fn(), onContentChange: vi.fn(), onSubmit: vi.fn(), onNewRoomNameChange: vi.fn(), onNewRoomCampaignChange: vi.fn(), onCreateRoom: vi.fn(),
    }));
    expect(html).not.toContain('Criar sala');
  });
});
