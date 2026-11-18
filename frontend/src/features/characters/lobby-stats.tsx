'use client';

import { useEffect, useState } from 'react';
import { getCharacterChats, getSystemEvents, type Chat, type SystemEvent } from '../../api';

export function countActiveLobbyChats(chats: Chat[]) {
  return chats.reduce((count, chat) => count + Number(chat.status === 'active'), 0);
}

export function findNextLobbySession(events: SystemEvent[], now = new Date()) {
  const nowTime = now.getTime();
  let next: SystemEvent | null = null;
  let nextTime = Infinity;
  for (const event of events) {
    if (event.started_at) continue;
    const startTime = new Date(event.starts_at).getTime();
    if (startTime > nowTime && startTime < nextTime) { next = event; nextTime = startTime; }
  }
  return next;
}

export function startLobbySessionClock(onTick: (now: Date) => void, doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>) {
  const visibilityDocument = doc ?? (typeof document === 'undefined' ? null : document);
  const tick = () => onTick(new Date());
  const onVisibilityChange = () => { if (visibilityDocument?.visibilityState === 'visible') tick(); };
  const timer = globalThis.setInterval(tick, 30_000);
  visibilityDocument?.addEventListener('visibilitychange', onVisibilityChange);
  tick();
  return () => {
    globalThis.clearInterval(timer);
    visibilityDocument?.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

export function formatLobbySession(value: string, now = new Date()) {
  const sessionDate = new Date(value);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDate = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  const timeParts = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(sessionDate);
  const hour = timeParts.find(({ type }) => type === 'hour')?.value ?? '00';
  const minute = timeParts.find(({ type }) => type === 'minute')?.value ?? '00';
  const time = minute === '00' ? `${hour}h` : `${hour}h${minute}`;
  if (sameDate(sessionDate, now)) return `Hoje, ${time}`;
  if (sameDate(sessionDate, tomorrow)) return `Amanhã, ${time}`;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(sessionDate);
}

interface LobbyStatsDisplayProps {
  onlineCount: number | null;
  onlineUnavailable: boolean;
  activeRoomCount: number | null;
  roomsUnavailable: boolean;
  nextSession: SystemEvent | null;
  sessionsUnavailable: boolean;
  roomsLoading: boolean;
  sessionsLoading: boolean;
}

function formatCount(value: number) {
  return new Intl.NumberFormat('pt-BR', { minimumIntegerDigits: 2, useGrouping: false }).format(value);
}

export function LobbyStatsDisplay({ onlineCount, onlineUnavailable, activeRoomCount, roomsUnavailable, nextSession, sessionsUnavailable, roomsLoading, sessionsLoading }: LobbyStatsDisplayProps) {
  const summaryValue = (value: number | null, unavailable: boolean, loading = false) => unavailable ? 'Indisponível' : loading || value === null ? 'Carregando…' : formatCount(value);
  return <section className="lobby-stats" aria-label="Resumo da campanha">
    <article className="lobby-stat-card"><span className="lobby-stat-icon" aria-hidden="true">♧</span><span><small>Jogadores online</small><strong>{summaryValue(onlineCount, onlineUnavailable)}</strong></span></article>
    <article className="lobby-stat-card"><span className="lobby-stat-icon" aria-hidden="true">▤</span><span><small>Salas ativas</small><strong>{summaryValue(activeRoomCount, roomsUnavailable, roomsLoading)}</strong></span></article>
    <article className="lobby-stat-card"><span className="lobby-stat-icon" aria-hidden="true">◷</span><span><small>Próxima sessão</small><strong>{sessionsUnavailable ? 'Indisponível' : sessionsLoading ? 'Carregando…' : nextSession ? formatLobbySession(nextSession.starts_at) : 'Sem sessão marcada'}</strong></span></article>
  </section>;
}

export function LobbyStats({ systemId, characterId, onlineCount, onlineUnavailable }: { systemId: string; characterId: string; onlineCount: number | null; onlineUnavailable: boolean }) {
  const [activeRoomCount, setActiveRoomCount] = useState<number | null>(null);
  const [roomsUnavailable, setRoomsUnavailable] = useState(false);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [sessionsUnavailable, setSessionsUnavailable] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => startLobbySessionClock(setNow), []);

  useEffect(() => {
    let active = true;
    setRoomsLoading(true); setRoomsUnavailable(false); setActiveRoomCount(null);
    setSessionsLoading(true); setSessionsUnavailable(false); setEvents([]);
    getCharacterChats(characterId).then(({ chats }) => {
      if (active) setActiveRoomCount(countActiveLobbyChats(chats));
    }).catch(() => { if (active) setRoomsUnavailable(true); }).finally(() => { if (active) setRoomsLoading(false); });
    getSystemEvents(systemId).then(({ events: loadedEvents }) => {
      if (active) setEvents(loadedEvents);
    }).catch(() => { if (active) setSessionsUnavailable(true); }).finally(() => { if (active) setSessionsLoading(false); });
    return () => { active = false; };
  }, [systemId, characterId]);

  const nextSession = findNextLobbySession(events, now);
  return <LobbyStatsDisplay
    onlineCount={onlineCount}
    onlineUnavailable={onlineUnavailable}
    activeRoomCount={activeRoomCount}
    roomsUnavailable={roomsUnavailable}
    nextSession={nextSession}
    sessionsUnavailable={sessionsUnavailable}
    roomsLoading={roomsLoading}
    sessionsLoading={sessionsLoading}
  />;
}
