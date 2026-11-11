'use client';

import { useEffect, useRef, useState } from 'react';
import { claimDailyLoginReward, getDailyLoginSystem, takeDailyLoginPopup, type DailyLoginSystemView } from '../../api';
import { DailyLoginCard } from './daily-login-card';
import './daily-login-popup.css';

export function DailyLoginPopup({ systemId }: { systemId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [systems, setSystems] = useState<DailyLoginSystemView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    // Defer to avoid consuming the daily display during Strict Mode's trial mount.
    const timer = window.setTimeout(() => {
      void takeDailyLoginPopup(systemId).then((result) => {
        if (!active || !result.show) return;
        setSystems(result.systems);
        dialog.current?.showModal();
      }).catch(() => {
        // A failed check must not prevent entry into the dashboard.
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); dialog.current?.close(); };
  }, [systemId]);

  async function claim(systemId: string, characterId: string) {
    if (busy) return;
    setBusy(systemId);
    setMessage(null);
    try {
      const result = await claimDailyLoginReward(systemId, characterId);
      setError(false);
      setMessage(`${result.quantity} × ${result.item_name} entregue ao personagem.`);
      setSystems((current) => current.map((entry) => entry.system.id === systemId
        ? { ...entry, today: { ...entry.today, status: 'already_claimed' } } : entry));
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

  return <dialog ref={dialog} className="daily-login-popup" aria-label="Recompensa de login diário">
    <button className="daily-popup-close" type="button" onClick={() => dialog.current?.close()} aria-label="Fechar login diário">×</button>
    <DailyLoginCard systems={systems} loading={false} claimingSystemId={busy}
      message={message} messageIsError={error} onClaim={(systemId, characterId) => { void claim(systemId, characterId); }} />
  </dialog>;
}
