import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { countActiveLobbyChats, findNextLobbySession, formatLobbySession, LobbyStatsDisplay, startLobbySessionClock } from '../src/features/characters/lobby-stats.js';
import { startSystemLobbyPresenceHeartbeat } from '../src/features/characters/lobby-presence.js';
import type { Chat, SystemEvent } from '../src/api.js';
import { vi } from 'vitest';

const roomAccess = { max_players: null, player_count: 0, permissions: { view: true, enter: true, write: true }, is_member: false, has_player_seat: false, can_manage: false };
const chats: Chat[] = [
  { ...roomAccess, id: '1', game_system_id: 'system', name: 'Mesa', description: null, status: 'active', created_at: '2026-01-01T00:00:00Z' },
  { ...roomAccess, id: '2', game_system_id: 'system', name: 'Arquivo', description: null, status: 'archived', created_at: '2026-01-01T00:00:00Z' },
  { ...roomAccess, id: '3', game_system_id: 'system', name: 'Outra sala', description: null, status: 'active', created_at: '2026-01-01T00:00:00Z' },
];

const event = (id: string, starts_at: string, started_at: string | null = null): SystemEvent => ({
  id, game_system_id: 'system', title: id, description: null, starts_at, ends_at: starts_at,
  started_at, created_at: starts_at, updated_at: starts_at,
});

describe('lobby summary data', () => {
  it('counts only active chats available to the current character', () => {
    expect(countActiveLobbyChats(chats)).toBe(2);
    expect(countActiveLobbyChats([])).toBe(0);
  });

  it('returns no next session for empty, invalid or already due dates', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    expect(findNextLobbySession([], now)).toBeNull();
    expect(findNextLobbySession([
      event('invalid', 'invalid'), event('due', now.toISOString()),
      event('past', '2026-01-01T00:00:00Z'),
    ], now)).toBeNull();
  });

  it('keeps the first event on equal dates without reordering the input', () => {
    const events = [
      event('later', '2026-12-20T10:00:00Z'),
      event('first', '2026-12-02T10:00:00Z'),
      event('tied', '2026-12-02T10:00:00Z'),
    ];
    const original = [...events];
    expect(findNextLobbySession(events, new Date('2026-12-01T00:00:00Z'))).toBe(events[1]);
    expect(events).toEqual(original);
  });

  it('chooses the closest future session and ignores started and past events', () => {
    expect(findNextLobbySession([
      event('past', '2026-06-01T10:00:00Z'),
      event('started', '2026-12-01T10:00:00Z', '2026-11-01T10:00:00Z'),
      event('later', '2026-12-20T10:00:00Z'),
      event('next', '2026-12-02T10:00:00Z'),
    ], new Date('2026-12-01T00:00:00Z'))?.id).toBe('next');
  });

  it('formats a same-day session using the mockup time style', () => {
    expect(formatLobbySession('2026-12-02T20:00:00-03:00', new Date('2026-12-02T09:00:00-03:00'))).toBe('Hoje, 20h');
    expect(formatLobbySession('2026-12-02T20:30:00-03:00', new Date('2026-12-02T09:00:00-03:00'))).toBe('Hoje, 20h30');
  });

  it('reselects the next future session as time moves past the earlier event', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-01T23:59:50Z'));
    const events = [event('first', '2026-12-02T00:00:00Z'), event('later', '2026-12-03T00:00:00Z')];
    let selectedId: string | null = null;
    const stop = startLobbySessionClock((now) => { selectedId = findNextLobbySession(events, now)?.id ?? null; });
    expect(selectedId).toBe('first');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(selectedId).toBe('later');
    stop();
    vi.useRealTimers();
  });

  it('shows real summary values and meaningful empty or unavailable states', () => {
    const available = renderToStaticMarkup(createElement(LobbyStatsDisplay, {
      onlineCount: 4, onlineUnavailable: false, activeRoomCount: 2, roomsUnavailable: false,
      nextSession: null, sessionsUnavailable: false, roomsLoading: false, sessionsLoading: false,
    }));
    expect(available).toContain('Jogadores online');
    expect(available).toContain('04');
    expect(available).toContain('Salas ativas');
    expect(available).toContain('02');
    expect(available).toContain('Sem sessão marcada');

    const unavailable = renderToStaticMarkup(createElement(LobbyStatsDisplay, {
      onlineCount: null, onlineUnavailable: true, activeRoomCount: null, roomsUnavailable: true,
      nextSession: null, sessionsUnavailable: true, roomsLoading: false, sessionsLoading: false,
    }));
    expect(unavailable.match(/Indisponível/g)).toHaveLength(3);
    expect(unavailable).not.toContain('>00<');
    expect(unavailable).not.toContain('Sem sessão marcada');
  });
});

describe('system lobby presence heartbeat', () => {
  it('sends immediately and every 30 seconds only while visible, then removes its timer and listener', async () => {
    vi.useFakeTimers();
    const listeners = new Set<EventListener>();
    const fakeDocument = {
      visibilityState: 'visible',
      addEventListener: (_type: string, listener: EventListener) => { listeners.add(listener); },
      removeEventListener: (_type: string, listener: EventListener) => { listeners.delete(listener); },
    };
    const heartbeat = vi.fn().mockResolvedValue({ online_count: 2 });
    const onCount = vi.fn();
    const onError = vi.fn();
    const stop = startSystemLobbyPresenceHeartbeat('system', { heartbeat, document: fakeDocument as unknown as Document, onCount, onError });
    await vi.waitFor(() => expect(heartbeat).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(heartbeat).toHaveBeenCalledTimes(2);
    fakeDocument.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(heartbeat).toHaveBeenCalledTimes(2);
    fakeDocument.visibilityState = 'visible';
    for (const listener of listeners) listener(new Event('visibilitychange'));
    await vi.waitFor(() => expect(heartbeat).toHaveBeenCalledTimes(3));
    expect(onCount).toHaveBeenCalledWith(2);
    expect(onError).not.toHaveBeenCalled();
    stop();
    expect(listeners.size).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heartbeat).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
