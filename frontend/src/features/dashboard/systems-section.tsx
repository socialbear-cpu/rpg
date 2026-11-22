'use client';

import { getGameSystemCoverUrl, type GameSystem } from '../../api';

interface SystemsSectionProps {
  systems: GameSystem[];
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onEnter: (systemId: string) => void;
  ownerSystemIds?: Set<string>;
  isPlatformAdmin?: boolean;
  onManage?: (systemId: string) => void;
}

export function SystemsSection({ systems, loading, error, onCreate, onEnter, ownerSystemIds = new Set(), isPlatformAdmin = false, onManage }: SystemsSectionProps) {
  return (
    <section className="worlds-section" aria-labelledby="systems-title">
      <div className="worlds-section-heading">
        <div>
          <h1 id="systems-title">Meus sistemas</h1>
          <p>Seus mundos, suas histórias. Escolha onde jogar.</p>
        </div>
        {(systems.length > 0 || loading || error) && (
          <button type="button" className="worlds-create" onClick={onCreate}><span aria-hidden="true">+</span> Criar sistema</button>
        )}
      </div>
      {loading && (
        <>
          <p className="worlds-status" role="status">Preparando seus mundos...</p>
          <div className="worlds-skeletons" aria-hidden="true">
            {[0, 1, 2].map((item) => <div className="worlds-skeleton" key={item} />)}
          </div>
        </>
      )}
      {error && <p className="worlds-error" role="alert">{error}</p>}
      {!loading && !error && systems.length === 0 && (
        <div className="worlds-empty">
          <svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><path d="M20 65V30a20 20 0 0 1 40 0v35M27 65V30a13 13 0 0 1 26 0v35M12 65h56M40 29v20m-10-10h20" stroke="currentColor" /></svg>
          <span className="worlds-overline">O PRIMEIRO PASSO É SEU</span>
          <h2>Toda ponte leva a uma história.</h2>
          <p>Crie seu primeiro sistema, reúna seu grupo e descubra o que existe do outro lado.</p>
          <button type="button" className="worlds-primary" onClick={onCreate}>Criar meu primeiro sistema <span aria-hidden="true">↗</span></button>
        </div>
      )}
      {!loading && !error && systems.length > 0 && (
        <ul className="worlds-grid" aria-label="Seus sistemas" role="list">
          {systems.map((system, index) => (
            <li className={`worlds-stop${system.is_active === false ? ' worlds-stop-archived' : ''}`} key={system.id}>
              <article className={`worlds-destination worlds-tone-${index % 4}`}>
                <div className={`worlds-cover${system.cover_image_path ? '' : ' worlds-cover-fallback'}`} aria-hidden="true">
                  {system.cover_image_path
                    ? <img src={getGameSystemCoverUrl(system.cover_image_path) ?? undefined} alt="" loading="lazy" style={{ objectPosition: `${system.cover_focus_x ?? 50}% ${system.cover_focus_y ?? 50}%` }} />
                    : <><svg className="worlds-cover-bridge" viewBox="0 0 160 90" fill="none"><path d="m60 0-50 90M70 0 45 90M80 0v90M90 0l25 90M100 0l50 90M60 0h40" stroke="currentColor" /></svg><span className="worlds-cover-name">ᛒᛁᚠᚱᛟᛊᛏ</span></>}
                </div>
                <div className="worlds-destination-heading">
                  <span className="worlds-mode">{system.is_active === false ? 'Em pausa' : system.play_mode?.map((mode) => mode === 'voice' ? '◉ Voz' : '▤ Texto').join(' · ')}</span>
                  {(ownerSystemIds.has(system.id) || isPlatformAdmin) && <button type="button" className="worlds-manage" aria-label={`Gerenciar ${system.name}`} title="Gerenciar sistema" onClick={() => onManage?.(system.id)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/></svg>
                  </button>}
                </div>
                <div className="worlds-destination-content">
                  <h2 title={system.name}>{system.name}</h2>
                  <p>{system.is_active === false ? 'Este mundo está em pausa. Você pode reativá-lo nas configurações.' : system.description || 'Uma nova aventura espera pelo seu grupo.'}</p>
                  <div className="worlds-card-footer">
                    <div className="worlds-metadata">
                      {(system.tags ?? []).slice(0, 2).map((tag) => <span key={tag.slug}>{tag.label}</span>)}
                      {(system.tags?.length ?? 0) > 2 && <span>+{(system.tags?.length ?? 0) - 2}</span>}
                    </div>
                    {system.is_active === false
                      ? <span className="worlds-unavailable">Aventura indisponível</span>
                      : <button type="button" className="worlds-enter" aria-label={`Jogar no sistema ${system.name}`} onClick={() => onEnter(system.id)}>
                        Jogar
                      </button>}
                  </div>
                </div>
              </article>
            </li>
          ))}
          <li className="worlds-new-system">
            <button type="button" onClick={onCreate} aria-label="Criar novo sistema">
              <span className="worlds-new-system-symbol" aria-hidden="true">+</span>
              <strong>Um mundo à sua maneira.</strong>
              <span>Transforme sua próxima ideia em uma aventura.</span>
              <span className="worlds-new-system-action">Criar novo sistema <span aria-hidden="true">↗</span></span>
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}
