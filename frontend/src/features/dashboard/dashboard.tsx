
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getGameSystems, type GameSystem } from '../../api';
import { SystemsSection } from './systems-section';
import { NotificationCenter } from '../notifications/notification-center';
import { AppHeader } from '../shell/app-header';
import './dashboard.css';

interface DashboardProps {
  playerName?: string;
  onLogout: () => void;
}

export function Dashboard({ playerName, onLogout }: DashboardProps) {
  const router = useRouter();
  const [activePage, setActivePage] = useState('Meus Sistemas');
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [systemsLoading, setSystemsLoading] = useState(true);
  const [systemsError, setSystemsError] = useState<string | null>(null);

  useEffect(() => {
    getGameSystems()
      .then(({ systems: loadedSystems }) => setSystems(loadedSystems))
      .catch(() => setSystemsError('Não foi possível carregar seus sistemas.'))
      .finally(() => setSystemsLoading(false));
  }, []);

  const safePlayerName = (playerName ?? '').trim();
  const firstName = safePlayerName ? safePlayerName.split(' ')[0] : 'Jogador';

  const pageDescription: Record<string, string> = {
    'Início': 'Acesse seus sistemas de RPG e continue sua aventura.',
    'Meus Sistemas': 'Acesse os sistemas de RPG dos quais você participa.',
    'Explorar sistemas': 'Crie um novo sistema de RPG para começar sua aventura.',
    'Comunidade': 'Acesse seus sistemas e personagens de RPG.',
  };

  return (
    <div className="platform">
      <main className="main-area">
        <AppHeader activeItem={activePage} onNavigate={(label) => {
          if (label === 'Explorar sistemas') router.push('/dashboard/systems/new');
          else setActivePage(label);
        }} onLogout={onLogout}>
            <NotificationCenter compact />
        </AppHeader>

        <div className="page-content">
          <section className="welcome-section">
            <div>
              <div className="eyebrow">SUA PRÓXIMA AVENTURA COMEÇA AQUI</div>
              <h1>
                Olá, {firstName}!
              </h1>
              <p>{pageDescription[activePage]}</p>
            </div>

          </section>

          <SystemsSection systems={systems} loading={systemsLoading} error={systemsError}
            onCreate={() => router.push('/dashboard/systems/new')}
            onEnter={(systemId) => router.push(`/systems/${encodeURIComponent(systemId)}/characters`)} />
        </div>
      </main>

    </div>
  );
}
