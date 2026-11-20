
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getGameSystems, getMySystemMemberships, type GameSystem } from '../../api';
import { SystemsSection } from './systems-section';
import { RunicCarousel } from './runic-carousel';
import { LoginBridge } from './login-identity';
import { AppHeader } from '../shell/app-header';
import './dashboard.css';
import './worlds-dashboard.css';

interface DashboardProps {
  playerName?: string;
  onLogout: () => void;
}

export function Dashboard({ playerName, onLogout }: DashboardProps) {
  const router = useRouter();
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [systemsLoading, setSystemsLoading] = useState(true);
  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [ownerSystemIds, setOwnerSystemIds] = useState<Set<string>>(new Set());
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    getGameSystems({ includeArchived: true })
      .then(({ systems: loadedSystems }) => setSystems(loadedSystems))
      .catch(() => setSystemsError('Não foi possível carregar seus sistemas.'))
      .finally(() => setSystemsLoading(false));
    getMySystemMemberships().then(({ memberships, is_platform_admin }) => {
      setOwnerSystemIds(new Set(memberships.filter((membership) => membership.role === 'owner').map((membership) => membership.game_system_id)));
      setIsPlatformAdmin(is_platform_admin);
    }).catch(() => { setOwnerSystemIds(new Set()); setIsPlatformAdmin(false); });
  }, []);

  const safePlayerName = (playerName ?? '').trim();
  const firstName = safePlayerName ? safePlayerName.split(' ')[0] : 'Jogador';

  return (
    <div className="platform worlds-dashboard">
      <LoginBridge />
      <main className="main-area">
        <AppHeader activeItem="Meus Sistemas" onLogout={onLogout} />

        <div className="worlds-content">
          <div className="worlds-welcome">
            <p className="worlds-greeting">Olá, {firstName}!</p>
            <span className="worlds-welcome-note">RPG de mesa, do seu jeito.</span>
          </div>

          <RunicCarousel />

          <SystemsSection systems={systems} loading={systemsLoading} error={systemsError} ownerSystemIds={ownerSystemIds}
            onCreate={() => router.push('/dashboard/systems/new')}
            isPlatformAdmin={isPlatformAdmin}
            onManage={(systemId) => router.push(`/dashboard/systems/${encodeURIComponent(systemId)}/manage`)}
            onEnter={(systemId) => router.push(`/systems/${encodeURIComponent(systemId)}/characters`)} />
          <p className="worlds-signoff">Uma ponte entre mestres, jogadores e histórias.</p>
        </div>
      </main>

    </div>
  );
}
