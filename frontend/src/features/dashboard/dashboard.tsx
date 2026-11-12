
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

type IconName =
  | 'home'
  | 'table'
  | 'explore'
  | 'community'
  | 'message'
  | 'settings'
  | 'bell'
  | 'user'
  | 'search'
  | 'chevron'
  | 'menu'
  | 'close'
  | 'logout'
  | 'users'
  | 'clock'
  | 'dices';

function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  const paths: Record<IconName, string> = {
    home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
    table: 'M3 4h18v5H3z M5 9v11 M19 9v11 M3 20h18',
    explore: 'M12 22s8-7.2 8-13a8 8 0 1 0-16 0c0 5.8 8 13 8 13Z M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    community: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    message: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8z',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 2.94-.08-.02a1.7 1.7 0 0 0-1.77.35l-.06.05h-3.4l-.05-.07a1.7 1.7 0 0 0-1.78-.35l-.07.02-2.94-1.7.02-.08A1.7 1.7 0 0 0 7.6 16.3l-.05-.06v-3.4l.07-.05a1.7 1.7 0 0 0 .35-1.78l-.02-.07 1.7-2.94.08.02a1.7 1.7 0 0 0 1.77-.35l.06-.05h3.4l.05.07a1.7 1.7 0 0 0 1.78.35l.07-.02 2.94 1.7-.02.08A1.7 1.7 0 0 0 19.4 11.7l.05.06v3.4Z',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
    user: 'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.3-4.3',
    chevron: 'm9 18 6-6-6-6',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    close: 'M18 6 6 18 M6 6l12 12',
    logout: 'M10 17l5-5-5-5 M15 12H3 M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6',
    users: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 8v6 M23 11h-6',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2',
    dices: 'm2 7 10-5 10 5-10 5L2 7Z M2 7v10l10 5 10-5V7 M12 12v10 M7 4.5l10 5',
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function Dashboard({ playerName, onLogout }: DashboardProps) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
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
  const avatarInitial = safePlayerName ? safePlayerName.charAt(0).toUpperCase() : 'J';

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
        }}>
            <NotificationCenter compact />

            <button
              className={`profile-trigger ${profileOpen ? 'selected' : ''}`}
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="Abrir perfil"
              title="Meu perfil"
            >
              <span className="avatar-small">
                {avatarInitial}
              </span>
              <span className="profile-trigger-name">{safePlayerName || 'Jogador'}</span>
            </button>
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

      {profileOpen && (
        <>
          <button
            className="profile-backdrop"
            onClick={() => setProfileOpen(false)}
            aria-label="Fechar perfil"
          />

          <aside className="profile-panel">
            <div className="profile-panel-header">
              <span>MEU PERFIL</span>
              <button
                className="icon-button"
                onClick={() => setProfileOpen(false)}
                aria-label="Fechar"
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="profile-summary">
              <div className="profile-avatar">
                {avatarInitial}
              </div>
              <h2>{safePlayerName || 'Jogador'}</h2>
              <p>Jogador da comunidade</p>
              <button className="edit-profile-button">
                Editar perfil
              </button>
            </div>

            <div className="profile-panel-section">
              <span className="profile-section-title">MINHA JORNADA</span>
              <div className="profile-info-row">
                <span><Icon name="table" size={17} /> sistemas participadas</span>
                <strong>0</strong>
              </div>
              <div className="profile-info-row">
                <span><Icon name="dices" size={17} /> Personagens</span>
                <strong>0</strong>
              </div>
              <div className="profile-info-row">
                <span><Icon name="users" size={17} /> Amigos</span>
                <strong>0</strong>
              </div>
            </div>

            <div className="profile-panel-section">
              <span className="profile-section-title">CONTA</span>
              <button className="profile-menu-button">
                <Icon name="user" size={17} />
                Informações pessoais
                <Icon name="chevron" size={16} />
              </button>
              <button className="profile-menu-button">
                <Icon name="settings" size={17} />
                Preferências
                <Icon name="chevron" size={16} />
              </button>
            </div>

            <button className="logout-button" onClick={onLogout}>
              <Icon name="logout" size={18} />
              Sair da conta
            </button>
          </aside>
        </>
      )}
    </div>
  );
}
