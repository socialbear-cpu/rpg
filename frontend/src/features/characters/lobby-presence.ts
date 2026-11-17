'use client';

import { useEffect, useState } from 'react';
import { heartbeatSystemLobbyPresence } from '../../api';

interface PresenceHeartbeatOptions {
  heartbeat?: typeof heartbeatSystemLobbyPresence;
  document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  onCount: (count: number) => void;
  onError: () => void;
}

export function startSystemLobbyPresenceHeartbeat(systemId: string, options: PresenceHeartbeatOptions) {
  const doc = options.document ?? document;
  const heartbeat = options.heartbeat ?? heartbeatSystemLobbyPresence;
  let active = true;
  let inFlight = false;

  async function pulse() {
    if (!active || doc.visibilityState !== 'visible' || inFlight) return;
    inFlight = true;
    try {
      const result = await heartbeat(systemId);
      if (active) options.onCount(result.online_count);
    } catch {
      if (active) options.onError();
    } finally {
      inFlight = false;
    }
  }

  function handleVisibilityChange() {
    if (doc.visibilityState === 'visible') void pulse();
  }

  const timer = globalThis.setInterval(() => void pulse(), 30_000);
  doc.addEventListener('visibilitychange', handleVisibilityChange);
  void pulse();

  return () => {
    active = false;
    globalThis.clearInterval(timer);
    doc.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

export function useSystemLobbyPresence(systemId: string, enabled: boolean) {
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!enabled) { setOnlineCount(null); setUnavailable(false); return; }
    setOnlineCount(null); setUnavailable(false);
    return startSystemLobbyPresenceHeartbeat(systemId, {
      onCount: (count) => { setOnlineCount(count); setUnavailable(false); },
      onError: () => setUnavailable(true),
    });
  }, [systemId, enabled]);

  return { onlineCount, unavailable };
}
