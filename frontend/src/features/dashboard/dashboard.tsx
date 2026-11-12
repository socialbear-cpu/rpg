
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getGameSystems, getMySystemMemberships, type GameSystem } from '../../api';
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
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [systemsLoading, setSystemsLoading] = useState(true);
  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [ownerSystemIds, setOwnerSystemIds] = useState<Set<string>>(new Set());
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    getGameSystems()
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

  const slides = [
    { title: <>Crie e conduza suas <span>aventuras</span></>, description: 'Gerencie grupos, histórias e campanhas em um só lugar.', action: 'Criar sistema', run: () => router.push('/dashboard/systems/new') },
    { title: <>Seu próximo mundo começa <span>aqui</span></>, description: 'Dê forma às suas ideias e convide seu grupo para jogar.', action: 'Começar aventura', run: () => router.push('/dashboard/systems/new') },
    { title: <>Reúna seu grupo e <span>jogue</span></>, description: 'Abra um dos seus sistemas e continue de onde a história parou.', action: systems[0] ? 'Abrir sistema' : 'Criar sistema', run: () => systems[0] ? router.push(`/systems/${encodeURIComponent(systems[0].id)}/characters`) : router.push('/dashboard/systems/new') },
  ];

  return (
    <div className="platform">
      <main className="main-area">
        <AppHeader activeItem="Meus Sistemas" onLogout={onLogout}>
            <NotificationCenter compact />
        </AppHeader>

        <div className="page-content">
          <section className="welcome-section">
            <div>
              <div className="eyebrow">SUA PRÓXIMA AVENTURA COMEÇA AQUI</div>
              <h1>
                Olá, {firstName}!
              </h1>
              <p>Acesse os sistemas de RPG dos quais você participa.</p>
            </div>

          </section>

          <section className="dashboard-hero" aria-label="Destaques do Nexus RPG">
            <div className="dashboard-hero-copy" aria-live="polite">
              <span className="dashboard-hero-kicker">PORTAIS ABERTOS PARA NOVAS HISTÓRIAS</span>
              <h2>{slides[activeSlide].title}</h2>
              <p>{slides[activeSlide].description}</p>
              <button type="button" className="dashboard-hero-action" onClick={slides[activeSlide].run}>
                {slides[activeSlide].action}<span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="dashboard-hero-controls" aria-label="Navegação dos destaques">
              <button type="button" aria-label="Destaque anterior" onClick={() => setActiveSlide((activeSlide + slides.length - 1) % slides.length)}>‹</button>
              <div>{slides.map((slide, index) => <button key={index} type="button" className={index === activeSlide ? 'active' : ''} aria-label={`Mostrar destaque ${index + 1}`} aria-pressed={index === activeSlide} onClick={() => setActiveSlide(index)} />)}</div>
              <button type="button" aria-label="Próximo destaque" onClick={() => setActiveSlide((activeSlide + 1) % slides.length)}>›</button>
            </div>
          </section>

          <SystemsSection systems={systems} loading={systemsLoading} error={systemsError} ownerSystemIds={ownerSystemIds}
            onCreate={() => router.push('/dashboard/systems/new')}
            isPlatformAdmin={isPlatformAdmin}
            onManage={(systemId) => router.push(`/dashboard/systems/${encodeURIComponent(systemId)}/manage`)}
            onEnter={(systemId) => router.push(`/systems/${encodeURIComponent(systemId)}/characters`)} />
        </div>
      </main>

    </div>
  );
}
