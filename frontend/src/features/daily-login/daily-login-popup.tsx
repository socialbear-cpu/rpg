'use client';

import { useEffect, useRef, useState } from 'react';
import { claimDailyLoginReward, getDailyLoginSystem, takeDailyLoginPopup, type DailyLoginSystemView } from '../../api';
import { DailyLoginCard } from './daily-login-card';
import { formatDailyLoginClaimSuccess } from './daily-login-messages';
import './daily-login-popup.css';

export function DailyLoginPopup({ systemId, onClaimed }: { systemId: string; onClaimed?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [systems, setSystems] = useState<DailyLoginSystemView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    // Defer to avoid consuming the daily display during Strict Mode's trial mount.
    const timer = window.setTimeout(() => {
      void takeDailyLoginPopup(systemId).then((result) => {
        if (!active || !result.show) return;
        setSystems(result.systems);
        if (dialog.current && !dialog.current.open) dialog.current.showModal();
      }).catch(() => {
        // A failed check must not prevent entry into the dashboard.
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); dialog.current?.close(); };
  }, [systemId]);

  async function openRewards() {
    setLoading(true);
    setMessage(null);
    try {
      setSystems([await getDailyLoginSystem(systemId)]);
      setError(false);
    } catch (cause) {
      setSystems([]);
      setError(true);
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível carregar a recompensa diária.');
    } finally {
      setLoading(false);
      if (dialog.current && !dialog.current.open) dialog.current.showModal();
    }
  }

  async function claim(systemId: string, characterId: string) {
    if (busy) return;
    setBusy(systemId);
    setMessage(null);
    try {
      const result = await claimDailyLoginReward(systemId, characterId);
      setError(false);
      setMessage(formatDailyLoginClaimSuccess(result));
      setSystems((current) => current.map((entry) => entry.system.id === systemId
        ? { ...entry, today: { ...entry.today, status: 'already_claimed' } } : entry));
      onClaimed?.();
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível resgatar.');
      // A claim made on another device should also update this dialog.
      try {
        const updated = await getDailyLoginSystem(systemId);
        setSystems((current) => current.map((entry) => entry.system.id === systemId ? updated : entry));
      } catch { /* Keep the original claim error visible. */ }
    } finally { setBusy(null); }
  }

  return <><button className="character-secondary-button" type="button" disabled={loading} onClick={() => { void openRewards(); }}>{loading ? 'Carregando recompensa…' : 'Recompensa diária'}</button>
  <dialog ref={dialog} className="daily-login-popup" aria-label="Recompensa de login diário">
    <button className="daily-popup-close" type="button" onClick={() => dialog.current?.close()} aria-label="Fechar login diário">×</button>
    <DailyLoginCard systems={systems} loading={loading} claimingSystemId={busy}
      message={message} messageIsError={error} onClaim={(systemId, characterId) => { void claim(systemId, characterId); }} />
  </dialog></>;
}
