
'use client';

import './dashboard.css';

type DashboardProps = {
  playerName: string;
  onLogout: () => void;
};

const menuItems = [
  { symbol: '⌂', label: 'Visão geral', active: true },
  { symbol: '♙', label: 'Personagem' },
  { symbol: '✧', label: 'Jutsus' },
  { symbol: '▤', label: 'Inventário' },
  { symbol: '⚑', label: 'Missões' },
  { symbol: '◇', label: 'Loja' },
];

export function Dashboard({ playerName, onLogout }: DashboardProps) {
  return (
    <main className="game-dashboard">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <span className="dashboard-brand-mark">忍</span>
          <div>
            <strong>SHINOBI</strong>
            <small>ONLINE RPG</small>
          </div>
        </div>

        <div className="sidebar-section-label">MENU PRINCIPAL</div>

        <nav className="dashboard-nav" aria-label="Menu principal">
          {menuItems.map((item) => (
            <div
              key={item.label}
              className={`dashboard-nav-item${item.active ? ' active' : ''}`}
              aria-current={item.active ? 'page' : undefined}
            >
              <span>{item.symbol}</span>
              {item.label}
              {!item.active && <small>Em breve</small>}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <span className="sidebar-status-dot" />
          Sistema online
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-overline">ÁREA DO JOGADOR</span>
            <h1>Visão geral</h1>
          </div>

          <div className="dashboard-user">
            <div className="dashboard-user-avatar">
              {playerName.charAt(0).toUpperCase() || 'S'}
            </div>
            <span>{playerName || 'Shinobi'}</span>
            <button type="button" onClick={onLogout}>
              Sair
            </button>
          </div>
        </header>

        <div className="dashboard-welcome">
          <div>
            <span className="dashboard-overline">BEM-VINDA DE VOLTA</span>
            <h2>Sua jornada ninja começa aqui.</h2>
            <p>
              Prepare-se para treinar, cumprir missões e construir sua história.
            </p>
          </div>
          <div className="welcome-symbol" aria-hidden="true">忍</div>
        </div>

        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-overline">SEU PROGRESSO</span>
              <h2>Resumo do personagem</h2>
            </div>
            <span className="development-tag">DADOS DEMONSTRATIVOS</span>
          </div>

          <article className="character-panel">
            <div className="character-avatar">忍</div>

            <div className="character-information">
              <span className="character-rank">GENIN</span>
              <h3>{playerName || 'Novo Shinobi'}</h3>
              <p>Clã ainda não definido</p>
            </div>

            <div className="character-level">
              <span>NÍVEL</span>
              <strong>01</strong>
            </div>
          </article>

          <div className="dashboard-stats">
            <StatCard
              label="VIDA"
              current="100"
              maximum="100"
              percentage={100}
              color="health"
            />
            <StatCard
              label="CHAKRA"
              current="100"
              maximum="100"
              percentage={100}
              color="chakra"
            />
            <StatCard
              label="EXPERIÊNCIA"
              current="0"
              maximum="100"
              percentage={0}
              color="experience"
            />
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-overline">ATIVIDADES</span>
              <h2>Central de missões</h2>
            </div>
          </div>

          <article className="mission-panel">
            <div className="mission-symbol">⚑</div>
            <div>
              <span className="mission-type">PRIMEIROS PASSOS</span>
              <h3>Sua primeira missão está chegando</h3>
              <p>
                Em breve, você poderá receber missões e ganhar recompensas
                para evoluir seu personagem.
              </p>
            </div>
            <span className="mission-status">EM BREVE</span>
          </article>
        </section>
      </section>
    </main>
  );
}

type StatCardProps = {
  label: string;
  current: string;
  maximum: string;
  percentage: number;
  color: 'health' | 'chakra' | 'experience';
};

function StatCard({
  label,
  current,
  maximum,
  percentage,
  color,
}: StatCardProps) {
  return (
    <article className="stat-card">
      <div className="stat-heading">
        <span>{label}</span>
        <strong>{current} / {maximum}</strong>
      </div>
      <div className="stat-track">
        <div
          className={`stat-fill ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </article>
  );
}
