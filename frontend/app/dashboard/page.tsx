'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '../../src/features/dashboard/dashboard';
import { DailyLoginPopup } from '../../src/features/daily-login/daily-login-popup';
import { hasSession, signOut } from '../../src/supabase-auth';
import { getMyDailyLoginSystems, type DailyLoginSystemView } from '../../src/api';

export default function DashboardPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [systems, setSystems] = useState<DailyLoginSystemView[]>([]);
  const [systemId, setSystemId] = useState('');
  const [systemError, setSystemError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    void getMyDailyLoginSystems().then((result) => {
      if (active) setSystems(result.filter((entry) => entry.system.is_active && entry.characters.length > 0));
    }).catch(() => { if (active) setSystemError('Não foi possível carregar seus sistemas.'); });
    return () => { active = false; };
  }, [authenticated]);

  useEffect(() => {
    if (hasSession()) setAuthenticated(true);
    else router.replace('/');
  }, [router]);

  async function logout() {
    try {
      await signOut();
    } finally {
      router.replace('/');
    }
  }

  if (!authenticated) return null;

  return <><Dashboard playerName="" onLogout={() => void logout()} systemNavigation={
    <section className="dashboard-section" aria-label="Selecionar sistema de RPG">
      <label htmlFor="dashboard-system">Entrar no sistema</label>
      <select id="dashboard-system" value={systemId} onChange={(event) => setSystemId(event.target.value)}>
        <option value="">Selecione um sistema</option>
        {systems.map(({ system }) => <option key={system.id} value={system.id}>{system.name}</option>)}
      </select>
      {systemError && <p role="status">{systemError}</p>}
    </section>
  } />{systemId && <DailyLoginPopup key={systemId} systemId={systemId} />}</>;
}
