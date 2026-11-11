
'use client';

import { useState, type ReactNode } from 'react';
import { NotificationCenter } from '../notifications/notification-center';
import './dashboard.css';

interface DashboardProps {
  playerName?: string;
  onLogout: () => void;
  systemNavigation?: ReactNode;
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
  | 'plus'
  | 'search'
  | 'chevron'
  | 'menu'
  | 'close'
  | 'logout'
  | 'users'
  | 'clock'
  | 'dices';

const menuItems: { label: string; icon: IconName }[] = [
  { label: 'Início', icon: 'home' },
  { label: 'Minhas mesas', icon: 'table' },
  { label: 'Explorar mesas', icon: 'explore' },
  { label: 'Comunidade', icon: 'community' },
];

const tables = [
  {
    id: 1,
    title: 'Naruto: O legado Shinobi',
    system: 'Sistema Naruto',
    description: 'Uma nova geração de ninjas está prestes a mudar o destino das cinco grandes nações.',
    master: 'Mestre Kakashi',
    players: 4,
    maxPlayers: 6,
    status: 'Em andamento',
    category: 'Anime',
    image: 'naruto',
  },
  {
    id: 2,
    title: 'Reinos Esquecidos',
    system: 'Dungeons & Dragons 5e',
    description: 'Explore terras antigas, enfrente criaturas lendárias e descubra os segredos de um reino perdido.',
    master: 'Arthur',
    players: 5,
    maxPlayers: 5,
    status: 'Mesa cheia',
    category: 'Fantasia',
    image: 'fantasy',
  },
  {
    id: 3,
    title: 'Ecos da Meia-Noite',
    system: 'Ordem Paranormal',
    description: 'Uma investigação misteriosa começa após o desaparecimento de uma equipe inteira.',
    master: 'Luna',
    players: 3,
    maxPlayers: 5,
    status: 'Procurando jogadores',
    category: 'Terror',
    image: 'horror',
  },
  {
    id: 4,
    title: 'Além das Estrelas',
    system: 'Sistema próprio',
    description: 'Uma jornada espacial em um universo onde a humanidade não está sozinha.',
    master: 'Mika',
    players: 2,
    maxPlayers: 4,
    status: 'Procurando jogadores',
    category: 'Ficção científica',
    image: 'space',
  },
];

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
    plus: 'M12 5v14 M5 12h14',
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

export function Dashboard({ playerName, onLogout, systemNavigation }: DashboardProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activePage, setActivePage] = useState('Início');
  const [search, setSearch] = useState('');

  const safePlayerName = (playerName ?? '').trim();
  const firstName = safePlayerName ? safePlayerName.split(' ')[0] : 'Jogador';
  const avatarInitial = safePlayerName ? safePlayerName.charAt(0).toUpperCase() : 'J';

  const filteredTables = tables.filter((table) => {
    const text = `${table.title} ${table.system} ${table.category}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const pageDescription: Record<string, string> = {
    'Início': 'Encontre suas aventuras e acompanhe suas campanhas.',
    'Minhas mesas': 'Todas as campanhas das quais você participa.',
    'Explorar mesas': 'Descubra novas aventuras e encontre seu próximo grupo.',
    'Comunidade': 'Conheça outros jogadores e mestres da comunidade.',
  };

  const visibleTables =
    activePage === 'Minhas mesas'
      ? tables.filter((table) => table.players > 0)
      : filteredTables;

  return (
    <div className={`platform ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-symbol">
            <Icon name="dices" size={23} />
          </div>
          {sidebarOpen && <span>NEXUS<span className="brand-light"> RPG</span></span>}
        </div>

        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
          title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
        >
          <Icon name="menu" />
        </button>

        <div className="sidebar-section-label">
          {sidebarOpen ? 'MENU PRINCIPAL' : ''}
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${activePage === item.label ? 'active' : ''}`}
              onClick={() => setActivePage(item.label)}
              title={!sidebarOpen ? item.label : undefined}
            >
              <Icon name={item.icon} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" title={!sidebarOpen ? 'Mensagens' : undefined}>
            <Icon name="message" />
            {sidebarOpen && <span>Mensagens</span>}
          </button>
          <button className="nav-item" title={!sidebarOpen ? 'Configurações' : undefined}>
            <Icon name="settings" />
            {sidebarOpen && <span>Configurações</span>}
          </button>

          {sidebarOpen && (
            <div className="sidebar-version">
              <span className="version-dot" />
              Plataforma em desenvolvimento
            </div>
          )}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Plataforma</span>
            <Icon name="chevron" size={15} />
            <strong>{activePage}</strong>
          </div>

          <div className="topbar-actions">
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
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-section">
            <div>
              <div className="eyebrow">SUA PRÓXIMA AVENTURA COMEÇA AQUI</div>
              <h1>
                Olá, {firstName}!
              </h1>
              <p>{pageDescription[activePage]}</p>
            </div>

            <button
              className="primary-button"
              onClick={() => setActivePage('Explorar mesas')}
            >
              <Icon name="plus" size={18} />
              Encontrar uma mesa
            </button>
          </section>

          {systemNavigation && (
            <div className="dashboard-system-navigation">{systemNavigation}</div>
          )}

          <section className="quick-stats">
            <div className="quick-stat">
              <div className="quick-stat-icon purple"><Icon name="table" /></div>
              <div>
                <strong>{tables.length}</strong>
                <span>Mesas disponíveis</span>
              </div>
            </div>
            <div className="quick-stat">
              <div className="quick-stat-icon blue"><Icon name="users" /></div>
              <div>
                <strong>14</strong>
                <span>Jogadores ativos</span>
              </div>
            </div>
            <div className="quick-stat">
              <div className="quick-stat-icon gold"><Icon name="dices" /></div>
              <div>
                <strong>4</strong>
                <span>Sistemas de RPG</span>
              </div>
            </div>
          </section>

          <section className="tables-section">
            <div className="section-heading">
              <div>
                <h2>
                  {activePage === 'Explorar mesas'
                    ? 'Explore novas mesas'
                    : activePage === 'Minhas mesas'
                      ? 'Minhas mesas'
                      : activePage === 'Comunidade'
                        ? 'Mesas da comunidade'
                        : 'Mesas em destaque'}
                </h2>
                <p>Campanhas de diferentes universos e sistemas.</p>
              </div>

              <label className="search-box">
                <Icon name="search" size={18} />
                <input
                  type="search"
                  placeholder="Buscar mesas..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>

            <div className="table-grid">
              {visibleTables.map((table) => (
                <article className="table-card" key={table.id}>
                  <div className={`table-cover cover-${table.image}`}>
                    <span className="table-category">{table.category}</span>
                    <span className={`table-status ${table.status === 'Mesa cheia' ? 'full' : ''}`}>
                      {table.status}
                    </span>
                    <div className="cover-decoration">
                      <Icon name="dices" size={34} />
                    </div>
                  </div>

                  <div className="table-card-content">
                    <span className="table-system">{table.system}</span>
                    <h3>{table.title}</h3>
                    <p className="table-description">{table.description}</p>

                    <div className="table-master">
                      <span className="master-avatar">
                        {table.master.charAt(0)}
                      </span>
                      <div>
                        <span className="master-label">Mestre</span>
                        <strong>{table.master}</strong>
                      </div>
                    </div>

                    <div className="table-card-footer">
                      <span className="player-count">
                        <Icon name="users" size={16} />
                        {table.players}/{table.maxPlayers} jogadores
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setActivePage('Minhas mesas')}
                      >
                        Ver mesa <Icon name="chevron" size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {visibleTables.length === 0 && (
                <div className="empty-state">
                  <Icon name="search" size={30} />
                  <h3>Nenhuma mesa encontrada</h3>
                  <p>Tente pesquisar por outro nome ou sistema.</p>
                </div>
              )}
            </div>
          </section>
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
                <span><Icon name="table" size={17} /> Mesas participadas</span>
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
